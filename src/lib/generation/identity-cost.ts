import "server-only";

import {
  MAX_PROVIDER_ATTEMPTS_PER_CALL,
  type EventIdentityUsage,
  type ProviderResponseUsage,
} from "@/lib/ai/openai/event-identity";

/**
 * What one EventIdentity call may have cost, and what one may cost at worst.
 *
 * `docs/phase-4b-plan.md §A.5.1`. Four things about the provider boundary make the naive version
 * of this wrong in the direction of spending money:
 *
 *   1. one logical call may make several provider attempts, because transient failures are
 *      retried inside it;
 *   2. it may produce two billable responses, when the first fails validation and the repair
 *      succeeds;
 *   3. a timeout or connection loss means no response reached us, which is **not** the same as
 *      the provider having done no billable work;
 *   4. pricing is not linear across a call — the long-context tier applies per request, so one
 *      attempt can cross the threshold while another does not.
 *
 * So: price each observed response at its own tier, charge the per-attempt maximum for what we
 * could not observe, and never claim an exact number where only an upper bound is known.
 */

/* ------------------------------------------------------------------ verified cost profiles */

/**
 * Prices are per **1M tokens**, in USD.
 *
 * `cacheWriteInput` is a real third class, not a synonym for either of the others: GPT-5.6 bills
 * cache writes at a premium over uncached input while cache reads are heavily discounted.
 */
export interface TokenPrices {
  input: number;
  cachedInput: number;
  cacheWriteInput: number;
  output: number;
}

/**
 * A verified cost bound for one exact model id.
 *
 * "Verified" is a property of this record, not of a number appearing in an environment variable:
 * it means someone read the provider's published limits and prices for this exact model and
 * recorded where and when. A bare number in the environment cannot establish that, which is why
 * an override alone never satisfies the production contract below.
 */
export interface ModelCostProfile {
  model: string;
  /** Bumped whenever any number here changes, so persisted provenance stays meaningful. */
  profileVersion: string;
  source: string;
  retrieved: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
  /** Above this many input tokens, the whole request is billed at `longContext` rates. */
  longContextThresholdTokens: number;
  standard: TokenPrices;
  longContext: TokenPrices;
  /**
   * The conservative upper bound on what ONE provider attempt can bill, in USD.
   *
   * Derived below from the worst legal request at the worst tier, then rounded up. It is stored
   * rather than recomputed so a pricing edit cannot silently move the reservation without the
   * profile version moving too.
   */
  perAttemptMaxUsd: number;
}

/**
 * Verified 2026-09-16 against the provider's own documentation.
 *
 * Worst case for one attempt, at the long-context tier, with every input token billed as a cache
 * write (the most expensive input class):
 *
 *   input   1,050,000 tokens × $10 / 1M  = $10.50
 *   output    128,000 tokens × $30 / 1M  =  $3.84
 *                                          ------
 *                                          $14.34  → rounded up to $15.00
 *
 * Two things this bound deliberately does **not** cover, because the code never selects them: the
 * Fast Mode tier (2× standard) and the Priority/Batch tiers. A `service_tier` is a request-shaping
 * option, so choosing one would change `modelConfig` — and it would need a new profile, because
 * this number would no longer bound an attempt.
 */
export const GPT_5_6_SOL: ModelCostProfile = {
  model: "gpt-5.6-sol",
  profileVersion: "gpt-5.6-sol@2026-09-16",
  source: "https://developers.openai.com/api/docs/pricing and /api/docs/models/gpt-5.6-sol",
  retrieved: "2026-09-16",
  contextWindowTokens: 1_050_000,
  maxOutputTokens: 128_000,
  longContextThresholdTokens: 272_000,
  standard: { input: 4, cachedInput: 0.4, cacheWriteInput: 5, output: 20 },
  longContext: { input: 8, cachedInput: 0.8, cacheWriteInput: 10, output: 30 },
  perAttemptMaxUsd: 15,
};

export const VERIFIED_COST_PROFILES: readonly ModelCostProfile[] = [GPT_5_6_SOL];

/**
 * The fallback for development and tests, and **only** for those.
 *
 * Labelled rather than quiet: it is not a bound anybody checked, and `requireCostProfile()`
 * refuses it in production. $60 is deliberately larger than any verified profile, so a developer
 * running without configuration is never *under*-reserving.
 */
export const UNVERIFIED_DEV_PROFILE: ModelCostProfile = {
  model: "*",
  profileVersion: "unverified-dev-fallback",
  source: "none — nobody has verified this model's published limits or prices",
  retrieved: "never",
  contextWindowTokens: 0,
  maxOutputTokens: 0,
  longContextThresholdTokens: 0,
  standard: { input: 0, cachedInput: 0, cacheWriteInput: 0, output: 0 },
  longContext: { input: 0, cachedInput: 0, cacheWriteInput: 0, output: 0 },
  perAttemptMaxUsd: 60,
};

