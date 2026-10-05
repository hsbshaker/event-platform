import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeAdmin } from "../../../tests/unit/support/fake-admin";
import type { FakeAdmin } from "../../../tests/unit/support/fake-admin";
import { fakeProvider } from "../../../tests/unit/support/fake-provider";
import type { FakeScript } from "../../../tests/unit/support/fake-provider";

import {
  GenerationDeadlineError,
  ModelCallRefusedError,
  ModelOutputError,
  ProviderCallError,
  ProviderRefusalError,
  SpendCeilingError,
} from "@/lib/ai/errors";
import type { EventIdentity } from "@/lib/ai/event-identity";
import type { ExtractedFacts } from "@/lib/ai/fact-extraction";
import type { CardArt } from "@/lib/ai/provider";
import { fitsShapes } from "@/lib/card/art-prompt";
import type { CardDesign } from "@/lib/card/design";
import { encodePng, flatArtwork } from "@/lib/link-preview/test-artwork";

import { identityArtifacts } from "./identity.server";
import { GenerationStageError } from "./stage";
import {
  CARD_ART_BUCKET,
  GENERATION_DEADLINE_MS,
  GenerationKindNotSupportedError,
  failureTelemetry,
  hostEventFacts,
  PROVIDER_REFUSAL_FEEDBACK,
  runGeneration,
} from "./run.server";
import type { GenerationTelemetry, RunGenerationOutcome } from "./run.server";

/**
 * One generation end to end (`spec.md §7.3`–§7.11, §9.4, §9.5; `docs/technology-decisions.md
 * §8.1`): the order of calls and writes, what is persisted, the identity's reuse on a retry, the
 * provider-refusal re-prompt, failures mapped to `fail_generation`, the deadline, and that nothing
 * is persisted once the generation stopped running. Fake provider and fake admin: no network, no
 * database (the SQL is `tests/db/phase5-persistence.test.ts`).
 */

const EVENT = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";
const USER = "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2";
const GENERATION = "c5d7b1a4-3f2e-4c8d-9b7a-1e2f3a4b5c6d";
const EARLIER_GENERATION = "9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const DESIGN_ID = "d1d2d3d4-e5e6-4f7a-8b9c-0d1e2f3a4b5c";
const STARTED_AT = 1_800_000_000_000;

const PROMPT =
  "A garden baby shower for Maya Lopez, lemons and linen but classy, at Villa Rosa on December 19";

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
  visualMotifs: ["lemon branches with blossom"],
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
  honoree: "Maya Lopez",
  date: "December 19",
  time: null,
  venue: "Villa Rosa",
  location: "Positano",
  partial: [],
};

