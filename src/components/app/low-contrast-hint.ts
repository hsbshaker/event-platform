/**
 * When the host is told that some words sit on a busy part of the picture (`card_layouts_v4`,
 * owner decision 2026-10-06; `docs/card-system.md §4.2`). In a centred layout nothing is painted
 * behind the words, so when no ink clears 4.5:1 the card keeps the best one and the zone is stored
 * as low contrast. The host sees one plain line under the card — in the reveal and in Creation Mode
 * — while the card shows its generated layout: once they have edited this design and shape, the
 * words are theirs to place (`spec.md §20.1`). Guests never see it.
 */

export const LOW_CONTRAST_HINT =
  "Some words sit on a busy part of the picture. If they're hard to read, move them in Edit card.";

export function showLowContrastHint(card: {
  /** The design's ink for the shape shown has a low-contrast zone (`RevealedCard.lowContrast`). */
  lowContrast: boolean;
  /** The host's saved customization of this design and shape, if any. */
  customization: unknown;
}): boolean {
  return card.lowContrast && card.customization === null;
}
