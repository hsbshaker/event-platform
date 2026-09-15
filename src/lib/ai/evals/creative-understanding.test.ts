/**
 * The deterministic checks have to fail on the things they claim to catch.
 *
 * Every fixture here is hand-built, never a recorded model output. The fourteen corpus
 * cases are an evaluation set, not a golden-answer set (`docs/model-contracts.md §4.5` —
 * "Do not grow the corpus to chase coverage"); pinning real responses in unit tests would
 * turn the benchmark into a regression suite and quietly make it unusable as evidence.
 *
 * Acceptance criteria: N/A — test-only. Supports `spec.md §31 — Event Identity and
 * diversity`: "preserves supplied facts exactly and invents none".
 */
import { describe, expect, it } from "vitest";

import type { EventIdentity, EventIdentityResult } from "@/lib/ai/event-identity/contract";
import {
  checkClarification,
  checkExclusionSelfConsistency,
  checkFactsGrounded,
  checkFactsPreserved,
  checkHostNegationRespected,
  checkMustAvoid,
  evaluateCase,
  logisticsCategories,
  negatedTerms,
  properNounProbes,
  type CorpusCase,
} from "./creative-understanding";

const identity = (overrides: Partial<EventIdentity> = {}): EventIdentity => ({
  creativeDirection: "A restrained, tactile winter identity built on materials rather than motifs.",
  toneKeywords: ["restrained", "tactile", "warm"],
  colorsExplicitlyConstrained: false,
  paletteIntent: {
    requiredColors: [],
    preferredColors: ["ivory", "olive"],
    avoidColors: [],
    dominanceNotes: "",
  },
  tonalIntent: "Mid-toned and warm, with quiet contrast.",
  toneExplicitlyConstrained: false,
  compatibleTonalDirections: ["mid", "light"],
  compatibleFamilies: ["editorial"],
  compatibleTypographyCategories: ["oldstyle"],
  visualMotifs: ["fine double-rule framing"],
  textureDirection: "linen-like, with a soft paper grain",
  typographyDirection: "quiet oldstyle serif with a modern sans companion",
  copyTone: "warm, concise, unfussy",
  hostConstraints: [],
  creativeGuidance: [],
  inspirationSummary: "No visual inspiration supplied.",
  ...overrides,
});

const emptyFacts = {
  hostNames: null,
  honoreeName: null,
  honoreeDescriptionText: null,
  eventType: null,
  dateText: null,
  timeText: null,
  venueText: null,
  addressText: null,
  localityText: null,
  rsvpDeadlineText: null,
};

const corpusCase = (overrides: Partial<CorpusCase> = {}): CorpusCase => ({
  id: "TEST-01",
  prompt: "a quiet winter gathering",
  class: ["taste-heavy"],
  facts: {},
  expectClarification: "no",
  mustAvoid: [],
  ...overrides,
});

describe("fact discipline", () => {
  it("passes when every supplied fact is carried verbatim", () => {
    const check = checkFactsPreserved(
      corpusCase({
        prompt: "Baby shower at 1pm",
        facts: { eventType: "baby shower", time: "1pm" },
      }),
      { ...emptyFacts, eventType: "Baby shower", timeText: "1pm" },
    );
    // Case folds, because "Baby shower" at a sentence start is the same quotation.
    expect(check.status).toBe("pass");
  });

  it("fails when a supplied fact was normalized rather than quoted", () => {
    // The exact CU-11 failure mode: a more correct string the host never wrote.
    const check = checkFactsPreserved(
      corpusCase({
        prompt: "Baby shower on Saturday, December 19 2026 at 1pm",
        facts: { date: "Saturday, December 19 2026", time: "1pm" },
      }),
      { ...emptyFacts, dateText: "Saturday, December 19, 2026", timeText: "1:00 PM" },
    );
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("1pm");
    expect(check.detail).toContain("December 19 2026");
  });

  it("fails when a fact was invented rather than quoted", () => {
    const check = checkFactsGrounded(corpusCase({ prompt: "lemons in Italy but classy" }), {
      ...emptyFacts,
      localityText: "Positano",
    });
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("Positano");
  });

  it("passes when nothing is claimed", () => {
    expect(checkFactsGrounded(corpusCase(), emptyFacts).status).toBe("pass");
  });

  it("accepts a partial fact carried as written", () => {
    // A month is not a date, but "June" is still what the host said.
    const check = checkFactsGrounded(
      corpusCase({ prompt: "bridal shower at my mum's house in June" }),
      { ...emptyFacts, venueText: "my mum's house", dateText: "June" },
    );
    expect(check.status).toBe("pass");
  });
});

