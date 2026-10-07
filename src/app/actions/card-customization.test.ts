import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeAdmin, type FakeAdmin } from "../../../tests/unit/support/fake-admin";

import { ForbiddenError } from "@/lib/auth/errors";
import { generatedTextLayer } from "@/lib/card/card-text.server";
import { seedBoxes } from "@/lib/card/customization";
import { breakBoxText, type TextBox } from "@/lib/card/text-box";
import { parseStoredBoxes } from "@/lib/card/text-box-schema";
import { cardFontMetrics } from "@/lib/card/text/card-fonts.server";
import { CARD_TEXT_FIT_MESSAGE } from "@/lib/events/card-text-fit.server";

/**
 * The card editor's saves (`spec.md §20.2`, §20.4, §20.5; `docs/card-system.md §7`; §31 Card
 * editor): owner or co-host only, before and after publish; boxes held to the schema and the
 * editor's limits; lines always the server's; a stale revision refused with the latest; the title
 * box writing `Event.title` with the save; fact boxes linked; `Reset card` a new revision of the
 * seed. The SQL behind the writes is in `tests/db/card-editor.test.ts`.
 */

const EVENT = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";
const DESIGN = "d1d2d3d4-e5e6-4f7a-8b9c-0d1e2f3a4b5c";
const OTHER = "e1e2e3e4-e5e6-4f7a-8b9c-0d1e2f3a4b5c";
const USER = "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2";
const INK = "#2B2118";
const PORTRAIT = ["rectangle", "rounded-rectangle", "arch", "oval"];
const WORDING = { title: "Lemons & Linen", invitationLine: "Please join us for a garden shower" };

const db = vi.hoisted(() => ({ fake: undefined as unknown as FakeAdmin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.fake.client }));
const access = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/event-access", () => ({
  requireEventAccess: (...args: unknown[]) => access(...args),
}));

const { resetCardCustomization, saveCardCustomization } = await import("./card-customization");

function eventRow(over: Record<string, unknown> = {}) {
  return {
    id: EVENT,
    title: null,
    hosts: null,
    baby_name: null,
    venue_name: "The Willow House",
    address: null,
    event_date: "2026-06-06",
    start_time: null,
    end_time: null,
    rsvp_deadline: null,
    timezone: null,
    prompt_facts: null,
    ...over,
  };
}

function designRow(id = DESIGN) {
  return {
    id,
    event_id: EVENT,
    round: 1,
    name: "Lemons & Linen",
    description: "A lemon branch over soft linen.",
    shape: "rectangle",
    layout: "art-top",
    typography: { primary: "oldstyle_garamond_worksans", alternates: [] },
    wording: WORDING,
  };
}

function artRow(id = DESIGN) {
  return {
    id: `art-${id}`,
    event_id: EVENT,
    card_design_id: id,
    storage_key: `${EVENT}/g1/original.png`,
    proportion: "portrait_5_7",
    fits_shapes: PORTRAIT,
    ink: Object.fromEntries(PORTRAIT.map((s) => [s, { text: { ink: INK } }])),
    created_at: "2026-10-05T11:00:00Z",
  };
}

/** The seed of the design's rectangle for the event as stored: the first edit's starting point. */
let seed: TextBox[];
beforeAll(async () => {
  const saved = {
    title: WORDING.title,
    invitationLine: WORDING.invitationLine,
    date: "Saturday, June 6",
    venue: "The Willow House",
  };
  const generated = await generatedTextLayer({
    layout: "art-top",
    shape: "rectangle",
    pairing: "oldstyle_garamond_worksans",
    content: { ...saved, time: "1:00 pm" },
    ink: INK,
  });
  seed = seedBoxes(generated, saved, await cardFontMetrics(generated.map((b) => b.font)));
});

/** What the editor sends: the boxes it shows, lines and all. */
const sent = (boxes: TextBox[]) => JSON.parse(JSON.stringify(boxes)) as TextBox[];

