import { describe, expect, it } from "vitest";

import { contrastRatio, formatHex, parseHex, rgbToOklch } from "./color";
import {
  choosePlate,
  CROP_SCALES,
  cropRect,
  EVEN_DELTA_E,
  EVEN_SHARE,
  PLATE_SCALES,
  plateCut,
  plateRect,
  resolveZoneLegibility,
  type GiveWayInput,
} from "./give-way";
import {
  MIN_INK_CONTRAST,
  paletteFromPixels,
  paperColor,
  sampleZoneLuminance,
  type CardRect,
} from "./ink";
import { CARD_LAYOUTS, CUT_PADDING, zoneFor, type CardLayoutId, type GiveWaySpec } from "./layouts";
import type { CardShape } from "./shapes";

/**
 * The art gives way (`card_layouts_v4`, `give-way.ts`): crop, plate and the centred low-contrast
 * case, on small synthetic artwork (0.2 pixels per card unit).
 */

const W = 200;
const H57 = 280;
const PX = W / 1000;

type Rgb = [number, number, number];
const CREAM: Rgb = [238, 228, 212];
const NAVY: Rgb = [27, 42, 74];
const hex = (c: Rgb) => formatHex({ r: c[0], g: c[1], b: c[2] });

function image(width: number, height: number, at: (x: number, y: number) => Rgb): Uint8Array {
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) out.set(at(x, y), (y * width + x) * 3);
  }
  return out;
}

/** A 5:7 artwork: `ground` from card-unit row `from` to the bottom, `paper` above. */
const grounded = (from: number, ground: Rgb = NAVY, paper: Rgb = CREAM) =>
  image(W, H57, (_x, y) => ((y + 0.5) / PX >= from ? ground : paper));

/** A 5:7 artwork: `subject` from the top down to card-unit row `to`, `paper` below. */
const hanging = (to: number, subject: Rgb = NAVY, paper: Rgb = CREAM) =>
  image(W, H57, (_x, y) => ((y + 0.5) / PX < to ? subject : paper));

function input(
  pixels: Uint8Array,
  layout: CardLayoutId,
  shape: CardShape,
  height = H57,
): GiveWayInput {
  return {
    pixels,
    width: W,
    height,
    layout,
    shape,
    palette: paletteFromPixels(pixels, W, height),
    areas: null,
  };
}

const edge = (layout: "art-top" | "art-bottom") =>
  CARD_LAYOUTS[layout].giveWay as Extract<GiveWaySpec, { kind: "edge" }>;

describe("geometry", () => {
  it("scales a crop about the midpoint of the words' edge, keeping full bleed", () => {
    expect(CROP_SCALES).toEqual([1.08, 1.16]);
    expect(cropRect(edge("art-bottom"), "rectangle", 1.08)).toEqual({
      x: -40,
      y: 0,
      width: 1080,
      height: 1512,
    });
    expect(cropRect(edge("art-bottom"), "square", 1.16)).toEqual({
      x: -80,
      y: 0,
      width: 1160,
      height: 1160,
    });
  });

  it("scales a plate with the outline about the midpoint of the picture's outer edge", () => {
    expect(PLATE_SCALES).toEqual([1, 0.9, 0.8, 0.7, 0.6]);
    // Picture at the top: anchored top-centre.
    expect(plateRect(edge("art-top"), "rectangle", 0.6)).toEqual({
      x: 200,
      y: 0,
      width: 600,
      height: 840,
    });
    // Picture at the bottom: anchored bottom-centre.
    expect(plateRect(edge("art-bottom"), "oval", 0.8)).toEqual({
      x: 100,
      y: 280,
      width: 800,
      height: 1120,
    });
    // At 1 the plate is the canvas: a plain crop at the cut.
    expect(plateRect(edge("art-top"), "square", 1)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 1000,
    });
  });

  it("cuts straight at the text zone's edge facing the picture, padded toward it", () => {
    expect(plateCut(edge("art-top"), zoneFor("art-top", "rectangle"))).toEqual({
      y: 800 - CUT_PADDING,
      keep: "above",
    });
    expect(plateCut(edge("art-bottom"), zoneFor("art-bottom", "arch"))).toEqual({
      y: 800 + CUT_PADDING,
      keep: "below",
    });
  });

  it("samples a zone on the art as a crop draws it", () => {
    // Navy from row 560: the rectangle 500–600 is 40% navy as painted, all cream at 1.08.
    const pixels = grounded(560);
    const rect: CardRect = { x: 100, y: 500, width: 800, height: 100 };
    const inside = () => true;
    const painted = sampleZoneLuminance(pixels, W, H57, rect, inside);
    const cropped = sampleZoneLuminance(
      pixels,
      W,
      H57,
      rect,
      inside,
      cropRect(edge("art-bottom"), "rectangle", 1.08),
    );
    expect(painted[0]).toBeLessThan(0.1);
    expect(cropped[0]).toBeGreaterThan(0.7);
    // The art as painted, given as its own rectangle, samples the same pixels.
    const identity = sampleZoneLuminance(pixels, W, H57, rect, inside, {
      x: 0,
      y: 0,
      width: 1000,
      height: 1400,
    });
    expect([...identity]).toEqual([...painted]);
  });
});

