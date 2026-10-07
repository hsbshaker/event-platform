import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeAdmin, type FakeAdmin } from "../../../tests/unit/support/fake-admin";

import { seedBoxes } from "@/lib/card/customization";
import { guestCardContent } from "@/lib/card/facts";
import { layoutCard, pairingFaces } from "@/lib/card/layout-card";
import { zoneFor } from "@/lib/card/layouts";
import { breakBoxText, type TextBox } from "@/lib/card/text-box";
import { parseStoredBoxes } from "@/lib/card/text-box-schema";
import type { FontMetricsResolver } from "@/lib/card/text/metrics";
import { allCuratedMetrics } from "@/lib/card/text/test-fonts";

import {
  activeCard,
  carriedWords,
  rebreakEventCustomizations,
  storeCarriedWords,
  storeCarriedWordsAsServer,
  type CardRef,
  type DbClient,
} from "./customization.server";

/**
 * The card editor's server data path (`spec.md §20.2`, §20.6; `docs/card-system.md §7`): every
 * customization re-broken after the event's words change, retried over a collaborator's save; and
 * the host's words carried to a fresh layout only from a customization, only to a card without
 * one, and stored only when none was made meanwhile. The SQL behind the writes is in `tests/db`.
 */

const EVENT = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";
const USER = "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2";
const A = "a0000000-0000-4000-8000-000000000001";
const B = "b0000000-0000-4000-8000-000000000002";
const INK = "#2B2118";
const PORTRAIT = ["rectangle", "rounded-rectangle", "arch", "oval"];

let metrics: FontMetricsResolver;
beforeAll(async () => {
  metrics = await allCuratedMetrics();
});

let fake: FakeAdmin;
const client = () => fake.client as unknown as DbClient;

function eventRow(over: Record<string, unknown> = {}) {
  return {
    id: EVENT,
    title: null,
    hosts: "Hosted by Maya & Tom",
    baby_name: null,
    venue_name: "The Willow House",
    address: null,
    event_date: "2026-06-06",
    start_time: "13:00",
    end_time: null,
    rsvp_deadline: null,
    timezone: "America/New_York",
    prompt_facts: null,
    active_card_design_id: A,
    active_card_shape: null,
    ...over,
  };
}

function designRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    event_id: EVENT,
    round: id === A ? 1 : 2,
    name: "A design",
    description: "A description.",
    shape: "rectangle",
    layout: "art-top",
    typography: {
      primary: id === A ? "hc_playfair_dmsans" : "grotesk_archivo_inter",
      alternates: [],
    },
    wording: {
      title: id === A ? "A Little Wild One" : "Lemons & Linen",
      invitationLine: "Please join us for a baby shower",
    },
    ...over,
  };
}

function artRow(designId: string, over: Record<string, unknown> = {}) {
  return {
    id: `art-${designId}`,
    event_id: EVENT,
    card_design_id: designId,
    storage_key: `${EVENT}/${designId}.png`,
    proportion: "portrait_5_7",
    fits_shapes: PORTRAIT,
    ink: Object.fromEntries(PORTRAIT.map((s) => [s, { text: { ink: INK } }])),
    created_at: "2026-10-05T11:00:00Z",
    ...over,
  };
}

/** A customization of `designId` in the rectangle, seeded for the event as stored now. */
function seededFor(
  designId: string,
  event = eventRow(),
  pairing = designRow(designId).typography.primary,
) {
  const design = designRow(designId);
  const words = {
    title: (event.title as string | null) ?? design.wording.title,
    invitationLine: design.wording.invitationLine,
  };
  const saved = guestCardContent({
    wording: words,
    event: {
      babyName: event.baby_name,
      hosts: event.hosts,
      eventDate: event.event_date,
      startTime: event.start_time,
      endTime: event.end_time,
      venueName: event.venue_name,
      address: event.address,
      rsvpDeadline: event.rsvp_deadline,
      timezone: event.timezone,
    },
  });
  const generated = layoutCard({
    zone: zoneFor("art-top", "rectangle"),
    proportion: "5:7",
    pairing: pairingFaces(pairing as Parameters<typeof pairingFaces>[0]),
    content: saved,
    ink: INK,
    metrics,
  }).boxes;
  return seedBoxes(generated, saved, metrics);
}

