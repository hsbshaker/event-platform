import "server-only";

/**
 * What one ConceptPremise call may cost, and what one may cost at worst.
 *
 * The remediation adds a model call per batch, so it adds a bound for it. The obligation is the one
 * `docs/phase-4b-plan.md` Part IV put on T21 and it transfers unchanged: *"the verified rate table
 * in `identity-cost.ts` is a property of the model and applies to any call on it; `perAttemptMaxUsd`
 * is a property of an attempt shape."* So this reuses exactly one thing — `VERIFIED_COST_PROFILES`
 * and the fail-closed lookup over them, which are facts about the *model* — and derives everything
 * that is a fact about the *request* from this boundary's own constants. Inheriting DesignIntent's
 * number, or inventing one, are both refused.
 *
 * # The derivation
 *
 * **Input.** The instruction file is a committed file, measured and pinned by test. The assembled
 * user message is the **same brief** the DesignIntent call renders, through the same
 * `briefLines()`, with no assignment block — so its worst case is bounded by the DesignIntent
 * bound and is reused rather than re-derived, which also means a field added to the identity
 * contract moves both bounds at once instead of one of them. The repair pass adds the assistant
 * echo, capped by the output ceiling, plus a correction turn capped at the boundary.
 *
 * **Output.** `CONCEPT_PREMISE_MAX_OUTPUT_TOKENS`, because the request sends it. Reasoning tokens
 * are part of billable output and are inside that cap, so they are priced and not forgotten.
 *
 * **Rates.** The most expensive class the profile prices, on both axes, exactly as the other two
 * bounds do.
 *
 * **Attempts.** `MAX_PROVIDER_ATTEMPTS_PER_CALL` — two passes times three attempts each. Nothing
 * else can open a pass: `src/lib/ai/concept-premise/policy.ts` gives every class the same single
 * pass, so there is no class-dependent branch that could add one.
 *
 * # What this changes about a batch
 *
 * A batch was three DesignIntent calls. It is now one premise call plus three DesignIntent calls,
 * and `conceptBatchMaxUsd` is the honest sum. `docs/designintent-sibling-convergence.md §7` states
 * the trade rather than hiding it: +1 model call per batch, and one short serial call ahead of
 * three parallel ones.
 */
import {
  CONCEPT_PREMISE_MAX_OUTPUT_TOKENS,
  CONCEPT_PREMISE_SERVICE_TIER,
  MAX_PROVIDER_ATTEMPTS_PER_CALL,
  REPAIR_FEEDBACK_MAX_BYTES,
  REPAIR_TURN_FRAMING_BYTES,
  type ConceptPremiseUsage,
} from "@/lib/ai/openai/concept-premise";
import { EVENT_IDENTITY_SERVICE_TIER } from "@/lib/ai/openai/event-identity";

import {
  designIntentBatchMaxUsd,
  WORST_USER_MESSAGE_BYTES as DESIGN_INTENT_WORST_USER_MESSAGE_BYTES,
} from "./design-intent-cost";
import {
  estimateIdentityCallCostUsd,
  isVerified,
  requireCostProfile,
  type CostEstimate,
  type CostRelevantUsage,
  type ModelCostProfile,
} from "./identity-cost";

/**
 * The tiers have to agree, and this is checked at compile time rather than remembered.
 *
 * Same guard the DesignIntent bound carries: `estimateIdentityCallCostUsd` decides whether a
 * response was served on the tier its profile prices by comparing against
 * `EVENT_IDENTITY_SERVICE_TIER`, so reusing it here is only correct while the two requests pin the
 * same tier. If one moves, this stops compiling rather than becoming a quietly wrong comparison.
 */
type _TiersAgree = typeof CONCEPT_PREMISE_SERVICE_TIER extends typeof EVENT_IDENTITY_SERVICE_TIER
  ? true
  : never;
const _tiersAgree: _TiersAgree = true;
void _tiersAgree;

/**
 * Measured from the committed instruction file, and pinned by test against the file itself.
 *
 * `concept-premise.system.md` is about 11,500 bytes. 16,000 leaves headroom for the ordinary
 * growth a prompt gets without being so loose that the file could double inside it —
 * `concept-premise-cost.test.ts` fails on both sides, because a stale allowance is not a safe one.
 */
export const INSTRUCTION_BYTES = 16_000;

/**
 * The worst assembled user message, in UTF-8 bytes.
 *
 * Reused from the DesignIntent bound rather than re-derived, because it is literally the same
 * rendering of the same object: `assembleConceptPremiseUserMessage` calls the same `briefLines()`
 * and omits the assignment block, so its worst case is strictly smaller. Reusing the number keeps
 * the two bounds from drifting when a field is added to the identity contract, and errs upward,
 * which is the right direction for a bound.
 */
export const WORST_USER_MESSAGE_BYTES = DESIGN_INTENT_WORST_USER_MESSAGE_BYTES;

/**
 * The two turns a repair pass adds, each bounded by something the boundary actually enforces.
 *
 * The assistant echo is the previous response resent verbatim, so re-tokenizing it yields the count
 * `CONCEPT_PREMISE_MAX_OUTPUT_TOKENS` already capped. The correction turn is capped in
 * `repairFeedback()`, which is its single call site, and this reserve is computed **from** that cap
 * rather than asserted beside it.
 */
export const REPAIR_OVERHEAD_TOKENS =
  CONCEPT_PREMISE_MAX_OUTPUT_TOKENS + REPAIR_FEEDBACK_MAX_BYTES + REPAIR_TURN_FRAMING_BYTES;