describe("resolveZoneLegibility", () => {
  it("leaves art an ink clears on as it is", () => {
    const result = resolveZoneLegibility(input(hanging(500), "art-top", "rectangle"));
    expect(result.kind).toBe("clear");
  });

  describe("crop (art-bottom on rectangle, rounded rectangle and square)", () => {
    it("accepts the first scale at which an ink clears", () => {
      // The ground's edge at 560: 1.08 pushes it to 605, below the 150–600 zone.
      const result = resolveZoneLegibility(input(grounded(560), "art-bottom", "rectangle"));
      expect(result).toMatchObject({
        kind: "crop",
        scale: 1.08,
        placement: { kind: "crop", art: cropRect(edge("art-bottom"), "rectangle", 1.08) },
      });
      if (result.kind !== "crop") throw new Error("unreachable");
      expect(result.ink.cleared).toBe(true);
      expect(result.placement).not.toHaveProperty("cut");
      expect(result.placement).not.toHaveProperty("fill");
      expect(contrastRatio(result.ink.ink, hex(CREAM))).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
    });

    it("tries 1.16 when 1.08 is not enough", () => {
      // The ground from 500 is 13% of the zone after 1.08 (rows 540–600), over the 8% tail; after
      // 1.16 it is 4% (rows 580–600), which the tail leaves out.
      const result = resolveZoneLegibility(input(grounded(500), "art-bottom", "rounded-rectangle"));
      expect(result).toMatchObject({ kind: "crop", scale: 1.16 });
    });

    it("falls back to a plate when no crop clears", () => {
      // 450 × 1.16 = 522: the ground still crosses the zone.
      const result = resolveZoneLegibility(input(grounded(450), "art-bottom", "rectangle"));
      expect(result.kind).toBe("plate");
    });

    it("never crops art-top (a subject's head) or an arch or oval", () => {
      expect(edge("art-top").cropShapes).toEqual([]);
      for (const shape of ["arch", "oval"] as const) {
        // 80 rows of the zone (14%): a crop at 1.08 would leave 4%, but the shape takes a plate.
        const result = resolveZoneLegibility(input(grounded(720), "art-bottom", shape));
        expect(result.kind, shape).toBe("plate");
      }
      const top = resolveZoneLegibility(input(hanging(880), "art-top", "rectangle"));
      expect(top.kind).toBe("plate");
    });
  });

  describe("plate", () => {
    it("chooses the largest scale whose cut hides only even background", () => {
      // art-bottom rectangle: cut at 630. The ground from 450 is hidden at 1 (29%) and 0.9 (17%);
      // at 0.8 the cut hides only rows above 437.5: cream.
      const result = resolveZoneLegibility(input(grounded(450), "art-bottom", "rectangle"));
      expect(result).toMatchObject({
        kind: "plate",
        scale: 0.8,
        fill: "dominant",
        evenness: 1,
        placement: {
          kind: "plate",
          art: { x: 100, y: 280, width: 800, height: 1120 },
          cut: { y: 630, keep: "below" },
          fill: hex(CREAM),
        },
      });
      if (result.kind !== "plate") throw new Error("unreachable");
      expect(contrastRatio(result.ink, hex(CREAM))).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
      expect(result.contrast).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
    });

    it("hides an even cut at full size: a plain crop at the cut with the background as fill", () => {
      // Grain of ±4 levels on cream, under a narrow navy subject (400–600 across) that hangs to
      // 820: into the area behind the title's first line (800–860, a sixth of it navy), so no ink
      // clears there; the cut at 770 hides 50 rows × 200 units of it, 1.6% of what it hides.
      const grain = image(W, H57, (x, y) => {
        const cx = (x + 0.5) / PX;
        if ((y + 0.5) / PX < 820 && cx >= 400 && cx < 600) return NAVY;
        const n = ((x * 7 + y * 13) % 9) - 4;
        return [CREAM[0] + n, CREAM[1] + n, CREAM[2] + n];
      });
      const titleLine: CardRect = { x: 300, y: 800, width: 400, height: 60 };
      const result = resolveZoneLegibility({
        ...input(grain, "art-top", "rectangle"),
        areas: [titleLine],
      });
      expect(result.kind).toBe("plate");
      if (result.kind !== "plate") throw new Error("unreachable");
      expect(result.scale).toBe(1);
      expect(result.evenness).toBeGreaterThanOrEqual(EVEN_SHARE);
      expect(result.placement.art).toEqual({ x: 0, y: 0, width: 1000, height: 1400 });
      // The fill is the grain's own colour, within the evenness tolerance of the cream.
      const fill = rgbToOklch(parseHex(result.placement.fill!));
      expect(Math.abs(fill.l - rgbToOklch(parseHex(hex(CREAM))).l)).toBeLessThan(EVEN_DELTA_E);
    });

    it("uses the smallest scale when every cut hides busy art", () => {
      const checker = image(W, H57, (x, y) => ((x + y) % 2 ? [0, 0, 0] : [255, 255, 255]));
      const plate = choosePlate(input(checker, "art-top", "rectangle"));
      expect(plate.scale).toBe(0.6);
      expect(plate.hidden.evenness).toBeLessThan(EVEN_SHARE);
      const result = resolveZoneLegibility(input(checker, "art-top", "rectangle"));
      expect(result).toMatchObject({ kind: "plate", scale: 0.6 });
    });

    it("counts a subject crossing the cut as uneven, beyond the 3% the even share allows", () => {
      // Picture at the top: a subject hanging to 900 on 40% of the width, over flat cream.
      const subject = image(W, H57, (x, y) =>
        (y + 0.5) / PX < 900 && x >= 60 && x < 140 ? NAVY : CREAM,
      );
      const plate = choosePlate(input(subject, "art-top", "rectangle"));
      // At 1 the cut (770) hides 130 rows × 40% of it: uneven. At 0.9 it hides rows over 855.6:
      // 44 rows × 40% of 544 rows, still over 3%. At 0.8 (rows over 962.5): cream alone.
      expect(plate.scale).toBe(0.8);
      expect(plate.hidden.evenness).toBe(1);
    });

    it("falls back to the paper when no ink clears on the dominant colour", () => {
      // Mid grey: neither the tuned dark nor the tuned light reaches 4.5:1 on it.
      const grey: Rgb = [119, 119, 119];
      const pixels = hanging(900, NAVY, grey);
      const result = resolveZoneLegibility(input(pixels, "art-top", "rectangle"));
      expect(result.kind).toBe("plate");
      if (result.kind !== "plate") throw new Error("unreachable");
      expect(result.fill).toBe("paper");
      const palette = paletteFromPixels(pixels, W, H57);
      expect(result.placement.fill).toBe(paperColor(palette));
      expect(contrastRatio(result.ink, result.placement.fill!)).toBeGreaterThanOrEqual(
        MIN_INK_CONTRAST,
      );
    });

    it("keeps every plate inside the card and the text zone on the fill, for every edge layout × shape", () => {
      for (const layout of ["art-top", "art-bottom"] as const) {
        for (const shape of CARD_LAYOUTS[layout].shapes) {
          const zone = zoneFor(layout, shape);
          const cut = plateCut(edge(layout), zone);
          for (const s of PLATE_SCALES) {
            const art = plateRect(edge(layout), shape, s);
            const label = `${layout}/${shape}@${s}`;
            expect(art.x, label).toBeGreaterThanOrEqual(0);
            expect(art.y, label).toBeGreaterThanOrEqual(0);
            expect(art.x + art.width, label).toBeLessThanOrEqual(1000);
            expect(art.y + art.height, label).toBeLessThanOrEqual(shape === "square" ? 1000 : 1400);
          }
          // The zone lies wholly on the words' side of the cut.
          if (cut.keep === "above") expect(zone.y, layout).toBeGreaterThan(cut.y);
          else expect(zone.y + zone.height, layout).toBeLessThan(cut.y);
        }
      }
    });

    it("plates a square card too", () => {
      const square = image(W, W, (_x, y) => ((y + 0.5) / PX < 500 ? NAVY : CREAM));
      const result = resolveZoneLegibility({
        ...input(square, "art-top", "square", W),
        palette: paletteFromPixels(square, W, W),
      });
      expect(result.kind).toBe("plate");
      if (result.kind !== "plate") throw new Error("unreachable");
      expect(result.placement.cut).toEqual({ y: 410, keep: "above" });
    });
  });

  describe("centred words (framed, corners, atmosphere)", () => {
    it("keeps the best ink, below 4.5:1, with nothing moved and nothing behind", () => {
      const checker = image(W, H57, (x, y) => ((x + y) % 2 ? NAVY : CREAM));
      for (const layout of ["framed", "corners", "atmosphere"] as const) {
        const result = resolveZoneLegibility(input(checker, layout, "rectangle"));
        expect(result.kind, layout).toBe("low-contrast");
        if (result.kind !== "low-contrast") throw new Error("unreachable");
        expect(result.ink.cleared).toBe(false);
        expect(result.ink.contrast).toBeLessThan(MIN_INK_CONTRAST);
        expect(result).not.toHaveProperty("placement");
      }
    });

    it("is clear when an ink clears, as before", () => {
      const calm = image(W, H57, () => CREAM);
      expect(resolveZoneLegibility(input(calm, "framed", "rectangle")).kind).toBe("clear");
    });
  });

  it("is deterministic", () => {
    const pixels = grounded(450);
    expect(resolveZoneLegibility(input(pixels, "art-bottom", "rectangle"))).toEqual(
      resolveZoneLegibility(input(pixels, "art-bottom", "rectangle")),
    );
  });
});
