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
import { panelFeather } from "@/lib/card/card-data";
import { CardTextLayoutError, generatedTextLayer } from "@/lib/card/card-text.server";
import { cropRect, plateCut, plateRect } from "@/lib/card/give-way";
import {
  CARD_LAYOUT_IDS,
  CARD_LAYOUT_SET_VERSION,
  CARD_LAYOUTS,
  panelFor,
  zoneFor,
  type CardLayoutId,
} from "@/lib/card/layouts";
import {
  canvasOf,
  insideOutline,
  insideTextSafe,
  proportionOf,
  SHAPE_GEOMETRY,
  type CardShape,
} from "@/lib/card/shapes";
import { TYPICAL, WORST } from "@/lib/card/test-content";
import { FIT_SAFETY, type CardContent, type TextBox } from "@/lib/card/text-box";
import type { FontMetricsResolver, FontRef } from "@/lib/card/text/metrics";
import { allCuratedMetrics } from "@/lib/card/text/test-fonts";
import { TYPOGRAPHY_KEYS, type TypographyPairingId } from "@/lib/card/typography";

import { launchChromium } from "./browser";
import { decodePng } from "./png";
import { REPO_ROOT, startStaticServer, type StaticServer } from "./static-server";

/**
 * Layout fixtures (`docs/card-system.md §9`; `spec.md §31`, "Card rendering and envelope": "Every
 * layout × pairing renders worst-case content in a real browser with no text outside its zone";
 * "The card is identical in proportion, line breaks and layout at 390px and 1280px").
 *
 * Every layout × supported shape × pairing, with typical and worst-case content, is laid out by
 * the server path (`generatedTextLayer`: `zoneFor` + `layoutCard` + the curated metrics), rendered
 * by `InvitationCard` through `react-dom/server`, served with `card-fonts.css` and the card fonts
 * from a local static server, and measured in Chromium with the card at the full width of a 390px
 * and a 1280px viewport — the widest scale difference the product can show. Artwork is synthetic
 * and flat (the zone a shade lighter, so the contact sheet shows it); the ink is fixed.
 *
 * Asserted in the browser: every font the cards use is loaded; each stored line renders as exactly
 * one line (one line element per stored line, one line fragment each), no wider than its box; each
 * line's rect lies within its zone and its corners inside the shape's text-safe area; panels sit
 * where the layout puts them (the opaque paper and its fade), under the text, with every line on
 * the opaque paper — and, read from the pixels, the paper is the panel colour over its rectangle,
 * half-way at the middle of its fade and gone past it; the outline masks the card (pixels just
 * inside and outside each corner); line breaks and relative positions are identical at both widths;
 * and rendered line widths agree with the server's measurement within `FIT_SAFETY`. A line's rect
 * is its text's advance horizontally and its line box vertically — the extent `layoutCard` fits;
 * glyph ink above or below the line box is typography, not overflow.
 *
 * Every combination is strict, worst case included (owner decision, `docs/CHANGELOG-v7.md`,
 * "Phase 4 — fitting every detail on every card"): the server path must lay every one out, and a
 * refusal fails the run. A refused render is still drawn on the contact sheet, outlined in red, so
 * a failing run shows what failed.
 *
 * Output for owner review (gitignored): `test-results/card-fixtures/report.json` and contact sheets.
 */

const WIDTHS = [390, 1280] as const;
type Width = (typeof WIDTHS)[number];
const OUT_DIR = path.join(REPO_ROOT, "test-results/card-fixtures");

const INK = "#3A2A1E";
const ART_COLOR = "#E8DCC8";
const ZONE_COLOR = "#F3ECE0";
const PANEL_COLOR = "#FBF8F3";
const PAGE_COLOR = "#FFFFFF";
/** The pairing the panel variants are set in. */
const PANEL_PAIRING: TypographyPairingId = "hc_playfair_dmsans";

/** Half a CSS pixel, the most a rendered edge can be off by rounding. */
const HALF_PX = 0.5;
/**
 * The most a line's edge may move between 390px and 1280px, in card units (0.39px at 390).
 * Positions are exact container-query arithmetic; text advances are shaped at different pixel sizes
 * and round independently, so a long line's ends differ by a fraction of a pixel (at most 0.68
 * units measured in Chromium 141).
 */
const CROSS_WIDTH_TOLERANCE = 1;

type ContentKind = "typical" | "worst";
const CONTENT: Record<ContentKind, CardContent> = { typical: TYPICAL, worst: { ...WORST } };

interface Combo {
  layout: CardLayoutId;
  shape: CardShape;
}

/**
 * How the card's art gives way (`card_layouts_v4`): a crop or a plate drawn from its stored
 * placement, or centred words over busy art with nothing behind them (`low`).
 */
type GiveWayVariant = "crop" | "plate" | "low";

/** The scales the variants are drawn at: a plate well inside the card, the larger crop. */
const PLATE_SCALE = 0.8;
const CROP_SCALE = 1.16;
const PLATE_FILL = "#D9E4D2";
/** The busy artwork behind the low-contrast case's words: stripes of the two art colours. */
const BUSY_A = "#2B3A55";
const BUSY_B = "#E8DCC8";

interface Render extends Combo {
  id: string;
  pairing: TypographyPairingId;
  content: ContentKind;
  panel: boolean;
  giveWay: GiveWayVariant | null;
  /** Laid out by the server path, or refused by it (a failure; drawn for the contact sheet). */
  status: "laid-out" | "refused";
  refusal?: string;
  boxes: TextBox[];
}

