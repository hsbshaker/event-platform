/**
 * Spacing resolution: `Density` → a fixed, enumerated numeric scale.
 *
 * `docs/design-system.md §15.2`: "the page system (borders, cards, buttons, type scale, spacing)
 * is compiler-owned". Density is one of the model's six `DesignIntent` fields, but the pixel
 * values it maps to are never model output — they come from two canonical tables so this module
 * and `composition/layout.ts`'s node-level spacing agree on the same numbers:
 *
 * - `sectionY` (vertical padding around a section) is `proof-b/renderer.js`'s `DENS` table
 *   (`--pad-y`), which is already split mobile/desktop in the reference
 *   (`w <= 700 ? d.m : d.d`).
 * - `containerGap` and `inset` reuse `composition/layout.ts`'s `SCALES.gapPx[density].normal` and
 *   `SCALES.insetPx.normal` outright (imported, not re-declared), rather than inventing a second
 *   number for the same concept. Both are width-invariant in the reference — `SCALES.insetPx` in
 *   particular is not keyed by density at all, because a node's own `Inset` token, not the page's
 *   density, drives per-node inset — so `mobile` and `desktop` are equal here; the fields still
 *   carry both, matching every other `Spacing` field's shape.
 */

import type { Density } from "../design-intent";
import { SCALES } from "../composition/layout";

export interface SpacingStep {
  readonly mobile: number;
  readonly desktop: number;
}

export interface Spacing {
  /** Vertical padding around each section. `proof-b/renderer.js`'s `DENS` table. */
  readonly sectionY: SpacingStep;
  /** Generic gap between elements at the page level. `layout.ts`'s `SCALES.gapPx[density].normal`. */
  readonly containerGap: SpacingStep;
  /** Page-level default inner padding. `layout.ts`'s `SCALES.insetPx.normal`. */
  readonly inset: SpacingStep;
}

/** `proof-b/renderer.js`'s `DENS` table: `{ m: mobile px, d: desktop px }` per density. */
const SECTION_Y_PX: Record<Density, SpacingStep> = {
  compact: { mobile: 44, desktop: 64 },
  balanced: { mobile: 64, desktop: 96 },
  spacious: { mobile: 88, desktop: 128 },
};

/**
 * Resolve `density` to a `Spacing`. Deterministic and total: every `Density` has an entry in
 * `SECTION_Y_PX` and every entry in `SCALES.gapPx`/`SCALES.insetPx`, so this never falls through.
 */
export function resolveSpacing(density: Density): Spacing {
  const gap = SCALES.gapPx[density].normal;
  const inset = SCALES.insetPx.normal;
  return {
    sectionY: SECTION_Y_PX[density],
    containerGap: { mobile: gap, desktop: gap },
    inset: { mobile: inset, desktop: inset },
  };
}

/**
 * Every numeric value `resolveSpacing` may ever emit, for the "density can never become a free
 * pixel value" test. Sourced from the same two tables `resolveSpacing` reads.
 */
export const SPACING_SCALE = {
  sectionY: SECTION_Y_PX,
  containerGap: SCALES.gapPx,
  inset: SCALES.insetPx,
} as const;
