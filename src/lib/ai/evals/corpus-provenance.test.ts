/**
 * The T8 input freeze, as an ordinary offline guard rather than only a commit SHA.
 *
 * `docs/phase-4b-plan.md` requires the T8 freeze to pin the corpus **together with** the paths it
 * is read from and written to. The commit SHA freezes the bytes for anyone who goes looking; it
 * does not fail a build. Without this file a later implementation commit could edit a case, or
 * quietly point `EVAL_SETS.rerunBehaviour` at a different corpus or a different output directory,
 * and every existing test would still pass — the T13 evidence would then be attributable to
 * whatever was there at run time rather than to what was reviewed at T7.
 *
 * `corpus.ts` is not frozen, which is exactly why its two path constants are pinned here.
 *
 * **Integrity only.** Nothing here reads a case's content, grades anything, or has an opinion
 * about whether the corpus is any good. It answers one question: is this the same corpus, in the
 * same place, writing to the same place, as the one T7 reviewed and T8 froze. The structural
 * contract is asserted elsewhere (`rerun-behaviour.test.ts`), and the acceptance criteria and
 * mechanical checks are frozen in files this one does not touch.
 *
 * If this fails: do not update the constants. Find out what changed the corpus or its wiring.
 *
 * Acceptance criteria: N/A — benchmark integrity. `docs/model-contracts.md §4.5`;
 * `docs/phase-4b-plan.md` Part IV T8.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { corpusPath, EVAL_SETS, RERUN_BEHAVIOUR_OUT } from "./corpus";

const ROOT = new URL("../../../../", import.meta.url).pathname;

/** The T8 input freeze. Its SHA is the provenance record; these are the bytes it froze. */
const T8 = {
  commit: "943699547454f147b9beb2608622eece00765f3e",
  corpus: "docs/model-evals/clarification-rerun-behaviour.json",
  out: "docs/model-evals/results/clarification-rerun-behaviour-v1",
  sha256: "f637494fee567487e8b09d0fa405e3a014e5fc3565f8b464c53fdf85bc019394",
  bytes: 15677,
} as const;

describe("the clarification-rerun corpus is the one T8 froze", () => {
  it("has the pinned bytes", () => {
    const file = `${ROOT}${T8.corpus}`;
    const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
    expect(
      { sha256: digest, bytes: statSync(file).size },
      `${T8.corpus} is not the file frozen at T8 (${T8.commit}). It was authored independently, ` +
        "reviewed for fairness and leakage at T7, and frozen at T8 before the implementation it " +
        "grades existed. Do not update these constants to make this pass.",
    ).toEqual({ sha256: T8.sha256, bytes: T8.bytes });
  });

  it("is read from, and written to, the pinned paths", () => {
    // Read the same way the runner reads them, so a redirect anywhere in that chain is caught:
    // the filename map, the set's corpus entry, and the set's output directory.
    expect(
      {
        corpus: corpusPath("rerunBehaviour"),
        setCorpus: EVAL_SETS.rerunBehaviour.corpus,
        out: RERUN_BEHAVIOUR_OUT,
        setOut: EVAL_SETS.rerunBehaviour.out,
      },
      "the clarification-rerun set no longer resolves to the corpus or output directory pinned " +
        `at T8 (${T8.commit}). Evidence is only as attributable as the paths that produced it.`,
    ).toEqual({
      corpus: T8.corpus,
      setCorpus: T8.corpus,
      out: T8.out,
      setOut: T8.out,
    });
  });
});
