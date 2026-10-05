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
const access = vi.hoisted(() => ({ requireEventAccess: vi.fn() }));
vi.mock("@/lib/auth/event-access", () => access);

const INPUT = {
  eventId: TEST_CONTEXT.eventId,
  kind: "initial" as const,
  idempotencyKey: "4d2c8e8a-1b7f-4f0e-9f53-3a6c2f1e9b10",
};

let restore: () => void;
beforeEach(() => {
  admin.fake = fakeAdmin();
  access.requireEventAccess.mockReset();
  access.requireEventAccess.mockResolvedValue({ user: { id: TEST_CONTEXT.userId } });
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
      userId: TEST_CONTEXT.userId,
    });
    const [args] = admin.fake.rpc("start_generation");
    expect(args).toEqual({
      p_event_id: INPUT.eventId,
      p_user_id: TEST_CONTEXT.userId,
      p_kind: "initial",
      p_idempotency_key: INPUT.idempotencyKey,
      p_event_key_hash: `\\x${hashRateLimitKey(`event:${INPUT.eventId}`).toString("hex")}`,
      p_host_key_hash: `\\x${hashRateLimitKey(`user:${TEST_CONTEXT.userId}`).toString("hex")}`,
      p_event_cap: 5,
      p_host_cap: 9,
      p_stale_seconds: GENERATION_STALE_SECONDS,
    });
    // The counters never hold a raw identifier.
    expect(String(args.p_event_key_hash)).not.toContain(INPUT.eventId.replace(/-/g, ""));
  });

  it("uses the owner's default caps", async () => {
    admin.fake.state.startRows = [{ generation_id: null, outcome: "host_cap" }];
    expect(await startGeneration(INPUT)).toEqual({
      outcome: "host_cap",
      generationId: null,
      userId: TEST_CONTEXT.userId,
    });
    expect(admin.fake.rpc("start_generation")[0]).toMatchObject({
      p_event_cap: 30,
      p_host_cap: 60,
    });
  });

  it("outlasts the longest-lived worker before treating a generation as stale", () => {
    expect(GENERATION_STALE_SECONDS).toBeGreaterThan(300);
  });

  it("acts as the signed-in collaborator, never an id the caller passes", async () => {
    admin.fake.state.startRows = [{ generation_id: TEST_CONTEXT.generationId, outcome: "started" }];
    await startGeneration({ ...INPUT, userId: "someone-else" } as typeof INPUT);
    expect(access.requireEventAccess).toHaveBeenCalledWith(INPUT.eventId, "try_another_direction");
    expect(admin.fake.rpc("start_generation")[0]).toMatchObject({ p_user_id: TEST_CONTEXT.userId });
  });

  it("starts nothing for a caller who is not a collaborator", async () => {
    access.requireEventAccess.mockRejectedValue(new Error("forbidden"));
    await expect(startGeneration(INPUT)).rejects.toThrow("forbidden");
    expect(admin.fake.state.rpcs).toEqual([]);
  });

  it("surfaces a database error", async () => {
    admin.fake.state.errors.start_generation = { message: "not a member", code: "42501" };
    await expect(startGeneration(INPUT)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("one card at a time (spec.md §10)", () => {
  const RUNNING = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
  const DESIGN = "d1d2d3d4-e5e6-4f7a-8b9c-0d1e2f3a4b5c";
  const inFlight = (row: Record<string, unknown>) => {
    admin.fake.state.startRows = [{ generation_id: RUNNING, outcome: "in_flight" }];
    admin.fake.state.tables.generations = [
      { id: RUNNING, event_id: TEST_CONTEXT.eventId, from_design_id: DESIGN, ...row },
    ];
  };
  const SWITCH = {
    ...INPUT,
    kind: "shape_switch" as const,
    fromDesignId: DESIGN,
    shape: "oval" as const,
  };
  const DIRECTION = {
    ...INPUT,
    kind: "another_direction" as const,
    fromDesignId: DESIGN,
    feedback: "add a dinosaur",
  };

  it("waits on the same request in flight, comparing kind, card, words and shape", async () => {
    inFlight({ kind: "shape_switch", shape: "oval", feedback: null });
    expect(await startGeneration(SWITCH)).toMatchObject({
      outcome: "in_flight",
      generationId: RUNNING,
    });
    inFlight({ kind: "another_direction", shape: null, feedback: "add a dinosaur" });
    expect(await startGeneration({ ...DIRECTION, feedback: " add a dinosaur " })).toMatchObject({
      outcome: "in_flight",
      generationId: RUNNING,
    });
  });

  it("answers busy for anything else in flight", async () => {
    for (const [request, row] of [
      [SWITCH, { kind: "shape_switch", shape: "square", feedback: null }],
      [SWITCH, { kind: "another_direction", shape: null, feedback: null }],
      [DIRECTION, { kind: "another_direction", shape: null, feedback: "make it pink" }],
      [DIRECTION, { kind: "shape_switch", shape: "oval", feedback: null }],
      [DIRECTION, { kind: "initial", shape: null, feedback: null, from_design_id: null }],
    ] as const) {
      inFlight(row);
      expect(await startGeneration(request)).toMatchObject({ outcome: "busy", generationId: null });
    }
  });

  it("lets a first card wait on whatever is in flight, reading nothing more", async () => {
    inFlight({ kind: "initial", shape: null, feedback: null, from_design_id: null });
    expect(await startGeneration(INPUT)).toMatchObject({
      outcome: "in_flight",
      generationId: RUNNING,
    });
    expect(admin.fake.state.selects).toEqual([]);
  });
});
