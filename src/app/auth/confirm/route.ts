import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { completeSignIn, safeNext } from "../complete-sign-in";

/**
 * Sign-in by token hash: verify a one-time email token on its own, then attach the pre-auth
 * draft exactly as `/auth/callback` does (`completeSignIn`; spec.md §7.2 steps 4-6).
 *
 * Unlike the callback's code exchange, nothing has to be stored in the browser beforehand, so a
 * link opened in a mail app's browser, another profile or another device still signs the person
 * in; the draft then follows by the email it was bound to. The token is single-use and expires
 * (the project's OTP expiry), and Supabase verifies it; this route never sees a password or a
 * session secret in the URL. Only email sign-in types are accepted: invite, recovery and
 * email-change links are not this app's and are refused like an incomplete link.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGN_IN_TYPES: ReadonlySet<EmailOtpType> = new Set(["email", "magiclink", "signup"]);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"), origin);

  if (!tokenHash || !type || !SIGN_IN_TYPES.has(type)) {
    const target = new URL("/signin", origin);
    target.searchParams.set("error", "missing_code");
    return NextResponse.redirect(target);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) {
    const target = new URL("/signin", origin);
    target.searchParams.set("error", "exchange");
    return NextResponse.redirect(target);
  }

  return completeSignIn(data.user, origin, next);
}
