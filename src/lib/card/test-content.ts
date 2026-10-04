/**
 * Test support: the typical and worst-case card content the `layoutCard` unit tests and the layout
 * fixtures (`tests/fixtures/`) set. Imported by tests only.
 */

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

/** Every slot at its provisional entry limit, with wide letters (`docs/card-system.md §2.5`). */
export const WORST: Required<{ [K in keyof CardContent]: string }> = {
  title: "Welcome Wilhelmina Montgomery-Whitworth!",
  invitationLine: "Please join us as we shower Maximilian with warm wishes and so much love",
  babyName: "Maximilian Augustin Montgomery-Whitworth",
  hosts: "Hosted by Wilhelmina Montgomery and Maximilian Worthingtons!",
  date: "Wednesday, September 30, 2026 (Midweek!)",
  time: "12:30 PM - 4:45 PM (MDT)",
  venue: "The Grand Ballroom at Montgomery-Whitworth Manor, Washington",
  rsvpBy: "Kindly RSVP by Wednesday, September 16th",
};

/** The entry limit of every slot, which `WORST` sits exactly at. */
export const LIMITS = {
  title: WORDING_LIMITS.title.max,
  invitationLine: WORDING_LIMITS.invitationLine.max,
  ...FACT_ENTRY_LIMITS,
};
