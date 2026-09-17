/**
 * No evaluation case may appear in the production prompt.
 *
 * This exists because leakage has now been introduced **four separate times**, twice while
 * actively removing a previous leak, and three of the four were caught by an independent
 * reviewer rather than by the author. The fourth — HO-11's prompt *and* its gating answer,
 * written into the worked example for the honoree rule — reached the wire schema, so the model
 * would have been shown the answer twice to the only mechanical assertion of that field's
 * central behaviour.
 *
 * It also exists because `process-notes.md` claimed a scan like this was already running when
 * no such file was in the tree. A control asserted in immutable evidence and absent from the
 * repository is worse than no control, because it stops anyone looking.
 *
 * **Necessary and not sufficient.** This catches literal reuse. It cannot catch a
 * near-paraphrase, and it cannot catch a case-specific instruction dressed as a general
 * principle — both of which have also occurred. The independent engineering review reads the
 * prompt for those, and that requirement is recorded in `docs/model-contracts.md §4.5`.
 *
 * Acceptance criteria: N/A — benchmark integrity. `docs/model-contracts.md §4.5`.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ASSEMBLY_VERSION_BEFORE_ANSWERS,
  CORPUS_FILES,
  corpusPath,
  leakageProbes,
  MODEL_VISIBLE_SURFACES,
  type CorpusSet,
} from "./corpus";
import { EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION } from "@/lib/ai/versions";

const ROOT = new URL("../../../../", import.meta.url).pathname;

/**
 * Every model-visible surface that exists, read from the shared declaration rather than listed
 * here — so a surface added there is scanned without editing this file, which matters because
 * this file is frozen before the Phase 4B corpus is authored.
 */
const SURFACES = Object.fromEntries(
  Object.entries(MODEL_VISIBLE_SURFACES)
    .filter(([, rel]) => existsSync(`${ROOT}${rel}`))
    .map(([name, rel]) => [name, readFileSync(`${ROOT}${rel}`, "utf8")]),
);
const ABSENT_SURFACES = Object.entries(MODEL_VISIBLE_SURFACES)
  .filter(([, rel]) => !existsSync(`${ROOT}${rel}`))
  .map(([name]) => name);

describe("which model-visible surfaces this scan covers", () => {
  it("scans the prompt and the wire schema, always", () => {
    expect(Object.keys(SURFACES)).toEqual(expect.arrayContaining(["prompt", "wire schema"]));
  });

  /**
   * The fail-closed half, and the reason the surface is declared before it exists.
   *
   * Phase 4B T9 introduces static model-visible strings in the input assembly. By then the
   * rerun-behaviour corpus is frozen and this scanner cannot change, so a collision introduced
   * then could be fixed neither at the corpus nor at the scanner. This test makes the version
   * bump and the scannable file inseparable: move off `event_identity_input_v1` without creating
   * the file the declaration names, and the suite fails.
   */
  it("requires the input-assembly surface to exist once the assembly carries answers", () => {
    // Compared as `string`: the constants are literal types, so after a bump TypeScript would
    // call this branch unreachable and refuse to compile the guard that has to survive the bump.
    if ((EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION as string) === ASSEMBLY_VERSION_BEFORE_ANSWERS) {
      expect(ABSENT_SURFACES).toEqual(["input assembly"]);
      return;
    }
    expect(ABSENT_SURFACES).toEqual([]);
  });
});

/**
 * Only an `id`, because the strings this scan compares are extracted by `leakageProbes`.
 *
 * The scan reads corpora of two shapes now: a Phase 4A/4B case is a host `prompt` plus assertions
 * about it, and a Phase 4C DesignIntent case is a frozen authoritative identity brief with no host
 * prompt at all. Reaching for `.prompt` here would have thrown on the first 4C case, or — the
 * quieter and worse outcome — scanned nothing. The extraction lives in `corpus.ts`, beside the
 * filenames, so it is pure, unit-tested, and cannot be unhooked from one side.
 */
interface EvalCase {
  id: string;
}

