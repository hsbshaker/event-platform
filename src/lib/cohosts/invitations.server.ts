import "server-only";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requireEventAccess, type EventAccess } from "@/lib/auth/event-access";
import type { EventRole } from "@/lib/auth/permissions";
import { consumeRateLimit, type RateLimitRule } from "@/lib/auth/rate-limit";
import { requesterIp } from "@/lib/auth/requester";
import { getCurrentUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { generateInviteToken, hashInviteToken, invitePath } from "./token";

/**
 * Co-host invitations (`spec.md §6.1` "invite/remove co-hosts", §6.2, §25 "Manage co-host access":
 * owner only, §27 "Co-host access is explicit and invitation-based"; `docs/screen-spec.md`
 * `cohost-invite-accept`).
 *
 * Delivery is an invite link the owner copies and passes on; the platform sends nothing. Each
 * link works once, expires after 7 days and can be revoked. The owner's side — the roster, a new
 * link, revoking one, removing a co-host — is authorized here with `manage_cohosts` (owner only)
 * and done by the server-only functions of 20261012000000_cohost_invitations.sql, which check the
 * owner again under the event's lock. Anyone who is not the event's owner, a signed-out caller and
 * an event that does not exist all read as `not_found`, so nothing says whether an event exists.
 *
 * The link's side: the token is hashed (`hashInviteToken`) before any query and looked up by its
 * hash only. Each look-up — the invite page and `Join event` — is rate-limited per requester IP and
 * per signed-in account. Nothing here logs; callers log an error's name and code, never a token.
 */

/** New links per event: generous for a host inviting a few people, not for minting links. */
export const INVITE_CREATION: RateLimitRule = {
  bucket: "cohost-invite:create",
  windowSeconds: 3600,
  max: 20,
};

/** Invite look-ups (page views and accepts) per requester IP. */
export const INVITE_LOOKUP_PER_IP: RateLimitRule = {
  bucket: "cohost-invite:ip",
  windowSeconds: 3600,
  max: 60,
};

/** Invite look-ups (page views and accepts) per signed-in account. */
export const INVITE_LOOKUP_PER_USER: RateLimitRule = {
  bucket: "cohost-invite:user",
  windowSeconds: 3600,
  max: 30,
};

export interface CohostMember {
  userId: string;
  role: EventRole;
  /** The profile's display name, or null. */
  name: string | null;
  /** The profile's email, or null. */
  email: string | null;
  /** The signed-in owner's own row. */
  you: boolean;
}

export interface PendingInvitation {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export interface CohostRoster {
  /** The owner first, then co-hosts in the order they joined. */
  members: CohostMember[];
  /** Links that still work, oldest first. */
  pending: PendingInvitation[];
}

export type RosterResult = { ok: true; roster: CohostRoster } | { ok: false; reason: "not_found" };

export type CreateInvitationResult =
  | { ok: true; path: string; invitation: PendingInvitation; roster: CohostRoster }
  | { ok: false; reason: "not_found" | "rate_limited" };

export type ManageResult =
  { ok: true; roster: CohostRoster } | { ok: false; reason: "not_found" | "not_pending" };

/** What the invite page may show for a token. */
export type InvitePreview =
  | { status: "valid"; eventTitle: string | null; inviterName: string | null }
  | { status: "member"; eventId: string; eventTitle: string | null; role: EventRole }
  | { status: "invalid" }
  | { status: "rate_limited" };

export type AcceptInvitationResult =
  | { ok: true; eventId: string; role: EventRole; joined: boolean }
  | { ok: false; reason: "invalid" | "signed_out" | "rate_limited" };

/** The owner's access, or null for anyone who may not manage the event's co-hosts. */
async function ownerAccess(eventId: string): Promise<EventAccess | null> {
  try {
    return await requireEventAccess(eventId, "manage_cohosts");
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) return null;
    throw error;
  }
}

/** bytea as PostgREST takes it (`\x` and hex). */
function tokenHashParam(token: string): string {
  return `\\x${hashInviteToken(token, serverEnv().APP_ENCRYPTION_KEY).toString("hex")}`;
}

function iso(value: string): string {
  return new Date(value).toISOString();
}

/**
 * The roster for an authorized owner: members and their profiles through the owner's own session
 * (RLS: members read the roster; the owner reads their members' profiles), the pending links
 * through the server-only `pending_cohost_invitations`.
 */
async function roster(access: EventAccess): Promise<CohostRoster> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("event_members")
    .select("user_id, role, created_at")
    .eq("event_id", access.eventId);
  if (error) throw error;
  const ids = (rows ?? []).map((row) => row.user_id);
  const { data: profiles, error: profileError } =
    ids.length > 0
      ? await supabase.from("profiles").select("id, name, email").in("id", ids)
      : { data: [], error: null };
  if (profileError) throw profileError;
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const members: CohostMember[] = [...(rows ?? [])]
    .sort((a, b) =>
      a.role === b.role
        ? a.created_at.localeCompare(b.created_at) || a.user_id.localeCompare(b.user_id)
        : a.role === "owner"
          ? -1
          : 1,
    )
    .map((row) => {
      const profile = byId.get(row.user_id);
      return {
        userId: row.user_id,
        role: row.role,
        name: profile?.name?.trim() || null,
        email: profile?.email ?? null,
        you: row.user_id === access.user.id,
      };
    });

  const { data: pending, error: pendingError } = await createAdminClient().rpc(
    "pending_cohost_invitations",
    { p_event_id: access.eventId, p_user_id: access.user.id },
  );
  if (pendingError) throw pendingError;
  return {
    members,
    pending: (pending ?? []).map((row) => ({
      id: row.id,
      createdAt: iso(row.created_at),
      expiresAt: iso(row.expires_at),
    })),
  };
}

