import { describe, expect, it } from "vitest";

import { ART_MODES } from "./art-modes";
import {
  artModeCompatible,
  CARD_LAYOUT_IDS,
  CARD_LAYOUT_SET_VERSION,
  CARD_LAYOUTS,
  layoutSupportsShape,
  zoneFor,
} from "./layouts";
import { CARD_SHAPES, canvasOf, insideTextSafe, SHAPE_PROPORTION } from "./shapes";

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
        for (let y = band.top; y <= band.bottom; y += 4) {
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
  });
});
