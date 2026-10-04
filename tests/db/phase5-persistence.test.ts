import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

import {
  asActor,
  connect,
  createAuthUser,
  errorCode,
  insertCardDesign,
  resetDatabase,
  type Actor,
} from "./harness";

/**
 * Persisting a generation (supabase/migrations/20261006000000_phase5_generation_persistence.sql).
 *
 * spec.md §7.5 (the identity is interpreted once and kept), §7.10 (stage results as they
 * resolve), §7.11 (the first card becomes active; later ones only when chosen), §8.2 (no
 * generation after publish), §9.4 (every identity revision, design and artwork persisted), §9.5
 * (telemetry), §24 (generated-data immutability). §32 #25, #27, #42.
 */

let db: Client;
let owner: string;
let stranger: string;
let eventA: string;
let eventB: string;

const keyHash = (subject: string) => `\\x${createHash("sha256").update(subject).digest("hex")}`;

async function start(event = eventA, client: Client = db): Promise<string> {
  const { rows } = await client.query(
    `select * from public.start_generation($1, $2, 'initial', $3, $4::bytea, $5::bytea, 30, 60, 330)`,
    [event, owner, randomUUID(), keyHash(`event:${event}`), keyHash(`user:${owner}`)],
  );
  expect(rows[0].outcome).toBe("started");
  return rows[0].generation_id as string;
}

const IDENTITY = { creativeDirection: "A sunlit lemon grove with linen calm." };

async function recordIdentity(
  generation: string,
  event = eventA,
  client: Client = db,
): Promise<number | null> {
  const { rows } = await client.query(
    `select public.record_event_identity($1, $2, $3, $4, 'event_identity_v4', 'event_identity_schema_v4') as revision`,
    [generation, event, IDENTITY, JSON.stringify(IDENTITY)],
  );
  return rows[0].revision as number | null;
}

async function recordStage(
  generation: string,
  stage: string,
  artifacts: unknown,
  event = eventA,
): Promise<boolean> {
  const { rows } = await db.query(`select public.record_generation_stage($1, $2, $3, $4) as ok`, [
    generation,
    event,
    stage,
    artifacts,
  ]);
  return rows[0].ok as boolean;
}

async function failGeneration(generation: string, code: string, event = eventA): Promise<boolean> {
  const { rows } = await db.query(`select public.fail_generation($1, $2, $3) as ok`, [
    generation,
    event,
    code,
  ]);
  return rows[0].ok as boolean;
}

const PORTRAIT = ["rectangle", "rounded-rectangle", "arch", "oval"];
const TELEMETRY = {
  schemaValidFirstCall: false,
  reprompts: ["schema"],
  standardWording: ["invitationLine"],
  artRegenerated: "panel-repaint",
  artRepaints: 1,
  inkPanels: [{ shape: "rectangle", zone: "text" }],
  identityValidFirstCall: true,
};

type PersistArgs = {
  event?: string;
  identityRevision?: number;
  shape?: string;
  fitsShapes?: string[];
  ink?: unknown;
  storageKey?: string;
  proportion?: string;
};

async function persist(
  generation: string,
  args: PersistArgs = {},
  client: Client = db,
): Promise<{ card_design_id: string; round: number } | undefined> {
  const {
    event = eventA,
    identityRevision = 1,
    shape = "rectangle",
    fitsShapes = PORTRAIT,
    ink = Object.fromEntries(fitsShapes.map((s) => [s, { text: { ink: "#2b2118" } }])),
    storageKey = `${event}/${generation}/${randomUUID()}.png`,
    proportion = fitsShapes.includes("square") ? "square_1_1" : "portrait_5_7",
  } = args;
  const { rows } = await client.query(
    `select * from public.persist_generated_card(
       $1, $2, $3, 'Lemons & Linen', 'A lemon branch over soft linen.', $4, 'art-top',
       'illustration', '{"primary":"oldstyle_garamond_worksans","alternates":[]}',
       '{"title":"Lemons & Linen","invitationLine":"Please join us"}', '{"subject":"a lemon branch"}',
       '{"presentation":{"name":"Lemons & Linen"}}',
       '{"designPrompt":"card_design_v1","designSchema":"card_design_schema_v1","layoutSet":"card_layouts_v2","compiler":"card_compiler_v2","artPrompt":"card_art_v2","imageModel":"gpt-image-2.5-sunburst-2026-09-08"}',
       array['invitationLine'], $5, 'image/png', 4200000, 1440, 2016, $9, $6, $7,
       'gpt-image-2.5-sunburst-2026-09-08', 'card_art_v2', $8)`,
    [
      generation,
      event,
      identityRevision,
      shape,
      storageKey,
      fitsShapes,
      ink,
      TELEMETRY,
      proportion,
    ],
  );
  return rows[0];
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

async function count(table: string, event = eventA): Promise<number> {
  const { rows } = await db.query(
    `select count(*)::int as n from public.${table} where event_id = $1`,
    [event],
  );
  return rows[0].n;
}

/** A generation that has recorded the event's identity, ready to persist a card. */
async function generationWithIdentity(event = eventA): Promise<string> {
  const g = await start(event);
  expect(await recordIdentity(g, event)).not.toBeNull();
  return g;
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
  stranger = await createAuthUser(db, "stranger@example.com");
  const created = await db.query(
    `insert into public.events (owner_id, prompt) values ($1, 'Event A'), ($1, 'Event B') returning id`,
    [owner],
  );
  [eventA, eventB] = created.rows.map((r) => r.id as string);
});

