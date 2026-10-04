import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  formatHex,
  gamutMapOklch,
  hexToOklch,
  isCanonicalHex,
  oklchToHex,
  parseHex,
} from "./color";

describe("card colour maths", () => {
  it("gives black on white the maximum WCAG contrast of 21", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
  });

  it("gives identical colours a contrast of 1", () => {
    expect(contrastRatio("#7A3B5C", "#7A3B5C")).toBeCloseTo(1, 10);
  });

  it("round-trips hex through parse and format", () => {
    for (const hex of ["#000000", "#FFFFFF", "#7A3B5C", "#12AB9F"]) {
      expect(formatHex(parseHex(hex))).toBe(hex);
      expect(isCanonicalHex(hex)).toBe(true);
    }
  });

  it("round-trips hex through OKLCH within tolerance", () => {
    for (const hex of ["#7A3B5C", "#12AB9F", "#C9A24B", "#808080"]) {
      const back = parseHex(oklchToHex(hexToOklch(hex)));
      const orig = parseHex(hex);
      expect(Math.abs(back.r - orig.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - orig.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - orig.b)).toBeLessThanOrEqual(1);
    }
  });

  it("gamut-maps an out-of-gamut request to a valid hex by giving up chroma", () => {
    const request = { l: 0.7, c: 0.4, h: 150 };
    expect(gamutMapOklch(request).chromaLoss).toBeGreaterThan(0);
    expect(isCanonicalHex(oklchToHex(request))).toBe(true);
  });
});
