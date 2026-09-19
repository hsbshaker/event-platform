import "server-only";

/**
 * One concept batch, end to end — the production path the premise stage had no way to reach.
 *
 * The product requirement this file exists to satisfy is one sentence: **one correct understanding
 * of the event, three meaningfully different creative choices.** Everything below is in service of
 * it, and nothing below is in service of measuring it.
 *
 * Before this module the pieces all existed and none of them ran together. `planner.ts` planned
 * three assignments, `batch.ts` recorded that they belonged to one batch, both provider boundaries
 * could make their calls, the validators could judge a response and `concept-set.ts` could resolve
 * three cards — and the only thing that ever called any of it was the eval seam. So the T22
 * remediation was a capability rather than a product change: a host generating concepts would still
 * have received three parameterisations of one idea. This is the sequencer that closes that gap.
 *
 * # The order, and what each step is for
 *
 * ```text
 *   1. read the authoritative identity            the one understanding all three inherit
 *   2. plan or observe the batch                   batch.ts — caps, ceiling, in-flight uniqueness
 *   3. premise call, once                          three creative propositions, as one set
 *   4. bind premise k to planned sibling k         deterministic
 *   5. three DesignIntent calls, in parallel       each blind to the other two
 *   6. deterministic set review                    resolve the three host-facing cards
 *   7. persist one artifact per succeeded sibling   lineage, with the premise that produced it
 *   8. settle the batch                            §I's failure semantics
 * ```
 *
 * **Step 3 is serial and that is the cost.** `spec.md §9.1` states it rather than hiding it: a
 * batch is one premise call plus three DesignIntent calls, and the premise call is ahead of the
 * three because its output is what makes them different. `§7.10 #3`'s parallelism is preserved
 * where it was — the three DesignIntent calls still run together.
 *
 * **Step 6 must come before step 7, and that is a real sequencing decision.** `§G.2` says an
 * artifact is written *"the moment that DesignIntent completes and validates"*, and this writes all
 * of them after the third one settles. The reason is the column: `presentation` is `not null` with
 * a non-empty name and description, so it can only ever hold a **resolved** card — and
 * `spec.md §7.8`'s duplicate-name fallback is decidable only across three siblings at once. Writing
 * per sibling would mean either persisting a card the set review is about to replace, on a table
 * whose rows cannot be updated, or persisting no card at all. Nothing is lost by waiting: every
 * paid response is already durable in `generation_runs` before step 6 begins, and
 * `card_deviations` records what the review changed.
 *
 * # What this module does not do
 *
 * It **makes no control of its own.** Every cap, the ceiling, the one-batch-in-flight rule, the
 * batch key, the sibling key and the attempt ordinal are `batch.ts`'s, and §H.2 is explicit that
 * they are enforced by the database rather than by whichever application check ran first. There is
 * no lock here, no arming token and no second claims system: the identity call needed one because
 * it had no batch row to hang an attempt off, and this has one.
 *
 * It **composes nothing**. A `design_concepts` row needs a composition, which is Phase 4D. The
 * artifact is the end of the 4C path, and `design_concepts.design_intent_artifact_id` is how a
 * concept will later reach back to it.
 *
 * It **takes `userId` from its caller and checks no membership.** A route handler must not call
 * this directly — the same rule `runEventIdentity` carries, and for the same reason: reaching it
 * from a request without an authorization step in front would let any signed-in user spend against
 * somebody else's event.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity` (the premise set, binding by
 * index, one shared identity), `§31 — DesignIntent, composition and compiler` (the three channels,
 * the card fallback, persistence with versions), `§31 — Concept experience`. Guardrails
 * `spec.md §32 #12`, `#18`, `#21`, `#21a`, `#21b`, `#41`.
 */
