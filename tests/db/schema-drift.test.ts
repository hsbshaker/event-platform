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
import { readFileSync } from "node:fs";

import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import { GENERATED_COLUMNS, SCHEMA_MANIFEST } from "@/lib/supabase/schema-manifest";

import { connect, resetDatabase } from "./harness";

/**
 * The contract's own function surface, as a runtime value.
 *
 * Declared here rather than imported because `Database` is types only. A key added or removed in
 * `database.types.ts` and not here fails the compile below, so this cannot drift from it silently.
 */
const DECLARED_FUNCTIONS = {
  attach_inspiration_asset: true,
  bind_draft_claim_email: true,
  capture_identity_call_response: true,
  claim_draft_locked: true,
  claim_identity_call: true,
  claim_pre_auth_draft: true,
  claim_pre_auth_draft_by_email: true,
  complete_identity_call: true,
  consume_rate_limit: true,
  event_role: true,
  expire_identity_call_claims: true,
  fail_identity_call_recovery: true,
  generation_batch_is_in_flight: true,
  issue_batch_sibling: true,
  plan_generation_batch: true,
  record_batch_call_run: true,
  record_batch_sibling_run: true,
  settle_generation_batch: true,
  start_generation_batch: true,
  expired_pre_auth_draft_batch: true,
  expired_pre_auth_storage_keys: true,
  identity_budget_lock_key: true,
  identity_claim_is_terminal: true,
  identity_is_provisional: true,
  identity_questions: true,
  is_end_user_request: true,
  mark_identity_call_invoked: true,
  pending_identity_call_completions: true,
  is_event_member: true,
  is_event_owner: true,
  purge_expired_pre_auth_state: true,
  reclaim_uninvoked_identity_claims: true,
  purge_identity_response_evidence: true,
  purge_pre_auth_drafts: true,
  purge_stale_rate_limits: true,
} satisfies Record<keyof Database["public"]["Functions"], true>;

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

  it("declares every callable public function, or names it as a deliberate omission", async () => {
    // The direction the first version of this test missed. `claim_draft_locked` and
    // `is_end_user_request` had been live and undeclared since Phase 2 — the same class of gap as
    // `pre_auth_event_drafts.claim_email`, and found the same way once the check ran both ways.
    // Trigger functions are not callable and are not part of the contract's surface.
    const { rows } = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and pg_get_function_result(p.oid) <> 'trigger'
       order by p.proname`,
    );
    const live = [...new Set(rows.map((r) => r.proname))].sort();
    const declared = Object.keys(DECLARED_FUNCTIONS).sort();
    expect(
      live,
      'a callable public function is missing from Database["public"]["Functions"] in ' +
        "src/lib/supabase/database.types.ts, or one is declared that no longer exists.",
    ).toEqual(declared);
  });

  it("declares the Phase 4B functions the contract exposes", async () => {
    // Trigger functions are not part of the callable surface and are deliberately not declared.
    // These two are ordinary functions; nothing in RLS references them — their callers are the
    // generated column and the triggers that guard the authority pointer and the answers.
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

/**
 * Nullability, read out of the contract itself rather than a second hand-written list.
 *
 * The column-name check above is only half the drift that matters. A column typed `string` that
 * the database allows to be null is exactly the bug T10 would hit — reading a row and trusting a
 * value that is not there — and no amount of name-matching finds it.
 *
 * The expectation is parsed from `database.types.ts`, deliberately, because that file *is* the
 * claim under test. A third artifact listing nullable columns by hand would be one more thing to
 * get wrong, and getting it wrong would make this pass. The parse is held honest by comparing the
 * columns it found against the manifest: a parse that silently matched nothing fails loudly
 * instead of reporting agreement.
 */
describe("the contract's nullability matches the database's", () => {
  const CONTRACT = readFileSync(
    new URL("../../src/lib/supabase/database.types.ts", import.meta.url).pathname,
    "utf8",
  );

  /** `{ column: isNullable }` for one `type XRow = { … }` block. */
  function declaredNullability(rowType: string): Record<string, boolean> {
    const block = new RegExp(`^type ${rowType} = \\{([\\s\\S]*?)^\\};`, "m").exec(CONTRACT);
    expect(block, `no ${rowType} in the contract`).not.toBeNull();
    const body = block![1].replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const out: Record<string, boolean> = {};
    for (const line of body.split("\n")) {
      const m = /^\s{2}([a-z_0-9]+)\??:\s*(.+);\s*$/.exec(line);
      if (m) out[m[1]] = /\bnull\b/.test(m[2]);
    }
    return out;
  }

  const ROW_TYPES: Record<keyof typeof SCHEMA_MANIFEST, string> = {
    profiles: "ProfileRow",
    events: "EventRow",
    event_members: "EventMemberRow",
    pre_auth_event_drafts: "PreAuthEventDraftRow",
    inspiration_assets: "InspirationAssetRow",
    event_identities: "EventIdentityRow",
    design_intent_artifacts: "DesignIntentArtifactRow",
    design_concepts: "DesignConceptRow",
    resolved_design_specs: "ResolvedDesignSpecRow",
    event_identity_revisions: "EventIdentityRevisionRow",
    clarification_answers: "ClarificationAnswerRow",
    generation_runs: "GenerationRunRow",
    event_identity_call_claims: "EventIdentityCallClaimRow",
    generation_batches: "GenerationBatchRow",
    generation_batch_siblings: "GenerationBatchSiblingRow",
    rate_limits: "RateLimitRow",
    human_test_1_responses: "HumanTest1ResponseRow",
    human_test_1_test_responses: "HumanTest1ResponseRow",
  };

  it.each(Object.keys(SCHEMA_MANIFEST))(
    "agrees about which of %s's columns can be null",
    async (table) => {
      const declared = declaredNullability(ROW_TYPES[table as keyof typeof ROW_TYPES]);
      // The parse is checked before it is trusted.
      expect(Object.keys(declared).sort()).toEqual(
        [...SCHEMA_MANIFEST[table as keyof typeof SCHEMA_MANIFEST]].sort(),
      );

      const { rows } = await db.query<{ column_name: string; is_nullable: string }>(
        `select column_name, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = $1`,
        [table],
      );
      const live = Object.fromEntries(rows.map((r) => [r.column_name, r.is_nullable === "YES"]));
      const disagreements = Object.keys(live)
        .filter((column) => live[column] !== declared[column])
        .map((column) => `${column}: database ${live[column]}, contract ${declared[column]}`);
      expect(
        disagreements,
        `${table}'s nullability has drifted. A column the database can leave null but the contract ` +
          "types as non-null is the bug this exists to prevent: code reads it and trusts a value " +
          "that is not there.",
      ).toEqual([]);
    },
  );
});
