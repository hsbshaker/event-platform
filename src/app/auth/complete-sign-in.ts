import "server-only";

import { NextResponse } from "next/server";
import { claimDraftForEmail, claimDraftForUser, type ClaimResult } from "@/lib/drafts/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What every sign-in route does once Supabase has a session for the person (spec.md §7.2
 * steps 4-6): attach the pre-auth draft to its new owner and send them where it leads. Shared by
 * `/auth/callback` (a one-time code exchanged with this browser's verifier) and `/auth/confirm`
 * (a one-time token hash verified on its own), so both land a person in exactly the same place.
 *
 * Idempotent by construction: the claim is decided inside `claim_pre_auth_draft` under a row
 * lock, so a retried or double-fired sign-in with the same draft token returns the event the
 * first call created instead of making a second one. Nothing here calls a model (§32 #4).
 */

/**
 * The `next` parameter as an absolute, same-origin URL, or null. Never a string.
 *
 * Two separate traps, and each defeats the obvious guard for the other:
 *
 * 1. Prefix checks are not enough. WHATWG URL parsing treats a backslash as a slash for
 *    http(s), so `/\evil.test` begins with a single `/` yet resolves to `https://evil.test/`.
 *    Resolving against our own origin and comparing origins catches that.
 * 2. Comparing origins and handing back a *path* is not enough either. A pathname may itself
 *    begin with `//`, and a caller that re-resolves it then reads it as scheme-relative:
 *    `//ourhost//evil.test` and `/..//evil.test` both parse to pathname `//evil.test`, which
 *    resolves to `https://evil.test/` the second time round.
 *
 * So this returns the parsed URL itself and callers redirect to it directly, with no second
 * resolution for a payload to survive into. The explicit `//` rejection is belt and braces:
 * it holds even if a caller ever does rebuild a string from this.
 */
export function safeNext(value: string | null, origin: string): URL | null {
  if (!value || !value.startsWith("/")) return null;
  let resolved: URL;
  try {
    resolved = new URL(value, origin);
  } catch {
    return null;
  }
  if (resolved.origin !== origin) return null;
  if (resolved.pathname.startsWith("//")) return null;
  return resolved;
}

/** The person a sign-in route has just signed in. */
export interface SignedInUser {
  id: string;
  email?: string | null;
}

export interface CompleteSignInOptions {
  /**
   * Claim the draft this browser's cookie names. Only a sign-in bound to this browser may: the
   * callback's code exchange needs the verifier this browser stored (PKCE), so the person signing
   * in is the one who wrote here. `/auth/confirm` passes `false`: its token hash works in any
   * browser, so an attacker could open their own link in a victim's browser (login CSRF), and a
   * cookie claim would then hand the victim's prompt and inspiration to the attacker's account.
   * The draft still follows by the address it was bound to when the link was requested.
   */
  claimByCookie?: boolean;
}

export async function completeSignIn(
  user: SignedInUser,
  origin: string,
  next: URL | null,
  { claimByCookie = true }: CompleteSignInOptions = {},
): Promise<NextResponse> {
  let claim: ClaimResult = claimByCookie
    ? await claimDraftForUser(user.id)
    : { outcome: "not_found", eventId: null, hadToken: false };

  // No draft claimed by this browser's cookie (none there, or not asked to look). The link may
  // have been opened in a mail-app webview, another browser profile or another device, where the
  // cookie cannot follow. If a draft was bound
  // to this address when the link was requested, the session just proved control of that
  // address, which is exactly the authority needed to receive it (spec.md §7.2).
  if (claim.outcome === "not_found" && user.email) {
    const byEmail = await claimDraftForEmail(user.id, user.email);
    if (byEmail.outcome !== "not_found") claim = { ...byEmail, hadToken: claim.hadToken };
  }

  // A draft in flight wins over `next` (an invite link): its outcome must reach the person — the
  // event just made from their prompt, or why their prompt could not be restored (spec.md §7.2) —
  // and the invite link stays valid for them to open again.
  if (claim.eventId) {
    return NextResponse.redirect(new URL(`/events/${claim.eventId}/create`, origin));
  }

  switch (claim.outcome) {
    case "claimed_by_other": {
      // Someone else already turned that draft into their event. Say so plainly rather than
      // silently dropping the person into an empty composer.
      const target = new URL("/", origin);
      target.searchParams.set("restore", "taken");
      return NextResponse.redirect(target);
    }
    case "expired": {
      // The server copy is gone. The composer restores from its own local copy and tells the
      // user what happened: a restore failure must never silently discard their input.
      const target = new URL("/", origin);
      target.searchParams.set("restore", "expired");
      return NextResponse.redirect(target);
    }
    default: {
      if (claim.hadToken) {
        // This browser did carry a draft token and the server has no such draft. Treat it
        // like an expired one rather than dropping them into an empty composer with no
        // explanation: §7.2 calls losing the prompt a critical product failure, and the
        // composer's local mirror still holds their text.
        const target = new URL("/", origin);
        target.searchParams.set("restore", "expired");
        return NextResponse.redirect(target);
      }
      // Signed in without a draft in flight (for example straight from "Sign in"): continue
      // to the most recent event they own, or to the composer when there is none.
      const admin = createAdminClient();
      const { data: latest } = await admin
        .from("events")
        .select("id")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const fallback = latest?.id ? `/events/${latest.id}/create` : "/";
      return NextResponse.redirect(next ?? new URL(fallback, origin));
    }
  }
}
