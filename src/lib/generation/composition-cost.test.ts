/**
 * The Composition cost bound, checked against its own inputs rather than against a memory of them.
 *
 * As with `design-intent-cost.test.ts` and `concept-premise-cost.test.ts`, every input to the
 * derivation is rebuilt here rather than restated: the instruction file is measured on disk, the
 * worst user message is reassembled from the real generators `docs/model-contracts.md §6.1` lists
 * (the EventIdentity and DesignIntent contracts' own maxima, the full-capability primitive spec and
 * rules text, the true worst three library pages any seed can draw, the longest directive sentence,
 * the whole forbidden-token list), and the attempt count is read from this boundary's own
 * constants. A primitive added to the spec, a phrase lengthened in a directive, a library page that
 * grows, or a retry bound that moves all fail here instead of silently invalidating the arithmetic.
 *
 * Acceptance criteria: N/A — spend control. `docs/development-plan.md` principle 4;
 * `docs/phase-4b-plan.md §A.5.1`, `§H.2`, Part IV T21 (the obligation this module inherits).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { canonicalJsonSchema as canonicalIdentityJsonSchema } from "@/lib/ai/event-identity/wire-schema";
import { canonicalJsonSchema as canonicalDesignIntentJsonSchema } from "@/lib/ai/design-intent/wire-schema";
import type { EventIdentity } from "@/lib/ai/event-identity/contract";
import type { DesignIntent } from "@/lib/renderer/design-intent";
import { specText, rulesText } from "@/lib/renderer/composition/prompt-text";
import type { Capabilities, ContentProfile } from "@/lib/renderer/composition/nodes";
import { ATTRACTIVE_TOKENS } from "@/lib/renderer/composition/attractive-tokens";
import {
  DIMENSIONS,
  PHRASE,
  describe as describeDirective,
  type Directive,
  type DirectiveDimension,
} from "@/lib/renderer/planner/directives";
import { A1_SITES, page } from "@/lib/renderer/library";
import { compositionExamples } from "@/lib/renderer/few-shot";

import {
  assertProfileSupportsRequest,
  COMPOSITION_ATTEMPT_PROFILE_VERSION,
  compositionAttemptMaxUsd,
  compositionBatchMaxUsd,
  compositionLogicalCallMaxUsd,
  COMPOSITION_PASSES,
  COMPOSITION_SERVICE_TIER,
  estimateCompositionCallCostUsd,
  FRAMING_TOKENS,
  INSTRUCTION_BYTES,
  MAX_PROVIDER_ATTEMPTS_PER_CALL,
  PER_ATTEMPT_INPUT_TOKEN_BOUND,
  PER_ATTEMPT_OUTPUT_TOKEN_BOUND,
  REPAIR_FEEDBACK_MAX_BYTES,
  REPAIR_OVERHEAD_TOKENS,
  REPAIR_ROUNDS,
  REPAIR_TURN_FRAMING_BYTES,
  RESPONSE_BODY_MAX_BYTES,
  WORST_USER_MESSAGE_BYTES,
} from "./composition-cost";
import { GPT_5_6_SOL, UNVERIFIED_DEV_PROFILE } from "./identity-cost";

const ROOT = new URL("../../../", import.meta.url).pathname;
const MODEL = GPT_5_6_SOL.model;

/** One UTF-16 code unit, three UTF-8 bytes — the worst ratio a BMP character can have. */
const WORST = "�";

type JsonSchema = Record<string, unknown>;

/**
 * The largest value a schema node admits, built **from the schema** rather than transcribed.
 *
 * Same method `design-intent-cost.test.ts` uses: a `.max()` that widens grows the generated
 * message and fails `WORST_USER_MESSAGE_BYTES` directly, instead of leaving a correct-looking
 * literal describing a contract that has moved. An unbounded string or array throws rather than
 * defaulting. A hex-pattern string with no `maxLength` (`palette.colors`) is the one schema shape
 * this contract uses that has no length keyword at all; it is fixed-width by its own pattern
 * (`#RRGGBB`), so it is measured as that literal width rather than treated as unbounded.
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
      if (typeof max === "number") return WORST.repeat(max);
      if (typeof node.pattern === "string") return "#FFFFFF";
      throw new Error(`${path}: string with no maxLength and no pattern`);
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
function worstIdentity(): EventIdentity {
  const root = canonicalIdentityJsonSchema() as JsonSchema;
  const properties = root.properties as Record<string, JsonSchema>;
  return worstValue(properties.identity, "identity") as EventIdentity;
}

/** The six-field DesignIntent (plus `presentation`) at its own contract's maxima. */
function worstDesignIntent(): DesignIntent {
  return worstValue(
    canonicalDesignIntentJsonSchema() as JsonSchema,
    "designIntent",
  ) as DesignIntent;
}

/** Every capability enabled — the worst case for `specText()`/`rulesText()` (§6.1: every block). */
const ALL_CAPABILITIES: Capabilities = {
  rsvp: true,
  registry: true,
  gifts: true,
  externalRegistry: true,
  cashFund: true,
  hosts: true,
  description: true,
  time: true,
  location: true,
  deadline: true,
};

