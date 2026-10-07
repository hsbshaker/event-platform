/**
 * Where the generated card's words start on its artwork, and in which ink (`card_compiler_v7`,
 * owner decision 2026-10-07).
 *
 * A generated card is an editable starting design. The artwork is kept whenever it has workable
 * space for the invitation's words, and the words are given a sensible starting treatment there:
 * no legibility panel, no slide or crop of the artwork, and no repaint merely because some of the
 * text misses a contrast check. Text over part of an illustrated object is not a failure, and a
 * quiet background — sky, brick, a wall, a gradient, a texture, the paper — is workable space.
 *
 * Pure and deterministic; no model is called (`spec.md §32 #20`). Inputs: the decoded artwork,
 * the shape, the generated text layer laid out in the layout's zone (`generatedTextLayer` with a
 * neutral ink: the ink does not change geometry) and its font metrics, and the artwork's palette.
 *
 * - **Groups.** The heading is the `title` and `invitationLine` boxes; the details are every other
 *   box (the facts). A group moves only vertically, as a whole; sizes and line breaks never change.
 * - **Inks.** The candidates of `inkCandidates`, in their preference order: the art palette by
 *   share, then a near-black and a near-white tuned toward the art's hue.
 * - **Placements.** Vertical shifts in steps of `SHIFT_STEP` card units: one shift for both groups
 *   (unsplit), or a shift per group with the details' at least the heading's (split), so the
 *   groups only move apart and never reorder or overlap. A group may take a shift only if every
 *   one of its line areas stays, at all four corners, inside the shape's text-safe area
 *   (`insideTextSafe`, which lies inside the canvas). The layout's own position is always allowed:
 *   it is what `layoutCard` placed inside the zone.
 * - **Readable coverage** of an ink at a placement: among the sampled artwork pixels inside the
 *   outline that fall in the shifted line areas (`textLineAreas`), the share whose WCAG contrast
 *   with the ink is at least 4.5:1. Every other pixel is sampled; the counts are kept per
 *   `COVERAGE_CELL`-unit cell with a prefix sum per row, so every placement is cheap to evaluate.
 * - **Choice.** If some ink reaches `COMFORTABLE` at the layout's own position, the words stay
 *   there. Otherwise the placement with the highest coverage wins; placements within `NEAR_TIE`
 *   of the best are told apart by the smallest total shift, and a split must beat the best
 *   unsplit placement by `SPLIT_MARGIN` to be chosen. At the chosen placement the ink is the first
 *   candidate in preference order within `INK_TOLERANCE` of the best ink there.
 * - **Workable** when the chosen ink's coverage is at least `WORKABLE`; an artwork whose fitted
 *   shape is not workable earns one repaint (`artwork.server.ts`).
 *
 * The stored shift is applied wherever the generated text layer is drawn (`card-text.server.ts`),
 * and only while the words then on the card, shifted, still sit inside the text-safe area
 * (`shiftFits`): the layout's own position is the one that always holds them.
 */

import {
  CARD_WIDTH,
  type CardRect,
  inkCandidates,
  type InkSource,
  MIN_INK_CONTRAST,
  type PaletteColor,
  pixelChannels,
  pixelLuminance,
} from "./ink";
import { relativeLuminance, parseHex } from "./color";
import { canvasOf, insideOutline, insideTextSafe, type CardShape } from "./shapes";
import { textLineAreas } from "./text-areas";
import type { TextBox } from "./text-box";
import type { FontMetricsResolver } from "./text/metrics";

/** At or above this coverage at the layout's own position, the words stay where the layout put them. */
export const COMFORTABLE = 0.95;
/** At or above this coverage, the artwork has workable space for the words. */
export const WORKABLE = 0.85;
/** Placements move the words in steps of this many card units. */
export const SHIFT_STEP = 10;
/** The side of a coverage cell, card units (a divisor of `SHIFT_STEP`). */
export const COVERAGE_CELL = 5;
/** Placements this close to the best are equally good: the smallest move wins among them. */
export const NEAR_TIE = 0.005;
/** A split placement must beat the best unsplit one by this much. */
export const SPLIT_MARGIN = 0.03;
/** An ink this close to the best at the chosen placement is preferred if it comes first. */
export const INK_TOLERANCE = 0.01;

/** The boxes of the heading group; every other box belongs to the details. */
export const HEADING_BOX_IDS: readonly string[] = ["title", "invitationLine"];

