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
 * Spend controls and the generation lock (supabase/migrations/20261005000000_phase5_spend_controls.sql).
 *
 * spec.md §10: one generation in flight per event; per-event daily cap shared by all collaborators;
 * per-acting-host daily cap; a global spend ceiling; idempotency so a retry or double tap never
 * duplicates an expensive call. §9.5, §9.6, §24 GenerationRun. §32 #4 (every generation names an
 * event member), #42 (nothing here is visible to end users).
 */

let db: Client;
let owner: string;
let cohost: string;
let stranger: string;
let eventA: string;
let eventB: string;
let eventC: string;

/** Key hashes as the application derives them: opaque bytes per (bucket subject). */
const keyHash = (subject: string) => `\\x${createHash("sha256").update(subject).digest("hex")}`;

type StartArgs = {
  event?: string;
  user?: string;
  kind?: string;
  key?: string;
  eventCap?: number;
  hostCap?: number;
  staleSeconds?: number;
  /**
   * Another direction and a shape switch: the design it starts from (required there); another
   * direction's words; a shape switch's shape (required there).
   */
  fromDesign?: string | null;
  feedback?: string | null;
  shape?: string | null;
};

async function start(
  args: StartArgs = {},
  client: Client = db,
): Promise<{ generation_id: string | null; outcome: string }> {
  const {
    event = eventA,
    user = owner,
    kind = "initial",
    key = randomUUID(),
    eventCap = 30,
    hostCap = 60,
    staleSeconds = 330,
    fromDesign = null,
    feedback = null,
    shape = null,
  } = args;
  const { rows } = await client.query(
    `select * from public.start_generation($1, $2, $3, $4, $5::bytea, $6::bytea, $7, $8, $9, $10, $11, $12)`,
    [
      event,
      user,
      kind,
      key,
      keyHash(`event:${event}`),
      keyHash(`user:${user}`),
      eventCap,
      hostCap,
      staleSeconds,
      feedback,
      fromDesign,
      shape,
    ],
  );
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function finish(id: string, status = "succeeded") {
  await db.query(`update public.generations set status = $2, finished_at = now() where id = $1`, [
    id,
    status,
  ]);
}

async function counter(bucket: string, subject: string): Promise<number> {
  const { rows } = await db.query(
    `select coalesce(sum(count), 0)::int as n from public.rate_limits
     where bucket = $1 and key_hash = $2::bytea`,
    [bucket, keyHash(subject)],
  );
  return rows[0].n;
}

const eventCount = (event: string) => counter("generation:event", `event:${event}`);
const hostCount = (user: string) => counter("generation:host", `user:${user}`);

async function spendDay(): Promise<{ reserved: number; spent: number } | undefined> {
  const { rows } = await db.query(
    `select reserved_usd::float8 as reserved, spent_usd::float8 as spent
     from public.model_spend_days where day = (now() at time zone 'utc')::date`,
  );
  return rows[0];
}

async function reserve(estimate: number, ceiling: number, client: Client = db) {
  const { rows } = await client.query(`select public.reserve_model_spend($1, $2)::text as day`, [
    estimate,
    ceiling,
  ]);
  return rows[0].day as string | null;
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
    `insert into public.events (owner_id, prompt)
     values ($1, 'Event A'), ($1, 'Event B'), ($2, 'Event C') returning id`,
    [owner, stranger],
  );
  [eventA, eventB, eventC] = created.rows.map((r) => r.id as string);
  // The co-host helps on A; the owner of A co-hosts C.
  await db.query(
    `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'cohost'), ($3, $4, 'cohost')`,
    [eventA, cohost, eventC, owner],
  );
});

