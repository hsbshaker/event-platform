import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeAdmin } from "../../../tests/unit/support/fake-admin";
import type { FakeAdmin } from "../../../tests/unit/support/fake-admin";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { generatedTextLayer } from "@/lib/card/card-text.server";
import { InvalidCardDataError } from "@/lib/card/card-data";
import { panelFor } from "@/lib/card/layouts";

/**
 * The revealed card (`spec.md §7.3`, §7.11, §32 #27, #42; `docs/screen-spec.md` `card-reveal`):
 * members only; the active design in its active shape; the newest artwork that fits it, signed
 * short-lived; the persisted ink and panel; the generated text layer for the host's facts, the
 * facts the prompt states and the placeholders, with the unconfirmed boxes named; never a storage
 * key, raw output, telemetry or cost.
 */

const EVENT = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";
const DESIGN = "d1d2d3d4-e5e6-4f7a-8b9c-0d1e2f3a4b5c";
const NOW = Date.parse("2026-10-05T12:00:00Z");
const PORTRAIT = ["rectangle", "rounded-rectangle", "arch", "oval"];

const admin = vi.hoisted(() => ({ fake: undefined as unknown as FakeAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.fake.client }));
const access = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/event-access", () => ({
  requireEventAccess: (...args: unknown[]) => access(...args),
}));

const { CARD_ART_SIGNED_URL_TTL_SECONDS, loadRevealedCard } = await import("./reveal.server");

const WORDING = { title: "Lemons & Linen", invitationLine: "Please join us for a garden shower" };
const INK = "#2B2118";

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT,
    title: null,
    hosts: null,
    baby_name: null,
    venue_name: null,
    address: null,
    event_date: null,
    start_time: null,
    end_time: null,
    rsvp_deadline: null,
    timezone: null,
    prompt_facts: {
      eventType: "baby shower",
      title: null,
      hosts: null,
      honoree: "Maya Lopez",
      date: "December 19",
      time: null,
      venue: "Villa Rosa",
      location: null,
      partial: [],
    },
    active_card_design_id: DESIGN,
    active_card_shape: null,
    ...overrides,
  };
}

function designRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DESIGN,
    event_id: EVENT,
    round: 1,
    name: "Lemons & Linen",
    description: "A lemon branch over soft linen.",
    shape: "rectangle",
    layout: "art-top",
    art_mode: "illustration",
    typography: { primary: "oldstyle_garamond_worksans", alternates: [] },
    wording: WORDING,
    art_brief: { subject: "a lemon branch" },
    raw: { secret: "raw model output" },
    versions: { compiler: "card_compiler_v4" },
    ...overrides,
  };
}

function artRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    event_id: EVENT,
    card_design_id: DESIGN,
    proportion: "portrait_5_7",
    fits_shapes: PORTRAIT,
    storage_key: `${EVENT}/g1/original.png`,
    ink: Object.fromEntries(PORTRAIT.map((s) => [s, { text: { ink: INK } }])),
    created_at: "2026-10-05T11:00:00Z",
    ...overrides,
  };
}

const load = () => loadRevealedCard(EVENT, { now: () => NOW });

beforeEach(() => {
  admin.fake = fakeAdmin();
  admin.fake.state.tables = {
    events: [eventRow()],
    card_designs: [designRow()],
    card_art_assets: [artRow()],
  };
  admin.fake.state.storage["card-art"] = {
    [`${EVENT}/g1/original.png`]: new Uint8Array([1]),
    [`${EVENT}/g2/square.png`]: new Uint8Array([2]),
    [`${EVENT}/g3/newer.png`]: new Uint8Array([3]),
  };
  access.mockReset();
  access.mockResolvedValue({ user: { id: "u" }, role: "owner" });
});