/** The event's owner, co-hosts and working links, for the owner. */
export async function loadRoster(eventId: string): Promise<RosterResult> {
  const access = await ownerAccess(eventId);
  if (!access) return { ok: false, reason: "not_found" };
  return { ok: true, roster: await roster(access) };
}

/**
 * What Creation Mode needs to know about co-hosts: whether the signed-in member may manage them
 * (`manage_cohosts`: the owner only) and, if so, how many there are (for the setup checklist's
 * Co-host row). Read through the member's own session; a co-host learns only that they may not.
 */
export async function cohostSummary(
  eventId: string,
): Promise<{ manage: false } | { manage: true; count: number }> {
  const access = await ownerAccess(eventId);
  if (!access) return { manage: false };
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("event_members")
    .select("user_id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("role", "cohost");
  if (error) throw error;
  return { manage: true, count: count ?? 0 };
}

/**
 * A new invite link. The token is returned once, inside the link's path, and never stored: only
 * its hash is. Rate-limited per event, counted only for the owner.
 */
export async function createInvitation(eventId: string): Promise<CreateInvitationResult> {
  const access = await ownerAccess(eventId);
  if (!access) return { ok: false, reason: "not_found" };
  if (!(await consumeRateLimit(INVITE_CREATION, `event:${eventId}`))) {
    return { ok: false, reason: "rate_limited" };
  }
  const token = generateInviteToken();
  const { data, error } = await createAdminClient().rpc("create_cohost_invitation", {
    p_event_id: eventId,
    p_user_id: access.user.id,
    p_token_hash: tokenHashParam(token),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : undefined;
  if (!row) throw new Error("create_cohost_invitation returned no outcome");
  if (row.outcome === "not_found") return { ok: false, reason: "not_found" };
  if (row.outcome !== "created" || !row.invitation_id || !row.created_at || !row.expires_at) {
    throw new Error("create_cohost_invitation returned an unknown outcome");
  }
  return {
    ok: true,
    path: invitePath(token),
    invitation: {
      id: row.invitation_id,
      createdAt: iso(row.created_at),
      expiresAt: iso(row.expires_at),
    },
    roster: await roster(access),
  };
}

/** Revokes a pending link: it stops working at once. */
export async function revokeInvitation(
  eventId: string,
  invitationId: string,
): Promise<ManageResult> {
  const access = await ownerAccess(eventId);
  if (!access) return { ok: false, reason: "not_found" };
  const { data, error } = await createAdminClient().rpc("revoke_cohost_invitation", {
    p_event_id: eventId,
    p_user_id: access.user.id,
    p_invitation_id: invitationId,
  });
  if (error) throw error;
  if (data === "not_found" || data === "not_pending") return { ok: false, reason: data };
  if (data !== "revoked") throw new Error("revoke_cohost_invitation returned an unknown outcome");
  return { ok: true, roster: await roster(access) };
}

/** Removes a co-host. Never the owner: the database removes only a co-host's membership. */
export async function removeCohost(eventId: string, cohostId: string): Promise<ManageResult> {
  const access = await ownerAccess(eventId);
  if (!access) return { ok: false, reason: "not_found" };
  const { data, error } = await createAdminClient().rpc("remove_cohost", {
    p_event_id: eventId,
    p_user_id: access.user.id,
    p_cohost_id: cohostId,
  });
  if (error) throw error;
  if (data === "not_found") return { ok: false, reason: "not_found" };
  if (data !== "removed") throw new Error("remove_cohost returned an unknown outcome");
  return { ok: true, roster: await roster(access) };
}

/**
 * Counts one invite look-up against the requester's IP and, when signed in, their account.
 * Both are counted, so neither a crowd of accounts nor one account behind many addresses gets more.
 */
async function withinLookupLimits(userId: string | null): Promise<boolean> {
  const ip = await requesterIp();
  const byIp = ip ? await consumeRateLimit(INVITE_LOOKUP_PER_IP, ip) : true;
  const byUser = userId ? await consumeRateLimit(INVITE_LOOKUP_PER_USER, `user:${userId}`) : true;
  return byIp && byUser;
}

/**
 * What the invite page shows for `token` (already checked well-formed by the caller). For a usable
 * link: the event's title and the inviter's name, nothing else. For a member of the link's event:
 * that they are one. Otherwise `invalid`, whichever case applies.
 */
export async function previewInvitation(
  token: string,
  userId: string | null,
): Promise<InvitePreview> {
  if (!(await withinLookupLimits(userId))) return { status: "rate_limited" };
  const { data, error } = await createAdminClient().rpc("cohost_invitation_preview", {
    p_token_hash: tokenHashParam(token),
    p_user_id: userId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : undefined;
  if (row?.status === "valid") {
    return { status: "valid", eventTitle: row.event_title, inviterName: row.inviter_name };
  }
  if (row?.status === "member" && row.event_id && row.role) {
    return { status: "member", eventId: row.event_id, eventTitle: row.event_title, role: row.role };
  }
  return { status: "invalid" };
}

/**
 * Joins the signed-in person to the link's event as a co-host. Someone already on the event (the
 * owner included) is told so and keeps their role; the link stays unused for its invitee.
 */
export async function acceptInvitation(token: string): Promise<AcceptInvitationResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "signed_out" };
  if (!(await withinLookupLimits(user.id))) return { ok: false, reason: "rate_limited" };
  const { data, error } = await createAdminClient().rpc("accept_cohost_invitation", {
    p_token_hash: tokenHashParam(token),
    p_user_id: user.id,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : undefined;
  if (
    (row?.outcome === "joined" || row?.outcome === "already_member") &&
    row.event_id &&
    row.role
  ) {
    return { ok: true, eventId: row.event_id, role: row.role, joined: row.outcome === "joined" };
  }
  return { ok: false, reason: "invalid" };
}
