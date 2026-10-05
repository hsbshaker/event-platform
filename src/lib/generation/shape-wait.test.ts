import { describe, expect, it } from "vitest";

import { CARD_SHAPES } from "@/lib/card/shapes";

import {
  afterShapeSwitch,
  shapeNotice,
  shapeSwatchLabel,
  shapeWaitLine,
  SHAPE_LABEL,
} from "./shape-wait";

describe("shape wait copy", () => {
  it("names every shape, and says the wait plainly with no number", () => {
    for (const shape of CARD_SHAPES) {
      expect(SHAPE_LABEL[shape]).toBeTruthy();
      expect(shapeWaitLine(shape)).toMatch(/^Painting your card as an? [a-z ]+…$/);
      expect(shapeWaitLine(shape)).not.toMatch(/\d|%/);
      expect(shapeNotice(shape)).toContain("stays as it is");
    }
    expect(shapeWaitLine("oval")).toBe("Painting your card as an oval…");
    expect(shapeWaitLine("square")).toBe("Painting your card as a square…");
  });

  it("labels a swatch for screen readers, marking new artwork", () => {
    expect(shapeSwatchLabel("oval", true)).toBe("Oval");
    expect(shapeSwatchLabel("square", false)).toBe("Square — new artwork");
  });
});

describe("afterShapeSwitch", () => {
  it("applies a switch at once", () => {
    expect(afterShapeSwitch("switched", null)).toEqual({ kind: "applied" });
  });

  it("follows a generation that began, or one already running", () => {
    for (const outcome of ["started", "existing", "in_flight"]) {
      expect(afterShapeSwitch(outcome, "g1")).toEqual({ kind: "poll" });
    }
  });

  it("fails honestly when there is no generation to follow", () => {
    const next = afterShapeSwitch("started", null);
    expect(next.kind).toBe("failed");
  });

  it("gives every refusal its host copy", () => {
    for (const outcome of [
      "busy",
      "published",
      "event_cap",
      "host_cap",
      "disabled",
      "no_design",
      "unsupported_shape",
    ]) {
      const next = afterShapeSwitch(outcome, null);
      expect(next.kind).toBe("failed");
      if (next.kind === "failed") expect(next.failure.code).toBe(outcome);
    }
  });

  it("reads an unknown answer as the generic failure", () => {
    const next = afterShapeSwitch("surprise", null);
    expect(next.kind === "failed" && next.failure.code).toBe("internal");
  });
});
