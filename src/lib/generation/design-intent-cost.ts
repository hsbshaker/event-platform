import "server-only";

/**
 * What one DesignIntent call may cost, and what one may cost at worst.
 *
 * `docs/phase-4b-plan.md`, Part IV, on the two obligations that come with T21 owning the
 * production call: *"The verified rate table in `identity-cost.ts` is a property of the model and
 * applies to any call on it; `perAttemptMaxUsd` is a property of an attempt shape, and Event
 * Identity's was derived from Event Identity's. T21 derives DesignIntent's own bound from the same
 * verified rates and its own output configuration, records it under its own profile version, and
 * leaves the live path failing closed when the configured model has no verified profile.
 * Inheriting the number, or inventing one, are both refused."*
 *
 * So this module reuses exactly one thing from Event Identity — `VERIFIED_COST_PROFILES` and the
 * fail-closed lookup over them, which are facts about the *model* — and derives everything that is
 * a fact about the *request* from the DesignIntent boundary's own constants.
 *
 * # The derivation
 *
 * **Input.** Every token is bounded before the request exists, because both halves of it are:
 *
 * | part | bound | why it is a bound |
 * | --- | --- | --- |
 * | the instruction file | `INSTRUCTION_BYTES` | a committed file, measured |
 * | the assembled user message | `WORST_USER_MESSAGE_BYTES` | the identity contract's own `max()`s at three UTF-8 bytes per UTF-16 code unit, which is the worst a BMP character can be, plus the assignment's five fixed lines |
 * | the repair pass's extra turns | `REPAIR_OVERHEAD_TOKENS` | the assistant echo is the previous response verbatim, and re-tokenizing an identical string yields an identical count, so `DESIGN_INTENT_MAX_OUTPUT_TOKENS` caps it; the correction turn is capped **at the boundary** by `REPAIR_FEEDBACK_MAX_BYTES` plus its fixed framing |
 * | message framing | `FRAMING_TOKENS` | role markers and separators the provider adds |
 *
 * Bytes are used as the token bound directly. A byte-level BPE tokenizer's base vocabulary is the
 * 256 single bytes, so a string can never produce more tokens than it has UTF-8 bytes; merges only
 * ever reduce the count. It is a loose bound and a true one, which is the right direction here.
 *
 * **Output.** `DESIGN_INTENT_MAX_OUTPUT_TOKENS`, because the request sends it. Reasoning tokens
 * are part of billable output and are inside that cap, so they are priced and not forgotten.
 *
 * **Rates.** The most expensive class the profile prices, on both axes: the long-context table
 * rather than the standard one, and `cacheWriteInput` rather than uncached or cached input. The
 * long-context tier is in fact unreachable for this request — `PER_ATTEMPT_INPUT_TOKEN_BOUND` is
 * an order of magnitude below `longContextThresholdTokens` — and `assertProfileSupportsRequest`
 * refuses a profile where that stops being true, rather than letting a silent tier change land
 * inside a bound that assumed it. Cache **reads** are billed at a tenth of a cache write, so
 * caching can only move real cost further below this bound, never above it.
 *
 * **Attempts.** `MAX_PROVIDER_ATTEMPTS_PER_CALL`, which is the two passes times the three attempts
 * each pass may make. Nothing else can open a pass: an assignment mismatch and a
 * compatibility-only defect both cost zero further model calls by policy, and
 * `design-intent.test.ts` asserts the provider-call counts rather than only the returned status.
 */
import {
  DESIGN_INTENT_MAX_OUTPUT_TOKENS,
  DESIGN_INTENT_SERVICE_TIER,
  MAX_PROVIDER_ATTEMPTS_PER_CALL,
  REPAIR_FEEDBACK_MAX_BYTES,
  REPAIR_TURN_FRAMING_BYTES,
  type DesignIntentUsage,
} from "@/lib/ai/openai/design-intent";
import { EVENT_IDENTITY_SERVICE_TIER } from "@/lib/ai/openai/event-identity";
import { SIBLING_COUNT } from "@/lib/generation/planner";

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
 * `estimateIdentityCallCostUsd` decides whether a response was served on the tier its profile
 * prices by comparing against `EVENT_IDENTITY_SERVICE_TIER`. Reusing that pricing function for
 * DesignIntent is only correct while the two requests pin the same tier; if one moves, this stops
 * compiling and the estimator needs a tier of its own rather than a quietly wrong comparison.
 */
type _TiersAgree = typeof DESIGN_INTENT_SERVICE_TIER extends typeof EVENT_IDENTITY_SERVICE_TIER
  ? true
  : never;
const _tiersAgree: _TiersAgree = true;
void _tiersAgree;

/** Measured from the committed instruction file, and pinned by test against the file itself. */
export const INSTRUCTION_BYTES = 12_000;

/**
 * The worst assembled user message, in UTF-8 bytes.
 *
 * Derived from the identity contract's own maxima rather than guessed; `design-intent-cost.test.ts`
 * rebuilds that worst message from the contract and fails if it grows past this. A field added to
 * the brief therefore moves this number deliberately instead of invalidating the bound quietly.
 */
export const WORST_USER_MESSAGE_BYTES = 30_000;

/**
 * The two turns a repair pass adds, each bounded by something the boundary actually enforces.
 *
 * **The assistant echo** is the previous response resent verbatim. Tokenization is a deterministic
 * function of the string, so re-tokenizing it yields exactly the count the provider produced, which
 * `DESIGN_INTENT_MAX_OUTPUT_TOKENS` capped.
 *
 * **The correction turn** is *not* bounded by that, and an earlier version of this reserve wrongly
 * assumed it was. The validator's issue rendering amplifies: the strict wire projection drops
 * `maxItems`, so a schema-conformant response may carry a very long array, and a per-element issue
 * line costs several times what the element cost in the response. A response at the output ceiling
 * could therefore produce a correction turn larger than the ceiling itself. So the boundary caps it
 * — `REPAIR_FEEDBACK_MAX_BYTES` and `REPAIR_FEEDBACK_MAX_ISSUES`, applied in `repairFeedback()`,
 * which is the single call site — and this reserve is computed **from** that cap rather than
 * asserted beside it. Raise the cap and the bound moves with it.
 */
