import { describe, expect, it } from "vitest";

import { fakeProvider, TEST_METER } from "../../../tests/unit/support/fake-provider";
import type { FakeScript } from "../../../tests/unit/support/fake-provider";

import { ModelOutputError, ProviderCallError, SpendCeilingError } from "@/lib/ai/errors";
import type { EventIdentity } from "@/lib/ai/event-identity";
import type { ExtractedFacts } from "@/lib/ai/fact-extraction";
import type { ModelResult } from "@/lib/ai/provider";

import { keepVerbatimFacts, runIdentityStage } from "./identity.server";
import { GenerationStageError } from "./stage";

/**
 * Stage 1 (`spec.md §7.5`, `docs/model-contracts.md §4.3`, §9): identity with one repair retry,
 * fact extraction beside it with one retry and no prefill after, and the verbatim check.
 */

const PROMPT =
  "A garden baby shower for Maya   Lopez on Saturday, December 19 2026 at 1pm, at my mum's house. Lemons and linen, but classy!";

const IDENTITY: EventIdentity = {
  creativeDirection: "A sunlit Italian lemon grove rendered with linen calm and ceramic detail.",
  toneKeywords: ["sunlit", "refined", "relaxed"],
  colorsExplicitlyConstrained: false,
  paletteIntent: {
    requiredColors: ["ivory"],
    preferredColors: ["lemon yellow", "olive", "ivory"],
    avoidColors: ["neon"],
    dominanceNotes: "",
  },
  tonalIntent: "Light and airy with soft mid-tones.",
  toneExplicitlyConstrained: false,
  compatibleTypographyCategories: ["oldstyle", "soft_serif"],
  visualMotifs: ["lemon branches with blossom", "hand-painted ceramic tile border"],
  textureDirection: "soft gouache on cream laid paper",
  typographyDirection: "Elegant, airy serif headline with a quiet sans for details.",
  copyTone: "warm, concise, polished",
  designConstraints: ["not kitschy"],
  inspirationSummary: "No visual inspiration supplied.",
};

const FACTS: ExtractedFacts = {
  eventType: "baby shower",
  title: null,
  hosts: null,
  honoree: "maya lopez",
  date: "Saturday, December 19 2026",
  time: "1pm",
  venue: null,
  location: null,
  partial: [{ field: "venue", text: "my mum's house" }],
};

const invalid = (...problems: string[]) =>
  new ModelOutputError("schema_invalid", problems, "{}", {});
const http500 = () =>
  new ProviderCallError("HTTP 500", { code: "http_500", transient: true, billing: "none" });

function stage(script: FakeScript) {
  const fake = fakeProvider(script);
  return { fake, ctx: { provider: fake.provider, meter: TEST_METER } };
}

describe("Event Identity", () => {
  it("runs identity and extraction in parallel, both on the raw prompt, both metered", async () => {
    const { fake, ctx } = stage({ facts: [FACTS] });
    let release!: (value: ModelResult<EventIdentity>) => void;
    const pending = new Promise<ModelResult<EventIdentity>>((resolve) => (release = resolve));
    const provider = {
      ...fake.provider,
      generateEventIdentity: (meter: typeof TEST_METER, input: { prompt: string }) => {
        fake.calls.meters.push(meter);
        fake.calls.identity.push(input);
        return pending;
      },
    };
    const running = runIdentityStage({ ...ctx, provider }, { prompt: PROMPT });
    await Promise.resolve();
    // Extraction was requested while the identity was still outstanding.
    expect(fake.calls.facts).toEqual([{ prompt: PROMPT }]);
    release({ raw: "identity raw", output: IDENTITY, usage: {} as never });
    const result = await running;
    expect(fake.calls.identity).toEqual([{ prompt: PROMPT }]);
    expect(fake.calls.meters).toEqual([TEST_METER, TEST_METER]);
    expect(result).toMatchObject({
      identity: IDENTITY,
      identityRaw: "identity raw",
      identityValidFirstCall: true,
      extraction: "ok",
    });
  });

  it("passes inspiration and a redesign's feedback and previous identity", async () => {
    const { fake, ctx } = stage({ identity: [IDENTITY] });
    const image = { mimeType: "image/png", bytes: new Uint8Array([1]) };
    await runIdentityStage(ctx, {
      prompt: PROMPT,
      inspiration: [image],
      redesignFeedback: "more playful",
      previousIdentity: IDENTITY,
      extractFacts: false,
    });
    expect(fake.calls.identity).toEqual([
      {
        prompt: PROMPT,
        inspiration: [image],
        redesignFeedback: "more playful",
        previousIdentity: IDENTITY,
      },
    ]);
  });

  it("repairs invalid output once, with the validation problems", async () => {
    const { fake, ctx } = stage({
      identity: [invalid("toneKeywords: too small", '(root): unknown field(s) "x"'), IDENTITY],
      facts: [FACTS],
    });
    const result = await runIdentityStage(ctx, { prompt: PROMPT });
    expect(fake.calls.identity).toHaveLength(2);
    expect(fake.calls.identity[1]).toEqual({
      prompt: PROMPT,
      repairFeedback: 'toneKeywords: too small; (root): unknown field(s) "x"',
    });
    expect(result.identityValidFirstCall).toBe(false);
    expect(result.identity).toEqual(IDENTITY);
  });

  it("fails visibly when the repair is invalid too, after extraction has settled", async () => {
    const { fake, ctx } = stage({ identity: [invalid("a"), invalid("b")], facts: [FACTS] });
    const error = await runIdentityStage(ctx, { prompt: PROMPT }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GenerationStageError);
    expect(error).toMatchObject({ stage: "identity", code: "invalid_output" });
    expect((error as Error).cause).toBeInstanceOf(ModelOutputError);
    expect(fake.calls.identity).toHaveLength(2);
    expect(fake.calls.facts).toHaveLength(1);
  });

  it("does not repair a provider failure: it is a visible failure at once", async () => {
    const { fake, ctx } = stage({ identity: [http500()], facts: [FACTS] });
    await expect(runIdentityStage(ctx, { prompt: PROMPT })).rejects.toMatchObject({
      stage: "identity",
      code: "provider_error",
    });
    expect(fake.calls.identity).toHaveLength(1);
  });

  it("passes a meter refusal through unchanged, with no retry", async () => {
    const { fake, ctx } = stage({ identity: [new SpendCeilingError()], facts: [FACTS] });
    await expect(runIdentityStage(ctx, { prompt: PROMPT })).rejects.toBeInstanceOf(
      SpendCeilingError,
    );
    expect(fake.calls.identity).toHaveLength(1);
  });

  it("returns only the interpreted signals for the wait surface", async () => {
    const { ctx } = stage({ identity: [IDENTITY], facts: [FACTS] });
    const { artifacts } = await runIdentityStage(ctx, { prompt: PROMPT });
    expect(artifacts).toEqual({
      creativeDirection: IDENTITY.creativeDirection,
      toneKeywords: ["sunlit", "refined", "relaxed"],
      palette: ["ivory", "lemon yellow", "olive"],
      visualMotifs: ["lemon branches with blossom", "hand-painted ceramic tile border"],
    });
  });
});

