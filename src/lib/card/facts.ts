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

import { provisionalContent } from "@/lib/events/provisional";

import { validateCardText, validateDetailText } from "./entry";
import { CARD_SLOT_IDS, type CardSlotId } from "./slots";
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

/**
 * The card's effective title (`spec.md §20.2`): the event's title when the host supplied or edited
 * it, else the design's drafted title.
 */
export function effectiveCardTitle(
  eventTitle: string | null | undefined,
  designTitle: string,
): string {
  return trimmed(eventTitle) ?? designTitle;
}

/**
 * The facts the host's prompt states (`events.prompt_facts`, `spec.md §7.3`): fact extraction's
 * fields after the verbatim check (`keepVerbatimFacts`), every value a span of the prompt exactly as
 * the host wrote it. Unconfirmed: the card shows them marked as needing confirmation, and they are
 * never published, never shown to guests and never given to the card design. Only the fields the
 * card can show are read: the title is wording (`spec.md §7.3`) and the event type is never on the
 * card.
 */
export interface PromptFacts {
  hosts: string | null;
  honoree: string | null;
  date: string | null;
  time: string | null;
  venue: string | null;
  location: string | null;
}

const PROMPT_FACT_FIELDS = ["hosts", "honoree", "date", "time", "venue", "location"] as const;

/**
 * The stored prompt facts (`events.prompt_facts`, JSON) as `PromptFacts`: each field kept only when
 * it is a string, anything else read as null; null when the value is not an object (not yet
 * extracted). Never throws: the column is checked by the database, and a field this reader cannot
 * use simply shows its placeholder.
 */
export function parsePromptFacts(value: unknown): PromptFacts | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const facts = {} as PromptFacts;
  for (const field of PROMPT_FACT_FIELDS) {
    const v = record[field];
    facts[field] = typeof v === "string" ? v : null;
  }
  return facts;
}

/** The slots a prompt-stated fact may fill: never the title, never the RSVP-by. */
export const PROMPT_FACT_SLOTS = ["babyName", "hosts", "date", "time", "venue"] as const;
export type PromptFactSlot = (typeof PROMPT_FACT_SLOTS)[number];