interface LineMeasure {
  text: string;
  fragments: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface CardMeasure {
  id: string;
  faceWidth: number;
  faceHeight: number;
  boxes: { id: string; widthPx: number; lines: LineMeasure[] }[];
  panels: { left: number; top: number; right: number; bottom: number; opacity: string }[];
  /** The artwork element's box and the plate's cut wrapper, when drawn (px, from the face). */
  art: { left: number; top: number; right: number; bottom: number } | null;
  cut: { left: number; top: number; right: number; bottom: number } | null;
  /** Whether the topmost element at each box's first line is that line (text above panels). */
  textOnTop: boolean[];
}

const COMBOS: Combo[] = CARD_LAYOUT_IDS.flatMap((layout) =>
  CARD_LAYOUTS[layout].shapes.map((shape) => ({ layout, shape })),
);

const comboKey = (c: Combo) => `${c.layout}/${c.shape}`;

let metrics: FontMetricsResolver;
let server: StaticServer;
let browser: Browser;
const renders: Render[] = [];
const measures: Record<Width, Map<string, CardMeasure>> = { 390: new Map(), 1280: new Map() };
const fontReports: Record<Width, { face: string; count: number; loaded: boolean }[]> = {
  390: [],
  1280: [],
};
const maskSamples: { width: Width; shape: CardShape; x: number; y: number; ok: boolean }[] = [];

type PanelProbeKind = "opaque" | "fade-middle" | "past-fade";
interface PanelSample {
  width: Width;
  id: string;
  kind: PanelProbeKind;
  x: number;
  y: number;
  want: number[];
  got: number[];
  ok: boolean;
}
const panelSamples: PanelSample[] = [];

async function layOut(
  combo: Combo,
  pairing: TypographyPairingId,
  content: ContentKind,
  panel: boolean,
  giveWay: GiveWayVariant | null = null,
): Promise<Render> {
  const id =
    `${combo.layout}__${combo.shape}__${pairing}__${content}` +
    (panel ? "__panel" : "") +
    (giveWay ? `__${giveWay}` : "");
  const base = { ...combo, id, pairing, content, panel, giveWay };
  try {
    const boxes = await generatedTextLayer({
      ...combo,
      pairing,
      content: CONTENT[content],
      ink: INK,
    });
    return { ...base, status: "laid-out", boxes };
  } catch (error) {
    if (!(error instanceof CardTextLayoutError)) throw error;
    return {
      ...base,
      status: "refused",
      refusal: error.reasons.join(", "),
      boxes: error.layout.boxes,
    };
  }
}

function artworkSvg(combo: Combo): string {
  const { width: w, height: h } = canvasOf(combo.shape);
  const z = zoneFor(combo.layout, combo.shape);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
    `<rect width="${w}" height="${h}" fill="${ART_COLOR}"/>` +
    `<rect x="${z.x}" y="${z.y}" width="${z.width}" height="${z.height}" fill="${ZONE_COLOR}"/></svg>`
  );
}

/** Busy artwork for the low-contrast case: vertical stripes 20 units wide. */
function busyArtworkSvg(combo: Combo): string {
  const { width: w, height: h } = canvasOf(combo.shape);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
    `<defs><pattern id="s" width="40" height="${h}" patternUnits="userSpaceOnUse">` +
    `<rect width="20" height="${h}" fill="${BUSY_A}"/><rect x="20" width="20" height="${h}" fill="${BUSY_B}"/>` +
    `</pattern></defs><rect width="${w}" height="${h}" fill="url(#s)"/></svg>`
  );
}

const artPath = (combo: Combo & { giveWay?: GiveWayVariant | null }) =>
  `/art/${combo.layout}-${combo.shape}${combo.giveWay === "low" ? "-busy" : ""}.svg`;

function panelsOf(render: Render): CardPanel[] {
  return render.panel ? [{ ...panelFor(render.layout, render.shape), color: PANEL_COLOR }] : [];
}

const edgeSpec = (layout: CardLayoutId) => {
  const spec = CARD_LAYOUTS[layout].giveWay;
  if (spec.kind !== "edge") throw new Error(`${layout} has no edge give-way`);
  return spec;
};

/** The stored placement a give-way render is drawn with, as `give-way.ts` builds it. */
function placementOf(render: Render): CardPlacement | undefined {
  if (render.giveWay === "crop") {
    return { kind: "crop", art: cropRect(edgeSpec(render.layout), render.shape, CROP_SCALE) };
  }
  if (render.giveWay === "plate") {
    const spec = edgeSpec(render.layout);
    return {
      kind: "plate",
      art: plateRect(spec, render.shape, PLATE_SCALE),
      cut: plateCut(spec, zoneFor(render.layout, render.shape)),
      fill: PLATE_FILL,
    };
  }
  return undefined;
}

function cardMarkup(render: Render): string {
  return renderToStaticMarkup(
    createElement(InvitationCard, {
      shape: render.shape,
      artwork: { src: artPath(render), proportion: proportionOf(render.shape) },
      panels: panelsOf(render),
      placement: placementOf(render),
      boxes: render.boxes,
    }),
  );
}

