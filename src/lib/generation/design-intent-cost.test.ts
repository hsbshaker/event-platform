/**
 * The DesignIntent cost bound, checked against its own inputs rather than against a memory of them.
 *
 * `docs/phase-4b-plan.md` Part IV: T21 "derives DesignIntent's own bound from the same verified
 * rates and its own output configuration, records it under its own profile version, and leaves the
 * live path failing closed when the configured model has no verified profile. Inheriting the
 * number, or inventing one, are both refused."
 *
 * A bound is only worth the inputs it rests on, so the tests below rebuild each input rather than
 * restating it: the worst user message is reassembled from the identity contract's own maxima, the
 * instruction file is measured on disk, and the attempt count is read from the boundary's own
 * constants. A brief that grows a field, an instruction file that doubles, or a retry bound that
 * moves all fail here instead of silently invalidating the arithmetic.
 *
 * Acceptance criteria: N/A — spend control. `docs/development-plan.md` principle 4;
 * `docs/phase-4b-plan.md §A.5.1`, `§H.2`, Part IV T21.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DESIGN_INTENT_MAX_OUTPUT_TOKENS,
  DESIGN_INTENT_SERVICE_TIER,
  MAX_PROVIDER_ATTEMPTS_PER_CALL,
  repairFeedback,
  REPAIR_FEEDBACK_MAX_BYTES,
  REPAIR_TURN_FRAMING_BYTES,
} from "@/lib/ai/openai/design-intent";
import { assembleDesignIntentUserMessage } from "@/lib/ai/openai/design-intent-input";
import { EVENT_IDENTITY_SERVICE_TIER } from "@/lib/ai/openai/event-identity";
import { describeIssues, type ValidationIssue } from "@/lib/ai/design-intent/validate";
import type { EventIdentity } from "@/lib/ai/event-identity/contract";
import { canonicalJsonSchema as canonicalIdentityJsonSchema } from "@/lib/ai/event-identity/wire-schema";
import type { SiblingAssignment } from "@/lib/renderer/planner";

import {
  assertProfileSupportsRequest,
  DESIGN_INTENT_ATTEMPT_PROFILE_VERSION,
  designIntentAttemptMaxUsd,
  designIntentBatchMaxUsd,
  designIntentLogicalCallMaxUsd,
  estimateDesignIntentCallCostUsd,
  INSTRUCTION_BYTES,
  PER_ATTEMPT_INPUT_TOKEN_BOUND,
  PER_ATTEMPT_OUTPUT_TOKEN_BOUND,
  REPAIR_OVERHEAD_TOKENS,
  WORST_USER_MESSAGE_BYTES,
} from "./design-intent-cost";
import { GPT_5_6_SOL, UNVERIFIED_DEV_PROFILE } from "./identity-cost";

const ROOT = new URL("../../../", import.meta.url).pathname;
const MODEL = GPT_5_6_SOL.model;

/** One UTF-16 code unit, three UTF-8 bytes — the worst ratio a BMP character can have. */
const WORST = "\uFFFD";

type JsonSchema = Record<string, unknown>;

/**
 * The largest value a schema node admits, built **from the schema** rather than transcribed.
 *
 * This is what makes the bound a derivation instead of a hand-copy. A field added to the identity
 * contract already broke the build via `BRIEF_LABELS`; what this catches is the quieter failure the
 * review named — a `.max()` that *widens*, leaving seventeen correct-looking literals describing a
 * contract that has moved. Here the maxima are read out of the contract's own canonical JSON Schema,
 * so widening one grows the generated message and fails `WORST_USER_MESSAGE_BYTES` directly.
 *
 * An unbounded string or array **throws** rather than defaulting: a field with no `max()` makes the
 * whole bound unprovable, and that must stop the test rather than quietly shrink the fixture.
 */
function worstValue(node: JsonSchema, path: string): unknown {
  if (Array.isArray(node.enum)) {
    const members = node.enum.filter((v): v is string => typeof v === "string");
    if (members.length === 0) throw new Error(`${path}: enum with no string member`);
    return members.reduce((longest, v) => (v.length > longest.length ? v : longest));
  }
  switch (node.type) {
    case "boolean":
      return true;
    case "string": {
      const max = node.maxLength;
      if (typeof max !== "number") throw new Error(`${path}: string with no maxLength`);
      return WORST.repeat(max);
    }
    case "array": {
      const max = node.maxItems;
      if (typeof max !== "number") throw new Error(`${path}: array with no maxItems`);
      const items = node.items as JsonSchema | undefined;
      if (!items) throw new Error(`${path}: array with no items schema`);
      return Array.from({ length: max }, (_, i) => worstValue(items, `${path}[${i}]`));
    }
    case "object": {
      const properties = (node.properties ?? {}) as Record<string, JsonSchema>;
      if (Object.keys(properties).length === 0)
        throw new Error(`${path}: object with no properties`);
      return Object.fromEntries(
        Object.entries(properties).map(([key, child]) => [
          key,
          worstValue(child, `${path}.${key}`),
        ]),
      );
    }
    default:
      throw new Error(`${path}: unhandled schema type ${String(node.type)}`);
  }
}

