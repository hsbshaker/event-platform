import "server-only";

import { randomUUID } from "node:crypto";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requireEventAccess, type EventAccess } from "@/lib/auth/event-access";
import { consumeRateLimit, type RateLimitRule } from "@/lib/auth/rate-limit";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { planImport, type ImportIssue } from "./import-plan";
import {
  customDisplayName,
  validatePartyDraft,
  type GuestType,
  type InvitationStatus,
  type PartyDraft,
  type PartyFieldErrors,
  type RsvpStatus,
} from "./party";
import {
  hashPartyLinkToken,
  partyLinkKey,
  partyLinkToken,
  personalLinkPath,
} from "./personal-link";

/**
 * The guest list, server side (`spec.md §12.1`–§12.3, §12.5, §8.1, §25 "Manage guests / import
 * CSV" and "Copy/rotate a party's personal link": owner and co-host; §32 #34–37).
 *
 * Every call is authorized here with `manage_guests` (the owner and co-hosts, before and after
 * publish). Reads go through the member's own session (RLS: collaborators read their event's
 * parties and guests). Writes go through the server-only functions of
 * 20261014000000_guest_parties.sql, which take the event's lock, check membership again and
 * enforce the per-event limits inside the lock. Anyone who may not manage the event's guests, a
 * signed-out caller and an event that does not exist all read as `not_found`.
 *
 * Personal links: each party's link row is made with the party; its token is derived from the
 * row's id (`personal-link.ts`) and never stored, so `personalLink` can show the same link again
 * and `rotateLink` replaces it. Both only once the event is published (`spec.md §12.5`). Nothing
 * here logs; callers log an error's name and code, never a token, a phone or a name.
 */

/** New personal links per event: room for a host fixing forwarded links, not for churning them. */
export const PARTY_LINK_ROTATION: RateLimitRule = {
  bucket: "party-link:rotate",
  windowSeconds: 3600,
  max: 60,
};

/** A guest function answered something this code does not know. Never carries guest data. */
export class GuestOutcomeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuestOutcomeError";
  }
}

export interface GuestPersonView {
  id: string;
  name: string;
  type: GuestType;
}

export interface GuestPartyView {
  id: string;
  displayName: string;
  /** The editor's "Name on the invitation": blank when the stored name follows the guests. */
  customDisplayName: string;
  phone: string | null;
  email: string | null;
  noPhoneAvailable: boolean;
  plusOneAllowed: boolean;
  /** The main contact first. */
  people: GuestPersonView[];
  invitationStatus: InvitationStatus;
  rsvpStatus: RsvpStatus;
}

export interface GuestList {
  parties: GuestPartyView[];
  /** Personal links are surfaced to the host only once published. */
  published: boolean;
}

type NotFound = { ok: false; reason: "not_found" };

export type GuestListResult = { ok: true; list: GuestList } | NotFound;

export type SavePartyResult =
  | { ok: true; partyId: string; list: GuestList }
  | NotFound
  | { ok: false; reason: "invalid"; errors: PartyFieldErrors }
  | { ok: false; reason: "over_limit" };

export type DeletePartyResult = { ok: true; list: GuestList } | NotFound;

export type ImportResult =
  | { ok: true; imported: number; issues: ImportIssue[]; list: GuestList }
  | NotFound
  | { ok: false; reason: "invalid_file"; error: string }
  | { ok: false; reason: "over_limit"; parties: number; people: number };

export type PersonalLinkResult =
  { ok: true; path: string } | NotFound | { ok: false; reason: "not_published" | "rate_limited" };

/** The member's access, or null for anyone who may not manage the event's guests. */
async function guestAccess(eventId: string): Promise<EventAccess | null> {
  try {
    return await requireEventAccess(eventId, "manage_guests");
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) return null;
    throw error;
  }
}

/** PostgREST answers at most this many rows a request (Supabase's default `max_rows`). */
const PAGE = 1000;

/**
 * Every row of a query, page by page; `page` must order rows totally. It advances by the rows each
 * page returned and stops only at an empty page, so a server capping responses below `PAGE` (a
 * project's `max_rows`) costs a request, never rows.
 */
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ;) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) return rows;
    rows.push(...data);
    from += data.length;
  }
}