function pageHtml(body: string, extraCss = ""): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<link rel="stylesheet" href="/card-fonts.css">` +
    `<style>html,body{margin:0;padding:0;background:${PAGE_COLOR}}${extraCss}</style>` +
    `</head><body>${body}</body></html>`
  );
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function facesOf(list: readonly Render[]): FontRef[] {
  const seen = new Map<string, FontRef>();
  for (const r of list) {
    for (const b of r.boxes) {
      if (b.lines.length > 0) seen.set(`${b.font.family}|${b.font.weight}`, b.font);
    }
  }
  return [...seen.values()];
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    document.body.getBoundingClientRect();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await document.fonts.ready;
  });
}

async function fontStatus(page: Page, faces: readonly FontRef[]) {
  return page.evaluate(
    (wanted) =>
      wanted.map(({ family, weight }) => {
        const matches = [...document.fonts].filter(
          (f) =>
            f.family.replace(/^["']|["']$/g, "") === family &&
            String(f.weight) === String(weight) &&
            f.style === "normal",
        );
        return {
          face: `${family} ${weight}`,
          count: matches.length,
          loaded: matches.length > 0 && matches.every((f) => f.status === "loaded"),
        };
      }),
    faces.map(({ family, weight }) => ({ family, weight })),
  );
}

async function measurePage(page: Page): Promise<CardMeasure[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-fixture]")].map((section) => {
      const face = section.querySelector("[data-card-face]") as HTMLElement;
      const f = face.getBoundingClientRect();
      const boxes = [...face.querySelectorAll("[data-card-box]")].map((p) => {
        const pr = p.getBoundingClientRect();
        return {
          id: p.getAttribute("data-card-box") ?? "",
          widthPx: pr.width,
          lines: [...p.querySelectorAll("[data-card-line]")].map((span) => {
            const range = document.createRange();
            range.selectNodeContents(span);
            const t = range.getBoundingClientRect();
            const s = span.getBoundingClientRect();
            return {
              text: span.textContent ?? "",
              fragments: range.getClientRects().length,
              left: t.left - f.left,
              right: t.right - f.left,
              top: s.top - f.top,
              bottom: s.bottom - f.top,
            };
          }),
        };
      });
      const panels = [...face.querySelectorAll("[data-card-panel]")].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          left: r.left - f.left,
          top: r.top - f.top,
          right: r.right - f.left,
          bottom: r.bottom - f.top,
          opacity: getComputedStyle(el).opacity,
        };
      });
      const rectOf = (el: Element | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          left: r.left - f.left,
          top: r.top - f.top,
          right: r.right - f.left,
          bottom: r.bottom - f.top,
        };
      };
      const art = rectOf(face.querySelector("[data-card-art]"));
      const cut = rectOf(face.querySelector("[data-card-art-cut]"));
      const textOnTop = [...face.querySelectorAll("[data-card-box]")].map((p) => {
        const first = p.querySelector("[data-card-line]") as HTMLElement;
        // Hit-testing needs the point in the viewport.
        first.scrollIntoView({ block: "center" });
        const range = document.createRange();
        range.selectNodeContents(first);
        const r = range.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit === first;
      });
      return {
        id: section.getAttribute("data-fixture") ?? "",
        faceWidth: f.width,
        faceHeight: f.height,
        boxes,
        panels,
        art,
        cut,
        textOnTop,
      };
    }),
  );
}

/** Inside the drawn outline: `insideOutline`, with the rounded rectangle's corners cut. */
function insideDrawnOutline(shape: CardShape, x: number, y: number): boolean {
  if (!insideOutline(shape, x, y)) return false;
  if (shape !== "rounded-rectangle") return true;
  const { width: w, height: h } = canvasOf(shape);
  const r = SHAPE_GEOMETRY[shape].radius!;
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

/** Pixels just inside and outside each corner of the outline, in card units. */
function maskProbePoints(shape: CardShape): [number, number][] {
  const { width: w, height: h } = canvasOf(shape);
  return [
    [12, 12],
    [w - 12, 12],
    [12, h - 12],
    [w - 12, h - 12],
    [w / 2, 12],
    [12, h / 2],
  ];
}

/**
 * The mask is a property of the shape alone (`outline.ts`), so it is probed on one render per
 * layout × shape, not on every pairing.
 */
async function probeMask(page: Page, width: Width, render: Render): Promise<void> {
  const card = page.locator(`[data-fixture="${render.id}"] [data-card-face]`);
  const png = decodePng(await card.screenshot({ animations: "disabled" }));
  const scale = png.width / 1000;
  const art = [ART_COLOR, PAGE_COLOR].map((hex) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
  );
  for (const [x, y] of maskProbePoints(render.shape)) {
    const px = Math.min(png.width - 1, Math.floor(x * scale));
    const py = Math.min(png.height - 1, Math.floor(y * scale));
    const i = (py * png.width + px) * 4;
    const rgb = [png.rgba[i], png.rgba[i + 1], png.rgba[i + 2]];
    const want = insideDrawnOutline(render.shape, x, y) ? art[0] : art[1];
    const ok = rgb.every((v, k) => Math.abs(v - want[k]) <= 2);
    maskSamples.push({ width, shape: render.shape, x, y, ok });
  }
}

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Card units a probe keeps from the opaque rectangle's edge, the outline and the canvas edge. */
const PROBE_INSET = 8;
/** Card units a probe keeps from the text zone, so no glyph ink reaches it. */
const PROBE_ZONE_MARGIN = 16;
/** Per channel, of 255: the gradient's slope across one pixel at 390px plus rounding. */
const FADE_TOLERANCE = 3;

/**
 * Where to read the panel from the pixels, in card units, away from the text: points just inside
 * the opaque rectangle (the panel colour, alpha 1), the middle of each side's fade (alpha 0.5 —
 * the other axis is opaque there), and just past each fade (the artwork, alpha 0).
 */
function panelProbePoints(render: Render): { kind: PanelProbeKind; x: number; y: number }[] {
  const p = panelFor(render.layout, render.shape);
  const f = panelFeather(p);
  const zone = zoneFor(render.layout, render.shape);
  const { width: w, height: h } = canvasOf(render.shape);
  const [x0, y0, x1, y1] = [p.x, p.y, p.x + p.width, p.y + p.height];
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const i = PROBE_INSET;
  const points: { kind: PanelProbeKind; x: number; y: number }[] = [
    ...(
      [
        [x0 + i, y0 + i],
        [x1 - i, y0 + i],
        [x0 + i, y1 - i],
        [x1 - i, y1 - i],
        [cx, y0 + i],
        [cx, y1 - i],
        [x0 + i, cy],
        [x1 - i, cy],
      ] as const
    ).map(([x, y]) => ({ kind: "opaque" as const, x, y })),
  ];
  const sides = [
    [f.top, cx, y0, 0, -1],
    [f.bottom, cx, y1, 0, 1],
    [f.left, x0, cy, -1, 0],
    [f.right, x1, cy, 1, 0],
  ] as const;
  for (const [len, sx, sy, dx, dy] of sides) {
    if (len <= 0) continue;
    points.push({ kind: "fade-middle", x: sx + (dx * len) / 2, y: sy + (dy * len) / 2 });
    points.push({ kind: "past-fade", x: sx + dx * (len + i), y: sy + dy * (len + i) });
  }
  const m = PROBE_ZONE_MARGIN;
  return points.filter(
    ({ x, y }) =>
      x >= i &&
      y >= i &&
      x <= w - i &&
      y <= h - i &&
      !(
        x > zone.x - m &&
        x < zone.x + zone.width + m &&
        y > zone.y - m &&
        y < zone.y + zone.height + m
      ) &&
      [
        [0, 0],
        [i, 0],
        [-i, 0],
        [0, i],
        [0, -i],
      ].every(([ox, oy]) => insideDrawnOutline(render.shape, x + ox, y + oy)),
  );
}

/** Reads a panel render's paper from a screenshot at the probe points. */
async function probePanel(page: Page, width: Width, render: Render): Promise<void> {
  const card = page.locator(`[data-fixture="${render.id}"] [data-card-face]`);
  const png = decodePng(await card.screenshot({ animations: "disabled" }));
  const scale = png.width / 1000;
  const paper = rgbOf(PANEL_COLOR);
  const art = rgbOf(ART_COLOR);
  for (const { kind, x, y } of panelProbePoints(render)) {
    const alpha = kind === "opaque" ? 1 : kind === "fade-middle" ? 0.5 : 0;
    const want = paper.map((v, k) => Math.round(v * alpha + art[k] * (1 - alpha)));
    const px = Math.min(png.width - 1, Math.floor(x * scale));
    const py = Math.min(png.height - 1, Math.floor(y * scale));
    const at = (py * png.width + px) * 4;
    const got = [png.rgba[at], png.rgba[at + 1], png.rgba[at + 2]];
    const tolerance = kind === "fade-middle" ? FADE_TOLERANCE : 2;
    const ok = got.every((v, k) => Math.abs(v - want[k]) <= tolerance);
    panelSamples.push({ width, id: render.id, kind, x, y, want, got, ok });
  }
}

type GiveWayProbeKind = "fill" | "art" | "zone";
interface GiveWaySample {
  width: Width;
  id: string;
  kind: GiveWayProbeKind;
  x: number;
  y: number;
  want: number[];
  got: number[];
  ok: boolean;
}
const giveWaySamples: GiveWaySample[] = [];

/** Card units a give-way probe keeps from every edge it could straddle. */
const GIVE_WAY_MARGIN = 10;
/** Card units a give-way probe keeps from a text box's extent, so no glyph ink reaches it. */
const GIVE_WAY_TEXT_MARGIN = 16;

/**
 * Where to read a crop's or a plate's pixels, in card units, and the colour each should be: a grid
 * every 25 units inside the outline, away from the text and from every edge a probe could straddle
 * (the outline, the cut, the plate's scaled outline, the artwork's zone rectangle). On a plate, the
 * card on the words' side of the cut and around the plate is the fill; inside the plate it is the
 * artwork at the point the stored rectangle puts there. A crop is artwork everywhere.
 */
function giveWayProbePoints(
  render: Render,
): { kind: GiveWayProbeKind; x: number; y: number; want: string }[] {
  const placement = placementOf(render)!;
  const { width: w, height: h } = canvasOf(render.shape);
  const zone = zoneFor(render.layout, render.shape);
  const m = GIVE_WAY_MARGIN;
  const t = GIVE_WAY_TEXT_MARGIN;
  const text = render.boxes
    .filter((b) => b.lines.length > 0)
    .map((b) => ({
      x0: b.x - t,
      y0: b.y - t,
      x1: b.x + b.width + t,
      y1: b.y + b.size * b.lineHeight * b.lines.length + t,
    }));
  const offsets = [
    [0, 0],
    [m, 0],
    [-m, 0],
    [0, m],
    [0, -m],
  ];
  const { art, cut } = placement;
  /** The artwork's own card units at card point (x, y), as the stored rectangle draws it. */
  const artAt = (x: number, y: number) => ({
    ax: ((x - art.x) / art.width) * w,
    ay: ((y - art.y) / art.height) * h,
  });
  const kept = (y: number) => !cut || (cut.keep === "above" ? y < cut.y : y > cut.y);
  const onArt = (x: number, y: number) => {
    const { ax, ay } = artAt(x, y);
    return (
      kept(y) &&
      ax >= 0 &&
      ax <= w &&
      ay >= 0 &&
      ay <= h &&
      (placement.kind === "crop" || insideDrawnOutline(render.shape, ax, ay))
    );
  };
  const inZone = (x: number, y: number) => {
    const { ax, ay } = artAt(x, y);
    return ax > zone.x && ax < zone.x + zone.width && ay > zone.y && ay < zone.y + zone.height;
  };
  const points: { kind: GiveWayProbeKind; x: number; y: number; want: string }[] = [];
  for (let y = 12.5; y < h; y += 25) {
    for (let x = 12.5; x < w; x += 25) {
      if (!offsets.every(([dx, dy]) => insideDrawnOutline(render.shape, x + dx, y + dy))) continue;
      if (text.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1)) continue;
      const art0 = onArt(x, y);
      if (!offsets.every(([dx, dy]) => onArt(x + dx, y + dy) === art0)) continue;
      if (!art0) {
        points.push({ kind: "fill", x, y, want: placement.fill! });
        continue;
      }
      // The flat artwork shades its own text zone lighter; read it only away from that edge.
      // The artwork's units are the card's scaled by the placement: the margin scales with them.
      const zone0 = inZone(x, y);
      if (!offsets.every(([dx, dy]) => inZone(x + dx, y + dy) === zone0)) continue;
      points.push(
        zone0 ? { kind: "zone", x, y, want: ZONE_COLOR } : { kind: "art", x, y, want: ART_COLOR },
      );
    }
  }
  return points;
}

/** Reads a give-way render's pixels at the probe points. */
async function probeGiveWay(page: Page, width: Width, render: Render): Promise<void> {
  const card = page.locator(`[data-fixture="${render.id}"] [data-card-face]`);
  const png = decodePng(await card.screenshot({ animations: "disabled" }));
  const scale = png.width / 1000;
  for (const { kind, x, y, want } of giveWayProbePoints(render)) {
    const px = Math.min(png.width - 1, Math.floor(x * scale));
    const py = Math.min(png.height - 1, Math.floor(y * scale));
    const at = (py * png.width + px) * 4;
    const got = [png.rgba[at], png.rgba[at + 1], png.rgba[at + 2]];
    const rgb = rgbOf(want);
    const ok = got.every((v, k) => Math.abs(v - rgb[k]) <= 2);
    giveWaySamples.push({ width, id: render.id, kind, x, y, want: rgb, got, ok });
  }
}

async function renderAll(): Promise<void> {
  for (const combo of COMBOS) {
    server.put(artPath(combo), artworkSvg(combo), "image/svg+xml");
    server.put(artPath({ ...combo, giveWay: "low" }), busyArtworkSvg(combo), "image/svg+xml");
    const list = renders.filter((r) => r.layout === combo.layout && r.shape === combo.shape);
    const body = list
      .map((r) => `<section data-fixture="${r.id}" style="width:100%">${cardMarkup(r)}</section>`)
      .join("");
    server.put(`/page/${combo.layout}-${combo.shape}.html`, pageHtml(body), "text/html");
  }
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`));
    for (const combo of COMBOS) {
      await page.goto(`${server.origin}/page/${combo.layout}-${combo.shape}.html`, {
        waitUntil: "load",
      });
      await settle(page);
      for (const m of await measurePage(page)) measures[width].set(m.id, m);
      const list = renders.filter((r) => r.layout === combo.layout && r.shape === combo.shape);
      await probeMask(page, width, list[0]);
      for (const r of list.filter((x) => x.panel)) await probePanel(page, width, r);
      for (const r of list.filter((x) => x.giveWay === "crop" || x.giveWay === "plate")) {
        await probeGiveWay(page, width, r);
      }
      const status = await fontStatus(page, facesOf(list));
      fontReports[width].push(...status);
    }
    expect(errors, `page errors at ${width}`).toEqual([]);
    await context.close();
  }
}

