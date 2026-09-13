import { nextRsvpDeadline } from "./rsvp-deadline";
import { resolveEventTimezone, validateTimezone } from "./timezone";

/**
 * The pure decision behind `updateEventDetails` (spec.md §7.3, §7.4).
 *
 * Two rules carry real behaviour and are easy to get subtly wrong, so they live here where
 * they can be tested without a database or a session: which timezone a patch settles on, and
 * whether the RSVP deadline is recomputed or left alone. Everything else is a field copy.
 */

export interface PatchableRow {
  event_date: string | null;
  start_time: string | null;
  timezone: string | null;
  venue_name: string | null;
  address: string | null;
  rsvp_deadline: string | null;
  rsvp_deadline_edited: boolean;
}

export interface PatchableInput {
  title?: string | null;
  eventDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  venueName?: string | null;
  address?: string | null;
  hosts?: string | null;
  babyName?: string | null;
  visibility?: "public" | "private" | null;
  rsvpDeadline?: string | null;
  browserTimezone?: string | null;
}

export type EventUpdate = Partial<{
  title: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  timezone: string | null;
  venue_name: string | null;
  address: string | null;
  hosts: string | null;
  baby_name: string | null;
  visibility: "public" | "private" | null;
  rsvp_deadline: string | null;
  rsvp_deadline_edited: boolean;
}>;

const FIELDS: ReadonlyArray<[keyof PatchableInput, keyof EventUpdate]> = [
  ["title", "title"],
  ["eventDate", "event_date"],
  ["startTime", "start_time"],
  ["endTime", "end_time"],
  ["venueName", "venue_name"],
  ["address", "address"],
  ["hosts", "hosts"],
  ["babyName", "baby_name"],
  ["visibility", "visibility"],
];

export function computeEventPatch(
  row: PatchableRow,
  input: PatchableInput,
  now: Date = new Date(),
): EventUpdate {
  const update: EventUpdate = {};
  for (const [key, column] of FIELDS) {
    if (input[key] === undefined) continue;
    (update as Record<string, unknown>)[column] = input[key] === "" ? null : input[key];
  }

  // Timezone: inferred from venue text, browser as fallback, never a geocoder (§7.4, §32 #40).
  // `??` would fall back to the stored value when the host deliberately CLEARS a field, so
  // inference would run on text that is no longer on the event. Test for `undefined` (absent
  // from this patch) instead, exactly as the effective-value reads below do.
  const venueText = [
    update.venue_name !== undefined ? update.venue_name : row.venue_name,
    update.address !== undefined ? update.address : row.address,
  ]
    .filter(Boolean)
    .join(", ");
  const venueChanged =
    (update.venue_name !== undefined && update.venue_name !== row.venue_name) ||
    (update.address !== undefined && update.address !== row.address);
  if (!row.timezone || venueChanged) {
    const resolved = resolveEventTimezone({
      venueText,
      browserTimezone: input.browserTimezone ?? null,
    });
    if (resolved && validateTimezone(resolved)) update.timezone = resolved;
  }

  const effectiveDate = update.event_date !== undefined ? update.event_date : row.event_date;
  const effectiveStart = update.start_time !== undefined ? update.start_time : row.start_time;
  const effectiveZone = update.timezone !== undefined ? update.timezone : row.timezone;

  if (input.rsvpDeadline !== undefined) {
    // An explicit choice by the host: store it and stop recomputing for good (§7.3).
    update.rsvp_deadline = input.rsvpDeadline;
    update.rsvp_deadline_edited = input.rsvpDeadline !== null;
  } else if (effectiveZone === null) {
    // No zone settled yet. `computeRsvpDeadline` treats a null zone as UTC, which is a guess,
    // and two autosaves racing (a date save reading the row before the mount-time timezone
    // save lands) would persist a deadline computed in the wrong zone with nothing obliged to
    // recompute it afterwards. §7.4 makes the stored zone authoritative for every lifecycle
    // calculation, so derive nothing until there is one; the next save that carries a zone
    // derives it correctly.
  } else {
    const deadline = nextRsvpDeadline({
      current: row.rsvp_deadline ? new Date(row.rsvp_deadline) : null,
      edited: row.rsvp_deadline_edited,
      eventDate: effectiveDate,
      startTime: effectiveStart,
      timezone: effectiveZone,
      now,
    });
    const iso = deadline ? deadline.toISOString() : null;
    if (iso !== row.rsvp_deadline) update.rsvp_deadline = iso;
  }

  return update;
}
