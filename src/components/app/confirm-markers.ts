import type { CardSlotId } from "@/lib/card/slots";
import type { TextBox } from "@/lib/card/text-box";

/**
 * Where the "needs confirming" outlines sit over a card, and what the legend says
 * (`spec.md §31` — Creation Mode: facts the prompt states and placeholders "marked as needing
 * confirmation"). Pure geometry in percentages of the card's canvas, so the overlay scales with the
 * card at any size; reads the boxes' stored geometry and never changes it.
 *
 * Vertically adjacent unrotated boxes share one outline around the run; a rotated box keeps its
 * own, since a straight outline would not fit it.
 */

export interface MarkerRect {
  /** Percent of the card's width / height. */
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
}

export interface MarkerGroup {
  rect: MarkerRect;
  /** The boxes the outline surrounds, top to bottom. */
  ids: string[];
}

const DETAIL_NAME: Readonly<Record<CardSlotId, string>> = {
  title: "Title",
  invitationLine: "Invitation line",
  babyName: "Baby's name",
  hosts: "Hosts",
  date: "Date",
  time: "Time",
  venue: "Venue",
  rsvpBy: "RSVP-by date",
};

/** Card units of padding around the words, so an outline never touches a glyph. */
export const MARKER_PADDING = 8;

/** The detail a box shows, as a host would name it; a custom box is just "Text". */
export function detailName(box: TextBox): string {
  return box.source.kind === "custom" ? "Text" : DETAIL_NAME[box.source.slot];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

interface Extent {
  x: number;
  y: number;
  width: number;
  height: number;
  lineHeight: number;
}

function extentOf(box: TextBox): Extent {
  const lineHeight = box.size * box.lineHeight;
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.lines.length * lineHeight,
    lineHeight,
  };
}

function percentRect(
  extent: Pick<Extent, "x" | "y" | "width" | "height">,
  canvas: { width: number; height: number },
  rotation: number,
): MarkerRect {
  // Padded, then clamped inside the card.
  const left = Math.max(0, extent.x - MARKER_PADDING);
  const top = Math.max(0, extent.y - MARKER_PADDING);
  const right = Math.min(canvas.width, extent.x + extent.width + MARKER_PADDING);
  const bottom = Math.min(canvas.height, extent.y + extent.height + MARKER_PADDING);
  return {
    left: round((left / canvas.width) * 100),
    top: round((top / canvas.height) * 100),
    width: round(((right - left) / canvas.width) * 100),
    height: round(((bottom - top) / canvas.height) * 100),
    rotation,
  };
}

/** The boxes to mark: the unconfirmed ones that show words, in card order (top to bottom). */
function targetsOf(boxes: readonly TextBox[], unconfirmed: readonly string[]): TextBox[] {
  const marked = new Set(unconfirmed);
  return boxes
    .filter((box) => marked.has(box.id) && box.lines.length > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * One outline per run of vertically adjacent unrotated boxes (overlapping, or within half a line
 * height), and one per rotated box.
 */
export function markerGroups(
  boxes: readonly TextBox[],
  unconfirmed: readonly string[],
  canvas: { width: number; height: number },
): MarkerGroup[] {
  const groups: MarkerGroup[] = [];
  let run: { extent: Extent; ids: string[] } | null = null;
  const flush = () => {
    if (run) groups.push({ rect: percentRect(run.extent, canvas, 0), ids: run.ids });
    run = null;
  };
  for (const box of targetsOf(boxes, unconfirmed)) {
    const extent = extentOf(box);
    if (box.rotation !== 0) {
      flush();
      groups.push({ rect: percentRect(extent, canvas, box.rotation), ids: [box.id] });
      continue;
    }
    if (
      run &&
      extent.y <=
        run.extent.y + run.extent.height + Math.max(run.extent.lineHeight, extent.lineHeight) / 2
    ) {
      const left = Math.min(run.extent.x, extent.x);
      const right = Math.max(run.extent.x + run.extent.width, extent.x + extent.width);
      const bottom = Math.max(run.extent.y + run.extent.height, extent.y + extent.height);
      run = {
        extent: {
          x: left,
          y: run.extent.y,
          width: right - left,
          height: bottom - run.extent.y,
          lineHeight: Math.max(run.extent.lineHeight, extent.lineHeight),
        },
        ids: [...run.ids, box.id],
      };
    } else {
      flush();
      run = { extent, ids: [box.id] };
    }
  }
  flush();
  return groups;
}

/** A detail's name inside a sentence: lower case, except an acronym such as "RSVP-by date". */
function inSentence(name: string): string {
  return /^[A-Z]{2,}/.test(name) ? name : name.toLowerCase();
}

/**
 * The legend under the card, or null when nothing needs confirming: the unconfirmed details in
 * card order, each named once.
 */
export function confirmLegend(
  boxes: readonly TextBox[],
  unconfirmed: readonly string[],
): string | null {
  const names: string[] = [];
  for (const box of targetsOf(boxes, unconfirmed)) {
    const name = inSentence(detailName(box));
    if (!names.includes(name)) names.push(name);
  }
  return names.length === 0 ? null : `Dashed details aren't confirmed yet: ${names.join(", ")}.`;
}
