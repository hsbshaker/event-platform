import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { asActor, connect, createAuthUser, databaseUrl, errorCode, resetDatabase } from "./harness";

/**
 * The optimistic concurrency token behind event detail saves
 * (supabase/migrations/20260913040000_phase2_event_row_version.sql).
 *
 * `updateEventDetails` computes its patch and the derived RSVP deadline from a snapshot of the
 * row, so the write is only correct while that snapshot is current. This file proves the half
 * of that contract Postgres owns: the version moves on every write, cannot be forged, and a
 * write filtered on a stale version changes nothing. The retry that follows a lost race is
 * proven in src/lib/events/apply-patch.test.ts, which can interleave writers precisely.
 *
 * spec.md §7.3 (the deadline rule), §7.4 (the stored zone is authoritative for every lifecycle
 * calculation), §25 (owners and co-hosts edit content through RLS).
 */

let db: Client;
let owner: string;
let eventId: string;

async function versionOf(id: string = eventId): Promise<number> {
  const { rows } = await db.query(`select row_version from public.events where id = $1`, [id]);
  return rows[0].row_version as number;
}

async function rowOf(id: string = eventId) {
  const { rows } = await db.query(
    `select title, timezone, event_date, rsvp_deadline, row_version from public.events where id = $1`,
    [id],
  );
  return rows[0] as {
    title: string | null;
    timezone: string | null;
    event_date: Date | null;
    rsvp_deadline: Date | null;
    row_version: number;
  };
}

/** `date` comes back from pg as a Date; compare on the calendar day it names. */
function day(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

beforeAll(async () => {
  db = await connect();
  await resetDatabase(db);
});

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await db.query("truncate public.events cascade; delete from auth.users");
  owner = await createAuthUser(db, "owner@example.com", "Owner One");
  const { rows } = await db.query(
    `insert into public.events (owner_id, prompt) values ($1, 'An existing event') returning id`,
    [owner],
  );
  eventId = rows[0].id;
});

describe("the event row version", () => {
  it("starts at one and moves on every update, whoever writes", async () => {
    expect(await versionOf()).toBe(1);

    await db.query(`update public.events set title = 'First' where id = $1`, [eventId]);
    expect(await versionOf()).toBe(2);

    // An end user editing through RLS moves it too, not just server code.
    await asActor(
      db,
      { kind: "user", id: owner },
      (q) => q(`update public.events set title = 'Second' where id = $1`, [eventId]),
      { commit: true },
    );
    expect(await versionOf()).toBe(3);

    await db.query(`update public.events set timezone = 'America/New_York' where id = $1`, [
      eventId,
    ]);
    expect(await versionOf()).toBe(4);
  });

  it("cannot be set by the writer, only incremented by the row itself", async () => {
    // A caller that supplies a version must not be able to park it, skip it, or wind it back;
    // otherwise a stale save could make its own compare-and-set succeed.
    await db.query(`update public.events set title = 'a', row_version = 99 where id = $1`, [
      eventId,
    ]);
    expect(await versionOf()).toBe(2);

    await db.query(`update public.events set title = 'b', row_version = 1 where id = $1`, [
      eventId,
    ]);
    expect(await versionOf()).toBe(3);
  });

  it("moves for a service-role write as well, so a client's token cannot pass over it", async () => {
    const before = await versionOf();
    await asActor(
      db,
      { kind: "service" },
      (q) => q(`update public.events set timezone = 'America/Chicago' where id = $1`, [eventId]),
      { commit: true },
    );
    expect(await versionOf()).toBe(before + 1);
  });

  it("is not accepted from an end user on insert either", async () => {
    // End users have no insert on events at all since Phase 2; this asserts the revoke still
    // stands rather than that the column is special.
    const code = await errorCode(
      asActor(db, { kind: "user", id: owner }, (q) =>
        q(`insert into public.events (owner_id, prompt, row_version) values ($1, 'x', 5)`, [owner]),
      ),
    );
    expect(code).toBeTruthy();
  });
});

