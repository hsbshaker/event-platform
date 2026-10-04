import { validateCardText, type CardEntrySlot } from "@/lib/card/entry";
import { addressFirstLine } from "@/lib/card/facts";

/**
 * Event detail fields the card shows as the host typed them, and the card slot each fills
 * (`docs/card-system.md §2.5`): a host-supplied title (used verbatim, `spec.md §20.2`), the hosts,
 * the baby's name, the venue name, and the address's first line, which the card shows when there
 * is no venue name. The details form and its server action check them with the
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
  address: "venue",
} as const satisfies Record<string, CardEntrySlot>;

export type CardTextField = keyof typeof CARD_TEXT_FIELDS;

/**
 * The other venue field's effective value (after the change being checked). The card shows the
 * address's first line only when the venue name is empty, so each of the two fields is checked in
 * light of the other. Supplied by the caller: these functions read nothing themselves.
 */
export interface VenueContext {
  venueName?: string | null;
  address?: string | null;
}

/** Shown on the venue-name field when clearing it would leave an address the card cannot show. */
export const VENUE_CLEARED_MESSAGE =
  "The card shows the address's first line when there's no venue name, and it can't show this one: keep a venue name, or shorten the address's first line.";

function isBlank(value: string | null | undefined): boolean {
  return (value ?? "").trim() === "";
}

/** The refusal for the address's first line as the card's venue, or null when it can be shown. */
function addressRefusal(address: string | null | undefined): string | null {
  // Only the first line reaches the card; the rest of the address is on the page alone.
  const line = addressFirstLine(address);
  if (line === null) return null;
  const check = validateCardText("venue", line);
  return check.ok ? null : check.message;
}

/**
 * The plain message for beside the field, or null when the card can show the value.
 *
 * `context` carries the other venue field's effective value. The address is checked only when the
 * venue name is empty (the card shows the address's first line only then); a cleared venue name is
 * refused when the address's first line could not be shown in its place. Absent context means the
 * other field is unknown: an address is then checked, and a cleared venue name is accepted.
 */
export function cardTextFieldError(
  field: CardTextField,
  value: string | null | undefined,
  context: VenueContext = {},
): string | null {
  // A venue name sent as null is a clear, like "".
  if (field === "venueName" && value === null) value = "";
  if (typeof value !== "string") return null;
  if (field === "address") {
    if (!isBlank(context.venueName)) return null;
    const refusal = addressRefusal(value);
    return refusal === null ? null : `The card shows the address's first line. ${refusal}`;
  }
  if (field === "venueName" && isBlank(value)) {
    return addressRefusal(context.address) === null ? null : VENUE_CLEARED_MESSAGE;
  }
  const check = validateCardText(CARD_TEXT_FIELDS[field], value);
  return check.ok ? null : check.message;
}

/**
 * Field errors for every card field present in a patch, or null when there are none.
 *
 * `stored` is the event's current venue name and address: a venue field absent from the patch
 * keeps its stored value when the other is checked. When both the cleared venue name and the
 * address are refused, only the address's message is given (it names the actual problem).
 */
export function cardTextFieldErrors(
  patch: Partial<Record<CardTextField, string | null | undefined>>,
  stored: VenueContext = {},
): Record<string, string> | null {
  const venueName = patch.venueName !== undefined ? patch.venueName : stored.venueName;
  const address = patch.address !== undefined ? patch.address : stored.address;
  const errors: Record<string, string> = {};
  for (const field of Object.keys(CARD_TEXT_FIELDS) as CardTextField[]) {
    if (patch[field] === undefined) continue;
    const error = cardTextFieldError(
      field,
      patch[field],
      field === "address" ? { venueName } : { address },
    );
    if (error) errors[field] = error;
  }
  if (errors.address && errors.venueName === VENUE_CLEARED_MESSAGE) delete errors.venueName;
  return Object.keys(errors).length > 0 ? errors : null;
}