/** The event's parties and their guests, read through the member's own session. */
async function readList(access: EventAccess): Promise<GuestList> {
  const supabase = await createClient();
  const [parties, people] = await Promise.all([
    allRows((from, to) =>
      supabase
        .from("guest_parties")
        .select(
          "id, display_name, phone, email, no_phone_available, plus_one_allowed, invitation_status, rsvp_status, created_at",
        )
        .eq("event_id", access.eventId)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    allRows((from, to) =>
      supabase
        .from("guest_people")
        .select("id, party_id, name, type, position")
        .eq("event_id", access.eventId)
        .in("type", ["adult", "child"])
        .order("party_id")
        .order("position")
        .order("id")
        .range(from, to),
    ),
  ]);
  const byParty = new Map<string, GuestPersonView[]>();
  for (const person of people) {
    const list = byParty.get(person.party_id) ?? [];
    list.push({ id: person.id, name: person.name, type: person.type as GuestType });
    byParty.set(person.party_id, list);
  }
  return {
    published: access.context.published,
    parties: parties.map((row) => {
      const members = byParty.get(row.id) ?? [];
      return {
        id: row.id,
        displayName: row.display_name,
        customDisplayName: customDisplayName({ displayName: row.display_name, people: members }),
        phone: row.phone,
        email: row.email,
        noPhoneAvailable: row.no_phone_available,
        plusOneAllowed: row.plus_one_allowed,
        people: members,
        invitationStatus: row.invitation_status,
        rsvpStatus: row.rsvp_status,
      };
    }),
  };
}

/** A new personal link row: its id and its token's hash (the token itself is never kept). */
function newLink(): { linkId: string; tokenHash: string } {
  const linkId = randomUUID();
  const token = partyLinkToken(linkId, partyLinkKey(serverEnv().APP_ENCRYPTION_KEY));
  return { linkId, tokenHash: hashPartyLinkToken(token) };
}

function linkPath(linkId: string): string {
  return personalLinkPath(partyLinkToken(linkId, partyLinkKey(serverEnv().APP_ENCRYPTION_KEY)));
}

/** The event's guest list, for its owner and co-hosts. */
export async function loadGuestList(eventId: string): Promise<GuestListResult> {
  const access = await guestAccess(eventId);
  if (!access) return { ok: false, reason: "not_found" };
  return { ok: true, list: await readList(access) };
}

/**
 * What Creation Mode needs to know: whether the signed-in member may manage guests and, if so,
 * how many parties there are (the setup checklist's Guests row).
 */
export async function guestSummary(
  eventId: string,
): Promise<{ manage: false } | { manage: true; parties: number }> {
  const access = await guestAccess(eventId);
  if (!access) return { manage: false };
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("guest_parties")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (error) throw error;
  return { manage: true, parties: count ?? 0 };
}

/**
 * Adds a party (`partyId` null) or edits one, replacing its guests. The draft is validated again
 * here, whatever the browser decided: a phone or the No phone available override is required.
 */
export async function saveParty(
  eventId: string,
  partyId: string | null,
  draft: PartyDraft,
): Promise<SavePartyResult> {
  const access = await guestAccess(eventId);
  if (!access) return { ok: false, reason: "not_found" };
  const checked = validatePartyDraft(draft);
  if (!checked.ok) return { ok: false, reason: "invalid", errors: checked.errors };
  const { party } = checked;
  const payload: Record<string, Json> = {
    display_name: party.displayName,
    phone: party.phone,
    email: party.email,
    no_phone_available: party.noPhoneAvailable,
    plus_one_allowed: party.plusOneAllowed,
    people: party.people.map((p) =>
      p.id ? { id: p.id, name: p.name, type: p.type } : { name: p.name, type: p.type },
    ),
  };
  if (partyId === null) {
    const { linkId, tokenHash } = newLink();
    payload.link_id = linkId;
    payload.token_hash = tokenHash;
  }
  const { data, error } = await createAdminClient().rpc("save_guest_party", {
    p_event_id: eventId,
    p_user_id: access.user.id,
    p_party_id: partyId,
    p_party: payload,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : undefined;
  if (row?.outcome === "not_found") return { ok: false, reason: "not_found" };
  if (row?.outcome === "over_limit") return { ok: false, reason: "over_limit" };
  if ((row?.outcome !== "created" && row?.outcome !== "saved") || !row.party_id) {
    throw new GuestOutcomeError("save_guest_party returned an unknown outcome");
  }
  return { ok: true, partyId: row.party_id, list: await readList(access) };
}

/** Deletes one party, with its guests and its links. */
export async function deleteParty(eventId: string, partyId: string): Promise<DeletePartyResult> {
  const access = await guestAccess(eventId);
  if (!access) return { ok: false, reason: "not_found" };
  const { data, error } = await createAdminClient().rpc("delete_guest_party", {
    p_event_id: eventId,
    p_user_id: access.user.id,
    p_party_id: partyId,
  });
  if (error) throw error;
  if (data === "not_found") return { ok: false, reason: "not_found" };
  if (data !== "deleted")
    throw new GuestOutcomeError("delete_guest_party returned an unknown outcome");
  return { ok: true, list: await readList(access) };
}

/**
 * Imports a CSV's parties, all or nothing. The text is read here again (`planImport`), whatever
 * the browser's preview said; the caller has checked its size.
 */
export async function importCsv(eventId: string, text: string): Promise<ImportResult> {
  const access = await guestAccess(eventId);
  if (!access) return { ok: false, reason: "not_found" };
  const plan = planImport(text);
  if (!plan.ok) return { ok: false, reason: "invalid_file", error: plan.error };
  if (plan.parties.length === 0) {
    return {
      ok: false,
      reason: "invalid_file",
      error: "We didn't find any guests with a name in this file.",
    };
  }
  const parties: Json[] = plan.parties.map((party) => {
    const { linkId, tokenHash } = newLink();
    return {
      display_name: party.displayName,
      phone: party.phone,
      email: party.email,
      no_phone_available: false,
      plus_one_allowed: party.plusOneAllowed,
      people: party.people.map((p) => ({ name: p.name, type: p.type })),
      link_id: linkId,
      token_hash: tokenHash,
    };
  });
  const { data, error } = await createAdminClient().rpc("import_guest_parties", {
    p_event_id: eventId,
    p_user_id: access.user.id,
    p_parties: parties,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : undefined;
  if (row?.outcome === "not_found") return { ok: false, reason: "not_found" };
  if (row?.outcome === "over_limit") {
    return { ok: false, reason: "over_limit", parties: row.parties, people: row.people };
  }
  if (row?.outcome !== "imported") {
    throw new GuestOutcomeError("import_guest_parties returned an unknown outcome");
  }
  return { ok: true, imported: row.imported, issues: plan.issues, list: await readList(access) };
}

/** The party's personal link path, `/g/<token>`, once the event is published. */
export async function personalLink(eventId: string, partyId: string): Promise<PersonalLinkResult> {
  const access = await guestAccess(eventId);
  if (!access) return { ok: false, reason: "not_found" };
  const { data, error } = await createAdminClient().rpc("party_link", {
    p_event_id: eventId,
    p_user_id: access.user.id,
    p_party_id: partyId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : undefined;
  if (row?.outcome === "ok" && row.link_id) return { ok: true, path: linkPath(row.link_id) };
  if (row?.outcome === "not_published") return { ok: false, reason: "not_published" };
  if (row?.outcome === "not_found") return { ok: false, reason: "not_found" };
  throw new GuestOutcomeError("party_link returned an unknown outcome");
}

/**
 * Replaces the party's personal link: the old one stops working at once. Once published only;
 * rate-limited per event, counted only for an authorized member.
 */
export async function rotateLink(eventId: string, partyId: string): Promise<PersonalLinkResult> {
  const access = await guestAccess(eventId);
  if (!access) return { ok: false, reason: "not_found" };
  if (!access.context.published) return { ok: false, reason: "not_published" };
  if (!(await consumeRateLimit(PARTY_LINK_ROTATION, `event:${eventId}`))) {
    return { ok: false, reason: "rate_limited" };
  }
  const { linkId, tokenHash } = newLink();
  const { data, error } = await createAdminClient().rpc("rotate_party_link", {
    p_event_id: eventId,
    p_user_id: access.user.id,
    p_party_id: partyId,
    p_link_id: linkId,
    p_token_hash: tokenHash,
  });
  if (error) throw error;
  if (data === "not_found" || data === "not_published") return { ok: false, reason: data };
  if (data !== "rotated")
    throw new GuestOutcomeError("rotate_party_link returned an unknown outcome");
  return { ok: true, path: linkPath(linkId) };
}
