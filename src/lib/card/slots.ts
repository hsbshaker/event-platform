/**
 * The text slots of the generated card, in render order (`docs/card-system.md §2.5`).
 *
 * Wording slots are drafted by the card-design model and are host-editable; fact slots render
 * from event data only and the model never writes them (`spec.md §32 #15`).
 */

export const CARD_SLOT_IDS = [
  "title",
  "invitationLine",
  "babyName",
  "hosts",
  "date",
  "time",
  "venue",
  "rsvpBy",
] as const;

export type CardSlotId = (typeof CARD_SLOT_IDS)[number];

export const WORDING_SLOT_IDS = ["title", "invitationLine"] as const;
export type WordingSlotId = (typeof WORDING_SLOT_IDS)[number];

export const FACT_SLOT_IDS = ["babyName", "hosts", "date", "time", "venue", "rsvpBy"] as const;
export type FactSlotId = (typeof FACT_SLOT_IDS)[number];

export function isWordingSlot(id: CardSlotId): id is WordingSlotId {
  return (WORDING_SLOT_IDS as readonly string[]).includes(id);
}

/** Character bounds of model-drafted wording; the same numbers as the CardDesign schema. */
export const WORDING_LIMITS: Readonly<Record<WordingSlotId, { min: number; max: number }>> = {
  title: { min: 2, max: 40 },
  invitationLine: { min: 8, max: 72 },
};

/**
 * Maximum characters of a fact entry.
 *
 * PROVISIONAL: these are working values, to be proven or adjusted by the Phase 4 layout
 * fixtures (worst-case content in every layout x pairing). Changing one after launch is a
 * layout-set version bump (`spec.md §32 #24`).
 */
export const FACT_ENTRY_LIMITS: Readonly<Record<FactSlotId, number>> = {
  babyName: 40,
  hosts: 60,
  date: 40,
  time: 24,
  venue: 60,
  rsvpBy: 40,
};
