import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enableGeneration, fakeAdmin } from "../../../tests/unit/support/fake-admin";
import type { FakeAdmin } from "../../../tests/unit/support/fake-admin";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { resetEnvCache } from "@/lib/env";
import { generationFailure } from "@/lib/generation/failure-copy";
import { SWITCH_ATTEMPTS } from "@/lib/generation/shape.server";

/**
 * The card's shape control, server side (`spec.md §7.14`, §8.1, §8.2, §10, §31 Creation Mode
 * "Design controls expose only … the shapes the design's layout supports" and "A switch to a shape
 * an existing artwork fits applies instantly with no model call; a switch to any other shape
 * generates one artwork … counts as a generation, is unavailable after publish"): input validated,
 * the collaborator authorized, only shapes the active design's layout supports, an instant switch
 * through the server-only `switch_card_shape` with no generation, otherwise a `shape_switch`
 * generation begun through `startGeneration` and run after the response only when this request
 * started it; after publish only the instant switch.
 */

const EVENT = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";
const USER = "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2";
const GENERATION = "c5d7b1a4-3f2e-4c8d-9b7a-1e2f3a4b5c6d";
const KEY = "5b8f0c1e-2d3a-4b5c-9d6e-7f8a9b0c1d2e";
const DESIGN = "d1d2d3d4-e5e6-4f7a-8b9c-0d1e2f3a4b5c";
const CHOSEN = "e1e2e3e4-f5f6-4a7b-8c9d-0e1f2a3b4c5d";

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

const { loadCardShapeOptionsAction, switchCardShape } = await import("./shape");
const { runningShapeSwitch } = await import("@/lib/generation/shape.server");

const member = (published = false) => ({
  user: { id: USER },
  role: "cohost",
  eventId: EVENT,
  context: { paymentSatisfied: false, published },
});

/** What a design's row carries for its artwork to be painted again (`readSwitchingDesign`). */
const PAINTABLE = {
  art_mode: "illustration",
  typography: { primary: "oldstyle_garamond_worksans", alternates: [] },
  wording: { title: "Lemons & Linen", invitationLine: "Please join us" },
  art_brief: {
    subject: "a lemon branch",
    rendering: "painterly",
    aesthetic: "romantic",
    medium: "gouache",
    mood: "calm",
    palette: { description: "lemon and ivory", colors: ["#F2D35B"] },
    texture: "laid paper",
    avoid: [],
  },
};

/** The active design: an art-top illustration, rectangle, whose artwork fits both half-card shapes. */
function card({
  active = DESIGN as string | null,
  activeShape = null as string | null,
  layout = "art-top",
} = {}) {
  admin.fake.state.tables = {
    events: [{ id: EVENT, active_card_design_id: active, active_card_shape: activeShape }],
    card_designs: [
      { id: DESIGN, event_id: EVENT, shape: "rectangle", layout, ...PAINTABLE },
      { id: CHOSEN, event_id: EVENT, shape: "square", layout: "framed", ...PAINTABLE },
    ],
    card_art_assets: [
      { card_design_id: DESIGN, event_id: EVENT, fits_shapes: ["rectangle", "rounded-rectangle"] },
      { card_design_id: DESIGN, event_id: EVENT, fits_shapes: ["arch", "oval"] },
      { card_design_id: CHOSEN, event_id: EVENT, fits_shapes: ["square"] },
    ],
  };
}

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
  card();
});
afterEach(() => {
  restore();
  resetEnvCache();
  vi.restoreAllMocks();
});

const INPUT = { eventId: EVENT, shape: "square", idempotencyKey: KEY } as const;

