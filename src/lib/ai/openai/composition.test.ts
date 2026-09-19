/**
 * The Composition provider boundary, against a fake provider rather than a real one.
 *
 * The expensive mistake this file exists to catch is a **re-prompt that canon does not permit**.
 * `docs/model-contracts.md §6.3` allows exactly three, one each for a schema-invalid response, an
 * attractive-token violation and a selector collision, and repairs everything else deterministically.
 * Every other defect class — structural, coverage, capability, responsive, box, motif-kind, fit —
 * must cost zero model passes, and a boundary that quietly asked again for one of them would look
 * like a better model in every metric while spending money and destroying the evidence CO-01 and
 * CO-02 are measured from.
 *
 * So the assertions below are about **provider-call counts** as much as about return values: "it
 * recovered" and "it recovered without paying for another answer" are different claims, and only
 * the second one is the contract.
 *
 * The second thing tested here is **attribution**. A library fallback is a legitimate outcome and
 * an illegitimate one is indistinguishable from it in the rendered page, so `§8`'s rule — a
 * fallback "is never presented as a model composition" — is only real if the result says so.
 *
 * No network, no provider key, no live call: `openai` is mocked at the module boundary.
 *
 * Acceptance criteria: N/A — test-only. `docs/model-contracts.md §6.3`, `§6.4`, `§8`;
 * `spec.md §32 #21`, `#22`; `docs/event-renderer-system.md §3`, `§5`, `§7.1`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { novelTree } from "../../../../tests/fixtures/novel-composition";
import { compositionBrief } from "@/lib/ai/composition/brief";
import type { CompositionCallInput } from "@/lib/ai/composition/contract";
import type { EventIdentity } from "@/lib/ai/event-identity/contract";
import type { Capabilities, CompositionTree } from "@/lib/renderer/composition/nodes";
import { validateSchema } from "@/lib/renderer/composition/validate-schema";
import { validateStructure } from "@/lib/renderer/composition/validate-structure";
import type { DesignIntent } from "@/lib/renderer/design-intent";
import { tokenViolations } from "@/lib/renderer/planner";
import { sample } from "@/lib/renderer/planner/directives";

const create = vi.fn();

vi.mock("openai", () => ({
  default: class {
    responses = { create };
  },
}));

const CAPABILITIES: Capabilities = {
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

const IDENTITY = {
  creativeDirection: "A restrained, tactile winter identity built on materials.",
  toneKeywords: ["restrained"],
  colorsExplicitlyConstrained: false,
  paletteIntent: {
    requiredColors: [],
    preferredColors: [],
    avoidColors: [],
    dominanceNotes: "",
  },
  tonalIntent: "Mid-toned and warm.",
  toneExplicitlyConstrained: false,
  compatibleTonalDirections: ["mid"],
  compatibleFamilies: ["editorial"],
  compatibleTypographyCategories: ["oldstyle"],
  visualMotifs: ["fine double-rule framing"],
  textureDirection: "linen-like",
  typographyDirection: "quiet oldstyle serif",
  copyTone: "warm and unfussy",
  hostConstraints: ["No religious imagery anywhere on the site"],
  creativeGuidance: ["A deckled paper edge would suit it"],
  inspirationSummary: "No visual inspiration supplied.",
} as EventIdentity;

const INTENT: DesignIntent = {
  family: "editorial",
  tonalDirection: "mid",
  palette: { colors: ["#1B2A41", "#C9A227", "#F4F1EA"], dominant: "#1B2A41" },
  typographyPairing: "oldstyle_garamond_worksans",
  density: "balanced",
  composition: {
    asymmetry: "gentle",
    hierarchy: "editorial",
    rhythm: "alternating",
    sectionContrast: "moderate",
    ornament: "restrained",
  },
  motifs: ["linen"],
};

/**
 * `novelTree()` deliberately uses two of the three attractive tokens — a cascading `EventTitle`
 * and a hero `Date` numeral — so it is the fixture for the cap path. Cleaning both gives the
 * fixture for every other path, from the same tree, so the two differ in exactly what is under
 * test.
 */