const WORST_CONTENT_PROFILE: ContentProfile = {
  titleWords: 999_999,
  titleChars: 999_999,
  hostsChars: 999_999,
  venueChars: 999_999,
  descriptionChars: 999_999,
  // `Capabilities` is a separate block in the request, not a member of the profile
  // (`docs/event-renderer-system.md §2.3`), and is measured beside this one.
  registryCounts: { gift: 999_999, external: 999_999, cashfund: 999_999 },
  provisionalFields: ["title", "venue", "registry"],
};

/** The longest phrase in each of the eight directive dimensions, read from `PHRASE` itself. */
function worstDirectiveSentence(): string {
  const worst = {} as Directive;
  for (const dimension of Object.keys(DIMENSIONS) as DirectiveDimension[]) {
    const phrases = PHRASE[dimension] as Record<string, string>;
    const values = DIMENSIONS[dimension] as readonly string[];
    let best = values[0];
    for (const value of values) {
      if (phrases[value].length > phrases[best].length) best = value;
    }
    (worst as Record<string, string>)[dimension] = best;
  }
  return describeDirective(worst);
}

/**
 * The true worst three-example sum, computed from all sixteen `A1_SITES` pages directly rather
 * than sampled from `compositionExamples(seed)` across many seeds. `compositionExamples` always
 * returns three *distinct* sites, so the largest possible draw is exactly the three largest pages
 * — this is an exact upper bound, not an empirical approximation of one.
 */
function worstThreeExampleBytes(): number {
  const perSite = A1_SITES.map((s) =>
    Buffer.byteLength(
      JSON.stringify(page(s.hero, s.details, s.rsvp, s.registry, s.plan, s.align)),
      "utf8",
    ),
  ).sort((a, b) => b - a);
  // The real call serializes the three as one array; a few bytes of array framing on top of the
  // sum of the three objects errs upward, which is the right direction for a bound.
  return perSite.slice(0, 3).reduce((a, b) => a + b, 0) + 8;
}

