import { NextResponse, type NextRequest } from "next/server";
import { claimDraftForUser } from "@/lib/drafts/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback: complete the sign-in, then attach the pre-auth draft to the new owner
 * (spec.md §7.2 steps 4-6). This is the only place an event is created.
 *
 * Idempotent by construction. The session exchange is a one-time code; the claim is decided
 * inside `claim_pre_auth_draft` under a row lock, so a retried or double-fired callback with
 * the same draft token returns the event the first call created instead of making a second
 * one. Nothing here calls a model: generation is Phase 4, and §32 #4 forbids it before auth
 * in any case.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
function safeNext(value: string | null, origin: string): URL | null {
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

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const authError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const next = safeNext(url.searchParams.get("next"), origin);

  // The provider refused or the user cancelled. Keep the draft cookie: their prompt and
  // inspiration are still on the server and a second attempt must be able to claim them.
  if (authError || !code) {
    const target = new URL("/signin", origin);
    target.searchParams.set("error", authError ? "provider" : "missing_code");
    return NextResponse.redirect(target);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    const target = new URL("/signin", origin);
    target.searchParams.set("error", "exchange");
    return NextResponse.redirect(target);
  }

  const claim = await claimDraftForUser(data.user.id);

  if (claim.eventId) {
    return NextResponse.redirect(next ?? new URL(`/events/${claim.eventId}/create`, origin));
  }

  switch (claim.outcome) {
    case "claimed_by_other": {
      // Someone else already turned that draft into their event. Say so plainly rather than
      // silently dropping the person into an empty composer.
      const target = next ?? new URL("/", origin);
      target.searchParams.set("restore", "taken");
      return NextResponse.redirect(target);
    }
    case "expired": {
      // The server copy is gone. The composer restores from its own local copy and tells the
      // user what happened: a restore failure must never silently discard their input.
      const target = next ?? new URL("/", origin);
      target.searchParams.set("restore", "expired");
      return NextResponse.redirect(target);
    }
    default: {
      if (claim.hadToken) {
        // This browser did carry a draft token and the server has no such draft. Treat it
        // like an expired one rather than dropping them into an empty composer with no
        // explanation: §7.2 calls losing the prompt a critical product failure, and the
        // composer's local mirror still holds their text.
        const target = next ?? new URL("/", origin);
        target.searchParams.set("restore", "expired");
        return NextResponse.redirect(target);
      }
      // Signed in without a draft in flight (for example straight from "Sign in"): continue
      // to the most recent event they own, or to the composer when there is none.
      const admin = createAdminClient();
      const { data: latest } = await admin
        .from("events")
        .select("id")
        .eq("owner_id", data.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const fallback = latest?.id ? `/events/${latest.id}/create` : "/";
      return NextResponse.redirect(next ?? new URL(fallback, origin));
    }
  }
}
