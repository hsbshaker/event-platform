import "server-only";

import { SUPPORTED_IDENTITY_SCHEMA_VERSIONS } from "@/lib/ai/event-identity/lifecycle";
import { parseAndValidateEventIdentityResult } from "@/lib/ai/event-identity/validate";
import { hashRateLimitKey } from "@/lib/auth/rate-limit";
import type { Database, IdentityCallClaimState, Json } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireCostProfile } from "./identity-cost";
import { attemptKey, basisDigest, type IdentityCallBasis } from "./identity-key";
import {
  crossesWarnThreshold,
  emitCeilingAlert,
  emitRecoveryAlert,
  identityLimits,
  type IdentityLimits,
  type IdentityRefusalReason,
} from "./identity-spend";

/**
 * The EventIdentity call claim: the thing that makes uniqueness happen before spend.
 *
 * `docs/phase-4b-plan.md §A.5`, `§A.6`. Every write here goes through a `security definer` RPC,
 * because the guarantees are transactional: caps and the claim insert are one transaction so a
 * refusal costs nothing, and the `response_captured → succeeded` transition is one transaction
 * with the revision so two completers cannot both write one.
 */

type Admin = SupabaseClient<Database>;

export type Claim = Database["public"]["Tables"]["event_identity_call_claims"]["Row"];

export const NON_TERMINAL_STATES: readonly IdentityCallClaimState[] = [
  "claimed",
  "response_captured",
];

export function isTerminal(state: IdentityCallClaimState): boolean {
  return !NON_TERMINAL_STATES.includes(state);
}

/**
 * How long a captured provider response is kept before the text is dropped.
 *
 * A named constant rather than a literal in a query, because it is a product decision with
 * privacy consequences: this is verbatim model output about a named real person, and the interval
 * is the only thing bounding how long it lives. The run row and every metric survive the purge.
 */
export const IDENTITY_EVIDENCE_RETENTION_DAYS = 30;

const bytea = (key: string): string => `\\x${hashRateLimitKey(key).toString("hex")}`;

/* ------------------------------------------------------------------ the attempt ordinal */

/**
 * The ordinal has two modes, and running them together produces a rule that contradicts itself
 * (`§A.5`).
 *
 * *Observing* an in-flight claim must reuse its ordinal — you cannot look up a claim whose key you
 * cannot derive, and cases A, B and C all depend on being able to. *Creating* a new claim takes
 * one more than the highest terminal ordinal for this basis, and is refused while a non-terminal
 * claim for that basis exists.
 *
 * The retry distinction rides on the same query, because only the database knows how the last
 * attempt ended: `abandoned` is provably unpaid and may be retried automatically, while
 * `failed_terminal` and `expired_unknown` may have cost money and need the host to decide.
 */
export type OrdinalResolution =
  | { mode: "observe"; ordinal: number; claim: Claim }
  | { mode: "create"; ordinal: number }
  | { mode: "already_succeeded"; claim: Claim }
  | { mode: "needs_explicit_retry"; ordinal: number; lastState: IdentityCallClaimState };

export async function resolveAttemptOrdinal(
  admin: Admin,
  eventId: string,
  digest: string,
  options: { explicitRetry?: boolean } = {},
): Promise<OrdinalResolution> {
  const { data, error } = await admin
    .from("event_identity_call_claims")
    .select("*")
    .eq("event_id", eventId)
    .eq("basis_digest", digest)
    .order("attempt_ordinal", { ascending: false });
  if (error) throw error;
  const claims = (data ?? []) as Claim[];

  const live = claims.find((c) => !isTerminal(c.state));
  if (live) return { mode: "observe", ordinal: live.attempt_ordinal, claim: live };

  const last = claims[0];
  if (!last) return { mode: "create", ordinal: 0 };

  // An identical request that already succeeded is answered from what it produced, never paid for
  // again. This is what makes a replayed POST free.
  if (last.state === "succeeded") return { mode: "already_succeeded", claim: last };

  const next = last.attempt_ordinal + 1;
  if (last.state === "abandoned") return { mode: "create", ordinal: next };
  if (options.explicitRetry) return { mode: "create", ordinal: next };
  return { mode: "needs_explicit_retry", ordinal: next, lastState: last.state };
}

