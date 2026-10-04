/**
 * The card's formatted facts (`docs/card-system.md §2.5`: the date, time and RSVP-by slots are
 * formatted by code from the stored event values; `spec.md §32 #15`: facts come only from the
 * host's data).
 *
 * Pure, isomorphic and locale-independent: month and weekday names come from the tables below, not
 * from the runtime's locale data, so the server, every browser and the layout fixtures produce the
 * same strings. The card sets the details in capitals (`CARD_SLOT_SPECS`), so the case here is
 * the page's, not the card's.
 *
 * - date: weekday, month and day, no year — "Saturday, June 6". The page beneath carries the full
 *   date.
 * - time: "1:00 pm", or "1:00 pm – 4:00 pm" with an end time.
 * - RSVP-by: "RSVP by May 30", the deadline's calendar date in the event's timezone.
 *
 * Invalid input throws: a fact the card cannot state correctly is a failure, never a guess.
 */

import type { CardContent } from "./text-box";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTHS = [
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

/** The stored event date, `YYYY-MM-DD` (`events.event_date`). */
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A stored time, `HH:MM` or `HH:MM:SS` (`events.start_time`, `events.end_time`). */
const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

/** Between the start and end time: an en dash with spaces. */
export const CARD_TIME_RANGE_SEPARATOR = " \u2013 ";

/**
 * The longest each formatted fact can be, in characters: "Wednesday, September 30",
 * "10:00 pm – 11:00 pm", "RSVP by September 30" (`facts.test.ts` proves them by enumeration).
 * The worst-case content of the layout fixtures uses values at these lengths (`worst-case.ts`).
 */
export const CARD_FACT_MAX_LENGTH = { date: 23, time: 19, rsvpBy: 20 } as const;

function calendarDate(year: number, month: number, day: number): Date {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Not a calendar date: ${year}-${month}-${day}`);
  }
  return date;
}

/** "Saturday, June 6" from a stored `YYYY-MM-DD`. */
export function formatCardDate(eventDate: string): string {
  const m = DATE.exec(eventDate);
  if (!m) throw new Error(`Not a stored event date: ${JSON.stringify(eventDate)}`);
  const date = calendarDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function formatClock(time: string): string {
  const m = TIME.exec(time);
  if (!m) throw new Error(`Not a stored time: ${JSON.stringify(time)}`);
  const hour = Number(m[1]);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m[2]} ${hour < 12 ? "am" : "pm"}`;
}

/** "1:00 pm", or "1:00 pm – 4:00 pm" when an end time is stored. */
export function formatCardTime(startTime: string, endTime?: string | null): string {
  const start = formatClock(startTime);
  return endTime ? `${start}${CARD_TIME_RANGE_SEPARATOR}${formatClock(endTime)}` : start;
}

/**
 * "RSVP by May 30": the deadline instant's calendar date in the event's timezone (an IANA zone,
 * `events.timezone`), the zone the deadline was set in (`spec.md §7.3`, §7.4).
 */
export function formatCardRsvpBy(deadline: string | Date, timeZone: string): string {
  const instant = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Not an RSVP deadline: ${JSON.stringify(String(deadline))}`);
  }
  // Numeric parts only: they do not depend on the runtime's locale data.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const date = calendarDate(part("year"), part("month"), part("day"));
  return `RSVP by ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/**
 * The first line of an address — the street — which is what the card shows when there is no
 * venue name (`docs/card-system.md §2.5`); the page beneath carries the full address. The first
 * segment before a line break or comma, or null when there is none.
 */
export function addressFirstLine(address: string | null | undefined): string | null {
  for (const segment of (address ?? "").split(/[\n,]/)) {
    const line = segment.trim().replace(/\s+/g, " ");
    if (line !== "") return line;
  }
  return null;
}

/** The card's venue: the venue name, else the address's first line. */
export function cardVenue(
  venueName: string | null | undefined,
  address: string | null | undefined,
): string | null {
  const name = venueName?.trim() ?? "";
  return name !== "" ? name : addressFirstLine(address);
}

/** The event fields the card is made from, as stored (`events` columns, camel-cased). */
export interface CardContentInput {
  title: string | null | undefined;
  invitationLine: string | null | undefined;
  babyName: string | null | undefined;
  hosts: string | null | undefined;
  /** `YYYY-MM-DD`. */
  eventDate: string | null | undefined;
  /** `HH:MM` or `HH:MM:SS`. */
  startTime: string | null | undefined;
  endTime: string | null | undefined;
  venueName: string | null | undefined;
  address: string | null | undefined;
  /** An ISO instant. */
  rsvpDeadline: string | null | undefined;
  /** IANA zone the deadline's calendar date is read in. */
  timezone: string | null | undefined;
}

function trimmed(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text === "" ? null : text;
}

/**
 * The only way event fields become `CardContent` for `generatedTextLayer` (Phase 5 must use it,
 * never build the object by hand): the fit guarantee (`CARD_FACT_MAX_LENGTH`, the fixtures' worst
 * case) holds only for the date, time and RSVP-by slots formatted here. Every string is trimmed,
 * a missing fact is `null`, `venue` is the venue name else the address's first line, and the
 * RSVP-by slot needs both a deadline and a timezone. Throws, like the formatters, on a stored value
 * that is not valid.
 */
export function cardContent(input: CardContentInput): CardContent {
  const eventDate = trimmed(input.eventDate);
  const startTime = trimmed(input.startTime);
  const rsvpDeadline = trimmed(input.rsvpDeadline);
  const timezone = trimmed(input.timezone);
  return {
    title: trimmed(input.title),
    invitationLine: trimmed(input.invitationLine),
    babyName: trimmed(input.babyName),
    hosts: trimmed(input.hosts),
    date: eventDate === null ? null : formatCardDate(eventDate),
    time: startTime === null ? null : formatCardTime(startTime, trimmed(input.endTime)),
    venue: cardVenue(input.venueName, input.address),
    rsvpBy:
      rsvpDeadline === null || timezone === null ? null : formatCardRsvpBy(rsvpDeadline, timezone),
  };
}
