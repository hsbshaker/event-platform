import { beforeAll, describe, expect, it } from "vitest";

import { flatArtwork } from "@/lib/link-preview/test-artwork";

import { InvalidCardDataError } from "./card-data";
import { panelFor } from "./layouts";
import { outlinePath } from "./outline";
import { artworkMime, cardPreviewSvg, type CardPreviewData } from "./preview-svg.server";
import type { TextBox } from "./text-box";
import { loadCuratedGlyphOutlines } from "./text/curated-fonts";
import type { GlyphOutlines, GlyphOutlinesResolver } from "./text/glyph-outlines";
import { CURATED_FONT_DIR } from "./text/test-fonts";

const PORTRAIT = flatArtwork(10, 14, [232, 220, 200]);
const SQUARE = flatArtwork(10, 10, [232, 220, 200]);

function box(over: Partial<TextBox> = {}): TextBox {
  return {
    id: "title",
    source: { kind: "wording", slot: "title" },
    x: 120,
    y: 800,
    width: 760,
    rotation: 0,
    font: { family: "Playfair Display", weight: 400, italic: false },
    size: 104,
    color: "#3A2A1E",
    align: "center",
    letterSpacing: 0,
    lineHeight: 1.05,
    textCase: "none",
    z: 0,
    lines: ["A Little", "Wild One"],
    ...over,
  };
}

const DATE = (over: Partial<TextBox> = {}) =>
  box({
    id: "date",
    source: { kind: "fact", slot: "date" },
    y: 1100,
    font: { family: "DM Sans", weight: 400, italic: false },
    size: 24,
    letterSpacing: 0.06,
    lineHeight: 1.45,
    textCase: "uppercase",
    color: "#1F3A5F",
    z: 1,
    lines: ["Saturday, June 6"],
    ...over,
  });

let outlines: GlyphOutlinesResolver;
let playfair: GlyphOutlines;
let dmSans: GlyphOutlines;

beforeAll(async () => {
  playfair = await loadCuratedGlyphOutlines(box().font, CURATED_FONT_DIR);
  dmSans = await loadCuratedGlyphOutlines(DATE().font, CURATED_FONT_DIR);
  outlines = (font) => (font.family === "DM Sans" ? dmSans : playfair);
});

function card(over: Partial<CardPreviewData> = {}): CardPreviewData {
  return {
    shape: "arch",
    artwork: { bytes: PORTRAIT, proportion: "5:7" },
    boxes: [box(), DATE()],
    ...over,
  };
}

const svg = (over: Partial<CardPreviewData> = {}) => cardPreviewSvg(card(over), outlines);

/** The `<g data-card-box=…>` element for `id`, up to its closing tag. */
function boxGroup(doc: string, id: string): string {
  const start = doc.indexOf(`<g data-card-box="${id}"`);
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  const re = /<g[ >]|<\/g>/g;
  re.lastIndex = start;
  for (let m = re.exec(doc); m; m = re.exec(doc)) {
    depth += m[0] === "</g>" ? -1 : 1;
    if (depth === 0) return doc.slice(start, m.index + 4);
  }
  throw new Error("unclosed group");
}