function tokenTree(): CompositionTree {
  return novelTree();
}

function cleanTree(): CompositionTree {
  const tree = novelTree();
  const json = JSON.stringify(tree)
    .replace('"layout":"cascade"', '"layout":"block"')
    .replace('{"t":"Date","form":"numeral","emphasis":"display"}', '{"t":"Date","form":"full"}');
  return JSON.parse(json) as CompositionTree;
}

/** Schema-valid, structurally broken: the rsvp section is gone while the capability is enabled. */
function coverageDefectTree(): CompositionTree {
  const tree = cleanTree();
  return { ...tree, sections: tree.sections.filter((section) => section.kind !== "rsvp") };
}

const FORBIDDEN = ["staggerTitle", "heroNumeral"] as const;

function input(overrides: Partial<CompositionCallInput> = {}): CompositionCallInput {
  return {
    brief: compositionBrief(IDENTITY),
    contentProfile: {
      titleWords: 3,
      titleChars: 22,
      hostsChars: 31,
      venueChars: 18,
      descriptionChars: 140,
      registryCounts: { gift: 4, external: 1, cashfund: 0 },
      provisionalFields: [],
    },
    capabilities: CAPABILITIES,
    designIntent: INTENT,
    directive: sample(11),
    forbiddenTokens: [...FORBIDDEN],
    seed: 4242,
    ...overrides,
  };
}

/** A provider response. `value` may be an object (serialized) or a raw string. */
function ok(value: unknown, id = "resp_test") {
  return {
    id,
    model: "gpt-5.6-sol",
    service_tier: "default",
    output_text: typeof value === "string" ? value : JSON.stringify(value),
    usage: {
      input_tokens: 12_000,
      output_tokens: 2_400,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 1_800 },
    },
  };
}

function providerError(status?: number) {
  return Object.assign(new Error("boom"), { status });
}

async function load() {
  return import("./composition");
}

/** The call sleeps between transient retries; let the timers run while it does. */
async function run(overrides: Partial<CompositionCallInput> = {}) {
  const { generateComposition } = await load();
  const promise = generateComposition(input(overrides));
  const settled = promise.then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error }),
  );
  await vi.runAllTimersAsync();
  return settled;
}

