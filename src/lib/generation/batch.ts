import "server-only";

import { createHash } from "node:crypto";

import type { AuthoritativeIdentity } from "@/lib/ai/event-identity/lifecycle";
import {
  BATCH_PER_ACCOUNT_DAILY,
  BATCH_PER_ACCOUNT_RATE,
  BATCH_PER_EVENT_DAILY,
  hashRateLimitKey,
  type RateLimitRule,
} from "@/lib/auth/rate-limit";
import { openAiEnv } from "@/lib/env";
import type {
  Database,
  GenerationBatchStatus,
  Json,
  ModelOperation,
  RecordSiblingRunOutcome,
} from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planConceptBatch, type ConceptBatchPlan } from "./planner";
import { emitCeilingAlert, identityLimits, IDENTITY_REFUSAL_PAYLOAD } from "./identity-spend";

/**
 * The concept-batch lifecycle — `docs/phase-4b-plan.md §G.5`, `§H.2`, `§I`, `§C`.
 *
 * A batch is the record that three sibling DesignIntent calls belong together, were planned from
 * one identity revision by one planner version, and are subject to one set of caps. It is created
 * here and enforced by the database: `spec.md §10`'s "one generation batch in flight per event at
 * a time" is a partial unique index, so the second concurrent request is refused by Postgres
 * rather than by whichever application check happened to run first.
 *
 * # What this module is not
 *
 * It is **not** the call-level EventIdentity controls. The attempt key, the pre-spend claim, the
 * per-call caps, the lease and the recovery states are Phase 4B's (`§A.5`, T9A,
 * `identity-claim.ts`, `identity-spend.ts`, `identity-key.ts`), they landed before the first
 * production model call, and nothing here reimplements, wraps or relaxes any of them. §H.1 says so
 * in as many words: T16 takes no credit for a 4B precondition.
 *
 * It also makes **no model call**, and nothing here knows what a DesignIntent is. T18 onward owns
 * the call; T16 owns the record it is made under, and the keys that stop it being made twice.
 *
 * # The five controls that live in this file
 *
 * | §H.2 control | where |
 * | --- | --- |
 * | one batch in flight per event | `generation_batches_one_in_flight`, a partial unique index; `planConceptBatchForEvent` converges on the winner |
 * | batch-level caps | `rate_limits`, consumed **when a batch is planned**, inside `plan_generation_batch`'s transaction |
 * | ceiling breach refuses new batches | the admission's ceiling check — and nowhere on the record or settle paths, so a running batch is never truncated |
 * | sibling idempotency | `siblingIdempotencyKey(batch, operation, conceptIndex, attempt)` into the already-unique `generation_runs.idempotency_key` |
 * | duplicate sibling calls | the same key, colliding in the database. **Never an in-process lock** — one does not survive a serverless instance |
 * | retries and resumption | the attempt ordinal advances only when an attempt was *recorded* as failed, so a resumption that finds nothing recorded re-issues under the same key |
 *
 * There is no arming token, confirmation secret or two-key execution here, and there is not going
 * to be one: §H.2 refuses it by name. Spend safety is a cap and an idempotency key.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity` (the assignment each concept is
 * planned under), `§31 — Creation Mode` (a late clarification answer never disturbs work already
 * in flight); `spec.md §10`, `§27`, `§6`; guardrails `§32 #41`.
 */

type Admin = SupabaseClient<Database>;

export type Batch = Database["public"]["Tables"]["generation_batches"]["Row"];
export type BatchSibling = Database["public"]["Tables"]["generation_batch_siblings"]["Row"];

/** The operation a concept sibling's call is. Part of the sibling key, so it is never implicit. */
export const SIBLING_OPERATION: ModelOperation = "design_intent";

/** The two states the in-flight uniqueness index is written over. */
export const IN_FLIGHT_BATCH_STATES: readonly GenerationBatchStatus[] = ["planned", "running"];

