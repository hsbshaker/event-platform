/**
 * Placeholders for required facts the host has not supplied yet (spec.md §7.3): a date twelve
 * weeks out on a Saturday, a 1:00 PM start, `Venue to be announced`, hosts omitted, and an RSVP
 * deadline derived by the canonical rule. Creation Mode shows them on the card marked as needing
 * confirmation; they are never persisted as real content, never published, and never shown to
 * guests. This module only reports what is real vs. provisional; it never decides guest visibility.
 *
 * Revision 7 note: the provisional *title* below predates the card. Under Revision 7 the title is
 * wording — the host's verbatim if supplied, otherwise drafted by the card design (spec.md §7.3,
 * §20.2) — so this title placeholder is retired when generation lands (docs/development-plan.md,
 * "Revision 7 alignment").
 *
 * Pure, dependency-free: `now` is an explicit argument, nothing reads `Date.now()`.
 */

import { computeRsvpDeadline, PROVISIONAL_START_TIME } from "./rsvp-deadline";

export { PROVISIONAL_START_TIME };
export const PROVISIONAL_VENUE = "Venue to be announced";
export const PROVISIONAL_TITLE_NO_NAME = "A baby shower";
/** Number of days out ("twelve weeks") used to seed the provisional event date. */
export const PROVISIONAL_DAYS_OUT = 84;

export interface ProvisionalSourceEvent {
  babyName?: string | null;
  title?: string | null;
  eventDate?: string | null; // YYYY-MM-DD
  startTime?: string | null; // HH:MM or HH:MM:SS
  endTime?: string | null;
  venue?: string | null;
  /** Display string as shown on the card. */
  hosts?: string | null;
  timezone?: string | null;
  rsvpDeadline?: string | Date | null;
}

export interface ProvisionalField<T> {
  value: T;
  provisional: boolean;
}

export interface ProvisionalContent {
  title: ProvisionalField<string>;
  eventDate: ProvisionalField<string>;
  startTime: ProvisionalField<string>;
  /** No provisional value exists for end time — §7.3 "End time remains optional". */
  endTime: ProvisionalField<string> | null;
  venue: ProvisionalField<string>;
  /** Hosts are never provisional — always omitted when unknown. */
  hosts: ProvisionalField<string> | null;
  rsvpDeadline: ProvisionalField<Date> | null;
}

/** The first Saturday on or after `now` plus `PROVISIONAL_DAYS_OUT` days, as YYYY-MM-DD. */
function provisionalEventDate(now: Date): string {
  const baseUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUtc = baseUtc + PROVISIONAL_DAYS_OUT * 24 * 60 * 60 * 1000;
  const target = new Date(targetUtc);
  const dayOfWeek = target.getUTCDay(); // 0=Sun ... 6=Sat
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
  const saturdayUtc = targetUtc + daysUntilSaturday * 24 * 60 * 60 * 1000;
  const saturday = new Date(saturdayUtc);
  const y = String(saturday.getUTCFullYear()).padStart(4, "0");
  const m = String(saturday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(saturday.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * spec.md §7.3 bounded provisional content snapshot. Every field reports whether it
 * is the event's real value (`provisional: false`) or a bounded stand-in
 * (`provisional: true`) shown on the card in Creation Mode until the host supplies the
 * real value; never published.
 */
export function provisionalContent(event: ProvisionalSourceEvent, now: Date): ProvisionalContent {
  const title: ProvisionalField<string> = isNonEmpty(event.title)
    ? { value: event.title, provisional: false }
    : {
        value: isNonEmpty(event.babyName)
          ? `Baby shower for ${event.babyName}`
          : PROVISIONAL_TITLE_NO_NAME,
        provisional: true,
      };

  const eventDate: ProvisionalField<string> = isNonEmpty(event.eventDate)
    ? { value: event.eventDate, provisional: false }
    : { value: provisionalEventDate(now), provisional: true };

  const startTime: ProvisionalField<string> = isNonEmpty(event.startTime)
    ? { value: event.startTime, provisional: false }
    : { value: PROVISIONAL_START_TIME, provisional: true };

  const endTime: ProvisionalField<string> | null = isNonEmpty(event.endTime)
    ? { value: event.endTime, provisional: false }
    : null;

  const venue: ProvisionalField<string> = isNonEmpty(event.venue)
    ? { value: event.venue, provisional: false }
    : { value: PROVISIONAL_VENUE, provisional: true };

  // Hosts is omitted rather than invented (§7.3 "hosts omitted"): null means absent.
  const hosts: ProvisionalField<string> | null = isNonEmpty(event.hosts)
    ? { value: event.hosts, provisional: false }
    : null;

  const timezone = event.timezone ?? null;
  let rsvpDeadline: ProvisionalField<Date> | null;
  if (event.rsvpDeadline) {
    rsvpDeadline = {
      value: event.rsvpDeadline instanceof Date ? event.rsvpDeadline : new Date(event.rsvpDeadline),
      provisional: false,
    };
  } else {
    const computed = computeRsvpDeadline({
      eventDate: eventDate.value,
      startTime: startTime.value,
      timezone,
      now,
    });
    rsvpDeadline = computed
      ? { value: computed, provisional: eventDate.provisional || startTime.provisional }
      : null;
  }

  return { title, eventDate, startTime, endTime, venue, hosts, rsvpDeadline };
}
