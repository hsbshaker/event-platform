import { describe, expect, it } from "vitest";

import { fakeProvider, TEST_METER } from "../../../tests/unit/support/fake-provider";
import type { FakeScript } from "../../../tests/unit/support/fake-provider";

import { ModelOutputError, ProviderCallError, SpendCeilingError } from "@/lib/ai/errors";
import type { EventIdentity } from "@/lib/ai/event-identity";
import type { PreviousDirection } from "@/lib/ai/provider";
import type { CardDesign } from "@/lib/card/design";

import { runDesignStage } from "./design.server";
import type { DesignStageInput } from "./design.server";
import { GenerationStageError } from "./stage";

/**
 * Stage 2 (`spec.md §7.7`, §7.9; `docs/card-system.md §4.1`; `docs/model-contracts.md §5.3`,
 * §5.4): validation, the wording fact check and distinctness, each with at most one re-prompt.
 */

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
  refinement: "none",
};

const FACTS = { eventType: "baby shower", venue: "Villa Rosa", hosts: "Ana & Leo" };

const withWording = (
  title: string,
  invitationLine = DESIGN.wording.invitationLine,
): CardDesign => ({
  ...DESIGN,
  wording: { title, invitationLine },
});

const invalid = (...problems: string[]) =>
  new ModelOutputError("schema_invalid", problems, '{"raw":true}', {});

const EARLIER: PreviousDirection = {
  name: "Lemons & Linen",
  layout: "art-top",
  artMode: "illustration",
  primary: "oldstyle_garamond_worksans",
  subject: "a lemon branch",
  rendering: "painterly",
  aesthetic: "romantic",
};

const DIFFERENT: CardDesign = {
  ...DESIGN,
  presentation: { name: "Ceramic Garden", description: "Painted tiles frame a quiet centre." },
  layout: "framed",
  artMode: "framed",
};

function stage(script: FakeScript["design"], input: Partial<DesignStageInput> = {}) {
  const fake = fakeProvider({ design: script });
  const run = () =>
    runDesignStage(
      { provider: fake.provider, meter: TEST_METER },
      { identity: IDENTITY, eventFacts: FACTS, ...input },
    );
  return { fake, run };
}

describe("the card design stage", () => {
  it("sends the suggested rendering with every call and records whether it was followed", async () => {
    const vector: CardDesign = { ...DESIGN, artBrief: { ...DESIGN.artBrief, rendering: "vector" } };
    const { fake, run } = stage([invalid("layout: bad"), vector], { suggestedRendering: "vector" });
    const result = await run();
    expect(fake.calls.design.map((c) => c.suggestedRendering)).toEqual(["vector", "vector"]);
    expect(result.telemetry).toMatchObject({
      suggestedRendering: "vector",
      followedSuggestion: true,
    });
    const ignored = await stage([DESIGN], { suggestedRendering: "collage" }).run();
    expect(ignored.telemetry).toMatchObject({
      suggestedRendering: "collage",
      followedSuggestion: false,
    });
  });

  it("accepts a valid first design and returns what the wait surface may show", async () => {
    const { fake, run } = stage([DESIGN]);
    const result = await run();
    expect(fake.calls.design).toEqual([{ eventIdentity: IDENTITY, eventFacts: FACTS }]);
    expect(fake.calls.meters).toEqual([TEST_METER]);
    expect(result.design).toEqual(DESIGN);
    expect(result.raw).toBe(JSON.stringify(DESIGN));
    expect(result.attempts).toEqual([{ reprompt: null, raw: JSON.stringify(DESIGN), valid: true }]);
    expect(result.telemetry).toEqual({
      schemaValidFirstCall: true,
      reprompts: [],
      standardWordingSlots: [],
      repeatAccepted: false,
      acceptedEarlierDesign: false,
      hostTitleApplied: false,
      suggestedRendering: null,
      followedSuggestion: null,
    });
    expect(result.artifacts).toEqual({
      name: "Lemons & Linen",
      description: "A lemon branch over soft linen.",
      artDirection: {
        subject: "a lemon branch heavy with fruit and blossom",
        medium: "soft gouache illustration",
        mood: "sunlit and calm",
        palette: "lemon, olive and ivory",
        texture: "cream laid paper",
      },
    });
  });

  it("never sends the raw prompt: the call reads the identity and the facts", async () => {
    const { fake, run } = stage([DESIGN], { feedback: "more playful", previousDirections: [] });
    await run();
    expect(Object.keys(fake.calls.design[0]).sort()).toEqual([
      "eventFacts",
      "eventIdentity",
      "feedback",
    ]);
  });
});