/** The identity half of the canonical Event Identity schema — the contract, not a copy of it. */
function identitySchemaNode(): JsonSchema {
  const root = canonicalIdentityJsonSchema() as JsonSchema;
  const properties = root.properties as Record<string, JsonSchema>;
  return properties.identity;
}

const WORST_IDENTITY = worstValue(identitySchemaNode(), "identity") as EventIdentity;

/**
 * The worst assignment, which is small and not part of the identity contract.
 *
 * Coherent on purpose — `high_contrast_editorial` at a non-monumental hierarchy, so both of its
 * pairings hold — because the assembly now renders `allowedPairings()` and an incoherent assignment
 * throws there as it does when the schema is built. The longest category name and the two longest
 * pairing ids keep even this small block at the top of its range.
 */
const WORST_ASSIGNMENT: SiblingAssignment = {
  family: "editorial",
  tonalDirection: "mid",
  typographyCategory: "high_contrast_editorial",
  hierarchy: "editorial",
  typographyPairings: ["hc_bodoni_inter", "hc_playfair_dmsans"],
};

describe("the inputs the bound rests on", () => {
  it("measures the instruction file, and leaves headroom without being generous about it", () => {
    const bytes = Buffer.byteLength(
      readFileSync(`${ROOT}docs/model-prompts/design-intent.system.md`, "utf8"),
      "utf8",
    );
    expect(bytes).toBeLessThanOrEqual(INSTRUCTION_BYTES);
    // If the file has grown far past the allowance, the allowance is stale rather than safe: the
    // bound should be re-derived deliberately, not quietly absorbed.
    expect(bytes).toBeGreaterThan(INSTRUCTION_BYTES / 4);
  });

  it("rebuilds the worst legal user message from the identity contract's own maxima", () => {
    const worst = assembleDesignIntentUserMessage({
      identity: WORST_IDENTITY,
      assignment: WORST_ASSIGNMENT,
    });
    expect(Buffer.byteLength(worst, "utf8")).toBeLessThanOrEqual(WORST_USER_MESSAGE_BYTES);
  });

  it("uses bytes as a token bound, which is true for a byte-level tokenizer", () => {
    // A byte-level BPE's base vocabulary is the 256 single bytes, so a string never produces more
    // tokens than it has UTF-8 bytes; merges only reduce the count. Loose, and true.
    expect(PER_ATTEMPT_INPUT_TOKEN_BOUND).toBe(
      INSTRUCTION_BYTES + WORST_USER_MESSAGE_BYTES + REPAIR_OVERHEAD_TOKENS + 1_000,
    );
    expect(PER_ATTEMPT_OUTPUT_TOKEN_BOUND).toBe(DESIGN_INTENT_MAX_OUTPUT_TOKENS);
  });

  it("computes the repair reserve from the cap the boundary enforces, not from a claim", () => {
    // The echo is capped in tokens by the output ceiling; the correction turn is capped in bytes by
    // `repairFeedback()`. An earlier draft reserved `2 × the output ceiling` and asserted the second
    // half rather than enforcing it — which was wrong, because the issue rendering amplifies.
    expect(REPAIR_OVERHEAD_TOKENS).toBe(
      DESIGN_INTENT_MAX_OUTPUT_TOKENS + REPAIR_FEEDBACK_MAX_BYTES + REPAIR_TURN_FRAMING_BYTES,
    );
  });

  it("holds a correction turn inside its reserve even for a response built to blow it up", () => {
    // The amplification case, concretely: the strict wire projection drops `maxItems`, so a
    // schema-conformant response may carry a very long array, and a per-element issue line costs
    // several times what the element cost. Five thousand elements is roughly what fits inside the
    // output ceiling; unbudgeted it renders well past the whole reserve.
    const issues: ValidationIssue[] = Array.from({ length: 5_000 }, (_, i) => ({
      path: `palette.colors.${i}`,
      message: `Invalid string: must match pattern /^#[0-9A-F]{6}$/ (received "#not-a-colour-${i}")`,
      class: "schema",
      disposition: "repair_retry_once",
    }));
    expect(Buffer.byteLength(describeIssues(issues), "utf8")).toBeGreaterThan(
      REPAIR_OVERHEAD_TOKENS,
    );

    const bounded = repairFeedback(issues);
    expect(Buffer.byteLength(bounded, "utf8")).toBeLessThanOrEqual(REPAIR_FEEDBACK_MAX_BYTES);
    // And the whole turn, framing included, is inside what the reserve holds for it.
    expect(Buffer.byteLength(bounded, "utf8") + REPAIR_TURN_FRAMING_BYTES).toBeLessThanOrEqual(
      REPAIR_OVERHEAD_TOKENS - DESIGN_INTENT_MAX_OUTPUT_TOKENS,
    );
  });

  it("never reaches the long-context tier, and refuses a profile where that stops being true", () => {
    expect(PER_ATTEMPT_INPUT_TOKEN_BOUND).toBeLessThan(GPT_5_6_SOL.longContextThresholdTokens);
    expect(() => assertProfileSupportsRequest(GPT_5_6_SOL)).not.toThrow();
    expect(() =>
      assertProfileSupportsRequest({ ...GPT_5_6_SOL, longContextThresholdTokens: 1_000 }),
    ).toThrow(/long-context threshold/);
    expect(() => assertProfileSupportsRequest({ ...GPT_5_6_SOL, maxOutputTokens: 1_000 })).toThrow(
      /output tokens/,
    );
    expect(() =>
      assertProfileSupportsRequest({ ...GPT_5_6_SOL, contextWindowTokens: 1_000 }),
    ).toThrow(/context window/);
  });

  it("prices on the same tier Event Identity does, which is what lets the estimator be shared", () => {
    expect(DESIGN_INTENT_SERVICE_TIER).toBe(EVENT_IDENTITY_SERVICE_TIER);
  });
});

