/**
 * The Phase 4C gate, frozen as data — `docs/phase-4b-plan.md §3.7`, Part IV **T19**.
 *
 * `§3.7`: *"Both halves are frozen in canon at T19 — before any corpus is authored and before any
 * DesignIntent prompt is written. Moving either after results voids the gate."* This module is
 * that freeze in executable form: the four bands, `Excellent`'s six additional requirements, the
 * minimum-wowable question and its five criteria, S1–S9, the two class thresholds, the sealed
 * corpus size and its same-type composition requirement, the reviewer's products, and one pure
 * function that applies the rule to what a reviewer returned.
 *
 * ## Why the text is copied verbatim rather than paraphrased
 *
 * Two copies of a rule that can drift apart is the defect a freeze exists to prevent, and a
 * paraphrase drifts silently — nothing fails when a summary softens. So every definitional string
 * below is the plan's own bytes, whitespace-normalised and nothing else, and
 * `design-intent.test.ts` reads `docs/phase-4b-plan.md` and fails if any of them is no longer
 * found there. The plan stays the one normative copy; this is a transcription that cannot lie
 * about what it transcribes.
 *
 * ## What this module is not
 *
 * It computes nothing about creative quality. `§3.7`: *"This judgement is **qualitative and stays
 * qualitative**. There is no numerical wow score, no embedding distance standing in for delight,
 * and no deterministic metric may be introduced later and called this."* Everything here operates
 * on judgements a human-equivalent independent reviewer has already made. The arithmetic is the
 * only thing automated, and `§3.8` is explicit that the arithmetic happens **outside** the blind
 * review — which is exactly why it lives in a function the reviewer never sees.
 *
 * Acceptance criteria: N/A — benchmark integrity and gate provenance. `spec.md §11.9` discipline;
 * `docs/model-contracts.md §4.7`; `docs/phase-4b-plan.md §3.7`, `§3.8`, Part IV T19.
 */

/* ------------------------------------------------------------------ corpus size and composition */

/**
 * `§3.7`: *"**The sealed corpus is twelve batches**, matching the 4A precedent, frozen at T19
 * before the corpus is authored so it cannot be chosen to suit a result."*
 *
 * A distribution rule without `N` is not a rule: with four batches, `E=2, G=1, B=1` passes and
 * "at least two batches" is half the evidence.
 */
export const SEALED_CORPUS_BATCHES = 12;

/** `§3.7`'s composition requirement on the corpus author, in the plan's own words. */
export const SAME_EVENT_TYPE_PAIR_MINIMUM = 2;

export const CORPUS_COMPOSITION_REQUIREMENT =
  "**And it must contain at least two pairs of batches sharing an event type with materially " +
  "different identities.** Twelve distinct event types would leave §3.2's same-type measurement " +
  "with nothing to compare and S8's same-type clause unevidenced — the gate would carry a " +
  "category no run could ever fire. This is a requirement on the corpus author, frozen with the " +
  "rest, and it is the kind of thing that is free now and impossible after T19 without voiding " +
  "the gate.";

/* ------------------------------------------------------------------ half one — the four bands */

export type BandId = "Excellent" | "Good" | "Borderline" | "Fail";

/** The four bands in descending order, which is also the order `§3.7`'s table lists them. */
export const BAND_IDS: readonly BandId[] = ["Excellent", "Good", "Borderline", "Fail"];

export interface BandDefinition {
  readonly band: BandId;
  /** The plan's table row, verbatim. The normative text. */
  readonly definition: string;
  /**
   * What the reviewer packet is allowed to show.
   *
   * Always a **prefix** of `definition`, never a rewrite: `§3.8` withholds "that `Good` does not
   * pass", and `Good`'s row ends with exactly that clause. Truncating a prefix cannot introduce a
   * claim the plan does not make, which a paraphrase could; `design-intent.test.ts` holds every
   * band to the prefix property so this can never become a second, softer definition.
   */
  readonly reviewerFacing: string;
}

const EXCELLENT_DEFINITION =
  "Three distinct creative worlds, each rooted in *this* event, each suggesting a different " +
  "experience rather than a different look. A designer handed any one of them would know what to " +
  "build, and would not confuse it with the other two. Nothing fabricated, nothing generic. " +
  "**And all six of the minimum-wowable requirements below.**";

const GOOD_DEFINITION_REVIEWER_FACING =
  "Three genuinely different directions, faithful, polished and usable, but one or more is " +
  "thinner, more expected, more generic or less emotionally and verbally resolved than the " +
  "minimum-wowable standard — a look rather than a world, or a world whose verbal identity does " +
  "not carry its visual idea. No correctness defect.";

/** The withheld clause. Split out so the packet's omission is structural, not a hand-edit. */
const GOOD_DEFINITION_ARITHMETIC = " **`Good` is a diagnosis, not a pass**";

const BORDERLINE_DEFINITION =
  "The three are faithful and defensible, but the distinctness is largely parametric, or one " +
  "sibling is a weak variant of another, or the set reads as competent premium work that this " +
  "event did not specifically ask for. No correctness defect";