/** Any claim for this event that has not settled — event-scoped, whatever its basis (§A.6 step 3). */
export async function findNonTerminalClaim(admin: Admin, eventId: string): Promise<Claim | null> {
  const { data, error } = await admin
    .from("event_identity_call_claims")
    .select("*")
    .eq("event_id", eventId)
    .in("state", [...NON_TERMINAL_STATES])
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as Claim | undefined) ?? null;
}

/* ------------------------------------------------------------------ claiming */

export type ClaimResult =
  | { outcome: "claimed"; claim: Claim; attemptKey: string; ordinal: number }
  | { outcome: "refused"; reason: IdentityRefusalReason; existingClaimId: string | null };

export interface ClaimRequest {
  eventId: string;
  userId: string;
  basis: IdentityCallBasis;
  ordinal: number;
  limits?: IdentityLimits;
}

/**
 * Step 4 of §A.6 — ceiling, caps, rate limit and the claim insert, atomically.
 *
 * Nothing constructs a provider client before this returns `claimed`. A refusal consumes nothing:
 * the RPC's inner block is a subtransaction, so every unit it took is rolled back with it.
 */
export async function claimIdentityCall(admin: Admin, req: ClaimRequest): Promise<ClaimResult> {
  // Resolved unconditionally, before the `??`, so a caller-supplied `limits` cannot route around
  // the production contract. Left behind an `??` this line is the whole fail-closed guarantee and
  // an optional field skips it — which is exactly the seam a later caller would reach for.
  const model = req.basis.modelConfig.model ?? "";
  requireCostProfile(model);
  const limits = req.limits ?? identityLimits(model);
  const digest = basisDigest(req.basis);
  const key = attemptKey(req.eventId, digest, req.ordinal);

  const { data, error } = await admin.rpc("claim_identity_call", {
    p_event_id: req.eventId,
    p_user_id: req.userId,
    p_attempt_key: key,
    p_basis_digest: digest,
    p_attempt_ordinal: req.ordinal,
    // Stored on the claim, because a recovering completer has no requester to ask.
    p_clarification_answer_ids: [...req.basis.clarificationAnswerIds],
    // The cost profile rides along as provenance: the revision this call produces can then say
    // which bound its spend was reserved against, not merely which model answered.
    p_provider_config: { ...req.basis.modelConfig, costProfileVersion: limits.costProfileVersion },
    p_lease_seconds: limits.leaseSeconds,
    p_event_cap_key: bytea(`identity:event:${req.eventId}`),
    p_event_cap_window: limits.eventCap.windowSeconds,
    p_event_cap_max: limits.eventCap.max,
    p_account_cap_key: bytea(`identity:account:${req.userId}`),
    p_account_cap_window: limits.accountCap.windowSeconds,
    p_account_cap_max: limits.accountCap.max,
    p_rate_key: bytea(`identity:rate:${req.userId}`),
    p_rate_window: limits.accountRate.windowSeconds,
    p_rate_max: limits.accountRate.max,
    p_ceiling_window_seconds: limits.ceiling.windowSeconds,
    p_ceiling_usd: limits.ceiling.usd,
    p_logical_call_max_usd: limits.logicalCallMaxUsd,
  });
  if (error) throw error;

  const row = (data ?? [])[0];
  if (!row) throw new Error("claim_identity_call returned no row");
  const recorded = Number(row.recorded_spend_usd);
  const reserved = Number(row.reserved_usd);

  if (row.outcome !== "claimed") {
    if (row.outcome === "ceiling") {
      emitCeilingAlert({
        kind: "identity_spend_refused",
        windowSeconds: limits.ceiling.windowSeconds,
        ceilingUsd: limits.ceiling.usd,
        recordedSpendUsd: recorded,
        reservedUsd: reserved,
        refusedBy: "ceiling",
        costBoundVerified: limits.costBoundVerified,
        costProfileVersion: limits.costProfileVersion,
      });
    }
    return { outcome: "refused", reason: row.outcome, existingClaimId: row.claim_id };
  }

  if (crossesWarnThreshold(limits, recorded, reserved)) {
    emitCeilingAlert({
      kind: "identity_spend_warn",
      windowSeconds: limits.ceiling.windowSeconds,
      ceilingUsd: limits.ceiling.usd,
      recordedSpendUsd: recorded,
      reservedUsd: reserved,
      costBoundVerified: limits.costBoundVerified,
      costProfileVersion: limits.costProfileVersion,
    });
  }

  const { data: claims, error: readError } = await admin
    .from("event_identity_call_claims")
    .select("*")
    .eq("id", row.claim_id!)
    .limit(1);
  if (readError) throw readError;
  const claim = (claims ?? [])[0] as Claim | undefined;
  if (!claim) throw new Error("claim_identity_call reported a claim that cannot be read back");
  return { outcome: "claimed", claim, attemptKey: key, ordinal: req.ordinal };
}

