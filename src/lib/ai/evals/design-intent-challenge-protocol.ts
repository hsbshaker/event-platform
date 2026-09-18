/**
 * The v3 sealed-challenge authoring protocol, frozen before either author wrote a case.
 *
 * Two sealed-challenge candidates were authored and invalidated before this file existed, and the
 * second one is why this file exists at all. `INVALIDATED_CORPORA` records both: the first for a
 * reviewer-context defect, the second for a defect no repair reaches — every prior corpus in this
 * programme came from one authoring-model distribution, and independent semantic review found
 * whole-premise duplicates, reused organizing devices and a house idiom across corpora written in
 * separately sealed sessions. **A fresh session buys a fresh context, not a fresh distribution.**
 * For the one set the §3.7 gate is applied to, that is not enough.
 *
 * So the v3 corpus is authored **externally, by two model families that have authored none of this
 * programme's corpora**, six cases each, and the lead authors none of it. That is a claim about
 * provenance, and provenance claims are worth exactly as much as the record made *before* the thing
 * arrives. Hence this module: the namespace, the split, the per-half composition rule, the assembly
 * order and the corpus version are fixed here while **no case exists**, and the checks below are
 * pure functions over ids and event types, so they can be run on the halves the moment they land
 * without anything being edited after someone has read them.
 *
 * What this module deliberately does **not** contain: any case, any premise, any name, any prose an
 * author could reuse, and any part of the semantic-overlap or system-aware fairness reviews. Those
 * are judgements, they are made by independent reviewers, and a checker that pretended to make them
 * would be the same defect this programme has now found six times — a mechanical proxy standing in
 * for the thing it cannot measure.
 *
 * Canon: `docs/phase-4b-plan.md` Part IV (the mixed-author protocol freeze) and `§3.4`–`§3.6`;
 * `docs/model-contracts.md §4.7`. Acceptance criteria: N/A — evidence machinery, no product
 * behaviour change.
 */

/** The corpus `version` the assembled v3 file must carry, fixed before its cases exist. */
export const SEALED_CHALLENGE_V3_VERSION = "design_intent_sealed_challenge_v3";

/** Exactly how many v3 cases the lead may author, write prose for, repair creatively or replace. */
export const CLAUDE_AUTHORED_V3_CASE_QUOTA = 0;

export interface SealedChallengeHalf {
  /**
   * The authoring family, precommitted. **User-supplied provenance, not a cryptographic claim**:
   * nothing here proves which model produced a JSON file, and this field must never be read as if
   * it did. It is recorded so the record says who the corpus is attributed to and on what basis.
   */
  readonly family: "ChatGPT" | "Gemini";
  /** The id prefix reserved for this half. No prior corpus uses `DIC3-`. */
  readonly prefix: string;
  /** Exactly six ids, in assembly order. */
  readonly caseIds: readonly string[];
}

/**
 * The two halves, in the order they are assembled in. The order is declared here rather than
 * decided later for one reason: ordering a corpus after reading it is a selection decision, and
 * the protocol forbids every selection decision — including "best six from a larger pool", which
 * is the same defect with a friendlier name.
 */
export const SEALED_CHALLENGE_V3_HALVES = [
  {
    family: "ChatGPT",
    prefix: "DIC3-G",
    caseIds: ["DIC3-G01", "DIC3-G02", "DIC3-G03", "DIC3-G04", "DIC3-G05", "DIC3-G06"],
  },
  {
    family: "Gemini",
    prefix: "DIC3-M",
    caseIds: ["DIC3-M01", "DIC3-M02", "DIC3-M03", "DIC3-M04", "DIC3-M05", "DIC3-M06"],
  },
] as const satisfies readonly SealedChallengeHalf[];

/** The twelve ids, in the one legal assembled order: the ChatGPT half, then the Gemini half. */
export const SEALED_CHALLENGE_V3_CASE_IDS: readonly string[] = SEALED_CHALLENGE_V3_HALVES.flatMap(
  (half) => [...half.caseIds],
);

