import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeAdmin } from "../../../tests/unit/support/fake-admin";
import type { FakeAdmin } from "../../../tests/unit/support/fake-admin";

import { GENERATION_STALE_SECONDS } from "@/lib/ai/generations.server";
import { ForbiddenError } from "@/lib/auth/errors";

/**
 * The wait surface's read (`spec.md §7.10`, §32 #42, #46; `docs/technology-decisions.md §8.1`):
 * members only, the latest generation, no telemetry or raw output, and a dead worker reads as a
 * failure with a retry rather than a wait.
 */

const EVENT = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";
const NOW = Date.parse("2026-10-04T12:00:00Z");

const admin = vi.hoisted(() => ({ fake: undefined as unknown as FakeAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.fake.client }));
const access = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/event-access", () => ({
  requireEventAccess: (...args: unknown[]) => access(...args),
}));

const { getGenerationView } = await import("./status.server");

const secondsAgo = (s: number) => new Date(NOW - s * 1000).toISOString();

function generation(overrides: Record<string, unknown> = {}) {
  return {
    id: "c5d7b1a4-3f2e-4c8d-9b7a-1e2f3a4b5c6d",
    event_id: EVENT,
    kind: "initial",
    status: "running",
    stage: "design",
    artifacts: {
      identity: { creativeDirection: "A lemon grove" },
      facts: { venue: "Villa Rosa" },
      droppedFacts: ["location"],
      design: { name: "Lemons & Linen" },
      notice: "provider_refusal",
    },
    error_code: null,
    card_design_id: null,
    telemetry: { latency: { totalMs: 1 } },
    started_at: secondsAgo(40),
    ...overrides,
  };
}

const view = () => getGenerationView(EVENT, { now: () => NOW });

beforeEach(() => {
  admin.fake = fakeAdmin();
  access.mockReset();
  access.mockResolvedValue({ user: { id: "u" }, role: "owner" });
});

describe("getGenerationView", () => {
  it("requires the viewer's access to the event before reading anything", async () => {
    access.mockRejectedValue(new ForbiddenError());
    admin.fake.state.tables.generations = [generation()];
    await expect(view()).rejects.toBeInstanceOf(ForbiddenError);
    expect(access).toHaveBeenCalledWith(EVENT, "view_event");
    expect(admin.fake.state.selects).toEqual([]);
  });

  it("returns the latest generation with only what the host may see", async () => {
    admin.fake.state.tables.generations = [
      generation({ id: "older", started_at: secondsAgo(900), status: "failed", error_code: "x" }),
      generation(),
      generation({ id: "other-event", event_id: "another", started_at: secondsAgo(1) }),
    ];
    const result = await view();
    expect(result).toEqual({
      id: "c5d7b1a4-3f2e-4c8d-9b7a-1e2f3a4b5c6d",
      kind: "initial",
      status: "running",
      stage: "design",
      artifacts: {
        identity: { creativeDirection: "A lemon grove" },
        facts: { venue: "Villa Rosa" },
        design: { name: "Lemons & Linen" },
        notice: "provider_refusal",
      },
      errorCode: null,
      cardDesignId: null,
      startedAt: secondsAgo(40),
    });
    // Never the telemetry (or cost): it is not even selected.
    expect(admin.fake.state.selects[0].columns).not.toMatch(/telemetry|cost|raw/);
    expect(JSON.stringify(result)).not.toContain("totalMs");
  });

  it("reads the generation asked for by id, of this event only, even when it is not the latest", async () => {
    admin.fake.state.tables.generations = [
      generation({ id: "older", started_at: secondsAgo(900), status: "succeeded" }),
      generation(),
      generation({ id: "elsewhere", event_id: "another", started_at: secondsAgo(1) }),
    ];
    const asked = await getGenerationView(EVENT, { now: () => NOW, generationId: "older" });
    expect(asked?.id).toBe("older");
    expect(asked?.status).toBe("succeeded");
    // Another event's generation is never read through this event.
    expect(
      await getGenerationView(EVENT, { now: () => NOW, generationId: "elsewhere" }),
    ).toBeNull();
  });

  it("returns null when the event has no generation", async () => {
    admin.fake.state.tables.generations = [];
    expect(await view()).toBeNull();
  });

  it("reads a running generation older than the stale limit as failed (stopped)", async () => {
    admin.fake.state.tables.generations = [
      generation({ started_at: secondsAgo(GENERATION_STALE_SECONDS + 1) }),
    ];
    expect(await view()).toMatchObject({ status: "failed", errorCode: "stopped" });
  });

  it("still reads a running generation within the limit as running", async () => {
    admin.fake.state.tables.generations = [
      generation({ started_at: secondsAgo(GENERATION_STALE_SECONDS - 1) }),
    ];
    expect(await view()).toMatchObject({ status: "running", errorCode: null });
  });

  it("leaves finished generations as they are, however old", async () => {
    admin.fake.state.tables.generations = [
      generation({
        status: "succeeded",
        stage: "done",
        card_design_id: "d1",
        started_at: secondsAgo(86_400),
      }),
    ];
    expect(await view()).toMatchObject({
      status: "succeeded",
      errorCode: null,
      cardDesignId: "d1",
    });
    admin.fake.state.tables.generations = [
      generation({
        status: "failed",
        error_code: "artwork_invalid",
        started_at: secondsAgo(86_400),
      }),
    ];
    expect(await view()).toMatchObject({ status: "failed", errorCode: "artwork_invalid" });
  });
});
