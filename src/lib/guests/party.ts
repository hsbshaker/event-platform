import { z } from "zod";

import { cleanName, deriveDisplayName, type NamedGuest } from "./display-name";
import { DISPLAY_NAME_MAX, EMAIL_MAX, GUEST_NAME_MAX } from "./limits";
import { normalizePhone } from "./phone";

/**
 * A guest party as the host edits it (`spec.md §12.2`, §12.3), shared by the party editor and the
 * server so both refuse the same things with the same words.
 *
 * A party is a list of named guests, each an adult or a child; the first is the main contact and
 * is an adult. A plus-one is a separate allowance the host turns on, never a named guest here. A
 * save needs a US or Canadian mobile number or the explicit **No phone available** acknowledgement
 * (`spec.md §12.2`: "Manual party creation requires either a phone number or the explicit No phone
 * available acknowledgement"); only a CSV import may leave a party with neither (Needs phone).
 */

export type ContactState = "ready" | "needs_phone" | "no_phone";
export type InvitationStatus = "not_sent" | "sent" | "delivery_failed" | "opted_out";
export type RsvpStatus = "awaiting" | "attending" | "declined";
export type GuestType = "adult" | "child";

/** Derived, never stored (`spec.md §12.2`). */
export function contactState(party: {
  phone: string | null;
  noPhoneAvailable: boolean;
}): ContactState {
  if (party.phone) return "ready";
  return party.noPhoneAvailable ? "no_phone" : "needs_phone";
}

export const CONTACT_LABEL: Record<ContactState, string> = {
  ready: "Ready",
  needs_phone: "Needs phone",
  no_phone: "No phone available",
};

export const RSVP_LABEL: Record<RsvpStatus, string> = {
  awaiting: "Awaiting",
  attending: "Attending",
  declined: "Declined",
};

export const INVITATION_LABEL: Record<InvitationStatus, string> = {
  not_sent: "Not sent",
  sent: "Sent",
  delivery_failed: "Delivery failed",
  opted_out: "Opted out",
};

export const PHONE_ERROR = "Enter a US or Canadian mobile number, or choose No phone available.";
export const EMAIL_HINT = "Only used if a reminder can't reach them by text.";
export const NO_PHONE_HINT =
  "They won't get texts. You can send them their personal link yourself.";

/** `2 adults, 1 child · plus-one` */
export function membersSummary(party: {
  people: readonly { type: GuestType }[];
  plusOneAllowed: boolean;
}): string {
  const adults = party.people.filter((p) => p.type === "adult").length;
  const children = party.people.filter((p) => p.type === "child").length;
  const parts = [`${adults} ${adults === 1 ? "adult" : "adults"}`];
  if (children > 0) parts.push(`${children} ${children === 1 ? "child" : "children"}`);
  return parts.join(", ") + (party.plusOneAllowed ? " · plus-one" : "");
}

/** An email as stored (trimmed, lower case), null for none, or false when it is not one. */
export function normalizeEmail(input: string): string | null | false {
  const value = input.trim().toLowerCase();
  if (value === "") return null;
  if (value.length > EMAIL_MAX) return false;
  return z.email().safeParse(value).success ? value : false;
}

/** What the party editor sends. */
export interface PartyDraft {
  /** Blank: derived from the guests (`deriveDisplayName`). */
  displayName: string;
  people: { id?: string; name: string; type: GuestType }[];
  phone: string;
  noPhoneAvailable: boolean;
  email: string;
  plusOneAllowed: boolean;
}

/** A party ready to store. */
export interface PartyRecord {
  displayName: string;
  people: { id: string | null; name: string; type: GuestType }[];
  phone: string | null;
  noPhoneAvailable: boolean;
  email: string | null;
  plusOneAllowed: boolean;
}

export type PartyFieldErrors = Partial<
  Record<"displayName" | "phone" | "email" | "people", string>
> & {
  /** Per guest, by position. */
  names?: Record<number, string>;
};

export type PartyValidation =
  { ok: true; party: PartyRecord } | { ok: false; errors: PartyFieldErrors };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks and normalizes what the editor sends. The browser runs it for inline errors; the server
 * runs it again on what it receives, whatever the browser decided.
 */
export function validatePartyDraft(draft: PartyDraft): PartyValidation {
  const errors: PartyFieldErrors = {};
  const names: Record<number, string> = {};

  const people = draft.people.map((p, index) => ({
    id: p.id && UUID.test(p.id) ? p.id.toLowerCase() : null,
    name: cleanName(p.name),
    type:
      index === 0
        ? ("adult" as const)
        : p.type === "child"
          ? ("child" as const)
          : ("adult" as const),
    index,
  }));
  if (people.length === 0) errors.people = "Add at least one guest.";
  for (const person of people) {
    if (person.name === "") names[person.index] = "Enter a name.";
    else if (person.name.length > GUEST_NAME_MAX)
      names[person.index] = `Keep names to ${GUEST_NAME_MAX} characters.`;
  }
  if (draft.people[0] && draft.people[0].type === "child") {
    names[0] ??= "The main contact is an adult.";
  }
  if (Object.keys(names).length > 0) errors.names = names;

  let phone: string | null = null;
  if (draft.noPhoneAvailable) {
    phone = null;
  } else {
    phone = normalizePhone(draft.phone);
    if (!phone) errors.phone = PHONE_ERROR;
  }

  const email = normalizeEmail(draft.email);
  if (email === false) errors.email = "Enter an email address, or leave it blank.";

  const typed = cleanName(draft.displayName);
  if (typed.length > DISPLAY_NAME_MAX) {
    errors.displayName = `Keep the name on the invitation to ${DISPLAY_NAME_MAX} characters.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const named: NamedGuest[] = people.map(({ name, type }) => ({ name, type }));
  return {
    ok: true,
    party: {
      displayName: typed || deriveDisplayName(named),
      people: people.map(({ id, name, type }) => ({ id, name, type })),
      phone,
      noPhoneAvailable: draft.noPhoneAvailable,
      email: email === false ? null : email,
      plusOneAllowed: draft.plusOneAllowed,
    },
  };
}

/**
 * The editor's "Name on the invitation" for a stored party: blank when the stored name is the one
 * its guests derive (so it keeps following them), else the name the host or the CSV gave.
 */
export function customDisplayName(party: {
  displayName: string;
  people: readonly NamedGuest[];
}): string {
  return party.displayName === deriveDisplayName(party.people) ? "" : party.displayName;
}