function customizationRow(designId: string, boxes: unknown, over: Record<string, unknown> = {}) {
  return {
    event_id: EVENT,
    card_design_id: designId,
    shape: "rectangle",
    revision: 3,
    boxes: JSON.parse(JSON.stringify(boxes)),
    updated_by: USER,
    updated_at: "2026-10-05T11:30:00Z",
    ...over,
  };
}

beforeEach(() => {
  fake = fakeAdmin();
  fake.state.tables = {
    events: [eventRow()],
    card_designs: [designRow(A), designRow(B)],
    card_art_assets: [artRow(A), artRow(B)],
    card_customizations: [],
  };
  fake.state.rpcAnswers.save_card_customization = 4;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const saves = () => fake.rpc("save_card_customization");
const storedBoxes = (args: Record<string, unknown>) => {
  const parsed = parseStoredBoxes(args.p_boxes);
  if (!parsed.ok) throw new Error(parsed.issues);
  return parsed.boxes;
};
const byId = (boxes: TextBox[], id: string) => boxes.find((b) => b.id === id)!;

describe("rebreakEventCustomizations", () => {
  it("writes nothing when every stored line still spells its words", async () => {
    fake.state.tables.card_customizations = [customizationRow(A, seededFor(A))];
    expect(await rebreakEventCustomizations(client(), EVENT)).toEqual({ updated: 0, failed: 0 });
    expect(saves()).toEqual([]);
  });

  it("re-breaks a changed fact's boxes, and only those, saving over the revision read", async () => {
    const before = seededFor(A);
    fake.state.tables.card_customizations = [customizationRow(A, before)];
    fake.state.tables.events = [eventRow({ venue_name: "The Grand Conservatory at Willow Park" })];
    expect(await rebreakEventCustomizations(client(), EVENT)).toEqual({ updated: 1, failed: 0 });
    const [save] = saves();
    expect(save).toMatchObject({
      p_event_id: EVENT,
      p_card_design_id: A,
      p_shape: "rectangle",
      p_expected_revision: 3,
    });
    const after = storedBoxes(save);
    const venue = byId(after, "venue");
    expect(venue.lines).toEqual(
      breakBoxText("The Grand Conservatory at Willow Park", venue, metrics).lines,
    );
    for (const box of after) if (box.id !== "venue") expect(box).toEqual(byId(before, box.id));
  });

  it("re-breaks the title box of every design for a new title, and a fact removed to no lines", async () => {
    fake.state.tables.card_customizations = [
      customizationRow(A, seededFor(A)),
      customizationRow(B, seededFor(B), { revision: 7 }),
    ];
    fake.state.tables.events = [eventRow({ title: "Juniper's Garden Party", hosts: null })];
    expect(await rebreakEventCustomizations(client(), EVENT)).toEqual({ updated: 2, failed: 0 });
    for (const save of saves()) {
      const boxes = storedBoxes(save);
      expect(byId(boxes, "title").lines.join(" ")).toBe("Juniper's Garden Party");
      expect(byId(boxes, "hosts").lines).toEqual([]);
    }
    expect(saves().map((s) => s.p_expected_revision)).toEqual([3, 7]);
  });

  it("reads each design's own drafted title while the event has none", async () => {
    // B's customization was broken for A's title, as a stale carry might leave it.
    fake.state.tables.card_customizations = [customizationRow(B, seededFor(A))];
    await rebreakEventCustomizations(client(), EVENT);
    expect(byId(storedBoxes(saves()[0]), "title").lines.join(" ")).toBe("Lemons & Linen");
  });

  it("gives way to a collaborator's save: reads the newer version and re-breaks that", async () => {
    const stale = customizationRow(A, seededFor(A));
    fake.state.tables.card_customizations = [stale];
    fake.state.tables.events = [eventRow({ hosts: "Hosted by the Lopez family" })];
    let calls = 0;
    fake.state.rpcAnswers.save_card_customization = () => {
      calls += 1;
      if (calls === 1) {
        // A collaborator saved revision 4 meanwhile.
        fake.state.tables.card_customizations = [{ ...stale, revision: 4 }];
        throw Object.assign(new Error("stale"), { code: "PT409" });
      }
      return 5;
    };
    // The fake answers thrown errors as rejections; map them to PostgREST's error object.
    const raw = fake.client.rpc.bind(fake.client);
    const wrapped = {
      ...fake.client,
      from: fake.client.from.bind(fake.client),
      rpc: async (name: string, args: Record<string, unknown>) => {
        try {
          return await raw(name, args);
        } catch (error) {
          return { data: null, error: error as { code: string; message: string } };
        }
      },
    } as unknown as DbClient;
    expect(await rebreakEventCustomizations(wrapped, EVENT)).toEqual({ updated: 1, failed: 0 });
    expect(saves().map((s) => s.p_expected_revision)).toEqual([3, 4]);
  });

  it("leaves a customization that does not parse as it is, and still re-breaks the others", async () => {
    fake.state.tables.card_customizations = [
      customizationRow(A, [{ id: "x", source: { kind: "image" } }]),
      customizationRow(B, seededFor(B)),
    ];
    fake.state.tables.events = [eventRow({ title: "A New Title" })];
    expect(await rebreakEventCustomizations(client(), EVENT)).toEqual({ updated: 1, failed: 0 });
    expect(saves().map((s) => s.p_card_design_id)).toEqual([B]);
  });

  it("counts and logs a write the database refuses for another reason", async () => {
    fake.state.tables.card_customizations = [customizationRow(A, seededFor(A))];
    fake.state.tables.events = [eventRow({ title: "A New Title" })];
    fake.state.errors.save_card_customization = { code: "42501", message: "not a member" };
    expect(await rebreakEventCustomizations(client(), EVENT)).toEqual({ updated: 0, failed: 1 });
    expect(console.error).toHaveBeenCalled();
  });

  it("reads nothing more for an event with no customization", async () => {
    expect(await rebreakEventCustomizations(client(), EVENT)).toEqual({ updated: 0, failed: 0 });
    expect(fake.state.log).toEqual(["select:card_customizations"]);
  });
});

describe("activeCard", () => {
  it("is the active design in its active shape, else its own", async () => {
    expect(await activeCard(client(), EVENT)).toEqual({ designId: A, shape: "rectangle" });
    fake.state.tables.events = [eventRow({ active_card_shape: "oval" })];
    expect(await activeCard(client(), EVENT)).toEqual({ designId: A, shape: "oval" });
    fake.state.tables.events = [eventRow({ active_card_design_id: null })];
    expect(await activeCard(client(), EVENT)).toBeNull();
  });
});

describe("carriedWords", () => {
  const NOW = new Date("2026-10-05T12:00:00Z");
  const carry = (
    from: CardRef = { designId: A, shape: "rectangle" },
    to: CardRef = { designId: B, shape: "rectangle" },
  ) => carriedWords(client(), { eventId: EVENT, userId: USER, from, to, now: NOW });

  /** A's customization as the host left it: a new font and line, and an added box. */
  function edited(): TextBox[] {
    const fraunces = { family: "Fraunces", weight: 700, italic: false };
    return seededFor(A)
      .map((b) =>
        b.id === "title"
          ? { ...b, font: fraunces, rotation: 9, color: "#112233" }
          : b.id === "invitationLine"
            ? { ...b, text: "Come celebrate Juniper", lines: ["Come celebrate Juniper"] }
            : b,
      )
      .concat({
        ...seededFor(A)[1],
        id: "c1",
        source: { kind: "custom" },
        text: "Bring a book",
        lines: ["Bring a book"],
        font: fraunces,
      });
  }

  it("carries nothing from a card the host never edited", async () => {
    expect(await carry()).toBeNull();
  });

  it("carries nothing to the same card, or to one with a customization of its own", async () => {
    fake.state.tables.card_customizations = [customizationRow(A, edited())];
    expect(
      await carry({ designId: A, shape: "rectangle" }, { designId: A, shape: "rectangle" }),
    ).toBeNull();
    fake.state.tables.card_customizations.push(customizationRow(B, seededFor(B)));
    expect(await carry()).toBeNull();
  });

  it("carries nothing to a shape no artwork of the design fits yet", async () => {
    fake.state.tables.card_customizations = [customizationRow(A, edited())];
    expect(
      await carry({ designId: A, shape: "rectangle" }, { designId: A, shape: "square" }),
    ).toBeNull();
  });

  it("carries nothing, with a log line, from a customization that does not parse", async () => {
    fake.state.tables.card_customizations = [customizationRow(A, [{ nonsense: true }])];
    expect(await carry()).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it("lays the host's words and fonts out fresh in the new card, in its ink", async () => {
    fake.state.tables.card_customizations = [customizationRow(A, edited())];
    const carried = await carry();
    expect(carried).toMatchObject({
      eventId: EVENT,
      to: { designId: B, shape: "rectangle" },
      userId: USER,
    });
    const boxes = carried!.boxes;
    const title = byId(boxes, "title");
    // The event has no title of its own: the new design's drafted title, in the host's font.
    expect(title.lines.join(" ")).toBe("Lemons & Linen");
    expect(title).toMatchObject({
      font: { family: "Fraunces", weight: 700 },
      rotation: 0,
      color: INK,
    });
    expect(byId(boxes, "invitationLine").text).toBe("Come celebrate Juniper");
    expect(byId(boxes, "c1")).toMatchObject({ text: "Bring a book", color: INK });
    // Facts in the new design's own faces, broken from the saved words.
    expect(byId(boxes, "venue").font).toEqual(pairingFaces("grotesk_archivo_inter").body);
    expect(byId(boxes, "venue").lines.join(" ")).toBe("The Willow House");
    expect(parseStoredBoxes(JSON.parse(JSON.stringify(boxes))).ok).toBe(true);
  });

  it("carries the host's own title as the event's title", async () => {
    fake.state.tables.events = [eventRow({ title: "Juniper's Garden Party" })];
    fake.state.tables.card_customizations = [customizationRow(A, edited())];
    const carried = await carry();
    expect(byId(carried!.boxes, "title").lines.join(" ")).toBe("Juniper's Garden Party");
  });

  it("starts the carried words where the new card's artwork stored its shift (card_compiler_v7)", async () => {
    fake.state.tables.card_customizations = [customizationRow(A, edited())];
    const plain = (await carry())!.boxes;
    const shift = { heading: -30, details: -10 };
    fake.state.tables.card_art_assets = fake.state.tables.card_art_assets.map((row) =>
      row.card_design_id === B
        ? {
            ...row,
            ink: Object.fromEntries(PORTRAIT.map((s) => [s, { text: { ink: INK, shift } }])),
          }
        : row,
    );
    const placed = (await carry())!.boxes;
    expect(byId(placed, "title").y).toBeCloseTo(byId(plain, "title").y - 30, 3);
    expect(byId(placed, "invitationLine").y).toBeCloseTo(byId(plain, "invitationLine").y - 30, 3);
    expect(byId(placed, "venue").y).toBeCloseTo(byId(plain, "venue").y - 10, 3);
    expect(byId(placed, "c1").y).toBeCloseTo(byId(plain, "c1").y - 10, 3);
  });
});

describe("storing carried words", () => {
  const carried = () => ({
    eventId: EVENT,
    to: { designId: B, shape: "rectangle" as const },
    boxes: seededFor(B),
    userId: USER,
  });

  it("creates the customization as the collaborator, at revision 1", async () => {
    expect(await storeCarriedWords(client(), carried())).toBe(true);
    expect(saves()).toEqual([
      {
        p_event_id: EVENT,
        p_card_design_id: B,
        p_shape: "rectangle",
        p_boxes: expect.any(Array),
        p_expected_revision: 0,
      },
    ]);
  });

  it("keeps a customization made meanwhile", async () => {
    fake.state.errors.save_card_customization = { code: "PT409", message: "stale" };
    expect(await storeCarriedWords(client(), carried())).toBe(false);
  });

  it("fails visibly for any other refusal", async () => {
    fake.state.errors.save_card_customization = { code: "42501", message: "not a member" };
    await expect(storeCarriedWords(client(), carried())).rejects.toMatchObject({ code: "42501" });
  });

  it("as the server (a shape switch's new artwork): inserts once, never over another", async () => {
    expect(await storeCarriedWordsAsServer(client(), carried())).toBe(true);
    expect(await storeCarriedWordsAsServer(client(), carried())).toBe(false);
    expect(fake.state.tables.card_customizations).toHaveLength(1);
    expect(fake.state.tables.card_customizations[0]).toMatchObject({
      event_id: EVENT,
      card_design_id: B,
      shape: "rectangle",
      updated_by: USER,
    });
  });
});
