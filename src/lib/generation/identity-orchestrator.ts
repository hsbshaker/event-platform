import "server-only";

import {
  EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION,
  EVENT_IDENTITY_PROMPT_VERSION,
  EVENT_IDENTITY_SCHEMA_VERSION,
} from "@/lib/ai/versions";
import type { ClarificationQuestion } from "@/lib/ai/event-identity/contract";
import { identityQuestions } from "@/lib/ai/event-identity/lifecycle";
import {
  EventIdentityError,
  eventIdentityModelConfig,
  generateEventIdentity,
  type EventIdentityCallResult,
  type EventIdentityModelConfig,
  type EventIdentityUsage,
  type GenerateEventIdentityInput,
} from "@/lib/ai/openai/event-identity";
import { requireEventAccess } from "@/lib/auth/event-access";
import { openAiEnv } from "@/lib/env";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  captureIdentityCallResponse,
  claimIdentityCall,
  completeCapturedClaim,
  completeIdentityCall,
  expireIdentityCallClaims,
  findNonTerminalClaim,
  markIdentityCallInvoked,
  pendingIdentityCallCompletions,
  recordCompletionFailure,
  resolveAttemptOrdinal,
  type CaptureRun,
  type Claim,
} from "./identity-claim";
import { estimateIdentityCallCostUsd } from "./identity-cost";
import { basisDigest, type IdentityCallBasis } from "./identity-key";
import {
  emitConfigurationAlert,
  IDENTITY_REFUSAL_PAYLOAD,
  identityLimits,
  IdentityConfigurationError,
  type IdentityLimits,
} from "./identity-spend";
import { identityClarificationState } from "./identity-state";

/**
 * T10 — the EventIdentity orchestrator.
 *
 * `docs/phase-4b-plan.md §A.6` is the authoritative order and this file is its implementation.
 * Nothing here re-derives a cap, a ceiling or an attempt key: those are T9A's, and duplicating any
 * of them would produce a second opinion about whether money may be spent.
 *
 * Two entry points, and the difference between them is the whole product rule:
 *
 * - `runEventIdentity` may spend. It is what a host's "generate" or "answer" action calls.
 * - `eventIdentityState` never spends. It is what a surface polls.
 *
 * **Both recover first.** Active recovery is request-driven; the once-daily housekeeping job is a
 * backstop for events nobody comes back to. A host who is waiting must never be waiting on a cron,
 * so every path through this file expires this event's due claims and completes a captured paid
 * response *before* it considers a new call — and a captured response becomes its revision by
 * re-validating stored text, with no second model call, ever.
 *
 * Acceptance criteria: `spec.md §31 — Prompt, auth, and generation`; `§31 — Creation Mode`;
 * `§7.6b`, `§7.7`, `§10`, `§25`; guardrails `§32 #4`, `#41`.
 */

type Admin = SupabaseClient<Database>;

/**
 * The clarification shapes, taken from the boundary's own input type rather than imported from the
 * assembly module.
 *
 * Deliberate. `raw-prompt-boundary.test.ts` holds host prose to a path of exactly two files — the
 * interpreter and the assembly it composes with — and every module that imports the assembly
 * directly, even for a type, widens that path by one name. Deriving the same types through
 * `GenerateEventIdentityInput` keeps the orchestrator a caller of the interpreter and nothing more,
 * and it cannot drift: a change to the assembly's answer shape changes these too.
 */
type IdentityClarification = NonNullable<GenerateEventIdentityInput["clarification"]>;
type CarriedClarification = IdentityClarification["answers"][number];
type PriorRevision = IdentityClarification["priorRevisions"][number];

/* ------------------------------------------------------------------ the public state contract */

