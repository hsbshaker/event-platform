/**
 * Test support: the typical and worst-case card content the `layoutCard` unit tests and the layout
 * fixtures (`tests/fixtures/`) set. Imported by tests only; `WORST` itself is product data
 * (`worst-case.ts`), re-exported here.
 */

import { CARD_FACT_MAX_LENGTH } from "./facts";
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

export { WORST } from "./worst-case";

/** The entry limit of every slot, which `WORST` sits exactly at. */
export const LIMITS = {
  title: WORDING_LIMITS.title.max,
  invitationLine: WORDING_LIMITS.invitationLine.max,
  ...FACT_ENTRY_LIMITS,
  ...CARD_FACT_MAX_LENGTH,
};
