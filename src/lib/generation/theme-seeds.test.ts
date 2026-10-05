import { describe, expect, it } from "vitest";

import { drawThemeSeed, THEME_SEEDS } from "./theme-seeds";

describe("theme seeds (event_identity_v6, owner decision 2026-10-05)", () => {
  it("are broad and distinct", () => {
    expect(THEME_SEEDS.length).toBeGreaterThanOrEqual(80);
    expect(new Set(THEME_SEEDS).size).toBe(THEME_SEEDS.length);
  });

  it("leave out things that naturally carry writing", () => {
    const lettered =
      /\b(map|chart|atlas|book|label|sign|shop|store|newspaper|letter|poster|menu|music|clock|train|regatta|jar|lantern|boat|sail|balloon|carousel|globe|harbour|harbor|record)s?\b/i;
    expect(THEME_SEEDS.filter((seed) => lettered.test(seed))).toEqual([]);
  });

  it("draws uniformly and deterministically from the injected source", () => {
    expect(drawThemeSeed(() => 0)).toBe(THEME_SEEDS[0]);
    expect(drawThemeSeed(() => 0.999999)).toBe(THEME_SEEDS[THEME_SEEDS.length - 1]);
    expect(drawThemeSeed(() => 10.5 / THEME_SEEDS.length)).toBe(THEME_SEEDS[10]);
  });

  it("stays in range for a draw outside [0, 1)", () => {
    for (const value of [-1, 1, 7, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(THEME_SEEDS).toContain(drawThemeSeed(() => value));
    }
  });
});
