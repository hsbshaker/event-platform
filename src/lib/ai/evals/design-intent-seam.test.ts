/**
 * The seam reaches production's own boundary, and is not a second assembly wearing its name.
 *
 * `docs/phase-4b-plan.md`, after "The stop point", quoting 4B's T9: *"A second assembly written for
 * the harness would let the set pass while production sent something else, which is the one outcome
 * that makes the whole exercise worthless."* That is a property of the code, so it is proved as
 * one — not by reading the seam and agreeing it looks right.
 *
 * The instrument is the one `src/lib/ai/openai/assembly.golden.test.ts` uses, one level up: with
 * only the OpenAI SDK mocked, drive a request through the seam and a second through
 * `generateDesignIntent` directly, and require the two request bodies to be identical byte for
 * byte. A harness-side assembly, a different schema, a different service tier, a different output
 * cap or a helpfully reworded label would all separate them.
 *
 * Nothing here calls a provider. The SDK is mocked at the module boundary, so no key is read and no
 * client reaches the network.
 *
 * Acceptance criteria: N/A — benchmark integrity. `docs/model-contracts.md §4.7`;
 * `docs/phase-4b-plan.md` Part IV T21.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EventIdentity } from "@/lib/ai/event-identity/contract";
import type { SiblingAssignment } from "@/lib/renderer/planner";

const create = vi.fn();

vi.mock("openai", () => ({
  default: class {
    responses = { create };
  },
}));

const ROOT = new URL("../../../../", import.meta.url).pathname;

const ASSIGNMENT: SiblingAssignment = {
  family: "editorial",
  tonalDirection: "mid",
  typographyCategory: "heritage",
  hierarchy: "editorial",
  typographyPairings: ["heritage_caslon_karla", "heritage_baskerville_inter"],
};

const IDENTITY = {
  creativeDirection: "A restrained, tactile winter identity built on materials rather than motifs.",
  toneKeywords: ["restrained", "tactile", "warm"],
  colorsExplicitlyConstrained: false,
  paletteIntent: {
    requiredColors: [],
    preferredColors: ["ivory"],
    avoidColors: [],
    dominanceNotes: "",
  },
  tonalIntent: "Mid-toned and warm, with quiet contrast.",
  toneExplicitlyConstrained: false,
  compatibleTonalDirections: ["mid"],
  compatibleFamilies: ["editorial"],
  compatibleTypographyCategories: ["heritage"],
  visualMotifs: ["fine double-rule framing"],
  textureDirection: "linen-like",
  typographyDirection: "quiet heritage serif",
  copyTone: "warm and unfussy",
  hostConstraints: ["No red anywhere on it."],
  creativeGuidance: ["A deep green would sit well here."],
  inspirationSummary: "No visual inspiration supplied.",
} as unknown as EventIdentity;

const validBody = {
  family: "editorial",
  tonalDirection: "mid",
  palette: { colors: ["#2B1B12", "#B8622A", "#E8D8C3"], dominant: "#2B1B12" },
  typographyPairing: "heritage_caslon_karla",
  density: "balanced",
  composition: {
    asymmetry: "gentle",
    hierarchy: "editorial",
    rhythm: "alternating",
    sectionContrast: "moderate",
    ornament: "restrained",
  },
  motifs: ["linen"],
  presentation: {
    name: "Orchard Hour",
    description: "A supper that begins as the light goes, under trees older than anyone there.",
  },
};

const ok = () => ({
  id: "resp_test",
  model: "gpt-5.6-sol",
  status: "completed",
  output_text: JSON.stringify(validBody),
  usage: {
    input_tokens: 100,
    output_tokens: 200,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 50 },
  },
});

describe("the T21 seam", () => {
  beforeEach(() => {
    vi.resetModules();
    create.mockReset();
    process.env.OPENAI_API_KEY = "test-key-that-is-long-enough";
    process.env.OPENAI_MODEL = "gpt-5.6-sol";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  it("sends exactly what a direct production call sends, field for field", async () => {
    const { designIntentRunner } = await import("./design-intent-seam");
    const { generateDesignIntent } = await import("@/lib/ai/openai/design-intent");

    create.mockResolvedValue(ok());
    await designIntentRunner({ identity: IDENTITY, assignment: ASSIGNMENT, siblingIndex: 1 });
    const throughSeam = create.mock.calls.at(-1)![0];

    await generateDesignIntent({
      identity: IDENTITY as never,
      assignment: ASSIGNMENT,
    });
    const throughProduction = create.mock.calls.at(-1)![0];

    // Everything: the model, the messages, the reasoning effort, the service tier, `store`, the
    // output cap and the narrowed schema. A harness-side assembly cannot survive this.
    expect(throughSeam).toEqual(throughProduction);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("puts the production assembly's own bytes on the wire", async () => {
    const { designIntentRunner } = await import("./design-intent-seam");
    const { assembleDesignIntentUserMessage } = await import("@/lib/ai/openai/design-intent-input");
    const { systemPrompt } = await import("@/lib/ai/openai/design-intent");

    create.mockResolvedValue(ok());
    const outcome = await designIntentRunner({
      identity: IDENTITY,
      assignment: ASSIGNMENT,
      siblingIndex: 0,
    });

    const input = create.mock.calls.at(-1)![0].input as { role: string; content: string }[];
    expect(input[0].content).toBe(systemPrompt());
    expect(input[1].content).toBe(
      assembleDesignIntentUserMessage({ identity: IDENTITY as never, assignment: ASSIGNMENT }),
    );
    // `requestText` is what was transmitted, reported back — the frozen harness journals it as the
    // one half of its input record that is not self-reported.
    expect(outcome.requestText).toBe(input[1].content);
    expect(outcome.raw).toBe(JSON.stringify(validBody));
    expect(outcome.response).toEqual(validBody);
  });

  it("reports the telemetry the frozen runner journals, from the call rather than from defaults", async () => {
    const { designIntentRunner } = await import("./design-intent-seam");
    const versions = await import("@/lib/ai/versions");

    create.mockResolvedValue(ok());
    const outcome = await designIntentRunner({
      identity: IDENTITY,
      assignment: ASSIGNMENT,
      siblingIndex: 2,
    });

    expect(outcome.telemetry).toMatchObject({
      model: "gpt-5.6-sol",
      promptVersion: versions.DESIGN_INTENT_PROMPT_VERSION,
      schemaVersion: versions.DESIGN_INTENT_SCHEMA_VERSION,
      transientRetries: 0,
      repairRetries: 0,
      schemaValidFirstCall: true,
      inputTokens: 100,
      outputTokens: 200,
      reasoningTokens: 50,
      providerRequestId: "resp_test",
    });
    expect(outcome.telemetry.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("lets a failure out with what was already paid for, rather than swallowing it", async () => {
    // The frozen seam contract requires a thrower to carry `rawResponses` and `usage`, because the
    // runner journals them before rethrowing: text the provider returned and our validation then
    // rejected is a call that was answered and billed.
    const { designIntentRunner } = await import("./design-intent-seam");
    const invalid = { ...validBody, motifs: ["linen", "linen"] };
    create.mockResolvedValue({ ...ok(), output_text: JSON.stringify(invalid) });

    const error = await designIntentRunner({
      identity: IDENTITY,
      assignment: ASSIGNMENT,
      siblingIndex: 0,
    }).catch((e: unknown) => e);

    expect((error as { kind?: string }).kind).toBe("invalid_output");
    expect((error as { rawResponses?: string[] }).rawResponses).toHaveLength(2);
    expect((error as { usage?: { repairRetries?: number } }).usage?.repairRetries).toBe(1);
  });

  it("stays one binding, with the adapter and the request in their own files", async () => {
    // The frozen freeze test asserts the seam's *shape*; this asserts the division of labour it is
    // shaped for. The adapter maps types and nothing else: no message, no schema, no model option,
    // no retry.
    const adapter = readFileSync(`${ROOT}src/lib/ai/openai/design-intent-runner.ts`, "utf8");
    for (const forbidden of [
      "responses.create",
      "service_tier",
      "max_output_tokens",
      "strictWireSchema",
      "narrowedWireSchema",
      "assembleDesignIntentUserMessage",
      "systemPrompt",
    ]) {
      expect(
        adapter,
        `the adapter names ${forbidden}, which belongs to the boundary`,
      ).not.toContain(forbidden);
    }
    expect(adapter).toContain('from "./design-intent"');
  });
});