describe("fact extraction", () => {
  it("retries invalid output once", async () => {
    const { fake, ctx } = stage({ identity: [IDENTITY], facts: [invalid("date: bad"), FACTS] });
    const result = await runIdentityStage(ctx, { prompt: PROMPT });
    expect(fake.calls.facts).toHaveLength(2);
    expect(result.extraction).toBe("retried");
    expect(result.facts?.date).toBe("Saturday, December 19 2026");
  });

  it("gives no prefill after a second invalid output, and the stage still succeeds", async () => {
    const { fake, ctx } = stage({ identity: [IDENTITY], facts: [invalid("a"), invalid("b")] });
    const result = await runIdentityStage(ctx, { prompt: PROMPT });
    expect(fake.calls.facts).toHaveLength(2);
    expect(result).toMatchObject({ identity: IDENTITY, facts: null, extraction: "failed" });
  });

  it("gives no prefill after a provider failure, without a retry", async () => {
    const { fake, ctx } = stage({ identity: [IDENTITY], facts: [http500()] });
    const result = await runIdentityStage(ctx, { prompt: PROMPT });
    expect(fake.calls.facts).toHaveLength(1);
    expect(result).toMatchObject({ facts: null, extraction: "failed" });
  });

  it("ends the stage on a meter refusal of the extraction", async () => {
    const { ctx } = stage({ identity: [IDENTITY], facts: [new SpendCeilingError()] });
    await expect(runIdentityStage(ctx, { prompt: PROMPT })).rejects.toBeInstanceOf(
      SpendCeilingError,
    );
  });

  it("is skipped when asked", async () => {
    const { fake, ctx } = stage({ identity: [IDENTITY] });
    const result = await runIdentityStage(ctx, { prompt: PROMPT, extractFacts: false });
    expect(fake.calls.facts).toHaveLength(0);
    expect(result).toMatchObject({ facts: null, extraction: "skipped", droppedFacts: [] });
  });
});

describe("the verbatim check (spec.md §7.5: only what the prompt literally states)", () => {
  it("keeps values found in the prompt, ignoring case and runs of whitespace", () => {
    const { facts, dropped } = keepVerbatimFacts(PROMPT, {
      ...FACTS,
      honoree: "MAYA LOPEZ",
      hosts: "Maya Lopez",
    });
    expect(dropped).toEqual([]);
    expect(facts).toEqual({ ...FACTS, honoree: "MAYA LOPEZ", hosts: "Maya Lopez" });
  });

  it("drops and counts a value the prompt does not state, never repairing it", () => {
    const { facts, dropped } = keepVerbatimFacts(PROMPT, {
      ...FACTS,
      date: "December 19, 2026",
      time: "1:00 PM",
      venue: "The Rose Garden",
      location: "Positano",
      partial: [
        { field: "venue", text: "my mum's house" },
        { field: "dressCode", text: "black tie" },
      ],
    });
    expect(facts).toMatchObject({
      date: null,
      time: null,
      venue: null,
      location: null,
      partial: [{ field: "venue", text: "my mum's house" }],
    });
    expect(dropped).toEqual([
      { field: "date" },
      { field: "time" },
      { field: "venue" },
      { field: "location" },
      { field: "partial", hintField: "dressCode" },
    ]);
  });

  it("treats a blank value as absent, not as a drop", () => {
    const { facts, dropped } = keepVerbatimFacts(PROMPT, {
      ...FACTS,
      title: "   ",
      partial: [{ field: "venue", text: "" }],
    });
    expect(facts.title).toBeNull();
    expect(facts.partial).toEqual([]);
    expect(dropped).toEqual([]);
  });

  it("applies to the stage's output", async () => {
    const { ctx } = stage({
      identity: [IDENTITY],
      facts: [{ ...FACTS, venue: "Villa Cimbrone" }],
    });
    const result = await runIdentityStage(ctx, { prompt: PROMPT });
    expect(result.facts?.venue).toBeNull();
    expect(result.facts?.date).toBe("Saturday, December 19 2026");
    expect(result.droppedFacts).toEqual([{ field: "venue" }]);
  });
});
