import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asActor, connect, createAuthUser, errorCode, resetDatabase } from "./harness";

let db: Client;
let owner: string;
let cohost: string;
let stranger: string;
let eventId: string;

const CONCEPT_VERSIONS = `
  design_intent_prompt_version, design_intent_schema_version,
  composition_prompt_version, composition_schema_version,
  primitive_set_version, compiler_version`;
const CONCEPT_VERSION_VALUES = `'design_intent_v3','design_intent_schema_v3','composition_v1_p2','composition_schema_v1','composition_v1','compiler_v0'`;

async function insertConcept(index = 0, round = 1): Promise<string> {
  const { rows } = await db.query(
    `insert into public.design_concepts
       (event_id, round, concept_index, name, description, design_intent, composition_raw,
        composition, composition_hash, capabilities, ${CONCEPT_VERSIONS})
     values ($1, $2, $3, 'Concept', 'A direction', '{"family":"editorial"}', '{"version":"composition_v1","sections":[]}',
        '{"version":"composition_v1","sections":[]}', $4, '{"rsvp":true}', ${CONCEPT_VERSION_VALUES})
     returning id`,
    [eventId, round, index, `hash-${index}`],
  );
  return rows[0].id as string;
}

async function insertSpec(conceptId: string, revision = 1, supersedes: string | null = null) {
  const { rows } = await db.query(
    `insert into public.resolved_design_specs
       (concept_id, revision, spec, content_version, supersedes_spec_id, verified_clean, compiler_version, primitive_set_version)
     values ($1, $2, '{"version":"resolved_v2"}', $2, $3, true, 'compiler_v0', 'composition_v1')
     returning id`,
    [conceptId, revision, supersedes],
  );
  return rows[0].id as string;
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
    "truncate public.events, public.pre_auth_event_drafts, public.rate_limits cascade; delete from auth.users",
  );
  owner = await createAuthUser(db, "owner@example.com", "Owner One");
  cohost = await createAuthUser(db, "cohost@example.com");
  stranger = await createAuthUser(db, "stranger@example.com");
  const { rows } = await db.query(
    `insert into public.events (owner_id, prompt) values ($1, 'A garden baby shower') returning id`,
    [owner],
  );
  eventId = rows[0].id;
  await db.query(
    `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'cohost')`,
    [eventId, cohost],
  );
});

describe("account linkage", () => {
  it("creates a profile for every auth user with name from metadata", async () => {
    const { rows } = await db.query(`select id, email, name from public.profiles order by email`);
    expect(rows).toEqual([
      { id: cohost, email: "cohost@example.com", name: null },
      { id: owner, email: "owner@example.com", name: "Owner One" },
      { id: stranger, email: "stranger@example.com", name: null },
    ]);
  });

  it("lets users read and edit only their own profile", async () => {
    const mine = await asActor(db, { kind: "user", id: owner }, (q) =>
      q(`select id from public.profiles`),
    );
    expect(mine.rows.map((r) => r.id)).toEqual([owner]);
    const updated = await asActor(db, { kind: "user", id: owner }, (q) =>
      q(`update public.profiles set name = 'Renamed' where id = $1 returning name`, [cohost]),
    );
    expect(updated.rowCount).toBe(0);
    expect(
      await errorCode(
        asActor(db, { kind: "user", id: owner }, (q) => q(`delete from public.profiles`)),
      ),
    ).toBe("42501");
    const renamed = await asActor(db, { kind: "user", id: owner }, (q) =>
      q(`update public.profiles set name = 'Me' where id = $1 returning name`, [owner]),
    );
    expect(renamed.rows[0].name).toBe("Me");
    expect(
      await errorCode(
        asActor(db, { kind: "user", id: owner }, (q) =>
          q(`update public.profiles set email = 'other@example.com' where id = $1`, [owner]),
        ),
      ),
    ).toBe("42501");
  });
});

