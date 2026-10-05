import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

import {
  asActor,
  connect,
  createAuthUser,
  errorCode,
  insertCardArt,
  insertCardDesign,
  resetDatabase,
  type Actor,
} from "./harness";

/**
 * Try another direction: the box and the card it was opened from, what a design made, and choosing
 * a design (supabase/migrations/20261009000000_phase5d_another_direction.sql).
 *
 * spec.md §7.7 (one design per round: part, whole or none; the design records which; the changed
 * card stays active until chosen), §7.11 (the first card is active; later ones only when chosen),
 * §7.15, §8.2 (no new design and no switching after publish), §10, §24. §32 #17 (the feedback is
 * server-only), #25, #27 (designs immutable), #30, #42.
 */

let db: Client;
let owner: string;
let cohost: string;
let stranger: string;
let eventA: string;
let eventB: string;

const keyHash = (subject: string) => `\\x${createHash("sha256").update(subject).digest("hex")}`;

type StartArgs = {
  event?: string;
  user?: string;
  kind?: string;
  key?: string;
  feedback?: string | null;
  fromDesign?: string | null;
};

async function start(
  args: StartArgs = {},
): Promise<{ generation_id: string | null; outcome: string }> {
  const {
    event = eventA,
    user = owner,
    kind = "another_direction",
    key = randomUUID(),
    feedback = null,
    fromDesign = null,
  } = args;
  const { rows } = await db.query(
    `select * from public.start_generation($1, $2, $3, $4, $5::bytea, $6::bytea, 30, 60, 330, $7, $8)`,
    [
      event,
      user,
      kind,
      key,
      keyHash(`event:${event}`),
      keyHash(`user:${user}`),
      feedback,
      fromDesign,
    ],
  );
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function eventCount(event: string): Promise<number> {
  const { rows } = await db.query(
    `select coalesce(sum(count), 0)::int as n from public.rate_limits
     where bucket = 'generation:event' and key_hash = $1::bytea`,
    [keyHash(`event:${event}`)],
  );
  return rows[0].n;
}

async function generationRow(id: string) {
  const { rows } = await db.query(`select * from public.generations where id = $1`, [id]);
  return rows[0];
}

async function activeDesign(event = eventA) {
  const { rows } = await db.query(
    `select active_card_design_id, active_card_shape from public.events where id = $1`,
    [event],
  );
  return rows[0];
}

/** A design with its artwork (portrait, fitting all four 5:7 shapes), active when `active`. */
async function design(
  event = eventA,
  {
    round = 1,
    active = false,
    shape = "rectangle",
  }: { round?: number; active?: boolean; shape?: string } = {},
): Promise<string> {
  const id = await insertCardDesign(db, event, { round, shape });
  await insertCardArt(db, event, id);
  if (active) {
    await db.query(
      `update public.events set active_card_design_id = $2, active_card_shape = $3 where id = $1`,
      [event, id, shape],
    );
  }
  return id;
}

async function recordIdentity(generation: string, event = eventA): Promise<number> {
  const { rows } = await db.query(
    `select public.record_event_identity($1, $2, '{"creativeDirection":"x"}', '{}', 'event_identity_v6', 'event_identity_schema_v5') as revision`,
    [generation, event],
  );
  return rows[0].revision as number;
}

const PORTRAIT = ["rectangle", "rounded-rectangle", "arch", "oval"];

async function persist(
  generation: string,
  { refinement = "none", changedFrom = null as string | null, event = eventA } = {},
): Promise<{ card_design_id: string; round: number } | undefined> {
  const ink = Object.fromEntries(PORTRAIT.map((s) => [s, { text: { ink: "#2b2118" } }]));
  const { rows } = await db.query(
    `select * from public.persist_generated_card(
       $1, $2, 1, 'Lemons & Linen', 'A lemon branch over soft linen.', 'rectangle', 'art-top',
       'illustration', '{"primary":"oldstyle_garamond_worksans","alternates":[]}',
       '{"title":"Lemons & Linen","invitationLine":"Please join us"}', '{"subject":"a lemon branch"}',
       '{"presentation":{"name":"Lemons & Linen"}}', '{"designPrompt":"card_design_v4"}',
       array[]::text[], $3, 'image/png', 4200000, 1440, 2016, 'portrait_5_7', $4, $5,
       'gpt-image-2.5-sunburst-2026-09-08', 'card_art_v5', '{}', $6, $7)`,
    [
      generation,
      event,
      `${event}/${generation}/${randomUUID()}.png`,
      PORTRAIT,
      ink,
      refinement,
      changedFrom,
    ],
  );
  return rows[0];
}

async function choose(designId: string, { event = eventA, user = owner } = {}): Promise<string> {
  const { rows } = await db.query(`select public.choose_card_design($1, $2, $3) as outcome`, [
    event,
    user,
    designId,
  ]);
  return rows[0].outcome as string;
}

beforeAll(async () => {
  db = await connect();
  await resetDatabase(db);
});

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await db.query(
    "truncate public.events, public.rate_limits, public.model_spend_days cascade; delete from auth.users",
  );
  owner = await createAuthUser(db, "owner@example.com", "Owner One");
  cohost = await createAuthUser(db, "cohost@example.com");
  stranger = await createAuthUser(db, "stranger@example.com");
  const created = await db.query(
    `insert into public.events (owner_id, prompt) values ($1, 'Event A'), ($1, 'Event B') returning id`,
    [owner],
  );
  [eventA, eventB] = created.rows.map((r) => r.id as string);
  await db.query(
    `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'cohost')`,
    [eventA, cohost],
  );
});