/** A prompt value as one line: whitespace runs, line breaks included, become one space. */
function oneLine(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

/** The event's stored fields the card's facts come from (`cardContent`), without its wording. */
export type CardFactsInput = Omit<CardContentInput, "title" | "invitationLine">;

export interface PromptFactCandidatesInput {
  event: CardFactsInput;
  promptFacts: PromptFacts | null;
  /** The slots the design's layout defines (`layoutCard`'s `slots`); every slot by default. */
  slots?: readonly CardSlotId[];
}

/**
 * The prompt-stated value for each fact slot the host has not filled, that passes the slot's entry
 * check — the same check a host's own entry gets (`validateCardText` for the baby name, hosts and
 * venue; `validateDetailText` within `CARD_FACT_MAX_LENGTH` for the date and time). Mapping:
 * hosts → hosts; honoree → babyName; date → date; time → time; venue → venue, else the location's
 * first line (`addressFirstLine`, as the card shows an address) when the prompt states no venue.
 * Never the title (it is wording) and never the event type. A slot the layout does not define, or
 * that has a stored value, takes nothing. Pure.
 *
 * The fit check (`cardTextFitsEveryDesign`) is the server's (`reveal-content.server.ts`): only a
 * candidate it also accepts is shown (`revealCardContent`'s `fits`).
 */
export function promptFactCandidates({
  event,
  promptFacts,
  slots = CARD_SLOT_IDS,
}: PromptFactCandidatesInput): Partial<Record<PromptFactSlot, string>> {
  if (!promptFacts) return {};
  const stored: Record<PromptFactSlot, string | null> = {
    babyName: trimmed(event.babyName),
    hosts: trimmed(event.hosts),
    date: trimmed(event.eventDate),
    time: trimmed(event.startTime),
    venue: cardVenue(event.venueName, event.address),
  };
  const venue = oneLine(promptFacts.venue);
  const stated: Record<PromptFactSlot, string | null> = {
    babyName: oneLine(promptFacts.honoree),
    hosts: oneLine(promptFacts.hosts),
    date: oneLine(promptFacts.date),
    time: oneLine(promptFacts.time),
    venue: venue ?? addressFirstLine(promptFacts.location),
  };
  const candidates: Partial<Record<PromptFactSlot, string>> = {};
  for (const slot of PROMPT_FACT_SLOTS) {
    const value = stated[slot];
    if (value === null || stored[slot] !== null || !slots.includes(slot)) continue;
    const check =
      slot === "date" || slot === "time"
        ? validateDetailText(value, CARD_FACT_MAX_LENGTH[slot])
        : validateCardText(slot, value);
    if (check.ok) candidates[slot] = value;
  }
  return candidates;
}

export interface RevealCardContentInput {
  /** The design's wording with the effective title applied (the host's title, else the design's). */
  wording: { title: string; invitationLine: string };
  /** The event's stored fields; its title and invitation line are the wording's. */
  event: CardFactsInput;
  /** The facts the prompt states (`events.prompt_facts`, `parsePromptFacts`); null when none. */
  promptFacts: PromptFacts | null;
  /** The slots the design's layout defines; every slot by default. */
  slots?: readonly CardSlotId[];
  /**
   * The server's fit check of a prompt-stated value in its slot (`cardTextFitsEveryDesign`, run
   * ahead by `reveal-content.server.ts`, which is how server callers get this content). Only a
   * value it accepts is shown; any other shows its placeholder, or nothing for the hosts and baby
   * name.
   */
  fits: (slot: PromptFactSlot, value: string) => boolean;
  /** The moment the provisional date is counted from (`provisionalContent`). */
  now: Date;
}

export interface RevealCardContent {
  /** The words the card shows, formatted as the card sets them. */
  content: CardContent;
  /**
   * The slots whose words need the host's confirmation, in slot order: a prompt-stated value or a
   * placeholder (`spec.md §7.3`). Never published and never shown to guests.
   */
  unconfirmed: CardSlotId[];
}

/**
 * The words the generated card shows right after generation, in Creation Mode (`spec.md §7.3`):
 * the design's wording, and for each fact
 *
 * 1. the event's stored value (host-entered or host-confirmed), formatted by `cardContent`;
 * 2. else the value the prompt states, as the host wrote it, when it passes the slot's entry and
 *    fit checks (`promptFactCandidates`, `fits`) — unconfirmed;
 * 3. else, for the date, time and venue, the bounded placeholder — the date twelve weeks out on a
 *    Saturday, 1:00 pm, `Venue to be announced` (`provisionalContent`) — unconfirmed. The hosts and
 *    the baby name are absent rather than invented.
 *
 * The RSVP-by is the stored deadline (the host's, or the default the details form stores once a
 * date is saved); else, with a timezone, the default deadline of the date the card shows
 * (`computeRsvpDeadline`) — marked unconfirmed while that date is the placeholder, so the card's
 * words do not move when the real date arrives. When the date the card shows is the prompt's own
 * words, which code does not read as a date, the RSVP-by is absent until the host saves one, so the
 * two never disagree (owner decision, 2026-10-05).
 *
 * The one producer of this content: the artwork stage judges the ink behind these lines
 * (`run.server.ts`), the reveal and Creation Mode draw them (`loadRevealedCard`), and the live
 * corpus draws them too, so none of them can drift. Pure.
 */
export function revealCardContent({
  wording,
  event,
  promptFacts,
  slots = CARD_SLOT_IDS,
  fits,
  now,
}: RevealCardContentInput): RevealCardContent {
  const placeholders = provisionalContent(
    {
      eventDate: event.eventDate,
      startTime: event.startTime,
      venue: cardVenue(event.venueName, event.address),
      timezone: event.timezone,
      rsvpDeadline: event.rsvpDeadline,
    },
    now,
  );
  const timezone = trimmed(event.timezone);
  const storedDeadline = trimmed(event.rsvpDeadline) !== null && timezone !== null;
  const defaultDeadline =
    storedDeadline || timezone === null ? null : (placeholders.rsvpDeadline?.value ?? null);
  const content = cardContent({
    ...event,
    title: wording.title,
    invitationLine: wording.invitationLine,
    eventDate: placeholders.eventDate.value,
    startTime: placeholders.startTime.value,
    // The stored venue name, else the address's first line, else the placeholder.
    venueName: placeholders.venue.value,
    address: null,
  });
  const unconfirmed = new Set<CardSlotId>();
  if (placeholders.eventDate.provisional) unconfirmed.add("date");
  if (placeholders.startTime.provisional) unconfirmed.add("time");
  if (placeholders.venue.provisional) unconfirmed.add("venue");

  const candidates = promptFactCandidates({ event, promptFacts, slots });
  let statedDate = false;
  for (const slot of PROMPT_FACT_SLOTS) {
    const value = candidates[slot];
    if (value === undefined || !fits(slot, value)) continue;
    content[slot] = value;
    unconfirmed.add(slot);
    if (slot === "date") statedDate = true;
  }

  if (defaultDeadline !== null && timezone !== null && !statedDate) {
    content.rsvpBy = formatCardRsvpBy(defaultDeadline, timezone);
    // The default of a saved date is the event's own deadline (spec.md §7.3, "RSVP deadline
    // default"); only one counted from the placeholder date is a stand-in.
    if (placeholders.eventDate.provisional) unconfirmed.add("rsvpBy");
  }
  return { content, unconfirmed: CARD_SLOT_IDS.filter((slot) => unconfirmed.has(slot)) };
}

/**
 * `revealCardContent`'s words alone, for a caller that does not mark them: the artwork stage's ink
 * (`run.server.ts`) and the live corpus.
 */
export function cardContentWithPlaceholders(input: RevealCardContentInput): CardContent {
  return revealCardContent(input).content;
}