describe("event identities: one immutable row per revision", () => {
  it("numbers revisions 1, 2, … per event and links each to its generation", async () => {
    const first = await start();
    expect(await recordIdentity(first)).toBe(1);
    expect(await recordIdentity(first)).toBe(2);
    const other = await start(eventB);
    expect(await recordIdentity(other, eventB)).toBe(1);
    await failGeneration(first, "invalid_output");
    const second = await start();
    expect(await recordIdentity(second)).toBe(3);
    const { rows } = await db.query(
      `select revision, generation_id, raw, identity, prompt_version from public.event_identities
       where event_id = $1 order by revision`,
      [eventA],
    );
    expect(rows.map((r) => [r.revision, r.generation_id])).toEqual([
      [1, first],
      [2, first],
      [3, second],
    ]);
    expect(rows[0]).toMatchObject({
      raw: JSON.stringify(IDENTITY),
      identity: IDENTITY,
      prompt_version: "event_identity_v4",
    });
  });

  it("writes nothing unless the generation is running for that event and the event is unpublished", async () => {
    const g = await start();
    // Another event's generation, an unknown one, an unknown event.
    expect(await recordIdentity(g, eventB)).toBeNull();
    expect(await recordIdentity(randomUUID())).toBeNull();
    expect(await recordIdentity(g, randomUUID())).toBeNull();
    // Published (by status or by published_at).
    await db.query(`update public.events set status = 'PUBLISHED' where id = $1`, [eventA]);
    expect(await recordIdentity(g)).toBeNull();
    await db.query(
      `update public.events set status = 'DRAFT', published_at = now() where id = $1`,
      [eventA],
    );
    expect(await recordIdentity(g)).toBeNull();
    await db.query(`update public.events set published_at = null where id = $1`, [eventA]);
    // Finished.
    await failGeneration(g, "internal");
    expect(await recordIdentity(g)).toBeNull();
    expect(await count("event_identities")).toBe(0);
  });

  it("refuses every update and every delete while the event exists, even for the service role", async () => {
    const g = await generationWithIdentity();
    for (const sql of [
      `update public.event_identities set identity = '{}'`,
      `update public.event_identities set raw = 'changed'`,
      `update public.event_identities set revision = 9`,
      `update public.event_identities set generation_id = gen_random_uuid()`,
      `delete from public.event_identities`,
    ]) {
      expect(await errorCode(db.query(sql)), sql).toBe("42501");
      expect(
        await errorCode(asActor(db, { kind: "service" }, (q) => q(sql))),
        `service: ${sql}`,
      ).toBe("42501");
    }
    // The only update allowed: a generation's own removal nulls its link.
    await db.query(`delete from public.generations where id = $1`, [g]);
    const { rows } = await db.query(`select generation_id from public.event_identities`);
    expect(rows).toEqual([{ generation_id: null }]);
  });

  it("goes with its event, generations and designs included", async () => {
    const g = await generationWithIdentity();
    expect(await persist(g)).toBeTruthy();
    await db.query(`delete from public.events where id = $1`, [eventA]);
    for (const table of ["event_identities", "card_designs", "card_art_assets", "generations"]) {
      expect(await count(table), table).toBe(0);
    }
  });

  it("a design must name an identity revision of its own event", async () => {
    await generationWithIdentity(eventB);
    expect(await errorCode(insertCardDesign(db, eventA, { identityRevision: 0 }))).toBe("23514");
    const g = await start();
    // Revision 1 exists for event B only.
    expect(await errorCode(persist(g, { identityRevision: 1 }))).toBe("23503");
  });
});

