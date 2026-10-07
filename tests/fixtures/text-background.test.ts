import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Browser, Page } from "playwright-core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InvitationCard } from "@/components/card/InvitationCard";
import { parseHex } from "@/lib/card/color";
import { textBackgroundBlur, textBackgroundRadius, type BoxFrameRect } from "@/lib/card/card-data";
import { cardPreviewSvg } from "@/lib/card/preview-svg.server";
import { CARD_CANVAS } from "@/lib/card/shapes";
import type { TextBackground, TextBackgroundStyle } from "@/lib/card/text-background";
import { breakBoxText, type TextBox } from "@/lib/card/text-box";
import { loadCuratedGlyphOutlines } from "@/lib/card/text/curated-fonts";
import type { GlyphOutlines } from "@/lib/card/text/glyph-outlines";
import type { FontMetricsResolver, FontRef } from "@/lib/card/text/metrics";
import { allCuratedMetrics, CURATED_FONT_DIR } from "@/lib/card/text/test-fonts";
import { encodePng } from "@/lib/link-preview/test-artwork";

import { launchChromium } from "./browser";
import { decodePng, type DecodedPng } from "./png";
import { REPO_ROOT, startStaticServer, type StaticServer } from "./static-server";

/**
 * A text background the host chose for a box (`TextBox.background`; `card-data.ts`
 * `textBackgroundGeometry`), drawn by `InvitationCard` in Chromium and by the link-preview SVG.
 *
 * One rectangle card with five boxes laid well apart — a centred two-line title, a rotated
 * two-line invitation line, a right-aligned, letter-spaced, upper-case date, an added box whose
 * first line is wider than the box (start-aligned) and a box with no background — over a busy,
 * deterministic artwork at one CSS pixel per card unit. For each style, every box but the last
 * has the background, at opacity 1 and 0.35, then moved, then resized and re-broken. Checked:
 *
 * 1. a highlight hugs each line: its rectangle is the line's text (its advance across, its content
 *    area down, as Chromium sets it) ± the padding, within `GEOMETRY_TOLERANCE` units;
 * 2. a box or backdrop surrounds the block: from the leftmost line start to the rightmost line end
 *    ± the padding, from −p to n·L + p;
 * 3. text keeps the box's exact colour: every pixel drawn in exactly the box's colour without the
 *    background is exactly that colour with it, at either opacity;
 * 4. moving the box moves its background by exactly as much, and a resized, re-broken box's
 *    background follows its new lines (1 and 2 again);
 * 5. the artwork is untouched outside the background's extent (the blur's reach included): every
 *    pixel there is identical with and without the background;
 * 6. the link-preview SVG's background rectangles are where Chromium draws them, within
 *    `GEOMETRY_TOLERANCE` units.
 *
 * Geometry is read in each box's own frame (its rotation taken off while it is measured).
 * Screenshots for review (gitignored): `test-results/text-background/`.
 */

const OUT_DIR = path.join(REPO_ROOT, "test-results/text-background");
const SHAPE = "rectangle" as const;
const CANVAS = CARD_CANVAS["5:7"];
/** Card units. */
const GEOMETRY_TOLERANCE = 1.5;
/** Card units beyond a background's extent where its antialiased edge may still touch a pixel. */
const EDGE_MARGIN = 2;

const PLAYFAIR: FontRef = { family: "Playfair Display", weight: 400, italic: false };
const DM_SANS: FontRef = { family: "DM Sans", weight: 400, italic: false };
const PADDING: Record<TextBackgroundStyle, number> = { highlight: 10, box: 24, backdrop: 24 };
const FILL: Record<TextBackgroundStyle, string> = {
  highlight: "#FFF2A8",
  box: "#FFFFFF",
  backdrop: "#1B1B1F",
};

let server: StaticServer;
let browser: Browser;
let page: Page;
let metrics: FontMetricsResolver;
const outlines = new Map<string, GlyphOutlines>();
let artwork: Uint8Array;

/** A busy artwork at one pixel per card unit, so any change to it shows. */
function busyArtwork(): Uint8Array {
  const { width, height } = CANVAS;
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      rgb[i] = 120 + ((x * 7 + y * 3) % 120);
      rgb[i + 1] = 110 + ((x * 3 + y * 11) % 130);
      rgb[i + 2] = 90 + (((x >> 3) ^ (y >> 3)) & 1) * 60 + (y % 40);
    }
  }
  return encodePng(width, height, rgb);
}

