/**
 * The art gives way (`card_layouts_v4`, `card_compiler_v5`; owner decisions 2026-10-06;
 * `docs/card-system.md §4.2`).
 *
 * Runs after the repaints, for each zone whose ink does not clear 4.5:1 on the artwork as painted.
 * Nothing here lays paper over the picture. The layout's `giveWay` decides:
 *
 * - **Words at an edge of the picture** (`art-top`, `art-bottom`). The art moves out of their way:
 *   1. **Crop** — only on the layout's `cropShapes` (`art-bottom` on rectangle, rounded rectangle
 *      and square, where it loses only ground, never a subject's head): the art scaled by each of
 *      `CROP_SCALES` about the midpoint of the words' edge, still full bleed. The first scale at
 *      which an ink clears 4.5:1 on the art as drawn — the whole zone and behind each line, as on
 *      the art as painted — is kept.
 *   2. **Plate** — otherwise: the art and the card's own outline scaled together by each of
 *      `PLATE_SCALES` about the midpoint of the picture's outer edge, and cut straight at the text
 *      zone's edge plus `cutPadding`. Everything on the words' side of the cut is a flat fill. The
 *      largest scale whose cut hides only even background — at least `EVEN_SHARE` of the hidden
 *      pixels within `EVEN_DELTA_E` (OKLab) of the hidden area's dominant colour — is kept;
 *      otherwise the smallest. The fill is that dominant colour when an ink clears 4.5:1 on it,
 *      otherwise the art-derived paper (`paperColor`). The words sit on the fill alone, so 4.5:1
 *      holds by construction; at scale 1 the plate is a plain crop at the cut.
 * - **Words in the middle** (`framed`, `corners`, `atmosphere`): nothing moves and nothing is
 *   painted behind them. The ink is the candidate with the highest contrast, and the zone is
 *   stored as low contrast for the host's hint.
 *
 * Pure and deterministic over decoded pixels; no model is called (`spec.md §32 #20`).
 */

import type { CardPlacement } from "./card-data";
import { formatHex, rgbToOklab, type Oklab } from "./color";
import {
  CARD_WIDTH,
  inkOnFlat,
  paperColor,
  resolveInk,
  sampleZoneLuminance,
  type CardRect,
  type InkResolution,
  type InkSource,
  type PaletteColor,
} from "./ink";
import { CARD_LAYOUTS, zoneFor, type CardLayoutId, type GiveWaySpec } from "./layouts";
import { canvasOf, insideOutline, type CardShape } from "./shapes";

/** Crop scales, tried in order: 8% and 16% larger (owner decision 2026-10-06). */
export const CROP_SCALES: readonly number[] = [1.08, 1.16];

/** Plate scales, largest first; the last is used when no cut hides only even background. */
export const PLATE_SCALES: readonly number[] = [1, 0.9, 0.8, 0.7, 0.6];

/** The share of hidden pixels that must be within `EVEN_DELTA_E` of the dominant colour. */
export const EVEN_SHARE = 0.97;

/**
 * How far, in OKLab (Euclidean, L 0–1), a hidden pixel may be from the hidden area's dominant
 * colour and still count as even background. Calibrated on a contact sheet of synthetic artwork
 * (paper grain, a watercolour wash, a sky gradient, subjects and ground crossing the cut, busy
 * foliage) and the showcase cards, no model call (`docs/CHANGELOG-v7.md`, "The art gives way"):
 * 97% of the hidden pixels of paper grain (±4 levels) lay within 0.012 of the dominant colour, of a
 * wash within 0.02, of the pale end of a sky gradient within 0.047; a subject or ground crossing the
 * cut put them 0.09–0.4 away. 0.05 accepts the first three and refuses the last, and keeps the step
 * at the cut — the fill against what the art shows just above it — near what reads as an edge on a
 * quiet ground (about 2.5 just-noticeable differences of ~0.02).
 */
export const EVEN_DELTA_E = 0.05;

/** Rectangles are stored to a thousandth of a card unit, free of float noise. */
function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

/** The canvas scaled by `s` about the card-unit point `(ax, ay)`. */
export function scaledCanvas(shape: CardShape, s: number, ax: number, ay: number): CardRect {
  const { width: w, height: h } = canvasOf(shape);
  return {
    x: round3(ax - ax * s),
    y: round3(ay - ay * s),
    width: round3(w * s),
    height: round3(h * s),
  };
}

/** The crop's art rectangle: scaled about the midpoint of the words' edge (the card's top). */
export function cropRect(
  spec: Extract<GiveWaySpec, { kind: "edge" }>,
  shape: CardShape,
  s: number,
): CardRect {
  const { width: w, height: h } = canvasOf(shape);
  // The words' edge is the one opposite the picture.
  return scaledCanvas(shape, s, w / 2, spec.picture === "bottom" ? 0 : h);
}

