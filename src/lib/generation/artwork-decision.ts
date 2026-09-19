/**
 * Does *this* direction want artwork? — `spec.md §7.6a #1`.
 *
 * The first binding constraint on Phase 4 imagery is the one most likely to be lost, because it
 * is the only one that costs something to honour:
 *
 * > **Optional, and chosen by the creative direction.** "Every event site gets an image" is not a
 * > product rule. A sophisticated black-tie concept may be stronger with none.
 *
 * Mechanically it would be far easier to offer the `Artwork` primitive on every call and let the
 * model decline it. That fails the constraint in the way that is hardest to see: a model offered a
 * capability uses it, the product drifts to an image on every site, and nobody ever made that
 * decision. So the gate is upstream of the model. A direction that did not ask for artwork is sent
 * a primitive spec that does not mention artwork at all — the same narrowing a capability-less
 * event already gets, and for the same reason.
 *
 * # This reads the direction. It is also, honestly, a proxy
 *
 * The truest implementation of "chosen by the creative direction" is a field on `DesignIntent` in
 * which the direction says so. There is no such field, and `DesignIntent` is frozen: adding one
 * changes the schema, the prompt and the narrowing, and invalidates the Phase 4B/4C benchmark
 * evidence that settled the stage. That is a real cost to pay for a signal the direction already
 * gives.
 *
 * It gives it twice, in fact, and `docs/product-doctrine.md §10` names the exact two cases this
 * has to tell apart: "A sophisticated black-tie concept is often stronger with none; a lemon,
 * teddy, botanical, safari or storybook concept may need one." In this schema those two concepts
 * differ in precisely the two fields read below — what ornamental budget the direction asked for,
 * and whether it named a visual vocabulary at all. Black-tie is `ornament: "restrained"` with no
 * motifs. Botanical is motifs, named.
 *
 * So this is a faithful reading of a choice the direction really made, not a rule invented here —
 * but it is a reading, and the honest fix when `DesignIntent` next revs is an explicit field, at
 * which point this function keeps its signature and loses its inference. The seam is deliberate.
 *
 * # What this is not
 *
 * It does not choose a *role*. Whether the artwork is an anchor, an object, atmosphere or a framed
 * illustration is a structural decision, and `CLAUDE.md §2` gives structure to the model: the
 * system makes the design decisions it was hired to make, and picking between four legitimate
 * compositional treatments is one of them. This decides only whether the question is asked.
 *
 * It also does not police host constraints. A host who wrote "no illustrations" is authoritative
 * (`spec.md §32 #12`), and that constraint reaches the art brief verbatim through
 * `VisualArtIntent.hostConstraints`, exactly as it reaches Composition. Keyword-matching free text
 * here would be a second, worse enforcement of the same rule in a place with less context.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`. Guardrails:
 * `spec.md §32 #12`, `#15`, `#16`, `#21`. Canon: `spec.md §7.6a`, `docs/product-doctrine.md §10`.
 */
import type { DesignIntent } from "@/lib/renderer/design-intent";

/**
 * Why artwork was or was not offered to this concept.
 *
 * Recorded per concept rather than recomputed, because the rule is versioned: a later version
 * reading the same direction may answer differently, and the concept is the artifact its own
 * decision produced.
 */
export type ArtworkDecisionReason =
  /** `ornament: "none"` — the direction declined an ornamental layer outright. */
  | "ornament_none"
  /** Restrained, and no motifs: the direction named no visual vocabulary to make artwork *of*. */
  | "no_visual_vocabulary"
  /** Restrained, but with a named vocabulary. One art-directed piece, not a decorative field. */
  | "restrained_with_vocabulary"
  /** `ornament: "decorative"` — the widest ornamental budget the compiler will honour. */
  | "decorative";

export interface ArtworkDecision {
  /** When false, the `Artwork` primitive is absent from this concept's language entirely. */
  readonly allowed: boolean;
  /**
   * How many `Artwork` nodes this page may carry. Zero when not allowed.
   *
   * A budget rather than a second opinion about taste, and deliberately the same shape as
   * `ORNAMENT_BUDGET` in `src/lib/renderer/compile/motifs.ts`: the direction's stated ornamental
   * appetite decides how much, the model decides what and where, the compiler enforces the cap.
   */
  readonly maxArtwork: number;
  readonly reason: ArtworkDecisionReason;
}

const DECLINED = (reason: ArtworkDecisionReason): ArtworkDecision => ({
  allowed: false,
  maxArtwork: 0,
  reason,
});

/**
 * Read this direction's own answer to whether it wants artwork.
 *
 * Pure and total: same intent, same decision, no clock, no randomness, no model call. Two siblings
 * in one batch can legitimately disagree, which is the constraint working rather than an
 * inconsistency — `spec.md §7.7a` gives the batch three creative propositions, and one of the
 * three being typography-led is exactly the variation doctrine §10 describes.
 */
export function decideArtwork(intent: DesignIntent): ArtworkDecision {
  const { ornament } = intent.composition;

  // Stricter than motifs, deliberately. `ORNAMENT_BUDGET.none` in `compile/motifs.ts` still allows
  // one motif, because a motif is a compiler-drawn texture at 0.22 opacity. Artwork is not that. A
  // direction that asked for no ornamental layer can carry one whisper of texture and still be
  // contradicted by a generated image, so the two budgets legitimately part company here.
  if (ornament === "none") return DECLINED("ornament_none");

  if (ornament === "decorative") {
    return { allowed: true, maxArtwork: 2, reason: "decorative" };
  }

  // `restrained`. The direction wants an ornamental layer, sparingly. Whether artwork serves it
  // turns on whether there is a subject: motifs are where this schema records that a direction has
  // a visual world rather than a typographic one.
  if (intent.motifs.length === 0) return DECLINED("no_visual_vocabulary");

  return { allowed: true, maxArtwork: 1, reason: "restrained_with_vocabulary" };
}
