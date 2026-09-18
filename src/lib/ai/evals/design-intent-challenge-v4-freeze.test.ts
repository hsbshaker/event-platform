/**
 * The v4 sealed-challenge input freeze, as an offline guard rather than only a commit SHA.
 *
 * The corpus is assembled from two Stage-2 artifacts and then never edited again. A commit SHA
 * freezes the bytes for anyone who goes looking; it does not fail a build. Without this file a
 * later commit could edit a case, reorder the halves, or repoint `EVAL_SETS.designIntentChallenge`
 * at a different corpus or output directory, and every existing test would still pass — the run's
 * evidence would then be attributable to whatever was on disk at run time rather than to what was
 * reviewed and frozen.
 *
 * `corpus.ts` is not frozen, which is exactly why its two path constants are pinned here. The same
 * arrangement, and the same reasoning, as `corpus-provenance.test.ts` pins for the Phase 4B
 * clarification-rerun corpus.
 *
 * **Integrity only.** Nothing here reads a case's content, grades anything, or has an opinion about
 * whether the corpus is any good — and in particular it takes no view on the four semantic-overlap
 * findings carried forward under
 * `docs/model-evals/provenance/design-intent-sealed-challenge-v4/OPERATOR-WAIVER.md`. It answers
 * one question: is this the same corpus, in the same place, writing to the same place, as the one
 * that was assembled and frozen. The structural contract is asserted in `design-intent.test.ts`
 * and the authoring protocol in `design-intent-challenge-v4-protocol.test.ts`; this file duplicates
 * neither.
 *
 * If this fails: do not update the constants. Find out what changed the corpus or its wiring.
 *
 * Acceptance criteria: N/A — benchmark integrity. `docs/model-contracts.md §4.7`;
 * `docs/model-evals/provenance/design-intent-sealed-challenge-v4/OPERATOR-WAIVER.md`.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { corpusPath, EVAL_SETS, isProtectedOutput, PROTECTED_RESULT_DIRS } from "./corpus";
import {
  SEALED_CHALLENGE_V4_CASE_IDS,
  SEALED_CHALLENGE_V4_VERSION,
} from "./design-intent-challenge-v4-protocol";

const ROOT = new URL("../../../../", import.meta.url).pathname;

/** The v4 input freeze. These are the bytes assembled from the two final Stage-2 artifacts. */
const FREEZE = {
  corpus: "docs/model-evals/design-intent-sealed-challenge-v4.json",
  out: "docs/model-evals/results/design-intent-sealed-challenge-v4",
  waiver: "docs/model-evals/provenance/design-intent-sealed-challenge-v4/OPERATOR-WAIVER.md",
  review:
    "docs/model-evals/provenance/design-intent-sealed-challenge-v4/review/" +
    "07-semantic-premise-device-overlap-review.md",
  sha256: "7f0e90b6b4d8e4b6e1fb8e0771c85543648c6dec7cce27cb095a66d6e3cd7cd5",
  bytes: 29526,
} as const;