/** The database's answers: the save functions keep `card_customizations` and the title. */
function installDatabase() {
  const tables = db.fake.state.tables;
  const write = (args: Record<string, unknown>) => {
    const rows = tables.card_customizations;
    const at = rows.findIndex(
      (r) => r.card_design_id === args.p_card_design_id && r.shape === args.p_shape,
    );
    const current = at >= 0 ? (rows[at].revision as number) : 0;
    if (current !== args.p_expected_revision) {
      throw Object.assign(new Error("card customization revision is stale"), { code: "PT409" });
    }
    const row = {
      event_id: args.p_event_id,
      card_design_id: args.p_card_design_id,
      shape: args.p_shape,
      boxes: args.p_boxes,
      revision: current + 1,
      updated_by: USER,
      updated_at: `2026-10-05T12:00:0${current + 1}Z`,
    };
    if (at >= 0) rows[at] = row;
    else rows.push(row);
    return current + 1;
  };
  db.fake.state.rpcAnswers.save_card_customization = write;
  db.fake.state.rpcAnswers.save_card_customization_with_title = (args: Record<string, unknown>) => {
    const revision = write(args);
    tables.events[0].title = args.p_title;
    return revision;
  };
  // A thrown answer is a refused call: PostgREST's error object, as supabase-js returns it.
  const rpc = db.fake.client.rpc.bind(db.fake.client);
  db.fake.client.rpc = (async (name: string, args: Record<string, unknown>) => {
    try {
      return await rpc(name, args);
    } catch (error) {
      return { data: null, error };
    }
  }) as typeof db.fake.client.rpc;
}

