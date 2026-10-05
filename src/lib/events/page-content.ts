import {
  addressFirstLine,
  formatCardDate,
  formatCardRsvpBy,
  formatCardTime,
  type PromptFactSlot,
} from "@/lib/card/facts";
import { provisionalContent } from "./provisional";

/**
 * What the house-style page beneath the card shows (`spec.md §21`, `§31` — Creation Mode;
 * `docs/design-system.md §15`): the event's details, description and RSVP-by line, as plain
 * strings with a flag for each one that needs the host's confirmation.
 *
 * Two variants of one derivation. `creation` is the owner's and co-hosts' view: a required fact the
 * host has not supplied shows what the card shows for it — the value the prompt states, as the host
 * wrote it, else the bounded placeholder — marked as needing confirmation. `guest` renders real,
 * host-supplied values only; a missing fact is absent, never a placeholder (`spec.md §7.3`: they
 * are never published and never shown to guests). Pure, no `Date.now()`, no model call.
 */

/** The longest description the page takes, in characters (page content; never on the card). */
export const DESCRIPTION_MAX_LENGTH = 2000;

export type EventPageVariant = "creation" | "guest";

export interface PageFact {
  text: string;
  /** A prompt-stated value or a placeholder: Creation Mode marks it; never true for a guest. */
  needsConfirming: boolean;
}

export interface EventPageSource {
  /** The card's effective title (the host's, else the design's). */
  title: string;
  hosts: string | null;
  babyName: string | null;
  /** `YYYY-MM-DD`. */
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  venueName: string | null;
  address: string | null;
  /** An ISO instant. */
  rsvpDeadline: string | null;
  timezone: string | null;
  description: string | null;
  /**
   * The prompt-stated values the card shows (`RevealedCard.stated`: those that passed the entry and
   * fit checks), so the page shows the same ones as the card above it. Creation Mode only.
   */
  stated: Partial<Record<PromptFactSlot, string>>;
}

export interface EventPageContent {
  title: string;
  hosts: PageFact | null;
  babyName: PageFact | null;
  date: PageFact | null;
  time: PageFact | null;
  /** The venue name and the full address; a placeholder or stated venue fills the name only. */
  venue: { name: string | null; address: string | null; needsConfirming: boolean } | null;
  rsvpBy: PageFact | null;
  description: string | null;
}

function text(value: string | null | undefined): string | null {
  const t = value?.trim() ?? "";
  return t === "" ? null : t;
}

export function eventPageContent(
  source: EventPageSource,
  variant: EventPageVariant,
  now: Date,
): EventPageContent {
  const creation = variant === "creation";
  const venueName = text(source.venueName);
  const address = text(source.address);
  const hosts = text(source.hosts);
  const babyName = text(source.babyName);
  const eventDate = text(source.eventDate);
  const startTime = text(source.startTime);
  const timezone = text(source.timezone);
  const deadline = text(source.rsvpDeadline);

  // A stated value stands in only for a fact the host has not stored, as on the card.
  const stated: Partial<Record<PromptFactSlot, string>> = creation ? source.stated : {};
  const placeholders = provisionalContent(
    {
      eventDate,
      startTime,
      venue: venueName ?? addressFirstLine(address),
      timezone,
      rsvpDeadline: deadline,
    },
    now,
  );

  const real = (value: string | null): PageFact | null =>
    value === null ? null : { text: value, needsConfirming: false };
  const unconfirmed = (value: string | undefined): PageFact | null =>
    value === undefined ? null : { text: value, needsConfirming: true };

  const hostsFact = real(hosts) ?? unconfirmed(stated.hosts);
  const babyFact = real(babyName) ?? unconfirmed(stated.babyName);

  let date: PageFact | null = null;
  if (eventDate) date = { text: formatCardDate(eventDate), needsConfirming: false };
  else if (creation) {
    date = unconfirmed(stated.date) ?? {
      text: formatCardDate(placeholders.eventDate.value),
      needsConfirming: true,
    };
  }
  const statedDate = !eventDate && stated.date !== undefined;

  let time: PageFact | null = null;
  if (startTime) {
    time = { text: formatCardTime(startTime, text(source.endTime)), needsConfirming: false };
  } else if (creation) {
    time = unconfirmed(stated.time) ?? {
      text: formatCardTime(placeholders.startTime.value),
      needsConfirming: true,
    };
  }

  let venue: EventPageContent["venue"] = null;
  if (venueName || address) {
    venue = { name: venueName, address, needsConfirming: false };
  } else if (creation) {
    venue = {
      name: stated.venue ?? placeholders.venue.value,
      address: null,
      needsConfirming: true,
    };
  }

  // The RSVP-by line, as the card's reveal decides it: the stored deadline; else (Creation Mode,
  // with a timezone) the default of the date shown, marked while that date is the placeholder; absent
  // when the date shown is the prompt's own words, which code does not read as a date.
  let rsvpBy: PageFact | null = null;
  if (deadline && timezone) {
    rsvpBy = { text: formatCardRsvpBy(deadline, timezone), needsConfirming: false };
  } else if (creation && !deadline && timezone && !statedDate && placeholders.rsvpDeadline) {
    rsvpBy = {
      text: formatCardRsvpBy(placeholders.rsvpDeadline.value, timezone),
      needsConfirming: placeholders.eventDate.provisional,
    };
  }

  return {
    title: source.title,
    hosts: hostsFact,
    babyName: babyFact,
    date,
    time,
    venue,
    rsvpBy,
    description: text(source.description),
  };
}
