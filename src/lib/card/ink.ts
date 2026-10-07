/**
 * The ink candidates for the generated card and the artwork measures they come from
 * (`docs/card-system.md §4.2`).
 *
 * Pure functions over raw, already-decoded RGB(A) pixel buffers: no image decoding happens here.
 * The buffer is the artwork at the card's proportion; card units map onto it uniformly
 * (`CARD_WIDTH` card units across the buffer's width).
 *
 * The candidates, in preference order: the artwork's own palette by share (`paletteFromPixels`),
 * then a near-black and a near-white tuned toward the artwork's hue (`inkCandidates`). Which one a
 * card starts with, and where its words start, is `text-space.ts`'s choice (`card_compiler_v7`).
 *
 * `card_compiler_v2`–`v6` resolved the ink here (`resolveInk`): against the zone's measured
 * luminance range (the nearest-tail rule of Phase 3), from `card_compiler_v4` widened by the
 * range behind each line of text, and with an art-derived paper panel behind the zone when no
 * candidate cleared 4.5:1. The owner's decision of 2026-10-07 retired that: a generated card is an
 * editable starting design, and no new card gets a panel. Panels persisted before it are still
 * read and drawn exactly as stored (`card-record.server.ts` `zoneInk`, `card-data.ts`); they are
 * never re-resolved (`spec.md §32 #27`).
 *
 * Contrast is WCAG 2.x (`color.ts`); OKLCH is only the space the tuned neutrals are built in. No
 * step here calls a model.
 */

import { type Oklch, type Rgb, oklchToHex, parseHex, relativeLuminance, rgbToOklch } from "./color";

/** The card's width in card units; every proportion is 1000 units wide (`card-system.md §2.1`). */
export const CARD_WIDTH = 1000;

/**
 * WCAG 2.x AA for normal text: an artwork pixel counts as readable behind an ink at this contrast
 * or more (`text-space.ts`).
 */
export const MIN_INK_CONTRAST = 4.5;

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

/**
 * The channel count of an RGB or RGBA buffer of `width` × `height` pixels. Throws for any other
 * length: a buffer that is neither must never be read as one.
 */
export function pixelChannels(pixels: ArrayLike<number>, width: number, height: number): 3 | 4 {
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

/** WCAG relative luminance of one 8-bit sRGB pixel (`color.ts` `relativeLuminance`, tabulated). */
export function pixelLuminance(r: number, g: number, b: number): number {
  return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
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
  const channels = pixelChannels(pixels, width, height);

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

/* ---------------------------------------------------------------- ink candidates */

/** The tuned neutrals (Phase 3 values). */
const TUNED_DARK = { l: 0.24, c: 0.03 };
const TUNED_LIGHT = { l: 0.98, c: 0.012 };
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

export interface InkCandidate {
  /** `#RRGGBB`. */
  ink: string;
  /** Where the ink came from: the artwork's palette, or a neutral tuned toward its hue. */
  source: InkSource;
}

/**
 * The inks a generated card may start with, in preference order (`docs/card-system.md §4.2`): the
 * artwork's palette colours by share, then a near-black and a near-white tuned toward the
 * artwork's hue. The candidates and their order are those every compiler since Phase 3 tried;
 * only how one is chosen has changed (`text-space.ts`, `card_compiler_v7`).
 */
export function inkCandidates(palette: readonly PaletteColor[]): InkCandidate[] {
  const hue = artHue(palette);
  return [
    ...palette.map((p) => ({ ink: p.color.toUpperCase(), source: "art" as const })),
    { ink: tuned(TUNED_DARK, hue), source: "tuned-dark" },
    { ink: tuned(TUNED_LIGHT, hue), source: "tuned-light" },
  ];
}