describe("record_generation_stage and fail_generation touch only a running generation", () => {
  it("records stages and merges artifacts while running", async () => {
    const g = await start();
    await db.query(
      `update public.generations set heartbeat_at = now() - interval '2 minutes' where id = $1`,
      [g],
    );
    expect(await recordStage(g, "identity", { identity: { tone: ["calm"] }, facts: null })).toBe(
      true,
    );
    expect(await recordStage(g, "design", { design: { name: "Lemons" } })).toBe(true);
    expect(await recordStage(g, "design", { notice: "provider_refusal" })).toBe(true);
    expect(await recordStage(g, "design", { design: { name: "Lemon Grove" } })).toBe(true);
    const row = await generationRow(g);
    expect(row.stage).toBe("design");
    expect(row.artifacts).toEqual({
      identity: { tone: ["calm"] },
      facts: null,
      design: { name: "Lemon Grove" },
      notice: "provider_refusal",
    });
    expect(Date.now() - new Date(row.heartbeat_at).getTime()).toBeLessThan(60_000);
  });

  it("records nothing for a generation that is not running, or not this event's", async () => {
    const g = await start();
    expect(await recordStage(g, "identity", {}, eventB)).toBe(false);
    expect(await recordStage(randomUUID(), "identity", {})).toBe(false);
    expect(await failGeneration(g, "provider_error", eventB)).toBe(false);
    expect((await generationRow(g)).status).toBe("running");

    expect(await failGeneration(g, "provider_error")).toBe(true);
    const failed = await generationRow(g);
    expect(failed).toMatchObject({ status: "failed", error_code: "provider_error" });
    expect(failed.finished_at).not.toBeNull();
    // Already failed: neither function touches it again.
    expect(await failGeneration(g, "internal")).toBe(false);
    expect(await recordStage(g, "design", { design: {} })).toBe(false);
    expect(await generationRow(g)).toMatchObject({ error_code: "provider_error", stage: null });

    // A succeeded generation is left alone too.
    const done = await generationWithIdentity();
    await persist(done);
    expect(await failGeneration(done, "internal")).toBe(false);
    expect(await recordStage(done, "design", {})).toBe(false);
    expect(await generationRow(done)).toMatchObject({ status: "succeeded", error_code: null });
  });

  it("rejects invalid arguments", async () => {
    const g = await start();
    for (const sql of [
      `select public.record_generation_stage('${g}', '${eventA}', '', '{}')`,
      `select public.record_generation_stage('${g}', '${eventA}', 'design', '[]')`,
      `select public.fail_generation('${g}', '${eventA}', '')`,
      `select public.record_event_identity('${g}', '${eventA}', '[]', '', 'v', 's')`,
    ]) {
      expect(await errorCode(db.query(sql)), sql).toBe("22023");
    }
  });
});

