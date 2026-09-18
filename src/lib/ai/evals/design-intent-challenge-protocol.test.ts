/**
 * The v3 sealed-challenge protocol is only worth something if it was frozen *first*, so this file
 * pins it and the canon it transcribes.
 *
 * Two properties are being protected, and they fail in opposite directions. **Drift**: a value here
 * quietly edited after a half arrives would turn a precommitment into a description of whatever
 * showed up, which is the failure mode every freeze in this programme exists to stop. **Shape**:
 * the checks must be exercisable while no corpus exists, or the first time anyone runs them will be
 * the moment a real half is on disk and the pressure to "fix the checker" is highest. So the
 * composition checks are tested against skeletal `{ id, eventType }` objects — never anything
 * resembling a case, because inventing case-like content is precisely what the lead is prohibited
 * from doing here.
 *
 * The corpus conformance test below is deliberately **tolerant of absence**. T19B learned this the
 * hard way with a hard `existsSync(...) === false`: an assertion that the file is missing forces
 * whoever adds it to edit a test in the same change, which is the one thing a frozen benchmark must
 * not require.
 *
 * Acceptance criteria: N/A — test-only, evidence machinery. `docs/phase-4b-plan.md` Part IV (the
 * mixed-author protocol freeze), `§3.4`–`§3.6`; `docs/model-contracts.md §4.7`.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CLAUDE_AUTHORED_V3_CASE_QUOTA,
  SEALED_CHALLENGE_V3_CASES_PER_HALF,
  SEALED_CHALLENGE_V3_CASE_IDS,
  SEALED_CHALLENGE_V3_DISTINCT_TYPES_PER_HALF,
  SEALED_CHALLENGE_V3_HALVES,
  SEALED_CHALLENGE_V3_SAME_TYPE_PAIRS_PER_HALF,
  SEALED_CHALLENGE_V3_VERSION,
  SEALED_CHALLENGE_V3_WITHHELD_FROM_AUTHORS,
  checkAssembledSealedChallengeV3,
  checkHalfComposition,
} from "./design-intent-challenge-protocol";
import { CORPUS_FILES, INVALIDATED_CORPORA, corpusPath } from "./corpus";

const ROOT = `${process.cwd().replace(/\/+$/, "")}/`;
const read = (rel: string) => readFileSync(`${ROOT}${rel}`, "utf8");
const PLAN = read("docs/phase-4b-plan.md");

/** Six skeletal cases: one shared type, four distinct. Ids and types only, by design. */
const half = (index: 0 | 1) => SEALED_CHALLENGE_V3_HALVES[index];
const lawfulCases = (index: 0 | 1) =>
  half(index).caseIds.map((id, position) => ({
    id,
    eventType: position < 2 ? "type-a" : `type-${position}`,
  }));