export const REPAIR_OVERHEAD_TOKENS =
  DESIGN_INTENT_MAX_OUTPUT_TOKENS + REPAIR_FEEDBACK_MAX_BYTES + REPAIR_TURN_FRAMING_BYTES;

/** Role markers and separators the provider adds around four messages. */
export const FRAMING_TOKENS = 1_000;

/** The worst input one provider attempt can carry, in tokens. */
export const PER_ATTEMPT_INPUT_TOKEN_BOUND =
  INSTRUCTION_BYTES + WORST_USER_MESSAGE_BYTES + REPAIR_OVERHEAD_TOKENS + FRAMING_TOKENS;

/** The worst output one provider attempt can produce, in tokens. It is what the request sends. */
export const PER_ATTEMPT_OUTPUT_TOKEN_BOUND = DESIGN_INTENT_MAX_OUTPUT_TOKENS;

/**
 * Bumped whenever any input to the derivation moves: the request shape, the token bounds, the
 * rounding, or the attempt topology. Persisted provenance is meaningless if the label can stay
 * still while the arithmetic underneath it changes.
 *
 * Still `v1`: the correction-turn cap that tightened this bound landed inside the task that first
 * wrote it, before any run recorded the label, so there is nothing under an earlier `v1` to
 * distinguish this from. The first change after a recorded attempt bumps.
 */
export const DESIGN_INTENT_ATTEMPT_PROFILE_VERSION = "design_intent_attempt_v1@2026-09-17";

/**
 * A model whose verified profile cannot honestly bound this request is refused, not approximated.
 *
 * Three ways that can happen, and each of them would silently break the arithmetic above: the
 * request does not fit the context window; the output ceiling exceeds what the model will produce,
 * so the ceiling is not the ceiling; or the input bound crosses the long-context threshold, at
 * which point pricing the whole request at one table stops being conservative in a way anyone
 * checked.
 */
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
      `Cost profile ${profile.profileVersion} cannot bound a DesignIntent attempt: ` +
        `${problems.join("; ")}.`,
    );
  }
}

/** Up to the next half-dollar. A bound with more precision than its inputs is false precision. */
function roundUp(usd: number): number {
  return Math.ceil(usd * 2) / 2;
}

/**
 * The conservative upper bound on what ONE DesignIntent provider attempt can bill, in USD.
 *
 * For `gpt-5.6-sol` this is $2.00:
 *
 *   input    83,500 tokens × $10 / 1M (long-context cache write) = $0.835
 *   output   32,000 tokens × $30 / 1M (long-context output)      = $0.96
 *                                                                 ------
 *                                                                 $1.795 → $2.00
 *
 * Six attempts per logical call puts the logical-call ceiling at $12.00 and a batch of three at
 * $36.00.
 *
 * The input figure is 83,500 rather than the 107,000 an earlier draft reserved, because the
 * correction turn is now capped at the boundary instead of being assumed to be capped by the
 * output ceiling. The bound went **down** because it became provable, which is the only direction
 * a bound should ever move for that reason.
 */
export function designIntentAttemptMaxUsd(model: string, now: Date = new Date()): number {
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

/**
 * The worst one logical `generateDesignIntent` call can cost.
 *
 * Pinned to `MAX_PROVIDER_ATTEMPTS_PER_CALL` rather than to a literal, so raising the transient
 * retry bound raises the reservation instead of quietly raising real worst-case spend past it.
 */
export function designIntentLogicalCallMaxUsd(model: string, now: Date = new Date()): number {
  return designIntentAttemptMaxUsd(model, now) * MAX_PROVIDER_ATTEMPTS_PER_CALL;
}

/**
 * The worst one batch of three concepts can cost.
 *
 * `spec.md §7.7`: a batch is three concepts, and all three are generated. A ceiling that reserved
 * for one call would be wrong by a factor of three at the moment it mattered most.
 */
export function designIntentBatchMaxUsd(model: string, now: Date = new Date()): number {
  return designIntentLogicalCallMaxUsd(model, now) * SIBLING_COUNT;
}

/**
 * What one invocation may have cost, priced from the same rules Event Identity uses.
 *
 * Deliberately not a second implementation. The pricing rules — price each observed response at
 * its own tier, charge the per-attempt maximum for every attempt that cannot be priced, never
 * claim `exact` where only a bound is known — are properties of the provider's billing, not of
 * either call, and a copy of them would be a copy that drifts. What differs between the two calls
 * is the attempt bound, and that is the argument this function forwards.
 */
export function estimateDesignIntentCallCostUsd(
  profile: ModelCostProfile,
  usage: CostRelevantUsage,
  attemptMaxUsd: number,
): CostEstimate {
  return estimateIdentityCallCostUsd(profile, usage, attemptMaxUsd);
}

/** `DesignIntentUsage` is cost-relevant in exactly the shape the estimator reads. */
export type DesignIntentCostRelevantUsage = Pick<
  DesignIntentUsage,
  "responses" | "providerResponses" | "providerAttempts" | "unknownUsageAttempts"
>;
type _UsageIsCostRelevant = DesignIntentCostRelevantUsage extends CostRelevantUsage ? true : never;
const _usageIsCostRelevant: _UsageIsCostRelevant = true;
void _usageIsCostRelevant;