describe("schema and catalog validation: one schema re-prompt, then a visible failure", () => {
  it("re-prompts once with the provider's schema problems", async () => {
    const { fake, run } = stage([invalid("layout: invalid option", "title: too long"), DESIGN]);
    const result = await run();
    expect(fake.calls.design[1].reprompt).toEqual({
      kind: "schema",
      feedback: "layout: invalid option; title: too long",
    });
    expect(result.design).toEqual(DESIGN);
    expect(result.telemetry.schemaValidFirstCall).toBe(false);
    expect(result.telemetry.reprompts.map((r) => r.kind)).toEqual(["schema"]);
    expect(result.attempts).toEqual([
      { reprompt: null, raw: '{"raw":true}', valid: false },
      { reprompt: "schema", raw: JSON.stringify(DESIGN), valid: true },
    ]);
  });

  it("re-prompts once for a catalog incompatibility the schema cannot see", async () => {
    const incompatible: CardDesign = {
      ...DESIGN,
      shape: "circle",
      typography: { primary: "grotesk_archivo_inter", alternates: [] },
    };
    const { fake, run } = stage([incompatible, DESIGN]);
    const result = await run();
    const feedback = fake.calls.design[1].reprompt?.feedback ?? "";
    expect(fake.calls.design[1].reprompt?.kind).toBe("schema");
    expect(feedback).toContain("layout art-top does not support shape circle");
    expect(feedback).toContain("outside the identity's compatible categories");
    expect(result.telemetry.schemaValidFirstCall).toBe(false);
  });

  it("fails visibly when the re-prompt is invalid too", async () => {
    const { fake, run } = stage([invalid("a"), invalid("b"), DESIGN]);
    const error = await run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GenerationStageError);
    expect(error).toMatchObject({ stage: "design", code: "invalid_output" });
    expect(fake.calls.design).toHaveLength(2);
  });

  it("fails visibly on a provider failure, and passes a meter refusal through", async () => {
    const http = new ProviderCallError("HTTP 500", { code: "http_500", billing: "none" });
    await expect(stage([http]).run()).rejects.toMatchObject({ code: "provider_error" });
    await expect(stage([new SpendCeilingError()]).run()).rejects.toBeInstanceOf(SpendCeilingError);
  });
});