/** Failures of one render at one width; strict checks apply only to what the server laid out. */
function checkRender(render: Render, width: Width): string[] {
  const m = measures[width].get(render.id);
  if (!m) return [`not rendered at ${width}`];
  const failures: string[] = [];
  const unit = 1000 / m.faceWidth;
  const eps = HALF_PX * unit;
  const zone = zoneFor(render.layout, render.shape);
  const canvas = canvasOf(render.shape);
  if (Math.abs(m.faceWidth - width) > 0.01) failures.push(`card is ${m.faceWidth}px wide`);
  if (Math.abs(m.faceHeight / m.faceWidth - canvas.height / canvas.width) > 1 / m.faceWidth) {
    failures.push(`card proportion ${m.faceWidth}×${m.faceHeight}`);
  }
  const stored = render.boxes.filter((b) => b.lines.length > 0);
  const rendered = new Map(m.boxes.map((b) => [b.id, b]));
  if (m.boxes.length !== stored.length) {
    failures.push(`${m.boxes.length} boxes rendered, ${stored.length} stored`);
  }
  for (const box of stored) {
    const r = rendered.get(box.id);
    if (!r) {
      failures.push(`box ${box.id} not rendered`);
      continue;
    }
    if (r.lines.length !== box.lines.length) {
      failures.push(`box ${box.id}: ${r.lines.length} lines rendered, ${box.lines.length} stored`);
    }
    r.lines.forEach((line, i) => {
      const where = `box ${box.id} line ${i} "${line.text}"`;
      if (line.text !== box.lines[i]) failures.push(`${where}: text differs from stored`);
      if (line.fragments !== 1) failures.push(`${where}: wrapped into ${line.fragments} lines`);
      if (render.status !== "laid-out") return;
      if (line.right - line.left > r.widthPx + HALF_PX) {
        failures.push(`${where}: ${(line.right - line.left).toFixed(2)}px > box ${r.widthPx}px`);
      }
      const [x0, x1, y0, y1] = [line.left, line.right, line.top, line.bottom].map((v) => v * unit);
      if (
        x0 < zone.x - eps ||
        x1 > zone.x + zone.width + eps ||
        y0 < zone.y - eps ||
        y1 > zone.y + zone.height + eps
      ) {
        failures.push(
          `${where}: [${x0.toFixed(1)},${y0.toFixed(1)}–${x1.toFixed(1)},${y1.toFixed(1)}] outside zone`,
        );
      }
      const corners: [number, number][] = [
        [x0 + eps, y0 + eps],
        [x1 - eps, y0 + eps],
        [x0 + eps, y1 - eps],
        [x1 - eps, y1 - eps],
      ];
      if (!corners.every(([x, y]) => insideTextSafe(render.shape, x, y))) {
        failures.push(`${where}: a corner is outside the ${render.shape} text-safe area`);
      }
    });
  }
  if (render.panel) {
    const want = panelFor(render.layout, render.shape);
    const f = panelFeather(want);
    const p = m.panels[0];
    if (m.panels.length !== 1 || !p) failures.push(`${m.panels.length} panels rendered`);
    else {
      // The element covers the opaque paper and its fade.
      const got = [p.left, p.top, p.right, p.bottom].map((v) => v * unit);
      const exp = [
        want.x - f.left,
        want.y - f.top,
        want.x + want.width + f.right,
        want.y + want.height + f.bottom,
      ];
      if (got.some((v, i) => Math.abs(v - exp[i]) > eps)) {
        failures.push(`panel at ${got.map((v) => v.toFixed(1)).join(",")}`);
      }
      if (p.opacity !== "1") failures.push(`panel opacity ${p.opacity}`);
    }
    // Every line sits on the opaque paper: the ink was resolved against the panel colour alone.
    for (const box of m.boxes) {
      box.lines.forEach((line, i) => {
        const [x0, x1, y0, y1] = [line.left, line.right, line.top, line.bottom].map(
          (v) => v * unit,
        );
        if (
          x0 < want.x - eps ||
          x1 > want.x + want.width + eps ||
          y0 < want.y - eps ||
          y1 > want.y + want.height + eps
        ) {
          failures.push(`box ${box.id} line ${i} "${line.text}": off the opaque paper`);
        }
      });
    }
    if (!m.textOnTop.every(Boolean)) failures.push("a panel covers text");
  } else if (m.panels.length !== 0) {
    failures.push("unexpected panel");
  }
  const placement = placementOf(render);
  if (placement) {
    // The artwork is drawn at its stored rectangle, whatever the width.
    const want = [
      placement.art.x,
      placement.art.y,
      placement.art.x + placement.art.width,
      placement.art.y + placement.art.height,
    ];
    const got = m.art
      ? [m.art.left, m.art.top, m.art.right, m.art.bottom].map((v) => v * unit)
      : [];
    if (!m.art || got.some((v, i) => Math.abs(v - want[i]) > eps)) {
      failures.push(`art drawn at ${got.map((v) => v.toFixed(1)).join(",")}, stored ${want}`);
    }
    if (placement.cut) {
      const { y, keep } = placement.cut;
      const wantCut =
        keep === "above" ? [0, 0, canvas.width, y] : [0, y, canvas.width, canvas.height];
      const gotCut = m.cut
        ? [m.cut.left, m.cut.top, m.cut.right, m.cut.bottom].map((v) => v * unit)
        : [];
      if (!m.cut || gotCut.some((v, i) => Math.abs(v - wantCut[i]) > eps)) {
        failures.push(`cut at ${gotCut.map((v) => v.toFixed(1)).join(",")}, stored ${wantCut}`);
      }
      // The words sit on the fill alone: every line on the words' side of the cut.
      for (const box of m.boxes) {
        box.lines.forEach((line, i) => {
          const [y0, y1] = [line.top, line.bottom].map((v) => v * unit);
          if (keep === "above" ? y0 < y - eps : y1 > y + eps) {
            failures.push(`box ${box.id} line ${i} "${line.text}": crosses the cut at ${y}`);
          }
        });
      }
    } else if (m.cut) {
      failures.push("a crop drew a cut");
    }
    if (!m.textOnTop.every(Boolean)) failures.push("the artwork covers text");
  } else if (m.art || m.cut) {
    failures.push("unexpected placement");
  }
  if (render.giveWay === "low" && !m.textOnTop.every(Boolean)) {
    failures.push("something covers the low-contrast text");
  }
  return failures;
}