import type { ConceptPremise } from "@/lib/ai/concept-premise/contract";
import type { DesignIntentCallResult } from "@/lib/ai/openai/design-intent";
import { DesignIntentError, generateDesignIntent } from "@/lib/ai/openai/design-intent";
import {
  ConceptPremiseError,
  generateConceptPremiseSet,
  type ConceptPremiseCallResult,
} from "@/lib/ai/openai/concept-premise";
import { designIntentModelConfig } from "@/lib/ai/openai/design-intent";
import type { EventIdentity } from "@/lib/ai/event-identity/contract";
import { assertAuthoritative, type AuthoritativeIdentity } from "@/lib/ai/event-identity/lifecycle";
import {
  CONCEPT_PREMISE_INPUT_ASSEMBLY_VERSION,
  CONCEPT_PREMISE_PROMPT_VERSION,
  CONCEPT_PREMISE_SCHEMA_VERSION,
} from "@/lib/ai/versions";
import { openAiEnv } from "@/lib/env";
import type { Database, Json, ModelOperation } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  planConceptBatchForEvent,
  recordBatchCallRun,
  recordSiblingRun,
  settleBatch,
  startBatch,
  issueSibling,
  type Batch,
  type BatchRefusalReason,
  type SiblingRunTelemetry,
} from "./batch";
import {
  reviewConceptSet,
  type ConceptCard,
  type ReviewedConcept,
  type SetSignal,
} from "./concept-set";
import type { ConceptBatchPlan, PlannedConcept } from "./planner";

type Admin = SupabaseClient<Database>;

/** The operation the premise call is recorded under. Its own value, never `design_intent`. */
export const PREMISE_OPERATION: ModelOperation = "concept_premise";

/**
 * The premise run is recorded at the **batch** level, not against a sibling.
 *
 * Worth stating because the obvious shortcut is wrong. `recordSiblingRun` also settles
 * `generation_batch_siblings` for the `concept_index` it is handed, so borrowing a sibling's slot
 * for a batch-level call would mark that sibling `succeeded` before its own DesignIntent call ran —
 * and its real run would then be refused as `already_succeeded` and never recorded at all. The
 * ceiling reads `generation_runs` as spend, so that is unpriced money.
 *
 * `recordBatchCallRun` exists for this, keyed `(batch_id, operation, attempt)` with
 * `concept_index` left null: the premise belongs to all three concepts, so naming one would be
 * false. Which premise produced which concept is on the artifact rows instead, each carrying its
 * own member of the set.
 */
export const PREMISE_IS_A_BATCH_CALL = true;

/**
 * The attempt ordinal every call in a freshly planned batch is made under.
 *
 * Zero, and the reason is worth stating rather than leaving as a literal: this function only ever
 * runs for a batch it has just planned in the same call, whose sibling rows were created by
 * `plan_generation_batch`'s own transaction and have never been attempted. A **resumption** reads
 * the ordinal off the row instead — `resumableSiblings` derives both the ordinal and the key it
 * implies — and that is a different entry point, not this one.
 */
export const FIRST_ATTEMPT = 0;

export type ConceptBatchOutcome =
  /**
   * At least one concept. `cards` is what a host reads, and `conceptCount` below three is a
   * **visible** shortfall rather than a padded set — `spec.md §7.10 #5` makes concept-level
   * readiness canonical and `§I` refuses "three where one is fabricated".
   */
  | {
      readonly state: "generated";
      readonly batch: Batch;
      readonly cards: readonly ConceptCard[];
      readonly conceptCount: number;
      /** What `settle_generation_batch` decided: `completed`, or `failed` at two or more (`§I`). */
      readonly status: string;
      /**
       * What the set review saw in the design fields: identical composition vectors, overlapping
       * motif sets, a shared dominant colour, a premise the design argues against.
       *
       * Returned rather than discarded, and the reason is a real hazard. The card fallback derives
       * a repaired card from that concept's premise, so three concepts that converged completely
       * still present three distinct cards — the cards say what the premises were, not what the
       * designs became. Without this, a batch could look like three choices at the only surface
       * anyone reads while the convergence that produced it went unrecorded.
       *
       * Reported, never acted on (`spec.md §32 #21b`). They are deliberately **not** persisted:
       * every signal is a pure deterministic function of the three `design_intent` payloads, which
       * the artifacts hold immutably, so they can be recomputed from the record at any time.
       * `card_deviations` is persisted precisely because it is not recomputable — the substitution
       * destroys the model's own card, and nothing else would hold it.
       */
      readonly signals: readonly SetSignal[];
    }
  /**
   * Every sibling failed. Distinct from `generated` with a count of zero, which would be a claim
   * nobody should have to read past: nothing was generated, and the state says so.
   */
  | { readonly state: "failed"; readonly batch: Batch; readonly status: string }
  /** A batch already exists and answers this request. No cap touched, nothing generated. */
  | { readonly state: "observed"; readonly batch: Batch }
  /** The premise set could not be made usable. No concept is generated, and that is visible. */
  | { readonly state: "premise_unusable"; readonly batch: Batch; readonly detail: string }
  | { readonly state: "refused"; readonly reason: BatchRefusalReason };