describe("the wording fact check: one wording re-prompt, then standard wording", () => {
  it("re-prompts naming the failing slot", async () => {
    const { fake, run } = stage([withWording("Brunch on Saturday"), DESIGN]);
    const result = await run();
    const reprompt = fake.calls.design[1].reprompt;
    expect(reprompt?.kind).toBe("wording");
    expect(reprompt?.feedback).toContain("Rewrite title: title names a weekday (saturday)");
    expect(result.design.wording).toEqual(DESIGN.wording);
    expect(result.telemetry.standardWordingSlots).toEqual([]);
  });

  it("checks against the host's facts, never repeating a place", async () => {
    const { fake, run } = stage([
      withWording("Lemons & Linen", "Please join us at Villa Rosa"),
      DESIGN,
    ]);
    await run();
    expect(fake.calls.design[1].reprompt?.feedback).toContain(
      "invitationLine states the fact venue",
    );
  });

  it("falls back to standard wording for the slot that fails twice, and only that slot", async () => {
    const { fake, run } = stage([
      withWording("Brunch on Saturday"),
      withWording("A Little 2nd Party", "Please join us for a little party"),
    ]);
    const result = await run();
    expect(fake.calls.design).toHaveLength(2);
    expect(result.design.wording).toEqual({
      title: "A Baby Shower",
      invitationLine: "Please join us for a little party",
    });
    expect(result.telemetry.standardWordingSlots).toEqual(["title"]);
  });

  it("uses a host-supplied title verbatim and never checks it", async () => {
    const hostTitle = "Brunch at 11 on Saturday, May 3";
    const { fake, run } = stage([withWording("Lemons & Linen")], {
      eventFacts: { ...FACTS, title: hostTitle },
    });
    const result = await run();
    expect(fake.calls.design).toHaveLength(1);
    expect(result.design.wording.title).toBe(hostTitle);
    expect(result.telemetry).toMatchObject({
      reprompts: [],
      standardWordingSlots: [],
      hostTitleApplied: true,
    });
  });

  it("uses the title the host's description names verbatim, like a typed one (owner decisions, 2026-10-06)", async () => {
    // The stated title arrives in eventFacts.title (`hostEventFacts`); punctuation and capitals stay.
    for (const stated of ["The Notorious ONE", "Taco ’Bout a Baby"]) {
      const { fake, run } = stage([withWording("Little Legend, Big Beats")], {
        eventFacts: { ...FACTS, title: stated },
      });
      const result = await run();
      expect(fake.calls.design).toHaveLength(1);
      expect(fake.calls.design[0].eventFacts.title).toBe(stated);
      expect(result.design.wording.title).toBe(stated);
      expect(result.telemetry).toMatchObject({ reprompts: [], hostTitleApplied: true });
    }
  });

  it("sends no rendering when none is suggested, and records none followed", async () => {
    const { fake, run } = stage([DESIGN]);
    const result = await run();
    expect(fake.calls.design[0]).not.toHaveProperty("suggestedRendering");
    expect(result.telemetry).toMatchObject({ suggestedRendering: null, followedSuggestion: null });
  });

  it("still checks the invitation line beside a host title", async () => {
    const { fake, run } = stage(
      [
        withWording("Party at 11", "Join us at noon"),
        withWording("Party at 11", "Join us at noon"),
      ],
      { eventFacts: { ...FACTS, title: "Party at 11" } },
    );
    const result = await run();
    expect(fake.calls.design[1].reprompt?.feedback).toContain("Rewrite invitationLine:");
    expect(fake.calls.design[1].reprompt?.feedback).not.toContain("title");
    expect(result.design.wording).toEqual({
      title: "Party at 11",
      invitationLine: "Please join us for a baby shower",
    });
    expect(result.telemetry).toMatchObject({
      standardWordingSlots: ["invitationLine"],
      hostTitleApplied: false,
    });
  });
});

describe("model wording clears what a host's own text must (card-system.md §2.5)", () => {
  it("re-prompts wording the card's fonts cannot draw", async () => {
    const { fake, run } = stage([withWording("Lemons \u{1F34B} Linen"), DESIGN]);
    const result = await run();
    expect(fake.calls.design[1].reprompt).toMatchObject({ kind: "wording" });
    expect(fake.calls.design[1].reprompt?.feedback).toContain("cannot draw");
    expect(result.design.wording).toEqual(DESIGN.wording);
  });

  it("re-prompts a title too wide for the card, then falls back to standard wording", async () => {
    const wide = "WWWWWW WWWWWW WWWWWW WWWWWW WWWWWW WWWWW";
    const { fake, run } = stage([withWording(wide), withWording(wide)]);
    const result = await run();
    expect(fake.calls.design[1].reprompt?.feedback).toContain("title");
    expect(result.design.wording.title).toBe("A Baby Shower");
    expect(result.telemetry.standardWordingSlots).toEqual(["title"]);
  });

  it("builds standard wording from the stated event type when it renders", async () => {
    const { run } = stage([withWording("Brunch on Saturday"), withWording("Brunch on Saturday")], {
      eventFacts: { ...FACTS, eventType: "garden party" },
    });
    expect((await run()).design.wording.title).toBe("A Garden Party");
  });

  it("falls back to the default type when the stated one's wording would not render", async () => {
    const { run } = stage([withWording("Brunch on Saturday"), withWording("Brunch on Saturday")], {
      eventFacts: {
        ...FACTS,
        eventType: "surprise sixtieth birthday dinner for my mother-in-law",
      },
    });
    expect((await run()).design.wording.title).toBe("A Baby Shower");
  });
});

