import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeAdmin } from "../../../tests/unit/support/fake-admin";
import type { FakeAdmin } from "../../../tests/unit/support/fake-admin";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { generatedTextLayer } from "@/lib/card/card-text.server";
import { InvalidCardDataError } from "@/lib/card/card-data";
import { panelFor } from "@/lib/card/layouts";
import type { TextBox } from "@/lib/card/text-box";

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

const { CARD_ART_SIGNED_URL_TTL_SECONDS, loadEventDesigns, loadRevealedCard } =
  await import("./reveal.server");

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
    status: "DRAFT",
    published_at: null,
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

  it("says whether the event is published, as start_generation decides it", async () => {
    for (const [overrides, published] of [
      [{}, false],
      [{ status: "PUBLISHED" }, true],
      [{ status: "PASSED" }, true],
      [{ status: "DRAFT", published_at: "2026-10-05T00:00:00Z" }, true],
    ] as const) {
      admin.fake.state.tables.events = [eventRow(overrides)];
      expect((await load())?.published).toBe(published);
    }
  });

  it("returns the active design ready to render, with the unconfirmed boxes named", async () => {
    const revealed = await load();
    expect(revealed).not.toBeNull();
    const { card, unconfirmed, ...rest } = revealed!;
    expect(rest).toEqual({
      designId: DESIGN,
      active: true,
      published: false,
      round: 1,
      title: "Lemons & Linen",
      name: "Lemons & Linen",
      description: "A lemon branch over soft linen.",
      // The prompt-stated values the card shows, for the page beneath it.
      stated: { babyName: "Maya Lopez", date: "December 19", venue: "Villa Rosa" },
      // The host has not edited this card: its generated layout.
      customization: null,
      lowContrast: false,
      artworkExpiresAt: new Date(NOW + CARD_ART_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    });
    expect(card).not.toHaveProperty("placement");
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
    expect(revealed!.title).toBe("Maya's Garden Shower");
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

  it("after a shape switch draws its new artwork, and switching back draws the original (spec.md §7.14)", async () => {
    // The design's original artwork (rectangle, rounded rectangle), then the artwork a shape switch
    // added to the same design for the square card.
    admin.fake.state.tables.card_art_assets = [
      artRow({ fits_shapes: ["rectangle", "rounded-rectangle"] }),
      artRow({
        id: "a2",
        proportion: "square_1_1",
        fits_shapes: ["square"],
        storage_key: `${EVENT}/g2/square.png`,
        ink: { square: { text: { ink: "#1F2A44" } } },
        created_at: "2026-10-05T11:30:00Z",
      }),
    ];
    admin.fake.state.tables.events = [eventRow({ active_card_shape: "square" })];
    const switched = await load();
    expect(switched!.card.shape).toBe("square");
    expect(switched!.card.artwork).toEqual({
      src: `https://storage.test/card-art/${EVENT}/g2/square.png?token=signed`,
      proportion: "1:1",
    });
    expect(new Set(switched!.card.boxes.map((b) => b.color))).toEqual(new Set(["#1F2A44"]));
    expect(switched!.designId).toBe(DESIGN);

    for (const shape of ["rectangle", "rounded-rectangle"]) {
      admin.fake.state.tables.events = [eventRow({ active_card_shape: shape })];
      const back = await load();
      expect(back!.card.shape).toBe(shape);
      expect(back!.card.artwork.src).toContain("g1/original.png");
      expect(new Set(back!.card.boxes.map((b) => b.color))).toEqual(new Set([INK]));
    }
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

  describe("the art giving way (card_layouts_v4)", () => {
    const PLATE = {
      kind: "plate",
      art: { x: 100, y: 0, width: 800, height: 1120 },
      cut: { y: 770, keep: "above" },
      fill: "#F4EEE2",
    } as const;

    it("draws a stored plate exactly as persisted, with no panel", async () => {
      admin.fake.state.tables.card_art_assets = [
        artRow({ ink: { rectangle: { text: { ink: INK, placement: PLATE } } } }),
      ];
      const revealed = await load();
      expect(revealed!.card.placement).toEqual(PLATE);
      expect(revealed!.card.panels).toEqual([]);
      expect(revealed!.lowContrast).toBe(false);
      expect(new Set(revealed!.card.boxes.map((b) => b.color))).toEqual(new Set([INK]));
    });

    it("draws a stored crop exactly as persisted", async () => {
      const crop = { kind: "crop", art: { x: -80, y: 0, width: 1160, height: 1624 } } as const;
      admin.fake.state.tables.card_art_assets = [
        artRow({ ink: { rectangle: { text: { ink: INK, placement: crop } } } }),
      ];
      expect((await load())!.card.placement).toEqual(crop);
    });

    it("tells the host about low-contrast centred words while the card is not customized", async () => {
      admin.fake.state.tables.card_art_assets = [
        artRow({ ink: { rectangle: { text: { ink: INK, lowContrast: true, contrast: 3.1 } } } }),
      ];
      const revealed = await load();
      expect(revealed!.lowContrast).toBe(true);
      expect(revealed!.card).not.toHaveProperty("placement");
      expect(revealed!.card.panels).toEqual([]);
      // Nothing is drawn behind the words: the ink is the stored one, on the artwork.
      expect(new Set(revealed!.card.boxes.map((b) => b.color))).toEqual(new Set([INK]));
    });

    it("refuses a stored zone it could not draw as persisted", async () => {
      const refused = [
        // A placement never comes with a panel.
        { ink: INK, placement: PLATE, panel: panelFor("art-top", "rectangle"), panelColor: INK },
        // A plate needs its cut and fill.
        { ink: INK, placement: { kind: "plate", art: PLATE.art } },
        { ink: INK, placement: { ...PLATE, art: { x: 0, y: 0, width: 800, height: 800 } } },
        { ink: INK, placement: { kind: "spiral", art: PLATE.art } },
        // Low contrast is below 4.5:1, with nothing else stored beside it.
        { ink: INK, lowContrast: true, contrast: 4.6 },
        { ink: INK, lowContrast: true },
        { ink: INK, lowContrast: true, contrast: 2, placement: PLATE },
      ];
      for (const zone of refused) {
        admin.fake.state.tables.card_art_assets = [artRow({ ink: { rectangle: { text: zone } } })];
        await expect(load(), JSON.stringify(zone)).rejects.toThrow();
      }
    });
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

  describe("a design asked for by id (spec.md §7.15: revealed before it is chosen)", () => {
    const NEW = "e1e2e3e4-f5f6-4a7b-8c9d-0e1f2a3b4c5d";
    beforeEach(() => {
      // The active design is shown as an oval; the new one is a square card of its own.
      admin.fake.state.tables.events = [eventRow({ active_card_shape: "oval" })];
      admin.fake.state.tables.card_designs = [
        designRow(),
        designRow({ id: NEW, round: 2, name: "Starry Grove", shape: "square" }),
      ];
      admin.fake.state.tables.card_art_assets = [
        artRow(),
        artRow({
          id: "a2",
          card_design_id: NEW,
          proportion: "square_1_1",
          fits_shapes: ["square", "circle"],
          storage_key: `${EVENT}/g2/square.png`,
          ink: { square: { text: { ink: INK } }, circle: { text: { ink: INK } } },
        }),
      ];
    });

    it("draws a design that is not active in its own shape, and says it is not active", async () => {
      const revealed = await loadRevealedCard(EVENT, { now: () => NOW, designId: NEW });
      expect(revealed).toMatchObject({
        designId: NEW,
        active: false,
        round: 2,
        name: "Starry Grove",
      });
      expect(revealed!.card.shape).toBe("square");
      expect(revealed!.card.artwork.src).toContain("g2/square.png");
    });

    it("draws the active design in its active shape whether asked for by id or not", async () => {
      for (const options of [{}, { designId: DESIGN }]) {
        const revealed = await loadRevealedCard(EVENT, { now: () => NOW, ...options });
        expect(revealed).toMatchObject({ designId: DESIGN, active: true });
        expect(revealed!.card.shape).toBe("oval");
      }
    });

    it("reads a design of another event, or an unknown one, as absent", async () => {
      admin.fake.state.tables.card_designs[1].event_id = "another-event";
      expect(await loadRevealedCard(EVENT, { now: () => NOW, designId: NEW })).toBeNull();
      expect(
        await loadRevealedCard(EVENT, {
          now: () => NOW,
          designId: "00000000-0000-4000-8000-000000000000",
        }),
      ).toBeNull();
      expect(admin.fake.state.signs).toEqual([]);
    });

    it("checks the viewer's access first", async () => {
      access.mockRejectedValueOnce(new ForbiddenError());
      await expect(
        loadRevealedCard(EVENT, { now: () => NOW, designId: NEW }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(admin.fake.state.log).toEqual([]);
    });
  });

  it("fails rather than returning a card whose artwork cannot be signed", async () => {
    admin.fake.state.errors["storage:sign"] = { message: "storage unavailable" };
    await expect(load()).rejects.toMatchObject({ message: "storage unavailable" });
  });
});

describe("loadEventDesigns", () => {
  const SECOND = "e1e2e3e4-f5f6-4a7b-8c9d-0e1f2a3b4c5d";
  const THIRD = "f1f2f3f4-a5a6-4b7c-8d9e-0f1a2b3c4d5e";
  const NO_ART = "a9a8a7a6-b5b4-4c3d-8e2f-1a0b9c8d7e6f";
  const list = () => loadEventDesigns(EVENT, { now: () => NOW });

  function threeDesigns() {
    admin.fake.state.tables.events = [eventRow({ active_card_design_id: SECOND })];
    // Stored out of order: the list is by round.
    admin.fake.state.tables.card_designs = [
      designRow({ id: THIRD, round: 3, name: "Third", shape: "arch" }),
      designRow({ id: DESIGN, round: 1, name: "First" }),
      designRow({ id: SECOND, round: 2, name: "Second" }),
      designRow({ id: NO_ART, round: 4, name: "Pending" }),
    ];
    admin.fake.state.tables.card_art_assets = [
      artRow({ id: "a1", card_design_id: DESIGN, storage_key: `${EVENT}/g1/original.png` }),
      artRow({ id: "a2", card_design_id: SECOND, storage_key: `${EVENT}/g1/original.png` }),
      artRow({ id: "a3", card_design_id: THIRD, storage_key: `${EVENT}/g1/original.png` }),
    ];
  }

  it("requires the viewer's access to the event, once, before reading anything", async () => {
    access.mockRejectedValueOnce(new ForbiddenError());
    await expect(list()).rejects.toBeInstanceOf(ForbiddenError);
    expect(admin.fake.state.log).toEqual([]);
    threeDesigns();
    await list();
    expect(access).toHaveBeenCalledTimes(2);
    expect(access).toHaveBeenLastCalledWith(EVENT, "view_event");
  });

  it("lists the designs that have artwork in round order, marking only the active one", async () => {
    threeDesigns();
    const designs = await list();
    expect(designs.map((d) => [d.name, d.round, d.active])).toEqual([
      ["First", 1, false],
      ["Second", 2, true],
      ["Third", 3, false],
    ]);
    expect(designs.map((d) => d.designId)).toEqual([DESIGN, SECOND, THIRD]);
    expect(designs[2].card.shape).toBe("arch");
    expect(designs[0].card.artwork.src).toContain("token=signed");
  });

  it("leaves out a design it cannot draw, logging it, rather than failing the page", async () => {
    threeDesigns();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    admin.fake.state.tables.card_art_assets[2] = {
      ...admin.fake.state.tables.card_art_assets[2],
      ink: "not an ink record",
    };
    const designs = await list();
    expect(designs.map((d) => d.name)).toEqual(["First", "Second"]);
    expect(errors).toHaveBeenCalledWith(
      "[designs] a design could not be drawn",
      expect.objectContaining({ designId: THIRD }),
    );
  });

  it("draws the active design in the event's active shape and the others in their own", async () => {
    threeDesigns();
    admin.fake.state.tables.events = [
      eventRow({ active_card_design_id: SECOND, active_card_shape: "oval" }),
    ];
    const shapes = (await list()).map((d) => d.card.shape);
    expect(shapes).toEqual(["rectangle", "oval", "arch"]);
  });

  it("reads the event, designs, artwork and customizations once each and signs each artwork", async () => {
    threeDesigns();
    await list();
    expect(admin.fake.state.log.filter((l) => l.startsWith("select:"))).toEqual([
      "select:events",
      "select:card_designs",
      "select:card_art_assets",
      "select:card_customizations",
    ]);
    expect(admin.fake.state.signs).toHaveLength(3);
    expect(
      admin.fake.state.signs.every((s) => s.expiresIn === CARD_ART_SIGNED_URL_TTL_SECONDS),
    ).toBe(true);
  });

  it("says each design is published when the event is, and is empty with no designs", async () => {
    threeDesigns();
    admin.fake.state.tables.events = [
      eventRow({ active_card_design_id: SECOND, status: "PUBLISHED" }),
    ];
    expect((await list()).every((d) => d.published)).toBe(true);
    admin.fake.state.tables.card_designs = [];
    expect(await list()).toEqual([]);
  });

  it("never returns a storage key, raw output or the art brief", async () => {
    threeDesigns();
    const json = JSON.stringify(await list());
    expect(json).not.toMatch(/storage_key|storageKey|raw model output|art_brief|versions/);
  });

  it("draws each design with the host's customization for the shape it is shown in", async () => {
    threeDesigns();
    admin.fake.state.tables.card_customizations = [
      { ...(await customizationOf(DESIGN)), card_design_id: DESIGN },
    ];
    const cards = await list();
    const first = cards.find((c) => c.designId === DESIGN)!;
    expect(first.customization).toMatchObject({ revision: 4, unreadable: false });
    expect(first.card.boxes.find((b) => b.id === "added-1")).toBeDefined();
    expect(cards.filter((c) => c.designId !== DESIGN).every((c) => c.customization === null)).toBe(
      true,
    );
  });
});

/**
 * A stored customization of the design in the rectangle (`spec.md §20.5`): the seed of its saved
 * words (the event's title and stored facts — none here), the title moved and an added box.
 */
async function customizationOf(designId: string, shape = "rectangle") {
  const generated = await generatedTextLayer({
    layout: "art-top",
    shape: "rectangle",
    pairing: "oldstyle_garamond_worksans",
    content: { title: WORDING.title, invitationLine: WORDING.invitationLine },
    ink: INK,
  });
  const boxes: TextBox[] = [
    ...generated.map((b) => (b.id === "title" ? { ...b, y: 120, rotation: -6 } : b)),
    {
      ...generated.find((b) => b.id === "invitationLine")!,
      id: "added-1",
      source: { kind: "custom" },
      text: "Bring a book",
      lines: ["Bring a book"],
      y: 1300,
      z: 20,
    },
  ];
  return {
    event_id: EVENT,
    card_design_id: designId,
    shape,
    revision: 4,
    boxes: JSON.parse(JSON.stringify(boxes)) as unknown,
    updated_by: "u",
    updated_at: "2026-10-05T11:30:00Z",
  };
}

describe("the host's customization (spec.md §20.5, §31 Card rendering and envelope)", () => {
  it("draws the stored boxes, each in its stored lines, in place of the generated layer", async () => {
    const stored = await customizationOf(DESIGN);
    admin.fake.state.tables.card_customizations = [stored];
    const revealed = (await load())!;
    expect(revealed.customization).toEqual({
      revision: 4,
      updatedAt: "2026-10-05T11:30:00Z",
      unreadable: false,
    });
    const boxes = new Map(revealed.card.boxes.map((b) => [b.id, b]));
    const storedBoxes = stored.boxes as TextBox[];
    expect(boxes.get("title")).toEqual(storedBoxes.find((b) => b.id === "title"));
    expect(boxes.get("added-1")).toEqual(storedBoxes.find((b) => b.id === "added-1"));
    expect(boxes.get("invitationLine")).toEqual(storedBoxes.find((b) => b.id === "invitationLine"));
  });

  it("shows Creation Mode's unconfirmed facts in their boxes, marked, and nothing of them to guests", async () => {
    admin.fake.state.tables.card_customizations = [await customizationOf(DESIGN)];
    const host = (await load())!;
    const venue = host.card.boxes.find((b) => b.id === "venue")!;
    // The prompt-stated venue, broken at the box's own width; stored with no lines.
    expect(venue.lines).toEqual(["Villa Rosa"]);
    expect(host.unconfirmed).toEqual(["babyName", "date", "time", "venue"]);

    const guest = (await loadRevealedCard(EVENT, { now: () => NOW, audience: "guest" }))!;
    for (const id of ["babyName", "date", "time", "venue", "hosts", "rsvpBy"]) {
      expect(guest.card.boxes.find((b) => b.id === id)!.lines, id).toEqual([]);
    }
    expect(guest.unconfirmed).toEqual([]);
    // The host's own words are the guests' too.
    expect(guest.card.boxes.find((b) => b.id === "added-1")!.lines).toEqual(["Bring a book"]);
  });

  it("shows a saved fact in the lines stored for it, and re-breaks one stored for older words", async () => {
    admin.fake.state.tables.events = [
      eventRow({ venue_name: "The Willow House", prompt_facts: null }),
    ];
    const stored = await customizationOf(DESIGN);
    const boxes = (stored.boxes as TextBox[]).map((b) =>
      b.id === "venue" ? { ...b, lines: ["The Old Barn"] } : b,
    );
    admin.fake.state.tables.card_customizations = [{ ...stored, boxes }];
    for (const audience of ["host", "guest"] as const) {
      const revealed = (await loadRevealedCard(EVENT, { now: () => NOW, audience }))!;
      expect(revealed.card.boxes.find((b) => b.id === "venue")!.lines, audience).toEqual([
        "The Willow House",
      ]);
    }
  });

  it("shows the event's title in the title box, whatever the box was broken for", async () => {
    admin.fake.state.tables.events = [eventRow({ title: "Juniper's Garden Party" })];
    admin.fake.state.tables.card_customizations = [await customizationOf(DESIGN)];
    const revealed = (await load())!;
    expect(revealed.title).toBe("Juniper's Garden Party");
    expect(revealed.card.boxes.find((b) => b.id === "title")!.lines.join(" ")).toBe(
      "Juniper's Garden Party",
    );
  });

  it("draws the generated layer, with the notice, for stored boxes that do not parse", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const boxes of [
      [{ id: "x", source: { kind: "image" } }],
      [{ ...((await customizationOf(DESIGN)).boxes as TextBox[])[0], color: "red" }],
      { not: "an array" },
    ]) {
      admin.fake.state.tables.card_customizations = [{ ...(await customizationOf(DESIGN)), boxes }];
      const revealed = (await load())!;
      expect(revealed.customization).toMatchObject({ revision: 4, unreadable: true });
      expect(revealed.card.boxes.map((b) => b.id)).not.toContain("added-1");
      expect(revealed.card.boxes.find((b) => b.id === "title")!.rotation).toBe(0);
    }
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("uses only the customization of the shape shown", async () => {
    admin.fake.state.tables.card_customizations = [await customizationOf(DESIGN, "oval")];
    const revealed = (await load())!;
    expect(revealed.customization).toBeNull();
    expect(revealed.card.boxes.map((b) => b.id)).not.toContain("added-1");
  });
});