describe("start_generation: another direction", () => {
  it("records the box, trimmed, and the design it was opened from", async () => {
    const from = await design(eventA, { active: true });
    const started = await start({ feedback: "  add a little dinosaur \n", fromDesign: from });
    expect(started.outcome).toBe("started");
    expect(await generationRow(started.generation_id!)).toMatchObject({
      kind: "another_direction",
      status: "running",
      feedback: "add a little dinosaur",
      from_design_id: from,
    });
    expect(await eventCount(eventA)).toBe(1);
  });

  it("an empty or blank box is no feedback: a new idea", async () => {
    const from = await design();
    for (const feedback of [null, "", "   \n\t "]) {
      const g = await start({ feedback, fromDesign: from });
      expect(g.outcome, JSON.stringify(feedback)).toBe("started");
      expect((await generationRow(g.generation_id!)).feedback).toBeNull();
      await db.query(
        `update public.generations set status = 'failed', finished_at = now() where id = $1`,
        [g.generation_id],
      );
    }
  });

  it("takes 500 characters, refuses 501, and counts characters, not bytes", async () => {
    const from = await design();
    const g = await start({ feedback: `${"é".repeat(499)}🦕`, fromDesign: from });
    expect(g.outcome).toBe("started");
    expect(Array.from((await generationRow(g.generation_id!)).feedback as string)).toHaveLength(
      500,
    );
    await db.query(`update public.generations set status = 'failed', finished_at = now()`);
    expect(await errorCode(start({ feedback: "a".repeat(501), fromDesign: from }))).toBe("22023");
    expect(await eventCount(eventA)).toBe(1);
  });

  it("requires the design for another direction, and takes neither field for another kind", async () => {
    const from = await design();
    expect(await errorCode(start({ fromDesign: null, feedback: "pinker" }))).toBe("22023");
    for (const kind of ["initial", "shape_switch"]) {
      expect(await errorCode(start({ kind, feedback: "pinker" })), kind).toBe("22023");
      expect(await errorCode(start({ kind, fromDesign: from })), kind).toBe("22023");
    }
    expect(await eventCount(eventA)).toBe(0);
  });

  it("refuses with no_design before the event has a card, consuming nothing", async () => {
    expect(await start({ fromDesign: randomUUID(), feedback: "pinker" })).toEqual({
      generation_id: null,
      outcome: "no_design",
    });
    expect(await eventCount(eventA)).toBe(0);
  });

  it("refuses a design of another event, consuming nothing", async () => {
    await design(eventA);
    const other = await design(eventB);
    expect(await errorCode(start({ fromDesign: other }))).toBe("23514");
    expect(await errorCode(start({ fromDesign: randomUUID() }))).toBe("23514");
    expect(await eventCount(eventA)).toBe(0);
    const { rows } = await db.query(`select count(*)::int as n from public.generations`);
    expect(rows[0].n).toBe(0);
  });

  it("answers in order: existing, published, no_design, in_flight", async () => {
    const from = await design();
    const key = randomUUID();
    const first = await start({ key, fromDesign: from, feedback: "pinker" });
    // A repeat of the key finds the same generation, whatever its box says.
    expect(await start({ key, fromDesign: from, feedback: "bluer" })).toEqual({
      generation_id: first.generation_id,
      outcome: "existing",
    });
    expect(await start({ fromDesign: from, user: cohost })).toEqual({
      generation_id: first.generation_id,
      outcome: "in_flight",
    });
    await db.query(`update public.events set published_at = now() where id = $1`, [eventA]);
    expect(await start({ fromDesign: from })).toEqual({
      generation_id: null,
      outcome: "published",
    });
    await db.query(
      `update public.events set published_at = null, status = 'PUBLISHED' where id = $1`,
      [eventB],
    );
    // Published wins over no_design.
    expect(await start({ event: eventB, fromDesign: randomUUID() })).toEqual({
      generation_id: null,
      outcome: "published",
    });
  });

  it("only a member can start one", async () => {
    const from = await design();
    expect(await errorCode(start({ user: stranger, fromDesign: from }))).toBe("42501");
  });
});

