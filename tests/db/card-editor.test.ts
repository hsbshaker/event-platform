import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

import {
  asActor,
  connect,
  createAuthUser,
  errorCode,
  insertCardArt,
  insertCardDesign,
  pgError,
  resetDatabase,
  type Actor,
} from "./harness";

/**
 * The card editor's writes (Phase 6b part 1): `save_card_customization_with_title`
 * (supabase/migrations/20261013000000_card_editor_title.sql) and `save_card_customization` as the
 * new paths use it — a save, `Reset card`, a fact edit's re-break, and carried words.
 *
 * spec.md §20.2 (the title box edits `Event.title`), §20.5 (every save carries its revision; a stale
 * save is refused; `Reset card` is a new revision, never a delete, so a stale save is still refused
 * after it), §20.6 (carried words are saved as the new card's customization; earlier ones are kept),
 * §8.1 (editing after publish), §25 (owner and co-host only), §32 #25, #27 (no design is touched).
 */

let db: Client;
let owner: string;
let cohost: string;
let stranger: string;
let eventId: string;
let otherEventId: string;
let designId: string;

const OWNER = (): Actor => ({ kind: "user", id: owner });
const COHOST = (): Actor => ({ kind: "user", id: cohost });
const STRANGER = (): Actor => ({ kind: "user", id: stranger });

const box = (lines: string[], over: Record<string, unknown> = {}) => ({
  id: "title",
  source: { kind: "wording", slot: "title" },
  x: 120,
  y: 820,
  width: 760,
  rotation: 0,
  font: { family: "EB Garamond", weight: 400, italic: false },
  size: 72,
  color: "#2B2118",
  align: "center",
  letterSpacing: 0,
  lineHeight: 1.05,
  textCase: "none",
  z: 0,
  lines,
  ...over,
});

const BOXES = JSON.stringify([box(["Oh Baby"])]);

/** Calls `fn` (a function of the event, design, shape and boxes) as `actor` and commits. */
async function call(actor: Actor, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await asActor(db, actor, (q) => q(sql, params), { commit: true });
  return rows[0].revision as number;
}

function saveWithTitle(
  actor: Actor,
  expected: number,
  title: string | null,
  { event = eventId, design = designId, shape = "rectangle", boxes = BOXES } = {},
): Promise<number> {
  return call(
    actor,
    `select public.save_card_customization_with_title($1, $2, $3, $4::jsonb, $5, $6) as revision`,
    [event, design, shape, boxes, expected, title],
  );
}

function save(
  actor: Actor,
  expected: number,
  { shape = "rectangle", boxes = BOXES }: { shape?: string; boxes?: string } = {},
): Promise<number> {
  return call(
    actor,
    `select public.save_card_customization($1, $2, $3, $4::jsonb, $5) as revision`,
    [eventId, designId, shape, boxes, expected],
  );
}

async function eventTitle(id = eventId): Promise<string | null> {
  const { rows } = await db.query(`select title from public.events where id = $1`, [id]);
  return rows[0].title as string | null;
}

async function customization(shape = "rectangle") {
  const { rows } = await db.query(
    `select revision, boxes, updated_by from public.card_customizations
     where event_id = $1 and card_design_id = $2 and shape = $3`,
    [eventId, designId, shape],
  );
  return rows[0] as { revision: number; boxes: unknown; updated_by: string | null } | undefined;
}

beforeAll(async () => {
  db = await connect();
  await resetDatabase(db);
});

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await db.query("truncate public.events, public.card_fonts cascade; delete from auth.users");
  owner = await createAuthUser(db, "owner@example.com", "Owner One");
  cohost = await createAuthUser(db, "cohost@example.com");
  stranger = await createAuthUser(db, "stranger@example.com");
  const created = await db.query(
    `insert into public.events (owner_id, prompt) values ($1, 'A garden baby shower'), ($2, 'Another shower')
     returning id`,
    [owner, stranger],
  );
  eventId = created.rows[0].id;
  otherEventId = created.rows[1].id;
  await db.query(
    `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'cohost')`,
    [eventId, cohost],
  );
  designId = await insertCardDesign(db, eventId);
  await insertCardArt(db, eventId, designId);
});

