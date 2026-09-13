"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { enforceSignupThrottle } from "@/lib/auth/rate-limit";
import { RateLimitedError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Authentication for the auth/save step (spec.md §7.2 step 4, §4.2 of the design system):
 * Google, Apple or email, and no profile wizard. One system only — Supabase Auth
 * (docs/technology-decisions.md §4).
 *
 * The draft cookie is untouched here: it is what carries the prompt and inspiration through
 * the redirect, and the callback claims it once the session exists.
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

async function callbackUrl(next?: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  const url = new URL("/auth/callback", base);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

async function requesterIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

export async function signInWithOAuth(
  provider: OAuthProvider,
): Promise<{ ok: false; error: string } | never> {
  if (!(await enabledOAuthProviders()).includes(provider)) {
    return { ok: false, error: "That sign-in option is not available yet." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: await callbackUrl() },
  });
  if (error || !data.url) return { ok: false, error: "Could not start sign-in. Try again." };
  redirect(data.url);
}

export type EmailSignInResult = { ok: true; email: string } | { ok: false; error: string };

/** Sends a one-time sign-in link. Lightweight by design: no password, no profile setup. */
export async function signInWithEmail(email: string): Promise<EmailSignInResult> {
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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: address,
    options: { emailRedirectTo: await callbackUrl() },
  });
  if (error) return { ok: false, error: "Could not send the link. Check the address and retry." };
  return { ok: true, email: address };
}

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