/** Line breaks and relative positions at 390 against 1280, and the largest shift in card units. */
function acrossWidths(render: Render): { failures: string[]; maxShift: number } {
  const a = measures[390].get(render.id);
  const b = measures[1280].get(render.id);
  if (!a || !b) return { failures: ["not rendered at both widths"], maxShift: Number.NaN };
  const failures: string[] = [];
  let maxShift = 0;
  const ua = 1000 / a.faceWidth;
  const ub = 1000 / b.faceWidth;
  if (a.boxes.length !== b.boxes.length) failures.push("box count differs");
  a.boxes.forEach((boxA, i) => {
    const boxB = b.boxes[i];
    if (!boxB || boxB.id !== boxA.id) {
      failures.push(`box ${boxA.id} order differs`);
      return;
    }
    if (boxA.lines.map((l) => l.text).join("\n") !== boxB.lines.map((l) => l.text).join("\n")) {
      failures.push(`box ${boxA.id}: line breaks differ`);
    }
    boxA.lines.forEach((la, j) => {
      const lb = boxB.lines[j];
      if (!lb) return;
      const shift = Math.max(
        ...(["left", "right", "top", "bottom"] as const).map((k) =>
          Math.abs(la[k] * ua - lb[k] * ub),
        ),
      );
      maxShift = Math.max(maxShift, shift);
      if (shift > CROSS_WIDTH_TOLERANCE) {
        failures.push(`box ${boxA.id} line ${j}: moved ${shift.toFixed(2)} units between widths`);
      }
    });
  });
  return { failures, maxShift };
}

