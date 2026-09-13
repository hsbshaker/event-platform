import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { asActor, connect, createAuthUser, databaseUrl, errorCode, resetDatabase } from "./harness";

/**
 * Phase 2 schema and the atomic pre-auth claim
 * (supabase/migrations/20260913010000_phase2_prompt_auth.sql).
 *
 * Covers spec.md §7.2 (the draft becomes exactly one event, retries included), §7.3 (details
 * stay optional), §32 #44 (no new publish requirement) and §27 (server-only draft state).
 */

let db: Client;
let owner: string;
let other: string;
let eventId: string;

const TOKEN = "\\x0102030405060708";
const OTHER_TOKEN = "\\x0908070605040302";

async function insertDraft(
  tokenHash: string,
  prompt = "A spring garden baby shower for the Shakers",
  expiresAt = "now() + interval '24 hours'",
): Promise<string> {
  const { rows } = await db.query(
    `insert into public.pre_auth_event_drafts (draft_token_hash, prompt, expires_at)
     values ($1, $2, ${expiresAt}) returning id`,
    [tokenHash, prompt],
  );
  return rows[0].id as string;
}

async function claim(tokenHash: string, userId: string) {
  const { rows } = await db.query(
    `select event_id, outcome from public.claim_pre_auth_draft($1, $2)`,
    [tokenHash, userId],
  );
  return rows[0] as { event_id: string | null; outcome: string };
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
  other = await createAuthUser(db, "other@example.com");
  const { rows } = await db.query(
    `insert into public.events (owner_id, prompt) values ($1, 'An existing event') returning id`,
    [owner],
  );
  eventId = rows[0].id;
});

describe("event creation is server-side only", () => {
  it("denies an authenticated insert now that the draft claim owns creation", async () => {
    expect(
      await errorCode(
        asActor(db, { kind: "user", id: owner }, (q) =>
          q(`insert into public.events (owner_id, prompt) values ($1, 'direct') returning id`, [
            owner,
          ]),
        ),
      ),
    ).toBe("42501");
  });

  it("keeps generation_requested_at out of end-user reach", async () => {
    expect(
      await errorCode(
        asActor(db, { kind: "user", id: owner }, (q) =>
          q(`update public.events set generation_requested_at = now() where id = $1`, [eventId]),
        ),
      ),
    ).toBe("42501");
    const viaServer = await asActor(db, { kind: "service" }, (q) =>
      q(
        `update public.events set generation_requested_at = now() where id = $1 returning generation_requested_at`,
        [eventId],
      ),
    );
    expect(viaServer.rows[0].generation_requested_at).not.toBeNull();
  });

  it("lets a collaborator fill in the Phase 2 detail columns", async () => {
    const updated = await asActor(db, { kind: "user", id: owner }, (q) =>
      q(
        `update public.events
         set hosts = 'Haseeb & Shezia', baby_name = 'Shaker', event_date = '2027-03-06',
             start_time = '13:00', venue_name = 'The Lodge', visibility = 'public'
         where id = $1 returning hosts, baby_name, visibility`,
        [eventId],
      ),
    );
    expect(updated.rows[0]).toEqual({
      hosts: "Haseeb & Shezia",
      baby_name: "Shaker",
      visibility: "public",
    });
  });

  it("still allows an event with every detail missing", async () => {
    const { rows } = await db.query(
      `select event_date, start_time, timezone, venue_name, rsvp_deadline, visibility, status
       from public.events where id = $1`,
      [eventId],
    );
    expect(rows[0]).toEqual({
      event_date: null,
      start_time: null,
      timezone: null,
      venue_name: null,
      rsvp_deadline: null,
      visibility: null,
      status: "DRAFT",
    });
  });
});

