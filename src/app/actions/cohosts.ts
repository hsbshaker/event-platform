"use server";

import { z } from "zod";

import { isWellFormedInviteToken } from "@/lib/cohosts/token";
import {
  CohostOutcomeError,
  acceptInvitation,
  createInvitation,
  loadRoster,
  removeCohost as removeCohostServer,
  revokeInvitation,
  type CohostRoster,
  type PendingInvitation,
} from "@/lib/cohosts/invitations.server";

/**
 * Co-hosts, for the owner, and joining as one (`spec.md §6.1`, §6.2, §25 "Manage co-host access":
 * owner only, §27; `docs/screen-spec.md` `cohost-invite-accept`). See
 * `src/lib/cohosts/invitations.server.ts`.
 *
 * The owner's actions are authorized server-side with `manage_cohosts`; anyone else, and an id
 * that is not an event's, gets the same plain not-found answer as other event reads. A failure is
 * logged by its error's name and code only: never a token, a link or a message that could quote
 * one.
 */

const NOT_FOUND = "This event isn't available.";
const FAILED = "Couldn't do that. Try again.";
const INVALID_INVITE =
  "This invitation link isn't valid anymore. Ask the person who invited you for a new one.";

export type CohostsFailure = {
  ok: false;
  reason: "not_found" | "not_pending" | "rate_limited" | "failed";
  error: string;
};

export type CohostRosterResult = { ok: true; roster: CohostRoster } | CohostsFailure;

export type CreateCohostInviteResult =
  | {
      ok: true;
      /** The link's path, `/invite/<token>`: shown to the owner once and never stored. */
      path: string;
      invitation: PendingInvitation;
      roster: CohostRoster;
    }
  | CohostsFailure;

export type AcceptCohostInviteResult =
  | { ok: true; eventId: string }
  | { ok: false; reason: "invalid" | "signed_out" | "rate_limited" | "failed"; error: string };

const eventSchema = z.uuid();
const revokeSchema = z.strictObject({ eventId: z.uuid(), invitationId: z.uuid() });
const removeSchema = z.strictObject({ eventId: z.uuid(), userId: z.uuid() });

function notFound(): CohostsFailure {
  return { ok: false, reason: "not_found", error: NOT_FOUND };
}

function failed(): CohostsFailure {
  return { ok: false, reason: "failed", error: FAILED };
}

/** What a failure is logged as: never its message or details, which may quote values. */
function logged(error: unknown) {
  const e = error as { name?: unknown; code?: unknown };
  return {
    name: typeof e?.name === "string" ? e.name : typeof error,
    code: typeof e?.code === "string" ? e.code : undefined,
    // Only this code's own errors carry their message: it names a function, never a token.
    ...(error instanceof CohostOutcomeError ? { message: error.message } : {}),
  };
}

/** The event's owner, co-hosts and working invite links. */
export async function loadCohosts(eventId: string): Promise<CohostRosterResult> {
  if (!eventSchema.safeParse(eventId).success) return notFound();
  try {
    const result = await loadRoster(eventId);
    return result.ok ? result : notFound();
  } catch (error) {
    console.error("loadCohosts: failed", { eventId, error: logged(error) });
    return failed();
  }
}

/** A new invite link: works once, for 7 days. */
export async function createCohostInvite(eventId: string): Promise<CreateCohostInviteResult> {
  if (!eventSchema.safeParse(eventId).success) return notFound();
  try {
    const result = await createInvitation(eventId);
    if (result.ok) return result;
    if (result.reason === "rate_limited") {
      return {
        ok: false,
        reason: "rate_limited",
        error: "You've made a lot of invite links. Try again in a little while.",
      };
    }
    return notFound();
  } catch (error) {
    console.error("createCohostInvite: failed", { eventId, error: logged(error) });
    return failed();
  }
}

/** Revokes a pending link: it stops working at once. */
export async function revokeCohostInvite(input: {
  eventId: string;
  invitationId: string;
}): Promise<CohostRosterResult> {
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return notFound();
  const { eventId, invitationId } = parsed.data;
  try {
    const result = await revokeInvitation(eventId, invitationId);
    if (result.ok) return result;
    if (result.reason === "not_pending") {
      return {
        ok: false,
        reason: "not_pending",
        error: "That link was already used or revoked.",
      };
    }
    return notFound();
  } catch (error) {
    console.error("revokeCohostInvite: failed", { eventId, error: logged(error) });
    return failed();
  }
}

/** Removes a co-host from the event. Never the owner. */
export async function removeCohost(input: {
  eventId: string;
  userId: string;
}): Promise<CohostRosterResult> {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return notFound();
  const { eventId, userId } = parsed.data;
  try {
    const result = await removeCohostServer(eventId, userId);
    return result.ok ? result : notFound();
  } catch (error) {
    console.error("removeCohost: failed", { eventId, error: logged(error) });
    return failed();
  }
}

/** `Join event`: makes the signed-in holder of the link a co-host of its event. */
export async function acceptCohostInvite(token: string): Promise<AcceptCohostInviteResult> {
  if (!isWellFormedInviteToken(token)) {
    return { ok: false, reason: "invalid", error: INVALID_INVITE };
  }
  try {
    const result = await acceptInvitation(token);
    if (result.ok) return { ok: true, eventId: result.eventId };
    switch (result.reason) {
      case "signed_out":
        return { ok: false, reason: "signed_out", error: "Sign in to join this event." };
      case "rate_limited":
        return {
          ok: false,
          reason: "rate_limited",
          error: "Too many attempts. Try again a little later.",
        };
      default:
        return { ok: false, reason: "invalid", error: INVALID_INVITE };
    }
  } catch (error) {
    console.error("acceptCohostInvite: failed", { error: logged(error) });
    return { ok: false, reason: "failed", error: "Couldn't join the event. Try again." };
  }
}
