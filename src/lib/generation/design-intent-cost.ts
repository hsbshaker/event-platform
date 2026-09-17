import "server-only";

import {
  DESIGN_INTENT_MAX_OUTPUT_TOKENS,
  DESIGN_INTENT_MAX_PROVIDER_ATTEMPTS_PER_CALL,
  DESIGN_INTENT_MAX_REQUEST_BYTES,
  DESIGN_INTENT_SERVICE_TIER,
} from "@/lib/ai/openai/design-intent";
import {
  isVerified,
  requireCostProfile,
  type ModelCostProfile,
  type TokenPrices,
} from "@/lib/generation/identity-cost";

/**
 * What one **DesignIntent** provider attempt may cost at worst, and why it is not EventIdentity's
 * number.
 *
 * `docs/phase-4b-plan.md`, Part IV, "Two obligations come with that ownership": *"The verified rate
 * table in `identity-cost.ts` is a property of the model and applies to any call on it;
 * `perAttemptMaxUsd` is a property of an attempt shape, and EventIdentity's was derived from
 * EventIdentity's. T21 derives DesignIntent's own bound from the same verified rates and its own
 * output configuration, records it under its own profile version, and leaves the live path failing
 * closed when the configured model has no verified profile. Inheriting the number, or inventing
 * one, are both refused."*
 *
 * So the **rates** are imported and the **shape** is derived here. EventIdentity's $15 bounds the
 * worst *legal request on the model* — a full 1,050,000-token context at the long-context
 * cache-write rate, plus 128,000 output tokens. DesignIntent cannot reach that shape, and the
 * reason is enforced rather than assumed:
 *
 *   1. `DESIGN_INTENT_MAX_REQUEST_BYTES` — the boundary measures the exact bytes it is about to
 *      send, on **every** attempt including the repair, and refuses before spending money if they
 *      exceed the ceiling. A BPE token never encodes fewer than one byte, so the byte ceiling is
 *      also a token ceiling, and it does not depend on a tokenizer we do not ship.
 *   2. `DESIGN_INTENT_MAX_OUTPUT_TOKENS` — sent as `max_output_tokens`, so output is bounded by a
 *      request parameter rather than by the model's own 128,000-token maximum.
 *
 * Both are part of `modelConfig` and therefore of the attempt key: raising either is a different
 * call that would need this profile re-derived, which is why the profile version below names the
 * shape and not only the model.
 */

/**
 * Tokens the API adds for message structure — roles, delimiters, the response-format envelope.
 *
 * Not measured, because it is provider-internal. A flat allowance above any plausible value, added
 * to the byte ceiling so the token bound stays an upper bound rather than an estimate.
 */
export const DESIGN_INTENT_STRUCTURAL_TOKEN_ALLOWANCE = 1_024;

/**
 * The most expensive class an input token can be billed at.
 *
 * Cache **writes** are billed at a premium over uncached input and cache reads at a discount
 * (`TokenPrices`), and we cannot know in advance which class a token lands in — so the bound
 * charges every input token at whichever class is dearest in the table it was read from. Taken as
 * a maximum over the record rather than as the literal `cacheWriteInput`, so a future profile that
 * reorders the classes cannot quietly loosen this.
 */
function worstInputRate(prices: TokenPrices): number {
  return Math.max(prices.input, prices.cachedInput, prices.cacheWriteInput);
}

export interface DesignIntentAttemptBound {
  /** The profile the rates came from. */
  readonly model: string;
  /**
   * The bound's own provenance: the model profile that supplied the rates, and the attempt shape
   * they were applied to. Both move it, because either changes the number.
   */
  readonly boundVersion: string;
  /** Upper bound on input tokens for one attempt, from the enforced byte ceiling. */
  readonly inputTokenCeiling: number;
  /** Upper bound on output tokens for one attempt, from `max_output_tokens`. */
  readonly outputTokenCeiling: number;
  /** Which price row the input ceiling lands in. */
  readonly tier: "standard" | "longContext";
  /** USD, rounded up to the cent. */
  readonly perAttemptMaxUsd: number;
}

/**
 * The derivation, as a pure function of a profile.
 *
 * Exported so a test can run it over every verified profile rather than over the one the
 * environment happens to configure — a second verified model added later gets its bound checked
 * without anyone remembering to.
 */
export function deriveDesignIntentAttemptBound(
  profile: ModelCostProfile,
): DesignIntentAttemptBound {
  const inputTokenCeiling =
    DESIGN_INTENT_MAX_REQUEST_BYTES + DESIGN_INTENT_STRUCTURAL_TOKEN_ALLOWANCE;
  // `max_output_tokens` cannot raise the model's own maximum, so the ceiling is the smaller.
  const outputTokenCeiling = Math.min(DESIGN_INTENT_MAX_OUTPUT_TOKENS, profile.maxOutputTokens);
  const longContext = inputTokenCeiling > profile.longContextThresholdTokens;
  const prices = longContext ? profile.longContext : profile.standard;

  const usd =
    (inputTokenCeiling * worstInputRate(prices) + outputTokenCeiling * prices.output) / 1_000_000;

  return {
    model: profile.model,
    boundVersion: `${profile.profileVersion}+${DESIGN_INTENT_ATTEMPT_SHAPE_VERSION}`,
    inputTokenCeiling,
    outputTokenCeiling,
    tier: longContext ? "longContext" : "standard",
    // Up to the cent, never down: a bound that rounds down is not a bound.
    perAttemptMaxUsd: Math.ceil(usd * 100) / 100,
  };
}

