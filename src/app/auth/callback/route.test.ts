import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The auth callback's decisions (spec.md §7.2 steps 4-6).
 *
 * The claim's atomicity is proven against a real database in tests/db/phase2.test.ts; what
 * matters here is that every outcome the claim can return lands the person somewhere sensible
 * and that a failed sign-in never throws their prompt away.
 */

const exchangeCodeForSession = vi.fn();
const claimDraftForUser = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession } }),
}));
vi.mock("@/lib/drafts/store", () => ({
  claimDraftForUser: (...args: unknown[]) => claimDraftForUser(...args),
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

async function callback(query: string) {
  const { GET } = await import("./route");
  return GET(new NextRequest(`${ORIGIN}/auth/callback${query}`));
}

function location(response: Response): string {
  return response.headers.get("location") ?? "";
}

beforeEach(() => {
  exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  claimDraftForUser.mockResolvedValue({ outcome: "claimed", eventId: "event-1" });
  maybeSingle.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("auth callback", () => {
  it("sends a newly claimed draft to its event", async () => {
    const response = await callback("?code=abc");
    expect(location(response)).toBe(`${ORIGIN}/events/event-1/create`);
    expect(claimDraftForUser).toHaveBeenCalledWith("user-1");
  });

  it("sends a retried callback to the same event rather than making another", async () => {
    claimDraftForUser.mockResolvedValue({
      outcome: "already_claimed_by_user",
      eventId: "event-1",
    });
    const first = await callback("?code=abc");
    const second = await callback("?code=abc");
    expect(location(first)).toBe(`${ORIGIN}/events/event-1/create`);
    expect(location(second)).toBe(location(first));
  });

  it("explains a draft another account already claimed", async () => {
    claimDraftForUser.mockResolvedValue({ outcome: "claimed_by_other", eventId: null });
    expect(location(await callback("?code=abc"))).toBe(`${ORIGIN}/?restore=taken`);
  });

  it("returns an expired draft to the composer with a restore notice", async () => {
    claimDraftForUser.mockResolvedValue({ outcome: "expired", eventId: null });
    expect(location(await callback("?code=abc"))).toBe(`${ORIGIN}/?restore=expired`);
  });

  it("continues to the most recent event when there was no draft", async () => {
    claimDraftForUser.mockResolvedValue({ outcome: "not_found", eventId: null });
    maybeSingle.mockResolvedValue({ data: { id: "event-9" }, error: null });
    expect(location(await callback("?code=abc"))).toBe(`${ORIGIN}/events/event-9/create`);
  });

  it("falls back to the composer for a first-time sign-in with nothing to open", async () => {
    claimDraftForUser.mockResolvedValue({ outcome: "not_found", eventId: null });
    expect(location(await callback("?code=abc"))).toBe(`${ORIGIN}/`);
  });

  it("never claims when the session exchange fails, so a retry can still succeed", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    expect(location(await callback("?code=abc"))).toBe(`${ORIGIN}/signin?error=exchange`);
    expect(claimDraftForUser).not.toHaveBeenCalled();
  });

  it("handles a cancelled provider and a missing code without touching the draft", async () => {
    expect(location(await callback("?error=access_denied"))).toBe(
      `${ORIGIN}/signin?error=provider`,
    );
    expect(location(await callback(""))).toBe(`${ORIGIN}/signin?error=missing_code`);
    expect(claimDraftForUser).not.toHaveBeenCalled();
  });

  it("refuses an off-site next parameter", async () => {
    expect(location(await callback("?code=abc&next=https://evil.test/steal"))).toBe(
      `${ORIGIN}/events/event-1/create`,
    );
    expect(location(await callback("?code=abc&next=//evil.test"))).toBe(
      `${ORIGIN}/events/event-1/create`,
    );
  });

  it("refuses a backslash-smuggled off-site next parameter", async () => {
    // URL parsing treats `\\` as `/` for http(s), so these all resolve to https://evil.test/
    // even though each starts with a single `/`. A prefix check would let them through.
    for (const next of ["/\\evil.test", "/\\/evil.test", "/\\\\evil.test"]) {
      expect(location(await callback(`?code=abc&next=${encodeURIComponent(next)}`)), next).toBe(
        `${ORIGIN}/events/event-1/create`,
      );
    }
  });

  it("keeps a percent-encoded backslash as an ordinary same-origin path", async () => {
    expect(location(await callback("?code=abc&next=%2F%255Cevil.test"))).toBe(
      `${ORIGIN}/%5Cevil.test`,
    );
  });

  it("honours a same-origin next parameter", async () => {
    expect(location(await callback("?code=abc&next=/events/event-1/create?welcome=1"))).toBe(
      `${ORIGIN}/events/event-1/create?welcome=1`,
    );
  });
});