interface BoxSpec {
  id: string;
  source: TextBox["source"];
  text: string;
  font: FontRef;
  x: number;
  y: number;
  width: number;
  size: number;
  rotation?: number;
  align?: TextBox["align"];
  letterSpacing?: number;
  lineHeight?: number;
  textCase?: TextBox["textCase"];
  color: string;
  z: number;
  /** Whether it gets the background. */
  background: boolean;
}

const BASE: BoxSpec[] = [
  {
    id: "title",
    source: { kind: "wording", slot: "title" },
    text: "A Little Wild One",
    font: PLAYFAIR,
    x: 160,
    y: 80,
    width: 680,
    size: 110,
    lineHeight: 1.1,
    color: "#3A2A1E",
    z: 0,
    background: true,
  },
  {
    id: "invitationLine",
    source: { kind: "wording", slot: "invitationLine" },
    text: "Please join us for a garden baby shower",
    font: DM_SANS,
    x: 230,
    y: 520,
    width: 540,
    size: 44,
    rotation: -9,
    lineHeight: 1.3,
    color: "#7A1F2B",
    z: 1,
    background: true,
  },
  {
    id: "date",
    source: { kind: "fact", slot: "date" },
    text: "Saturday, June 6",
    font: DM_SANS,
    x: 120,
    y: 820,
    width: 760,
    size: 40,
    align: "right",
    letterSpacing: 0.08,
    textCase: "uppercase",
    color: "#1F3A5F",
    z: 2,
    background: true,
  },
  {
    id: "added-1",
    source: { kind: "custom" },
    text: "Supercalifragilistic fun",
    font: PLAYFAIR,
    x: 300,
    y: 1010,
    width: 200,
    size: 60,
    lineHeight: 1.2,
    color: "#2F4F2F",
    z: 3,
    background: true,
  },
  {
    id: "venue",
    source: { kind: "fact", slot: "venue" },
    text: "The Willow House",
    font: DM_SANS,
    x: 120,
    y: 1250,
    width: 760,
    size: 40,
    color: "#3A2A1E",
    z: 4,
    background: false,
  },
];

function boxesOf(specs: readonly BoxSpec[], background: TextBackground | null): TextBox[] {
  return specs.map((s) => {
    const style = {
      width: s.width,
      font: s.font,
      size: s.size,
      letterSpacing: s.letterSpacing ?? 0,
      textCase: s.textCase ?? "none",
    };
    const ownsText = s.source.kind === "custom" || s.id === "invitationLine";
    return {
      id: s.id,
      source: s.source,
      ...(ownsText ? { text: s.text } : {}),
      x: s.x,
      y: s.y,
      width: s.width,
      rotation: s.rotation ?? 0,
      font: { ...s.font },
      size: s.size,
      color: s.color,
      align: s.align ?? "center",
      letterSpacing: s.letterSpacing ?? 0,
      lineHeight: s.lineHeight ?? 1.25,
      textCase: s.textCase ?? "none",
      z: s.z,
      lines: breakBoxText(s.text, style, metrics).lines,
      ...(background && s.background ? { background: { ...background } } : {}),
    };
  });
}

const MOVE = { dx: 31, dy: 47 };
const moved = (specs: readonly BoxSpec[]) =>
  specs.map((s) => ({ ...s, x: s.x + MOVE.dx, y: s.y + MOVE.dy }));
/** The title smaller, the invitation line larger: both re-broken. */
const resized = (specs: readonly BoxSpec[]) =>
  specs.map((s) =>
    s.id === "title"
      ? { ...s, size: 72, width: 400 }
      : s.id === "invitationLine"
        ? { ...s, size: 56 }
        : s,
  );

function background(style: TextBackgroundStyle, opacity: number): TextBackground {
  return { style, color: FILL[style], opacity, padding: PADDING[style] };
}

/** Each box's background geometry as Chromium laid it out, in its own frame, card units. */
interface MeasuredBox {
  id: string;
  /** Each visible line's text: its advance across, its content area down. */
  lines: { left: number; right: number; top: number; bottom: number }[];
  highlights: (BoxFrameRect & { index: number })[];
  shape: BoxFrameRect | null;
  /** The background's page rectangle (rotation included), for the move check. */
  page: { left: number; top: number } | null;
}