/**
 * What a surface is allowed to know.
 *
 * Six states, and the set is deliberately small. `spec.md §32 #41` forbids exposing backend
 * generation and spend counters, and a richer state machine is one: a caller who can tell "the
 * project ceiling refused you" from "your event is capped" from "you are third in a queue" has
 * read three counters. So every refusal collapses into one state carrying one frozen sentence, and
 * every failed attempt collapses into another.
 *
 * - `running` — a call is in flight for this event. Poll; do not resubmit.
 * - `recovering` — no new call may start yet, and none is needed from the host: something is being
 *   settled (a captured response completed, a claim of a different round recovered, a call whose
 *   outcome is still ambiguous). Poll; a resubmit is safe and will be answered.
 * - `clarification_required` — the latest identity revision asks a question (`spec.md §7.6b`).
 * - `ready` — the event has an authoritative identity.
 * - `retry_available` — nothing is in flight and there is no result. A host action starts one.
 * - `temporarily_unavailable` — a safety limit refused this request. The frozen message is all a
 *   caller gets.
 */
export type IdentityOrchestrationState =
  | "running"
  | "recovering"
  | "clarification_required"
  | "ready"
  | "retry_available"
  | "temporarily_unavailable";

export interface IdentityOrchestrationResult {
  state: IdentityOrchestrationState;
  /**
   * Whether the event has an identity everything downstream may consume (`spec.md §7.7`).
   *
   * Reported beside the state rather than folded into it, because the two are independent facts
   * and `§7.6b` puts no lifetime cap on clarification rounds: a rerun after an authoritative
   * identity may itself ask a boundary question, and then the latest revision is provisional while
   * the authoritative pointer still names the earlier one. Collapsing that into one enum is how a
   * surface and a downstream stage come to disagree.
   */
  hasAuthoritativeIdentity: boolean;
  /** The revision this state is about: the latest one, when there is one. */
  identityRevisionId?: string;
  revision?: number;
  /** The open questions. `clarification_required` only, and never the rest of the envelope. */
  questions?: readonly ClarificationQuestion[];
  /** `temporarily_unavailable` only. Frozen, uniform, and reason-free by design. */
  message?: string;
}

/**
 * How long a host may be left looking at "running" before the honest answer changes.
 *
 * **Not** the claim lease, and the distinction is load-bearing. The lease is a financial
 * instrument: it bounds how long one paid call may be believed to be in flight before the system
 * treats its outcome as unknown, and it is derived from the provider boundary's worst case
 * (`identity-spend.ts`). This is a product deadline: `docs/phase-4b-plan.md §J` puts the median
 * call around thirty seconds, and a host who has waited three times that is owed a different
 * sentence rather than a longer spinner.
 *
 * Crossing it changes nothing financial. No call is abandoned, no second call is bought, no claim
 * moves. The *reported* state becomes `recovering` — "this is being safely reconciled" — which is
 * what is actually true of a call still running past its expected window.
 */
export const IDENTITY_USER_DEADLINE_MS = 90_000;

const unavailable = (hasAuthoritativeIdentity: boolean): IdentityOrchestrationResult => ({
  state: "temporarily_unavailable",
  hasAuthoritativeIdentity,
  message: IDENTITY_REFUSAL_PAYLOAD.message,
});

/* ------------------------------------------------------------------ reading persisted state */

interface PersistedOutcome {
  hasAuthoritativeIdentity: boolean;
  latestRevisionId: string | null;
  latestRevision: number | null;
  /** The latest revision's questions the host has not answered yet, in the order asked. */
  openQuestions: readonly ClarificationQuestion[];
  /** True while an unanswered **boundary** question is what the event is waiting on. */
  awaitingBoundaryAnswer: boolean;
}

/**
 * The persisted facts this contract is allowed to report.
 *
 * The open-question filter is the part worth stating. `is_provisional` describes the *envelope* —
 * it stays true for ever once a boundary question was asked — so reading it alone would keep
 * telling a host to answer a question they have already answered, and would keep T11 rendering it.
 * What the event is actually waiting on is an *unanswered* boundary question, and that is a join,
 * not a column.
 */