describe("generations: the box is checked by the table too", () => {
  it("keeps feedback trimmed, bounded and on another direction only", async () => {
    const from = await design();
    for (const [kind, feedback, fromDesign] of [
      ["another_direction", " untrimmed", from],
      ["another_direction", "untrimmed\n", from],
      ["another_direction", "", from],
      ["another_direction", "a".repeat(501), from],
      ["initial", "pinker", null],
      ["shape_switch", null, from],
    ] as const) {
      expect(
        await errorCode(
          db.query(
            `insert into public.generations (event_id, kind, idempotency_key, feedback, from_design_id)
             values ($1, $2, $3, $4, $5)`,
            [eventA, kind, randomUUID(), feedback, fromDesign],
          ),
        ),
        `${kind} ${JSON.stringify(feedback)}`,
      ).toBe("23514");
    }
  });

  it("names a design of the same event only", async () => {
    const other = await design(eventB);
    expect(
      await errorCode(
        db.query(
          `insert into public.generations (event_id, kind, idempotency_key, from_design_id)
           values ($1, 'another_direction', 'k', $2)`,
          [eventA, other],
        ),
      ),
    ).toBe("23503");
  });
});

describe("persist_generated_card: what the design made", () => {
  async function directionGeneration(from: string, feedback: string | null = "add a dinosaur") {
    const g = await start({ fromDesign: from, feedback });
    expect(g.outcome).toBe("started");
    await recordIdentity(g.generation_id!);
    return g.generation_id!;
  }

  it("records refinement and changed_from, and leaves the current card active", async () => {
    const from = await design(eventA, { active: true, shape: "rectangle" });
    await db.query(`update public.events set active_card_shape = 'oval' where id = $1`, [eventA]);
    const g = await directionGeneration(from);
    const made = await persist(g, { refinement: "part", changedFrom: from });
    expect(made?.round).toBe(2);
    const { rows } = await db.query(
      `select refinement, changed_from from public.card_designs where id = $1`,
      [made!.card_design_id],
    );
    expect(rows[0]).toEqual({ refinement: "part", changed_from: from });
    // spec.md §7.7, §7.15 step 7: the current card stays active, in the shape the host left it.
    expect(await activeDesign()).toEqual({
      active_card_design_id: from,
      active_card_shape: "oval",
    });
    expect(await generationRow(g)).toMatchObject({
      status: "succeeded",
      card_design_id: made!.card_design_id,
    });
  });

  it("a new idea from an empty box records none, changed from the card it departs from", async () => {
    const from = await design(eventA, { active: true });
    const g = await directionGeneration(from, null);
    const made = await persist(g, { changedFrom: from });
    const { rows } = await db.query(
      `select refinement, changed_from from public.card_designs where id = $1`,
      [made!.card_design_id],
    );
    expect(rows[0]).toEqual({ refinement: "none", changed_from: from });
  });

  it("refuses a refinement or changed_from the generation does not allow, writing nothing", async () => {
    const from = await design(eventA, { active: true });
    const other = await design(eventA, { round: 2 });
    // A refinement answers feedback: an empty box cannot make one.
    const empty = await directionGeneration(from, null);
    for (const refinement of ["part", "whole"]) {
      expect(await errorCode(persist(empty, { refinement, changedFrom: from })), refinement).toBe(
        "22023",
      );
    }
    // changed_from is the generation's own design, never another.
    expect(await errorCode(persist(empty, { changedFrom: other }))).toBe("22023");
    expect(await errorCode(persist(empty, { changedFrom: null }))).toBe("22023");
    expect(await errorCode(persist(empty, { refinement: "sideways", changedFrom: from }))).toBe(
      "22023",
    );
    await db.query(`update public.generations set status = 'failed', finished_at = now()`);
    // A first card is never a refinement and changes nothing.
    const first = await start({ event: eventB, kind: "initial" });
    await recordIdentity(first.generation_id!, eventB);
    expect(
      await errorCode(persist(first.generation_id!, { event: eventB, refinement: "part" })),
    ).toBe("22023");
    expect(
      await errorCode(persist(first.generation_id!, { event: eventB, changedFrom: from })),
    ).toBe("22023");
    const { rows } = await db.query(`select count(*)::int as n from public.card_designs`);
    expect(rows[0].n).toBe(2);
  });

  it("keeps a first card's design active and its refinement none", async () => {
    const first = await start({ event: eventB, kind: "initial" });
    await recordIdentity(first.generation_id!, eventB);
    const made = await persist(first.generation_id!, { event: eventB });
    expect(await activeDesign(eventB)).toEqual({
      active_card_design_id: made!.card_design_id,
      active_card_shape: "rectangle",
    });
    const { rows } = await db.query(
      `select refinement, changed_from from public.card_designs where id = $1`,
      [made!.card_design_id],
    );
    expect(rows[0]).toEqual({ refinement: "none", changed_from: null });
  });
});