export function isVerified(profile: ModelCostProfile): boolean {
  return profile.profileVersion !== UNVERIFIED_DEV_PROFILE.profileVersion;
}

/** Production is anywhere a real host could reach this code. */
export function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

export function findCostProfile(model: string): ModelCostProfile | null {
  return VERIFIED_COST_PROFILES.find((p) => p.model === model) ?? null;
}

/**
 * The cost profile for the configured model, or a refusal.
 *
 * This is the fail-closed half of the contract. A verified bound for the **exact** configured
 * model is required before a production call can be reached, so changing `OPENAI_MODEL` to
 * something nobody has priced refuses at configuration time rather than reserving one model's
 * worst case against another model's bill. It is a configuration check, not an arming ritual:
 * nothing is presented to an operator to approve, and no secret unlocks it — either the profile
 * exists for this model or the call does not happen.
 *
 * Outside production the labelled fallback applies, so tests and local work need no setup.
 */
export function requireCostProfile(model: string): ModelCostProfile {
  const profile = findCostProfile(model);
  if (profile) return profile;
  if (!isProductionRuntime()) return UNVERIFIED_DEV_PROFILE;
  throw new Error(
    `No verified cost profile for model ${JSON.stringify(model)}. Production refuses to reserve ` +
      "spend against an unverified bound: add a ModelCostProfile for this exact model, with the " +
      "provider documentation it came from and the date it was read.",
  );
}

/**
 * Optional per-environment override of the per-attempt maximum.
 *
 * It can only make the bound **more** conservative. A number in an environment variable is not
 * evidence that anyone checked the provider's limits, so it cannot be used to lower a verified
 * profile's bound — that would be exactly the "a number appeared, therefore it is verified"
 * shortcut the contract exists to refuse.
 */
export function providerAttemptMaxUsd(model: string): number {
  const profile = requireCostProfile(model);
  const raw = process.env.IDENTITY_PROVIDER_ATTEMPT_MAX_USD;
  if (raw === undefined || raw.trim() === "") return profile.perAttemptMaxUsd;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("IDENTITY_PROVIDER_ATTEMPT_MAX_USD must be a positive number");
  }
  return Math.max(parsed, profile.perAttemptMaxUsd);
}

/**
 * The worst a single logical call can cost, which is what a claim reserves against the ceiling.
 *
 * Pinned to `MAX_PROVIDER_ATTEMPTS_PER_CALL` rather than to a literal, so raising
 * `MAX_TRANSIENT_RETRIES` raises the reservation instead of quietly raising real worst-case spend
 * past it. One successful response would be the wrong unit: a claim may cost every attempt the
 * retry policy permits.
 */
export function logicalCallMaxUsd(model: string): number {
  return providerAttemptMaxUsd(model) * MAX_PROVIDER_ATTEMPTS_PER_CALL;
}

/* ------------------------------------------------------------------ estimating one call */

export type CostRelevantUsage = Pick<
  EventIdentityUsage,
  "responses" | "providerResponses" | "providerAttempts" | "unknownUsageAttempts"
>;

export interface CostEstimate {
  /** USD. An upper bound whenever `exact` is false. */
  usd: number;
  /**
   * True only when every observed response was priced from a verified profile at its own tier,
   * with every billable token class present, and no attempt's usage was unknown.
   */
  exact: boolean;
  /** Attempts charged at the per-attempt maximum because they could not be priced. */
  unpricedAttempts: number;
}

/**
 * Whether **every** billable token class needed to price this response is present.
 *
 * All four, not just input and output. If `input_tokens_details` is missing — a gateway, a proxy,
 * an older API version — the cache classes read as zero, every input token is billed as uncached,
 * and a response that was in fact 900k cache-write tokens at the long-context tier is recorded 20%
 * cheap *and labelled exact*. That is the optimistic fallback §A.5.1 says does not exist.
 */
function priceable(usage: ProviderResponseUsage): boolean {
  return (
    typeof usage.inputTokens === "number" &&
    typeof usage.outputTokens === "number" &&
    typeof usage.cachedInputTokens === "number" &&
    typeof usage.cacheWriteInputTokens === "number"
  );
}

/**
 * One response, at its own tier.
 *
 * The threshold is on input tokens and applies to the **whole request**, which is why this cannot
 * be done on an aggregate: a repair attempt may cross it while the first attempt did not.
 */
