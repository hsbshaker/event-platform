import { describe, expect, it } from "vitest";

import { ART_MODE_FIT, ART_MODES } from "./art-modes";

describe("art modes (docs/card-system.md §2.4)", () => {
  it("are exactly the four modes, each with a fit policy", () => {
    expect([...ART_MODES].sort()).toEqual(Object.keys(ART_MODE_FIT).sort());
  });

  it("lets illustration and atmosphere art fit its whole proportion, and pins outline-led art to its shape", () => {
    expect(ART_MODES.filter((m) => ART_MODE_FIT[m] === "proportion")).toEqual([
      "illustration",
      "atmosphere",
    ]);
    expect(ART_MODES.filter((m) => ART_MODE_FIT[m] === "own-shape")).toEqual(["framed", "minimal"]);
  });
});