async function readPersistedOutcome(admin: Admin, eventId: string): Promise<PersistedOutcome> {
  const [{ data: revisions, error: revisionError }, { data: events, error: eventError }] =
    await Promise.all([
      admin
        .from("event_identity_revisions")
        .select("id, revision, is_provisional, result, schema_version")
        .eq("event_id", eventId)
        .order("revision", { ascending: false })
        .limit(1),
      admin.from("events").select("authoritative_identity_revision_id").eq("id", eventId).limit(1),
    ]);
  if (revisionError) throw revisionError;
  if (eventError) throw eventError;

  const row = (revisions ?? [])[0] ?? null;
  const derived = identityClarificationState({
    latestRevision: row
      ? { id: row.id, revision: row.revision, is_provisional: row.is_provisional }
      : null,
    authoritativeRevisionId: (events ?? [])[0]?.authoritative_identity_revision_id ?? null,
  });
  const base = {
    hasAuthoritativeIdentity: derived.consumableDownstream,
    latestRevisionId: derived.latestRevisionId,
    latestRevision: derived.latestRevision,
  };
  if (!row) return { ...base, openQuestions: [], awaitingBoundaryAnswer: false };

  const { data: answered, error: answerError } = await admin
    .from("clarification_answers")
    .select("question_index")
    .eq("identity_revision_id", row.id);
  if (answerError) throw answerError;
  const closed = new Set((answered ?? []).map((a) => a.question_index));
  // Not defended against: `is_provisional` is a generated column computed by the database from
  // this same envelope and this same supported-version list, so a revision this reader cannot read
  // and that one could means the two have diverged. A bug to surface, not to paper over with an
  // empty question list a host cannot answer.
  const openQuestions = identityQuestions(row.result, row.schema_version).filter(
    (_, index) => !closed.has(index),
  );
  return {
    ...base,
    openQuestions,
    awaitingBoundaryAnswer: openQuestions.some((question) => question.kind === "boundary"),
  };
}

/**
 * The persisted facts, as a public result.
 *
 * `fallback` is what to say when nothing persisted settles it. `force` marks the cases where the
 * fallback is itself the finding — a terminal failure this request just recorded, or one the host
 * must decide about — so that an event which already holds an authoritative identity from an
 * earlier round does not answer a failed rerun with `ready`.
 *
 * An unanswered boundary question outranks both: it is the one state where the host has something
 * to do that is not "try again".
 */
function outcomeState(
  outcome: PersistedOutcome,
  fallback: IdentityOrchestrationState,
  options: { force?: boolean } = {},
): IdentityOrchestrationResult {
  const result: IdentityOrchestrationResult = {
    state: fallback,
    hasAuthoritativeIdentity: outcome.hasAuthoritativeIdentity,
  };
  if (outcome.latestRevisionId) {
    result.identityRevisionId = outcome.latestRevisionId;
    result.revision = outcome.latestRevision ?? undefined;
  }
  // Carried whatever the state is. A Route A question does not gate anything (`spec.md §7.6b #4`)
  // and the revision that asked it is authoritative, but it "stays open and answerable" — which a
  // contract that only surfaced questions while blocking would make unimplementable.
  if (outcome.openQuestions.length > 0) result.questions = outcome.openQuestions;

  if (outcome.awaitingBoundaryAnswer) return { ...result, state: "clarification_required" };
  if (options.force) return result;
  if (outcome.hasAuthoritativeIdentity) return { ...result, state: "ready" };
  return result;
}

/* ------------------------------------------------------------------ step 3: settle, then look */

interface ClaimObservation {
  /** A non-terminal claim still standing after recovery, if any. */
  claim: Claim | null;
  /** A captured response this request completed inline, and the basis it answered. */
  recovered: { basisDigest: string; completed: boolean } | null;
}

