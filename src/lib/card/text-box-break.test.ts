import { beforeAll, describe, expect, it } from "vitest";

import { layoutCard, pairingFaces } from "./layout-card";
import { CARD_LAYOUT_IDS, CARD_LAYOUTS, zoneFor } from "./layouts";
import { proportionOf } from "./shapes";
import {
  FIT_SAFETY,
  boxText,
  breakBoxText,
  isLinkedBox,
  sameBreakStyle,
  withLinkedLines,
  type BoxBreakStyle,
  type CardContent,
  type TextBox,
} from "./text-box";
import { UnknownCardFontError, cardFontSource, isKnownCardFont } from "./text/card-fonts";
import { cardFontMetrics } from "./text/card-fonts.server";
import { breakLines } from "./text/line-break";
import type { FontMetricsResolver, FontRef } from "./text/metrics";
import { allCuratedMetrics } from "./text/test-fonts";
import { TYPOGRAPHY_KEYS } from "./typography";

/**
 * The line breaking for an edited box (`docs/card-system.md §7`, "Line breaking for edited boxes";
 * `spec.md §20.4`, §31 Card editor "Each box's line breaks are computed deterministically and
 * stored"): `breakBoxText` with the curated fonts' real metrics, the rules of §4.3, agreement with
 * `layoutCard` (whose lines the layout fixtures prove a browser draws), and the font seam.
 */

let metrics: FontMetricsResolver;
beforeAll(async () => {
  metrics = await allCuratedMetrics();
});

const PLAYFAIR: FontRef = { family: "Playfair Display", weight: 400, italic: false };
const DM_SANS: FontRef = { family: "DM Sans", weight: 400, italic: false };

function style(over: Partial<BoxBreakStyle> = {}): BoxBreakStyle {
  return { width: 600, font: PLAYFAIR, size: 40, letterSpacing: 0, textCase: "none", ...over };
}

/** The width a box needs to hold `text` on one line in `s`'s face. */
function widthFor(text: string, s: BoxBreakStyle): number {
  const measured = metrics(s.font).measure(text, {
    size: s.size,
    letterSpacingEm: s.letterSpacing,
    textCase: s.textCase,
  });
  return measured * (1 + FIT_SAFETY);
}

function measureLine(line: string, s: BoxBreakStyle): number {
  return widthFor(line, s);
}

