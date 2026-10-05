import type { RequiredDetailKey } from "./required-details";

/**
 * Preview's one plain line (`docs/screen-spec.md` `preview`; `spec.md §7.3`): shown when a fact
 * guests would otherwise see has not been saved, because the card and the page leave it out rather
 * than show a placeholder or a value only the prompt stated. The facts that can be absent from a
 * guest's view are the date, the time, the venue and the RSVP-by; the title always has a value
 * (the design's) and the timezone and visibility are not shown.
 */
export const PREVIEW_HIDDEN_LINE = "Details you haven't confirmed aren't shown to guests.";

const SHOWN_TO_GUESTS: readonly RequiredDetailKey[] = [
  "eventDate",
  "startTime",
  "venue",
  "rsvpDeadline",
  // Without a timezone the RSVP-by line cannot be written, so guests do not see it.
  "timezone",
];

/** Whether Preview says some details are not shown, from the event's missing required details. */
export function hasDetailsHiddenFromGuests(missing: readonly RequiredDetailKey[]): boolean {
  return missing.some((key) => SHOWN_TO_GUESTS.includes(key));
}