/**
 * §A.6 step 3, and §A.5's "Who recovers, and when", in the order those sections require.
 *
 * 1. **expire this event's due claims.** A process that died between reserving a claim and
 *    reaching the provider leaves `claimed`, and the one-in-flight index refuses every new call
 *    while it sits there. With only the daily job to clear it, one crash costs that host a day.
 *    Scoped to this event, because the global pass is bounded and ordered by lease age: the
 *    waiting host's claim might simply not be in the batch.
 * 2. **look the event's non-terminal claim up** — event-scoped, not key-scoped. A deploy or a new
 *    answer changes the model-config digest or an answer id and therefore the key, so a key-scoped
 *    lookup would find nothing, the insert would be refused by the `(event_id)` index, and the
 *    event would be blocked with no completer on the request path at all.
 * 3. **complete it inline when it holds a captured response**, through the same conditional
 *    transition the sweeper uses — so a request and the job cannot both complete one — and with no
 *    model call. Leaving it is what wedges the event.
 */
async function settleEventClaims(admin: Admin, eventId: string): Promise<ClaimObservation> {
  // An event holds at most one non-terminal claim, so these bounds are slack rather than a budget:
  // they exist so a corrupted table cannot turn one request into an unbounded scan.
  await expireIdentityCallClaims(admin, { limit: 10, eventId });
  const claim = await findNonTerminalClaim(admin, eventId);
  if (!claim || claim.state !== "response_captured") return { claim, recovered: null };

  const pending = await pendingIdentityCallCompletions(admin, { limit: 5, eventId });
  const row = pending.find((candidate) => candidate.claim_id === claim.id);
  if (!row) {
    // `response_captured` with no readable run row. The sweeper's own classification applies, and
    // it is deterministic: nothing about a later run makes the missing row appear.
    await recordCompletionFailure(admin, claim.id, "captured claim has no generation run", true);
    return { claim: await findNonTerminalClaim(admin, eventId), recovered: null };
  }

  const attempt = await completeCapturedClaim(admin, row);
  if (attempt.kind === "failed") {
    await recordCompletionFailure(admin, claim.id, attempt.reason, attempt.deterministic);
  }
  return {
    // Re-read: the completion settled this one, and a concurrent request may already have started
    // the next round.
    claim: await findNonTerminalClaim(admin, eventId),
    // `raced` counts as completed: another completer produced the revision, and the outcome for
    // this request is identical.
    recovered: {
      basisDigest: claim.basis_digest,
      completed: attempt.kind === "completed" || attempt.kind === "raced",
    },
  };
}

/** What an in-flight claim looks like from outside. Past the product deadline the wording changes. */
function inFlightState(
  claim: Claim,
  hasAuthoritativeIdentity: boolean,
): IdentityOrchestrationResult {
  const startedAt = Date.parse(claim.claimed_at);
  const overdue = Number.isFinite(startedAt) && Date.now() - startedAt >= IDENTITY_USER_DEADLINE_MS;
  return { state: overdue ? "recovering" : "running", hasAuthoritativeIdentity };
}

/* ------------------------------------------------------------------ the pollable entry point */

/**
 * The refresh-safe read. **Never spends, and never calls a model.**
 *
 * It still recovers, because that is the point: a browser refresh, a reconnect or a status poll
 * has to be enough to finish a captured response or release a dead claim. Polling it repeatedly is
 * idempotent — the recovery steps are conditional transitions that match nothing the second time.
 */
export async function eventIdentityState(
  admin: Admin,
  eventId: string,
): Promise<IdentityOrchestrationResult> {
  const observation = await settleEventClaims(admin, eventId);
  const outcome = await readPersistedOutcome(admin, eventId);
  if (observation.claim) {
    return observation.claim.state === "response_captured"
      ? { state: "recovering", hasAuthoritativeIdentity: outcome.hasAuthoritativeIdentity }
      : inFlightState(observation.claim, outcome.hasAuthoritativeIdentity);
  }
  return outcomeState(outcome, "retry_available");
}

/* ------------------------------------------------------------------ inputs and the basis */

interface IdentityCallInputs {
  prompt: string;
  priorRevisions: PriorRevision[];
  answers: CarriedClarification[];
  answerIds: string[];
}

