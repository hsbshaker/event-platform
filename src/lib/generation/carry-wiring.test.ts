import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeAdmin, type FakeAdmin } from "../../../tests/unit/support/fake-admin";

import { generatedTextLayer } from "@/lib/card/card-text.server";
import type { TextBox } from "@/lib/card/text-box";
import { parseStoredBoxes } from "@/lib/card/text-box-schema";

/**
 * Choosing a design and switching shape carry the host's words (`spec.md §20.6`; `docs/card-system.md
 * §7`, "Carrying words to a fresh layout"; §31 Card editor "Choosing another design or switching
 * shape keeps the host's words, added text and fonts with a fresh layout … saved as the new card's
 * customization; a card never edited carries nothing … and keeps earlier customizations"). Laid out
 * before the switch, stored after it, through the collaborator's own session. The carrying itself
 * is covered in `customization.server.test.ts`.
 */

const EVENT = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";
const USER = "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2";
const A = "a0000000-0000-4000-8000-000000000001";
const B = "b0000000-0000-4000-8000-000000000002";
const INK = "#2B2118";
const PORTRAIT = ["rectangle", "rounded-rectangle", "arch", "oval"];

const db = vi.hoisted(() => ({ fake: undefined as unknown as FakeAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.fake.client }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.fake.client }));
const access = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/event-access", () => ({
  requireEventAccess: (...args: unknown[]) => access(...args),
}));

const { chooseCardDesign } = await import("./choose.server");
const { switchActiveCardShape } = await import("./shape.server");

let edited: TextBox[];
beforeAll(async () => {
  const generated = await generatedTextLayer({
    layout: "art-top",
    shape: "rectangle",
    pairing: "hc_playfair_dmsans",
    content: { title: "A Little Wild One", invitationLine: "Please join us" },
    ink: INK,
  });
  edited = [
    ...generated,
    {
      ...generated.find((b) => b.id === "invitationLine")!,
      id: "added-1",
      source: { kind: "custom" },
      text: "Bring a book",
      lines: ["Bring a book"],
    },
  ];
});

function designRow(id: string) {
  return {
    id,
    event_id: EVENT,
    round: id === A ? 1 : 2,
    name: "A design",
    description: "A description.",
    shape: "rectangle",
    layout: "art-top",
    art_mode: "illustration",
    typography: { primary: "hc_playfair_dmsans", alternates: [] },
    wording: {
      title: id === A ? "A Little Wild One" : "Lemons & Linen",
      invitationLine: "Please join us",
    },
    art_brief: null,
  };
}

function artRow(designId: string) {
  return {
    id: `art-${designId}`,
    event_id: EVENT,
    card_design_id: designId,
    storage_key: `${EVENT}/${designId}.png`,
    proportion: "portrait_5_7",
    fits_shapes: PORTRAIT,
    ink: Object.fromEntries(PORTRAIT.map((s) => [s, { text: { ink: INK } }])),
    created_at: "2026-10-05T11:00:00Z",
  };
}

function customizationOf(designId: string, shape: string, boxes: unknown) {
  return {
    event_id: EVENT,
    card_design_id: designId,
    shape,
    revision: 2,
    boxes: JSON.parse(JSON.stringify(boxes)),
    updated_by: USER,
    updated_at: "2026-10-05T11:30:00Z",
  };
}

beforeEach(() => {
  db.fake = fakeAdmin();
  db.fake.state.tables = {
    events: [
      {
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
        prompt_facts: null,
        active_card_design_id: A,
        active_card_shape: null,
      },
    ],
    card_designs: [designRow(A), designRow(B)],
    card_art_assets: [artRow(A), artRow(B)],
    card_customizations: [],
  };
  db.fake.state.rpcAnswers.choose_card_design = "chosen";
  db.fake.state.rpcAnswers.switch_card_shape = "switched";
  db.fake.state.rpcAnswers.save_card_customization = 1;
  access.mockReset().mockResolvedValue({ user: { id: USER }, role: "owner", context: {} });
});

const carriedSave = () => db.fake.rpc("save_card_customization");
const storedBoxes = (args: Record<string, unknown>) => {
  const parsed = parseStoredBoxes(args.p_boxes);
  if (!parsed.ok) throw new Error(parsed.issues);
  return parsed.boxes;
};

