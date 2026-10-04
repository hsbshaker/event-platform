/**
 * The fit margin (`docs/card-system.md §4.3`), in a module of its own with no imports so the
 * entry check (`entry.ts`) can use it in the browser without loading the font shaper.
 */

/**
 * Measured width × (1 + FIT_SAFETY) must fit the box: the margin that absorbs browser rendering
 * differences (`docs/card-system.md §4.3`). Measurement agrees with Chromium within 0.03%; the rest
 * is headroom for other engines and sub-pixel rounding.
 */
export const FIT_SAFETY = 0.03;

/** The width lines are broken at for a box (or zone) of `width`. */
export function breakWidth(width: number): number {
  return width / (1 + FIT_SAFETY);
}