/** How far each group of the generated text moves from the layout's position, card units (down +). */
export interface TextShift {
  heading: number;
  details: number;
}

export const NO_SHIFT: Readonly<TextShift> = Object.freeze({ heading: 0, details: 0 });

export function isHeadingBox(box: Pick<TextBox, "id">): boolean {
  return HEADING_BOX_IDS.includes(box.id);
}

export function isNoShift(shift: TextShift | undefined): boolean {
  return shift === undefined || (shift.heading === 0 && shift.details === 0);
}

/** The line areas of each group, card units. */
export interface TextGroupAreas {
  heading: readonly CardRect[];
  details: readonly CardRect[];
}

/**
 * The areas behind each line of the text, by group (`textLineAreas`: each line's measured extent
 * plus its margin, clamped to `zone`).
 */
export function textGroupAreas(
  boxes: readonly TextBox[],
  metrics: FontMetricsResolver,
  zone: CardRect,
): TextGroupAreas {
  return {
    heading: textLineAreas(boxes.filter(isHeadingBox), metrics, zone),
    details: textLineAreas(
      boxes.filter((box) => !isHeadingBox(box)),
      metrics,
      zone,
    ),
  };
}

/** Whether every area, moved down by `shift`, keeps all four corners in the text-safe area. */
export function shiftAllowed(shape: CardShape, areas: readonly CardRect[], shift: number): boolean {
  if (shift === 0) return true;
  return areas.every((a) => {
    const top = a.y + shift;
    const bottom = top + a.height;
    const right = a.x + a.width;
    return (
      insideTextSafe(shape, a.x, top) &&
      insideTextSafe(shape, right, top) &&
      insideTextSafe(shape, a.x, bottom) &&
      insideTextSafe(shape, right, bottom)
    );
  });
}

/**
 * Whether `shift` is a placement the words in `areas` can take: the details move at least as far
 * as the heading, and each group stays inside the text-safe area.
 */
export function shiftFits(shape: CardShape, areas: TextGroupAreas, shift: TextShift): boolean {
  if (isNoShift(shift)) return true;
  if (!(shift.details >= shift.heading)) return false;
  return (
    shiftAllowed(shape, areas.heading, shift.heading) &&
    shiftAllowed(shape, areas.details, shift.details)
  );
}

/** The boxes moved by `shift`: heading boxes by `heading`, every other box by `details`. */
export function shiftTextBoxes(boxes: readonly TextBox[], shift: TextShift): TextBox[] {
  return boxes.map((box) => {
    const dy = isHeadingBox(box) ? shift.heading : shift.details;
    return dy === 0 ? box : { ...box, y: Math.round((box.y + dy) * 1000) / 1000 };
  });
}

export interface TextPlacement {
  /** `#RRGGBB`: the ink the generated card starts with. */
  ink: string;
  source: InkSource;
  /** Where the words start, relative to the layout's position. */
  shift: TextShift;
  /** The ink's readable coverage at the shift (0..1). */
  coverage: number;
  /** `coverage >= WORKABLE`. */
  workable: boolean;
}

export interface TextSpaceAreasInput {
  /** The artwork, RGB or RGBA, at the shape's proportion (alpha ignored: it is validated opaque). */
  pixels: ArrayLike<number>;
  width: number;
  height: number;
  shape: CardShape;
  /** Where the words sit at the layout's own position, by group. */
  areas: TextGroupAreas;
  /** The artwork's palette, largest share first (`paletteFromPixels`). */
  palette: readonly PaletteColor[];
}

export interface TextSpaceInput extends Omit<TextSpaceAreasInput, "areas"> {
  /** The layout's text zone for the shape (`zoneFor`). */
  zone: CardRect;
  /** The generated text layer in that zone (`generatedTextLayer`, any ink). */
  boxes: readonly TextBox[];
  metrics: FontMetricsResolver;
}

/** The starting placement and ink of the generated text layer on this artwork. */
export function placeText(input: TextSpaceInput): TextPlacement {
  const { boxes, metrics, zone, ...rest } = input;
  return placeTextInAreas({ ...rest, areas: textGroupAreas(boxes, metrics, zone) });
}

/** One group's line areas as cell runs: per cell row, the column ranges `[c0, c1)` it covers. */
interface GroupMask {
  rows: { row: number; runs: [number, number][] }[];
  empty: boolean;
}

