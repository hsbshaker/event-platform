import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enableGeneration, fakeAdmin } from "../../../tests/unit/support/fake-admin";
import type { FakeAdmin } from "../../../tests/unit/support/fake-admin";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { resetEnvCache } from "@/lib/env";
import { DIRECTION_FEEDBACK_MAX, directionFeedback } from "@/lib/generation/direction-feedback";

/**
 * `Try another direction` and choosing a design (`spec.md §7.7`, §7.11, §7.15, §8.2, §10): input
 * validated, the box trimmed and bounded, the collaborator authorized, a published event answered
 * plainly, the generation begun through `startGeneration` and run after the response only when this
 * request started it; a design chosen through the server-only `choose_card_design`.
 */

const EVENT = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";
const USER = "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2";
const GENERATION = "c5d7b1a4-3f2e-4c8d-9b7a-1e2f3a4b5c6d";
const KEY = "5b8f0c1e-2d3a-4b5c-9d6e-7f8a9b0c1d2e";
const DESIGN = "d1d2d3d4-e5e6-4f7a-8b9c-0d1e2f3a4b5c";

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

const { chooseDesign, startAnotherDirection } = await import("./direction");

const member = (published = false) => ({
  user: { id: USER },
  role: "cohost",
  eventId: EVENT,
  context: { paymentSatisfied: false, published },
});

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
  access.mockResolvedValue(member());
});
afterEach(() => {
  restore();
  resetEnvCache();
  vi.restoreAllMocks();
});

const INPUT = { eventId: EVENT, fromDesignId: DESIGN, idempotencyKey: KEY };

describe("startAnotherDirection", () => {
  it("starts another direction with the box and the card, and runs it after the response", async () => {
    admin.fake.state.startRows = [{ generation_id: GENERATION, outcome: "started" }];
    const before = Date.now();
    const result = await startAnotherDirection({
      ...INPUT,
      feedback: "  add a little dinosaur\n",
    });
    expect(result).toEqual({ outcome: "started", generationId: GENERATION });
    expect(admin.fake.rpc("start_generation")[0]).toMatchObject({
      p_event_id: EVENT,
      p_user_id: USER,
      p_kind: "another_direction",
      p_idempotency_key: KEY,
      p_feedback: "add a little dinosaur",
      p_from_design_id: DESIGN,
    });
    // Authorized as a member first, then for the pre-publish capability by startGeneration.
    expect(access.mock.calls.map((c) => c[1])).toEqual(["view_event", "try_another_direction"]);
    expect(scheduled).toHaveLength(1);
    expect(runGeneration).not.toHaveBeenCalled();
    await scheduled[0]();
    const [run] = runGeneration.mock.calls[0];
    expect(run).toMatchObject({ generationId: GENERATION, eventId: EVENT, userId: USER });
    expect(run.startedAt).toBeGreaterThanOrEqual(before);
  });

  it("sends no feedback for an empty or blank box: a new idea", async () => {
    admin.fake.state.startRows = [{ generation_id: GENERATION, outcome: "started" }];
    for (const feedback of [undefined, null, "", "  \n\t "]) {
      await startAnotherDirection({ ...INPUT, feedback });
    }
    for (const args of admin.fake.rpc("start_generation")) {
      expect(args).not.toHaveProperty("p_feedback");
      expect(args.p_from_design_id).toBe(DESIGN);
    }
  });

  it("takes 500 characters and refuses 501 as invalid input, counting characters", async () => {
    admin.fake.state.startRows = [{ generation_id: GENERATION, outcome: "started" }];
    const longest = `${"a".repeat(DIRECTION_FEEDBACK_MAX - 1)}🦕`;
    await startAnotherDirection({ ...INPUT, feedback: longest });
    expect(admin.fake.rpc("start_generation")[0].p_feedback).toBe(longest);
    await expect(
      startAnotherDirection({ ...INPUT, feedback: "a".repeat(DIRECTION_FEEDBACK_MAX + 1) }),
    ).rejects.toThrow("Invalid generation request.");
    expect(admin.fake.rpc("start_generation")).toHaveLength(1);
  });

  it("validates its input before anything else", async () => {
    for (const input of [
      { ...INPUT, eventId: "not-a-uuid" },
      { ...INPUT, fromDesignId: "not-a-uuid" },
      { ...INPUT, idempotencyKey: "double-tap" },
      { eventId: EVENT, idempotencyKey: KEY },
      { ...INPUT, feedback: 42 },
      { ...INPUT, kind: "initial" },
      null,
    ]) {
      await expect(startAnotherDirection(input as never)).rejects.toThrow(
        "Invalid generation request.",
      );
    }
    expect(access).not.toHaveBeenCalled();
    expect(admin.fake.state.rpcs).toEqual([]);
  });

  it("answers published plainly after publish, starting nothing (spec.md §8.2)", async () => {
    access.mockResolvedValue(member(true));
    expect(await startAnotherDirection(INPUT)).toEqual({
      outcome: "published",
      generationId: null,
    });
    expect(admin.fake.state.rpcs).toEqual([]);
    expect(scheduled).toEqual([]);
  });

  it("refuses a user who is not the event's owner or a co-host", async () => {
    access.mockRejectedValue(new ForbiddenError());
    await expect(startAnotherDirection(INPUT)).rejects.toBeInstanceOf(ForbiddenError);
    expect(admin.fake.state.rpcs).toEqual([]);
  });

  it("schedules nothing for any outcome but started, no_design included", async () => {
    for (const [generationId, outcome] of [
      [GENERATION, "existing"],
      [GENERATION, "in_flight"],
      [null, "no_design"],
      [null, "published"],
      [null, "event_cap"],
      [null, "host_cap"],
    ] as const) {
      admin.fake.state.startRows = [{ generation_id: generationId, outcome }];
      expect(await startAnotherDirection(INPUT)).toEqual({ outcome, generationId });
    }
    expect(scheduled).toEqual([]);
  });

  it("answers disabled, starting nothing, with generation switched off", async () => {
    process.env.GENERATION_ENABLED = "false";
    resetEnvCache();
    expect(await startAnotherDirection(INPUT)).toEqual({ outcome: "disabled", generationId: null });
    expect(admin.fake.rpc("start_generation")).toEqual([]);
  });

  it("surfaces the database's refusal of a design that is not the event's", async () => {
    admin.fake.state.errors.start_generation = { message: "not this event's", code: "23514" };
    await expect(startAnotherDirection(INPUT)).rejects.toMatchObject({ code: "23514" });
    expect(scheduled).toEqual([]);
  });
});