describe("events and membership", () => {
  it("creates the owner membership with the event and pins exactly one owner", async () => {
    const { rows } = await db.query(
      `select user_id, role from public.event_members where event_id = $1 order by role::text`,
      [eventId],
    );
    expect(rows).toEqual([
      { user_id: cohost, role: "cohost" },
      { user_id: owner, role: "owner" },
    ]);
    expect(
      await errorCode(
        db.query(
          `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'owner')`,
          [eventId, stranger],
        ),
      ),
    ).toBe("42501"); // trigger: owner row must match events.owner_id
    expect(
      await errorCode(
        db.query(
          `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'owner')`,
          [eventId, owner],
        ),
      ),
    ).toBe("23505"); // primary key / one-owner index
  });

  it("no end user can insert an event; server code creates them from a claimed draft", async () => {
    // Phase 2 moved creation behind claim_pre_auth_draft (spec.md §7.2 step 5), so the
    // end-user INSERT grant is gone. Both an honest insert and a spoofed owner are refused.
    for (const [label, ownerId] of [
      ["own", stranger],
      ["spoofed", owner],
    ] as const) {
      expect(
        await errorCode(
          asActor(db, { kind: "user", id: stranger }, (q) =>
            q(`insert into public.events (owner_id, prompt) values ($1, 'direct') returning id`, [
              ownerId,
            ]),
          ),
        ),
        label,
      ).toBe("42501");
    }
    const viaServer = await asActor(db, { kind: "service" }, (q) =>
      q(
        `insert into public.events (owner_id, prompt) values ($1, 'server made') returning status`,
        [stranger],
      ),
    );
    expect(viaServer.rows[0].status).toBe("DRAFT");
  });

  // Kept as defence in depth: the INSERT grant is revoked in Phase 2, so these now fail on the
  // missing privilege rather than the trigger, which is the stronger of the two outcomes.
  it("end users cannot create an event with server-managed columns set", async () => {
    for (const cols of [
      ["status", "'PUBLISHED'"],
      ["paid_at", "now()"],
      ["published_at", "now()"],
      ["slug", "'squatted'"],
      ["access_code_encrypted", "'\\x00'"],
      ["design_overrides", "'{}'"],
      ["message_sends_used", "3"],
    ]) {
      expect(
        await errorCode(
          asActor(db, { kind: "user", id: stranger }, (q) =>
            q(
              `insert into public.events (owner_id, prompt, ${cols[0]}) values ($1, 'x', ${cols[1]})`,
              [stranger],
            ),
          ),
        ),
        cols[0],
      ).toBe("42501");
    }
    const conceptId = await insertConcept();
    expect(
      await errorCode(
        asActor(db, { kind: "user", id: stranger }, (q) =>
          q(
            `insert into public.events (owner_id, prompt, active_concept_id) values ($1, 'x', $2)`,
            [stranger, conceptId],
          ),
        ),
      ),
    ).toBe("42501");
    // Server code inserting a concept from another event is still rejected.
    expect(
      await errorCode(
        db.query(
          `insert into public.events (owner_id, prompt, active_concept_id) values ($1, 'x', $2)`,
          [owner, conceptId],
        ),
      ),
    ).toBe("23514");
  });

  it("hides events and rosters from non-members and anon", async () => {
    const seen = await asActor(db, { kind: "user", id: stranger }, (q) =>
      q(`select id from public.events`),
    );
    expect(seen.rowCount).toBe(0);
    const roster = await asActor(db, { kind: "user", id: stranger }, (q) =>
      q(`select * from public.event_members`),
    );
    expect(roster.rowCount).toBe(0);
    expect(
      await errorCode(asActor(db, { kind: "anon" }, (q) => q(`select id from public.events`))),
    ).toBe("42501");
  });

  it("co-host edits content but cannot touch server-managed columns", async () => {
    const ok = await asActor(db, { kind: "user", id: cohost }, (q) =>
      q(
        `update public.events set title = 'Welcome, little one', timezone = 'America/New_York', visibility = 'private'
         where id = $1 returning title, timezone`,
        [eventId],
      ),
    );
    expect(ok.rows[0]).toEqual({ title: "Welcome, little one", timezone: "America/New_York" });
    for (const set of [
      "paid_at = now()",
      "published_at = now()",
      "status = 'PUBLISHED'",
      `owner_id = '${cohost}'`,
      "message_sends_used = 5",
      "prompt = 'rewritten'",
      "slug = 'taken'",
      `design_overrides = '{"palette":"x"}'`,
    ]) {
      expect(
        await errorCode(
          asActor(db, { kind: "user", id: cohost }, (q) =>
            q(`update public.events set ${set} where id = $1`, [eventId]),
          ),
        ),
        set,
      ).toBe("42501");
    }
    // Server code (service role) may.
    const paid = await asActor(db, { kind: "service" }, (q) =>
      q(`update public.events set paid_at = now() where id = $1 returning paid_at`, [eventId]),
    );
    expect(paid.rows[0].paid_at).not.toBeNull();
  });

  it("rejects an invalid IANA timezone", async () => {
    expect(
      await errorCode(
        db.query(`update public.events set timezone = 'Mars/Olympus' where id = $1`, [eventId]),
      ),
    ).toBe("23514");
    await db.query(`update public.events set timezone = 'Europe/Paris' where id = $1`, [eventId]);
  });

  it("only the owner manages co-hosts and can never remove the owner row", async () => {
    const added = await asActor(db, { kind: "user", id: owner }, (q) =>
      q(
        `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'cohost') returning role`,
        [eventId, stranger],
      ),
    );
    expect(added.rows[0].role).toBe("cohost");
    expect(
      await errorCode(
        asActor(db, { kind: "user", id: cohost }, (q) =>
          q(
            `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'cohost')`,
            [eventId, stranger],
          ),
        ),
      ),
    ).toBe("42501");
    const removedByCohost = await asActor(db, { kind: "user", id: cohost }, (q) =>
      q(`delete from public.event_members where event_id = $1 and user_id = $2`, [eventId, cohost]),
    );
    expect(removedByCohost.rowCount).toBe(0);
    const removedByOwner = await asActor(db, { kind: "user", id: owner }, (q) =>
      q(`delete from public.event_members where event_id = $1 and user_id = $2`, [eventId, cohost]),
    );
    expect(removedByOwner.rowCount).toBe(1);
    const ownerRow = await asActor(db, { kind: "user", id: owner }, (q) =>
      q(`delete from public.event_members where event_id = $1 and user_id = $2`, [eventId, owner]),
    );
    expect(ownerRow.rowCount).toBe(0);
    expect(
      await errorCode(
        db.query(`delete from public.event_members where event_id = $1 and role = 'owner'`, [
          eventId,
        ]),
      ),
    ).toBe("42501");
  });

  it("only the owner deletes the event, and deletion cascades cleanly", async () => {
    const byCohost = await asActor(db, { kind: "user", id: cohost }, (q) =>
      q(`delete from public.events where id = $1`, [eventId]),
    );
    expect(byCohost.rowCount).toBe(0);
    const conceptId = await insertConcept();
    const r1 = await insertSpec(conceptId, 1);
    const r2 = await insertSpec(conceptId, 2, r1);
    await db.query(`update public.design_concepts set active_resolved_spec_id = $1 where id = $2`, [
      r2,
      conceptId,
    ]);
    await db.query(`update public.events set active_concept_id = $1 where id = $2`, [
      conceptId,
      eventId,
    ]);
    const byOwner = await asActor(
      db,
      { kind: "user", id: owner },
      (q) => q(`delete from public.events where id = $1`, [eventId]),
      { commit: true },
    );
    expect(byOwner.rowCount).toBe(1);
    const { rows } = await db.query(
      `select (select count(*) from public.event_members)::int as members,
              (select count(*) from public.design_concepts)::int as concepts,
              (select count(*) from public.resolved_design_specs)::int as specs`,
    );
    expect(rows[0]).toEqual({ members: 0, concepts: 0, specs: 0 });
  });
});

