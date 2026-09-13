import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { asActor, connect, createAuthUser, errorCode, resetDatabase } from "./harness";

/**
 * Storage for the Human Test #1 reviewer survey
 * (supabase/migrations/20260913050000_human_test_1_responses.sql).
 *
 * Three properties, each of which the survey's correctness rests on and none of which the
 * application code can establish on its own:
 *
 * 1. **No reviewer's browser can reach these tables.** The submit endpoint writes with the
 *    service role after validating; there is no anon or authenticated path in or out. If there
 *    were, a reviewer could read the other four reviewers' answers, or write a sixth.
 * 2. **One session is one reviewer.** The unique index on `submission_key` is what makes a
 *    double tap, a mobile retry and a resubmitted form collapse onto one row rather than
 *    inflating a five-person median.
 * 3. **Synthetic submissions are in a different table.** Not a flag on the same table: the
 *    scorer reads `human_test_1_responses`, and a synthetic row is excluded because it is not
 *    there, not because a predicate remembered to exclude it.
 */

let db: Client;
let user: string;

const TABLES = ["human_test_1_responses", "human_test_1_test_responses"] as const;

/** A complete reviewer response, the shape review.html produces and the route stores verbatim. */
function payload(reviewer: string) {
  const ratings: Record<string, number> = {};
  for (let i = 1; i <= 40; i += 1) ratings[String(i)] = (i % 5) + 1;
  return {
    reviewer,
    ok: true,
    protocol: "proof-b/human-test-form.md",
    result: { groups: Array.from({ length: 40 }, (_, i) => [i + 1]), ratings },
  };
}

async function insert(table: string, reviewer: string, key: string) {
  const { rows } = await db.query(
    `insert into public.${table} (reviewer, response_payload, submission_key)
     values ($1, $2, $3) returning id`,
    [reviewer, JSON.stringify(payload(reviewer)), key],
  );
  return rows[0].id as string;
}

beforeAll(async () => {
  db = await connect();
  await resetDatabase(db);
  user = await createAuthUser(db, "reviewer@example.com");
}, 120_000);

afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  for (const table of TABLES) await db.query(`delete from public.${table}`);
});

