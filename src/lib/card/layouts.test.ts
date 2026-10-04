import { describe, expect, it } from "vitest";

import { ART_MODES } from "./art-modes";
import {
  artModeCompatible,
  CARD_LAYOUT_IDS,
  CARD_LAYOUT_SET_VERSION,
  CARD_LAYOUTS,
  layoutArtFor,
  layoutSupportsShape,
  panelFor,
  zoneFor,
} from "./layouts";
import { CARD_SHAPES, canvasOf, insideOutline, insideTextSafe, SHAPE_GEOMETRY } from "./shapes";

describe("layout set card_layouts_v2", () => {
  it("is versioned", () => {
    expect(CARD_LAYOUT_SET_VERSION).toBe("card_layouts_v2");
  });

  it("has exactly the five layouts", () => {
    expect(CARD_LAYOUT_IDS).toEqual(["art-top", "art-bottom", "framed", "corners", "atmosphere"]);
    expect(Object.keys(CARD_LAYOUTS)).toEqual([...CARD_LAYOUT_IDS]);
  });

  it("supports shapes as decided: corners excludes arch, oval and circle; pictures above or below exclude circle", () => {
    expect(CARD_LAYOUTS.corners.shapes).toEqual(["rectangle", "rounded-rectangle", "square"]);
    for (const id of ["art-top", "art-bottom"] as const) {
      expect(CARD_LAYOUTS[id].shapes).toEqual([
        "rectangle",
        "rounded-rectangle",
        "arch",
        "oval",
        "square",
      ]);
    }
    for (const id of ["framed", "atmosphere"] as const) {
      expect(CARD_LAYOUTS[id].shapes).toEqual([...CARD_SHAPES]);
    }
    expect(layoutSupportsShape("corners", "circle")).toBe(false);
    expect(layoutSupportsShape("art-top", "circle")).toBe(false);
    expect(layoutSupportsShape("art-bottom", "circle")).toBe(false);
    expect(layoutSupportsShape("framed", "circle")).toBe(true);
    // Every shape is offered by some layout.
    for (const shape of CARD_SHAPES) {
      expect(
        CARD_LAYOUT_IDS.some((l) => layoutSupportsShape(l, shape)),
        shape,
      ).toBe(true);
    }
  });

  it("lists exactly the shapes it has art for, in CARD_SHAPES order", () => {
    for (const id of CARD_LAYOUT_IDS) {
      const { art, shapes } = CARD_LAYOUTS[id];
      expect(CARD_SHAPES.filter((s) => art[s] !== undefined)).toEqual([...shapes]);
      for (const shape of CARD_SHAPES.filter((s) => !shapes.includes(s))) {
        expect(() => layoutArtFor(id, shape)).toThrow(/does not support/);
      }
    }
  });

  it("gives the picture 40% of a square, oval or arch card and keeps the text in the other 60%", () => {
    for (const id of ["art-top", "art-bottom"] as const) {
      for (const shape of CARD_LAYOUTS[id].shapes) {
        const art = layoutArtFor(id, shape);
        const fortyPercent = shape === "square" || shape === "oval" || shape === "arch";
        expect(art.clear, `${id}/${shape}`).toEqual({
          edge: id === "art-top" ? "bottom" : "top",
          percent: fortyPercent ? 60 : 45,
        });
      }
    }
    expect(layoutArtFor("art-top", "oval").composition).toContain("upper 40% of the canvas");
    expect(layoutArtFor("art-bottom", "square").composition).toContain(
      "rising through the lower 40%",
    );
    // The half-card wording is Phase 3's, unchanged, where the band is unchanged.
    expect(layoutArtFor("art-top", "rectangle").composition).toContain("upper half of the canvas");
  });

  it("keeps every band inside the region its composition keeps clear, at least 30 units from the picture", () => {
    for (const id of CARD_LAYOUT_IDS) {
      for (const shape of CARD_LAYOUTS[id].shapes) {
        const { band, clear, composition } = layoutArtFor(id, shape);
        if (!clear) continue;
        const label = `${id}/${shape}`;
        const h = canvasOf(shape).height;
        // The composition names the share it keeps clear.
        expect(composition, label).toContain(`the ${clear.edge} ${clear.percent}%`);
        if (clear.edge === "bottom") {
          expect(band.top, label).toBeGreaterThanOrEqual((h * (100 - clear.percent)) / 100 + 30);
        } else {
          expect(band.bottom, label).toBeLessThanOrEqual((h * clear.percent) / 100 - 30);
        }
      }
    }
  });

  it("uses the decided bands", () => {
    const bands = Object.fromEntries(
      CARD_LAYOUT_IDS.flatMap((id) =>
        CARD_LAYOUTS[id].shapes.map((shape) => {
          const { top, bottom } = layoutArtFor(id, shape).band;
          return [`${id}/${shape}`, `${top}-${bottom}`];
        }),
      ),
    );
    expect(bands).toEqual({
      "art-top/rectangle": "800-1250",
      "art-top/rounded-rectangle": "800-1250",
      "art-top/arch": "600-1260",
      "art-top/oval": "600-1180",
      "art-top/square": "440-920",
      "art-bottom/rectangle": "150-600",
      "art-bottom/rounded-rectangle": "150-600",
      "art-bottom/arch": "240-800",
      "art-bottom/oval": "220-800",
      "art-bottom/square": "80-560",
      "framed/rectangle": "400-1000",
      "framed/rounded-rectangle": "400-1000",
      "framed/arch": "400-1000",
      "framed/oval": "400-1000",
      "framed/square": "260-740",
      "framed/circle": "260-740",
      "corners/rectangle": "420-980",
      "corners/rounded-rectangle": "420-980",
      "corners/square": "260-740",
      "atmosphere/rectangle": "400-1000",
      "atmosphere/rounded-rectangle": "400-1000",
      "atmosphere/arch": "400-1000",
      "atmosphere/oval": "400-1000",
      "atmosphere/square": "260-740",
      "atmosphere/circle": "260-740",
    });
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
        const { band } = layoutArtFor(layout, shape);
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
