import type { CardSlotId } from "@/lib/card/slots";
import type { TextBox } from "@/lib/card/text-box";

/**
 * Where a "needs confirming" marker sits over a card box, and what it is called
 * (`spec.md §31` — Creation Mode: facts the prompt states and placeholders "marked as needing
 * confirmation"). Pure geometry in percentages of the card's canvas, so the overlay scales with
 * the card at any size; reads the box's stored geometry and never changes it.
 */

export interface MarkerRect {
  /** Percent of the card's width / height. */
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
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

/** The detail a box shows, as a host would name it; a custom box is just "Text". */
export function detailName(box: TextBox): string {
  return box.source.kind === "custom" ? "Text" : DETAIL_NAME[box.source.slot];
}

/** The accessible label of a marker: "Date needs confirming". */
export function markerLabel(box: TextBox): string {
  return `${detailName(box)} needs confirming`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** The box's lines as a rectangle of the card: its width by the height its lines take. */
export function markerRect(box: TextBox, canvas: { width: number; height: number }): MarkerRect {
  const height = box.lines.length * box.size * box.lineHeight;
  return {
    left: round((box.x / canvas.width) * 100),
    top: round((box.y / canvas.height) * 100),
    width: round((box.width / canvas.width) * 100),
    height: round((height / canvas.height) * 100),
    rotation: box.rotation,
  };
}
