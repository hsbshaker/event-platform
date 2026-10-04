/**
 * Test support: the typical and worst-case card content the `layoutCard` unit tests and the layout
 * fixtures (`tests/fixtures/`) set. Imported by tests only.
 */

import { CARD_FACT_MAX_LENGTH, formatCardDate, formatCardRsvpBy, formatCardTime } from "./facts";
import { FACT_ENTRY_LIMITS, WORDING_LIMITS } from "./slots";
import type { CardContent } from "./text-box";

/** An ordinary baby shower's words: no baby name, no RSVP-by. */
export const TYPICAL: CardContent = {
  title: "A Little Wild One",
  invitationLine: "Please join us for a baby shower",
  hosts: "Hosted by Maya & Tom",
  date: "Saturday, June 6",
  time: "1:00 pm",
  venue: "The Willow House",
};

/**
 * Every slot at its entry limit, with wide letters (`docs/card-system.md §2.5`): the free text at
 * its slot limit, the formatted facts at their longest and widest (`facts.ts`
 * `CARD_FACT_MAX_LENGTH`; "September 20" and "10:00 am" are the widest of their kind in most
 * curated body faces, and `layout-card.test.ts` also proves each pairing with its own widest).
 */
export const WORST: Required<{ [K in keyof CardContent]: string }> = {
  title: "Welcome Wilhelmina Montgomery-Whitworth!",
  invitationLine: "Please join us as we shower Maximilian with warm wishes and so much love",
  babyName: "Maximilian Augustin Montgomery-Whitworth",
  hosts: "Hosted by Wilhelmina Montgomery and Maximilian Worthingtons!",
  date: formatCardDate("2028-09-20"),
  time: formatCardTime("10:00", "22:00"),
  venue: "The Grand Ballroom at Montgomery-Whitworth Manor, Washington",
  rsvpBy: formatCardRsvpBy("2028-09-30T12:00:00Z", "UTC"),
};

/** The entry limit of every slot, which `WORST` sits exactly at. */
export const LIMITS = {
  title: WORDING_LIMITS.title.max,
  invitationLine: WORDING_LIMITS.invitationLine.max,
  ...FACT_ENTRY_LIMITS,
  ...CARD_FACT_MAX_LENGTH,
};
