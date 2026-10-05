"use server";

import { z } from "zod";

import { loadEventDraft, type EventDraftView } from "@/app/actions/event-details";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { revealCode, rotateCode, setPrivacy } from "@/lib/events/privacy.server";

/**
 * Privacy and the private event code, for the owner and co-hosts (`spec.md §14.1`, §14.2, §8.1,
 * §25 "Manage privacy/access code", §27; `docs/screen-spec.md` `event-details-editor`). The one
 * path for every visibility change, before and after publish: `updateEventDetails` does not write
 * visibility. See `src/lib/events/privacy.server.ts`.
 *
 * Codes are returned to the caller formatted `XXXX-XXXX` and never logged: a failure is logged by
 * its error's name and code only. Anyone who is not the event's owner or a co-host, and an id
 * that is not an event's, gets the same plain not-found answer as other event reads (`spec.md
 * §27`).
 */

const NOT_FOUND = "This event isn't available.";
const FAILED = "Couldn't save that. Try again.";

export type PrivacyFailure = {
  ok: false;
  reason: "not_found" | "not_private" | "rate_limited" | "failed";
  error: string;
};

export type SetEventPrivacyResult =
  | {
      ok: true;
      /** The event after the change, as the details editor reads it. */
      event: EventDraftView;
      /** The event code (`XXXX-XXXX`) when private; null when public. */
      code: string | null;
      /** Private, but the stored code cannot be read: the host can make a new one. */
      codeUnreadable?: true;
    }
  | PrivacyFailure;

export type EventCodeResult = { ok: true; code: string } | PrivacyFailure;

export type RevealEventCodeResult =
  | {
      ok: true;
      /** The event code (`XXXX-XXXX`), or null when the event is not private. */
      code: string | null;
    }
  | PrivacyFailure;

const setSchema = z.strictObject({
  eventId: z.uuid(),
  visibility: z.enum(["public", "private"]),
});

const eventSchema = z.strictObject({ eventId: z.uuid() });

export type SetEventPrivacyInput = z.input<typeof setSchema>;

function notFound(): PrivacyFailure {
  return { ok: false, reason: "not_found", error: NOT_FOUND };
}

/** What a failure is logged as: never its message or details, which may quote values. */
function logged(error: unknown) {
  const e = error as { name?: unknown; code?: unknown };
  return {
    name: typeof e?.name === "string" ? e.name : typeof error,
    code: typeof e?.code === "string" ? e.code : undefined,
  };
}

/**
 * Makes the event public or private. Going private with no code stored makes one and stores it
 * with the change; a stored code is kept either way, so switching back to private reuses it.
 */
export async function setEventPrivacy(input: SetEventPrivacyInput): Promise<SetEventPrivacyResult> {
  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return notFound();
  const { eventId, visibility } = parsed.data;
  try {
    const result = await setPrivacy(eventId, visibility);
    if (!result.ok) return notFound();
    const event = await loadEventDraft(eventId);
    if (!event) return notFound();
    return result.codeUnreadable
      ? { ok: true, event, code: null, codeUnreadable: true }
      : { ok: true, event, code: result.code };
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) return notFound();
    console.error("setEventPrivacy: failed", { eventId, error: logged(error) });
    return { ok: false, reason: "failed", error: FAILED };
  }
}

/** A new code for a private event (`New code`); the old one stops working. Rate-limited per event. */
export async function newEventCode(input: { eventId: string }): Promise<EventCodeResult> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return notFound();
  const { eventId } = parsed.data;
  try {
    const result = await rotateCode(eventId);
    if (result.ok) return result;
    switch (result.reason) {
      case "not_found":
        return notFound();
      case "not_private":
        return {
          ok: false,
          reason: "not_private",
          error: "Make the invitation private to give it an event code.",
        };
      case "rate_limited":
        return {
          ok: false,
          reason: "rate_limited",
          error: "You've made a lot of new codes. Try again in a little while.",
        };
    }
  } catch (error) {
    console.error("newEventCode: failed", { eventId, error: logged(error) });
    return { ok: false, reason: "failed", error: FAILED };
  }
}

/** The event's code, for the owner and co-hosts to share; null when the event is not private. */
export async function revealEventCode(eventId: string): Promise<RevealEventCodeResult> {
  if (!z.uuid().safeParse(eventId).success) return notFound();
  try {
    const result = await revealCode(eventId);
    return result.ok ? result : notFound();
  } catch (error) {
    console.error("revealEventCode: failed", { eventId, error: logged(error) });
    return { ok: false, reason: "failed", error: "Couldn't show the event code. Try again." };
  }
}
