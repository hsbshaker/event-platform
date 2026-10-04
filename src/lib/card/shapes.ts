/**
 * The six card shapes and the proportion each one belongs to (`docs/card-system.md §2.1`).
 *
 * A shape fixes its proportion, so the proportion is derived from the shape and never supplied
 * alongside it: a request can no longer pair `circle` with a tall raster or `arch` with a square
 * one and spend a paid generation on artwork validation would reject.
 */

export const CARD_SHAPES = [
  "rectangle",
  "rounded-rectangle",
  "arch",
  "oval",
  "square",
  "circle",
] as const;

export type CardShape = (typeof CARD_SHAPES)[number];

/** Portrait 5:7 or square 1:1. There is no landscape card. */
export type CardProportion = "5:7" | "1:1";

export const SHAPE_PROPORTION: Readonly<Record<CardShape, CardProportion>> = {
  rectangle: "5:7",
  "rounded-rectangle": "5:7",
  arch: "5:7",
  oval: "5:7",
  square: "1:1",
  circle: "1:1",
};

export function proportionOf(shape: CardShape): CardProportion {
  return SHAPE_PROPORTION[shape];
}
