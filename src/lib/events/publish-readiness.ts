import { missingRequiredDetails, type EventDetailFields } from "./required-details";

/**
 * What stands between an event and `READY_TO_PUBLISH` (`spec.md §23.1`, §19.2; `docs/screen-spec.md`
 * `setup-checklist`): the exact blockers the "Needed to publish" group lists, and nothing else
 * (`spec.md §32 #45`). Guests, invitations, registry, a cash fund, a co-host and inspiration are
 * never blockers, so they never appear here.
 *
 * §23.1's list, and where each entry is answered:
 * - an active card design with validated artwork and resolved ink — `hasCard` (true when the card
 *   renders: a design that is active has its artwork and ink by construction);
 * - an effective event title (§20.2) — the host's title, else the design's drafted one, so a
 *   missing `events.title` never blocks once a design exists;
 * - event date, start time, venue/location display value, valid stored timezone, visibility —
 *   `missingRequiredDetails`;
 * - RSVP deadline — the same, with one reading: the default deadline is stored whenever the host
 *   saves a date and the event has a timezone (`computeEventPatch`, spec §7.3), so with no date
 *   there is no deadline yet and saving the date supplies it. It is then not a row of its own: the
 *   date's row stands for both. With a date saved and no deadline (a cleared one, or no timezone
 *   yet) it is its own blocker;
 * - encrypted access code when private — `accessCodeSet`;
 * - valid event owner/account — true by construction of the page that asks (an owner's or
 *   co-host's session on an event that exists).
 *
 * Only what is saved on the event counts: a value the prompt states, or a placeholder the card
 * and page show marked as needing confirmation, satisfies nothing, so no prompt fact reaches here.
 *
 * Pure: no clock, no database.
 */

export const PUBLISH_BLOCKER_KEYS = [
  "card",
  "title",
  "eventDate",
  "startTime",
  "venue",
  "timezone",
  "rsvpDeadline",
  "visibility",
  "accessCode",
] as const;

export type PublishBlockerKey = (typeof PUBLISH_BLOCKER_KEYS)[number];

export interface PublishBlocker {
  key: PublishBlockerKey;
  /** The checklist row's label. */
  label: string;
  /** One line saying what is needed. */
  description: string;
  /**
   * The id of the details-editor field the row opens it focused on, or null for a blocker no
   * surface answers yet (the card; the private event code, Creation Mode slice 3).
   */
  focusId: string | null;
}

const BLOCKERS: Readonly<Record<PublishBlockerKey, Omit<PublishBlocker, "key">>> = {
  card: {
    label: "Invitation card",
    description: "Your card needs to finish before you can publish.",
    focusId: null,
  },
  title: {
    label: "Event title",
    description: "Give the invitation a title.",
    focusId: "title",
  },
  eventDate: {
    label: "Event date",
    description: "Pick the day. The RSVP deadline follows it.",
    focusId: "eventDate",
  },
  startTime: {
    label: "Start time",
    description: "When does it begin?",
    focusId: "startTime",
  },
  venue: {
    label: "Venue",
    description: "Add where it is: a venue name or an address.",
    focusId: "venueName",
  },
  timezone: {
    label: "Time zone",
    description: "We work it out from the venue. Add or check the venue.",
    focusId: "venueName",
  },
  rsvpDeadline: {
    label: "RSVP deadline",
    description: "Choose the last day people can reply.",
    focusId: "rsvpDeadline",
  },
  visibility: {
    label: "Who can see it",
    description: "Choose public or private.",
    focusId: "visibility-public",
  },
  accessCode: {
    label: "Private event code",
    description:
      "A private invitation needs an event code. You'll set it when you get ready to share.",
    focusId: null,
  },
};

export interface PublishReadinessInput {
  /** The event's saved values (never prompt-stated facts or placeholders). */
  details: EventDetailFields;
  /** The active design's drafted title, or null with no design. */
  designTitle: string | null;
  /** The event has an active design whose card renders (artwork and ink resolved). */
  hasCard: boolean;
  /** An access code is stored (`events.access_code_encrypted` is not null). */
  accessCodeSet: boolean;
}

export interface PublishReadiness {
  /** In §23.1's order. */
  blockers: PublishBlocker[];
  /** `READY_TO_PUBLISH` as far as the event's own requirements go: payment is separate (§23.1). */
  ready: boolean;
}

function present(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function publishReadiness(input: PublishReadinessInput): PublishReadiness {
  const { details, designTitle, hasCard, accessCodeSet } = input;
  const missing = new Set<PublishBlockerKey>();

  if (!hasCard) missing.add("card");

  // §20.2: the host's title, else the design's: a card always has one.
  const effectiveTitle = present(details.title) ? details.title : designTitle;
  for (const key of missingRequiredDetails({ ...details, title: effectiveTitle })) {
    missing.add(key);
  }

  // The date's row stands for the deadline it will supply (see the module note).
  if (missing.has("eventDate")) missing.delete("rsvpDeadline");

  if (details.visibility === "private" && !accessCodeSet) missing.add("accessCode");

  const blockers = PUBLISH_BLOCKER_KEYS.filter((key) => missing.has(key)).map((key) => ({
    key,
    ...BLOCKERS[key],
  }));
  return { blockers, ready: blockers.length === 0 };
}