describe("the inputs the bound rests on", () => {
  it("measures the instruction file, and leaves headroom without being generous about it", () => {
    const bytes = Buffer.byteLength(
      readFileSync(`${ROOT}docs/model-prompts/composition.system.md`, "utf8"),
      "utf8",
    );
    expect(bytes).toBeLessThanOrEqual(INSTRUCTION_BYTES);
    // A stale allowance is not a safe one: if the file has shrunk far below it, the bound should
    // be re-derived deliberately rather than quietly carrying slack nobody chose.
    expect(bytes).toBeGreaterThan(INSTRUCTION_BYTES / 4);
  });

  it("rebuilds the worst legal user message from every block §6.1 lists", () => {
    const identityBytes = Buffer.byteLength(JSON.stringify(worstIdentity()), "utf8");
    const designIntentBytes = Buffer.byteLength(JSON.stringify(worstDesignIntent()), "utf8");
    const contentProfileBytes = Buffer.byteLength(JSON.stringify(WORST_CONTENT_PROFILE), "utf8");
    const capabilitiesBytes = Buffer.byteLength(JSON.stringify(ALL_CAPABILITIES), "utf8");
    const specBytes = Buffer.byteLength(specText(ALL_CAPABILITIES), "utf8");
    const rulesBytes = Buffer.byteLength(rulesText(ALL_CAPABILITIES), "utf8");
    const forbiddenTokensBytes = Buffer.byteLength(
      JSON.stringify(ATTRACTIVE_TOKENS.map((t) => t.id)),
      "utf8",
    );
    const directiveBytes = Buffer.byteLength(worstDirectiveSentence(), "utf8");
    const examplesBytes = worstThreeExampleBytes();

    const measured =
      identityBytes +
      designIntentBytes +
      contentProfileBytes +
      capabilitiesBytes +
      specBytes +
      rulesBytes +
      forbiddenTokensBytes +
      directiveBytes +
      examplesBytes;

    expect(measured).toBeLessThanOrEqual(WORST_USER_MESSAGE_BYTES);
    // If the measured sum has drifted far below the allowance, the allowance is stale rather than
    // safe — the same asymmetric check every instruction-file measurement above applies.
    expect(measured).toBeGreaterThan(WORST_USER_MESSAGE_BYTES / 4);
  });

  it("bounds three examples by the true worst draw, not a sampled one", () => {
    // `compositionExamples` always returns exactly three distinct sites; check that holds across a
    // wide seed range, so the "exact upper bound" reasoning above stays valid.
    for (let seed = 0; seed < 200; seed += 17) {
      const trees = compositionExamples(seed);
      expect(trees).toHaveLength(3);
      const bytes = Buffer.byteLength(JSON.stringify(trees), "utf8");
      expect(bytes).toBeLessThanOrEqual(worstThreeExampleBytes());
    }
  });

  it("bounds output by the response-body cap plus a reasoning reserve, both named", () => {
    // docs/event-renderer-system.md §2.4: "Response body ≤ 12 KB."
    expect(RESPONSE_BODY_MAX_BYTES).toBe(12_000);
    expect(PER_ATTEMPT_OUTPUT_TOKEN_BOUND).toBeGreaterThan(RESPONSE_BODY_MAX_BYTES);
  });

  it("uses bytes as a token bound, which is true for a byte-level tokenizer", () => {
    expect(PER_ATTEMPT_INPUT_TOKEN_BOUND).toBe(
      INSTRUCTION_BYTES + WORST_USER_MESSAGE_BYTES + REPAIR_OVERHEAD_TOKENS + FRAMING_TOKENS,
    );
  });

  it("reserves for every one of the three distinct re-prompt reasons, once each", () => {
    // docs/model-contracts.md §6.3, §8: schema-invalid, a token-cap violation, a selector
    // collision — each documented as happening once, and nothing else opens a model turn.
    expect(REPAIR_ROUNDS).toBe(3);
    expect(COMPOSITION_PASSES).toBe(4);
    expect(REPAIR_OVERHEAD_TOKENS).toBe(
      REPAIR_ROUNDS *
        (PER_ATTEMPT_OUTPUT_TOKEN_BOUND + REPAIR_FEEDBACK_MAX_BYTES + REPAIR_TURN_FRAMING_BYTES),
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
    // The unverified development fallback prices nothing and is not asserted against.
    expect(() => assertProfileSupportsRequest(UNVERIFIED_DEV_PROFILE)).not.toThrow();
  });

  it("prices on the tier Event Identity's estimator was built to recognize", () => {
    expect(COMPOSITION_SERVICE_TIER).toBe("default");
  });
});

describe("the derived bound", () => {
  it("prices the worst attempt from the long-context cache-write and output rates", () => {
    const raw =
      (PER_ATTEMPT_INPUT_TOKEN_BOUND * GPT_5_6_SOL.longContext.cacheWriteInput +
        PER_ATTEMPT_OUTPUT_TOKEN_BOUND * GPT_5_6_SOL.longContext.output) /
      1_000_000;
    expect(compositionAttemptMaxUsd(MODEL)).toBeGreaterThanOrEqual(raw);
    // Pinned to the current derivation's numbers so a silent drift in any input is caught by a
    // changed dollar figure, not just by the inequality above.
    expect(PER_ATTEMPT_INPUT_TOKEN_BOUND).toBe(236_500);
    expect(PER_ATTEMPT_OUTPUT_TOKEN_BOUND).toBe(48_000);
    expect(compositionAttemptMaxUsd(MODEL)).toBe(4);
    expect(COMPOSITION_ATTEMPT_PROFILE_VERSION).toMatch(/^composition_attempt_v\d+@/);
  });

  it("is not inherited from Event Identity's or DesignIntent's attempt shape", () => {
    expect(compositionAttemptMaxUsd(MODEL)).not.toBe(GPT_5_6_SOL.perAttemptMaxUsd);
  });

  it("reserves against every attempt the retry policy permits, and every concept in a batch", () => {
    expect(MAX_PROVIDER_ATTEMPTS_PER_CALL).toBe(12);
    expect(compositionLogicalCallMaxUsd(MODEL)).toBe(48);
    expect(compositionBatchMaxUsd(MODEL)).toBe(144);
  });

  it("charges every unpriceable attempt at the maximum, never at zero", () => {
    const attemptMax = compositionAttemptMaxUsd(MODEL);
    const estimate = estimateCompositionCallCostUsd(
      GPT_5_6_SOL,
      { responses: [], providerResponses: 0, providerAttempts: 3, unknownUsageAttempts: 3 },
      attemptMax,
    );
    expect(estimate.usd).toBe(3 * attemptMax);
    expect(estimate.exact).toBe(false);
    expect(estimate.unpricedAttempts).toBe(3);
  });

  it("prices an observed response exactly, at its own tier", () => {
    const estimate = estimateCompositionCallCostUsd(
      GPT_5_6_SOL,
      {
        responses: [
          {
            inputTokens: 20_000,
            cachedInputTokens: 0,
            cacheWriteInputTokens: 0,
            outputTokens: 3_000,
            servedServiceTier: "default",
          },
        ],
        providerResponses: 1,
        providerAttempts: 1,
        unknownUsageAttempts: 0,
      },
      compositionAttemptMaxUsd(MODEL),
    );
    // Standard tier: 20,000 × $4/1M + 3,000 × $20/1M = $0.08 + $0.06.
    expect(estimate.usd).toBeCloseTo(0.14, 6);
    expect(estimate.exact).toBe(true);
  });

  it("fails closed in production for a model nobody has priced", () => {
    const previous = process.env.NODE_ENV;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.env as any).NODE_ENV = "production";
    try {
      expect(() => compositionAttemptMaxUsd("some-unpriced-model")).toThrow(
        /No verified cost profile/,
      );
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.env as any).NODE_ENV = previous;
    }
  });

  it("outside production falls back to the labelled unverified bound, which prices nothing", () => {
    expect(compositionAttemptMaxUsd("some-unpriced-model")).toBe(
      UNVERIFIED_DEV_PROFILE.perAttemptMaxUsd,
    );
  });
});