describe("direction distinctness: one repeat-direction re-prompt, then accept", () => {
  it("re-prompts an exact repeat, naming the earlier directions", async () => {
    const { fake, run } = stage([DESIGN, DIFFERENT], { previousDirections: [EARLIER] });
    const result = await run();
    const reprompt = fake.calls.design[1].reprompt;
    expect(reprompt?.kind).toBe("repeat-direction");
    expect(reprompt?.feedback).toContain(
      '"Lemons & Linen" (layout art-top, art mode illustration, primary pairing oldstyle_garamond_worksans)',
    );
    expect(fake.calls.design[1].previousDirections).toEqual([EARLIER]);
    expect(result.design).toEqual(DIFFERENT);
    expect(result.telemetry.repeatAccepted).toBe(false);
  });

  it("is not a repeat when only the pairing differs", async () => {
    const swapped: CardDesign = {
      ...DESIGN,
      typography: { primary: "soft_fraunces_manrope", alternates: [] },
    };
    const { fake, run } = stage([swapped], { previousDirections: [EARLIER] });
    await run();
    expect(fake.calls.design).toHaveLength(1);
  });

  it("accepts and records a second repeat", async () => {
    const { fake, run } = stage([DESIGN, DESIGN], { previousDirections: [EARLIER] });
    const result = await run();
    expect(fake.calls.design).toHaveLength(2);
    expect(result.design).toEqual(DESIGN);
    expect(result.telemetry.repeatAccepted).toBe(true);
  });
});

describe("the change the host asks for (card_design_v4, docs/model-contracts.md §5.1–§5.3)", () => {
  const CHANGING = {
    name: DESIGN.presentation.name,
    shape: DESIGN.shape,
    layout: DESIGN.layout,
    artMode: DESIGN.artMode,
    primary: DESIGN.typography.primary,
    wording: DESIGN.wording,
    artBrief: DESIGN.artBrief,
  };
  const PART: CardDesign = {
    ...DESIGN,
    refinement: "part",
    artBrief: { ...DESIGN.artBrief, subject: "a lemon branch with a small green toy dinosaur" },
  };

  it("sends the feedback and the card being changed with every call", async () => {
    const { fake, run } = stage([invalid("bad"), PART], {
      previousDirections: [EARLIER],
      feedback: "add a little dinosaur",
      changing: CHANGING,
    });
    await run();
    for (const call of fake.calls.design) {
      expect(call.feedback).toBe("add a little dinosaur");
      expect(call.changing).toEqual(CHANGING);
    }
  });

  it("exempts a change to part or the whole of the card from distinctness: keeping it is the point", async () => {
    for (const refinement of ["part", "whole"] as const) {
      const { fake, run } = stage([{ ...PART, refinement }], {
        previousDirections: [EARLIER],
        feedback: "add a little dinosaur",
        changing: CHANGING,
      });
      const result = await run();
      expect(fake.calls.design).toHaveLength(1);
      expect(result.design.refinement).toBe(refinement);
      expect(result.telemetry.repeatAccepted).toBe(false);
    }
  });

  it("holds a new idea to distinctness even when the host said what they wanted", async () => {
    const { fake, run } = stage([DESIGN, DIFFERENT], {
      previousDirections: [EARLIER],
      feedback: "something completely different",
      changing: CHANGING,
    });
    const result = await run();
    expect(fake.calls.design[1].reprompt?.kind).toBe("repeat-direction");
    expect(result.design).toEqual(DIFFERENT);
  });

  it("re-prompts a refinement reported without a card being changed, as schema-invalid", async () => {
    const { fake, run } = stage([PART, DIFFERENT], { previousDirections: [EARLIER] });
    const result = await run();
    expect(fake.calls.design[1].reprompt?.kind).toBe("schema");
    expect(fake.calls.design[1].reprompt?.feedback).toMatch(/refinement must be "none"/);
    expect(result.design.refinement).toBe("none");
    expect(result.telemetry.schemaValidFirstCall).toBe(false);
  });

  it("fails visibly when the re-prompt reports a refinement again", async () => {
    const { run } = stage([PART, PART]);
    await expect(run()).rejects.toMatchObject({ stage: "design", code: "invalid_output" });
  });
});

