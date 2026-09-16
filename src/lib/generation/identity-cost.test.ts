import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PROVIDER_ATTEMPTS_PER_CALL,
  type ProviderResponseUsage,
} from "@/lib/ai/openai/event-identity";
import {
  estimateIdentityCallCostUsd,
  findCostProfile,
  GPT_5_6_SOL,
  isFresh,
  isVerified,
  logicalCallMaxUsd,
  providerAttemptMaxUsd,
  requireCostProfile,
  UNVERIFIED_DEV_PROFILE,
  VERIFIED_COST_PROFILES,
  type CostRelevantUsage,
} from "./identity-cost";

/**
 * The accounting the spend ceiling depends on.
 *
 * Every test here exists because the naive version of the same calculation is wrong in the
 * direction of spending money: dropping a rejected response's tokens, costing an ambiguous
 * failure at zero, billing reasoning twice, pricing a long-context request at the short-context
 * rate, or reserving for one response when a call may make six attempts.
 *
 * Acceptance criteria: N/A — test-only. `docs/phase-4b-plan.md §A.5.1`; `spec.md §10`, `§9.6`.
 */
const MODEL = GPT_5_6_SOL.model;

/** Deliberately below the long-context threshold, so the tier is a choice a test makes. */
const IN = 100_000;
const OUT = 100_000;
const per = (tokens: number, pricePerMTok: number) => (tokens * pricePerMTok) / 1_000_000;

const response = (patch: Partial<ProviderResponseUsage> = {}): ProviderResponseUsage => ({
  inputTokens: IN,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: OUT,
  reasoningTokens: 0,
  ...patch,
});

/** What one default response costs at the standard tier. */
const STANDARD_ONE = per(IN, GPT_5_6_SOL.standard.input) + per(OUT, GPT_5_6_SOL.standard.output);

const usage = (
  responses: ProviderResponseUsage[],
  patch: Partial<CostRelevantUsage> = {},
): CostRelevantUsage => ({
  responses,
  providerResponses: responses.length,
  providerAttempts: responses.length,
  unknownUsageAttempts: 0,
  ...patch,
});

afterEach(() => {
  delete process.env.IDENTITY_PROVIDER_ATTEMPT_MAX_USD;
  delete process.env.NODE_ENV_OVERRIDE;
});

