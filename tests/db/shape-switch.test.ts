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
 * Card shape switches (supabase/migrations/20261010000000_shape_switch.sql).
 *
 * spec.md §7.14 (a shape an existing artwork fits applies instantly with no model call; any other
 * shape is a generation of new artwork from the same brief, before publish only; the current card
 * stays as it is until the new artwork is ready; switching back is instant), §8.1 (after publish:
 * only shapes an existing artwork fits), §8.2, §10 (a shape switch that needs new artwork counts
 * as a generation), §20.5, §24 (a design has its original artwork plus one per such switch).
 * §32 #25, #27 (a design and its artwork are never mutated), #28, #30, #42.
 */

let db: Client;
let owner: string;
let cohost: string;
let stranger: string;
let eventA: string;
let eventB: string;

const keyHash = (subject: string) => `\\x${createHash("sha256").update(subject).digest("hex")}`;
const PORTRAIT = ["rectangle", "rounded-rectangle", "arch", "oval"];

type StartArgs = {
  event?: string;
  user?: string;
  kind?: string;
  key?: string;
  feedback?: string | null;
  fromDesign?: string | null;
  shape?: string | null;
};

async function start(
  args: StartArgs = {},
): Promise<{ generation_id: string | null; outcome: string }> {
  const {
    event = eventA,
    user = owner,
    kind = "shape_switch",
    key = randomUUID(),
    feedback = null,
    fromDesign = null,
    shape = null,
  } = args;
  const { rows } = await db.query(
    `select * from public.start_generation($1, $2, $3, $4, $5::bytea, $6::bytea, 30, 60, 330, $7, $8, $9)`,
    [
      event,
      user,
      kind,
      key,
      keyHash(`event:${event}`),
      keyHash(`user:${user}`),
      feedback,
      fromDesign,
      shape,
    ],
  );
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function eventCount(event = eventA): Promise<number> {
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

async function eventRow(event = eventA) {
  const { rows } = await db.query(
    `select active_card_design_id, active_card_shape from public.events where id = $1`,
    [event],
  );
  return rows[0];
}

/**
 * An art-top illustration design shown as a rectangle, with its artwork fitting `fits`
 * (by default the half-card shapes), active when `active`.
 */
async function design(
  event = eventA,
  {
    round = 1,
    active = true,
    fits = ["rectangle", "rounded-rectangle"],
  }: { round?: number; active?: boolean; fits?: string[] } = {},
): Promise<string> {
  const id = await insertCardDesign(db, event, { round, shape: "rectangle" });
  await insertCardArt(db, event, id, { fitsShapes: fits });
  if (active) {
    await db.query(
      `update public.events set active_card_design_id = $2, active_card_shape = 'rectangle'
       where id = $1`,
      [event, id],
    );
  }
  return id;
}

async function switchShape(
  designId: string,
  shape: string,
  { event = eventA, user = owner } = {},
): Promise<string> {
  const { rows } = await db.query(`select public.switch_card_shape($1, $2, $3, $4) as outcome`, [
    event,
    user,
    designId,
    shape,
  ]);
  return rows[0].outcome as string;
}

const SQUARE_INK = { square: { text: { ink: "#2b2118" } } };

async function persist(
  generation: string,
  {
    event = eventA,
    proportion = "square_1_1",
    fits = ["square"],
    ink = SQUARE_INK as Record<string, unknown>,
    telemetry = { artRegenerated: "panel-repaint", artRepaints: 1, inkPanels: [] } as object,
  } = {},
): Promise<
  { card_design_id: string; round: number; art_asset_id: string; activated: boolean } | undefined
> {
  const { rows } = await db.query(
    `select * from public.persist_shape_switch_artwork(
       $1, $2, $3, 'image/png', 3100000, 1440, 1440, $4, $5, $6,
       'image-model', 'card_art_v5', $7)`,
    [
      generation,
      event,
      `${event}/${generation}/${randomUUID()}.png`,
      proportion,
      fits,
      ink,
      telemetry,
    ],
  );
  return rows[0];
}

async function artworks(designId: string) {
  const { rows } = await db.query(
    `select id, fits_shapes::text[] as fits_shapes, storage_key, ink, created_at
     from public.card_art_assets
     where card_design_id = $1 order by created_at, id`,
    [designId],
  );
  return rows;
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

describe("switch_card_shape: the instant switch", () => {
  it("shows the active design in a shape an existing artwork fits, changing nothing else", async () => {
    const d = await design(eventA, { fits: PORTRAIT });
    const before = await db.query(`select * from public.card_designs where id = $1`, [d]);
    const art = await artworks(d);
    for (const user of [owner, cohost]) {
      expect(await switchShape(d, "oval", { user })).toBe("switched");
      expect(await eventRow()).toEqual({ active_card_design_id: d, active_card_shape: "oval" });
    }
    // Switching back is instant too.
    expect(await switchShape(d, "rectangle")).toBe("switched");
    expect((await eventRow()).active_card_shape).toBe("rectangle");
    // The design and its artwork are untouched; nothing was generated or consumed.
    expect((await db.query(`select * from public.card_designs where id = $1`, [d])).rows).toEqual(
      before.rows,
    );
    expect(await artworks(d)).toEqual(art);
    const { rows } = await db.query(`select count(*)::int as n from public.generations`);
    expect(rows[0].n).toBe(0);
    expect(await eventCount()).toBe(0);
  });

  it("answers needs_artwork for a shape no artwork of the design fits, changing nothing", async () => {
    const d = await design();
    for (const shape of ["arch", "oval", "square", "circle"]) {
      expect(await switchShape(d, shape), shape).toBe("needs_artwork");
    }
    expect(await eventRow()).toEqual({ active_card_design_id: d, active_card_shape: "rectangle" });
  });

  it("counts only the artwork of the active design", async () => {
    const d = await design();
    // Another design of the event has square artwork; it does not make the square instant here.
    const other = await insertCardDesign(db, eventA, { round: 2, shape: "square" });
    await insertCardArt(db, eventA, other, { proportion: "square_1_1", fitsShapes: ["square"] });
    expect(await switchShape(d, "square")).toBe("needs_artwork");
  });

  it("answers not_active for a design that is not the active one, and no_design without one", async () => {
    const d = await design();
    const second = await design(eventA, { round: 2, active: false, fits: PORTRAIT });
    expect(await switchShape(second, "oval")).toBe("not_active");
    expect(await eventRow()).toEqual({ active_card_design_id: d, active_card_shape: "rectangle" });
    const other = await design(eventB, { active: false });
    expect(await switchShape(other, "rectangle", { event: eventB })).toBe("no_design");
    expect(await switchShape(d, "rectangle", { event: randomUUID() })).toBe("not_found");
  });

  it("still switches after publish, among the shapes an existing artwork fits (spec.md §8.1)", async () => {
    const d = await design(eventA, { fits: PORTRAIT });
    await db.query(
      `update public.events set published_at = now(), status = 'PUBLISHED' where id = $1`,
      [eventA],
    );
    expect(await switchShape(d, "arch")).toBe("switched");
    expect((await eventRow()).active_card_shape).toBe("arch");
    expect(await switchShape(d, "square")).toBe("needs_artwork");
  });

  it("refuses a non-member and invalid arguments", async () => {
    const d = await design();
    expect(await errorCode(switchShape(d, "rounded-rectangle", { user: stranger }))).toBe("42501");
    expect(await errorCode(switchShape(d, "hexagon"))).toBe("22P02");
    expect(
      await errorCode(
        db.query(`select public.switch_card_shape($1, $2, $3, null)`, [eventA, owner, d]),
      ),
    ).toBe("22023");
    expect((await eventRow()).active_card_shape).toBe("rectangle");
  });
});

describe("start_generation: a shape switch", () => {
  it("records the design and the shape, and consumes the caps", async () => {
    const d = await design();
    const started = await start({ fromDesign: d, shape: "square" });
    expect(started.outcome).toBe("started");
    expect(await generationRow(started.generation_id!)).toMatchObject({
      kind: "shape_switch",
      status: "running",
      from_design_id: d,
      shape: "square",
      feedback: null,
      requested_by: owner,
    });
    expect(await eventCount()).toBe(1);
  });

  it("requires the design and the shape, takes no feedback, and gives no other kind a shape", async () => {
    const d = await design();
    for (const args of [
      { fromDesign: d },
      { shape: "square" },
      { fromDesign: d, shape: "square", feedback: "pinker" },
      { kind: "initial", shape: "square" },
      { kind: "another_direction", fromDesign: d, shape: "square" },
    ]) {
      expect(await errorCode(start(args)), JSON.stringify(args)).toBe("22023");
    }
    expect(await errorCode(start({ fromDesign: d, shape: "hexagon" }))).toBe("22P02");
    expect(await eventCount()).toBe(0);
  });

  it("refuses with no_design, not_active or fitted, consuming nothing", async () => {
    const other = await design(eventB, { active: false });
    expect(await start({ event: eventB, fromDesign: other, shape: "square" })).toEqual({
      generation_id: null,
      outcome: "no_design",
    });
    const d = await design();
    const second = await design(eventA, { round: 2, active: false });
    // Not the active design: chosen meanwhile, or another event's design altogether.
    for (const fromDesign of [second, other, randomUUID()]) {
      expect(await start({ fromDesign, shape: "square" })).toEqual({
        generation_id: null,
        outcome: "not_active",
      });
    }
    // An artwork of the design already fits: the switch is instant.
    for (const shape of ["rectangle", "rounded-rectangle"]) {
      expect(await start({ fromDesign: d, shape })).toEqual({
        generation_id: null,
        outcome: "fitted",
      });
    }
    expect(await eventCount()).toBe(0);
    expect(await eventCount(eventB)).toBe(0);
    const { rows } = await db.query(`select count(*)::int as n from public.generations`);
    expect(rows[0].n).toBe(0);
  });

  it("answers in order: existing, published, not_active, fitted, in_flight", async () => {
    const d = await design();
    const key = randomUUID();
    const first = await start({ key, fromDesign: d, shape: "square" });
    expect(await start({ key, fromDesign: d, shape: "circle" })).toEqual({
      generation_id: first.generation_id,
      outcome: "existing",
    });
    // A switch the artwork already fits is never queued behind a running generation.
    expect(await start({ fromDesign: d, shape: "rounded-rectangle", user: cohost })).toEqual({
      generation_id: null,
      outcome: "fitted",
    });
    expect(await start({ fromDesign: d, shape: "oval", user: cohost })).toEqual({
      generation_id: first.generation_id,
      outcome: "in_flight",
    });
    // Another kind of generation is in flight too.
    expect(await start({ kind: "another_direction", fromDesign: d })).toEqual({
      generation_id: first.generation_id,
      outcome: "in_flight",
    });
    await db.query(`update public.events set published_at = now() where id = $1`, [eventA]);
    expect(await start({ fromDesign: d, shape: "oval" })).toEqual({
      generation_id: null,
      outcome: "published",
    });
    expect(await start({ key, fromDesign: d, shape: "square" })).toEqual({
      generation_id: first.generation_id,
      outcome: "existing",
    });
    expect(await eventCount()).toBe(1);
  });

  it("refuses a key reused for another kind, and a non-member", async () => {
    const d = await design();
    const key = randomUUID();
    await start({ key, fromDesign: d, shape: "square" });
    expect(await errorCode(start({ key, kind: "another_direction", fromDesign: d }))).toBe("22023");
    expect(await errorCode(start({ user: stranger, fromDesign: d, shape: "oval" }))).toBe("42501");
  });
});

describe("persist_shape_switch_artwork", () => {
  async function running(shape = "square"): Promise<{ designId: string; generation: string }> {
    const designId = await design();
    const started = await start({ fromDesign: designId, shape });
    expect(started.outcome).toBe("started");
    return { designId, generation: started.generation_id! };
  }

  it("adds the artwork to the same design and shows it in the new shape", async () => {
    const { designId, generation } = await running();
    const designBefore = await db.query(`select * from public.card_designs where event_id = $1`, [
      eventA,
    ]);
    const [original] = await artworks(designId);
    const persisted = await persist(generation);
    expect(persisted).toMatchObject({ card_design_id: designId, round: 1, activated: true });
    // One more artwork, of the same design; the original is untouched; no new design.
    const after = await artworks(designId);
    expect(after).toHaveLength(2);
    expect(after[0]).toEqual(original);
    expect(after[1]).toMatchObject({ id: persisted!.art_asset_id, fits_shapes: ["square"] });
    expect(
      (await db.query(`select * from public.card_designs where event_id = $1`, [eventA])).rows,
    ).toEqual(designBefore.rows);
    expect(await eventRow()).toEqual({
      active_card_design_id: designId,
      active_card_shape: "square",
    });
    expect(await generationRow(generation)).toMatchObject({
      status: "succeeded",
      card_design_id: designId,
      round: 1,
      stage: "done",
      telemetry: { artRegenerated: "panel-repaint", artRepaints: 1, inkPanels: [] },
    });
    // Now instant both ways.
    expect(await switchShape(designId, "rectangle")).toBe("switched");
    expect(await switchShape(designId, "square")).toBe("switched");
  });

  it("keeps the artwork but leaves the card alone when the host chose another design meanwhile", async () => {
    const { designId, generation } = await running();
    const second = await design(eventA, { round: 2, active: false });
    await db.query(
      `update public.events set active_card_design_id = $2, active_card_shape = 'rectangle' where id = $1`,
      [eventA, second],
    );
    const persisted = await persist(generation);
    expect(persisted).toMatchObject({ card_design_id: designId, activated: false });
    expect(await eventRow()).toEqual({
      active_card_design_id: second,
      active_card_shape: "rectangle",
    });
    expect(await artworks(designId)).toHaveLength(2);
  });

  it("fills the card_art run's telemetry and every run's round", async () => {
    const { generation } = await running();
    for (const operation of ["card_art", "card_art_moderation", "card_art_inspection"]) {
      await db.query(
        `insert into public.generation_runs
           (event_id, user_id, generation_id, provider, operation, model, latency_ms, success,
            prompt_version)
         values ($1, $2, $3, 'openai', $4, 'm', 1, true, 'p')`,
        [eventA, owner, generation, operation],
      );
    }
    await persist(generation, {
      telemetry: {
        artRegenerated: "text",
        artRepaints: 0,
        inkPanels: [{ shape: "square", zone: "text" }],
      },
    });
    const { rows } = await db.query(
      `select operation, round, art_regenerated, art_repaints, ink_panels
       from public.generation_runs where generation_id = $1 order by operation`,
      [generation],
    );
    expect(rows.every((r) => r.round === 1)).toBe(true);
    expect(rows.find((r) => r.operation === "card_art")).toMatchObject({
      art_regenerated: "text",
      art_repaints: 0,
      ink_panels: [{ shape: "square", zone: "text" }],
    });
  });

  it("writes nothing once the generation stopped running, the event is published, or it is not a shape switch", async () => {
    const { designId, generation } = await running();
    await db.query(`update public.events set published_at = now() where id = $1`, [eventA]);
    expect(await persist(generation)).toBeUndefined();
    await db.query(`update public.events set published_at = null where id = $1`, [eventA]);
    await db.query(
      `update public.generations set status = 'failed', finished_at = now() where id = $1`,
      [generation],
    );
    expect(await persist(generation)).toBeUndefined();
    const direction = await start({ kind: "another_direction", fromDesign: designId });
    expect(await persist(direction.generation_id!)).toBeUndefined();
    expect(await persist(randomUUID())).toBeUndefined();
    expect(await artworks(designId)).toHaveLength(1);
    expect((await eventRow()).active_card_shape).toBe("rectangle");
  });

  it("adds one artwork per generation: a second persist writes nothing", async () => {
    const { designId, generation } = await running();
    expect(await persist(generation)).toBeDefined();
    expect(await persist(generation)).toBeUndefined();
    expect(await artworks(designId)).toHaveLength(2);
  });

  it("refuses artwork that does not fit the shape asked for, or lacks ink, rolling back", async () => {
    const { designId, generation } = await running();
    // Square artwork that claims only the circle.
    expect(
      await errorCode(persist(generation, { fits: ["circle"], ink: { circle: { text: {} } } })),
    ).toBe("22023");
    // No ink for a fitted shape; artwork of the wrong proportion.
    expect(await errorCode(persist(generation, { ink: {} }))).toBe("23514");
    expect(await errorCode(persist(generation, { proportion: "portrait_5_7" }))).toBe("23514");
    expect(await artworks(designId)).toHaveLength(1);
    expect((await generationRow(generation)).status).toBe("running");
    expect((await eventRow()).active_card_shape).toBe("rectangle");
  });
});

describe("generations: a shape is a shape switch's alone", () => {
  it("refuses a shape on another kind", async () => {
    const d = await design();
    for (const [kind, fromDesign] of [
      ["initial", null],
      ["another_direction", d],
    ] as const) {
      expect(
        await errorCode(
          db.query(
            `insert into public.generations (event_id, kind, idempotency_key, from_design_id, shape)
             values ($1, $2, $3, $4, 'square')`,
            [eventA, kind, randomUUID(), fromDesign],
          ),
        ),
        kind,
      ).toBe("23514");
    }
  });
});

describe("end users cannot use any of it (spec.md §32 #42)", () => {
  const ACTORS = (): Actor[] => [{ kind: "anon" }, { kind: "user", id: owner }];

  it("cannot execute the new functions or set the active shape", async () => {
    const d = await design(eventA, { fits: PORTRAIT });
    const h = keyHash("x");
    for (const actor of ACTORS()) {
      for (const sql of [
        `select public.switch_card_shape('${eventA}', '${owner}', '${d}', 'oval')`,
        `select * from public.start_generation('${eventA}', '${owner}', 'shape_switch', 'k', '${h}', '${h}', 30, 60, 330, null, '${d}', 'square')`,
        `select * from public.persist_shape_switch_artwork('${randomUUID()}', '${eventA}', 'k', 'image/png', 1, 1, 1, 'square_1_1', array['square'], '{}', 'm', 'v', '{}')`,
        `select shape from public.generations`,
      ]) {
        expect(await errorCode(asActor(db, actor, (q) => q(sql))), `${actor.kind}: ${sql}`).toBe(
          "42501",
        );
      }
    }
    expect(
      await errorCode(
        asActor(db, { kind: "user", id: owner }, (q) =>
          q(`update public.events set active_card_shape = 'oval' where id = $1`, [eventA]),
        ),
      ),
    ).toBe("42501");
    expect((await eventRow()).active_card_shape).toBe("rectangle");
  });

  it("the service role can", async () => {
    const d = await design(eventA, { fits: PORTRAIT });
    await asActor(db, { kind: "service" }, async (q) => {
      const { rows } = await q(`select public.switch_card_shape($1, $2, $3, 'oval') as outcome`, [
        eventA,
        owner,
        d,
      ]);
      expect(rows[0].outcome).toBe("switched");
    });
  });
});