/* ------------------------------------------------------------------ the call's own steps */

/**
 * Step 5 — committed on its own, before the provider is reached.
 *
 * Returns false when the claim has already moved on, which the caller must treat as "do not call
 * the provider": something else is driving this claim.
 */
export async function markIdentityCallInvoked(admin: Admin, claimId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("mark_identity_call_invoked", { p_claim_id: claimId });
  if (error) throw error;
  return data === true;
}

/** The run row this call writes. NOT NULL columns come from the request side (§A.6 step 6). */
export interface CaptureRun {
  provider: string;
  model: string;
  provider_request_id: string | null;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  /** Cache writes, billed at a premium. `cached_input_tokens` is reads. */
  cache_write_input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  cost_estimate_usd: number;
  latency_ms: number;
  error_code: string | null;
  prompt_version: string;
  schema_version: string;
  input_assembly_version: string;
  schema_valid_first_call: boolean | null;
  reprompts: Json | null;
  provider_response_evidence: string[];
}

/**
 * Step 6 — the capture commit.
 *
 * Always returns the run id: the row is written whatever state the claim is in, because refusing
 * to record a response the provider already billed for would throw away both the evidence and the
 * spend. A retried capture returns the run it wrote the first time rather than a second row. Null
 * means only that the claim itself is gone.
 *
 * This commit is why a crash after the provider answered never costs a second model call.
 */