let pageCount = 0;
async function render(boxes: readonly TextBox[], label: string) {
  const markup = renderToStaticMarkup(
    createElement(InvitationCard, {
      shape: SHAPE,
      artwork: {
        src: `data:image/png;base64,${Buffer.from(artwork).toString("base64")}`,
        proportion: "5:7",
      },
      boxes,
    }),
  );
  const pagePath = `/page/text-background-${(pageCount += 1)}.html`;
  server.put(
    pagePath,
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<link rel="stylesheet" href="/card-fonts.css">` +
      `<style>html,body{margin:0;padding:0;background:#FFFFFF}</style></head>` +
      `<body>${markup}</body></html>`,
    "text/html",
  );
  await page.goto(`${server.origin}${pagePath}`, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const png = await page.screenshot({
    clip: { x: 0, y: 0, width: CANVAS.width, height: CANVAS.height },
    animations: "disabled",
  });
  writeFileSync(path.join(OUT_DIR, `${label}.png`), png);
  const measured = await page.evaluate(() => {
    const face = document.querySelector("[data-card-face]")!.getBoundingClientRect();
    const scale = face.width / 1000;
    return [...document.querySelectorAll<HTMLElement>("[data-card-box]")].map((p) => {
      const shapeEl = p.querySelector("[data-card-text-background-shape]");
      const firstHighlight = p.querySelector("[data-card-text-highlight]");
      const pageRect = (shapeEl ?? firstHighlight)?.getBoundingClientRect() ?? null;
      const saved = p.style.transform;
      p.style.transform = "none";
      const o = p.getBoundingClientRect();
      const rel = (r: DOMRect) => ({
        x: (r.left - o.left) / scale,
        y: (r.top - o.top) / scale,
        width: r.width / scale,
        height: r.height / scale,
      });
      const lines = [...p.querySelectorAll("[data-card-line]")].map((span) => {
        const range = document.createRange();
        range.selectNodeContents(span);
        const r = rel(range.getBoundingClientRect());
        return { left: r.x, right: r.x + r.width, top: r.y, bottom: r.y + r.height };
      });
      const highlights = [...p.querySelectorAll<HTMLElement>("[data-card-text-highlight]")].map(
        (el) => {
          const rects = el.getClientRects();
          if (rects.length !== 1) throw new Error(`highlight in ${rects.length} fragments`);
          return { ...rel(rects[0]), index: Number(el.dataset.cardTextHighlight) };
        },
      );
      const shape = shapeEl ? rel(shapeEl.getBoundingClientRect()) : null;
      p.style.transform = saved;
      return {
        id: p.getAttribute("data-card-box") ?? "",
        lines,
        highlights,
        shape,
        page: pageRect
          ? { left: (pageRect.left - face.left) / scale, top: (pageRect.top - face.top) / scale }
          : null,
      };
    });
  });
  return { image: decodePng(png), measured: measured as MeasuredBox[] };
}

/** The SVG's background rectangles for each box, in its own frame. */
function svgBackgrounds(boxes: readonly TextBox[]): Map<string, BoxFrameRect[]> {
  const doc = cardPreviewSvg(
    { shape: SHAPE, artwork: { bytes: artwork, proportion: "5:7" }, boxes },
    (font) => outlines.get(`${font.family}|${font.weight}`)!,
  );
  const out = new Map<string, BoxFrameRect[]>();
  for (const m of doc.matchAll(
    /<g data-card-box="([^"]+)"[^>]*><g data-card-text-background="[^"]+"[^>]*>(.*?)<\/g>/g,
  )) {
    out.set(
      m[1],
      [
        ...m[2].matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g),
      ].map((r) => ({ x: +r[1], y: +r[2], width: +r[3], height: +r[4] })),
    );
  }
  return out;
}

/** The largest distance between two rectangles' edges. */
function edgeError(a: BoxFrameRect, b: BoxFrameRect): number {
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.x + a.width - (b.x + b.width)),
    Math.abs(a.y + a.height - (b.y + b.height)),
  );
}

/**
 * Checks 1, 2 and 6 for one rendering: each background's DOM geometry against its box's own lines
 * as Chromium set them, and against the SVG's. Returns the worst errors, card units.
 */
