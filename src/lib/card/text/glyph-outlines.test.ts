import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadCuratedGlyphOutlines } from "./curated-fonts";
import { loadGlyphOutlinesFromFile, UndrawableTextError } from "./glyph-outlines";
import { CURATED_FONT_DIR, curatedFaces } from "./test-fonts";

const load = (family: string, weight = 400) =>
  loadCuratedGlyphOutlines({ family, weight, italic: false }, CURATED_FONT_DIR);

const SAMPLES = [
  "A Little Wild One",
  "Saturday, June 6 · 1:00 pm",
  "Office ffi fl Wave AV To",
  "é",
  // Contextual alternates that change advances (Manrope's case-sensitive hyphen in capitals,
  // Inter's arrow): under letter spacing they are off, as they are when measuring.
  "Montgomery-Whitworth, a->b",
];

describe("glyph outlines", () => {
  it("draws every curated face at exactly the width it measures", async () => {
    for (const f of curatedFaces()) {
      const outlines = await load(f.family, f.weight);
      for (const size of [18, 40, 104]) {
        for (const letterSpacingEm of [0, 0.12, -0.02]) {
          for (const textCase of ["none", "uppercase"] as const) {
            for (const text of SAMPLES) {
              const style = { size, letterSpacingEm, textCase };
              const line = outlines.line(text, style);
              // `line()` itself refuses a drawn width that differs from the measured one; this
              // states the contract directly.
              expect(line.width).toBe(outlines.metrics.measure(text, style));
              expect(line.path).toMatch(/^M/);
            }
          }
        }
      }
    }
  }, 60_000);

  it("draws in card units from the line's start on the baseline, y down", async () => {
    const outlines = await load("DM Sans");
    const { path: d } = outlines.line("H", { size: 100 });
    const ys = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
    // A capital sits on the baseline (y = 0) and rises above it (negative y).
    expect(Math.max(...ys)).toBeCloseTo(0, 0);
    expect(Math.min(...ys)).toBeLessThan(-60);
    const shifted = outlines.line("H", { size: 100 }, 250);
    const xs = (s: string) => [...s.matchAll(/[ML](-?[\d.]+) /g)].map((m) => Number(m[1]));
    expect(Math.min(...xs(shifted.path)) - Math.min(...xs(d))).toBeCloseTo(250, 1);
  });

  it("follows the variable instance: weight and optical size change the outlines", async () => {
    const regular = await load("Fraunces", 400);
    const bold = await load("Fraunces", 700);
    expect(bold.line("Wild", { size: 40 }).path).not.toBe(regular.line("Wild", { size: 40 }).path);
    // Fraunces has an optical-size axis: the same text at 20 and 100 units is not a scaled copy.
    const scaleOf = (size: number) => {
      const xs = [...regular.line("a", { size }).path.matchAll(/[ML](-?[\d.]+) /g)].map((m) =>
        Number(m[1]),
      );
      return (Math.max(...xs) - Math.min(...xs)) / size;
    };
    expect(Math.abs(scaleOf(20) - scaleOf(100))).toBeGreaterThan(0.005);
  });

  it("gives ascent and descent at the size", async () => {
    const outlines = await load("Playfair Display");
    const { ascent, descent } = outlines.verticalMetrics(100);
    expect(ascent).toBeCloseTo(108.2, 1);
    expect(descent).toBeCloseTo(25.1, 1);
  });

  it("draws nothing for a line of spaces, but keeps its width", async () => {
    const outlines = await load("DM Sans");
    const line = outlines.line("   ", { size: 30 });
    expect(line.path).toBe("");
    expect(line.width).toBeGreaterThan(0);
    expect(outlines.line("", { size: 30 })).toEqual({ path: "", width: 0 });
  });

  it("refuses what a browser would set differently", async () => {
    const outlines = await load("DM Sans");
    // No glyph: a browser would substitute a fallback font.
    expect(() => outlines.line("Party 🎉", { size: 30 })).toThrow(UndrawableTextError);
    expect(() => outlines.line("宴会", { size: 30 })).toThrow(UndrawableTextError);
    // Right-to-left text, which a browser would reorder.
    expect(() => outlines.line("Shalom שלום", { size: 30 })).toThrow(UndrawableTextError);
    expect(() => outlines.line("a\u202eb", { size: 30 })).toThrow(UndrawableTextError);
    expect(() => outlines.line("two\nlines", { size: 30 })).toThrow(UndrawableTextError);
  });

  it("checks the characters as drawn, after the box's case", async () => {
    // `ÿ` is in every curated face; its capital `Ÿ` is not.
    const lacking = [];
    for (const f of curatedFaces()) {
      const outlines = await load(f.family, f.weight);
      expect(() => outlines.line("ÿ", { size: 30 })).not.toThrow();
      if (outlines.metrics.missingCharacters("Ÿ").length === 0) continue;
      lacking.push(f.family);
      expect(() => outlines.line("ÿ", { size: 30, textCase: "uppercase" })).toThrow(
        UndrawableTextError,
      );
    }
    expect(lacking.length).toBeGreaterThan(0);
  });

  it("refuses a file that is not the family asked for", async () => {
    const inter = readFileSync(path.join(CURATED_FONT_DIR, "Inter-normal-400.woff2"));
    await expect(
      loadGlyphOutlinesFromFile(inter, { family: "Inter Tight", weight: 400, italic: false }),
    ).rejects.toThrow(/not "Inter Tight"/);
  });
});
