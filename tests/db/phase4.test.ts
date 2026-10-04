import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import {
  asActor,
  connect,
  createAuthUser,
  databaseUrl,
  errorCode,
  insertCardArt,
  insertCardDesign,
  pgError,
  resetDatabase,
  type Actor,
} from "./harness";

/**
 * The card data model (supabase/migrations/20261004000000_phase4_card_data.sql).
 *
 * spec.md §20.5 (one customization per event × design × shape; stale saves refused; `Reset card`
 * is a new revision), §24 (CardDesign, CardArtAsset, CardCustomization, CardFont,
 * Event.activeCardDesignId / activeCardShape; generated data is immutable), §25 (owner and
 * co-host read and edit the card; guests never write), §32 #25, #27.
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

const BOXES = JSON.stringify([
  {
    id: "title",
    source: { kind: "wording", slot: "title" },
    x: 100,
    y: 820,
    width: 800,
    rotation: 0,
    lines: ["Oh Baby"],
  },
]);
const SEED = JSON.stringify([{ id: "title", source: { kind: "wording", slot: "title" } }]);

/** Calls save_card_customization as `actor` and commits, so successive saves build on each other. */
async function save(
  actor: Actor,
  expected: number,
  {
    event = eventId,
    design = designId,
    shape = "rectangle",
    boxes = BOXES,
  }: { event?: string; design?: string; shape?: string | null; boxes?: string | null } = {},
): Promise<number> {
  const { rows } = await asActor(
    db,
    actor,
    (q) =>
      q(`select public.save_card_customization($1, $2, $3, $4::jsonb, $5) as revision`, [
        event,
        design,
        shape,
        boxes,
        expected,
      ]),
    { commit: true },
  );
  return rows[0].revision as number;
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

describe("the website-era schema is gone", () => {
  it("drops the concept tables, their event columns, the survey tables and website telemetry", async () => {
    const tables = await db.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = any($1)`,
      [
        [
          "design_concepts",
          "resolved_design_specs",
          "human_test_1_responses",
          "human_test_1_test_responses",
        ],
      ],
    );
    expect(tables.rows).toEqual([]);
    const columns = await db.query(
      `select table_name || '.' || column_name as col from information_schema.columns
       where table_schema = 'public' and (
         (table_name = 'events' and column_name in ('active_concept_id', 'design_overrides'))
         or (table_name = 'generation_runs' and column_name in (
           'concept_index', 'primitive_set_version', 'diversity_assignment', 'compiler_repairs',
           'verified', 'signature', 'nearest_sibling', 'fallback')))`,
    );
    expect(columns.rows).toEqual([]);
    const functions = await db.query(
      `select proname from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1)`,
      [
        [
          "validate_active_concept",
          "protect_design_concept",
          "validate_resolved_spec_lineage",
          "reject_update",
        ],
      ],
    );
    expect(functions.rows).toEqual([]);
    // generation_runs keeps its card-relevant telemetry for Phase 5.
    await db.query(
      `insert into public.generation_runs
         (event_id, provider, operation, model, latency_ms, success, prompt_version, schema_version,
          compiler_version, schema_valid_first_call, reprompts, error_code, idempotency_key)
       values ($1, 'openai', 'event_identity', 'gpt-6.1-sol', 900, true, 'event_identity_v4',
          'event_identity_schema_v4', 'card_compiler_v1', true, '[]', null, 'k1')`,
      [eventId],
    );
  });
});

describe("access to card data", () => {
  it("owner and co-host read the event's designs, artwork and customizations; strangers see none", async () => {
    await save(OWNER(), 0);
    for (const member of [OWNER(), COHOST()]) {
      const seen = await asActor(db, member, (q) =>
        q(
          `select (select count(*) from public.card_designs)::int as designs,
                  (select count(*) from public.card_art_assets)::int as art,
                  (select count(*) from public.card_customizations)::int as customizations`,
        ),
      );
      expect(seen.rows[0]).toEqual({ designs: 1, art: 1, customizations: 1 });
    }
    // A design on an event the stranger owns is theirs alone.
    const theirs = await insertCardDesign(db, otherEventId);
    const asStranger = await asActor(db, STRANGER(), (q) =>
      q(
        `select (select array_agg(id) from public.card_designs) as designs,
                (select count(*) from public.card_art_assets)::int as art,
                (select count(*) from public.card_customizations)::int as customizations`,
      ),
    );
    expect(asStranger.rows[0]).toEqual({ designs: [theirs], art: 0, customizations: 0 });
    const asOwner = await asActor(db, OWNER(), (q) => q(`select id from public.card_designs`));
    expect(asOwner.rows.map((r) => r.id)).toEqual([designId]);
  });

  it("anon has no access to any card table", async () => {
    for (const table of ["card_designs", "card_art_assets", "card_customizations", "card_fonts"]) {
      expect(
        await errorCode(asActor(db, { kind: "anon" }, (q) => q(`select * from public.${table}`))),
        table,
      ).toBe("42501");
    }
  });

  it("end users never write designs, artwork or customizations directly", async () => {
    const attempts = [
      `insert into public.card_designs (event_id, round, name, description, shape, layout, art_mode,
         typography, wording, art_brief, raw, versions)
       values ('${eventId}', 2, 'n', 'd', 'oval', 'framed', 'framed', '{}', '{}', '{}', '{}', '{}')`,
      `update public.card_designs set selected_at = now()`,
      `delete from public.card_designs`,
      `insert into public.card_art_assets (event_id, card_design_id, proportion, fits_shapes,
         storage_key, mime_type, width, height, size_bytes, ink, image_model, art_prompt_version)
       values ('${eventId}', '${designId}', 'square_1_1', '{square}', 'k', 'image/png', 1, 1, 1,
         '{"square":{}}', 'm', 'v')`,
      `update public.card_art_assets set storage_key = 'elsewhere'`,
      `delete from public.card_art_assets`,
      `insert into public.card_customizations (event_id, card_design_id, shape, boxes)
       values ('${eventId}', '${designId}', 'rectangle', '[]')`,
      `update public.card_customizations set boxes = '[]'`,
      `delete from public.card_customizations`,
    ];
    for (const actor of [OWNER(), COHOST()]) {
      for (const sql of attempts) {
        expect(await errorCode(asActor(db, actor, (q) => q(sql))), sql).toBe("42501");
      }
    }
  });

  it("server code (service role) writes designs and artwork and reads everything", async () => {
    const written = await asActor(db, { kind: "service" }, async (q) => {
      const d = await q(
        `insert into public.card_designs (event_id, round, name, description, shape, layout, art_mode,
           typography, wording, art_brief, raw, versions)
         values ($1, 2, 'Moonlit', 'A night sky', 'circle', 'atmosphere', 'atmosphere', '{}', '{}',
           '{}', '{}', '{}')
         returning id`,
        [eventId],
      );
      await q(
        `insert into public.card_art_assets (event_id, card_design_id, proportion, fits_shapes,
           storage_key, mime_type, width, height, size_bytes, ink, image_model, art_prompt_version)
         values ($1, $2, 'square_1_1', '{square,circle}', 'events/x/moon.png', 'image/png', 1440,
           1440, 10, '{"square":{},"circle":{}}', 'gpt-image-2.5-sunburst', 'card_art_v1')`,
        [eventId, d.rows[0].id],
      );
      return q(
        `select (select count(*) from public.card_designs)::int as designs,
                (select count(*) from public.card_art_assets)::int as art`,
      );
    });
    expect(written.rows[0]).toEqual({ designs: 2, art: 2 });
  });
});

describe("card fonts are server-only", () => {
  const FONT = `insert into public.card_fonts
      (family, category, variants, license_name, license_text, storage_keys, metrics_version)
    values ('Fraunces', 'serif', '{400,700italic}', 'SIL Open Font License 1.1',
      'Copyright 2020 The Fraunces Project Authors ...', '{"400":"fonts/fraunces/400.woff2"}',
      'font_metrics_v1')`;

  it("is invisible and unwritable to authenticated users and anon", async () => {
    await db.query(FONT);
    for (const actor of [OWNER(), { kind: "anon" } as Actor]) {
      for (const sql of [
        `select * from public.card_fonts`,
        FONT.replace("Fraunces", "Lora"),
        `update public.card_fonts set license_text = 'x'`,
        `delete from public.card_fonts`,
      ]) {
        expect(await errorCode(asActor(db, actor, (q) => q(sql))), sql).toBe("42501");
      }
    }
    const viaService = await asActor(db, { kind: "service" }, (q) =>
      q(`select family, license_name from public.card_fonts`),
    );
    expect(viaService.rows).toEqual([
      { family: "Fraunces", license_name: "SIL Open Font License 1.1" },
    ]);
  });

  it("keeps one row per family and requires the licence", async () => {
    await db.query(FONT);
    expect(await errorCode(db.query(FONT))).toBe("23505");
    expect(
      await errorCode(
        db.query(
          FONT.replace("Fraunces", "Lora").replace(
            "'Copyright 2020 The Fraunces Project Authors ...'",
            "'   '",
          ),
        ),
      ),
    ).toBe("23514");
    expect(await errorCode(db.query(FONT.replace("'serif'", "'script'")))).toBe("23514");
  });
});

describe("generated data is immutable", () => {
  it("rejects every change to a design except selected_at, for every role", async () => {
    for (const set of [
      "name = 'Renamed'",
      "description = 'Other'",
      "round = 2",
      "shape = 'oval'",
      "layout = 'framed'",
      "art_mode = 'framed'",
      `typography = '{"primary":"hc_bodoni_inter","alternates":[]}'`,
      `wording = '{"title":"Hi","invitationLine":"Come along to the party"}'`,
      `art_brief = '{}'`,
      `raw = '{}'`,
      "standard_wording_slots = '{title}'",
      `versions = '{"compiler":"card_compiler_v2"}'`,
      "created_at = now() - interval '1 day'",
      `event_id = '${otherEventId}'`,
    ]) {
      const err = await pgError(
        asActor(db, { kind: "service" }, (q) =>
          q(`update public.card_designs set ${set} where id = $1`, [designId]),
        ),
      );
      expect(err?.code, set).toBe("42501");
      expect(err?.message, set).toBe("card designs are immutable; only selected_at may change");
    }
    const selected = await asActor(db, { kind: "service" }, (q) =>
      q(`update public.card_designs set selected_at = now() where id = $1 returning selected_at`, [
        designId,
      ]),
    );
    expect(selected.rows[0].selected_at).not.toBeNull();
  });

  it("rejects every change to artwork, for every role", async () => {
    for (const set of [
      "storage_key = 'swapped.png'",
      `ink = '{"rectangle":{},"rounded-rectangle":{},"arch":{},"oval":{}}'`,
      "fits_shapes = '{rectangle}'",
      "image_model = 'other'",
    ]) {
      const err = await pgError(
        asActor(db, { kind: "service" }, (q) =>
          q(`update public.card_art_assets set ${set} where card_design_id = $1`, [designId]),
        ),
      );
      expect(err, set).toEqual({
        code: "42501",
        message: "card artwork is immutable",
        detail: undefined,
      });
    }
  });

  it("never deletes a design or its artwork while the event exists", async () => {
    expect(
      await errorCode(
        asActor(db, { kind: "service" }, (q) =>
          q(`delete from public.card_art_assets where card_design_id = $1`, [designId]),
        ),
      ),
    ).toBe("42501");
    expect(
      await errorCode(
        asActor(db, { kind: "service" }, (q) =>
          q(`delete from public.card_designs where id = $1`, [designId]),
        ),
      ),
    ).toBe("42501");
  });

  it("cannot be truncated by server code, which would skip the row triggers", async () => {
    for (const sql of [
      `truncate public.card_art_assets`,
      `truncate public.card_designs cascade`,
      `truncate public.events cascade`,
    ]) {
      expect(await errorCode(asActor(db, { kind: "service" }, (q) => q(sql))), sql).toBe("42501");
    }
  });
});

describe("design and artwork integrity", () => {
  it("one design per round, and only known shapes, layouts, art modes and wording slots", async () => {
    expect(await errorCode(insertCardDesign(db, eventId, { round: 1 }))).toBe("23505");
    expect(await errorCode(insertCardDesign(db, eventId, { round: 2, shape: "hexagon" }))).toBe(
      "22P02",
    );
    expect(await errorCode(insertCardDesign(db, eventId, { round: 2, layout: "sidebar" }))).toBe(
      "22P02",
    );
    expect(await errorCode(insertCardDesign(db, eventId, { round: 2, artMode: "photo" }))).toBe(
      "22P02",
    );
    expect(
      await errorCode(
        db.query(
          `update public.card_designs set standard_wording_slots = '{venue}' where id = $1`,
          [designId],
        ),
      ),
    ).toBe("42501"); // immutable before the check even runs
    const second = await insertCardDesign(db, eventId, { round: 2, shape: "square" });
    expect(second).toBeTruthy();
  });

  it("artwork fits only shapes of its own proportion and carries ink for each of them", async () => {
    expect(
      await errorCode(
        insertCardArt(db, eventId, designId, {
          proportion: "portrait_5_7",
          fitsShapes: ["rectangle", "circle"],
        }),
      ),
    ).toBe("23514");
    expect(
      await errorCode(
        insertCardArt(db, eventId, designId, { proportion: "square_1_1", fitsShapes: ["oval"] }),
      ),
    ).toBe("23514");
    expect(
      await errorCode(
        insertCardArt(db, eventId, designId, { proportion: "square_1_1", fitsShapes: [] }),
      ),
    ).toBe("23514");
    // Ink missing for a fitted shape.
    expect(
      await errorCode(
        db.query(
          `insert into public.card_art_assets (event_id, card_design_id, proportion, fits_shapes,
             storage_key, mime_type, width, height, size_bytes, ink, image_model, art_prompt_version)
           values ($1, $2, 'square_1_1', '{square,circle}', 'k.png', 'image/png', 1440, 1440, 1,
             '{"square":{}}', 'm', 'v')`,
          [eventId, designId],
        ),
      ),
    ).toBe("23514");
    await insertCardArt(db, eventId, designId, {
      proportion: "square_1_1",
      fitsShapes: ["square", "circle"],
    });
  });

  it("artwork belongs to a design of the same event", async () => {
    expect(await errorCode(insertCardArt(db, otherEventId, designId))).toBe("23503");
  });
});

describe("the event's active design and shape", () => {
  it("references a design of the same event only", async () => {
    const theirs = await insertCardDesign(db, otherEventId);
    expect(
      await errorCode(
        db.query(`update public.events set active_card_design_id = $1 where id = $2`, [
          theirs,
          eventId,
        ]),
      ),
    ).toBe("23503");
    const ok = await asActor(db, { kind: "service" }, (q) =>
      q(
        `update public.events set active_card_design_id = $1 where id = $2
         returning active_card_design_id, active_card_shape`,
        [designId, eventId],
      ),
    );
    expect(ok.rows[0]).toEqual({ active_card_design_id: designId, active_card_shape: null });
  });

  it("holds one of the six shapes, and only alongside a design", async () => {
    expect(
      await errorCode(
        db.query(`update public.events set active_card_shape = 'oval' where id = $1`, [eventId]),
      ),
    ).toBe("23514");
    await db.query(`update public.events set active_card_design_id = $1 where id = $2`, [
      designId,
      eventId,
    ]);
    expect(
      await errorCode(
        db.query(`update public.events set active_card_shape = 'hexagon' where id = $1`, [eventId]),
      ),
    ).toBe("22P02");
    for (const shape of ["rectangle", "rounded-rectangle", "arch", "oval", "square", "circle"]) {
      await db.query(`update public.events set active_card_shape = $1 where id = $2`, [
        shape,
        eventId,
      ]);
    }
    await db.query(`update public.events set active_card_shape = null where id = $1`, [eventId]);
  });

  it("is switched by server code only", async () => {
    for (const set of [`active_card_design_id = '${designId}'`, "active_card_shape = 'oval'"]) {
      for (const actor of [OWNER(), COHOST()]) {
        expect(
          await errorCode(
            asActor(db, actor, (q) =>
              q(`update public.events set ${set} where id = $1`, [eventId]),
            ),
          ),
          set,
        ).toBe("42501");
      }
    }
  });
});

describe("save_card_customization", () => {
  it("creates at revision 1, then updates only from the revision it was based on", async () => {
    expect(await save(OWNER(), 0)).toBe(1);
    expect(await customization()).toEqual({
      revision: 1,
      boxes: JSON.parse(BOXES),
      updated_by: owner,
    });
    expect(await save(COHOST(), 1, { boxes: SEED })).toBe(2);
    expect(await customization()).toEqual({
      revision: 2,
      boxes: JSON.parse(SEED),
      updated_by: cohost,
    });
  });

  it("refuses a stale save with PT409 and reports the current revision", async () => {
    await save(OWNER(), 0);
    await save(COHOST(), 1);
    const stale = await pgError(save(OWNER(), 1));
    expect(stale).toEqual({
      code: "PT409",
      message: "card customization revision is stale",
      detail: "current revision: 2",
    });
    // A second create for the same design and shape is stale too: someone else created it first.
    expect(await pgError(save(OWNER(), 0))).toMatchObject({
      code: "PT409",
      detail: "current revision: 2",
    });
    // So is an update of a customization that does not exist.
    expect(await pgError(save(OWNER(), 3, { shape: "oval" }))).toMatchObject({
      code: "PT409",
      detail: "current revision: none",
    });
    expect((await customization())?.revision).toBe(2);
  });

  it("treats Reset card as a new revision, so a collaborator's stale save is still refused", async () => {
    await save(OWNER(), 0);
    expect(await save(OWNER(), 1)).toBe(2);
    // The co-host loaded revision 2; the owner resets (re-applies the seed) meanwhile.
    expect(await save(OWNER(), 2, { boxes: SEED })).toBe(3);
    expect(await pgError(save(COHOST(), 2))).toMatchObject({ code: "PT409" });
    expect(await customization()).toMatchObject({ revision: 3, boxes: JSON.parse(SEED) });
  });

  it("keeps one customization per event × design × shape, each with its own revisions", async () => {
    expect(await save(OWNER(), 0, { shape: "rectangle" })).toBe(1);
    expect(await save(OWNER(), 0, { shape: "oval" })).toBe(1);
    expect(await save(OWNER(), 1, { shape: "oval" })).toBe(2);
    expect((await customization("rectangle"))?.revision).toBe(1);
    expect(
      await errorCode(
        db.query(
          `insert into public.card_customizations (event_id, card_design_id, shape, boxes)
           values ($1, $2, 'rectangle', '[]')`,
          [eventId, designId],
        ),
      ),
    ).toBe("23505");
  });

  it("only the event's owner and co-hosts may save", async () => {
    const err = await pgError(save(STRANGER(), 0));
    expect(err?.code).toBe("42501");
    expect(await errorCode(save({ kind: "anon" }, 0))).toBe("42501");
    // Server code edits customizations directly, never through the end-user function.
    expect(await errorCode(save({ kind: "service" }, 0))).toBe("42501");
    expect(await customization()).toBeUndefined();
  });

  it("refuses a design from another event, even one the caller can edit", async () => {
    await db.query(
      `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'cohost')`,
      [otherEventId, owner],
    );
    const theirs = await insertCardDesign(db, otherEventId);
    await insertCardArt(db, otherEventId, theirs);
    expect(await pgError(save(OWNER(), 0, { design: theirs }))).toMatchObject({
      code: "23514",
      message: "the design does not belong to this event",
    });
    expect(
      await errorCode(save(OWNER(), 0, { design: "00000000-0000-0000-0000-000000000000" })),
    ).toBe("23514");
  });

  it("validates the shape, the boxes and the expected revision", async () => {
    for (const [label, args] of [
      ["unknown shape", { shape: "hexagon" }],
      ["null shape", { shape: null }],
      // The design's only artwork is portrait: a square shape is a generation first.
      ["shape without artwork", { shape: "square" }],
      ["boxes not an array", { boxes: '{"id":"title"}' }],
      ["boxes not objects", { boxes: '["title", 3]' }],
      ["null boxes", { boxes: null }],
    ] as const) {
      expect(await errorCode(save(OWNER(), 0, args)), label).toBe("22023");
    }
    expect(await errorCode(save(OWNER(), -1))).toBe("22023");
    await insertCardArt(db, eventId, designId, {
      proportion: "square_1_1",
      fitsShapes: ["square"],
    });
    expect(await save(OWNER(), 0, { shape: "square" })).toBe(1);
  });

  it("bounds the stored text layer", async () => {
    const huge = JSON.stringify([{ id: "x", text: "a".repeat(300_000) }]);
    expect(await errorCode(save(OWNER(), 0, { boxes: huge }))).toBe("23514");
  });

  it("bumps the revision on server writes too, so an editor holding the old one reloads", async () => {
    await save(OWNER(), 0);
    // A fact edit re-breaks this customization's fact boxes server-side (card-system §7).
    const bumped = await asActor(
      db,
      { kind: "service" },
      (q) =>
        q(
          `update public.card_customizations set boxes = $1::jsonb, revision = 1
           where event_id = $2 returning revision`,
          [SEED, eventId],
        ),
      { commit: true },
    );
    expect(bumped.rows[0].revision).toBe(2); // a supplied revision is overwritten
    expect(await pgError(save(COHOST(), 1))).toMatchObject({ code: "PT409" });
  });

  it("does not stale open editors when the last editor's profile is deleted", async () => {
    await save(OWNER(), 0);
    expect(await save(COHOST(), 1)).toBe(2);
    await db.query(`delete from auth.users where id = $1`, [cohost]);
    expect(await customization()).toMatchObject({ revision: 2, updated_by: null });
    expect(await save(OWNER(), 2)).toBe(3);
  });

  it("never moves a customization to another design or shape", async () => {
    await save(OWNER(), 0);
    const second = await insertCardDesign(db, eventId, { round: 2 });
    for (const set of [`shape = 'oval'`, `card_design_id = '${second}'`]) {
      expect(await errorCode(db.query(`update public.card_customizations set ${set}`)), set).toBe(
        "42501",
      );
    }
  });

  it("serializes concurrent saves from the same revision: one wins, the other is stale", async () => {
    await save(OWNER(), 0);
    const other = new Client({ connectionString: databaseUrl() });
    await other.connect();
    try {
      // The owner's save holds the row lock, uncommitted.
      await db.query("begin");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: owner, role: "authenticated" }),
      ]);
      await db.query("set local role authenticated");
      const first = await db.query(
        `select public.save_card_customization($1, $2, 'rectangle', $3::jsonb, 1) as revision`,
        [eventId, designId, SEED],
      );
      expect(first.rows[0].revision).toBe(2);

      // The co-host's save from the same revision waits on the lock ...
      await other.query("begin");
      await other.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: cohost, role: "authenticated" }),
      ]);
      await other.query("set local role authenticated");
      const second = pgError(
        other.query(
          `select public.save_card_customization($1, $2, 'rectangle', $3::jsonb, 1) as revision`,
          [eventId, designId, BOXES],
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      await db.query("commit");
      // ... and once the owner commits, finds revision 2 and is refused.
      expect(await second).toMatchObject({ code: "PT409", detail: "current revision: 2" });
      await other.query("rollback");
    } finally {
      await other.end();
    }
    expect(await customization()).toMatchObject({ revision: 2, boxes: JSON.parse(SEED) });
  });
});

describe("deleting the event", () => {
  it("cascades to its designs, artwork and customizations, and touches no other event", async () => {
    await save(OWNER(), 0);
    await db.query(`update public.events set active_card_design_id = $1 where id = $2`, [
      designId,
      eventId,
    ]);
    const theirs = await insertCardDesign(db, otherEventId);
    await insertCardArt(db, otherEventId, theirs);
    const deleted = await asActor(
      db,
      OWNER(),
      (q) => q(`delete from public.events where id = $1`, [eventId]),
      { commit: true },
    );
    expect(deleted.rowCount).toBe(1);
    const { rows } = await db.query(
      `select (select array_agg(event_id) from public.card_designs) as designs,
              (select array_agg(event_id) from public.card_art_assets) as art,
              (select count(*) from public.card_customizations)::int as customizations`,
    );
    expect(rows[0]).toEqual({ designs: [otherEventId], art: [otherEventId], customizations: 0 });
  });
});
