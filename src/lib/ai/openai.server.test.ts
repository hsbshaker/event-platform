import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enableGeneration, fakeAdmin, TEST_CONTEXT } from "../../../tests/unit/support/fake-admin";
import type { FakeAdmin } from "../../../tests/unit/support/fake-admin";

import type { CardDesign } from "@/lib/card/design";

import {
  GenerationDisabledError,
  ModelCallRefusedError,
  ModelOutputError,
  ProviderCallError,
  ProviderRefusalError,
  SpendCeilingError,
} from "./errors";
import type { EventIdentity } from "./event-identity";
import { createOpenAiProvider } from "./openai.server";
import { costOf, RESERVATION_USD } from "./pricing";
import type { AiProvider, CardArt } from "./provider";

/**
 * The OpenAI provider behind the meter (`docs/technology-decisions.md §8.1`, `spec.md §9`, §10).
 * `fetch` is mocked: no test makes a live call.
 */

const admin = vi.hoisted(() => ({ fake: undefined as unknown as FakeAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.fake.client }));

const CANARY = "Zanzibar-canary-7f3e";
const HOST_PROMPT = `A garden baby shower for ${CANARY}, lemons and linen but classy.`;

const IDENTITY: EventIdentity = {
  creativeDirection: "A sunlit Italian lemon grove rendered with linen calm and ceramic detail.",
  toneKeywords: ["sunlit", "refined", "relaxed"],
  colorsExplicitlyConstrained: false,
  paletteIntent: {
    requiredColors: [],
    preferredColors: ["lemon yellow", "olive", "ivory"],
    avoidColors: [],
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

const DESIGN: CardDesign = {
  presentation: { name: "Lemons & Linen", description: "A lemon branch over soft linen." },
  shape: "rectangle",
  layout: "art-top",
  artMode: "illustration",
  typography: { primary: "oldstyle_garamond_worksans", alternates: ["soft_fraunces_manrope"] },
  wording: { title: "Lemons & Linen", invitationLine: "Please join us for a baby shower" },
  artBrief: {
    subject: "a lemon branch heavy with fruit and blossom",
    rendering: "painterly",
    aesthetic: "romantic",
    medium: "soft gouache illustration",
    mood: "sunlit and calm",
    palette: { description: "lemon, olive and ivory", colors: ["#F2D35B", "#7A8450", "#FBF7EE"] },
    texture: "cream laid paper",
    avoid: ["kitsch"],
  },
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const REFERENCE: CardArt = { mimeType: "image/png", bytes: PNG };

const TEXT_USAGE = {
  input_tokens: 2500,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens: 300,
  output_tokens_details: { reasoning_tokens: 120 },
};
const IMAGE_USAGE = {
  input_tokens: 400,
  input_tokens_details: { text_tokens: 400, image_tokens: 0 },
  output_tokens: 2000,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": `req_${status}` },
  });
}

/** A Responses API answer whose output text is `value`. */
function responses(value: unknown, extra: Record<string, unknown> = {}): Response {
  return json({
    id: "resp_1",
    status: "completed",
    model: "gpt-6.1-sol-2026-09-01",
    output: [
      { type: "reasoning", summary: [] },
      {
        type: "message",
        content: [
          { type: "output_text", text: typeof value === "string" ? value : JSON.stringify(value) },
        ],
      },
    ],
    usage: TEXT_USAGE,
    ...extra,
  });
}

const image = () =>
  json({
    created: 1,
    data: [{ b64_json: Buffer.from(PNG).toString("base64") }],
    usage: IMAGE_USAGE,
  });

type FetchArgs = [string, RequestInit];
let fetchMock: ReturnType<typeof vi.fn<(...args: FetchArgs) => Promise<Response>>>;
let provider: AiProvider;
let restore: () => void;

function answer(...responsesInOrder: (Response | Error)[]) {
  for (const r of responsesInOrder) {
    fetchMock.mockImplementationOnce(async () => {
      if (r instanceof Error) throw r;
      return r;
    });
  }
}

const sent = (i = 0) => fetchMock.mock.calls[i] as FetchArgs;
const sentJson = (i = 0) => JSON.parse(sent(i)[1].body as string);

beforeEach(() => {
  admin.fake = fakeAdmin();
  restore = enableGeneration();
  fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(async () => {
    throw new Error("unexpected fetch");
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  provider = createOpenAiProvider({ retryDelayMs: 0 });
});

afterEach(() => {
  restore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Every provider method, with valid input. */
const EVERY_CALL: [string, (p: AiProvider) => Promise<unknown>][] = [
  ["generateEventIdentity", (p) => p.generateEventIdentity(TEST_CONTEXT, { prompt: HOST_PROMPT })],
  ["extractEventFacts", (p) => p.extractEventFacts(TEST_CONTEXT, { prompt: HOST_PROMPT })],
  [
    "generateCardDesign",
    (p) => p.generateCardDesign(TEST_CONTEXT, { eventIdentity: IDENTITY, eventFacts: {} }),
  ],
  [
    "generateCardArt",
    (p) =>
      p.generateCardArt(TEST_CONTEXT, {
        artBrief: DESIGN.artBrief,
        artMode: DESIGN.artMode,
        layout: DESIGN.layout,
        shape: DESIGN.shape,
      }),
  ],
  ["moderateCardArt", (p) => p.moderateCardArt(TEST_CONTEXT, REFERENCE)],
  ["inspectCardArt", (p) => p.inspectCardArt(TEST_CONTEXT, REFERENCE)],
];

describe("no model call without the meter (spec.md §10, §32 #4)", () => {
  it.each(EVERY_CALL)("%s makes no request while generation is switched off", async (_, call) => {
    process.env.GENERATION_ENABLED = "false";
    await expect(call(provider)).rejects.toBeInstanceOf(GenerationDisabledError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(admin.fake.state.rpcs).toEqual([]);
  });

  it.each(EVERY_CALL)("%s makes no request at the spend ceiling", async (_, call) => {
    admin.fake.state.day = null;
    await expect(call(provider)).rejects.toBeInstanceOf(SpendCeilingError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(EVERY_CALL)(
    "%s makes no request for a generation that is not running",
    async (_, call) => {
      admin.fake.state.heartbeat = false;
      await expect(call(provider)).rejects.toBeInstanceOf(ModelCallRefusedError);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(EVERY_CALL)("%s makes no request without an acting member", async (_, call) => {
    const anonymous = createOpenAiProvider({ retryDelayMs: 0 });
    const withoutUser = { ...TEST_CONTEXT, userId: "" };
    const bound: AiProvider = {
      generateEventIdentity: (_c, i) => anonymous.generateEventIdentity(withoutUser, i),
      extractEventFacts: (_c, i) => anonymous.extractEventFacts(withoutUser, i),
      generateCardDesign: (_c, i) => anonymous.generateCardDesign(withoutUser, i),
      generateCardArt: (_c, i) => anonymous.generateCardArt(withoutUser, i),
      moderateCardArt: (_c, a) => anonymous.moderateCardArt(withoutUser, a),
      inspectCardArt: (_c, a) => anonymous.inspectCardArt(withoutUser, a),
    };
    await expect(call(bound)).rejects.toMatchObject({ reason: "invalid_context" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(EVERY_CALL)(
    "%s reserves its operation's estimate and records one run",
    async (name, call) => {
      answer(
        name === "generateCardArt"
          ? image()
          : name === "moderateCardArt"
            ? json({ results: [{ flagged: false, categories: { violence: false } }] })
            : responses(
                name === "generateEventIdentity"
                  ? IDENTITY
                  : name === "generateCardDesign"
                    ? DESIGN
                    : name === "extractEventFacts"
                      ? {
                          eventType: "baby shower",
                          title: null,
                          hosts: null,
                          honoree: null,
                          date: null,
                          time: null,
                          venue: null,
                          location: null,
                          partial: [],
                        }
                      : {
                          hasText: false,
                          textDescription: "",
                          hasLogoOrBrandMark: false,
                          isMockup: false,
                          hasPerson: false,
                          description: "A lemon branch.",
                        },
              ),
      );
      await call(provider);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(admin.fake.rpcNames()).toEqual([
        "heartbeat_generation",
        "reserve_model_spend",
        "settle_model_spend",
      ]);
      const operation = admin.fake.runs()[0].operation as keyof typeof RESERVATION_USD;
      expect(admin.fake.rpc("reserve_model_spend")[0].p_estimate_usd).toBe(
        RESERVATION_USD[operation],
      );
      expect(admin.fake.runs()).toHaveLength(1);
    },
  );
});

describe("Event Identity", () => {
  it("sends the raw prompt with the canonical prompt and strict schema to GPT 6.1 Sol", async () => {
    answer(responses(IDENTITY));
    const result = await provider.generateEventIdentity(TEST_CONTEXT, { prompt: HOST_PROMPT });
    const [url, init] = sent();
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${process.env.OPENAI_API_KEY}`,
    );
    const body = sentJson();
    expect(body.model).toBe("gpt-6.1-sol");
    expect(body.instructions).toBe(
      readFileSync(path.join(process.cwd(), "docs/model-prompts/event-identity.system.md"), "utf8"),
    );
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      name: "EventIdentity",
      strict: true,
    });
    expect(body.reasoning).toEqual({ effort: "medium" });
    expect(body.max_output_tokens).toBe(12_000);
    const data = JSON.parse(body.input[0].content);
    expect(data).toMatchObject({
      eventPrompt: HOST_PROMPT,
      redesignFeedback: null,
      inspiration: [],
    });
    expect(data.runtimeCatalog.typographyCategories).toContain("oldstyle");

    expect(result.output).toEqual(IDENTITY);
    expect(result.raw).toBe(JSON.stringify(IDENTITY));
    expect(result.usage).toMatchObject({
      model: "gpt-6.1-sol",
      inputTokens: 2500,
      outputTokens: 300,
      reasoningTokens: 120,
      providerRequestId: "req_200",
    });
    expect(admin.fake.runs()[0]).toMatchObject({
      operation: "event_identity",
      prompt_version: "event_identity_v5",
      schema_version: "event_identity_schema_v4",
      cost_estimate_usd: costOf({ model: "gpt-6.1-sol", inputTokens: 2500, outputTokens: 300 }),
      success: true,
    });
  });

  it("sends inspiration images as image inputs, and repair feedback after the data", async () => {
    answer(responses(IDENTITY));
    await provider.generateEventIdentity(TEST_CONTEXT, {
      prompt: HOST_PROMPT,
      inspiration: [{ mimeType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) }],
      repairFeedback: "toneKeywords: too short",
    });
    const content = sentJson().input[0].content;
    expect(content[0].type).toBe("input_text");
    expect(content[0].text).toMatch(
      /failed validation: toneKeywords: too short\. Return a corrected object\.$/,
    );
    expect(content[1]).toEqual({
      type: "input_image",
      image_url: "data:image/jpeg;base64,AQID",
      detail: "high",
    });
  });

  it("rejects output that is not valid against the canonical schema, at its billed cost", async () => {
    const invalid = { ...IDENTITY, toneKeywords: ["one"], extra: true };
    answer(responses(invalid));
    const error = await provider
      .generateEventIdentity(TEST_CONTEXT, { prompt: HOST_PROMPT })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ModelOutputError);
    expect(error.code).toBe("schema_invalid");
    expect(error.problems.join("\n")).toMatch(/toneKeywords/);
    expect(error.problems.join("\n")).toMatch(/unknown field\(s\) "extra"/);
    expect(error.raw).toBe(JSON.stringify(invalid));
    // Invalid output is not retried here: the re-prompt policy is the pipeline's.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(admin.fake.runs()[0]).toMatchObject({ success: false, error_code: "schema_invalid" });
    expect(admin.fake.rpc("settle_model_spend")[0].p_actual_usd).toBeGreaterThan(0);
  });

  it("rejects duplicate items the strict mode cannot check", async () => {
    answer(responses({ ...IDENTITY, toneKeywords: ["calm", "calm", "warm"] }));
    await expect(
      provider.generateEventIdentity(TEST_CONTEXT, { prompt: HOST_PROMPT }),
    ).rejects.toMatchObject({ code: "schema_invalid" });
  });

  it("treats a cut-off, refused or non-JSON response as invalid output", async () => {
    answer(
      responses(IDENTITY, {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      }),
      json({
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }],
        usage: TEXT_USAGE,
      }),
      responses("not json {"),
    );
    for (const code of ["incomplete", "refusal", "unparseable"]) {
      await expect(
        provider.generateEventIdentity(TEST_CONTEXT, { prompt: HOST_PROMPT }),
      ).rejects.toMatchObject({ code });
    }
  });
});

describe("fact extraction", () => {
  it("sends the prompt as plain text to GPT 6 Luna without reasoning effort", async () => {
    const facts = {
      eventType: "baby shower",
      title: null,
      hosts: null,
      honoree: null,
      date: null,
      time: null,
      venue: null,
      location: null,
      partial: [{ field: "venue", text: "a garden" }],
    };
    answer(responses(facts));
    const result = await provider.extractEventFacts(TEST_CONTEXT, { prompt: HOST_PROMPT });
    const body = sentJson();
    expect(body.model).toBe("gpt-6-luna");
    expect(body.input[0].content).toBe(HOST_PROMPT);
    expect(body.reasoning).toBeUndefined();
    expect(body.text.format.name).toBe("EventFacts");
    expect(body.instructions).toContain("**Prompt version:** `fact_extraction_v1`");
    expect(result.output).toEqual(facts);
    expect(admin.fake.runs()[0]).toMatchObject({
      operation: "structured_extraction",
      model: "gpt-6-luna",
      prompt_version: "fact_extraction_v1",
      schema_version: "fact_extraction_schema_v1",
    });
  });

  it("rejects a value that is not a string or null", async () => {
    answer(
      responses({
        eventType: 3,
        title: null,
        hosts: null,
        honoree: null,
        date: null,
        time: null,
        venue: null,
        location: null,
        partial: [],
      }),
    );
    await expect(
      provider.extractEventFacts(TEST_CONTEXT, { prompt: HOST_PROMPT }),
    ).rejects.toMatchObject({
      code: "schema_invalid",
    });
  });
});

describe("Card Design", () => {
  it("sends the identity, facts and catalogs, never the raw prompt, and validates the design", async () => {
    answer(responses(DESIGN));
    const result = await provider.generateCardDesign(
      { ...TEST_CONTEXT, round: 2 },
      {
        eventIdentity: IDENTITY,
        eventFacts: { hosts: "Ana and Ben" },
        previousDirections: [
          {
            name: "Citrus Grove",
            layout: "framed",
            artMode: "framed",
            primary: "soft_fraunces_manrope",
            subject: "a lemon wreath",
            rendering: "painterly",
            aesthetic: "romantic",
          },
        ],
        feedback: "more playful",
        reprompt: { kind: "repeat-direction", feedback: "same as Citrus Grove" },
      },
    );
    const body = sentJson();
    expect(body.model).toBe("gpt-6.1-sol");
    expect(body.text.format.name).toBe("CardDesign");
    expect(body.instructions).toContain("**Prompt version:** `card_design_v2`");
    expect(JSON.stringify(body)).not.toContain(CANARY);
    const data = JSON.parse(body.input[0].content);
    expect(Object.keys(data)).toEqual([
      "eventIdentity",
      "eventFacts",
      "runtimeCatalog",
      "previousDirections",
      "feedback",
      "reprompt",
    ]);
    expect(data.eventFacts).toEqual({ hosts: "Ana and Ben" });
    expect(result.output).toEqual(DESIGN);
    expect(admin.fake.runs()[0]).toMatchObject({
      operation: "card_design",
      round: 2,
      prompt_version: "card_design_v2",
      schema_version: "card_design_schema_v2",
      layout_set_version: "card_layouts_v2",
    });
  });

  it("rejects a design outside the catalogs", async () => {
    answer(responses({ ...DESIGN, layout: "website-hero" }));
    await expect(
      provider.generateCardDesign(TEST_CONTEXT, { eventIdentity: IDENTITY, eventFacts: {} }),
    ).rejects.toMatchObject({ code: "schema_invalid" });
  });
});

describe("card artwork", () => {
  const art = (shape: CardDesign["shape"], layout: CardDesign["layout"] = "art-top") => ({
    artBrief: DESIGN.artBrief,
    artMode: DESIGN.artMode,
    layout,
    shape,
  });

  it("paints a new artwork through generations at the shape's proportion, Sunburst high, PNG, opaque", async () => {
    answer(image(), image());
    const portrait = await provider.generateCardArt(TEST_CONTEXT, art("rectangle"));
    await provider.generateCardArt(TEST_CONTEXT, art("square"));
    expect(sent(0)[0]).toBe("https://api.openai.com/v1/images/generations");
    expect(sentJson(0)).toMatchObject({
      model: "gpt-image-2.5-sunburst-2026-09-08",
      size: "1440x2016",
      quality: "high",
      output_format: "png",
      background: "opaque",
      n: 1,
    });
    expect(sentJson(1).size).toBe("1440x1440");
    expect(sentJson(0).prompt).toContain("Absolutely no text of any kind");
    expect(sentJson(0).prompt).not.toContain("Keep the same subject");
    expect(portrait.output).toEqual({ mimeType: "image/png", bytes: PNG });
    expect(portrait.raw).not.toContain("b64_json");
    expect(admin.fake.runs()[0]).toMatchObject({
      operation: "card_art",
      model: "gpt-image-2.5-sunburst-2026-09-08",
      image_units: 1,
      output_tokens: 2000,
      prompt_version: "card_art_v3",
      schema_version: null,
      layout_set_version: "card_layouts_v2",
      cost_estimate_usd: 0.062, // 400 × $5 + 2000 × $30, per 1M
    });
  });

  it("sends the design's own artwork as the only image, through edits, on a shape switch", async () => {
    answer(image());
    await provider.generateCardArt(TEST_CONTEXT, { ...art("square"), reference: REFERENCE });
    const [url, init] = sent();
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("gpt-image-2.5-sunburst-2026-09-08");
    expect(form.get("size")).toBe("1440x1440");
    expect(form.get("quality")).toBe("high");
    expect(form.get("background")).toBe("opaque");
    expect(String(form.get("prompt"))).toContain("Keep the same subject");
    const images = form.getAll("image[]") as File[];
    expect(images).toHaveLength(1);
    expect(new Uint8Array(await images[0].arrayBuffer())).toEqual(PNG);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("never carries the host's prompt into an image request (spec.md §32 #17)", async () => {
    answer(responses(IDENTITY), responses(DESIGN), image(), image());
    const identity = await provider.generateEventIdentity(TEST_CONTEXT, { prompt: HOST_PROMPT });
    const design = await provider.generateCardDesign(TEST_CONTEXT, {
      eventIdentity: identity.output,
      eventFacts: {},
    });
    const d = design.output;
    await provider.generateCardArt(TEST_CONTEXT, {
      artBrief: d.artBrief,
      artMode: d.artMode,
      layout: d.layout,
      shape: d.shape,
    });
    await provider.generateCardArt(TEST_CONTEXT, {
      artBrief: d.artBrief,
      artMode: d.artMode,
      layout: d.layout,
      shape: "oval",
      reference: REFERENCE,
    });
    expect(JSON.stringify(sentJson(0))).toContain(CANARY);
    expect(JSON.stringify(sentJson(1))).not.toContain(CANARY);
    expect(JSON.stringify(sentJson(2))).not.toContain(CANARY);
    expect(String((sent(3)[1].body as FormData).get("prompt"))).not.toContain(CANARY);
    // Structurally, too: an image request carries exactly these fields, so a new field (a prompt,
    // a note, inspiration) fails here before it can reach the image model.
    expect(Object.keys(sentJson(2)).sort()).toEqual(
      ["background", "model", "n", "output_format", "prompt", "quality", "size"].sort(),
    );
    expect([...new Set((sent(3)[1].body as FormData).keys())].sort()).toEqual(
      ["background", "image[]", "model", "output_format", "prompt", "quality", "size"].sort(),
    );
  });

  it("refuses to build a request for a shape the layout does not support, before the meter", async () => {
    await expect(
      provider.generateCardArt(TEST_CONTEXT, { ...art("circle", "corners"), reference: REFERENCE }),
    ).rejects.toThrow(/does not support shape circle/);
    expect(admin.fake.state.rpcs).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a provider refusal as such, without a retry, booking the reservation", async () => {
    answer(
      json(
        {
          error: {
            message: "Your request was rejected by the safety system.",
            code: "moderation_blocked",
          },
        },
        400,
      ),
    );
    const error = await provider.generateCardArt(TEST_CONTEXT, art("rectangle")).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderRefusalError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(admin.fake.runs()[0]).toMatchObject({ success: false, error_code: "provider_refusal" });
    expect(admin.fake.rpc("settle_model_spend")[0].p_actual_usd).toBe(RESERVATION_USD.card_art);
  });

  it("rejects a response without a PNG", async () => {
    answer(
      json({
        data: [{ b64_json: Buffer.from("GIF89a....").toString("base64") }],
        usage: IMAGE_USAGE,
      }),
    );
    await expect(provider.generateCardArt(TEST_CONTEXT, art("rectangle"))).rejects.toMatchObject({
      code: "unparseable",
    });
  });
});

describe("artwork checks", () => {
  it("moderates the artwork alone with omni-moderation-latest, free", async () => {
    answer(
      json({
        results: [
          { flagged: true, categories: { violence: true, sexual: false, "self-harm": null } },
        ],
      }),
    );
    const result = await provider.moderateCardArt(TEST_CONTEXT, REFERENCE);
    expect(sent()[0]).toBe("https://api.openai.com/v1/moderations");
    expect(sentJson()).toEqual({
      model: "omni-moderation-latest",
      input: [
        {
          type: "image_url",
          image_url: { url: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}` },
        },
      ],
    });
    expect(result.output).toEqual({ flagged: true, categories: ["violence"] });
    expect(admin.fake.rpc("reserve_model_spend")[0].p_estimate_usd).toBe(0);
    expect(admin.fake.runs()[0]).toMatchObject({
      operation: "card_art_moderation",
      cost_estimate_usd: 0,
      prompt_version: "card_art_moderation_v1",
    });
  });

  it("inspects the artwork with GPT 6.1 Sol at low effort", async () => {
    const inspection = {
      hasText: true,
      textDescription: "a signature in the corner",
      hasLogoOrBrandMark: false,
      isMockup: false,
      hasPerson: true,
      description: "A lemon branch held in a hand.",
    };
    answer(responses(inspection));
    const result = await provider.inspectCardArt(TEST_CONTEXT, REFERENCE);
    const body = sentJson();
    expect(body.model).toBe("gpt-6.1-sol");
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.text.format.name).toBe("ArtworkInspection");
    expect(body.instructions).toMatch(/^You are a strict print-production inspector\./);
    expect(body.input[0].content).toEqual([
      { type: "input_text", text: "Inspect this artwork." },
      {
        type: "input_image",
        image_url: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`,
        detail: "high",
      },
    ]);
    expect(result.output).toEqual(inspection);
    expect(body.text.format.schema.required).toContain("hasPerson");
    expect(admin.fake.runs()[0]).toMatchObject({
      operation: "card_art_inspection",
      prompt_version: "card_art_inspection_v2",
      schema_version: "card_art_inspection_schema_v2",
    });
  });
});

describe("transient failures (docs/model-contracts.md §9)", () => {
  it("retries once, as a separately metered attempt", async () => {
    answer(json({ error: { message: "overloaded" } }, 503), responses(IDENTITY));
    const result = await provider.generateEventIdentity(TEST_CONTEXT, { prompt: HOST_PROMPT });
    expect(result.output).toEqual(IDENTITY);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(admin.fake.rpc("reserve_model_spend")).toHaveLength(2);
    expect(admin.fake.runs().map((r) => [r.success, r.error_code, r.cost_estimate_usd])).toEqual([
      [false, "http_503", 0],
      [true, null, expect.any(Number)],
    ]);
  });

  it("gives up after the one retry", async () => {
    answer(new TypeError("fetch failed"), json({ error: { message: "rate limited" } }, 429));
    const error = await provider
      .generateCardDesign(TEST_CONTEXT, { eventIdentity: IDENTITY, eventFacts: {} })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ProviderCallError);
    expect(error.code).toBe("http_429");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The dropped connection's outcome is unknown: it books its reservation.
    expect(admin.fake.runs().map((r) => [r.error_code, r.cost_estimate_usd])).toEqual([
      ["network", RESERVATION_USD.card_design],
      ["http_429", 0],
    ]);
  });

  it("does not retry a client error, and makes no request when the retry is refused", async () => {
    answer(json({ error: { message: "bad request" } }, 400));
    await expect(
      provider.generateEventIdentity(TEST_CONTEXT, { prompt: HOST_PROMPT }),
    ).rejects.toMatchObject({ code: "http_400", transient: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A transient failure whose retry is refused by the ceiling makes no second request.
    fetchMock.mockReset();
    admin.fake = fakeAdmin();
    let reservations = 0;
    const realRpc = admin.fake.client.rpc;
    admin.fake.client.rpc = async (name, args) => {
      if (name === "reserve_model_spend" && ++reservations === 2) {
        admin.fake.state.day = null;
      }
      return realRpc(name, args);
    };
    answer(json({ error: { message: "overloaded" } }, 500));
    await expect(
      provider.generateEventIdentity(TEST_CONTEXT, { prompt: HOST_PROMPT }),
    ).rejects.toBeInstanceOf(SpendCeilingError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("times out a request that does not answer", async () => {
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    answer(timeout, timeout);
    await expect(
      provider.extractEventFacts(TEST_CONTEXT, { prompt: HOST_PROMPT }),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(sent()[1].signal).toBeInstanceOf(AbortSignal);
  });
});