export function isBatchInFlight(status: GenerationBatchStatus): boolean {
  return IN_FLIGHT_BATCH_STATES.includes(status);
}

/**
 * The one payload a refused caller ever sees.
 *
 * Deliberately the *same frozen object* the identity refusals use rather than a second message.
 * `spec.md §32 #41` forbids exposing backend generation counters, and a caller who could tell a
 * batch refusal from an identity refusal has learned something about both. Which control refused
 * stays in the server-side record.
 */
export const BATCH_REFUSAL_PAYLOAD = IDENTITY_REFUSAL_PAYLOAD;

/* ------------------------------------------------------------------ the two deterministic keys */

/**
 * Length-prefixed, so no field can impersonate a boundary.
 *
 * The same construction `identity-key.ts` uses and for the same reason: a plain separator would let
 * two different tuples hash equal, and these hashes decide whether money is spent twice. Written
 * out here rather than imported because the identity attempt key is Phase 4B's frozen surface and
 * this is a different key with a different basis — §H.2 is explicit that the sibling key "needs
 * `batch_id` and therefore cannot serve the identity call".
 */
const sha256 = (parts: readonly string[]): string => {
  const h = createHash("sha256");
  for (const part of parts) {
    h.update(String(part.length));
    h.update(":");
    h.update(part);
  }
  return h.digest("hex");
};

export interface BatchKeyBasis {
  eventId: string;
  identityRevisionId: string;
  plannerVersion: string;
  round: number;
}

/**
 * The batch's own idempotency key.
 *
 * Derived from the request, never random and never client-supplied, so two simultaneous "start
 * this round" requests compute the same key and collide instead of planning twice. A new identity
 * revision, a planner bump or a genuinely new round each change it, which is what makes those a
 * legitimately different batch rather than a duplicate.
 */
export function batchIdempotencyKey(basis: BatchKeyBasis): string {
  if (!Number.isInteger(basis.round) || basis.round < 1) {
    throw new Error(`round must be a positive integer, got ${basis.round}`);
  }
  return sha256([
    basis.eventId,
    "concept_batch",
    basis.identityRevisionId,
    basis.plannerVersion,
    String(basis.round),
  ]);
}

export interface SiblingKeyBasis {
  batchId: string;
  operation: ModelOperation;
  conceptIndex: number;
  attempt: number;
}

/**
 * `(batch_id, operation, concept_index, attempt)` — §H.2's sibling key.
 *
 * It goes into `generation_runs.idempotency_key`, which has been unique since Phase 1, so a
 * duplicated sibling request collides instead of paying twice. `attempt` is the sibling's own
 * ordinal and advances only when an attempt has been *recorded* as failed: a retry inside one
 * attempt reuses this key (`model-contracts.md §8` unchanged), and a resumption that finds nothing
 * recorded re-issues under it too.
 */
export function siblingIdempotencyKey(basis: SiblingKeyBasis): string {
  if (!Number.isInteger(basis.conceptIndex) || basis.conceptIndex < 0) {
    throw new Error(`conceptIndex must be a non-negative integer, got ${basis.conceptIndex}`);
  }
  if (!Number.isInteger(basis.attempt) || basis.attempt < 0) {
    throw new Error(`attempt must be a non-negative integer, got ${basis.attempt}`);
  }
  return sha256([
    basis.batchId,
    basis.operation,
    String(basis.conceptIndex),
    String(basis.attempt),
  ]);
}

/* ------------------------------------------------------------------ configurable safety limits */

const positiveInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

const withMax = (rule: RateLimitRule, name: string): RateLimitRule => ({
  ...rule,
  max: positiveInt(name, rule.max),
});

export interface BatchLimits {
  eventCap: RateLimitRule;
  accountCap: RateLimitRule;
  accountRate: RateLimitRule;
  /** The project-wide ceiling window and amount, and what a null-costed run counts as. */
  ceiling: { windowSeconds: number; usd: number; runMaxUsd: number };
  /** What admitting one batch reserves against the ceiling. See the note below. */
  reservationUsd: number;
  /** Whether the bound a null-costed run is charged at came from a verified profile. */
  costBoundVerified: boolean;
  /** That profile's version, carried into the alert record as provenance. */
  costProfileVersion: string;
}