describe("switchCardShape", () => {
  it("applies a shape an existing artwork fits instantly: no generation, no model call", async () => {
    admin.fake.state.rpcAnswers.switch_card_shape = "switched";
    expect(await switchCardShape({ ...INPUT, shape: "oval" })).toEqual({
      outcome: "switched",
      generationId: null,
    });
    expect(access).toHaveBeenCalledWith(EVENT, "use_design_controls");
    expect(admin.fake.rpc("switch_card_shape")).toEqual([
      { p_event_id: EVENT, p_user_id: USER, p_design_id: DESIGN, p_shape: "oval" },
    ]);
    expect(admin.fake.rpc("start_generation")).toEqual([]);
    expect(scheduled).toEqual([]);
  });

  it("starts a shape_switch generation for a shape no artwork fits, and runs it after the response", async () => {
    admin.fake.state.rpcAnswers.switch_card_shape = "needs_artwork";
    admin.fake.state.startRows = [{ generation_id: GENERATION, outcome: "started" }];
    const before = Date.now();
    expect(await switchCardShape(INPUT)).toEqual({ outcome: "started", generationId: GENERATION });
    expect(admin.fake.rpc("start_generation")).toHaveLength(1);
    expect(admin.fake.rpc("start_generation")[0]).toMatchObject({
      p_event_id: EVENT,
      p_user_id: USER,
      p_kind: "shape_switch",
      p_idempotency_key: KEY,
      p_from_design_id: DESIGN,
      p_shape: "square",
    });
    expect(admin.fake.rpc("start_generation")[0]).not.toHaveProperty("p_feedback");
    // Authorized for the design controls, then for generation (before publish) by startGeneration.
    expect(access.mock.calls.map((c) => c[1])).toEqual([
      "use_design_controls",
      "try_another_direction",
    ]);
    expect(scheduled).toHaveLength(1);
    expect(runGeneration).not.toHaveBeenCalled();
    await scheduled[0]();
    const [run] = runGeneration.mock.calls[0];
    expect(run).toMatchObject({ generationId: GENERATION, eventId: EVENT, userId: USER });
    expect(run.startedAt).toBeGreaterThanOrEqual(before);
  });

  it("schedules nothing for any outcome but started", async () => {
    admin.fake.state.rpcAnswers.switch_card_shape = "needs_artwork";
    admin.fake.state.tables.generations = [
      {
        id: GENERATION,
        event_id: EVENT,
        kind: "shape_switch",
        from_design_id: DESIGN,
        shape: INPUT.shape,
      },
    ];
    for (const [generationId, outcome] of [
      [GENERATION, "existing"],
      [GENERATION, "in_flight"],
      [null, "published"],
      [null, "event_cap"],
      [null, "host_cap"],
      [null, "no_design"],
    ] as const) {
      admin.fake.state.startRows = [{ generation_id: generationId, outcome }];
      expect(await switchCardShape(INPUT)).toEqual({ outcome, generationId });
    }
    expect(scheduled).toEqual([]);
  });

  it("waits on a switch in flight only when it is the same one, else answers busy (spec.md §10)", async () => {
    admin.fake.state.rpcAnswers.switch_card_shape = "needs_artwork";
    admin.fake.state.startRows = [{ generation_id: GENERATION, outcome: "in_flight" }];
    const inFlight = (row: Record<string, unknown>) => {
      admin.fake.state.tables.generations = [
        {
          id: GENERATION,
          event_id: EVENT,
          kind: "shape_switch",
          from_design_id: DESIGN,
          shape: INPUT.shape,
          ...row,
        },
      ];
    };
    inFlight({});
    expect(await switchCardShape(INPUT)).toEqual({
      outcome: "in_flight",
      generationId: GENERATION,
    });
    // Another shape, or a co-host's other card: not this request.
    inFlight({ shape: "oval" });
    expect(await switchCardShape(INPUT)).toEqual({ outcome: "busy", generationId: null });
    inFlight({ kind: "another_direction", shape: null, feedback: "add a dinosaur" });
    expect(await switchCardShape(INPUT)).toEqual({ outcome: "busy", generationId: null });
    expect(scheduled).toEqual([]);
  });

  it("never paints a new shape for a design from before rendering families", async () => {
    admin.fake.state.rpcAnswers.switch_card_shape = "needs_artwork";
    admin.fake.state.tables.card_designs[0].art_brief = { subject: "an older card" };
    expect(await switchCardShape(INPUT)).toEqual({
      outcome: "unsupported_shape",
      generationId: null,
    });
    expect(admin.fake.rpc("start_generation")).toEqual([]);
    // Only the shapes its artwork already fits are offered.
    const options = await loadCardShapeOptionsAction(EVENT);
    expect(options?.options.filter((o) => o.available).map((o) => o.shape)).toEqual([
      "rectangle",
      "rounded-rectangle",
      "arch",
      "oval",
    ]);
    expect(options?.options.find((o) => o.shape === "square")).toMatchObject({
      instant: false,
      available: false,
    });
  });

  it("offers only the shapes the design's layout supports, refusing any other before writing", async () => {
    // art-top does not offer the circle (docs/card-system.md §2.3).
    expect(await switchCardShape({ ...INPUT, shape: "circle" })).toEqual({
      outcome: "unsupported_shape",
      generationId: null,
    });
    expect(admin.fake.state.rpcs).toEqual([]);
    // corners: rectangle, rounded rectangle and square only.
    card({ layout: "corners" });
    for (const shape of ["arch", "oval", "circle"] as const) {
      expect((await switchCardShape({ ...INPUT, shape })).outcome).toBe("unsupported_shape");
    }
    expect(admin.fake.state.rpcs).toEqual([]);
  });

  it("answers no_design before the event has a card", async () => {
    card({ active: null });
    expect(await switchCardShape(INPUT)).toEqual({ outcome: "no_design", generationId: null });
    expect(admin.fake.state.rpcs).toEqual([]);
    admin.fake.state.tables.events[0].active_card_design_id = DESIGN;
    admin.fake.state.rpcAnswers.switch_card_shape = "no_design";
    expect((await switchCardShape(INPUT)).outcome).toBe("no_design");
  });

  it("after publish: switches to a shape an existing artwork fits, never starts new artwork", async () => {
    access.mockResolvedValue(member(true));
    admin.fake.state.rpcAnswers.switch_card_shape = "switched";
    expect((await switchCardShape({ ...INPUT, shape: "rounded-rectangle" })).outcome).toBe(
      "switched",
    );
    admin.fake.state.rpcAnswers.switch_card_shape = "needs_artwork";
    expect(await switchCardShape(INPUT)).toEqual({ outcome: "published", generationId: null });
    expect(admin.fake.rpc("start_generation")).toEqual([]);
    expect(scheduled).toEqual([]);
  });

  it("answers disabled, starting nothing, with generation switched off", async () => {
    process.env.GENERATION_ENABLED = "false";
    resetEnvCache();
    admin.fake.state.rpcAnswers.switch_card_shape = "needs_artwork";
    expect(await switchCardShape(INPUT)).toEqual({ outcome: "disabled", generationId: null });
    expect(admin.fake.rpc("start_generation")).toEqual([]);
    // The instant switch needs no generation, so it still works.
    admin.fake.state.rpcAnswers.switch_card_shape = "switched";
    expect((await switchCardShape({ ...INPUT, shape: "oval" })).outcome).toBe("switched");
  });

  it("decides again from a fresh read when the active design changed under the switch", async () => {
    let calls = 0;
    admin.fake.state.rpcAnswers.switch_card_shape = () => {
      calls += 1;
      if (calls === 1) {
        // Another collaborator chose the square design meanwhile.
        admin.fake.state.tables.events[0].active_card_design_id = CHOSEN;
        return "not_active";
      }
      return "switched";
    };
    expect((await switchCardShape(INPUT)).outcome).toBe("switched");
    expect(admin.fake.rpc("switch_card_shape").map((a) => a.p_design_id)).toEqual([DESIGN, CHOSEN]);
  });

  it("decides again when start_generation finds the design changed or the artwork made meanwhile", async () => {
    for (const refused of ["not_active", "fitted"] as const) {
      admin.fake = fakeAdmin();
      card();
      let switches = 0;
      admin.fake.state.rpcAnswers.switch_card_shape = () =>
        ++switches === 1 ? "needs_artwork" : "switched";
      admin.fake.state.startRows = [{ generation_id: null, outcome: refused }];
      expect((await switchCardShape(INPUT)).outcome, refused).toBe("switched");
      expect(admin.fake.rpc("start_generation"), refused).toHaveLength(1);
    }
    expect(scheduled).toEqual([]);
  });

  it("answers busy, starting nothing, for a card that keeps changing", async () => {
    admin.fake.state.rpcAnswers.switch_card_shape = "not_active";
    expect(await switchCardShape(INPUT)).toEqual({ outcome: "busy", generationId: null });
    expect(admin.fake.rpc("switch_card_shape")).toHaveLength(SWITCH_ATTEMPTS);
    expect(admin.fake.rpc("start_generation")).toEqual([]);
  });

  it("validates its input before anything else", async () => {
    for (const input of [
      { ...INPUT, eventId: "not-a-uuid" },
      { ...INPUT, shape: "hexagon" },
      { ...INPUT, shape: undefined },
      { ...INPUT, idempotencyKey: "double-tap" },
      { eventId: EVENT, shape: "square" },
      { ...INPUT, designId: DESIGN },
      null,
    ]) {
      await expect(switchCardShape(input as never)).rejects.toThrow(
        "Invalid shape switch request.",
      );
    }
    expect(access).not.toHaveBeenCalled();
    expect(admin.fake.state.log).toEqual([]);
  });

  it("refuses a user who is not the event's owner or a co-host, before reading anything", async () => {
    for (const error of [new ForbiddenError(), new UnauthorizedError()]) {
      access.mockRejectedValueOnce(error);
      await expect(switchCardShape(INPUT)).rejects.toBe(error);
    }
    expect(admin.fake.state.log).toEqual([]);
  });

  it("surfaces a database error and an unexpected answer", async () => {
    admin.fake.state.errors.switch_card_shape = { message: "down", code: "XX000" };
    await expect(switchCardShape(INPUT)).rejects.toMatchObject({ code: "XX000" });
    delete admin.fake.state.errors.switch_card_shape;
    admin.fake.state.rpcAnswers.switch_card_shape = null;
    await expect(switchCardShape(INPUT)).rejects.toThrow(/switch_card_shape answered/);
  });

  it("has host copy for every refusal it can answer", () => {
    for (const outcome of [
      "published",
      "event_cap",
      "host_cap",
      "disabled",
      "no_design",
      "unsupported_shape",
    ]) {
      expect(generationFailure(outcome).code, outcome).toBe(outcome);
    }
  });
});