/** How far each rendered line's width is from the server's measurement, as a fraction. */
function widthDeviation(render: Render, width: Width): number {
  const m = measures[width].get(render.id);
  if (!m) return Number.NaN;
  const unit = 1000 / m.faceWidth;
  let worst = 0;
  for (const box of render.boxes) {
    const r = m.boxes.find((b) => b.id === box.id);
    if (!r) continue;
    const face = metrics(box.font);
    const style = { size: box.size, letterSpacingEm: box.letterSpacing, textCase: box.textCase };
    box.lines.forEach((line, i) => {
      const rendered = r.lines[i] ? (r.lines[i].right - r.lines[i].left) * unit : Number.NaN;
      const expected = face.measure(line, style);
      const dev = Math.abs(rendered - expected) / expected;
      if (!(dev <= worst)) worst = dev;
    });
  }
  return worst;
}

async function contactSheets(): Promise<string[]> {
  const files: string[] = [];
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const CELL = 200;
  for (const content of ["typical", "worst"] as const) {
    const variants = ["panel", "crop", "plate", "low"] as const;
    const columns: string[] =
      content === "typical" ? [...TYPOGRAPHY_KEYS, ...variants] : [...TYPOGRAPHY_KEYS];
    const head = columns.map((c) => `<div class="h">${escapeHtml(c)}</div>`).join("");
    const rows = COMBOS.map((combo) => {
      const cells = columns.map((column) => {
        const r = renders.find(
          (x) =>
            x.layout === combo.layout &&
            x.shape === combo.shape &&
            x.content === content &&
            (column === "panel"
              ? x.panel
              : column === "crop" || column === "plate" || column === "low"
                ? x.giveWay === column
                : !x.panel && !x.giveWay && x.pairing === column),
        );
        if (!r) return `<div></div>`;
        const cls = r.status === "laid-out" ? "c" : "c refused";
        return `<div class="${cls}" data-fixture-sheet="${r.id}">${cardMarkup(r)}</div>`;
      });
      return `<div class="h row">${escapeHtml(comboKey(combo))}</div>${cells.join("")}`;
    }).join("");
    const css =
      `body{font:12px/1.3 system-ui,sans-serif;color:#222;padding:16px}` +
      `.g{display:grid;grid-template-columns:140px repeat(${columns.length},${CELL}px);gap:12px;align-items:start}` +
      `.h{font-weight:600;word-break:break-all}.row{padding-top:8px}` +
      `.c{background:#EEE;outline:1px solid #DDD}.refused{outline:4px solid #D0021B}`;
    const legend =
      `<p><b>Layout fixtures — ${content} content</b> · ${CARD_LAYOUT_SET_VERSION} · ink ${INK} on flat artwork, ` +
      `zone shaded lighter · panel: a stored card_layouts_v3 panel · crop ×${CROP_SCALE}, plate ×${PLATE_SCALE} ` +
      `on fill ${PLATE_FILL}, low: centred words on busy art, nothing behind · ` +
      `red outline: refused by the server path (a failure)</p>`;
    server.put(
      `/sheet/${content}.html`,
      pageHtml(`${legend}<div class="g"><div></div>${head}${rows}</div>`, css),
      "text/html",
    );
    await page.goto(`${server.origin}/sheet/${content}.html`, { waitUntil: "load" });
    await settle(page);
    const file = path.join(OUT_DIR, `contact-sheet-${content}.png`);
    await page.screenshot({ path: file, fullPage: true });
    files.push(file);
  }
  await context.close();
  return files;
}