describe("save_card_customization_with_title", () => {
  it("saves the boxes and the event's title together, for the owner or a co-host", async () => {
    expect(await saveWithTitle(COHOST(), 0, "Juniper's Garden Party")).toBe(1);
    expect(await eventTitle()).toBe("Juniper's Garden Party");
    expect(await customization()).toMatchObject({ revision: 1, updated_by: cohost });
    expect(await saveWithTitle(OWNER(), 1, "Our Garden Party")).toBe(2);
    expect(await eventTitle()).toBe("Our Garden Party");
  });

  it("changes neither the boxes nor the title for a stale save", async () => {
    await saveWithTitle(OWNER(), 0, "First");
    await save(COHOST(), 1, { boxes: JSON.stringify([box(["Cohost"])]) });
    const refused = await pgError(saveWithTitle(OWNER(), 1, "Stale title"));
    expect(refused).toMatchObject({
      code: "PT409",
      message: "card customization revision is stale",
      detail: "current revision: 2",
    });
    expect(await eventTitle()).toBe("First");
    expect(await customization()).toMatchObject({ revision: 2, boxes: [box(["Cohost"])] });
  });

  it("refuses a first save when a customization exists, writing no title", async () => {
    await save(OWNER(), 0);
    expect(await errorCode(saveWithTitle(COHOST(), 0, "Too late"))).toBe("PT409");
    expect(await eventTitle()).toBeNull();
  });

  it("refuses anyone who is not the event's owner or a co-host, and anonymous callers", async () => {
    expect(await errorCode(saveWithTitle(STRANGER(), 0, "Mine now"))).toBe("42501");
    expect(await errorCode(saveWithTitle({ kind: "anon" }, 0, "Mine now"))).toBe("42501");
    expect(await eventTitle()).toBeNull();
    expect(await customization()).toBeUndefined();
  });

  it("refuses a missing or blank title, and a design or shape the event cannot edit", async () => {
    expect(await errorCode(saveWithTitle(OWNER(), 0, null))).toBe("22023");
    expect(await errorCode(saveWithTitle(OWNER(), 0, "   "))).toBe("22023");
    expect(await errorCode(saveWithTitle(OWNER(), 0, "T", { shape: "square" }))).toBe("22023");
    const otherDesign = await insertCardDesign(db, otherEventId);
    expect(await errorCode(saveWithTitle(OWNER(), 0, "T", { design: otherDesign }))).toBe("23514");
    expect(await eventTitle()).toBeNull();
  });

  it("never writes another event's title, even for its own member", async () => {
    // The stranger owns the other event; the boxes name this event's design.
    expect(
      await errorCode(saveWithTitle(STRANGER(), 0, "Elsewhere", { event: otherEventId })),
    ).toBe("23514");
    expect(await eventTitle(otherEventId)).toBeNull();
  });

  it("works after publish: the card editor updates the live card (spec.md §8.1)", async () => {
    await db.query(`update public.events set published_at = now() where id = $1`, [eventId]);
    expect(await saveWithTitle(OWNER(), 0, "Live title")).toBe(1);
    expect(await eventTitle()).toBe("Live title");
  });

  it("is not callable by anon at all, and runs with the caller's own rights", async () => {
    const { rows } = await db.query(
      `select p.prosecdef as definer,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated
       from pg_proc p where p.proname = 'save_card_customization_with_title'`,
    );
    expect(rows).toEqual([{ definer: false, anon: false, authenticated: true }]);
  });

  it("never touches the design or its artwork", async () => {
    const before = await db.query(
      `select d.*, a.ink from public.card_designs d join public.card_art_assets a on a.card_design_id = d.id`,
    );
    await saveWithTitle(OWNER(), 0, "A Title");
    const after = await db.query(
      `select d.*, a.ink from public.card_designs d join public.card_art_assets a on a.card_design_id = d.id`,
    );
    expect(after.rows).toEqual(before.rows);
  });
});

describe("save_card_customization through the card editor's paths", () => {
  it("a save, then Reset card as a new revision, then a stale save still refused", async () => {
    expect(
      await save(OWNER(), 0, { boxes: JSON.stringify([box(["Oh Baby"], { rotation: 12 })]) }),
    ).toBe(1);
    // A co-host opened the editor at revision 1; the owner resets meanwhile.
    expect(await save(OWNER(), 1)).toBe(2);
    expect(await customization()).toMatchObject({ revision: 2, boxes: [box(["Oh Baby"])] });
    expect(await pgError(save(COHOST(), 1))).toMatchObject({
      code: "PT409",
      detail: "current revision: 2",
    });
  });

  it("a fact edit's re-break is a save like any other: it bumps the revision an open editor holds", async () => {
    await save(OWNER(), 0);
    // updateEventDetails, as the co-host who edited the venue, re-breaks over revision 1.
    expect(await save(COHOST(), 1, { boxes: JSON.stringify([box(["Oh", "Baby"])]) })).toBe(2);
    expect(await errorCode(save(OWNER(), 1))).toBe("PT409");
  });

  it("carried words are created at revision 1 on a card without one, and refused over one", async () => {
    // As the collaborator who switched: expected revision 0.
    expect(await save(OWNER(), 0, { shape: "oval" })).toBe(1);
    expect(await errorCode(save(COHOST(), 0, { shape: "oval" }))).toBe("PT409");
    // The rectangle's customization, if any, is untouched: each shape keeps its own.
    expect(await customization("rectangle")).toBeUndefined();
  });

  it("carried words stored by the server after new artwork: inserted once, never over another", async () => {
    const insert = () =>
      asActor(
        db,
        { kind: "service" },
        (q) =>
          q(
            `insert into public.card_customizations (event_id, card_design_id, shape, boxes, updated_by)
             values ($1, $2, 'arch', $3::jsonb, $4)
             on conflict (event_id, card_design_id, shape) do nothing
             returning revision`,
            [eventId, designId, BOXES, owner],
          ),
        { commit: true },
      );
    expect((await insert()).rows).toEqual([{ revision: 1 }]);
    expect((await insert()).rows).toEqual([]);
    expect(await customization("arch")).toMatchObject({ revision: 1, updated_by: owner });
  });
});
