import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Browser, Page } from "playwright-core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  InvitationCard,
  type CardPanel,
  type CardPlacement,
} from "@/components/card/InvitationCard";
import { generatedTextLayer } from "@/lib/card/card-text.server";
import { panelFeather } from "@/lib/card/card-data";
import { cropRect, plateCut, plateRect } from "@/lib/card/give-way";
import { CARD_LAYOUTS, panelFor, zoneFor, type CardLayoutId } from "@/lib/card/layouts";
import { canvasOf, insideOutline, proportionOf, type CardShape } from "@/lib/card/shapes";
import { TYPICAL, WORST } from "@/lib/card/test-content";
import type { CardContent, TextBox } from "@/lib/card/text-box";
import { CURATED_FONT_DIR } from "@/lib/card/text/test-fonts";
import { loadCuratedGlyphOutlines } from "@/lib/card/text/curated-fonts";
import type { TypographyPairingId } from "@/lib/card/typography";
import { washArtwork } from "@/lib/link-preview/test-artwork";
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
 *    - the line's ends (where its ink, read along the line in its own frame, reaches 2% and 98%):
 *      within `EDGE_TOLERANCE_PX`;
 *    - the amount of ink: within `INK_RATIO_TOLERANCE` of each other.
 *
 *    Chromium lays text out on a pixel grid, and the preview deliberately does not: the preview
 *    draws the card's exact geometry, the same at every scale. So the test does not compare
 *    vertical positions raw: it measures where Chromium put each line's baseline — a zero-size
 *    inline-block at `vertical-align: baseline` appended to every rendered line after the
 *    screenshot, read back with `getBoundingClientRect` and taken into the box's own frame — and
 *    subtracts that line's distance from the exact baseline before comparing centroids. That
 *    distance is Blink's pixel snapping, up to about 2px at preview scale. The preview draws with
 *    the same vertical model as the exact baseline, so a wrong model (ascent, descent,
 *    half-leading, the opsz instance) would move both alike and pass the centroid check; the model
 *    is therefore checked on its own, against Chromium's baselines with the card laid out at
 *    `LARGE_SCALE` px per unit, where snapping is half a card unit. Nothing about Blink's rounding is modelled, so the comparison holds
 *    whatever `text-rendering` mode or Chromium version runs. (An earlier version modelled the
 *    rule — whole-pixel ascent and descent, a floored half-leading, a whole-pixel baseline — which
 *    matched Blink's default text rendering exactly; `text-rendering: geometricPrecision`, which
 *    the card now sets, has Blink take unhinted font metrics instead and lands the baseline about
 *    a pixel elsewhere, so the model stopped matching. The measurement replaces it.)
 *
 *    What remains is rasterization: FreeType's hinting and Skia's text gamma against resvg's
 *    unhinted outlines, which move a line's ink-weighted centre by up to about 0.65px and its ends
 *    by up to 1px (measured over the cases below; `test-results/link-preview/report.json`). The
 *    tolerances sit just above that. A disagreement in line placement is far larger: a different
 *    break moves a whole word (tens of px), a wrong alignment, letter spacing or advance moves a
 *    line's ends by several px, a wrong baseline model (ascent, half-leading, opsz) moves the
 *    measured baseline by px. Three negative controls are caught: the title moved 2px along the
 *    line (5 card units at 0.4 px per unit), the card moved 2px down, and a vertical model 2px off
 *    on both sides.
 *
 * 3. **The preview draws each panel as the live card does.** For every case with a panel — faded
 *    (`card_layouts_v3`: an edge fade and a wash) and the `card_layouts_v2` rounded rectangle with
 *    its soft edge, which artwork persisted before v3 still carries — the two renderers' textless
 *    rasters are compared pixel by pixel over the panel and its fade, inside the outline: the
 *    largest channel difference stays within `PANEL_TOLERANCE` (resampling of the artwork under the
 *    fade, and gradient rounding). A negative control is caught: the live card drawn with a fade
 *    60 units shorter.
 *
 * Contact sheet for review (gitignored): `test-results/link-preview/`.
 */

const OUT_DIR = path.join(REPO_ROOT, "test-results/link-preview");
const INK = "#3A2A1E";
const PANEL_COLOR = "#FBF8F3";