/**
 * What neither external author may be shown. Not a courtesy list — each entry is a route by which
 * a sealed challenge stops being sealed, and two of them have already been taken in this
 * programme.
 *
 * The source labels above belong on this list too, from the other direction: they are provenance
 * for the record and must never reach the DesignIntent model or the blind qualitative reviewer,
 * because a reviewer who knows which family wrote a case is no longer rating the case.
 */
export const SEALED_CHALLENGE_V3_WITHHELD_FROM_AUTHORS = [
  "any previous corpus",
  "any invalidated sealed challenge",
  "any prior model output",
  "the DesignIntent prompt",
  "wire schemas beyond the published author-facing field contract",
  "provider code",
  "input assembly",
  "planner implementation",
  "validator implementation",
  "known model failures",
  "prior qualitative reviews",
  "§3.7 gate arithmetic",
  "the expected outcome",
  "any statement about what would produce GO",
  "the other author's half, before both halves are complete",
] as const;

/**
 * The per-half composition rule, precommitted so that the final twelve carry at least two
 * same-event-type pairs **without any case being selected after it was read**.
 *
 * Cross-half accidental event-type matches are legal and are not on their own grounds for editing
 * anything. That is deliberate: a rule that made them illegal would force a post-hoc edit to cases
 * whose only fault is that two independent authors both thought of a birthday.
 */
export const SEALED_CHALLENGE_V3_CASES_PER_HALF = 6;
export const SEALED_CHALLENGE_V3_SAME_TYPE_PAIRS_PER_HALF = 1;
export const SEALED_CHALLENGE_V3_DISTINCT_TYPES_PER_HALF = 5;

/** Only the fields these checks read. A case carries far more, and none of it is inspected here. */
interface UncheckedHalfCase {
  id?: unknown;
  eventType?: unknown;
}

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Every way one half breaks the precommitted composition, or an empty array.
 *
 * All the problems at once rather than the first, for the same reason `validateCorpusShape` does
 * it: the person who has to act on this cannot run our checker, and a finding returned to an
 * external author has to travel through the user as one abstract message rather than six rounds.
 *
 * Ids are checked as a **set** here and as an ordered list only at assembly, so an author who
 * returns their six cases in a different order is not failed for it — the assembly step puts them
 * in the declared order mechanically, which is what the declared order is for.
 */
export function checkHalfComposition(
  half: SealedChallengeHalf,
  cases: readonly unknown[],
): string[] {
  const problems: string[] = [];
  const parsed = cases as readonly UncheckedHalfCase[];

  if (parsed.length !== SEALED_CHALLENGE_V3_CASES_PER_HALF) {
    problems.push(
      `${half.family} half: expected exactly ${SEALED_CHALLENGE_V3_CASES_PER_HALF} cases, found ` +
        `${parsed.length}`,
    );
  }

  const ids = parsed.map((testCase, index) =>
    nonEmptyString(testCase?.id) ? testCase.id : `cases[${index}]`,
  );
  const seen = new Set<string>();
  for (const [index, id] of ids.entries()) {
    if (!nonEmptyString(parsed[index]?.id)) {
      problems.push(`${half.family} half: \`id\` at index ${index} must be a non-empty string`);
      continue;
    }
    if (seen.has(id)) {
      problems.push(`${half.family} half: duplicate \`id\` ${id}`);
    }
    seen.add(id);
    if (!half.caseIds.includes(id)) {
      problems.push(
        `${half.family} half: \`id\` ${id} is outside the precommitted namespace ` +
          `${half.caseIds[0]}–${half.caseIds[half.caseIds.length - 1]}`,
      );
    }
  }
  for (const expected of half.caseIds) {
    if (!seen.has(expected)) {
      problems.push(`${half.family} half: missing precommitted \`id\` ${expected}`);
    }
  }

  // The same-event-type rule. Counted as a multiset rather than searched for a pair, because the
  // failure this has to catch is three cases sharing a type as readily as none sharing one.
  const types = new Map<string, number>();
  for (const [index, testCase] of parsed.entries()) {
    if (!nonEmptyString(testCase?.eventType)) {
      problems.push(
        `${half.family} half: ${ids[index]} has no \`eventType\`, so the same-event-type rule ` +
          "cannot be checked",
      );
      continue;
    }
    types.set(testCase.eventType, (types.get(testCase.eventType) ?? 0) + 1);
  }

  if (types.size > 0 && parsed.every((testCase) => nonEmptyString(testCase?.eventType))) {
    const pairs = [...types.values()].filter((count) => count === 2).length;
    const overloaded = [...types.entries()].filter(([, count]) => count > 2);
    if (overloaded.length > 0) {
      problems.push(
        `${half.family} half: \`eventType\` ${overloaded
          .map(([type, count]) => `${type} appears ${count} times`)
          .join(", ")}; the rule is exactly one pair and four distinct others`,
      );
    } else if (
      pairs !== SEALED_CHALLENGE_V3_SAME_TYPE_PAIRS_PER_HALF ||
      types.size !== SEALED_CHALLENGE_V3_DISTINCT_TYPES_PER_HALF
    ) {
      problems.push(
        `${half.family} half: expected exactly ${SEALED_CHALLENGE_V3_SAME_TYPE_PAIRS_PER_HALF} ` +
          `same-\`eventType\` pair across ${SEALED_CHALLENGE_V3_DISTINCT_TYPES_PER_HALF} distinct ` +
          `types, found ${pairs} pair(s) across ${types.size} distinct types`,
      );
    }
  }

  return problems;
}