describe("claim_pre_auth_draft", () => {
  it("creates exactly one event, starts generation state and re-parents inspiration", async () => {
    const draftId = await insertDraft(TOKEN);
    await db.query(
      `insert into public.inspiration_assets (pre_auth_draft_id, storage_key, mime_type, size_bytes)
       values ($1, 'drafts/a.png', 'image/png', 1024), ($1, 'drafts/b.png', 'image/png', 2048)`,
      [draftId],
    );

    const result = await claim(TOKEN, owner);
    expect(result.outcome).toBe("claimed");
    expect(result.event_id).not.toBeNull();

    const { rows } = await db.query(
      `select owner_id, prompt, status, generation_requested_at is not null as generating
       from public.events where id = $1`,
      [result.event_id],
    );
    expect(rows[0]).toEqual({
      owner_id: owner,
      prompt: "A spring garden baby shower for the Shakers",
      status: "DRAFT",
      generating: true,
    });

    const assets = await db.query(
      `select event_id, pre_auth_draft_id from public.inspiration_assets order by storage_key`,
    );
    expect(assets.rows).toEqual([
      { event_id: result.event_id, pre_auth_draft_id: null },
      { event_id: result.event_id, pre_auth_draft_id: null },
    ]);

    const members = await db.query(`select role from public.event_members where event_id = $1`, [
      result.event_id,
    ]);
    expect(members.rows).toEqual([{ role: "owner" }]);
  });

  it("is idempotent: a retried callback returns the first event, never a second", async () => {
    await insertDraft(TOKEN);
    const before = await db.query(`select count(*)::int as n from public.events`);
    const first = await claim(TOKEN, owner);
    const second = await claim(TOKEN, owner);
    const third = await claim(TOKEN, owner);

    expect(first.outcome).toBe("claimed");
    expect(second.outcome).toBe("already_claimed_by_user");
    expect(third.outcome).toBe("already_claimed_by_user");
    expect(second.event_id).toBe(first.event_id);
    expect(third.event_id).toBe(first.event_id);

    const after = await db.query(`select count(*)::int as n from public.events`);
    expect(after.rows[0].n).toBe(before.rows[0].n + 1);
  });

  it("refuses a draft another account already claimed, and creates nothing", async () => {
    await insertDraft(TOKEN);
    const mine = await claim(TOKEN, owner);
    const theirs = await claim(TOKEN, other);
    expect(theirs).toEqual({ event_id: null, outcome: "claimed_by_other" });
    const { rows } = await db.query(
      `select count(*)::int as n from public.events where owner_id = $1`,
      [other],
    );
    expect(rows[0].n).toBe(0);
    expect(mine.event_id).not.toBeNull();
  });

  it("refuses an expired draft and an unknown token", async () => {
    await insertDraft(TOKEN, "Stale idea", "now() - interval '1 minute'");
    expect(await claim(TOKEN, owner)).toEqual({ event_id: null, outcome: "expired" });
    expect(await claim(OTHER_TOKEN, owner)).toEqual({ event_id: null, outcome: "not_found" });
    const { rows } = await db.query(`select count(*)::int as n from public.events`);
    expect(rows[0].n).toBe(1); // only the beforeEach fixture
  });

  it("serializes concurrent claims of the same token onto one event", async () => {
    await insertDraft(TOKEN);
    const a = new Client({ connectionString: databaseUrl() });
    const b = new Client({ connectionString: databaseUrl() });
    await a.connect();
    await b.connect();
    try {
      const [ra, rb] = await Promise.all([
        a.query(`select event_id, outcome from public.claim_pre_auth_draft($1, $2)`, [
          TOKEN,
          owner,
        ]),
        b.query(`select event_id, outcome from public.claim_pre_auth_draft($1, $2)`, [
          TOKEN,
          owner,
        ]),
      ]);
      const outcomes = [ra.rows[0].outcome, rb.rows[0].outcome].sort();
      expect(outcomes).toEqual(["already_claimed_by_user", "claimed"]);
      expect(ra.rows[0].event_id).toBe(rb.rows[0].event_id);
    } finally {
      await a.end();
      await b.end();
    }
    const { rows } = await db.query(
      `select count(*)::int as n from public.events where prompt like 'A spring%'`,
    );
    expect(rows[0].n).toBe(1);
  });

  it("is server-only: end users cannot call it or read drafts", async () => {
    await insertDraft(TOKEN);
    for (const actor of [{ kind: "user" as const, id: owner }, { kind: "anon" as const }]) {
      expect(
        await errorCode(
          asActor(db, actor, (q) =>
            q(`select public.claim_pre_auth_draft($1, $2)`, [TOKEN, owner]),
          ),
        ),
        actor.kind,
      ).toBe("42501");
    }
    const viaService = await asActor(db, { kind: "service" }, (q) =>
      q(`select event_id, outcome from public.claim_pre_auth_draft($1, $2)`, [TOKEN, owner]),
    );
    expect(viaService.rows[0].outcome).toBe("claimed");
  });

  it("leaves the draft's inspiration untouchable by the claiming user's peers", async () => {
    const draftId = await insertDraft(TOKEN);
    await db.query(
      `insert into public.inspiration_assets (pre_auth_draft_id, storage_key, mime_type, size_bytes)
       values ($1, 'drafts/private.png', 'image/png', 10)`,
      [draftId],
    );
    const claimed = await claim(TOKEN, owner);
    const asOther = await asActor(db, { kind: "user", id: other }, (q) =>
      q(`select storage_key from public.inspiration_assets`),
    );
    expect(asOther.rowCount).toBe(0);
    const asOwner = await asActor(db, { kind: "user", id: owner }, (q) =>
      q(`select storage_key from public.inspiration_assets where event_id = $1`, [
        claimed.event_id,
      ]),
    );
    expect(asOwner.rows.map((r) => r.storage_key)).toEqual(["drafts/private.png"]);
  });
});