describe("generated artifacts are immutable and member-readable", () => {
  it("members read concepts and specs; strangers and end users cannot write them", async () => {
    const conceptId = await insertConcept();
    const specId = await insertSpec(conceptId);
    await db.query(`update public.design_concepts set active_resolved_spec_id = $1 where id = $2`, [
      specId,
      conceptId,
    ]);
    const asCohost = await asActor(db, { kind: "user", id: cohost }, (q) =>
      q(
        `select c.id, s.revision from public.design_concepts c join public.resolved_design_specs s on s.concept_id = c.id`,
      ),
    );
    expect(asCohost.rows).toEqual([{ id: conceptId, revision: 1 }]);
    const asStranger = await asActor(db, { kind: "user", id: stranger }, (q) =>
      q(`select id from public.design_concepts`),
    );
    expect(asStranger.rowCount).toBe(0);
    expect(
      await errorCode(
        asActor(db, { kind: "user", id: owner }, (q) =>
          q(`update public.design_concepts set selected_at = now() where id = $1`, [conceptId]),
        ),
      ),
    ).toBe("42501");
  });

  it("rejects mutation of design intent, composition and version set", async () => {
    const conceptId = await insertConcept();
    for (const set of [
      `design_intent = '{"family":"statement"}'`,
      `composition = '{"version":"composition_v1","sections":[{}]}'`,
      `composition_raw = '{}'`,
      `composition_hash = 'other'`,
      `compiler_version = 'compiler_v1'`,
      `name = 'Renamed'`,
    ]) {
      expect(
        await errorCode(
          db.query(`update public.design_concepts set ${set} where id = $1`, [conceptId]),
        ),
        set,
      ).toBe("42501");
    }
    await db.query(`update public.design_concepts set selected_at = now() where id = $1`, [
      conceptId,
    ]);
  });

  it("never persists an unverified spec and never updates a persisted revision", async () => {
    const conceptId = await insertConcept();
    expect(
      await errorCode(
        db.query(
          `insert into public.resolved_design_specs (concept_id, revision, spec, content_version, verified_clean, compiler_version, primitive_set_version)
           values ($1, 1, '{}', 1, false, 'compiler_v0', 'composition_v1')`,
          [conceptId],
        ),
      ),
    ).toBe("23514");
    const specId = await insertSpec(conceptId);
    expect(
      await errorCode(
        db.query(
          `update public.resolved_design_specs set spec = '{"changed":true}' where id = $1`,
          [specId],
        ),
      ),
    ).toBe("42501");
  });

  it("re-fit revisions chain within one concept and activate atomically", async () => {
    const a = await insertConcept(0);
    const b = await insertConcept(1);
    const a1 = await insertSpec(a, 1);
    expect(await errorCode(insertSpec(a, 2, null))).toBe("23514"); // revision 2 must supersede
    const b1 = await insertSpec(b, 1);
    expect(await errorCode(insertSpec(a, 2, b1))).toBe("23514"); // wrong concept
    const a2 = await insertSpec(a, 2, a1);
    expect(
      await errorCode(
        db.query(`update public.design_concepts set active_resolved_spec_id = $1 where id = $2`, [
          b1,
          a,
        ]),
      ),
    ).toBe("23514");
    await db.query(`update public.design_concepts set active_resolved_spec_id = $1 where id = $2`, [
      a2,
      a,
    ]);
    expect(
      await errorCode(db.query(`delete from public.resolved_design_specs where id = $1`, [a1])),
    ).toBe("23503");
    // events.active_concept_id must belong to the event.
    const { rows } = await db.query(
      `insert into public.events (owner_id, prompt) values ($1, 'Other') returning id`,
      [owner],
    );
    expect(
      await errorCode(
        db.query(`update public.events set active_concept_id = $1 where id = $2`, [a, rows[0].id]),
      ),
    ).toBe("23514");
    await db.query(`update public.events set active_concept_id = $1 where id = $2`, [a, eventId]);
  });
});

