"use server";

import { z } from "zod";

import {
  GuestOutcomeError,
  deleteParty as deletePartyServer,
  importCsv,
  loadGuestList,
  personalLink,
  rotateLink,
  saveParty as savePartyServer,
  type GuestList,
} from "@/lib/guests/guests.server";
import { decodeCsv, type ImportIssue } from "@/lib/guests/import-plan";
import { CSV_MAX_BYTES, MAX_PARTIES_PER_EVENT, MAX_PEOPLE_PER_EVENT } from "@/lib/guests/limits";
import type { PartyFieldErrors } from "@/lib/guests/party";

/**
 * The guest workspace's actions, for the owner and co-hosts (`spec.md §12`, §25 "Manage guests /
 * import CSV", "Copy/rotate a party's personal link"; `docs/screen-spec.md` `guests-workspace`).
 * See `src/lib/guests/guests.server.ts`.
 *
 * Every action is authorized server-side with `manage_guests`; anyone else, and an id that is not
 * an event's, gets the same plain not-found answer as other event reads (`spec.md §27`). A failure
 * is logged by its error's name and code only: never a phone, a name, an email or a link.
 */

const NOT_FOUND = "This event isn't available.";
const FAILED = "Couldn't do that. Try again.";
const COUNT = new Intl.NumberFormat("en-US");

export type GuestsFailure = {
  ok: false;
  reason:
    | "not_found"
    | "invalid"
    | "over_limit"
    | "invalid_file"
    | "not_published"
    | "rate_limited"
    | "failed";
  error: string;
  /** For `invalid`: what to show beside each field. */
  fieldErrors?: PartyFieldErrors;
};

export type GuestListActionResult = { ok: true; list: GuestList } | GuestsFailure;
export type SavePartyActionResult = { ok: true; partyId: string; list: GuestList } | GuestsFailure;
export type ImportActionResult =
  { ok: true; imported: number; issues: ImportIssue[]; list: GuestList } | GuestsFailure;
export type PersonalLinkActionResult = { ok: true; path: string } | GuestsFailure;

const eventSchema = z.uuid();
const partySchema = z.strictObject({
  eventId: z.uuid(),
  partyId: z.uuid().nullable(),
  draft: z.strictObject({
    displayName: z.string().max(1000),
    people: z
      .array(
        z.strictObject({
          id: z.uuid().optional(),
          name: z.string().max(1000),
          type: z.enum(["adult", "child"]),
        }),
      )
      .max(MAX_PEOPLE_PER_EVENT),
    phone: z.string().max(100),
    noPhoneAvailable: z.boolean(),
    email: z.string().max(1000),
    plusOneAllowed: z.boolean(),
  }),
});
const partyRefSchema = z.strictObject({ eventId: z.uuid(), partyId: z.uuid() });

export type SavePartyInput = z.input<typeof partySchema>;
export type PartyRefInput = z.input<typeof partyRefSchema>;

function notFound(): GuestsFailure {
  return { ok: false, reason: "not_found", error: NOT_FOUND };
}

function failed(): GuestsFailure {
  return { ok: false, reason: "failed", error: FAILED };
}

const NOT_PUBLISHED: GuestsFailure = {
  ok: false,
  reason: "not_published",
  error: "Personal links are available once the invitation is published.",
};

/** What a failure is logged as: never its message or details, which may quote guest data. */
function logged(error: unknown) {
  const e = error as { name?: unknown; code?: unknown };
  return {
    name: typeof e?.name === "string" ? e.name : typeof error,
    code: typeof e?.code === "string" ? e.code : undefined,
    ...(error instanceof GuestOutcomeError ? { message: error.message } : {}),
  };
}

/** The event's parties and their guests. */
export async function loadGuests(eventId: string): Promise<GuestListActionResult> {
  if (!eventSchema.safeParse(eventId).success) return notFound();
  try {
    const result = await loadGuestList(eventId);
    return result.ok ? result : notFound();
  } catch (error) {
    console.error("loadGuests: failed", { eventId, error: logged(error) });
    return failed();
  }
}

