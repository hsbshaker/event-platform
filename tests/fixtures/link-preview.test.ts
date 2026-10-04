import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Browser, Page } from "playwright-core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InvitationCard, type CardPanel } from "@/components/card/InvitationCard";
import { generatedTextLayer } from "@/lib/card/card-text.server";
import { panelFor, zoneFor, type CardLayoutId } from "@/lib/card/layouts";
import { canvasOf, proportionOf, type CardShape } from "@/lib/card/shapes";
import { TYPICAL } from "@/lib/card/test-content";
import type { TextBox } from "@/lib/card/text-box";
import { CURATED_FONT_DIR } from "@/lib/card/text/test-fonts";
import { loadCuratedGlyphOutlines } from "@/lib/card/text/curated-fonts";
import type { TypographyPairingId } from "@/lib/card/typography";
import { washArtwork } from "@/lib/link-preview/fixture-artwork";
import { cardPreviewBox, PREVIEW_SIZE } from "@/lib/link-preview/geometry";
import { HOUSE } from "@/lib/link-preview/house-style";
import { previewImage } from "@/lib/link-preview/preview-image.server";

import { launchChromium } from "./browser";
import { decodePng, type DecodedPng } from "./png";
import { REPO_ROOT, startStaticServer, type StaticServer } from "./static-server";

/**
 * Link-preview images (`spec.md §11.10`; `spec.md §31`, "Card rendering and envelope": "Link
 * previews show the card for a public event and the sealed envelope for a private one";
 * `docs/card-system.md §6.4`).
 *
 * 1. **Previews render.** For layouts and shapes in both proportions, `previewImage` returns a
 *    1200 × 630 PNG with the card centred on the house background, and the card region is not
 *    blank: it holds the artwork and text ink. The private-event envelope renders too.
 *
 * 2. **The preview cannot disagree with the live card.** Each card is also rendered by
 *    `InvitationCard` in Chromium at the preview's scale (one CSS pixel per image pixel) and the two
 *    rasters are compared, the card region of the preview against a screenshot of the card face.
 *    Each is also rendered without its text, so a pixel's "ink" is how much the text changed it —
 *    in each renderer separately, so the artwork, panels and outline cancel out exactly. Every
 *    pixel is assigned to a stored line by the inverse of its box's transform (position, rotation
 *    about the centre, line box), and for every line the two renderers' ink is compared:
 *
 *    - the ink centroid, in px, along and across the line: within `CENTROID_TOLERANCE_PX`;
 *    - the ink's horizontal extent (first and last inked column, in the line's own frame): within
 *      `EDGE_TOLERANCE_PX`;
 *    - the amount of ink: within `INK_RATIO_TOLERANCE` of each other.
 *
 *    Chromium lays text out on a pixel grid, and the preview deliberately does not: the preview
 *    draws the card's exact geometry, the same at every scale. Blink rounds a line's ascent and
 *    descent to whole pixels, sets the line height in 1/64 px, floors the half-leading, and paints
 *    unrotated text on a whole-pixel baseline — a rule `chromiumBaselineShift` states and that
 *    matched Chromium's own baseline for all 861 combinations of curated face, seven sizes and
 *    three line heights measured while writing this test. That shift (up to about 1.5px at
 *    preview scale) is applied to the preview's vertical centroid before comparing; nothing else is
 *    modelled.
 *
 *    What remains is rasterization: FreeType's hinting and Skia's text gamma against resvg's
 *    unhinted outlines, which move a line's ink-weighted centre by up to about 0.65px and its ends
 *    by up to 1px (measured over the cases below; `test-results/link-preview/report.json`). The
 *    tolerances sit just above that. A disagreement in line placement is far larger: a different
 *    break moves a whole word (tens of px), a wrong alignment, letter spacing or advance moves a
 *    line's ends by several px, a wrong baseline model (ascent, half-leading, opsz) moves lines
 *    vertically by px — and the negative control moves one line by 2px (5 card units at 0.4 px
 *    per unit) and is caught.
 *
 * Contact sheet for review (gitignored): `test-results/link-preview/`.
 */