export interface RunConceptBatchRequest {
  eventId: string;
  /** The acting collaborator. Caps are per acting account, not per owner (`spec.md §6`). */
  userId: string;
  /** The canonical new-round path (`spec.md §7.9`, `Try another direction`). Never inferred. */
  newRound?: boolean;
}

/* ------------------------------------------------------------------ the identity */

interface AuthoritativeRevision {
  readonly id: string;
  readonly identity: AuthoritativeIdentity;
  readonly schemaVersion: string;
}

/**
 * The one authoritative understanding, read once and shared by all three siblings.
 *
 * `assertAuthoritative` is the only way to produce the branded type the planner and both calls
 * require, so a provisional identity cannot reach generation on this path — it is a thrown error
 * here rather than a review comment (`spec.md §7.6b`). The brand wraps the **brief**, so
 * `suppliedFacts` and `clarification` are not reachable from what travels downstream.
 */
async function readAuthoritativeIdentity(
  admin: Admin,
  eventId: string,
): Promise<AuthoritativeRevision | null> {
  const { data: events, error: eventError } = await admin
    .from("events")
    .select("authoritative_identity_revision_id")
    .eq("id", eventId)
    .limit(1);
  if (eventError) throw eventError;
  const revisionId = (events ?? [])[0]?.authoritative_identity_revision_id ?? null;
  if (!revisionId) return null;

  const { data: revisions, error: revisionError } = await admin
    .from("event_identity_revisions")
    .select("id, result, schema_version")
    .eq("id", revisionId)
    .limit(1);
  if (revisionError) throw revisionError;
  const revision = (revisions ?? [])[0];
  if (!revision) return null;

  return {
    id: revision.id,
    identity: assertAuthoritative(revision.result, revision.schema_version),
    schemaVersion: revision.schema_version,
  };
}

/* ------------------------------------------------------------------ run telemetry */

function premiseTelemetry(call: ConceptPremiseCallResult): SiblingRunTelemetry {
  return {
    operation: PREMISE_OPERATION,
    provider: call.usage.provider,
    model: call.usage.model,
    latencyMs: call.usage.latencyMs,
    promptVersion: call.promptVersion,
    schemaVersion: call.schemaVersion,
    inputAssemblyVersion: call.inputAssemblyVersion,
    providerRequestId: call.usage.providerRequestId ?? null,
    inputTokens: call.usage.inputTokens ?? null,
    cachedInputTokens: call.usage.cachedInputTokens ?? null,
    cacheWriteInputTokens: call.usage.cacheWriteInputTokens ?? null,
    outputTokens: call.usage.outputTokens ?? null,
    reasoningTokens: call.usage.reasoningTokens ?? null,
    schemaValidFirstCall: call.usage.validFirstCall,
    reprompts: {
      repairRetries: call.usage.repairRetries,
      transientRetries: call.usage.transientRetries,
    } as Json,
  };
}

function designIntentTelemetry(call: DesignIntentCallResult): SiblingRunTelemetry {
  return {
    operation: "design_intent",
    provider: call.usage.provider,
    model: call.usage.model,
    latencyMs: call.usage.latencyMs,
    promptVersion: call.promptVersion,
    schemaVersion: call.schemaVersion,
    inputAssemblyVersion: call.inputAssemblyVersion,
    providerRequestId: call.usage.providerRequestId ?? null,
    inputTokens: call.usage.inputTokens ?? null,
    cachedInputTokens: call.usage.cachedInputTokens ?? null,
    cacheWriteInputTokens: call.usage.cacheWriteInputTokens ?? null,
    outputTokens: call.usage.outputTokens ?? null,
    reasoningTokens: call.usage.reasoningTokens ?? null,
    schemaValidFirstCall: call.usage.schemaValidFirstCall,
    reprompts: {
      repairRetries: call.usage.repairRetries,
      transientRetries: call.usage.transientRetries,
    } as Json,
  };
}