const FAIL_DEFINITION =
  "Any correctness defect — an invented host fact, a `creativeGuidance` recommendation promoted " +
  "to host law, a `hostConstraint` eroded or contradicted — **or** siblings that are not " +
  "materially different directions at all";

export const DESIGN_INTENT_BANDS: readonly BandDefinition[] = [
  {
    band: "Excellent",
    definition: EXCELLENT_DEFINITION,
    reviewerFacing: EXCELLENT_DEFINITION,
  },
  {
    band: "Good",
    definition: GOOD_DEFINITION_REVIEWER_FACING + GOOD_DEFINITION_ARITHMETIC,
    reviewerFacing: GOOD_DEFINITION_REVIEWER_FACING,
  },
  {
    band: "Borderline",
    definition: BORDERLINE_DEFINITION,
    reviewerFacing: BORDERLINE_DEFINITION,
  },
  { band: "Fail", definition: FAIL_DEFINITION, reviewerFacing: FAIL_DEFINITION },
];

/**
 * `§3.7`: *"An `Excellent` batch satisfies everything in its row **and** all six of"* these.
 *
 * The band is the product bar, not "strong professional work" — and the plan is equally explicit
 * about what it is not asking for: *"This is not a demand for fabrication, theatricality,
 * maximalism or novelty for its own sake."*
 */
export const EXCELLENT_REQUIREMENTS: readonly string[] = [
  "the set feels unmistakably authored for *this* event and identity, not merely appropriate to " +
    "the event type;",
  "the directions demonstrate **interpretation**, not just application of tasteful design " +
    "vocabulary;",
  "the creative ideas contain memorable, grounded choices that are not the obvious premium " +
    "defaults;",
  "the host-facing verbal identity is as specific as the visual direction;",
  "none of the three siblings is filler, a safe third option, or a weaker version included only " +
    "to complete the set;",
  'the batch as a whole is specific, perceptive and memorable enough that a reasonable host could plausibly react with *"it got me"* rather than *"these are nice"*.',
];

/** The caveat that travels with the six, so "wowable" is never read as "theatrical". */
export const EXCELLENT_IS_NOT_A_DEMAND_FOR_NOVELTY =
  "**This is not a demand for fabrication, theatricality, maximalism or novelty for its own " +
  "sake.** Wow comes from accurate interpretation and creative specificity, and a restrained " +
  "event is wowable through precision and insight. A batch that manufactures drama an identity " +
  "does not support fails `Fail`'s correctness clause and S6, not passes this one.";

/**
 * The distribution rule itself. Reviewer-withheld (`§3.8`), and not tunable (`spec.md §11.9`).
 *
 * `§3.7`: *"If a sealed challenge returns 11 `Excellent` and 1 `Good`, that is evidence the system
 * did not meet the frozen bar. … We do not move the threshold, average the bands, introduce a
 * score, or discover that one `Good` was really an `Excellent` after all."*
 */
export const DISTRIBUTION_RULE =
  "**12 / 12 `Excellent`. No `Good`, no `Borderline`, no `Fail`. And 12 / 12 minimum-wowable " +
  "`YES` (below). Any batch below `Excellent`, or any minimum-wowable `NO`, is a NO-GO.**";

/* ------------------------------------------- half one-and-a-half — the minimum-wowable judgement */

export const MINIMUM_WOWABLE_QUESTION =
  "**Does this batch clear the minimum-wowable bar — is it specific, perceptive and creatively " +
  'memorable enough that the host could plausibly feel *"it understood me"* and want to show the ' +
  'result to someone, rather than simply thinking *"this is polished"* or *"this is nice"*?**';

export const MINIMUM_WOWABLE_ANSWER_INSTRUCTION =
  "Answer **YES** or **NO**, and cite the specific text that decided it.";

export const MINIMUM_WOWABLE_REQUIRES_ALL_FIVE =
  "**`YES` requires all five**, and the reviewer states which, if any, is missing:";

export type MinimumWowableCriterionId = 1 | 2 | 3 | 4 | 5;

export interface MinimumWowableCriterion {
  readonly id: MinimumWowableCriterionId;
  readonly criterion: string;
}

export const MINIMUM_WOWABLE_CRITERIA: readonly MinimumWowableCriterion[] = [
  {
    id: 1,
    criterion:
      "**Event-specific understanding** — the concepts clearly arise from *this* identity rather " +
      "than from a generic event of the same type",
  },
  {
    id: 2,
    criterion:
      "**Creative leap** — grounded, non-obvious creative thinking, rather than only translating " +
      "the identity's adjectives into palette, type and motif choices",
  },
  {
    id: 3,
    criterion:
      "**No passenger concept** — none of the three exists as safe filler or a weak variant of " +
      "another",
  },
  {
    id: 4,
    criterion:
      "**Memorable verbal identity** — the `presentation` name and description carry *this* " +
      "concept, rather than reading as language reusable across unrelated events",
  },
  {
    id: 5,
    criterion:
      '**Plausible share impulse** — the set has enough specificity and character that *"I need ' +
      'to show someone"* is a plausible reaction',
  },
];