describe("card_designs: refinement and changed_from", () => {
  it("are checked, same-event, and immutable like the rest of the design", async () => {
    const from = await design(eventA);
    const other = await design(eventB);
    const insert = (refinement: string, changedFrom: string | null) =>
      db.query(
        `insert into public.card_designs
           (event_id, round, name, description, shape, layout, art_mode, typography, wording,
            art_brief, raw, versions, identity_revision, refinement, changed_from)
         select event_id, 9, name, description, shape, layout, art_mode, typography, wording,
            art_brief, raw, versions, identity_revision, $2, $3
         from public.card_designs where id = $1`,
        [from, refinement, changedFrom],
      );
    expect(await errorCode(insert("sideways", from))).toBe("23514");
    // A change the host asked for always names the card it changes.
    expect(await errorCode(insert("part", null))).toBe("23514");
    expect(await errorCode(insert("whole", other))).toBe("23503");
    expect(await errorCode(insert("part", from))).toBeNull();
    for (const sql of [
      `update public.card_designs set refinement = 'whole' where id = $1`,
      `update public.card_designs set changed_from = id where id = $1`,
    ]) {
      expect(await errorCode(db.query(sql, [from])), sql).toBe("42501");
    }
  });

  it("existing designs read as a new idea", async () => {
    const from = await design(eventA);
    const { rows } = await db.query(
      `select refinement, changed_from from public.card_designs where id = $1`,
      [from],
    );
    expect(rows[0]).toEqual({ refinement: "none", changed_from: null });
  });
});