/** Ink centroid, px, along and across each line. */
const CENTROID_TOLERANCE_PX = 0.75;
/** The line's ends (where its ink reaches 2% and 98% along it), px. */
const EDGE_TOLERANCE_PX = 1.25;
/**
 * The vertical model, checked on its own. The preview draws each baseline with the same model
 * (ascent, descent, half-leading, the opsz instance) as the exact baseline the centroids are
 * corrected by, so a wrong model would move both alike and pass the centroid check. Chromium lays
 * the same card out at `LARGE_SCALE` px per card unit, where Blink's pixel snapping (up to about
 * 2px at any scale) is half a card unit, and each line's baseline must sit within
 * `VERTICAL_MODEL_TOLERANCE_UNITS` of the exact one.
 */
const LARGE_SCALE = 4;
const VERTICAL_MODEL_TOLERANCE_UNITS = 0.6;
/**
 * Per channel, of 255: the most a pixel of a panel or its fade may differ between the preview and
 * the live card. Measured at most 3 over the cases below (Skia and resvg dither and round a
 * gradient differently, and resample the artwork under the fade differently); the negative
 * control, a fade 60 units shorter, moves pixels by far more (`panels.json`).
 */
const PANEL_TOLERANCE = 4;
/** Card units a compared pixel keeps from the outline, where the two antialias differently. */
const PANEL_OUTLINE_MARGIN = 6;
/** Total ink of a line, as a ratio between the renderers. */
const INK_RATIO_TOLERANCE = 0.2;
/** A pixel is inked at this change in luminance (of 255) for the edge measure. */
const EDGE_INK_THRESHOLD = 48;
/**
 * The share of a line's ink outside each of its measured ends. Ends are read from the ink's
 * distribution, not from the first pixel over a threshold: a hairline (Bodoni Moda's serifs at
 * 104 units) sits near any threshold, and Skia and resvg shade it a little differently, so a
 * threshold puts the end on the serif in one renderer and past it in the other.
 */
const EDGE_QUANTILE = 0.02;

interface Case {
  id: string;
  layout: CardLayoutId;
  shape: CardShape;
  pairing: TypographyPairingId;
  /** A panel from `panelFor`, or the `card_layouts_v2` panel that persisted artwork still carries. */
  panel: boolean | "v2";
  /** The art giving way (`card_layouts_v4`): a crop or a plate at a scale, as `give-way.ts` builds it. */
  placement?: { kind: "crop" | "plate"; scale: number };
  /** The card's words: typical unless given. */
  content?: CardContent;
  /** Customize the generated boxes, as a host would in the editor. */
  edit?: (boxes: TextBox[]) => TextBox[];
}

