import { describe, expect, it } from "vitest";

import {
  InvalidCardDataError,
  lineOffset,
  textBackgroundBlur,
  textBackgroundGeometry,
  textBackgroundRadius,
  validateCardData,
} from "./card-data";
import type { TextBackground } from "./text-background";
import type { TextBox } from "./text-box";

/**
 * The text background's geometry both renderers draw (`textBackgroundGeometry`), and the shared
 * validation of a box's background (`validateCardData`).
 */

const CONTENT = { ascent: 90, descent: 30 };

function box(over: Partial<TextBox> = {}): TextBox {
  return {
    id: "title",
    source: { kind: "wording", slot: "title" },
    x: 100,
    y: 200,
    width: 600,
    rotation: 0,
    font: { family: "Playfair Display", weight: 400, italic: false },
    size: 100,
    color: "#3A2A1E",
    align: "center",
    letterSpacing: 0,
    lineHeight: 1.5,
    textCase: "none",
    z: 0,
    lines: ["one", "two", "three"],
    ...over,
  };
}

const bg = (over: Partial<TextBackground> = {}): TextBackground => ({
  style: "highlight",
  color: "#FFFFFF",
  opacity: 0.85,
  padding: 10,
  ...over,
});

describe("lineOffset", () => {
  it("aligns a line in its box, start-aligning one wider than the box", () => {
    expect(lineOffset({ width: 600, align: "left" }, 200)).toBe(0);
    expect(lineOffset({ width: 600, align: "center" }, 200)).toBe(200);
    expect(lineOffset({ width: 600, align: "right" }, 200)).toBe(400);
    expect(lineOffset({ width: 600, align: "center" }, 700)).toBe(0);
    expect(lineOffset({ width: 600, align: "right" }, 700)).toBe(0);
  });
});

describe("textBackgroundGeometry", () => {
  it("highlight: each line with text, across its content area centred in the line box", () => {
    // Line box 150, content area 120 → 15 of half-leading above it.
    const g = textBackgroundGeometry(
      box({ lines: ["one", "  ", "three"], background: bg() }),
      [200, 40, 300],
      CONTENT,
    )!;
    expect(g).toMatchObject({ style: "highlight", color: "#FFFFFF", opacity: 0.85, radius: 0 });
    expect(g.blur).toBe(0);
    expect(g.rects).toEqual([
      { x: 190, y: 5, width: 220, height: 140 },
      { x: 140, y: 305, width: 320, height: 140 },
    ]);
  });

  it("box: one rectangle over every line's extent and line boxes, its radius held to the sides", () => {
    const g = textBackgroundGeometry(
      box({ background: bg({ style: "box", padding: 20 }) }),
      [200, 100, 300],
      CONTENT,
    )!;
    expect(g.rects).toEqual([{ x: 130, y: -20, width: 340, height: 490 }]);
    expect(g.radius).toBe(textBackgroundRadius(20, 100));
    expect(g.radius).toBe(22);
    // A short, flat rectangle holds the radius to half its smaller side.
    const flat = textBackgroundGeometry(
      box({ lines: ["i"], lineHeight: 0.1, background: bg({ style: "box", padding: 0 }) }),
      [8],
      CONTENT,
    )!;
    expect(flat.radius).toBe(4);
    // A line wider than the box starts at its left edge, and the rectangle with it.
    const wide = textBackgroundGeometry(
      box({ align: "right", background: bg({ style: "box", padding: 0 }) }),
      [200, 800, 100],
      CONTENT,
    )!;
    expect(wide.rects[0]).toMatchObject({ x: 0, width: 800 });
  });

  it("backdrop: the same rectangle, square, blurred by at least 4 units", () => {
    const g = textBackgroundGeometry(
      box({ align: "left", background: bg({ style: "backdrop", padding: 50 }) }),
      [200, 100, 300],
      CONTENT,
    )!;
    expect(g.rects).toEqual([{ x: -50, y: -50, width: 400, height: 550 }]);
    expect(g.radius).toBe(0);
    expect(g.blur).toBe(30);
    expect(textBackgroundBlur(0)).toBe(4);
    expect(textBackgroundBlur(120)).toBe(72);
  });

  it("is null with no background or no line with text, and needs every line's width", () => {
    expect(textBackgroundGeometry(box(), [1, 1, 1], CONTENT)).toBeNull();
    expect(
      textBackgroundGeometry(box({ lines: [" "], background: bg() }), [10], CONTENT),
    ).toBeNull();
    expect(() => textBackgroundGeometry(box({ background: bg() }), [1], CONTENT)).toThrow(
      InvalidCardDataError,
    );
  });
});

describe("validateCardData: a box's text background", () => {
  const card = (background: unknown) => ({
    shape: "rectangle" as const,
    artworkProportion: "5:7" as const,
    panels: [],
    boxes: [box({ background: background as TextBackground })],
  });

  it("accepts each style, and a box without one", () => {
    for (const style of ["highlight", "box", "backdrop"] as const) {
      expect(() => validateCardData(card(bg({ style })))).not.toThrow();
    }
    expect(() => validateCardData(card(undefined))).not.toThrow();
  });

  it("refuses anything else, naming the box", () => {
    for (const background of [
      null,
      bg({ style: "none" as TextBackground["style"] }),
      bg({ color: "#ffffff" }),
      bg({ opacity: 0 }),
      bg({ opacity: 1.2 }),
      bg({ padding: -1 }),
      bg({ padding: 120.5 }),
      { ...bg(), extra: true },
    ]) {
      expect(() => validateCardData(card(background))).toThrow(/box title: text background/);
    }
  });
});
