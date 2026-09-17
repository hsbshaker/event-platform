import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { asActor, connect, createAuthUser, errorCode, resetDatabase } from "./harness";

/**
 * Phase 4B T9A — the claim that makes uniqueness happen before spend.
 *
 * `docs/phase-4b-plan.md §A.5`–`§A.8`; `docs/development-plan.md` principle 4; `spec.md §10`,
 * `§9.6`, `§6`, `§32 #41`.
 *
 * The properties here are the ones that cost money when they are wrong, so almost every test is
 * written against the failure it prevents rather than the happy path:
 *
 *   * a refused request must consume nothing — not a cap unit, not a claim, not a call;
 *   * two requests that would send the same bytes must produce one claim;
 *   * a captured paid response must never need a second model call, and must never wedge the
 *     event behind a key the host can no longer derive;
 *   * a ceiling that sums nulls as zero is worse than no ceiling, because it reports safety.
 *
 * Acceptance criteria: N/A — the migration is exercised here; product behaviour is T10's.
 */
let db: Client;
let owner: string;
let eventId: string;
let otherEventId: string;

const K = (s: string) => Buffer.from(s.padEnd(32, "x").slice(0, 32));

const CLAIM = `select * from public.claim_identity_call(
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`;

interface ClaimOpts {
  event?: string;
  user?: string;
  basis?: string;
  ordinal?: number;
  lease?: number;
  eventMax?: number;
  accountMax?: number;
  rateMax?: number;
  ceilingUsd?: number;
  logicalMaxUsd?: number;
  accountKey?: string;
  answerIds?: string[];
  providerConfig?: Record<string, string>;
}

function claimArgs(key: string, o: ClaimOpts = {}) {
  const event = o.event ?? eventId;
  return [
    event,
    o.user ?? owner,
    key,
    o.basis ?? "basis-a",
    o.ordinal ?? 0,
    o.answerIds ?? [],
    JSON.stringify(o.providerConfig ?? { model: "gpt-5.6-sol" }),
    o.lease ?? 900,
    K(`e:${event}`),
    86_400,
    o.eventMax ?? 20,
    K(`a:${o.accountKey ?? owner}`),
    86_400,
    o.accountMax ?? 40,
    K(`r:${o.accountKey ?? owner}`),
    60,
    o.rateMax ?? 10,
    86_400,
    o.ceilingUsd ?? 1000,
    o.logicalMaxUsd ?? 30,
  ];
}

async function claim(key: string, o: ClaimOpts = {}, client: Client = db) {
  const { rows } = await client.query(CLAIM, claimArgs(key, o));
  return rows[0] as {
    outcome: string;
    claim_id: string | null;
    recorded_spend_usd: string;
    reserved_usd: string;
  };
}

const RUN = {
  provider: "openai",
  provider_request_id: "resp_accepted",
  model: "gpt-5.6-sol",
  input_tokens: 100,
  cached_input_tokens: 0,
  cache_write_input_tokens: 40,
  output_tokens: 200,
  reasoning_tokens: 50,
  cost_estimate_usd: 0.5,
  latency_ms: 1234,
  prompt_version: "event_identity_v5",
  schema_version: "event_identity_schema_v5",
  input_assembly_version: "event_identity_input_v2",
  schema_valid_first_call: true,
  reprompts: [],
  provider_response_evidence: ['{"one":1}'],
};

async function capture(
  claimId: string,
  success = true,
  patch: Record<string, unknown> = {},
  client: Client = db,
) {
  const { rows } = await client.query(
    `select public.capture_identity_call_response($1,$2,$3::jsonb) as run_id`,
    [claimId, success, JSON.stringify({ ...RUN, ...patch })],
  );
  return rows[0].run_id as string | null;
}

const RESULT = {
  identity: { copyTone: "warm" },
  suppliedFacts: {},
  clarification: { needed: false, questions: [] },
};

const BOUNDARY_RESULT = {
  identity: { copyTone: "warm" },
  suppliedFacts: {},
  clarification: {
    needed: true,
    questions: [
      {
        kind: "boundary",
        question: "Has she agreed?",
        whyItMatters: "not ours to decide",
        options: [
          { label: "Yes", isDefer: false },
          { label: "No", isDefer: false },
        ],
      },
    ],
  },
};

async function complete(claimId: string, result: unknown = RESULT, client: Client = db) {
  const { rows } = await client.query(`select * from public.complete_identity_call($1,$2::jsonb)`, [
    claimId,
    JSON.stringify(result),
  ]);
  return rows[0] as
    | { revision_id: string; revision: number; is_provisional: boolean; authoritative: boolean }
    | undefined;
}

const stateOf = async (claimId: string, client: Client = db) =>
  (await client.query(`select state from public.event_identity_call_claims where id=$1`, [claimId]))
    .rows[0].state as string;

const buckets = async () =>
  (await db.query(`select bucket, count from public.rate_limits order by bucket`)).rows as {
    bucket: string;
    count: number;
  }[];

beforeAll(async () => {
  db = await connect();
  await resetDatabase(db);
}, 120_000);

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await db.query(
    "truncate public.events cascade; delete from auth.users; delete from public.rate_limits",
  );
  owner = await createAuthUser(db, "owner@example.com", "Owner");
  const { rows } = await db.query(
    `insert into public.events (owner_id, prompt) values ($1,'a spring garden shower') returning id`,
    [owner],
  );
  eventId = rows[0].id;
  const other = await db.query(
    `insert into public.events (owner_id, prompt) values ($1,'another event') returning id`,
    [owner],
  );
  otherEventId = other.rows[0].id;
});

/* ------------------------------------------------------------------ uniqueness before spend */