function writeReport(sheets: string[]): void {
  const rows = renders.map((r) => {
    const title = r.boxes.find((b) => b.id === "title");
    const line = r.boxes.find((b) => b.id === "invitationLine");
    const failures = [
      ...WIDTHS.flatMap((w) => checkRender(r, w).map((f) => `${w}: ${f}`)),
      ...acrossWidths(r).failures,
    ];
    return {
      id: r.id,
      layout: r.layout,
      shape: r.shape,
      pairing: r.pairing,
      content: r.content,
      panel: r.panel,
      giveWay: r.giveWay,
      status: r.status,
      refusal: r.refusal ?? null,
      titleSize: title?.size ?? null,
      bodySize: line?.size ?? null,
      lines: Object.fromEntries(r.boxes.filter((b) => b.lines.length).map((b) => [b.id, b.lines])),
      maxWidthDeviation: Object.fromEntries(WIDTHS.map((w) => [w, widthDeviation(r, w)])),
      maxCrossWidthShift: acrossWidths(r).maxShift,
      failures,
    };
  });
  const summary = COMBOS.flatMap((combo) =>
    (["typical", "worst"] as const).map((content) => {
      const list = rows.filter(
        (x) => x.layout === combo.layout && x.shape === combo.shape && x.content === content,
      );
      return {
        layout: combo.layout,
        shape: combo.shape,
        content,
        renders: list.length,
        pass: list.filter((x) => x.status === "laid-out" && x.failures.length === 0).length,
        overflow: list.filter((x) => x.status === "refused").map((x) => x.pairing),
        failing: list.filter((x) => x.failures.length > 0).map((x) => x.id),
      };
    }),
  );
  writeFileSync(
    path.join(OUT_DIR, "report.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        chromium: browser.version(),
        widths: WIDTHS,
        layoutSet: CARD_LAYOUT_SET_VERSION,
        fonts: fontReports,
        mask: maskSamples,
        panelSamples,
        giveWaySamples,
        contactSheets: sheets.map((f) => path.relative(REPO_ROOT, f)),
        summary,
        renders: rows,
      },
      null,
      2,
    ),
  );
}

