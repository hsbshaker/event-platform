import "server-only";

/**
 * The event's actual content, shaped for the renderer and for rendered-geometry verification.
 *
 * `ContentProfile` tells the *model* how much text there is; this is the text itself, and it exists
 * because geometry verification measures a real page. `verifyGeometry` renders the composition with
 * this content at 390 and 1280 and demotes emphasis until nothing overflows — so the strings here
 * decide whether a spec verifies. Measuring a placeholder and shipping a real title would verify
 * the wrong page.
 *
 * # Provisional content, from one source
 *
 * `spec.md §7.3` fixes the bounded stand-ins — *"a title from the event type (`Baby shower for
 * <family name>` when a name is known, else `A baby shower`), a date twelve weeks out on a
 * Saturday, a start time of 1:00 PM, `Venue to be announced`, hosts omitted"* — and
 * `src/lib/events/provisional.ts` already implements that sentence. This module formats what that
 * module decides and restates none of it, so the profile the model sees and the page the browser
 * measures cannot disagree about which fields were real.
 *
 * A provisional value *is* rendered here, because a page cannot be measured with a hole in it. It
 * is never published and never shown to a guest — that is `FeaturePresentationState`'s job at
 * render time, and it is deliberately not this module's concern.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` — *"Concepts appear
 * without waiting for the required-details form; provisional content is bounded, never published,
 * and re-fit when real values arrive"*. Guardrails: `spec.md §32 #40` (no geocoder for timezone —
 * nothing here infers one).
 */
import type { EventContent } from "@/components/event-renderer/contract";
import { provisionalContent, type ProvisionalSourceEvent } from "@/lib/events/provisional";

import type { EventContentRow } from "./content-profile";

/** Version of this formatting, so a re-fit can tell whether the strings would differ. */
export const EVENT_CONTENT_VERSION = "event_content_v1";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Parse `YYYY-MM-DD` as a UTC calendar date.
 *
 * Deliberately not `new Date(string)` with a local offset: a calendar date has no instant, and
 * reading one in a local zone can move the weekday across a boundary. The event's own IANA zone
 * governs lifecycle instants (`spec.md §7.4`); the *date* a page prints is the date the host chose.
 */
function calendarDate(iso: string): { year: number; month: number; day: number; weekday: number } {
  const [y, m, d] = iso.split("-").map((part) => Number.parseInt(part, 10));
  const at = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return { year: y, month: (m ?? 1) - 1, day: d ?? 1, weekday: at.getUTCDay() };
}

/** `13:00` or `13:00:00` → `1:00 PM`. */
function clockTime(value: string): string {
  const [rawHour, rawMinute] = value.split(":");
  const hour24 = Number.parseInt(rawHour ?? "0", 10);
  const minute = rawMinute ?? "00";
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${suffix}`;
}

/** The single initial a `Monogram` renders, when there is a name to take one from. */
function initialFor(babyName: string | null, title: string): string | undefined {
  const source = babyName?.trim() || title.trim();
  const first = source.replace(/^[^\p{L}]+/u, "").charAt(0);
  return first ? first.toUpperCase() : undefined;
}

/**
 * Build the content one concept is compiled and measured against.
 *
 * `now` is explicit rather than read from the clock, so the same row and the same instant always
 * produce the same page — which is what makes a compile reproducible and a re-fit diffable.
 */
export function deriveEventContent(row: EventContentRow, now: Date): EventContent {
  const source: ProvisionalSourceEvent = {
    babyName: row.baby_name,
    title: row.title,
    eventDate: row.event_date,
    startTime: row.start_time,
    endTime: null,
    venue: row.venue_name,
    hosts: row.hosts,
    timezone: row.timezone,
    rsvpDeadline: row.rsvp_deadline,
  };
  const content = provisionalContent(source, now);
  const { year, month, day, weekday } = calendarDate(content.eventDate.value);

  const title = content.title.value;
  const deadline = content.rsvpDeadline
    ? `Kindly respond by ${MONTHS_LONG[content.rsvpDeadline.value.getUTCMonth()]} ${content.rsvpDeadline.value.getUTCDate()}`
    : undefined;

  return {
    title,
    date: `${WEEKDAYS[weekday]}, ${MONTHS_LONG[month]} ${day}, ${year}`,
    dayNumeral: String(day),
    monthShort: MONTHS_SHORT[month],
    year: String(year),
    weekday: WEEKDAYS[weekday],
    time: clockTime(content.startTime.value),
    venue: content.venue.value,
    // Optional leaves are omitted rather than filled with a stand-in: `spec.md §7.3` lists a
    // bounded value for the title, the date, the time and the venue, and says hosts are *omitted*.
    // Inventing a description or a location would put words on a page no host wrote.
    ...(content.hosts ? { hosts: content.hosts.value } : {}),
    ...(row.description ? { description: row.description } : {}),
    ...(row.address ? { location: row.address } : {}),
    ...(deadline ? { deadline } : {}),
    ...(() => {
      const initial = initialFor(row.baby_name, title);
      return initial ? { initial } : {};
    })(),
  };
}