/**
 * Every way the assembled corpus departs from what was precommitted here, or an empty array.
 *
 * This is the mechanical half of the pre-freeze checks and nothing more. A corpus that passes it
 * is correctly *assembled*; whether it is fair, unleaked, non-overlapping and satisfiable is
 * decided by the leakage scan, the gated structural contract, the independent semantic
 * premise-overlap review and the system-aware fairness review — in that order, and none of them
 * lives here.
 */
export function checkAssembledSealedChallengeV3(parsed: unknown): string[] {
  const problems: string[] = [];
  const corpus = (parsed ?? {}) as { version?: unknown; cases?: unknown };

  if (corpus.version !== SEALED_CHALLENGE_V3_VERSION) {
    problems.push(
      `top-level \`version\` must be \`${SEALED_CHALLENGE_V3_VERSION}\`, found ` +
        `${JSON.stringify(corpus.version)}`,
    );
  }

  if (!Array.isArray(corpus.cases)) {
    problems.push("`cases` must be an array");
    return problems;
  }

  const cases = corpus.cases as readonly UncheckedHalfCase[];
  const ids = cases.map((testCase) => (nonEmptyString(testCase?.id) ? testCase.id : null));

  if (
    ids.length !== SEALED_CHALLENGE_V3_CASE_IDS.length ||
    ids.some((id, index) => id !== SEALED_CHALLENGE_V3_CASE_IDS[index])
  ) {
    problems.push(
      "`cases` must be exactly the precommitted twelve ids in the declared assembly order " +
        `(${SEALED_CHALLENGE_V3_CASE_IDS.join(", ")}), found ` +
        `(${ids.map((id) => id ?? "<missing>").join(", ")})`,
    );
  }

  // Each half is then checked on its own cases, by id rather than by position, so a misordered
  // corpus reports the ordering problem once instead of failing every composition rule as well.
  // Annotated rather than inferred: the `as const` tuple gives each half a distinct literal id
  // type, and `includes` on their union narrows its parameter to `never`.
  for (const half of SEALED_CHALLENGE_V3_HALVES as readonly SealedChallengeHalf[]) {
    problems.push(
      ...checkHalfComposition(
        half,
        cases.filter(
          (testCase) => nonEmptyString(testCase?.id) && half.caseIds.includes(testCase.id),
        ),
      ),
    );
  }

  return problems;
}
