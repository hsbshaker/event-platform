import type { CardLayoutId } from "@/lib/card/layouts";
import type { CardShape } from "@/lib/card/shapes";
import { TYPOGRAPHY_KEYS, type TypographyPairingId } from "@/lib/card/typography";

/**
 * Worst-case content (`WORST`, every slot at its provisional entry limit) that `layoutCard` reports
 * as overflowing in `card_layouts_v1` today. Whether to fix it — by zones, limits or sizes — is a
 * pending owner decision (`docs/development-plan.md` Phase 4: "worst-case content at the entry
 * limits fits every zone (it does not yet in the 1:1 and curved zones)"), so the fixtures do not
 * paper over it: these combinations are refused by the server path (`generatedTextLayer`), rendered
 * for the contact sheet only, and exempt from the in-zone assertions. Typical content must fit
 * everywhere, and everything not listed here is strict.
 *
 * The list must be exact (`card-layouts.test.ts`): a zone, limit or size change that makes one of
 * these fit, or makes anything else overflow, fails the fixtures until this list is updated.
 */

export interface KnownOverflow {
  layout: CardLayoutId;
  shape: CardShape;
  pairings: readonly TypographyPairingId[];
  /** Why, as `layoutCard` measures it. */
  why: string;
}

const EVERY_PAIRING = TYPOGRAPHY_KEYS;
const TOO_SHORT = "the stack is taller than the zone at minimum sizes";
const WIDE_WORD =
  "the title word “Montgomery-Whitworth!” is wider than the zone at 48 in Libre Baskerville";

export const KNOWN_WORST_CASE_OVERFLOW: readonly KnownOverflow[] = [
  // Narrow curved zones (416–524 wide) and the short 1:1 bands.
  { layout: "art-top", shape: "oval", pairings: EVERY_PAIRING, why: TOO_SHORT },
  { layout: "art-top", shape: "square", pairings: EVERY_PAIRING, why: TOO_SHORT },
  { layout: "art-top", shape: "circle", pairings: EVERY_PAIRING, why: TOO_SHORT },
  { layout: "art-bottom", shape: "arch", pairings: EVERY_PAIRING, why: TOO_SHORT },
  { layout: "art-bottom", shape: "oval", pairings: EVERY_PAIRING, why: TOO_SHORT },
  { layout: "art-bottom", shape: "square", pairings: EVERY_PAIRING, why: TOO_SHORT },
  { layout: "art-bottom", shape: "circle", pairings: EVERY_PAIRING, why: TOO_SHORT },
  { layout: "corners", shape: "square", pairings: EVERY_PAIRING, why: TOO_SHORT },
  // One wide title word in one display face, in the 620–640-wide zones.
  {
    layout: "framed",
    shape: "rectangle",
    pairings: ["heritage_baskerville_inter"],
    why: WIDE_WORD,
  },
  {
    layout: "framed",
    shape: "rounded-rectangle",
    pairings: ["heritage_baskerville_inter"],
    why: WIDE_WORD,
  },
  { layout: "framed", shape: "arch", pairings: ["heritage_baskerville_inter"], why: WIDE_WORD },
  { layout: "framed", shape: "oval", pairings: ["heritage_baskerville_inter"], why: WIDE_WORD },
  { layout: "framed", shape: "square", pairings: ["heritage_baskerville_inter"], why: WIDE_WORD },
  { layout: "framed", shape: "circle", pairings: ["heritage_baskerville_inter"], why: WIDE_WORD },
  {
    layout: "corners",
    shape: "rectangle",
    pairings: ["heritage_baskerville_inter"],
    why: WIDE_WORD,
  },
  {
    layout: "corners",
    shape: "rounded-rectangle",
    pairings: ["heritage_baskerville_inter"],
    why: WIDE_WORD,
  },
];

/** `layout/shape/pairing` keys of every known overflowing combination, sorted. */
export function knownOverflowKeys(): string[] {
  return KNOWN_WORST_CASE_OVERFLOW.flatMap(({ layout, shape, pairings }) =>
    pairings.map((pairing) => `${layout}/${shape}/${pairing}`),
  ).sort();
}