describe("the verified cost profile", () => {
  it("records where every number came from and when", () => {
    // "Verified" is a property of this record, not of a number appearing somewhere. Without the
    // source and date, nobody can tell a checked bound from a guess a year later.
    for (const profile of VERIFIED_COST_PROFILES) {
      expect(profile.source).toMatch(/^https?:\/\//);
      expect(profile.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isVerified(profile)).toBe(true);
      expect(profile.perAttemptMaxUsd).toBeGreaterThan(0);
    }
  });

  it("bounds the worst legal request at the worst tier", () => {
    // Long-context rates, every input token billed as a cache write — the most expensive input
    // class — plus the largest permitted output.
    const p = GPT_5_6_SOL;
    const worstInput = (p.contextWindowTokens * p.longContext.cacheWriteInput) / 1_000_000;
    const worstOutput = (p.maxOutputTokens * p.longContext.output) / 1_000_000;
    expect(p.perAttemptMaxUsd).toBeGreaterThanOrEqual(worstInput + worstOutput);
  });

  it("prices the long-context tier above the standard one in every class", () => {
    const { standard, longContext } = GPT_5_6_SOL;
    for (const key of ["input", "cachedInput", "cacheWriteInput", "output"] as const) {
      expect(longContext[key]).toBeGreaterThan(standard[key]);
    }
    // A cache write costs more than ordinary input, a cache read far less. Collapsing the three
    // into one rate is how cache accounting goes quietly wrong.
    expect(standard.cacheWriteInput).toBeGreaterThan(standard.input);
    expect(standard.cachedInput).toBeLessThan(standard.input);
  });
});

describe("the production configuration contract", () => {
  it("serves a verified profile for the configured model", () => {
    expect(findCostProfile(MODEL)).not.toBeNull();
    expect(requireCostProfile(MODEL).model).toBe(MODEL);
  });

  it("falls back only outside production, and says the fallback is unverified", () => {
    const profile = requireCostProfile("some-unpriced-model");
    expect(profile).toBe(UNVERIFIED_DEV_PROFILE);
    expect(isVerified(profile)).toBe(false);
    // Larger than any verified bound, so a developer with no configuration never under-reserves.
    for (const verified of VERIFIED_COST_PROFILES) {
      expect(UNVERIFIED_DEV_PROFILE.perAttemptMaxUsd).toBeGreaterThan(verified.perAttemptMaxUsd);
    }
  });

  it.each(["VERCEL_ENV", "NODE_ENV"])(
    "refuses an unpriced model when %s says production",
    (key) => {
      // Changing OPENAI_MODEL to something nobody has priced must fail at configuration time
      // rather than reserve one model's worst case against another model's bill.
      vi.stubEnv(key, "production");
      try {
        expect(() => requireCostProfile("gpt-5.6-sol-turbo-unpriced")).toThrow(
          /No verified cost profile/,
        );
        // The configured model still works, so this is a contract, not a blanket refusal.
        expect(requireCostProfile(MODEL).model).toBe(MODEL);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  describe("freshness", () => {
    const within = new Date(`${GPT_5_6_SOL.reverifyAfter}T00:00:00Z`);
    const boundary = new Date(`${GPT_5_6_SOL.reverifyAfter}T23:59:59Z`);
    const after = new Date(`${GPT_5_6_SOL.reverifyAfter}T00:00:00Z`);
    after.setUTCDate(after.getUTCDate() + 1);

    it("records when it was read and by when it must be re-read", () => {
      for (const profile of VERIFIED_COST_PROFILES) {
        expect(profile.reverifyAfter).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Date.parse(profile.reverifyAfter)).toBeGreaterThan(Date.parse(profile.retrieved));
      }
    });

    it("is usable through the documented day, inclusive", () => {
      expect(isFresh(GPT_5_6_SOL, within)).toBe(true);
      expect(isFresh(GPT_5_6_SOL, boundary)).toBe(true);
    });

    it("is stale from the following UTC day", () => {
      expect(isFresh(GPT_5_6_SOL, after)).toBe(false);
    });

    it("refuses a stale profile in production, before any claim or provider call", () => {
      // Published prices move, and the current commitment is time-bounded. A bound nobody re-read
      // is the same failure as one nobody verified — it just took longer to become false.
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(() => requireCostProfile(MODEL, boundary)).not.toThrow();
        expect(() => requireCostProfile(MODEL, after)).toThrow(/re-verification after/);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("restores eligibility when the profile is re-verified", () => {
      // Re-verification is a person reading the current documentation and moving these dates,
      // never a runtime fetch.
      const refreshed = {
        ...GPT_5_6_SOL,
        profileVersion: "gpt-5.6-sol@2026-12-01",
        retrieved: "2026-12-01",
        reverifyAfter: "2027-02-01",
      };
      expect(isFresh(refreshed, after)).toBe(true);
    });

    it("never counts the dev fallback as fresh", () => {
      expect(isFresh(UNVERIFIED_DEV_PROFILE, within)).toBe(false);
      expect(isVerified(UNVERIFIED_DEV_PROFILE)).toBe(false);
    });
  });

  it("lets an override raise the bound but never lower it", () => {
    // A number in an environment variable is not evidence anybody read the provider's limits, so
    // it cannot be used to shrink a verified bound.
    process.env.IDENTITY_PROVIDER_ATTEMPT_MAX_USD = "1";
    expect(providerAttemptMaxUsd(MODEL)).toBe(GPT_5_6_SOL.perAttemptMaxUsd);
    process.env.IDENTITY_PROVIDER_ATTEMPT_MAX_USD = String(GPT_5_6_SOL.perAttemptMaxUsd * 3);
    expect(providerAttemptMaxUsd(MODEL)).toBe(GPT_5_6_SOL.perAttemptMaxUsd * 3);
  });

  it.each(["0", "-1", "abc"])("refuses an unusable override %s", (raw) => {
    process.env.IDENTITY_PROVIDER_ATTEMPT_MAX_USD = raw;
    expect(() => providerAttemptMaxUsd(MODEL)).toThrow(/positive number/);
  });
});

describe("the logical-call maximum", () => {
  it("bounds the whole call, not one successful response", () => {
    expect(logicalCallMaxUsd(MODEL)).toBe(
      GPT_5_6_SOL.perAttemptMaxUsd * MAX_PROVIDER_ATTEMPTS_PER_CALL,
    );
  });

  it("is pinned to the retry and pass policy", () => {
    // Raising `MAX_TRANSIENT_RETRIES` raises the reservation, and this assertion fails until the
    // number is updated deliberately — so worst-case spend cannot drift past the ceiling quietly.
    expect(MAX_PROVIDER_ATTEMPTS_PER_CALL).toBe(6);
    expect(logicalCallMaxUsd(MODEL)).toBe(GPT_5_6_SOL.perAttemptMaxUsd * 6);
  });
});

describe("estimating what one call cost", () => {
  it("prices a short-context response at the standard rate", () => {
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response()]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBeCloseTo(STANDARD_ONE, 10);
    expect(estimate.exact).toBe(true);
  });

  it("bills reasoning once, because output already includes it", () => {
    // The provider reports `output_tokens_details.reasoning_tokens` as a breakdown of
    // `output_tokens`. Adding the two charges reasoning twice — and reasoning is the majority of
    // output on a high-effort call, so the error is large, not marginal.
    const withReasoning = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ reasoningTokens: Math.floor(OUT * 0.9) })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(withReasoning.usd).toBeCloseTo(STANDARD_ONE, 10);
    const without = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ reasoningTokens: 0 })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(withReasoning.usd).toBe(without.usd);
  });

  it("prices cache reads and cache writes as distinct classes", () => {
    const out = per(OUT, GPT_5_6_SOL.standard.output);
    const cacheRead = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ cachedInputTokens: IN })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    const cacheWrite = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ cacheWriteInputTokens: IN })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(cacheRead.usd).toBeCloseTo(per(IN, GPT_5_6_SOL.standard.cachedInput) + out, 10);
    expect(cacheWrite.usd).toBeCloseTo(per(IN, GPT_5_6_SOL.standard.cacheWriteInput) + out, 10);
    // A cache write costs more than the uncached input it replaces; a read costs far less.
    expect(cacheWrite.usd).toBeGreaterThan(STANDARD_ONE);
    expect(cacheRead.usd).toBeLessThan(STANDARD_ONE);
  });

  it("never lets overlapping subsets produce a negative charge", () => {
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ inputTokens: 100, cachedInputTokens: 90, cacheWriteInputTokens: 90 })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBeGreaterThan(0);
  });

  it("applies the long-context tier to the response that crossed it", () => {
    const long = GPT_5_6_SOL.longContextThresholdTokens + 1;
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ inputTokens: long, outputTokens: OUT })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBeCloseTo(
      per(long, GPT_5_6_SOL.longContext.input) + per(OUT, GPT_5_6_SOL.longContext.output),
      8,
    );
    expect(estimate.exact).toBe(true);
  });

  it("prices a mixed call per response rather than on the aggregate", () => {
    // This is why per-response usage is kept. Aggregating first would push a short first attempt
    // over the threshold along with the repair, or leave the repair under it — either way one of
    // the two is charged at a rate it was not billed at, while the estimate calls itself exact.
    const longIn = GPT_5_6_SOL.longContextThresholdTokens + 1;
    const short = response({ inputTokens: 1_000, outputTokens: 1_000 });
    const long = response({ inputTokens: longIn, outputTokens: 1_000 });
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([short, long]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    const expected =
      per(1_000, GPT_5_6_SOL.standard.input) +
      per(1_000, GPT_5_6_SOL.standard.output) +
      per(longIn, GPT_5_6_SOL.longContext.input) +
      per(1_000, GPT_5_6_SOL.longContext.output);
    expect(estimate.usd).toBeCloseTo(expected, 8);
    expect(estimate.exact).toBe(true);
  });

  it("does NOT cost an ambiguous transient attempt at zero", () => {
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response()], { providerAttempts: 3, unknownUsageAttempts: 2 }),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBeCloseTo(STANDARD_ONE + 2 * GPT_5_6_SOL.perAttemptMaxUsd, 8);
    expect(estimate.exact).toBe(false);
    expect(estimate.unpricedAttempts).toBe(2);
  });

  it("charges an attempt whose response carried no usage exactly once", () => {
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([{}], { providerAttempts: 1, unknownUsageAttempts: 1 }),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBe(GPT_5_6_SOL.perAttemptMaxUsd);
    expect(estimate.exact).toBe(false);
  });

  it("charges a response the summary claimed but the detail never described", () => {
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response()], { providerResponses: 2, providerAttempts: 2 }),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBeCloseTo(STANDARD_ONE + GPT_5_6_SOL.perAttemptMaxUsd, 8);
    expect(estimate.exact).toBe(false);
  });

  it("charges a call that got nothing back for the attempts it made", () => {
    // `provider_response_evidence: []` means no text was captured, never "provably unpaid".
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([], { providerAttempts: 3, unknownUsageAttempts: 3 }),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBe(3 * GPT_5_6_SOL.perAttemptMaxUsd);
    expect(estimate.exact).toBe(false);
  });

  it("prices nothing from an unverified fallback profile", () => {
    // No rates to price with. Charging the maximum is the only honest answer; inventing a number
    // would be the optimistic fallback the whole section refuses.
    const estimate = estimateIdentityCallCostUsd(
      UNVERIFIED_DEV_PROFILE,
      usage([response()]),
      UNVERIFIED_DEV_PROFILE.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBe(UNVERIFIED_DEV_PROFILE.perAttemptMaxUsd);
    expect(estimate.exact).toBe(false);
  });

  it("stays within the reservation for every attempt count the policy permits", () => {
    for (let attempts = 1; attempts <= MAX_PROVIDER_ATTEMPTS_PER_CALL; attempts += 1) {
      for (let responses = 0; responses <= Math.min(attempts, 2); responses += 1) {
        const estimate = estimateIdentityCallCostUsd(
          GPT_5_6_SOL,
          usage(
            Array.from({ length: responses }, () =>
              response({
                inputTokens: GPT_5_6_SOL.contextWindowTokens,
                outputTokens: GPT_5_6_SOL.maxOutputTokens,
                cacheWriteInputTokens: GPT_5_6_SOL.contextWindowTokens,
              }),
            ),
            { providerAttempts: attempts, unknownUsageAttempts: attempts - responses },
          ),
          GPT_5_6_SOL.perAttemptMaxUsd,
        );
        expect(estimate.usd).toBeLessThanOrEqual(logicalCallMaxUsd(MODEL));
      }
    }
  });
});