const translate = (group: string, line: number) => {
  const m = new RegExp(
    `data-card-line="${line}" transform="translate\\(([-\\d.]+) ([-\\d.]+)\\)"`,
  ).exec(group);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

describe("cardPreviewSvg", () => {
  it("is an SVG in card units, clipped to the shape's outline", () => {
    const doc = svg();
    expect(doc).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 1000 1400"/);
    expect(doc).toContain(`<clipPath id="card-outline"><path d="${outlinePath("arch")}"/>`);
    // Everything drawn is inside the clipped group.
    const clipped = doc.indexOf('<g clip-path="url(#card-outline)">');
    expect(clipped).toBeGreaterThan(-1);
    expect(doc.indexOf("<image")).toBeGreaterThan(clipped);
    expect(doc.indexOf("data-card-text")).toBeGreaterThan(clipped);
    const circle = svg({ shape: "circle", artwork: { bytes: SQUARE, proportion: "1:1" } });
    expect(circle).toContain('viewBox="0 0 1000 1000"');
    expect(circle).toContain(`<path d="${outlinePath("circle")}"/>`);
  });

  it("stretches the artwork over the canvas, as InvitationCard's object-fit: fill", () => {
    const doc = svg();
    expect(doc).toMatch(
      /<image href="data:image\/png;base64,[A-Za-z0-9+/=]+" x="0" y="0" width="1000" height="1400" preserveAspectRatio="none"\/>/,
    );
  });

  it("draws one glyph group per stored line, in the box's colour", () => {
    const doc = svg();
    const title = boxGroup(doc, "title");
    const date = boxGroup(doc, "date");
    expect(title.match(/data-card-line=/g)).toHaveLength(2);
    expect(date.match(/data-card-line=/g)).toHaveLength(1);
    expect(title).toContain('fill="#3A2A1E"');
    expect(date).toContain('fill="#1F3A5F"');
    // Every line has glyph outlines; there is no text element for a rasterizer to set.
    expect(title.match(/<path d="M/g)).toHaveLength(2);
    expect(doc).not.toMatch(/<text|<tspan|font-family/);
  });

  it("sets each line at the measured width, aligned in the box, on the CSS baseline", () => {
    const style = { size: 104, letterSpacingEm: 0, textCase: "none" as const };
    const doc = svg();
    const title = boxGroup(doc, "title");
    const lineBox = 104 * 1.05;
    const { ascent, descent } = playfair.verticalMetrics(104);
    const baseline = (lineBox - (ascent + descent)) / 2 + ascent;
    ["A Little", "Wild One"].forEach((text, i) => {
      const [dx, dy] = translate(title, i)!;
      expect(dx).toBeCloseTo((760 - playfair.metrics.measure(text, style)) / 2, 2);
      expect(dy).toBeCloseTo(i * lineBox + baseline, 2);
    });
    expect(title).toContain('transform="translate(120 800)"');

    const width = (text: string) => playfair.metrics.measure(text, style);
    const right = boxGroup(svg({ boxes: [box({ align: "right" })] }), "title");
    expect(translate(right, 0)![0]).toBeCloseTo(760 - width("A Little"), 2);
    const left = boxGroup(svg({ boxes: [box({ align: "left" })] }), "title");
    expect(translate(left, 0)![0]).toBe(0);
  });

  it("start-aligns a line wider than its box, as browsers do", () => {
    const doc = svg({ boxes: [box({ width: 100, align: "right" })] });
    expect(translate(boxGroup(doc, "title"), 0)![0]).toBe(0);
  });

  it("measures with the box's letter spacing and case", () => {
    const doc = svg();
    const date = boxGroup(doc, "date");
    const w = dmSans.metrics.measure("Saturday, June 6", {
      size: 24,
      letterSpacingEm: 0.06,
      textCase: "uppercase",
    });
    expect(translate(date, 0)![0]).toBeCloseTo((760 - w) / 2, 2);
    // Upper case changes the glyphs drawn.
    const lower = boxGroup(svg({ boxes: [DATE({ textCase: "none" })] }), "date");
    expect(lower).not.toBe(date);
  });

  it("rotates a box about its centre", () => {
    const doc = svg({ boxes: [box({ rotation: -12.5 })] });
    const height = 104 * 1.05 * 2;
    expect(boxGroup(doc, "title")).toContain(
      `transform="translate(120 800) rotate(-12.5 380 ${Math.round((height / 2) * 1000) / 1000})"`,
    );
  });

  it("paints by z, then reading order; skips boxes without lines", () => {
    const doc = svg({
      boxes: [
        box({ id: "top", y: 100, z: 3, lines: ["top"] }),
        box({ id: "low", y: 900, z: 0, lines: ["low"] }),
        box({ id: "mid", y: 500, z: 0, lines: ["mid"] }),
        box({ id: "empty", y: 50, z: 9, lines: [] }),
      ],
    });
    const order = [...doc.matchAll(/data-card-box="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["mid", "low", "top"]);
  });

  it("draws a faded panel as InvitationCard does: the same stops, opaque over its rectangle", () => {
    const doc = svg({
      shape: "rectangle",
      panels: [{ ...panelFor("art-bottom", "rectangle"), color: "#F6F1EA" }],
    });
    expect(doc).toContain(
      '<linearGradient id="card-panel-fade-0" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="810">' +
        '<stop offset="0%" stop-color="#F6F1EA"/><stop offset="77.778%" stop-color="#F6F1EA"/>' +
        '<stop offset="80.556%" stop-color="#F6F1EA" stop-opacity="0.9619"/>' +
        '<stop offset="83.333%" stop-color="#F6F1EA" stop-opacity="0.8536"/>' +
        '<stop offset="86.111%" stop-color="#F6F1EA" stop-opacity="0.6913"/>' +
        '<stop offset="88.889%" stop-color="#F6F1EA" stop-opacity="0.5"/>' +
        '<stop offset="91.667%" stop-color="#F6F1EA" stop-opacity="0.3087"/>' +
        '<stop offset="94.444%" stop-color="#F6F1EA" stop-opacity="0.1464"/>' +
        '<stop offset="97.222%" stop-color="#F6F1EA" stop-opacity="0.0381"/>' +
        '<stop offset="100%" stop-color="#F6F1EA" stop-opacity="0"/></linearGradient>',
    );
    expect(doc).toContain(
      '<g data-card-panel="0"><rect x="0" y="0" width="1000" height="810" fill="url(#card-panel-fade-0)"/></g>',
    );
    expect(doc).not.toMatch(/<mask|feGaussianBlur/);
    expect(doc.indexOf("<image")).toBeLessThan(doc.indexOf("data-card-panel"));
    expect(doc.indexOf("data-card-panel")).toBeLessThan(doc.indexOf("data-card-text"));
  });

  it("feathers a wash panel on every side: the horizontal fade as a mask over the vertical", () => {
    const doc = svg({
      shape: "rectangle",
      panels: [
        {
          x: 150,
          y: 370,
          width: 700,
          height: 660,
          radius: 0,
          softEdge: { spread: 0, blur: 0 },
          fade: { kind: "wash", feather: 140 },
          color: "#F6F1EA",
        },
      ],
    });
    expect(doc).toContain(
      '<linearGradient id="card-panel-fade-0" gradientUnits="userSpaceOnUse" x1="0" y1="230" x2="0" y2="1170">' +
        '<stop offset="0%" stop-color="#F6F1EA" stop-opacity="0"/>',
    );
    expect(doc).toContain(
      '<linearGradient id="card-panel-side-0" gradientUnits="userSpaceOnUse" x1="10" y1="0" x2="990" y2="0">' +
        '<stop offset="0%" stop-color="#FFFFFF" stop-opacity="0"/>',
    );
    expect(doc).toContain(
      '<stop offset="14.286%" stop-color="#FFFFFF"/><stop offset="85.714%" stop-color="#FFFFFF"/>',
    );
    expect(doc).toContain(
      '<mask id="card-panel-mask-0" maskUnits="userSpaceOnUse" x="10" y="230" width="980" height="940">' +
        '<rect x="10" y="230" width="980" height="940" fill="url(#card-panel-side-0)"/></mask>',
    );
    expect(doc).toContain(
      '<g data-card-panel="0"><rect x="10" y="230" width="980" height="940" fill="url(#card-panel-fade-0)" mask="url(#card-panel-mask-0)"/></g>',
    );
  });

  it("draws a card_layouts_v2 panel exactly as before: opaque, with the soft edge under it", () => {
    // Backward compatibility: panels persisted with card_layouts_v2 artwork carry no fade.
    const doc = svg({
      panels: [
        {
          x: 80,
          y: 770,
          width: 840,
          height: 510,
          radius: 28,
          softEdge: { spread: 20, blur: 40 },
          color: "#F6F1EA",
        },
      ],
    });
    expect(doc).toContain(
      '<rect x="60" y="750" width="880" height="550" rx="48" fill="#F6F1EA" filter="url(#card-panel-soft-0)"/>' +
        '<rect x="80" y="770" width="840" height="510" rx="28" fill="#F6F1EA"/>',
    );
    expect(doc).toContain('<feGaussianBlur stdDeviation="20"/>');
    expect(doc.indexOf("data-card-panel")).toBeLessThan(doc.indexOf("data-card-text"));
    expect(doc.indexOf("<image")).toBeLessThan(doc.indexOf("data-card-panel"));
    expect(doc).not.toMatch(/opacity/);
  });

  it("refuses what InvitationCard refuses, and artwork that is not PNG or JPEG", () => {
    const bad: [string, Partial<CardPreviewData>][] = [
      ["proportion", { artwork: { bytes: PORTRAIT, proportion: "1:1" } }],
      ["colour", { boxes: [box({ color: "red" })] }],
      ["fractional z", { boxes: [box({ z: 0.5 })] }],
      ["line break", { boxes: [box({ lines: ["two\nlines"] })] }],
      ["duplicate ids", { boxes: [box(), box()] }],
      [
        "invalid fade",
        {
          panels: [
            {
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              radius: 0,
              softEdge: { spread: 0, blur: 0 },
              fade: { kind: "edge", from: "top", length: -1 },
              color: "#FFFFFF",
            },
          ],
        },
      ],
      [
        "fade with a soft edge",
        {
          panels: [
            {
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              radius: 0,
              softEdge: { spread: 20, blur: 40 },
              fade: { kind: "wash", feather: 140 },
              color: "#FFFFFF",
            },
          ],
        },
      ],
      [
        "artwork bytes",
        { artwork: { bytes: new TextEncoder().encode("<svg/>"), proportion: "5:7" } },
      ],
    ];
    for (const [label, over] of bad) {
      expect(() => svg(over), label).toThrow(InvalidCardDataError);
    }
    expect(artworkMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });

  it("escapes a box id", () => {
    const doc = svg({ boxes: [box({ id: 'x" onload="y' })] });
    expect(doc).toContain('data-card-box="x&quot; onload=&quot;y"');
  });
});