const CASES: Case[] = [
  {
    // Every slot at its entry limit, in spaced capitals where the pairing sets them: where an
    // advance or spacing disagreement shows first.
    id: "worst-case-art-top-square",
    layout: "art-top",
    shape: "square",
    pairing: "soft_fraunces_manrope",
    panel: false,
    content: WORST,
  },
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
    // A card_layouts_v3 edge fade: paper from the top edge, fading toward the picture.
    id: "art-bottom-rectangle-panel",
    layout: "art-bottom",
    shape: "rectangle",
    pairing: "oldstyle_garamond_worksans",
    panel: true,
  },
  {
    // Backward compatibility: a panel persisted with card_layouts_v2 artwork (no fade).
    id: "art-top-rectangle-v2-panel",
    layout: "art-top",
    shape: "rectangle",
    pairing: "hc_playfair_dmsans",
    panel: "v2",
  },
  {
    id: "art-bottom-rounded",
    layout: "art-bottom",
    shape: "rounded-rectangle",
    pairing: "grotesk_space_sourcesans",
    panel: false,
  },
  {
    // card_layouts_v4: a plate on an arch, the art and its outline scaled about the top centre.
    id: "art-top-arch-plate",
    layout: "art-top",
    shape: "arch",
    pairing: "hc_playfair_dmsans",
    panel: false,
    placement: { kind: "plate", scale: 0.7 },
  },
  {
    // A plate kept below its cut, on an oval scaled about its bottom point.
    id: "art-bottom-oval-plate",
    layout: "art-bottom",
    shape: "oval",
    pairing: "soft_fraunces_manrope",
    panel: false,
    placement: { kind: "plate", scale: 0.8 },
  },
  {
    // A crop: full bleed, scaled about the top centre.
    id: "art-bottom-square-crop",
    layout: "art-bottom",
    shape: "square",
    pairing: "oldstyle_garamond_worksans",
    panel: false,
    placement: { kind: "crop", scale: 1.16 },
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

/** The panels a case is drawn with. */
function panelsOf(c: Case): CardPanel[] {
  if (!c.panel) return [];
  if (c.panel === "v2") {
    // What `panelFor` returned under card_layouts_v2: the zone ± 40 × 30, radius 28, soft edge.
    const z = zoneFor(c.layout, c.shape);
    const v2 = {
      x: z.x - 40,
      y: z.y - 30,
      width: z.width + 80,
      height: z.height + 60,
      radius: 28,
      softEdge: { spread: 20, blur: 40 },
    };
    return [{ ...v2, color: PANEL_COLOR }];
  }
  return [{ ...panelFor(c.layout, c.shape), color: PANEL_COLOR }];
}

/** A plate's fill: far from the wash, so a pixel of the wrong one shows. */
const PLATE_FILL = "#C9D8C0";

/** The placement a case is drawn with. */
function placementOf(c: Case): CardPlacement | undefined {
  if (!c.placement) return undefined;
  const spec = CARD_LAYOUTS[c.layout].giveWay;
  if (spec.kind !== "edge") throw new Error(`${c.id}: ${c.layout} has no edge give-way`);
  if (c.placement.kind === "crop") {
    return { kind: "crop", art: cropRect(spec, c.shape, c.placement.scale) };
  }
  return {
    kind: "plate",
    art: plateRect(spec, c.shape, c.placement.scale),
    cut: plateCut(spec, zoneFor(c.layout, c.shape)),
    fill: PLATE_FILL,
  };
}

/** The live card drawn with its plate one step smaller: the art comparison must catch it. */
let plateControl: { c: Case; chromiumBlank: DecodedPng } | null = null;

/**
 * The two textless rasters compared over the whole card, inside the outline, away from every edge
 * the two renderers antialias differently: the outline, a plate's cut and its scaled outline. What
 * remains is the fill and the artwork as each renderer resamples it at its stored rectangle.
 */
function artDiff(
  id: string,
  shape: CardShape,
  placement: CardPlacement,
  /** The text zone the synthetic artwork shades lighter: a hard edge in the art itself. */
  zone: { x: number; y: number; width: number; height: number },
  a: DecodedPng,
  b: DecodedPng,
): PanelComparison {
  const scale = cardPreviewBox(shape).scale;
  const { width: w, height: h } = canvasOf(shape);
  const m = PANEL_OUTLINE_MARGIN;
  const { art, cut } = placement;
  const artAt = (x: number, y: number) => ({
    ax: ((x - art.x) / art.width) * w,
    ay: ((y - art.y) / art.height) * h,
  });
  const onArt = (x: number, y: number) => {
    const { ax, ay } = artAt(x, y);
    const kept = !cut || (cut.keep === "above" ? y < cut.y : y > cut.y);
    return kept && ax >= 0 && ax <= w && ay >= 0 && ay <= h && insideOutline(shape, ax, ay);
  };
  // A hard edge in the artwork is resampled differently by Skia and resvg once it is scaled to
  // a fractional pixel: pixels astride the artwork's own zone edge are left out too.
  const inZone = (x: number, y: number) => {
    const { ax, ay } = artAt(x, y);
    return ax > zone.x && ax < zone.x + zone.width && ay > zone.y && ay < zone.y + zone.height;
  };
  const offsets = [
    [0, 0],
    [m, 0],
    [-m, 0],
    [0, m],
    [0, -m],
  ];
  let pixels = 0;
  let maxDiff = 0;
  let sum = 0;
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const x = (px + 0.5) / scale;
      const y = (py + 0.5) / scale;
      if (!offsets.every(([dx, dy]) => insideOutline(shape, x + dx, y + dy))) continue;
      const here = onArt(x, y);
      if (!offsets.every(([dx, dy]) => onArt(x + dx, y + dy) === here)) continue;
      const zoned = inZone(x, y);
      if (here && !offsets.every(([dx, dy]) => inZone(x + dx, y + dy) === zoned)) continue;
      const ia = (py * a.width + px) * 4;
      const ib = (py * b.width + px) * 4;
      let d = 0;
      for (let k = 0; k < 3; k += 1) d = Math.max(d, Math.abs(a.rgba[ia + k] - b.rgba[ib + k]));
      pixels += 1;
      sum += d;
      maxDiff = Math.max(maxDiff, d);
    }
  }
  return { id, pixels, maxDiff, meanDiff: pixels > 0 ? sum / pixels : Number.NaN };
}

