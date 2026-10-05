import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enableGeneration, fakeAdmin } from "../../../tests/unit/support/fake-admin";
import type { FakeAdmin } from "../../../tests/unit/support/fake-admin";

import { GENERATION_MAX_DURATION_SECONDS } from "@/lib/ai/generations.server";
import { ForbiddenError } from "@/lib/auth/errors";
import { resetEnvCache } from "@/lib/env";
import { GENERATION_DEADLINE_MS } from "@/lib/generation/run.server";

/**
 * The entry point (`docs/technology-decisions.md §8.1`, "Generation execution"): input validated,
 * the generation begun through `startGeneration` (which authorizes the session's collaborator),
 * and the pipeline scheduled with `after()` only for a generation this request started.
 */

const EVENT = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";
const USER = "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2";
const GENERATION = "c5d7b1a4-3f2e-4c8d-9b7a-1e2f3a4b5c6d";
const KEY = "5b8f0c1e-2d3a-4b5c-9d6e-7f8a9b0c1d2e";

const admin = vi.hoisted(() => ({ fake: undefined as unknown as FakeAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.fake.client }));
const access = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/event-access", () => ({
  requireEventAccess: (...args: unknown[]) => access(...args),
}));
const scheduled = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", () => ({ after: (task: () => unknown) => scheduled.push(task) }));
const runGeneration = vi.hoisted(() => vi.fn());
vi.mock("@/lib/generation/run.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/generation/run.server")>()),
  runGeneration: (...args: unknown[]) => runGeneration(...args),
}));

const { startCardGeneration } = await import("./generation");

let restore: () => void;
beforeEach(() => {
  admin.fake = fakeAdmin();
  restore = enableGeneration();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  resetEnvCache();
  scheduled.length = 0;
  runGeneration.mockReset();
  runGeneration.mockResolvedValue({ status: "succeeded" });
  access.mockReset();
  access.mockResolvedValue({ user: { id: USER }, role: "owner", eventId: EVENT });
});
afterEach(() => {
  restore();
  resetEnvCache();
  vi.restoreAllMocks();
});

describe("startCardGeneration", () => {
  it("starts an initial generation and schedules its run after the response", async () => {
    admin.fake.state.startRows = [{ generation_id: GENERATION, outcome: "started" }];
    const before = Date.now();
    const result = await startCardGeneration({ eventId: EVENT, idempotencyKey: KEY });
    expect(result).toEqual({ outcome: "started", generationId: GENERATION });
    expect(admin.fake.rpc("start_generation")[0]).toMatchObject({
      p_event_id: EVENT,
      p_user_id: USER,
      p_kind: "initial",
      p_idempotency_key: KEY,
    });
    // Scheduled, not run, before the response.
    expect(scheduled).toHaveLength(1);
    expect(runGeneration).not.toHaveBeenCalled();
    await scheduled[0]();
    expect(runGeneration).toHaveBeenCalledTimes(1);
    const [input] = runGeneration.mock.calls[0];
    expect(input).toMatchObject({ generationId: GENERATION, eventId: EVENT, userId: USER });
    // The deadline counts from this request's start.
    expect(input.startedAt).toBeGreaterThanOrEqual(before);
    expect(input.startedAt).toBeLessThanOrEqual(Date.now());
  });

  it("schedules nothing for any outcome but started", async () => {
    for (const [generationId, outcome] of [
      [GENERATION, "existing"],
      [GENERATION, "in_flight"],
      [null, "published"],
      [null, "event_cap"],
      [null, "host_cap"],
    ] as const) {
      admin.fake.state.startRows = [{ generation_id: generationId, outcome }];
      expect(await startCardGeneration({ eventId: EVENT, idempotencyKey: KEY })).toEqual({
        outcome,
        generationId,
      });
    }
    expect(scheduled).toEqual([]);
  });

  it("validates its input before anything else", async () => {
    for (const input of [
      { eventId: "not-a-uuid", idempotencyKey: KEY },
      { eventId: EVENT, idempotencyKey: "double-tap" },
      { eventId: EVENT },
      { eventId: EVENT, idempotencyKey: KEY, kind: "shape_switch" },
      null,
    ]) {
      await expect(startCardGeneration(input as never)).rejects.toThrow(
        "Invalid generation request.",
      );
    }
    expect(access).not.toHaveBeenCalled();
    expect(admin.fake.state.rpcs).toEqual([]);
    expect(scheduled).toEqual([]);
  });

  it("refuses a user who is not the event's owner or a co-host", async () => {
    access.mockRejectedValue(new ForbiddenError());
    await expect(
      startCardGeneration({ eventId: EVENT, idempotencyKey: KEY }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(admin.fake.state.rpcs).toEqual([]);
    expect(scheduled).toEqual([]);
  });

  it("answers disabled, starting nothing, with generation switched off", async () => {
    process.env.GENERATION_ENABLED = "false";
    resetEnvCache();
    expect(await startCardGeneration({ eventId: EVENT, idempotencyKey: KEY })).toEqual({
      outcome: "disabled",
      generationId: null,
    });
    expect(admin.fake.rpc("start_generation")).toEqual([]);
    expect(scheduled).toEqual([]);
  });

  it("logs, without throwing, a worker that stops unexpectedly", async () => {
    admin.fake.state.startRows = [{ generation_id: GENERATION, outcome: "started" }];
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    runGeneration.mockRejectedValue(new Error("boom"));
    await startCardGeneration({ eventId: EVENT, idempotencyKey: KEY });
    await expect(scheduled[0]()).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
  });
});

describe("the function's duration", () => {
  // Every page that invokes an action starting a generation: the first card (create), another
  // direction (direction) and the Design panel's shape switch (the event page).
  it.each(["create/page.tsx", "direction/page.tsx", "page.tsx"])(
    "events/[id]/%s runs its actions for 300 s, above the generation's deadline",
    (file) => {
      const page = readFileSync(path.join(import.meta.dirname, "../events/[id]", file), "utf8");
      const declared = /export const maxDuration = (\d+);/.exec(page);
      expect(Number(declared?.[1])).toBe(GENERATION_MAX_DURATION_SECONDS);
      expect(GENERATION_DEADLINE_MS).toBeLessThan(GENERATION_MAX_DURATION_SECONDS * 1000);
    },
  );
});
