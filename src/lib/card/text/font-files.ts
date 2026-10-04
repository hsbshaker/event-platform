/**
 * The curated card faces and where the browser loads them (`src/styles/card-fonts.css`,
 * `public/fonts/card/`). Isomorphic: the server measures from these files (`curated-fonts.ts`)
 * and `InvitationCard` preloads them.
 *
 * `CURATED_WEIGHTS` mirrors the stylesheet's `@font-face` rules; `font-files.test.ts` keeps the
 * two in step.
 */

import type { FontRef } from "./metrics";

/** Every curated family and the weights it is self-hosted in (all upright). */
export const CURATED_WEIGHTS: Readonly<Record<string, readonly number[]>> = {
  Archivo: [400, 900],
  "Bodoni Moda": [400, 700],
  "Cormorant Garamond": [400, 600, 700],
  "DM Sans": [400, 500],
  "DM Serif Display": [400],
  "EB Garamond": [400, 600],
  Figtree: [400, 600],
  Fraunces: [400, 700],
  "Instrument Serif": [400],
  Inter: [400, 500, 600],
  "Inter Tight": [400, 500],
  Karla: [400, 600],
  "Libre Baskerville": [400, 700],
  "Libre Caslon Text": [400, 700],
  Manrope: [400, 600],
  Newsreader: [400, 600],
  "Playfair Display": [400, 700, 900],
  "Source Sans 3": [400, 600],
  "Space Grotesk": [400, 700],
  "Work Sans": [400, 500],
};

/** The file name of a curated face, e.g. `Source Sans 3` 600 → `SourceSans3-normal-600.woff2`. */
export function curatedFontFileName(font: FontRef): string {
  if (font.italic) {
    throw new Error(`No italic curated face for ${font.family}`);
  }
  if (!Number.isInteger(font.weight) || font.weight < 100 || font.weight > 1000) {
    throw new Error(`Invalid font weight ${font.weight}`);
  }
  if (!/^[A-Za-z0-9 ]+$/.test(font.family)) {
    throw new Error(`Invalid curated family name ${JSON.stringify(font.family)}`);
  }
  return `${font.family.replaceAll(" ", "")}-normal-${font.weight}.woff2`;
}

/** The URL of a curated face, or null when the face is not one of the curated files. */
export function curatedFontUrl(font: FontRef): string | null {
  const weights = Object.hasOwn(CURATED_WEIGHTS, font.family) ? CURATED_WEIGHTS[font.family] : null;
  if (font.italic || !weights?.includes(font.weight)) return null;
  return `/fonts/card/${curatedFontFileName(font)}`;
}
