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
import type { CorpusCase } from "./creative-understanding";

/**
 * `satisfies` ties these to the checker's own union, so the two declarations of the same four
 * literals cannot drift apart silently. The import is type-only and fully erased.
 */
export const CLARIFICATION_LABELS = [
  "no",
  "likely",
  "acceptable",
  "expected",
] as const satisfies readonly CorpusCase["expectClarification"][];

/**
 * Every corpus, named once.
 *
 * The runner and the leakage scan both need these paths, and they were separate string literals
 * in two files. The scan skips a corpus it cannot find, so a path edited on the runner side would
 * have silently unhooked the scan while `docs/model-contracts.md §4.5` went on asserting the
 * sealed challenge is scanned the moment it lands — a control that stops anyone looking, which is
 * the exact defect this project's leakage-scan claim already turned out to be once.
 *
 * `challenge2` deliberately names a file that does not exist yet: naming it before its cases
 * are known is what keeps its arrival from requiring an edit here.
 */
export const CORPUS_FILES = {
  regression: "creative-understanding.json",
  holdout: "creative-understanding-holdout.json",
  /** `sealed_challenge_v1` — authored for `v4`, run once, spent. Now a known regression set. */
  challenge: "creative-understanding-sealed-challenge.json",
  /** The fresh corpus a `v5` GO needs. Deliberately absent: it is authored after this freeze. */
  challenge2: "creative-understanding-sealed-challenge-v2.json",
  /**
   * Phase 4B's rerun-behaviour validation set. **Deliberately absent**: its machinery and every
   * acceptance criterion are frozen at T5, and only then does an independent author write the
   * cases (T6–T8). Naming the file here now is what makes adding it later the entire change.
   */
  rerunBehaviour: "clarification-rerun-behaviour.json",
} as const;

export type CorpusSet = keyof typeof CORPUS_FILES;

/** Repository-relative, because both callers resolve it against their own root. */
export function corpusPath(set: CorpusSet): string {
  return `docs/model-evals/${CORPUS_FILES[set]}`;
}

/**
 * Evidence that may never be written again, whatever anyone asks for.
 *
 * Each was produced by a run that is now part of the record: the Phase 4A baseline, the first
 * sealed challenge's one and only run, the `v5` regression run, the `v5` diagnostic re-run of the
 * spent challenge, the one run of the pre-registered validation set, and the one run of the fresh
 * sealed challenge. An eval set pointing at any of them would not overwrite a report — it would
 * overwrite the thing the report is evidence *of*. The holdout and the fresh challenge matter most
 * here: run-once is what made them evidence, so a second run over either directory would not
 * merely lose the record, it would destroy the property the record rests on.
 *
 * With `sealed_challenge_v2` spent, every set now points at a protected path and none of the five
 * can write. That is the correct end state for this evidence programme, not a defect: fresh
 * evidence for a future prompt version needs a new corpus and a new slot, which is exactly the
 * cost that keeps a rerun from quietly standing in for one.
 *
 * A directory is added here as part of finishing the run that produced it, never as a follow-up:
 * until it is, the only guard is the write-once check, which `EVAL_OVERWRITE=1` overrides on
 * purpose. The cost is that the set which wrote it can no longer run at that path — that is what
 * protection means, and `spentChallenge` is the precedent for what a later rerun needs instead.
 */
export const PROTECTED_RESULT_DIRS = [
  "docs/model-evals/results/creative-understanding-v1",
  "docs/model-evals/results/creative-understanding-sealed-challenge-v1",
  "docs/model-evals/results/creative-understanding-v1-regression",
  "docs/model-evals/results/creative-understanding-sealed-challenge-v1-v5-regression",
  "docs/model-evals/results/creative-understanding-holdout-v1",
  "docs/model-evals/results/creative-understanding-sealed-challenge-v2",
] as const;

/**
 * Where the Phase 4B rerun-behaviour run will write, fixed before its cases exist.
 *
 * It is **not** in `PROTECTED_RESULT_DIRS` yet, and that is the point: it is the one directory an
 * eval may still write to, exactly as `challenge2`'s was until its run happened. It joins the
 * protected list in the same change that commits its evidence (T14), never as a follow-up.
 */
export const RERUN_BEHAVIOUR_OUT = "docs/model-evals/results/clarification-rerun-behaviour-v1";

/**
 * These directories are immutable **in full**, narrative files included. The historical
 * `process-notes.md` inside the Phase 4A baseline is a frozen record of what was known at the
 * time and is never appended to again; future eval-process incidents go to
 * `docs/model-evals/eval-incidents.md`, which sits outside every protected directory. The
 * exception that used to live here — that one file was append-only in place — is gone, because a
 * rule the repository states and does not practise is worse than the inconvenience of moving.
 */

