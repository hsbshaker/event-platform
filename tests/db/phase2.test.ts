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

async function bindEmail(tokenHash: string, email: string): Promise<void> {
  await db.query(`select public.bind_draft_claim_email($1, $2)`, [tokenHash, email]);
}

async function claimByEmail(email: string, userId: string) {
  const { rows } = await db.query(
    `select event_id, outcome from public.claim_pre_auth_draft_by_email($1, $2)`,
    [email, userId],
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

describe("claiming by the address the session proves (spec.md §7.2, §31 email auth)", () => {
  it("restores a draft to the browser that has no cookie at all", async () => {
    // The magic link opened in a mail-app webview or on a phone: no ep_draft cookie follows.
    const draftId = await insertDraft(TOKEN, "A calm walled-garden shower");
    await bindEmail(TOKEN, "owner@example.com");
    const claimed = await claimByEmail("owner@example.com", owner);
    expect(claimed.outcome).toBe("claimed");
    expect(claimed.event_id).not.toBeNull();
    const { rows } = await db.query(
      `select e.prompt from public.events e
       join public.pre_auth_event_drafts d on d.claimed_event_id = e.id
       where d.id = $1`,
      [draftId],
    );
    expect(rows[0].prompt).toBe("A calm walled-garden shower");
  });

  it("moves the draft's inspiration onto the event, exactly as the cookie path does", async () => {
    const draftId = await insertDraft(TOKEN);
    await db.query(
      `insert into public.inspiration_assets (pre_auth_draft_id, storage_key, mime_type, size_bytes)
       values ($1, 'drafts/a.png', 'image/png', 10)`,
      [draftId],
    );
    await bindEmail(TOKEN, "owner@example.com");
    const claimed = await claimByEmail("owner@example.com", owner);
    const { rows } = await db.query(
      `select event_id, pre_auth_draft_id from public.inspiration_assets`,
    );
    expect(rows[0].event_id).toBe(claimed.event_id);
    expect(rows[0].pre_auth_draft_id).toBeNull();
  });

  it("gives nothing to an address no draft was bound to", async () => {
    await insertDraft(TOKEN);
    expect(await claimByEmail("other@example.com", other)).toEqual({
      event_id: null,
      outcome: "not_found",
    });
    const { rows } = await db.query(`select count(*)::int as n from public.events`);
    expect(rows[0].n).toBe(1); // only the beforeEach fixture
  });

  it("matches the address case-insensitively and ignores surrounding space", async () => {
    await insertDraft(TOKEN);
    await bindEmail(TOKEN, "  Owner@Example.COM ");
    expect((await claimByEmail("owner@example.com", owner)).outcome).toBe("claimed");
  });

  it("will not resurrect an expired or already claimed draft", async () => {
    await insertDraft(TOKEN, "Stale idea", "now() - interval '1 minute'");
    await bindEmail(TOKEN, "owner@example.com");
    expect(await claimByEmail("owner@example.com", owner)).toEqual({
      event_id: null,
      outcome: "not_found",
    });

    await insertDraft(OTHER_TOKEN, "Fresh idea");
    await bindEmail(OTHER_TOKEN, "owner@example.com");
    const first = await claimByEmail("owner@example.com", owner);
    expect(first.outcome).toBe("claimed");
    // A second link for the same address must not mint a second event.
    expect(await claimByEmail("owner@example.com", owner)).toEqual({
      event_id: null,
      outcome: "not_found",
    });
  });

  it("takes the most recent draft when an address has several", async () => {
    await insertDraft(TOKEN, "Older idea");
    await db.query(
      `update public.pre_auth_event_drafts set created_at = now() - interval '2 hours'`,
    );
    await bindEmail(TOKEN, "owner@example.com");
    await insertDraft(OTHER_TOKEN, "What they wrote just now");
    await bindEmail(OTHER_TOKEN, "owner@example.com");
    const claimed = await claimByEmail("owner@example.com", owner);
    const { rows } = await db.query(`select prompt from public.events where id = $1`, [
      claimed.event_id,
    ]);
    expect(rows[0].prompt).toBe("What they wrote just now");
  });

  it("never binds an address to a draft that is already claimed", async () => {
    await insertDraft(TOKEN);
    await claim(TOKEN, owner);
    await bindEmail(TOKEN, "other@example.com");
    expect(await claimByEmail("other@example.com", other)).toEqual({
      event_id: null,
      outcome: "not_found",
    });
  });

  it("serializes a cookie claim and an address claim onto one event", async () => {
    // Both paths can fire for the same person: the cookie survived AND the link carried the
    // address. They must converge, exactly as two cookie claims do.
    await insertDraft(TOKEN);
    await bindEmail(TOKEN, "owner@example.com");
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
        b.query(`select event_id, outcome from public.claim_pre_auth_draft_by_email($1, $2)`, [
          "owner@example.com",
          owner,
        ]),
      ]);
      // Which outcome each side reports depends on the interleaving: the address lookup may
      // resolve the draft before the cookie claim commits and then find it already claimed by
      // this same user, or it may run after and find nothing left to claim. Both are correct.
      // The invariant that matters is that exactly one event exists and nobody is handed a
      // different one.
      const results = [ra.rows[0], rb.rows[0]] as { event_id: string | null; outcome: string }[];
      expect(results.some((r) => r.outcome === "claimed")).toBe(true);
      for (const r of results) {
        expect(["claimed", "already_claimed_by_user", "not_found"]).toContain(r.outcome);
      }
      const eventIds = new Set(results.map((r) => r.event_id).filter(Boolean));
      expect(eventIds.size).toBe(1);
      const { rows } = await db.query(
        `select count(*)::int as n from public.events where owner_id = $1`,
        [owner],
      );
      expect(rows[0].n).toBe(2); // the beforeEach fixture plus exactly one claimed event
    } finally {
      await a.end();
      await b.end();
    }
  });
});