/** A failure still costs money and is still recorded, so the ceiling sees what was spent. */
function failureTelemetry(
  operation: ModelOperation,
  model: string,
  error: unknown,
): SiblingRunTelemetry {
  const known = error as { kind?: string; usage?: { latencyMs?: number } };
  return {
    operation,
    provider: "openai",
    model,
    latencyMs: known.usage?.latencyMs ?? 0,
    promptVersion: "",
    schemaVersion: "",
    errorCode: known.kind ?? "unknown",
  };
}

/* ------------------------------------------------------------------ one sibling */

interface SiblingResult {
  readonly planned: PlannedConcept;
  readonly premise: ConceptPremise;
  readonly call: DesignIntentCallResult | null;
  readonly attempt: number;
}

/**
 * One sibling's DesignIntent call, recorded whatever happens to it.
 *
 * Never throws. A sibling that fails leaves the other two alone — `spec.md §7.10 #5` makes
 * concept-level readiness canonical, and `§I` settles the batch from what succeeded — so a rejected
 * promise here would turn one sibling's provider error into a batch-wide exception.
 */
async function runSibling(
  admin: Admin,
  batchId: string,
  identity: AuthoritativeIdentity,
  planned: PlannedConcept,
  premise: ConceptPremise,
  attempt: number,
  model: string,
): Promise<SiblingResult> {
  await issueSibling(admin, batchId, planned.index);
  try {
    const call = await generateDesignIntent({
      identity,
      assignment: planned.assignment,
      premise,
    });
    await recordSiblingRun(admin, {
      batchId,
      conceptIndex: planned.index,
      attempt,
      success: true,
      run: designIntentTelemetry(call),
    });
    return { planned, premise, call, attempt };
  } catch (error) {
    if (!(error instanceof DesignIntentError)) throw error;
    await recordSiblingRun(admin, {
      batchId,
      conceptIndex: planned.index,
      attempt,
      success: false,
      run: failureTelemetry("design_intent", model, error),
    });
    return { planned, premise, call: null, attempt };
  }
}

/* ------------------------------------------------------------------ persistence */

interface ArtifactInsert {
  readonly sibling: SiblingResult;
  readonly card: ConceptCard;
  readonly deviations: Json;
}

/**
 * One artifact per succeeded sibling, written once and never updated.
 *
 * Every column of `§G.4`'s attribution tuple comes from the thing that actually produced this
 * concept rather than from a constant re-read here: the versions are the ones the call reported,
 * the assignment is the planner's, and the premise is this sibling's own member of the batch's set.
 * A row that named a version its own output did not come from would be worse than no row.
 */
async function persistArtifacts(
  admin: Admin,
  batch: Batch,
  plan: ConceptBatchPlan,
  premiseCall: ConceptPremiseCallResult,
  inserts: readonly ArtifactInsert[],
): Promise<void> {
  if (inserts.length === 0) return;
  const rows = inserts.map(({ sibling, card, deviations }) => {
    const call = sibling.call!;
    return {
      event_id: batch.event_id,
      batch_id: batch.id,
      identity_revision_id: batch.identity_revision_id,
      concept_index: sibling.planned.index,
      round: batch.round,
      planner_version: plan.plannerVersion,
      assignment: sibling.planned.assignment as unknown as Json,
      directive: sibling.planned.directive as unknown as Json,
      token_allotment: {
        allowed: sibling.planned.allowedTokens,
        forbidden: sibling.planned.forbiddenTokens,
      } as unknown as Json,
      design_intent_prompt_version: call.promptVersion,
      design_intent_schema_version: call.schemaVersion,
      design_intent_input_assembly_version: call.inputAssemblyVersion,
      provider: call.usage.provider,
      model: call.usage.model,
      provider_config: designIntentModelConfig(call.usage.model) as unknown as Json,
      provider_request_id: call.usage.providerRequestId ?? null,
      generation_run_id: null,
      design_intent: call.output as unknown as Json,
      concept_premise: sibling.premise as unknown as Json,
      concept_premise_prompt_version: premiseCall.promptVersion,
      concept_premise_schema_version: premiseCall.schemaVersion,
      concept_premise_input_assembly_version: premiseCall.inputAssemblyVersion,
      presentation: { name: card.name, description: card.description } as unknown as Json,
      card_deviations: deviations,
    };
  });
  const { error } = await admin.from("design_intent_artifacts").insert(rows);
  if (error) throw error;
}

/* ------------------------------------------------------------------ the batch */

/**
 * Generate one batch of three concepts for an event, or observe the one already in flight.
 *
 * Deterministic in everything but the two model calls: the same identity revision plans the same
 * three assignments, and the premise set is bound to them by index.
 */