/**
 * `§3.7`, and the reason no later task may quietly satisfy this with a metric.
 *
 * Kept as a constant rather than only as prose so that a change to it is a change to a frozen
 * artifact, visible in the freeze test, rather than an edit to a comment nobody diffs.
 */
export const MINIMUM_WOWABLE_STAYS_QUALITATIVE =
  "This judgement is **qualitative and stays qualitative**. There is no numerical wow score, no " +
  "embedding distance standing in for delight, and no deterministic metric may be introduced " +
  "later and called this. §3.2's mechanical block measures what is decidable; this measures what " +
  "is not, which is precisely why a human-equivalent independent reviewer answers it.";

/** The non-interchangeability rule, which `decideDesignIntentGate` encodes in both directions. */
export const BAND_AND_WOWABLE_NOT_INTERCHANGEABLE =
  "The band and the minimum-wowable answer are **both required and are not interchangeable**. A " +
  "batch rated `Excellent` with minimum-wowable `NO` is a NO-GO, and so is a batch rated `Good` " +
  "with minimum-wowable `YES`. Where they disagree, that disagreement is itself a finding the " +
  "go/no-go records verbatim rather than resolving in favour of the more convenient one.";

/* ------------------------------------------------------------------ half two — the systemic veto */

export type SystemicCategoryId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9";

export interface SystemicCategory {
  readonly id: SystemicCategoryId;
  readonly pattern: string;
}

export const SYSTEMIC_CATEGORIES: readonly SystemicCategory[] = [
  {
    id: "S1",
    pattern: "siblings collapsing into one recognisable house style despite different assignments",
  },
  {
    id: "S2",
    pattern: '"three concepts" that are parameter variants rather than different creative worlds',
  },
  { id: "S3", pattern: "`creativeGuidance` promoted into host law" },
  { id: "S4", pattern: "host constraints eroded or contradicted" },
  { id: "S5", pattern: "generic-premium treatment overwhelming event-specific personality" },
  {
    id: "S6",
    pattern:
      "unsupported emotional moderation / anti-sentimentality / anti-theatricality across siblings",
  },
  {
    id: "S7",
    pattern:
      "another recurring pattern that directly defeats the core 4C question — **which the " +
      "reviewer must name and define in the same terms as the others**",
  },
  {
    id: "S8",
    pattern:
      '**the same creative worlds recurring across events — including across different instances of the same event type.** Organizing idea, palette family, typographic voice, motif set, finishing language or `presentation` voice repeating from batch to batch, whether the batches share an event type or not. S1 and S2 are both *within*-batch; without S8 a system producing three excellent, genuinely distinct worlds and roughly the *same* three every time passes every category and every within-batch metric. **The same-type clause is not a refinement, it is the case that matters:** a system with a "quinceañera set" and a "christening set" that differ from each other and barely differ within a type is a template gallery at the granularity a template gallery actually has, and a reviewer reading S8 as *different* event types only would decline it because the worlds do track the event. §3.2\'s corpus-wide block gives the reviewer evidence for both readings',
  },
  {
    id: "S9",
    pattern:
      '**safe competence — no creative leap.** Across batches, the outputs are faithful, distinct and professionally attractive, and they repeatedly stop at tasteful obviousness: competent premium work without a memorable, event-specific organizing idea or a perceptive creative leap. **This is the failure mode the minimum-wowable bar exists to reject, and none of the other eight catches it.** It is not S2, which is parameter variants *within* a batch — an S9 system produces three genuinely different directions. It is not S5, where generic-premium treatment overwhelms event personality — an S9 system does adapt to each event, visibly and correctly. It is not S8, where the same worlds recur — an S9 system\'s worlds differ from event to event. S9 is the system that gets everything right and is still only *nice*: it adapts, it separates, it stays faithful, and it never risks the specific, memorable choice that would make a host want to show someone. A batch rated `Excellent` cannot exhibit S9; a corpus of batches rated `Good` for the same reason almost certainly does, and the reviewer should reach for this category when their own per-batch prose keeps saying some version of *"polished, but I have seen this"*',
  },
];

export const SYSTEMIC_CATEGORY_IDS: readonly SystemicCategoryId[] = SYSTEMIC_CATEGORIES.map(
  (category) => category.id,
);

/** The category that obliges the reviewer to supply its own name and definition. */
export const NAMED_BY_REVIEWER_CATEGORY: SystemicCategoryId = "S7";

export type SystemicClassId = "correctness" | "taste/convergence";

export interface SystemicClass {
  readonly id: SystemicClassId;
  readonly categories: readonly SystemicCategoryId[];
  /** Batches the pattern must be present in, with citations, before it is systemic. */
  readonly thresholdBatches: number;
  readonly why: string;
}

/**
 * `§3.7`: *"The threshold differs by class, because the categories are not the same kind of
 * thing."*
 */
export const SYSTEMIC_CLASSES: readonly SystemicClass[] = [
  {
    id: "correctness",
    categories: ["S3", "S4"],
    thresholdBatches: 1,
    why:
      "**one batch.** These are the failure `v4` already paid for; an 8% rate of fabricated host " +
      "authority is not a quality wobble, and any occurrence also forces that batch to `Fail` " +
      "under §3.7's band definitions",
  },
  {
    id: "taste/convergence",
    categories: ["S1", "S2", "S5", "S6", "S7", "S8", "S9"],
    thresholdBatches: 2,
    why: "**two batches**",
  },
];