function maskOf(areas: readonly CardRect[], rows: number, cols: number): GroupMask {
  const cells = new Uint8Array(rows * cols);
  for (const a of areas) {
    // The cells whose centres lie in the area, at least one.
    const c0 = Math.max(0, Math.round(a.x / COVERAGE_CELL));
    const c1 = Math.min(cols, Math.max(c0 + 1, Math.round((a.x + a.width) / COVERAGE_CELL)));
    const r0 = Math.max(0, Math.round(a.y / COVERAGE_CELL));
    const r1 = Math.min(rows, Math.max(r0 + 1, Math.round((a.y + a.height) / COVERAGE_CELL)));
    for (let r = r0; r < r1; r += 1) cells.fill(1, r * cols + c0, r * cols + c1);
  }
  const out: GroupMask["rows"] = [];
  for (let r = 0; r < rows; r += 1) {
    const runs: [number, number][] = [];
    let start = -1;
    for (let c = 0; c <= cols; c += 1) {
      const on = c < cols && cells[r * cols + c] === 1;
      if (on && start < 0) start = c;
      if (!on && start >= 0) {
        runs.push([start, c]);
        start = -1;
      }
    }
    if (runs.length > 0) out.push({ row: r, runs });
  }
  return { rows: out, empty: out.length === 0 };
}

/** The allowed shifts of a group's areas, ascending, `0` among them. */
function allowedShifts(shape: CardShape, areas: readonly CardRect[], limit: number): number[] {
  const out: number[] = [];
  for (let s = -limit; s <= limit; s += SHIFT_STEP) {
    if (shiftAllowed(shape, areas, s)) out.push(s);
  }
  return out;
}

interface Candidate {
  heading: number;
  details: number;
  /** The best ink's coverage. */
  coverage: number;
}

/** Best by coverage; within `NEAR_TIE` of it, the smallest total move, then upward first. */
function bestOf(candidates: readonly Candidate[]): Candidate | null {
  if (candidates.length === 0) return null;
  const top = Math.max(...candidates.map((c) => c.coverage));
  return [...candidates]
    .filter((c) => c.coverage >= top - NEAR_TIE)
    .sort(
      (a, b) =>
        Math.abs(a.heading) + Math.abs(a.details) - (Math.abs(b.heading) + Math.abs(b.details)) ||
        b.coverage - a.coverage ||
        a.heading - b.heading ||
        a.details - b.details,
    )[0];
}

