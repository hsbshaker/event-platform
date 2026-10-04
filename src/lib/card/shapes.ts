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

/**
 * Card units: the coordinate system every layout, zone and text box is expressed in. A portrait
 * card is 1000 × 1400, a square card 1000 × 1000; rendering scales card units to pixels.
 * Ported from the Phase 3 validation catalog (`scripts/phase-3/catalog.mjs`).
 */
export const CARD_CANVAS: Readonly<Record<CardProportion, { width: number; height: number }>> = {
  "5:7": { width: 1000, height: 1400 },
  "1:1": { width: 1000, height: 1000 },
};

export function canvasOf(shape: CardShape): { width: number; height: number } {
  return CARD_CANVAS[SHAPE_PROPORTION[shape]];
}

/**
 * Per-shape geometry. `margin` is the inset of the text-safe area from the outline;
 * `radius` is the corner radius of the rounded rectangle, in card units.
 */
export const SHAPE_GEOMETRY: Readonly<
  Record<CardShape, { margin: number; radius?: number; outline: string }>
> = {
  rectangle: { margin: 80, outline: "square corners" },
  "rounded-rectangle": { margin: 90, radius: 70, outline: "softly rounded corners" },
  arch: { margin: 80, outline: "flat bottom, semicircular top" },
  oval: { margin: 70, outline: "ellipse inscribed in the canvas" },
  square: { margin: 70, outline: "square corners" },
  circle: { margin: 70, outline: "circle inscribed in the canvas" },
};

/** Is card-unit point (x, y) inside the shape's outline? (Rounded corners are not subtracted.) */
export function insideOutline(shape: CardShape, x: number, y: number): boolean {
  const { width: w, height: h } = canvasOf(shape);
  switch (shape) {
    case "arch":
      return y >= w / 2 || Math.hypot(x - w / 2, y - w / 2) <= w / 2;
    case "oval":
      return ((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2 <= 1;
    case "circle":
      return Math.hypot(x - w / 2, y - h / 2) <= w / 2;
    default:
      return true;
  }
}

/** Is card-unit point (x, y) inside the shape's text-safe area? */
export function insideTextSafe(shape: CardShape, x: number, y: number): boolean {
  const { width: w, height: h } = canvasOf(shape);
  const m = SHAPE_GEOMETRY[shape].margin;
  switch (shape) {
    case "rectangle":
    case "rounded-rectangle":
    case "square":
      return x >= m && x <= w - m && y >= m && y <= h - m;
    case "arch": {
      const r = w / 2;
      if (x < m || x > w - m || y > h - m) return false;
      if (y >= r) return true;
      return Math.hypot(x - r, y - r) <= r - m;
    }
    case "oval": {
      const rx = w / 2 - m;
      const ry = h / 2 - m;
      return ((x - w / 2) / rx) ** 2 + ((y - h / 2) / ry) ** 2 <= 1;
    }
    case "circle":
      return Math.hypot(x - w / 2, y - h / 2) <= w / 2 - m;
  }
}
