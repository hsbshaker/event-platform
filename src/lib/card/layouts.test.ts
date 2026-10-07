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

describe("layout set card_layouts_v6", () => {
  it("is versioned", () => {
    expect(CARD_LAYOUT_SET_VERSION).toBe("card_layouts_v6");
  });

  it("has exactly the seven layouts", () => {
    expect(CARD_LAYOUT_IDS).toEqual([
      "art-top",
      "art-bottom",
      "framed",
      "corners",
      "atmosphere",
      "cover-top",
      "cover-bottom",
    ]);
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

  it("states the square cards' calm centre as the middle 50%, matching their 260–740 band", () => {
    for (const [layout, shape] of [
      ["framed", "square"],
      ["framed", "circle"],
      ["corners", "square"],
    ] as const) {
      const { composition } = layoutArtFor(layout, shape);
      expect(composition, `${layout}/${shape}`).toMatch(/50% of the height/);
      expect(composition, `${layout}/${shape}`).not.toMatch(/45%/);
    }
    expect(layoutArtFor("framed", "rectangle").composition).toMatch(/middle 45% of the height/);
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
      "cover-top/rectangle": "150-600",
      "cover-top/rounded-rectangle": "150-600",
      "cover-top/square": "80-560",
      "cover-bottom/rectangle": "800-1250",
      "cover-bottom/rounded-rectangle": "800-1250",
      "cover-bottom/square": "440-920",
    });
  });

  it("sets a cover's words in its picture's own band: art-bottom's and art-top's zones, full bleed", () => {
    // The same zones, so no slot limit or stored host text changes (`entry-fit.server.ts`).
    for (const shape of ["rectangle", "rounded-rectangle", "square"] as const) {
      expect(zoneFor("cover-top", shape), shape).toEqual(zoneFor("art-bottom", shape));
      expect(zoneFor("cover-bottom", shape), shape).toEqual(zoneFor("art-top", shape));
    }
    expect(CARD_LAYOUTS["cover-top"].shapes).toEqual(["rectangle", "rounded-rectangle", "square"]);
    expect(CARD_LAYOUTS["cover-bottom"].shapes).toEqual([
      "rectangle",
      "rounded-rectangle",
      "square",
    ]);
    expect(CARD_LAYOUTS["cover-top"].artModes).toEqual(["illustration"]);
    expect(CARD_LAYOUTS["cover-bottom"].artModes).toEqual(["illustration"]);
    // Their panels are the picture layouts' too: from the words' edge, fading toward the picture.
    expect(CARD_LAYOUTS["cover-top"].panel).toEqual(CARD_LAYOUTS["art-bottom"].panel);
    expect(CARD_LAYOUTS["cover-bottom"].panel).toEqual(CARD_LAYOUTS["art-top"].panel);
    for (const id of ["cover-top", "cover-bottom"] as const) {
      for (const shape of CARD_LAYOUTS[id].shapes) {
        const { composition, presence } = layoutArtFor(id, shape);
        const text = `${composition} ${presence}`;
        expect(text, `${id}/${shape}`).toMatch(/edge to edge/);
        expect(text, `${id}/${shape}`).toMatch(/no border, frame or paper margin/);
        // An image model asked for a cover, poster or sleeve letters it.
        expect(text, `${id}/${shape}`).not.toMatch(/\b(album|cover|poster|sleeve|magazine)\b/i);
      }
    }
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

  it("fades the panel by layout: from the words' end of the card, or a wash around them", () => {
    const fromTop = { kind: "edge", from: "top", length: 180 };
    const fromBottom = { kind: "edge", from: "bottom", length: 180 };
    const wash = { kind: "wash", feather: 70 };
    const want = {
      "art-top": fromBottom,
      "art-bottom": fromTop,
      framed: wash,
      corners: wash,
      atmosphere: wash,
      "cover-top": fromTop,
      "cover-bottom": fromBottom,
    } as const;
    for (const layout of CARD_LAYOUT_IDS) {
      expect(CARD_LAYOUTS[layout].panel, layout).toEqual({
        padX: 40,
        padY: 30,
        fade: want[layout],
      });
    }
    // Words above the picture: paper from the top edge, full width, to the zone's bottom + 30.
    expect(panelFor("art-bottom", "rectangle")).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 630,
      radius: 0,
      softEdge: { spread: 0, blur: 0 },
      fade: fromTop,
    });
    // Words below the picture: from the zone's top - 30 down to the bottom edge.
    expect(panelFor("art-top", "rectangle")).toEqual({
      x: 0,
      y: 770,
      width: 1000,
      height: 630,
      radius: 0,
      softEdge: { spread: 0, blur: 0 },
      fade: fromBottom,
    });
    // Words in the middle: the zone padded 40 × 30.
    const zone = zoneFor("framed", "rectangle");
    expect(panelFor("framed", "rectangle")).toEqual({
      x: zone.x - 40,
      y: zone.y - 30,
      width: zone.width + 80,
      height: zone.height + 60,
      radius: 0,
      softEdge: { spread: 0, blur: 0 },
      fade: wash,
    });
  });

  it("puts an edge fade's opaque paper at the words' end of the card, the fade toward the picture", () => {
    for (const layout of ["art-top", "art-bottom"] as const) {
      for (const shape of CARD_LAYOUTS[layout].shapes) {
        const panel = panelFor(layout, shape);
        const { width: w, height: h } = canvasOf(shape);
        const { clear } = layoutArtFor(layout, shape);
        const label = `${layout}/${shape}`;
        expect([panel.x, panel.width], label).toEqual([0, w]);
        if (layout === "art-bottom") {
          expect(panel.y, label).toBe(0);
          // The opaque paper ends where the clear region does, or inside it.
          expect(clear?.edge, label).toBe("top");
          expect(panel.height, label).toBeLessThanOrEqual((h * clear!.percent) / 100);
        } else {
          expect(panel.y + panel.height, label).toBe(h);
          expect(clear?.edge, label).toBe("bottom");
          expect(h - panel.y, label).toBeLessThanOrEqual((h * clear!.percent) / 100);
        }
      }
    }
  });

  it("covers the whole text zone with opaque paper, inside the outline, for every layout x shape", () => {
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
        // The opaque rectangle is within the canvas and square-cornered: the fade lies outside it.
        expect(panel.radius, label).toBe(0);
        expect(panel.softEdge, label).toEqual({ spread: 0, blur: 0 });
        expect(panel.x, label).toBeGreaterThanOrEqual(0);
        expect(panel.y, label).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width, label).toBeLessThanOrEqual(w);
        expect(panel.y + panel.height, label).toBeLessThanOrEqual(h);
        // Padded beyond the zone on every side (an edge panel spans the card across).
        expect(zone.x - panel.x, label).toBeGreaterThanOrEqual(40);
        expect(zone.y - panel.y, label).toBeGreaterThanOrEqual(30);
        expect(panel.x + panel.width - (zone.x + zone.width), label).toBeGreaterThanOrEqual(40);
        expect(panel.y + panel.height - (zone.y + zone.height), label).toBeGreaterThanOrEqual(30);
        // Every point of the zone is on opaque paper and inside the outline.
        const missed: string[] = [];
        for (let y = zone.y; y <= zone.y + zone.height; y += 5) {
          for (let x = zone.x; x <= zone.x + zone.width; x += 5) {
            const opaque =
              x >= panel.x &&
              x <= panel.x + panel.width &&
              y >= panel.y &&
              y <= panel.y + panel.height;
            if (!(opaque && inOutline(shape, x, y))) missed.push(`${x},${y}`);
          }
        }
        expect(missed, label).toEqual([]);
      }
    }
  });
});
