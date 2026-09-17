/**
 * The corpus shape guard, verified without spending a case.
 *
 * This file exists because the guard was first written inside the eval runner and "verified" by
 * invoking it — which, with an API key in the environment, started a real regression run that had
 * to be killed and discarded. A guard on a hazard must be checkable without triggering it.
 *
 * Acceptance criteria: N/A — benchmark integrity. `docs/model-contracts.md §4.5`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { leakageProbes, validateCorpusShape } from "./corpus";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const read = (file: string) => JSON.parse(readFileSync(`${ROOT}docs/model-evals/${file}`, "utf8"));

const valid = {
  version: "1.0.0",
  cases: [
    { id: "X-01", prompt: "a quiet winter gathering", expectClarification: "no" },
    { id: "X-02", prompt: "something for my sister", expectClarification: "expected" },
  ],
};

describe("the corpora we actually ship satisfy the published contract", () => {
  // Running the real files here is the point: it is the only way to know the contract in
  // `docs/model-contracts.md §4.5` describes the corpora rather than an idea of them.
  it.each(["creative-understanding.json", "creative-understanding-holdout.json"])("%s", (file) => {
    expect(validateCorpusShape(read(file))).toEqual([]);
  });
});

describe("a corpus that would spend a paid case on nothing is refused", () => {
  it("accepts a well-formed corpus", () => {
    expect(validateCorpusShape(valid)).toEqual([]);
  });

  it("refuses a case with no prompt, naming the case", () => {
    // The expensive one: `undefined` would be interpolated into the user message and a sealed
    // case spent on the literal string.
    const problems = validateCorpusShape({
      ...valid,
      cases: [{ id: "X-01", expectClarification: "no" }],
    });
    expect(problems).toEqual(["X-01: `prompt` must be a non-empty string"]);
  });

  it("refuses a whitespace-only prompt as well as a missing one", () => {
    const problems = validateCorpusShape({
      ...valid,
      cases: [{ id: "X-01", prompt: "   ", expectClarification: "no" }],
    });
    expect(problems).toEqual(["X-01: `prompt` must be a non-empty string"]);
  });

  it("refuses a missing version, which would journal `corpusVersion: undefined`", () => {
    expect(validateCorpusShape({ cases: valid.cases })).toEqual([
      "top-level `version` must be a non-empty string",
    ]);
  });

  it("refuses a duplicate id, which would make one case unrecoverable from the journal", () => {
    const problems = validateCorpusShape({
      ...valid,
      cases: [valid.cases[0], { ...valid.cases[1], id: "X-01" }],
    });
    expect(problems).toEqual(["X-01: duplicate `id`"]);
  });

  it("refuses an unknown clarification label rather than silently downgrading the check", () => {
    const problems = validateCorpusShape({
      ...valid,
      cases: [{ id: "X-01", prompt: "a party", expectClarification: "maybe" }],
    });
    expect(problems).toEqual([
      "X-01: `expectClarification` must be one of no, likely, acceptable, expected",
    ]);
  });

  it("refuses a missing clarification label the same way", () => {
    const problems = validateCorpusShape({ ...valid, cases: [{ id: "X-01", prompt: "a party" }] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("`expectClarification`");
  });

  it("names a case by index when it has no usable id", () => {
    const problems = validateCorpusShape({ ...valid, cases: [{ prompt: "a party" }] });
    expect(problems).toEqual([
      "cases[0]: `id` must be a non-empty string",
      "cases[0]: `expectClarification` must be one of no, likely, acceptable, expected",
    ]);
  });

  it("reports every problem at once, not just the first", () => {
    // An author fixing a corpus cannot run our checker, so one round trip per problem is the
    // wrong shape of feedback.
    // One `version` problem plus three per case: exact, so the accumulation is pinned rather
    // than bounded.
    expect(validateCorpusShape({ cases: [{}, {}] })).toHaveLength(7);
  });

  it("refuses an empty or absent case list instead of running zero cases", () => {
    expect(validateCorpusShape({ version: "1.0.0", cases: [] })).toContain(
      "`cases` must be a non-empty array",
    );
    expect(validateCorpusShape({ version: "1.0.0" })).toContain(
      "`cases` must be a non-empty array",
    );
  });

  it("does not throw on junk", () => {
    // It is handed `JSON.parse` output, which can be anything at all.
    expect(() => validateCorpusShape(null)).not.toThrow();
    expect(() => validateCorpusShape("a string")).not.toThrow();
    // A top-level array is what a hand-edited corpus most plausibly becomes.
    expect(() => validateCorpusShape([{ id: "X-01" }])).not.toThrow();
    // …and a null or primitive case inside an otherwise well-formed list.
    expect(() => validateCorpusShape({ version: "1.0.0", cases: [null, 3, "x"] })).not.toThrow();
    expect(validateCorpusShape(null).length).toBeGreaterThan(0);
    expect(validateCorpusShape([{ id: "X-01" }]).length).toBeGreaterThan(0);
    expect(validateCorpusShape({ version: "1.0.0", cases: [null] })).toHaveLength(3);
  });

  it("ignores the optional fields entirely, so any corpus style passes", () => {
    // Regression-style, validation-style and neither: the sealed challenge may use any of them,
    // and the runner must not care.
    expect(
      validateCorpusShape({
        version: "1.0.0",
        cases: [
          { ...valid.cases[0], facts: { dateText: "March 12" }, mustAvoid: ["neon"] },
          { ...valid.cases[1], hostPhrases: [{ phrase: "no candles" }], tests: ["authority"] },
        ],
      }),
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ leakage probes */

