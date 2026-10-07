import { beforeAll, describe, expect, it } from "vitest";

import { parseHex, relativeLuminance } from "./color";
import { type CardRect, paletteFromPixels } from "./ink";
import { layoutCard, pairingFaces } from "./layout-card";
import { zoneFor, type CardLayoutId } from "./layouts";
import { canvasOf, insideTextSafe, proportionOf, type CardShape } from "./shapes";
import { TYPICAL } from "./test-content";
import type { TextBox } from "./text-box";
import {
  COMFORTABLE,
  placeText,
  placeTextInAreas,
  SHIFT_STEP,
  shiftAllowed,
  shiftFits,
  shiftTextBoxes,
  textGroupAreas,
  type TextGroupAreas,
  type TextPlacement,
  WORKABLE,
} from "./text-space";
import type { FontMetricsResolver } from "./text/metrics";
import { allCuratedMetrics } from "./text/test-fonts";

/**
 * Where the generated card's words start on its artwork, and in which ink (`card_compiler_v7`,
 * owner decision 2026-10-07). Synthetic artwork at one pixel per card unit.
 */

let metrics: FontMetricsResolver;
beforeAll(async () => {
  metrics = await allCuratedMetrics();
});

const CREAM: [number, number, number] = [243, 233, 210];
const NAVY: [number, number, number] = [27, 42, 74];
const BROWN: [number, number, number] = [90, 58, 34];
/** Black and white 8 × 8 blocks: no ink reads over more than about half of it. */
const busy = (x: number, y: number): [number, number, number] =>
  (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? [0, 0, 0] : [255, 255, 255];

type Paint = (x: number, y: number) => [number, number, number];

/** An RGB artwork for `shape` at one pixel per card unit. */
function artwork(shape: CardShape, paint: Paint) {
  const { width, height } = canvasOf(shape);
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) pixels.set(paint(x, y), (y * width + x) * 3);
  }
  return { pixels, width, height };
}

/** The generated text layer for `layout` × `shape`, at the layout's position. */
function generated(layout: CardLayoutId, shape: CardShape): TextBox[] {
  return layoutCard({
    zone: zoneFor(layout, shape),
    proportion: proportionOf(shape),
    pairing: pairingFaces("hc_playfair_dmsans"),
    content: TYPICAL,
    ink: "#000000",
    metrics,
  }).boxes;
}

function place(layout: CardLayoutId, shape: CardShape, paint: Paint): TextPlacement {
  const art = artwork(shape, paint);
  return placeText({
    ...art,
    shape,
    zone: zoneFor(layout, shape),
    boxes: generated(layout, shape),
    metrics,
    palette: paletteFromPixels(art.pixels, art.width, art.height),
  });
}

/** The vertical extent of a group's areas. */
function extent(areas: readonly CardRect[]): { top: number; bottom: number } {
  return {
    top: Math.min(...areas.map((a) => a.y)),
    bottom: Math.max(...areas.map((a) => a.y + a.height)),
  };
}

function groups(layout: CardLayoutId, shape: CardShape): TextGroupAreas {
  return textGroupAreas(generated(layout, shape), metrics, zoneFor(layout, shape));
}

const lum = (hex: string) => relativeLuminance(parseHex(hex));

