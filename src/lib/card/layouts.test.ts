import { describe, expect, it } from "vitest";

import { ART_MODES } from "./art-modes";
import {
  artModeCompatible,
  CARD_LAYOUT_IDS,
  CARD_LAYOUT_SET_VERSION,
  CARD_LAYOUTS,
  layoutSupportsShape,
  panelFor,
  zoneFor,
} from "./layouts";
import {
  CARD_SHAPES,
  canvasOf,
  insideOutline,
  insideTextSafe,
  SHAPE_GEOMETRY,
  SHAPE_PROPORTION,
} from "./shapes";

describe("layout set card_layouts_v1", () => {
  it("is versioned", () => {
    expect(CARD_LAYOUT_SET_VERSION).toBe("card_layouts_v1");
  });

  it("has exactly the five layouts", () => {
    expect(CARD_LAYOUT_IDS).toEqual(["art-top", "art-bottom", "framed", "corners", "atmosphere"]);
    expect(Object.keys(CARD_LAYOUTS)).toEqual([...CARD_LAYOUT_IDS]);
  });

  it("supports shapes as validated: corners excludes arch, oval and circle", () => {
    expect(CARD_LAYOUTS.corners.shapes).toEqual(["rectangle", "rounded-rectangle", "square"]);
    for (const id of CARD_LAYOUT_IDS.filter((l) => l !== "corners")) {
      expect(CARD_LAYOUTS[id].shapes).toEqual([...CARD_SHAPES]);
    }
    expect(layoutSupportsShape("corners", "circle")).toBe(false);
    expect(layoutSupportsShape("art-top", "circle")).toBe(true);
  });

  it("pairs layouts with compatible art modes", () => {
    expect(artModeCompatible("art-top", "illustration")).toBe(true);
    expect(artModeCompatible("art-top", "atmosphere")).toBe(false);
    expect(artModeCompatible("framed", "minimal")).toBe(true);
    expect(artModeCompatible("corners", "framed")).toBe(true);
    expect(artModeCompatible("atmosphere", "illustration")).toBe(false);
    for (const mode of ART_MODES) {
      expect(CARD_LAYOUT_IDS.some((l) => artModeCompatible(l, mode))).toBe(true);
    }
  });

  it("gives every supported layout x shape a positive, text-safe zone", () => {
    for (const layout of CARD_LAYOUT_IDS) {
      for (const shape of CARD_LAYOUTS[layout].shapes) {
        const zone = zoneFor(layout, shape);
        const { width: w } = canvasOf(shape);
        expect(zone.width, `${layout}/${shape}`).toBeGreaterThan(0);
        expect(zone.height).toBeGreaterThan(0);
        expect(zone.x + zone.width / 2).toBeCloseTo(w / 2);
        expect(zone.width).toBeLessThanOrEqual(CARD_LAYOUTS[layout].maxWidth);
        const band = CARD_LAYOUTS[layout].band[SHAPE_PROPORTION[shape]];
        expect(zone.y).toBe(band.top);
        expect(zone.height).toBe(band.bottom - band.top);
        for (let y = band.top; y <= band.bottom; y += 1) {
          expect(insideTextSafe(shape, zone.x, y), `${layout}/${shape} left @${y}`).toBe(true);
          expect(insideTextSafe(shape, zone.x + zone.width, y)).toBe(true);
        }
      }
    }
  });

  it("matches validated zone values", () => {
    expect(zoneFor("art-top", "rectangle")).toEqual({ x: 120, y: 800, width: 760, height: 450 });
    expect(zoneFor("framed", "square").width).toBe(620);
  });

  it("refuses an unsupported shape", () => {
    expect(() => zoneFor("corners", "oval")).toThrow(/does not support/);
    expect(() => panelFor("corners", "oval")).toThrow(/does not support/);
  });

  it("gives every layout the Phase 3 legibility panel: the zone padded 40 × 30, radius 28", () => {
    for (const layout of CARD_LAYOUT_IDS) {
      expect(CARD_LAYOUTS[layout].panel).toEqual({
        padX: 40,
        padY: 30,
        radius: 28,
        softEdge: { spread: 20, blur: 40 },
      });
    }
    expect(panelFor("art-top", "rectangle")).toEqual({
      x: 80,
      y: 770,
      width: 840,
      height: 510,
      radius: 28,
      softEdge: { spread: 20, blur: 40 },
    });
  });

  it("backs every point of the zone with panel, inside the outline, for every layout x shape", () => {
    /** Inside the panel's rounded rectangle. */
    const inPanel = (p: ReturnType<typeof panelFor>, x: number, y: number): boolean => {
      if (x < p.x || x > p.x + p.width || y < p.y || y > p.y + p.height) return false;
      const cx = Math.min(Math.max(x, p.x + p.radius), p.x + p.width - p.radius);
      const cy = Math.min(Math.max(y, p.y + p.radius), p.y + p.height - p.radius);
      return Math.hypot(x - cx, y - cy) <= p.radius;
    };
    /** Inside the drawn outline: `insideOutline` with the rounded rectangle's corners cut. */
    const inOutline = (shape: (typeof CARD_SHAPES)[number], x: number, y: number): boolean => {
      if (!insideOutline(shape, x, y)) return false;
      if (shape !== "rounded-rectangle") return true;
      const { width: w, height: h } = canvasOf(shape);
      const r = SHAPE_GEOMETRY[shape].radius!;
      const cx = Math.min(Math.max(x, r), w - r);
      const cy = Math.min(Math.max(y, r), h - r);
      return Math.hypot(x - cx, y - cy) <= r;
    };
    for (const layout of CARD_LAYOUT_IDS) {
      for (const shape of CARD_LAYOUTS[layout].shapes) {
        const zone = zoneFor(layout, shape);
        const panel = panelFor(layout, shape);
        const { width: w, height: h } = canvasOf(shape);
        const label = `${layout}/${shape}`;
        // Within the canvas, and padded beyond the zone on every side.
        expect(panel.x, label).toBeGreaterThanOrEqual(0);
        expect(panel.y, label).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width, label).toBeLessThanOrEqual(w);
        expect(panel.y + panel.height, label).toBeLessThanOrEqual(h);
        expect(zone.x - panel.x, label).toBe(40);
        expect(zone.y - panel.y, label).toBe(30);
        expect(panel.x + panel.width - (zone.x + zone.width), label).toBe(40);
        expect(panel.y + panel.height - (zone.y + zone.height), label).toBe(30);
        const missed: string[] = [];
        for (let y = zone.y; y <= zone.y + zone.height; y += 5) {
          for (let x = zone.x; x <= zone.x + zone.width; x += 5) {
            if (!(inPanel(panel, x, y) && inOutline(shape, x, y))) missed.push(`${x},${y}`);
          }
        }
        expect(missed, label).toEqual([]);
      }
    }
  });
});
