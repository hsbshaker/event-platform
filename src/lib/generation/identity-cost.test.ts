import { afterEach, describe, expect, it } from "vitest";
import { MAX_PROVIDER_ATTEMPTS_PER_CALL } from "@/lib/ai/openai/event-identity";
import {
  DEFAULT_PROVIDER_ATTEMPT_MAX_USD,
  estimateIdentityCallCostUsd,
  logicalCallMaxUsd,
  providerAttemptMaxUsd,
  tokenPrices,
  type CostRelevantUsage,
} from "./identity-cost";

/**
 * The accounting the spend ceiling depends on.
 *
 * Every test here exists because the naive version of the same calculation is wrong in the
 * direction of spending money: dropping a rejected response's tokens, costing an ambiguous
 * failure at zero, or reserving for one response when a call may make six attempts.
 *
 * Acceptance criteria: N/A — test-only. `docs/phase-4b-plan.md §A.5.1`; `spec.md §10`, `§9.6`.
 */
const PRICES = JSON.stringify({ input: 1, cachedInput: 0.5, output: 2 });

const usage = (patch: Partial<CostRelevantUsage> = {}): CostRelevantUsage => ({
  inputTokens: 1_000_000,
  cachedInputTokens: 0,
  outputTokens: 1_000_000,
  reasoningTokens: 0,
  providerResponses: 1,
  unknownUsageAttempts: 0,
  ...patch,
});

afterEach(() => {
  delete process.env.IDENTITY_TOKEN_PRICES_USD_PER_MTOK;
  delete process.env.IDENTITY_PROVIDER_ATTEMPT_MAX_USD;
});

describe("the per-attempt and logical-call maximums", () => {
  it("bounds the whole logical call, not one successful response", () => {
    // A claim reserves this much. If it were one response's worth, a call that made every
    // attempt its retry policy permits would cost six times what the ceiling set aside.
    expect(logicalCallMaxUsd()).toBe(providerAttemptMaxUsd() * MAX_PROVIDER_ATTEMPTS_PER_CALL);
  });

  it("is pinned to the retry and pass policy", () => {
    // The pin: `MAX_PROVIDER_ATTEMPTS_PER_CALL` is `passes × (MAX_TRANSIENT_RETRIES + 1)`.
    // Raising either raises the reservation, and this assertion fails until the number here is
    // updated deliberately — so worst-case spend cannot drift past the ceiling in silence.
    expect(MAX_PROVIDER_ATTEMPTS_PER_CALL).toBe(6);
    expect(logicalCallMaxUsd()).toBe(DEFAULT_PROVIDER_ATTEMPT_MAX_USD * 6);
  });

  it("takes a configured per-attempt maximum over the unverified default", () => {
    process.env.IDENTITY_PROVIDER_ATTEMPT_MAX_USD = "0.25";
    expect(providerAttemptMaxUsd()).toBe(0.25);
    expect(logicalCallMaxUsd()).toBe(0.25 * MAX_PROVIDER_ATTEMPTS_PER_CALL);
  });

  it.each(["0", "-1", "abc"])("refuses an unusable bound %s rather than pricing from it", (raw) => {
    process.env.IDENTITY_PROVIDER_ATTEMPT_MAX_USD = raw;
    expect(() => providerAttemptMaxUsd()).toThrow(/positive number/);
  });
});

