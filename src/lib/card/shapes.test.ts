import { describe, expect, it } from "vitest";

import {
  CARD_CANVAS,
  CARD_SHAPES,
  canvasOf,
  insideOutline,
  insideTextSafe,
  proportionOf,
  SHAPE_GEOMETRY,
  SHAPE_PROPORTION,
} from "./shapes";

describe("card shapes (docs/card-system.md §2.1)", () => {
  it("are exactly the six shapes, each with one proportion", () => {
    expect([...CARD_SHAPES].sort()).toEqual(Object.keys(SHAPE_PROPORTION).sort());
    expect(CARD_SHAPES).toHaveLength(6);
  });

  it("puts rectangle, rounded rectangle, arch and oval at 5:7 and square and circle at 1:1", () => {
    expect(CARD_SHAPES.filter((s) => proportionOf(s) === "5:7")).toEqual([
      "rectangle",
      "rounded-rectangle",
      "arch",
      "oval",
    ]);
    expect(CARD_SHAPES.filter((s) => proportionOf(s) === "1:1")).toEqual(["square", "circle"]);
  });
});

describe("card-unit geometry", () => {
  it("has a 1000x1400 portrait canvas and a 1000x1000 square canvas", () => {
    expect(CARD_CANVAS["5:7"]).toEqual({ width: 1000, height: 1400 });
    expect(CARD_CANVAS["1:1"]).toEqual({ width: 1000, height: 1000 });
    expect(canvasOf("circle")).toEqual({ width: 1000, height: 1000 });
  });

  it("keeps the validated margins and the rounded-rectangle radius", () => {
    expect(CARD_SHAPES.map((s) => SHAPE_GEOMETRY[s].margin)).toEqual([80, 90, 80, 70, 70, 70]);
    expect(SHAPE_GEOMETRY["rounded-rectangle"].radius).toBe(70);
  });

  it("cuts the corners of arch, oval and circle out of the outline", () => {
    expect(insideOutline("arch", 10, 10)).toBe(false);
    expect(insideOutline("arch", 500, 10)).toBe(true);
    expect(insideOutline("arch", 10, 1390)).toBe(true);
    expect(insideOutline("oval", 10, 10)).toBe(false);
    expect(insideOutline("oval", 500, 700)).toBe(true);
    expect(insideOutline("circle", 20, 20)).toBe(false);
    expect(insideOutline("rectangle", 0, 0)).toBe(true);
  });

  it("keeps the text-safe area inside the outline", () => {
    for (const shape of CARD_SHAPES) {
      const { width, height } = canvasOf(shape);
      for (let y = 0; y <= height; y += 20) {
        for (let x = 0; x <= width; x += 20) {
          if (insideTextSafe(shape, x, y)) expect(insideOutline(shape, x, y)).toBe(true);
        }
      }
      expect(insideTextSafe(shape, width / 2, height / 2)).toBe(true);
    }
  });

  it("applies the margin to rectangular text-safe areas", () => {
    expect(insideTextSafe("rectangle", 79, 700)).toBe(false);
    expect(insideTextSafe("rectangle", 80, 700)).toBe(true);
    expect(insideTextSafe("rounded-rectangle", 89, 700)).toBe(false);
    expect(insideTextSafe("arch", 500, 79)).toBe(false);
  });
});