describe("breakBoxText: the rules of docs/card-system.md §4.3", () => {
  it("is breakLines over the face's own metrics at the box's width less the fit margin", () => {
    const s = style({ width: 300 });
    const text = "Please join us for a garden party in the orchard";
    const face = metrics(PLAYFAIR);
    const expected = breakLines(text, 300 / (1 + FIT_SAFETY), (line) =>
      face.measure(line, { size: 40, letterSpacingEm: 0, textCase: "none" }),
    );
    expect(breakBoxText(text, s, metrics)).toEqual(expected);
  });

  it("keeps a text that fits on one line, and collapses its whitespace", () => {
    expect(breakBoxText("  Bring   a book  ", style(), metrics).lines).toEqual(["Bring a book"]);
  });

  it("fits every line of more than one word in the box, with the fit margin", () => {
    const text = "Please join us for a garden party in the orchard on a summer afternoon";
    for (const width of [300, 340, 420, 500, 800]) {
      const s = style({ width });
      const { lines, overflow } = breakBoxText(text, s, metrics);
      expect(overflow).toBe(false);
      expect(lines.join(" ")).toBe(text);
      for (const line of lines) expect(measureLine(line, s)).toBeLessThanOrEqual(width + 1e-9);
    }
  });

  it("uses the fewest lines, and evens them out", () => {
    const text = "Please join us for a garden party in the orchard";
    const s = style({ width: widthFor(text, style()) * 0.6 });
    const { lines } = breakBoxText(text, s, metrics);
    expect(lines).toHaveLength(2);
    // Balanced, not greedy: the two lines are within a word of each other.
    const [a, b] = lines.map((l) => measureLine(l, s));
    expect(Math.abs(a - b)).toBeLessThan(widthFor("orchard", s));
  });

  it("never strands a short word on a line where another break exists", () => {
    const text = "A Wild Beginning";
    const base = style();
    const width = Math.max(widthFor("A Wild", base), widthFor("Wild Beginning", base)) + 1;
    expect(widthFor(text, base)).toBeGreaterThan(width);
    // Both "A / Wild Beginning" and "A Wild / Beginning" fit; the stranded "A" ranks worse.
    expect(breakBoxText(text, style({ width }), metrics).lines).toEqual(["A Wild", "Beginning"]);
  });

  it("then never leaves a one-word last line where another break exists", () => {
    const text = "Tea at the Ritz";
    const base = style();
    const width = Math.max(widthFor("Tea at the", base), widthFor("the Ritz", base)) + 1;
    expect(widthFor(text, base)).toBeGreaterThan(width);
    // "Tea at the / Ritz" fits too, but leaves "Ritz" alone.
    expect(breakBoxText(text, style({ width }), metrics).lines).toEqual(["Tea at", "the Ritz"]);
  });

  it("breaks inside a word only just after a hyphen between letters, keeping the hyphen", () => {
    const base = style();
    const name = "Montgomery-Whitworth";
    const width = Math.max(widthFor("Montgomery-", base), widthFor("Whitworth", base)) + 1;
    expect(widthFor(name, base)).toBeGreaterThan(width);
    expect(breakBoxText(name, style({ width }), metrics).lines).toEqual([
      "Montgomery-",
      "Whitworth",
    ]);
    // Whole wherever the width allows it.
    expect(breakBoxText(name, style({ width: widthFor(name, base) + 1 }), metrics).lines).toEqual([
      name,
    ]);
    // A hyphen beside a digit is not a break point: the piece overflows whole instead.
    const times = breakBoxText(
      "12:30-4:45",
      style({ width: widthFor("12:30-", base) + 1 }),
      metrics,
    );
    expect(times).toMatchObject({ lines: ["12:30-4:45"], overflow: true });
  });

  it("prefers a space to a hyphen at the same number of lines", () => {
    const base = style();
    const text = "Ann Montgomery-Whitworth";
    const width = widthFor("Montgomery-Whitworth", base) + 1;
    expect(widthFor(text, base)).toBeGreaterThan(width);
    // "Ann Montgomery- / Whitworth" may fit too; the space break wins.
    expect(breakBoxText(text, style({ width }), metrics).lines).toEqual([
      "Ann",
      "Montgomery-Whitworth",
    ]);
  });

  it("honours the hard breaks the host typed, and a blank line between paragraphs", () => {
    expect(breakBoxText("Dinner\nDancing", style({ width: 2000 }), metrics).lines).toEqual([
      "Dinner",
      "Dancing",
    ]);
    expect(breakBoxText("Dinner\n\nDancing", style({ width: 2000 }), metrics).lines).toEqual([
      "Dinner",
      "",
      "Dancing",
    ]);
    expect(breakBoxText("Dinner\r\nDancing", style({ width: 2000 }), metrics).lines).toEqual([
      "Dinner",
      "Dancing",
    ]);
  });

  it("sets a word wider than the box whole on its own line and says so; nothing is truncated", () => {
    const result = breakBoxText("Supercalifragilistic fun", style({ width: 120 }), metrics);
    expect(result.lines).toEqual(["Supercalifragilistic", "fun"]);
    expect(result.overflow).toBe(true);
  });

  it("gives no lines for empty text", () => {
    expect(breakBoxText("", style(), metrics)).toEqual({ lines: [], widths: [], overflow: false });
    expect(breakBoxText(" \n ", style(), metrics).lines).toEqual([]);
  });

  it("measures the case and letter spacing the box is drawn with, and stores the text's own case", () => {
    const text = "Saturday, June 6";
    const base = style({ font: DM_SANS, size: 24 });
    const width = widthFor(text, base) + 1;
    expect(breakBoxText(text, { ...base, width }, metrics).lines).toEqual([text]);
    const upper = breakBoxText(text, { ...base, width, textCase: "uppercase" }, metrics);
    expect(upper.lines.length).toBeGreaterThan(1);
    expect(upper.lines.join(" ")).toBe(text);
    const spaced = breakBoxText(text, { ...base, width, letterSpacing: 0.2 }, metrics);
    expect(spaced.lines.length).toBeGreaterThan(1);
    const lower = breakBoxText(
      "SATURDAY",
      { ...base, width: 2000, textCase: "lowercase" },
      metrics,
    );
    expect(lower.lines).toEqual(["SATURDAY"]);
  });

  it("measures the weight the box is set in", () => {
    const text = "Please join us for a garden party";
    const regular = style({ font: { family: "Playfair Display", weight: 400, italic: false } });
    const black = style({ font: { family: "Playfair Display", weight: 900, italic: false } });
    expect(widthFor(text, black)).toBeGreaterThan(widthFor(text, regular));
    const width = widthFor(text, regular) + 1;
    expect(breakBoxText(text, { ...regular, width }, metrics).lines).toHaveLength(1);
    expect(breakBoxText(text, { ...black, width }, metrics).lines.length).toBeGreaterThan(1);
  });

  it("is deterministic", () => {
    const text = "Please join us for a garden party in the orchard on a summer afternoon";
    for (const width of [150, 333.333, 512]) {
      const a = breakBoxText(text, style({ width }), metrics);
      const b = breakBoxText(text, style({ width }), metrics);
      expect(a).toEqual(b);
    }
  });

  it("refuses an invalid size, spacing or width", () => {
    expect(() => breakBoxText("x", style({ size: 0 }), metrics)).toThrow();
    expect(() => breakBoxText("x", style({ size: Number.NaN }), metrics)).toThrow();
    expect(() =>
      breakBoxText("x", style({ letterSpacing: Number.POSITIVE_INFINITY }), metrics),
    ).toThrow();
    expect(() => breakBoxText("x", style({ width: 0 }), metrics)).toThrow();
  });
});