/**
 * Everything the call is assembled from, read from the persisted record and nothing else.
 *
 * Cumulative and chronological (CA-5): EventIdentity is stateless, so an answer left out is an
 * answer the model does not have. The order is `(round, question_index)` — the order the database
 * stores them in and the order the assembly renders them in — and it is also the order that goes
 * into the basis, because a different order is a different request.
 */
async function loadIdentityCallInputs(admin: Admin, eventId: string): Promise<IdentityCallInputs> {
  const [{ data: events, error: eventError }, { data: revisions, error: revisionError }] =
    await Promise.all([
      admin.from("events").select("prompt").eq("id", eventId).limit(1),
      admin
        .from("event_identity_revisions")
        .select("id, revision, result")
        .eq("event_id", eventId)
        .order("revision", { ascending: true }),
    ]);
  if (eventError) throw eventError;
  if (revisionError) throw revisionError;
  const prompt = (events ?? [])[0]?.prompt;
  if (typeof prompt !== "string") throw new Error(`event ${eventId} has no prompt`);

  const { data: answerRows, error: answerError } = await admin
    .from("clarification_answers")
    .select(
      "id, identity_revision_id, round, question_index, selected_option_label, free_text, is_defer",
    )
    .eq("event_id", eventId)
    .order("round", { ascending: true })
    .order("question_index", { ascending: true });
  if (answerError) throw answerError;

  const byId = new Map((revisions ?? []).map((r) => [r.id, r]));
  const answers: CarriedClarification[] = [];
  const answerIds: string[] = [];
  const asking = new Map<number, PriorRevision>();
  for (const row of answerRows ?? []) {
    const revision = byId.get(row.identity_revision_id);
    // Fail closed. The assembly resolves each answer's question out of the revision that asked it;
    // silently dropping an answer whose revision we could not find would send the model a
    // clarification history the host did not give, and would do it after the key was derived from
    // the full list.
    if (!revision) {
      throw new Error(`clarification answer ${row.id} names a revision this event does not have`);
    }
    asking.set(revision.revision, { revision: revision.revision, result: revision.result });
    answers.push({
      revision: row.round,
      questionIndex: row.question_index,
      selectedOptionLabel: row.selected_option_label,
      freeText: row.free_text,
      isDefer: row.is_defer,
    });
    answerIds.push(row.id);
  }
  return { prompt, priorRevisions: [...asking.values()], answers, answerIds };
}

function callBasis(
  inputs: IdentityCallInputs,
  modelConfig: EventIdentityModelConfig,
): IdentityCallBasis {
  return {
    prompt: inputs.prompt,
    clarificationAnswerIds: inputs.answerIds,
    promptVersion: EVENT_IDENTITY_PROMPT_VERSION,
    schemaVersion: EVENT_IDENTITY_SCHEMA_VERSION,
    inputAssemblyVersion: EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION,
    modelConfig,
  };
}

/* ------------------------------------------------------------------ persistence of one attempt */

interface RunSide {
  model: string;
  startedAt: number;
}

/** The request-side columns. They are NOT NULL and none of them arrives on a failure. */
function baseRun(side: RunSide): Omit<CaptureRun, "cost_estimate_usd" | "latency_ms"> {
  return {
    provider: "openai",
    model: side.model,
    provider_request_id: null,
    input_tokens: null,
    cached_input_tokens: null,
    cache_write_input_tokens: null,
    output_tokens: null,
    reasoning_tokens: null,
    error_code: null,
    prompt_version: EVENT_IDENTITY_PROMPT_VERSION,
    schema_version: EVENT_IDENTITY_SCHEMA_VERSION,
    input_assembly_version: EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION,
    schema_valid_first_call: null,
    reprompts: null,
    provider_response_evidence: [],
  };
}

const reprompts = (usage: Partial<EventIdentityUsage>): Json => ({
  transient: usage.transientRetries ?? 0,
  repair: usage.repairRetries ?? 0,
});

/**
 * Step 6 for a call that answered.
 *
 * Cost is priced from the profile the claim already reserved against (`limits.costProfile`) and
 * the bound it reserved with (`limits.perAttemptMaxUsd`). Re-resolving either here would run after
 * the money was spent, and the provider answers with a dated snapshot id that matches no profile
 * by exact string.
 */