/** The live card drawn with a fade 60 units shorter: the panel comparison must catch it. */
let fadeControl: { c: Case; chromiumBlank: DecodedPng } | null = null;

interface PanelComparison {
  id: string;
  pixels: number;
  maxDiff: number;
  meanDiff: number;
}

/**
 * The two textless rasters compared over a panel's drawn extent (its rectangle and fade, or its
 * soft edge), at pixels inside the outline by `PANEL_OUTLINE_MARGIN`.
 */
function panelDiff(
  id: string,
  shape: CardShape,
  panel: CardPanel,
  a: DecodedPng,
  b: DecodedPng,
): PanelComparison {
  const scale = cardPreviewBox(shape).scale;
  const f = panelFeather(panel);
  const soft = panel.fade ? 0 : panel.softEdge.spread + panel.softEdge.blur;
  const x0 = panel.x - f.left - soft;
  const y0 = panel.y - f.top - soft;
  const x1 = panel.x + panel.width + f.right + soft;
  const y1 = panel.y + panel.height + f.bottom + soft;
  const m = PANEL_OUTLINE_MARGIN;
  let pixels = 0;
  let maxDiff = 0;
  let sum = 0;
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const x = (px + 0.5) / scale;
      const y = (py + 0.5) / scale;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (
        ![
          [0, 0],
          [m, 0],
          [-m, 0],
          [0, m],
          [0, -m],
        ].every(([dx, dy]) => insideOutline(shape, x + dx, y + dy))
      ) {
        continue;
      }
      const ia = (py * a.width + px) * 4;
      const ib = (py * b.width + px) * 4;
      let d = 0;
      for (let k = 0; k < 3; k += 1) d = Math.max(d, Math.abs(a.rgba[ia + k] - b.rgba[ib + k]));
      pixels += 1;
      sum += d;
      maxDiff = Math.max(maxDiff, d);
    }
  }
  return { id, pixels, maxDiff, meanDiff: pixels > 0 ? sum / pixels : Number.NaN };
}

interface Rendered {
  boxes: TextBox[];
  panels: CardPanel[];
  placement?: CardPlacement;
  artwork: Uint8Array;
  preview: DecodedPng;
  previewBlank: DecodedPng;
  chromium: DecodedPng;
  chromiumBlank: DecodedPng;
  previewMs: number;
  /** Per box, per line: Chromium's measured baseline, px, relative to the exact one (+ is lower). */
  snap: Map<string, number[]>;
  /** The same at `LARGE_SCALE`, in card units: the vertical model's error plus Blink's snapping. */
  model: Map<string, number[]>;
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
  r: Pick<Rendered, "boxes" | "panels" | "placement" | "artwork">,
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
        placement: r.placement,
        boxes: withText ? r.boxes : [],
      },
    },
    { loadCardFont: (font) => loadCuratedGlyphOutlines(font, CURATED_FONT_DIR) },
  );
  return { png, ms: performance.now() - started };
}

async function renderChromium(
  c: Case,
  r: { boxes: TextBox[]; panels: CardPanel[]; placement?: CardPlacement; artwork: Uint8Array },
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
      placement: r.placement,
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
  const png = await page.screenshot({
    clip: { x: 0, y: 0, width: Math.round(box.width), height: Math.round(box.height) },
    animations: "disabled",
  });
  return { png, baselines: await measureBaselines() };
}

