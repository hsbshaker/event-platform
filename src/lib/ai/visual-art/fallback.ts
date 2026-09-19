/**
 * The deterministic fallback — the contract for a page that has no artwork, which is most pages
 * most of the time.
 *
 * # Why this is not an error path
 *
 * The order of events is fixed by `docs/event-renderer-system.md` and `spec.md §32 #24`, and it
 * puts the image last:
 *
 * ```text
 * CompositionTree → compiler → layout resolution → rendered-geometry verification (390, 1280)
 *   → immutable, verified ResolvedDesignSpec        ← the page is frozen here
 *   → …later, and maybe never…                      ← an artwork request
 * ```
 *
 * A spec is final only when geometry verification is clean, and nothing is persisted or rendered
 * from anything else. So an artwork slot is a **box the compiler already reserved inside verified
 * geometry**, and the asset attaches to that box afterwards or not at all. Every page is assetless
 * for the whole interval between verification and delivery, and permanently if the request failed,
 * was refused by the spend gate, or was never made — which today is every page, because no image
 * model is selected (`spec.md §7.6a`).
 *
 * That makes `empty` the **ordinary** state and the **initial** state, not a degraded one. A
 * renderer that treats it as degraded — a spinner, a grey placeholder, a broken-image glyph, a
 * "couldn't load" caption — would be showing guests the inside of our pipeline on a page that is,
 * by construction, complete without the image. `spec.md §7.6a #1`: artwork is *"optional, and
 * chosen by the creative direction"*; `#5`: *"the deterministic renderer still owns safe
 * realization … and text readability always wins over artwork."*
 *
 * # The contract the renderer workstream consumes
 *
 * This module defines the value a renderer receives for a slot; **how an assetless box paints is
 * the renderer's**, and this file deliberately contains no CSS, class name or geometry. The
 * invariants that half must satisfy, stated here so both halves are written against the same
 * sentence:
 *
 * 1. **Geometry does not depend on the asset.** The box occupies the space the verified spec gave
 *    it whether or not an asset arrives. An asset arriving must not reflow the page, because the
 *    page that was verified is the one without it.
 * 2. **`empty` is a finished appearance.** The surface a slot resolves to with no asset is a
 *    deliberate compiled surface — the page's own palette doing its job — never a placeholder for
 *    something missing. Nothing in it says "image".
 * 3. **Contrast is already satisfied without the asset.** An `atmosphere` slot sits behind text;
 *    that text must meet its contrast target against the *assetless* surface, so that adding
 *    artwork can only ever be additive. This follows from #1 and #5 of `spec.md §7.6a` together:
 *    verification ran on the assetless page, and it is the authoritative one.
 * 4. **An empty slot contributes nothing accessible.** Artwork here is decorative — it carries no
 *    event information, which is why the brief forbids lettering — so an empty slot has no alt
 *    text, no label and no announced state. A guest using a screen reader must not be able to tell
 *    that an image was ever intended.
 * 5. **The absence reason is telemetry, never guest-visible.** `reason` and `failureKind` exist so
 *    a Phase 4E review can count refusals, timeouts and transparency misses by provider. They are
 *    never rendered, and `spec.md §32 #41` already forbids exposing a backend counter.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`;
 * `spec.md §31 — Responsive/accessibility`. Guardrails: `spec.md §32 #24`, `#32`, `#41`.
 */
import type { ArtworkFailureKind } from "./failure";
import type { ArtworkAsset } from "./provider";
import type { VisualArtOutcome } from "./generate";

/**
 * Why a slot has no asset. Ordinary states first; none of them is an error to the guest.
 *
 * `not_requested` is the common case and the current case: the creative direction asked for no
 * artwork, or artwork is not authorized at all. `pending` is the interval every page passes
 * through between verification and delivery.
 */
export const ARTWORK_ABSENCE_REASONS = [
  "not_requested",
  "pending",
  /** The spend gate declined; `docs/development-plan.md` principle 4. */
  "refused",
  /** A request was made and produced no usable asset. `failureKind` says which way. */
  "failed",
] as const;

export type ArtworkAbsenceReason = (typeof ARTWORK_ABSENCE_REASONS)[number];

/**
 * What a compiled artwork slot resolves to at render time.
 *
 * Deliberately a two-state union rather than `asset: ArtworkAsset | null`: a nullable field is
 * read as "the normal value, and also sometimes nothing", and this is the other way round.
 */
export type ArtworkSlotState =
  | {
      readonly status: "empty";
      readonly reason: ArtworkAbsenceReason;
      /** Set only when `reason` is `failed`. Telemetry; never rendered. */
      readonly failureKind: ArtworkFailureKind | null;
    }
  | {
      readonly status: "present";
      readonly asset: ArtworkAsset;
    };

/** The state every slot starts in, and the only state any slot has today. */
export const ARTWORK_SLOT_NOT_REQUESTED: ArtworkSlotState = {
  status: "empty",
  reason: "not_requested",
  failureKind: null,
};

export function artworkSlotPending(): ArtworkSlotState {
  return { status: "empty", reason: "pending", failureKind: null };
}

/**
 * Turn one boundary outcome into the slot state a renderer consumes.
 *
 * Total, and never throws: there is no outcome that leaves a slot undefined. A refusal by the
 * spend gate maps to `refused` and everything else that failed to `failed`, so the two can be
 * counted apart — "we chose not to spend" and "we spent and got nothing" are different facts
 * about a run.
 */
export function artworkSlotFromOutcome(outcome: VisualArtOutcome): ArtworkSlotState {
  if (outcome.ok) return { status: "present", asset: outcome.asset };
  return {
    status: "empty",
    reason: outcome.failure.kind === "budget_refused" ? "refused" : "failed",
    failureKind: outcome.failure.kind,
  };
}

/**
 * Is this slot state safe to render as it stands?
 *
 * Always true, for every state — which is the invariant, not a tautology. The function exists so
 * the guarantee is written down once and can be asserted in a test: there is no combination of
 * outcome, failure kind and absence reason that a renderer is entitled to refuse, and no branch
 * in which a page is not renderable. If a future state is ever added for which this cannot return
 * true, that is a change to the frozen-geometry contract and belongs in `spec.md`, not here.
 */
export function isRenderable(state: ArtworkSlotState): true {
  void state;
  return true;
}