describe("the v4 sealed challenge is the corpus that was assembled and frozen", () => {
  it("has the pinned bytes", () => {
    const file = `${ROOT}${FREEZE.corpus}`;
    const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
    expect(
      { sha256: digest, bytes: statSync(file).size },
      `${FREEZE.corpus} is not the corpus that was frozen. It was assembled from the two final ` +
        "Stage-2 artifacts, each case byte-identical to its source, and carried forward under an " +
        "explicit operator waiver recorded in OPERATOR-WAIVER.md. Do not update these constants " +
        "to make this pass.",
    ).toEqual({ sha256: FREEZE.sha256, bytes: FREEZE.bytes });
  });

  it("carries the precommitted version and the twelve ids in the one legal order", () => {
    const corpus = JSON.parse(readFileSync(`${ROOT}${FREEZE.corpus}`, "utf8"));
    expect({
      version: corpus.version,
      ids: corpus.cases.map((testCase: { id: string }) => testCase.id),
    }).toEqual({
      version: SEALED_CHALLENGE_V4_VERSION,
      ids: [...SEALED_CHALLENGE_V4_CASE_IDS],
    });
  });

  it("is read from, and written to, the pinned paths", () => {
    // Read the same way the runner reads them, so a redirect anywhere in that chain is caught:
    // the filename map, the set's corpus entry, and the set's output directory.
    expect(
      {
        corpus: corpusPath("designIntentChallenge"),
        setCorpus: EVAL_SETS.designIntentChallenge.corpus,
        setOut: EVAL_SETS.designIntentChallenge.out,
      },
      "the v4 sealed-challenge set no longer resolves to the corpus or output directory it was " +
        "frozen against. Evidence is only as attributable as the paths that produced it.",
    ).toEqual({
      corpus: FREEZE.corpus,
      setCorpus: FREEZE.corpus,
      setOut: FREEZE.out,
    });
  });

  /**
   * The waiver and the review it waives are both part of the freeze.
   *
   * A corpus carried forward with known findings is only honestly readable alongside the document
   * that says so and the review that found them. Deleting either would leave the corpus looking
   * like ordinary sealed evidence, which is the one reading the waiver exists to prevent — so
   * their presence is asserted here rather than left to a reader noticing their absence.
   */
  it("keeps the waiver and the semantic-overlap review it depends on", () => {
    expect({
      waiver: existsSync(`${ROOT}${FREEZE.waiver}`),
      review: existsSync(`${ROOT}${FREEZE.review}`),
    }).toEqual({ waiver: true, review: true });
  });

  /**
   * The completed run's evidence is refused in all three directions, not just by name.
   *
   * `isProtectedOutput` is containment in both directions on purpose, and each direction is a real
   * way to lose this evidence: writing *to* the directory overwrites the journal of paid provider
   * responses; writing to a path *inside* it overwrites one artifact and leaves the rest looking
   * intact, which is worse than losing all four; and writing to an *ancestor* drops a different
   * run's reports beside it where a reader takes them for the same run. A test that only checked
   * the exact string would pass while two of those three stayed open.
   *
   * `EVAL_OVERWRITE=1` does not reach this refusal — it overrides the write-once check, which is a
   * different guard. That separation is why the directory had to join the list at all.
   */
  it("refuses the completed evidence directory, its descendants and its ancestors", () => {
    const dir = FREEZE.out;
    expect({
      exact: isProtectedOutput(dir),
      trailingSlash: isProtectedOutput(`${dir}/`),
      doubledSlash: isProtectedOutput(dir.replace("results/", "results//")),
      journal: isProtectedOutput(`${dir}/raw-responses.jsonl`),
      report: isProtectedOutput(`${dir}/mechanical-report.md`),
      reviewSubdir: isProtectedOutput(`${dir}/review`),
      blindReview: isProtectedOutput(`${dir}/review/blind-review.md`),
      reviewerPacket: isProtectedOutput(`${dir}/review/reviewer-packet.md`),
      ancestorResults: isProtectedOutput("docs/model-evals/results"),
      ancestorEvals: isProtectedOutput("docs/model-evals"),
    }).toEqual({
      exact: true,
      trailingSlash: true,
      doubledSlash: true,
      journal: true,
      report: true,
      reviewSubdir: true,
      blindReview: true,
      reviewerPacket: true,
      ancestorResults: true,
      ancestorEvals: true,
    });

    // The set that wrote it can no longer write there, which is what protection costs and means.
    expect(isProtectedOutput(EVAL_SETS.designIntentChallenge.out)).toBe(true);
    expect([...PROTECTED_RESULT_DIRS]).toContain(dir);

    // A sibling directory is not swept up: containment must not degrade into prefix matching.
    expect(isProtectedOutput(`${dir}-v2`)).toBe(false);
    expect(isProtectedOutput("docs/model-evals/results/design-intent-regression-v1")).toBe(false);
  });

  it("states the waived evidence class, and names every carried finding", () => {
    const waiver = readFileSync(`${ROOT}${FREEZE.waiver}`, "utf8");
    expect(waiver).toContain("DIAGNOSTIC / STRESS-TEST CHALLENGE");
    // The four ACTION REQUIRED ids, so a later edit cannot quietly drop one from the record.
    for (const id of ["DIC4-P01", "DIC4-P03", "DIC4-Q02", "DIC4-Q05"]) {
      expect(waiver, `${id} is a carried finding and must stay named in the waiver`).toContain(id);
    }
  });
});
