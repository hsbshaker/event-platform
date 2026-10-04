/**
 * Ink and legibility for the generated card (`docs/card-system.md §4.2`).
 *
 * Pure functions over raw, already-decoded RGB(A) pixel buffers: no image decoding happens here.
 * The buffer is the artwork at the card's proportion; card units map onto it uniformly
 * (`CARD_WIDTH` card units across the buffer's width).
 *
 * The rule (Phase 3, `docs/model-evals/phase-3-validation.md`, "Ink and legibility"): the zone's
 * background is measured as the luminance range between its 8th and 92nd percentiles. An ink darker
 * than the whole range is judged against the range's dark end, one lighter than the whole range
 * against its light end, and an ink inside the range collides with part of the zone and fails. The
 * first mock chose the tail by comparing the ink with the median, which let a cream ink pass over
 * a cream background; `inkContrast` is the nearest-tail rule that replaced it.
 *
 * Contrast is WCAG 2.x (`color.ts`); OKLCH is only the space the tuned neutrals and the panel are
 * built in. No step here calls a model.
 */

import { type Oklch, type Rgb, oklchToHex, parseHex, relativeLuminance, rgbToOklch } from "./color";

/** The card's width in card units; every proportion is 1000 units wide (`card-system.md §2.1`). */
export const CARD_WIDTH = 1000;

/** WCAG 2.x AA for normal text: every text of the generated card clears it. */
export const MIN_INK_CONTRAST = 4.5;

/** The percentiles that bound the measured background (Phase 3). */
export const DARK_TAIL_PERCENTILE = 8;
export const LIGHT_TAIL_PERCENTILE = 92;

/** A rectangle in card units, top-left origin. */
export interface CardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One colour of the artwork's palette and the share of the artwork it covers (0..1). */
export interface PaletteColor {
  color: string;
  share: number;
}

export type InkSource = "art" | "tuned-dark" | "tuned-light";

export interface InkResolution {
  /** `#RRGGBB`. */
  ink: string;
  /** Where the ink came from: the artwork's palette, or a neutral tuned toward its hue. */
  source: InkSource;
  /** WCAG contrast of the ink against what it is judged by (the nearest tail, or the panel). */
  contrast: number;
  /** The art-derived paper panel behind the zone, when no candidate clears 4.5:1 without one. */
  panel: null | { color: string };
  /** The measured background: relative luminance at the dark and light percentiles. */
  background: { darkTail: number; lightTail: number };
}