beforeEach(() => {
  db.fake = fakeAdmin();
  db.fake.state.tables = {
    events: [eventRow()],
    card_designs: [designRow(), designRow(OTHER)],
    card_art_assets: [artRow(), artRow(OTHER)],
    card_customizations: [],
  };
  installDatabase();
  access.mockReset().mockResolvedValue({ user: { id: USER }, role: "cohost", context: {} });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const save = (boxes: unknown, revision = 0, over: Record<string, unknown> = {}) =>
  saveCardCustomization({
    eventId: EVENT,
    designId: DESIGN,
    shape: "rectangle",
    boxes,
    revision,
    ...over,
  });
const writes = () => db.fake.rpcNames().filter((n) => n.startsWith("save_card_customization"));
const stored = (designId = DESIGN) => {
  const row = db.fake.state.tables.card_customizations.find((r) => r.card_design_id === designId)!;
  const parsed = parseStoredBoxes(row.boxes);
  if (!parsed.ok) throw new Error(parsed.issues);
  return parsed.boxes;
};
const byId = (boxes: TextBox[], id: string) => boxes.find((b) => b.id === id)!;

describe("saveCardCustomization", () => {
  it("creates the customization on the first edit, with the server's lines, never the editor's", async () => {
    const boxes = sent(seed).map((b) =>
      b.id === "date" ? { ...b, x: 40, lines: ["FORGED"] } : { ...b, lines: ["FORGED"] },
    );
    const result = await save(boxes);
    expect(result).toMatchObject({ ok: true, customization: { revision: 1, unreadable: false } });
    expect(access).toHaveBeenCalledWith(EVENT, "edit_event_content");
    expect(db.fake.rpc("save_card_customization")[0]).toMatchObject({ p_expected_revision: 0 });
    const after = stored();
    expect(after.flatMap((b) => b.lines)).not.toContain("FORGED");
    // Unchanged boxes keep the seed's lines; the moved date keeps them too.
    for (const box of after) expect(box.lines, box.id).toEqual(byId(seed, box.id).lines);
    expect(byId(after, "date").x).toBe(40);
  });

  it("breaks a box whose words or width changed, and keeps the rest", async () => {
    const added = {
      ...byId(seed, "invitationLine"),
      id: "added-1",
      source: { kind: "custom" },
      text: "Bring a book instead of a card",
    };
    const boxes = [...sent(seed).map((b) => (b.id === "venue" ? { ...b, width: 160 } : b)), added];
    const result = await save(boxes);
    expect(result.ok).toBe(true);
    const after = stored();
    const venue = byId(after, "venue");
    expect(venue.lines).toEqual(
      breakBoxText("The Willow House", venue, await cardFontMetrics([venue.font])).lines,
    );
    expect(byId(after, "added-1").lines.join(" ")).toBe("Bring a book instead of a card");
    expect(byId(after, "title").lines).toEqual(byId(seed, "title").lines);
  });

  it("takes a fact box's words from the event, never from the box", async () => {
    const boxes = sent(seed).map((b) =>
      b.id === "venue" ? { ...b, text: "Somewhere else", width: 300 } : b,
    );
    expect((await save(boxes)).ok).toBe(true);
    const venue = byId(stored(), "venue");
    expect(venue).not.toHaveProperty("text");
    expect(venue.lines.join(" ")).toBe("The Willow House");
  });

  it("refuses a stale revision with the latest customization, writing nothing", async () => {
    await save(sent(seed));
    await save(
      sent(seed).map((b) => (b.id === "title" ? { ...b, y: 100 } : b)),
      1,
    );
    db.fake.state.rpcs = [];
    const result = await save(sent(seed), 1);
    expect(result).toMatchObject({
      ok: false,
      reason: "conflict",
      latest: { revision: 2, updatedBy: USER },
    });
    expect(
      result.ok === false && result.reason === "conflict" && byId(result.latest!.boxes, "title").y,
    ).toBe(100);
    expect(writes()).toEqual([]);
  });

  it("refuses a save the database finds stale (a collaborator saved in between)", async () => {
    await save(sent(seed));
    // Read at revision 1, then a collaborator's save lands before ours.
    const rpc = db.fake.client.rpc;
    db.fake.client.rpc = (async (name: string, args: Record<string, unknown>) => {
      if (name === "save_card_customization" && args.p_expected_revision === 1) {
        db.fake.state.tables.card_customizations[0].revision = 2;
      }
      return rpc(name, args);
    }) as typeof rpc;
    const result = await save(sent(seed), 1);
    expect(result).toMatchObject({ ok: false, reason: "conflict", latest: { revision: 2 } });
  });

  it("refuses a first edit when one exists already", async () => {
    await save(sent(seed));
    expect(await save(sent(seed), 0)).toMatchObject({
      ok: false,
      reason: "conflict",
      latest: { revision: 1 },
    });
  });

  it("writes the title box's words to Event.title with the save, and re-breaks every other card's title", async () => {
    // Another design's customization, showing its own drafted title.
    await saveCardCustomization({
      eventId: EVENT,
      designId: OTHER,
      shape: "rectangle",
      boxes: sent(seed),
      revision: 0,
    });
    db.fake.state.rpcs = [];
    const boxes = sent(seed).map((b) =>
      b.id === "title" ? { ...b, text: "Juniper's Garden Party" } : b,
    );
    const result = await save(boxes);
    expect(result).toMatchObject({ ok: true, customization: { title: "Juniper's Garden Party" } });
    expect(db.fake.rpc("save_card_customization_with_title")).toEqual([
      expect.objectContaining({ p_title: "Juniper's Garden Party", p_expected_revision: 0 }),
    ]);
    expect(db.fake.state.tables.events[0].title).toBe("Juniper's Garden Party");
    expect(byId(stored(), "title").lines.join(" ")).toBe("Juniper's Garden Party");
    expect(byId(stored(), "title")).not.toHaveProperty("text");
    // The other design's title box shows the event's title now.
    expect(byId(stored(OTHER), "title").lines.join(" ")).toBe("Juniper's Garden Party");
  });

  it("does not write a title the host left as it is", async () => {
    const boxes = sent(seed).map((b) => (b.id === "title" ? { ...b, text: WORDING.title } : b));
    expect((await save(boxes)).ok).toBe(true);
    expect(db.fake.rpcNames()).not.toContain("save_card_customization_with_title");
    expect(db.fake.state.tables.events[0].title).toBeNull();
  });

  it("holds a new title to the details form's checks, before writing anything", async () => {
    const boxes = sent(seed).map((b) =>
      b.id === "title" ? { ...b, text: "WELCOME WILHELMINA MONTGOMERY-WHITWORTH!" } : b,
    );
    const titleIndex = seed.findIndex((b) => b.id === "title");
    expect(await save(boxes)).toEqual({
      ok: false,
      reason: "invalid",
      error: "Check the highlighted fields.",
      fieldErrors: { [`boxes.${titleIndex}.text`]: CARD_TEXT_FIT_MESSAGE },
    });
    const tooLong = sent(seed).map((b) => (b.id === "title" ? { ...b, text: "x".repeat(41) } : b));
    expect(await save(tooLong)).toMatchObject({ ok: false, reason: "invalid" });
    expect(writes()).toEqual([]);
  });

  it("holds a changed invitation line to its slot's limit and fit, so carried words always fit", async () => {
    const index = seed.findIndex((b) => b.id === "invitationLine");
    const emoji = sent(seed).map((b) =>
      b.id === "invitationLine" ? { ...b, text: "Party time \u{1F389}" } : b,
    );
    expect(await save(emoji)).toMatchObject({
      ok: false,
      reason: "invalid",
      fieldErrors: { [`boxes.${index}.text`]: expect.stringContaining("\u{1F389}") },
    });
    const wide = sent(seed).map((b) =>
      b.id === "invitationLine"
        ? { ...b, text: "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW" }
        : b,
    );
    expect(await save(wide)).toMatchObject({ ok: false, reason: "invalid" });
    expect(writes()).toEqual([]);
  });

  it("refuses boxes outside the schema or the editor's limits, and an unknown face", async () => {
    expect(await save("not boxes")).toMatchObject({ ok: false, reason: "invalid" });
    expect(await save(sent(seed).map((b) => ({ ...b, size: 9999 })))).toMatchObject({
      ok: false,
      reason: "invalid",
      fieldErrors: { "boxes.0.size": expect.any(String) },
    });
    expect(
      await save(
        sent(seed).map((b) => ({ ...b, font: { family: "Papyrus", weight: 400, italic: false } })),
      ),
    ).toMatchObject({
      ok: false,
      reason: "invalid",
      fieldErrors: { "boxes.0.font": "This font isn't available." },
    });
    expect(await save(sent(seed), -1)).toMatchObject({ ok: false, reason: "invalid" });
    expect(writes()).toEqual([]);
  });

  it("answers not_found, reading nothing, to anyone who is not the event's owner or a co-host", async () => {
    access.mockRejectedValue(new ForbiddenError());
    expect(await save(sent(seed))).toEqual({ ok: false, reason: "not_found" });
    expect(db.fake.state.log).toEqual([]);
  });

  it("answers not_found for a design that is not the event's or a shape it has no artwork for", async () => {
    expect(await save(sent(seed), 0, { designId: "f1f2f3f4-e5e6-4f7a-8b9c-0d1e2f3a4b5c" })).toEqual(
      {
        ok: false,
        reason: "not_found",
      },
    );
    expect(await save(sent(seed), 0, { shape: "circle" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(writes()).toEqual([]);
  });

  it("is allowed after publish: the card editor updates the live card", async () => {
    access.mockResolvedValue({ user: { id: USER }, role: "owner", context: { published: true } });
    expect((await save(sent(seed))).ok).toBe(true);
  });

  it("reports a write the database fails, keeping nothing half-saved", async () => {
    db.fake.state.errors.save_card_customization = { code: "XX000", message: "boom" };
    expect(await save(sent(seed))).toEqual({
      ok: false,
      reason: "failed",
      error: "Couldn't save. Try again.",
    });
  });
});

describe("resetCardCustomization", () => {
  const reset = (revision: number) =>
    resetCardCustomization({ eventId: EVENT, designId: DESIGN, shape: "rectangle", revision });

  it("re-applies the seed as a new revision, never a delete, keeping the title", async () => {
    await save(
      sent(seed).map((b) => (b.id === "title" ? { ...b, text: "Our Party", rotation: 20 } : b)),
    );
    const result = await reset(1);
    expect(result).toMatchObject({ ok: true, customization: { revision: 2, title: "Our Party" } });
    expect(db.fake.rpc("save_card_customization").at(-1)).toMatchObject({ p_expected_revision: 1 });
    const after = stored();
    expect(byId(after, "title").rotation).toBe(0);
    expect(byId(after, "title").lines.join(" ")).toBe("Our Party");
    expect(db.fake.state.tables.events[0].title).toBe("Our Party");
    expect(after.map((b) => b.id)).toEqual(seed.map((b) => b.id));
    // A collaborator's save from before the reset is still refused.
    expect(await save(sent(seed), 1)).toMatchObject({ ok: false, reason: "conflict" });
  });

  it("re-applies the seed where the artwork's stored shift starts the words (card_compiler_v7)", async () => {
    const shift = { heading: -40, details: -20 };
    db.fake.state.tables.card_art_assets = [
      {
        ...artRow(),
        ink: Object.fromEntries(PORTRAIT.map((s) => [s, { text: { ink: INK, shift } }])),
      },
      artRow(OTHER),
    ];
    await save(sent(seed).map((b) => (b.id === "date" ? { ...b, y: 100 } : b)));
    expect(await reset(1)).toMatchObject({ ok: true, customization: { revision: 2 } });
    const after = stored();
    for (const box of after) {
      const dy = box.id === "title" || box.id === "invitationLine" ? -40 : -20;
      expect(box.y, box.id).toBeCloseTo(byId(seed, box.id).y + dy, 3);
    }
  });

  it("writes nothing for a card that has no customization", async () => {
    expect(await reset(0)).toEqual({ ok: true, customization: null });
    expect(writes()).toEqual([]);
  });

  it("refuses a stale reset with the latest", async () => {
    await save(sent(seed));
    expect(await reset(0)).toMatchObject({
      ok: false,
      reason: "conflict",
      latest: { revision: 1 },
    });
  });

  it("answers not_found to anyone who is not the event's owner or a co-host", async () => {
    access.mockRejectedValue(new ForbiddenError());
    expect(await reset(0)).toEqual({ ok: false, reason: "not_found" });
  });
});