beforeAll(async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  metrics = await allCuratedMetrics();
  for (const combo of COMBOS) {
    for (const content of ["typical", "worst"] as const) {
      for (const pairing of TYPOGRAPHY_KEYS) {
        renders.push(await layOut(combo, pairing, content, false));
      }
    }
    renders.push(await layOut(combo, PANEL_PAIRING, "typical", true));
    // The art giving way (card_layouts_v4): a plate wherever words sit at an edge of the picture,
    // a crop where the layout allows one, and centred words on busy art with nothing behind.
    const spec = CARD_LAYOUTS[combo.layout].giveWay;
    if (spec.kind === "edge") {
      renders.push(await layOut(combo, PANEL_PAIRING, "typical", false, "plate"));
      if (spec.cropShapes.includes(combo.shape)) {
        renders.push(await layOut(combo, PANEL_PAIRING, "typical", false, "crop"));
      }
    } else if (combo.layout === "framed" && combo.shape === "rectangle") {
      renders.push(await layOut(combo, PANEL_PAIRING, "typical", false, "low"));
    }
  }
  server = await startStaticServer();
  browser = await launchChromium();
  await renderAll();
  writeReport(await contactSheets());
}, 900_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe("layout fixtures: every layout × supported shape × pairing in Chromium", () => {
  it("covers the whole layout set", () => {
    expect(COMBOS).toHaveLength(25);
    // Every pairing with typical and worst-case content, a panel, then the art giving way: a plate
    // on each of art-top's and art-bottom's five shapes, a crop on art-bottom's three square-cornered
    // or softly rounded ones, and one centred low-contrast card.
    expect(renders).toHaveLength(25 * (2 * TYPOGRAPHY_KEYS.length + 1) + 10 + 3 + 1);
    expect(renders.filter((r) => r.giveWay === "plate").map(comboKey)).toEqual(
      (["art-top", "art-bottom"] as const).flatMap((l) =>
        CARD_LAYOUTS[l].shapes.map((shape) => `${l}/${shape}`),
      ),
    );
    expect(renders.filter((r) => r.giveWay === "crop").map(comboKey)).toEqual([
      "art-bottom/rectangle",
      "art-bottom/rounded-rectangle",
      "art-bottom/square",
    ]);
  });

  it.each(WIDTHS)(
    "draws every crop and plate from its stored rectangles, the words on the fill alone, at %ipx",
    (width) => {
      const samples = giveWaySamples.filter((s) => s.width === width);
      for (const r of renders.filter((x) => x.giveWay === "crop" || x.giveWay === "plate")) {
        const mine = samples.filter((s) => s.id === r.id);
        // Every plate is read on its fill and on its art; every crop on its art.
        if (r.giveWay === "plate") {
          expect(mine.filter((s) => s.kind === "fill").length, r.id).toBeGreaterThan(20);
        } else {
          expect(
            mine.filter((s) => s.kind === "fill"),
            r.id,
          ).toEqual([]);
        }
        expect(mine.filter((s) => s.kind !== "fill").length, r.id).toBeGreaterThan(20);
      }
      expect(samples.filter((s) => !s.ok)).toEqual([]);
    },
  );

  it("lays out every combination, worst case included: nothing is refused", () => {
    const refused = renders.filter((r) => r.status === "refused");
    expect(refused.map((r) => `${r.id}: ${r.refusal}`)).toEqual([]);
  });

  it.each(WIDTHS)("loads every font the cards use at %ipx", (width) => {
    expect(fontReports[width].length).toBeGreaterThan(0);
    expect(fontReports[width].filter((f) => !f.loaded)).toEqual([]);
  });

  it.each(WIDTHS)(
    "draws every panel opaque over its rectangle and eased into the artwork at %ipx",
    (width) => {
      const panelRenders = renders.filter((r) => r.panel);
      expect(panelRenders).toHaveLength(COMBOS.length);
      const samples = panelSamples.filter((s) => s.width === width);
      for (const r of panelRenders) {
        const mine = samples.filter((s) => s.id === r.id);
        // Every panel is read on its opaque paper and in the middle of its fade.
        expect(mine.filter((s) => s.kind === "opaque").length, r.id).toBeGreaterThan(0);
        expect(mine.filter((s) => s.kind === "fade-middle").length, r.id).toBeGreaterThan(0);
      }
      expect(samples.filter((s) => !s.ok)).toEqual([]);
    },
  );

  it.each(WIDTHS)("masks every shape with its outline at %ipx", (width) => {
    const samples = maskSamples.filter((s) => s.width === width);
    expect(samples.length).toBe(COMBOS.length * 6);
    expect(samples.filter((s) => !s.ok)).toEqual([]);
  });

  describe.each(COMBOS.map((c) => [comboKey(c), c] as const))("%s", (_key, combo) => {
    const mine = () => renders.filter((r) => r.layout === combo.layout && r.shape === combo.shape);

    it.each(WIDTHS)(
      "sets every stored line, unwrapped, inside its box, zone and text-safe area at %ipx",
      (width) => {
        const failures = mine().flatMap((r) => checkRender(r, width).map((f) => `${r.id}: ${f}`));
        expect(failures).toEqual([]);
      },
    );

    it("sets every stored line at the same relative position at 390px and 1280px", () => {
      const failures = mine().flatMap((r) => acrossWidths(r).failures.map((f) => `${r.id}: ${f}`));
      expect(failures).toEqual([]);
    });

    it("renders line widths as the server measured them", () => {
      const worst = Math.max(...mine().flatMap((r) => WIDTHS.map((w) => widthDeviation(r, w))));
      expect(worst).toBeLessThan(FIT_SAFETY);
    });
  });
});