/**
 * Every corpus the frozen prompt must not have seen.
 *
 * The filenames come from `corpus.ts`, shared with the eval runner, so a path change cannot
 * silently unhook this scan — which matters because the sealed challenge is named here **before
 * its cases exist** and is skipped until the file lands. Given that four leaks reached the
 * production prompt during Phase 4A, the independently authored corpus is the last one that
 * should go unscanned, and wiring it now is what keeps its arrival from requiring an edit to
 * benchmark-integrity tooling after the cases are known.
 *
 * A skip is reported as its own test below rather than inferred from a missing one: a control
 * that quietly covers nothing is the defect `process-notes.md` already records.
 */
const CANDIDATES = (Object.keys(CORPUS_FILES) as CorpusSet[]).map((set) => ({
  file: CORPUS_FILES[set],
  path: `${ROOT}${corpusPath(set)}`,
}));
const CORPORA = CANDIDATES.filter(({ path }) => existsSync(path)).map(({ file, path }) => ({
  file,
  cases: (JSON.parse(readFileSync(path, "utf8")) as { cases: EvalCase[] }).cases,
}));
const ABSENT = CANDIDATES.filter(({ path }) => !existsSync(path)).map(({ file }) => file);

describe("which corpora this scan covers", () => {
  it("scans every corpus that exists", () => {
    expect(CORPORA.map((c) => c.file)).toEqual(
      CANDIDATES.filter(({ path }) => existsSync(path)).map((c) => c.file),
    );
  });

  // Prints the unscanned corpus by name. When the sealed challenge lands this test reports an
  // empty list, and the three `describe`s below start covering it with no edit here.
  it.runIf(ABSENT.length > 0)("names any corpus that does not exist yet, as unscanned", () => {
    // Read from the shared map rather than written out. `challenge2` landed and this test
    // retired; Phase 4B's rerun-behaviour corpus re-armed it, and Phase 4C's three re-armed it
    // again — the mechanism working in both directions.
    //
    // A **subset** assertion rather than an exact list, which is the shape that lets T20 land two
    // corpus files and T22 the third without anyone editing benchmark-integrity tooling after
    // seeing the cases. It still fails on the case that matters: a corpus that is absent and was
    // never declared as authored-after-this-scan, which is a corpus that has gone missing.
    const declaredAbsentAtSomePoint: string[] = [
      CORPUS_FILES.rerunBehaviour,
      CORPUS_FILES.designIntentRegression,
      CORPUS_FILES.designIntentValidation,
      CORPUS_FILES.designIntentChallenge,
    ];
    expect(ABSENT.filter((file) => !declaredAbsentAtSomePoint.includes(file))).toEqual([]);
  });
});

const fold = (v: string) => v.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/** Content spans of a case prompt, long enough that a shared span is reuse rather than English. */
function spans(prompt: string, size = 3): string[] {
  const words = fold(prompt)
    .replace(/[.,—–;:!?]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i + size <= words.length; i += 1) {
    const span = words.slice(i, i + size).join(" ");
    if (span.length >= 14) out.push(span);
  }
  return out;
}

describe.each(Object.entries(SURFACES))("%s is clean of every corpus", (_name, surfaceRaw) => {
  const surface = fold(surfaceRaw);

  for (const { file, cases } of CORPORA) {
    describe(file, () => {
      it("contains no case input verbatim", () => {
        const leaked = cases.flatMap((c) =>
          leakageProbes(c)
            .verbatim.filter((v) => surface.includes(fold(v)))
            .map((v) => `${c.id}: "${v}"`),
        );
        expect(leaked).toEqual([]);
      });

      it("contains no distinctive span of a case input", () => {
        const leaked = cases.flatMap((c) =>
          leakageProbes(c)
            .verbatim.flatMap(spans)
            .filter((s) => surface.includes(s))
            .map((s) => `${c.id}: "${s}"`),
        );
        expect(leaked).toEqual([]);
      });

      it("contains no expected answer, probe, host phrase or case note", () => {
        const leaked = cases.flatMap((c) =>
          leakageProbes(c)
            .claims.filter((v) => surface.includes(fold(v)))
            .map((v) => `${c.id}: "${v}"`),
        );
        expect(leaked).toEqual([]);
      });
    });
  }
});