describe("uniqueness happens before spend", () => {
  it("gives two simultaneous identical requests one claim, not two", async () => {
    const a = await connect();
    const b = await connect();
    try {
      const [ra, rb] = await Promise.all([claim("same", {}, a), claim("same", {}, b)]);
      const outcomes = [ra.outcome, rb.outcome];
      // Exactly one wins. Which uniqueness the loser trips — the attempt key or the one-in-flight
      // index — depends on index order, so the assertion is on the outcome that matters: one
      // claim, one refusal, and the refusal is not a claim.
      expect(outcomes.filter((o) => o === "claimed")).toHaveLength(1);
      expect(outcomes.filter((o) => o === "duplicate_key" || o === "in_flight")).toHaveLength(1);
      const { rows } = await db.query(
        `select count(*)::int c from public.event_identity_call_claims where event_id=$1`,
        [eventId],
      );
      expect(rows[0].c).toBe(1);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it("refuses a second in-flight call for the event even when the key differs", async () => {
    // A rolling deploy between a host's request and their refresh changes `model_config_digest`,
    // so the key differs and the attempt-key index would let a second paid call through. This is
    // the guard that does not.
    await claim("k1", { basis: "before-deploy" });
    const second = await claim("k2", { basis: "after-deploy" });
    expect(second.outcome).toBe("in_flight");
    expect(second.claim_id).not.toBeNull();
  });

  it("lets a different event claim while this one is in flight", async () => {
    await claim("k1");
    expect((await claim("k2", { event: otherEventId })).outcome).toBe("claimed");
  });
});

/* ------------------------------------------------------------------ refusals cost nothing */

describe("a refused request consumes nothing", () => {
  it.each([
    ["the ceiling", { ceilingUsd: 1, logicalMaxUsd: 30 }, "ceiling"],
    ["the per-event cap", { eventMax: 1 }, "cap_event"],
    ["the per-account cap", { accountMax: 1 }, "cap_account"],
    ["the rate limit", { rateMax: 1 }, "rate_limited"],
  ])("rolls back every bucket when %s refuses", async (_label, opts, expected) => {
    // The caps are consumed in order inside one transaction precisely so a later refusal does not
    // leave an earlier bucket spent. Consuming per rule in its own round trip — which is what the
    // existing `enforceRateLimit` does — would silently charge a refused host quota.
    if (expected !== "ceiling") {
      // Spend the single permitted unit, then settle so the next call is not merely in-flight.
      const first = await claim("warm", opts as ClaimOpts);
      expect(first.outcome).toBe("claimed");
      await db.query(
        `update public.event_identity_call_claims set state='failed_terminal' where id=$1`,
        [first.claim_id],
      );
    }
    const before = await buckets();
    const refused = await claim("cold", { ...(opts as ClaimOpts), basis: "b2" });
    expect(refused.outcome).toBe(expected);
    expect(await buckets()).toEqual(before);
    const { rows } = await db.query(
      `select count(*)::int c from public.event_identity_call_claims where attempt_key='cold'`,
    );
    expect(rows[0].c).toBe(0);
  });

  it("consumes no unit at all when the very first control refuses", async () => {
    expect((await claim("k", { ceilingUsd: 1, logicalMaxUsd: 30 })).outcome).toBe("ceiling");
    expect(await buckets()).toEqual([]);
  });
});

/* ------------------------------------------------------------------ the ceiling's arithmetic */

describe("the spend ceiling", () => {
  it("reserves the logical-call maximum for every claim still in flight", async () => {
    const first = await claim("k1");
    expect(first.outcome).toBe("claimed");
    const probe = await claim("k2", { event: otherEventId });
    expect(Number(probe.reserved_usd)).toBe(30);
  });

  it("counts a null cost_estimate_usd as the logical-call maximum, never as zero", async () => {
    // A ceiling that sums nulls as zero reports safety it does not have. `cost_estimate_usd` is
    // nullable and nothing populated it before T9A, so this is the realistic shape of the bug.
    const c = await claim("k1");
    await capture(c.claim_id!, true, { cost_estimate_usd: null });
    await db.query(`update public.event_identity_call_claims set state='succeeded' where id=$1`, [
      c.claim_id,
    ]);
    const probe = await claim("k2", { basis: "b2" });
    expect(Number(probe.recorded_spend_usd)).toBe(30);
  });

  it("adds recorded spend to the reservation before admitting another call", async () => {
    const c = await claim("k1");
    await capture(c.claim_id!, true, { cost_estimate_usd: 9 });
    await db.query(`update public.event_identity_call_claims set state='succeeded' where id=$1`, [
      c.claim_id,
    ]);
    const refused = await claim("k2", { basis: "b2", ceilingUsd: 10, logicalMaxUsd: 2 });
    expect(refused.outcome).toBe("ceiling");
    expect(Number(refused.recorded_spend_usd)).toBe(9);
  });

  it("keeps a possibly-paid expired claim on the books", async () => {
    // `expired_unknown` means the provider was invoked and we never learned the outcome, so
    // §A.5.1 rule 2 costs it at the maximum. It is terminal and has no run row, so without an
    // explicit term the money would vanish from the ceiling the instant the claim settled — fail
    // open in exactly the ambiguous, expensive case the rule exists for.
    const c = await claim("k1");
    await db.query(`select public.mark_identity_call_invoked($1)`, [c.claim_id]);
    await db.query(
      `update public.event_identity_call_claims set lease_expires_at = now() - interval '1 minute'`,
    );
    await db.query(`select * from public.expire_identity_call_claims(10)`);

    const probe = await claim("k2", { basis: "b2" });
    expect(Number(probe.reserved_usd)).toBe(30);
  });

  it("lets a possibly-paid expired claim age out of the window", async () => {
    const c = await claim("k1");
    await db.query(`select public.mark_identity_call_invoked($1)`, [c.claim_id]);
    await db.query(
      `update public.event_identity_call_claims set lease_expires_at = now() - interval '1 minute'`,
    );
    await db.query(`select * from public.expire_identity_call_claims(10)`);
    await db.query(
      `update public.event_identity_call_claims set settled_at = now() - interval '2 days'`,
    );
    const probe = await claim("k2", { basis: "b2" });
    expect(Number(probe.reserved_usd)).toBe(0);
  });

  it("admits exactly one of two concurrent claims on different events", async () => {
    // The race that matters is across events: the one-in-flight index serializes a single event,
    // and nothing serialized the project budget, so N simultaneous claimers each read the same
    // reservation, each concluded there was room, and all passed — a ceiling times the
    // concurrency. The advisory lock inside `claim_identity_call` is what makes it a ceiling.
    //
    // Sized so exactly one more reservation fits: ceiling 30, logical-call maximum 30, nothing
    // recorded and nothing reserved.
    const a = await connect();
    const b = await connect();
    try {
      const opts = { ceilingUsd: 30, logicalMaxUsd: 30 };
      const [ra, rb] = await Promise.all([
        claim("ka", { ...opts, event: eventId, basis: "ba" }, a),
        claim("kb", { ...opts, event: otherEventId, basis: "bb" }, b),
      ]);
      const outcomes = [ra.outcome, rb.outcome].sort();
      expect(outcomes).toEqual(["ceiling", "claimed"]);

      // One claim, and it is the admitted one.
      const { rows: claims } = await db.query(
        `select event_id from public.event_identity_call_claims`,
      );
      expect(claims).toHaveLength(1);

      // The refused transaction consumed nothing: not the event cap of *its* event, not the
      // account cap, not the rate limit. Three buckets, one unit each, from the winner alone.
      const consumed = await buckets();
      expect(consumed.map((r) => r.bucket).sort()).toEqual([
        "identity:account:day",
        "identity:account:rate",
        "identity:event:day",
      ]);
      for (const row of consumed) expect(row.count).toBe(1);

      // And the admitted reservation exactly fills the ceiling, so a third is refused by the
      // budget rather than by uniqueness — the ceiling check runs before the insert.
      const third = await claim("kc", { ...opts, event: otherEventId, basis: "bc" });
      expect(third.outcome).toBe("ceiling");
      expect(Number(third.reserved_usd)).toBe(30);
      expect(Number(third.recorded_spend_usd) + Number(third.reserved_usd)).toBeLessThanOrEqual(30);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it("dates a claim from when it was created, not from when its transaction started", async () => {
    // `now()` is transaction-*start* time. This transaction starts, then queues behind the global
    // budget lock, and only then inserts — so a column defaulted to `now()` would date the claim
    // from before the wait. Two horizons are measured as elapsed time from that column, and both
    // would be silently shortened by however long the queue was: a claim that waited forty seconds
    // would be born already eligible for the thirty-second pre-invocation reclaim, and a perfectly
    // healthy driver could have its claim taken before it ever reached the provider.
    //
    // The wait here is a second, not thirty: what is proven is that the timestamp advances *with*
    // the wait, which is the property. A thirty-second sleep would prove the same thing slower.
    const holder = await connect();
    const waiter = await connect();
    const WAIT_MS = 1_000;
    const LEASE = 900;
    try {
      await holder.query("begin");
      await holder.query(`select pg_advisory_xact_lock(public.identity_budget_lock_key())`);

      // The waiter's transaction begins **now**, before the lock is released, so its `now()` is
      // pinned here while real time moves on.
      await waiter.query("begin");
      const started = (await waiter.query(`select pg_catalog.now() as t`)).rows[0].t as Date;

      const claimed = waiter.query(CLAIM, claimArgs("timing", { lease: LEASE }));
      await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
      await holder.query("commit");
      const { rows } = await claimed;
      expect(rows[0].outcome).toBe("claimed");
      await waiter.query("commit");

      const row = (
        await db.query(
          `select claimed_at, lease_expires_at,
                  extract(epoch from (claimed_at - $2::timestamptz)) as after_start,
                  extract(epoch from (lease_expires_at - claimed_at)) as lease_seconds
             from public.event_identity_call_claims where id = $1`,
          [rows[0].claim_id, started.toISOString()],
        )
      ).rows[0];

      // 1. The claim is dated after the wait, not at transaction start. This is the assertion
      //    that discriminates: under the old `now()` default it is exactly 0. The 0.9 rather than
      //    1.0 is for the millisecond `toISOString()` floors away and the odd early timer.
      expect(Number(row.after_start)).toBeGreaterThanOrEqual(WAIT_MS / 1000 - 0.1);

      // 2. The lease is the configured lease measured from that same instant. Together with (1)
      //    this is the whole property: both horizons start when the claim was created, so the
      //    admission wait consumed neither.
      expect(Number(row.lease_seconds)).toBe(LEASE);

      // 3. And the effect that matters: the claim is not already eligible for the pre-invocation
      //    reclaim, and its remaining lease still exceeds what the wait would have taken off it.
      //    Neither of these discriminates on its own at a one-second wait — they are the
      //    consequence, stated so a reader can see it, not the evidence.
      const reclaimed = await db.query(
        `select public.reclaim_uninvoked_identity_claims(30, $1, 10) as n`,
        [eventId],
      );
      expect(reclaimed.rows[0].n).toBe(0);
      const remaining = (
        await db.query(
          `select extract(epoch from (lease_expires_at - pg_catalog.clock_timestamp())) as s
             from public.event_identity_call_claims where id = $1`,
          [rows[0].claim_id],
        )
      ).rows[0].s;
      expect(Number(remaining)).toBeGreaterThan(LEASE - WAIT_MS / 1000);
    } finally {
      await holder.end();
      await waiter.end();
    }
  });

  it("actually blocks on the budget key, and releases it at commit", async () => {
    // Proves the lock is on the admission path rather than merely present: a second connection
    // holding the same key makes a claim wait, and `lock_timeout` turns that wait into a visible
    // failure instead of a hang.
    const holder = await connect();
    const waiter = await connect();
    try {
      await holder.query("begin");
      await holder.query(`select pg_advisory_xact_lock(public.identity_budget_lock_key())`);

      await waiter.query("set lock_timeout = '300ms'");
      const code = await errorCode(waiter.query(CLAIM, claimArgs("k1")));
      expect(code).toBe("55P03");

      // Released by commit — transaction-scoped, nothing to leak and nothing to clean up.
      await holder.query("commit");
      expect((await claim("k1", {}, waiter)).outcome).toBe("claimed");
    } finally {
      await holder.end();
      await waiter.end();
    }

    // And nothing holds it afterwards. Scoped to this key, so a concurrently running suite's own
    // advisory lock cannot make this pass or fail for an unrelated reason.
    const { rows } = await db.query(
      `select count(*)::int c from pg_locks
        where locktype = 'advisory'
          and ((classid::bigint << 32) | objid::bigint) = public.identity_budget_lock_key()`,
    );
    expect(rows[0].c).toBe(0);
  });

  it("refuses to admit outside READ COMMITTED rather than silently overshooting", async () => {
    // The lock orders the admissions; READ COMMITTED's per-statement snapshot is what makes the
    // reads see the other claimer's committed work. Under a fixed snapshot both would serialize on
    // the lock and still read `reserved = 0` — the overshoot back, with the lock apparently in
    // place and the tests still green.
    const c = await connect();
    try {
      await c.query("begin isolation level repeatable read");
      const code = await errorCode(c.query(CLAIM, claimArgs("k1")));
      expect(code).toBe("25000");
      await c.query("rollback");
    } finally {
      await c.end();
    }
  });

  it("holds no reservation for a claim that expired without ever reaching the provider", async () => {
    // Provably unpaid: it can never spend, so reserving the maximum against it charges the project
    // for money nobody can spend. Expiry only happens in the housekeeping job, which runs once a
    // day, so ten instances dying mid-deploy would otherwise freeze nine hundred dollars of a
    // ceiling nobody was spending against, for up to twenty-four hours.
    // Probed from the same event, so the probe itself adds no reservation: `reserved_usd` is
    // computed before the insert and the one-in-flight index refuses it afterwards.
    const c = await claim("k1");
    expect(Number((await claim("k2", { basis: "b2" })).reserved_usd)).toBe(30);

    await db.query(
      `update public.event_identity_call_claims set lease_expires_at = now() - interval '1 minute'
        where id = $1`,
      [c.claim_id],
    );
    expect(Number((await claim("k3", { basis: "b3" })).reserved_usd)).toBe(0);
  });

  it("still reserves for an expired claim that had already reached the provider", async () => {
    // Possibly paid, and not yet settled into `expired_unknown`. Dropping it would be fail-open in
    // the ambiguous case the reservation exists for.
    const c = await claim("k1");
    await db.query(`select public.mark_identity_call_invoked($1)`, [c.claim_id]);
    await db.query(
      `update public.event_identity_call_claims set lease_expires_at = now() - interval '1 minute'
        where id = $1`,
      [c.claim_id],
    );
    expect(Number((await claim("k2", { basis: "b2" })).reserved_usd)).toBe(30);
  });

  it("ignores spend outside the ceiling window", async () => {
    const c = await claim("k1");
    await capture(c.claim_id!, true, { cost_estimate_usd: 900 });
    await db.query(`update public.event_identity_call_claims set state='succeeded' where id=$1`, [
      c.claim_id,
    ]);
    await db.query(`update public.generation_runs set created_at = now() - interval '2 days'`);
    const probe = await claim("k2", { basis: "b2" });
    expect(probe.outcome).toBe("claimed");
    expect(Number(probe.recorded_spend_usd)).toBe(0);
  });
});

/* ------------------------------------------------------------------ the call's own steps */

describe("provider_invoked_at", () => {
  it("is committed before the provider is reached, once", async () => {
    const c = await claim("k1");
    const ok = await db.query(`select public.mark_identity_call_invoked($1) as ok`, [c.claim_id]);
    expect(ok.rows[0].ok).toBe(true);
    const again = await db.query(`select public.mark_identity_call_invoked($1) as ok`, [
      c.claim_id,
    ]);
    expect(again.rows[0].ok).toBe(false);
  });

  it("decides abandoned versus expired_unknown at expiry", async () => {
    // `abandoned` is the one transition that lets a new call start without a host deciding to
    // retry, so it may only be reached from a committed null: provably unpaid.
    const unpaid = await claim("k1");
    const maybePaid = await claim("k2", { event: otherEventId });
    await db.query(`select public.mark_identity_call_invoked($1)`, [maybePaid.claim_id]);
    await db.query(
      `update public.event_identity_call_claims set lease_expires_at = now() - interval '1 minute'`,
    );

    const { rows } = await db.query(`select * from public.expire_identity_call_claims(10)`);
    expect(rows[0]).toMatchObject({ abandoned: 1, expired_unknown: 1 });
    expect(await stateOf(unpaid.claim_id!)).toBe("abandoned");
    expect(await stateOf(maybePaid.claim_id!)).toBe("expired_unknown");
  });

  it("never expires a claim holding a captured response", async () => {
    // Expiring `response_captured` is what would strand a paid response behind a key the host can
    // no longer derive. It has no expiry path on purpose.
    const c = await claim("k1");
    await capture(c.claim_id!);
    await db.query(
      `update public.event_identity_call_claims set lease_expires_at = now() - interval '1 day'`,
    );
    const { rows } = await db.query(`select * from public.expire_identity_call_claims(10)`);
    expect(rows[0]).toMatchObject({ abandoned: 0, expired_unknown: 0 });
    expect(await stateOf(c.claim_id!)).toBe("response_captured");
  });
});

describe("the capture commit", () => {
  it("stamps the attempt key into the already-unique idempotency_key", async () => {
    const c = await claim("attempt-key-1");
    const runId = await capture(c.claim_id!);
    const { rows } = await db.query(
      `select idempotency_key, cache_write_input_tokens, cached_input_tokens
         from public.generation_runs where id=$1`,
      [runId],
    );
    expect(rows[0].idempotency_key).toBe("attempt-key-1");
    // Cache writes and cache reads are separate billable classes and are stored separately.
    expect(rows[0].cache_write_input_tokens).toBe(40);
    expect(rows[0].cached_input_tokens).toBe(0);
  });

  it("returns its own earlier row when a capture is retried, and writes no second one", async () => {
    // A capture whose HTTP response was lost is retried. The unique attempt key is what makes the
    // retry find its own row rather than double-count the spend the ceiling reads back — and the
    // caller gets the run id, because "already done by me" is not "settled by someone else".
    const c = await claim("k1");
    const first = await capture(c.claim_id!);
    const second = await capture(c.claim_id!);
    expect(second).toBe(first);
    const { rows } = await db.query(`select count(*)::int c from public.generation_runs`);
    expect(rows[0].c).toBe(1);
  });

  it("records a response that arrived after the claim had already expired", async () => {
    // The race the lease margin makes unlikely and does not make impossible. Refusing to write
    // here would throw away both the paid response and the money it cost — the one outcome this
    // whole mechanism exists to prevent — so the run row is written whatever the claim's state is
    // and only the transition is conditional.
    const c = await claim("k1");
    await db.query(`select public.mark_identity_call_invoked($1)`, [c.claim_id]);
    await db.query(
      `update public.event_identity_call_claims set lease_expires_at = now() - interval '1 minute'`,
    );
    await db.query(`select * from public.expire_identity_call_claims(10)`);
    expect(await stateOf(c.claim_id!)).toBe("expired_unknown");

    const runId = await capture(c.claim_id!, true, { cost_estimate_usd: 7 });
    expect(runId).not.toBeNull();
    const { rows } = await db.query(
      `select cost_estimate_usd, provider_response_evidence from public.generation_runs where id=$1`,
      [runId],
    );
    expect(Number(rows[0].cost_estimate_usd)).toBe(7);
    expect(rows[0].provider_response_evidence).toEqual(['{"one":1}']);
    // The claim stays terminal: a host retry already governs what happens next.
    expect(await stateOf(c.claim_id!)).toBe("expired_unknown");
  });

  it("writes a run row on the failure path too, from request-side values", async () => {
    // `model`, `latency_ms`, `success`, `prompt_version` and `schema_version` are NOT NULL and
    // arrive on no error object.
    const c = await claim("k1");
    const runId = await capture(c.claim_id!, false, {
      error_code: "invalid_output",
      cost_estimate_usd: 30,
      provider_response_evidence: ['{"a":1}', '{"b":2}'],
    });
    expect(runId).not.toBeNull();
    expect(await stateOf(c.claim_id!)).toBe("failed_terminal");
    const { rows } = await db.query(
      `select success, error_code, model, latency_ms from public.generation_runs where id=$1`,
      [runId],
    );
    expect(rows[0]).toMatchObject({ success: false, error_code: "invalid_output" });
  });
});

/* ------------------------------------------------------------------ completion and recovery */

describe("completing a captured response", () => {
  it("appends the revision and moves the pointer in one transaction", async () => {
    const c = await claim("k1");
    await capture(c.claim_id!);
    const done = await complete(c.claim_id!);
    expect(done).toMatchObject({ revision: 1, is_provisional: false, authoritative: true });
    const { rows } = await db.query(
      `select authoritative_identity_revision_id from public.events where id=$1`,
      [eventId],
    );
    expect(rows[0].authoritative_identity_revision_id).toBe(done!.revision_id);
  });

  it("leaves the pointer alone for a provisional result", async () => {
    const c = await claim("k1");
    await capture(c.claim_id!);
    const done = await complete(c.claim_id!, BOUNDARY_RESULT);
    expect(done).toMatchObject({ is_provisional: true, authoritative: false });
    const { rows } = await db.query(
      `select authoritative_identity_revision_id from public.events where id=$1`,
      [eventId],
    );
    expect(rows[0].authoritative_identity_revision_id).toBeNull();
  });

  it("copies provider, model and versions from the run rather than from the caller", async () => {
    const c = await claim("k1");
    await capture(c.claim_id!, true, { provider_request_id: "resp_xyz" });
    const done = await complete(c.claim_id!);
    const { rows } = await db.query(
      `select provider, model, prompt_version, schema_version, input_assembly_version,
              provider_request_id, generation_run_id
         from public.event_identity_revisions where id=$1`,
      [done!.revision_id],
    );
    expect(rows[0]).toMatchObject({
      provider: "openai",
      model: "gpt-5.6-sol",
      prompt_version: "event_identity_v5",
      schema_version: "event_identity_schema_v5",
      input_assembly_version: "event_identity_input_v2",
      provider_request_id: "resp_xyz",
    });
  });

  it("produces exactly one revision when two completers race", async () => {
    // `validate_identity_revision()` recomputes max(revision)+1 at insert, so the late completer
    // does NOT collide on unique (event_id, revision) — it would append a second revision of one
    // paid response and repoint the event at the duplicate. The conditional transition is the
    // gate; `unique (generation_run_id)` is the same invariant as a database fact.
    const c = await claim("k1");
    await capture(c.claim_id!);
    const a = await connect();
    const b = await connect();
    try {
      const results = await Promise.allSettled([
        complete(c.claim_id!, RESULT, a),
        complete(c.claim_id!, RESULT, b),
      ]);
      const wrote = results.filter((r) => r.status === "fulfilled" && r.value !== undefined);
      expect(wrote).toHaveLength(1);
    } finally {
      await a.end();
      await b.end();
    }
    const { rows } = await db.query(
      `select count(*)::int c from public.event_identity_revisions where event_id=$1`,
      [eventId],
    );
    expect(rows[0].c).toBe(1);
  });

  it("refuses a second revision for one generation run, whatever the code path does", async () => {
    const c = await claim("k1");
    const runId = await capture(c.claim_id!);
    await complete(c.claim_id!);
    const code = await errorCode(
      db.query(
        `insert into public.event_identity_revisions
           (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
            provider, model, generation_run_id)
         values ($1, 2, $2::jsonb, 'event_identity_v5', 'event_identity_schema_v5',
                 'event_identity_input_v2', 'openai', 'gpt-5.6-sol', $3)`,
        [eventId, JSON.stringify(RESULT), runId],
      ),
    );
    expect(code).toBe("23505");
  });

  it("is a no-op, not an error, when the claim was already completed", async () => {
    const c = await claim("k1");
    await capture(c.claim_id!);
    expect(await complete(c.claim_id!)).toBeDefined();
    expect(await complete(c.claim_id!)).toBeUndefined();
  });

  it("surfaces a captured claim to the sweeper until someone completes it", async () => {
    const c = await claim("k1");
    await capture(c.claim_id!);
    const pending = await db.query(`select * from public.pending_identity_call_completions(10)`);
    expect(pending.rows).toHaveLength(1);
    expect(pending.rows[0]).toMatchObject({
      claim_id: c.claim_id,
      event_id: eventId,
      schema_version: "event_identity_schema_v5",
    });
    await complete(c.claim_id!);
    expect(
      (await db.query(`select * from public.pending_identity_call_completions(10)`)).rows,
    ).toHaveLength(0);
  });

  it("unblocks the event once the captured response is completed", async () => {
    // The wedge, end to end: while a captured claim sits unrecovered the one-in-flight index
    // refuses every new call, including a legitimate one. Completing it is what releases the
    // event — and it needs no second model call, because the response is already durable.
    const c = await claim("k1");
    await capture(c.claim_id!);
    expect((await claim("k2", { basis: "b2" })).outcome).toBe("in_flight");
    await complete(c.claim_id!);
    expect((await claim("k2", { basis: "b2" })).outcome).toBe("claimed");
  });
});

/* ------------------------------------------------------------------ paid-response evidence */

describe("provider_response_evidence", () => {
  it.each([
    ["a first-call success", ['{"accepted":1}']],
    ["a success after repair", ['{"rejected":1}', '{"accepted":1}']],
    ["a provider failure that got nothing back", []],
    ["a provider failure on the repair attempt", ['{"first":1}']],
    ["an invalid-output failure", ['{"first":1}', '{"second":1}']],
  ])("stores the ordered texts for %s", async (_label, evidence) => {
    const c = await claim(`k-${_label}`);
    const runId = await capture(c.claim_id!, true, { provider_response_evidence: evidence });
    const { rows } = await db.query(
      `select provider_response_evidence from public.generation_runs where id=$1`,
      [runId],
    );
    expect(rows[0].provider_response_evidence).toEqual(evidence);
  });

  it("distinguishes null (contract does not apply) from [] (nothing captured)", async () => {
    // Not the same, and neither is a silent drop. `[]` is emphatically NOT a claim that nothing
    // was billed: an ambiguous transport failure can reach provider execution.
    const c = await claim("k1");
    const runId = await capture(c.claim_id!, false, { provider_response_evidence: [] });
    const captured = await db.query(
      `select provider_response_evidence from public.generation_runs where id=$1`,
      [runId],
    );
    expect(captured.rows[0].provider_response_evidence).toEqual([]);

    const legacy = await db.query(
      `insert into public.generation_runs
         (event_id, provider, operation, model, latency_ms, success, prompt_version, schema_version)
       values ($1,'openai','design_intent','m',1,true,'v','s')
       returning provider_response_evidence`,
      [eventId],
    );
    expect(legacy.rows[0].provider_response_evidence).toBeNull();
  });

  it("refuses anything that is not a JSON array", async () => {
    const code = await errorCode(
      db.query(
        `insert into public.generation_runs
           (event_id, provider, operation, model, latency_ms, success, prompt_version,
            schema_version, provider_response_evidence)
         values ($1,'openai','event_identity','m',1,true,'v','s','{"not":"an array"}'::jsonb)`,
        [eventId],
      ),
    );
    expect(code).toBe("23514");
  });
});

describe("evidence retention", () => {
  const age = (days: number) =>
    db.query(`update public.generation_runs set created_at = now() - ($1 || ' days')::interval`, [
      String(days),
    ]);

  it("nulls aged evidence and keeps the run row and its metrics", async () => {
    const c = await claim("k1");
    const runId = await capture(c.claim_id!, true, { cost_estimate_usd: 1.25 });
    await complete(c.claim_id!);
    await age(60);
    const { rows } = await db.query(
      `select public.purge_identity_response_evidence(now() - interval '30 days') as n`,
    );
    expect(rows[0].n).toBe(1);
    const run = await db.query(
      `select provider_response_evidence, cost_estimate_usd, input_tokens, latency_ms
         from public.generation_runs where id=$1`,
      [runId],
    );
    expect(run.rows[0].provider_response_evidence).toBeNull();
    expect(Number(run.rows[0].cost_estimate_usd)).toBe(1.25);
    expect(run.rows[0].input_tokens).toBe(100);
  });

  it("skips every run a non-terminal claim still needs", async () => {
    // `response_captured` has no expiry by design, so nulling its evidence would leave a claim
    // that can never be completed and never expires — the permanent wedge, reintroduced through
    // the retention rule instead of the state machine.
    const c = await claim("k1");
    const runId = await capture(c.claim_id!);
    await age(60);
    expect(
      (
        await db.query(
          `select public.purge_identity_response_evidence(now() - interval '30 days') as n`,
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await db.query(
          `select provider_response_evidence from public.generation_runs where id=$1`,
          [runId],
        )
      ).rows[0].provider_response_evidence,
    ).not.toBeNull();

    await complete(c.claim_id!);
    expect(
      (
        await db.query(
          `select public.purge_identity_response_evidence(now() - interval '30 days') as n`,
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it("leaves evidence inside the retention window alone", async () => {
    const c = await claim("k1");
    await capture(c.claim_id!);
    await complete(c.claim_id!);
    await age(10);
    expect(
      (
        await db.query(
          `select public.purge_identity_response_evidence(now() - interval '30 days') as n`,
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it("marks a purged run so it stays distinguishable from one the contract never covered", async () => {
    // Nulling the column on purge would destroy the very distinction the three values are for:
    // afterwards a purged run and a pre-contract run look identical forever.
    const c = await claim("k1");
    const runId = await capture(c.claim_id!);
    await complete(c.claim_id!);
    await age(60);
    await db.query(`select public.purge_identity_response_evidence(now() - interval '30 days')`);
    const { rows } = await db.query(
      `select provider_response_evidence, provider_response_evidence_purged_at
         from public.generation_runs where id=$1`,
      [runId],
    );
    expect(rows[0].provider_response_evidence).toBeNull();
    expect(rows[0].provider_response_evidence_purged_at).not.toBeNull();
  });

  it("refuses a cutoff in the future", async () => {
    await expect(
      db.query(`select public.purge_identity_response_evidence(now() + interval '1 day')`),
    ).rejects.toThrow(/future/);
  });
});

/* ------------------------------------------------------------------ access control */

describe("server-only, on the phase-1 pattern", () => {
  it.each(["anon", "user"] as const)("hides the claims table from %s", async (kind) => {
    await claim("k1");
    const actor =
      kind === "anon" ? ({ kind: "anon" } as const) : ({ kind: "user", id: owner } as const);
    await asActor(db, actor, async (q) => {
      const code = await errorCode(q(`select * from public.event_identity_call_claims`));
      expect(code).toBe("42501");
    });
  });

  it.each(["anon", "user"] as const)("hides paid response evidence from %s", async (kind) => {
    const c = await claim("k1");
    await capture(c.claim_id!);
    const actor =
      kind === "anon" ? ({ kind: "anon" } as const) : ({ kind: "user", id: owner } as const);
    await asActor(db, actor, async (q) => {
      const code = await errorCode(
        q(`select provider_response_evidence from public.generation_runs`),
      );
      expect(code).toBe("42501");
    });
  });

  it.each([
    "select public.claim_identity_call(null,null,null,null,0,null,null,1,null,1,1,null,1,1,null,1,1,1,1,1)",
    "select public.mark_identity_call_invoked(null)",
    "select public.capture_identity_call_response(null,true,'{}'::jsonb)",
    "select public.complete_identity_call(null,'{}'::jsonb)",
    "select public.expire_identity_call_claims(1)",
    "select public.pending_identity_call_completions(1)",
    "select public.purge_identity_response_evidence(now())",
  ])("refuses execute to an end user: %s", async (sql) => {
    await asActor(db, { kind: "user", id: owner }, async (q) => {
      expect(await errorCode(q(sql))).toBe("42501");
    });
  });
});

/* ------------------------------------------------------------------ internal consistency */

describe("the claim state machine", () => {
  it("agrees with the partial index about which states are terminal", async () => {
    // The index inlines the non-terminal list rather than calling the function, because
    // `create or replace` on an immutable function would leave a stale index behind. This is the
    // check that keeps the two from drifting.
    const { rows } = await db.query(
      `select e.v::text as state, public.identity_claim_is_terminal(e.v) as terminal
         from unnest(enum_range(null::public.identity_call_claim_state)) e(v)`,
    );
    const terminal = Object.fromEntries(rows.map((r) => [r.state, r.terminal]));
    expect(terminal).toEqual({
      claimed: false,
      response_captured: false,
      succeeded: true,
      failed_terminal: true,
      expired_unknown: true,
      abandoned: true,
      recovery_failed: true,
    });

    const { rows: idx } = await db.query(
      `select pg_get_expr(i.indpred, i.indrelid) as predicate
         from pg_index i join pg_class c on c.oid = i.indexrelid
        where c.relname = 'event_identity_call_claims_one_in_flight'`,
    );
    for (const [state, isTerminal] of Object.entries(terminal)) {
      expect(idx[0].predicate.includes(`'${state}'`)).toBe(!isTerminal);
    }
  });

  it("refuses an answer id that is not this event's, before any money is at stake", async () => {
    // The same ids are checked again when the revision is written — but that is after the model
    // has been paid, and by then the completer may be the sweeper rather than the caller that got
    // them wrong. A caller bug would become a permanent post-spend failure.
    const otherRevision = await db.query(
      `insert into public.event_identity_revisions
         (event_id, revision, result, prompt_version, schema_version, input_assembly_version,
          provider, model)
       values ($1, 1, $2::jsonb, 'event_identity_v5', 'event_identity_schema_v5',
               'event_identity_input_v2', 'openai', 'gpt-5.6-sol') returning id`,
      [otherEventId, JSON.stringify(BOUNDARY_RESULT)],
    );
    const foreign = await db.query(
      `insert into public.clarification_answers
         (event_id, identity_revision_id, question_index, round, kind, question_text, options,
          selected_option_label, answered_by)
       values ($1, $2, 0, 1, 'boundary', 'Has she agreed?', $3::jsonb, 'Yes', $4) returning id`,
      [
        otherEventId,
        otherRevision.rows[0].id,
        JSON.stringify(BOUNDARY_RESULT.clarification.questions[0].options),
        owner,
      ],
    );

    await expect(
      db.query(CLAIM, claimArgs("k1", { answerIds: [foreign.rows[0].id] })),
    ).rejects.toThrow(/must all exist and belong to this event/);
    expect(await buckets()).toEqual([]);
    const { rows } = await db.query(
      `select count(*)::int c from public.event_identity_call_claims`,
    );
    expect(rows[0].c).toBe(0);
  });

  it("propagates a misconfiguration instead of returning it as a refusal", async () => {
    // `consume_rate_limit` raises P0001 for a non-positive window or max. Catching that class
    // would turn an operator's mistake into a silent, indistinguishable refusal carrying a
    // sentence of English where the contract promises one of six outcomes.
    await expect(db.query(CLAIM, claimArgs("k1", { rateMax: 0 }))).rejects.toThrow(
      /window and max must be positive/,
    );
  });

  it("keeps one ordinal per basis, so a retry cannot reuse a spent attempt", async () => {
    const first = await claim("k1", { ordinal: 0 });
    await db.query(`update public.event_identity_call_claims set state='abandoned' where id=$1`, [
      first.claim_id,
    ]);
    expect((await claim("k2", { ordinal: 0 })).outcome).toBe("duplicate_key");
    expect((await claim("k3", { ordinal: 1 })).outcome).toBe("claimed");
  });
});

describe("a captured response that can never be completed releases the event", () => {
  /** `maxAgeSeconds` is how long a captured response may sit unrecoverable before it is given up. */
  const fail = async (
    claimId: string,
    reason: string,
    deterministic = true,
    maxAgeSeconds = 48 * 60 * 60,
  ) =>
    (
      await db.query(`select public.fail_identity_call_recovery($1,$2,$3,$4) as outcome`, [
        claimId,
        reason,
        deterministic,
        maxAgeSeconds,
      ])
    ).rows[0].outcome as string;

  it("goes terminal, keeps the run and its evidence, and frees the in-flight slot", async () => {
    // `response_captured` is non-terminal and deliberately has no expiry, so a response nothing
    // can complete would hold this event's one slot for ever — the same wedge, arriving by the
    // recovery path instead of the crash path.
    const c = await claim("k1");
    const runId = await capture(c.claim_id!);
    expect((await claim("k2", { basis: "b2" })).outcome).toBe("in_flight");

    expect(await fail(c.claim_id!, "captured response no longer validates")).toBe("terminal");
    expect(await stateOf(c.claim_id!)).toBe("recovery_failed");

    // The paid response survives, and so does everything needed to diagnose why.
    const { rows } = await db.query(
      `select provider_response_evidence, cost_estimate_usd from public.generation_runs where id=$1`,
      [runId],
    );
    expect(rows[0].provider_response_evidence).toEqual(['{"one":1}']);
    const { rows: claimRows } = await db.query(
      `select recovery_failure_reason, recovery_attempts, settled_at
         from public.event_identity_call_claims where id=$1`,
      [c.claim_id],
    );
    expect(claimRows[0].recovery_failure_reason).toMatch(/no longer validates/);
    expect(claimRows[0].recovery_attempts).toBe(1);
    expect(claimRows[0].settled_at).not.toBeNull();

    // The event is free again, and the next attempt is an ordinary claim through every cap.
    expect((await claim("k2", { basis: "b2" })).outcome).toBe("claimed");
  });

  it("never turns a recovery-failed claim into a revision", async () => {
    const c = await claim("k1");
    await capture(c.claim_id!);
    await fail(c.claim_id!, "corrupt");
    expect(await complete(c.claim_id!)).toBeUndefined();
    const { rows } = await db.query(
      `select count(*)::int c from public.event_identity_revisions where event_id=$1`,
      [eventId],
    );
    expect(rows[0].c).toBe(0);
  });

  it("holds a possibly-transient failure however many times it recurs, while it is young", async () => {
    // Counting attempts looks equivalent to bounding age and is not: the sweep runs every fifteen
    // minutes, so three failures is forty-five minutes. One statement timeout, one migration
    // holding a lock, and every captured response in the backlog would be irreversibly terminal —
    // each of those hosts then paying again for a call that had already succeeded.
    const c = await claim("k1");
    await capture(c.claim_id!);
    for (let i = 0; i < 5; i += 1) {
      expect(await fail(c.claim_id!, "deadlock detected", false)).toBe("retryable");
    }
    expect(await stateOf(c.claim_id!)).toBe("response_captured");
    const { rows } = await db.query(
      `select recovery_attempts from public.event_identity_call_claims where id=$1`,
      [c.claim_id],
    );
    expect(rows[0].recovery_attempts).toBe(5);
  });

  it("gives up on a possibly-transient failure once the response has aged out", async () => {
    // The slot is still released eventually; it just is not released by a short outage.
    const c = await claim("k1");
    await capture(c.claim_id!);
    await db.query(`update public.generation_runs set created_at = now() - interval '3 days'`);
    expect(await fail(c.claim_id!, "deadlock detected", false)).toBe("terminal");
    expect(await stateOf(c.claim_id!)).toBe("recovery_failed");
  });

  it("is a no-op on a claim that is not holding a captured response", async () => {
    const c = await claim("k1");
    expect(await fail(c.claim_id!, "nothing to give up on")).toBe("not_captured");
    expect(await stateOf(c.claim_id!)).toBe("claimed");
  });

  it("needs an explicit retry, and the retry takes the next ordinal", async () => {
    const c = await claim("k1", { ordinal: 0 });
    await capture(c.claim_id!);
    await fail(c.claim_id!, "corrupt");
    // Same ordinal is refused — that attempt is spent — and the next one is an ordinary claim.
    expect((await claim("k2", { ordinal: 0 })).outcome).toBe("duplicate_key");
    expect((await claim("k3", { ordinal: 1 })).outcome).toBe("claimed");
  });

  it("lets the evidence age out on the ordinary schedule once terminal", async () => {
    const c = await claim("k1");
    const runId = await capture(c.claim_id!);
    await fail(c.claim_id!, "corrupt");
    await db.query(`update public.generation_runs set created_at = now() - interval '60 days'`);
    expect(
      (
        await db.query(
          `select public.purge_identity_response_evidence(now() - interval '30 days') as n`,
        )
      ).rows[0].n,
    ).toBe(1);
    const { rows } = await db.query(
      `select provider_response_evidence_purged_at from public.generation_runs where id=$1`,
      [runId],
    );
    expect(rows[0].provider_response_evidence_purged_at).not.toBeNull();
  });
});

describe("nothing batch- or sibling-shaped arrived early", () => {
  it("leaves the claim knowing about one identity call and nothing else", async () => {
    // `spec.md §10`'s one-batch-in-flight rule and the (batch_id, operation, concept_index,
    // attempt) sibling key are Phase 4C, T16. This is the half that stays true forever: whatever
    // T16 builds, it builds beside the claim rather than inside it.
    const { rows: columns } = await db.query(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='event_identity_call_claims'`,
    );
    const names = columns.map((c) => c.column_name).sort();
    expect(names).not.toContain("batch_id");
    expect(names).not.toContain("planner_version");
    expect(names).not.toContain("concept_index");
  });

  it("creates generation_batches from Phase 4C's migration and from no earlier one", async () => {
    // The original form of this assertion said `generation_batches` did not exist at all, which
    // was true until T16 created it and is not a claim that can survive T16 landing. What it was
    // actually protecting — that no Phase 4B migration anticipated batches — is asserted at the
    // migration files instead, where it stays checkable afterwards.
    const dir = path.resolve(import.meta.dirname, "../../supabase/migrations");
    const creators = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .filter((name) =>
        /create\s+table\s+public\.generation_batches\b/i.test(
          readFileSync(path.join(dir, name), "utf8"),
        ),
      );
    expect(creators).toEqual(["20260917000000_phase4c_t16_generation_batches.sql"]);

    // T17 is still ahead of us; nothing has reached forward to it either.
    const { rows } = await db.query(
      `select table_name from information_schema.tables
        where table_schema='public' and table_name='design_intent_artifacts'`,
    );
    expect(rows).toEqual([]);
  });
});
