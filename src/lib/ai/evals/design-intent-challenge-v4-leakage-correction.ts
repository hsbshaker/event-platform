/**
 * The v4 leakage-correction round, frozen before either author is contacted.
 *
 * The frozen scan gated the two Stage-2 halves on 28 raw substring collisions arising from exactly
 * sixteen single-word `toneKeywords` values — `provenance/…-v4/leakage/README.md` has the full
 * result. Every hit came from the `verbatim` check's six-character floor matching **inside longer
 * words**: `reserved` in "preserved", `direct` in "direction", `formal` in "formality". No
 * `creativeDirection`, palette prose, `tonalIntent`, motif, texture, typography-direction,
 * copy-tone, `hostConstraints`, `creativeGuidance` or `inspirationSummary` string collided with
 * anything, on any surface; there were no span hits and no claim hits.
 *
 * This is the class `docs/model-evals/eval-incidents.md` **Debt 1** already recorded prospectively,
 * down to the word: v3's frozen scanner convicted the one-word tone keywords `reflective` and
 * `generous`, one of them against a code comment about byte budgets. The remedy recorded there is
 * the remedy applied here — **narrow corpus-side wording correction through the original authors**
 * — and the reason it is not the other remedy is the ordering this programme refuses everywhere
 * else: changing the referee with a specific game's collisions in view is the move someone would
 * make if the hits were real, so the fact that these are nonsense buys no exception. The scanner
 * is not touched. No case is invalidated or re-premised.
 *
 * What this module is for. Steps 6–9 of the frozen procedure are mechanical, and every one of them
 * is a place where a correction round could quietly become an authoring round. So the coordinates,
 * the disclosure denylist and the two proofs are fixed here **while no replacement exists**, and
 * the checks are pure functions that can be run the moment a response lands without anything being
 * edited after someone has read it. That is the same arrangement the v3 and v4 protocol freezes
 * used, for the same reason.
 *
 * What it deliberately does **not** contain: any replacement wording, any suggestion of one, any
 * synonym list, and any bound on a replacement that the author was not told about. A length cap or
 * a banned-word list invented here would be a metric punishing correct behaviour — the defect this
 * programme has now caught itself building eight times — and it would also make the lead a
 * co-author of the corpus, which `CLAUDE_AUTHORED_REPLACEMENT_QUOTA` sets at zero.
 *
 * Canon: `docs/phase-4b-plan.md` Part IV; `docs/model-contracts.md §4.5`, `§4.7`. Acceptance
 * criteria: N/A — evidence machinery, no product behaviour change.
 */

/** The correction round this module governs. One round; a second would need its own freeze. */
export const V4_LEAKAGE_CORRECTION_VERSION =
  "design_intent_sealed_challenge_v4_leakage_correction_r1";

/** Exactly how many replacement values the lead may author, suggest, rank, or repair creatively. */
export const CLAUDE_AUTHORED_REPLACEMENT_QUOTA = 0;

export interface LeakageCorrectionTarget {
  /** Which half the case belongs to. Never disclosed to either author. */
  readonly slot: "A" | "B";
  readonly caseId: string;
  /** The exact value to be replaced, as it stands in the frozen Stage-2 artifact. */
  readonly keyword: string;
  /** Its index in that case's `toneKeywords`, pinned so substitution cannot drift to a twin. */
  readonly index: number;
}

/**
 * The sixteen values, and nothing else in either corpus is in scope.
 *
 * Pinned by **index as well as value** deliberately. Substituting by `indexOf` would silently move
 * if a value ever appeared twice in one array, and substituting by value alone across the file
 * would rewrite a different case that happens to share an ordinary adjective — which is not
 * hypothetical here: `grounded` is a target in `DIC4-P01` and again in `DIC4-Q05`, in different
 * halves, corrected by different authors who must not be given each other's work.
 */
