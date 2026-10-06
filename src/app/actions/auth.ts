"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { enforceSignupThrottle } from "@/lib/auth/rate-limit";
import { RateLimitedError } from "@/lib/auth/errors";
import { requesterIp } from "@/lib/auth/requester";
import { isInvitePath } from "@/lib/cohosts/token";
import { bindDraftToEmail } from "@/lib/drafts/store";
import { createClient } from "@/lib/supabase/server";

/**
 * Authentication for the auth/save step (spec.md §7.2 step 4, §4.2 of the design system):
 * Google, Apple or email, and no profile wizard. One system only — Supabase Auth
 * (docs/technology-decisions.md §4).
 *
 * The draft cookie is untouched here: it is what carries the prompt and inspiration through
 * the redirect, and the OAuth callback claims it once the session exists. An email link may be
 * opened in any browser, so its draft follows the address it is bound to here instead.
 *
 * `next` is where the person returns after signing in, carried as the sign-in route's `next`
 * (which validates it again). Only a co-host invite page's path is accepted (`spec.md §6.2`: "A
 * co-host invitation preserves its token through authentication"); anything else is dropped, so
 * the default destinations stand.
 */

export type OAuthProvider = "google" | "apple";

/** OAuth providers configured for this deployment. Unconfigured ones are not offered. */
export async function enabledOAuthProviders(): Promise<OAuthProvider[]> {
  const raw = process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? "";
  return raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is OAuthProvider => p === "google" || p === "apple");
}

/**
 * This deployment's URL for a sign-in route, from the request's own host, with `params` set in
 * order. OAuth returns to `/auth/callback` (a PKCE code). An email link returns to
 * `/auth/confirm` with `type` first: the email template appends `&token_hash=…` to this URL as
 * given (`{{ .RedirectTo }}`), so it must already carry a query, and a template that still
 * uses Supabase's own verify page sends a PKCE code here instead, which `/auth/confirm` hands to
 * the callback.
 */
async function signInUrl(
  path: "/auth/callback" | "/auth/confirm",
  params: Record<string, string | undefined>,
): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  const base = host
    ? `${proto}://${host}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

/** `next` when it is a destination sign-in may return to; otherwise none. */
function allowedNext(next: unknown): string | undefined {
  return isInvitePath(next) ? next : undefined;
}

export async function signInWithOAuth(
  provider: OAuthProvider,
  next?: string,
): Promise<{ ok: false; error: string } | never> {
  if (!(await enabledOAuthProviders()).includes(provider)) {
    return { ok: false, error: "That sign-in option is not available yet." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: await signInUrl("/auth/callback", { next: allowedNext(next) }) },
  });
  if (error || !data.url) return { ok: false, error: "Could not start sign-in. Try again." };
  redirect(data.url);
}

export type EmailSignInResult = { ok: true; email: string } | { ok: false; error: string };

/** Sends a one-time sign-in link. Lightweight by design: no password, no profile setup. */
export async function signInWithEmail(email: string, next?: string): Promise<EmailSignInResult> {
  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  try {
    const ip = await requesterIp();
    if (ip) await enforceSignupThrottle(ip);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { ok: false, error: "Too many attempts. Try again a little later." };
    }
    throw error;
  }

  // Record the address on this browser's draft BEFORE the link goes out, so a link opened in
  // a mail-app webview, another browser profile or another device can still restore what they
  // wrote (spec.md §7.2). Nothing secret is put in the link itself.
  await bindDraftToEmail(address);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: address,
    options: {
      emailRedirectTo: await signInUrl("/auth/confirm", {
        type: "email",
        next: allowedNext(next),
      }),
    },
  });
  if (error) return { ok: false, error: "Could not send the link. Check the address and retry." };
  return { ok: true, email: address };
}

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
