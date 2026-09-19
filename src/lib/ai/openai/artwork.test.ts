import { describe, expect, it, vi } from "vitest";

import {
  artworkPromptFor,
  createOpenAiArtworkProvider,
  OPENAI_ARTWORK_PROVIDER_ID,
} from "./artwork";
import { artworkCostUsd, ARTWORK_MODEL_RATES, outputTokensAffordable } from "./artwork-pricing";
import { classifyProviderError } from "@/lib/ai/visual-art/failure";
import { generateVisualArt } from "@/lib/ai/visual-art/generate";
import { ArtworkBatchBudget } from "@/lib/ai/visual-art/spend";
import {
  STANDING_PROHIBITIONS,
  visualArtIntentSchema,
  VISUAL_ART_INTENT_VERSION,
} from "@/lib/ai/visual-art/contract";
import type { VisualArtIntent } from "@/lib/ai/visual-art/contract";

const MODEL = "gpt-image-2.5-sunburst-2026-09-08";

const INTENT: VisualArtIntent = visualArtIntentSchema.parse({
  version: VISUAL_ART_INTENT_VERSION,
  role: "object",
  subject: "A grouping of garden produce and tender botanical growth, painted with restraint.",
  medium: "Hand-painted editorial illustration in gouache with fine natural line detail.",
  composition:
    "The artwork occupies about a third of its section. No text is set over it, so the whole " +
    "frame is the artwork's.",
  subjectWeight: "balanced",
  negativeSpace: "right",
  background: "transparent",
  cropSafety: "generous",
  paletteRelationship: "harmonize",
  paletteHexes: ["#F3EAD7", "#65704A", "#C75B3F", "#D6A84B"],
  hostConstraints: ["Not childish.", "Not cheesy."],
  prohibited: [...STANDING_PROHIBITIONS],
} satisfies VisualArtIntent);

/** A one-pixel transparent PNG, so a decode is a real decode. */
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function fakeClient(overrides: Record<string, unknown> = {}, generate?: ReturnType<typeof vi.fn>) {
  const fn =
    generate ??
    vi.fn().mockResolvedValue({
      data: [{ b64_json: PNG_B64 }],
      usage: {
        input_tokens: 400,
        output_tokens: 6000,
        input_tokens_details: { text_tokens: 400, image_tokens: 0, cached_tokens: 0 },
      },
      _request_id: "req_spike_1",
      ...overrides,
    });
  return { client: { images: { generate: fn } } as never, generate: fn };
}