describe("negative constraints", () => {
  it("extracts the negated term from ordinary phrasings", () => {
    expect(negatedTerms("girly but no pink")).toContain("pink");
    expect(negatedTerms("Winnie the Pooh but not corny")).toContain("corny");
    expect(negatedTerms("avoid balloons")).toContain("balloons");
    expect(negatedTerms("a party without confetti")).toContain("confetti");
  });

  it("fails when the identity proposes the thing the host excluded", () => {
    const check = checkHostNegationRespected(
      corpusCase({ prompt: "girly but no pink" }),
      identity({
        paletteIntent: {
          requiredColors: [],
          preferredColors: ["soft pink", "cream"],
          avoidColors: [],
          dominanceNotes: "",
        },
      }),
    );
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("pink");
  });

  it("passes when the exclusion is recorded rather than proposed", () => {
    const check = checkHostNegationRespected(
      corpusCase({ prompt: "girly but no pink" }),
      identity({
        paletteIntent: {
          requiredColors: [],
          preferredColors: ["chartreuse", "ivory"],
          avoidColors: ["pink"],
          dominanceNotes: "",
        },
        hostConstraints: ["No pink in any role."],
        creativeGuidance: [],
      }),
    );
    expect(check.status).toBe("pass");
  });

  it("does not fail a brief for naming the exclusion in prose", () => {
    // All three of these are good answers that the bare-token version condemned.
    const regressions: [string, Partial<EventIdentity>][] = [
      [
        "girly but no pink",
        {
          paletteIntent: {
            requiredColors: [],
            preferredColors: ["coral"],
            avoidColors: ["pink"],
            dominanceNotes: "greens and corals dominate; nothing pink-adjacent",
          },
        },
      ],
      ["cute but not childish", { copyTone: "warm and charming, never childish" }],
      [
        "preppy and warm, not cheesy",
        { creativeDirection: "Preppy and warm without tipping into cheesy pastiche and kitsch." },
      ],
    ];
    for (const [prompt, patch] of regressions) {
      const check = checkHostNegationRespected(corpusCase({ prompt }), identity(patch));
      expect(check.status, `${prompt}: ${check.detail}`).not.toBe("fail");
    }
  });

  it("is not fooled by a negation cue hiding inside another word", () => {
    // "monogram" contains "no". Before word boundaries this passed a brief that proposes
    // pink as a positive typographic accent on a prompt that excluded it.
    for (const carrier of [
      "a restrained monogram and pink letterpress accents",
      "a monochrome base with pink foil detailing",
      "another warm pink, used sparingly",
    ]) {
      const check = checkHostNegationRespected(
        corpusCase({ prompt: "girly but no pink" }),
        identity({ typographyDirection: carrier }),
      );
      expect(check.status, `${carrier}: ${check.detail}`).toBe("fail");
    }
  });

  it("catches the degree-word and clause-bridging false negatives", () => {
    // "less, not none", dressed in language that happens to contain a negation token.
    for (const carrier of [
      "avoid heavy use of pink across the suite",
      "avoid leaning on pink for the accents",
      "pink is avoided as a field colour but used for the rule lines",
    ]) {
      const check = checkHostNegationRespected(
        corpusCase({ prompt: "girly but no pink" }),
        identity({ tonalIntent: carrier }),
      );
      expect(check.status, `${carrier}: ${check.detail}`).toBe("fail");
    }
  });

  it("catches the false negatives the repair introduced", () => {
    // Each of these skipped the occurrence before the cue and trailing rules were tightened.
    // They are "no pink" read as "less pink" — the failure the check exists for — dressed in
    // language that happened to contain a negation token.
    for (const carrier of [
      "pink never dominates, but it is there",
      "no more than a whisper of pink through the palette",
      "nothing but soft pink for the accents",
    ]) {
      const check = checkHostNegationRespected(
        corpusCase({ prompt: "girly but no pink" }),
        identity({ tonalIntent: carrier }),
      );
      expect(check.status, `${carrier}: ${check.detail}`).toBe("fail");
    }
  });

  it("still gates a palette proposal even when the exclusion is carried", () => {
    // The downgrade is scoped to prose. A colour in preferredColors is a design decision, not
    // a sentence, so recording "no pink" earns no licence to put blush in the palette — that
    // is "no pink" read as "less pink", which the corpus calls an outright failure.
    const check = checkHostNegationRespected(
      corpusCase({ prompt: "girly but no pink" }),
      identity({
        hostConstraints: ["no pink"],
        paletteIntent: {
          requiredColors: [],
          preferredColors: ["blush pink"],
          avoidColors: [],
          dominanceNotes: "",
        },
      }),
    );
    expect(check.status).toBe("fail");
  });

  it("gates a motif proposal on the same footing as a palette one", () => {
    const check = checkHostNegationRespected(
      corpusCase({ prompt: "christening, no gold anywhere" }),
      identity({ hostConstraints: ["no gold"], visualMotifs: ["fine gold rule work"] }),
    );
    expect(check.status).toBe("fail");
  });

  it("downgrades only a prose mention, and only when the exclusion is carried", () => {
    const carried = checkHostNegationRespected(
      corpusCase({ prompt: "supper — we're Vietnamese, not Chinese" }),
      identity({
        hostConstraints: ["we're Vietnamese, not Chinese"],
        creativeDirection:
          "Rooted in Vietnamese tradition, a world apart from Chinese festival design.",
      }),
    );
    expect(carried.status).toBe("advisory");

    const uncarried = checkHostNegationRespected(
      corpusCase({ prompt: "supper — we're Vietnamese, not Chinese" }),
      identity({
        creativeDirection:
          "Rooted in Vietnamese tradition, a world apart from Chinese festival design.",
      }),
    );
    expect(uncarried.status).toBe("fail");
  });

  it("still suppresses a genuine trailing exclusion", () => {
    for (const carrier of [
      "pink is entirely absent",
      "pink must be avoided throughout",
      "pink, excluded at every level",
    ]) {
      const check = checkHostNegationRespected(
        corpusCase({ prompt: "girly but no pink" }),
        identity({ tonalIntent: carrier }),
      );
      expect(check.status, `${carrier}: ${check.detail}`).not.toBe("fail");
    }
  });

  it("does not punish a brief for naming what the host corrected, once it is carried", () => {
    // The hazard HO-06 pre-registered: "not Chinese" makes "chinese" a negated term, and a
    // brief distinguishing one tradition from another then fails for doing the right thing.
    const check = checkHostNegationRespected(
      corpusCase({ prompt: "Tet dinner for my parents - we're Vietnamese, not Chinese, please" }),
      identity({
        hostConstraints: ["we're Vietnamese, not Chinese"],
        creativeDirection: "Rooted specifically in Vietnamese Tet, distinct from Chinese New Year.",
      }),
    );
    expect(check.status).not.toBe("fail");
  });

  it("catches an exclusion the model contradicts itself on", () => {
    const check = checkExclusionSelfConsistency(
      identity({
        paletteIntent: {
          requiredColors: [],
          preferredColors: ["dusty pink"],
          avoidColors: ["pink"],
          dominanceNotes: "",
        },
      }),
    );
    expect(check.status).toBe("fail");
  });
});