/** The per-category threshold, derived from the classes so the two can never disagree. */
export const SYSTEMIC_THRESHOLD_BATCHES: Readonly<Record<SystemicCategoryId, number>> =
  Object.freeze(
    Object.fromEntries(
      SYSTEMIC_CLASSES.flatMap((klass) =>
        klass.categories.map((category) => [category, klass.thresholdBatches]),
      ),
    ) as Record<SystemicCategoryId, number>,
  );

export const SYSTEMIC_CLASS_OF: Readonly<Record<SystemicCategoryId, SystemicClassId>> =
  Object.freeze(
    Object.fromEntries(
      SYSTEMIC_CLASSES.flatMap((klass) => klass.categories.map((category) => [category, klass.id])),
    ) as Record<SystemicCategoryId, SystemicClassId>,
  );

/**
 * `§3.7`'s four conditions for a pattern to count as systemic, verbatim.
 *
 * Conditions 1–3 are checkable from what the reviewer returned and `decideDesignIntentGate`
 * checks them. Condition 4 is a judgement — and the plan says why the reviewer must be *able* to
 * make it: *"which is why §3.8 gives them the identity alongside the three DesignIntents. A
 * condition the blinding makes unanswerable would let every veto be declined on it."*
 */
export const SYSTEMIC_EVIDENCE_REQUIREMENTS: readonly string[] = [
  "finds it present in **at least the threshold number of batches for its class** (below);",
  "cites **each batch by id and at least one specific sibling within it**;",
  "quotes the **specific output text** that exhibits it;",
  "judges it a property of the system's output rather than an artefact of one unusual input — a " +
    "judgement they must be *able* to make, which is why §3.8 gives them the identity alongside " +
    "the three DesignIntents. A condition the blinding makes unanswerable would let every veto be " +
    "declined on it.",
];

/* ------------------------------------------------------------------ the reviewer's contract */

/** `§3.7`: what the reviewer produces. Rendered into the packet by `design-intent-evidence.ts`. */
export const REVIEWER_PRODUCTS: readonly string[] = [
  "**per-batch ratings** on the four bands, with reasons;",
  "**a per-batch minimum-wowable `YES`/`NO`**, with the deciding text cited and, on a `NO`, which " +
    "of the five criteria is missing;",
  "**an explicit cross-batch systemic assessment**, answering **every** category S1–S9 as " +
    "present/absent with citations — including the absent ones, so the veto is a checklist " +
    "completed in every review rather than a finding volunteered only sometimes.",
];

/**
 * `§3.8`: what the packet must **not** carry. Asserted against the rendered packet by test.
 *
 * The reviewer necessarily learns the corpus size by rating every batch; what is withheld is the
 * *rule applied to it*.
 */
export const REVIEWER_WITHHELD: readonly string[] = [
  "the distribution rule",
  "the systemic thresholds",
  "how many `Excellent`s a GO needs",
  "that `Good` does not pass",
  "any expected outcome",
  "any prior review",
  "anything about what this project hopes the answer is",
  "not `model-contracts.md` and not this document",
];

/**
 * `§3.4`'s three evidence classes, labelled so one can never be read as another.
 *
 * The 4C sets in `corpus.ts` carry these ids, and `design-intent.test.ts` holds each set's label
 * to the class it claims. The single most expensive mistake available here is reading a rerun of
 * known cases as generalization evidence — 4A made a version of it, and the labels are what stop
 * it being made silently.
 */
export type EvidenceClassId = "regression" | "pre-registered validation" | "sealed challenge";

export interface EvidenceClass {
  readonly id: EvidenceClassId;
  readonly whenAuthored: string;
  readonly supports: string;
}

export const EVIDENCE_CLASSES: readonly EvidenceClass[] = [
  {
    id: "regression",
    whenAuthored: "before implementation; may be read freely",
    supports: "catching regressions, forever",
  },
  {
    id: "pre-registered validation",
    whenAuthored:
      "authored and frozen **before** the prompt is written, independently reviewed for fairness",
    supports: "validation against pre-registered invariants; **not** generalization",
  },
  {
    id: "sealed challenge",
    whenAuthored:
      "authored **after** the implementation and harness freeze, by someone who has seen neither " +
      "the prompt nor prior outputs nor known failures",
    supports: "generalization. **One run, then spent**",
  },
];

/* ------------------------------------------------------------------ what a reviewer returns */

export type MinimumWowableAnswer = "YES" | "NO";

/** One citation: a batch, a sibling inside it, and the output text that exhibits the pattern. */
export interface SystemicCitation {
  readonly batchId: string;
  /** `§3.7` condition 2: "at least one specific sibling within it". */
  readonly sibling: string;
  /** `§3.7` condition 3: the quoted output text. */
  readonly quotedText: string;
}