function checkGeometry(
  style: TextBackgroundStyle,
  boxes: readonly TextBox[],
  measured: readonly MeasuredBox[],
): { hug: number; svg: number; failures: string[] } {
  const svg = svgBackgrounds(boxes);
  const failures: string[] = [];
  let hug = 0;
  let svgError = 0;
  for (const box of boxes) {
    const m = measured.find((x) => x.id === box.id)!;
    if (!box.background) {
      if (m.highlights.length > 0 || m.shape || svg.has(box.id)) {
        failures.push(`${box.id}: a background on a box without one`);
      }
      continue;
    }
    const p = box.background.padding;
    const lineBox = box.size * box.lineHeight;
    let expected: BoxFrameRect[];
    let drawn: BoxFrameRect[];
    if (style === "highlight") {
      drawn = [...m.highlights].sort((a, b) => a.index - b.index);
      expected = m.highlights.map(({ index }) => {
        const l = m.lines[index];
        return {
          x: l.left - p,
          y: l.top - p,
          width: l.right - l.left + 2 * p,
          height: l.bottom - l.top + 2 * p,
        };
      });
      if (drawn.length !== box.lines.length) {
        failures.push(`${box.id}: ${drawn.length} highlights for ${box.lines.length} lines`);
      }
    } else {
      if (!m.shape) {
        failures.push(`${box.id}: no ${style} drawn`);
        continue;
      }
      drawn = [m.shape];
      const left = Math.min(...m.lines.map((l) => l.left));
      const right = Math.max(...m.lines.map((l) => l.right));
      expected = [
        {
          x: left - p,
          y: -p,
          width: right - left + 2 * p,
          height: box.lines.length * lineBox + 2 * p,
        },
      ];
    }
    drawn.forEach((d, i) => {
      const e = edgeError(d, expected[i]);
      hug = Math.max(hug, e);
      if (e > GEOMETRY_TOLERANCE) {
        failures.push(
          `${box.id} ${style} ${i}: ${JSON.stringify(d)} vs lines ${JSON.stringify(expected[i])}`,
        );
      }
    });
    const fromSvg = svg.get(box.id) ?? [];
    if (fromSvg.length !== drawn.length) {
      failures.push(
        `${box.id}: the SVG draws ${fromSvg.length} rectangles, Chromium ${drawn.length}`,
      );
      continue;
    }
    drawn.forEach((d, i) => {
      const e = edgeError(d, fromSvg[i]);
      svgError = Math.max(svgError, e);
      if (e > GEOMETRY_TOLERANCE) {
        failures.push(
          `${box.id} SVG ${i}: ${JSON.stringify(fromSvg[i])} vs DOM ${JSON.stringify(d)}`,
        );
      }
    });
  }
  return { hug, svg: svgError, failures };
}

/** A pixel centre in a box's own frame (rotation about its centre undone), card units. */
function toFrame(box: TextBox, px: number, py: number): { x: number; y: number } {
  const height = box.size * box.lineHeight * box.lines.length;
  const cx = box.x + box.width / 2;
  const cy = box.y + height / 2;
  const rad = (-box.rotation * Math.PI) / 180;
  const ux = px + 0.5 - cx;
  const uy = py + 0.5 - cy;
  return {
    x: ux * Math.cos(rad) - uy * Math.sin(rad) + box.width / 2,
    y: ux * Math.sin(rad) + uy * Math.cos(rad) + height / 2,
  };
}

const inside = (r: BoxFrameRect, p: { x: number; y: number }, margin: number) =>
  p.x >= r.x - margin &&
  p.x <= r.x + r.width + margin &&
  p.y >= r.y - margin &&
  p.y <= r.y + r.height + margin;

function rgbAt(img: DecodedPng, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]];
}

/**
 * Checks 3 and 5: `plain` is the card without backgrounds, `withBackground` with them. Text pixels
 * in exactly a box's colour keep it; every pixel outside every background's extent is unchanged.
 */
