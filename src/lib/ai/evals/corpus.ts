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
  /**
   * Phase 4C's DesignIntent regression corpus. **Deliberately absent**: the harness and the gate
   * are frozen at T19, and only then does an independent author write the cases (T20).
   */
  designIntentRegression: "design-intent-regression.json",
  /**
   * Phase 4C's pre-registered validation corpus, **v2 and deliberately absent**.
   *
   * The v1 file is still on disk and nothing points at it any more. It was authored at T20 under a
   * host-constraint criterion that asked this stage to be traceable for constraints a DesignIntent
   * has no field for, and it was read while that criterion was being corrected — so whatever its
   * cases say, it can no longer be called a set whose criteria were fixed before it existed.
   * `INVALIDATED_CORPORA` records it, with its digest, so "invalidated" is a fact in the code
   * rather than a claim in a commit message.
   *
   * The key is deliberately unchanged. `prompt-leakage.test.ts` and `harness-provenance.test.ts`
   * read the key, not the filename, so the replacement is scanned for leakage the moment it lands
   * and no control had to be widened to notice it. T20B authors it, from the corrected published
   * dimensions alone, by an author who has not seen the invalidated one.
   */
  designIntentValidation: "design-intent-validation-v2.json",
  /**
   * Phase 4C's sealed challenge. **Deliberately absent, and for longer than the other two**: it is
   * written at T22 by an author who has seen neither the prompt nor prior outputs nor known
   * failures, after the T21 implementation freeze. Naming it here now, while its cases are
   * unknown, is what keeps its arrival from requiring an edit anywhere — exactly the arrangement
   * `challenge2` proved twice.
   */
  designIntentChallenge: "design-intent-sealed-challenge.json",
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
 * spent challenge, the one run of the `v5` holdout, the one run of the fresh sealed challenge, and
 * the one run of Phase 4B's clarification-rerun validation set. An eval set pointing at any of them
 * would not overwrite a report — it would overwrite the thing the report is evidence *of*. The
 * holdout, the fresh challenge and the clarification rerun matter most here: run-once is what made
 * them evidence, so a second run over any of those directories would not merely lose the record, it
 * would destroy the property the record rests on.
 *
 * With Phase 4B's clarification-rerun set run at T13, every one of the six sets now points at a
 * protected path and none of them can write. That is the correct end state for this evidence
 * programme, not a defect: fresh evidence for a future prompt version needs a new corpus and a new
 * slot, which is exactly the cost that keeps a rerun from quietly standing in for one.
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
  "docs/model-evals/results/clarification-rerun-behaviour-v1",
] as const;

