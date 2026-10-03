/**
 * What a batch-side run records as its cost, and against which bound.
 *
 * The defect this file is the regression for is not a wrong number — it is a **missing** one. The
 * premise, DesignIntent and Composition stages each had a derived per-attempt bound and a working
 * estimator, and nothing ever called them: `batch.ts` wrote `run.costEstimateUsd ?? null` and every
 * caller left it undefined. `plan_generation_batch` then charged each of those rows the per-run
 * maximum, exactly as `docs/phase-4b-plan.md §A.5.1` rule 3 requires of a null, and one real batch
 * of eight rows summed to $336.06 against a $25 ceiling — refusing every later batch for a day.
 *
 * So the properties checked here are the three that keep that from recurring:
 *
 *   1. a real response is priced from its own tokens, at its own tier, with cache reads, cache
 *      writes and uncached input kept apart and reasoning not double-billed (rule 1);
 *   2. an attempt nobody can price is charged that operation's **own** per-attempt maximum, never
 *      zero and never another operation's bound (rules 2, 3 and 4);
 *   3. the profile and all three bounds resolve together, up front, so a batch cannot be half
 *      priced against one profile version and half against another.
 *
 * Acceptance criteria: N/A — internal spend accounting, no product behaviour change. `spec.md §9.6`
 * (estimated cost is recorded per model call), `§10` (the project spend ceiling this number feeds),
 * `§32 #41` (no counter is exposed to a caller).
 */
import { describe, expect, it } from "vitest";

import { compositionAttemptMaxUsd } from "./composition-cost";
import { conceptPremiseAttemptMaxUsd } from "./concept-premise-cost";
import { designIntentAttemptMaxUsd } from "./design-intent-cost";
import { GPT_5_6_SOL, UNVERIFIED_DEV_PROFILE } from "./identity-cost";
import { batchCostBounds, priceFailedRun, priceRun, type PricedBatchOperation } from "./run-cost";

const MODEL = GPT_5_6_SOL.model;
/** Inside the profile's `reverifyAfter` window, so the derivations are the verified ones. */
const NOW = new Date("2026-10-03T00:00:00Z");

const BOUNDS = batchCostBounds(MODEL, NOW);

/** One response, in the shape every one of the three boundaries reports. */
const response = (
  input: number,
  cached: number,
  cacheWrite: number,
  output: number,
  reasoning = 0,
) => ({
  inputTokens: input,
  cachedInputTokens: cached,
  cacheWriteInputTokens: cacheWrite,
  outputTokens: output,
  reasoningTokens: reasoning,
  servedServiceTier: "default",
});

const oneCall = (usage: ReturnType<typeof response>[]) => ({
  responses: usage,
  providerResponses: usage.length,
  providerAttempts: usage.length,
  unknownUsageAttempts: 0,
});

describe("the bounds a batch resolves before it spends", () => {
  it("gives every operation its own per-attempt maximum, from its own request shape", () => {
    // The distinction the previous change in this branch established: `perAttemptMaxUsd` is a
    // property of an attempt *shape* (§A.5.1 rule 4), so these are four different numbers and are
    // not interchangeable. Composition's is twice DesignIntent's because its request is larger.
    expect(BOUNDS.perAttemptMaxUsd.concept_premise).toBe(conceptPremiseAttemptMaxUsd(MODEL, NOW));
    expect(BOUNDS.perAttemptMaxUsd.design_intent).toBe(designIntentAttemptMaxUsd(MODEL, NOW));
    expect(BOUNDS.perAttemptMaxUsd.composition).toBe(compositionAttemptMaxUsd(MODEL, NOW));
    expect(BOUNDS.perAttemptMaxUsd.composition).toBeGreaterThan(
      BOUNDS.perAttemptMaxUsd.design_intent,
    );
  });

  it("resolves one profile for the batch, and says which rates it is", () => {
    expect(BOUNDS.profile.model).toBe(MODEL);
    expect(BOUNDS.costProfileVersion).toBe(GPT_5_6_SOL.profileVersion);
    expect(BOUNDS.costProfileVersion).not.toBe(UNVERIFIED_DEV_PROFILE.profileVersion);
  });

  it("prices nothing against a model nobody has priced", () => {
    // Outside production `requireCostProfile` answers with the labelled unverified fallback — and
    // a profile with no rates derives nothing, so every attempt is charged its deliberately large
    // number instead of being costed from rates that do not exist. In production the same lookup
    // refuses before a call is made, which is why the bounds are resolved up front.
    const unpriced = batchCostBounds("some-model-nobody-priced", NOW);
    expect(unpriced.costProfileVersion).toBe(UNVERIFIED_DEV_PROFILE.profileVersion);
    const estimate = priceRun(unpriced, "composition", oneCall([response(7_650, 0, 7_647, 1_794)]));
    expect(estimate.exact).toBe(false);
    expect(estimate.usd).toBe(unpriced.perAttemptMaxUsd.composition);
    expect(estimate.usd).toBeGreaterThan(BOUNDS.perAttemptMaxUsd.composition);
  });
});