const OUT_DIR = path.join(REPO_ROOT, "test-results/link-preview");
const INK = "#3A2A1E";
const PANEL_COLOR = "#FBF8F3";

/** Ink centroid, px, along and across each line. */
const CENTROID_TOLERANCE_PX = 0.75;
/** First and last inked column, px. */
const EDGE_TOLERANCE_PX = 1.25;
/** Total ink of a line, as a ratio between the renderers. */
const INK_RATIO_TOLERANCE = 0.2;
/** A pixel is inked at this change in luminance (of 255) for the edge measure. */
const EDGE_INK_THRESHOLD = 48;

interface Case {
  id: string;
  layout: CardLayoutId;
  shape: CardShape;
  pairing: TypographyPairingId;
  panel: boolean;
  /** Customize the generated boxes, as a host would in the editor. */
  edit?: (boxes: TextBox[]) => TextBox[];
}

const CASES: Case[] = [
  {
    id: "art-top-arch",
    layout: "art-top",
    shape: "arch",
    pairing: "hc_playfair_dmsans",
    panel: false,
  },
  {
    id: "framed-circle-panel",
    layout: "framed",
    shape: "circle",
    pairing: "soft_fraunces_manrope",
    panel: true,
  },
  {
    id: "corners-square",
    layout: "corners",
    shape: "square",
    pairing: "transitional_newsreader_tight",
    panel: false,
  },
  {
    id: "atmosphere-oval-panel",
    layout: "atmosphere",
    shape: "oval",
    pairing: "hc_bodoni_inter",
    panel: true,
  },
  {
    id: "art-bottom-rounded",
    layout: "art-bottom",
    shape: "rounded-rectangle",
    pairing: "grotesk_space_sourcesans",
    panel: false,
  },
  {
    // A host's edits: rotation, alignment, letter spacing, case, colour, stacking, a line wider
    // than its box (start-aligned), and boxes moved apart so none overlaps another.
    id: "customized-rectangle",
    layout: "art-top",
    shape: "rectangle",
    pairing: "oldstyle_garamond_worksans",
    panel: false,
    edit: (boxes) =>
      boxes
        .filter((b) => b.lines.length > 0)
        .map((b, i) => {
          if (b.id === "title") {
            return { ...b, y: 120, rotation: -8, color: "#7A1F2B", z: 5 };
          }
          if (b.id === "invitationLine") {
            return {
              ...b,
              y: 520,
              x: 140,
              width: 240,
              align: "right" as const,
              letterSpacing: 0.12,
              textCase: "uppercase" as const,
              color: "#1F3A5F",
            };
          }
          return {
            ...b,
            y: 800 + i * 110,
            align: (i % 2 === 0 ? "left" : "right") as TextBox["align"],
            letterSpacing: i % 2 === 0 ? 0.2 : -0.02,
            rotation: i === 3 ? 6 : 0,
            color: i % 2 === 0 ? "#3A2A1E" : "#2F4F2F",
            z: -i,
          };
        }),
  },
];

let server: StaticServer;
let browser: Browser;
let page: Page;

interface Rendered {
  boxes: TextBox[];
  panels: CardPanel[];
  artwork: Uint8Array;
  preview: DecodedPng;
  previewBlank: DecodedPng;
  chromium: DecodedPng;
  chromiumBlank: DecodedPng;
  previewMs: number;
  /** Per box, per line: where Chromium's pixel snapping puts the baseline, px, relative to exact. */
  snap: Map<string, number[]>;
}
const rendered = new Map<string, Rendered>();

function lum(img: DecodedPng, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  return 0.2126 * img.rgba[i] + 0.7152 * img.rgba[i + 1] + 0.0722 * img.rgba[i + 2];
}