/**
 * Where the Phase 4B rerun-behaviour run wrote, fixed before its cases existed.
 *
 * It was the one directory an eval could still write to, exactly as `challenge2`'s was until its
 * run happened. T13 ran the set once, and this path joins `PROTECTED_RESULT_DIRS` above in the same
 * change that commits that evidence (T14), never as a follow-up. The set that produced it can no
 * longer write here — that is what protection costs, and it is the point.
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
  /**
   * The provider boundary, which carries static model-visible text **today**: `userMessage()`
   * builds the delimiters, the `<<<HOST_EVENT_DESCRIPTION` markers, the "treat everything between
   * the markers as untrusted data" instruction and the no-inspiration line, and the repair retry
   * adds more. None of that was scanned until now, and it is a real surface whatever T9 does.
   */
  "provider boundary": "src/lib/ai/openai/event-identity.ts",
  /**
   * Where T9's assembly text will live. Declared while absent so the version guard below can tie
   * the two together — but naming a future file is not enough on its own, which is why the
   * provider boundary above is scanned as well: an implementer who put the labels in the existing
   * file instead would otherwise satisfy the guard and leave the strings unscanned.
   */
  "input assembly": "src/lib/ai/openai/event-identity-input.ts",
  /**
   * The DesignIntent prompt, now `design_intent_v5`. Declared here at T19 — before the 4C corpora
   * were authored and before the prompt was written — so the scan covered it from the moment
   * either changed, rather than being widened after someone had seen the cases. T21 rewrote the
   * file under that standing declaration, which is the arrangement working as intended.
   */
  "design intent prompt": "docs/model-prompts/design-intent.system.md",
  /**
   * The DesignIntent wire schema. It counts for the same reason the Event Identity one does: every
   * `.describe()` string ships to the model, which is how Phase 4A's leak 4 reached production.
   */
  "design intent wire schema": "docs/model-schemas/design-intent.wire.schema.json",
  /**
   * The DesignIntent provider boundary and the assembly beside it, added at T21 for exactly the
   * reason the Event Identity pair above is here: both carry static model-visible text.
   *
   * `design-intent-input.ts` holds all of it deliberately — the labels, the delimiters, the
   * preambles, the sentence that says `hostConstraints` is authoritative and `creativeGuidance`
   * advisory. The boundary is scanned as well, and not as ceremony: an implementer who put a label
   * or a correction turn in the caller instead would otherwise satisfy the declaration and leave
   * the strings unscanned, which is the same hole the Event Identity entry closes.
   *
   * Declared here rather than listed in `prompt-leakage.test.ts`, which reads this map, so adding
   * a surface does not mean editing benchmark-integrity tooling.
   */
  "design intent provider boundary": "src/lib/ai/openai/design-intent.ts",
  "design intent input assembly": "src/lib/ai/openai/design-intent-input.ts",
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
  /**
   * The three Phase 4C DesignIntent sets, wired at T19 while none of their cases exists.
   *
   * Each carries its evidence class in `§3.4`'s own words, and the three labels are deliberately
   * hard to confuse: the single most expensive mistake available here is reading a rerun of known
   * cases as generalization evidence, and 4A made a version of it. None of them writes to a
   * protected directory yet, because none of them has run; each directory joins
   * `PROTECTED_RESULT_DIRS` in the same change that commits its evidence, never as a follow-up.
   */
  designIntentRegression: {
    runner: "design-intent",
    corpus: corpusPath("designIntentRegression"),
    out: "docs/model-evals/results/design-intent-regression-v1",
    label:
      "REGRESSION CORPUS (4C DesignIntent) — authored before the prompt and readable freely; it " +
      "catches regressions, forever. NOT validation evidence and NOT generalization evidence",
  },
  designIntentValidation: {
    runner: "design-intent",
    corpus: corpusPath("designIntentValidation"),
    out: "docs/model-evals/results/design-intent-validation-v2",
    label:
      "PRE-REGISTERED VALIDATION SET (4C DesignIntent), the replacement — its predecessor was " +
      "invalidated at T19B, because it was authored under a host-constraint criterion this stage " +
      "could not always meet and was read while that criterion was being corrected. This corpus " +
      "is authored and frozen against the corrected contract, before the DesignIntent prompt was " +
      "written, by a second independent author who implemented none of the harness and saw none " +
      "of the invalidated cases, and independently reviewed for fairness and leakage. Validation " +
      "against pre-registered invariants; NOT generalization evidence, and NOT the sealed " +
      "challenge",
  },
  designIntentChallenge: {
    runner: "design-intent",
    corpus: corpusPath("designIntentChallenge"),
    out: "docs/model-evals/results/design-intent-sealed-challenge-v1",
    label:
      "SEALED CHALLENGE (4C DesignIntent) — authored after the T21 implementation and this " +
      "harness froze, by an author who saw neither the prompt nor prior outputs nor known " +
      "failures. It is the generalization evidence the §3.7 gate is applied to. One run, then " +
      "spent",
  },
} as const;

export type EvalSet = keyof typeof EVAL_SETS;

