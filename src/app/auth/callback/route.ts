import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeSignIn, safeNext } from "../complete-sign-in";

/**
 * Auth callback: complete the sign-in, then attach the pre-auth draft to the new owner
 * (spec.md §7.2 steps 4-6; `completeSignIn`). This and `/auth/confirm` are the only places an
 * event is created.
 *
 * The session exchange is a one-time code checked against the verifier this browser stored when
 * sign-in began (PKCE), so it completes only in that browser; `/auth/confirm` verifies a token
 * hash that needs nothing stored. Nothing here calls a model (§32 #4).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  return completeSignIn(data.user, origin, next);
}