/** Role markers and separators the provider adds around four messages. */
export const FRAMING_TOKENS = 1_000;

/**
 * The worst input one provider attempt can carry, in tokens.
 *
 * Bytes are used as the token bound directly. A byte-level BPE tokenizer's base vocabulary is the
 * 256 single bytes, so a string can never produce more tokens than it has UTF-8 bytes; merges only
 * ever reduce the count. A loose bound and a true one.
 */
export const PER_ATTEMPT_INPUT_TOKEN_BOUND =
  INSTRUCTION_BYTES + WORST_USER_MESSAGE_BYTES + REPAIR_OVERHEAD_TOKENS + FRAMING_TOKENS;

/** The worst output one provider attempt can produce. It is what the request sends. */
export const PER_ATTEMPT_OUTPUT_TOKEN_BOUND = CONCEPT_PREMISE_MAX_OUTPUT_TOKENS;

/**
 * Bumped whenever any input to the derivation moves: the request shape, the token bounds, the
 * rounding, or the attempt topology.
 */
export const CONCEPT_PREMISE_ATTEMPT_PROFILE_VERSION = "concept_premise_attempt_v1@2026-09-18";

/** A model whose verified profile cannot honestly bound this request is refused, not approximated. */
export function assertProfileSupportsRequest(profile: ModelCostProfile): void {
  if (!isVerified(profile)) return;
  const problems: string[] = [];
  if (
    PER_ATTEMPT_INPUT_TOKEN_BOUND + PER_ATTEMPT_OUTPUT_TOKEN_BOUND >
    profile.contextWindowTokens
  ) {
    problems.push(
      `the worst request (${PER_ATTEMPT_INPUT_TOKEN_BOUND} in + ${PER_ATTEMPT_OUTPUT_TOKEN_BOUND} ` +
        `out) does not fit the ${profile.contextWindowTokens}-token context window`,
    );
  }
  if (PER_ATTEMPT_OUTPUT_TOKEN_BOUND > profile.maxOutputTokens) {
    problems.push(
      `the request asks for up to ${PER_ATTEMPT_OUTPUT_TOKEN_BOUND} output tokens, past this ` +
        `model's ${profile.maxOutputTokens}`,
    );
  }
  if (PER_ATTEMPT_INPUT_TOKEN_BOUND > profile.longContextThresholdTokens) {
    problems.push(
      `the worst input (${PER_ATTEMPT_INPUT_TOKEN_BOUND}) reaches the long-context threshold ` +
        `(${profile.longContextThresholdTokens}); re-derive the bound before using this model`,
    );
  }
  if (problems.length > 0) {
    throw new Error(
      `Cost profile ${profile.profileVersion} cannot bound a ConceptPremise attempt: ` +
        `${problems.join("; ")}.`,
    );
  }
}

/** Up to the next half-dollar. A bound with more precision than its inputs is false precision. */
function roundUp(usd: number): number {
  return Math.ceil(usd * 2) / 2;
}

/** The conservative upper bound on what ONE ConceptPremise provider attempt can bill, in USD. */
export function conceptPremiseAttemptMaxUsd(model: string, now: Date = new Date()): number {
  const profile = requireCostProfile(model, now);
  assertProfileSupportsRequest(profile);
  // The labelled development fallback prices nothing, so its own deliberately large per-attempt
  // number stands. Production never reaches this branch: `requireCostProfile` throws there.
  if (!isVerified(profile)) return profile.perAttemptMaxUsd;
  const prices = profile.longContext;
  return roundUp(
    (PER_ATTEMPT_INPUT_TOKEN_BOUND * prices.cacheWriteInput +
      PER_ATTEMPT_OUTPUT_TOKEN_BOUND * prices.output) /
      1_000_000,
  );
}

/** The worst one logical `generateConceptPremiseSet` call can cost. */
export function conceptPremiseLogicalCallMaxUsd(model: string, now: Date = new Date()): number {
  return conceptPremiseAttemptMaxUsd(model, now) * MAX_PROVIDER_ATTEMPTS_PER_CALL;
}

/**
 * The worst one concept batch can cost, end to end: one premise call plus three DesignIntent calls.
 *
 * This is the number a ceiling should reserve against once the premise stage is on the live path.
 * It exists here rather than as a comment because the remediation's cost impact has to be a value
 * something can read, not a claim in a document.
 */
export function conceptBatchMaxUsd(model: string, now: Date = new Date()): number {
  return conceptPremiseLogicalCallMaxUsd(model, now) + designIntentBatchMaxUsd(model, now);
}

/** What one invocation may have cost, priced from the same rules the other two calls use. */
export function estimateConceptPremiseCallCostUsd(
  profile: ModelCostProfile,
  usage: CostRelevantUsage,
  attemptMaxUsd: number,
): CostEstimate {
  return estimateIdentityCallCostUsd(profile, usage, attemptMaxUsd);
}

/** `ConceptPremiseUsage` is cost-relevant in exactly the shape the estimator reads. */
export type ConceptPremiseCostRelevantUsage = Pick<
  ConceptPremiseUsage,
  "responses" | "providerResponses" | "providerAttempts" | "unknownUsageAttempts"
>;
type _UsageIsCostRelevant = ConceptPremiseCostRelevantUsage extends CostRelevantUsage
  ? true
  : never;
const _usageIsCostRelevant: _UsageIsCostRelevant = true;
void _usageIsCostRelevant;
