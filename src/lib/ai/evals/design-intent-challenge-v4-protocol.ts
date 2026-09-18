/**
 * The v4 sealed-challenge protocol: premise first, design second, frozen before any card exists.
 *
 * v3 is closed and invalidated as an authoring programme — `provenance/…-v3/CLOSURE.md` — and the
 * reason drives every decision here. Three corpora in a row were disqualified not for leakage but
 * for **repertoire**: an authoring source asked for six hard cases returns the six mood boards it
 * always returns. The final evidence was a fresh isolated session reproducing a discarded half of
 * its own almost slot for slot, down to a phrase pairing and a civic host name it could not have
 * seen. The independent reviewer named what was missing rather than what was duplicated: no host
 * with a reason, no rule that costs the design something, no structural oddity — six nameable
 * genres, and knowing the genres is what the readable corpora already establish.
 *
 * So v4 changes the *method*, not just the author. The human situation is authored and **frozen
 * before the design vocabulary is ever shown**, which is what `SITUATION_CARD_FORBIDDEN_FIELDS`
 * enforces and what Stage 2 then has to stay faithful to. A card that cannot name a colour cannot
 * be a mood board, and an author who has already committed to a human problem cannot quietly
 * replace it with a genre.
 *
 * Two things this module refuses to become, both learned the expensive way:
 *
 * - **It does not decide whether a premise is good.** The quality floor is declared per card and
 *   counted; whether a stated complication is genuine is an independent reviewer's judgement. A
 *   regex that graded premises would be the mechanical proxy this programme has now caught itself
 *   building six times.
 * - **It carries no lesson from v3.** No avoided subject, no banned genre, no "not another
 *   conservatory". Coaching a benchmark against cases its authors must not know exist converts a
 *   sealed challenge into a construction aimed at known answers, which is the failure the whole
 *   protocol exists to prevent.
 *
 * The namespaces are deliberately neutral. `DIC4-P` and `DIC4-Q` encode nothing about which half a
 * human wrote: case ids never reach the blind qualitative reviewer, but they do reach the semantic
 * and fairness reviewers, and a reviewer who knows which half is human-authored is no longer
 * reading the cases.
 *
 * Canon: `docs/phase-4b-plan.md` Part IV; `docs/model-contracts.md §4.7`. Acceptance criteria:
 * N/A — evidence machinery, no product behaviour change.
 */

/** The corpus `version` the assembled v4 file must carry, fixed before any card exists. */
export const SEALED_CHALLENGE_V4_VERSION = "design_intent_sealed_challenge_v4";

/** Exactly how many v4 cards or cases the lead may author, complete, repair or replace. */
export const CLAUDE_AUTHORED_V4_QUOTA = 0;

/**
 * What a half's author is, precommitted as a *class* rather than a name.
 *
 * `human` is a person; `model-family` is one model family, chosen and recorded **before**
 * commissioning so the choice cannot be made after seeing a case. Attribution either way is
 * provenance the user supplies, never a claim this repository can prove.
 */
export type SealedChallengeV4SourceClass = "human" | "model-family";

export interface SealedChallengeV4Half {
  /** `A` or `B`, and also the assembly order. */
  readonly slot: "A" | "B";
  readonly sourceClass: SealedChallengeV4SourceClass;
  /** Neutral by design: it says nothing about who authored the half. */
  readonly prefix: string;
  /** Exactly six ids, in assembly order. */
  readonly caseIds: readonly string[];
}

export const SEALED_CHALLENGE_V4_HALVES = [
  {
    slot: "A",
    sourceClass: "human",
    prefix: "DIC4-P",
    caseIds: ["DIC4-P01", "DIC4-P02", "DIC4-P03", "DIC4-P04", "DIC4-P05", "DIC4-P06"],
  },
  {
    slot: "B",
    sourceClass: "model-family",
    prefix: "DIC4-Q",
    caseIds: ["DIC4-Q01", "DIC4-Q02", "DIC4-Q03", "DIC4-Q04", "DIC4-Q05", "DIC4-Q06"],
  },
] as const satisfies readonly SealedChallengeV4Half[];

/** The twelve ids in the one legal assembled order: half A, then half B. */
export const SEALED_CHALLENGE_V4_CASE_IDS: readonly string[] = SEALED_CHALLENGE_V4_HALVES.flatMap(
  (half) => [...half.caseIds],
);

/**
 * Who may not author half B, and why each entry is here.
 *
 * `OpenAI` and `Google` authored the two v3 halves; `Anthropic` authored every corpus before them
 * and is the lead. The rule is not that these families write badly — it is that a distribution
 * already represented in this programme's readable corpora cannot supply its strongest
 * generalization evidence, which is the finding v3 cost three corpora to establish.
 */
