import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { RateLimitedError } from "@/lib/auth/errors";
import { resetEnvCache } from "@/lib/env";

/**
 * Issuing the anonymous reviewer capability.
 *
 * This endpoint is the only thing standing between "anyone can name the row a submission writes"
 * and "only this deployment can". So what matters is that it mints something unforgeable, mints a
 * distinct one every time, refuses a cross-origin caller, and is never cached — two reviewers
 * handed the same capability would share a row and one would silently overwrite the other.
 */

const enforceRateLimit = vi.fn();

vi.mock("@/lib/auth/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => enforceRateLimit(...args),
}));

const { POST } = await import("./route");
const { resolveCapability } = await import("@/lib/human-test/capability");

const HOST = "survey.example.com";
const APP_KEY = Buffer.alloc(32, 7).toString("base64");

function request(headers: Record<string, string> = {}) {
  return new NextRequest(`https://${HOST}/api/human-test-1/session`, {
    method: "POST",
    headers: { host: HOST, origin: `https://${HOST}`, ...headers },
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-role-key";
  process.env.APP_ENCRYPTION_KEY = APP_KEY;
  resetEnvCache();
  enforceRateLimit.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("issuing a capability", () => {
  it("mints one this deployment can resolve", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const resolved = resolveCapability(body.capability, APP_KEY);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(body.expiresAt).toBe(resolved.expiresAt);
  });

  it("mints a distinct one every time, so two reviewers never share a row", async () => {
    const keys = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const body = await (await POST(request())).json();
      const resolved = resolveCapability(body.capability, APP_KEY);
      if (resolved.ok) keys.add(resolved.submissionKey);
    }
    expect(keys.size).toBe(25);
  });

  it("is never cached", async () => {
    // A cached capability handed to two reviewers would make the second overwrite the first.
    expect((await POST(request())).headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a cross-origin caller", async () => {
    const res = await POST(request({ origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Not available." });
  });

  it("refuses a caller with no Origin at all", async () => {
    const res = await POST(
      new NextRequest(`https://${HOST}/api/human-test-1/session`, {
        method: "POST",
        headers: { host: HOST },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("emits no CORS headers", async () => {
    const res = await POST(request());
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rate limits, without saying anything about the survey", async () => {
    enforceRateLimit.mockRejectedValueOnce(new RateLimitedError("human_test_1:session:ip"));
    const res = await POST(request({ "x-forwarded-for": "203.0.113.9" }));
    expect(res.status).toBe(429);
    expect(await res.text()).not.toMatch(/model|library|proof-b|score/i);
  });

  it("fails closed, and says nothing, when the signing key is unusable", async () => {
    delete process.env.APP_ENCRYPTION_KEY;
    resetEnvCache();
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Not available." });
  });

  it("reveals nothing about the experiment in any response", async () => {
    for (const build of [() => request(), () => request({ origin: "https://evil.example" })]) {
      expect(await (await POST(build())).text()).not.toMatch(
        /model-authored|hand-authored|human-test-key|human-test-items|library|threshold|\b70\s*%/i,
      );
    }
  });
});