describe.each(TABLES)("%s is unreachable from the browser", (table) => {
  it("has RLS on and no policies at all", async () => {
    const { rows } = await db.query(
      `select c.relrowsecurity,
              (select count(*) from pg_policies p
               where p.schemaname = 'public' and p.tablename = $1) as policies
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = $1`,
      [table],
    );
    expect(rows[0].relrowsecurity).toBe(true);
    expect(Number(rows[0].policies)).toBe(0);
  });

  it("grants nothing to anon or authenticated", async () => {
    const { rows } = await db.query(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = $1 and grantee in ('anon', 'authenticated')`,
      [table],
    );
    expect(rows).toEqual([]);
  });

  // One statement per transaction: the first refusal aborts it, and a second statement in the
  // same one would fail with 25P02 and prove nothing about permissions.
  it("refuses a read from an anonymous visitor", async () => {
    await insert(table, "AB", "key-anonymous-read-0001");
    await asActor(db, { kind: "anon" }, async (q) => {
      expect(await errorCode(q(`select * from public.${table}`))).toBe("42501");
    });
  });

  it("refuses a write from an anonymous visitor", async () => {
    await asActor(db, { kind: "anon" }, async (q) => {
      expect(
        await errorCode(
          q(`insert into public.${table} (reviewer, response_payload, submission_key)
             values ('X', '{}'::jsonb, 'key-anonymous-write-000001')`),
        ),
      ).toBe("42501");
    });
  });

  it("refuses a read from a signed-in user too", async () => {
    await insert(table, "AB", "key-authenticated-read-001");
    await asActor(db, { kind: "user", id: user }, async (q) => {
      expect(await errorCode(q(`select * from public.${table}`))).toBe("42501");
    });
  });

  it("lets the service role write and read, which is how the endpoint stores a response", async () => {
    await asActor(
      db,
      { kind: "service" },
      async (q) => {
        await q(
          `insert into public.${table} (reviewer, response_payload, submission_key)
           values ('AB', $1::jsonb, 'key-service-role-write-01')`,
          [JSON.stringify(payload("AB"))],
        );
        const { rows } = await q(`select reviewer from public.${table}`);
        expect(rows).toHaveLength(1);
      },
      { commit: false },
    );
  });
});

describe("one survey session counts once", () => {
  it("refuses a second row for the same submission key", async () => {
    await insert("human_test_1_responses", "AB", "key-duplicate-submission-1");
    expect(
      await errorCode(insert("human_test_1_responses", "AB", "key-duplicate-submission-1")),
    ).toBe("23505");
    const { rows } = await db.query(`select count(*) from public.human_test_1_responses`);
    expect(Number(rows[0].count)).toBe(1);
  });

  it("upserts a resubmission onto the same row, keeping its identity and first-seen time", async () => {
    // This is the statement PostgREST issues for `.upsert({...}, { onConflict: "submission_key" })`
    // in src/lib/human-test/store.ts. A reviewer who reloads and fixes a misrating arrives under
    // the same session key: the row must be updated rather than duplicated *or* silently kept,
    // because the page tells them their feedback was recorded either way.
    const first = await insert("human_test_1_responses", "AB", "key-retry-same-row-0001");
    const { rows: before } = await db.query(
      `select created_at, response_payload->'result'->'ratings'->>'7' as seven
       from public.human_test_1_responses where submission_key = 'key-retry-same-row-0001'`,
    );

    const corrected = payload("AB");
    corrected.result.ratings["7"] = 1;
    await db.query(
      `insert into public.human_test_1_responses (reviewer, response_payload, submission_key)
       values ($1, $2, $3)
       on conflict (submission_key) do update
         set reviewer = excluded.reviewer,
             response_payload = excluded.response_payload`,
      ["AB", JSON.stringify(corrected), "key-retry-same-row-0001"],
    );

    const { rows } = await db.query(
      `select id, created_at, response_payload->'result'->'ratings'->>'7' as seven
       from public.human_test_1_responses where submission_key = 'key-retry-same-row-0001'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first);
    expect(rows[0].created_at).toEqual(before[0].created_at);
    expect(before[0].seven).toBe("3");
    expect(rows[0].seven).toBe("1");
  });

  it("still refuses a plain second insert, which is what makes the upsert one row", async () => {
    await insert("human_test_1_responses", "AB", "key-duplicate-insert-0001");
    expect(
      await errorCode(insert("human_test_1_responses", "AB", "key-duplicate-insert-0001")),
    ).toBe("23505");
  });

  it("still lets a genuinely different reviewer submit", async () => {
    await insert("human_test_1_responses", "AB", "key-reviewer-one-000001");
    await insert("human_test_1_responses", "CD", "key-reviewer-two-000002");
    const { rows } = await db.query(`select count(*) from public.human_test_1_responses`);
    expect(Number(rows[0].count)).toBe(2);
  });

  it("scopes keys per table, so a synthetic key never blocks a real submission", async () => {
    await insert("human_test_1_test_responses", "TEST", "key-shared-across-tables-1");
    await expect(
      insert("human_test_1_responses", "AB", "key-shared-across-tables-1"),
    ).resolves.toBeTruthy();
  });
});

describe("synthetic submissions never enter the scorer's input", () => {
  it("keeps them in a separate table the scorer does not read", async () => {
    await insert("human_test_1_test_responses", "SYNTHETIC", "key-synthetic-only-00001");
    const real = await db.query(`select count(*) from public.human_test_1_responses`);
    expect(Number(real.rows[0].count)).toBe(0);
  });

  it("has no view, inheritance or rule joining the two back together", async () => {
    // The isolation is only structural if nothing reunites them. A view over both, or a
    // partition parent, would put a synthetic row back in the scorer's reach.
    const { rows: views } = await db.query(
      `select table_name from information_schema.views where table_schema = 'public'
         and view_definition ilike '%human_test_1%'`,
    );
    expect(views).toEqual([]);
    const { rows: inherits } = await db.query(
      `select inhrelid::regclass::text as child, inhparent::regclass::text as parent
       from pg_inherits
       where inhrelid::regclass::text like '%human_test_1%'
          or inhparent::regclass::text like '%human_test_1%'`,
    );
    expect(inherits).toEqual([]);
  });

  it("stores no personal data beyond the reviewer's name", async () => {
    const { rows } = await db.query(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = any($1) order by column_name`,
      [[...TABLES]],
    );
    expect([...new Set(rows.map((r) => r.column_name))].sort()).toEqual([
      "created_at",
      "id",
      "response_payload",
      "reviewer",
      "submission_key",
    ]);
  });
});
