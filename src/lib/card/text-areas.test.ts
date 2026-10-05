import { beforeAll, describe, expect, it } from "vitest";

import type { CardRect } from "./ink";
import { layoutCard, pairingFaces } from "./layout-card";
import { zoneFor } from "./layouts";
import { LINE_AREA_MARGIN, textLineAreas } from "./text-areas";
import { TYPICAL } from "./test-content";
import type { TextBox } from "./text-box";
import type { FontMetrics, FontMetricsResolver, FontRef, MeasureStyle } from "./text/metrics";
import { allCuratedMetrics } from "./text/test-fonts";

/**
 * `textLineAreas` (`card_compiler_v4`): one rectangle per line of the generated text, measured as
 * `layoutCard` measured it, placed by the box's alignment, padded by the small margin and clamped
 * to the zone.
 */

/** A monospaced fake face: every character is half an em wide, plus its letter spacing. */
const mono: FontMetricsResolver = (font: FontRef): FontMetrics => ({
  font,
  unitsPerEm: 1000,
  measure: (text: string, style: MeasureStyle) =>
    [...text].length * style.size * (0.5 + (style.letterSpacingEm ?? 0)),
  missingCharacters: () => [],
});

const ZONE: CardRect = { x: 100, y: 800, width: 800, height: 400 };

function box(over: Partial<TextBox> = {}): TextBox {
  return {
    id: "title",
    source: { kind: "wording", slot: "title" },
    x: 100,
    y: 900,
    width: 800,
    rotation: 0,
    font: { family: "Fake", weight: 400, italic: false },
    size: 40,
    color: "#000000",
    align: "center",
    letterSpacing: 0,
    lineHeight: 1.25,
    textCase: "none",
    z: 0,
    lines: ["abcdefghij"], // 10 characters: 200 units at size 40
    ...over,
  };
}

// Size 40 × line height 1.25 = 50 units a line; the margin is a quarter of it.
const LINE = 50;
const M = LINE_AREA_MARGIN * LINE;

describe("textLineAreas", () => {
  it("uses a margin of a quarter of the line's height", () => {
    expect(LINE_AREA_MARGIN).toBe(0.25);
    expect(M).toBe(12.5);
  });

  it("centres a centred line in its box, padded by the margin on every side", () => {
    expect(textLineAreas([box()], mono, ZONE)).toEqual([
      { x: 400 - M, y: 900 - M, width: 200 + 2 * M, height: LINE + 2 * M },
    ]);
  });

  it("places left- and right-aligned lines at the box's edges", () => {
    expect(textLineAreas([box({ align: "left", x: 200, width: 600 })], mono, ZONE)).toEqual([
      { x: 200 - M, y: 900 - M, width: 200 + 2 * M, height: LINE + 2 * M },
    ]);
    expect(textLineAreas([box({ align: "right", x: 200, width: 600 })], mono, ZONE)).toEqual([
      { x: 600 - M, y: 900 - M, width: 200 + 2 * M, height: LINE + 2 * M },
    ]);
  });

  it("start-aligns a line wider than its box, as CSS does", () => {
    const wide = box({ x: 300, width: 100, lines: ["abcdefghij"] });
    for (const align of ["center", "right"] as const) {
      expect(textLineAreas([{ ...wide, align }], mono, ZONE)[0].x).toBe(300 - M);
    }
  });

  it("gives every line of a multi-line box its own area, one line height apart", () => {
    const areas = textLineAreas([box({ lines: ["abcdefghij", "abcd", "abcdefgh"] })], mono, ZONE);
    expect(areas).toEqual([
      { x: 400 - M, y: 900 - M, width: 200 + 2 * M, height: LINE + 2 * M },
      { x: 460 - M, y: 900 + LINE - M, width: 80 + 2 * M, height: LINE + 2 * M },
      { x: 420 - M, y: 900 + 2 * LINE - M, width: 160 + 2 * M, height: LINE + 2 * M },
    ]);
  });

  it("measures with the box's size, letter spacing and case, as layoutCard does", () => {
    const seen: MeasureStyle[] = [];
    const spy: FontMetricsResolver = (font) => ({
      ...mono(font),
      measure: (text, style) => {
        seen.push(style);
        return mono(font).measure(text, style);
      },
    });
    const [area] = textLineAreas(
      [box({ size: 24, letterSpacing: 0.06, lineHeight: 1.45, textCase: "uppercase" })],
      spy,
      ZONE,
    );
    expect(seen).toEqual([{ size: 24, letterSpacingEm: 0.06, textCase: "uppercase" }]);
    const width = 10 * 24 * 0.56;
    const margin = LINE_AREA_MARGIN * 24 * 1.45;
    expect(area.width).toBeCloseTo(width + 2 * margin, 10);
    expect(area.height).toBeCloseTo(24 * 1.45 + 2 * margin, 10);
  });

  it("clamps an area to the zone", () => {
    // A line at the zone's top-left corner: its margin would reach outside on two sides.
    const [area] = textLineAreas([box({ align: "left", x: 100, y: 800 })], mono, ZONE);
    expect(area).toEqual({ x: 100, y: 800, width: 200 + M, height: LINE + M });
    // A line wholly outside the zone gives no area.
    expect(textLineAreas([box({ y: 1300 })], mono, ZONE)).toEqual([]);
  });

  it("gives no area for an empty line or an empty box", () => {
    expect(textLineAreas([box({ lines: [] })], mono, ZONE)).toEqual([]);
    const areas = textLineAreas([box({ lines: ["abcd", " ", "abcd"] })], mono, ZONE);
    expect(areas.map((a) => a.y)).toEqual([900 - M, 900 + 2 * LINE - M]);
  });

  it("refuses a rotated box: the generated layer is never rotated", () => {
    expect(() => textLineAreas([box({ rotation: 5 })], mono, ZONE)).toThrow(/rotated/);
  });

  describe("on a real generated layout", () => {
    let metrics: FontMetricsResolver;
    beforeAll(async () => {
      metrics = await allCuratedMetrics();
    });

    it("covers every line of every box inside the zone, and nothing else", () => {
      const zone = zoneFor("art-top", "rectangle");
      const { boxes, overflow } = layoutCard({
        zone,
        proportion: "5:7",
        pairing: pairingFaces("hc_playfair_dmsans"),
        content: TYPICAL,
        ink: "#000000",
        metrics,
      });
      expect(overflow).toBe(false);
      const areas = textLineAreas(boxes, metrics, zone);
      const lines = boxes.flatMap((b) => b.lines.map((_, i) => ({ b, i })));
      expect(areas).toHaveLength(lines.length);
      lines.forEach(({ b, i }, k) => {
        const area = areas[k];
        const top = b.y + i * b.size * b.lineHeight;
        expect(area.y).toBeLessThan(top);
        expect(area.y + area.height).toBeGreaterThan(top + b.size * b.lineHeight);
        expect(area.x).toBeGreaterThanOrEqual(zone.x);
        expect(area.x + area.width).toBeLessThanOrEqual(zone.x + zone.width);
        expect(area.y).toBeGreaterThanOrEqual(zone.y);
        expect(area.y + area.height).toBeLessThanOrEqual(zone.y + zone.height);
        // Centred: narrower than the zone, symmetric about its middle.
        expect(area.x + area.width / 2).toBeCloseTo(zone.x + zone.width / 2, 6);
        expect(area.width).toBeLessThan(zone.width);
      });
    });
  });
});
