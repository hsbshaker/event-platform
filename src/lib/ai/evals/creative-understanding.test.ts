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
  designConstraints: [],
  inspirationSummary: "No visual inspiration supplied.",
  ...overrides,
});

const emptyFacts = {
  hostNames: null,
  honoreeName: null,
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
        designConstraints: ["No pink in any role."],
      }),
    );
    expect(check.status).toBe("pass");
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
  it("extracts named things and ignores taste prose", () => {
    expect(properNounProbes("any Ralph Lauren logo, wordmark or crest")).toContain("Ralph Lauren");
    expect(properNounProbes("the Disney Winnie-the-Pooh character design")).toContain("Disney");
    expect(properNounProbes("cartoon or novelty treatments")).toEqual([]);
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