/**
 * The batch-level safety limits (`spec.md §10`: configurable, never user-facing).
 *
 * The **ceiling is the project's, not a second one**. `spec.md §10` lists exactly one
 * "global/project spend ceiling", T9A configured it, and this reads the same numbers back through
 * `identityLimits` rather than inventing `BATCH_CEILING_USD`. That also means production still
 * refuses when the ceiling is unset or the configured model has no verified cost profile, which is
 * the fail-closed behaviour §A.5 argues for.
 *
 * **`reservationUsd` is zero today, deliberately and as named debt.** A reservation is a price, and
 * DesignIntent has no verified cost profile yet — T18 introduces the call and T22 is the first time
 * one is made. Reserving the *identity* call's bound against three unpriced calls would be a
 * fabricated number that reads as safety. So a breach refuses new batches on **recorded** spend,
 * which is honest, and the forward-looking half arrives with the price. Until then the ceiling
 * under-reserves for batches, and that is stated rather than hidden.
 */
export function batchLimits(now: Date = new Date()): BatchLimits {
  const model = openAiEnv().OPENAI_MODEL;
  const identity = identityLimits(model, now);
  return {
    eventCap: withMax(BATCH_PER_EVENT_DAILY, "BATCH_EVENT_DAILY_MAX"),
    accountCap: withMax(BATCH_PER_ACCOUNT_DAILY, "BATCH_ACCOUNT_DAILY_MAX"),
    accountRate: withMax(BATCH_PER_ACCOUNT_RATE, "BATCH_ACCOUNT_RATE_MAX"),
    ceiling: {
      windowSeconds: identity.ceiling.windowSeconds,
      usd: identity.ceiling.usd,
      // §A.5.1 rule 3: a null `cost_estimate_usd` counts as a maximum, never as zero. This is the
      // only verified logical-call bound this build has.
      runMaxUsd: identity.logicalCallMaxUsd,
    },
    reservationUsd: 0,
    costBoundVerified: identity.costBoundVerified,
    costProfileVersion: identity.costProfileVersion,
  };
}

/* ------------------------------------------------------------------ reads */

const bytea = (key: string): string => `\\x${hashRateLimitKey(key).toString("hex")}`;

export async function findInFlightBatch(admin: Admin, eventId: string): Promise<Batch | null> {
  const { data, error } = await admin
    .from("generation_batches")
    .select("*")
    .eq("event_id", eventId)
    .in("status", [...IN_FLIGHT_BATCH_STATES])
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as Batch | undefined) ?? null;
}

/** The event's most recent batch by round, in flight or settled. */
export async function latestBatch(admin: Admin, eventId: string): Promise<Batch | null> {
  const { data, error } = await admin
    .from("generation_batches")
    .select("*")
    .eq("event_id", eventId)
    .order("round", { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as Batch | undefined) ?? null;
}

async function readBatch(admin: Admin, batchId: string): Promise<Batch | null> {
  const { data, error } = await admin
    .from("generation_batches")
    .select("*")
    .eq("id", batchId)
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as Batch | undefined) ?? null;
}

