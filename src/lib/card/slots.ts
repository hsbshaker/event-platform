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

/** The fact slots the host types (`docs/card-system.md §2.5`); the others are formatted by code. */
export const FREE_TEXT_FACT_SLOT_IDS = ["babyName", "hosts", "venue"] as const;
export type FreeTextFactSlotId = (typeof FREE_TEXT_FACT_SLOT_IDS)[number];

/** The formatted fact slots: date, time and RSVP-by, from stored values (`facts.ts`). */
export const FORMATTED_FACT_SLOT_IDS = ["date", "time", "rsvpBy"] as const;
export type FormattedFactSlotId = (typeof FORMATTED_FACT_SLOT_IDS)[number];

/**
 * Maximum characters of a free-text fact entry, enforced at entry (`validateCardText`). The date,
 * time and RSVP-by are formatted by code and bounded by `CARD_FACT_MAX_LENGTH` (`facts.ts`).
 *
 * Layout-set data (`card_layouts_v2`): proven by the layout fixtures, worst-case content in every
 * layout × supported shape × pairing. Changing one is a layout-set version bump
 * (`spec.md §32 #24`).
 */
export const FACT_ENTRY_LIMITS: Readonly<Record<FreeTextFactSlotId, number>> = {
  babyName: 40,
  hosts: 60,
  venue: 60,
};
