import "server-only";

import {
  MAX_PROVIDER_ATTEMPTS_PER_CALL,
  type EventIdentityUsage,
} from "@/lib/ai/openai/event-identity";

/**
 * What one EventIdentity call may have cost, and what one may cost at worst.
 *
 * `docs/phase-4b-plan.md §A.5.1`. The spend ceiling is only as good as this number, and the
 * existing provider boundary makes four things easy to get wrong in the expensive direction:
 *
 *   1. one logical call may make several provider attempts, because transient failures are
 *      retried inside it;
 *   2. it may produce two billable responses, when the first fails validation and the repair
 *      succeeds;
 *   3. it used to report usage from the final accepted response only, so a rejected first
 *      response's tokens were simply not counted (T9A fixed that at the boundary);
 *   4. a timeout or connection loss means no response reached us — which is **not** the same as
 *      the provider having done no billable work.
 *
 * So: aggregate what we observed, charge the per-attempt maximum for what we could not observe,
 * and never claim an exact number where only an upper bound is known.
 */

/**
 * A conservative upper bound, in USD, on what **one** provider attempt of the identity call can
 * bill: the configured model's maximum billable input + output + reasoning usage at its published
 * prices.
 *
 * **This value is an explicitly unverified placeholder.** It must be set from the provider's
 * current published limits and prices for `OPENAI_MODEL` before deployment, and this environment
 * has no access to that documentation — so it is carried as a named, overridable constant with
 * the verification recorded as owed, rather than guessed silently into the middle of a
 * money-handling calculation.
 *
 * It is deliberately *not* derived from any application-level output-token ceiling, because
 * `generateEventIdentity` enforces none. Adding a tight output limit to make the accounting
 * tidier would be a creative decision disguised as an accounting one (`CLAUDE.md §2`): it could
 * truncate exactly the interpretive richness EventIdentity exists to produce. A very conservative
 * maximum is the right trade for alpha; a maximum that pretends to precision we do not have is
 * not.
 *
 * Override per environment with `IDENTITY_PROVIDER_ATTEMPT_MAX_USD`.
 */
export const DEFAULT_PROVIDER_ATTEMPT_MAX_USD = 5;

/** True while the bound above is still the unverified default. Surfaced, never silently assumed. */
export const PROVIDER_ATTEMPT_MAX_IS_VERIFIED = false;

export function providerAttemptMaxUsd(): number {
  const raw = process.env.IDENTITY_PROVIDER_ATTEMPT_MAX_USD;
  if (raw === undefined || raw.trim() === "") return DEFAULT_PROVIDER_ATTEMPT_MAX_USD;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      "IDENTITY_PROVIDER_ATTEMPT_MAX_USD must be a positive number; " +
        "refusing to price provider attempts from an unusable bound.",
    );
  }
  return parsed;
}

/**
 * The worst a single logical call can cost, which is what a claim reserves against the ceiling.
 *
 * Defining this as one successful response would make the ceiling's inequality false: a claim may
 * legitimately cost every attempt the retry policy permits. It is pinned to
 * `MAX_PROVIDER_ATTEMPTS_PER_CALL` rather than to a literal, so raising `MAX_TRANSIENT_RETRIES`
 * raises the reservation instead of quietly raising real worst-case spend past it.
 */
export function logicalCallMaxUsd(): number {
  return providerAttemptMaxUsd() * MAX_PROVIDER_ATTEMPTS_PER_CALL;
}

/**
 * Published per-million-token prices for the configured model, when they are configured.
 *
 * Absent by default for the same reason as the bound above: the numbers are not verifiable here.
 * When absent, observed responses cannot be priced and every attempt falls back to the per-attempt
 * maximum — fail closed financially, as `§A.5.1` rule 3 requires.
 */
export interface TokenPricesUsdPerMTok {
  input: number;
  cachedInput: number;
  output: number;
}