describe("mustAvoid probing", () => {
  it("gates on full names and only advises on their parts", () => {
    const rl = properNounProbes("any Ralph Lauren logo, wordmark or crest");
    expect(rl.gating).toContain("Ralph Lauren");
    // "Ralph" alone cannot tell a reproduction from the translation spec.md §7.6 asks for.
    expect(rl.advisory).toContain("Ralph");
    expect(rl.gating).not.toContain("Ralph");

    const pooh = properNounProbes("the Disney Winnie-the-Pooh character design");
    expect(pooh.gating).toContain("Disney Winnie-the-Pooh");
    expect(pooh.advisory).toContain("Disney");
  });

  it("finds nothing to probe in taste prose", () => {
    const probes = properNounProbes("cartoon or novelty treatments");
    expect(probes.gating).toEqual([]);
    expect(probes.advisory).toEqual([]);
  });

  it("does not fail a brief for translating a reference into original language", () => {
    // "Polo Bear" is forbidden; "polo-field linework" is exactly what §7.6 wants instead.
    const checks = checkMustAvoid(
      corpusCase({ mustAvoid: ["Polo Bear"] }),
      identity({ visualMotifs: ["restrained polo-field linework"] }),
    );
    expect(checks.find((c) => c.name === "mustAvoidNamedThings")?.status).toBe("pass");
    expect(checks.find((c) => c.name === "mustAvoidNameEchoes")?.status).toBe("advisory");
  });

  it("gates a protected character written with spaces where the corpus used hyphens", () => {
    // "Winnie-the-Pooh" in the corpus, "Winnie the Pooh" in any identity that proposes it.
    // Before normalization this probe could never fire on the one case it exists for.
    const checks = checkMustAvoid(
      corpusCase({ mustAvoid: ["the Disney Winnie-the-Pooh character design"] }),
      identity({ visualMotifs: ["the Disney Winnie the Pooh characters, softened"] }),
    );
    expect(checks.find((c) => c.name === "mustAvoidNamedThings")?.status).toBe("fail");
  });

  it("normalizes both sides, not just the probe", () => {
    // The mirror of the case above: the corpus names it with spaces, the identity hyphenates.
    const checks = checkMustAvoid(
      corpusCase({ mustAvoid: ["Polo Bear"] }),
      identity({ visualMotifs: ["a Polo-Bear motif, softened"] }),
    );
    expect(checks.find((c) => c.name === "mustAvoidNamedThings")?.status).toBe("fail");
  });

  it("lets a brief name a licensed reference without reproducing its artwork", () => {
    // spec.md §7.6 licenses the house as shorthand; the entry forbids the logo. Naming the
    // reference in a thesis is the most natural correct answer to "Ralph Lauren but baby".
    const named = checkMustAvoid(
      corpusCase({ mustAvoid: ["any Ralph Lauren logo, wordmark or crest"] }),
      identity({ creativeDirection: "Ralph Lauren heritage prep, translated for a nursery." }),
    );
    expect(named.find((c) => c.name === "mustAvoidNamedThings")?.status).toBe("pass");

    // Reaching for the artifact itself still fails.
    const reproduced = checkMustAvoid(
      corpusCase({ mustAvoid: ["any Ralph Lauren logo, wordmark or crest"] }),
      identity({ visualMotifs: ["the Ralph Lauren crest as a repeating wordmark"] }),
    );
    expect(reproduced.find((c) => c.name === "mustAvoidNamedThings")?.status).toBe("fail");
  });

  it("leaves an inferred-fact prohibition to the fact checks", () => {
    // CU-03 forbids inferring Positano *as a fact*. "Amalfi-coast lemon groves" in the
    // creative direction is licensed aesthetic inference, and the real failure — a fabricated
    // localityText — is checkFactsGrounded's to catch.
    const checks = checkMustAvoid(
      corpusCase({
        mustAvoid: ["inferring Positano, the Amalfi coast or any named place as a fact"],
      }),
      identity({
        creativeDirection: "Amalfi-coast lemon groves rendered as restrained still life.",
      }),
    );
    expect(checks.find((c) => c.name === "mustAvoidNamedThings")?.status).toBe("pass");
  });

  it("fails when a forbidden named thing appears in the identity", () => {
    const checks = checkMustAvoid(
      corpusCase({ mustAvoid: ["any Ralph Lauren logo, wordmark or crest"] }),
      identity({ visualMotifs: ["the Ralph Lauren crest, restrained"] }),
    );
    expect(checks.find((c) => c.name === "mustAvoidNamedThings")?.status).toBe("fail");
  });

  it("reports taste prohibitions as not mechanically checkable rather than passing them", () => {
    const checks = checkMustAvoid(
      corpusCase({ mustAvoid: ["cartoon or novelty treatments"] }),
      identity(),
    );
    expect(checks.find((c) => c.name === "mustAvoidTasteJudgements")?.status).toBe("advisory");
  });
});