function priceResponse(profile: ModelCostProfile, usage: ProviderResponseUsage): number {
  const input = usage.inputTokens ?? 0;
  const prices =
    input > profile.longContextThresholdTokens ? profile.longContext : profile.standard;
  const cached = usage.cachedInputTokens ?? 0;
  const cacheWrite = usage.cacheWriteInputTokens ?? 0;
  // Cache reads and cache writes are both subsets of the reported input; what is left is ordinary
  // uncached input. Clamped, because a provider that reports overlapping subsets must not produce
  // a negative charge.
  const uncached = Math.max(input - cached - cacheWrite, 0);
  // `outputTokens` already includes reasoning. Adding `reasoningTokens` would bill it twice.
  const output = usage.outputTokens ?? 0;
  return (
    (uncached * prices.input +
      cached * prices.cachedInput +
      cacheWrite * prices.cacheWriteInput +
      output * prices.output) /
    1_000_000
  );
}

/**
 * What this invocation may have cost.
 *
 * Each observed response is priced at its own tier from the verified profile. Everything else —
 * attempts that threw, responses missing a token class, and every attempt when the profile is the
 * unverified fallback — is charged the per-attempt maximum, **once per attempt**.
 *
 * **Total by construction.** It takes an already-resolved profile rather than a model id, because
 * it runs *after* the provider has been paid: resolving there could throw between the response and
 * the capture, losing a paid response to a configuration mismatch. The mismatch is not
 * hypothetical — the provider answers with a dated snapshot id (`…-2026-08-01`) that no profile
 * matches by exact string. The profile the claim already reserved against is the right one to
 * price with anyway: it is the bound the money was held against.
 */
export function estimateIdentityCallCostUsd(
  profile: ModelCostProfile,
  usage: CostRelevantUsage,
  // Required, not defaulted to `profile.perAttemptMaxUsd`: an environment override can raise the
  // bound, and a caller that forgot the argument would record unpriced attempts *below* what the
  // claim reserved. `IdentityLimits.perAttemptMaxUsd` exists to be passed here.
  attemptMaxUsd: number,
): CostEstimate {
  const attemptMax = attemptMaxUsd;
  const observed = Math.max(usage.providerResponses, 0);
  const unknown = Math.max(usage.unknownUsageAttempts, 0);
  // Attempts are the unit: `providerResponses` and `unknownUsageAttempts` overlap, because a
  // response that arrived without a usage block is in both. Summing those two charges such an
  // attempt twice, and when nothing can be priced that is the entire bill.
  const attempts = Math.max(usage.providerAttempts, observed, unknown, 0);

  // An unverified fallback prices nothing: there are no rates to price with, and pretending
  // otherwise is the optimistic fallback this whole section exists to refuse.
  if (!isVerified(profile)) {
    return { usd: attempts * attemptMax, exact: false, unpricedAttempts: attempts };
  }

  let usd = 0;
  let pricedResponses = 0;
  let unpriceableResponses = 0;
  let clamped = false;
  for (const response of usage.responses) {
    if (priceable(response)) {
      const raw = priceResponse(profile, response);
      // Clamped to what one attempt can legally cost. Not hiding anything — a single attempt
      // cannot exceed this, so a larger number means the provider reported impossible usage. Left
      // unclamped, one bogus report (`input_tokens: 1e12` → ~$8M) lands in `cost_estimate_usd`,
      // is summed into the ceiling's recorded spend, and refuses every host's generation for the
      // rest of the window behind an indistinguishable payload, with no operator lever but
      // editing the row.
      if (raw > attemptMax) {
        clamped = true;
        console.error(
          `identity cost: a response priced at ${raw} exceeds the per-attempt maximum ` +
            `${attemptMax} for ${profile.model}; clamping. That usage is not believable.`,
        );
      }
      usd += Math.min(raw, attemptMax);
      pricedResponses += 1;
    } else {
      // We know a response arrived; we just cannot say what it cost.
      unpriceableResponses += 1;
    }
  }

  // A response the summary claimed but the detail never described. Silence is not evidence of zero.
  unpriceableResponses += Math.max(observed - usage.responses.length, 0);

  // Attempts that threw: every attempt that produced no response at all. Derived by subtraction
  // rather than read from `unknownUsageAttempts`, because that counter *also* includes responses
  // that arrived without usage — which `unpriceableResponses` has already charged. Adding the two
  // would bill such an attempt twice, which is the same overlap that made the unpriced branch
  // exceed the reservation.
  const threwAttempts = Math.max(attempts - observed, 0);
  const unpriced = unpriceableResponses + threwAttempts;

  usd += unpriced * attemptMax;
  return {
    usd,
    // A clamped response was not priced from what the provider said, so the total is a bound.
    exact: unpriced === 0 && pricedResponses === observed && observed > 0 && !clamped,
    unpricedAttempts: unpriced,
  };
}