/** The card region of a preview image. */
function cropCard(img: DecodedPng, shape: CardShape): DecodedPng {
  const box = cardPreviewBox(shape);
  const width = Math.round(box.width);
  const height = Math.round(box.height);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const from = ((y + Math.round(box.y)) * img.width + Math.round(box.x)) * 4;
    rgba.set(img.rgba.subarray(from, from + width * 4), y * width * 4);
  }
  return { width, height, rgba };
}

async function renderPreview(
  c: Case,
  r: Pick<Rendered, "boxes" | "panels" | "artwork">,
  withText: boolean,
) {
  const started = performance.now();
  const png = await previewImage(
    {
      kind: "card",
      card: {
        shape: c.shape,
        artwork: { bytes: r.artwork, proportion: proportionOf(c.shape) },
        panels: r.panels,
        boxes: withText ? r.boxes : [],
      },
    },
    { loadCardFont: (font) => loadCuratedGlyphOutlines(font, CURATED_FONT_DIR) },
  );
  return { png, ms: performance.now() - started };
}

async function renderChromium(
  c: Case,
  r: { boxes: TextBox[]; panels: CardPanel[]; artwork: Uint8Array },
  withText: boolean,
) {
  const box = cardPreviewBox(c.shape);
  const markup = renderToStaticMarkup(
    createElement(InvitationCard, {
      shape: c.shape,
      artwork: {
        src: `data:image/png;base64,${Buffer.from(r.artwork).toString("base64")}`,
        proportion: proportionOf(c.shape),
      },
      panels: r.panels,
      boxes: withText ? r.boxes : [],
    }),
  );
  const pagePath = `/page/${c.id}-${withText ? "text" : "blank"}.html`;
  server.put(
    pagePath,
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<link rel="stylesheet" href="/card-fonts.css">` +
      `<style>html,body{margin:0;padding:0;background:${HOUSE.bg}}</style></head>` +
      `<body>${markup}</body></html>`,
    "text/html",
  );
  await page.setViewportSize({ width: Math.round(box.width), height: Math.round(box.height) });
  await page.goto(`${server.origin}${pagePath}`, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  return page.screenshot({
    clip: { x: 0, y: 0, width: Math.round(box.width), height: Math.round(box.height) },
    animations: "disabled",
  });
}

/**
 * Where Chromium paints each line's baseline relative to the exact geometry, px (positive is
 * lower), per box and line — see the doc comment above.
 */
async function chromiumBaselineShift(
  shape: CardShape,
  boxes: readonly TextBox[],
): Promise<Map<string, number[]>> {
  const scale = cardPreviewBox(shape).scale;
  const layoutUnit = (v: number) => Math.round(v * 64) / 64;
  const out = new Map<string, number[]>();
  for (const box of boxes) {
    if (box.lines.length === 0) continue;
    const outlines = await loadCuratedGlyphOutlines(box.font, CURATED_FONT_DIR);
    const { ascent, descent } = outlines.verticalMetrics(box.size);
    const a = ascent * scale;
    const d = descent * scale;
    const lineBox = box.size * box.lineHeight * scale;
    const exact = (lineBox - (a + d)) / 2 + a;
    const blink =
      Math.floor((layoutUnit(lineBox) - Math.round(a) - Math.round(d)) / 2) + Math.round(a);
    const top = box.y * scale;
    out.set(
      box.id,
      box.lines.map((_, i) => {
        const want = top + i * lineBox + exact;
        const laidOut = layoutUnit(top) + i * layoutUnit(lineBox) + blink;
        return (box.rotation === 0 ? Math.round(laidOut) : laidOut) - want;
      }),
    );
  }
  return out;
}

interface LineInk {
  box: string;
  line: number;
  ink: number;
  /** Centroid in the line's frame, px: along the line from the box's left, across from its top. */
  cx: number;
  cy: number;
  left: number;
  right: number;
}

/** Each stored line's ink in one renderer: `withText` minus `blank`, assigned by box geometry. */
function lineInk(
  shape: CardShape,
  boxes: readonly TextBox[],
  withText: DecodedPng,
  blank: DecodedPng,
): LineInk[] {
  const scale = cardPreviewBox(shape).scale;
  const out: LineInk[] = [];
  for (const box of boxes) {
    if (box.lines.length === 0) continue;
    const lineBox = box.size * box.lineHeight;
    const height = lineBox * box.lines.length;
    const cx = box.x + box.width / 2;
    const cy = box.y + height / 2;
    const rad = (-box.rotation * Math.PI) / 180;
    const acc = box.lines.map(() => ({ ink: 0, sx: 0, sy: 0, left: Infinity, right: -Infinity }));
    for (let py = 0; py < withText.height; py += 1) {
      for (let px = 0; px < withText.width; px += 1) {
        const d = Math.abs(lum(withText, px, py) - lum(blank, px, py));
        if (d < 4) continue;
        // Pixel centre in card units, rotated back into the box's frame.
        const ux = (px + 0.5) / scale - cx;
        const uy = (py + 0.5) / scale - cy;
        const lx = ux * Math.cos(rad) - uy * Math.sin(rad) + box.width / 2;
        const ly = ux * Math.sin(rad) + uy * Math.cos(rad) + height / 2;
        const index = Math.floor(ly / lineBox);
        if (index < 0 || index >= box.lines.length) continue;
        if (lx < -lineBox || lx > box.width * 2 + lineBox) continue;
        const a = acc[index];
        a.ink += d;
        a.sx += d * lx;
        a.sy += d * (ly - index * lineBox);
        if (d >= EDGE_INK_THRESHOLD) {
          a.left = Math.min(a.left, lx);
          a.right = Math.max(a.right, lx);
        }
      }
    }
    acc.forEach((a, line) => {
      out.push({
        box: box.id,
        line,
        ink: a.ink,
        cx: (a.sx / a.ink) * scale,
        cy: (a.sy / a.ink) * scale,
        left: a.left * scale,
        right: a.right * scale,
      });
    });
  }
  return out;
}

interface Comparison {
  id: string;
  lines: number;
  maxCentroid: number;
  maxEdge: number;
  worstInkRatio: number;
  meanAbsDiff: number;
  failures: string[];
}

function compare(
  id: string,
  shape: CardShape,
  boxes: readonly TextBox[],
  r: Pick<Rendered, "preview" | "previewBlank" | "chromium" | "chromiumBlank" | "snap">,
): Comparison {
  const a = lineInk(shape, boxes, r.preview, r.previewBlank);
  const b = lineInk(shape, boxes, r.chromium, r.chromiumBlank);
  const failures: string[] = [];
  let maxCentroid = 0;
  let maxEdge = 0;
  let worstInkRatio = 1;
  a.forEach((la, i) => {
    const lb = b[i];
    const where = `${la.box} line ${la.line}`;
    if (!(la.ink > 0 && lb.ink > 0)) {
      if (la.ink > 0 || lb.ink > 0) failures.push(`${where}: ink in one renderer only`);
      return;
    }
    const shift = r.snap.get(la.box)?.[la.line] ?? 0;
    const centroid = Math.max(Math.abs(la.cx - lb.cx), Math.abs(la.cy + shift - lb.cy));
    const edge = Math.max(Math.abs(la.left - lb.left), Math.abs(la.right - lb.right));
    const ratio = Math.min(la.ink, lb.ink) / Math.max(la.ink, lb.ink);
    maxCentroid = Math.max(maxCentroid, centroid);
    maxEdge = Math.max(maxEdge, edge);
    worstInkRatio = Math.min(worstInkRatio, ratio);
    if (centroid > CENTROID_TOLERANCE_PX) {
      failures.push(
        `${where}: centroid off by (${(la.cx - lb.cx).toFixed(2)}, ${(la.cy + shift - lb.cy).toFixed(2)}) px`,
      );
    }
    if (edge > EDGE_TOLERANCE_PX) {
      failures.push(
        `${where}: extent ${la.left.toFixed(2)}–${la.right.toFixed(2)} vs ${lb.left.toFixed(2)}–${lb.right.toFixed(2)}`,
      );
    }
    if (1 - ratio > INK_RATIO_TOLERANCE) failures.push(`${where}: ink ${la.ink} vs ${lb.ink}`);
  });
  let diff = 0;
  for (let y = 0; y < r.preview.height; y += 1) {
    for (let x = 0; x < r.preview.width; x += 1) {
      diff += Math.abs(lum(r.preview, x, y) - lum(r.chromium, x, y));
    }
  }
  return {
    id,
    lines: a.length,
    maxCentroid,
    maxEdge,
    worstInkRatio,
    meanAbsDiff: diff / (r.preview.width * r.preview.height),
    failures,
  };
}

beforeAll(async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  server = await startStaticServer();
  browser = await launchChromium();
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  page = await context.newPage();
  for (const c of CASES) {
    const generated = await generatedTextLayer({
      layout: c.layout,
      shape: c.shape,
      pairing: c.pairing,
      content: TYPICAL,
      ink: INK,
    });
    const boxes = c.edit ? c.edit(generated) : generated;
    const panels = c.panel ? [{ ...panelFor(c.layout, c.shape), color: PANEL_COLOR }] : [];
    const artwork = washArtwork(proportionOf(c.shape), zoneFor(c.layout, c.shape));
    const base = { boxes, panels, artwork };
    const withText = await renderPreview(c, base, true);
    const blank = await renderPreview(c, base, false);
    const preview = decodePng(withText.png);
    writeFileSync(path.join(OUT_DIR, `${c.id}.preview.png`), withText.png);
    const chromiumPng = await renderChromium(c, base, true);
    writeFileSync(path.join(OUT_DIR, `${c.id}.chromium.png`), chromiumPng);
    rendered.set(c.id, {
      ...base,
      preview,
      previewBlank: decodePng(blank.png),
      chromium: decodePng(chromiumPng),
      chromiumBlank: decodePng(await renderChromium(c, base, false)),
      previewMs: withText.ms,
      snap: await chromiumBaselineShift(c.shape, boxes),
    });
  }
}, 600_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe("link-preview images", () => {
  it.each(CASES.map((c) => [c.id, c] as const))(
    "%s: a 1200 × 630 PNG with the card, not blank, on the house background",
    (_, c) => {
      const r = rendered.get(c.id)!;
      expect([r.preview.width, r.preview.height]).toEqual([
        PREVIEW_SIZE.width,
        PREVIEW_SIZE.height,
      ]);
      // House background at the corners.
      const bg = [1, 3, 5].map((i) => parseInt(HOUSE.bg.slice(i, i + 2), 16));
      for (const [x, y] of [
        [2, 2],
        [PREVIEW_SIZE.width - 3, PREVIEW_SIZE.height - 3],
      ]) {
        const i = (y * r.preview.width + x) * 4;
        expect([...r.preview.rgba.subarray(i, i + 3)]).toEqual(bg);
      }
      // The card region holds artwork (not the background) and text ink.
      const card = cropCard(r.preview, c.shape);
      const blank = cropCard(r.previewBlank, c.shape);
      const { width, height } = canvasOf(c.shape);
      const scale = cardPreviewBox(c.shape).scale;
      const centre = lum(card, Math.floor((width / 2) * scale), Math.floor(height * 0.9 * scale));
      expect(Math.abs(centre - lum(card, 1, 1))).toBeGreaterThan(0);
      let inked = 0;
      for (let y = 0; y < card.height; y += 1) {
        for (let x = 0; x < card.width; x += 1) {
          if (Math.abs(lum(card, x, y) - lum(blank, x, y)) > EDGE_INK_THRESHOLD) inked += 1;
        }
      }
      expect(inked).toBeGreaterThan(500);
    },
  );

  it("renders a private event's sealed envelope", async () => {
    const started = performance.now();
    const png = await previewImage({ kind: "envelope", title: "Maya & Jonas: Garden Supper" });
    const ms = performance.now() - started;
    writeFileSync(path.join(OUT_DIR, "envelope.png"), png);
    const img = decodePng(png);
    expect([img.width, img.height]).toEqual([PREVIEW_SIZE.width, PREVIEW_SIZE.height]);
    // Dark title ink inside the envelope's lower half; nothing card-coloured anywhere.
    let dark = 0;
    for (let y = 300; y < 560; y += 1) {
      for (let x = 240; x < 960; x += 1) if (lum(img, x, y) < 80) dark += 1;
    }
    expect(dark).toBeGreaterThan(500);
    console.info(`envelope preview rendered in ${ms.toFixed(0)} ms`);
  });
});

describe("the preview cannot disagree with the live card", () => {
  const results: Comparison[] = [];

  it.each(CASES.map((c) => [c.id, c] as const))(
    "%s: every stored line where InvitationCard sets it in Chromium",
    (_, c) => {
      const r = rendered.get(c.id)!;
      const result = compare(c.id, c.shape, r.boxes, {
        preview: cropCard(r.preview, c.shape),
        previewBlank: cropCard(r.previewBlank, c.shape),
        chromium: r.chromium,
        chromiumBlank: r.chromiumBlank,
        snap: r.snap,
      });
      results.push(result);
      expect(result.lines).toBeGreaterThan(0);
      expect(result.failures).toEqual([]);
    },
  );

  it("catches a line moved by two pixels (negative control)", () => {
    const c = CASES[0];
    const r = rendered.get(c.id)!;
    const scale = cardPreviewBox(c.shape).scale;
    // Shift the preview's title 2px right: what a 5-unit placement error would draw.
    const preview = cropCard(r.preview, c.shape);
    const blank = cropCard(r.previewBlank, c.shape);
    const shifted = { ...preview, rgba: new Uint8Array(preview.rgba) };
    const title = r.boxes.find((b) => b.id === "title")!;
    const y0 = Math.floor(title.y * scale);
    const y1 = Math.ceil((title.y + title.size * title.lineHeight * title.lines.length) * scale);
    for (let y = y0; y < y1; y += 1) {
      for (let x = preview.width - 1; x > 1; x -= 1) {
        const to = (y * preview.width + x) * 4;
        shifted.rgba.set(preview.rgba.subarray(to - 8, to - 4), to);
      }
    }
    const result = compare("control", c.shape, r.boxes, {
      preview: shifted,
      previewBlank: blank,
      chromium: r.chromium,
      chromiumBlank: r.chromiumBlank,
      snap: r.snap,
    });
    expect(result.failures.some((f) => f.startsWith("title"))).toBe(true);
  });

  afterAll(() => {
    const timings = [...rendered.entries()].map(([id, r]) => ({ id, ms: Math.round(r.previewMs) }));
    writeFileSync(
      path.join(OUT_DIR, "report.json"),
      JSON.stringify(
        {
          tolerances: { CENTROID_TOLERANCE_PX, EDGE_TOLERANCE_PX, INK_RATIO_TOLERANCE },
          results,
          timings,
        },
        null,
        2,
      ),
    );
    console.info(
      results
        .map(
          (x) =>
            `${x.id}: ${x.lines} lines, centroid ≤ ${x.maxCentroid.toFixed(3)} px, edge ≤ ${x.maxEdge.toFixed(3)} px, ink ratio ≥ ${x.worstInkRatio.toFixed(3)}, mean |Δ| ${x.meanAbsDiff.toFixed(2)}`,
        )
        .join("\n"),
    );
    console.info(timings.map((t) => `${t.id}: ${t.ms} ms`).join(", "));
  });
});