describe("chooseCardDesign carries the host's words", () => {
  it("lays the active card's words out in the chosen design and saves them as its customization", async () => {
    db.fake.state.tables.card_customizations = [customizationOf(A, "rectangle", edited)];
    expect(await chooseCardDesign(EVENT, B)).toEqual({ ok: true });
    const [save] = carriedSave();
    expect(save).toMatchObject({
      p_event_id: EVENT,
      p_card_design_id: B,
      p_shape: "rectangle",
      p_expected_revision: 0,
    });
    const boxes = storedBoxes(save);
    expect(boxes.find((b) => b.id === "added-1")).toMatchObject({ text: "Bring a book" });
    // Laid out before the switch, stored after it.
    const log = db.fake.state.log;
    expect(log.indexOf("rpc:choose_card_design")).toBeLessThan(
      log.indexOf("rpc:save_card_customization"),
    );
    expect(log.indexOf("select:card_designs")).toBeLessThan(log.indexOf("rpc:choose_card_design"));
  });

  it("carries nothing from a card the host never edited, or to a design with its own", async () => {
    expect(await chooseCardDesign(EVENT, B)).toEqual({ ok: true });
    db.fake.state.tables.card_customizations = [
      customizationOf(A, "rectangle", edited),
      customizationOf(B, "rectangle", edited),
    ];
    expect(await chooseCardDesign(EVENT, B)).toEqual({ ok: true });
    expect(carriedSave()).toEqual([]);
  });

  it("stores nothing when the choice is refused", async () => {
    db.fake.state.tables.card_customizations = [customizationOf(A, "rectangle", edited)];
    db.fake.state.rpcAnswers.choose_card_design = "published";
    expect(await chooseCardDesign(EVENT, B)).toEqual({ ok: false, reason: "published" });
    expect(carriedSave()).toEqual([]);
  });

  it("still reports the choice when storing the carried words fails after it committed", async () => {
    db.fake.state.tables.card_customizations = [customizationOf(A, "rectangle", edited)];
    db.fake.state.errors.save_card_customization = { message: "connection reset" };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await chooseCardDesign(EVENT, B)).toEqual({ ok: true });
    expect(logged).toHaveBeenCalledWith(
      "[choose design] the host's words could not be carried",
      expect.objectContaining({ eventId: EVENT, designId: B, error: "connection reset" }),
    );
    logged.mockRestore();
  });

  it("does not switch when the words cannot be laid out: nothing changes", async () => {
    db.fake.state.tables.card_customizations = [customizationOf(A, "rectangle", edited)];
    db.fake.state.errors["select:card_art_assets"] = { message: "unavailable" };
    await expect(chooseCardDesign(EVENT, B)).rejects.toMatchObject({ message: "unavailable" });
    expect(db.fake.rpcNames()).not.toContain("choose_card_design");
  });
});

describe("switchActiveCardShape carries the host's words", () => {
  const key = "c0000000-0000-4000-8000-000000000003";

  it("carries the shown shape's words to an instant switch", async () => {
    db.fake.state.tables.card_customizations = [customizationOf(A, "rectangle", edited)];
    const result = await switchActiveCardShape({
      eventId: EVENT,
      shape: "oval",
      idempotencyKey: key,
    });
    expect(result.outcome).toBe("switched");
    const [save] = carriedSave();
    expect(save).toMatchObject({ p_card_design_id: A, p_shape: "oval", p_expected_revision: 0 });
    expect(storedBoxes(save).find((b) => b.id === "added-1")).toMatchObject({
      text: "Bring a book",
    });
  });

  it("still reports the switch when storing the carried words fails after it committed", async () => {
    db.fake.state.tables.card_customizations = [customizationOf(A, "rectangle", edited)];
    db.fake.state.errors.save_card_customization = { message: "connection reset" };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await switchActiveCardShape({
      eventId: EVENT,
      shape: "oval",
      idempotencyKey: key,
    });
    expect(result.outcome).toBe("switched");
    expect(logged).toHaveBeenCalledWith(
      "[shape switch] the host's words could not be carried",
      expect.objectContaining({ eventId: EVENT, designId: A, shape: "oval" }),
    );
    logged.mockRestore();
  });

  it("carries nothing yet to a shape that needs new artwork: it is carried when the artwork arrives", async () => {
    db.fake.state.tables.card_customizations = [customizationOf(A, "rectangle", edited)];
    db.fake.state.rpcAnswers.switch_card_shape = "needs_artwork";
    access.mockResolvedValue({ user: { id: USER }, role: "owner", context: { published: true } });
    const result = await switchActiveCardShape({
      eventId: EVENT,
      shape: "square",
      idempotencyKey: key,
    });
    expect(result.outcome).toBe("published");
    expect(carriedSave()).toEqual([]);
  });

  it("restores a shape's own customization rather than carrying over it", async () => {
    db.fake.state.tables.card_customizations = [
      customizationOf(A, "rectangle", edited),
      customizationOf(A, "oval", edited),
    ];
    expect(
      (await switchActiveCardShape({ eventId: EVENT, shape: "oval", idempotencyKey: key })).outcome,
    ).toBe("switched");
    expect(carriedSave()).toEqual([]);
  });
});
