/**
 * Is this file a usable corpus? Answered without spending anything.
 *
 * The shape check began life inside the eval runner, which is the one module in the repository
 * that cannot be executed to check anything: importing it with an API key present starts paying
 * a provider. Proving the check worked therefore meant running the very thing it guards — and
 * doing exactly that spent real model calls against the regression suite during this pass.
 *
 * So the rule the rotation taught applies here too, harder: a guard that can only be verified by
 * triggering the hazard is not a guard. This function is pure, the runner calls it, and the unit
 * tests run it against both real corpora.
 *
 * What it checks is deliberately narrow — the fields whose absence would either burn a paid case
 * or silently corrupt the evidence:
 *
 * - **`prompt`**, because a missing one sends the literal string `undefined` to the model and
 *   spends a case of a one-shot corpus on nothing;
 * - **`id`**, unique, because it is the key a journal entry is joined back to its case by;
 * - **`version`**, because it is written into every journal entry as `corpusVersion`, and
 *   `undefined` there breaks the identity half of the recovery invariant;
 * - **`expectClarification`**, because a missing or misspelled label silently downgrades the one
 *   gating clarification check to advisory — a benchmark that quietly stops testing something.
 *
 * Everything else is optional by design: each deterministic check reports `n/a` when its input is
 * absent, which is what lets an independently authored sealed challenge run on frozen code. The
 * contract is published in `docs/model-contracts.md §4.5` so an author can satisfy it without
 * reading any of this.
 */
export const CLARIFICATION_LABELS = ["no", "likely", "acceptable", "expected"] as const;

/** Only the fields this validation reads. A corpus carries far more, all of it optional. */
interface UncheckedCorpus {
  version?: unknown;
  cases?: unknown;
}

interface UncheckedCase {
  id?: unknown;
  prompt?: unknown;
  expectClarification?: unknown;
}

const nonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/**
 * Every problem with the corpus, or an empty array. All of them at once, not the first: an
 * author fixing a file they cannot test against our checker should see the whole list.
 */
export function validateCorpusShape(parsed: unknown): string[] {
  const corpus = (parsed ?? {}) as UncheckedCorpus;
  const problems: string[] = [];

  if (!nonEmptyString(corpus.version)) {
    problems.push("top-level `version` must be a non-empty string");
  }

  if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) {
    problems.push("`cases` must be a non-empty array");
    return problems;
  }

  const seen = new Set<string>();
  (corpus.cases as UncheckedCase[]).forEach((testCase, index) => {
    const where = nonEmptyString(testCase?.id) ? testCase.id : `cases[${index}]`;

    if (!nonEmptyString(testCase?.id)) {
      problems.push(`${where}: \`id\` must be a non-empty string`);
    } else if (seen.has(testCase.id)) {
      // Ids are how a journal entry finds its case again, so a duplicate makes one of the two
      // unrecoverable rather than merely confusing.
      problems.push(`${where}: duplicate \`id\``);
    } else {
      seen.add(testCase.id);
    }

    if (!nonEmptyString(testCase?.prompt)) {
      problems.push(`${where}: \`prompt\` must be a non-empty string`);
    }

    if (!CLARIFICATION_LABELS.includes(testCase?.expectClarification as never)) {
      problems.push(
        `${where}: \`expectClarification\` must be one of ${CLARIFICATION_LABELS.join(", ")}`,
      );
    }
  });

  return problems;
}
