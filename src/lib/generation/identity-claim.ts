import "server-only";

import { hashRateLimitKey } from "@/lib/auth/rate-limit";
import type { Database, IdentityCallClaimState, Json } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attemptKey, basisDigest, type IdentityCallBasis } from "./identity-key";
import {
  crossesWarnThreshold,
  emitCeilingAlert,
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
  const limits = req.limits ?? identityLimits();
  const digest = basisDigest(req.basis);
  const key = attemptKey(req.eventId, digest, req.ordinal);

  const { data, error } = await admin.rpc("claim_identity_call", {
    p_event_id: req.eventId,
    p_user_id: req.userId,
    p_attempt_key: key,
    p_basis_digest: digest,
    p_attempt_ordinal: req.ordinal,
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
 * Returns the run id, or null when the claim was not in `claimed` (someone else settled it). This
 * commit is why a crash after the provider answered never costs a second model call.
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
  providerConfig: Json,
  clarificationAnswerIds: string[],
): Promise<CompletedCall | null> {
  const { data, error } = await admin.rpc("complete_identity_call", {
    p_claim_id: claimId,
    p_result: result,
    p_provider_config: providerConfig,
    p_clarification_answer_ids: clarificationAnswerIds,
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