describe("the request this adapter sends", () => {
  it("pins the exact dated model it was given, never an alias", async () => {
    const { client, generate } = fakeClient();
    const provider = createOpenAiArtworkProvider({ model: MODEL, client });
    await provider.generateArtwork({ intent: INTENT, signal: new AbortController().signal });
    expect(generate.mock.calls[0][0].model).toBe(MODEL);
    expect(provider.model).toBe(MODEL);
    expect(provider.id).toBe(OPENAI_ARTWORK_PROVIDER_ID);
  });

  it("asks for a transparent background, PNG, an explicit size and an explicit quality", async () => {
    const { client, generate } = fakeClient();
    await createOpenAiArtworkProvider({ model: MODEL, client }).generateArtwork({
      intent: INTENT,
      signal: new AbortController().signal,
    });
    const body = generate.mock.calls[0][0];
    expect(body.background).toBe("transparent");
    expect(body.output_format).toBe("png");
    expect(body.size).toBe("1024x1024");
    expect(body.quality).toBe("high");
  });

  it("streams no partial images, because every partial is billed and nothing consumes them", async () => {
    const { client, generate } = fakeClient();
    await createOpenAiArtworkProvider({ model: MODEL, client }).generateArtwork({
      intent: INTENT,
      signal: new AbortController().signal,
    });
    expect(generate.mock.calls[0][0].partial_images).toBe(0);
  });

  it("sends n = 1, and n is not a parameter a caller can raise", async () => {
    const { client, generate } = fakeClient();
    // The options type has no `n`, so this is the runtime half of a compile-time guarantee.
    const provider = createOpenAiArtworkProvider({
      model: MODEL,
      client,
      ...({ n: 4 } as unknown as Record<string, never>),
    });
    await provider.generateArtwork({ intent: INTENT, signal: new AbortController().signal });
    expect(generate.mock.calls[0][0].n).toBe(1);
  });

  it("passes the boundary's abort signal to the transport", async () => {
    const { client, generate } = fakeClient();
    const controller = new AbortController();
    await createOpenAiArtworkProvider({ model: MODEL, client }).generateArtwork({
      intent: INTENT,
      signal: controller.signal,
    });
    expect(generate.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("refuses an empty or non-literal model id rather than sending one", () => {
    expect(() => createOpenAiArtworkProvider({ model: "" })).toThrow(/model id is required/);
    expect(() => createOpenAiArtworkProvider({ model: "GPT Image ${x}" })).toThrow(/literal/);
  });
});

describe("the brief becomes the prompt, and no parallel contract appears", () => {
  it("carries the intent's own fields, including the host's words verbatim", () => {
    const prompt = artworkPromptFor(INTENT);
    expect(prompt).toContain(INTENT.subject);
    expect(prompt).toContain(INTENT.medium);
    expect(prompt).toContain(INTENT.composition);
    for (const c of INTENT.hostConstraints) expect(prompt).toContain(c);
    for (const p of INTENT.prohibited) expect(prompt).toContain(p);
    for (const hex of INTENT.paletteHexes) expect(prompt).toContain(hex);
  });

  it("marks the host's requirements as binding, and puts them last", () => {
    const prompt = artworkPromptFor(INTENT);
    const label = "authoritative and bind this image";
    expect(prompt).toContain(label);
    expect(prompt.indexOf(label)).toBeGreaterThan(prompt.indexOf(INTENT.subject));
  });

  it("spells out what a transparent background means, since the flag alone is a hint", () => {
    expect(artworkPromptFor(INTENT)).toContain("no rectangular field of colour");
    expect(artworkPromptFor({ ...INTENT, background: "opaque" })).not.toContain(
      "must be fully transparent",
    );
  });

  it("turns every enum into a sentence, so no token reaches the model unexplained", () => {
    for (const weight of ["dominant", "balanced", "incidental"] as const) {
      expect(artworkPromptFor({ ...INTENT, subjectWeight: weight })).toMatch(/subject should/);
    }
    for (const space of [
      "top",
      "bottom",
      "left",
      "right",
      "center",
      "throughout",
      "none",
    ] as const) {
      expect(artworkPromptFor({ ...INTENT, negativeSpace: space }).length).toBeGreaterThan(0);
    }
  });
});

describe("what comes back", () => {
  it("decodes base64 into real bytes and labels the media type", async () => {
    const { client } = fakeClient();
    const response = await createOpenAiArtworkProvider({ model: MODEL, client }).generateArtwork({
      intent: INTENT,
      signal: new AbortController().signal,
    });
    expect(response.payload.kind).toBe("bytes");
    if (response.payload.kind !== "bytes") throw new Error("unreachable");
    // Real PNG magic bytes, so the decode is genuine rather than a string copied around.
    expect([...response.payload.bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(response.payload.mediaType).toBe("image/png");
  });

  it("never lets base64 into telemetry", async () => {
    const { client } = fakeClient();
    const provider = createOpenAiArtworkProvider({ model: MODEL, client });
    await provider.generateArtwork({ intent: INTENT, signal: new AbortController().signal });
    const serialized = JSON.stringify(provider.lastCall);
    expect(serialized).not.toContain(PNG_B64);
    expect(serialized).not.toContain(PNG_B64.slice(0, 32));
    // It records the size instead, which is the useful part and cannot leak an image.
    expect(provider.lastCall!.decodedBytes).toBeGreaterThan(0);
  });

  it("records usage, request id and latency", async () => {
    const { client } = fakeClient();
    const provider = createOpenAiArtworkProvider({ model: MODEL, client });
    await provider.generateArtwork({ intent: INTENT, signal: new AbortController().signal });
    const call = provider.lastCall!;
    expect(call.usage).toEqual({
      inputTokens: 400,
      outputTokens: 6000,
      cachedInputTokens: 0,
      inputTextTokens: 400,
      inputImageTokens: 0,
    });
    expect(call.providerRequestId).toBe("req_spike_1");
    expect(call.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("names a URL payload a malformed output rather than trusting an asset it cannot inspect", async () => {
    const generate = vi.fn().mockResolvedValue({ data: [{ url: "https://example.test/a.png" }] });
    const { client } = fakeClient({}, generate);
    await expect(
      createOpenAiArtworkProvider({ model: MODEL, client }).generateArtwork({
        intent: INTENT,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/inline image bytes/);
  });

  it("classifies a thrown provider error rather than letting it escape unnamed", async () => {
    const generate = vi.fn().mockRejectedValue(Object.assign(new Error("rate"), { status: 429 }));
    const { client } = fakeClient({}, generate);
    const provider = createOpenAiArtworkProvider({ model: MODEL, client });
    const error = await provider
      .generateArtwork({ intent: INTENT, signal: new AbortController().signal })
      .catch((e: unknown) => e);
    expect(classifyProviderError(error).kind).toBe("rate_limited");
  });
});

describe("cost is computed from the published rate card, and its provenance is recorded", () => {
  it("prices the pinned model at the rates read from OpenAI's own pages", () => {
    const rates = ARTWORK_MODEL_RATES[MODEL];
    expect(rates.textInputPerMillion).toBe(5);
    expect(rates.imageInputPerMillion).toBe(8);
    expect(rates.outputPerMillion).toBe(30);
    expect(rates.source).toMatch(/2026-09-19/);
  });

  it("bills uncached text, cached text, input images and output separately", () => {
    const cost = artworkCostUsd(MODEL, {
      inputTokens: 1000,
      outputTokens: 1_000_000,
      cachedInputTokens: 400,
      inputTextTokens: 1000,
      inputImageTokens: 200,
    });
    // 600 uncached text @$5/1M + 400 cached @$1.25/1M + 200 image @$8/1M + 1M output @$30/1M.
    expect(cost).toBeCloseTo(0.003 + 0.0005 + 0.0016 + 30, 6);
  });

  it("returns null for a model with no recorded rate, because a guess is not a cost", () => {
    expect(
      artworkCostUsd("some-unpriced-model", {
        inputTokens: 1,
        outputTokens: 1,
        cachedInputTokens: 0,
        inputTextTokens: 1,
        inputImageTokens: 0,
      }),
    ).toBeNull();
  });

  it("states a ceiling as the output tokens it can pay for, which the rate card does fix", () => {
    // The per-image token count is not published, so this is the checkable form of a pre-call
    // bound: $0.50 less the text input, divided by the output rate.
    const affordable = outputTokensAffordable(MODEL, 0.5, 2000)!;
    expect(affordable).toBe(Math.floor(((0.5 - (2000 * 5) / 1_000_000) / 30) * 1_000_000));
    expect(affordable).toBeGreaterThan(16_000);
  });
});

describe("the spend gate is what actually bounds the call", () => {
  it("refuses a request above the configured ceiling before any transport runs", async () => {
    const { client, generate } = fakeClient();
    const budget = ArtworkBatchBudget.open({
      id: "test",
      batchCeilingUsd: 0.5,
      perRequestEstimateUsd: 0.5,
    });
    const first = budget.reserve();
    expect(first.ok).toBe(true);
    // The full ceiling is now committed, so a second request cannot start. This is the
    // architecture enforcing "exactly one image" rather than a comment asking for it.
    const second = budget.reserve();
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unreachable");
    expect(second.reason).toBe("ceiling_exceeded");
    expect(generate).not.toHaveBeenCalled();

    if (!first.ok) throw new Error("unreachable");
    const outcome = await generateVisualArt({
      intent: INTENT,
      budget,
      reservation: first.reservation,
      provider: createOpenAiArtworkProvider({ model: MODEL, client }),
    });
    expect(outcome.ok).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("will not call the provider at all without a live reservation", async () => {
    const { client, generate } = fakeClient();
    const budget = ArtworkBatchBudget.open({
      id: "test",
      batchCeilingUsd: 0.5,
      perRequestEstimateUsd: 0.5,
    });
    const grant = budget.reserve();
    if (!grant.ok) throw new Error("unreachable");
    const provider = createOpenAiArtworkProvider({ model: MODEL, client });
    await generateVisualArt({ intent: INTENT, budget, reservation: grant.reservation, provider });
    // The same reservation a second time is spent, and a spent one buys nothing.
    const replay = await generateVisualArt({
      intent: INTENT,
      budget,
      reservation: grant.reservation,
      provider,
    });
    expect(replay.ok).toBe(false);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