describe("the OpenAI Composition call", () => {
  beforeEach(() => {
    vi.resetModules();
    create.mockReset();
    process.env.OPENAI_API_KEY = "test-key-that-is-long-enough";
    process.env.OPENAI_MODEL = "gpt-5.6-sol";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  describe("the fixtures themselves", () => {
    it("are what the tests below assume: one clean tree, one that breaks the allotment", () => {
      expect(validateSchema(cleanTree()).ok).toBe(true);
      expect(tokenViolations(cleanTree(), FORBIDDEN)).toEqual([]);
      expect(tokenViolations(tokenTree(), FORBIDDEN).sort()).toEqual([
        "heroNumeral",
        "staggerTitle",
      ]);
    });

    it("include a tree that is schema-valid and structurally broken", () => {
      // The whole point of the zero-re-prompt test below: the defect has to be real, and it has to
      // be one `validateSchema` cannot see.
      expect(validateSchema(coverageDefectTree()).ok).toBe(true);
      expect(validateStructure(coverageDefectTree(), CAPABILITIES).length).toBeGreaterThan(0);
    });
  });

  describe("the request", () => {
    it("pins the model, tier, store flag, reasoning effort and output ceiling", async () => {
      create.mockResolvedValue(ok(cleanTree()));
      const {
        COMPOSITION_MAX_OUTPUT_TOKENS,
        COMPOSITION_REASONING_EFFORT,
        COMPOSITION_SERVICE_TIER,
        COMPOSITION_STORE_RESPONSES,
      } = await load();
      const { error } = await run();
      expect(error).toBeUndefined();

      expect(create).toHaveBeenCalledTimes(1);
      const request = create.mock.calls[0][0];
      expect(request.model).toBe("gpt-5.6-sol");
      expect(request.service_tier).toBe(COMPOSITION_SERVICE_TIER);
      expect(request.store).toBe(COMPOSITION_STORE_RESPONSES);
      expect(request.store).toBe(false);
      expect(request.reasoning).toEqual({ effort: COMPOSITION_REASONING_EFFORT });
      expect(request.max_output_tokens).toBe(COMPOSITION_MAX_OUTPUT_TOKENS);
      // JSON mode, not provider-side schema enforcement — `docs/model-contracts.md §3`.
      expect(request.text.format).toEqual({ type: "json_object" });
    });

    it("does not inherit the shared reasoning-effort environment variable", async () => {
      process.env.OPENAI_REASONING_EFFORT = "low";
      create.mockResolvedValue(ok(cleanTree()));
      const { COMPOSITION_REASONING_EFFORT } = await load();
      await run();
      expect(create.mock.calls[0][0].reasoning.effort).toBe(COMPOSITION_REASONING_EFFORT);
      expect(COMPOSITION_REASONING_EFFORT).toBe("high");
      delete process.env.OPENAI_REASONING_EFFORT;
    });

    it("sends the committed prompt file as the system message and the assembly as the user one", async () => {
      create.mockResolvedValue(ok(cleanTree()));
      const { systemPrompt } = await load();
      const { assembleCompositionUserMessage } = await import("./composition-input");
      const { value } = await run();

      const messages = create.mock.calls[0][0].input;
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ role: "system", content: systemPrompt() });
      expect(messages[1].role).toBe("user");
      expect(messages[1].content).toBe(assembleCompositionUserMessage(input(), { avoid: [] }));
      expect(value?.requestTexts).toEqual([messages[1].content]);
      expect(value?.requestText).toBe(messages[1].content);
    });
  });

  describe("a first-call success", () => {
    it("returns the tree, the presentation and every version", async () => {
      create.mockResolvedValue(ok(cleanTree()));
      const { value, error } = await run();
      expect(error).toBeUndefined();

      expect(value!.output).toEqual(cleanTree());
      expect(value!.response).toEqual(cleanTree());
      expect(value!.fallback).toBeNull();
      expect(value!.repairs).toEqual([]);
      expect(value!.promptVersion).toBe("composition_v1_p4");
      expect(value!.schemaVersion).toBe("composition_schema_v2");
      expect(value!.primitiveSetVersion).toBe("composition_v2");
      expect(value!.inputAssemblyVersion).toBe("composition_input_v2");
      expect(value!.usage.schemaValidFirstCall).toBe(true);
      expect(value!.usage.reprompts).toEqual({ schema: 0, token_cap: 0, collision: 0 });
      expect(value!.usage.providerAttempts).toBe(1);
      expect(value!.rawResponses).toEqual([value!.raw]);
    });

    it("returns a bare CompositionTree: two top-level keys and nothing else", async () => {
      create.mockResolvedValue(ok(cleanTree()));
      const { value } = await run();
      const { COMPOSITION_RESPONSE_KEYS } = await import("@/lib/ai/composition/contract");
      expect(Object.keys(value!.output).sort()).toEqual([...COMPOSITION_RESPONSE_KEYS].sort());
    });

    it("refuses a `presentation` key as the unknown key it is", async () => {
      // The concept card belongs to the DesignIntent response (`spec.md §32 #12`), is validated
      // there, and is reviewed as a set by `generation/concept-set.ts`. A composition response
      // carrying one is an unknown top-level key, which `composition.schema.json` closes off with
      // `additionalProperties: false` — so it takes the ordinary one schema re-prompt rather than
      // being quietly stripped and accepted, which would create a second, unreviewed source of
      // concept names.
      const withCard = {
        ...cleanTree(),
        presentation: { name: "Pressed Garden", description: "A quiet winter invitation." },
      };
      expect(validateSchema(withCard).ok).toBe(false);

      create.mockResolvedValueOnce(ok(withCard)).mockResolvedValueOnce(ok(cleanTree()));
      const { value, error } = await run();
      expect(error).toBeUndefined();
      expect(create).toHaveBeenCalledTimes(2);
      expect(value!.usage.reprompts.schema).toBe(1);
      expect(create.mock.calls[1][0].input[3].content).toContain("presentation");
      expect(value!.output).toEqual(cleanTree());
    });
  });

  describe("schema-invalid output", () => {
    it("re-prompts exactly once, with the validator's error list, and accepts the correction", async () => {
      create
        .mockResolvedValueOnce(ok({ version: "composition_v1", sections: [], extra: 1 }))
        .mockResolvedValueOnce(ok(cleanTree()));
      const { value, error } = await run();
      expect(error).toBeUndefined();

      expect(create).toHaveBeenCalledTimes(2);
      expect(value!.usage.reprompts).toEqual({ schema: 1, token_cap: 0, collision: 0 });
      expect(value!.usage.schemaValidFirstCall).toBe(false);
      expect(value!.fallback).toBeNull();

      // The correction turn shows the model its own rejected answer and the errors — not a bare
      // "try again", which would be a re-roll rather than a repair.
      const second = create.mock.calls[1][0].input;
      expect(second).toHaveLength(4);
      expect(second[2].role).toBe("assistant");
      expect(second[3].content).toContain("did not satisfy the CompositionTree schema");
      expect(second[3].content).toContain("schema.key");
      // The user message itself is unchanged: a schema repair resends the same bytes.
      expect(second[1].content).toBe(create.mock.calls[0][0].input[1].content);
      expect(value!.requestTexts).toHaveLength(1);
    });

    it("falls back to the library after the second failure, and says so", async () => {
      create.mockResolvedValue(ok({ version: "composition_v1", sections: [], extra: 1 }));
      const { value, error } = await run();
      expect(error).toBeUndefined();

      expect(create).toHaveBeenCalledTimes(2);
      expect(value!.fallback).toMatchObject({
        reason: "schema-invalid-after-retry",
        source: "library",
        seed: 4242,
        attemptsSpent: 2,
      });
      expect(validateSchema(value!.output).ok).toBe(true);
      // §8: a fallback is never presented as a model composition, so the discarded response is
      // not reported as "the response" beside a page it did not author.
      expect(value!.response).toBeUndefined();
      // Both responses were paid for and both are preserved.
      expect(value!.rawResponses).toHaveLength(2);
      expect(value!.usage.responses).toHaveLength(2);
    });

    it("treats unparseable JSON as schema-invalid, on the same one-re-prompt budget", async () => {
      create.mockResolvedValueOnce(ok("{ not json at all")).mockResolvedValueOnce(ok(cleanTree()));
      const { value, error } = await run();
      expect(error).toBeUndefined();
      expect(create).toHaveBeenCalledTimes(2);
      expect(value!.usage.reprompts.schema).toBe(1);
      expect(create.mock.calls[1][0].input[3].content).toContain("schema.json");
    });
  });

  describe("an attractive-token violation", () => {
    it("re-prompts once, and accepts a correction that clears it without neutralizing", async () => {
      create.mockResolvedValueOnce(ok(tokenTree())).mockResolvedValueOnce(ok(cleanTree()));
      const { value, error } = await run();
      expect(error).toBeUndefined();

      expect(create).toHaveBeenCalledTimes(2);
      expect(value!.usage.reprompts).toEqual({ schema: 0, token_cap: 1, collision: 0 });
      expect(value!.repairs).toEqual([]);
      expect(value!.output).toEqual(cleanTree());
      expect(create.mock.calls[1][0].input[3].content).toContain(
        "used a device this candidate was not allotted",
      );
    });

    it("still reports the first response as schema-valid: CO-01 measures parsing, not allotment", async () => {
      create.mockResolvedValueOnce(ok(tokenTree())).mockResolvedValueOnce(ok(cleanTree()));
      const { value } = await run();
      // The first answer parsed strictly. Deriving this from the pass index would call it invalid
      // and understate CO-01 by every token-cap and collision case in a run.
      expect(value!.usage.schemaValidFirstCall).toBe(true);
      expect(value!.usage.reprompts.token_cap).toBe(1);
    });

    it("neutralizes deterministically when it persists — and does NOT ask a second time", async () => {
      create.mockResolvedValue(ok(tokenTree()));
      const { value, error } = await run();
      expect(error).toBeUndefined();

      // Two calls: the original and the one re-prompt. The third answer is never bought.
      expect(create).toHaveBeenCalledTimes(2);
      expect(value!.usage.reprompts).toEqual({ schema: 0, token_cap: 1, collision: 0 });
      // …and it is a repair, not a fallback: the model's page survives, minus the devices.
      expect(value!.fallback).toBeNull();
      expect(value!.repairs.length).toBeGreaterThan(0);
      expect(value!.repairs.every((repair) => repair.kind === "planner")).toBe(true);
      expect(tokenViolations(value!.output, FORBIDDEN)).toEqual([]);
      // The response as it arrived is preserved unmutated beside the repaired tree.
      expect(
        tokenViolations((value!.response as CompositionTree) ?? cleanTree(), FORBIDDEN),
      ).not.toEqual([]);
    });
  });

  describe("a selector collision", () => {
    const SIBLING_SKELETONS = ["hero:Rail>Split>Overlay", "hero:Rail>Split>Grid"];

    it("re-prompts once, rebuilding the message with the avoid block", async () => {
      create.mockResolvedValueOnce(ok(cleanTree())).mockResolvedValueOnce(ok(cleanTree()));
      const collides = vi.fn().mockReturnValueOnce(SIBLING_SKELETONS).mockReturnValueOnce(null);
      const { value, error } = await run({ collides });
      expect(error).toBeUndefined();

      expect(create).toHaveBeenCalledTimes(2);
      expect(collides).toHaveBeenCalledTimes(2);
      expect(value!.usage.reprompts).toEqual({ schema: 0, token_cap: 0, collision: 1 });

      const second = create.mock.calls[1][0].input;
      // §6.1's `avoid` is a block of the user message, so the message changed — unlike a schema
      // or token-cap re-prompt, which resends the same bytes.
      expect(second[1].content).not.toBe(create.mock.calls[0][0].input[1].content);
      expect(second[1].content).toContain("9. Avoid");
      for (const skeleton of SIBLING_SKELETONS) expect(second[1].content).toContain(skeleton);
      expect(value!.requestTexts).toHaveLength(2);
      expect(value!.requestText).toBe(second[1].content);
    });

    it("falls back to the library on a second collision, attributed as a collision", async () => {
      create.mockResolvedValue(ok(cleanTree()));
      const collides = vi.fn().mockReturnValue(SIBLING_SKELETONS);
      const { value, error } = await run({ collides });
      expect(error).toBeUndefined();

      expect(create).toHaveBeenCalledTimes(2);
      expect(value!.fallback).toMatchObject({
        reason: "selector-collision-after-retry",
        source: "library",
        seed: 4242,
        attemptsSpent: 2,
      });
      expect(validateSchema(value!.output).ok).toBe(true);
      expect(value!.response).toBeUndefined();
    });

    it("runs no selector at all when the batch injected none", async () => {
      create.mockResolvedValue(ok(cleanTree()));
      const { value } = await run();
      expect(create).toHaveBeenCalledTimes(1);
      expect(value!.usage.reprompts.collision).toBe(0);
    });
  });

  describe("everything canon repairs deterministically", () => {
    it("costs zero re-prompts for a structural or coverage defect", async () => {
      // A tree with no rsvp section while `capabilities.rsvp` is true is a coverage defect the
      // compiler repairs. `spec.md §32 #22` forbids asking the model about it, so the boundary
      // hands it on untouched and buys exactly one answer.
      create.mockResolvedValue(ok(coverageDefectTree()));
      const { value, error } = await run();
      expect(error).toBeUndefined();

      expect(create).toHaveBeenCalledTimes(1);
      expect(value!.usage.reprompts).toEqual({ schema: 0, token_cap: 0, collision: 0 });
      expect(value!.fallback).toBeNull();
      expect(value!.repairs).toEqual([]);
      // The defect really did travel through: this boundary did not repair it either, because
      // structural repair is the compiler's step, not this one's.
      expect(validateStructure(value!.output, CAPABILITIES).length).toBeGreaterThan(0);
    });

    it("hands on a sectionless tree instead of crashing on it or re-prompting for it", async () => {
      // `validateSchema` bounds a section's shape, not how many there are, so `sections: []` is a
      // schema-valid response — and the `heroNumeral` detector reads `sections[0]` directly. The
      // boundary must neither throw nor treat a section-count defect as a token-cap violation.
      const empty = { version: "composition_v1", sections: [] };
      expect(validateSchema(empty).ok).toBe(true);
      expect(validateStructure(empty as CompositionTree, CAPABILITIES).length).toBeGreaterThan(0);

      create.mockResolvedValue(ok(empty));
      const { value, error } = await run();
      expect(error).toBeUndefined();
      expect(create).toHaveBeenCalledTimes(1);
      expect(value!.usage.reprompts).toEqual({ schema: 0, token_cap: 0, collision: 0 });
      expect(value!.output).toEqual(empty);
      expect(value!.repairs).toEqual([]);
    });
  });

  describe("transient provider failures", () => {
    it("retries within a pass and does not count as a re-prompt", async () => {
      create
        .mockRejectedValueOnce(providerError(503))
        .mockRejectedValueOnce(providerError(429))
        .mockResolvedValueOnce(ok(cleanTree()));
      const { value, error } = await run();
      expect(error).toBeUndefined();

      expect(create).toHaveBeenCalledTimes(3);
      expect(value!.usage.transientRetries).toBe(2);
      expect(value!.usage.providerAttempts).toBe(3);
      // The model was asked the same question once. Two attempts never produced an answer.
      expect(value!.usage.reprompts).toEqual({ schema: 0, token_cap: 0, collision: 0 });
      expect(value!.usage.providerResponses).toBe(1);
      expect(value!.usage.unknownUsageAttempts).toBe(2);
      expect(value!.usage.schemaValidFirstCall).toBe(true);
    });

    it("gives up after the bounded retries and preserves what was already paid for", async () => {
      create
        .mockResolvedValueOnce(ok({ version: "composition_v1", sections: [], extra: 1 }))
        .mockRejectedValue(providerError(500));
      const { value, error } = await run();
      expect(value).toBeUndefined();

      const { MAX_TRANSIENT_RETRIES } = await load();
      const { CompositionError } = await import("@/lib/ai/composition/contract");
      expect(error).toBeInstanceOf(CompositionError);
      const failure = error as InstanceType<typeof CompositionError>;
      expect(failure.kind).toBe("provider");
      // The first pass's response was billed and is not lost by a later transport failure.
      expect(failure.rawResponses).toHaveLength(1);
      expect(failure.usage?.providerAttempts).toBe(1 + (MAX_TRANSIENT_RETRIES + 1));
      expect(failure.usage?.reprompts).toEqual({ schema: 1, token_cap: 0, collision: 0 });
    });

    it("does not retry a non-transient failure", async () => {
      create.mockRejectedValue(providerError(400));
      const { error } = await run();
      expect(create).toHaveBeenCalledTimes(1);
      expect((error as { kind?: string }).kind).toBe("provider");
    });
  });

  describe("usage and telemetry", () => {
    it("records every provider response separately, so each is priced at its own tier", async () => {
      create
        .mockResolvedValueOnce({
          ...ok({ version: "composition_v1", sections: [], extra: 1 }, "resp_one"),
          service_tier: "flex",
        })
        .mockResolvedValueOnce(ok(cleanTree(), "resp_two"));
      const { value, error } = await run();
      expect(error).toBeUndefined();

      expect(value!.usage.responses).toHaveLength(2);
      expect(value!.usage.responses[0].servedServiceTier).toBe("flex");
      expect(value!.usage.responses[1].servedServiceTier).toBe("default");
      // The summary is the sum of both, rejected response included: we paid for it.
      expect(value!.usage.inputTokens).toBe(24_000);
      expect(value!.usage.outputTokens).toBe(4_800);
      expect(value!.usage.reasoningTokens).toBe(3_600);
      expect(value!.usage.providerResponses).toBe(2);
      // The accepted response's id, not the rejected one's.
      expect(value!.usage.providerRequestId).toBe("resp_two");
      expect(value!.rawResponses).toHaveLength(2);
    });

    it("counts a response with no usage block as unpriceable rather than free", async () => {
      create.mockResolvedValue({ ...ok(cleanTree()), usage: undefined });
      const { value } = await run();
      expect(value!.usage.unknownUsageAttempts).toBe(1);
      expect(value!.usage.inputTokens).toBeUndefined();
    });
  });

  describe("the policy's own bounds", () => {
    it("allows four passes: the original and one re-prompt per permitted reason", async () => {
      const { COMPOSITION_PASSES, MAX_PROVIDER_ATTEMPTS_PER_CALL, MAX_TRANSIENT_RETRIES } =
        await load();
      expect(COMPOSITION_PASSES).toBe(4);
      expect(MAX_PROVIDER_ATTEMPTS_PER_CALL).toBe(COMPOSITION_PASSES * (MAX_TRANSIENT_RETRIES + 1));
    });

    it("fits inside the bounds `generation/composition-cost.ts` reserved for it", async () => {
      // That module derived its spend reservation *before* this adapter existed, and says so in as
      // many words: "When that runner is built, it must be configured to fit inside these bounds".
      // This is the test it asks for. A request shape that outgrew the reserve would spend real
      // money past a bound nothing else would notice.
      const adapter = await load();
      const cost = await import("@/lib/generation/composition-cost");

      expect(adapter.MAX_TRANSIENT_RETRIES).toBe(2);
      expect(adapter.COMPOSITION_SERVICE_TIER).toBe(cost.COMPOSITION_SERVICE_TIER);
      expect(adapter.COMPOSITION_PASSES).toBe(cost.COMPOSITION_PASSES);
      expect(adapter.MAX_PROVIDER_ATTEMPTS_PER_CALL).toBe(cost.MAX_PROVIDER_ATTEMPTS_PER_CALL);
      expect(adapter.COMPOSITION_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(
        cost.PER_ATTEMPT_OUTPUT_TOKEN_BOUND,
      );

      const assembly = await import("./composition-input");
      expect(assembly.SCHEMA_FEEDBACK_MAX_BYTES).toBeLessThanOrEqual(
        cost.REPAIR_FEEDBACK_MAX_BYTES,
      );
      expect(assembly.CORRECTION_TURN_FRAMING_BYTES).toBeLessThanOrEqual(
        cost.REPAIR_TURN_FRAMING_BYTES,
      );
    });

    it("spends the three budgets independently, never more than once each", async () => {
      // Schema-invalid, then legal but over the allotment, then legal but colliding, then clear:
      // the longest run canon permits. Four answers, three re-prompts, one of each kind.
      create
        .mockResolvedValueOnce(ok({ version: "composition_v1", sections: [], extra: 1 }))
        .mockResolvedValueOnce(ok(tokenTree()))
        .mockResolvedValueOnce(ok(cleanTree()))
        .mockResolvedValueOnce(ok(cleanTree()));
      const collides = vi
        .fn()
        .mockReturnValueOnce(["hero:Rail>Split>Overlay"])
        .mockReturnValueOnce(null);
      const { value, error } = await run({ collides });
      expect(error).toBeUndefined();

      expect(create).toHaveBeenCalledTimes(4);
      expect(value!.usage.reprompts).toEqual({ schema: 1, token_cap: 1, collision: 1 });
      expect(value!.fallback).toBeNull();
      expect(value!.repairs).toEqual([]);
      expect(value!.rawResponses).toHaveLength(4);
    });
  });
});