describe("estimating what one call cost", () => {
  it("prices observed tokens exactly when prices are configured", () => {
    process.env.IDENTITY_TOKEN_PRICES_USD_PER_MTOK = PRICES;
    const estimate = estimateIdentityCallCostUsd(usage());
    expect(estimate.usd).toBeCloseTo(1 + 2, 10);
    expect(estimate.exact).toBe(true);
    expect(estimate.unpricedAttempts).toBe(0);
  });

  it("bills reasoning tokens as output, because that is how they are charged", () => {
    process.env.IDENTITY_TOKEN_PRICES_USD_PER_MTOK = PRICES;
    const withReasoning = estimateIdentityCallCostUsd(usage({ reasoningTokens: 1_000_000 }));
    expect(withReasoning.usd).toBeCloseTo(1 + 2 + 2, 10);
  });

  it("discounts the cached portion of the input rather than double-charging it", () => {
    process.env.IDENTITY_TOKEN_PRICES_USD_PER_MTOK = PRICES;
    const cached = estimateIdentityCallCostUsd(usage({ cachedInputTokens: 1_000_000 }));
    expect(cached.usd).toBeCloseTo(0.5 + 2, 10);
  });

  it("does NOT cost an ambiguous transient attempt at zero", () => {
    // The whole point. A timeout may have reached provider execution; we cannot know, so it is
    // charged the per-attempt maximum. Costing it zero is how a ceiling silently undercounts
    // exactly the expensive case it exists to catch.
    process.env.IDENTITY_TOKEN_PRICES_USD_PER_MTOK = PRICES;
    const estimate = estimateIdentityCallCostUsd(usage({ unknownUsageAttempts: 2 }));
    expect(estimate.usd).toBeCloseTo(3 + 2 * DEFAULT_PROVIDER_ATTEMPT_MAX_USD, 10);
    expect(estimate.exact).toBe(false);
    expect(estimate.unpricedAttempts).toBe(2);
  });

  it("never reports a call with an unknown attempt as exact", () => {
    process.env.IDENTITY_TOKEN_PRICES_USD_PER_MTOK = PRICES;
    expect(estimateIdentityCallCostUsd(usage({ unknownUsageAttempts: 1 })).exact).toBe(false);
  });

  it("fails closed when prices are not configured", () => {
    // No prices means observed tokens cannot be turned into money. The honest answer is an upper
    // bound, not a number invented from a rate nobody supplied.
    expect(tokenPrices()).toBeNull();
    const estimate = estimateIdentityCallCostUsd(usage({ providerResponses: 2 }));
    expect(estimate.usd).toBe(2 * DEFAULT_PROVIDER_ATTEMPT_MAX_USD);
    expect(estimate.exact).toBe(false);
  });

  it("fails closed when an observed response reported no tokens", () => {
    process.env.IDENTITY_TOKEN_PRICES_USD_PER_MTOK = PRICES;
    const estimate = estimateIdentityCallCostUsd(
      usage({ inputTokens: undefined, outputTokens: undefined, providerResponses: 2 }),
    );
    expect(estimate.usd).toBe(2 * DEFAULT_PROVIDER_ATTEMPT_MAX_USD);
    expect(estimate.exact).toBe(false);
  });

  it("charges a call that got nothing back for the attempts it made", () => {
    // `provider_response_evidence: []` means no text was captured, never "provably unpaid".
    const estimate = estimateIdentityCallCostUsd(
      usage({ providerResponses: 0, unknownUsageAttempts: 3 }),
    );
    expect(estimate.usd).toBe(3 * DEFAULT_PROVIDER_ATTEMPT_MAX_USD);
    expect(estimate.usd).toBeGreaterThan(0);
  });

  it("stays within the reservation the ceiling made, for the worst call possible", () => {
    const worst = estimateIdentityCallCostUsd(
      usage({ providerResponses: 2, unknownUsageAttempts: MAX_PROVIDER_ATTEMPTS_PER_CALL - 2 }),
    );
    expect(worst.usd).toBeLessThanOrEqual(logicalCallMaxUsd());
  });

  it("refuses malformed price configuration instead of guessing", () => {
    process.env.IDENTITY_TOKEN_PRICES_USD_PER_MTOK = "{not json";
    expect(() => tokenPrices()).toThrow(/must be JSON/);
    process.env.IDENTITY_TOKEN_PRICES_USD_PER_MTOK = JSON.stringify({ input: 1 });
    expect(() => tokenPrices()).toThrow(/numeric input, cachedInput, output/);
  });
});
