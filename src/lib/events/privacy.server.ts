import "server-only";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requireEventAccess, type EventAccess } from "@/lib/auth/event-access";
import { consumeRateLimit, type RateLimitRule } from "@/lib/auth/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  AccessCodeCryptoError,
  decryptEventCode,
  encryptEventCode,
  generateEventCode,
} from "./access-code-crypto.server";
import { formatEventCode } from "./event-code";

/**
 * Privacy and the private event code (`spec.md §14.1`, §14.2, §8.1, §25 "Manage privacy/access
 * code", §27; AGENTS.md "the privacy action").
 *
 * Every visibility change goes through `setPrivacy`, before and after publish: the signed-in
 * owner's or co-host's access is checked (`manage_privacy`), a fresh code is encrypted for the
 * case where none is stored, and the server-only `set_event_privacy`
 * (20261011000000_event_privacy.sql) writes the visibility and the encrypted code in one
 * transaction under the event's lock, checking membership again. Going private with no stored code
 * stores the new one; a stored code is kept both ways, so switching back to private reuses it.
 * `rotateCode` replaces a private event's code (rate-limited per event); `revealCode` decrypts it
 * for the owner and co-hosts.
 *
 * A caller who is not the event's owner or a co-host, a signed-out caller and an event that does
 * not exist all read as `not_found`, so nothing here says whether an event exists (`spec.md
 * §27`). Codes leave this module only as return values, formatted `XXXX-XXXX`; nothing here logs.
 */

/** New codes per event: enough for a host who changes their mind, not for churning codes. */
export const EVENT_CODE_ROTATION: RateLimitRule = {
  bucket: "event-code:rotate",
  windowSeconds: 3600,
  max: 20,
};

export type Visibility = "public" | "private";

export type SetPrivacyResult =
  | {
      ok: true;
      visibility: Visibility;
      /**
       * The code when private; null when public, or when the stored code cannot be read (see
       * `codeUnreadable`).
       */
      code: string | null;
      /**
       * The change was saved, but the event's stored code does not decrypt (the application key
       * changed, or the value was damaged). The host can make a new code; the old one is unusable.
       */
      codeUnreadable?: true;
    }
  | { ok: false; reason: "not_found" };

export type RotateCodeResult =
  { ok: true; code: string } | { ok: false; reason: "not_found" | "not_private" | "rate_limited" };

export type RevealCodeResult =
  { ok: true; code: string | null } | { ok: false; reason: "not_found" };

/** The member's access, or null for anyone who may not manage the event's privacy. */
async function privacyAccess(eventId: string): Promise<EventAccess | null> {
  try {
    return await requireEventAccess(eventId, "manage_privacy");
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) return null;
    throw error;
  }
}

/** bytea as PostgREST sends it (`\x` and hex) and takes it. */
function toBytea(bytes: Buffer): string {
  return `\\x${bytes.toString("hex")}`;
}

function fromBytea(value: unknown): Buffer {
  if (typeof value !== "string" || !value.startsWith("\\x")) {
    throw new Error("Unexpected bytea encoding.");
  }
  return Buffer.from(value.slice(2), "hex");
}

function revealed(stored: unknown, eventId: string): string {
  return formatEventCode(decryptEventCode(fromBytea(stored), eventId));
}

type CodeRow = { outcome: string; code_encrypted: string | null };

function oneRow(data: unknown, fn: string): CodeRow {
  const row = Array.isArray(data) ? (data[0] as CodeRow | undefined) : undefined;
  if (!row) throw new Error(`${fn} returned no outcome`);
  return row;
}

/**
 * Sets the event's visibility. Private: the stored code, or a new one stored in the same
 * transaction, returned formatted. Public: the stored code is kept, and none is returned.
 */
export async function setPrivacy(
  eventId: string,
  visibility: Visibility,
): Promise<SetPrivacyResult> {
  const access = await privacyAccess(eventId);
  if (!access) return { ok: false, reason: "not_found" };

  // Offered for the case where no code is stored; the function keeps a stored one.
  const offered =
    visibility === "private" ? toBytea(encryptEventCode(generateEventCode(), eventId)) : null;
  // Authorized above for this event only; the function is service-role only.
  const { data, error } = await createAdminClient().rpc("set_event_privacy", {
    p_event_id: eventId,
    p_user_id: access.user.id,
    p_visibility: visibility,
    p_code_encrypted: offered,
  });
  if (error) throw error;
  const row = oneRow(data, "set_event_privacy");
  if (row.outcome === "not_found") return { ok: false, reason: "not_found" };
  if (row.outcome !== "saved") throw new Error("set_event_privacy returned an unknown outcome");
  if (visibility === "public") return { ok: true, visibility, code: null };
  if (row.code_encrypted === null) throw new Error("set_event_privacy stored no code");
  try {
    return { ok: true, visibility, code: revealed(row.code_encrypted, eventId) };
  } catch (error) {
    // The visibility is saved either way; say so honestly rather than as a failed save.
    if (!(error instanceof AccessCodeCryptoError)) throw error;
    console.error("setPrivacy: the stored event code does not decrypt", { eventId });
    return { ok: true, visibility, code: null, codeUnreadable: true };
  }
}

/** A new code for a private event; the old one stops working at once. */
export async function rotateCode(eventId: string): Promise<RotateCodeResult> {
  const access = await privacyAccess(eventId);
  if (!access) return { ok: false, reason: "not_found" };
  // Counted only for a member, so nobody else can spend an event's allowance.
  if (!(await consumeRateLimit(EVENT_CODE_ROTATION, `event:${eventId}`))) {
    return { ok: false, reason: "rate_limited" };
  }

  const { data, error } = await createAdminClient().rpc("rotate_event_code", {
    p_event_id: eventId,
    p_user_id: access.user.id,
    p_code_encrypted: toBytea(encryptEventCode(generateEventCode(), eventId)),
  });
  if (error) throw error;
  const row = oneRow(data, "rotate_event_code");
  if (row.outcome === "not_found" || row.outcome === "not_private") {
    return { ok: false, reason: row.outcome };
  }
  if (row.outcome !== "rotated" || row.code_encrypted === null) {
    throw new Error("rotate_event_code returned an unknown outcome");
  }
  return { ok: true, code: revealed(row.code_encrypted, eventId) };
}

/**
 * The event's code, decrypted for its owner or a co-host (`spec.md §14.2`: "authorized owner/co-host
 * share UI may decrypt/reveal the code"); null when the event is not private or has no code.
 * Read through the member's own session (RLS), so no service role is needed.
 */
export async function revealCode(eventId: string): Promise<RevealCodeResult> {
  const access = await privacyAccess(eventId);
  if (!access) return { ok: false, reason: "not_found" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("visibility, access_code_encrypted")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };
  if (data.visibility !== "private" || data.access_code_encrypted === null) {
    return { ok: true, code: null };
  }
  return { ok: true, code: revealed(data.access_code_encrypted, eventId) };
}