describe("each re-prompt kind at most once (docs/model-contracts.md §5.3)", () => {
  it("runs schema, wording and repeat re-prompts once each, then falls back", async () => {
    const repeatWithBadWording = withWording("Saturday Brunch");
    const { fake, run } = stage(
      [invalid("x"), repeatWithBadWording, DESIGN, repeatWithBadWording, DIFFERENT],
      { previousDirections: [EARLIER], feedback: "warmer" },
    );
    const result = await run();
    expect(fake.calls.design.map((c) => c.reprompt?.kind ?? null)).toEqual([
      null,
      "schema",
      "wording",
      "repeat-direction",
    ]);
    // Every call carries the earlier directions and the host's feedback.
    for (const call of fake.calls.design) {
      expect(call).toMatchObject({ previousDirections: [EARLIER], feedback: "warmer" });
    }
    expect(result.design.wording.title).toBe("A Baby Shower");
    expect(result.telemetry).toMatchObject({
      schemaValidFirstCall: false,
      standardWordingSlots: ["title"],
      repeatAccepted: true,
    });
    expect(fake.remaining.design).toHaveLength(1);
  });

  it("keeps a valid design when a later re-prompt's output is invalid twice", async () => {
    const { fake, run } = stage([withWording("Brunch on Saturday"), invalid("a"), invalid("b")]);
    const result = await run();
    expect(fake.calls.design.map((c) => c.reprompt?.kind ?? null)).toEqual([
      null,
      "wording",
      "schema",
    ]);
    expect(result.design.wording.title).toBe("A Baby Shower");
    expect(result.telemetry).toMatchObject({
      acceptedEarlierDesign: true,
      standardWordingSlots: ["title"],
      schemaValidFirstCall: true,
    });
    expect(result.raw).toBe(JSON.stringify(withWording("Brunch on Saturday")));
  });

  it("keeps a valid design when a re-prompt's call fails", async () => {
    const http = new ProviderCallError("HTTP 500", { code: "http_500", billing: "none" });
    const { run } = stage([DESIGN, http], { previousDirections: [EARLIER] });
    const result = await run();
    expect(result.design).toEqual(DESIGN);
    expect(result.telemetry).toMatchObject({ repeatAccepted: true, acceptedEarlierDesign: true });
  });

  it("opens with a provider-refusal re-prompt when the orchestration asks", async () => {
    const { fake, run } = stage([DESIGN], {
      providerRefusal: { feedback: "evoke the character's world" },
    });
    const result = await run();
    expect(fake.calls.design[0].reprompt).toEqual({
      kind: "provider-refusal",
      feedback: "evoke the character's world",
    });
    expect(result.attempts[0].reprompt).toBe("provider-refusal");
  });

  it("repeats the provider-refusal instruction on a later re-prompt", async () => {
    const { fake, run } = stage([withWording("Brunch on Saturday"), DESIGN], {
      providerRefusal: { feedback: "evoke the character's world" },
    });
    await run();
    expect(fake.calls.design[1].reprompt).toMatchObject({ kind: "wording" });
    expect(fake.calls.design[1].reprompt?.feedback).toContain(
      "Keep to the earlier instruction: evoke the character's world",
    );
  });
});