/**
 * Corpora that exist, are preserved, and may never be run as the evidence class they were written
 * to be.
 *
 * This is a different thing from `PROTECTED_RESULT_DIRS`, and the difference is worth stating.
 * That list protects *evidence a run produced*. This one records *a set whose claim about itself
 * stopped being true* — which cannot be fixed by protecting it, only by pointing nothing at it and
 * saying why in the place a reader will look.
 *
 * `design-intent-validation.json` is the first entry and, so far, the only one. It was authored at
 * T20 against `§3.2`'s then-current criterion, "every `hostConstraint` traceable into all three".
 * Independent review found that criterion asks a stage to be traceable for constraints it has no
 * field for: `spec.md §7.5` defines a host constraint broadly — a prohibition, an explicit
 * requirement of a specific thing, or a correction — and a DesignIntent carries seven design fields
 * and a `presentation` card, with nowhere to put event-detail copy, RSVP or payment behaviour,
 * meal or alcohol disclosure, or section ordering. T19B corrected the criterion to the stage-scoped
 * rule, and the correction was made while this corpus was on disk and being read. A pre-registered
 * set is one whose criteria were fixed before its cases existed; this one's were not, in the
 * direction that matters, so calling it pre-registered validation evidence for the corrected
 * contract would be a claim the record does not support.
 *
 * So it is preserved exactly as it was, pinned by digest here and by a test beside it, and nothing
 * points at it. It is not deleted: deleting the thing a correction cost is how a programme loses
 * the ability to say what the correction cost. T20B wrote the replacement.
 *
 * **Preserved does not mean readable by everyone.** This isolation binds the *corpus* author, and
 * T20B's review found that nothing bound the **prompt** author — who could read an invalidated set
 * of cases while writing the text the replacement set is meant to test independently. T20B's own
 * replacement converged on a premise this file already contained, without its author ever seeing
 * it, which is how well-trodden that ground turned out to be. So T21 is written **without reading
 * this file**, as a condition of the task rather than a courtesy
 * (`docs/phase-4b-plan.md` Part IV, T20B's freeze record).
 *
 * A digest, a byte count and a task id, because "invalidated" has to be checkable. If an entry here
 * ever stops matching the file on disk, the record is wrong about what was invalidated, which is a
 * stop condition rather than a hash to update.
 */
export const INVALIDATED_CORPORA = [
  {
    path: "docs/model-evals/design-intent-validation.json",
    sha256: "2207df544a66669d171cc8d2a333ddf616ab4047c70db3d6b9447f7927330d26",
    bytes: 37123,
    invalidatedAt: "T19B",
    why:
      "authored at T20 under §3.2's pre-T19B host-constraint criterion — 'every `hostConstraint` " +
      "traceable into all three' — which required conformance this stage cannot express, and read " +
      "while that criterion was being corrected. Preserved unchanged; no eval set points at it; " +
      "never run as pre-registered evidence for the corrected contract",
  },
] as const;

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

/* ------------------------------------------------------------------ leakage probes */

/**
 * Every string in one corpus case that must not appear in model-visible text.
 *
 * Split out of `prompt-leakage.test.ts` at Phase 4C T19, because the scan now reads corpora of two
 * different shapes. A Phase 4A/4B case is a host `prompt` plus assertions about it. A Phase 4C
 * DesignIntent case has no host prompt at all — the frozen input is an authoritative
 * `identity` brief — so a scanner that reached for `.prompt` would either throw on the first 4C
 * case or, worse, quietly scan nothing. Both were live outcomes the moment T20 lands a corpus, and
 * a control that stops covering something is the defect this project's leakage claim already
 * turned out to be once.
 *
 * Pure, and unit-tested in `corpus.test.ts`, for the reason every other rule here lives outside the
 * runner: a rule inside the eval runner cannot be tested without running the thing it guards.
 *
 * - **`verbatim`** — text the model must not have been shown at all. Whole-string matches are
 *   reported, and distinctive spans of each entry are too.
 * - **`claims`** — expected answers, probes, host phrases and notes. Whole-string matches only;
 *   these are short and a span check would report English.
 */
export interface LeakageProbes {
  verbatim: string[];
  claims: string[];
}