export const SEALED_CHALLENGE_V4_EXCLUDED_FAMILIES = ["OpenAI", "Anthropic", "Google"] as const;

/**
 * The chosen half-B family, recorded **before** commissioning — which is what happened here.
 *
 * It was `null` at the protocol freeze and is `"Mistral"` now, set while **no `DIC4` situation card
 * or case exists anywhere**. `git` carries that ordering rather than a comment: the freeze commit's
 * tree holds no card, and so does this one. A family named after seeing a case is a family selected
 * for its output, which is the whole reason this value has its own decision point.
 *
 * Mistral is eligible on the stated rule — it authored no corpus in this programme and is none of
 * the three excluded families — and that is the only claim being made. Nothing here says Mistral
 * writes better cases than the families it replaces.
 */
export const SEALED_CHALLENGE_V4_HALF_B_FAMILY: string | null = "Mistral";

/**
 * The exact authoring surface for half B, recorded **for provenance only** — and, since the
 * correction below, no longer for reproducibility. The difference is the whole comment.
 *
 * The original pin named the fixed snapshot `mistral-medium-3-5`, chosen precisely so that "which
 * model authored this corpus" would stay answerable. It could not be used: the precommitted
 * authoring surface, the Mistral Studio Playground, does not expose the fixed identifier in its
 * model picker. Only the alias is selectable, so the pin was corrected to the alias before half B
 * was commissioned and before any `DIC4-Q` card existed.
 *
 * **What that costs is stated rather than absorbed.** `mistral-medium-latest` is a *moving* alias.
 * Mistral's documentation on `2026-09-18` identifies it as Mistral Medium 3.5, and that dated
 * mapping plus the operator's attestation is now the entire basis for the model attribution — the
 * identifier itself guarantees nothing, because the same string may resolve to a different model
 * later. A reader a year from now cannot recover the authoring model from this record alone. That
 * is a real weakening of the property the original pin existed for, it is accepted because the
 * surface leaves no alternative, and pretending otherwise would be worse than the limitation.
 *
 * Attribution was already **user-supplied provenance** — nothing here can prove which model
 * produced a JSON file — and this correction widens that gap rather than creating it.
 */
export const SEALED_CHALLENGE_V4_HALF_B_MODEL = {
  family: "Mistral",
  model: "Mistral Medium 3.5",
  /** The Studio-exposed alias. **Moving**, not a snapshot — see the comment above. */
  modelId: "mistral-medium-latest",
  surface: "Mistral Studio Playground",
  /** The dated basis for reading that alias as Mistral Medium 3.5. */
  aliasResolvedFrom: "Mistral documentation, 2026-09-18",
  /** Stated in the data, so no reader has to infer it from prose. */
  identifierIsMoving: true,
} as const;

/**
 * The superseded pin, kept because a corrected record that hides its earlier state is worth less
 * than one that shows the correction.
 *
 * Nothing was observed from Mistral when this changed: half B was not commissioned, no `DIC4-Q`
 * card or case existed, and no authoring result had been seen. So this is a surface-availability
 * correction, not a choice made in response to output — which is the property that would have been
 * fatal, and is the reason the ordering is recorded rather than asserted.
 */
export const SEALED_CHALLENGE_V4_HALF_B_MODEL_PIN_HISTORY = [
  {
    modelId: "mistral-medium-3-5",
    recordedAt: "commit ca98f93",
    supersededAt: "2026-09-18",
    reason:
      "the precommitted Mistral Studio Playground surface does not expose the fixed identifier " +
      "in its model picker, so the snapshot id could not be selected. Superseded before half B " +
      "was commissioned and before any DIC4-Q card existed; no authoring result had been observed",
  },
] as const;

/**
 * What half B's authoring session may not use, and why the list is this shape.
 *
 * Every entry closes a route by which the session would stop being the thing the record claims:
 * selecting a different model makes the attribution false; automatic routing makes it unknowable;
 * an agent, connector, repository access, web search or uploaded file could reach the material the
 * author must never see; carried-over conversation context makes "fresh session" false. The seal is
 * not only about what an author is told — it is also about what it can go and find.
 *
 * The first entry used to forbid the moving alias outright. It cannot, now that the alias is the
 * only selectable identifier, so it forbids the thing still within anyone's control: choosing
 * something other than what the picker labels Mistral Medium 3.5. The risk the old entry guarded
 * against has not gone away — it has moved into `SEALED_CHALLENGE_V4_HALF_B_MODEL` as a stated
 * limitation, which is the honest place for a risk nobody can close.
 */