/**
 * Would writing here touch evidence that already exists?
 *
 * A pure function rather than a comparison inline in the runner, for the reason this project has
 * now learned twice: a rule inside the eval runner cannot be tested without running the thing it
 * guards. The previous version compared `OUT` to each directory with `===`, which no test could
 * fail — simplifying it to a comparison that is always false would have disarmed the refusal
 * silently.
 *
 * Containment in both directions: writing *into* a protected directory destroys evidence, and
 * writing to an *ancestor* of one drops reports beside it where a reader would take them for the
 * same run. Trailing and doubled slashes are normalized because `path.join` preserves them.
 */
export function isProtectedOutput(outRelativePath: string): boolean {
  const normalize = (value: string) => value.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  const out = normalize(outRelativePath);
  return PROTECTED_RESULT_DIRS.some((dir) => {
    const protectedDir = normalize(dir);
    return (
      out === protectedDir ||
      out.startsWith(`${protectedDir}/`) ||
      protectedDir.startsWith(`${out}/`)
    );
  });
}

/**
 * Every file whose text reaches the model, and is therefore scannable for benchmark leakage.
 *
 * The prompt and the wire schema exist today — the schema counts because every `.describe()`
 * string ships, which is how leak 4 reached production in Phase 4A. The third does not exist yet
 * and is declared anyway: **Phase 4B T9's input assembly introduces static model-visible strings**
 * — the labels, the precedence wording, the delimiters — and by the time it lands the
 * rerun-behaviour corpus is frozen (T8) and this scanner cannot be changed (T5). Every escape
 * closes in sequence, so the surface is named now or the gap is permanent.
 *
 * `prompt-leakage.test.ts` scans each surface that exists and, for the one that does not, fails
 * the moment the assembly version moves off `event_identity_input_v1` without the file appearing.
 */
export const MODEL_VISIBLE_SURFACES = {
  prompt: "docs/model-prompts/event-identity.system.md",
  "wire schema": "docs/model-schemas/event-identity-result.wire.schema.json",
  "input assembly": "src/lib/ai/openai/event-identity-input.ts",
} as const;

/** The assembly version at which the third surface above is still legitimately absent. */
export const ASSEMBLY_VERSION_BEFORE_ANSWERS = "event_identity_input_v1";

/**
 * Which corpus each eval set runs, where its evidence lands, and what class that evidence is.
 *
 * Two sets share the `challenge` corpus and must never share an output directory: `challenge`
 * is the historical run, and `spentChallenge` is the safe `v5` diagnostic rerun of the same
 * twelve cases. Keeping the labels far apart is deliberate — the single most expensive mistake
 * available here is reading a rerun of known cases as generalization evidence.
 */
export const EVAL_SETS = {
  regression: {
    runner: "creative-understanding",
    corpus: corpusPath("regression"),
    out: "docs/model-evals/results/creative-understanding-v1-regression",
    label: "REGRESSION RE-RUN — known cases, not fresh evidence",
  },
  holdout: {
    runner: "creative-understanding",
    corpus: corpusPath("holdout"),
    out: "docs/model-evals/results/creative-understanding-holdout-v1",
    label:
      "PRE-REGISTERED VALIDATION SET — frozen before remediation, but known to the " +
      "implementation author; useful validation evidence, not the strongest evidence of " +
      "generalization",
  },
  challenge: {
    runner: "creative-understanding",
    corpus: corpusPath("challenge"),
    out: "docs/model-evals/results/creative-understanding-sealed-challenge-v1",
    label:
      "SPENT SEALED CHALLENGE (sealed_challenge_v1) — run once at v4 and already used; its " +
      "first-run evidence is immutable and this path is refused. Use eval:spent-challenge for a " +
      "diagnostic rerun",
  },
  spentChallenge: {
    runner: "creative-understanding",
    corpus: corpusPath("challenge"),
    out: "docs/model-evals/results/creative-understanding-sealed-challenge-v1-v5-regression",
    label:
      "KNOWN / SPENT CHALLENGE RE-RUN — the v1 sealed cases against v5, as regression and " +
      "diagnostic evidence only. These cases were known while v5 was written. NOT fresh " +
      "generalization evidence",
  },
  rerunBehaviour: {
    runner: "clarification-rerun",
    corpus: corpusPath("rerunBehaviour"),
    out: RERUN_BEHAVIOUR_OUT,
    label:
      "PRE-REGISTERED VALIDATION SET (clarification rerun behaviour) — its machinery and " +
      "acceptance criteria were frozen before its cases were authored, and its cases were " +
      "written by someone who implemented neither. Pre-registered validation evidence for the " +
      "clarification-answer input shape/lifecycle; NOT fresh generalization evidence for " +
      "EventIdentity v5, and NOT a replacement for the spent v5 sealed challenge",
  },
  challenge2: {
    runner: "creative-understanding",
    corpus: corpusPath("challenge2"),
    out: "docs/model-evals/results/creative-understanding-sealed-challenge-v2",
    label:
      "FRESH SEALED CHALLENGE (sealed_challenge_v2) — independently authored after the v5 " +
      "implementation and harness froze, and unseen while they were written; the fresh " +
      "generalization evidence for v5",
  },
} as const;

export type EvalSet = keyof typeof EVAL_SETS;

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