/**
 * The attempt shape's own version, distinct from the model profile's.
 *
 * It names the two enforced ceilings and the pinned tier, because those are what turn the model's
 * rate table into this call's number. Bump it when any of the three moves.
 */
export const DESIGN_INTENT_ATTEMPT_SHAPE_VERSION = "design_intent_attempt_v1";

/**
 * The bound for the configured model, or a refusal.
 *
 * `requireCostProfile` is the fail-closed half and is not re-implemented here: production refuses a
 * model with no verified profile and refuses a verified profile that is past its re-verification
 * date. Outside production its labelled dev fallback applies, and this returns that fallback's
 * deliberately oversized per-attempt maximum rather than pricing against rates of zero — the same
 * rule `estimateIdentityCallCostUsd` follows, for the same reason: an unverified profile prices
 * nothing, and pretending otherwise is the optimistic fallback the whole section refuses.
 */
export function designIntentAttemptBound(
  model: string,
  now: Date = new Date(),
): DesignIntentAttemptBound {
  const profile = requireCostProfile(model, now);
  if (!isVerified(profile)) {
    return {
      model: profile.model,
      boundVersion: `${profile.profileVersion}+${DESIGN_INTENT_ATTEMPT_SHAPE_VERSION}`,
      inputTokenCeiling: DESIGN_INTENT_MAX_REQUEST_BYTES + DESIGN_INTENT_STRUCTURAL_TOKEN_ALLOWANCE,
      outputTokenCeiling: DESIGN_INTENT_MAX_OUTPUT_TOKENS,
      tier: "standard",
      perAttemptMaxUsd: profile.perAttemptMaxUsd,
    };
  }
  const derived = deriveDesignIntentAttemptBound(profile);
  // Never looser than the model's own worst-attempt bound. The shape can only make an attempt
  // cheaper than the worst legal request on this model, so a derivation that came out larger would
  // be an arithmetic error, and the safe reading of an arithmetic error is the tighter number.
  return {
    ...derived,
    perAttemptMaxUsd: Math.min(derived.perAttemptMaxUsd, profile.perAttemptMaxUsd),
  };
}

/**
 * Optional per-environment override of the per-attempt maximum, and it can only tighten nothing —
 * only **raise** the reservation.
 *
 * A number in an environment variable is not evidence that anyone checked the provider's limits, so
 * it cannot be used to lower a derived bound. Identical in shape and reasoning to
 * `providerAttemptMaxUsd`, under its own variable so the two calls cannot be moved together by
 * accident.
 */
export function designIntentAttemptMaxUsd(model: string, now: Date = new Date()): number {
  const bound = designIntentAttemptBound(model, now).perAttemptMaxUsd;
  const raw = process.env.DESIGN_INTENT_PROVIDER_ATTEMPT_MAX_USD;
  if (raw === undefined || raw.trim() === "") return bound;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("DESIGN_INTENT_PROVIDER_ATTEMPT_MAX_USD must be a positive number");
  }
  return Math.max(parsed, bound);
}

/**
 * The worst one logical `generateDesignIntent` call can cost.
 *
 * Pinned to `DESIGN_INTENT_MAX_PROVIDER_ATTEMPTS_PER_CALL` rather than to a literal, so raising the
 * transient-retry bound raises the reservation instead of quietly raising real worst-case spend
 * past it. One successful response would be the wrong unit: a call may cost every attempt the
 * retry policy permits.
 */
export function designIntentLogicalCallMaxUsd(model: string, now: Date = new Date()): number {
  return designIntentAttemptMaxUsd(model, now) * DESIGN_INTENT_MAX_PROVIDER_ATTEMPTS_PER_CALL;
}

/** One batch is three blind parallel calls (`spec.md §7.7`, `§7.10 #3`). */
export const DESIGN_INTENT_CALLS_PER_BATCH = 3;

export function designIntentBatchMaxUsd(model: string, now: Date = new Date()): number {
  return designIntentLogicalCallMaxUsd(model, now) * DESIGN_INTENT_CALLS_PER_BATCH;
}

/**
 * The tier the bound was derived at, re-exported beside it.
 *
 * The rates priced here are the profile's standard/long-context table, which describes the
 * `default` service tier. The boundary pins that tier on every request; if it ever stopped, this
 * number would stop describing the call (`identity-cost.ts`, `GPT_5_6_SOL`: Fast Mode is 2×).
 */
export const DESIGN_INTENT_BOUND_SERVICE_TIER = DESIGN_INTENT_SERVICE_TIER;