export const SEALED_CHALLENGE_V4_HALF_B_FORBIDDEN_AFFORDANCES = [
  "any model other than the one the Studio picker exposes as Mistral Medium 3.5",
  "Vibe automatic model routing",
  "an agent",
  "connectors",
  "repository access",
  "web search",
  "uploaded files",
  "prior conversation context",
] as const;

/** Is this family eligible to author half B at all? Case-insensitive on the family name. */
export function isEligibleHalfBFamily(family: string): boolean {
  const normalized = family.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return !SEALED_CHALLENGE_V4_EXCLUDED_FAMILIES.some((excluded) =>
    normalized.includes(excluded.toLowerCase()),
  );
}

/** Who the human author of half A may not be. Stated so the record says it, not to be parsed. */
export const SEALED_CHALLENGE_V4_HUMAN_AUTHOR_EXCLUSIONS = [
  "the user",
  "Claude or any model in this session",
  "any prior reviewer in this programme",
  "anyone who has seen this repository",
  "anyone who has seen a prior corpus, the v3 cases or any semantic-review finding",
  "anyone who has seen the DesignIntent prompt, provider or implementation",
] as const;

/** What neither v4 author may be shown, at either stage. */
export const SEALED_CHALLENGE_V4_WITHHELD_FROM_AUTHORS = [
  "the other author's situation cards or cases",
  "any prior corpus",
  "any invalidated corpus",
  "any v3 artifact, case or review",
  "any semantic-review finding",
  "the DesignIntent prompt",
  "provider code",
  "input assembly",
  "planner implementation",
  "validator implementation",
  "known model failures",
  "prior qualitative reviews",
  "§3.7 gate arithmetic",
  "the expected outcome",
  "any statement about what would produce GO",
  "any subject, genre or device to avoid",
] as const;

/* ------------------------------------------------------------------ stage 1: situation cards */

/**
 * What a situation card may carry. **The design vocabulary is absent on purpose**, and its absence
 * is the mechanism: an author who cannot name a palette cannot hand in a mood board, so the human
 * problem is fixed before anyone gets to solve a design problem.
 */
export const SITUATION_CARD_FIELDS = [
  "id",
  "eventType",
  "whoIsGathering",
  "whyItMatters",
  "context",
  "complication",
] as const;

/**
 * What a situation card may never carry. Stage 2 is where every one of these is authored, freely,
 * under the normal contract — the point is only that it happens *after* the situation is frozen.
 */
export const SITUATION_CARD_FORBIDDEN_FIELDS = [
  "palette or colours",
  "typography or fonts",
  "motifs",
  "texture",
  "visual style",
  "design family",
  "tonal direction",
  "layout",
  "composition",
  "mood-board references",
  "art or design movements",
  "material-finish language",
  "any proposed visual solution",
] as const;

export interface SituationCard {
  readonly id: string;
  /** A short lowercase label, compared for equality after folding — the same rule a case uses. */
  readonly eventType: string;
  readonly whoIsGathering: string;
  readonly whyItMatters: string;
  /** The specific activity, ritual, relationship or social context. */
  readonly context: string;
  /**
   * A concrete non-aesthetic human complication that materially matters to interpretation, or
   * `null` where the card honestly has none.
   *
   * Declared rather than detected. Whether a stated complication is genuine is an independent
   * reviewer's judgement; counting how many cards claim one is this module's whole share of that
   * question, and the split is deliberate.
   */
  readonly complication: string | null;
}

export const SITUATION_CARDS_PER_HALF = 6;
export const SITUATION_CARD_SAME_TYPE_PAIRS_PER_HALF = 1;
export const SITUATION_CARD_DISTINCT_TYPES_PER_HALF = 5;
/** At least four of six cards must carry a complication. §"situation-card quality floor". */
export const SITUATION_CARD_COMPLICATION_FLOOR = 4;

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const foldType = (value: string) =>
  value.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Unambiguous design tokens: a card containing one of these is carrying Stage 2 vocabulary.
 *
 * Deliberately short and deliberately unambiguous. A hex literal, a schema enum token or an
 * explicit typeface word cannot appear in an honest description of a human situation, so these can
 * gate. Everything vaguer — "warm", "bright", "paper", a venue that happens to be a paint factory —
 * is screened as advisory below and adjudicated by a person, because a card that says the host
 * works at a paint factory is a *good* card, and a checker that failed it would be the exact defect
 * this programme keeps re-inventing.
 */
