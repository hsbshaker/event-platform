import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const createServerClient = vi.fn();
vi.mock("@supabase/ssr", () => ({ createServerClient }));

const saved = { ...process.env };

afterEach(async () => {
  process.env = { ...saved };
  createServerClient.mockReset();
  const { resetEnvCache } = await import("@/lib/env");
  resetEnvCache();
});

describe("updateSession", () => {
  it("passes the request through without a client when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { updateSession } = await import("./proxy");
    const response = await updateSession(new NextRequest("http://localhost/some/page"));
    expect(response.status).toBe(200);
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("fails loudly when Supabase is half-configured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
    const { updateSession } = await import("./proxy");
    await expect(updateSession(new NextRequest("http://localhost/"))).rejects.toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    );
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("refreshes the session through the SSR client when configured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
    const getUser = vi.fn().mockResolvedValue({ data: { user: null } });
    createServerClient.mockReturnValue({ auth: { getUser } });
    const { updateSession } = await import("./proxy");
    const response = await updateSession(new NextRequest("http://localhost/"));
    expect(response.status).toBe(200);
    expect(createServerClient).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledTimes(1);
  });
});
