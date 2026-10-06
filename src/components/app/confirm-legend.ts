import type { CardSlotId } from "@/lib/card/slots";
import type { TextBox } from "@/lib/card/text-box";

/**
 * What the line under the card says about details not confirmed yet (`spec.md §7.3`, §31 —
 * Creation Mode: facts the prompt states and placeholders "marked as needing confirmation"). The
 * card itself carries no mark (owner decision, 2026-10-06): this line, the details form and the
 * page's detail rows do.
 */

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

/** The unconfirmed boxes that show words, in card order (top to bottom). */
function targetsOf(boxes: readonly TextBox[], unconfirmed: readonly string[]): TextBox[] {
  const marked = new Set(unconfirmed);
  return boxes
    .filter((box) => marked.has(box.id) && box.lines.length > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);
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
  return names.length === 0 ? null : `Not confirmed yet: ${names.join(", ")}.`;
}