/** `placeText` over line areas already split into groups. */
export function placeTextInAreas(input: TextSpaceAreasInput): TextPlacement {
  const { pixels, width, height, shape, areas, palette } = input;
  const channels = pixelChannels(pixels, width, height);
  const canvas = canvasOf(shape);
  const scale = width / CARD_WIDTH;
  if (Math.abs(height / scale - canvas.height) > 2) {
    throw new Error(`artwork ${width}×${height} is not the ${shape} card's proportion`);
  }

  const inks = inkCandidates(palette);
  // A pixel of luminance L is readable behind ink luminance I when (max + .05) / (min + .05) ≥ 4.5.
  const darkBelow: number[] = [];
  const lightAbove: number[] = [];
  for (const { ink } of inks) {
    const l = relativeLuminance(parseHex(ink));
    darkBelow.push((l + 0.05) / MIN_INK_CONTRAST - 0.05);
    lightAbove.push(MIN_INK_CONTRAST * (l + 0.05) - 0.05);
  }

  // Counts per cell: sampled pixels inside the outline, and the readable ones per ink.
  const cols = Math.ceil(CARD_WIDTH / COVERAGE_CELL);
  const rows = Math.ceil(canvas.height / COVERAGE_CELL);
  const total = new Float64Array(rows * cols);
  const readable = inks.map(() => new Float64Array(rows * cols));
  for (let py = 0; py < height; py += 2) {
    const cy = (py + 0.5) / scale;
    const row = Math.min(rows - 1, Math.floor(cy / COVERAGE_CELL));
    for (let px = 0; px < width; px += 2) {
      const cx = (px + 0.5) / scale;
      if (!insideOutline(shape, cx, cy)) continue;
      const cell = row * cols + Math.min(cols - 1, Math.floor(cx / COVERAGE_CELL));
      const i = (py * width + px) * channels;
      const l = pixelLuminance(pixels[i], pixels[i + 1], pixels[i + 2]);
      total[cell] += 1;
      for (let k = 0; k < inks.length; k += 1) {
        if (l <= darkBelow[k] || l >= lightAbove[k]) readable[k][cell] += 1;
      }
    }
  }
  // Prefix sums along each row: sum of cells [c0, c1) is P[c1] − P[c0].
  const prefix = (counts: Float64Array): Float64Array => {
    const p = new Float64Array(rows * (cols + 1));
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        p[r * (cols + 1) + c + 1] = p[r * (cols + 1) + c] + counts[r * cols + c];
      }
    }
    return p;
  };
  const totalP = prefix(total);
  const readableP = readable.map(prefix);

  const masks = {
    heading: maskOf(areas.heading, rows, cols),
    details: maskOf(areas.details, rows, cols),
  };
  if (masks.heading.empty && masks.details.empty) {
    throw new Error("placeText: the text has no line areas to measure");
  }
  const sumAt = (p: Float64Array, mask: GroupMask, shift: number): number => {
    const dr = shift / COVERAGE_CELL;
    let sum = 0;
    for (const { row, runs } of mask.rows) {
      const r = row + dr;
      if (r < 0 || r >= rows) continue;
      for (const [c0, c1] of runs) sum += p[r * (cols + 1) + c1] - p[r * (cols + 1) + c0];
    }
    return sum;
  };

  // Each group's allowed shifts, with its counts at each: [total, readable per ink].
  type Counts = { total: number; readable: number[] };
  const countsOf = (mask: GroupMask, shifts: readonly number[]): Map<number, Counts> =>
    new Map(
      shifts.map((s) => [
        s,
        { total: sumAt(totalP, mask, s), readable: readableP.map((p) => sumAt(p, mask, s)) },
      ]),
    );
  const limit = Math.ceil(canvas.height / SHIFT_STEP) * SHIFT_STEP;
  const headingShifts = allowedShifts(shape, areas.heading, limit);
  const detailShifts = allowedShifts(shape, areas.details, limit);
  const heading = countsOf(masks.heading, headingShifts);
  const details = countsOf(masks.details, detailShifts);

  /** Coverage of every ink at (h, d), or null when nothing is measured there. */
  const coverages = (h: number, d: number): number[] | null => {
    const a = heading.get(h);
    const b = details.get(d);
    if (!a || !b) return null;
    const t = a.total + b.total;
    if (t === 0) return null;
    return inks.map((_, k) => (a.readable[k] + b.readable[k]) / t);
  };
  const best = (h: number, d: number): number | null => {
    const c = coverages(h, d);
    return c === null ? null : Math.max(...c);
  };

  const origin = coverages(0, 0);
  if (origin === null) {
    // Measuring nothing must never read as readable: the zone lies inside the outline.
    throw new Error("placeText: no artwork pixels behind the text at the layout's position");
  }

  let chosen: { heading: number; details: number };
  if (Math.max(...origin) >= COMFORTABLE) {
    chosen = { heading: 0, details: 0 };
  } else {
    const unsplit: Candidate[] = [];
    for (const s of headingShifts) {
      if (!details.has(s)) continue;
      const c = best(s, s);
      if (c !== null) unsplit.push({ heading: s, details: s, coverage: c });
    }
    // A group with no lines cannot move apart from the other: only unsplit placements then.
    const split: Candidate[] = [];
    if (!masks.heading.empty && !masks.details.empty) {
      for (const h of headingShifts) {
        for (const d of detailShifts) {
          if (d <= h) continue;
          const c = best(h, d);
          if (c !== null) split.push({ heading: h, details: d, coverage: c });
        }
      }
    }
    const u = bestOf(unsplit);
    const s = bestOf(split);
    // `unsplit` always holds (0, 0), which `origin` measured.
    const topUnsplit = Math.max(...unsplit.map((c) => c.coverage));
    chosen = s !== null && s.coverage >= topUnsplit + SPLIT_MARGIN ? s : u!;
  }

  const at = coverages(chosen.heading, chosen.details)!;
  const top = Math.max(...at);
  // The first candidate within the tolerance of the best — an art colour over a neutral — unless
  // that one falls short of workable while the best does not: workable space is judged on the best
  // ink, so a preference for harmony never costs a repaint.
  const preferred = at.findIndex((c) => c >= top - INK_TOLERANCE);
  const k = at[preferred] < WORKABLE && top >= WORKABLE ? at.indexOf(top) : preferred;
  const shift = { heading: chosen.heading + 0, details: chosen.details + 0 };
  return {
    ink: inks[k].ink,
    source: inks[k].source,
    shift,
    coverage: at[k],
    workable: at[k] >= WORKABLE,
  };
}
