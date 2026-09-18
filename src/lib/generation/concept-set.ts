/**
 * The deterministic review of one batch's three concepts — the set-level stage production did not
 * have.
 *
 * Before the T22 remediation nothing in the system ever saw two siblings at once.
 * `design-intent/validate.ts` validates one response against one assignment; `batch.ts` counts
 * successes; `generateDesignIntent` takes one sibling. That is why one batch could return the same
 * concept name from all three siblings and reach a blind reviewer as three concept cards, and why
 * `spec.md §7.8`'s deterministic duplicate-name fallback — *"if it is missing, invalid, or
 * duplicates another concept's name, a deterministic fallback name is derived"* — had nowhere to
 * live. This module is the place where three concepts meet, and it implements that rule.
 *
 * The specific card names the spent run repeated are deliberately not quoted here.
 * `docs/designintent-sibling-convergence.md` is the record of what that run produced; an
 * implementation that named one of its answers would be the case-fitting
 * `tests/unit/premise-no-case-leakage.test.ts` exists to refuse, and would mean nothing to a
 * reader arriving at the fourteenth event.
 *
 * # What it repairs, and what it only reports
 *
 * The division is not a matter of taste. `spec.md §32 #21` requires structural, coverage and
 * diversity defects to be repaired deterministically and logged, and permits no re-prompt for
 * them; `docs/phase-4b-plan.md §E` adds that no convergence-triggered re-prompt exists at this
 * stage. So nothing here calls a model, and nothing here rewrites a creative decision.
 *
 * | signal | what happens |
 * | --- | --- |
 * | concept name missing, invalid, or duplicating a sibling's | **repaired** from this concept's premise title, logged (`spec.md §7.8`) |
 * | description missing or invalid | **repaired** from this concept's premise, logged |
 * | description near-duplicating a sibling's | **repaired** from this concept's premise, logged |
 * | description restating the identity's own thesis | **repaired** from this concept's premise, logged |
 * | two siblings with an identical design vector | reported |
 * | motif sets overlapping above a ceiling | reported |
 * | palettes closer than a floor | reported |
 * | a premise the returned concept does not visibly express | reported, advisory |
 *
 * **Why the card is repairable and the design is not.** A concept card is host-facing metadata the
 * compiler never reads (`spec.md §32 #21`), and canon already provides a deterministic fallback for
 * it — so replacing a duplicate card costs nothing and fixes the thing a host actually sees. A
 * palette, a motif set or a composition vector is the model's creative answer. Rewriting one to
 * widen a distance would fabricate a creative decision nobody made, and it would optimise the
 * metric rather than the product: `docs/designintent-sibling-convergence.md §6` is explicit that
 * ΔE floors and vector counts are the instruments that detected the failure and never the
 * objective. Three numerically distant bad concepts are not the goal.
 *
 * So convergence in the design fields is **evidence, reported**. The fix for it is upstream, in the
 * premise set — which is where the one bounded repair layer sits.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` ("Duplicate or
 * invalid concept names fall back deterministically"), `§31 — Concept experience`. Guardrails
 * `spec.md §32 #21`.
 */
import { presentationSchema } from "@/lib/ai/design-intent/contract";
import type { ConceptPremise } from "@/lib/ai/concept-premise/contract";
import { contentOverlap, titleKey, titleTokenKey } from "@/lib/ai/concept-premise/text";
import type { EventIdentity } from "@/lib/ai/event-identity/contract";
import type { DesignIntent, Deviation, Presentation } from "@/lib/renderer/design-intent";

import { PREMISE_SET_SIZE } from "@/lib/ai/concept-premise/contract";

/* ------------------------------------------------------------------ thresholds */

/**
 * The ceiling on how much two concept descriptions may share, exclusive.
 *
 * Looser than the premise validator's idea ceiling, on purpose: a description is at most 140
 * characters of warm host-facing prose about the same event, so some shared vocabulary is ordinary.
 * At 0.6 two cards must have most of their content words in common — which is what a reworded card
 * looks like, and what two genuinely different cards do not.
 */
export const DESCRIPTION_OVERLAP_CEILING = 0.6;

/**
 * The ceiling on how much a description may share with the identity's own creative thesis.
 *
 * This is blind-review pattern S7 — *"brief restatement replacing concept identity"* — made
 * decidable. A card whose content words are mostly the identity's `creativeDirection` has described
 * the event, which the host already knows, instead of the choice, which is what the card is for.
 */
