import "server-only";

import type { CostEstimate, CostRelevantUsage, ModelCostProfile } from "./identity-cost";
import { requireCostProfile } from "./identity-cost";
import { compositionAttemptMaxUsd, estimateCompositionCallCostUsd } from "./composition-cost";
import {
  conceptPremiseAttemptMaxUsd,
  estimateConceptPremiseCallCostUsd,
} from "./concept-premise-cost";
import { designIntentAttemptMaxUsd, estimateDesignIntentCallCostUsd } from "./design-intent-cost";

/**
 * What each batch-side model call cost, priced the way `docs/phase-4b-plan.md §A.5.1` requires.
 *
 * `identity-orchestrator.ts` has done this for the EventIdentity call since Phase 4B: price the
 * call from the profile the spend was reserved against, charge the per-attempt maximum for
 * everything that cannot be priced, and write the number to `generation_runs.cost_estimate_usd`.
 * The three batch-side calls — premise, DesignIntent, Composition — each had an estimator and a
 * derived per-attempt bound, and **none of them was ever called**: `batch.ts` wrote
 * `run.costEstimateUsd ?? null` and no caller supplied one.
 *
 * That is not a reporting nit. `plan_generation_batch` computes recorded spend as
 *
 * ```sql
 * sum(coalesce(r.cost_estimate_usd, p_run_max_usd))
 * ```
 *
 * because §A.5.1 rule 3 says a null counts as the per-run **maximum**, never as zero. So a batch
 * that really spent about forty cents was recorded at seven times the largest logical call any
 * operation can make, and the next batch was refused for the rest of the ceiling window. The
 * conservative default did exactly what it was built to do; what was missing was the pricing step
 * that keeps it from being reached.
 *
 * # Why this module exists rather than a call to the estimators at each site
 *
 * Two properties are easy to get wrong one site at a time, and both cost money:
 *
 *   1. **Each operation is priced against its own per-attempt maximum.** The bounds are not
 *      interchangeable — they are derived from four different request shapes, and `§A.5.1` rule 4
 *      is explicit that `perAttemptMaxUsd` is a property of an attempt *shape*. Pricing a
 *      Composition attempt against EventIdentity's bound would undo the derivation the previous
 *      change in this branch existed to establish. Here the bound is selected by the operation, in
 *      one exhaustive `switch`, so the pairing cannot drift.
 *   2. **The profile and the bounds are resolved before the money is spent.** `requireCostProfile`
 *      throws in production for a model nobody has priced and for a profile past its
 *      `reverifyAfter` day. Resolving at the capture — after the provider has answered — would
 *      mean a configuration error, or a profile going stale between the request and the response,
 *      throws *between the paid response and the row that records it*. `identityLimits` resolves
 *      at claim time for that reason; `batchCostBounds` is resolved once at the top of
 *      `runConceptBatch`, before the batch is even admitted.
 *
 * Nothing here re-implements the pricing rules. `estimateIdentityCallCostUsd` is the one
 * implementation of "price each observed response at its own tier, charge the per-attempt maximum
 * for every attempt that cannot be priced, never claim `exact` where only a bound is known", and
 * the three `estimate*CallCostUsd` wrappers forward to it with their own bound. A second copy of
 * those rules would be a copy that drifts.
 *
 * Acceptance criteria: `spec.md §9.6` (every model call records estimated cost), `§10` (the
 * global/project spend ceiling the number feeds), `§31 — DesignIntent, composition and compiler`.
 * Guardrails `spec.md §32 #41` — a refusal still leaks no counter; this only changes what the
 * server-side record says the call cost.
 */

/**
 * The batch-side operations that bill a provider and therefore have a price.
 *
 * Deliberately narrower than `ModelOperation`. `event_identity` is priced by its own orchestrator
 * against its own bound, and `structured_extraction` has no implementation and so no attempt shape
 * to derive a bound from. Adding a member here without giving it a bound and an estimator fails to
 * compile, which is the point: the defect this module fixes was an operation that shipped with no
 * pricing step and no complaint from anything.
 */
export type PricedBatchOperation = "concept_premise" | "design_intent" | "composition";