export function tokenPrices(): TokenPricesUsdPerMTok | null {
  const raw = process.env.IDENTITY_TOKEN_PRICES_USD_PER_MTOK;
  if (!raw || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "IDENTITY_TOKEN_PRICES_USD_PER_MTOK must be JSON: {input, cachedInput, output}",
    );
  }
  const p = parsed as Partial<TokenPricesUsdPerMTok>;
  const ok = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (!ok(p.input) || !ok(p.cachedInput) || !ok(p.output)) {
    throw new Error("IDENTITY_TOKEN_PRICES_USD_PER_MTOK needs numeric input, cachedInput, output");
  }
  return { input: p.input!, cachedInput: p.cachedInput!, output: p.output! };
}

/** The usage fields this estimate reads. A subset, so tests and callers need not build a whole call result. */
export type CostRelevantUsage = Pick<
  EventIdentityUsage,
  | "inputTokens"
  | "cachedInputTokens"
  | "outputTokens"
  | "reasoningTokens"
  | "providerResponses"
  | "providerAttempts"
  | "unknownUsageAttempts"
>;

export interface CostEstimate {
  /** USD. An upper bound whenever `exact` is false. */
  usd: number;
  /** True only when every attempt was observed *and* priced from configured prices. */
  exact: boolean;
  /** Attempts charged at the per-attempt maximum because their usage was unknown. */
  unpricedAttempts: number;
}

/**
 * What this invocation may have cost.
 *
 * Observed responses are priced from their aggregated tokens when prices are configured.
 * Everything else — attempts that threw, responses with no usage block, and every attempt when
 * prices are unconfigured — is charged the per-attempt maximum, **once per attempt**. With the
 * per-attempt maximum set correctly the result stays within `logicalCallMaxUsd()`, since a call
 * cannot make more attempts than the policy allows; the estimate is deliberately **not** clamped
 * to it, because a result above the reservation would mean the maximum is wrong and hiding that
 * would defeat the ceiling.
 *
 * Reasoning tokens are billed as output by every provider we use; they are counted here for the
 * same reason, and only ever as counts.
 */
export function estimateIdentityCallCostUsd(usage: CostRelevantUsage): CostEstimate {
  const attemptMax = providerAttemptMaxUsd();
  const prices = tokenPrices();
  const observed = Math.max(usage.providerResponses, 0);
  const unknown = Math.max(usage.unknownUsageAttempts, 0);
  // Attempts are the unit, because `providerResponses` and `unknownUsageAttempts` overlap: a
  // response that arrived without a usage block is counted in both. Summing those two charges
  // such an attempt twice, and with prices unconfigured — the shipped default — that is the
  // entire bill, which can then exceed the reservation the ceiling already made for this claim.
  // `unknown` is in the max as a guard, not because the boundary can disagree: a caller that
  // reported unknown attempts and no attempt count must not be billed zero by a money function.
  const attempts = Math.max(usage.providerAttempts, observed, unknown, 0);

  // Every observed response must have reported tokens, or we cannot price any of them honestly:
  // the aggregate cannot tell us which response was silent.
  const anyTokenFieldMissing = usage.inputTokens === undefined || usage.outputTokens === undefined;
  const pricedObserved = prices !== null && observed > 0 && !anyTokenFieldMissing;

  if (!pricedObserved) {
    return { usd: attempts * attemptMax, exact: false, unpricedAttempts: attempts };
  }

  const cached = usage.cachedInputTokens ?? 0;
  const uncachedInput = Math.max((usage.inputTokens ?? 0) - cached, 0);
  const output = (usage.outputTokens ?? 0) + (usage.reasoningTokens ?? 0);
  const observedUsd =
    (uncachedInput * prices.input + cached * prices.cachedInput + output * prices.output) /
    1_000_000;

  return {
    usd: observedUsd + unknown * attemptMax,
    exact: unknown === 0,
    unpricedAttempts: unknown,
  };
}