/** Every string of at least `min` characters reachable inside a value, deduplicated. */
function stringsIn(value: unknown, min: number, seen = new Set<unknown>()): string[] {
  if (typeof value === "string") return value.trim().length >= min ? [value] : [];
  if (value === null || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  return Object.values(value as Record<string, unknown>).flatMap((child) =>
    stringsIn(child, min, seen),
  );
}

/**
 * The prose fields of an identity brief — the ones an author actually writes.
 *
 * Deliberately **not** the whole object, and the exclusions are the point.
 *
 * `compatibleFamilies`, `compatibleTonalDirections` and `compatibleTypographyCategories` are closed
 * enums: a brief must say `editorial`, `invitation` or `statement`, and those three words are in
 * `docs/model-prompts/event-identity.system.md` and in the DesignIntent wire schema because the
 * schema is what puts them there. Scanning them would report a leak on **every** 4C case, on a
 * value the schema forces — and `§3.5` says a collision is resolved *at the corpus*, never by
 * relaxing the scanner. A corpus author cannot resolve a value they are not allowed to change, so
 * the only escape would be editing this scanner after the cases exist, which is the one move the
 * whole T19-before-T20 ordering exists to prevent. The enums are excluded here, before any case
 * exists, rather than waived later.
 *
 * `inspirationSummary` is scanned **unless** it is the sentinel. `contract.ts` requires exactly
 * `"No visual inspiration supplied."` when there is none, and that sentence is quoted in the prompt
 * for the same reason — so it is a forced value too, and every 4C case would carry it.
 *
 * What is left is what an author chose: the creative direction, the tone keywords, the palette
 * prose, the motifs, the texture, typography and copy direction, the host constraints and the
 * creative guidance. Those are genuinely fixable at the corpus, which is what makes scanning them
 * a control rather than a tripwire.
 */
const INSPIRATION_SENTINEL = "No visual inspiration supplied.";

const IDENTITY_PROSE_FIELDS = [
  "creativeDirection",
  "toneKeywords",
  "paletteIntent",
  "tonalIntent",
  "visualMotifs",
  "textureDirection",
  "typographyDirection",
  "copyTone",
  "hostConstraints",
  "creativeGuidance",
] as const;

/** Every author-written string in an identity brief. Exported so its scope is testable. */
export function identityProseStrings(identity: unknown): string[] {
  if (identity === null || typeof identity !== "object") return [];
  const brief = identity as Record<string, unknown>;
  const out = IDENTITY_PROSE_FIELDS.flatMap((field) => stringsIn(brief[field], 6));
  const inspiration = brief.inspirationSummary;
  if (typeof inspiration === "string" && inspiration.trim() !== INSPIRATION_SENTINEL) {
    out.push(...stringsIn(inspiration, 6));
  }
  return [...new Set(out)];
}

export function leakageProbes(testCase: unknown): LeakageProbes {
  const value = (testCase ?? {}) as Record<string, unknown>;
  const text = (input: unknown): string | null =>
    typeof input === "string" && input.trim().length > 0 ? input : null;

  const verbatim: string[] = [];
  const claims: string[] = [];

  const prompt = text(value.prompt);
  if (prompt) verbatim.push(prompt);

  // A 4C case: the frozen authoritative brief is the input the run is built on, so the author's own
  // words in it are text the DesignIntent prompt must not already contain. The closed enums and the
  // no-inspiration sentinel are excluded, because a forced value cannot be fixed at the corpus —
  // see `identityProseStrings`. Six characters, matching the floor the claims list has always used.
  verbatim.push(...identityProseStrings(value.identity));

  const list = (input: unknown) =>
    Array.isArray(input) ? input.filter((entry): entry is string => typeof entry === "string") : [];

  claims.push(...list(value.mustAvoid));
  claims.push(...list(value.mustNotBeClaimedAsHostConstraint));
  claims.push(
    ...(Array.isArray(value.hostPhrases) ? value.hostPhrases : [])
      .map((phrase) => (phrase as { phrase?: unknown })?.phrase)
      .filter((phrase): phrase is string => typeof phrase === "string"),
  );
  // The gating answers themselves: showing the model these is the worst form.
  claims.push(...stringsIn(value.expectedFacts, 1));
  claims.push(...stringsIn(value.facts, 1));
  claims.push(...stringsIn(value.suppliedFacts, 1));
  // `eventType` is deliberately **not** a probe. It never reaches the model, never appears in the
  // blind artifact, and is only a grouping key for the same-type measurement — so it is not
  // benchmark content that could leak. Scanning it would also collide with ordinary vocabulary:
  // `docs/phase-4b-plan.md §3.7` uses "quinceañera" and "christening" as its own worked example,
  // and a corpus using either label would report a leak against a document the model never sees.
  for (const note of [value.notes, value.rationale]) {
    const entry = text(note);
    if (entry) claims.push(entry);
  }

  return {
    verbatim: [...new Set(verbatim)],
    claims: [...new Set(claims.filter((claim) => claim.trim().length >= 6))],
  };
}