export const V4_LEAKAGE_CORRECTION_TARGETS = [
  { slot: "A", caseId: "DIC4-P01", keyword: "grounded", index: 0 },
  { slot: "A", caseId: "DIC4-P01", keyword: "reflective", index: 1 },
  { slot: "A", caseId: "DIC4-P01", keyword: "delicate", index: 3 },
  { slot: "A", caseId: "DIC4-P02", keyword: "gentle", index: 2 },
  { slot: "A", caseId: "DIC4-P02", keyword: "chosen", index: 4 },
  { slot: "A", caseId: "DIC4-P03", keyword: "direct", index: 4 },
  { slot: "A", caseId: "DIC4-P04", keyword: "rigorous", index: 1 },
  { slot: "A", caseId: "DIC4-P04", keyword: "formal", index: 3 },
  { slot: "A", caseId: "DIC4-P05", keyword: "accessible", index: 2 },
  { slot: "A", caseId: "DIC4-P06", keyword: "focused", index: 5 },
  { slot: "B", caseId: "DIC4-Q01", keyword: "reserved", index: 1 },
  { slot: "B", caseId: "DIC4-Q03", keyword: "neutral", index: 1 },
  { slot: "B", caseId: "DIC4-Q04", keyword: "tactile", index: 2 },
  { slot: "B", caseId: "DIC4-Q05", keyword: "grounded", index: 1 },
  { slot: "B", caseId: "DIC4-Q06", keyword: "balanced", index: 2 },
  { slot: "B", caseId: "DIC4-Q06", keyword: "playful", index: 3 },
] as const satisfies readonly LeakageCorrectionTarget[];

/** Ten in half A, six in half B. Pinned so a packet that under- or over-lists is caught. */
export const V4_LEAKAGE_CORRECTION_TARGET_COUNT = 16;

/**
 * What neither author may be shown in this round. Shorter than the authoring denylist and stricter
 * in one direction, because a correction round has an affordance authoring never had: the author
 * knows a machine objected, and the obvious next question is *what did it match*.
 *
 * Answering that would hand over model-visible prompt text — the one thing a sealed challenge
 * cannot survive. It would also be worse than the original leak it is meant to prevent, because it
 * would arrive with the operator's authority attached. So the reason is withheld, and the packets
 * say plainly that it is withheld rather than pretending there is no reason.
 */
export const V4_LEAKAGE_CORRECTION_WITHHELD_FROM_AUTHORS = [
  "any model-visible prompt text",
  "the matching surface text",
  "which surface a value matched",
  "why a particular word collided",
  "that the match was a substring inside a longer unrelated word",
  "any previous corpus",
  "any invalidated sealed challenge",
  "the other half's cases, ids, keywords or author",
  "any semantic, faithfulness or fairness finding",
  "any qualitative diagnostic recorded about their own cases",
  "the scanner, its rules, its thresholds or its output",
  "any replacement wording, synonym or example",
  "the expected outcome",
] as const;

/** Only the fields these checks read. */
interface UncheckedIdentityCase {
  id?: unknown;
  identity?: { toneKeywords?: unknown } | unknown;
}

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/** The production contract's own bound on a `toneKeywords` entry. Not a new rule invented here. */
export const TONE_KEYWORD_MIN_LENGTH = 2;
export const TONE_KEYWORD_MAX_LENGTH = 48;

export interface CorrectionResponseEntry {
  caseId: string;
  keyword: string;
  replacement: string;
}

/**
 * Every way one author's correction response departs from what was asked, or an empty array.
 *
 * All the problems at once rather than the first, for the reason the other checkers do it: the
 * person acting on this cannot run our checker, and a finding travels to an external author as one
 * abstract message rather than six rounds.
 *
 * What it checks is deliberately narrow — that the response covers exactly its own targets, once
 * each, with a value that is actually different and that the **existing production contract**
 * already admits. It does **not** check that a replacement is a good tone keyword, that it is
 * short, that it is semantically equivalent, or that it will clear the scanner. The first three are
 * judgements and belong to the faithfulness reviewer; the fourth belongs to the scanner, at step 8,
 * which is the only thing entitled to decide it.
 */
