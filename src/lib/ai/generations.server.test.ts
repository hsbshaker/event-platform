import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enableGeneration, fakeAdmin, TEST_CONTEXT } from "../../../tests/unit/support/fake-admin";
import type { FakeAdmin } from "../../../tests/unit/support/fake-admin";

import { hashRateLimitKey } from "@/lib/auth/rate-limit";
import { resetEnvCache } from "@/lib/env";

import { GenerationDisabledError } from "./errors";
import { GENERATION_STALE_SECONDS, startGeneration } from "./generations.server";

/**
 * The application side of the generation lock (`spec.md §10`). The lock itself — idempotency, one
 * in flight, the caps, stale takeover, concurrency — is tested against Postgres in
 * `tests/db/phase5.test.ts`.
 */

const admin = vi.hoisted(() => ({ fake: undefined as unknown as FakeAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.fake.client }));

const INPUT = {
  eventId: TEST_CONTEXT.eventId,
  userId: TEST_CONTEXT.userId,
  kind: "initial" as const,
  idempotencyKey: "4d2c8e8a-1b7f-4f0e-9f53-3a6c2f1e9b10",
};

let restore: () => void;
beforeEach(() => {
  admin.fake = fakeAdmin();
  restore = enableGeneration();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  resetEnvCache();
});
afterEach(() => {
  restore();
  resetEnvCache();
});

describe("startGeneration", () => {
  it("starts nothing and consumes nothing while generation is switched off", async () => {
    process.env.GENERATION_ENABLED = "false";
    await expect(startGeneration(INPUT)).rejects.toBeInstanceOf(GenerationDisabledError);
    expect(admin.fake.state.rpcs).toEqual([]);
  });

  it("passes the configured caps, the keyed hashes and the stale threshold", async () => {
    process.env.GENERATION_EVENT_DAILY_CAP = "5";
    process.env.GENERATION_HOST_DAILY_CAP = "9";
    admin.fake.state.startRows = [{ generation_id: TEST_CONTEXT.generationId, outcome: "started" }];
    expect(await startGeneration(INPUT)).toEqual({
      outcome: "started",
      generationId: TEST_CONTEXT.generationId,
    });
    const [args] = admin.fake.rpc("start_generation");
    expect(args).toEqual({
      p_event_id: INPUT.eventId,
      p_user_id: INPUT.userId,
      p_kind: "initial",
      p_idempotency_key: INPUT.idempotencyKey,
      p_event_key_hash: `\\x${hashRateLimitKey(`event:${INPUT.eventId}`).toString("hex")}`,
      p_host_key_hash: `\\x${hashRateLimitKey(`user:${INPUT.userId}`).toString("hex")}`,
      p_event_cap: 5,
      p_host_cap: 9,
      p_stale_seconds: GENERATION_STALE_SECONDS,
    });
    // The counters never hold a raw identifier.
    expect(String(args.p_event_key_hash)).not.toContain(INPUT.eventId.replace(/-/g, ""));
  });

  it("uses the owner's default caps", async () => {
    admin.fake.state.startRows = [{ generation_id: null, outcome: "host_cap" }];
    expect(await startGeneration(INPUT)).toEqual({ outcome: "host_cap", generationId: null });
    expect(admin.fake.rpc("start_generation")[0]).toMatchObject({
      p_event_cap: 30,
      p_host_cap: 60,
    });
  });

  it("outlasts the longest-lived worker before treating a generation as stale", () => {
    expect(GENERATION_STALE_SECONDS).toBeGreaterThan(300);
  });

  it("surfaces a database error", async () => {
    admin.fake.state.errors.start_generation = { message: "not a member", code: "42501" };
    await expect(startGeneration(INPUT)).rejects.toMatchObject({ code: "42501" });
  });
});