describe("server-only state", () => {
  it("pre-auth drafts, generation runs and rate limits are invisible to end users", async () => {
    await db.query(
      `insert into public.pre_auth_event_drafts (draft_token_hash, prompt) values ('\\x01', 'Secret idea')`,
    );
    for (const table of ["pre_auth_event_drafts", "generation_runs", "rate_limits"]) {
      expect(
        await errorCode(
          asActor(db, { kind: "user", id: owner }, (q) => q(`select * from public.${table}`)),
        ),
        table,
      ).toBe("42501");
      expect(
        await errorCode(asActor(db, { kind: "anon" }, (q) => q(`select * from public.${table}`))),
        table,
      ).toBe("42501");
    }
    const viaService = await asActor(db, { kind: "service" }, (q) =>
      q(`select prompt from public.pre_auth_event_drafts`),
    );
    expect(viaService.rows[0].prompt).toBe("Secret idea");
  });

  it("lists storage keys of expired unclaimed draft assets, then purges drafts and assets", async () => {
    await db.query(
      `insert into public.pre_auth_event_drafts (draft_token_hash, prompt, expires_at) values
         ('\\x01', 'fresh', now() + interval '1 hour'),
         ('\\x02', 'stale', now() - interval '1 hour'),
         ('\\x03', 'claimed-stale', now() - interval '1 hour')`,
    );
    await db.query(
      `update public.pre_auth_event_drafts set claimed_by = $1, claimed_at = now(), claimed_event_id = $2 where draft_token_hash = '\\x03'`,
      [owner, eventId],
    );
    await db.query(
      `insert into public.inspiration_assets (pre_auth_draft_id, storage_key, mime_type, size_bytes)
       select id, 'drafts/' || prompt, 'image/png', 10 from public.pre_auth_event_drafts`,
    );
    // Service role (bypassrls, not superuser in the stub) must retain execute.
    const keys = await asActor(db, { kind: "service" }, (q) =>
      q(`select public.expired_pre_auth_storage_keys(now()) as key`),
    );
    expect(keys.rows.map((r) => r.key)).toEqual(["drafts/stale"]);
    expect(
      await errorCode(
        db.query(`select public.purge_expired_pre_auth_state(now() + interval '1 minute')`),
      ),
    ).toBe("P0001");
    const purged = await asActor(
      db,
      { kind: "service" },
      (q) => q(`select public.purge_expired_pre_auth_state(now()) as n`),
      { commit: true },
    );
    expect(purged.rows[0].n).toBe(1);
    const { rows } = await db.query(
      `select prompt from public.pre_auth_event_drafts order by prompt`,
    );
    expect(rows.map((r) => r.prompt)).toEqual(["claimed-stale", "fresh"]);
    const assets = await db.query(`select storage_key from public.inspiration_assets order by 1`);
    expect(assets.rows.map((r) => r.storage_key)).toEqual(["drafts/claimed-stale", "drafts/fresh"]);
    for (const fn of ["expired_pre_auth_storage_keys", "purge_expired_pre_auth_state"]) {
      expect(
        await errorCode(
          asActor(db, { kind: "user", id: owner }, (q) => q(`select public.${fn}(now())`)),
        ),
        fn,
      ).toBe("42501");
    }
    // An asset has exactly one owner; a claim re-parents it.
    expect(
      await errorCode(
        db.query(
          `insert into public.inspiration_assets (event_id, pre_auth_draft_id, storage_key, mime_type, size_bytes)
           select $1, id, 'dual', 'image/png', 1 from public.pre_auth_event_drafts limit 1`,
          [eventId],
        ),
      ),
    ).toBe("23514");
    // A claimed draft survives deletion of the profile that claimed it.
    await db.query(`delete from public.events where id = $1`, [eventId]);
    await db.query(`delete from auth.users where id = $1`, [owner]);
    const claimed = await db.query(
      `select claimed_by, claimed_event_id, claimed_at is not null as claimed
       from public.pre_auth_event_drafts where prompt = 'claimed-stale'`,
    );
    expect(claimed.rows[0]).toEqual({ claimed_by: null, claimed_event_id: null, claimed: true });
  });

  it("counts fixed-window rate limits atomically and only for server code", async () => {
    const allow = async () =>
      (
        await asActor(
          db,
          { kind: "service" },
          (q) => q(`select public.consume_rate_limit('signup:ip', '\\xabcd', 3600, 3) as ok`),
          { commit: true },
        )
      ).rows[0].ok;
    expect([await allow(), await allow(), await allow(), await allow()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    const other = await db.query(
      `select public.consume_rate_limit('signup:ip', '\\xbeef', 3600, 3) as ok`,
    );
    expect(other.rows[0].ok).toBe(true);
    expect(
      await errorCode(
        asActor(db, { kind: "user", id: owner }, (q) =>
          q(`select public.consume_rate_limit('signup:ip', '\\xabcd', 3600, 3)`),
        ),
      ),
    ).toBe("42501");
    expect(
      await errorCode(
        asActor(db, { kind: "anon" }, (q) =>
          q(`select public.consume_rate_limit('x', '\\x00', 60, 1)`),
        ),
      ),
    ).toBe("42501");
  });

  it("records generation telemetry with the version set and idempotency key", async () => {
    await db.query(
      `insert into public.generation_runs (event_id, user_id, provider, operation, model, latency_ms, success, prompt_version, schema_version, idempotency_key)
       values ($1, $2, 'test', 'event_identity', 'test-model', 1200, true, 'event_identity_v2', 'event_identity_schema_v2', 'k1')`,
      [eventId, owner],
    );
    expect(
      await errorCode(
        db.query(
          `insert into public.generation_runs (event_id, user_id, provider, operation, model, latency_ms, success, prompt_version, schema_version, idempotency_key)
           values ($1, $2, 'test', 'event_identity', 'test-model', 900, true, 'event_identity_v2', 'event_identity_schema_v2', 'k1')`,
          [eventId, owner],
        ),
      ),
    ).toBe("23505");
  });
});