describe("loadCardShapeOptionsAction", () => {
  it("lists the shapes the layout supports, which are instant, and which are offered now", async () => {
    expect(await loadCardShapeOptionsAction(EVENT)).toEqual({
      designId: DESIGN,
      current: "rectangle",
      options: [
        { shape: "rectangle", instant: true, available: true },
        { shape: "rounded-rectangle", instant: true, available: true },
        { shape: "arch", instant: true, available: true },
        { shape: "oval", instant: true, available: true },
        { shape: "square", instant: false, available: true },
      ],
    });
    expect(access).toHaveBeenCalledWith(EVENT, "use_design_controls");
    // Never the storage key, ink or anything else of the artwork.
    for (const select of admin.fake.state.selects.filter((s) => s.table === "card_art_assets")) {
      expect(select.columns).toBe("fits_shapes");
    }
  });

  it("after publish offers only the shapes an existing artwork fits", async () => {
    access.mockResolvedValue(member(true));
    card({ activeShape: "oval" });
    const options = await loadCardShapeOptionsAction(EVENT);
    expect(options!.current).toBe("oval");
    expect(options!.options.filter((o) => o.available).map((o) => o.shape)).toEqual([
      "rectangle",
      "rounded-rectangle",
      "arch",
      "oval",
    ]);
  });

  it("reads no card, a non-member, a signed-out caller and a malformed id as null", async () => {
    card({ active: null });
    expect(await loadCardShapeOptionsAction(EVENT)).toBeNull();
    for (const error of [new ForbiddenError(), new UnauthorizedError()]) {
      access.mockRejectedValueOnce(error);
      expect(await loadCardShapeOptionsAction(EVENT)).toBeNull();
    }
    expect(await loadCardShapeOptionsAction("not-a-uuid")).toBeNull();
  });
});

describe("runningShapeSwitch", () => {
  const NOW = Date.parse("2026-10-05T12:00:00Z");
  const row = (over: Record<string, unknown>) => ({
    id: GENERATION,
    event_id: EVENT,
    kind: "shape_switch",
    status: "running",
    shape: "square",
    started_at: "2026-10-05T11:59:00Z",
    ...over,
  });

  it("names the shape switch still painting, for this event's collaborators only", async () => {
    admin.fake.state.tables.generations = [row({})];
    expect(await runningShapeSwitch(EVENT, { now: () => NOW })).toEqual({
      generationId: GENERATION,
      shape: "square",
    });
    expect(access).toHaveBeenLastCalledWith(EVENT, "use_design_controls");
    access.mockRejectedValueOnce(new ForbiddenError());
    await expect(runningShapeSwitch(EVENT)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("is null for nothing running, another kind, or a worker past its lifetime", async () => {
    for (const over of [
      { status: "succeeded" },
      { kind: "another_direction", shape: null },
      { started_at: "2026-10-05T11:00:00Z" },
    ]) {
      admin.fake.state.tables.generations = [row(over)];
      expect(await runningShapeSwitch(EVENT, { now: () => NOW })).toBeNull();
    }
  });
});
