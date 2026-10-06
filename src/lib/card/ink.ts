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
 * `card_compiler_v3` (owner decision 2026-10-05) also measured the zone in half-overlapping
 * horizontal strips about a line of text tall, judging the ink against the widest of the zone's and
 * the strips' ranges. In a live run it caught too much: foliage or sky at the edges of empty parts
 * of the zone failed a strip, and 5 of 17 cards took two repaints and still ended with the panel.
 *
 * `card_compiler_v4` (owner decision 2026-10-05) measures only where the text is: the area behind
 * each line of the generated card's text, plus a small margin (`text-areas.ts`), each sampled like
 * the zone. The ink is judged against the widest of the zone's range and every area's range. The
 * whole-zone measure stays as a floor, so no ink passes that the zone as a whole would fail.
 * Artwork that sits under the letters — the base of a sculpture behind the first line of a title —
 * is a small share of the zone and hides in its tails, but not in that line's area, so it fails
 * here and the artwork is repainted, then given a panel. Artwork in a part of the zone no line
 * covers is no longer counted against the ink.
 *
 * `card_compiler_v5` (owner decisions 2026-10-06, "the art gives way"): when no candidate clears
 * 4.5:1, `resolveInk` no longer lays a panel behind the zone. It returns the candidate with the
 * highest contrast and says it did not clear; the caller decides what gives way (`give-way.ts`): for
 * words at an edge of the picture, the art is cropped or set back as a plate with a flat fill under
 * the words (`inkOnFlat`, `paperColor`); for centred words, nothing is painted behind them and the
 * zone is stored as low contrast. Panels persisted by earlier versions are still drawn as stored.
 *
 * Contrast is WCAG 2.x (`color.ts`); OKLCH is only the space the tuned neutrals and the paper are
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
  /** WCAG contrast of the ink against what it is judged by (the nearest tail). */
  contrast: number;
  /**
   * Whether the ink reaches 4.5:1. When no candidate does, the ink is the candidate with the
   * highest contrast (the first of them on a tie) and the caller decides what gives way.
   */
  cleared: boolean;
  /**
   * The measured background: relative luminance at the dark and light percentiles, the zone's range
   * widened by every text area's.
   */
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
 * With `art` — the rectangle, in card units, the artwork is drawn at when it gives way (a crop,
 * `give-way.ts`) — the card is sampled on the same grid of points and each point reads the
 * artwork pixel the drawn rectangle puts under it (nearest neighbour); points the rectangle does
 * not cover are skipped. Without it the artwork fills the canvas, as it always did.
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
  art?: CardRect,
): Float64Array {
  const channels = channelsOf(pixels, width, height);
  const scale = width / CARD_WIDTH;
  const unitsHigh = height / scale;
  if (Math.abs(unitsHigh - 1400) > 2 && Math.abs(unitsHigh - 1000) > 2) {
    throw new Error(`artwork ${width}×${height} is neither 5:7 nor 1:1`);
  }
  if (art && !(art.width > 0 && art.height > 0)) throw new Error("art rectangle must be positive");
  const x0 = Math.max(0, Math.floor(zone.x * scale));
  const x1 = Math.min(width, Math.ceil((zone.x + zone.width) * scale));
  const y0 = Math.max(0, Math.floor(zone.y * scale));
  const y1 = Math.min(height, Math.ceil((zone.y + zone.height) * scale));

  const out: number[] = [];
  for (let py = y0; py < y1; py += 1) {
    const cy = (py + 0.5) / scale;
    if (cy < zone.y || cy > zone.y + zone.height) continue;
    // The artwork row under this card row: itself, or where the drawn rectangle puts it.
    const sy = art ? Math.floor(((cy - art.y) / art.height) * height) : py;
    if (sy < 0 || sy >= height) continue;
    for (let px = x0; px < x1; px += 1) {
      const cx = (px + 0.5) / scale;
      if (cx < zone.x || cx > zone.x + zone.width) continue;
      if (!inside(cx, cy)) continue;
      const sx = art ? Math.floor(((cx - art.x) / art.width) * width) : px;
      if (sx < 0 || sx >= width) continue;
      const i = (sy * width + sx) * channels;
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

/** The tuned neutrals and the paper (Phase 3 values). */
const TUNED_DARK = { l: 0.24, c: 0.03 };
const TUNED_LIGHT = { l: 0.98, c: 0.012 };
const PAPER = { l: 0.965, maxC: 0.025 };
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

/** The luminance range between a sample's dark and light percentiles. */
function measuredRange(luminances: ArrayLike<number>): { darkTail: number; lightTail: number } {
  if (luminances.length === 0) throw new Error("resolveInk needs at least one luminance sample");
  for (let i = 0; i < luminances.length; i += 1) {
    const v = luminances[i];
    if (!(v >= 0 && v <= 1)) throw new Error(`Luminance out of range: ${v}`);
  }
  const sorted = Float64Array.from(luminances);
  sorted.sort();
  return {
    darkTail: percentile(sorted, DARK_TAIL_PERCENTILE),
    lightTail: percentile(sorted, LIGHT_TAIL_PERCENTILE),
  };
}

/**
 * The candidate inks, in the order they are tried: the artwork's palette by share, then a
 * near-black and a near-white tuned toward the artwork's hue.
 */
export function inkCandidates(
  palette: readonly PaletteColor[],
): { ink: string; source: InkSource }[] {
  const hue = artHue(palette);
  return [
    ...palette.map((p) => ({ ink: p.color.toUpperCase(), source: "art" as const })),
    { ink: tuned(TUNED_DARK, hue), source: "tuned-dark" },
    { ink: tuned(TUNED_LIGHT, hue), source: "tuned-light" },
  ];
}

export interface ResolveInkInput {
  /** The zone's background luminances (`sampleZoneLuminance`); need not be sorted. */
  luminances: ArrayLike<number>;
  /**
   * The background behind each line of the card's text, plus its margin (`textLineAreas`, each
   * sampled with `sampleZoneLuminance`); each need not be sorted. The ink is judged against the
   * widest of the zone's and every area's measured range. Without areas, the zone alone.
   */
  areas?: readonly ArrayLike<number>[];
  /** The artwork's palette, largest share first (`paletteFromPixels`). */
  palette: readonly PaletteColor[];
}

/**
 * Choose the ink for one text zone (`card-system.md §4.2`).
 *
 * The measured background is the zone's range widened by every text area's: the darkest dark tail
 * and the lightest light tail among them, so areas can only make the judgement stricter. The
 * candidates (`inkCandidates`) are tried in order, and the first that reaches 4.5:1 by the
 * nearest-tail rule against that range wins (`cleared`). If none does, the candidate with the
 * highest contrast is returned with `cleared` false (`card_compiler_v5`): nothing here paints
 * behind the words; the caller decides what gives way (`give-way.ts`).
 */
export function resolveInk({ luminances, palette, areas = [] }: ResolveInkInput): InkResolution {
  let darkTail = Infinity;
  let lightTail = -Infinity;
  for (const sample of [luminances, ...areas]) {
    const tails = measuredRange(sample);
    darkTail = Math.min(darkTail, tails.darkTail);
    lightTail = Math.max(lightTail, tails.lightTail);
  }
  const background = { darkTail, lightTail };

  let best: InkResolution | null = null;
  for (const c of inkCandidates(palette)) {
    const contrast = inkContrast(lum(c.ink), darkTail, lightTail);
    if (contrast >= MIN_INK_CONTRAST) {
      return { ink: c.ink, source: c.source, contrast, cleared: true, background };
    }
    if (best === null || contrast > best.contrast) {
      best = { ink: c.ink, source: c.source, contrast, cleared: false, background };
    }
  }
  // The tuned neutrals are always candidates, so there is a best one.
  return best!;
}

/**
 * The ink for words set on one flat colour (a plate's fill, `give-way.ts`): the first candidate,
 * in `inkCandidates` order, that reaches 4.5:1 against it, or null when none does.
 */
export function inkOnFlat(
  color: string,
  palette: readonly PaletteColor[],
): { ink: string; source: InkSource; contrast: number } | null {
  const l = lum(color);
  for (const c of inkCandidates(palette)) {
    const contrast = inkContrast(lum(c.ink), l, l);
    if (contrast >= MIN_INK_CONTRAST) return { ...c, contrast };
  }
  return null;
}

/**
 * The art-derived paper: OKLCH lightness 0.965 in the hue of the artwork's lightest palette
 * colour, its chroma at most 0.025 — the colour the legibility panel was made in (Phase 3), and the
 * fill a plate falls back to when no ink clears its dominant colour. The tuned dark clears about
 * 14:1 on it, so some ink always does (`inkOnFlat`).
 */
export function paperColor(palette: readonly PaletteColor[]): string {
  const lightest = [...palette].sort((p, q) => lum(q.color) - lum(p.color))[0];
  const base = lightest ? rgbToOklch(parseHex(lightest.color)) : { l: 1, c: 0, h: 0 };
  return oklchToHex({ l: PAPER.l, c: Math.min(base.c, PAPER.maxC), h: base.h });
}