/** Chromium's baselines for the card already rendered with text, laid out at `LARGE_SCALE`. */
async function largeBaselines(c: Case, boxes: readonly TextBox[]) {
  const canvas = canvasOf(c.shape);
  await page.setViewportSize({
    width: canvas.width * LARGE_SCALE,
    height: canvas.height * LARGE_SCALE,
  });
  await page.goto(`${server.origin}/page/${c.id}-text.html`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const width = await page.evaluate(
    () => document.querySelector("[data-card-face]")!.getBoundingClientRect().width,
  );
  expect(width).toBeCloseTo(canvas.width * LARGE_SCALE, 3);
  const shifts = await chromiumBaselineShift(c.shape, boxes, await measureBaselines(), LARGE_SCALE);
  return new Map([...shifts].map(([id, px]) => [id, px.map((v) => v / LARGE_SCALE)]));
}

/**
 * Where Chromium laid out each line's baseline, in page px: a zero-size inline-block at
 * `vertical-align: baseline` appended to each line element. Run after the screenshot, so the
 * markers are never in an image; a zero-size box on the baseline does not change the line box.
 */
function measureBaselines(): Promise<Record<string, { x: number; y: number }[]>> {
  return page.evaluate(() => {
    const face = document.querySelector("[data-card-face]")!.getBoundingClientRect();
    const out: Record<string, { x: number; y: number }[]> = {};
    for (const p of document.querySelectorAll("[data-card-box]")) {
      out[p.getAttribute("data-card-box") ?? ""] = [...p.querySelectorAll("[data-card-line]")].map(
        (line) => {
          const marker = document.createElement("i");
          marker.style.cssText =
            "display:inline-block;width:0;height:0;margin:0;padding:0;border:0;vertical-align:baseline";
          line.appendChild(marker);
          const r = marker.getBoundingClientRect();
          return { x: r.left - face.left, y: r.top - face.top };
        },
      );
    }
    return out;
  });
}

/**
 * Each line's measured Chromium baseline relative to the exact one the preview draws, px, along
 * the box's own vertical axis (rotation undone), per box and line — see the doc comment above.
 */
async function chromiumBaselineShift(
  shape: CardShape,
  boxes: readonly TextBox[],
  measured: Record<string, { x: number; y: number }[]>,
  scale = cardPreviewBox(shape).scale,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  for (const box of boxes) {
    if (box.lines.length === 0) continue;
    const points = measured[box.id];
    if (!points || points.length !== box.lines.length) {
      throw new Error(`box ${box.id}: ${points?.length ?? 0} baselines measured`);
    }
    const outlines = await loadCuratedGlyphOutlines(box.font, CURATED_FONT_DIR);
    const { ascent, descent } = outlines.verticalMetrics(box.size);
    const lineBox = box.size * box.lineHeight;
    const exact = (lineBox - (ascent + descent)) / 2 + ascent;
    const height = lineBox * box.lines.length;
    const rad = (-box.rotation * Math.PI) / 180;
    out.set(
      box.id,
      points.map(({ x, y }, i) => {
        // Into the box's frame, card units, as `lineInk` does for pixels.
        const ux = x / scale - (box.x + box.width / 2);
        const uy = y / scale - (box.y + height / 2);
        const ly = ux * Math.sin(rad) + uy * Math.cos(rad) + height / 2;
        return (ly - (i * lineBox + exact)) * scale;
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
    const acc = box.lines.map(() => ({ ink: 0, sx: 0, sy: 0, along: [] as [number, number][] }));
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
        a.along.push([lx, d]);
      }
    }
    acc.forEach((a, line) => {
      // The line's ends: where its ink, read along the line, reaches EDGE_QUANTILE and
      // 1 - EDGE_QUANTILE of the whole.
      a.along.sort((p, q) => p[0] - q[0]);
      const at = (fraction: number) => {
        let sum = 0;
        for (const [x, d] of a.along) {
          sum += d;
          if (sum >= fraction * a.ink) return x;
        }
        return Number.NaN;
      };
      out.push({
        box: box.id,
        line,
        ink: a.ink,
        cx: (a.sx / a.ink) * scale,
        cy: (a.sy / a.ink) * scale,
        left: at(EDGE_QUANTILE) * scale,
        right: at(1 - EDGE_QUANTILE) * scale,
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
  maxBaselineSnap: number;
  maxModelError: number;
  worstInkRatio: number;
  meanAbsDiff: number;
  failures: string[];
}

function compare(
  id: string,
  shape: CardShape,
  boxes: readonly TextBox[],
  r: Pick<Rendered, "preview" | "previewBlank" | "chromium" | "chromiumBlank" | "snap" | "model">,
): Comparison {
  const a = lineInk(shape, boxes, r.preview, r.previewBlank);
  const b = lineInk(shape, boxes, r.chromium, r.chromiumBlank);
  const failures: string[] = [];
  let maxCentroid = 0;
  let maxEdge = 0;
  let maxBaselineSnap = 0;
  let maxModelError = 0;
  let worstInkRatio = 1;
  a.forEach((la, i) => {
    const lb = b[i];
    const where = `${la.box} line ${la.line}`;
    if (!(la.ink > 0 && lb.ink > 0)) {
      if (la.ink > 0 || lb.ink > 0) failures.push(`${where}: ink in one renderer only`);
      return;
    }
    const shift = r.snap.get(la.box)?.[la.line] ?? 0;
    maxBaselineSnap = Math.max(maxBaselineSnap, Math.abs(shift));
    const model = r.model.get(la.box)?.[la.line];
    if (model === undefined) {
      failures.push(`${where}: no baseline measured at ${LARGE_SCALE} px per unit`);
    } else {
      maxModelError = Math.max(maxModelError, Math.abs(model));
      if (Math.abs(model) > VERTICAL_MODEL_TOLERANCE_UNITS) {
        failures.push(
          `${where}: Chromium's baseline is ${model.toFixed(2)} units from the exact one at ${LARGE_SCALE} px per unit`,
        );
      }
    }
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
    maxBaselineSnap,
    maxModelError,
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
      content: c.content ?? TYPICAL,
      ink: INK,
    });
    const boxes = c.edit ? c.edit(generated) : generated;
    const panels = panelsOf(c);
    const artwork = washArtwork(proportionOf(c.shape), zoneFor(c.layout, c.shape));
    const base = { boxes, panels, placement: placementOf(c), artwork };
    const withText = await renderPreview(c, base, true);
    const blank = await renderPreview(c, base, false);
    const preview = decodePng(withText.png);
    writeFileSync(path.join(OUT_DIR, `${c.id}.preview.png`), withText.png);
    const chromium = await renderChromium(c, base, true);
    writeFileSync(path.join(OUT_DIR, `${c.id}.chromium.png`), chromium.png);
    rendered.set(c.id, {
      ...base,
      preview,
      previewBlank: decodePng(blank.png),
      chromium: decodePng(chromium.png),
      chromiumBlank: decodePng((await renderChromium(c, base, false)).png),
      previewMs: withText.ms,
      snap: await chromiumBaselineShift(c.shape, boxes, chromium.baselines),
      model: await largeBaselines(c, boxes),
    });
  }
  const edge = CASES.find((c) => c.id === "art-bottom-rectangle-panel")!;
  const r = rendered.get(edge.id)!;
  const shorter = r.panels.map((p) =>
    p.fade?.kind === "edge" ? { ...p, fade: { ...p.fade, length: p.fade.length - 60 } } : p,
  );
  const control = { ...edge, id: `${edge.id}-control` };
  fadeControl = {
    c: edge,
    chromiumBlank: decodePng((await renderChromium(control, { ...r, panels: shorter }, false)).png),
  };
  // The live card's plate one step smaller (0.7 for 0.8): the art comparison must catch it.
  const plated = CASES.find((c) => c.id === "art-bottom-oval-plate")!;
  const smaller = placementOf({ ...plated, placement: { kind: "plate", scale: 0.7 } });
  plateControl = {
    c: plated,
    chromiumBlank: decodePng(
      (
        await renderChromium(
          { ...plated, id: `${plated.id}-control` },
          { ...rendered.get(plated.id)!, placement: smaller },
          false,
        )
      ).png,
    ),
  };
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
    // The Lantern envelope (design-system §10.20): 640 × 448 at (280, 91) on the dusk field.
    const at = (x: number, y: number) =>
      [0, 1, 2].map((c) => img.rgba[(y * img.width + x) * 4 + c]);
    const near = (got: number[], hex: string) =>
      [1, 3, 5].every((i, c) => Math.abs(got[c] - parseInt(hex.slice(i, i + 2), 16)) <= 2);
    for (const [x, y] of [
      [10, 10],
      [1190, 620],
      [150, 315],
    ]) {
      expect(near(at(x, y), HOUSE.dusk), `field at ${x},${y}: ${at(x, y)}`).toBe(true);
    }
    // Lit paper in the pocket; the amber seal at the flap's point (40% down), beside its "R".
    expect(lum(img, 300, 520)).toBeGreaterThan(220);
    expect(near(at(570, 270), HOUSE.action), `seal: ${at(570, 270)}`).toBe(true);
    // The light pool under the envelope is lighter than the field, and warm.
    const pool = at(600, 555);
    expect(lum(img, 600, 555)).toBeGreaterThan(lum(img, 150, 555) + 8);
    expect(pool[0]).toBeGreaterThan(at(150, 555)[0] + 15);
    // Dark title ink in the title area under the seal; nothing card-coloured anywhere.
    let dark = 0;
    for (let y = 330; y < 505; y += 1) {
      for (let x = 300; x < 900; x += 1) if (lum(img, x, y) < 80) dark += 1;
    }
    expect(dark).toBeGreaterThan(500);
    console.info(`envelope preview rendered in ${ms.toFixed(0)} ms`);
  });
});

describe("the preview draws each panel as the live card does", () => {
  const PANEL_CASES = CASES.filter((c) => c.panel);
  const results: PanelComparison[] = [];

  it("covers an edge fade, a wash and a card_layouts_v2 panel", () => {
    const kinds = PANEL_CASES.flatMap((c) =>
      rendered.get(c.id)!.panels.map((p) => p.fade?.kind ?? "v2"),
    );
    expect(new Set(kinds)).toEqual(new Set(["edge", "wash", "v2"]));
  });

  it.each(PANEL_CASES.map((c) => [c.id, c] as const))(
    "%s: every pixel of the panel and its fade within tolerance",
    (_, c) => {
      const r = rendered.get(c.id)!;
      for (const panel of r.panels) {
        const result = panelDiff(
          c.id,
          c.shape,
          panel,
          cropCard(r.previewBlank, c.shape),
          r.chromiumBlank,
        );
        results.push(result);
        expect(result.pixels).toBeGreaterThan(1000);
        expect(result.maxDiff, `${c.id}: mean ${result.meanDiff.toFixed(3)}`).toBeLessThanOrEqual(
          PANEL_TOLERANCE,
        );
      }
    },
  );

  it("catches a fade 60 units shorter (negative control)", () => {
    const { c, chromiumBlank } = fadeControl!;
    const r = rendered.get(c.id)!;
    const result = panelDiff(
      "control",
      c.shape,
      r.panels[0],
      cropCard(r.previewBlank, c.shape),
      chromiumBlank,
    );
    results.push(result);
    expect(result.maxDiff).toBeGreaterThan(PANEL_TOLERANCE);
  });

  afterAll(() => {
    writeFileSync(
      path.join(OUT_DIR, "panels.json"),
      JSON.stringify({ tolerance: PANEL_TOLERANCE, results }, null, 2),
    );
    console.info(
      results
        .map(
          (x) => `${x.id}: ${x.pixels} px, max |Δ| ${x.maxDiff}, mean |Δ| ${x.meanDiff.toFixed(3)}`,
        )
        .join("\n"),
    );
  });
});

describe("the preview draws the art giving way as the live card does (card_layouts_v4)", () => {
  const PLACED = CASES.filter((c) => c.placement);
  const results: PanelComparison[] = [];

  it("covers a plate kept above its cut, one kept below, and a crop", () => {
    expect(
      PLACED.map((c) => {
        const p = placementOf(c)!;
        return p.kind === "plate" ? `plate-${p.cut!.keep}` : p.kind;
      }).sort(),
    ).toEqual(["crop", "plate-above", "plate-below"]);
  });

  it.each(PLACED.map((c) => [c.id, c] as const))(
    "%s: every pixel of the fill and the placed art within tolerance",
    (_, c) => {
      const r = rendered.get(c.id)!;
      const result = artDiff(
        c.id,
        c.shape,
        r.placement!,
        zoneFor(c.layout, c.shape),
        cropCard(r.previewBlank, c.shape),
        r.chromiumBlank,
      );
      results.push(result);
      expect(result.pixels).toBeGreaterThan(10_000);
      expect(result.maxDiff, `${c.id}: mean ${result.meanDiff.toFixed(3)}`).toBeLessThanOrEqual(
        PANEL_TOLERANCE,
      );
    },
  );

  it("catches a plate one step smaller (negative control)", () => {
    const { c, chromiumBlank } = plateControl!;
    const r = rendered.get(c.id)!;
    const result = artDiff(
      "plate-control",
      c.shape,
      r.placement!,
      zoneFor(c.layout, c.shape),
      cropCard(r.previewBlank, c.shape),
      chromiumBlank,
    );
    results.push(result);
    expect(result.maxDiff).toBeGreaterThan(PANEL_TOLERANCE * 4);
  });

  afterAll(() => {
    writeFileSync(
      path.join(OUT_DIR, "placements.json"),
      JSON.stringify({ tolerance: PANEL_TOLERANCE, results }, null, 2),
    );
    console.info(
      results
        .map(
          (x) => `${x.id}: ${x.pixels} px, max |Δ| ${x.maxDiff}, mean |Δ| ${x.meanDiff.toFixed(3)}`,
        )
        .join("\n"),
    );
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
        model: r.model,
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
      model: r.model,
    });
    expect(result.failures.some((f) => f.startsWith("title"))).toBe(true);
  });

  it("catches a line moved two pixels down (negative control)", () => {
    const c = CASES[0];
    const r = rendered.get(c.id)!;
    const preview = cropCard(r.preview, c.shape);
    const shifted = { ...preview, rgba: new Uint8Array(preview.rgba) };
    const rowBytes = preview.width * 4;
    // The whole card two rows down: every line's centroid moves 2px across the line.
    shifted.rgba.set(preview.rgba.subarray(0, preview.rgba.length - 2 * rowBytes), 2 * rowBytes);
    const blank = cropCard(r.previewBlank, c.shape);
    const blankShifted = { ...blank, rgba: new Uint8Array(blank.rgba) };
    blankShifted.rgba.set(blank.rgba.subarray(0, blank.rgba.length - 2 * rowBytes), 2 * rowBytes);
    const result = compare("control", c.shape, r.boxes, {
      preview: shifted,
      previewBlank: blankShifted,
      chromium: r.chromium,
      chromiumBlank: r.chromiumBlank,
      snap: r.snap,
      model: r.model,
    });
    expect(result.failures.some((f) => /^title line \d+: centroid/.test(f))).toBe(true);
  });

  it("catches a wrong vertical model shared by both sides (negative control)", () => {
    // A baseline model two pixels low moves the preview's lines and the exact baseline alike, so
    // the corrected centroids still agree (the preview and `snap` are left as they are); only the
    // distance from Chromium's baseline to the exact one, measured at the large scale, changes.
    const c = CASES[0];
    const r = rendered.get(c.id)!;
    const offBy = (m: Map<string, number[]>, d: number) =>
      new Map([...m].map(([id, shifts]) => [id, shifts.map((s) => s + d)]));
    const result = compare("control", c.shape, r.boxes, {
      preview: cropCard(r.preview, c.shape),
      previewBlank: cropCard(r.previewBlank, c.shape),
      chromium: r.chromium,
      chromiumBlank: r.chromiumBlank,
      snap: r.snap,
      model: offBy(r.model, -2 / cardPreviewBox(c.shape).scale),
    });
    expect(result.failures.some((f) => /^title line \d+: centroid/.test(f))).toBe(false);
    expect(result.failures.some((f) => /^title line \d+: Chromium's baseline/.test(f))).toBe(true);
  });

  afterAll(() => {
    const timings = [...rendered.entries()].map(([id, r]) => ({ id, ms: Math.round(r.previewMs) }));
    writeFileSync(
      path.join(OUT_DIR, "report.json"),
      JSON.stringify(
        {
          tolerances: {
            CENTROID_TOLERANCE_PX,
            EDGE_TOLERANCE_PX,
            VERTICAL_MODEL_TOLERANCE_UNITS,
            INK_RATIO_TOLERANCE,
          },
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
            `${x.id}: ${x.lines} lines, centroid ≤ ${x.maxCentroid.toFixed(3)} px, edge ≤ ${x.maxEdge.toFixed(3)} px, baseline snap ≤ ${x.maxBaselineSnap.toFixed(3)} px, model ≤ ${x.maxModelError.toFixed(3)} units, ink ratio ≥ ${x.worstInkRatio.toFixed(3)}, mean |Δ| ${x.meanAbsDiff.toFixed(2)}`,
        )
        .join("\n"),
    );
    console.info(timings.map((t) => `${t.id}: ${t.ms} ms`).join(", "));
  });
});
