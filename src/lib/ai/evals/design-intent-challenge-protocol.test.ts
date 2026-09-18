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
import { createHash } from "node:crypto";
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

  /**
   * **Retired: the canonical slot is v4's, and a v3 corpus never occupied it.**
   *
   * This block used to read the slot an eval set points at and require v3 composition of whatever
   * it found — written while v3 might still land there, and tolerant of absence so that adding the
   * corpus would not mean editing a test. v3 then closed and was invalidated as an authoring
   * programme without ever being assembled into that slot
   * (`provenance/design-intent-sealed-challenge-v3/CLOSURE.md`), and v4 occupies it now. A check
   * demanding `DIC3-G*`/`DIC3-M*` ids from a corpus that is legitimately `DIC4-*` cannot pass, and
   * the v4 protocol test asserts the opposite of it against the same file, so the two could never
   * both be satisfied once any corpus existed. It was dormant only while the slot was empty.
   *
   * **No coverage is lost, which is why this is a retirement rather than a deletion under
   * pressure.** Both halves of what it was for are asserted elsewhere, and more tightly:
   *
   * - `checkAssembledSealedChallengeV3` is still exercised against synthetic corpora in "the
   *   assembled-corpus check" above, and against the **real** preserved v3 assembly in "never lets
   *   the gate-failing assembly become the corpus" below — a fixed artifact, which is stronger
   *   evidence than a conditional read of whatever happens to be on disk;
   * - the canonical slot is still guarded there too, by the assertion that its digest is not the
   *   digest of the assembly that failed semantic review. That guard is the one that was always
   *   load-bearing, and it works correctly with v4 in the slot.
   *
   * v4's own conformance is asserted by `design-intent-challenge-v4-protocol.test.ts`, and its
   * bytes by `design-intent-challenge-v4-freeze.test.ts`. Every v3 provenance pin below is
   * untouched.
   */

  /**
   * The raw external halves, pinned so "preserved byte-for-byte" is checkable rather than claimed.
   *
   * Each entry is an artifact the record already quotes a digest for, so a file edited after it
   * was received fails here instead of silently becoming a different half. Entries are added as
   * halves arrive; an artifact that has not arrived is simply absent from this list, which is why
   * the list is data rather than a required set — the ChatGPT half's row is added by the commit
   * that receives it, not by an edit under pressure afterwards.
   */
  describe("the raw external halves, as supplied", () => {
    const PROVENANCE = "docs/model-evals/provenance/design-intent-sealed-challenge-v3/";
    const SUPPLIED = [
      {
        path: `${PROVENANCE}gemini/01-original.json`,
        sha256: "7d7587069a20fc333bb813328a39acdf5ec02dd72dd639490c8c167f6ec3ead7",
        bytes: 15842,
      },
      {
        path: `${PROVENANCE}gemini/02-contract-correction.json`,
        sha256: "c3e400ac31f7e9786e5091ddde3b9de62f686ecbaaed46670cebf86c5923d8ba",
        bytes: 15926,
      },
      {
        path: `${PROVENANCE}gemini/03-final-candidate.json`,
        sha256: "56ad64b072900428603b0b4f545db8118549e3c4d81705573c86c630ed5373d2",
        bytes: 15739,
      },
      {
        path: `${PROVENANCE}chatgpt/01-original-raw.txt`,
        sha256: "e49d340ba0f67bcb86f2ac5a913140405996c027ff75bd1315132c1ae4e6c554",
        bytes: 16705,
      },
      {
        path: `${PROVENANCE}chatgpt/02-normalized-candidate.json`,
        sha256: "38963c46189013e8e969ef5d706a9a5ea67089bfefb904e166d948d452f05fd5",
        bytes: 15353,
      },
      {
        path: `${PROVENANCE}gemini/04-leakage-correction.json`,
        sha256: "89fc79fba1afe4471f977d750eead96fcc57961c0e3d807766d63211be2b88c2",
        bytes: 15743,
      },
      {
        path: `${PROVENANCE}chatgpt/03-leakage-correction-raw.txt`,
        sha256: "9547fc272debb426e87a79912dec46a5979136894b6b0be3d7655195498dbcad",
        bytes: 16703,
      },
      {
        path: `${PROVENANCE}chatgpt/04-leakage-correction-normalized.json`,
        sha256: "74f31e7d5f6001dc3851f5a8114c9d4b565da5d2d0bbefef91c229e543047ada",
        bytes: 15351,
      },
      {
        path: `${PROVENANCE}assembly/01-assembled-pre-semantic-review.json`,
        sha256: "1419a89093d95c50a49c4e8d413a97d9ca42e66c6dfd678cbab3c4c77ac869a3",
        bytes: 37871,
      },
      {
        path: `${PROVENANCE}review/01-semantic-premise-overlap-review.md`,
        sha256: "650713803d9d12edc5544fabf1e4d07caa41a9e0ba3592670652b05119abca9a",
        bytes: 14846,
      },
      {
        path: `${PROVENANCE}review/02-semantic-premise-overlap-review-replacement.md`,
        sha256: "6ed793ee9e5ab6f21f2a5e28f2e7cf388670efd27860f8a8dbdc62dfbfa52250",
        bytes: 14084,
      },
      {
        path: `${PROVENANCE}gemini-replacement/01-original.json`,
        sha256: "d20654358767c8b87295f2b391eced9c861293b50d657572b75cdc39256ee718",
        bytes: 13213,
      },
      {
        path: `${PROVENANCE}gemini-replacement/02-contract-corrected-candidate.json`,
        sha256: "68158c50f7538902e774429c01f8f7bc0ca72fe5195ba17f2073d49eec5cfd3b",
        bytes: 12945,
      },
      {
        path: `${PROVENANCE}gemini-replacement/03-final-leakage-corrected-candidate.json`,
        sha256: "381c9b8ac0d7ffc2cdfae7825a752c9a56a0127e5f29512b88da6caafcebc112",
        bytes: 12366,
      },
      {
        path: `${PROVENANCE}gemini/INVALIDATION.md`,
        sha256: "5eff8fe456e2668fe034ce736f0a9d7e425487c9dd5626df2325a255b6113331",
        bytes: 5124,
      },
    ] as const;

    it.each(SUPPLIED)("$path is byte-identical to what was received", ({ path, sha256, bytes }) => {
      const file = readFileSync(`${ROOT}${path}`);
      expect({
        sha256: createHash("sha256").update(file).digest("hex"),
        bytes: file.byteLength,
      }).toEqual({ sha256, bytes });
    });

    /**
     * The corrections were meant to be narrow, so narrowness is checked rather than taken on
     * trust: same key set, nothing added or removed, and only leaves the leakage scan had flagged
     * allowed to differ. This is the check that would catch a "correction" that quietly re-premised
     * a case, which is the repair the policy forbids.
     */
    it.each([
      {
        before: "gemini/03-final-candidate.json",
        after: "gemini/04-leakage-correction.json",
        changed: [
          ".cases[0].identity.creativeGuidance[0]",
          ".cases[0].identity.hostConstraints[1]",
        ],
      },
      {
        before: "gemini-replacement/02-contract-corrected-candidate.json",
        after: "gemini-replacement/03-final-leakage-corrected-candidate.json",
        changed: [".cases[0].identity.toneKeywords[3]"],
      },
      {
        before: "chatgpt/02-normalized-candidate.json",
        after: "chatgpt/04-leakage-correction-normalized.json",
        changed: [
          ".cases[2].identity.toneKeywords[2]",
          ".cases[3].identity.inspirationSummary",
          ".cases[4].identity.inspirationSummary",
          ".cases[5].identity.toneKeywords[1]",
        ],
      },
    ])("$after changed only the flagged spans", ({ before, after, changed }) => {
      const flatten = (value: unknown, path = ""): Record<string, unknown> => {
        if (Array.isArray(value)) {
          return Object.assign({}, ...value.map((entry, i) => flatten(entry, `${path}[${i}]`)));
        }
        if (value !== null && typeof value === "object") {
          return Object.assign(
            {},
            ...Object.entries(value).map(([key, entry]) => flatten(entry, `${path}.${key}`)),
          );
        }
        return { [path]: value };
      };
      const load = (rel: string) =>
        flatten(JSON.parse(readFileSync(`${ROOT}${PROVENANCE}${rel}`, "utf8")));
      const a = load(before);
      const b = load(after);
      expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
      expect(
        Object.keys(a)
          .filter((key) => a[key] !== b[key])
          .sort(),
      ).toEqual([...changed].sort());
    });

    /**
     * The replacement's correction round touched palette and tone contract mechanics, so the check
     * that matters is the inverse one: that nothing an *author* owns moved with them. A correction
     * allowed to carry a premise, a name or a motif alongside it would be a re-authoring wearing a
     * contract fix's clothes, and no leaf-count assertion would notice.
     */
    it("moved no authored field in the replacement's contract correction", () => {
      const cases = (rel: string) =>
        (
          JSON.parse(readFileSync(`${ROOT}${PROVENANCE}${rel}`, "utf8")) as {
            cases: Record<string, never>[];
          }
        ).cases;
      const before = cases("gemini-replacement/01-original.json");
      const after = cases("gemini-replacement/02-contract-corrected-candidate.json");
      expect(after).toHaveLength(before.length);

      const AUTHORED = [
        "creativeDirection",
        "toneKeywords",
        "visualMotifs",
        "inspirationSummary",
        "textureDirection",
        "typographyDirection",
        "copyTone",
        "hostConstraints",
        "creativeGuidance",
        "tonalIntent",
        "compatibleTonalDirections",
        "compatibleFamilies",
        "compatibleTypographyCategories",
      ] as const;
      const moved: string[] = [];
      before.forEach((original, index) => {
        const corrected = after[index] as Record<string, unknown>;
        const from = original as Record<string, unknown>;
        if (from.id !== corrected.id) moved.push(`${String(from.id)}.id`);
        if (from.eventType !== corrected.eventType) moved.push(`${String(from.id)}.eventType`);
        for (const field of AUTHORED) {
          const a = (from.identity as Record<string, unknown>)[field];
          const b = (corrected.identity as Record<string, unknown>)[field];
          if (JSON.stringify(a) !== JSON.stringify(b)) moved.push(`${String(from.id)}.${field}`);
        }
      });
      expect(moved).toEqual([]);
    });

    // Paired explicitly rather than by alternating index: the list is not alternating any more
    // (the replacement half contributes two entries), and an index trick that silently pairs a
    // candidate with the wrong half would report a namespace violation that does not exist.
    it.each([
      { half: 0 as const, rel: "chatgpt/02-normalized-candidate.json" },
      { half: 0 as const, rel: "chatgpt/04-leakage-correction-normalized.json" },
      { half: 1 as const, rel: "gemini/04-leakage-correction.json" },
      { half: 1 as const, rel: "gemini-replacement/02-contract-corrected-candidate.json" },
      { half: 1 as const, rel: "gemini-replacement/03-final-leakage-corrected-candidate.json" },
    ])("$rel conforms to its precommitted namespace", ({ half: index, rel }) => {
      const cases = (
        JSON.parse(readFileSync(`${ROOT}${PROVENANCE}${rel}`, "utf8")) as { cases: unknown[] }
      ).cases;
      expect(checkHalfComposition(SEALED_CHALLENGE_V3_HALVES[index], cases)).toEqual([]);
    });

    /**
     * The ChatGPT raw response is not JSON — its structural quotes are `U+201C`/`U+201D` — so a
     * normalization stands between it and the candidate. That is a permitted syntax correction and
     * this proves it changed nothing else: swapping only those two characters reproduces the
     * committed candidate exactly. In-prose apostrophes are deliberately left alone, which is why
     * the swap is two characters rather than four.
     */
    it("proves the ChatGPT normalization was quote-only", () => {
      const raw = readFileSync(`${ROOT}${PROVENANCE}chatgpt/01-original-raw.txt`, "utf8");
      const committed = readFileSync(
        `${ROOT}${PROVENANCE}chatgpt/02-normalized-candidate.json`,
        "utf8",
      );
      const swapped = raw.replaceAll("\u201c", '"').replaceAll("\u201d", '"');
      expect(JSON.parse(swapped)).toEqual(JSON.parse(committed));
      expect(raw).toContain("\u2019");
      expect(committed).toContain("\u2019");
    });

    /**
     * The assembly failed the semantic premise-overlap review, so it lives here rather than in the
     * slot an eval set points at — the refusal-without-a-file guard is what stops a corpus being
     * run, and a gate-failing corpus must not disarm it. Preserved rather than deleted, because
     * deleting it would discard what the review actually read.
     */
    it("never lets the gate-failing assembly become the corpus", () => {
      const assembled = readFileSync(
        `${ROOT}${PROVENANCE}assembly/01-assembled-pre-semantic-review.json`,
      );
      // It was a correctly assembled corpus; what it failed was a judgement, not a mechanic.
      expect(checkAssembledSealedChallengeV3(JSON.parse(assembled.toString("utf8")))).toEqual([]);

      // Absence is deliberately not asserted — that is the shape T19B had to undo, because it
      // makes adding the corpus require editing a test. What is asserted is the thing that must
      // never be true: this exact content sitting in the slot an eval set runs.
      const slot = `${ROOT}${corpusPath("designIntentChallenge")}`;
      if (!existsSync(slot)) return;
      expect(
        createHash("sha256").update(readFileSync(slot)).digest("hex"),
        "the assembly that failed semantic premise-overlap review is in the canonical slot",
      ).not.toBe(createHash("sha256").update(assembled).digest("hex"));
    });

    /**
     * The first Gemini half is invalidated **whole**, so no part of it may reappear as a case.
     *
     * The check is by content rather than by filename: a survivor cherry-picked out of the
     * invalidated half and pasted into a replacement would keep none of its provenance path, and
     * the rule it would break — "accepted whole or rejected whole, never mixed" — is the one the
     * §G invalidation exists to enforce. Identity prose is the fingerprint because it is what an
     * author writes; ids are not, since the six `DIC3-M` ids are reserved slots that the
     * replacement is *supposed* to reuse.
     */
    it("lets no case from the invalidated Gemini half return", () => {
      const creativeDirections = (rel: string) =>
        (
          JSON.parse(readFileSync(`${ROOT}${PROVENANCE}${rel}`, "utf8")) as {
            cases: { identity: { creativeDirection: string } }[];
          }
        ).cases.map((testCase) => testCase.identity.creativeDirection);
      const invalidated = new Set(creativeDirections("gemini/04-leakage-correction.json"));
      expect(invalidated.size).toBe(6);

      const slot = `${ROOT}${corpusPath("designIntentChallenge")}`;
      if (!existsSync(slot)) return;
      const live = (
        JSON.parse(readFileSync(slot, "utf8")) as {
          cases: { id: string; identity: { creativeDirection: string } }[];
        }
      ).cases;
      expect(
        live.filter((testCase) => invalidated.has(testCase.identity.creativeDirection)),
        "a case from the invalidated Gemini half is back in the corpus",
      ).toEqual([]);
    });

    it("has not turned a provenance artifact into a corpus", () => {
      // Nothing under `provenance/` is ever run. The canonical slot stays absent until assembly,
      // and assembly waits for both halves.
      expect(Object.values(CORPUS_FILES).some((name) => name.includes("provenance"))).toBe(false);
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
