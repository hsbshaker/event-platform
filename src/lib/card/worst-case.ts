/**
 * Worst-case card content: every slot at its entry limit, with wide letters (`docs/card-system.md
 * §2.5`, §4.3). The layout fixtures and the `layoutCard` tests prove it fits every layout ×
 * supported shape × pairing, and the server's entry fit check (`entry-fit.server.ts`) sets it in
 * every slot but the one being checked. Product data: changing it changes what the entry check
 * accepts.
 */

import { formatCardDate, formatCardRsvpBy, formatCardTime } from "./facts";
import type { CardContent } from "./text-box";

/**
 * The free text at its slot limit, the formatted facts at their longest and widest (`facts.ts`
 * `CARD_FACT_MAX_LENGTH`; "September 20" and "10:00 am" are the widest of their kind in most
 * curated body faces, and `layout-card.test.ts` also proves each pairing with its own widest).
 */
export const WORST: Readonly<Required<{ [K in keyof CardContent]: string }>> = Object.freeze({
  title: "Welcome Wilhelmina Montgomery-Whitworth!",
  invitationLine: "Please join us as we shower Maximilian with warm wishes and so much love",
  babyName: "Maximilian Augustin Montgomery-Whitworth",
  hosts: "Hosted by Wilhelmina Montgomery and Maximilian Worthingtons!",
  date: formatCardDate("2028-09-20"),
  time: formatCardTime("10:00", "22:00"),
  venue: "The Grand Ballroom at Montgomery-Whitworth Manor, Washington",
  rsvpBy: formatCardRsvpBy("2028-09-30T12:00:00Z", "UTC"),
});