function successRun(
  call: EventIdentityCallResult,
  limits: IdentityLimits,
  side: RunSide,
): CaptureRun {
  const cost = estimateIdentityCallCostUsd(limits.costProfile, call.usage, limits.perAttemptMaxUsd);
  return {
    ...baseRun(side),
    provider: call.usage.provider,
    model: call.usage.model,
    provider_request_id: call.usage.providerRequestId ?? null,
    input_tokens: call.usage.inputTokens ?? null,
    cached_input_tokens: call.usage.cachedInputTokens ?? null,
    cache_write_input_tokens: call.usage.cacheWriteInputTokens ?? null,
    output_tokens: call.usage.outputTokens ?? null,
    reasoning_tokens: call.usage.reasoningTokens ?? null,
    cost_estimate_usd: cost.usd,
    latency_ms: call.usage.latencyMs,
    prompt_version: call.promptVersion,
    schema_version: call.schemaVersion,
    input_assembly_version: call.inputAssemblyVersion,
    schema_valid_first_call: call.usage.schemaValidFirstCall,
    reprompts: reprompts(call.usage),
    // Every text this invocation was billed for, oldest first — including the response a
    // successful repair rejected, which was paid for just the same.
    provider_response_evidence: [...call.rawResponses],
  };
}

/**
 * Step 6 for a call that failed. The row is written anyway, and that is the point.
 *
 * A provider failure and an `invalid_output` failure both cost money — the second answered twice —
 * and a validator bug costs whatever had already been billed when it threw. None of them may be
 * recorded as a call that never happened, or the ceiling under-counts the spend it exists to
 * bound. Unknown usage is charged the per-attempt maximum, never zero.
 */
function failureRun(error: unknown, limits: IdentityLimits, side: RunSide): CaptureRun {
  const identityError = error instanceof EventIdentityError ? error : null;
  const usage: Partial<EventIdentityUsage> = identityError?.usage ?? {};
  const evidence =
    identityError?.rawResponses ??
    // A validator bug is not an `EventIdentityError`; the boundary annotates the thrown object
    // with what had been paid for, and dropping it here would destroy the only copy.
    (Array.isArray((error as { rawResponses?: unknown } | null)?.rawResponses)
      ? (error as { rawResponses: string[] }).rawResponses
      : []);
  // Attempts, not responses: a response that arrived without a usage block is counted by both
  // `providerResponses` and `unknownUsageAttempts`, and charging the sum bills it twice. When the
  // boundary reported no counts at all — the validator-bug path — what we know is that at least
  // the responses in hand were billed, and at least one attempt was made.
  const attempts = usage.providerAttempts ?? Math.max(evidence.length, 1);
  const cost = estimateIdentityCallCostUsd(
    limits.costProfile,
    {
      responses: usage.responses ?? [],
      providerResponses: usage.providerResponses ?? evidence.length,
      providerAttempts: attempts,
      unknownUsageAttempts: usage.unknownUsageAttempts ?? attempts,
    },
    limits.perAttemptMaxUsd,
  );
  return {
    ...baseRun(side),
    input_tokens: usage.inputTokens ?? null,
    cached_input_tokens: usage.cachedInputTokens ?? null,
    cache_write_input_tokens: usage.cacheWriteInputTokens ?? null,
    output_tokens: usage.outputTokens ?? null,
    reasoning_tokens: usage.reasoningTokens ?? null,
    cost_estimate_usd: cost.usd,
    latency_ms: usage.latencyMs ?? Date.now() - side.startedAt,
    // The kinds the boundary distinguishes, plus one for "our code threw". A checker bug must not
    // be filed as a weak model response.
    error_code: identityError ? identityError.kind : "internal_error",
    schema_valid_first_call: usage.schemaValidFirstCall ?? null,
    reprompts: reprompts(usage),
    provider_response_evidence: [...evidence],
  };
}