export const THESIS_OVERLAP_CEILING = 0.55;

/** Motif-set overlap above this is reported. The eval harness's own ceiling, reused deliberately. */
export const MOTIF_OVERLAP_REPORT_CEILING = 0.5;

/* ------------------------------------------------------------------ inputs and outputs */

/** One returned concept, as the set review receives it. */
export interface ReviewedConcept {
  /** 0, 1 or 2 — the planner's index, and the key everything downstream uses. */
  readonly index: number;
  /** The seven design fields, post-repair and revalidated. */
  readonly designIntent: DesignIntent;
  /** What the model returned for the card, or `null` where validation refused it. */
  readonly presentation: Presentation | null;
  /** The premise this concept was authored from. */
  readonly premise: ConceptPremise;
}

export interface ConceptSetReviewInput {
  readonly concepts: readonly ReviewedConcept[];
  /** The one authoritative identity all three inherit. Read only to detect thesis restatement. */
  readonly identity: EventIdentity;
}

/** One reported signal. Never a repair, and never a reason to call a model. */
export interface SetSignal {
  readonly signal:
    "identical-design-vector" | "motif-overlap" | "palette-proximity" | "premise-not-expressed";
  /** The concept indexes involved, ascending. */
  readonly concepts: readonly number[];
  readonly detail: string;
  /** `advisory` signals are never gating and never counted as defects. */
  readonly severity: "reported" | "advisory";
}

export interface ConceptCard {
  readonly index: number;
  readonly name: string;
  readonly description: string;
  /** True where either field came from the deterministic fallback rather than the model. */
  readonly fallback: boolean;
}

export interface ConceptSetReview {
  /** The cards a host sees, after `spec.md §7.8`'s fallback has been applied where it is owed. */
  readonly cards: readonly ConceptCard[];
  /** Every deterministic repair, logged by kind. `spec.md §31` requires the logging, not just the repair. */
  readonly deviations: readonly Deviation[];
  /** Convergence and expression signals. Evidence for a human, never an input to a model. */
  readonly signals: readonly SetSignal[];
}

/* ------------------------------------------------------------------ the card fallback */

/**
 * Cut host-facing prose to a length without splitting a word, and without inventing a sentence.
 *
 * Prefers a sentence boundary, falls back to a word boundary with an ellipsis, and returns the
 * whole string when it already fits. Deterministic in its input alone: the same premise always
 * produces the same card, which is what makes a fallback auditable rather than merely plausible.
 */
export function clampProse(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;

  const window = trimmed.slice(0, max);
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
  );
  if (sentenceEnd > 0) return trimmed.slice(0, sentenceEnd + 1);

  const lastSpace = window.lastIndexOf(" ");
  const cut = lastSpace > 0 ? window.slice(0, lastSpace) : window.slice(0, max - 1);
  return `${cut.replace(/[,;:\s]+$/u, "")}…`;
}

const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 140;

/**
 * The card this concept's premise implies, used wherever the model's own is missing or unusable.
 *
 * The name is the premise's `title`, which is the right source rather than a convenient one: it was
 * authored for this concept, as one of a set of three, and `concept-premise/validate.ts` has
 * already refused a set whose titles collide — so the fallback cannot itself produce a duplicate.
 * That is the property `spec.md §7.8`'s rule needs and had no way to get before the premise existed:
 * the only deterministic name previously available would have been a numbered one, which
 * `design_intent_v6 §12` and the presentation contract both forbid.
 *
 * The description is the premise's `experience`, clamped. It describes the concept rather than the
 * event, which is the whole point of the rule it is standing in for.
 */
export function fallbackCard(premise: ConceptPremise): { name: string; description: string } {
  const description = clampProse(premise.experience, DESCRIPTION_MAX);
  return {
    name: premise.title,
    // A premise `experience` is at least 20 characters by contract, and clamping only ever
    // shortens toward a boundary, so the floor is structurally satisfied. Asserted rather than
    // assumed would mean throwing on a value the contract forbids; padding it would mean inventing
    // host-facing prose. So the value is used as derived and the contract is the guarantee.
    description,
  };
}

