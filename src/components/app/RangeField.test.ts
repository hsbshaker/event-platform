import { describe, expect, it } from "vitest";

import { snap } from "./RangeField";

describe("RangeField snap", () => {
  it("keeps a whole step inside the range", () => {
    expect(snap(40, 0, 120, 1)).toBe(40);
    expect(snap(0, 0, 120, 1)).toBe(0);
    expect(snap(120, 0, 120, 1)).toBe(120);
  });

  it("rounds to the nearest step counted from min", () => {
    expect(snap(41.4, 0, 120, 1)).toBe(41);
    expect(snap(41.5, 0, 120, 1)).toBe(42);
    expect(snap(12, 5, 100, 5)).toBe(10);
    expect(snap(13, 5, 100, 5)).toBe(15);
  });

  it("clamps out-of-range values to the ends", () => {
    expect(snap(-3, 0, 120, 1)).toBe(0);
    expect(snap(4, 5, 100, 1)).toBe(5);
    expect(snap(250, 0, 120, 1)).toBe(120);
  });

  it("has no floating-point residue on fractional steps", () => {
    expect(snap(0.3, 0, 1, 0.1)).toBe(0.3);
    expect(snap(0.7000000001, 0, 1, 0.1)).toBe(0.7);
  });
});