describe("persist_generated_card", () => {
  it("writes the design, its artwork, the first active design and the generation's success", async () => {
    const g = await generationWithIdentity();
    const key = `${eventA}/${g}/art.png`;
    const result = await persist(g, { storageKey: key });
    expect(result?.round).toBe(1);
    const design = (
      await db.query(`select * from public.card_designs where id = $1`, [result!.card_design_id])
    ).rows[0];
    expect(design).toMatchObject({
      event_id: eventA,
      round: 1,
      name: "Lemons & Linen",
      shape: "rectangle",
      layout: "art-top",
      art_mode: "illustration",
      identity_revision: 1,
      standard_wording_slots: ["invitationLine"],
      raw: { presentation: { name: "Lemons & Linen" } },
    });
    expect(design.versions).toMatchObject({
      compiler: "card_compiler_v2",
      artPrompt: "card_art_v2",
    });
    const art = (
      await db.query(`select * from public.card_art_assets where card_design_id = $1`, [
        result!.card_design_id,
      ])
    ).rows;
    expect(art).toHaveLength(1);
    expect(art[0]).toMatchObject({
      storage_key: key,
      proportion: "portrait_5_7",
      width: 1440,
      height: 2016,
      size_bytes: 4200000,
      image_model: "gpt-image-2.5-sunburst-2026-09-08",
      art_prompt_version: "card_art_v2",
    });
    expect(await activeDesign()).toEqual({
      active_card_design_id: result!.card_design_id,
      active_card_shape: "rectangle",
    });
    expect(await generationRow(g)).toMatchObject({
      status: "succeeded",
      stage: "done",
      round: 1,
      card_design_id: result!.card_design_id,
      telemetry: TELEMETRY,
      error_code: null,
    });
    expect((await generationRow(g)).finished_at).not.toBeNull();
  });

  it("numbers rounds per event and makes only the first card active (spec.md §7.11)", async () => {
    const first = await generationWithIdentity();
    const one = await persist(first);
    const second = await start();
    const two = await persist(second, { shape: "square", fitsShapes: ["square", "circle"] });
    expect([one?.round, two?.round]).toEqual([1, 2]);
    // The second card is not chosen by the host, so the first stays active.
    expect(await activeDesign()).toEqual({
      active_card_design_id: one!.card_design_id,
      active_card_shape: "rectangle",
    });
    // Another event starts its own rounds.
    const other = await generationWithIdentity(eventB);
    expect((await persist(other, { event: eventB }))?.round).toBe(1);
  });

  it("writes nothing for a generation that is not running", async () => {
    const g = await generationWithIdentity();
    await failGeneration(g, "stale");
    expect(await persist(g)).toBeUndefined();
    expect(await persist(randomUUID())).toBeUndefined();
    const other = await start(eventB);
    // Running, but for another event.
    expect(await persist(other)).toBeUndefined();
    expect(await count("card_designs")).toBe(0);
    expect(await count("card_art_assets")).toBe(0);
    expect(await activeDesign()).toEqual({ active_card_design_id: null, active_card_shape: null });
    expect(await generationRow(g)).toMatchObject({ status: "failed", error_code: "stale" });
  });

  it("writes nothing once the event is published", async () => {
    for (const publish of [
      `update public.events set status = 'PUBLISHED' where id = $1`,
      `update public.events set published_at = now() where id = $1`,
    ]) {
      await db.query(
        `update public.events set status = 'DRAFT', published_at = null where id = $1`,
        [eventA],
      );
      const g = await generationWithIdentity();
      await db.query(publish, [eventA]);
      expect(await persist(g), publish).toBeUndefined();
      expect(await count("card_designs")).toBe(0);
      expect((await generationRow(g)).status).toBe("running");
      await failGeneration(g, "published");
    }
  });

  it("is atomic: a failing artwork insert leaves no design and changes nothing", async () => {
    const g = await generationWithIdentity();
    // Ink missing for a fitted shape violates card_art_assets_ink_per_fitted_shape.
    const code = await errorCode(persist(g, { ink: { rectangle: { text: { ink: "#000000" } } } }));
    expect(code).toBe("23514");
    // A shape outside the artwork's proportion: refused by the fit check, likewise atomic.
    expect(
      await errorCode(persist(g, { fitsShapes: ["square"], proportion: "portrait_5_7" })),
    ).toBe("23514");
    expect(await count("card_designs")).toBe(0);
    expect(await count("card_art_assets")).toBe(0);
    expect(await activeDesign()).toEqual({ active_card_design_id: null, active_card_shape: null });
    expect(await generationRow(g)).toMatchObject({ status: "running", card_design_id: null });
    // The same generation can still persist once its data is valid.
    expect((await persist(g))?.round).toBe(1);
  });

  it("produces one design when two persists of one generation race", async () => {
    const g = await generationWithIdentity();
    const clients = await Promise.all(Array.from({ length: 6 }, () => connect()));
    try {
      const results = await Promise.all(clients.map((c) => persist(g, {}, c)));
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await count("card_designs")).toBe(1);
      expect(await count("card_art_assets")).toBe(1);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });

  it("fills this generation's telemetry columns by operation, and its runs' round", async () => {
    const g = await generationWithIdentity();
    const earlier = await start(eventB);
    const insertRun = (generation: string, operation: string, event = eventA) =>
      db.query(
        `insert into public.generation_runs
           (event_id, user_id, generation_id, provider, operation, model, latency_ms, success,
            prompt_version)
         values ($1, $2, $3, 'openai', $4, 'm', 1, true, 'p')`,
        [event, owner, generation, operation],
      );
    for (const op of ["event_identity", "structured_extraction", "card_design", "card_design"]) {
      await insertRun(g, op);
    }
    await insertRun(g, "card_art");
    await insertRun(g, "card_art_inspection");
    await insertRun(earlier, "card_design", eventB);
    await persist(g);
    const { rows } = await db.query(
      `select operation, round, schema_valid_first_call, reprompts, standard_wording_slots,
              art_regenerated, art_repaints, ink_panels
       from public.generation_runs where generation_id = $1 order by operation`,
      [g],
    );
    expect(rows.every((r) => r.round === 1)).toBe(true);
    const by = (op: string) => rows.filter((r) => r.operation === op);
    for (const run of by("card_design")) {
      expect(run).toMatchObject({
        schema_valid_first_call: false,
        reprompts: ["schema"],
        standard_wording_slots: ["invitationLine"],
        art_regenerated: null,
      });
    }
    expect(by("card_art")[0]).toMatchObject({
      art_regenerated: "panel-repaint",
      art_repaints: 1,
      ink_panels: [{ shape: "rectangle", zone: "text" }],
      schema_valid_first_call: null,
    });
    expect(by("event_identity")[0]).toMatchObject({ schema_valid_first_call: true });
    expect(by("card_art_inspection")[0]).toMatchObject({
      schema_valid_first_call: null,
      art_regenerated: null,
    });
    // Another generation's runs are untouched.
    const other = await db.query(
      `select round, schema_valid_first_call from public.generation_runs where generation_id = $1`,
      [earlier],
    );
    expect(other.rows).toEqual([{ round: null, schema_valid_first_call: null }]);
  });
});

