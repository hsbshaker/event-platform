import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { validateCardText } from "@/lib/card/entry";
import entryGlyphs from "@/lib/card/entry-glyphs.json";
import { UndrawableTextError } from "@/lib/card/text/glyph-outlines";

import { loadAppFont, type AppFont } from "./app-font.server";
import {
  ENVELOPE_TITLE_STYLE,
  envelopePreviewSvg,
  envelopeTitleLines,
  type EnvelopeFonts,
} from "./envelope-svg";
import { HOUSE } from "./house-style";

let font: AppFont;
let fonts: EnvelopeFonts;
beforeAll(async () => {
  font = await loadAppFont(HOUSE.headingMd.weight);
  fonts = { title: font, seal: await loadAppFont(HOUSE.seal.weight) };
});

/** Ten units per character: easy to reason about. */
const measure = (s: string) => [...s].length * 10;

describe("envelopeTitleLines", () => {
  it("wraps greedily at spaces, collapsing white space", () => {
    expect(envelopeTitleLines("  Maya   &\nJonas  ", measure, 100)).toEqual(["Maya &", "Jonas"]);
    expect(envelopeTitleLines("aaaa bbbb cccc", measure, 90)).toEqual(["aaaa bbbb", "cccc"]);
    expect(envelopeTitleLines("", measure, 90)).toEqual([]);
  });

  it("keeps a no-break space: it joins words and is never collapsed or trimmed", () => {
    expect(envelopeTitleLines("Maya and Jonas", measure, 100)).toEqual(["Maya and", "Jonas"]);
    expect(envelopeTitleLines("Maya and\u00a0Jonas", measure, 100)).toEqual([
      "Maya",
      "and\u00a0Jonas",
    ]);
    expect(envelopeTitleLines(" \u00a0Maya\u00a0\u00a0", measure, 100)).toEqual([
      "\u00a0Maya\u00a0\u00a0",
    ]);
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

describe("the live envelope this restates", () => {
  // The preview cannot read the component's CSS, so it restates the geometry it copies; change
  // `Envelope.tsx` and this names what to change in `envelope-svg.ts`.
  const source = readFileSync(
    path.resolve(import.meta.dirname, "../../components/app/Envelope.tsx"),
    "utf8",
  );

  it("has the size, paper, flap, seal, title area and title type the preview draws", () => {
    expect(source).toContain('portrait: "min(100%, calc(var(--width-narrow) * 0.64))"');
    expect(source).toContain('style={{ aspectRatio: "10 / 7" }}');
    expect(source).toContain('"relative block w-full overflow-hidden rounded-sm"');
    // The lit inside, the pocket's notch (38%), the flap's shadow line (42%) and the flap (40%).
    expect(source).toContain('back && "bg-app-lit"');
    expect(source).toContain('clipPath: "polygon(0 0, 50% 38%, 100% 0, 100% 100%, 0 100%)"');
    expect(source).toContain('className="surface-lit absolute inset-0"');
    expect(source).toContain('height: "42%", clipPath: "polygon(0 0, 100% 0, 50% 100%)"');
    expect(source).toContain('className="absolute inset-x-0 top-0 bg-app-lit"');
    expect(source).toContain('height: "40%", clipPath: "polygon(0 0, 100% 0, 50% 100%)"');
    expect(source).toContain('className="surface-lit absolute inset-x-0 top-0"');
    // The seal at the flap's point; the light pool under the envelope.
    expect(source).toContain('style={{ top: "40%" }}');
    expect(source).toContain('<BrandSeal size="lg"');
    expect(source).toContain('className="envelope-pool dusk-pool"');
    expect(source).toContain(
      'style={{ top: "calc(40% + var(--space-8))", bottom: "var(--space-4)" }}',
    );
    expect(source).toContain(
      '"absolute inset-x-0 flex items-center justify-center px-4 text-center"',
    );
    expect(source).toContain(
      'const TITLE_CLASSES = "line-clamp-3 break-words text-heading-md text-app-text"',
    );
  });

  it("has the light pool's geometry the preview draws", () => {
    const globals = readFileSync(
      path.resolve(import.meta.dirname, "../../app/globals.css"),
      "utf8",
    );
    const pool = /\.envelope-pool \{([^}]*)\}/.exec(globals)?.[1] ?? "";
    for (const rule of [
      "inset-inline: 0;",
      "bottom: 0;",
      "aspect-ratio: 4 / 1;",
      "translate: 0 50%;",
    ]) {
      expect(pool).toContain(rule);
    }
  });
});

describe("envelopePreviewSvg", () => {
  it("draws the envelope on its dusk field, the title in the app font, in app-token colours only", () => {
    const title = "Maya & Jonas: A Garden Supper Under the Stars";
    const svg = envelopePreviewSvg(title, fonts);
    // The live title area: 358.4px wide less px-4 either side.
    const lines = envelopeTitleLines(title, (s) => font.measure(s, ENVELOPE_TITLE_STYLE), 326.4);
    expect(lines.length).toBe(2);
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 1200 630"/);
    expect(svg).toContain(
      `<rect width="1200" height="630" fill="${HOUSE.dusk}" data-envelope-field=""/>`,
    );
    expect(svg).toContain("data-envelope-pool");
    expect(svg.match(/data-envelope-title-line=/g)).toHaveLength(lines.length);
    expect(svg).toContain(`<g data-envelope-title="" fill="${HOUSE.text}">`);
    expect(svg).toContain(`fill="${HOUSE.action}"`);
    expect(svg).toContain(`<path fill="${HOUSE.actionText}"`);
    const colours = new Set(svg.match(/#[0-9a-fA-F]{6}\b/g));
    const pool = `#${HOUSE.duskPool.rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
    const house = new Set<string>([
      HOUSE.dusk,
      HOUSE.lit,
      HOUSE.text,
      HOUSE.action,
      HOUSE.actionText,
      HOUSE.shadowSoft.color,
      pool,
      ...HOUSE.litGradient.stops.map((s) => s.color),
    ]);
    for (const colour of colours) expect(house.has(colour), colour).toBe(true);
    expect(colours.size).toBeGreaterThanOrEqual(8);
  });

  it("carries nothing from a card: no image, no card outline or text, no other text", () => {
    const svg = envelopePreviewSvg("Maya & Jonas", fonts);
    expect(svg).not.toMatch(/<image|data-card|card-outline|<text|font-family|href=/);
    // Its only input is the title: the same title always draws the same envelope.
    expect(envelopePreviewSvg("Maya & Jonas", fonts)).toBe(svg);
  });

  it("sets each title line centred at its measured width", () => {
    const svg = envelopePreviewSvg("Garden Supper", fonts);
    const m = /data-envelope-title-line="0" transform="translate\(([\d.]+) ([\d.]+)\)"/.exec(svg);
    const width = font.measure("Garden Supper", ENVELOPE_TITLE_STYLE);
    // The live envelope: 358.4px wide, 16px padding, scaled into the image.
    const innerWidth = 358.4 - 32;
    expect(Number(m![1])).toBeCloseTo(16 + (innerWidth - width) / 2, 2);
  });

  it("centres the seal's bold R at the flap's point", () => {
    const svg = envelopePreviewSvg("Garden Supper", fonts);
    const seal = /<g data-envelope-seal="">(.*?)<\/g>/.exec(svg)![1];
    // Flap's point: 40% of the 358.4 x 250.88 envelope.
    expect(seal).toContain('<circle cx="179.2" cy="100.352" r="24" fill="#f4a43a"/>');
    const m = /transform="translate\(([\d.]+) ([\d.]+)\)"/.exec(seal)!;
    const width = fonts.seal.measure("R", { size: 26, letterSpacingEm: -0.005 });
    expect(Number(m[1])).toBeCloseTo(179.2 - width / 2, 2);
    // Bold is not medium: the seal is drawn from the 700 file.
    expect(width).not.toBeCloseTo(font.measure("R", { size: 26, letterSpacingEm: -0.005 }), 2);
  });

  it("sets a title from the Alegreya Sans subset the app loads, and refuses what the app would not set in it", () => {
    expect(() => envelopePreviewSvg("Zoë & Œdipe · Café “Ångström” – 10 €", fonts)).not.toThrow();
    // The app loads Alegreya Sans's latin subset only: a browser sets these in a fallback face.
    for (const title of ["Łódź", "Αθήνα", "Москва", "Hà Nội", "Party 🎉"]) {
      expect(() => envelopePreviewSvg(title, fonts), title).toThrow(UndrawableTextError);
    }
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

  it("is set at the heading weight, the seal bold, only", () => {
    expect(() => envelopePreviewSvg("Maya", { title: fonts.seal, seal: fonts.seal })).toThrow(
      /weight 500/,
    );
    expect(() => envelopePreviewSvg("Maya", { title: font, seal: font })).toThrow(/weight 700/);
  });
});