export interface ReviewerBatchJudgement {
  readonly batchId: string;
  readonly band: BandId;
  readonly reasons: string;
  readonly minimumWowable: MinimumWowableAnswer;
  /** The text that decided the minimum-wowable answer. Required in both directions. */
  readonly decidingText: string;
  /** On a `NO`, which of the five criteria is missing. Empty on a `YES`. */
  readonly missingCriteria: readonly MinimumWowableCriterionId[];
}

export interface ReviewerSystemicAssessment {
  readonly category: SystemicCategoryId;
  readonly verdict: "present" | "absent";
  readonly citations: readonly SystemicCitation[];
  /** S7 only: the reviewer names and defines it "in the same terms as the others". */
  readonly name?: string;
  readonly definition?: string;
}

export interface ReviewerReturn {
  readonly batches: readonly ReviewerBatchJudgement[];
  readonly systemic: readonly ReviewerSystemicAssessment[];
  readonly prose: string;
  /**
   * The go/no-go author's completeness duty (`§3.7`), which no protocol can compute.
   *
   * *"if the reviewer's prose describes a cross-batch pattern that is not filed under any of
   * S1–S9, the review is returned for that pattern to be filed or explicitly declined, before any
   * decision is recorded."* So the author states, explicitly, whether the prose left such a
   * pattern unfiled. `null` means they read the prose and found none; a string names the pattern
   * and blocks the decision from being recorded until the review comes back.
   *
   * It is required rather than optional-by-default: a field the author may forget is a duty the
   * artifact does not carry.
   */
  readonly unfiledCrossBatchPattern: string | null;
}

/* ------------------------------------------------------------------ the decision */

/**
 * A reason the gate did **not** pass. Every one of these makes the decision a NO-GO.
 *
 * Deliberately not the same list as `GateFindingKind` below. A thing the reviewer observed and a
 * thing that fails the gate are different, and collapsing them is what made the systemic thresholds
 * decorative in the first draft of this module.
 */
export type GateReasonKind =
  | "band_below_excellent"
  | "minimum_wowable_no"
  | "band_wowable_disagreement"
  | "systemic_veto"
  | "review_incomplete";

export interface GateReason {
  readonly kind: GateReasonKind;
  readonly detail: string;
  readonly batchIds?: readonly string[];
  readonly categories?: readonly SystemicCategoryId[];
  readonly criteria?: readonly MinimumWowableCriterionId[];
}

/**
 * Something the decision records without it being a reason to fail.
 *
 * `§3.7`: *"A category the reviewer marks present while citing fewer distinct batches than its
 * class threshold is a **recorded finding, not a veto**: it stays in the decision artifact with its
 * citations intact, and it does not on its own fail the gate. That is what the threshold is for."*
 *
 * A finding is never hidden, never relabelled absent, and never loses its citations. It simply is
 * not arithmetic. The per-batch layer is what catches a single weak batch — twelve of twelve
 * `Excellent` and twelve of twelve minimum-wowable `YES` — and the systemic layer exists to catch
 * **recurrence** that the per-batch layer may not expose.
 */
export type GateFindingKind = "systemic_present_below_threshold" | "correctness_band_contradiction";

export interface GateFinding {
  readonly kind: GateFindingKind;
  readonly detail: string;
  readonly batchIds?: readonly string[];
  readonly categories?: readonly SystemicCategoryId[];
}

export interface SystemicVerdict {
  readonly category: SystemicCategoryId;
  readonly class: SystemicClassId;
  readonly verdict: "present" | "absent";
  readonly citedBatches: readonly string[];
  readonly thresholdBatches: number;
  /** Condition 1 of `§3.7`'s four: enough distinct batches cited to be systemic. */
  readonly meetsThreshold: boolean;
}

/** A band and a minimum-wowable answer that point opposite ways, recorded verbatim. */
export interface BandWowableDisagreement {
  readonly batchId: string;
  readonly band: BandId;
  readonly minimumWowable: MinimumWowableAnswer;
  readonly reasons: string;
  readonly decidingText: string;
}

export interface GateDecision {
  readonly decision: "GO" | "NO-GO";
  /** Every reason the gate failed. Empty exactly when the decision is `GO`. */
  readonly reasons: readonly GateReason[];
  /**
   * What the review surfaced that is not, by itself, a reason to fail.
   *
   * Present on a `GO` as well as a `NO-GO`: a below-threshold systemic observation is evidence the
   * next round should carry forward, and dropping it because the gate passed would lose exactly
   * the signal a threshold exists to grade.
   */
  readonly findings: readonly GateFinding[];
  readonly bandDistribution: Readonly<Record<BandId, number>>;
  readonly minimumWowableTally: Readonly<Record<MinimumWowableAnswer, number>>;
  readonly systemic: readonly SystemicVerdict[];
  readonly disagreements: readonly BandWowableDisagreement[];
  /** True when every category was assessed and every per-batch answer is complete. */
  readonly reviewComplete: boolean;
  /**
   * `§3.7`'s completeness duty: the review must go back before a decision is recorded.
   *
   * A `NO-GO` carrying this flag is not a recorded decision — it is the arithmetic saying the
   * review is not yet in a state anyone may record a decision from. It is never `true` beside a
   * `GO`, because an incomplete review cannot evidence a pass.
   */
  readonly mustReturnToReviewer: boolean;
}

