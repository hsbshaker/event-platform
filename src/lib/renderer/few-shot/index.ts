/**
 * The few-shot example adapter — one of exactly two production modules permitted to reach the
 * legacy fixture library (`docs/event-renderer-system.md §7.1`, `CLAUDE.md §5.1`; the other is
 * `../recovery`, for repair macros and the terminal fallback).
 *
 * Its single role is §4's "three rotated library examples" in the composition call. That is a
 * *teaching* input — it shows the model what a well-formed CompositionTree looks like, and the
 * prompt says so in as many words ("for format only; do not copy their structure").
 *
 * The boundary this module exists to hold:
 *
 * - the public surface returns `CompositionTree`s and nothing else. No recipe name, silhouette
 *   name, template id, ranking, similarity score or selection metadata crosses it, because an
 *   identifier that reaches a decision is a candidate-choice variable, which §7.1 forbids by
 *   name;
 * - generation asks for examples for a seed. It cannot enumerate the library, cannot ask for a
 *   particular fixture, and cannot learn which fixtures it was given;
 * - nothing here selects a composition *for* an event. The model authors the composition.
 *
 * Keeping this separate from `../recovery` is deliberate: merging them would make one module the
 * generic place code goes to reach the library, which is the erosion §7.1 exists to prevent.
 * `eslint.config.mjs` exempts these two directories by name and nothing else under `src/**`.
 */

import type { CompositionTree } from "../composition/nodes";
import { A1_SITES, page } from "../library";
import { mulberry32 } from "../seeded-random";

/** §4: three rotated examples per composition call. */
export const FEW_SHOT_EXAMPLE_COUNT = 3;

/**
 * The rotation offset and shuffle are the reference's (`proof-b/prompt.js`), preserved exactly so
 * a seed picks what it has always picked.
 *
 * KNOWN DEFECT, deliberately kept for Phase 3 — `docs/phase-3-invariant-obligations.md` row 11.
 * `sort` with a random comparator is not a shuffle: the permutation depends on the engine's sort
 * algorithm as well as the comparator. It is stable in practice (V8 uses binary insertion sort
 * below 64 elements and `A1_SITES` has 16) and `few-shot.test.ts` pins it against the reference
 * expression, but that pins V8's behaviour, not an algorithm.
 *
 * Replacing it is a Phase 4 obligation, due **before the first production model call**, and it
 * travels with a prompt-version bump, a test that pins the algorithm instead of `proof-b`, and a
 * fresh confirmation run — the frozen Phase B evidence does not survive a change to the examples
 * a seed receives. Row 11 has the full list. Do not do it piecemeal, and do not do it here.
 */
const ROTATION_OFFSET = 99;

/**
 * The example trees for one composition call. Deterministic in `seed`: the same seed returns the
 * same three trees, which is what makes a generation run reproducible.
 *
 * Returns freshly built trees; the caller may serialize or mutate them freely.
 */
export function compositionExamples(seed: number): CompositionTree[] {
  const random = mulberry32(seed + ROTATION_OFFSET);
  return [...A1_SITES]
    .sort(() => random() - 0.5)
    .slice(0, FEW_SHOT_EXAMPLE_COUNT)
    .map((site) => page(site.hero, site.details, site.rsvp, site.registry, site.plan, site.align));
}