describe("a write filtered on the version it read", () => {
  it("applies exactly once and moves the version with it", async () => {
    const v = await versionOf();
    const { rowCount } = await db.query(
      `update public.events set title = 'Named' where id = $1 and row_version = $2`,
      [eventId, v],
    );
    expect(rowCount).toBe(1);
    const after = await rowOf();
    expect(after.title).toBe("Named");
    expect(after.row_version).toBe(v + 1);
  });

  it("changes nothing when the version has moved since it was read", async () => {
    const stale = await versionOf();

    // Another save lands first.
    await db.query(`update public.events set timezone = 'America/New_York' where id = $1`, [
      eventId,
    ]);

    // The losing save tries to write what it computed against the older snapshot, including a
    // deadline derived with no timezone. It must not land.
    const { rowCount } = await db.query(
      `update public.events set event_date = '2027-03-06', rsvp_deadline = null
       where id = $1 and row_version = $2`,
      [eventId, stale],
    );
    expect(rowCount).toBe(0);

    const after = await rowOf();
    expect(after.timezone).toBe("America/New_York");
    expect(after.event_date).toBeNull();
    expect(after.row_version).toBe(stale + 1);
  });

  it("lets exactly one of two writers at the same version through", async () => {
    const v = await versionOf();
    const a = new Client({ connectionString: databaseUrl() });
    const b = new Client({ connectionString: databaseUrl() });
    await a.connect();
    await b.connect();
    try {
      // A holds the row, so B's conditional update must wait and then find the version moved.
      await a.query("begin");
      const first = await a.query(
        `update public.events set event_date = '2027-03-06' where id = $1 and row_version = $2`,
        [eventId, v],
      );
      expect(first.rowCount).toBe(1);

      const contender = b.query(
        `update public.events set timezone = 'America/New_York' where id = $1 and row_version = $2`,
        [eventId, v],
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      await a.query("commit");

      expect((await contender).rowCount).toBe(0);
    } finally {
      await a.end();
      await b.end();
    }

    // One write landed, and the row is internally consistent rather than a mix of both.
    const after = await rowOf();
    expect(after.row_version).toBe(v + 1);
    expect(day(after.event_date)).toBe("2027-03-06");
    expect(after.timezone).toBeNull();
  });

  it("returns its row when an owner does it through row-level security", async () => {
    // The production path reads a successful write back from RETURNING and treats an empty
    // result as a lost race. That only holds while the SELECT policy admits every row the
    // UPDATE policy admits. Pin it here: if a future change narrows the select side, a
    // successful save would start reporting as a conflict, retry, commit again, and then tell
    // the host it failed — with the change actually applied.
    const v = await versionOf();
    const result = await asActor(
      db,
      { kind: "user", id: owner },
      (q) =>
        q(
          `update public.events set title = 'Through RLS'
           where id = $1 and row_version = $2
           returning id, row_version`,
          [eventId, v],
        ),
      { commit: true },
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].row_version).toBe(v + 1);

    // And a stale filter still returns nothing rather than raising, so the caller can tell the
    // two apart by row count alone.
    const stale = await asActor(
      db,
      { kind: "user", id: owner },
      (q) =>
        q(
          `update public.events set title = 'Stale'
           where id = $1 and row_version = $2
           returning id`,
          [eventId, v],
        ),
      { commit: true },
    );
    expect(stale.rowCount).toBe(0);
    expect((await rowOf()).title).toBe("Through RLS");
  });

  it("lets the loser succeed once it reads the row again", async () => {
    const stale = await versionOf();
    await db.query(`update public.events set timezone = 'America/New_York' where id = $1`, [
      eventId,
    ]);

    expect(
      (
        await db.query(
          `update public.events set event_date = '2027-03-06' where id = $1 and row_version = $2`,
          [eventId, stale],
        )
      ).rowCount,
    ).toBe(0);

    // This is what the retry does: read the winner's state, then write against it.
    const fresh = await versionOf();
    expect(
      (
        await db.query(
          `update public.events set event_date = '2027-03-06' where id = $1 and row_version = $2`,
          [eventId, fresh],
        )
      ).rowCount,
    ).toBe(1);

    const after = await rowOf();
    expect(after.timezone).toBe("America/New_York");
    expect(day(after.event_date)).toBe("2027-03-06");
  });
});
