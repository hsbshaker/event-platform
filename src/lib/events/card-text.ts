import { validateCardText, type CardEntrySlot } from "@/lib/card/entry";

/**
 * Event detail fields the card shows as the host typed them, and the card slot each fills
 * (`docs/card-system.md §2.5`): a host-supplied title (used verbatim, `spec.md §20.2`), the hosts,
 * the baby's name and the venue name. The details form and its server action check them with the
 * card's entry check (`validateCardText`) so the card can always show what was accepted (`spec.md
 * §31`, "slot limits are enforced at entry"). The server action is the authority.
 *
 * Pure and isomorphic.
 */
export const CARD_TEXT_FIELDS = {
  title: "title",
  hosts: "hosts",
  babyName: "babyName",
  venueName: "venue",
} as const satisfies Record<string, CardEntrySlot>;

export type CardTextField = keyof typeof CARD_TEXT_FIELDS;

/** The plain message for beside the field, or null when the card can show the value. */
export function cardTextFieldError(
  field: CardTextField,
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const check = validateCardText(CARD_TEXT_FIELDS[field], value);
  return check.ok ? null : check.message;
}

/** Field errors for every card field present in a patch, or null when there are none. */
export function cardTextFieldErrors(
  patch: Partial<Record<CardTextField, string | null | undefined>>,
): Record<string, string> | null {
  const errors: Record<string, string> = {};
  for (const field of Object.keys(CARD_TEXT_FIELDS) as CardTextField[]) {
    const error = cardTextFieldError(field, patch[field]);
    if (error) errors[field] = error;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