/**
 * Consistency across the database/Storage boundary
 * (supabase/migrations/20260913020000_phase2_asset_consistency.sql).
 *
 * Every case here is a check and an act that used to be separated by a network hop: an upload
 * racing the claim, the file cap counted outside the lock, and a purge that deleted more
 * drafts than the keys it had been handed. spec.md §7.2 (inspiration survives auth exactly),
 * §27 (private, strictly limited, short raw-file retention), §10 (anti-abuse limits).
 */
describe("attach_inspiration_asset", () => {
  const MAX_FILES = 6; // src/lib/drafts/inspiration.ts MAX_FILES_PER_DRAFT

  async function attach(
    draftId: string,
    key: string,
    { max = MAX_FILES, client = db }: { max?: number; client?: Client } = {},
  ) {
    const { rows } = await client.query(
      `select outcome, asset_id, attached_event_id, asset_created_at
       from public.attach_inspiration_asset($1, $2, 'image/png', 1024, $3)`,
      [draftId, key, max],
    );
    return rows[0] as {
      outcome: string;
      asset_id: string | null;
      attached_event_id: string | null;
      asset_created_at: string | null;
    };
  }

  async function seedAssets(draftId: string, count: number) {
    await db.query(
      `insert into public.inspiration_assets (pre_auth_draft_id, storage_key, mime_type, size_bytes)
       select $1, 'drafts/seed-' || g, 'image/png', 10 from generate_series(1, $2) g`,
      [draftId, count],
    );
  }

  it("attaches to the draft while it is still unclaimed", async () => {
    const draftId = await insertDraft(TOKEN);
    const result = await attach(draftId, "drafts/one.png");
    expect(result.outcome).toBe("attached");
    expect(result.attached_event_id).toBeNull();
    expect(result.asset_id).not.toBeNull();
    expect(result.asset_created_at).not.toBeNull();
    const { rows } = await db.query(
      `select pre_auth_draft_id, event_id, expires_at is not null as expires
       from public.inspiration_assets where storage_key = 'drafts/one.png'`,
    );
    expect(rows[0]).toEqual({ pre_auth_draft_id: draftId, event_id: null, expires: true });
  });

  it("attaches to the claimed event when the claim won the race, not to a dangling draft", async () => {
    const draftId = await insertDraft(TOKEN);
    const claimed = await claim(TOKEN, owner);
    expect(claimed.outcome).toBe("claimed");

    // The upload was in flight while the claim ran: without the shared row lock this insert
    // referenced the retained draft, so the asset belonged to no event and no purge could
    // ever reach it.
    const result = await attach(draftId, "drafts/late.png");
    expect(result.outcome).toBe("attached");
    expect(result.attached_event_id).toBe(claimed.event_id);

    const { rows } = await db.query(
      `select event_id, pre_auth_draft_id from public.inspiration_assets
       where storage_key = 'drafts/late.png'`,
    );
    expect(rows[0]).toEqual({ event_id: claimed.event_id, pre_auth_draft_id: null });
    const orphans = await db.query(
      `select count(*)::int as n from public.inspiration_assets where pre_auth_draft_id = $1`,
      [draftId],
    );
    expect(orphans.rows[0].n).toBe(0);
  });

  it("refuses a draft that is gone, expired, or claimed into a deleted event", async () => {
    expect((await attach(eventId, "drafts/nowhere.png")).outcome).toBe("gone");

    const staleId = await insertDraft(TOKEN, "Stale idea", "now() - interval '1 minute'");
    expect((await attach(staleId, "drafts/stale.png")).outcome).toBe("gone");

    const claimedId = await insertDraft(OTHER_TOKEN);
    const claimed = await claim(OTHER_TOKEN, owner);
    await db.query(`delete from public.events where id = $1`, [claimed.event_id]);
    expect((await attach(claimedId, "drafts/homeless.png")).outcome).toBe("gone");

    const { rows } = await db.query(`select count(*)::int as n from public.inspiration_assets`);
    expect(rows[0].n).toBe(0);
  });

  it("refuses the file past the cap rather than counting it outside the lock", async () => {
    const draftId = await insertDraft(TOKEN);
    await seedAssets(draftId, MAX_FILES);
    expect((await attach(draftId, "drafts/seventh.png")).outcome).toBe("limit_reached");
    const { rows } = await db.query(
      `select count(*)::int as n from public.inspiration_assets where pre_auth_draft_id = $1`,
      [draftId],
    );
    expect(rows[0].n).toBe(MAX_FILES);
  });

  it("holds the cap when two uploads land on one draft at the same time", async () => {
    const draftId = await insertDraft(TOKEN);
    await seedAssets(draftId, MAX_FILES - 1);

    const a = new Client({ connectionString: databaseUrl() });
    const b = new Client({ connectionString: databaseUrl() });
    await a.connect();
    await b.connect();
    try {
      // A holds the draft's row lock, exactly as the claim does.
      await a.query("begin");
      expect((await attach(draftId, "drafts/race-a.png", { client: a })).outcome).toBe("attached");

      // B counts five free slots if it is allowed to read outside that lock. It must block
      // until A commits, then see six and refuse.
      const second = attach(draftId, "drafts/race-b.png", { client: b });
      await new Promise((resolve) => setTimeout(resolve, 150));
      await a.query("commit");
      expect((await second).outcome).toBe("limit_reached");
    } finally {
      await a.end();
      await b.end();
    }

    const { rows } = await db.query(
      `select count(*)::int as n from public.inspiration_assets where pre_auth_draft_id = $1`,
      [draftId],
    );
    expect(rows[0].n).toBe(MAX_FILES);
  });

  it("rejects a nonsense cap or payload instead of storing something unbounded", async () => {
    const draftId = await insertDraft(TOKEN);
    expect(await errorCode(attach(draftId, "drafts/x.png", { max: 0 }))).toBe("P0001");
    expect(
      await errorCode(
        db.query(`select public.attach_inspiration_asset($1, 'drafts/y.png', 'image/png', 0, 6)`, [
          draftId,
        ]),
      ),
    ).toBe("P0001");
  });

  it("is server-only", async () => {
    const draftId = await insertDraft(TOKEN);
    for (const actor of [{ kind: "user" as const, id: owner }, { kind: "anon" as const }]) {
      expect(
        await errorCode(
          asActor(db, actor, (q) =>
            q(`select public.attach_inspiration_asset($1, 'drafts/z.png', 'image/png', 1, 6)`, [
              draftId,
            ]),
          ),
        ),
        actor.kind,
      ).toBe("42501");
    }
    const viaService = await asActor(db, { kind: "service" }, (q) =>
      q(
        `select outcome from public.attach_inspiration_asset($1, 'drafts/z.png', 'image/png', 1, 6)`,
        [draftId],
      ),
    );
    expect(viaService.rows[0].outcome).toBe("attached");
  });
});

