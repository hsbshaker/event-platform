import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Sign-in by token hash (`/auth/confirm`). The post-sign-in decisions are `completeSignIn`'s and
 * are covered through `/auth/callback`'s suite; what matters here is that only a verified email
 * token signs anyone in, that a link opened in another browser still reaches the draft bound to
 * its address, and that a failure never throws the prompt away.
 */

const verifyOtp = vi.fn();
const claimDraftForUser = vi.fn();
const claimDraftForEmail = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp } }),
}));
vi.mock("@/lib/drafts/store", () => ({
  claimDraftForUser: (...args: unknown[]) => claimDraftForUser(...args),
  claimDraftForEmail: (...args: unknown[]) => claimDraftForEmail(...args),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ limit: () => ({ maybeSingle }) }) }),
      }),
    }),
  }),
}));

const ORIGIN = "https://example.test";

async function confirm(query: string) {
  const { GET } = await import("./route");
  return GET(new NextRequest(`${ORIGIN}/auth/confirm${query}`));
}

function location(response: Response): string {
  return response.headers.get("location") ?? "";
}

beforeEach(() => {
  verifyOtp.mockResolvedValue({
    data: { user: { id: "user-1", email: "host@example.test" } },
    error: null,
  });
  claimDraftForUser.mockResolvedValue({ outcome: "claimed", eventId: "event-1", hadToken: true });
  claimDraftForEmail.mockResolvedValue({ outcome: "not_found", eventId: null });
  maybeSingle.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("auth confirm", () => {
  it("verifies the token hash and sends the draft bound to the address to its event", async () => {
    claimDraftForEmail.mockResolvedValue({ outcome: "claimed", eventId: "event-2" });
    const response = await confirm("?token_hash=hash-1&type=email");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "hash-1", type: "email" });
    expect(location(response)).toBe(`${ORIGIN}/events/event-2/create`);
    expect(claimDraftForEmail).toHaveBeenCalledWith("user-1", "host@example.test");
  });

  it("accepts the magic-link and sign-up types an email sign-in sends", async () => {
    claimDraftForEmail.mockResolvedValue({ outcome: "claimed", eventId: "event-2" });
    for (const type of ["magiclink", "signup"]) {
      expect(location(await confirm(`?token_hash=h&type=${type}`)), type).toBe(
        `${ORIGIN}/events/event-2/create`,
      );
    }
  });

  it("never claims the draft this browser's cookie names (login CSRF)", async () => {
    // A token hash proves control of an address, not of this browser: an attacker's own link
    // opened in a victim's browser must not move the victim's prompt to the attacker's account.
    // With nothing bound to the address, the person lands on the composer, draft untouched.
    expect(location(await confirm("?token_hash=h&type=email"))).toBe(`${ORIGIN}/`);
    expect(claimDraftForUser).not.toHaveBeenCalled();
    expect(claimDraftForEmail).toHaveBeenCalledWith("user-1", "host@example.test");
  });

  it("never claims when verification fails, so a retry can still succeed", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    expect(location(await confirm("?token_hash=h&type=email"))).toBe(
      `${ORIGIN}/signin?error=exchange`,
    );
    expect(claimDraftForUser).not.toHaveBeenCalled();
  });

  it("refuses a missing token, a missing type and a type that is not an email sign-in", async () => {
    for (const query of [
      "",
      "?type=email",
      "?token_hash=h",
      "?token_hash=h&type=recovery",
      "?token_hash=h&type=invite",
      "?token_hash=h&type=email_change",
    ]) {
      expect(location(await confirm(query)), query).toBe(`${ORIGIN}/signin?error=missing_code`);
    }
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(claimDraftForUser).not.toHaveBeenCalled();
  });

  it("refuses an off-site next parameter", async () => {
    claimDraftForUser.mockResolvedValue({ outcome: "not_found", eventId: null, hadToken: false });
    for (const next of [
      "https://evil.test/steal",
      "//evil.test",
      "/\\evil.test",
      "/..//evil.test",
    ]) {
      expect(
        location(await confirm(`?token_hash=h&type=email&next=${encodeURIComponent(next)}`)),
        next,
      ).toBe(`${ORIGIN}/`);
    }
  });
});
