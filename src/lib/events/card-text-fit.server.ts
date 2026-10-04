import "server-only";

import { cardTextFitsEveryDesign } from "@/lib/card/entry-fit.server";
import type { CardEntrySlot } from "@/lib/card/entry";
import { addressFirstLine, cardVenue } from "@/lib/card/facts";
import {
  CARD_TEXT_FIELDS,
  VENUE_CLEARED_MESSAGE,
  type CardTextField,
  type VenueContext,
} from "./card-text";

/**
 * The details form's exact fit check, run by its server action after `cardTextFieldErrors`
 * accepts the patch (`spec.md §31`, "slot limits are enforced at entry"; `docs/card-system.md
 * §2.5`). Every card shows every detail, so a value the card cannot fit in every design is refused
 * at entry (`cardTextFitsEveryDesign`), checked twice: with every other slot at the worst-case
 * content, so each field has the same room whatever else the event says; and beside the event's
 * own other details where they are filled in, so the combination saved always fits too. The venue follows the card's rule (`cardVenue`): the venue name,
 * else the address's first line, so the address is checked only when there is no venue name, and
 * clearing the venue name is checked against the address's first line that would replace it.
 *
 * Server-only: it shapes text with the curated fonts.
 */

/** Beside a field whose text the card cannot fit in every design. */
export const CARD_TEXT_FIT_MESSAGE =
  "This takes more room than the card has here — please shorten it.";

/** Beside the address, when the card would show its first line and cannot fit it. */
export const ADDRESS_FIT_MESSAGE = `The card shows the address's first line. ${CARD_TEXT_FIT_MESSAGE}`;

function isBlank(value: string | null | undefined): boolean {
  return (value ?? "").trim() === "";
}

/** The event's stored card text: what a field absent from the patch keeps. */
export interface StoredCardText extends VenueContext {
  title?: string | null;
  babyName?: string | null;
  hosts?: string | null;
}

/**
 * Field errors, keyed by the form's field names, for every card field present in `patch` whose
 * text does not fit every design; null when everything fits.
 *
 * `stored` is the event's current card text: a field absent from the patch keeps its stored
 * value, both for the venue rule (as in `cardTextFieldErrors`) and as the other fields' companions.
 * When both the cleared venue name and the address are refused, only the address's message is
 * given (it names the actual problem). Rejects only if the card fonts cannot be loaded.
 */
export async function cardTextFitErrors(
  patch: Partial<Record<CardTextField, string | null | undefined>>,
  stored: StoredCardText = {},
): Promise<Record<string, string> | null> {
  const venueName = patch.venueName !== undefined ? patch.venueName : stored.venueName;
  const address = patch.address !== undefined ? patch.address : stored.address;
  const effective = (field: "title" | "babyName" | "hosts") =>
    patch[field] !== undefined ? patch[field] : stored[field];
  // What the card will show in each host-typed slot once the patch is saved.
  const companions: Partial<Record<CardEntrySlot, string | null>> = {
    title: effective("title"),
    babyName: effective("babyName"),
    hosts: effective("hosts"),
    venue: cardVenue(venueName, address),
  };
  // The text each changed field puts on the card, with the message for beside it.
  const checks: { field: CardTextField; slot: CardEntrySlot; text: string; message: string }[] = [];
  for (const field of Object.keys(CARD_TEXT_FIELDS) as CardTextField[]) {
    const value = patch[field];
    if (value === undefined) continue;
    if (field === "address") {
      // Only the first line reaches the card, and only without a venue name.
      const line = isBlank(venueName) ? addressFirstLine(value) : null;
      if (line !== null)
        checks.push({ field, slot: "venue", text: line, message: ADDRESS_FIT_MESSAGE });
    } else if (field === "venueName" && isBlank(value)) {
      // Cleared: the address's first line takes its place on the card.
      const line = addressFirstLine(address);
      if (line !== null) {
        checks.push({ field, slot: "venue", text: line, message: VENUE_CLEARED_MESSAGE });
      }
    } else if (value !== null && !isBlank(value)) {
      checks.push({
        field,
        slot: CARD_TEXT_FIELDS[field],
        text: value,
        message: CARD_TEXT_FIT_MESSAGE,
      });
    }
  }

  const errors: Record<string, string> = {};
  // First each value on its own, beside the worst case: a field that fails is named alone, and
  // its value is not then held against the others.
  for (const { field, slot, text, message } of checks) {
    if (!(await cardTextFitsEveryDesign(slot, text))) errors[field] = message;
  }
  // Then, when each fits on its own, the combination the event would have once saved.
  if (Object.keys(errors).length === 0) {
    for (const { field, slot, text, message } of checks) {
      const others = Object.entries(companions).some(([s, v]) => s !== slot && !isBlank(v));
      if (others && !(await cardTextFitsEveryDesign(slot, text, companions))) {
        errors[field] = message;
      }
    }
  }
  if (errors.address && errors.venueName === VENUE_CLEARED_MESSAGE) delete errors.venueName;
  return Object.keys(errors).length > 0 ? errors : null;
}