describe("the derived bound", () => {
  it("is $2.00 an attempt for gpt-5.6-sol, from the long-context cache-write and output rates", () => {
    // input   83,500 × $10 / 1M = $0.835
    // output  32,000 × $30 / 1M = $0.96
    //                             ------
    //                             $1.795 → $2.00
    const raw =
      (PER_ATTEMPT_INPUT_TOKEN_BOUND * GPT_5_6_SOL.longContext.cacheWriteInput +
        PER_ATTEMPT_OUTPUT_TOKEN_BOUND * GPT_5_6_SOL.longContext.output) /
      1_000_000;
    expect(PER_ATTEMPT_INPUT_TOKEN_BOUND).toBe(83_500);
    expect(raw).toBeCloseTo(1.795, 3);
    expect(designIntentAttemptMaxUsd(MODEL)).toBe(2);
  });

  it("is not inherited from Event Identity's attempt shape", () => {
    // The plan refuses both inheriting the number and inventing one. $15 is Event Identity's
    // per-attempt bound, derived from a request that may fill a 1M-token context window.
    expect(designIntentAttemptMaxUsd(MODEL)).not.toBe(GPT_5_6_SOL.perAttemptMaxUsd);
    expect(DESIGN_INTENT_ATTEMPT_PROFILE_VERSION).toMatch(/^design_intent_attempt_v\d+@/);
  });

  it("reserves against every attempt the retry policy permits, and every concept in a batch", () => {
    expect(MAX_PROVIDER_ATTEMPTS_PER_CALL).toBe(6);
    expect(designIntentLogicalCallMaxUsd(MODEL)).toBe(12);
    expect(designIntentBatchMaxUsd(MODEL)).toBe(36);
  });

  it("charges every unpriceable attempt at the maximum, never at zero", () => {
    const attemptMax = designIntentAttemptMaxUsd(MODEL);
    const estimate = estimateDesignIntentCallCostUsd(
      GPT_5_6_SOL,
      { responses: [], providerResponses: 0, providerAttempts: 3, unknownUsageAttempts: 3 },
      attemptMax,
    );
    expect(estimate.usd).toBe(3 * attemptMax);
    expect(estimate.exact).toBe(false);
    expect(estimate.unpricedAttempts).toBe(3);
  });

  it("prices an observed response exactly, at its own tier", () => {
    const estimate = estimateDesignIntentCallCostUsd(
      GPT_5_6_SOL,
      {
        responses: [
          {
            inputTokens: 10_000,
            cachedInputTokens: 0,
            cacheWriteInputTokens: 0,
            outputTokens: 1_000,
            servedServiceTier: "default",
          },
        ],
        providerResponses: 1,
        providerAttempts: 1,
        unknownUsageAttempts: 0,
      },
      designIntentAttemptMaxUsd(MODEL),
    );
    // Standard tier: 10,000 × $4/1M + 1,000 × $20/1M = $0.04 + $0.02.
    expect(estimate.usd).toBeCloseTo(0.06, 6);
    expect(estimate.exact).toBe(true);
  });

  it("fails closed in production for a model nobody has priced", () => {
    const previous = process.env.NODE_ENV;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.env as any).NODE_ENV = "production";
    try {
      expect(() => designIntentAttemptMaxUsd("some-unpriced-model")).toThrow(
        /No verified cost profile/,
      );
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.env as any).NODE_ENV = previous;
    }
  });

  it("outside production falls back to the labelled unverified bound, which prices nothing", () => {
    expect(designIntentAttemptMaxUsd("some-unpriced-model")).toBe(
      UNVERIFIED_DEV_PROFILE.perAttemptMaxUsd,
    );
  });
});
