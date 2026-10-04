import { afterEach, describe, expect, it } from "vitest";
import { cronSecret, generationEnv, publicEnv, resetEnvCache, serverEnv } from "./env";

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

  it("keeps generation off by default, with the owner's spend limits", () => {
    for (const name of [
      "GENERATION_ENABLED",
      "OPENAI_API_KEY",
      "GENERATION_DAILY_CEILING_USD",
      "GENERATION_EVENT_DAILY_CAP",
      "GENERATION_HOST_DAILY_CAP",
    ]) {
      delete process.env[name];
    }
    expect(generationEnv()).toEqual({
      enabled: false,
      openAiApiKey: undefined,
      dailyCeilingUsd: 20,
      eventDailyCap: 30,
      hostDailyCap: 60,
    });
    process.env.GENERATION_ENABLED = "";
    expect(generationEnv().enabled).toBe(false);
  });

  it("enables generation only with the exact switch and a key", () => {
    process.env.GENERATION_ENABLED = "true";
    delete process.env.OPENAI_API_KEY;
    expect(() => generationEnv()).toThrow(/OPENAI_API_KEY/);
    process.env.OPENAI_API_KEY = "";
    expect(() => generationEnv()).toThrow(/OPENAI_API_KEY/);
    process.env.OPENAI_API_KEY = "not-a-key";
    expect(() => generationEnv()).toThrow(/OPENAI_API_KEY/);
    process.env.OPENAI_API_KEY = `sk-proj-${"a".repeat(40)}`;
    expect(generationEnv()).toMatchObject({
      enabled: true,
      openAiApiKey: `sk-proj-${"a".repeat(40)}`,
    });
    // A switch that is neither on nor off is an error, not a guess.
    process.env.GENERATION_ENABLED = "yes";
    expect(() => generationEnv()).toThrow(/GENERATION_ENABLED/);
  });

  it("reads the limits and refuses implausible ones rather than falling back", () => {
    process.env.GENERATION_DAILY_CEILING_USD = "5.5";
    process.env.GENERATION_EVENT_DAILY_CAP = "3";
    process.env.GENERATION_HOST_DAILY_CAP = "4";
    expect(generationEnv()).toMatchObject({
      dailyCeilingUsd: 5.5,
      eventDailyCap: 3,
      hostDailyCap: 4,
    });
    for (const [name, value] of [
      ["GENERATION_DAILY_CEILING_USD", "0"],
      ["GENERATION_DAILY_CEILING_USD", "2000"],
      ["GENERATION_DAILY_CEILING_USD", "twenty"],
      ["GENERATION_EVENT_DAILY_CAP", "1.5"],
      ["GENERATION_HOST_DAILY_CAP", "-1"],
    ]) {
      const before = process.env[name];
      process.env[name] = value;
      expect(() => generationEnv(), `${name}=${value}`).toThrow(new RegExp(name));
      process.env[name] = before;
    }
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