describe("the v3 sealed-challenge protocol, frozen before either author wrote a case", () => {
  describe("the precommitted values", () => {
    it("splits twelve cases across two families and gives the lead none of them", () => {
      expect(SEALED_CHALLENGE_V3_HALVES.map((entry) => entry.family)).toEqual([
        "ChatGPT",
        "Gemini",
      ]);
      expect(CLAUDE_AUTHORED_V3_CASE_QUOTA).toBe(0);
      expect(SEALED_CHALLENGE_V3_CASE_IDS).toEqual([
        "DIC3-G01",
        "DIC3-G02",
        "DIC3-G03",
        "DIC3-G04",
        "DIC3-G05",
        "DIC3-G06",
        "DIC3-M01",
        "DIC3-M02",
        "DIC3-M03",
        "DIC3-M04",
        "DIC3-M05",
        "DIC3-M06",
      ]);
      expect(SEALED_CHALLENGE_V3_VERSION).toBe("design_intent_sealed_challenge_v3");
      expect({
        perHalf: SEALED_CHALLENGE_V3_CASES_PER_HALF,
        pairs: SEALED_CHALLENGE_V3_SAME_TYPE_PAIRS_PER_HALF,
        distinct: SEALED_CHALLENGE_V3_DISTINCT_TYPES_PER_HALF,
      }).toEqual({ perHalf: 6, pairs: 1, distinct: 5 });
    });

    it("reserves a namespace no prior corpus can collide with", () => {
      // Ids only — this reads the id field of every corpus on disk and nothing else, because a
      // namespace check that opened the cases would contaminate the thing it is protecting.
      const prefixes = new Set<string>();
      for (const file of [
        ...Object.values(CORPUS_FILES).map((name) => `docs/model-evals/${name}`),
        ...INVALIDATED_CORPORA.map((entry) => entry.path),
      ]) {
        if (!existsSync(`${ROOT}${file}`)) continue;
        const parsed = JSON.parse(read(file)) as { cases?: { id?: unknown }[] };
        for (const testCase of parsed.cases ?? []) {
          if (typeof testCase?.id === "string") {
            prefixes.add(testCase.id.replace(/[-_]?\d+$/, ""));
          }
        }
      }
      for (const entry of SEALED_CHALLENGE_V3_HALVES) {
        for (const prefix of prefixes) {
          // The v3 corpus itself is legally in this set once it lands, so an exact self-match on
          // the reserved prefixes is expected rather than a collision.
          if (SEALED_CHALLENGE_V3_HALVES.some((declared) => declared.prefix === prefix)) continue;
          expect(
            prefix.startsWith(entry.prefix) || entry.prefix.startsWith(prefix),
            `${entry.prefix} collides with the existing namespace ${prefix}`,
          ).toBe(false);
        }
      }
    });

    it("names every route by which the challenge would stop being sealed", () => {
      expect(SEALED_CHALLENGE_V3_WITHHELD_FROM_AUTHORS).toHaveLength(15);
      for (const item of [
        "any previous corpus",
        "the DesignIntent prompt",
        "known model failures",
        "§3.7 gate arithmetic",
        "the other author's half, before both halves are complete",
      ]) {
        expect(SEALED_CHALLENGE_V3_WITHHELD_FROM_AUTHORS).toContain(item);
      }
    });
  });

  describe("the per-half composition check", () => {
    it("accepts a lawful half", () => {
      expect(checkHalfComposition(half(0), lawfulCases(0))).toEqual([]);
      expect(checkHalfComposition(half(1), lawfulCases(1))).toEqual([]);
    });

    it("rejects a half that is not exactly six cases", () => {
      expect(checkHalfComposition(half(0), lawfulCases(0).slice(0, 5)).join(" ")).toContain(
        "expected exactly 6 cases",
      );
    });

    it("rejects an id outside the precommitted namespace, and a missing one", () => {
      const swapped = lawfulCases(0).map((testCase, index) =>
        index === 0 ? { ...testCase, id: "DIC3-M01" } : testCase,
      );
      const problems = checkHalfComposition(half(0), swapped).join(" ");
      expect(problems).toContain("outside the precommitted namespace");
      expect(problems).toContain("missing precommitted `id` DIC3-G01");
    });

    it("rejects a duplicate id", () => {
      const duplicated = lawfulCases(0).map((testCase, index) =>
        index === 1 ? { ...testCase, id: "DIC3-G01" } : testCase,
      );
      expect(checkHalfComposition(half(0), duplicated).join(" ")).toContain("duplicate `id`");
    });

    it("rejects six distinct event types — the pair is required, not optional", () => {
      const noPair = lawfulCases(0).map((testCase, index) => ({
        ...testCase,
        eventType: `type-${index}`,
      }));
      expect(checkHalfComposition(half(0), noPair).join(" ")).toContain(
        "found 0 pair(s) across 6 distinct types",
      );
    });

    it("rejects three cases sharing a type, which a pair search would have missed", () => {
      const triple = lawfulCases(0).map((testCase, index) => ({
        ...testCase,
        eventType: index < 3 ? "type-a" : `type-${index}`,
      }));
      expect(checkHalfComposition(half(0), triple).join(" ")).toContain("appears 3 times");
    });

    it("rejects two pairs", () => {
      const twoPairs = lawfulCases(0).map((testCase, index) => ({
        ...testCase,
        eventType: index < 2 ? "type-a" : index < 4 ? "type-b" : `type-${index}`,
      }));
      expect(checkHalfComposition(half(0), twoPairs).join(" ")).toContain(
        "found 2 pair(s) across 4 distinct types",
      );
    });

    it("says so rather than guessing when a case carries no event type", () => {
      const missing = lawfulCases(0).map((testCase, index) =>
        index === 0 ? { id: testCase.id } : testCase,
      );
      expect(checkHalfComposition(half(0), missing).join(" ")).toContain(
        "has no `eventType`, so the same-event-type rule cannot be checked",
      );
    });
  });

  describe("the assembled-corpus check", () => {
    const assembled = () => ({
      version: SEALED_CHALLENGE_V3_VERSION,
      cases: [...lawfulCases(0), ...lawfulCases(1)],
    });

    it("accepts a corpus assembled in the declared order", () => {
      expect(checkAssembledSealedChallengeV3(assembled())).toEqual([]);
    });

    it("rejects the wrong top-level version", () => {
      expect(
        checkAssembledSealedChallengeV3({
          ...assembled(),
          version: "design_intent_sealed_challenge_v2",
        }).join(" "),
      ).toContain("top-level `version` must be `design_intent_sealed_challenge_v3`");
    });

    it("rejects a corpus reordered after it was read", () => {
      const corpus = assembled();
      const reordered = { ...corpus, cases: [...corpus.cases].reverse() };
      expect(checkAssembledSealedChallengeV3(reordered).join(" ")).toContain(
        "in the declared assembly order",
      );
    });

    it("rejects a corpus that is not twelve cases", () => {
      const corpus = assembled();
      expect(
        checkAssembledSealedChallengeV3({ ...corpus, cases: corpus.cases.slice(0, 11) }).join(" "),
      ).toContain("in the declared assembly order");
    });

    it("allows a cross-half event-type match, which is legal on purpose", () => {
      const corpus = assembled();
      const shared = corpus.cases.map((testCase, index) =>
        index === 6 || index === 7 ? { ...testCase, eventType: "type-a" } : testCase,
      );
      expect(checkAssembledSealedChallengeV3({ ...corpus, cases: shared })).toEqual([]);
    });
  });

  describe("the corpus itself, whenever it lands", () => {
    /**
     * Absence is not asserted. While the corpus is missing this test passes having checked
     * nothing, and the record that no case existed at the protocol freeze lives in `git` — the
     * freeze commit's tree contains no v3 corpus — rather than in an assertion someone would have
     * to delete in order to add the file.
     */
    it("conforms to what was precommitted here, or does not exist yet", () => {
      const file = `${ROOT}${corpusPath("designIntentChallenge")}`;
      if (!existsSync(file)) return;
      expect(checkAssembledSealedChallengeV3(JSON.parse(readFileSync(file, "utf8")))).toEqual([]);
    });
  });

  describe("the canon it transcribes", () => {
    it("still says the lead authors none of it", () => {
      expect(PLAN).toContain(
        "six cases `DIC3-M01`–`DIC3-M06` from a fresh Gemini session; **zero from Claude**",
      );
      expect(PLAN).toContain("**user-supplied provenance, not a cryptographic claim**");
    });

    it("still refuses the selection shortcuts that would make this a bespoke benchmark", () => {
      expect(PLAN).toContain('There is **no "best six from a larger pool"**');
      expect(PLAN).toContain("**never reordered by quality, difficulty or\ncontent**");
      expect(PLAN).toContain("survivors are never cherry-picked from a larger\npool");
    });

    it("still keeps ordinary vocabulary overlap diagnostic rather than a gate", () => {
      expect(PLAN).toContain(
        '**"no bare adjective ever" and "no cross-corpus word overlap ever" are\nnot acceptance criteria**',
      );
    });

    it("still says a required case change invalidates rather than repairs", () => {
      expect(PLAN).toContain("**Any required case change invalidates the assembled corpus**");
      expect(PLAN).toContain("**No result directory joins `PROTECTED_RESULT_DIRS`**");
    });

    it("still says planner ownership does not excuse a constraint violation", () => {
      expect(PLAN).toContain("**Planner ownership never excuses correctness**");
    });

    it("still carries the corrected reading of the freeze commit's own claim", () => {
      // `9da8010` said the tree held "no `DIC3-` id anywhere", which the preregistered namespace
      // makes false on its face. The narrower claim underneath it is the one that matters, and it
      // is the one canon now states.
      expect(PLAN).toContain("**A wording correction to that freeze commit, recorded rather than");
      expect(PLAN).toContain("**namespace reservation only**");
    });

    it("still says no paid run is authorised", () => {
      expect(PLAN).toContain("**No paid run is authorised by any of this.**");
    });
  });
});