describe("only the service role may call the new functions (spec.md §32 #42)", () => {
  const ACTORS = (): Actor[] => [
    { kind: "anon" },
    { kind: "user", id: owner },
    { kind: "user", id: stranger },
  ];

  it("end users cannot execute any of them", async () => {
    const g = await start();
    const calls = [
      `select public.record_event_identity('${g}', '${eventA}', '{}', '', 'v', 's')`,
      `select public.record_generation_stage('${g}', '${eventA}', 'design', '{}')`,
      `select public.fail_generation('${g}', '${eventA}', 'x')`,
      `select * from public.persist_generated_card('${g}', '${eventA}', 1, 'n', 'd', 'rectangle',
         'art-top', 'illustration', '{}', '{}', '{}', '{}', '{}', '{}', 'k', 'image/png', 1, 1, 1,
         'portrait_5_7', '{rectangle}', '{"rectangle":{}}', 'm', 'v', '{}')`,
    ];
    for (const actor of ACTORS()) {
      for (const sql of calls) {
        expect(await errorCode(asActor(db, actor, (q) => q(sql))), `${actor.kind}: ${sql}`).toBe(
          "42501",
        );
      }
    }
    expect((await generationRow(g)).status).toBe("running");
  });

  it("end users never write identities; members read them; nobody truncates", async () => {
    await generationWithIdentity();
    for (const actor of ACTORS()) {
      for (const sql of [
        `insert into public.event_identities (event_id, revision, identity, raw, prompt_version, schema_version)
         values ('${eventA}', 5, '{}', '', 'v', 's')`,
        `update public.event_identities set raw = 'x'`,
        `delete from public.event_identities`,
        `truncate public.event_identities`,
      ]) {
        expect(await errorCode(asActor(db, actor, (q) => q(sql))), `${actor.kind}: ${sql}`).toBe(
          "42501",
        );
      }
    }
    const read = (actor: Actor) =>
      asActor(db, actor, (q) => q(`select revision from public.event_identities`));
    expect((await read({ kind: "user", id: owner })).rows).toEqual([{ revision: 1 }]);
    expect((await read({ kind: "user", id: stranger })).rows).toEqual([]);
    expect(
      await errorCode(
        asActor(db, { kind: "service" }, (q) => q(`truncate public.event_identities`)),
      ),
    ).toBe("42501");
  });

  it("the service role can run a whole generation", async () => {
    const result = await asActor(db, { kind: "service" }, async (q) => {
      const h = keyHash("svc");
      const started = await q(
        `select * from public.start_generation($1, $2, 'initial', 'svc-key', $3::bytea, $3::bytea, 30, 60, 330)`,
        [eventA, owner, h],
      );
      const g = started.rows[0].generation_id as string;
      const revision = await q(
        `select public.record_event_identity($1, $2, '{"a":1}', '{"a":1}', 'v', 's') as r`,
        [g, eventA],
      );
      expect(revision.rows[0].r).toBe(1);
      const staged = await q(
        `select public.record_generation_stage($1, $2, 'identity', '{"identity":{}}') as ok`,
        [g, eventA],
      );
      expect(staged.rows[0].ok).toBe(true);
      const persisted = await q(
        `select * from public.persist_generated_card($1, $2, 1, 'n', 'd', 'rectangle', 'art-top',
           'illustration', '{}', '{}', '{}', '{}', '{}', '{}', 'k', 'image/png', 1, 1, 1,
           'portrait_5_7', '{rectangle}', '{"rectangle":{}}', 'm', 'v', '{}')`,
        [g, eventA],
      );
      return persisted.rows[0];
    });
    expect(result.round).toBe(1);
  });
});