const countBy = <T extends string>(keys: readonly T[], values: readonly T[]) =>
  Object.fromEntries(
    keys.map((key) => [key, values.filter((value) => value === key).length]),
  ) as Record<T, number>;

/**
 * Apply `§3.7`'s frozen rule to what the reviewer returned. Pure, total, and never a judgement.
 *
 * **GO requires all three**, and `§3.7` says no half rescues another: *"an excellent distribution
 * does not override a veto, an absent veto does not rescue a failing distribution, and neither
 * rescues a minimum-wowable `NO`."*
 *
 * 1. `SEALED_CORPUS_BATCHES` batches, each rated **`Excellent`**;
 * 2. every batch minimum-wowable **`YES`**;
 * 3. every one of S1–S9 explicitly assessed, with **none of them meeting its frozen threshold**.
 *
 * Anything else is a NO-GO and the reasons say which batches, which categories and which criteria.
 *
 * Two subtleties worth stating rather than leaving to be read out of the code.
 *
 * **A category marked `present` fails the gate only when it meets its class threshold.** `§3.7`:
 * *"A GO requires all nine categories explicitly assessed and none of them meeting its frozen
 * threshold — not that every one was found absent."* A present category citing fewer distinct
 * batches than its threshold is a **finding**, recorded with its citations and not counted as
 * arithmetic — because otherwise the numbers in the class table would decide nothing, and an
 * isolated observation and a recurring pattern are different things. S3 and S4 have a threshold of
 * one, so a single qualifying batch still vetoes; the taste and convergence categories need two.
 *
 * **An incomplete review is a NO-GO and additionally must go back.** A missing category, a band
 * rating with no reasons, a `NO` with no criterion named, a `YES` that nonetheless names a missing
 * criterion, an S7 present without the reviewer's own name and definition, a citation missing its
 * batch id, its sibling or its quoted text, a duplicated batch, or an unfiled cross-batch pattern
 * all mean the artifact does not yet support a recorded decision. Returning `GO` on any of them
 * would be the gate passing on evidence that is not there.
 */