describe("chooseDesign", () => {
  const choose = () => chooseDesign({ eventId: EVENT, designId: DESIGN });

  it("chooses through the server-only function, as the signed-in collaborator", async () => {
    admin.fake.state.rpcAnswers.choose_card_design = "chosen";
    expect(await choose()).toEqual({ ok: true });
    expect(access).toHaveBeenCalledWith(EVENT, "view_event");
    expect(admin.fake.rpc("choose_card_design")).toEqual([
      { p_event_id: EVENT, p_user_id: USER, p_design_id: DESIGN },
    ]);
  });

  it("passes on the function's refusals", async () => {
    for (const reason of ["published", "not_found"] as const) {
      admin.fake.state.rpcAnswers.choose_card_design = reason;
      expect(await choose()).toEqual({ ok: false, reason });
    }
  });

  it("answers published after publish without writing", async () => {
    access.mockResolvedValue(member(true));
    expect(await choose()).toEqual({ ok: false, reason: "published" });
    expect(admin.fake.state.rpcs).toEqual([]);
  });

  it("never says whether an event exists: not a member, signed out or malformed read as not_found", async () => {
    for (const error of [new ForbiddenError(), new UnauthorizedError()]) {
      access.mockRejectedValueOnce(error);
      expect(await choose()).toEqual({ ok: false, reason: "not_found" });
    }
    for (const input of [
      { eventId: "x", designId: DESIGN },
      { eventId: EVENT, designId: "x" },
      { eventId: EVENT },
      null,
    ]) {
      expect(await chooseDesign(input as never)).toEqual({ ok: false, reason: "not_found" });
    }
    expect(admin.fake.state.rpcs).toEqual([]);
  });

  it("surfaces a database error and an unexpected answer", async () => {
    admin.fake.state.errors.choose_card_design = { message: "down", code: "XX000" };
    await expect(choose()).rejects.toMatchObject({ code: "XX000" });
    delete admin.fake.state.errors.choose_card_design;
    admin.fake.state.rpcAnswers.choose_card_design = null;
    await expect(choose()).rejects.toThrow(/no outcome/);
  });
});

describe("directionFeedback", () => {
  it("trims, reads blank as none, and bounds by characters", () => {
    expect(directionFeedback(undefined)).toEqual({ ok: true, feedback: null });
    expect(directionFeedback(" \n ")).toEqual({ ok: true, feedback: null });
    expect(directionFeedback(" make it a starry night ")).toEqual({
      ok: true,
      feedback: "make it a starry night",
    });
    expect(directionFeedback("🦕".repeat(500))).toMatchObject({ ok: true });
    expect(directionFeedback("🦕".repeat(501))).toEqual({ ok: false, reason: "too_long" });
  });
});
