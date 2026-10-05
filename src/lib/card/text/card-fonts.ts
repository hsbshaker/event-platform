/**
 * Which faces a card's text box may be set in (`spec.md §20.1`, §20.4; `docs/card-system.md §2.6`,
 * §7): the one place that says whether a `FontRef` is a face the platform can serve and measure.
 * Isomorphic and synchronous, so a stored box can be checked before any font is loaded.
 *
 * Today that is the curated faces (`font-files.ts`, every family a design's pairings can name, at
 * the weights the platform hosts). The font store (6b part 3: any Google Fonts family, copied into
 * platform storage with its metrics extracted) adds its families here as a second source. A face
 * from neither is unknown: a box naming it is refused, never measured or drawn with another face
 * in its place — lines broken with the wrong metrics would be stored and shown to guests.
 */

import { curatedFontUrl } from "./font-files";
import type { FontRef } from "./metrics";

/** Where a face's files and metrics come from. The font store adds `"store"`. */
export type CardFontSource = "curated";

/** The source of `font`, or null when the platform has no such face. */
export function cardFontSource(font: FontRef): CardFontSource | null {
  return curatedFontUrl(font) !== null ? "curated" : null;
}

/** Whether `font` is a face a card's text box may be set in. */
export function isKnownCardFont(font: FontRef): boolean {
  return cardFontSource(font) !== null;
}

/** A box names a face the platform cannot serve or measure. */
export class UnknownCardFontError extends Error {
  readonly font: FontRef;

  constructor(font: FontRef) {
    super(
      `Unknown card font ${JSON.stringify(font.family)} ${font.weight}${font.italic ? " italic" : ""}`,
    );
    this.name = "UnknownCardFontError";
    this.font = { ...font };
  }
}