describe("clarification judgement", () => {
  const question = (text: string, defers = 1) => ({
    kind: "creative" as const,
    question: text,
    whyItMatters: "different answers would produce materially different identities",
    options: [
      { label: "A", isDefer: false },
      { label: "B", isDefer: false },
      ...Array.from({ length: defers }, () => ({ label: "You decide", isDefer: true })),
    ],
  });

  it("passes a prompt that was already sufficient and got no questions", () => {
    const checks = checkClarification(corpusCase({ expectClarification: "no" }), [], false);
    expect(checks.every((c) => c.status !== "fail")).toBe(true);
  });

  it("fails over-asking on a sufficient prompt", () => {
    const checks = checkClarification(
      corpusCase({ expectClarification: "no" }),
      [question("Should this lean heritage or contemporary?")],
      true,
    );
    expect(checks.find((c) => c.name === "clarificationExpectation")?.status).toBe("fail");
  });

  it("fails a logistics question", () => {
    const checks = checkClarification(
      corpusCase({ expectClarification: "likely" }),
      [question("Where is the event being held?")],
      true,
    );
    expect(checks.find((c) => c.name === "clarificationNotLogistics")?.status).toBe("fail");
  });

  it("does not mistake a design question for a logistics question", () => {
    expect(logisticsCategories("Where should the emphasis sit — type or texture?")).toEqual([]);
    expect(logisticsCategories("What time of day should the palette evoke?")).toEqual([]);
    expect(logisticsCategories("When is the event?")).toEqual(["date"]);
  });

  it("fails a question with no defer option, and one with two", () => {
    const none = checkClarification(
      corpusCase({ expectClarification: "likely" }),
      [question("Barefoot-coastal or nautical?", 0)],
      true,
    );
    expect(none.find((c) => c.name === "clarificationOffersDefer")?.status).toBe("fail");

    const two = checkClarification(
      corpusCase({ expectClarification: "likely" }),
      [question("Barefoot-coastal or nautical?", 2)],
      true,
    );
    expect(two.find((c) => c.name === "clarificationOffersDefer")?.status).toBe("fail");
  });

  it("fails when `needed` disagrees with the questions returned", () => {
    const checks = checkClarification(corpusCase({ expectClarification: "likely" }), [], true);
    expect(checks.find((c) => c.name === "clarificationFlagAgrees")?.status).toBe("fail");
  });

  it("never gates on a judgement call the corpus only expects", () => {
    const checks = checkClarification(corpusCase({ expectClarification: "expected" }), [], false);
    expect(checks.find((c) => c.name === "clarificationExpectation")?.status).toBe("advisory");
  });
});

describe("evaluateCase", () => {
  const result = (overrides: Partial<EventIdentityResult> = {}): EventIdentityResult => ({
    identity: identity(),
    suppliedFacts: emptyFacts,
    clarification: { needed: false, questions: [] },
    ...overrides,
  });

  it("passes a clean response", () => {
    expect(evaluateCase(corpusCase(), result()).mechanicalPass).toBe(true);
  });

  it("does not pass when any gating check fails", () => {
    const evaluation = evaluateCase(
      corpusCase({ prompt: "girly but no pink" }),
      result({
        identity: identity({
          paletteIntent: {
            requiredColors: ["blush pink"],
            preferredColors: [],
            avoidColors: [],
            dominanceNotes: "",
          },
        }),
      }),
    );
    expect(evaluation.mechanicalPass).toBe(false);
  });

  it("is not failed by advisory checks alone", () => {
    const evaluation = evaluateCase(
      corpusCase({ expectClarification: "expected", mustAvoid: ["cartoon or novelty treatments"] }),
      result(),
    );
    expect(evaluation.checks.some((c) => c.status === "advisory")).toBe(true);
    expect(evaluation.mechanicalPass).toBe(true);
  });
});