/**
 * What the leakage scan will look for, decided here rather than inside the scan.
 *
 * The scan reads corpora of two shapes now — a Phase 4A/4B host `prompt` with assertions about it,
 * and a Phase 4C authoritative `identity` brief with no host prompt at all. This block exists for
 * the same reason the shape guard above does: the rule has to be checkable without running the
 * module that spends money.
 *
 * The 4C half is where the sharp edge is, and it was not hypothetical. A brief must declare
 * `compatibleFamilies` from a closed enum, and `editorial` is in the Event Identity prompt and in
 * the DesignIntent wire schema *because the schema puts it there*. Scanning it would have reported
 * a leak on every 4C case ever written, on a value its author is not allowed to change — and `§3.5`
 * says a collision is fixed at the corpus, never at the scanner. The only escape would have been
 * editing the scanner after seeing the cases, which is the one move the T19-before-T20 ordering
 * exists to prevent. The enums are excluded now, before any case exists.
 */
describe("leakage probes cover what an author wrote, and nothing a schema forced", () => {
  const brief = {
    creativeDirection: "A late-summer supper in an orchard, lit as the light goes.",
    toneKeywords: ["unhurried", "orchard-lit"],
    colorsExplicitlyConstrained: false,
    paletteIntent: {
      requiredColors: ["the school's deep green"],
      preferredColors: [],
      avoidColors: ["anything neon"],
      dominanceNotes: "Let one warm tone carry the page.",
    },
    tonalIntent: "Low light, warm ground, nothing stark.",
    toneExplicitlyConstrained: false,
    compatibleTonalDirections: ["mid", "dark"],
    compatibleFamilies: ["editorial", "invitation"],
    compatibleTypographyCategories: ["transitional", "oldstyle"],
    visualMotifs: ["orchard rows"],
    textureDirection: "Paper that has been handled.",
    typographyDirection: "Something with a written hand in it.",
    copyTone: "Spoken, not announced.",
    hostConstraints: ["No photographs of the honoree"],
    creativeGuidance: ["I would reach for candlelight over string lights"],
    inspirationSummary: "No visual inspiration supplied.",
  };

  it("scans every prose field an author actually wrote", () => {
    const { verbatim } = leakageProbes({
      id: "DI-01",
      eventType: "orchard supper",
      identity: brief,
    });
    for (const written of [
      brief.creativeDirection,
      "unhurried",
      "orchard-lit",
      "the school's deep green",
      "anything neon",
      brief.paletteIntent.dominanceNotes,
      brief.tonalIntent,
      "orchard rows",
      brief.textureDirection,
      brief.typographyDirection,
      brief.copyTone,
      brief.hostConstraints[0],
      brief.creativeGuidance[0],
    ]) {
      expect(verbatim, `${written} is not being scanned`).toContain(written);
    }
  });

  it("excludes the three closed enums, which no author can change", () => {
    const { verbatim, claims } = leakageProbes({ id: "DI-01", identity: brief });
    for (const forced of ["editorial", "invitation", "transitional", "oldstyle", "mid", "dark"]) {
      expect([...verbatim, ...claims], `${forced} is a forced enum value`).not.toContain(forced);
    }
  });

  it("excludes the no-inspiration sentinel, and scans a real summary", () => {
    // The sentinel is quoted in the prompt because `contract.ts` requires it verbatim, so every
    // case that supplies no inspiration would otherwise leak.
    expect(leakageProbes({ identity: brief }).verbatim).not.toContain(
      "No visual inspiration supplied.",
    );
    const withInspiration = {
      ...brief,
      inspirationSummary: "A postcard of a walled kitchen garden",
    };
    expect(leakageProbes({ identity: withInspiration }).verbatim).toContain(
      "A postcard of a walled kitchen garden",
    );
  });

  it("does not probe the event type, which is never model-visible", () => {
    // It never reaches the model and never appears in the blind artifact: it is a grouping key for
    // the same-type measurement, not benchmark content. It would also collide with the plan's own
    // worked example, which names two event types in prose the model never sees.
    const { verbatim, claims } = leakageProbes({
      id: "DI-01",
      eventType: "quinceanera",
      identity: brief,
    });
    expect([...verbatim, ...claims]).not.toContain("quinceanera");
  });

  it("probes an author note and a supplied fact, which are benchmark content", () => {
    const { claims } = leakageProbes({
      id: "DI-01",
      identity: brief,
      notes: "this case probes the creative leap",
      suppliedFacts: { venueText: "the Orangery at Kew" },
    });
    expect(claims).toContain("this case probes the creative leap");
    expect(claims).toContain("the Orangery at Kew");
  });

  it("still reads a Phase 4A/4B case exactly as it always did", () => {
    const { verbatim, claims } = leakageProbes({
      id: "HO-11",
      prompt: "a quiet winter gathering for my mother",
      mustAvoid: ["snowflake clipart"],
      hostPhrases: [{ phrase: "nothing sparkly" }],
      expectedFacts: { dateText: "March 12" },
      facts: { venueText: "the village hall" },
      rationale: "the honoree rule, in its negative half",
    });
    expect(verbatim).toEqual(["a quiet winter gathering for my mother"]);
    expect(claims).toEqual(
      expect.arrayContaining([
        "snowflake clipart",
        "nothing sparkly",
        "March 12",
        "the village hall",
        "the honoree rule, in its negative half",
      ]),
    );
  });

  it("returns empty lists rather than throwing on a shape it does not know", () => {
    // The scan runs over whatever a corpus file holds. A case it cannot read must cover nothing
    // loudly, not crash the suite that is meant to be watching.
    for (const odd of [null, undefined, 3, "x", {}, { identity: null }, { identity: "brief" }]) {
      expect(leakageProbes(odd)).toEqual({ verbatim: [], claims: [] });
    }
  });

  it("never emits a short string, which would match ordinary English on any surface", () => {
    const { verbatim, claims } = leakageProbes({
      id: "DI-01",
      prompt: "  ",
      identity: { ...brief, copyTone: "" },
      notes: "   ",
    });
    expect([...verbatim, ...claims].every((probe) => probe.trim().length >= 6)).toBe(true);
  });
});