describe("paged expiry of abandoned pre-auth state", () => {
  const PAGE = 2;

  async function page(limit = PAGE) {
    const { rows } = await db.query(
      `select draft_id, storage_keys from public.expired_pre_auth_draft_batch(now(), $1)`,
      [limit],
    );
    return rows as { draft_id: string; storage_keys: string[] }[];
  }

  async function purgeIds(ids: string[]) {
    const { rows } = await db.query(`select public.purge_pre_auth_drafts(now(), $1) as n`, [ids]);
    return rows[0].n as number;
  }

  /** Five expired drafts with two assets each, plus a fresh one and a claimed one. */
  async function seed(): Promise<string[]> {
    const expired: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      expired.push(await insertDraft(`\\x1${i}`, `stale-${i}`, "now() - interval '1 hour'"));
    }
    await insertDraft("\\xaa", "fresh", "now() + interval '1 hour'");
    const claimedDraft = await insertDraft("\\xbb", "claimed", "now() - interval '1 hour'");
    await db.query(
      `update public.pre_auth_event_drafts
       set claimed_by = $1, claimed_event_id = $2, claimed_at = now() where id = $3`,
      [owner, eventId, claimedDraft],
    );
    await db.query(
      `insert into public.inspiration_assets (pre_auth_draft_id, storage_key, mime_type, size_bytes)
       select d.id, 'drafts/' || d.prompt || '-' || g, 'image/png', 10
       from public.pre_auth_event_drafts d, generate_series(1, 2) g
       where d.claimed_at is null`,
    );
    await db.query(
      `insert into public.inspiration_assets (event_id, storage_key, mime_type, size_bytes)
       values ($1, 'events/kept.png', 'image/png', 10)`,
      [eventId],
    );
    return expired;
  }

  it("hands back every expired draft's keys across pages, and deletes only what it handed back", async () => {
    const expired = await seed();
    const seenKeys: string[] = [];
    const seenDrafts: string[] = [];
    let pages = 0;

    for (;;) {
      const batch = await page();
      if (batch.length === 0) break;
      pages += 1;
      expect(batch.length).toBeLessThanOrEqual(PAGE);
      for (const row of batch) {
        // Two assets per draft: a page is bounded by drafts, so no draft is ever half-listed.
        expect(row.storage_keys).toHaveLength(2);
        seenKeys.push(...row.storage_keys);
        seenDrafts.push(row.draft_id);
      }
      // The objects would be removed here; only then are these drafts purged.
      expect(await purgeIds(batch.map((row) => row.draft_id))).toBe(batch.length);
    }

    expect(pages).toBe(3); // 5 drafts, 2 per page
    expect(seenDrafts.sort()).toEqual([...expired].sort());
    // Every key of every deleted draft reached the caller before its row went away.
    expect(seenKeys).toHaveLength(10);
    expect(new Set(seenKeys).size).toBe(10);

    const survivors = await db.query(
      `select prompt from public.pre_auth_event_drafts order by prompt`,
    );
    expect(survivors.rows.map((r) => r.prompt)).toEqual(["claimed", "fresh"]);
    const assets = await db.query(`select storage_key from public.inspiration_assets order by 1`);
    expect(assets.rows.map((r) => r.storage_key)).toEqual([
      "drafts/fresh-1",
      "drafts/fresh-2",
      "events/kept.png",
    ]);
  });

  it("never deletes a draft the caller did not name", async () => {
    const expired = await seed();
    const [first, ...rest] = expired;
    expect(await purgeIds([first!])).toBe(1);
    const remaining = await db.query(
      `select count(*)::int as n from public.pre_auth_event_drafts where id = any($1)`,
      [rest],
    );
    expect(remaining.rows[0].n).toBe(rest.length);
    const keys = await db.query(
      `select count(*)::int as n from public.inspiration_assets where pre_auth_draft_id = any($1)`,
      [rest],
    );
    expect(keys.rows[0].n).toBe(rest.length * 2);
  });

  it("ignores named drafts that are fresh or claimed, and refuses a cutoff in the future", async () => {
    await seed();
    const { rows: all } = await db.query(`select id from public.pre_auth_event_drafts`);
    const ids = all.map((r) => r.id as string);
    expect(
      await errorCode(
        db.query(`select public.purge_pre_auth_drafts(now() + interval '1 minute', $1)`, [ids]),
      ),
    ).toBe("P0001");
    expect(await purgeIds(ids)).toBe(5); // the fresh and claimed drafts survive being named
    expect(await purgeIds([])).toBe(0);
  });

  it("refuses a page size the Data API could truncate", async () => {
    expect(await errorCode(page(0))).toBe("P0001");
    expect(await errorCode(page(501))).toBe("P0001");
    expect(await page(500)).toEqual([]);
  });

  it("sweeps stale counters without touching live ones", async () => {
    await db.query(
      `insert into public.rate_limits (bucket, key_hash, window_start) values
         ('draft:write:ip', '\\x01', now() - interval '3 days'),
         ('draft:write:ip', '\\x02', now())`,
    );
    const { rows } = await db.query(`select public.purge_stale_rate_limits() as n`);
    expect(rows[0].n).toBe(1);
    const left = await db.query(`select count(*)::int as n from public.rate_limits`);
    expect(left.rows[0].n).toBe(1);
  });

  it("keeps every expiry function server-only", async () => {
    for (const call of [
      "public.expired_pre_auth_draft_batch(now(), 10)",
      "public.purge_pre_auth_drafts(now(), null::uuid[])",
      "public.purge_stale_rate_limits()",
    ]) {
      for (const actor of [{ kind: "user" as const, id: owner }, { kind: "anon" as const }]) {
        expect(
          await errorCode(asActor(db, actor, (q) => q(`select ${call}`))),
          `${call} ${actor.kind}`,
        ).toBe("42501");
      }
      expect(
        await errorCode(asActor(db, { kind: "service" }, (q) => q(`select ${call}`))),
        call,
      ).toBeNull();
    }
  });
});