/**
 * The profile a batch's spend is priced from, and each operation's own per-attempt maximum.
 *
 * One object rather than three, because all four numbers have to come from one resolution: a batch
 * priced half against one profile version and half against another could not say which bound held
 * its money.
 */
export interface BatchCostBounds {
  /** The resolved cost profile for the **configured** model, not the id the provider answers with. */
  readonly profile: ModelCostProfile;
  /** Carried so a caller can record which rates priced a run, as the identity claim does. */
  readonly costProfileVersion: string;
  /** Per operation, derived from that operation's own request shape. Never shared. */
  readonly perAttemptMaxUsd: Readonly<Record<PricedBatchOperation, number>>;
}

/**
 * Resolve the cost profile and all three per-attempt bounds, up front and fail-closed.
 *
 * Call it **before** the first provider call of a batch. Every one of the three derivations runs
 * `requireCostProfile` and its own `assertProfileSupportsRequest`, so an unpriced model, a stale
 * profile or a request shape the profile cannot bound refuses the batch here — before any money —
 * instead of throwing after a response has been paid for.
 */
export function batchCostBounds(model: string, now: Date = new Date()): BatchCostBounds {
  const profile = requireCostProfile(model, now);
  return {
    profile,
    costProfileVersion: profile.profileVersion,
    perAttemptMaxUsd: {
      concept_premise: conceptPremiseAttemptMaxUsd(model, now),
      design_intent: designIntentAttemptMaxUsd(model, now),
      composition: compositionAttemptMaxUsd(model, now),
    },
  };
}

/**
 * What one batch-side call may have cost, from the usage its boundary reported.
 *
 * The `switch` is exhaustive and the bound is read from the same key, so an operation can only be
 * priced against its own maximum.
 */
export function priceRun(
  bounds: BatchCostBounds,
  operation: PricedBatchOperation,
  usage: CostRelevantUsage,
): CostEstimate {
  const attemptMax = bounds.perAttemptMaxUsd[operation];
  switch (operation) {
    case "concept_premise":
      return estimateConceptPremiseCallCostUsd(bounds.profile, usage, attemptMax);
    case "design_intent":
      return estimateDesignIntentCallCostUsd(bounds.profile, usage, attemptMax);
    case "composition":
      return estimateCompositionCallCostUsd(bounds.profile, usage, attemptMax);
    default: {
      // Unreachable while the union and this switch agree; a new member fails to compile here
      // rather than silently acquiring another operation's bound.
      const unpriced: never = operation;
      throw new Error(`no per-attempt bound is derived for operation ${String(unpriced)}`);
    }
  }
}

/** The shape every one of the three boundaries annotates a thrown error with. */
interface FailedCall {
  readonly usage?: Partial<CostRelevantUsage>;
  readonly rawResponses?: readonly string[];
}

/**
 * What a call that threw may have cost, from whatever the boundary managed to annotate.
 *
 * §A.5.1 rule 2: an attempt that threw before a response reached us may or may not have billed, we
 * cannot know, so it contributes the **per-attempt maximum** and never zero. The derivation is
 * `identity-orchestrator.ts`'s `failureRun`, which is deliberate rather than duplicated thinking:
 *
 *   - attempts come from the boundary's own counter where it reported one, and otherwise from the
 *     evidence in hand — at least the responses already paid for, and at least one attempt, because
 *     an exception with no counters is still a call that was made;
 *   - `providerResponses` and `unknownUsageAttempts` **overlap** (a response that arrived without a
 *     usage block is in both), so the estimator is handed attempts as the unit and derives the rest;
 *   - a response the summary claimed but the detail never described is charged the maximum too.
 */
export function priceFailedRun(
  bounds: BatchCostBounds,
  operation: PricedBatchOperation,
  error: unknown,
): CostEstimate {
  const failed = (error ?? {}) as FailedCall;
  const usage = failed.usage ?? {};
  const evidence = Array.isArray(failed.rawResponses) ? failed.rawResponses : [];
  const attempts = usage.providerAttempts ?? Math.max(evidence.length, 1);
  return priceRun(bounds, operation, {
    responses: usage.responses ?? [],
    providerResponses: usage.providerResponses ?? evidence.length,
    providerAttempts: attempts,
    unknownUsageAttempts: usage.unknownUsageAttempts ?? attempts,
  });
}