function channelsOf(pixels: ArrayLike<number>, width: number, height: number): 3 | 4 {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid pixel buffer size ${width}×${height}`);
  }
  const count = width * height;
  if (pixels.length === count * 3) return 3;
  if (pixels.length === count * 4) return 4;
  throw new Error(
    `Pixel buffer of length ${pixels.length} is neither RGB nor RGBA for ${width}×${height}`,
  );
}

/** Relative luminance of 8-bit sRGB channels, via a 256-entry table per channel weight. */
const LINEAR = Array.from(
  { length: 256 },
  (_, v) => relativeLuminance({ r: v, g: 0, b: 0 }) / 0.2126,
);
function luminanceOf(r: number, g: number, b: number): number {
  return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
}

/**
 * Relative luminance of every artwork pixel whose centre lies in `zone` (card units) and inside
 * the shape's outline (`inside(x, y)`, card units), sorted ascending.
 *
 * Alpha, when present, is ignored: artwork is validated as an opaque raster before this runs.
 * Throws when no pixel qualifies — a zone outside the canvas or the outline is a catalog bug, and
 * measuring nothing must never read as "legible".
 */
export function sampleZoneLuminance(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  zone: CardRect,
  inside: (x: number, y: number) => boolean,
): Float64Array {
  const channels = channelsOf(pixels, width, height);
  const scale = width / CARD_WIDTH;
  const x0 = Math.max(0, Math.floor(zone.x * scale));
  const x1 = Math.min(width, Math.ceil((zone.x + zone.width) * scale));
  const y0 = Math.max(0, Math.floor(zone.y * scale));
  const y1 = Math.min(height, Math.ceil((zone.y + zone.height) * scale));

  const out: number[] = [];
  for (let py = y0; py < y1; py += 1) {
    const cy = (py + 0.5) / scale;
    if (cy < zone.y || cy > zone.y + zone.height) continue;
    for (let px = x0; px < x1; px += 1) {
      const cx = (px + 0.5) / scale;
      if (cx < zone.x || cx > zone.x + zone.width) continue;
      if (!inside(cx, cy)) continue;
      const i = (py * width + px) * channels;
      out.push(luminanceOf(pixels[i], pixels[i + 1], pixels[i + 2]));
    }
  }
  if (out.length === 0) {
    throw new Error("Zone contains no artwork pixels inside the outline");
  }
  const sorted = Float64Array.from(out);
  sorted.sort();
  return sorted;
}

/** Nearest-rank percentile of an ascending array (the Phase 3 definition). */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) throw new Error("percentile of an empty sample");
  const i = Math.round((p / 100) * (sorted.length - 1));
  return sorted[Math.min(sorted.length - 1, Math.max(0, i))];
}

function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * The contrast an ink of luminance `inkL` is judged by against a measured range — the nearest-tail
 * rule. Darker than the whole range: against the dark tail. Lighter than the whole range: against
 * the light tail. Inside the range: 1, because some of the zone matches the ink.
 */
export function inkContrast(inkL: number, darkTail: number, lightTail: number): number {
  if (inkL <= darkTail) return ratio(inkL, darkTail);
  if (inkL >= lightTail) return ratio(inkL, lightTail);
  return 1;
}

/* ---------------------------------------------------------------- palette (k-means) */

const BIN_BITS = 5;
const BIN_SHIFT = 8 - BIN_BITS;
const BIN_COUNT = 1 << (3 * BIN_BITS);

interface Lab {
  l: number;
  a: number;
  b: number;
}

function toLab(rgb: Rgb): Lab {
  const o = rgbToOklch(rgb);
  const rad = (o.h * Math.PI) / 180;
  return { l: o.l, a: o.c * Math.cos(rad), b: o.c * Math.sin(rad) };
}

function labToHex(lab: Lab): string {
  const c = Math.hypot(lab.a, lab.b);
  const h = c < 1e-7 ? 0 : ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  return oklchToHex({ l: lab.l, c, h });
}

function dist2(p: Lab, q: Lab): number {
  const dl = p.l - q.l;
  const da = p.a - q.a;
  const db = p.b - q.b;
  return dl * dl + da * da + db * db;
}

export interface PaletteOptions {
  /** Clusters to look for (Phase 3: 6). */
  k?: number;
  /** Clusters covering this share or less are dropped (Phase 3: 1%). */
  minShare?: number;
}

/**
 * The artwork's dominant colours by population, largest share first.
 *
 * Deterministic: every pixel is counted into a 15-bit colour histogram (the mean colour of each bin
 * kept exactly), then a weighted k-means in OKLab runs over the bins. Seeding is a greedy,
 * deterministic k-means++: the most populous bin first, then repeatedly the bin with the largest
 * population × squared distance to its nearest seed (ties to the lowest bin index), so a small
 * but distinct accent — the brown of a teddy on cream paper — becomes its own cluster while
 * single-pixel noise cannot. Lloyd iterations run to convergence or 32 rounds.
 */
export function paletteFromPixels(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  options: PaletteOptions = {},
): PaletteColor[] {
  const k = options.k ?? 6;
  const minShare = options.minShare ?? 0.01;
  const channels = channelsOf(pixels, width, height);

  const count = new Float64Array(BIN_COUNT);
  const sumR = new Float64Array(BIN_COUNT);
  const sumG = new Float64Array(BIN_COUNT);
  const sumB = new Float64Array(BIN_COUNT);
  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const bin =
      ((r >> BIN_SHIFT) << (2 * BIN_BITS)) | ((g >> BIN_SHIFT) << BIN_BITS) | (b >> BIN_SHIFT);
    count[bin] += 1;
    sumR[bin] += r;
    sumG[bin] += g;
    sumB[bin] += b;
  }

  const bins: { lab: Lab; n: number }[] = [];
  for (let bin = 0; bin < BIN_COUNT; bin += 1) {
    const n = count[bin];
    if (n === 0) continue;
    bins.push({ lab: toLab({ r: sumR[bin] / n, g: sumG[bin] / n, b: sumB[bin] / n }), n });
  }
  const total = width * height;

  // Greedy deterministic k-means++ seeding.
  const seeds: Lab[] = [];
  let heaviest = 0;
  for (let i = 1; i < bins.length; i += 1) if (bins[i].n > bins[heaviest].n) heaviest = i;
  seeds.push(bins[heaviest].lab);
  const nearest = bins.map((bin) => dist2(bin.lab, seeds[0]));
  while (seeds.length < Math.min(k, bins.length)) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < bins.length; i += 1) {
      const score = bins[i].n * nearest[i];
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) break; // every remaining bin coincides with a seed
    const seed = bins[best].lab;
    seeds.push(seed);
    for (let i = 0; i < bins.length; i += 1)
      nearest[i] = Math.min(nearest[i], dist2(bins[i].lab, seed));
  }

  let centers = seeds;
  const assign = new Int32Array(bins.length).fill(-1);
  const weight = new Float64Array(centers.length);
  for (let iter = 0; iter < 32; iter += 1) {
    let changed = false;
    for (let i = 0; i < bins.length; i += 1) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < centers.length; c += 1) {
        const d = dist2(bins[i].lab, centers[c]);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed = true;
      }
    }
    const acc = centers.map(() => ({ l: 0, a: 0, b: 0 }));
    weight.fill(0);
    for (let i = 0; i < bins.length; i += 1) {
      const c = assign[i];
      const { lab, n } = bins[i];
      acc[c].l += lab.l * n;
      acc[c].a += lab.a * n;
      acc[c].b += lab.b * n;
      weight[c] += n;
    }
    centers = acc.map((s, c) =>
      weight[c] > 0 ? { l: s.l / weight[c], a: s.a / weight[c], b: s.b / weight[c] } : centers[c],
    );
    if (!changed && iter > 0) break;
  }

  return centers
    .map((lab, c) => ({ color: labToHex(lab), share: weight[c] / total }))
    .filter((p) => p.share > minShare)
    .sort((p, q) => q.share - p.share || (p.color < q.color ? -1 : p.color > q.color ? 1 : 0));
}

/* ---------------------------------------------------------------- resolution */

/** The tuned neutrals and the paper panel (Phase 3 values). */
const TUNED_DARK = { l: 0.24, c: 0.03 };
const TUNED_LIGHT = { l: 0.98, c: 0.012 };
const PANEL = { l: 0.965, maxC: 0.025 };
/** Below this OKLCH chroma a palette colour has no meaningful hue. */
const CHROMATIC = 0.02;

/**
 * The artwork's hue for tuning neutrals: the hue of the largest-share palette colour that has one.
 * An achromatic palette gives untinted neutrals (chroma 0) rather than a hue of 0° by accident.
 */
function artHue(palette: readonly PaletteColor[]): { h: number; chromatic: boolean } {
  for (const p of palette) {
    const o = rgbToOklch(parseHex(p.color));
    if (o.c >= CHROMATIC) return { h: o.h, chromatic: true };
  }
  return { h: 0, chromatic: false };
}

function tuned(base: { l: number; c: number }, hue: { h: number; chromatic: boolean }): string {
  const o: Oklch = { l: base.l, c: hue.chromatic ? base.c : 0, h: hue.h };
  return oklchToHex(o);
}

function lum(hex: string): number {
  return relativeLuminance(parseHex(hex));
}

export interface ResolveInkInput {
  /** The zone's background luminances (`sampleZoneLuminance`); need not be sorted. */
  luminances: ArrayLike<number>;
  /** The artwork's palette, largest share first (`paletteFromPixels`). */
  palette: readonly PaletteColor[];
}

/**
 * Choose the ink for one text zone (`card-system.md §4.2`).
 *
 * Candidates, in order: the artwork's palette by share, then a near-black and a near-white tuned
 * toward the artwork's hue. The first that reaches 4.5:1 by the nearest-tail rule wins. If none
 * does, an art-derived paper panel goes behind the zone and the ink is chosen against the panel
 * colour. The panel is opaque by contract: the renderer must draw it at full opacity behind the
 * text, or the ink's contrast against it is not what was measured here.
 */
export function resolveInk({ luminances, palette }: ResolveInkInput): InkResolution {
  if (luminances.length === 0) throw new Error("resolveInk needs at least one luminance sample");
  for (let i = 0; i < luminances.length; i += 1) {
    const v = luminances[i];
    if (!(v >= 0 && v <= 1)) throw new Error(`Luminance out of range: ${v}`);
  }
  const sorted = Float64Array.from(luminances);
  sorted.sort();
  const darkTail = percentile(sorted, DARK_TAIL_PERCENTILE);
  const lightTail = percentile(sorted, LIGHT_TAIL_PERCENTILE);
  const background = { darkTail, lightTail };

  const hue = artHue(palette);
  const tunedDark = tuned(TUNED_DARK, hue);
  const tunedLight = tuned(TUNED_LIGHT, hue);
  const candidates: { ink: string; source: InkSource }[] = [
    ...palette.map((p) => ({ ink: p.color.toUpperCase(), source: "art" as const })),
    { ink: tunedDark, source: "tuned-dark" },
    { ink: tunedLight, source: "tuned-light" },
  ];

  for (const c of candidates) {
    const contrast = inkContrast(lum(c.ink), darkTail, lightTail);
    if (contrast >= MIN_INK_CONTRAST) {
      return { ink: c.ink, source: c.source, contrast, panel: null, background };
    }
  }

  // Legibility panel: paper derived from the artwork's lightest colour, ink chosen against it.
  const lightest = [...palette].sort((p, q) => lum(q.color) - lum(p.color))[0];
  const base = lightest ? rgbToOklch(parseHex(lightest.color)) : { l: 1, c: 0, h: 0 };
  const panel = oklchToHex({ l: PANEL.l, c: Math.min(base.c, PANEL.maxC), h: base.h });
  const panelL = lum(panel);
  for (const c of candidates) {
    const contrast = inkContrast(lum(c.ink), panelL, panelL);
    if (contrast >= MIN_INK_CONTRAST) {
      return { ink: c.ink, source: c.source, contrast, panel: { color: panel }, background };
    }
  }
  // Unreachable with the constants above (the tuned dark clears ~14:1 on the panel); kept as a
  // loud failure rather than a silent fallback should the constants ever change.
  throw new Error(`No ink reaches ${MIN_INK_CONTRAST}:1 against panel ${panel}`);
}