function checkPixels(boxes: readonly TextBox[], plain: DecodedPng, withBackground: DecodedPng) {
  const svg = svgBackgrounds(boxes);
  const extents = boxes
    .filter((b) => b.background)
    .map((b) => ({
      box: b,
      rects: svg.get(b.id) ?? [],
      margin:
        EDGE_MARGIN +
        (b.background!.style === "backdrop" ? 3 * textBackgroundBlur(b.background!.padding) : 0),
      // Card units inside the extent where the fill is whole: past a rounded corner, past the
      // blur's reach.
      inner:
        EDGE_MARGIN +
        (b.background!.style === "backdrop"
          ? 3 * textBackgroundBlur(b.background!.padding)
          : b.background!.style === "box"
            ? textBackgroundRadius(b.background!.padding, b.size)
            : 0),
    }));
  const artworkImage = decodePng(artwork);
  let fillPixels = 0;
  let fillMaxError = 0;
  const colours = boxes.map((b) => ({ box: b, rgb: parseHex(b.color) }));
  let textPixels = 0;
  let textChanged = 0;
  let outside = 0;
  let outsideChanged = 0;
  let insideChanged = 0;
  let textMaxDelta = 0;
  let outsideMaxDelta = 0;
  let bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let y = 0; y < plain.height; y += 1) {
    for (let x = 0; x < plain.width; x += 1) {
      const a = rgbAt(plain, x, y);
      const b = rgbAt(withBackground, x, y);
      const same = a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
      const covered = extents.some(({ box, rects, margin }) => {
        const f = toFrame(box, x, y);
        return rects.some((r) => inside(r, f, margin));
      });
      const delta = Math.max(...[0, 1, 2].map((k) => Math.abs(a[k] - b[k])));
      if (!covered) {
        outside += 1;
        if (!same) {
          outsideChanged += 1;
          outsideMaxDelta = Math.max(outsideMaxDelta, delta);
          bounds = {
            x0: Math.min(bounds.x0, x),
            y0: Math.min(bounds.y0, y),
            x1: Math.max(bounds.x1, x),
            y1: Math.max(bounds.y1, y),
          };
        }
      } else if (!same) {
        insideChanged += 1;
      }
      // Well inside a background, where no text is: the fill over the artwork at the opacity.
      const art = rgbAt(artworkImage, x, y);
      const untouched = a[0] === art[0] && a[1] === art[1] && a[2] === art[2];
      const filled = untouched
        ? extents.find(({ box, rects, inner }) => {
            const f = toFrame(box, x, y);
            return rects.some((r) => inside(r, f, -inner));
          })
        : undefined;
      if (filled) {
        const { color, opacity } = filled.box.background!;
        const fill = parseHex(color);
        const expected = [fill.r, fill.g, fill.b].map((c, k) =>
          Math.round(opacity * c + (1 - opacity) * art[k]),
        );
        fillPixels += 1;
        fillMaxError = Math.max(
          fillMaxError,
          ...[0, 1, 2].map((k) => Math.abs(b[k] - expected[k])),
        );
      }
      for (const { box, rgb } of colours) {
        if (!box.background) continue;
        if (a[0] !== rgb.r || a[1] !== rgb.g || a[2] !== rgb.b) continue;
        const f = toFrame(box, x, y);
        const lineBox = box.size * box.lineHeight;
        if (f.x < -box.size || f.x > box.width * 3 || f.y < 0 || f.y > lineBox * box.lines.length) {
          continue;
        }
        textPixels += 1;
        if (!same) {
          textChanged += 1;
          textMaxDelta = Math.max(textMaxDelta, delta);
        }
      }
    }
  }
  return {
    textPixels,
    textChanged,
    textMaxDelta,
    outside,
    outsideChanged,
    outsideMaxDelta,
    bounds,
    insideChanged,
    fillPixels,
    fillMaxError,
  };
}

const STYLES: TextBackgroundStyle[] = ["highlight", "box", "backdrop"];
interface StyleResult {
  geometry: { label: string; hug: number; svg: number; failures: string[] }[];
  pixels: { label: string; result: ReturnType<typeof checkPixels> }[];
  move: { id: string; dx: number; dy: number }[];
}
const results = new Map<TextBackgroundStyle, StyleResult>();