/** The plate's art rectangle: scaled about the midpoint of the picture's outer edge. */
export function plateRect(
  spec: Extract<GiveWaySpec, { kind: "edge" }>,
  shape: CardShape,
  s: number,
): CardRect {
  const { width: w, height: h } = canvasOf(shape);
  return scaledCanvas(shape, s, w / 2, spec.picture === "top" ? 0 : h);
}

/** The plate's cut: the text zone's edge facing the picture, `cutPadding` toward the picture. */
export function plateCut(
  spec: Extract<GiveWaySpec, { kind: "edge" }>,
  zone: CardRect,
): { y: number; keep: "above" | "below" } {
  return spec.picture === "top"
    ? { y: round3(zone.y - spec.cutPadding), keep: "above" }
    : { y: round3(zone.y + zone.height + spec.cutPadding), keep: "below" };
}

/* ---------------------------------------------------------------- evenness */

/** sRGB 8-bit to linear, by table. */
const LINEAR = Array.from({ length: 256 }, (_, v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});

const BIN_BITS = 5;
const BIN_SHIFT = 8 - BIN_BITS;
const BIN_SIDE = 1 << BIN_BITS;

/**
 * Every pixel a plate at any of `PLATE_SCALES` could hide, read once. What a plate hides depends on
 * a pixel's row alone (and the outline), and a smaller scale hides a subset of what a larger one
 * does — rows further from the cut — so the largest scale's hidden rows hold every other scale's,
 * and each scale's hidden pixels are one contiguous run of them, in row order. Every pixel of
 * those rows inside the outline is read: a sparser read can alias a fine texture into a flat one.
 */
interface HideableRows {
  /** Row `r` (raster) of the hideable rows starts at `rowStart[r - firstRow]`. */
  firstRow: number;
  rowStart: Int32Array;
  /** Per pixel: its colour-histogram bin, its sRGB channels and its OKLab. */
  bin: Uint16Array;
  rgb: Uint8Array;
  lab: Float32Array;
}

/** Whether a plate at scale `s` hides the artwork row whose centre is at card-unit `y`. */
function hidesRow(
  spec: Extract<GiveWaySpec, { kind: "edge" }>,
  canvasHeight: number,
  cutY: number,
  s: number,
  y: number,
): boolean {
  // Where the plate draws this row of the artwork: scaled about the picture's outer edge.
  return spec.picture === "top" ? y * s > cutY : canvasHeight - (canvasHeight - y) * s < cutY;
}

