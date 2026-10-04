import { describe, expect, it } from "vitest";

import { CARD_SHAPES, proportionOf, SHAPE_PROPORTION } from "./shapes";

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