export async function runConceptBatch(
  admin: Admin,
  request: RunConceptBatchRequest,
): Promise<ConceptBatchOutcome> {
  const { eventId, userId } = request;
  const env = openAiEnv();
  const model = env.OPENAI_MODEL;

  const revision = await readAuthoritativeIdentity(admin, eventId);
  if (!revision) return { state: "refused", reason: "not_authoritative" };

  const planned = await planConceptBatchForEvent(admin, {
    eventId,
    userId,
    identity: revision.identity,
    identityRevisionId: revision.id,
    newRound: request.newRound,
  });
  if (planned.outcome === "refused") return { state: "refused", reason: planned.reason };
  if (planned.outcome === "observed") return { state: "observed", batch: planned.batch };

  const { batch, plan } = planned;
  await startBatch(admin, batch.id);

  // Step 3 — the one premise call. Its failure is the batch's failure: three concepts from a set
  // this code has just proved unusable is the known-defective output, and reverting to
  // premise-free calls would be that reversion made invisible
  // (`src/lib/ai/concept-premise/policy.ts`).
  let premiseCall: ConceptPremiseCallResult;
  try {
    premiseCall = await generateConceptPremiseSet({ identity: revision.identity });
    await recordBatchCallRun(admin, {
      batchId: batch.id,
      operation: PREMISE_OPERATION,
      attempt: FIRST_ATTEMPT,
      success: true,
      run: premiseTelemetry(premiseCall),
    });
  } catch (error) {
    if (!(error instanceof ConceptPremiseError)) throw error;
    await recordBatchCallRun(admin, {
      batchId: batch.id,
      operation: PREMISE_OPERATION,
      attempt: FIRST_ATTEMPT,
      success: false,
      // The versions are recorded even on the failure path: a paid attempt whose contract nobody
      // can name is a spend record that cannot be read later.
      run: {
        ...failureTelemetry(PREMISE_OPERATION, model, error),
        promptVersion: CONCEPT_PREMISE_PROMPT_VERSION,
        schemaVersion: CONCEPT_PREMISE_SCHEMA_VERSION,
        inputAssemblyVersion: CONCEPT_PREMISE_INPUT_ASSEMBLY_VERSION,
      },
    });
    await settleBatch(admin, batch.id);
    return {
      state: "premise_unusable",
      batch,
      detail: error.message,
    };
  }

  // Steps 4 and 5 — bind by index, then run the three together. `Promise.all` is safe because
  // `runSibling` never rejects for a sibling-level failure.
  const siblings = await Promise.all(
    plan.siblings.map((concept) =>
      runSibling(
        admin,
        batch.id,
        revision.identity,
        concept,
        premiseCall.premiseSet.premises[concept.index],
        FIRST_ATTEMPT,
        model,
      ),
    ),
  );

  // Step 6 — the deterministic set review, over what actually succeeded. Convergence in the design
  // fields is reported here and never repaired (`spec.md §32 #21b`); the cards are resolved.
  const succeeded = siblings.filter((sibling) => sibling.call !== null);
  const review = reviewConceptSet({
    identity: revision.identity as EventIdentity,
    concepts: succeeded.map<ReviewedConcept>((sibling) => ({
      index: sibling.planned.index,
      designIntent: sibling.call!.output,
      presentation: sibling.call!.presentation.ok ? sibling.call!.presentation.value : null,
      premise: sibling.premise,
    })),
  });

  // Step 7 — persist, with each concept's own premise and whatever the review changed about its
  // card.
  const byIndex = new Map(succeeded.map((sibling) => [sibling.planned.index, sibling]));
  await persistArtifacts(
    admin,
    batch,
    plan,
    premiseCall,
    review.cards.flatMap((card) => {
      const sibling = byIndex.get(card.index);
      if (!sibling) return [];
      const deviations = review.deviations.filter((entry) =>
        entry.path?.startsWith(`concepts.${card.index}.`),
      );
      return [{ sibling, card, deviations: deviations as unknown as Json }];
    }),
  );

  const status = await settleBatch(admin, batch.id);

  if (succeeded.length === 0) return { state: "failed", batch, status };

  return {
    state: "generated",
    batch,
    cards: review.cards,
    conceptCount: succeeded.length,
    status,
    signals: review.signals,
  };
}
