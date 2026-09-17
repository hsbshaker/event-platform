/**
 * The DesignIntent cost bound is derived from this call's own attempt shape, not inherited.
 *
 * `docs/phase-4b-plan.md`, Part IV: *"The verified rate table in `identity-cost.ts` is a property of
 * the model and applies to any call on it; `perAttemptMaxUsd` is a property of an attempt shape,
 * and EventIdentity's was derived from EventIdentity's. T21 derives DesignIntent's own bound from
 * the same verified rates and its own output configuration, records it under its own profile
 * version, and leaves the live path failing closed when the configured model has no verified
 * profile. Inheriting the number, or inventing one, are both refused."*
 *
 * A bound is only a bound if the shape it assumes is enforced, so the two ceilings it rests on are
 * checked against the boundary that enforces them rather than restated here.
 *
 * Acceptance criteria: N/A — spend control, no product behaviour change.
 * `docs/phase-4b-plan.md §A.5.1`, Part IV T21; `development-plan.md` principle 4.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DESIGN_INTENT_MAX_OUTPUT_TOKENS,
  DESIGN_INTENT_MAX_PROVIDER_ATTEMPTS_PER_CALL,
  DESIGN_INTENT_MAX_REQUEST_BYTES,
  DESIGN_INTENT_MAX_TRANSIENT_RETRIES,
  DESIGN_INTENT_PASSES,
  DESIGN_INTENT_SERVICE_TIER,
} from "@/lib/ai/openai/design-intent";
import {
  GPT_5_6_SOL,
  UNVERIFIED_DEV_PROFILE,
  VERIFIED_COST_PROFILES,
} from "@/lib/generation/identity-cost";

import {
  DESIGN_INTENT_ATTEMPT_SHAPE_VERSION,
  DESIGN_INTENT_BOUND_SERVICE_TIER,
  DESIGN_INTENT_CALLS_PER_BATCH,
  DESIGN_INTENT_STRUCTURAL_TOKEN_ALLOWANCE,
  deriveDesignIntentAttemptBound,
  designIntentAttemptBound,
  designIntentAttemptMaxUsd,
  designIntentBatchMaxUsd,
  designIntentLogicalCallMaxUsd,
} from "./design-intent-cost";

const NOW = new Date("2026-09-17T00:00:00Z");

describe("the derived per-attempt bound", () => {
  it("is arithmetic over the verified rate table and this call's two ceilings", () => {
    const bound = deriveDesignIntentAttemptBound(GPT_5_6_SOL);
    const inputTokens = DESIGN_INTENT_MAX_REQUEST_BYTES + DESIGN_INTENT_STRUCTURAL_TOKEN_ALLOWANCE;

    expect(bound.inputTokenCeiling).toBe(inputTokens);
    expect(bound.outputTokenCeiling).toBe(DESIGN_INTENT_MAX_OUTPUT_TOKENS);
    // The input ceiling keeps the request off the long-context tier, which is *why* the bound is
    // smaller than EventIdentity's rather than a coincidence of rounding.
    expect(inputTokens).toBeLessThan(GPT_5_6_SOL.longContextThresholdTokens);
    expect(bound.tier).toBe("standard");

    // Every input token charged at the dearest class in the table — cache writes — because we
    // cannot know in advance which class a token lands in.
    const worstInput = Math.max(
      GPT_5_6_SOL.standard.input,
      GPT_5_6_SOL.standard.cachedInput,
      GPT_5_6_SOL.standard.cacheWriteInput,
    );
    const expected =
      (inputTokens * worstInput + DESIGN_INTENT_MAX_OUTPUT_TOKENS * GPT_5_6_SOL.standard.output) /
      1_000_000;
    expect(bound.perAttemptMaxUsd).toBe(Math.ceil(expected * 100) / 100);
    // Up, never down: a bound that rounds down is not a bound.
    expect(bound.perAttemptMaxUsd).toBeGreaterThanOrEqual(expected);
  });

  it("is not EventIdentity's number, and is never looser than the model's own worst attempt", () => {
    for (const profile of VERIFIED_COST_PROFILES) {
      const bound = deriveDesignIntentAttemptBound(profile);
      expect(bound.perAttemptMaxUsd).toBeLessThan(profile.perAttemptMaxUsd);
      expect(designIntentAttemptBound(profile.model, NOW).perAttemptMaxUsd).toBeLessThanOrEqual(
        profile.perAttemptMaxUsd,
      );
    }
  });

  it("carries both halves of its provenance, because either one changes the number", () => {
    const bound = deriveDesignIntentAttemptBound(GPT_5_6_SOL);
    expect(bound.boundVersion).toBe(
      `${GPT_5_6_SOL.profileVersion}+${DESIGN_INTENT_ATTEMPT_SHAPE_VERSION}`,
    );
    // The rates priced here describe the tier the boundary pins on every request. If that stopped
    // being pinned, the number would stop describing the call.
    expect(DESIGN_INTENT_BOUND_SERVICE_TIER).toBe(DESIGN_INTENT_SERVICE_TIER);
  });

  it("cannot claim more output than the model itself will produce", () => {
    const tiny = { ...GPT_5_6_SOL, maxOutputTokens: 4_000 };
    expect(deriveDesignIntentAttemptBound(tiny).outputTokenCeiling).toBe(4_000);
  });
});

describe("what it refuses", () => {
  beforeEach(() => {
    delete process.env.DESIGN_INTENT_PROVIDER_ATTEMPT_MAX_USD;
  });

  afterEach(() => {
    delete process.env.DESIGN_INTENT_PROVIDER_ATTEMPT_MAX_USD;
    delete process.env.VERCEL_ENV;
  });

  it("fails closed in production when the configured model has no verified profile", () => {
    process.env.VERCEL_ENV = "production";
    expect(() => designIntentAttemptBound("some-model-nobody-priced", NOW)).toThrow(
      /No verified cost profile/,
    );
  });

  it("fails closed in production when the verified profile is past re-verification", () => {
    process.env.VERCEL_ENV = "production";
    const stale = new Date(`${GPT_5_6_SOL.reverifyAfter}T23:59:59.999Z`).getTime() + 1;
    expect(() => designIntentAttemptBound(GPT_5_6_SOL.model, new Date(stale))).toThrow(
      /needed re-verification/,
    );
  });

  it("prices nothing from an unverified profile, and uses its oversized maximum instead", () => {
    // Outside production the labelled dev fallback applies. It has no rates, so deriving a number
    // from it would be the optimistic fallback the whole section refuses.
    const bound = designIntentAttemptBound("some-model-nobody-priced", NOW);
    expect(bound.perAttemptMaxUsd).toBe(UNVERIFIED_DEV_PROFILE.perAttemptMaxUsd);
    expect(bound.boundVersion).toContain(UNVERIFIED_DEV_PROFILE.profileVersion);
  });

  it("lets an environment override raise the reservation and never lower it", () => {
    const derived = designIntentAttemptBound(GPT_5_6_SOL.model, NOW).perAttemptMaxUsd;
    process.env.DESIGN_INTENT_PROVIDER_ATTEMPT_MAX_USD = String(derived / 2);
    expect(designIntentAttemptMaxUsd(GPT_5_6_SOL.model, NOW)).toBe(derived);
    process.env.DESIGN_INTENT_PROVIDER_ATTEMPT_MAX_USD = String(derived * 4);
    expect(designIntentAttemptMaxUsd(GPT_5_6_SOL.model, NOW)).toBe(derived * 4);
    process.env.DESIGN_INTENT_PROVIDER_ATTEMPT_MAX_USD = "not a number";
    expect(() => designIntentAttemptMaxUsd(GPT_5_6_SOL.model, NOW)).toThrow(/positive number/);
  });
});

describe("the call and the batch", () => {
  it("reserves for every attempt the retry policy permits, not for one response", () => {
    // Pinned to the boundary's own constants, so raising the transient-retry bound raises the
    // reservation instead of quietly raising real worst-case spend past it.
    expect(DESIGN_INTENT_MAX_PROVIDER_ATTEMPTS_PER_CALL).toBe(
      DESIGN_INTENT_PASSES * (DESIGN_INTENT_MAX_TRANSIENT_RETRIES + 1),
    );
    expect(designIntentLogicalCallMaxUsd(GPT_5_6_SOL.model, NOW)).toBe(
      designIntentAttemptMaxUsd(GPT_5_6_SOL.model, NOW) *
        DESIGN_INTENT_MAX_PROVIDER_ATTEMPTS_PER_CALL,
    );
  });

  it("knows a batch is three blind parallel calls", () => {
    expect(DESIGN_INTENT_CALLS_PER_BATCH).toBe(3);
    expect(designIntentBatchMaxUsd(GPT_5_6_SOL.model, NOW)).toBe(
      designIntentLogicalCallMaxUsd(GPT_5_6_SOL.model, NOW) * DESIGN_INTENT_CALLS_PER_BATCH,
    );
  });
});