function hideableRows(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  shape: CardShape,
  spec: Extract<GiveWaySpec, { kind: "edge" }>,
  cutY: number,
): HideableRows {
  const channels = pixels.length === width * height * 4 ? 4 : 3;
  const scale = width / CARD_WIDTH;
  const canvasHeight = canvasOf(shape).height;
  const largest = Math.max(...PLATE_SCALES);
  const rows: number[] = [];
  for (let py = 0; py < height; py += 1) {
    if (hidesRow(spec, canvasHeight, cutY, largest, (py + 0.5) / scale)) rows.push(py);
  }
  // The hidden rows at one scale are contiguous: the rows beyond a line on one side of the cut.
  const firstRow = rows.length ? rows[0] : 0;
  const rowCount = rows.length;
  const rowStart = new Int32Array(rowCount + 1);
  const inside = (px: number, py: number) =>
    insideOutline(shape, (px + 0.5) / scale, (py + 0.5) / scale);
  let count = 0;
  for (let r = 0; r < rowCount; r += 1) {
    for (let px = 0; px < width; px += 1) if (inside(px, firstRow + r)) count += 1;
  }
  const bin = new Uint16Array(count);
  const rgb = new Uint8Array(count * 3);
  const lab = new Float32Array(count * 3);
  let k = 0;
  for (let r = 0; r < rowCount; r += 1) {
    rowStart[r] = k;
    const py = firstRow + r;
    for (let px = 0; px < width; px += 1) {
      if (!inside(px, py)) continue;
      const i = (py * width + px) * channels;
      const R = pixels[i];
      const G = pixels[i + 1];
      const B = pixels[i + 2];
      bin[k] =
        ((R >> BIN_SHIFT) << (2 * BIN_BITS)) | ((G >> BIN_SHIFT) << BIN_BITS) | (B >> BIN_SHIFT);
      rgb[k * 3] = R;
      rgb[k * 3 + 1] = G;
      rgb[k * 3 + 2] = B;
      const lr = LINEAR[R];
      const lg = LINEAR[G];
      const lb = LINEAR[B];
      const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
      const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
      const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
      lab[k * 3] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
      lab[k * 3 + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
      lab[k * 3 + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
      k += 1;
    }
  }
  rowStart[rowCount] = k;
  return { firstRow, rowStart, bin, rgb, lab };
}

/** What a plate's cut hides, and how even it is. */
export interface HiddenArea {
  /** Hidden pixels inside the outline. */
  pixels: number;
  /** The hidden area's dominant colour, `#RRGGBB`; null when nothing is hidden. */
  dominant: string | null;
  /** The share of hidden pixels within `EVEN_DELTA_E` of the dominant colour (1 when none). */
  evenness: number;
}

/**
 * The dominant colour of pixels `from`–`to` of `rows`: in a 32-level-per-channel colour histogram,
 * the bin whose 3 × 3 × 3 neighbourhood holds the most pixels (ties to the lowest bin index), and
 * the mean colour of the pixels in that neighbourhood. The neighbourhood keeps a flat colour whose
 * noise straddles a bin boundary from splitting its count. Deterministic.
 */
function dominantOf(rows: HideableRows, from: number, to: number): string {
  const count = new Uint32Array(BIN_SIDE ** 3);
  for (let k = from; k < to; k += 1) count[rows.bin[k]] += 1;
  let best = -1;
  let bestCount = -1;
  for (let bin = 0; bin < count.length; bin += 1) {
    if (count[bin] === 0) continue;
    const r = bin >> (2 * BIN_BITS);
    const g = (bin >> BIN_BITS) & (BIN_SIDE - 1);
    const b = bin & (BIN_SIDE - 1);
    let sum = 0;
    for (let rr = Math.max(0, r - 1); rr <= Math.min(BIN_SIDE - 1, r + 1); rr += 1) {
      for (let gg = Math.max(0, g - 1); gg <= Math.min(BIN_SIDE - 1, g + 1); gg += 1) {
        for (let bb = Math.max(0, b - 1); bb <= Math.min(BIN_SIDE - 1, b + 1); bb += 1) {
          sum += count[(rr << (2 * BIN_BITS)) | (gg << BIN_BITS) | bb];
        }
      }
    }
    if (sum > bestCount) {
      bestCount = sum;
      best = bin;
    }
  }
  const br = best >> (2 * BIN_BITS);
  const bg = (best >> BIN_BITS) & (BIN_SIDE - 1);
  const bb = best & (BIN_SIDE - 1);
  let n = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (let k = from; k < to; k += 1) {
    const bin = rows.bin[k];
    if (
      Math.abs((bin >> (2 * BIN_BITS)) - br) <= 1 &&
      Math.abs(((bin >> BIN_BITS) & (BIN_SIDE - 1)) - bg) <= 1 &&
      Math.abs((bin & (BIN_SIDE - 1)) - bb) <= 1
    ) {
      n += 1;
      sr += rows.rgb[k * 3];
      sg += rows.rgb[k * 3 + 1];
      sb += rows.rgb[k * 3 + 2];
    }
  }
  return formatHex({ r: sr / n, g: sg / n, b: sb / n });
}

/** What a plate at scale `s` hides (`HideableRows`), its dominant colour and its evenness. */
function hiddenArea(
  rows: HideableRows,
  spec: Extract<GiveWaySpec, { kind: "edge" }>,
  shape: CardShape,
  width: number,
  cutY: number,
  s: number,
): HiddenArea {
  const scale = width / CARD_WIDTH;
  const canvasHeight = canvasOf(shape).height;
  const rowCount = rows.rowStart.length - 1;
  // The contiguous run of hideable rows this scale hides.
  let r0 = rowCount;
  let r1 = 0;
  for (let r = 0; r < rowCount; r += 1) {
    if (hidesRow(spec, canvasHeight, cutY, s, (rows.firstRow + r + 0.5) / scale)) {
      r0 = Math.min(r0, r);
      r1 = Math.max(r1, r + 1);
    }
  }
  const from = r0 < r1 ? rows.rowStart[r0] : 0;
  const to = r0 < r1 ? rows.rowStart[r1] : 0;
  if (to <= from) return { pixels: 0, dominant: null, evenness: 1 };
  const dominant = dominantOf(rows, from, to);
  const d: Oklab = rgbToOklab({
    r: parseInt(dominant.slice(1, 3), 16),
    g: parseInt(dominant.slice(3, 5), 16),
    b: parseInt(dominant.slice(5, 7), 16),
  });
  const limit = EVEN_DELTA_E * EVEN_DELTA_E;
  let within = 0;
  for (let k = from; k < to; k += 1) {
    const dl = rows.lab[k * 3] - d.l;
    const da = rows.lab[k * 3 + 1] - d.a;
    const db = rows.lab[k * 3 + 2] - d.b;
    if (dl * dl + da * da + db * db <= limit) within += 1;
  }
  return { pixels: to - from, dominant, evenness: within / (to - from) };
}

/* ---------------------------------------------------------------- resolution */

export interface GiveWayInput {
  /** The decoded artwork, RGB or RGBA, at the shape's proportion. */
  pixels: ArrayLike<number>;
  width: number;
  height: number;
  layout: CardLayoutId;
  shape: CardShape;
  /** The artwork's palette (`paletteFromPixels`). */
  palette: readonly PaletteColor[];
  /**
   * The areas behind each line of the generated text (`textLineAreas`), or null to judge the
   * whole zone alone.
   */
  areas: readonly CardRect[] | null;
}

/** One zone's legibility on one shape. */
export type ZoneLegibility =
  /** An ink clears 4.5:1 on the artwork as painted: nothing gives way. */
  | { kind: "clear"; ink: InkResolution }
  /** A crop at `scale` lets an ink clear 4.5:1. */
  | { kind: "crop"; ink: InkResolution; scale: number; placement: CardPlacement }
  /** A plate at `scale`; the words sit on its fill. */
  | {
      kind: "plate";
      ink: string;
      source: InkSource;
      contrast: number;
      scale: number;
      placement: CardPlacement;
      /** Whether the fill is the hidden area's dominant colour, or the paper. */
      fill: "dominant" | "paper";
      /** The chosen cut's evenness (`HiddenArea.evenness`). */
      evenness: number;
    }
  /** Centred words: the best ink, below 4.5:1, with nothing behind it. */
  | { kind: "low-contrast"; ink: InkResolution };

/** The zone's ink on the artwork drawn at `art` (the canvas when absent). */
function inkOn(input: GiveWayInput, zone: CardRect, art?: CardRect): InkResolution {
  const { pixels, width, height, shape, palette, areas } = input;
  const inside = (x: number, y: number) => insideOutline(shape, x, y);
  const luminances = sampleZoneLuminance(pixels, width, height, zone, inside, art);
  const sampled = (areas ?? []).map((rect) =>
    sampleZoneLuminance(pixels, width, height, rect, inside, art),
  );
  return resolveInk({ luminances, areas: sampled, palette });
}

/**
 * Choose the plate's scale (`PLATE_SCALES`, largest first): the first whose cut hides only even
 * background, else the last. Returns the scale and what its cut hides.
 */
export function choosePlate(
  input: Pick<GiveWayInput, "pixels" | "width" | "height" | "layout" | "shape">,
): { scale: number; cut: { y: number; keep: "above" | "below" }; hidden: HiddenArea } {
  const { pixels, width, height, layout, shape } = input;
  const spec = CARD_LAYOUTS[layout].giveWay;
  if (spec.kind !== "edge") throw new Error(`choosePlate: ${layout} does not take a plate`);
  const cut = plateCut(spec, zoneFor(layout, shape));
  const rows = hideableRows(pixels, width, height, shape, spec, cut.y);
  let last: { scale: number; hidden: HiddenArea } | null = null;
  for (const scale of PLATE_SCALES) {
    const hidden = hiddenArea(rows, spec, shape, width, cut.y, scale);
    last = { scale, hidden };
    if (hidden.evenness >= EVEN_SHARE) break;
  }
  return { scale: last!.scale, cut, hidden: last!.hidden };
}

/**
 * The zone's ink, and what gives way when no ink clears 4.5:1 on the artwork as painted
 * (`card_layouts_v4`). See the module comment for the rules.
 */
export function resolveZoneLegibility(input: GiveWayInput): ZoneLegibility {
  const { layout, shape, palette } = input;
  const zone = zoneFor(layout, shape);
  const painted = inkOn(input, zone);
  if (painted.cleared) return { kind: "clear", ink: painted };

  const spec = CARD_LAYOUTS[layout].giveWay;
  if (spec.kind === "centred") return { kind: "low-contrast", ink: painted };

  if (spec.cropShapes.includes(shape)) {
    for (const scale of CROP_SCALES) {
      const art = cropRect(spec, shape, scale);
      const ink = inkOn(input, zone, art);
      if (ink.cleared) {
        return { kind: "crop", ink, scale, placement: { kind: "crop", art } };
      }
    }
  }

  const { scale, cut, hidden } = choosePlate(input);
  const onDominant = hidden.dominant ? inkOnFlat(hidden.dominant, palette) : null;
  const fill = onDominant ? hidden.dominant! : paperColor(palette);
  const ink = onDominant ?? inkOnFlat(fill, palette);
  // The tuned dark clears about 14:1 on the paper; a loud failure should the constants change.
  if (!ink) throw new Error(`No ink reaches 4.5:1 on the plate's fill ${fill}`);
  return {
    kind: "plate",
    ink: ink.ink,
    source: ink.source,
    contrast: ink.contrast,
    scale,
    placement: { kind: "plate", art: plateRect(spec, shape, scale), cut, fill },
    fill: onDominant ? "dominant" : "paper",
    evenness: hidden.evenness,
  };
}