describe("a response is priced from its own tokens", () => {
  it("keeps uncached input, cache reads and cache writes on their own rates", () => {
    // 3 uncached @ $4, 3,211 cache reads @ $0.40, 4,399 cache writes @ $5, 2,279 output @ $20, per
    // 1M. Standard tier: 7,613 input is far below the 272,000-token long-context threshold. The
    // three input classes are not interchangeable — cache writes are a premium over uncached input
    // and cache reads are a tenth of it — and `outputTokens` already includes the reasoning tokens.
    const estimate = priceRun(
      BOUNDS,
      "composition",
      oneCall([response(7_613, 3_211, 4_399, 2_279, 1_400)]),
    );
    expect(estimate.usd).toBeCloseTo(0.0688714, 9);
    expect(estimate.exact).toBe(true);
    expect(estimate.unpricedAttempts).toBe(0);
  });

  it("prices each response at its own tier, not the aggregate's", () => {
    // The long-context threshold is per request (§A.5.1 rule 1). Two responses that each sit below
    // it must both be billed at standard rates even though their sum is above it — summing first
    // would charge both at long-context and then call the answer exact.
    const big = GPT_5_6_SOL.longContextThresholdTokens - 1_000;
    const estimate = priceRun(
      BOUNDS,
      "composition",
      oneCall([response(big, 0, 0, 1_000), response(big, 0, 0, 1_000)]),
    );
    const atStandard =
      (big * GPT_5_6_SOL.standard.input + 1_000 * GPT_5_6_SOL.standard.output) / 1e6;
    expect(estimate.usd).toBeCloseTo(atStandard * 2, 9);
    expect(estimate.usd).toBeLessThan(
      ((big * GPT_5_6_SOL.longContext.input + 1_000 * GPT_5_6_SOL.longContext.output) / 1e6) * 2,
    );
  });

  it("prices the whole live batch at cents, which is what made the null so expensive", () => {
    // The real token counts from the first batch that completed against the deployed preview: one
    // premise call, three DesignIntent calls, three Composition calls. Every one of these seven
    // rows went in with a null price and was charged $48 — the largest logical call any operation
    // can make — so a batch that cost about forty cents was recorded at $336.
    const premise = priceRun(
      BOUNDS,
      "concept_premise",
      oneCall([response(3_883, 0, 3_880, 1_491, 793)]),
    );
    const intents = [485, 559, 616].map(
      (output) =>
        priceRun(BOUNDS, "design_intent", oneCall([response(5_650, 0, 5_645, output)])).usd,
    );
    const compositions = [
      oneCall([response(7_650, 0, 7_647, 1_794)]),
      oneCall([response(7_613, 3_211, 4_399, 2_279)]),
      oneCall([response(7_592, 3_211, 4_378, 4_158)]),
    ].map((usage) => priceRun(BOUNDS, "composition", usage).usd);

    expect(premise.usd).toBeCloseTo(0.049232, 9);
    expect(intents).toHaveLength(3);
    expect(intents.reduce((a, b) => a + b, 0)).toBeCloseTo(0.117935, 9);
    expect(compositions.reduce((a, b) => a + b, 0)).toBeCloseTo(0.2493448, 9);

    const batch = premise.usd + [...intents, ...compositions].reduce((a, b) => a + b, 0);
    expect(batch).toBeCloseTo(0.4165118, 9);
    // Two orders of magnitude under what the nulls were charged, and under one DesignIntent
    // attempt's bound. The ceiling is not the problem; an unpriced row was.
    expect(batch).toBeLessThan(BOUNDS.perAttemptMaxUsd.design_intent);
  });
});