describe("loadRevealedCard", () => {
  it("requires the viewer's access to the event before reading anything", async () => {
    for (const error of [new ForbiddenError(), new UnauthorizedError()]) {
      access.mockRejectedValueOnce(error);
      await expect(load()).rejects.toBe(error);
    }
    expect(access).toHaveBeenCalledWith(EVENT, "view_event");
    expect(admin.fake.state.log).toEqual([]);
  });

  it("returns null when the event has no design yet", async () => {
    admin.fake.state.tables.events = [eventRow({ active_card_design_id: null })];
    expect(await load()).toBeNull();
    expect(admin.fake.state.signs).toEqual([]);
  });

  it("returns the active design ready to render, with the unconfirmed boxes named", async () => {
    const revealed = await load();
    expect(revealed).not.toBeNull();
    const { card, unconfirmed, ...rest } = revealed!;
    expect(rest).toEqual({
      designId: DESIGN,
      round: 1,
      name: "Lemons & Linen",
      description: "A lemon branch over soft linen.",
      artworkExpiresAt: new Date(NOW + CARD_ART_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    });
    expect(card.shape).toBe("rectangle");
    expect(card.artwork).toEqual({
      src: `https://storage.test/card-art/${EVENT}/g1/original.png?token=signed`,
      proportion: "5:7",
    });
    expect(card.panels).toEqual([]);
    // Exactly the generated layer for the reveal's words: the prompt's honoree, date and venue as
    // written, the time placeholder, no hosts.
    const expected = await generatedTextLayer({
      layout: "art-top",
      shape: "rectangle",
      pairing: "oldstyle_garamond_worksans",
      content: {
        title: "Lemons & Linen",
        invitationLine: "Please join us for a garden shower",
        babyName: "Maya Lopez",
        hosts: null,
        date: "December 19",
        time: "1:00 pm",
        venue: "Villa Rosa",
        rsvpBy: null,
      },
      ink: INK,
    });
    expect(card.boxes).toEqual(expected);
    const byId = new Map(card.boxes.map((b) => [b.id, b]));
    expect(unconfirmed.map((id) => byId.get(id)?.source)).toEqual([
      { kind: "fact", slot: "babyName" },
      { kind: "fact", slot: "date" },
      { kind: "fact", slot: "time" },
      { kind: "fact", slot: "venue" },
    ]);
    // The artwork is signed short-lived from the private bucket.
    expect(admin.fake.state.signs).toEqual([
      {
        bucket: "card-art",
        key: `${EVENT}/g1/original.png`,
        expiresIn: CARD_ART_SIGNED_URL_TTL_SECONDS,
      },
    ]);
    expect(CARD_ART_SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(600);
  });

  it("never returns a storage key, raw output, the art brief, versions, telemetry or cost", async () => {
    const json = JSON.stringify(await load());
    expect(json).not.toContain('original.png"');
    expect(json).not.toMatch(/storage_key|storageKey|raw model output|art_brief|versions/);
    for (const select of admin.fake.state.selects) {
      expect(select.columns, select.table).not.toMatch(/\braw\b|art_brief|versions|telemetry/);
    }
  });

  it("shows the host's stored facts, confirmed, and the host's title", async () => {
    admin.fake.state.tables.events = [
      eventRow({
        title: "Maya's Garden Shower",
        baby_name: "Zoë",
        hosts: "Hosted by Ana & Leo",
        event_date: "2026-12-19",
        start_time: "13:00",
        venue_name: "Casa Limone",
      }),
    ];
    const revealed = await load();
    const texts = Object.fromEntries(revealed!.card.boxes.map((b) => [b.id, b.lines.join(" ")]));
    expect(texts).toMatchObject({
      title: "Maya's Garden Shower",
      babyName: "Zoë",
      hosts: "Hosted by Ana & Leo",
      date: "Saturday, December 19",
      time: "1:00 pm",
      venue: "Casa Limone",
    });
    expect(revealed!.unconfirmed).toEqual([]);
  });

  it("draws the active shape from the newest artwork that fits it, with its persisted panel", async () => {
    const panel = panelFor("art-top", "square");
    admin.fake.state.tables.events = [eventRow({ active_card_shape: "square" })];
    admin.fake.state.tables.card_art_assets = [
      artRow(),
      artRow({
        id: "a2",
        proportion: "square_1_1",
        fits_shapes: ["square", "circle"],
        storage_key: `${EVENT}/g2/square.png`,
        ink: { square: { text: { ink: INK } }, circle: { text: { ink: INK } } },
        created_at: "2026-10-05T11:10:00Z",
      }),
      artRow({
        id: "a3",
        proportion: "square_1_1",
        fits_shapes: ["square"],
        storage_key: `${EVENT}/g3/newer.png`,
        ink: { square: { text: { ink: "#FDF8EE", panel, panelColor: "#3A2A1F" } } },
        created_at: "2026-10-05T11:20:00Z",
      }),
    ];
    const revealed = await load();
    expect(revealed!.card.shape).toBe("square");
    expect(revealed!.card.artwork).toEqual({
      src: `https://storage.test/card-art/${EVENT}/g3/newer.png?token=signed`,
      proportion: "1:1",
    });
    expect(revealed!.card.panels).toEqual([{ ...panel, color: "#3A2A1F" }]);
    // A card_layouts_v3 panel keeps its fade into the artwork.
    expect(revealed!.card.panels[0].fade).toEqual({ kind: "edge", from: "bottom", length: 180 });
    expect(new Set(revealed!.card.boxes.map((b) => b.color))).toEqual(new Set(["#FDF8EE"]));
  });

  it("draws a card_layouts_v2 panel as it was persisted, with no fade", async () => {
    const v2Panel = {
      x: 30,
      y: 600,
      width: 940,
      height: 380,
      radius: 28,
      softEdge: { spread: 20, blur: 40 },
    };
    admin.fake.state.tables.events = [eventRow()];
    admin.fake.state.tables.card_art_assets = [
      artRow({ ink: { rectangle: { text: { ink: INK, panel: v2Panel, panelColor: "#F4EEE2" } } } }),
    ];
    const revealed = await load();
    expect(revealed!.card.panels).toEqual([{ ...v2Panel, color: "#F4EEE2" }]);
    expect(revealed!.card.panels[0]).not.toHaveProperty("fade");
  });

  it("reads only this event's design and artwork", async () => {
    admin.fake.state.tables.card_designs = [designRow({ event_id: "another-event" })];
    await expect(load()).rejects.toThrow(/active card design was not found/);
    admin.fake.state.tables.card_designs = [designRow()];
    admin.fake.state.tables.card_art_assets = [artRow({ event_id: "another-event" })];
    await expect(load()).rejects.toThrow(/no artwork for the rectangle card/);
  });

  it("refuses a record it cannot draw as persisted rather than drawing something else", async () => {
    // No artwork fits the active shape.
    admin.fake.state.tables.events = [eventRow({ active_card_shape: "circle" })];
    await expect(load()).rejects.toThrow(/no artwork for the circle card/);
    // No ink for the shape, or a malformed one.
    admin.fake.state.tables.events = [eventRow()];
    for (const ink of [{}, { rectangle: { text: { ink: "navy" } } }]) {
      admin.fake.state.tables.card_art_assets = [artRow({ ink })];
      await expect(load()).rejects.toThrow(/no ink for the rectangle card/);
    }
    admin.fake.state.tables.card_art_assets = [
      artRow({
        ink: { rectangle: { text: { ink: INK, panel: { x: 1 }, panelColor: "#FFFFFF" } } },
      }),
    ];
    await expect(load()).rejects.toThrow(/panel for the rectangle card is malformed/);
    admin.fake.state.tables.card_art_assets = [
      artRow({
        ink: {
          rectangle: {
            text: { ink: INK, panel: panelFor("art-top", "rectangle"), panelColor: "white" },
          },
        },
      }),
    ];
    await expect(load()).rejects.toBeInstanceOf(InvalidCardDataError);
    // A design that is not one of the layout set's.
    admin.fake.state.tables.card_art_assets = [artRow()];
    admin.fake.state.tables.card_designs = [designRow({ layout: "spiral" })];
    await expect(load()).rejects.toThrow(/design is malformed/);
  });

  it("fails rather than returning a card whose artwork cannot be signed", async () => {
    admin.fake.state.errors["storage:sign"] = { message: "storage unavailable" };
    await expect(load()).rejects.toMatchObject({ message: "storage unavailable" });
  });
});