export async function captureIdentityCallResponse(
  admin: Admin,
  claimId: string,
  success: boolean,
  run: CaptureRun,
): Promise<string | null> {
  const { data, error } = await admin.rpc("capture_identity_call_response", {
    p_claim_id: claimId,
    p_success: success,
    p_run: run as unknown as Json,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export interface CompletedCall {
  revisionId: string;
  revision: number;
  isProvisional: boolean;
  authoritative: boolean;
}

/**
 * Step 7 — the conditional transition and the revision, atomically.
 *
 * Null means another completer got there first. That is an ordinary outcome, not an error: the
 * caller re-reads and observes whatever that completer produced.
 */
export async function completeIdentityCall(
  admin: Admin,
  claimId: string,
  result: Json,
): Promise<CompletedCall | null> {
  // The answer ids and provider configuration come from the claim, not from here: the completer
  // may be a different request, or the sweeper, and the revision still has to name what this call
  // actually carried.
  const { data, error } = await admin.rpc("complete_identity_call", {
    p_claim_id: claimId,
    p_result: result,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    revisionId: row.revision_id,
    revision: row.revision,
    isProvisional: row.is_provisional,
    authoritative: row.authoritative,
  };
}

/* ------------------------------------------------------------------ recovery and retention */

export interface ExpiryCounts {
  abandoned: number;
  expiredUnknown: number;
}

/**
 * Lease expiry. `abandoned` only ever from a committed null `provider_invoked_at`, because it is
 * the one transition that lets a new call start without a host deciding to retry.
 */
export async function expireIdentityCallClaims(admin: Admin, limit = 100): Promise<ExpiryCounts> {
  const { data, error } = await admin.rpc("expire_identity_call_claims", { p_limit: limit });
  if (error) throw error;
  const row = (data ?? [])[0];
  return { abandoned: row?.abandoned ?? 0, expiredUnknown: row?.expired_unknown ?? 0 };
}

/** Claims holding a paid response that no request has come back to complete (§A.6 step 3). */
export async function pendingIdentityCallCompletions(admin: Admin, limit = 50) {
  const { data, error } = await admin.rpc("pending_identity_call_completions", { p_limit: limit });
  if (error) throw error;
  return data ?? [];
}

export interface SweepResult extends ExpiryCounts {
  /** Captured responses turned into revisions, with **no** model call. */
  completed: number;
  /** Captured responses that can never be completed. Terminal, so the event is released. */
  unrecoverable: number;
  /** Completions that failed and may yet succeed. The claim stays captured and is retried. */
  retryable: number;
  /** The sweep stopped early because every claim was failing the same way. */
  systemicHalt: boolean;
}

/**
 * Postgres error classes a completion will fail on identically next time.
 *
 * `23` integrity violations (a foreign key, check or uniqueness the data itself breaks), `22` data
 * exceptions, `0A` unsupported feature — including the `feature_not_supported` a revision's
 * generated column raises for a schema version it has no reader for. Retrying any of these just
 * holds the event's slot open while failing the same way.
 *
 * Everything else — a deadlock, a serialization failure, a lost connection, an admin shutdown —
 * might succeed on the next run, so it is retried. Bounded, because an error nobody classified
 * must not be able to hold the slot open for ever either.
 */
const DETERMINISTIC_SQLSTATE_CLASSES = ["23", "22", "0A"];

/**
 * How long a captured response may sit unrecoverable before it is given up on.
 *
 * Measured from capture, not counted in attempts. The sweep runs every fifteen minutes, so a
 * three-attempt rule is a forty-five-minute rule: one statement timeout, one migration holding a
 * lock, one bad grant, and every captured response in the backlog is irreversibly terminal and
 * every one of those hosts pays again for a call that already succeeded. Two days holds through an
 * outage and still releases the slot eventually.
 */
export const RECOVERY_MAX_AGE_SECONDS = 48 * 60 * 60;

/**
 * Consecutive same-code failures that stop the sweep instead of counting against the claims.
 *
 * When every claim in a batch fails the same way, the claims are not the problem — and continuing
 * would work through the backlog terminalizing paid responses on the strength of a fault that is
 * about to be fixed.
 */
export const SYSTEMIC_FAILURE_RUN = 3;

export function isDeterministicCompletionFailure(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || code.length < 2) return false;
  return DETERMINISTIC_SQLSTATE_CLASSES.includes(code.slice(0, 2));
}

/**
 * Releases a captured response that cannot become a revision, without discarding it.
 *
 * `response_captured` is non-terminal and has no expiry, so a response nothing can complete would
 * hold that event's one in-flight slot for ever — the wedge this whole mechanism exists to
 * prevent, arriving by the recovery path instead of the crash path. Going terminal releases the
 * event; the run row and its evidence stay untouched for the normal retention window; and the host
 * starts a new paid attempt only by retrying explicitly, through every ordinary cap and the
 * ceiling.
 */
export async function failIdentityCallRecovery(
  admin: Admin,
  claimId: string,
  reason: string,
  deterministic: boolean,
): Promise<"terminal" | "retryable" | "not_captured"> {
  const { data, error } = await admin.rpc("fail_identity_call_recovery", {
    p_claim_id: claimId,
    p_reason: reason,
    p_deterministic: deterministic,
    p_max_age_seconds: RECOVERY_MAX_AGE_SECONDS,
  });
  if (error) throw error;
  return (data as "terminal" | "retryable" | "not_captured") ?? "not_captured";
}

/**
 * The recovery driver.
 *
 * Without something running this, the one-in-flight index is half a mechanism: it refuses every
 * new call while a claim is unsettled, and nothing settles a claim whose process died. The event
 * would be wedged for good. Expiry releases those; completion turns a captured paid response into
 * its revision, re-validating the stored text through the same validator production uses and
 * making **no** model call.
 *
 * A captured response whose text no longer validates is counted and left alone rather than marked
 * failed. It validated once, before capture, so this means corruption — and the evidence is still
 * durable, so an operator can look. Quietly discarding it would destroy the only copy.
 */
export async function sweepIdentityCallClaims(
  admin: Admin,
  options: { expireLimit?: number; completeLimit?: number } = {},
): Promise<SweepResult> {
  const expiry = await expireIdentityCallClaims(admin, options.expireLimit ?? 100);
  const pending = await pendingIdentityCallCompletions(admin, options.completeLimit ?? 50);

  let completed = 0;
  let unrecoverable = 0;
  let retryable = 0;
  let systemicHalt = false;
  let lastCode: string | null = null;
  let sameCodeRun = 0;

  /** Terminal when the failure is deterministic, or when the captured response has aged out. */
  const giveUp = async (claimId: string, reason: string, deterministic: boolean) => {
    try {
      const outcome = await failIdentityCallRecovery(admin, claimId, reason, deterministic);
      if (outcome === "terminal") unrecoverable += 1;
      else if (outcome === "retryable") retryable += 1;
      // To the alert sink, not only to the console: a host paid, the response exists, and the only
      // way forward is for them to pay again. A count in a cron response body is not a signal
      // anybody receives.
      if (outcome === "terminal") {
        emitRecoveryAlert({ kind: "identity_recovery_failed", claimId, reason, deterministic });
      }
      console.error(`identity sweep: claim ${claimId} not completed (${outcome}): ${reason}`);
    } catch (error) {
      // The give-up itself failing must not abort the sweep and discard the expiry counts — the
      // same failure mode the completion's own catch exists to prevent.
      retryable += 1;
      console.error(`identity sweep: could not record the failure of claim ${claimId}`, error);
    }
  };

  for (const row of pending) {
    if (systemicHalt) break;
    // The schema version is checked, not merely fetched. `identity_questions()` refuses an
    // unrecognised version rather than reading it as empty, and this is the same decision on the
    // same data: a version today's validator happens to accept would be written into a revision
    // whose generated column then refuses it, after the money was spent.
    if (!SUPPORTED_IDENTITY_SCHEMA_VERSIONS.includes(row.schema_version)) {
      // Deterministic by definition: no future run of this build has a reader for it either.
      await giveUp(row.claim_id, `unsupported schema version ${row.schema_version}`, true);
      continue;
    }
    const evidence = Array.isArray(row.provider_response_evidence)
      ? (row.provider_response_evidence as unknown[])
      : [];
    // The accepted response is the last one: a repair appends, and only a successful call is
    // captured as `response_captured`.
    const accepted = evidence.length > 0 ? evidence[evidence.length - 1] : undefined;
    if (typeof accepted !== "string") {
      await giveUp(row.claim_id, "captured evidence holds no response text", true);
      continue;
    }
    const outcome = parseAndValidateEventIdentityResult(accepted);
    if (!outcome.ok) {
      // Deterministic: the same bytes through the same validator fail the same way for ever. It
      // validated once before capture, so this means corruption — and the text is still durable.
      await giveUp(row.claim_id, "captured response no longer validates", true);
      continue;
    }
    // Per claim, because one claim the database refuses must not stop the run — and, when the
    // refusal is deterministic, must not hold its event's in-flight slot either.
    //
    // `complete_identity_call` can genuinely raise: `validate_identity_revision_answers` rejects
    // an answer id that does not belong to the event. Without the catch, the oldest such claim
    // would be retried first on every run, throw, discard that run's expiry counts and stop the
    // purge for ever. Without the *classification*, the event behind it would stay blocked for
    // ever even though the run continues.
    try {
      const done = await completeIdentityCall(
        admin,
        row.claim_id,
        outcome.value as unknown as Json,
      );
      if (done) completed += 1;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code ?? "unknown";
      const deterministic = isDeterministicCompletionFailure(error);
      if (!deterministic) {
        sameCodeRun = code === lastCode ? sameCodeRun + 1 : 1;
        lastCode = code;
        if (sameCodeRun >= SYSTEMIC_FAILURE_RUN) {
          // The claims are not the problem. Stopping leaves them captured and recoverable rather
          // than working through the backlog on the strength of a fault about to be fixed.
          systemicHalt = true;
          emitRecoveryAlert({
            kind: "identity_recovery_halted",
            claimId: row.claim_id,
            reason: `${SYSTEMIC_FAILURE_RUN} consecutive completions failed with ${code}`,
            deterministic: false,
          });
          console.error(`identity sweep: halting — ${sameCodeRun} consecutive failures (${code})`);
          continue;
        }
      } else {
        sameCodeRun = 0;
        lastCode = null;
      }
      await giveUp(row.claim_id, `complete_identity_call failed (${code})`, deterministic);
    }
  }

  return { ...expiry, completed, unrecoverable, retryable, systemicHalt };
}

/**
 * Evidence retention.
 *
 * The `not exists` inside the RPC is not an optimisation: `response_captured` has no expiry by
 * design, so nulling the evidence of a claim that has not settled would leave one that can never
 * be completed and never expires.
 */
export async function purgeIdentityResponseEvidence(
  admin: Admin,
  now: Date = new Date(),
  retentionDays: number = IDENTITY_EVIDENCE_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const { data, error } = await admin.rpc("purge_identity_response_evidence", {
    p_cutoff: cutoff.toISOString(),
  });
  if (error) throw error;
  return (data as number | null) ?? 0;
}