describe("anything unpriceable is charged the operation's own maximum", () => {
  const operations: PricedBatchOperation[] = ["concept_premise", "design_intent", "composition"];

  it("never prices an attempt that threw at zero", () => {
    for (const operation of operations) {
      // No usage, no evidence: all we know is that a call was made, and §A.5.1 rule 2 says that
      // may have billed. One attempt, at this operation's bound.
      const estimate = priceFailedRun(BOUNDS, operation, new Error("connection reset"));
      expect(estimate.usd).toBe(BOUNDS.perAttemptMaxUsd[operation]);
      expect(estimate.exact).toBe(false);
    }
  });

  it("charges each operation against its own bound and never against another's", () => {
    const charged = operations.map(
      (operation) => priceFailedRun(BOUNDS, operation, new Error("nope")).usd,
    );
    expect(charged).toEqual([
      BOUNDS.perAttemptMaxUsd.concept_premise,
      BOUNDS.perAttemptMaxUsd.design_intent,
      BOUNDS.perAttemptMaxUsd.composition,
    ]);
    // Composition's request is the largest of the three, so a composition attempt charged at
    // DesignIntent's bound would under-count it by half — and EventIdentity's $3.50 is neither.
    expect(charged[2]).not.toBe(charged[1]);
  });

  it("prices the responses a failed call was billed for, and bounds only the rest", () => {
    const failure = Object.assign(new Error("invalid output"), {
      usage: {
        responses: [response(5_650, 0, 5_645, 485)],
        providerResponses: 1,
        providerAttempts: 2,
        unknownUsageAttempts: 1,
      },
      rawResponses: ["{}"],
    });
    const estimate = priceFailedRun(BOUNDS, "design_intent", failure);
    // The first response is priced from its tokens; the attempt that returned nothing is charged
    // the bound. Adding the two counters instead would bill the response twice.
    expect(estimate.usd).toBeCloseTo(0.037945 + BOUNDS.perAttemptMaxUsd.design_intent, 9);
    expect(estimate.unpricedAttempts).toBe(1);
  });

  it("counts a response the summary claimed but the detail never described", () => {
    const estimate = priceRun(BOUNDS, "composition", {
      responses: [response(7_650, 0, 7_647, 1_794)],
      providerResponses: 2,
      providerAttempts: 2,
      unknownUsageAttempts: 0,
    });
    // Silence is not evidence of zero: the second response is charged the maximum.
    expect(estimate.usd).toBeCloseTo(0.074127 + BOUNDS.perAttemptMaxUsd.composition, 9);
    expect(estimate.exact).toBe(false);
  });

  it("refuses to read a missing token class as zero", () => {
    for (const missing of [
      { inputTokens: 7_650, cachedInputTokens: 0, outputTokens: 1_794 },
      { inputTokens: 7_650, cacheWriteInputTokens: 7_647, outputTokens: 1_794 },
      { inputTokens: 7_650, cachedInputTokens: 0, cacheWriteInputTokens: 7_647 },
    ]) {
      const estimate = priceRun(BOUNDS, "composition", {
        responses: [missing],
        providerResponses: 1,
        providerAttempts: 1,
        unknownUsageAttempts: 0,
      });
      // A gateway that drops `input_tokens_details` would otherwise make a cache-write-heavy
      // request look like cheap uncached input — and label the answer exact.
      expect(estimate.usd).toBe(BOUNDS.perAttemptMaxUsd.composition);
      expect(estimate.exact).toBe(false);
    }
  });

  it("charges the maximum for a response served on a tier the profile does not price", () => {
    const estimate = priceRun(BOUNDS, "concept_premise", {
      responses: [{ ...response(3_883, 0, 3_880, 1_491), servedServiceTier: "fast" }],
      providerResponses: 1,
      providerAttempts: 1,
      unknownUsageAttempts: 0,
    });
    // Fast Mode bills at twice standard and the profile does not price it. Priced from the standard
    // table the row would read half its real cost; charged the bound it reads conservatively.
    expect(estimate.usd).toBe(BOUNDS.perAttemptMaxUsd.concept_premise);
    expect(estimate.servedUnpricedTier).toBe(true);
  });
});
