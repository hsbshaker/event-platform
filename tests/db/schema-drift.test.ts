/**
 * The TypeScript database contract against the schema the migrations actually apply.
 *
 * `database.types.ts` is hand-authored, and until this existed nothing held it to the migrations.
 * It drifted badly: the entire Phase 4B surface — `event_identity_revisions`,
 * `clarification_answers`, `events.authoritative_identity_revision_id`,
 * `generation_runs.input_assembly_version` and two functions — was live in the database and absent
 * from the contract. That is the class of gap this closes, in both directions: a column in the
 * database and not the contract, and a column in the contract and not the database.
 *
 * It compares `SCHEMA_MANIFEST`, whose every entry the compiler ties to a `Row` type, against
 * `information_schema` on a freshly migrated database. So a migration that adds a column fails
 * here until the column reaches both the manifest and the row type.
 *
 * Acceptance criteria: N/A — internal contract integrity. `docs/technology-decisions.md §3`.
 */
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GENERATED_COLUMNS, SCHEMA_MANIFEST } from "@/lib/supabase/schema-manifest";

import { connect, resetDatabase } from "./harness";

let db: Client;

beforeAll(async () => {
  db = await connect();
  await resetDatabase(db);
}, 120_000);

afterAll(async () => {
  await db?.end();
});

describe("the database contract matches the applied migrations", () => {
  it("declares every public table, and no table the migrations do not create", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual(Object.keys(SCHEMA_MANIFEST).sort());
  });

  it.each(Object.keys(SCHEMA_MANIFEST))("declares exactly %s's columns", async (table) => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = $1
       order by column_name`,
      [table],
    );
    const declared = [...SCHEMA_MANIFEST[table as keyof typeof SCHEMA_MANIFEST]].sort();
    expect(
      rows.map((r) => r.column_name),
      `${table} has drifted: the database and src/lib/supabase/database.types.ts disagree about ` +
        "its columns. Update the row type and the manifest together — do not change the migration " +
        "to make the types easier.",
    ).toEqual(declared);
  });

  it("agrees with the database about which columns it generates", async () => {
    const { rows } = await db.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' and is_generated = 'ALWAYS'
       order by table_name, column_name`,
    );
    const live = rows.map((r) => `${r.table_name}.${r.column_name}`);
    const declared = Object.entries(GENERATED_COLUMNS).flatMap(([table, columns]) =>
      (columns as readonly string[]).map((column) => `${table}.${column}`),
    );
    expect(live.sort()).toEqual(declared.sort());
  });

  it("refuses an insert that supplies a generated column, as the contract's Insert shape says", async () => {
    // The contract omits `is_provisional` from `Insert` rather than marking it optional. This is
    // the runtime half of that claim: Postgres rejects the write outright (SQLSTATE 428C9), so the
    // type is describing a real refusal rather than a convention.
    const owner = (
      await db.query<{ id: string }>(
        `insert into auth.users (id, email) values (gen_random_uuid(), 'drift@example.com')
         returning id`,
      )
    ).rows[0].id;
    const event = (
      await db.query<{ id: string }>(
        `insert into public.events (owner_id, type, prompt) values ($1, 'baby_shower', 'a party')
         returning id`,
        [owner],
      )
    ).rows[0].id;
    await expect(
      db.query(
        `insert into public.event_identity_revisions
           (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
            provider, model, is_provisional)
         values ($1, 1, '{}'::jsonb, 'p', 'event_identity_schema_v5', 'event_identity_input_v2',
                 'openai', 'm', false)`,
        [event],
      ),
    ).rejects.toMatchObject({ code: "428C9" });
  });

  it("declares the Phase 4B functions the contract exposes", async () => {
    // Trigger functions are not part of the callable surface and are deliberately not declared;
    // these two are ordinary functions that application code and RLS both read through.
    const { rows } = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('identity_questions', 'identity_is_provisional')
         and pg_get_function_result(p.oid) <> 'trigger'
       order by p.proname`,
    );
    expect(rows.map((r) => r.proname)).toEqual(["identity_is_provisional", "identity_questions"]);
  });
});
