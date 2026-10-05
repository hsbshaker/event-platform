import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateInviteToken } from "@/lib/cohosts/token";

/**
 * Sign-in carries a co-host invite through authentication (`spec.md §6.2`: "A co-host invitation
 * preserves its token through authentication"; `docs/screen-spec.md` `cohost-invite-accept`):
 * the invite page's path rides as the auth callback's `next`, for OAuth and for the email link,
 * and nothing else can ride along.
 */

const calls = vi.hoisted(() => ({
  otp: [] as { email: string; options: { emailRedirectTo: string } }[],
  oauth: [] as { provider: string; options: { redirectTo: string } }[],
  redirects: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithOtp: async (args: { email: string; options: { emailRedirectTo: string } }) => {
        calls.otp.push(args);
        return { error: null };
      },
      signInWithOAuth: async (args: { provider: string; options: { redirectTo: string } }) => {
        calls.oauth.push(args);
        return { data: { url: "https://accounts.example/authorize" }, error: null };
      },
    },
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "app.test", "x-forwarded-proto": "https" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    calls.redirects.push(url);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/auth/rate-limit", () => ({ enforceSignupThrottle: async () => {} }));
vi.mock("@/lib/drafts/store", () => ({ bindDraftToEmail: async () => {} }));

const { signInWithEmail, signInWithOAuth } = await import("./auth");

beforeEach(() => {
  calls.otp = [];
  calls.oauth = [];
  calls.redirects = [];
  process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "google";
});

function nextOf(url: string): string | null {
  return new URL(url).searchParams.get("next");
}

describe("the destination after sign-in", () => {
  it("carries an invite page's path through the email link and OAuth", async () => {
    const path = `/invite/${generateInviteToken()}`;
    expect(await signInWithEmail("guest@example.com", path)).toEqual({
      ok: true,
      email: "guest@example.com",
    });
    expect(calls.otp[0]!.options.emailRedirectTo).toBe(
      `https://app.test/auth/callback?next=${encodeURIComponent(path)}`,
    );
    expect(nextOf(calls.otp[0]!.options.emailRedirectTo)).toBe(path);

    await expect(signInWithOAuth("google", path)).rejects.toThrow("NEXT_REDIRECT");
    expect(nextOf(calls.oauth[0]!.options.redirectTo)).toBe(path);
  });

  it("drops anything that is not an invite page's path", async () => {
    for (const next of [
      undefined,
      "/",
      "/events/6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11",
      "https://evil.test/",
      "//evil.test",
      `/invite/${generateInviteToken()}?then=//evil.test`,
      "/invite/short",
    ]) {
      calls.otp = [];
      await signInWithEmail("guest@example.com", next);
      expect(calls.otp[0]!.options.emailRedirectTo, String(next)).toBe(
        "https://app.test/auth/callback",
      );
    }
  });
});