const HARD_DESIGN_TOKENS: readonly RegExp[] = [
  /#[0-9a-f]{3,8}\b/i,
  /\b(?:serif|sans-serif|sans serif|typeface|font|typography|lettering|script face)\b/i,
  /\b(?:grotesk_led|high_contrast_editorial|soft_serif|oldstyle|transitional|heritage)\b/i,
  /\b(?:palette|colour palette|color palette|tonal direction|design family|mood ?board)\b/i,
];

/** Vaguer design language. Reported for a person to weigh; never a failure on its own. */
const ADVISORY_DESIGN_TERMS: readonly string[] = [
  "aesthetic",
  "art deco",
  "bauhaus",
  "brushed",
  "colour",
  "color",
  "elegant",
  "embossed",
  "gilded",
  "gold foil",
  "matte",
  "metallic",
  "minimalist",
  "modernist",
  "monochrome",
  "motif",
  "ornament",
  "pastel",
  "rustic",
  "texture",
  "vintage",
];

export interface SituationCardCheck {
  /** Problems that fail the half. Empty means the half conforms. */
  readonly problems: string[];
  /** Design language a person should look at. **Never** a failure by itself. */
  readonly advisory: string[];
}

/**
 * Every way a half's six situation cards break what was precommitted, plus an advisory screen.
 *
 * All the problems at once rather than the first: whoever has to act on this cannot run the
 * checker, and a finding travels to an external author through the user as one message.
 */
export function checkSituationCards(
  half: SealedChallengeV4Half,
  cards: readonly unknown[],
): SituationCardCheck {
  const problems: string[] = [];
  const advisory: string[] = [];
  const parsed = cards as readonly Partial<SituationCard>[];
  const where = `half ${half.slot}`;

  if (parsed.length !== SITUATION_CARDS_PER_HALF) {
    problems.push(
      `${where}: expected exactly ${SITUATION_CARDS_PER_HALF} situation cards, found ${parsed.length}`,
    );
  }

  const seen = new Set<string>();
  for (const [index, card] of parsed.entries()) {
    const label = nonEmptyString(card?.id) ? card.id : `${where} cards[${index}]`;

    if (!nonEmptyString(card?.id)) {
      problems.push(`${label}: \`id\` must be a non-empty string`);
    } else {
      if (seen.has(card.id)) problems.push(`${label}: duplicate \`id\``);
      seen.add(card.id);
      if (!half.caseIds.includes(card.id)) {
        problems.push(
          `${label}: outside the precommitted namespace ${half.caseIds[0]}–` +
            `${half.caseIds[half.caseIds.length - 1]}`,
        );
      }
    }

    for (const field of ["eventType", "whoIsGathering", "whyItMatters", "context"] as const) {
      if (!nonEmptyString(card?.[field])) {
        problems.push(`${label}: \`${field}\` must be a non-empty string`);
      }
    }
    if (card?.complication !== null && !nonEmptyString(card?.complication)) {
      problems.push(`${label}: \`complication\` must be a non-empty string or null`);
    }

    for (const key of Object.keys(card ?? {})) {
      if (!(SITUATION_CARD_FIELDS as readonly string[]).includes(key)) {
        problems.push(`${label}: \`${key}\` is not a situation-card field`);
      }
    }

    // Stage 2 vocabulary in a Stage 1 card. The card's own text only — a card is prose, and the
    // whole point of freezing it first is that this text cannot already be a design.
    const text = [
      card?.eventType,
      card?.whoIsGathering,
      card?.whyItMatters,
      card?.context,
      card?.complication,
    ]
      .filter(nonEmptyString)
      .join(" — ");
    for (const pattern of HARD_DESIGN_TOKENS) {
      const hit = pattern.exec(text);
      if (hit) problems.push(`${label}: carries design vocabulary ${JSON.stringify(hit[0])}`);
    }
    for (const term of ADVISORY_DESIGN_TERMS) {
      if (new RegExp(`\\b${term}\\b`, "i").test(text)) {
        advisory.push(`${label}: contains ${JSON.stringify(term)}`);
      }
    }
  }

  for (const expected of half.caseIds) {
    if (parsed.length > 0 && !seen.has(expected)) {
      problems.push(`${where}: missing precommitted \`id\` ${expected}`);
    }
  }

  // The composition rule, counted as a multiset: three cards sharing a type is as wrong as none.
  if (parsed.every((card) => nonEmptyString(card?.eventType))) {
    const types = new Map<string, number>();
    for (const card of parsed) {
      const key = foldType(card.eventType as string);
      types.set(key, (types.get(key) ?? 0) + 1);
    }
    const overloaded = [...types.entries()].filter(([, count]) => count > 2);
    const pairs = [...types.values()].filter((count) => count === 2).length;
    if (overloaded.length > 0) {
      problems.push(
        `${where}: \`eventType\` ${overloaded
          .map(([type, count]) => `${type} appears ${count} times`)
          .join(", ")}; the rule is exactly one pair and four distinct others`,
      );
    } else if (
      pairs !== SITUATION_CARD_SAME_TYPE_PAIRS_PER_HALF ||
      types.size !== SITUATION_CARD_DISTINCT_TYPES_PER_HALF
    ) {
      problems.push(
        `${where}: expected exactly ${SITUATION_CARD_SAME_TYPE_PAIRS_PER_HALF} same-\`eventType\` ` +
          `pair across ${SITUATION_CARD_DISTINCT_TYPES_PER_HALF} distinct types, found ${pairs} ` +
          `pair(s) across ${types.size} distinct types`,
      );
    }
  }

  const withComplication = parsed.filter((card) => nonEmptyString(card?.complication)).length;
  if (
    parsed.length === SITUATION_CARDS_PER_HALF &&
    withComplication < SITUATION_CARD_COMPLICATION_FLOOR
  ) {
    problems.push(
      `${where}: ${withComplication} of ${SITUATION_CARDS_PER_HALF} cards declare a complication; ` +
        `the floor is ${SITUATION_CARD_COMPLICATION_FLOOR}. Whether each one is genuine is the ` +
        "reviewer's, not this checker's",
    );
  }

  return { problems, advisory: [...new Set(advisory)] };
}