export async function batchSiblings(admin: Admin, batchId: string): Promise<BatchSibling[]> {
  const { data, error } = await admin
    .from("generation_batch_siblings")
    .select("*")
    .eq("batch_id", batchId)
    .order("concept_index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BatchSibling[];
}

export interface ResumableSibling {
  sibling: BatchSibling;
  /** The key this sibling's next call must be made under. Derived, never stored. */
  idempotencyKey: string;
}

/**
 * The siblings a resumption re-issues: exactly those with **no successful run** (§H.2 row 7).
 *
 * Each comes back with the key its next call must carry, derived from the sibling's current
 * attempt ordinal — so a resumption of an unrecorded attempt reuses that attempt's key and a
 * duplicate collides, while a recorded failure has already advanced the ordinal and is honestly a
 * new paid attempt.
 */
export async function resumableSiblings(
  admin: Admin,
  batchId: string,
): Promise<ResumableSibling[]> {
  const siblings = await batchSiblings(admin, batchId);
  return siblings
    .filter((sibling) => sibling.status !== "succeeded")
    .map((sibling) => ({
      sibling,
      idempotencyKey: siblingIdempotencyKey({
        batchId,
        operation: SIBLING_OPERATION,
        conceptIndex: sibling.concept_index,
        attempt: sibling.attempt,
      }),
    }));
}

/* ------------------------------------------------------------------ planning a batch */

export type BatchRefusalReason =
  | "ceiling"
  | "cap_event"
  | "cap_account"
  | "rate_limited"
  | "in_flight"
  | "duplicate_key"
  | "stale_round"
  | "not_authoritative";

export type PlanBatchResult =
  /** A new batch was admitted, with its three sibling assignments persisted. */
  | { outcome: "planned"; batch: Batch; plan: ConceptBatchPlan }
  /**
   * An existing batch answers this request. A refresh, a double-tap and a request that lost the
   * uniqueness race all land here — one batch, observed, never a second one.
   */
  | { outcome: "observed"; batch: Batch }
  | { outcome: "refused"; reason: BatchRefusalReason; existingBatchId: string | null };

export interface PlanBatchRequest {
  eventId: string;
  /** The acting collaborator. Caps are per acting account, not per owner (`spec.md §6`). */
  userId: string;
  /** The authoritative identity. Only `assertAuthoritative` can produce this type. */
  identity: AuthoritativeIdentity;
  /** The revision that identity was read from, and the only seed the planner takes. */
  identityRevisionId: string;
  /**
   * The canonical new-round path (`spec.md §7.9`, `Try another direction`).
   *
   * Never inferred. A refresh is a read: without this, a request that arrives after a batch has
   * settled observes that batch rather than buying three more calls, which is the same rule
   * `explicitRetry` enforces one level down (§A.5's attempt ordinal).
   */
  newRound?: boolean;
  /** Test seam. Production leaves it unset. */
  limits?: BatchLimits;
  now?: Date;
}

/**
 * Plan one batch of three siblings for an event, or observe the one that already exists.
 *
 * The order matters, and it is the order a refusal costs nothing in:
 *
 *   1. observe — an in-flight batch, or a settled one when this is not a new round, answers here
 *      with no cap touched and nothing planned;
 *   2. derive the round, server-side, as `max(round) + 1`;
 *   3. plan — a pure function, no model call, no I/O (`§D`);
 *   4. admit — ceiling, three caps, the batch row and its three siblings in one transaction.
 *
 * Step 1 is an optimisation, never the control. Two concurrent requests both see no batch, both
 * plan, and the database refuses the second on `generation_batches_one_in_flight`; the loser is
 * handed the winner and returns `observed`. Which is the point of §H.2's first row: the database
 * refuses the second, not the application.
 */
export async function planConceptBatchForEvent(
  admin: Admin,
  request: PlanBatchRequest,
): Promise<PlanBatchResult> {
  const { eventId, userId, identity, identityRevisionId } = request;

  const existing = await latestBatch(admin, eventId);
  if (existing && (isBatchInFlight(existing.status) || request.newRound !== true)) {
    return { outcome: "observed", batch: existing };
  }
  const round = (existing?.round ?? 0) + 1;

  // Pure, deterministic, and seeded from the revision alone (`§D`). No model call happens here or
  // anywhere in T16.
  // `plan.plannerVersion` is `PLANNER_VERSION` as the planner stamped it. The batch records what
  // the plan reports rather than re-reading the constant, so a row can never name a version its
  // own assignments did not come from.
  const plan = planConceptBatch({ identity, identityRevisionId });
  const limits = request.limits ?? batchLimits(request.now);
  const key = batchIdempotencyKey({
    eventId,
    identityRevisionId,
    plannerVersion: plan.plannerVersion,
    round,
  });

  const { data, error } = await admin.rpc("plan_generation_batch", {
    p_event_id: eventId,
    p_user_id: userId,
    p_identity_revision_id: identityRevisionId,
    p_planner_version: plan.plannerVersion,
    p_round: round,
    p_idempotency_key: key,
    // An object, not a bare array: see the parameter's note in the migration.
    p_plan: { siblings: plan.siblings } as unknown as Json,
    p_event_cap_bucket: limits.eventCap.bucket,
    p_event_cap_key: bytea(`batch:event:${eventId}`),
    p_event_cap_window: limits.eventCap.windowSeconds,
    p_event_cap_max: limits.eventCap.max,
    p_account_cap_bucket: limits.accountCap.bucket,
    p_account_cap_key: bytea(`batch:account:${userId}`),
    p_account_cap_window: limits.accountCap.windowSeconds,
    p_account_cap_max: limits.accountCap.max,
    p_rate_bucket: limits.accountRate.bucket,
    p_rate_key: bytea(`batch:rate:${userId}`),
    p_rate_window: limits.accountRate.windowSeconds,
    p_rate_max: limits.accountRate.max,
    p_ceiling_window_seconds: limits.ceiling.windowSeconds,
    p_ceiling_usd: limits.ceiling.usd,
    p_run_max_usd: limits.ceiling.runMaxUsd,
    p_batch_reservation_usd: limits.reservationUsd,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) throw new Error("plan_generation_batch returned no row");

  if (row.outcome === "planned") {
    const batch = await readBatch(admin, row.batch_id!);
    if (!batch) throw new Error("plan_generation_batch reported a batch that cannot be read back");
    return { outcome: "planned", batch, plan };
  }

  if (row.outcome === "ceiling") {
    emitCeilingAlert({
      kind: "batch_spend_refused",
      windowSeconds: limits.ceiling.windowSeconds,
      ceilingUsd: limits.ceiling.usd,
      recordedSpendUsd: Number(row.recorded_spend_usd),
      reservedUsd: limits.reservationUsd,
      refusedBy: "ceiling",
      costBoundVerified: limits.costBoundVerified,
      costProfileVersion: limits.costProfileVersion,
    });
  }

  // A collision converges rather than failing: the loser of a uniqueness race is handed the one
  // batch that exists, which is what makes a double-tap and a refresh indistinguishable from a
  // single request.
  if (row.outcome === "in_flight" || row.outcome === "duplicate_key") {
    const batch = row.batch_id ? await readBatch(admin, row.batch_id) : null;
    if (batch) return { outcome: "observed", batch };
  }

  return { outcome: "refused", reason: row.outcome, existingBatchId: row.batch_id };
}

/* ------------------------------------------------------------------ running a batch */

/** `planned` → `running`. True only for the transition, so a second caller knows it did not act. */
export async function startBatch(admin: Admin, batchId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("start_generation_batch", { p_batch_id: batchId });
  if (error) throw error;
  return data === true;
}

/**
 * Mark one sibling issued.
 *
 * Telemetry, not mutual exclusion. §H.2 row 6 is explicit that duplicate sibling calls are
 * prevented by the idempotency key rather than by a lock, "which do not survive a serverless
 * instance" — so a second instance that issues the same sibling is stopped at the run row, not
 * here.
 */
export async function issueSibling(
  admin: Admin,
  batchId: string,
  conceptIndex: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("issue_batch_sibling", {
    p_batch_id: batchId,
    p_concept_index: conceptIndex,
  });
  if (error) throw error;
  return data === true;
}

/**
 * What the provider boundary learned about one sibling call.
 *
 * Attribution is deliberately absent: `event_id`, `round`, `concept_index`, `planner_version` and
 * `diversity_assignment` are taken from the batch and the sibling rows inside the RPC, so a caller
 * cannot record a run against the wrong event, round or assignment.
 */
export interface SiblingRunTelemetry {
  provider: string;
  model: string;
  latencyMs: number;
  promptVersion: string;
  schemaVersion: string;
  operation?: ModelOperation;
  userId?: string | null;
  providerRequestId?: string | null;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  cacheWriteInputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  costEstimateUsd?: number | null;
  errorCode?: string | null;
  inputAssemblyVersion?: string | null;
  schemaValidFirstCall?: boolean | null;
  reprompts?: Json | null;
}

export interface RecordSiblingRunRequest {
  batchId: string;
  conceptIndex: number;
  /** The attempt this run belongs to. Must match the sibling's current ordinal. */
  attempt: number;
  success: boolean;
  run: SiblingRunTelemetry;
}

export interface RecordSiblingRunResult {
  outcome: RecordSiblingRunOutcome;
  runId: string | null;
  /** The key this attempt was recorded under, so a caller can see what it collided with. */
  idempotencyKey: string;
}

/**
 * Record one sibling's run, under `(batch_id, operation, concept_index, attempt)`.
 *
 * The key is derived here and never accepted from a caller — an idempotency token a client can
 * choose is not idempotency. A duplicate collides on `generation_runs.idempotency_key` and
 * converges on the row that already exists; the ceiling reads that table back as spend, so writing
 * a second row for one paid call would double-count it.
 */
export async function recordSiblingRun(
  admin: Admin,
  request: RecordSiblingRunRequest,
): Promise<RecordSiblingRunResult> {
  const operation = request.run.operation ?? SIBLING_OPERATION;
  const idempotencyKey = siblingIdempotencyKey({
    batchId: request.batchId,
    operation,
    conceptIndex: request.conceptIndex,
    attempt: request.attempt,
  });
  const run = request.run;
  const { data, error } = await admin.rpc("record_batch_sibling_run", {
    p_batch_id: request.batchId,
    p_concept_index: request.conceptIndex,
    p_attempt: request.attempt,
    p_idempotency_key: idempotencyKey,
    p_success: request.success,
    p_run: {
      operation,
      provider: run.provider,
      model: run.model,
      latency_ms: run.latencyMs,
      prompt_version: run.promptVersion,
      schema_version: run.schemaVersion,
      user_id: run.userId ?? null,
      provider_request_id: run.providerRequestId ?? null,
      input_tokens: run.inputTokens ?? null,
      cached_input_tokens: run.cachedInputTokens ?? null,
      cache_write_input_tokens: run.cacheWriteInputTokens ?? null,
      output_tokens: run.outputTokens ?? null,
      reasoning_tokens: run.reasoningTokens ?? null,
      cost_estimate_usd: run.costEstimateUsd ?? null,
      error_code: run.errorCode ?? null,
      input_assembly_version: run.inputAssemblyVersion ?? null,
      schema_valid_first_call: run.schemaValidFirstCall ?? null,
      reprompts: run.reprompts ?? null,
    } as unknown as Json,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) throw new Error("record_batch_sibling_run returned no row");
  return { outcome: row.outcome, runId: row.run_id, idempotencyKey };
}

/**
 * Settle a batch from its siblings (§I).
 *
 * One failed sibling leaves the batch `completed`: concept-level readiness is canonical
 * (`spec.md §7.10 #5`) and the failed sibling is never replaced by a library recipe
 * (`CLAUDE.md §5.1`). Two or more and the batch failed **as a batch** — "fewer than three concepts
 * is a visible state, never three where one is fabricated".
 *
 * Returns `in_flight` and changes nothing while any sibling is unfinished, so calling it early is
 * harmless and calling it twice is idempotent.
 */
export async function settleBatch(
  admin: Admin,
  batchId: string,
): Promise<GenerationBatchStatus | "in_flight"> {
  const { data, error } = await admin.rpc("settle_generation_batch", { p_batch_id: batchId });
  if (error) throw error;
  return data as GenerationBatchStatus | "in_flight";
}
