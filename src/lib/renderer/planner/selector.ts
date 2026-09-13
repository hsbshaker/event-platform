/**
 * The selector: does a candidate's skeleton collide with a batch sibling or the host's redesign
 * history?
 *
 * `docs/event-renderer-system.md §5`: "A collision with a batch sibling or the host's redesign
 * history earns one re-prompt naming the colliding skeleton, then a library fallback." The
 * threshold is .70, calibrated on the library.
 *
 * The signature itself is `../composition/signature` — ported with the language core and not
 * duplicated here. This module is only the decision the signature feeds: compare against the
 * accepted set at both breakpoints, take the worst, and say what the compiler should do next.
 *
 * A collision authorizes exactly one re-prompt, and then the already-hardened terminal fallback
 * in `../recovery`. It never selects or maps a composition onto a legacy fixture: the only thing
 * that crosses to the model is the *colliding skeleton string*, so the re-prompt can say what to
 * avoid (`docs/event-renderer-system.md §7.1`).
 */

import type { CompositionTree } from "../composition/nodes";
import { similarity, skeleton, type SigInput } from "../composition/signature";

/**
 * .70, calibrated on the library (`docs/event-renderer-system.md §5`).
 *
 * The reference reads `SIG_WEIGHTS.threshold` before falling back to a literal `0.7`
 * (`proof-b/run-model.js`); that key does not exist on `SIG_WEIGHTS` in the reference either, so
 * the comparison is always against the literal. Named here instead of left dead — the value is
 * unchanged (reference defect #6, `docs/phase-3-reference-defects.md`).
 */
export const COLLISION_THRESHOLD = 0.7;

const MODES = ["desktop", "mobile"] as const;

export interface CollisionCheck {
  /** The highest similarity against any already-accepted candidate, over both breakpoints. */
  readonly nearest: number;
  readonly collides: boolean;
  /**
   * The desktop hero skeletons of the candidates it is too close to, most similar first. This is
   * what the one re-prompt names; it carries no fixture identity, only the shape to avoid.
   */
  readonly collidingSkeletons: string[];
}

/** Worst-case similarity between one candidate and one accepted sibling, over both breakpoints. */
function worstAgainst(candidate: SigInput, accepted: SigInput): number {
  return Math.max(...MODES.map((mode) => similarity(candidate, accepted, mode)));
}

/**
 * Check one candidate against the candidates already accepted in this batch, plus any skeletons
 * from the host's redesign history.
 *
 * `accepted` is compared in order; ties keep the earlier candidate, as the reference does.
 */
export function checkCollision(candidate: SigInput, accepted: readonly SigInput[]): CollisionCheck {
  const scored = accepted
    .map((a) => ({ score: worstAgainst(candidate, a), input: a }))
    .sort((x, y) => y.score - x.score);
  const nearest = scored.length ? scored[0].score : 0;
  return {
    nearest,
    collides: nearest >= COLLISION_THRESHOLD,
    collidingSkeletons: scored
      .filter((s) => s.score >= COLLISION_THRESHOLD)
      .slice(0, 3)
      .map((s) => skeleton(s.input.tree, "desktop").heroString),
  };
}

/** Convenience for a whole batch: accept in order, reporting each candidate's check. */
export function checkBatch(candidates: readonly SigInput[]): CollisionCheck[] {
  const accepted: SigInput[] = [];
  return candidates.map((c) => {
    const check = checkCollision(c, accepted);
    accepted.push(c);
    return check;
  });
}

/** The skeleton a re-prompt names, for a tree the caller already has. */
export function heroSkeletonString(tree: CompositionTree): string {
  return skeleton(tree, "desktop").heroString;
}