describe("breakBoxText agrees with layoutCard (whose lines a browser draws)", () => {
  const CONTENT: CardContent = {
    title: "A Little Wild One",
    invitationLine: "Please join us for a baby shower to celebrate",
    babyName: "Juniper Rose",
    hosts: "Hosted by Maya & Tom",
    date: "Saturday, June 6",
    time: "1:00 pm – 4:00 pm",
    venue: "The Willow House",
    rsvpBy: "RSVP by May 30",
  };

  it("breaks every generated box exactly as layoutCard did, in every layout, shape and pairing", () => {
    let checked = 0;
    for (const layout of CARD_LAYOUT_IDS) {
      for (const shape of CARD_LAYOUTS[layout].shapes) {
        for (const pairing of TYPOGRAPHY_KEYS) {
          const { boxes } = layoutCard({
            zone: zoneFor(layout, shape),
            proportion: proportionOf(shape),
            pairing: pairingFaces(pairing),
            content: CONTENT,
            ink: "#222222",
            metrics,
          });
          for (const box of boxes) {
            const text = boxText(box, CONTENT);
            expect(
              breakBoxText(text, box, metrics).lines,
              `${layout}/${shape}/${pairing}/${box.id}`,
            ).toEqual(box.lines);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe("sameBreakStyle", () => {
  it("compares exactly what lines depend on", () => {
    const s = style();
    expect(sameBreakStyle(s, { ...s })).toBe(true);
    for (const change of [
      { width: 601 },
      { size: 41 },
      { letterSpacing: 0.01 },
      { textCase: "uppercase" as const },
      { font: { ...PLAYFAIR, weight: 700 } },
      { font: { ...PLAYFAIR, italic: true } },
      { font: DM_SANS },
    ]) {
      expect(sameBreakStyle(s, { ...s, ...change }), JSON.stringify(change)).toBe(false);
    }
  });
});

describe("the font seam", () => {
  const UNKNOWN: FontRef = { family: "Comic Neue", weight: 400, italic: false };

  it("knows the curated faces and nothing else, yet", () => {
    expect(cardFontSource(PLAYFAIR)).toBe("curated");
    expect(isKnownCardFont({ family: "Playfair Display", weight: 900, italic: false })).toBe(true);
    expect(isKnownCardFont(UNKNOWN)).toBe(false);
    // A weight or style the platform does not host is unknown too: never a nearby face.
    expect(isKnownCardFont({ family: "Playfair Display", weight: 500, italic: false })).toBe(false);
    expect(isKnownCardFont({ ...PLAYFAIR, italic: true })).toBe(false);
  });

  it("refuses an unknown face before loading anything", async () => {
    await expect(cardFontMetrics([PLAYFAIR, UNKNOWN])).rejects.toBeInstanceOf(UnknownCardFontError);
  });

  it("measures exactly as the curated metrics layoutCard uses", async () => {
    const seam = await cardFontMetrics([PLAYFAIR, DM_SANS, PLAYFAIR]);
    const text = "Please join us for a garden party in the orchard";
    expect(breakBoxText(text, style({ width: 250 }), seam)).toEqual(
      breakBoxText(text, style({ width: 250 }), metrics),
    );
  });

  it("never measures a box with a face it was not given", async () => {
    const seam = await cardFontMetrics([PLAYFAIR]);
    expect(() => breakBoxText("x", style({ font: UNKNOWN }), seam)).toThrow(UnknownCardFontError);
    expect(() => breakBoxText("x", style({ font: DM_SANS }), seam)).toThrow(/not loaded/);
  });
});

describe("withLinkedLines", () => {
  const SAVED: CardContent = {
    title: "A Little Wild One",
    invitationLine: "Please join us",
    date: "Saturday, June 6",
    venue: "The Willow House",
  };

  function box(over: Partial<TextBox>): TextBox {
    return {
      id: "b",
      source: { kind: "custom" },
      x: 0,
      y: 0,
      width: 700,
      rotation: 0,
      font: DM_SANS,
      size: 24,
      color: "#000000",
      align: "center",
      letterSpacing: 0,
      lineHeight: 1.3,
      textCase: "none",
      z: 0,
      lines: [],
      ...over,
    };
  }

  const throwing: FontMetricsResolver = () => {
    throw new Error("no font should be measured");
  };

  it("keeps lines that spell the box's words exactly, measuring nothing", () => {
    // Broken narrower than a fresh break would: kept, as the host saw it.
    const title = box({
      id: "title",
      source: { kind: "wording", slot: "title" },
      font: PLAYFAIR,
      size: 60,
      lines: ["A Little", "Wild One"],
    });
    const date = box({
      id: "date",
      source: { kind: "fact", slot: "date" },
      lines: ["Saturday, June 6"],
    });
    const result = withLinkedLines([title, date], SAVED, throwing);
    expect(result.rebroken).toEqual([]);
    expect(result.boxes.map((b) => b.lines)).toEqual([
      ["A Little", "Wild One"],
      ["Saturday, June 6"],
    ]);
  });

  it("re-breaks a linked box whose words changed, at its own width and style", () => {
    const date = box({
      id: "date",
      source: { kind: "fact", slot: "date" },
      lines: ["Saturday, June 6"],
    });
    const title = box({ id: "title", source: { kind: "wording", slot: "title" }, lines: ["Old"] });
    const content = { ...SAVED, date: "Sunday, June 7", title: "A Brand New Title" };
    const result = withLinkedLines([date, title], content, metrics);
    expect(result.rebroken).toEqual(["date", "title"]);
    expect(result.boxes[0].lines).toEqual(breakBoxText("Sunday, June 7", date, metrics).lines);
    expect(result.boxes[1].lines).toEqual(["A Brand New Title"]);
  });

  it("gives a fact with no value no lines, and a value where it had none", () => {
    const hosts = box({
      id: "hosts",
      source: { kind: "fact", slot: "hosts" },
      lines: ["Hosted by Ann"],
    });
    expect(withLinkedLines([hosts], SAVED, metrics).boxes[0].lines).toEqual([]);
    const empty = box({ id: "hosts", source: { kind: "fact", slot: "hosts" }, lines: [] });
    expect(
      withLinkedLines([empty], { ...SAVED, hosts: "Hosted by Ann" }, metrics).boxes[0].lines,
    ).toEqual(["Hosted by Ann"]);
  });

  it("leaves the invitation line and added boxes alone: their words are their own", () => {
    const line = box({
      id: "invitationLine",
      source: { kind: "wording", slot: "invitationLine" },
      text: "Come celebrate",
      lines: ["Come", "celebrate"],
    });
    const added = box({ id: "c1", text: "Bring a book", lines: ["Bring a book"] });
    const result = withLinkedLines([line, added], SAVED, throwing);
    expect(result.rebroken).toEqual([]);
    expect(result.boxes).toEqual([line, added]);
    expect(isLinkedBox(line)).toBe(false);
    expect(isLinkedBox(added)).toBe(false);
  });

  it("does not mutate its input", () => {
    const date = box({ id: "date", source: { kind: "fact", slot: "date" }, lines: ["stale"] });
    const copy = structuredClone(date);
    withLinkedLines([date], SAVED, metrics);
    expect(date).toEqual(copy);
  });
});