/* ------------------------------------------------------------------ the orchestration itself */

export interface RunEventIdentityRequest {
  eventId: string;
  /** The acting collaborator. Caps are per acting account, not per owner (`spec.md §6`). */
  userId: string;
  /**
   * A deliberate host retry after a terminal failure.
   *
   * Never inferred. `failed_terminal` and `expired_unknown` may both have cost money, so the next
   * paid attempt is a decision somebody makes, not a reflex of the code that noticed the failure.
   */
  explicitRetry?: boolean;
}

/**
 * The §A.6 order, once.
 *
 * Step 1 (authenticate and authorize) belongs to the caller — `startEventIdentity` below is the
 * request-shaped entry point that performs it — because this function is also what a server action
 * and a test drive, and an orchestrator that reaches for cookies cannot be either.
 */
export async function runEventIdentity(
  admin: Admin,
  request: RunEventIdentityRequest,
): Promise<IdentityOrchestrationResult> {
  const { eventId, userId } = request;

  // Step 2 — the exact bytes and the exact configuration, before any cap is touched, so a refresh
  // and a replayed POST cannot burn quota deriving what they already know.
  const env = openAiEnv();
  const modelConfig = eventIdentityModelConfig(env.OPENAI_MODEL, env.OPENAI_REASONING_EFFORT);
  const inputs = await loadIdentityCallInputs(admin, eventId);
  const basis = callBasis(inputs, modelConfig);
  const digest = basisDigest(basis);

  // Step 3 — recover, then look. Both halves run before anything considers new spend.
  const observation = await settleEventClaims(admin, eventId);
  const outcome = await readPersistedOutcome(admin, eventId);

  if (observation.claim) {
    // Someone is driving a call for this event. Whether it is this request's own round decides the
    // wording, never whether a second call starts: it does not.
    if (observation.claim.state === "response_captured") {
      return { state: "recovering", hasAuthoritativeIdentity: outcome.hasAuthoritativeIdentity };
    }
    return observation.claim.basis_digest === digest
      ? inFlightState(observation.claim, outcome.hasAuthoritativeIdentity)
      : { state: "recovering", hasAuthoritativeIdentity: outcome.hasAuthoritativeIdentity };
  }

  if (observation.recovered && observation.recovered.basisDigest !== digest) {
    // A call of a *different* round was in flight and has just been recovered. Its revision is not
    // this request's answer — it was computed from a basis that does not include the answer this
    // host just submitted — and handing it back would present someone else's result as their own.
    // The host resubmits; by then the recovered claim is terminal and non-matching, control falls
    // through to the claim below, and their own round begins.
    return { state: "recovering", hasAuthoritativeIdentity: outcome.hasAuthoritativeIdentity };
  }

  const resolution = await resolveAttemptOrdinal(admin, eventId, digest, {
    explicitRetry: request.explicitRetry,
  });
  if (resolution.mode === "already_succeeded") {
    // A replayed POST whose bytes are identical to one that already produced a revision. Free.
    return outcomeState(outcome, "retry_available");
  }
  if (resolution.mode === "needs_explicit_retry") {
    // The last attempt for these exact bytes may have cost money. Somebody decides — and an
    // authoritative identity from an earlier round must not answer this with `ready`.
    return outcomeState(outcome, "retry_available", { force: true });
  }
  if (resolution.mode === "observe") {
    return inFlightState(resolution.claim, outcome.hasAuthoritativeIdentity);
  }

  // Resolved before the claim, not after the call: `identityLimits` is what refuses an unpriced
  // model and an unset production ceiling, and both must fail before a provider client exists.
  let limits: IdentityLimits;
  try {
    limits = identityLimits(modelConfig.model);
  } catch (error) {
    // Not `temporarily_unavailable`. That payload tells the host to try again shortly, which for a
    // missing ceiling or an unverified model is false for ever and pages nobody. This is a
    // configuration refusal: alerted, and raised so it is visible server-side.
    const reason = error instanceof Error ? error.message : String(error);
    emitConfigurationAlert({ kind: "identity_configuration_refused", reason });
    throw new IdentityConfigurationError(reason, { cause: error });
  }

  // Step 4 — ceiling, caps, rate limit and the insert, atomically. A refusal consumes nothing.
  const claimed = await claimIdentityCall(admin, {
    eventId,
    userId,
    basis,
    ordinal: resolution.ordinal,
    limits,
  });
  if (claimed.outcome === "refused") {
    if (claimed.reason === "in_flight" || claimed.reason === "duplicate_key") {
      // Lost a race with a request that took the claim between step 3 and here. The honest answer
      // is the one step 3 would have given, not a refusal: nothing was consumed and a call is
      // running.
      const racing = await findNonTerminalClaim(admin, eventId);
      return racing
        ? inFlightState(racing, outcome.hasAuthoritativeIdentity)
        : { state: "recovering", hasAuthoritativeIdentity: outcome.hasAuthoritativeIdentity };
    }
    return unavailable(outcome.hasAuthoritativeIdentity);
  }

  // Step 5 — committed on its own, before the provider is reached. `false` means the claim moved:
  // it was reclaimed, and this driver has lost the right to spend. It must not call.
  if (!(await markIdentityCallInvoked(admin, claimed.claim.id))) {
    return { state: "recovering", hasAuthoritativeIdentity: outcome.hasAuthoritativeIdentity };
  }

  const side: RunSide = { model: modelConfig.model, startedAt: Date.now() };
  let call: EventIdentityCallResult;
  try {
    call = await generateEventIdentity({
      prompt: inputs.prompt,
      clarification:
        inputs.answers.length > 0
          ? { priorRevisions: inputs.priorRevisions, answers: inputs.answers }
          : undefined,
    });
  } catch (error) {
    // Step 6 on the failure path. Written before anything is decided about the error, so no
    // classification bug can lose a paid response.
    await captureIdentityCallResponse(
      admin,
      claimed.claim.id,
      false,
      failureRun(error, limits, side),
    );
    if (error instanceof EventIdentityError) {
      const after = await readPersistedOutcome(admin, eventId);
      return outcomeState(after, "retry_available", { force: true });
    }
    // Our own code threw. The evidence and the spend are recorded and the claim is terminal, so
    // the event is released and nothing silently buys a replacement — but this is a bug, and a bug
    // that reads as an ordinary retryable failure is a bug nobody fixes.
    throw error;
  }

  // Step 6 — capture what was paid for. After this commit, no crash can cost a second call.
  await captureIdentityCallResponse(admin, claimed.claim.id, true, successRun(call, limits, side));

  // Step 7 — the conditional transition and the revision, in one transaction. Null means another
  // completer won the race; whatever it produced is this request's answer too.
  await completeIdentityCall(admin, claimed.claim.id, call.output as unknown as Json);
  return outcomeState(await readPersistedOutcome(admin, eventId), "recovering");
}

/* ------------------------------------------------------------------ step 1, for a real request */

/**
 * Authorize, then orchestrate — §A.6 step 1 and the rest.
 *
 * Owner or co-host, and pre-publish only: `spec.md §25` ends with "Owner/co-host design generation
 * consumes the same event-level generation pool/limits. After publish, AI generation and concept
 * switching are disabled for both." A non-member gets `ForbiddenError` whether or not the event
 * exists, so this leaks no existence either.
 */
export async function startEventIdentity(
  admin: Admin,
  eventId: string,
  options: { explicitRetry?: boolean } = {},
): Promise<IdentityOrchestrationResult> {
  const access = await requireEventAccess(eventId, "generate_event_identity");
  return runEventIdentity(admin, {
    eventId,
    userId: access.user.id,
    explicitRetry: options.explicitRetry,
  });
}

/** The pollable read, behind the same authorization. */
export async function readEventIdentity(
  admin: Admin,
  eventId: string,
): Promise<IdentityOrchestrationResult> {
  await requireEventAccess(eventId, "view_event");
  return eventIdentityState(admin, eventId);
}