export function decideDesignIntentGate(review: ReviewerReturn): GateDecision {
  const reasons: GateReason[] = [];
  const findings: GateFinding[] = [];
  const incomplete: string[] = [];

  const batches = review.batches ?? [];
  const seen = new Set<string>();
  for (const batch of batches) {
    if (!batch.batchId || batch.batchId.trim().length === 0) {
      incomplete.push("a batch judgement carries no batch id");
    } else if (seen.has(batch.batchId)) {
      incomplete.push(`batch ${batch.batchId} is judged more than once`);
    } else {
      seen.add(batch.batchId);
    }
    if (!BAND_IDS.includes(batch.band)) {
      incomplete.push(`batch ${batch.batchId}: ${String(batch.band)} is not one of the four bands`);
    }
    if (!batch.reasons || batch.reasons.trim().length === 0) {
      // `§3.7` asks for "per-batch ratings on the four bands, **with reasons**". A band with no
      // reasons is a label, and a NO-GO built on labels is not actionable — which is the whole
      // argument for keeping `Good` as a diagnosis.
      incomplete.push(`batch ${batch.batchId}: the band rating carries no reasons`);
    }
    if (batch.minimumWowable !== "YES" && batch.minimumWowable !== "NO") {
      incomplete.push(`batch ${batch.batchId}: the minimum-wowable answer is not YES or NO`);
    }
    if (!batch.decidingText || batch.decidingText.trim().length === 0) {
      // Required in both directions: `§3.7` asks for the deciding text cited, not only on a NO.
      incomplete.push(`batch ${batch.batchId}: the minimum-wowable answer cites no deciding text`);
    }
    if (batch.minimumWowable === "NO" && (batch.missingCriteria ?? []).length === 0) {
      incomplete.push(
        `batch ${batch.batchId}: a minimum-wowable NO must name which of the five criteria is missing`,
      );
    }
    if (batch.minimumWowable === "YES" && (batch.missingCriteria ?? []).length > 0) {
      // `YES` requires all five. Naming one as missing contradicts the answer beside it, and the
      // contradiction has to surface rather than be resolved by whichever field is read first.
      incomplete.push(
        `batch ${batch.batchId}: a minimum-wowable YES names criterion ` +
          `${[...(batch.missingCriteria ?? [])].sort((a, b) => a - b).join(", ")} as missing, and ` +
          "YES requires all five",
      );
    }
  }

  if (batches.length !== SEALED_CORPUS_BATCHES) {
    incomplete.push(
      `the gate is defined over ${SEALED_CORPUS_BATCHES} batches; the review returned ${batches.length}`,
    );
  }

  const bandDistribution = countBy(
    BAND_IDS,
    batches.map((batch) => batch.band),
  );
  const minimumWowableTally = countBy(
    ["YES", "NO"] as const,
    batches.map((batch) => batch.minimumWowable),
  );

  const belowExcellent = batches.filter((batch) => batch.band !== "Excellent");
  if (belowExcellent.length > 0) {
    reasons.push({
      kind: "band_below_excellent",
      detail:
        `${belowExcellent.length} batch(es) below \`Excellent\`: ` +
        belowExcellent.map((batch) => `${batch.batchId}=${batch.band}`).join(", ") +
        ". §3.7: any batch below `Excellent` is a NO-GO, and `Good` is a diagnosis, not a pass.",
      batchIds: belowExcellent.map((batch) => batch.batchId),
    });
  }

  const wowableNo = batches.filter((batch) => batch.minimumWowable === "NO");
  if (wowableNo.length > 0) {
    reasons.push({
      kind: "minimum_wowable_no",
      detail:
        `${wowableNo.length} batch(es) answered minimum-wowable NO: ` +
        wowableNo
          .map(
            (batch) =>
              `${batch.batchId} (missing criteria ${[...(batch.missingCriteria ?? [])]
                .sort((a, b) => a - b)
                .join(", ")})`,
          )
          .join("; "),
      batchIds: wowableNo.map((batch) => batch.batchId),
      criteria: [...new Set(wowableNo.flatMap((batch) => batch.missingCriteria ?? []))].sort(
        (a, b) => a - b,
      ),
    });
  }

  // Recorded verbatim, never resolved. Both directions are already NO-GO above; this exists so
  // the record shows *that they disagreed*, which §3.7 calls a finding in its own right.
  const disagreements: BandWowableDisagreement[] = batches
    .filter(
      (batch) =>
        (batch.band === "Excellent" && batch.minimumWowable === "NO") ||
        (batch.band !== "Excellent" && batch.minimumWowable === "YES"),
    )
    .map((batch) => ({
      batchId: batch.batchId,
      band: batch.band,
      minimumWowable: batch.minimumWowable,
      reasons: batch.reasons,
      decidingText: batch.decidingText,
    }));
  if (disagreements.length > 0) {
    reasons.push({
      kind: "band_wowable_disagreement",
      detail:
        "the band and the minimum-wowable answer disagree on " +
        disagreements.map((d) => `${d.batchId} (${d.band} + ${d.minimumWowable})`).join(", ") +
        ". §3.7: both are required and they are not interchangeable; the disagreement is recorded " +
        "verbatim rather than resolved in favour of the more convenient one.",
      batchIds: disagreements.map((d) => d.batchId),
    });
  }

  /* --- the systemic checklist ------------------------------------------------------------- */

  const assessed = new Map<SystemicCategoryId, ReviewerSystemicAssessment>();
  for (const assessment of review.systemic ?? []) {
    if (!SYSTEMIC_CATEGORY_IDS.includes(assessment.category)) {
      incomplete.push(`${String(assessment.category)} is not one of S1–S9`);
      continue;
    }
    if (assessed.has(assessment.category)) {
      incomplete.push(`${assessment.category} is assessed more than once`);
      continue;
    }
    assessed.set(assessment.category, assessment);
  }

  const systemic: SystemicVerdict[] = [];
  const vetoed: SystemicCategoryId[] = [];
  const presentBelowThreshold: SystemicCategoryId[] = [];

  for (const category of SYSTEMIC_CATEGORY_IDS) {
    const assessment = assessed.get(category);
    const thresholdBatches = SYSTEMIC_THRESHOLD_BATCHES[category];
    if (assessment === undefined) {
      // `§3.7`: the checklist is "completed in every review rather than a finding volunteered only
      // sometimes". An unanswered category is not an absent one.
      incomplete.push(
        `${category} was not assessed; every category must be answered present/absent`,
      );
      systemic.push({
        category,
        class: SYSTEMIC_CLASS_OF[category],
        verdict: "absent",
        citedBatches: [],
        thresholdBatches,
        meetsThreshold: false,
      });
      continue;
    }
    if (assessment.verdict !== "present" && assessment.verdict !== "absent") {
      incomplete.push(`${category}: the verdict is neither present nor absent`);
    }

    const citations = assessment.citations ?? [];
    const citedBatches = [...new Set(citations.map((citation) => citation.batchId))].filter(
      (batchId) => batchId && batchId.trim().length > 0,
    );
    const present = assessment.verdict === "present";

    if (present) {
      for (const citation of citations) {
        if (!citation.batchId || citation.batchId.trim().length === 0) {
          // The threshold counts distinct cited batch ids, so an unattributed citation silently
          // lowers the count that decides whether this is a veto. It has to be visible, not
          // quietly dropped by the filter above.
          incomplete.push(
            `${category}: a citation names no batch, and §3.7 requires each batch by id`,
          );
        }
        if (!citation.sibling || citation.sibling.trim().length === 0) {
          incomplete.push(
            `${category}: a citation names no sibling, and §3.7 requires each batch by id and at ` +
              "least one specific sibling within it",
          );
        }
        if (!citation.quotedText || citation.quotedText.trim().length === 0) {
          incomplete.push(`${category}: a citation quotes no output text`);
        }
      }
      if (citations.length === 0) {
        incomplete.push(`${category} is marked present with no citations`);
      }
      if (category === NAMED_BY_REVIEWER_CATEGORY) {
        if (!assessment.name || assessment.name.trim().length === 0) {
          incomplete.push("S7 is marked present without the reviewer naming the pattern");
        }
        if (!assessment.definition || assessment.definition.trim().length === 0) {
          incomplete.push(
            "S7 is marked present without the reviewer defining it in the same terms as the others",
          );
        }
      }
    }

    const meetsThreshold = present && citedBatches.length >= thresholdBatches;
    if (present && meetsThreshold) vetoed.push(category);
    if (present && !meetsThreshold) presentBelowThreshold.push(category);

    systemic.push({
      category,
      class: SYSTEMIC_CLASS_OF[category],
      verdict: present ? "present" : "absent",
      citedBatches,
      thresholdBatches,
      meetsThreshold,
    });
  }

  if (vetoed.length > 0) {
    reasons.push({
      kind: "systemic_veto",
      detail:
        "systemic veto on " +
        vetoed
          .map((category) => {
            const verdict = systemic.find((entry) => entry.category === category);
            return `${category} (${verdict?.citedBatches.length} batch(es) cited, threshold ${verdict?.thresholdBatches})`;
          })
          .join(", ") +
        ". §3.7: the gate fails regardless of distribution, and the reviewer's citations are " +
        "recorded verbatim in the go/no-go.",
      categories: vetoed,
    });
  }

  if (presentBelowThreshold.length > 0) {
    findings.push({
      kind: "systemic_present_below_threshold",
      detail:
        "found present, with fewer distinct batches cited than its class threshold: " +
        presentBelowThreshold
          .map((category) => {
            const verdict = systemic.find((entry) => entry.category === category);
            return `${category} (${verdict?.citedBatches.length} batch(es) cited, threshold ${verdict?.thresholdBatches}: ${verdict?.citedBatches.join(", ")})`;
          })
          .join(", ") +
        ". §3.7: this is a **recorded finding, not a veto** — it stays in the decision artifact " +
        "with its citations intact and does not on its own fail the gate. An isolated observation " +
        "and a recurring pattern are different things, which is why the class table has numbers " +
        "in it; a single weak batch is already caught by the per-batch layer.",
      categories: presentBelowThreshold,
    });
  }

  /* --- a correctness veto and a band that disagree with each other -------------------------- */

  /**
   * `§3.7`: a `creativeGuidance` promotion or an eroded host constraint *"also forces that batch to
   * `Fail` under §3.7's band definitions"*.
   *
   * So a reviewer who cites S3 or S4 on a batch and then rates that batch anything but `Fail` has
   * contradicted themselves. Recorded, not resolved — the same treatment `§3.7` gives a band that
   * disagrees with its minimum-wowable answer, and for the same reason: choosing the more
   * convenient side of a contradiction is not arithmetic. It is a finding rather than a reason
   * because the S3/S4 veto already fails the gate on its own threshold.
   */
  const correctnessCited = systemic
    .filter((entry) => entry.class === "correctness" && entry.verdict === "present")
    .flatMap((entry) =>
      entry.citedBatches.map((batchId) => ({ batchId, category: entry.category })),
    );
  const bandOf = new Map(batches.map((batch) => [batch.batchId, batch.band]));
  const contradictions = correctnessCited.filter(
    ({ batchId }) => bandOf.has(batchId) && bandOf.get(batchId) !== "Fail",
  );
  if (contradictions.length > 0) {
    findings.push({
      kind: "correctness_band_contradiction",
      detail:
        "cited under a correctness category but not rated `Fail`: " +
        contradictions
          .map(({ batchId, category }) => `${batchId} (${category}, rated ${bandOf.get(batchId)})`)
          .join(", ") +
        ". §3.7: any occurrence of S3 or S4 also forces that batch to `Fail`. Recorded verbatim " +
        "rather than resolved in favour of either side.",
      batchIds: [...new Set(contradictions.map((entry) => entry.batchId))],
      categories: [...new Set(contradictions.map((entry) => entry.category))],
    });
  }

  /* --- completeness ------------------------------------------------------------------------ */

  const unfiled = review.unfiledCrossBatchPattern;
  if (typeof unfiled === "string" && unfiled.trim().length > 0) {
    incomplete.push(
      "the reviewer's prose describes a cross-batch pattern filed under none of S1–S9: " +
        `${unfiled.trim()}. §3.7: the review is returned for that pattern to be filed or ` +
        "explicitly declined, before any decision is recorded.",
    );
  } else if (unfiled !== null) {
    incomplete.push(
      "the go/no-go author did not state whether the reviewer's prose left a cross-batch pattern " +
        "unfiled; §3.7 makes that check a duty, so an unstated answer is not a clean one",
    );
  }

  if (!review.prose || review.prose.trim().length === 0) {
    incomplete.push("the review carries no prose, which the unfiled-pattern check is read against");
  }

  if (incomplete.length > 0) {
    reasons.push({
      kind: "review_incomplete",
      detail: "the review does not yet support a recorded decision: " + incomplete.join("; ") + ".",
    });
  }

  return {
    decision: reasons.length === 0 ? "GO" : "NO-GO",
    reasons,
    findings,
    bandDistribution,
    minimumWowableTally,
    systemic,
    disagreements,
    reviewComplete: incomplete.length === 0,
    mustReturnToReviewer: incomplete.length > 0,
  };
}
