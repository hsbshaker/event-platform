import { afterEach, describe, expect, it } from "vitest";
import { cronSecret, publicEnv, resetEnvCache, serverEnv } from "./env";

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
  resetEnvCache();
});

describe("environment validation", () => {
  it("names missing public variables", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    resetEnvCache();
    expect(() => publicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("rejects a weak cleanup-job secret instead of accepting it", () => {
    // It is the only credential in front of a service-role endpoint, so a short value must
    // fail loudly rather than protect nothing.
    process.env.CRON_SECRET = "x";
    expect(() => cronSecret()).toThrow(/CRON_SECRET/);
  });

  it("treats an unset cleanup-job secret as absent, which keeps the route closed", () => {
    delete process.env.CRON_SECRET;
    expect(cronSecret()).toBeUndefined();
    process.env.CRON_SECRET = "";
    expect(cronSecret()).toBeUndefined();
  });

  it("accepts a cleanup-job secret of real length", () => {
    process.env.CRON_SECRET = "a".repeat(32);
    expect(cronSecret()).toBe("a".repeat(32));
  });

  it("requires server secrets only on the server path", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.APP_ENCRYPTION_KEY;
    resetEnvCache();
    expect(publicEnv().NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(() => serverEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