describe("placeText (card_compiler_v7)", () => {
  it("keeps clean artwork's words where the layout put them, in a readable ink", () => {
    const result = place("art-top", "rectangle", () => CREAM);
    expect(result.shift).toEqual({ heading: 0, details: 0 });
    expect(result.coverage).toBe(1);
    expect(result.workable).toBe(true);
    // Cream on cream reads nowhere: the tuned near-black does everywhere.
    expect(result.source).toBe("tuned-dark");
  });

  it("prefers an art colour that reads as well as a neutral", () => {
    // A brown subject above the words: the palette's brown reads on the cream behind them.
    const result = place("art-top", "rectangle", (x, y) =>
      y < 600 && x > 300 && x < 700 ? BROWN : CREAM,
    );
    expect(result.source).toBe("art");
    expect(result.ink).toBe("#5A3A22");
    expect(result.shift).toEqual({ heading: 0, details: 0 });
  });

  it("puts a near-white ink on dark artwork", () => {
    const result = place("cover-top", "square", () => NAVY);
    expect(result.source).toBe("tuned-light");
    expect(lum(result.ink)).toBeGreaterThan(0.85);
    expect(result.workable).toBe(true);
  });

  it("moves the words into the quiet part when a busy band lies under the layout's position", () => {
    const { heading, details } = groups("art-top", "rectangle");
    const bottom = extent(details).bottom;
    // Busy from 150 units above the stack's bottom down: the details sit on it.
    const bandTop = bottom - 150;
    const result = place("art-top", "rectangle", (x, y) => (y >= bandTop ? busy(x, y) : CREAM));
    expect(result.shift.heading).toBe(result.shift.details);
    expect(result.shift.heading).toBeLessThan(0);
    expect(Math.abs(result.shift.heading) % SHIFT_STEP).toBe(0);
    expect(result.coverage).toBeGreaterThanOrEqual(COMFORTABLE);
    expect(result.workable).toBe(true);
    // Up far enough to clear the band, and no further than that needs (one step of slack).
    expect(bottom + result.shift.details).toBeLessThanOrEqual(bandTop + SHIFT_STEP);
    expect(bottom + result.shift.details).toBeGreaterThan(bandTop - 2 * SHIFT_STEP);
    expect(shiftFits("rectangle", { heading, details }, result.shift)).toBe(true);
  });

  it("splits the heading from the details only when that is clearly better", () => {
    const { heading, details } = groups("art-top", "rectangle");
    const h = extent(heading);
    const d = extent(details);
    // Quiet only where the heading lands 60 up and the details 60 down: no single move reaches both.
    const quiet = (y: number) =>
      (y >= h.top - 60 - 5 && y < h.bottom - 60 + 5) ||
      (y >= d.top + 60 - 5 && y < d.bottom + 60 + 5);
    const result = place("art-top", "rectangle", (x, y) => (quiet(y) ? CREAM : busy(x, y)));
    expect(result.shift.heading).toBeLessThan(0);
    expect(result.shift.details).toBeGreaterThan(0);
    expect(result.coverage).toBeGreaterThanOrEqual(COMFORTABLE);
  });

  it("keeps the groups together when a single move is as good, even a longer one", () => {
    const { heading, details } = groups("art-top", "rectangle");
    const h = extent(heading);
    const d = extent(details);
    // A busy strip across the gap between the groups and 20 units into each. Moving them apart by
    // 20 each clears it; so does moving the whole stack up above it, into quiet cream.
    const strip = (y: number) => y >= h.bottom - 20 && y < d.top + 20;
    const result = place("art-top", "rectangle", (x, y) => (strip(y) ? busy(x, y) : CREAM));
    expect(result.shift.heading).toBe(result.shift.details);
    expect(result.shift.heading).toBeLessThan(-40);
    expect(result.coverage).toBeGreaterThanOrEqual(COMFORTABLE);
  });

  it("stays at the layout's position when that is comfortable, though a move would read better", () => {
    const { heading } = groups("art-top", "rectangle");
    const [first] = heading;
    // A small busy patch inside the title's first line: a few percent of the text's area.
    const patch = { x: first.x + 10, y: first.y + 4, width: 60, height: 20 };
    const result = place("art-top", "rectangle", (x, y) =>
      x >= patch.x && x < patch.x + patch.width && y >= patch.y && y < patch.y + patch.height
        ? busy(x, y)
        : CREAM,
    );
    expect(result.coverage).toBeGreaterThanOrEqual(COMFORTABLE);
    expect(result.coverage).toBeLessThan(1);
    expect(result.shift).toEqual({ heading: 0, details: 0 });
  });

  it("says when nothing is workable", () => {
    const result = place("art-top", "rectangle", busy);
    expect(result.workable).toBe(false);
    expect(result.coverage).toBeLessThan(WORKABLE);
  });

  it.each([
    ["art-bottom", "arch"],
    ["atmosphere", "oval"],
    ["framed", "circle"],
    ["art-top", "square"],
  ] as const)("never moves the words out of the text-safe area: %s on %s", (layout, shape) => {
    // Quiet only at the very top of the canvas, outside the text-safe area; busy elsewhere.
    const result = place(layout, shape, (x, y) => (y < 60 ? CREAM : busy(x, y)));
    const areas = groups(layout, shape);
    expect(shiftAllowed(shape, areas.heading, result.shift.heading)).toBe(true);
    expect(shiftAllowed(shape, areas.details, result.shift.details)).toBe(true);
    for (const [group, dy] of [
      [areas.heading, result.shift.heading],
      [areas.details, result.shift.details],
    ] as const) {
      for (const a of group) {
        for (const [x, y] of [
          [a.x, a.y + dy],
          [a.x + a.width, a.y + dy],
          [a.x, a.y + a.height + dy],
          [a.x + a.width, a.y + a.height + dy],
        ]) {
          expect(insideTextSafe(shape, x, y), `${layout}/${shape} ${x},${y}`).toBe(true);
        }
      }
    }
    expect(result.shift.details).toBeGreaterThanOrEqual(result.shift.heading);
  });

  it("is deterministic, and refuses artwork of the wrong proportion or nothing to measure", () => {
    const paint: Paint = (x, y) => (y > 1000 ? busy(x, y) : CREAM);
    expect(place("art-top", "rectangle", paint)).toEqual(place("art-top", "rectangle", paint));
    const square = artwork("square", () => CREAM);
    expect(() =>
      placeTextInAreas({
        ...square,
        shape: "rectangle",
        areas: groups("art-top", "rectangle"),
        palette: [],
      }),
    ).toThrow(/proportion/);
    const art = artwork("rectangle", () => CREAM);
    expect(() =>
      placeTextInAreas({
        ...art,
        shape: "rectangle",
        areas: { heading: [], details: [] },
        palette: [],
      }),
    ).toThrow(/no line areas/);
  });

  it("judges workable space on the best ink, not on a preferred art colour just short of it", () => {
    // Inside the zone: 84.8% cream (both dark inks read), 0.8% grey (only the near-black reads),
    // 14.4% black. The palette's brown is within the tolerance of the best but short of workable.
    const zone = { x: 100, y: 800, width: 800, height: 500 };
    const art = artwork("rectangle", (x, y) => {
      // A mid grey around the zone, where no candidate ink reads, so no move reads better.
      if (y < 800 || y >= 1300) return [118, 118, 118];
      const row = y - 800;
      return row < 424 ? CREAM : row < 428 ? [150, 150, 150] : [0, 0, 0];
    });
    const result = placeTextInAreas({
      ...art,
      shape: "rectangle",
      areas: { heading: [zone], details: [] },
      palette: [{ color: "#5A3A22", share: 1 }],
    });
    expect(result.shift).toEqual({ heading: 0, details: 0 });
    expect(result.source).toBe("tuned-dark");
    expect(result.coverage).toBeGreaterThanOrEqual(WORKABLE);
    expect(result.workable).toBe(true);
  });

  it("measures a whole zone as one heading group", () => {
    const zone = zoneFor("art-top", "rectangle");
    const art = artwork("rectangle", () => CREAM);
    const result = placeTextInAreas({
      ...art,
      shape: "rectangle",
      areas: { heading: [zone], details: [] },
      palette: [],
    });
    expect(result).toMatchObject({
      coverage: 1,
      workable: true,
      shift: { heading: 0, details: 0 },
    });
  });
});

describe("shifting the text layer", () => {
  it("moves heading boxes by the heading shift and every other box by the details shift", () => {
    const boxes = generated("art-top", "rectangle");
    const moved = shiftTextBoxes(boxes, { heading: -40, details: 20 });
    for (const [i, box] of boxes.entries()) {
      const dy = box.id === "title" || box.id === "invitationLine" ? -40 : 20;
      expect(moved[i]).toEqual({ ...box, y: Math.round((box.y + dy) * 1000) / 1000 });
    }
  });

  it("refuses a placement that reorders the groups or leaves the text-safe area", () => {
    const areas = groups("art-top", "rectangle");
    expect(shiftFits("rectangle", areas, { heading: 0, details: 0 })).toBe(true);
    expect(shiftFits("rectangle", areas, { heading: -50, details: -50 })).toBe(true);
    expect(shiftFits("rectangle", areas, { heading: 10, details: -10 })).toBe(false);
    // Below the rectangle's text-safe bottom (1320).
    expect(shiftFits("rectangle", areas, { heading: 0, details: 400 })).toBe(false);
  });
});