/** Adds a party (`partyId` null) or saves one, replacing its guests. */
export async function saveParty(input: SavePartyInput): Promise<SavePartyActionResult> {
  const parsed = partySchema.safeParse(input);
  if (!parsed.success) {
    // A bad event id is not found; a malformed party (the form never sends one) is a refusal, so
    // "not available" keeps meaning access.
    const eventId = (input as { eventId?: unknown } | null)?.eventId;
    if (!eventSchema.safeParse(eventId).success) return notFound();
    return {
      ok: false,
      reason: "failed",
      error: "Couldn't save. Check the details and try again.",
    };
  }
  const { eventId, partyId, draft } = parsed.data;
  try {
    const result = await savePartyServer(eventId, partyId, draft);
    if (result.ok) return result;
    switch (result.reason) {
      case "invalid":
        return {
          ok: false,
          reason: "invalid",
          error: "Check the highlighted fields.",
          fieldErrors: result.errors,
        };
      case "over_limit":
        return {
          ok: false,
          reason: "over_limit",
          error: `An event can have up to ${COUNT.format(MAX_PARTIES_PER_EVENT)} parties and ${COUNT.format(MAX_PEOPLE_PER_EVENT)} guests.`,
        };
      default:
        return notFound();
    }
  } catch (error) {
    console.error("saveParty: failed", { eventId, error: logged(error) });
    return failed();
  }
}

/** Deletes one party. */
export async function deleteParty(input: PartyRefInput): Promise<GuestListActionResult> {
  const parsed = partyRefSchema.safeParse(input);
  if (!parsed.success) return notFound();
  const { eventId, partyId } = parsed.data;
  try {
    const result = await deletePartyServer(eventId, partyId);
    return result.ok ? result : notFound();
  } catch (error) {
    console.error("deleteParty: failed", { eventId, error: logged(error) });
    return failed();
  }
}

/**
 * Imports a CSV file (`form`: `eventId` and `file`), all or nothing. The file travels as form data
 * so its bytes arrive as they are; the server reads it again whatever the preview showed.
 */
export async function importGuests(form: FormData): Promise<ImportActionResult> {
  const eventId = form.get("eventId");
  const file = form.get("file");
  if (typeof eventId !== "string" || !eventSchema.safeParse(eventId).success) return notFound();
  if (!(file instanceof Blob)) {
    return { ok: false, reason: "invalid_file", error: "Choose a CSV file to import." };
  }
  if (file.size > CSV_MAX_BYTES) {
    return {
      ok: false,
      reason: "invalid_file",
      error: "This file is larger than 1 MB. Split it into smaller files.",
    };
  }
  try {
    const result = await importCsv(eventId, decodeCsv(await file.arrayBuffer()));
    if (result.ok) return result;
    switch (result.reason) {
      case "invalid_file":
        return { ok: false, reason: "invalid_file", error: result.error };
      case "over_limit":
        return {
          ok: false,
          reason: "over_limit",
          error:
            `This import would bring your guest list to ${COUNT.format(result.parties)} parties and ` +
            `${COUNT.format(result.people)} guests. An event can have up to ` +
            `${COUNT.format(MAX_PARTIES_PER_EVENT)} parties and ${COUNT.format(MAX_PEOPLE_PER_EVENT)} guests, ` +
            `so nothing was imported.`,
        };
      default:
        return notFound();
    }
  } catch (error) {
    console.error("importGuests: failed", { eventId, error: logged(error) });
    return failed();
  }
}

/** The party's personal link path, once the event is published. */
export async function copyPersonalLink(input: PartyRefInput): Promise<PersonalLinkActionResult> {
  const parsed = partyRefSchema.safeParse(input);
  if (!parsed.success) return notFound();
  const { eventId, partyId } = parsed.data;
  try {
    const result = await personalLink(eventId, partyId);
    if (result.ok) return result;
    return result.reason === "not_published" ? NOT_PUBLISHED : notFound();
  } catch (error) {
    console.error("copyPersonalLink: failed", { eventId, error: logged(error) });
    return failed();
  }
}

/** A new personal link for the party; the old one stops working at once. */
export async function rotatePersonalLink(input: PartyRefInput): Promise<PersonalLinkActionResult> {
  const parsed = partyRefSchema.safeParse(input);
  if (!parsed.success) return notFound();
  const { eventId, partyId } = parsed.data;
  try {
    const result = await rotateLink(eventId, partyId);
    if (result.ok) return result;
    switch (result.reason) {
      case "not_published":
        return NOT_PUBLISHED;
      case "rate_limited":
        return {
          ok: false,
          reason: "rate_limited",
          error: "You've made a lot of new links. Try again in a little while.",
        };
      default:
        return notFound();
    }
  } catch (error) {
    console.error("rotatePersonalLink: failed", { eventId, error: logged(error) });
    return failed();
  }
}