describe("the daily spend ceiling", () => {
  it("reserves within the ceiling and refuses a reservation that would cross it", async () => {
    const today = (await db.query(`select ((now() at time zone 'utc')::date)::text as d`)).rows[0]
      .d;
    expect(await reserve(8, 20)).toBe(today);
    expect(await reserve(8, 20)).toBe(today);
    expect(await spendDay()).toEqual({ reserved: 16, spent: 0 });
    // 16 + 8 > 20: refused, and nothing is reserved by the refusal.
    expect(await reserve(8, 20)).toBeNull();
    expect(await spendDay()).toEqual({ reserved: 16, spent: 0 });
    // Exactly at the ceiling is allowed.
    expect(await reserve(4, 20)).toBe(today);
    expect(await reserve(0.000001, 20)).toBeNull();
  });

  it("settles: the reservation is released and the actual cost booked as spent", async () => {
    const day = await reserve(0.25, 20);
    await reserve(0.9, 20);
    await db.query(`select public.settle_model_spend($1::date, 0.25, 0.004)`, [day]);
    expect(await spendDay()).toEqual({ reserved: 0.9, spent: 0.004 });
    // The ceiling counts spent and reserved together.
    expect(await reserve(19.096, 20)).toBe(day);
    expect(await reserve(0.000001, 20)).toBeNull();
  });

  it("never lets the reservation go negative, and books actual cost above the estimate in full", async () => {
    const day = await reserve(0.1, 20);
    await db.query(`select public.settle_model_spend($1::date, 5, 0.3)`, [day]);
    expect(await spendDay()).toEqual({ reserved: 0, spent: 0.3 });
  });

  it("settles on the day it is given, creating it if needed", async () => {
    await db.query(`select public.settle_model_spend('2026-01-01', 0.2, 0.05)`);
    const { rows } = await db.query(
      `select reserved_usd::float8 as reserved, spent_usd::float8 as spent
       from public.model_spend_days where day = '2026-01-01'`,
    );
    expect(rows[0]).toEqual({ reserved: 0, spent: 0.05 });
  });

  it("an exhausted ceiling refuses even a free call", async () => {
    const day = await reserve(1, 1);
    await db.query(`select public.settle_model_spend($1::date, 1, 1.2)`, [day]);
    expect(await reserve(0, 1)).toBeNull();
  });

  it("rejects negative or missing amounts", async () => {
    for (const sql of [
      `select public.reserve_model_spend(-1, 20)`,
      `select public.reserve_model_spend(1, -1)`,
      `select public.reserve_model_spend(null, 20)`,
      `select public.settle_model_spend(current_date, -1, 0)`,
      `select public.settle_model_spend(current_date, 0, -1)`,
      `select public.settle_model_spend(null, 0, 0)`,
    ]) {
      expect(await errorCode(db.query(sql)), sql).toBe("22023");
    }
  });

  it("concurrent reservations never pass the ceiling together", async () => {
    const clients = await Promise.all(Array.from({ length: 16 }, () => connect()));
    try {
      // 16 callers reserve $3 each against $20 at the same moment: exactly six fit.
      await Promise.all(clients.map((c) => c.query("begin")));
      const days = await Promise.all(
        clients.map(async (c) => {
          const day = await reserve(3, 20, c);
          await c.query("commit");
          return day;
        }),
      );
      expect(days.filter(Boolean)).toHaveLength(6);
      expect(await spendDay()).toEqual({ reserved: 18, spent: 0 });
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });
});

describe("start_generation", () => {
  it("starts once per idempotency key and answers a repeat with the same generation", async () => {
    const key = randomUUID();
    const first = await start({ key });
    expect(first.outcome).toBe("started");
    expect(first.generation_id).toBeTruthy();
    const again = await start({ key });
    expect(again).toEqual({ generation_id: first.generation_id, outcome: "existing" });
    // The repeat consumed nothing.
    expect(await eventCount(eventA)).toBe(1);
    expect(await hostCount(owner)).toBe(1);
    const { rows } = await db.query(`select * from public.generations where id = $1`, [
      first.generation_id,
    ]);
    expect(rows[0]).toMatchObject({
      event_id: eventA,
      kind: "initial",
      status: "running",
      requested_by: owner,
      idempotency_key: key,
      finished_at: null,
      artifacts: {},
    });
    // A finished generation still answers its key, so a late retry never starts a second one.
    await finish(first.generation_id!);
    expect(await start({ key })).toEqual({
      generation_id: first.generation_id,
      outcome: "existing",
    });
  });

  it("refuses a key reused for a different kind of generation", async () => {
    const key = randomUUID();
    await start({ key });
    expect(await errorCode(start({ key, kind: "shape_switch" }))).toBe("22023");
  });

  it("allows one generation in flight per event, without consuming the caps", async () => {
    const design = await insertCardDesign(db, eventA);
    const direction = { kind: "another_direction", fromDesign: design };
    const running = await start(direction);
    expect(running.outcome).toBe("started");
    const second = await start(direction);
    expect(second).toEqual({ generation_id: running.generation_id, outcome: "in_flight" });
    // The co-host shares the event's lock.
    expect(await start({ ...direction, user: cohost })).toEqual({
      generation_id: running.generation_id,
      outcome: "in_flight",
    });
    expect(await eventCount(eventA)).toBe(1);
    expect(await hostCount(cohost)).toBe(0);
    // Another event is independent.
    expect((await start({ event: eventB })).outcome).toBe("started");
    // Once the first finishes, the next starts.
    await finish(running.generation_id!, "failed");
    expect((await start(direction)).outcome).toBe("started");
  });

  it("takes over a running generation whose worker stopped heartbeating", async () => {
    const stale = await start();
    await db.query(
      `update public.generations set heartbeat_at = now() - interval '10 minutes' where id = $1`,
      [stale.generation_id],
    );
    const next = await start({ staleSeconds: 330 });
    expect(next.outcome).toBe("started");
    const { rows } = await db.query(
      `select status, error_code, finished_at is not null as finished from public.generations
       where id = $1`,
      [stale.generation_id],
    );
    expect(rows[0]).toEqual({ status: "failed", error_code: "stale", finished: true });
    // A heartbeat younger than the threshold still holds the lock.
    expect((await start()).outcome).toBe("in_flight");
  });

  it("marks a stale generation failed before answering its own key", async () => {
    const key = randomUUID();
    const stale = await start({ key });
    await db.query(
      `update public.generations set heartbeat_at = now() - interval '1 hour' where id = $1`,
      [stale.generation_id],
    );
    expect(await start({ key })).toEqual({
      generation_id: stale.generation_id,
      outcome: "existing",
    });
    const { rows } = await db.query(`select status from public.generations where id = $1`, [
      stale.generation_id,
    ]);
    expect(rows[0].status).toBe("failed");
  });

  it("caps generations per event per day across all collaborators, consuming nothing on refusal", async () => {
    for (const user of [owner, cohost]) {
      const g = await start({ user, eventCap: 2 });
      expect(g.outcome).toBe("started");
      await finish(g.generation_id!);
    }
    for (const user of [owner, cohost]) {
      expect(await start({ user, eventCap: 2 })).toEqual({
        generation_id: null,
        outcome: "event_cap",
      });
    }
    expect(await eventCount(eventA)).toBe(2);
    // The refusals consumed neither host's cap.
    expect(await hostCount(owner)).toBe(1);
    expect(await hostCount(cohost)).toBe(1);
    // Another event of the same host is unaffected.
    expect((await start({ event: eventB, eventCap: 2 })).outcome).toBe("started");
  });

  it("caps generations per acting host per day across their events, consuming nothing on refusal", async () => {
    for (const event of [eventA, eventB]) {
      const g = await start({ event, hostCap: 2 });
      expect(g.outcome).toBe("started");
    }
    // Event C (where the owner of A is a co-host) is refused by the host's cap ...
    expect(await start({ event: eventC, hostCap: 2 })).toEqual({
      generation_id: null,
      outcome: "host_cap",
    });
    expect(await hostCount(owner)).toBe(2);
    // ... and the refusal did not consume event C's cap (the event check runs first).
    expect(await eventCount(eventC)).toBe(0);
    // Event C's own owner still has their whole allowance there.
    expect((await start({ event: eventC, user: stranger, hostCap: 2 })).outcome).toBe("started");
  });

  it("reports the event cap before the host cap when both are reached", async () => {
    const g = await start({ eventCap: 1, hostCap: 1 });
    await finish(g.generation_id!);
    expect((await start({ eventCap: 1, hostCap: 1 })).outcome).toBe("event_cap");
  });

  it("counts by UTC day: a counter from an earlier window does not count today", async () => {
    await db.query(
      `insert into public.rate_limits (bucket, key_hash, window_start, count)
       values ('generation:event', $1::bytea, to_timestamp(floor(extract(epoch from now()) / 86400) * 86400) - interval '1 day', 30)`,
      [keyHash(`event:${eventA}`)],
    );
    expect((await start({ eventCap: 30 })).outcome).toBe("started");
  });

  it("starts nothing once the event is published (spec.md §8.2, §23)", async () => {
    const earlier = await start();
    await finish(earlier.generation_id!);
    const design = await insertCardDesign(db, eventA);
    for (const status of ["PUBLISHED", "PASSED", "ARCHIVED"]) {
      await db.query(`update public.events set status = $2 where id = $1`, [eventA, status]);
      for (const kind of ["another_direction", "shape_switch"]) {
        const shape = kind === "shape_switch" ? "square" : null;
        expect(await start({ kind, fromDesign: design, shape }), `${status} ${kind}`).toEqual({
          generation_id: null,
          outcome: "published",
        });
      }
    }
    expect(await eventCount(eventA)).toBe(1);
    expect(await hostCount(owner)).toBe(1);
  });

  it("refuses a second initial generation once the event has a design, consuming nothing (designed)", async () => {
    const first = await start({ key: "first-card" });
    expect(first.outcome).toBe("started");
    await finish(first.generation_id!);
    const design = await insertCardDesign(db, eventA);
    for (const user of [owner, cohost]) {
      expect(await start({ user }), user).toEqual({ generation_id: null, outcome: "designed" });
    }
    expect(await eventCount(eventA)).toBe(1);
    expect(await hostCount(owner)).toBe(1);
    expect(await hostCount(cohost)).toBe(0);
    // A repeat of the key that made the first card still finds it.
    expect(await start({ key: "first-card" })).toEqual({
      generation_id: first.generation_id,
      outcome: "existing",
    });
    // Another card is another direction (or a shape switch), which still starts.
    expect((await start({ kind: "another_direction", fromDesign: design })).outcome).toBe(
      "started",
    );
    // Another event without a design is unaffected.
    expect((await start({ event: eventB })).outcome).toBe("started");
  });

  it("answers designed before in_flight, and published before designed", async () => {
    const design = await insertCardDesign(db, eventA);
    await db.query(`update public.events set active_card_design_id = $2 where id = $1`, [
      eventA,
      design,
    ]);
    const running = await start({ kind: "shape_switch", fromDesign: design, shape: "square" });
    expect(running.outcome).toBe("started");
    expect(await start()).toEqual({ generation_id: null, outcome: "designed" });
    await finish(running.generation_id!);
    await db.query(`update public.events set status = 'PUBLISHED' where id = $1`, [eventA]);
    expect(await start()).toEqual({ generation_id: null, outcome: "published" });
  });

  it("only an event's owner or co-host can start a generation", async () => {
    expect(await errorCode(start({ user: stranger }))).toBe("42501");
    expect(await errorCode(start({ event: randomUUID() }))).toBe("P0002");
    expect(await eventCount(eventA)).toBe(0);
  });

  it("rejects invalid arguments", async () => {
    for (const args of [
      { kind: "website" },
      { key: "" },
      { eventCap: 0 },
      { hostCap: -1 },
      { staleSeconds: 0 },
    ]) {
      expect(await errorCode(start(args)), JSON.stringify(args)).toBe("22023");
    }
  });

  it("is race-safe: concurrent starts for one event produce exactly one generation", async () => {
    const clients = await Promise.all(Array.from({ length: 10 }, () => connect()));
    try {
      const results = await Promise.all(
        clients.map((c, i) => start({ user: i % 2 ? cohost : owner }, c)),
      );
      const started = results.filter((r) => r.outcome === "started");
      expect(started).toHaveLength(1);
      expect(results.filter((r) => r.outcome === "in_flight")).toHaveLength(9);
      for (const r of results) expect(r.generation_id).toBe(started[0].generation_id);
      expect(await eventCount(eventA)).toBe(1);
      const { rows } = await db.query(
        `select count(*)::int as n from public.generations where event_id = $1`,
        [eventA],
      );
      expect(rows[0].n).toBe(1);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });

  it("is race-safe: a double tap with one key produces one generation", async () => {
    const clients = await Promise.all(Array.from({ length: 6 }, () => connect()));
    const key = randomUUID();
    try {
      const results = await Promise.all(clients.map((c) => start({ key }, c)));
      expect(results.filter((r) => r.outcome === "started")).toHaveLength(1);
      expect(results.filter((r) => r.outcome === "existing")).toHaveLength(5);
      expect(new Set(results.map((r) => r.generation_id)).size).toBe(1);
      expect(await hostCount(owner)).toBe(1);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });

  it("is race-safe: concurrent starts across a host's events never pass the host cap", async () => {
    const more = await db.query(
      `insert into public.events (owner_id, prompt)
       select $1, 'Event ' || g from generate_series(1, 7) g returning id`,
      [owner],
    );
    const events = [eventA, eventB, ...more.rows.map((r) => r.id as string)];
    const clients = await Promise.all(events.map(() => connect()));
    try {
      const results = await Promise.all(
        events.map((event, i) => start({ event, hostCap: 4 }, clients[i])),
      );
      expect(results.filter((r) => r.outcome === "started")).toHaveLength(4);
      expect(results.filter((r) => r.outcome === "host_cap")).toHaveLength(5);
      expect(await hostCount(owner)).toBe(4);
      // Refused events kept their event allowance.
      let consumed = 0;
      for (const event of events) consumed += await eventCount(event);
      expect(consumed).toBe(4);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });
});

describe("generations", () => {
  it("cannot hold two running rows for one event, even when written directly", async () => {
    await start();
    expect(
      await errorCode(
        db.query(
          `insert into public.generations (event_id, kind, idempotency_key) values ($1, 'initial', 'k')`,
          [eventA],
        ),
      ),
    ).toBe("23505");
  });

  it("keeps finished_at and error_code consistent with status", async () => {
    const g = await start();
    for (const sql of [
      `update public.generations set status = 'succeeded' where id = $1`,
      `update public.generations set finished_at = now() where id = $1`,
      `update public.generations set error_code = 'boom' where id = $1`,
    ]) {
      expect(await errorCode(db.query(sql, [g.generation_id])), sql).toBe("23514");
    }
  });

  it("links a produced design of the same event only", async () => {
    const g = await start();
    const own = await insertCardDesign(db, eventA);
    const foreign = await insertCardDesign(db, eventB);
    await db.query(`update public.generations set card_design_id = $2 where id = $1`, [
      g.generation_id,
      own,
    ]);
    expect(
      await errorCode(
        db.query(`update public.generations set card_design_id = $2 where id = $1`, [
          g.generation_id,
          foreign,
        ]),
      ),
    ).toBe("23503");
  });

  it("heartbeat_generation bumps a running generation and refuses any other", async () => {
    const g = await start();
    await db.query(
      `update public.generations set heartbeat_at = now() - interval '1 minute' where id = $1`,
      [g.generation_id],
    );
    const beat = async (id: string, event = eventA) =>
      (await db.query(`select public.heartbeat_generation($1, $2) as ok`, [id, event])).rows[0]
        .ok as boolean;
    expect(await beat(g.generation_id!)).toBe(true);
    const { rows } = await db.query(
      `select heartbeat_at > now() - interval '5 seconds' as fresh from public.generations where id = $1`,
      [g.generation_id],
    );
    expect(rows[0].fresh).toBe(true);
    // Wrong event, finished, unknown.
    expect(await beat(g.generation_id!, eventB)).toBe(false);
    await finish(g.generation_id!, "failed");
    expect(await beat(g.generation_id!)).toBe(false);
    expect(await beat(randomUUID())).toBe(false);
  });

  it("heartbeat_generation fails a generation once its event is published, so it spends no more", async () => {
    // A collaborator publishes while another's generation is between model calls.
    const g = await start();
    const beat = async () =>
      (
        await db.query(`select public.heartbeat_generation($1, $2) as ok`, [
          g.generation_id,
          eventA,
        ])
      ).rows[0].ok as boolean;
    expect(await beat()).toBe(true);
    await db.query(`update public.events set status = 'PUBLISHED' where id = $1`, [eventA]);
    expect(await beat()).toBe(false);
    const { rows } = await db.query(
      `select status, error_code, finished_at is not null as finished from public.generations where id = $1`,
      [g.generation_id],
    );
    expect(rows[0]).toEqual({ status: "failed", error_code: "published", finished: true });
    expect(await beat()).toBe(false);
  });

  it("goes with its event", async () => {
    await start();
    await db.query(`delete from public.events where id = $1`, [eventA]);
    const { rows } = await db.query(`select count(*)::int as n from public.generations`);
    expect(rows[0].n).toBe(0);
  });
});

describe("generation_runs telemetry", () => {
  it("records the Phase 5 columns, moderation runs and image-only runs without a schema", async () => {
    const g = await start();
    await db.query(
      `insert into public.generation_runs
         (event_id, user_id, generation_id, provider, operation, round, model, image_units,
          latency_ms, success, prompt_version, schema_version, layout_set_version,
          art_regenerated, art_repaints, standard_wording_slots, ink_panels, cost_estimate_usd)
       values ($1, $2, $3, 'openai', 'card_art', 1, 'gpt-image-2.5-sunburst-2026-09-08', 1,
          31000, true, 'card_art_v2', null, 'card_layouts_v2', 'panel-repaint', 1,
          array['title'], '["rectangle:main"]', 0.06),
         ($1, $2, $3, 'openai', 'card_art_moderation', 1, 'omni-moderation-latest', null,
          400, true, 'card_art_moderation_v1', null, null, null, null, null, null, 0)`,
      [eventA, owner, g.generation_id],
    );
    // Runs are telemetry: removing a generation on its own (never done by the product; both go
    // with their event) nulls the link rather than losing the runs.
    await db.query(`delete from public.generations where id = $1`, [g.generation_id]);
    const { rows } = await db.query(
      `select count(*)::int as n, count(generation_id)::int as linked from public.generation_runs`,
    );
    expect(rows[0]).toEqual({ n: 2, linked: 0 });
  });

  it("bounds repaints and standard-wording slots", async () => {
    const insert = (column: string, value: string) =>
      db.query(
        `insert into public.generation_runs
           (event_id, provider, operation, model, latency_ms, success, prompt_version, ${column})
         values ($1, 'openai', 'card_art', 'm', 1, true, 'p', ${value})`,
        [eventA],
      );
    expect(await errorCode(insert("art_repaints", "3"))).toBe("23514");
    expect(await errorCode(insert("standard_wording_slots", "array['venue']"))).toBe("23514");
  });
});

describe("end users cannot see or use any of it (spec.md §32 #42)", () => {
  const ACTORS = (): Actor[] => [{ kind: "anon" }, { kind: "user", id: owner }];

  it("cannot read or write the ledger, the generations or the runs", async () => {
    await start();
    for (const actor of ACTORS()) {
      for (const sql of [
        `select * from public.model_spend_days`,
        `select * from public.generations`,
        `select * from public.generation_runs`,
        `insert into public.model_spend_days (day) values (current_date)`,
        `insert into public.generations (event_id, kind, idempotency_key) values ('${eventB}', 'initial', 'x')`,
        `update public.generations set status = 'failed'`,
      ]) {
        expect(await errorCode(asActor(db, actor, (q) => q(sql))), `${actor.kind}: ${sql}`).toBe(
          "42501",
        );
      }
    }
  });

  it("cannot execute the ledger or lock functions", async () => {
    const h = keyHash("x");
    for (const actor of ACTORS()) {
      for (const sql of [
        `select public.reserve_model_spend(0.1, 1000)`,
        `select public.settle_model_spend(current_date, 0, 0)`,
        `select * from public.start_generation('${eventA}', '${owner}', 'initial', 'k', '${h}', '${h}', 30, 60, 330)`,
        `select public.heartbeat_generation('${randomUUID()}', '${eventA}')`,
      ]) {
        expect(await errorCode(asActor(db, actor, (q) => q(sql))), `${actor.kind}: ${sql}`).toBe(
          "42501",
        );
      }
    }
  });

  it("the service role can", async () => {
    const h = keyHash("svc");
    await asActor(db, { kind: "service" }, async (q) => {
      expect(
        (await q(`select public.reserve_model_spend(0.1, 20) is not null as ok`)).rows[0].ok,
      ).toBe(true);
      const started = await q(
        `select * from public.start_generation($1, $2, 'initial', 'svc-key', $3::bytea, $3::bytea, 30, 60, 330)`,
        [eventA, owner, h],
      );
      expect(started.rows[0].outcome).toBe("started");
      expect((await q(`select count(*)::int as n from public.generations`)).rows[0].n).toBe(1);
    });
  });
});