describe("choose_card_design", () => {
  it("makes a design active in its own shape, changing nothing else on the event", async () => {
    const first = await design(eventA, { active: true });
    const second = await design(eventA, { round: 2, shape: "arch" });
    const before = (await db.query(`select * from public.events where id = $1`, [eventA])).rows[0];
    expect(await choose(second)).toBe("chosen");
    expect(await activeDesign()).toEqual({
      active_card_design_id: second,
      active_card_shape: "arch",
    });
    const after = (await db.query(`select * from public.events where id = $1`, [eventA])).rows[0];
    const changed = Object.keys(after).filter(
      (k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]),
    );
    expect(changed.sort()).toEqual(
      ["active_card_design_id", "active_card_shape", "row_version", "updated_at"].filter((k) =>
        Object.hasOwn(after, k),
      ),
    );
    // The chosen design records when it was chosen; nothing else about it changes.
    const chosen = await db.query(`select selected_at from public.card_designs where id = $1`, [
      second,
    ]);
    expect(chosen.rows[0].selected_at).not.toBeNull();
    // A co-host may choose too; choosing back restores the first in its own shape.
    expect(await choose(first, { user: cohost })).toBe("chosen");
    expect(await activeDesign()).toEqual({
      active_card_design_id: first,
      active_card_shape: "rectangle",
    });
  });

  it("choosing the active design again keeps the shape the host left it in", async () => {
    const first = await design(eventA, { active: true });
    await db.query(`update public.events set active_card_shape = 'oval' where id = $1`, [eventA]);
    expect(await choose(first)).toBe("chosen");
    expect(await activeDesign()).toEqual({
      active_card_design_id: first,
      active_card_shape: "oval",
    });
  });

  it("refuses after publish (spec.md §8.2)", async () => {
    await design(eventA, { active: true });
    const second = await design(eventA, { round: 2 });
    for (const sql of [
      `update public.events set status = 'PUBLISHED' where id = $1`,
      `update public.events set status = 'DRAFT', published_at = now() where id = $1`,
    ]) {
      await db.query(sql, [eventA]);
      expect(await choose(second)).toBe("published");
    }
    expect((await activeDesign()).active_card_design_id).not.toBe(second);
  });

  it("answers not_found for another event's design, an unknown one, an unknown event, or a design without artwork", async () => {
    await design(eventA, { active: true });
    const other = await design(eventB);
    expect(await choose(other)).toBe("not_found");
    expect(await choose(randomUUID())).toBe("not_found");
    expect(await choose(other, { event: randomUUID() })).toBe("not_found");
    const bare = await insertCardDesign(db, eventA, { round: 3 });
    expect(await choose(bare)).toBe("not_found");
    // Artwork that fits only another shape is not artwork for the design's own.
    const wrongShape = await insertCardDesign(db, eventA, { round: 4, shape: "arch" });
    await insertCardArt(db, eventA, wrongShape, { fitsShapes: ["rectangle"] });
    expect(await choose(wrongShape)).toBe("not_found");
  });

  it("only a member can choose", async () => {
    const second = await design(eventA, { round: 2 });
    expect(await errorCode(choose(second, { user: stranger }))).toBe("42501");
    expect(
      await errorCode(db.query(`select public.choose_card_design(null, $1, $2)`, [owner, second])),
    ).toBe("22023");
  });
});

describe("end users cannot use any of it (spec.md §32 #42)", () => {
  const ACTORS = (): Actor[] => [{ kind: "anon" }, { kind: "user", id: owner }];

  it("cannot execute the new functions, read the box, or set the active design", async () => {
    const from = await design(eventA, { active: true });
    const second = await design(eventA, { round: 2 });
    const h = keyHash("x");
    for (const actor of ACTORS()) {
      for (const sql of [
        `select public.choose_card_design('${eventA}', '${owner}', '${second}')`,
        `select * from public.start_generation('${eventA}', '${owner}', 'another_direction', 'k', '${h}', '${h}', 30, 60, 330, 'pinker', '${from}')`,
        `select feedback from public.generations`,
      ]) {
        expect(await errorCode(asActor(db, actor, (q) => q(sql))), `${actor.kind}: ${sql}`).toBe(
          "42501",
        );
      }
    }
    expect(
      await errorCode(
        asActor(db, { kind: "user", id: owner }, (q) =>
          q(`update public.events set active_card_design_id = $2 where id = $1`, [eventA, second]),
        ),
      ),
    ).toBe("42501");
  });

  it("the service role can", async () => {
    await design(eventA, { active: true });
    const second = await design(eventA, { round: 2 });
    await asActor(db, { kind: "service" }, async (q) => {
      const { rows } = await q(`select public.choose_card_design($1, $2, $3) as outcome`, [
        eventA,
        owner,
        second,
      ]);
      expect(rows[0].outcome).toBe("chosen");
    });
  });
});
