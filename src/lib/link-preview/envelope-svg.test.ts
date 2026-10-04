import { beforeAll, describe, expect, it } from "vitest";

import { validateCardText } from "@/lib/card/entry";
import entryGlyphs from "@/lib/card/entry-glyphs.json";
import { UndrawableTextError } from "@/lib/card/text/glyph-outlines";

import { loadAppFont, type AppFont } from "./app-font.server";
import { ENVELOPE_TITLE_STYLE, envelopePreviewSvg, envelopeTitleLines } from "./envelope-svg";
import { HOUSE } from "./house-style";

let font: AppFont;
beforeAll(async () => {
  font = await loadAppFont(HOUSE.headingMd.weight);
});

/** Ten units per character: easy to reason about. */
const measure = (s: string) => [...s].length * 10;

describe("envelopeTitleLines", () => {
  it("wraps greedily at spaces, collapsing white space", () => {
    expect(envelopeTitleLines("  Maya   &\nJonas  ", measure, 100)).toEqual(["Maya &", "Jonas"]);
    expect(envelopeTitleLines("aaaa bbbb cccc", measure, 90)).toEqual(["aaaa bbbb", "cccc"]);
    expect(envelopeTitleLines("", measure, 90)).toEqual([]);
  });

  it("breaks a word wider than the line", () => {
    expect(envelopeTitleLines("abcdefghijkl x", measure, 50)).toEqual(["abcde", "fghij", "kl x"]);
  });

  it("keeps three lines, ending the last with an ellipsis when more follows", () => {
    expect(envelopeTitleLines("aaaa bbbb cccc dddd eeee", measure, 40)).toEqual([
      "aaaa",
      "bbbb",
      "ccc…",
    ]);
    expect(envelopeTitleLines("aa bb cc", measure, 20)).toEqual(["aa", "bb", "cc"]);
  });
});

describe("envelopePreviewSvg", () => {
  it("draws the title in the app font, in app-token colours only", () => {
    const title = "Maya & Jonas: A Garden Supper Under the Stars";
    const svg = envelopePreviewSvg(title, font);
    const lines = envelopeTitleLines(title, (s) => font.measure(s, ENVELOPE_TITLE_STYLE), 324.4);
    expect(lines.length).toBe(2);
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 1200 630"/);
    expect(svg.match(/data-envelope-title-line=/g)).toHaveLength(lines.length);
    expect(svg).toContain(`<g data-envelope-title="" fill="${HOUSE.text}">`);
    const colours = new Set(svg.match(/#[0-9a-fA-F]{6}\b/g));
    const house = new Set<string>([
      HOUSE.text,
      HOUSE.surfaceMuted,
      HOUSE.surfaceSubtle,
      HOUSE.borderStrong,
      HOUSE.shadowSoft.color,
    ]);
    for (const colour of colours) expect(house.has(colour), colour).toBe(true);
  });

  it("carries nothing from a card: no image, no card outline or text, no other text", () => {
    const svg = envelopePreviewSvg("Maya & Jonas", font);
    expect(svg).not.toMatch(/<image|data-card|card-outline|<text|font-family|href=/);
    // Its only input is the title: the same title always draws the same envelope.
    expect(envelopePreviewSvg("Maya & Jonas", font)).toBe(svg);
  });

  it("sets each title line centred at its measured width", () => {
    const svg = envelopePreviewSvg("Garden Supper", font);
    const m = /data-envelope-title-line="0" transform="translate\(([\d.]+) ([\d.]+)\)"/.exec(svg);
    const width = font.measure("Garden Supper", ENVELOPE_TITLE_STYLE);
    // The live envelope: 358.4px wide, 1px border, 16px padding, scaled into the image.
    const innerWidth = 358.4 - 2 - 32;
    expect(Number(m![1])).toBeCloseTo(1 + 16 + (innerWidth - width) / 2, 2);
  });

  it("sets Latin, Greek and Cyrillic titles from Inter's subsets, and refuses what Inter lacks", () => {
    expect(() => envelopePreviewSvg("Łódź · Αθήνα · Москва · Hà Nội", font)).not.toThrow();
    expect(() => envelopePreviewSvg("Party 🎉", font)).toThrow(UndrawableTextError);
  });

  it("draws every character a title can hold: the entry check refuses the rest", () => {
    const accepted = [...entryGlyphs.roles.display.chars].filter(
      (c) => validateCardText("title", c).ok,
    );
    expect(accepted.length).toBeGreaterThan(150);
    for (const c of accepted) {
      expect(
        () => font.line(c, ENVELOPE_TITLE_STYLE),
        `U+${c.codePointAt(0)!.toString(16)}`,
      ).not.toThrow();
    }
    expect(validateCardText("title", "Party 🎉").ok).toBe(false);
  });

  it("is set at the heading weight only", async () => {
    const regular = await loadAppFont(400);
    expect(() => envelopePreviewSvg("Maya", regular)).toThrow(/weight 650/);
  });
});