function deviation(
  index: number,
  field: "name" | "description",
  before: string | null,
  after: string,
  detail: string,
): Deviation {
  return {
    rule: `concept-card.${field}`,
    path: `concepts.${index}.presentation.${field}`,
    kind: "intent",
    before: before ?? "(absent)",
    after,
    detail,
  };
}

/* ------------------------------------------------------------------ the review */

const PAIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [1, 2],
];

/** The four composition dimensions the model chooses, plus density. `hierarchy` is assigned. */
function designVector(intent: DesignIntent): string {
  return [
    intent.density,
    intent.composition.asymmetry,
    intent.composition.rhythm,
    intent.composition.sectionContrast,
    intent.composition.ornament,
  ].join("/");
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 && right.size === 0) return 0;
  let shared = 0;
  for (const value of left) if (right.has(value)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Does the returned concept visibly answer its premise's register?
 *
 * **Advisory, and it has to be.** The register names a character and the DesignIntent owns the
 * translation, so there is no single correct mapping to check against — a `commanding` premise at a
 * `restrained` hierarchy is legitimately a quieter kind of command
 * (`design_intent_v6 §4`). What is checkable is the one case that is never expression: the register
 * asked for an extreme and the concept answered with the middle of every dimension it bears on.
 *
 * Reported so a reader of a weak batch can see it, never gating, and never a reason to ask again.
 */
function expressionSignal(concept: ReviewedConcept): SetSignal | null {
  const { premise, designIntent } = concept;
  const middling: string[] = [];
  if (premise.register.surfaceRichness === "bare" && designIntent.composition.ornament !== "none") {
    if (designIntent.motifs.length > 1) middling.push("surfaceRichness=bare");
  }
  if (
    premise.register.surfaceRichness === "layered" &&
    designIntent.composition.ornament === "none" &&
    designIntent.motifs.length === 0
  ) {
    middling.push("surfaceRichness=layered");
  }
  if (premise.register.pace === "lingering" && designIntent.density === "compact") {
    middling.push("pace=lingering");
  }
  if (premise.register.pace === "propulsive" && designIntent.density === "spacious") {
    middling.push("pace=propulsive");
  }
  if (middling.length === 0) return null;
  return {
    signal: "premise-not-expressed",
    concepts: [concept.index],
    detail:
      `register asked for ${middling.join(", ")} and the design answers against it ` +
      `(density ${designIntent.density}, ornament ${designIntent.composition.ornament}, ` +
      `${designIntent.motifs.length} motif(s)). Advisory: the DesignIntent owns the translation, ` +
      "so this is a reading for a human and never a defect the system acts on",
    severity: "advisory",
  };
}

/**
 * Review one batch's three concepts: repair the cards, report the convergence.
 *
 * Pure. No model call, no I/O, no clock. The same three concepts always produce the same cards and
 * the same signals, which is what lets a persisted batch be re-reviewed and compared.
 */
export function reviewConceptSet(input: ConceptSetReviewInput): ConceptSetReview {
  const concepts = [...input.concepts].sort((a, b) => a.index - b.index);
  const deviations: Deviation[] = [];
  const signals: SetSignal[] = [];
  const thesis = input.identity.creativeDirection;

  // Pass 1: whether each model-authored card is usable on its own terms.
  const usable = concepts.map((concept) => {
    const parsed = presentationSchema.safeParse(concept.presentation);
    return parsed.success ? parsed.data : null;
  });

  // Pass 2: a name is unusable if a sibling already holds it, in either spelling or word order.
  // Earlier index keeps its name; later ones fall back — a fixed rule so the same batch always
  // repairs the same concept, rather than whichever was examined first.
  const nameTaken = new Map<string, number>();
  const tokenTaken = new Map<string, number>();
  const nameDuplicate = concepts.map(() => false);
  usable.forEach((card, at) => {
    if (!card) return;
    const exact = titleKey(card.name);
    const reordered = titleTokenKey(card.name);
    const holder = nameTaken.get(exact) ?? tokenTaken.get(reordered);
    if (holder !== undefined) {
      nameDuplicate[at] = true;
      return;
    }
    nameTaken.set(exact, at);
    tokenTaken.set(reordered, at);
  });

  // Pass 3: a description is unusable if it restates a sibling's or restates the brief's thesis.
  const descriptionDefect = concepts.map<string | null>(() => null);
  for (const [a, b] of PAIRS) {
    const left = usable[a];
    const right = usable[b];
    if (!left || !right) continue;
    const overlap = contentOverlap(left.description, right.description);
    if (overlap >= DESCRIPTION_OVERLAP_CEILING && descriptionDefect[b] === null) {
      descriptionDefect[b] =
        `restates concept ${a}'s description (${(overlap * 100).toFixed(0)}% of its content ` +
        `words, at or above the ${(DESCRIPTION_OVERLAP_CEILING * 100).toFixed(0)}% ceiling)`;
    }
  }
  usable.forEach((card, at) => {
    if (!card || descriptionDefect[at] !== null) return;
    const overlap = contentOverlap(card.description, thesis);
    if (overlap >= THESIS_OVERLAP_CEILING) {
      descriptionDefect[at] =
        `restates the identity's own creative thesis (${(overlap * 100).toFixed(0)}% of its ` +
        "content words) instead of describing this choice";
    }
  });

  // Pass 4: build the cards, logging every substitution.
  const cards = concepts.map((concept, at) => {
    const card = usable[at];
    const fallback = fallbackCard(concept.premise);
    let name = card?.name ?? fallback.name;
    let description = card?.description ?? fallback.description;
    let substituted = false;

    if (!card) {
      deviations.push(
        deviation(
          concept.index,
          "name",
          concept.presentation ? JSON.stringify(concept.presentation) : null,
          fallback.name,
          "presentation was missing or did not validate; derived deterministically from this " +
            "concept's premise (`spec.md §7.8`)",
        ),
      );
      substituted = true;
    } else if (nameDuplicate[at]) {
      deviations.push(
        deviation(
          concept.index,
          "name",
          card.name,
          fallback.name,
          "concept name duplicated a sibling's; derived deterministically from this concept's " +
            "premise (`spec.md §7.8`). The premise titles are validated distinct, so the " +
            "fallback cannot itself collide",
        ),
      );
      name = fallback.name;
      substituted = true;
    }

    const defect = card ? descriptionDefect[at] : null;
    if (defect !== null) {
      deviations.push(
        deviation(
          concept.index,
          "description",
          card!.description,
          fallback.description,
          `${defect}; derived deterministically from this concept's premise. A card's job is to ` +
            "say what is different about this choice",
        ),
      );
      description = fallback.description;
      substituted = true;
    }

    return {
      index: concept.index,
      name,
      description: clampProse(description, DESCRIPTION_MAX),
      fallback: substituted,
    };
  });

  // Pass 5: the convergence signals. Reported, never repaired.
  for (const [a, b] of PAIRS) {
    const left = concepts[a];
    const right = concepts[b];
    if (!left || !right) continue;

    const leftVector = designVector(left.designIntent);
    if (leftVector === designVector(right.designIntent)) {
      signals.push({
        signal: "identical-design-vector",
        concepts: [left.index, right.index],
        detail:
          `both chose ${leftVector} across density, asymmetry, rhythm, sectionContrast and ` +
          "ornament. Reported, never repaired: rewriting one would fabricate a creative decision",
        severity: "reported",
      });
    }

    const overlap = jaccard(left.designIntent.motifs, right.designIntent.motifs);
    if (overlap > MOTIF_OVERLAP_REPORT_CEILING) {
      signals.push({
        signal: "motif-overlap",
        concepts: [left.index, right.index],
        detail: `motif-set overlap ${overlap.toFixed(2)}, above ${MOTIF_OVERLAP_REPORT_CEILING}`,
        severity: "reported",
      });
    }

    if (left.designIntent.palette.dominant === right.designIntent.palette.dominant) {
      signals.push({
        signal: "palette-proximity",
        concepts: [left.index, right.index],
        detail:
          `both chose ${left.designIntent.palette.dominant} as the dominant colour. Reported as ` +
          "corroboration only — palette distance is never the objective",
        severity: "reported",
      });
    }
  }

  for (const concept of concepts) {
    const signal = expressionSignal(concept);
    if (signal) signals.push(signal);
  }

  return { cards, deviations, signals };
}

/** A set review is only meaningful over a whole batch. Exported so a caller can say so. */
export const CONCEPT_SET_SIZE = PREMISE_SET_SIZE;

export const DESCRIPTION_BOUNDS = { min: DESCRIPTION_MIN, max: DESCRIPTION_MAX } as const;
