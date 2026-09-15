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

import { validateCorpusShape } from "./corpus";

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