beforeAll(async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  metrics = await allCuratedMetrics();
  for (const font of [PLAYFAIR, DM_SANS]) {
    outlines.set(
      `${font.family}|${font.weight}`,
      await loadCuratedGlyphOutlines(font, CURATED_FONT_DIR),
    );
  }
  artwork = busyArtwork();
  server = await startStaticServer();
  browser = await launchChromium();
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  page = await context.newPage();
  await page.setViewportSize({ width: CANVAS.width, height: CANVAS.height });

  const plain = await render(boxesOf(BASE, null), "none");
  for (const style of STYLES) {
    const result: StyleResult = { geometry: [], pixels: [], move: [] };
    for (const opacity of [1, 0.35]) {
      const boxes = boxesOf(BASE, background(style, opacity));
      const r = await render(boxes, `${style}-${opacity}`);
      result.geometry.push({
        label: `opacity ${opacity}`,
        ...checkGeometry(style, boxes, r.measured),
      });
      result.pixels.push({
        label: `opacity ${opacity}`,
        result: checkPixels(boxes, plain.image, r.image),
      });
      if (opacity === 1) {
        const movedBoxes = boxesOf(moved(BASE), background(style, opacity));
        const m = await render(movedBoxes, `${style}-moved`);
        result.geometry.push({ label: "moved", ...checkGeometry(style, movedBoxes, m.measured) });
        for (const before of r.measured) {
          const after = m.measured.find((x) => x.id === before.id)!;
          if (!before.page || !after.page) continue;
          result.move.push({
            id: before.id,
            dx: after.page.left - before.page.left,
            dy: after.page.top - before.page.top,
          });
        }
        const resizedBoxes = boxesOf(resized(BASE), background(style, opacity));
        const s = await render(resizedBoxes, `${style}-resized`);
        result.geometry.push({
          label: "resized",
          ...checkGeometry(style, resizedBoxes, s.measured),
        });
        const plainResized = await render(boxesOf(resized(BASE), null), `none-resized-${style}`);
        result.pixels.push({
          label: "resized",
          result: checkPixels(resizedBoxes, plainResized.image, s.image),
        });
      }
    }
    results.set(style, result);
  }
}, 600_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
  writeFileSync(
    path.join(OUT_DIR, "report.json"),
    JSON.stringify(Object.fromEntries(results), null, 2),
  );
  for (const [style, r] of results) {
    console.info(
      `${style}: ` +
        r.geometry
          .map((g) => `${g.label} hug ≤ ${g.hug.toFixed(3)}, svg ≤ ${g.svg.toFixed(3)}`)
          .join("; ") +
        " | " +
        r.pixels
          .map(
            (p) =>
              `${p.label}: ${p.result.textPixels} text px (${p.result.textChanged} changed, max ${p.result.textMaxDelta}), ` +
              `${p.result.outside} px outside (${p.result.outsideChanged} changed, max ${p.result.outsideMaxDelta}), ${p.result.insideChanged} inside changed, ` +
              `fill ${p.result.fillPixels} px within ${p.result.fillMaxError}`,
          )
          .join("; "),
    );
  }
});

describe.each(STYLES)("a %s text background", (style) => {
  it("hugs each line (highlight) or surrounds the block (box, backdrop), as the SVG draws it", () => {
    const r = results.get(style)!;
    for (const g of r.geometry) {
      expect(g.failures, g.label).toEqual([]);
      expect(g.hug).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
      expect(g.svg).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
    }
  });

  it("never changes the text's colour, at any opacity", () => {
    // A pixel the glyph covers all but 1/255 of reads as the text colour over anything; it may
    // move by one level when what is behind it changes. A changed text colour or opacity would
    // move every one of them by far more.
    for (const { label, result } of results.get(style)!.pixels) {
      expect(result.textPixels, label).toBeGreaterThan(2000);
      expect(result.textMaxDelta, label).toBeLessThanOrEqual(1);
      expect(result.textChanged / result.textPixels, label).toBeLessThan(0.01);
    }
  });

  it("is its fill at its opacity over the artwork, which it leaves untouched outside its extent", () => {
    for (const { label, result } of results.get(style)!.pixels) {
      expect(result.outside, label).toBeGreaterThan(CANVAS.width * CANVAS.height * 0.4);
      expect(result.outsideChanged, label).toBe(0);
      expect(result.insideChanged, label).toBeGreaterThan(5000);
      expect(result.fillPixels, label).toBeGreaterThan(1000);
      expect(result.fillMaxError, label).toBeLessThanOrEqual(2);
    }
  });

  it("moves with its box", () => {
    const { move } = results.get(style)!;
    expect(move.map((m) => m.id).sort()).toEqual(["added-1", "date", "invitationLine", "title"]);
    for (const m of move) {
      expect(m.dx, m.id).toBeCloseTo(MOVE.dx, 1);
      expect(m.dy, m.id).toBeCloseTo(MOVE.dy, 1);
    }
  });
});