/* ------------------------------------------------------------------ stage 2 and assembly */

/**
 * Did Stage 2 keep faith with the frozen card?
 *
 * Only the two facts a checker can decide: the case exists for that card's id, and the event type
 * did not move. **Whether the identity still tells that card's story is a judgement**, it belongs
 * to the review that reads both, and this function deliberately stops short of pretending
 * otherwise — a similarity score over a premise is exactly the proxy that would let a drifted case
 * through with a passing number beside it.
 */
export function checkStage2Faithfulness(
  cards: readonly SituationCard[],
  cases: readonly { id?: unknown; eventType?: unknown }[],
): string[] {
  const problems: string[] = [];
  const byId = new Map(cases.filter((c) => nonEmptyString(c.id)).map((c) => [c.id as string, c]));

  for (const card of cards) {
    const testCase = byId.get(card.id);
    if (!testCase) {
      problems.push(`${card.id}: frozen situation card has no case`);
      continue;
    }
    if (
      !nonEmptyString(testCase.eventType) ||
      foldType(testCase.eventType) !== foldType(card.eventType)
    ) {
      problems.push(
        `${card.id}: \`eventType\` moved between stages — card said ${JSON.stringify(card.eventType)}, ` +
          `case says ${JSON.stringify(testCase.eventType)}`,
      );
    }
  }
  for (const testCase of cases) {
    if (nonEmptyString(testCase.id) && !cards.some((card) => card.id === testCase.id)) {
      problems.push(`${testCase.id}: case has no frozen situation card`);
    }
  }
  return problems;
}

/** Every way the assembled v4 corpus departs from what was precommitted here. */
export function checkAssembledSealedChallengeV4(parsed: unknown): string[] {
  const problems: string[] = [];
  const corpus = (parsed ?? {}) as { version?: unknown; cases?: unknown };

  if (corpus.version !== SEALED_CHALLENGE_V4_VERSION) {
    problems.push(
      `top-level \`version\` must be \`${SEALED_CHALLENGE_V4_VERSION}\`, found ${JSON.stringify(corpus.version)}`,
    );
  }
  if (!Array.isArray(corpus.cases)) {
    problems.push("`cases` must be an array");
    return problems;
  }
  const ids = (corpus.cases as { id?: unknown }[]).map((c) =>
    nonEmptyString(c?.id) ? c.id : null,
  );
  if (
    ids.length !== SEALED_CHALLENGE_V4_CASE_IDS.length ||
    ids.some((id, index) => id !== SEALED_CHALLENGE_V4_CASE_IDS[index])
  ) {
    problems.push(
      "`cases` must be exactly the precommitted twelve ids in the declared assembly order " +
        `(${SEALED_CHALLENGE_V4_CASE_IDS.join(", ")}), found ` +
        `(${ids.map((id) => id ?? "<missing>").join(", ")})`,
    );
  }
  return problems;
}