const DESIGN: CardDesign = {
  presentation: { name: "Lemons & Linen", description: "A lemon branch over soft linen." },
  shape: "rectangle",
  layout: "art-top",
  artMode: "illustration",
  typography: { primary: "oldstyle_garamond_worksans", alternates: ["soft_fraunces_manrope"] },
  wording: { title: "Lemons & Linen", invitationLine: "Please join us for a garden celebration" },
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

const WORLD_DESIGN: CardDesign = {
  ...DESIGN,
  presentation: { name: "Grove Morning", description: "Painted tiles frame a quiet centre." },
  layout: "framed",
  artMode: "framed",
  artBrief: { ...DESIGN.artBrief, subject: "a ceramic tile border of lemons and leaves" },
};

const art = (bytes: Uint8Array): CardArt => ({ mimeType: "image/png", bytes });
/** Calm cream paper: valid, and every zone takes ink without a panel. */
const CLEAN = art(flatArtwork(1024, 1434, [238, 228, 212]));
/** A checkerboard: valid, but every zone needs the legibility panel. */
const BUSY = art(
  (() => {
    const rgb = new Uint8Array(1024 * 1434 * 3);
    for (let y = 0; y < 1434; y += 1) {
      for (let x = 0; x < 1024; x += 1)
        rgb.fill((x + y) % 2 ? 0 : 255, (y * 1024 + x) * 3, (y * 1024 + x) * 3 + 3);
    }
    return encodePng(1024, 1434, rgb);
  })(),
);
const NOT_PNG = art(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const HEIC_BYTES = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);

const refusal = () =>
  new ProviderRefusalError("card_art: refused by the provider", { code: "provider_refusal" });
const invalid = () => new ModelOutputError("schema_invalid", ["bad"], "{}", {});
const http500 = () =>
  new ProviderCallError("HTTP 500", { code: "http_500", transient: true, billing: "none" });

const EVENT_ROW = {
  id: EVENT,
  prompt: PROMPT,
  type: "baby_shower",
  title: null,
  hosts: "Ana & Leo",
  baby_name: null,
  venue_name: "Villa Rosa",
  address: "12 Via Roma, Rome",
  event_date: "2026-12-19",
  start_time: "13:00:00",
  end_time: null,
};

let admin: FakeAdmin;
let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  admin = fakeAdmin();
  admin.state.tables = {
    generations: [
      { id: GENERATION, event_id: EVENT, kind: "initial", status: "running", requested_by: USER },
    ],
    events: [EVENT_ROW],
    event_identities: [],
    inspiration_assets: [],
    card_art_assets: [],
  };
  admin.state.rpcAnswers = {
    record_event_identity: 1,
    record_generation_stage: true,
    persist_generated_card: [{ card_design_id: DESIGN_ID, round: 1 }],
    fail_generation: true,
  };
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const HAPPY: FakeScript = { identity: [IDENTITY], facts: [FACTS], design: [DESIGN], art: [CLEAN] };

/** `() => 0` draws the first rendering, `photographic` (`suggestRendering`). */
async function run(
  script: FakeScript = HAPPY,
  random: () => number = () => 0,
): Promise<{
  outcome: RunGenerationOutcome;
  fake: ReturnType<typeof fakeProvider>;
}> {
  const fake = fakeProvider(script);
  const outcome = await runGeneration(
    { generationId: GENERATION, eventId: EVENT, userId: USER, startedAt: STARTED_AT },
    {
      provider: fake.provider,
      admin: admin.client as never,
      now: () => STARTED_AT,
      random,
    },
  );
  return { outcome, fake };
}

const stages = () =>
  admin.rpc("record_generation_stage").map((a) => [a.p_stage, a.p_artifacts] as const);
const persisted = () => admin.rpc("persist_generated_card")[0];
const telemetryOf = () => persisted().p_telemetry as unknown as GenerationTelemetry;
const failures = () => admin.rpc("fail_generation").map((a) => a.p_error_code);

describe("the happy path", () => {
  it("runs identity, design and artwork in order, then uploads and persists once", async () => {
    const { outcome, fake } = await run();
    expect(outcome).toEqual({ status: "succeeded", cardDesignId: DESIGN_ID, round: 1 });
    expect(admin.state.log).toEqual([
      "select:generations",
      "select:events",
      "select:event_identities",
      "select:inspiration_assets",
      "rpc:record_event_identity",
      "rpc:record_generation_stage",
      "rpc:record_generation_stage",
      "storage:upload",
      "rpc:persist_generated_card",
    ]);
    expect(stages().map(([stage]) => stage)).toEqual(["identity", "design"]);
    expect(fake.calls.identity).toHaveLength(1);
    expect(fake.calls.facts).toHaveLength(1);
    expect(fake.calls.design).toHaveLength(1);
    expect(fake.calls.art).toHaveLength(1);
    expect(failures()).toEqual([]);
  });

  it("meters every call against this generation, with the deadline below maxDuration", async () => {
    const { fake } = await run();
    expect(fake.calls.meters.length).toBeGreaterThanOrEqual(6);
    for (const meter of fake.calls.meters) {
      expect(meter).toEqual({
        eventId: EVENT,
        userId: USER,
        generationId: GENERATION,
        round: null,
        deadline: STARTED_AT + GENERATION_DEADLINE_MS,
      });
    }
    expect(GENERATION_DEADLINE_MS).toBe(285_000);
  });

  it("persists the identity as the next revision, with its raw response", async () => {
    const { fake } = await run();
    expect(fake.calls.identity[0]).toEqual({ prompt: PROMPT });
    expect(fake.calls.facts[0]).toEqual({ prompt: PROMPT });
    expect(admin.rpc("record_event_identity")).toEqual([
      {
        p_generation_id: GENERATION,
        p_event_id: EVENT,
        p_identity: IDENTITY,
        p_raw: JSON.stringify(IDENTITY),
        p_prompt_version: "event_identity_v5",
        p_schema_version: "event_identity_schema_v5",
      },
    ]);
    const [identityStage] = stages();
    // Facts are prefill for the host to confirm: kept verbatim from the prompt (Positano is not
    // in it), stored only in the artifacts.
    expect(identityStage).toEqual([
      "identity",
      {
        identity: identityArtifacts(IDENTITY),
        facts: { ...FACTS, location: null },
        droppedFacts: ["location"],
      },
    ]);
  });

  it("designs from the event's own fields, never from the extracted facts", async () => {
    const { fake } = await run();
    expect(fake.calls.design[0]).toEqual({
      eventIdentity: IDENTITY,
      eventFacts: {
        eventType: "baby shower",
        hosts: "Ana & Leo",
        date: "Saturday, December 19",
        time: "1:00 pm",
        venue: "Villa Rosa",
        address: "12 Via Roma, Rome",
      },
      suggestedRendering: "photographic",
    });
    // The image model sees the brief and the layout, never the prompt.
    expect(fake.calls.art[0]).toEqual({
      artBrief: DESIGN.artBrief,
      artMode: "illustration",
      layout: "art-top",
      shape: "rectangle",
    });
    expect(JSON.stringify(fake.calls.art)).not.toContain("Maya");
  });

  it("takes the event type in the host's own words when the prompt states one", async () => {
    const { fake } = await run({
      ...HAPPY,
      facts: [{ ...FACTS, eventType: "garden baby shower" }],
    });
    expect(fake.calls.design[0].eventFacts.eventType).toBe("garden baby shower");
    // Only the event type: the extracted card facts still wait for the host's confirmation.
    expect(fake.calls.design[0].eventFacts.venue).toBe("Villa Rosa");
    expect(fake.calls.design[0].eventFacts).not.toHaveProperty("babyName");
  });

  it("falls back to the event's type when the prompt states none, or the type is not verbatim", async () => {
    for (const eventType of [null, "60th birthday"]) {
      const { fake } = await run({ ...HAPPY, facts: [{ ...FACTS, eventType }] });
      expect(fake.calls.design.at(-1)?.eventFacts.eventType).toBe("baby shower");
    }
  });

  it("uploads the artwork under a key of this generation, then persists exactly it", async () => {
    await run();
    expect(admin.state.uploads).toHaveLength(1);
    const upload = admin.state.uploads[0];
    expect(upload.bucket).toBe(CARD_ART_BUCKET);
    expect(upload.key).toMatch(new RegExp(`^${EVENT}/${GENERATION}/[0-9a-f-]{36}\\.png$`));
    expect(upload.options).toEqual({ contentType: "image/png", upsert: false });
    const args = persisted();
    expect(args).toMatchObject({
      p_generation_id: GENERATION,
      p_event_id: EVENT,
      p_identity_revision: 1,
      p_name: "Lemons & Linen",
      p_description: "A lemon branch over soft linen.",
      p_shape: "rectangle",
      p_layout: "art-top",
      p_art_mode: "illustration",
      p_typography: DESIGN.typography,
      p_wording: DESIGN.wording,
      p_art_brief: DESIGN.artBrief,
      p_raw: DESIGN,
      p_versions: {
        designPrompt: "card_design_v2",
        designSchema: "card_design_schema_v2",
        layoutSet: "card_layouts_v2",
        compiler: "card_compiler_v3",
        artPrompt: "card_art_v3",
        imageModel: "gpt-image-2.5-sunburst-2026-09-08",
      },
      p_standard_wording_slots: [],
      p_storage_key: upload.key,
      p_mime_type: "image/png",
      p_size_bytes: upload.bytes.byteLength,
      p_width: 1024,
      p_height: 1434,
      p_proportion: "portrait_5_7",
      p_fits_shapes: [...fitsShapes("illustration", "art-top", "rectangle")],
      p_image_model: "gpt-image-2.5-sunburst-2026-09-08",
      p_art_prompt_version: "card_art_v3",
    });
    expect(Object.keys(args.p_ink as object).sort()).toEqual(
      [...fitsShapes("illustration", "art-top", "rectangle")].sort(),
    );
  });

  it("records the §9.5 telemetry", async () => {
    await run();
    expect(telemetryOf()).toEqual({
      schemaValidFirstCall: true,
      reprompts: [],
      artRegenerated: null,
      artRepaints: 0,
      standardWording: [],
      inkPanels: [],
      versions: {
        identityPrompt: "event_identity_v5",
        identitySchema: "event_identity_schema_v5",
        designPrompt: "card_design_v2",
        designSchema: "card_design_schema_v2",
        layoutSet: "card_layouts_v2",
        compiler: "card_compiler_v3",
        artPrompt: "card_art_v3",
        imageModel: "gpt-image-2.5-sunburst-2026-09-08",
      },
      latency: { identityMs: 0, designMs: 0, artMs: 0, totalMs: 0 },
      identityValidFirstCall: true,
      identityReused: false,
      extraction: "ok",
      inspirationSkipped: 0,
      droppedFacts: 1,
      imagesRequested: 1,
      repaintsStoppedBy: null,
      providerRefusal: false,
      suggestedRendering: "photographic",
      followedSuggestion: false,
    });
  });

  it("suggests a rendering drawn from the injected random source, and records whether it was followed", async () => {
    // Nine families: a draw in [5/9, 6/9) is the sixth, `painterly` — the design's own rendering.
    const { fake } = await run(HAPPY, () => 5.5 / 9);
    expect(fake.calls.design[0].suggestedRendering).toBe("painterly");
    expect(telemetryOf()).toMatchObject({
      suggestedRendering: "painterly",
      followedSuggestion: true,
    });
  });

  it("formats the host's facts as the card shows them, leaving blanks out", () => {
    expect(
      hostEventFacts({
        ...EVENT_ROW,
        title: "  Maya's   Shower ",
        baby_name: "Maya",
        hosts: " ",
        venue_name: null,
        end_time: "16:00",
      }),
    ).toEqual({
      eventType: "baby shower",
      title: "Maya's   Shower",
      babyName: "Maya",
      date: "Saturday, December 19",
      time: "1:00 pm – 4:00 pm",
      venue: "12 Via Roma",
      address: "12 Via Roma, Rome",
    });
  });
});

describe("a retry reuses the identity (interpretation happens once)", () => {
  beforeEach(() => {
    admin.state.tables.event_identities = [
      {
        event_id: EVENT,
        revision: 1,
        identity: { ...IDENTITY, copyTone: "old" },
        generation_id: null,
      },
      { event_id: EVENT, revision: 2, identity: IDENTITY, generation_id: EARLIER_GENERATION },
    ];
    admin.state.tables.generations.push({
      id: EARLIER_GENERATION,
      event_id: EVENT,
      kind: "initial",
      status: "failed",
      requested_by: USER,
      artifacts: { facts: { ...FACTS, location: null }, droppedFacts: ["location"] },
    });
  });

  it("makes neither identity nor extraction call, and designs from the latest revision", async () => {
    const { outcome, fake } = await run({ design: [DESIGN], art: [CLEAN] });
    expect(outcome.status).toBe("succeeded");
    expect(fake.calls.identity).toEqual([]);
    expect(fake.calls.facts).toEqual([]);
    expect(fake.calls.design[0].eventIdentity).toEqual(IDENTITY);
    expect(admin.rpc("record_event_identity")).toEqual([]);
    // Inspiration is not read again once the identity exists.
    expect(admin.state.selects.map((s) => s.table)).not.toContain("inspiration_assets");
    expect(persisted().p_identity_revision).toBe(2);
    expect(telemetryOf()).toMatchObject({
      identityReused: true,
      identityValidFirstCall: null,
      extraction: null,
      latency: { identityMs: null },
    });
  });

  it("keeps the earlier generation's stated event type on a retry", async () => {
    admin.state.tables.generations.find((g) => g.id === EARLIER_GENERATION)!.artifacts = {
      facts: { ...FACTS, eventType: "bridal shower" },
      droppedFacts: [],
    };
    const { fake } = await run({ design: [DESIGN], art: [CLEAN] });
    expect(fake.calls.design[0].eventFacts.eventType).toBe("bridal shower");
  });

  it("shows the identity again and carries the earlier generation's facts", async () => {
    await run({ design: [DESIGN], art: [CLEAN] });
    expect(stages()[0]).toEqual([
      "identity",
      {
        identity: identityArtifacts(IDENTITY),
        facts: { ...FACTS, location: null },
        droppedFacts: ["location"],
      },
    ]);
  });

  it("fails internally rather than design from an identity that does not validate", async () => {
    admin.state.tables.event_identities = [
      { event_id: EVENT, revision: 1, identity: { creativeDirection: "x" }, generation_id: null },
    ];
    const { outcome, fake } = await run({});
    expect(outcome).toEqual({ status: "failed", code: "internal" });
    expect(fake.calls.design).toEqual([]);
  });
});

describe("inspiration", () => {
  it("sends PNG, JPEG and WEBP to the identity call and skips HEIC and HEIF, counted", async () => {
    admin.state.tables.inspiration_assets = [
      { event_id: EVENT, storage_key: "e/1.png", mime_type: "image/png", created_at: "1" },
      { event_id: EVENT, storage_key: "e/2.heic", mime_type: "image/heic", created_at: "2" },
      { event_id: EVENT, storage_key: "e/3.jpg", mime_type: "image/jpeg", created_at: "3" },
      { event_id: EVENT, storage_key: "e/4.heif", mime_type: "image/heif", created_at: "4" },
    ];
    admin.state.storage.inspiration = {
      "e/1.png": PNG_BYTES,
      "e/2.heic": HEIC_BYTES,
      "e/3.jpg": JPEG_BYTES,
    };
    const { fake } = await run();
    expect(fake.calls.identity[0].inspiration).toEqual([
      { mimeType: "image/png", bytes: PNG_BYTES },
      { mimeType: "image/jpeg", bytes: JPEG_BYTES },
    ]);
    // HEIC and HEIF are never downloaded.
    expect(admin.state.downloads.map((d) => d.key)).toEqual(["e/1.png", "e/3.jpg"]);
    expect(telemetryOf().inspirationSkipped).toBe(2);
    // Never to the image model.
    expect(JSON.stringify(fake.calls.art)).not.toContain("inspiration");
  });

  it("skips bytes that are not the type their row records", async () => {
    admin.state.tables.inspiration_assets = [
      { event_id: EVENT, storage_key: "e/1.png", mime_type: "image/png", created_at: "1" },
    ];
    admin.state.storage.inspiration = { "e/1.png": JPEG_BYTES };
    const { fake } = await run();
    expect(fake.calls.identity[0]).toEqual({ prompt: PROMPT });
    expect(telemetryOf().inspirationSkipped).toBe(1);
  });

  it("fails the generation when an image cannot be read, rather than design without it", async () => {
    admin.state.tables.inspiration_assets = [
      { event_id: EVENT, storage_key: "e/gone.png", mime_type: "image/png", created_at: "1" },
    ];
    const { outcome, fake } = await run();
    expect(outcome).toEqual({ status: "failed", code: "internal" });
    expect(fake.calls.identity).toEqual([]);
    expect(failures()).toEqual(["internal"]);
  });
});

describe("a provider refusal of the homage (spec.md §7.6)", () => {
  it("re-prompts the design to evoke the character's world and paints its artwork", async () => {
    const { outcome, fake } = await run({
      ...HAPPY,
      design: [DESIGN, WORLD_DESIGN],
      art: [refusal(), CLEAN],
    });
    expect(outcome.status).toBe("succeeded");
    expect(fake.calls.design[1].reprompt).toEqual({
      kind: "provider-refusal",
      feedback: PROVIDER_REFUSAL_FEEDBACK,
    });
    expect(PROVIDER_REFUSAL_FEEDBACK).toMatch(/setting, props, palette and visual style/);
    // The re-prompted design keeps the generation's one suggestion.
    expect(fake.calls.design.map((c) => c.suggestedRendering)).toEqual([
      "photographic",
      "photographic",
    ]);
    expect(stages().map(([stage, artifacts]) => [stage, Object.keys(artifacts as object)])).toEqual(
      [
        ["identity", ["identity", "facts", "droppedFacts"]],
        ["design", ["design"]],
        ["design", ["notice"]],
        ["design", ["design"]],
      ],
    );
    expect(stages()[2][1]).toEqual({ notice: "provider_refusal" });
    expect((stages()[3][1] as { design: { name: string } }).design.name).toBe("Grove Morning");
    // The second design's artwork is the refusal's regeneration, and it is what is persisted.
    expect(fake.calls.art[1]).toMatchObject({ layout: "framed", artMode: "framed" });
    expect(persisted()).toMatchObject({ p_name: "Grove Morning", p_layout: "framed" });
    expect(telemetryOf()).toMatchObject({
      reprompts: ["provider-refusal"],
      artRegenerated: "provider-refusal",
      imagesRequested: 2,
      providerRefusal: true,
    });
  });

  it("fails visibly on a second refusal, with nothing uploaded", async () => {
    const { outcome, fake } = await run({
      ...HAPPY,
      design: [DESIGN, WORLD_DESIGN],
      art: [refusal(), refusal()],
    });
    expect(outcome).toEqual({ status: "failed", code: "provider_refusal" });
    expect(fake.calls.design).toHaveLength(2);
    expect(failures()).toEqual(["provider_refusal"]);
    expect(admin.state.uploads).toEqual([]);
    expect(admin.rpc("persist_generated_card")).toEqual([]);
  });

  it("does not re-prompt a refusal of the regeneration after a failed first image", async () => {
    const { outcome, fake } = await run({ ...HAPPY, art: [NOT_PNG, refusal()] });
    expect(outcome).toEqual({ status: "failed", code: "provider_refusal" });
    expect(fake.calls.design).toHaveLength(1);
    expect(stages().map(([, a]) => a)).not.toContainEqual({ notice: "provider_refusal" });
  });
});

describe("failures end the generation with fail_generation", () => {
  const cases: [string, FakeScript, string][] = [
    [
      "identity invalid twice",
      { identity: [invalid(), invalid()], facts: [FACTS] },
      "invalid_output",
    ],
    ["identity provider failure", { identity: [http500()], facts: [FACTS] }, "provider_error"],
    ["design invalid twice", { ...HAPPY, design: [invalid(), invalid()] }, "invalid_output"],
    ["design provider failure", { ...HAPPY, design: [http500()] }, "provider_error"],
    ["artwork invalid twice", { ...HAPPY, art: [NOT_PNG, NOT_PNG] }, "artwork_invalid"],
    ["artwork provider failure", { ...HAPPY, art: [http500()] }, "provider_error"],
    ["the spend ceiling", { ...HAPPY, design: [new SpendCeilingError()] }, "ceiling"],
    [
      "a generation no longer running",
      { ...HAPPY, art: [new ModelCallRefusedError("not_running", "stopped")] },
      "not_running",
    ],
  ];
  for (const [name, script, code] of cases) {
    it(`${name} → ${code}`, async () => {
      const { outcome } = await run(script);
      expect(outcome).toEqual({ status: "failed", code });
      expect(failures()).toEqual([code]);
      expect(admin.rpc("fail_generation")[0]).toMatchObject({
        p_generation_id: GENERATION,
        p_event_id: EVENT,
      });
      expect(admin.state.uploads).toEqual([]);
      expect(admin.rpc("persist_generated_card")).toEqual([]);
    });
  }

  it("records why: the stage and each image's validation failure", async () => {
    await run({ ...HAPPY, art: [NOT_PNG, NOT_PNG] });
    // The rendering drawn and the one the design chose are kept, so renderings that fail more
    // often stay in the measured mix (the test draw suggests photographic; the design is painterly).
    expect(admin.rpc("fail_generation")[0].p_telemetry).toEqual({
      failure: {
        code: "artwork_invalid",
        stage: "artwork",
        suggestedRendering: "photographic",
        rendering: "painterly",
        followedSuggestion: false,
        imagesRequested: 2,
        validationFailures: [
          { image: 1, reasons: ["type"] },
          { image: 2, reasons: ["type"] },
        ],
      },
    });
  });

  const mixed: [string, FakeScript["art"], Record<string, unknown>][] = [
    ["a provider error", [NOT_PNG, http500()], { code: "provider_error", stage: "artwork" }],
    ["a provider refusal", [NOT_PNG, refusal()], { code: "provider_refusal", stage: "artwork" }],
    [
      "a meter refusal",
      [NOT_PNG, new SpendCeilingError()],
      { code: "ceiling", refusal: "ceiling" },
    ],
  ];
  for (const [name, art, expected] of mixed) {
    it(`keeps the first image's validation failure when the retry ends in ${name}`, async () => {
      await run({ ...HAPPY, art });
      expect(admin.rpc("fail_generation")[0].p_telemetry).toMatchObject({
        failure: { ...expected, validationFailures: [{ image: 1, reasons: ["type"] }] },
      });
    });
  }

  it("never splits a character when it bounds check output", () => {
    const detail = `${"x".repeat(199)}\u{1F600}and more`;
    const error = new GenerationStageError("artwork", "artwork_invalid", "failed", {
      details: { validationFailures: [{ image: 1, reasons: ["moderation"], detail }] },
    });
    const recorded = failureTelemetry(error, "artwork_invalid") as {
      failure: { validationFailures: { detail: string }[] };
    };
    const kept = recorded.failure.validationFailures[0].detail;
    expect(kept.isWellFormed()).toBe(true);
    expect(Array.from(kept)).toHaveLength(200);
    expect(kept.endsWith("\u{1F600}")).toBe(true);
  });

  it("records the stage of other failures, and a meter refusal's reason", async () => {
    await run({ ...HAPPY, design: [invalid(), invalid()] });
    // No design was accepted: only the suggestion is known.
    expect(admin.rpc("fail_generation")[0].p_telemetry).toEqual({
      failure: { code: "invalid_output", stage: "design", suggestedRendering: "photographic" },
    });
    expect(failureTelemetry(new SpendCeilingError(), "ceiling")).toEqual({
      failure: { code: "ceiling", refusal: "ceiling" },
    });
  });

  it("keeps code-made check output bounded, never the inspector's text, and an error by name only", () => {
    const long = "letters ".repeat(80);
    const error = new GenerationStageError("artwork", "artwork_invalid", "failed", {
      details: {
        imagesRequested: 2,
        validationFailures: [{ image: 1, reasons: ["text"], detail: long }],
      },
    });
    const recorded = failureTelemetry(error, "artwork_invalid") as {
      failure: { validationFailures: { detail: string }[] };
    };
    expect(recorded.failure.validationFailures[0].detail).toBeUndefined();
    for (const reason of ["logo", "mockup", "person"] as const) {
      const inspected = new GenerationStageError("artwork", "artwork_invalid", "failed", {
        details: { validationFailures: [{ image: 1, reasons: [reason], detail: long }] },
      });
      const dropped = failureTelemetry(inspected, "artwork_invalid") as {
        failure: { validationFailures: { reasons: string[]; detail?: string }[] };
      };
      expect(dropped.failure.validationFailures[0], reason).toEqual({
        image: 1,
        reasons: [reason],
      });
    }
    const moderated = new GenerationStageError("artwork", "artwork_invalid", "failed", {
      details: { validationFailures: [{ image: 1, reasons: ["moderation"], detail: long }] },
    });
    const kept = failureTelemetry(moderated, "artwork_invalid") as {
      failure: { validationFailures: { detail: string }[] };
    };
    expect(kept.failure.validationFailures[0].detail).toHaveLength(200);
    expect(failureTelemetry(new TypeError("Maya Lopez at Villa Rosa"), "internal")).toEqual({
      failure: { code: "internal", error: "TypeError" },
    });
  });

  it("anything unexpected → internal, logged without prompt text or model output", async () => {
    admin.state.errors["record_event_identity"] = { message: "connection reset", code: "08006" };
    const { outcome } = await run();
    expect(outcome).toEqual({ status: "failed", code: "internal" });
    expect(failures()).toEqual(["internal"]);
    const logged = JSON.stringify(errors.mock.calls);
    expect(logged).toContain("connection reset");
    for (const secret of ["Maya", "Villa Rosa", "lemon", "Lemons", "Ana & Leo"]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("logs a stage failure by name, code and message only, not its cause", async () => {
    const leaky = new ModelOutputError("refusal", ["I won't draw Maya Lopez"], "Maya Lopez", {});
    await run({ identity: [leaky, invalid()], facts: [FACTS] });
    const logged = JSON.stringify(errors.mock.calls);
    expect(logged).toContain("GenerationStageError");
    expect(logged).not.toContain("Maya");
  });

  it("a generation started by another member is refused before any call", async () => {
    admin.state.tables.generations[0].requested_by = "11111111-2222-4333-8444-555555555555";
    const { outcome, fake } = await run();
    expect(outcome).toEqual({ status: "failed", code: "internal" });
    expect(fake.calls.meters).toEqual([]);
  });

  it("another kind is not yet supported: failed, then thrown", async () => {
    admin.state.tables.generations[0].kind = "another_direction";
    await expect(run()).rejects.toBeInstanceOf(GenerationKindNotSupportedError);
    expect(failures()).toEqual(["unsupported_kind"]);
  });
});

describe("the generation's deadline", () => {
  it("a deadline refusal before a valid artwork is a visible failure", async () => {
    const { outcome } = await run({ ...HAPPY, art: [new GenerationDeadlineError()] });
    expect(outcome).toEqual({ status: "failed", code: "deadline" });
    expect(failures()).toEqual(["deadline"]);
    expect(admin.state.uploads).toEqual([]);
  });

  it("a deadline refusal of the artwork's checks before it is valid fails it too", async () => {
    const { outcome } = await run({ ...HAPPY, moderation: [new GenerationDeadlineError()] });
    expect(outcome).toEqual({ status: "failed", code: "deadline" });
  });

  it("a deadline refusal during repaints keeps the valid artwork with its panel", async () => {
    const { outcome, fake } = await run({ ...HAPPY, art: [BUSY, new GenerationDeadlineError()] });
    expect(outcome.status).toBe("succeeded");
    expect(fake.calls.art).toHaveLength(2);
    expect(failures()).toEqual([]);
    const ink = persisted().p_ink as Record<string, { text: { panel?: unknown } }>;
    expect(ink.rectangle.text.panel).toBeDefined();
    expect(telemetryOf()).toMatchObject({
      repaintsStoppedBy: "deadline",
      artRepaints: 0,
      inkPanels: expect.arrayContaining([{ shape: "rectangle", zone: "text" }]),
    });
  });
});

describe("nothing is persisted once the generation stopped running", () => {
  it("does nothing for a generation that is not running when the worker starts", async () => {
    admin.state.tables.generations[0].status = "failed";
    const { outcome, fake } = await run();
    expect(outcome).toEqual({ status: "stopped" });
    expect(fake.calls.meters).toEqual([]);
    expect(admin.state.rpcs).toEqual([]);
  });

  it("stops when the identity cannot be recorded (taken over, or published)", async () => {
    admin.state.rpcAnswers.record_event_identity = null;
    const { outcome, fake } = await run();
    expect(outcome).toEqual({ status: "stopped" });
    expect(fake.calls.design).toEqual([]);
    // fail_generation touches only a running generation: here, one whose event was published.
    expect(failures()).toEqual(["published"]);
  });

  it("stops when a stage cannot be recorded, before any further model call", async () => {
    let calls = 0;
    admin.state.rpcAnswers.record_generation_stage = () => ++calls < 2;
    const { outcome, fake } = await run();
    expect(outcome).toEqual({ status: "stopped" });
    expect(fake.calls.design).toHaveLength(1);
    expect(fake.calls.art).toEqual([]);
    expect(admin.state.uploads).toEqual([]);
    expect(admin.rpc("persist_generated_card")).toEqual([]);
  });

  it("removes the upload when the persist writes nothing", async () => {
    admin.state.rpcAnswers.persist_generated_card = [];
    const { outcome } = await run();
    expect(outcome).toEqual({ status: "stopped" });
    const key = admin.state.uploads[0].key;
    expect(admin.state.removes).toEqual([{ bucket: CARD_ART_BUCKET, keys: [key] }]);
    expect(admin.state.storage[CARD_ART_BUCKET]).toEqual({});
    expect(failures()).toEqual(["published"]);
  });

  it("removes the upload when the database answered the persist with an error (rolled back)", async () => {
    for (const code of ["23514", "PGRST202"]) {
      admin.state.errors.persist_generated_card = { message: "refused", code };
      admin.state.removes.length = 0;
      const { outcome } = await run();
      expect(outcome).toEqual({ status: "failed", code: "internal" });
      expect(admin.state.removes).toEqual([
        { bucket: CARD_ART_BUCKET, keys: [admin.state.uploads.at(-1)!.key] },
      ]);
    }
  });

  it("keeps the upload, and logs its key, when the persist's response was lost", async () => {
    // A transport error: the transaction may still be running and commit after the worker gives
    // up, so the object a committed card names must never be removed.
    for (const error of [{ message: "fetch failed" }, { message: "TypeError", code: "" }]) {
      admin.state.errors.persist_generated_card = error;
      const { outcome } = await run();
      expect(outcome).toEqual({ status: "failed", code: "internal" });
      expect(admin.state.removes).toEqual([]);
      const key = admin.state.uploads.at(-1)!.key;
      expect(admin.state.storage[CARD_ART_BUCKET]).toHaveProperty([key]);
      expect(JSON.stringify(errors.mock.calls)).toContain(key);
    }
  });

  it("a failed removal is logged with its key, not thrown", async () => {
    admin.state.rpcAnswers.persist_generated_card = [];
    admin.state.errors["storage:remove"] = { message: "storage down" };
    const { outcome } = await run();
    expect(outcome).toEqual({ status: "stopped" });
    expect(JSON.stringify(errors.mock.calls)).toContain(admin.state.uploads[0].key);
  });
});
