/**
 * Where the generated card's text sits, line by line (`card_compiler_v4`, owner decision
 * 2026-10-05): the areas whose background the ink is judged against, beside the whole zone
 * (`ink.ts`, `resolveInk`'s `areas`).
 *
 * Pure and deterministic. Each line is measured exactly as `layoutCard` measured it to break it —
 * the box's face, size, letter spacing and case, through the same `FontMetrics.measure` — so the
 * area covers the line as the renderer sets it: its measured width placed by the box's `align`
 * within the box's width, one line height (`size × lineHeight`) tall at `y + i × size ×
 * lineHeight`. No model is called and nothing here reads pixels.
 */

import type { CardRect } from "./ink";
import type { TextBox } from "./text-box";
import type { FontMetricsResolver } from "./text/metrics";

/**
 * The small margin around each line, as a share of the line's height (`size × lineHeight`), on
 * every side.
 *
 * A quarter of a line: the letters' ink is not confined to the line box — at the title's line
 * height of 1.05 ascenders, accents and descenders reach about 0.1–0.2 em past it, and a display
 * face's swashes overhang its advance width — and a reader judges a letter against the ground just
 * around it, not only the ground between its strokes. 0.25 × 1.05 em is about 0.26 em on the
 * title, 0.25 × 1.45 em about 0.36 em on a detail line: enough to take in that halo, and well short
 * of the zone's empty edges, which `card_compiler_v3`'s full-width strips wrongly counted.
 */
export const LINE_AREA_MARGIN = 0.25;

function clampTo(rect: CardRect, zone: CardRect): CardRect | null {
  const x0 = Math.max(rect.x, zone.x);
  const y0 = Math.max(rect.y, zone.y);
  const x1 = Math.min(rect.x + rect.width, zone.x + zone.width);
  const y1 = Math.min(rect.y + rect.height, zone.y + zone.height);
  if (!(x1 > x0 && y1 > y0)) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * One rectangle per non-empty line of `boxes`, in card units: the line's measured extent, padded
 * by `LINE_AREA_MARGIN` of its height on every side and clamped to `zone` (the text zone the
 * layout was made for; the zone's own measure covers it whole). A line, or a box, with no text
 * gives no area.
 *
 * For the generated text layer only, whose boxes `layoutCard` sets upright: a rotated box throws,
 * because its lines are not where these rectangles say.
 */
export function textLineAreas(
  boxes: readonly TextBox[],
  metrics: FontMetricsResolver,
  zone: CardRect,
): CardRect[] {
  const areas: CardRect[] = [];
  for (const box of boxes) {
    if (box.lines.length === 0) continue;
    if (box.rotation !== 0) {
      throw new Error(`textLineAreas: box ${box.id} is rotated; the generated layer never is`);
    }
    const face = metrics(box.font);
    const style = { size: box.size, letterSpacingEm: box.letterSpacing, textCase: box.textCase };
    const lineHeight = box.size * box.lineHeight;
    const margin = LINE_AREA_MARGIN * lineHeight;
    box.lines.forEach((line, i) => {
      if (line.trim() === "") return;
      const width = face.measure(line, style);
      // A line wider than its box is start-aligned, as CSS sets it (CSS Text 3 §6.1).
      const free = Math.max(0, box.width - width);
      const x =
        box.align === "left" ? box.x : box.align === "right" ? box.x + free : box.x + free / 2;
      const area = clampTo(
        {
          x: x - margin,
          y: box.y + i * lineHeight - margin,
          width: width + 2 * margin,
          height: lineHeight + 2 * margin,
        },
        zone,
      );
      if (area) areas.push(area);
    });
  }
  return areas;
}