export function checkCorrectionResponse(
  slot: "A" | "B",
  response: readonly CorrectionResponseEntry[],
): string[] {
  const problems: string[] = [];
  const targets = V4_LEAKAGE_CORRECTION_TARGETS.filter((target) => target.slot === slot);

  if (response.length !== targets.length) {
    problems.push(
      `half ${slot}: expected exactly ${targets.length} replacements, found ${response.length}`,
    );
  }

  const seen = new Set<string>();
  for (const [index, entry] of response.entries()) {
    const key = `${entry?.caseId}\u0000${entry?.keyword}`;
    const target = targets.find((t) => t.caseId === entry?.caseId && t.keyword === entry?.keyword);
    if (!target) {
      problems.push(
        `half ${slot}: entry ${index} names (${entry?.caseId}, ${entry?.keyword}), which is not ` +
          "one of this half's targets",
      );
      continue;
    }
    if (seen.has(key)) {
      problems.push(`half ${slot}: (${entry.caseId}, ${entry.keyword}) is replaced more than once`);
    }
    seen.add(key);

    if (!nonEmptyString(entry.replacement)) {
      problems.push(`half ${slot}: (${entry.caseId}, ${entry.keyword}) has no replacement value`);
      continue;
    }
    if (entry.replacement.trim() === entry.keyword) {
      problems.push(`half ${slot}: (${entry.caseId}, ${entry.keyword}) was replaced with itself`);
    }
    // The production bound, quoted from `contract.ts`, not a cap invented for this round.
    const length = entry.replacement.trim().length;
    if (length < TONE_KEYWORD_MIN_LENGTH || length > TONE_KEYWORD_MAX_LENGTH) {
      problems.push(
        `half ${slot}: (${entry.caseId}, ${entry.keyword}) replacement is ${length} characters; ` +
          `the existing contract admits ${TONE_KEYWORD_MIN_LENGTH}–${TONE_KEYWORD_MAX_LENGTH}`,
      );
    }
  }

  for (const target of targets) {
    if (!seen.has(`${target.caseId}\u0000${target.keyword}`)) {
      problems.push(`half ${slot}: missing replacement for (${target.caseId}, ${target.keyword})`);
    }
  }

  return problems;
}

/**
 * Step 7's proof, done the only way worth doing it: **reconstruct, then compare whole**.
 *
 * The weak version of this check walks the corrected artifact asserting that the fields someone
 * thought to list are unchanged — which passes when a field nobody listed was edited, and that is
 * exactly the failure a correction round produces. So this applies the substitutions to the frozen
 * artifact itself and requires the result to be **deep-equal** to the corrected one. Anything
 * altered anywhere, at any depth, in any field, including key order-independent value changes and
 * including a second edit to the same `toneKeywords` array, fails with no list to keep current.
 *
 * `before` is parsed from the frozen Stage-2 artifact and is never mutated.
 */
export function checkSubstitutionApplied(
  slot: "A" | "B",
  before: unknown,
  after: unknown,
  response: readonly CorrectionResponseEntry[],
): string[] {
  const problems: string[] = [];
  const targets = V4_LEAKAGE_CORRECTION_TARGETS.filter((target) => target.slot === slot);
  const rebuilt = structuredClone(before) as { cases?: unknown };

  if (!Array.isArray(rebuilt?.cases)) return ["`cases` must be an array in the frozen artifact"];
  const cases = rebuilt.cases as UncheckedIdentityCase[];

  for (const target of targets) {
    const entry = response.find((r) => r.caseId === target.caseId && r.keyword === target.keyword);
    if (!entry) {
      problems.push(
        `half ${slot}: no replacement supplied for (${target.caseId}, ${target.keyword})`,
      );
      continue;
    }
    const testCase = cases.find((c) => c?.id === target.caseId);
    const keywords = (testCase?.identity as { toneKeywords?: unknown } | undefined)?.toneKeywords;
    if (!Array.isArray(keywords)) {
      problems.push(`half ${slot}: ${target.caseId} has no \`toneKeywords\` array`);
      continue;
    }
    if (keywords[target.index] !== target.keyword) {
      problems.push(
        `half ${slot}: ${target.caseId}.toneKeywords[${target.index}] is ` +
          `${JSON.stringify(keywords[target.index])}, not the pinned ${JSON.stringify(target.keyword)}`,
      );
      continue;
    }
    keywords[target.index] = entry.replacement.trim();
  }

  if (JSON.stringify(rebuilt) !== JSON.stringify(after)) {
    problems.push(
      `half ${slot}: the corrected artifact is not the frozen artifact with exactly the ` +
        "pinned substitutions applied — something outside the target values changed",
    );
  }

  return problems;
}
