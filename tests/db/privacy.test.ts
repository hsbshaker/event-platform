import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

import {
  asActor,
  connect,
  createAuthUser,
  databaseUrl,
  errorCode,
  resetDatabase,
  type Actor,
} from "./harness";

/**
 * Privacy and the private event code (supabase/migrations/20261011000000_event_privacy.sql).
 *
 * spec.md §14.1, §14.2 (one encrypted-at-rest event-code field; owner/co-host may reveal it),
 * §8.1 (privacy and the event code may change after publish), §23.1 ("encrypted access code when
 * private"), §25 (Manage privacy/access code: owner and co-host), §27. AGENTS.md: the encrypted code
 * is written in the same service-role transaction as switching a published event to private.
 *
 * The database never sees a plaintext code: the values here are opaque envelopes, as the
 * application's AES-256-GCM output is (`src/lib/events/access-code-crypto.server.ts`).
 */

let db: Client;
let owner: string;
let cohost: string;
let stranger: string;
let eventA: string;
let eventB: string;

/** An opaque encrypted-code envelope: version byte, IV, tag, eight bytes of ciphertext. */
const envelope = () => Buffer.concat([Buffer.from([0x01]), randomBytes(12 + 16 + 8)]);

type Row = { outcome: string; code_encrypted: Buffer | null };

async function setPrivacy(
  visibility: string,
  code: Buffer | null,
  { event = eventA, user = owner, client = db } = {},
): Promise<Row> {
  const { rows } = await client.query(`select * from public.set_event_privacy($1, $2, $3, $4)`, [
    event,
    user,
    visibility,
    code,
  ]);
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function rotate(
  code: Buffer | null,
  { event = eventA, user = owner, client = db } = {},
): Promise<Row> {
  const { rows } = await client.query(`select * from public.rotate_event_code($1, $2, $3)`, [
    event,
    user,
    code,
  ]);
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function eventRow(event = eventA) {
  const { rows } = await db.query(
    `select visibility, access_code_encrypted, row_version, status from public.events where id = $1`,
    [event],
  );
  return rows[0] as {
    visibility: string | null;
    access_code_encrypted: Buffer | null;
    row_version: number;
    status: string;
  };
}

async function publish(event = eventA) {
  await db.query(
    `update public.events set status = 'PUBLISHED', published_at = now(), paid_at = now()
     where id = $1`,
    [event],
  );
}

beforeAll(async () => {
  db = await connect();
  await resetDatabase(db);
});

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await db.query("truncate public.events, public.rate_limits cascade; delete from auth.users");
  owner = await createAuthUser(db, "owner@example.com", "Owner One");
  cohost = await createAuthUser(db, "cohost@example.com");
  stranger = await createAuthUser(db, "stranger@example.com");
  const created = await db.query(
    `insert into public.events (owner_id, prompt) values ($1, 'Event A'), ($1, 'Event B') returning id`,
    [owner],
  );
  [eventA, eventB] = created.rows.map((r) => r.id as string);
  await db.query(
    `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'cohost')`,
    [eventA, cohost],
  );
});

describe("set_event_privacy", () => {
  it("going private with no code stores the offered code with the visibility, in one write", async () => {
    const before = await eventRow();
    const code = envelope();
    const result = await setPrivacy("private", code);
    expect(result).toEqual({ outcome: "saved", code_encrypted: code });
    const after = await eventRow();
    expect(after.visibility).toBe("private");
    expect(after.access_code_encrypted).toEqual(code);
    // One update: the visibility and the code landed together.
    expect(after.row_version).toBe(before.row_version + 1);
    // Nothing on the other event changed.
    expect(await eventRow(eventB)).toMatchObject({ visibility: null, access_code_encrypted: null });
  });

  it("keeps a stored code both ways, so switching back to private reuses it", async () => {
    const first = envelope();
    await setPrivacy("private", first);
    // Offered another while one is stored: the stored code stays.
    expect(await setPrivacy("private", envelope())).toEqual({
      outcome: "saved",
      code_encrypted: first,
    });
    // Public keeps it, and returns it (the action shows none).
    expect(await setPrivacy("public", null)).toEqual({ outcome: "saved", code_encrypted: first });
    expect(await eventRow()).toMatchObject({ visibility: "public", access_code_encrypted: first });
    expect(await setPrivacy("private", envelope())).toEqual({
      outcome: "saved",
      code_encrypted: first,
    });
    expect((await eventRow()).access_code_encrypted).toEqual(first);
  });

  it("writes nothing when nothing changes", async () => {
    await setPrivacy("public", null);
    const { row_version } = await eventRow();
    await setPrivacy("public", null);
    await setPrivacy("public", envelope());
    expect((await eventRow()).row_version).toBe(row_version);
    await setPrivacy("private", envelope());
    const priv = (await eventRow()).row_version;
    await setPrivacy("private", envelope());
    expect((await eventRow()).row_version).toBe(priv);
  });

  it("never makes an event private without a code", async () => {
    expect(await errorCode(setPrivacy("private", null))).toBe("22023");
    // Too short to be an encrypted code.
    expect(await errorCode(setPrivacy("private", Buffer.from([0x01, 0x02])))).toBe("22023");
    expect(await errorCode(setPrivacy("private", Buffer.alloc(0)))).toBe("22023");
    expect(await eventRow()).toMatchObject({ visibility: null, access_code_encrypted: null });
  });

  it("refuses missing arguments", async () => {
    expect(await errorCode(setPrivacy(null as never, envelope()))).toBe("22023");
    expect(await errorCode(setPrivacy("private", envelope(), { user: null as never }))).toBe(
      "22023",
    );
    expect(await errorCode(setPrivacy("secret", envelope()))).toBe("22P02");
  });

  it("is for the event's owner and co-hosts only, and says not_found for no such event", async () => {
    expect((await setPrivacy("private", envelope(), { user: cohost })).outcome).toBe("saved");
    expect(await errorCode(setPrivacy("public", null, { user: stranger }))).toBe("42501");
    // The co-host of A is nobody on B.
    expect(await errorCode(setPrivacy("public", null, { event: eventB, user: cohost }))).toBe(
      "42501",
    );
    expect(await setPrivacy("public", null, { event: randomUUID() })).toEqual({
      outcome: "not_found",
      code_encrypted: null,
    });
    expect((await eventRow()).visibility).toBe("private");
  });

  it("switches a published event to private with its code in the same transaction (§8.1)", async () => {
    await setPrivacy("public", null);
    await publish();
    // Without the function, a published private event with no code is refused by the constraint.
    expect(
      await errorCode(
        asActor(db, { kind: "service" }, (q) =>
          q(`update public.events set visibility = 'private' where id = $1`, [eventA]),
        ),
      ),
    ).toBe("23514");
    const code = envelope();
    expect(await setPrivacy("private", code)).toEqual({ outcome: "saved", code_encrypted: code });
    expect(await eventRow()).toMatchObject({
      status: "PUBLISHED",
      visibility: "private",
      access_code_encrypted: code,
    });
    // And back to public after publish, keeping the code.
    expect((await setPrivacy("public", null)).outcome).toBe("saved");
    expect(await eventRow()).toMatchObject({ visibility: "public", access_code_encrypted: code });
    // The code can never be cleared from a published private event.
    await setPrivacy("private", envelope());
    expect(
      await errorCode(
        db.query(`update public.events set access_code_encrypted = null where id = $1`, [eventA]),
      ),
    ).toBe("23514");
  });

  it("takes the event's lock first: it waits for a writer holding the row", async () => {
    await setPrivacy("public", null);
    const other = new Client({ connectionString: databaseUrl() });
    await other.connect();
    try {
      await db.query("begin");
      await db.query(`select 1 from public.events where id = $1 for update`, [eventA]);
      // Even a call that would change nothing (already public) waits: the function reads the
      // row under its lock, so it never decides from a state another writer is changing.
      for (const [visibility, code] of [
        ["public", null],
        ["private", envelope()],
      ] as const) {
        await other.query("begin");
        await other.query("set local lock_timeout = '300ms'");
        expect(await errorCode(setPrivacy(visibility, code, { client: other })), visibility).toBe(
          "55P03",
        );
        await other.query("rollback");
      }
      expect(
        await errorCode(
          (async () => {
            await other.query("begin");
            await other.query("set local lock_timeout = '300ms'");
            try {
              await rotate(envelope(), { client: other });
            } finally {
              await other.query("rollback");
            }
          })(),
        ),
      ).toBe("55P03");
      await db.query("rollback");
    } finally {
      await other.end();
    }
  });

  it("serializes concurrent requests: two going private leave one code, and both return it", async () => {
    const a = new Client({ connectionString: databaseUrl() });
    const b = new Client({ connectionString: databaseUrl() });
    await a.connect();
    await b.connect();
    try {
      const codeA = envelope();
      const codeB = envelope();
      await a.query("begin");
      expect((await setPrivacy("private", codeA, { client: a })).code_encrypted).toEqual(codeA);
      // B would store its own code if it read the row outside A's lock. It must wait for A's
      // commit, then find A's code stored and keep it.
      await b.query("begin");
      const second = setPrivacy("private", codeB, { client: b, user: cohost });
      await new Promise((resolve) => setTimeout(resolve, 200));
      await a.query("commit");
      expect((await second).code_encrypted).toEqual(codeA);
      await b.query("commit");
      expect((await eventRow()).access_code_encrypted).toEqual(codeA);
    } finally {
      await a.end();
      await b.end();
    }
  });
});

describe("rotate_event_code", () => {
  it("replaces a private event's code, before and after publish", async () => {
    await setPrivacy("private", envelope());
    const next = envelope();
    expect(await rotate(next, { user: cohost })).toEqual({
      outcome: "rotated",
      code_encrypted: next,
    });
    expect((await eventRow()).access_code_encrypted).toEqual(next);
    await publish();
    const after = envelope();
    expect((await rotate(after)).outcome).toBe("rotated");
    expect((await eventRow()).access_code_encrypted).toEqual(after);
  });

  it("changes nothing for an event that is not private", async () => {
    expect(await rotate(envelope())).toEqual({ outcome: "not_private", code_encrypted: null });
    const kept = envelope();
    await setPrivacy("private", kept);
    await setPrivacy("public", null);
    expect(await rotate(envelope())).toEqual({ outcome: "not_private", code_encrypted: kept });
    expect((await eventRow()).access_code_encrypted).toEqual(kept);
  });

  it("is for the owner and co-hosts only, and needs a code", async () => {
    await setPrivacy("private", envelope());
    expect(await errorCode(rotate(envelope(), { user: stranger }))).toBe("42501");
    expect(await errorCode(rotate(null))).toBe("22023");
    expect(await errorCode(rotate(Buffer.from([0x01])))).toBe("22023");
    expect(await rotate(envelope(), { event: randomUUID() })).toEqual({
      outcome: "not_found",
      code_encrypted: null,
    });
  });
});

describe("who may call them, and who may write the columns", () => {
  it("only the service role may execute the functions", async () => {
    const roles: Actor[] = [{ kind: "anon" }, { kind: "user", id: owner }];
    for (const as of roles) {
      expect(
        await errorCode(
          asActor(db, as, (q) =>
            q(`select * from public.set_event_privacy($1, $2, 'private', $3)`, [
              eventA,
              owner,
              envelope(),
            ]),
          ),
        ),
        as.kind,
      ).toBe("42501");
      expect(
        await errorCode(
          asActor(db, as, (q) =>
            q(`select * from public.rotate_event_code($1, $2, $3)`, [eventA, owner, envelope()]),
          ),
        ),
        as.kind,
      ).toBe("42501");
    }
    const viaServer = await asActor(db, { kind: "service" }, (q) =>
      q(`select * from public.set_event_privacy($1, $2, 'private', $3)`, [
        eventA,
        owner,
        envelope(),
      ]),
    );
    expect(viaServer.rows[0].outcome).toBe("saved");
  });

  it("the functions run with an empty search path", async () => {
    const { rows } = await db.query(
      `select proname, prosecdef, proconfig from pg_proc
       where proname in ('set_event_privacy', 'rotate_event_code') order by proname`,
    );
    expect(rows).toEqual([
      { proname: "rotate_event_code", prosecdef: true, proconfig: ['search_path=""'] },
      { proname: "set_event_privacy", prosecdef: true, proconfig: ['search_path=""'] },
    ]);
  });

  it("owners and co-hosts cannot write visibility or the code directly, only read whether it is set", async () => {
    await setPrivacy("private", envelope());
    for (const user of [owner, cohost]) {
      for (const set of [
        "visibility = 'public'",
        "visibility = null",
        "access_code_encrypted = null",
        `access_code_encrypted = '\\x01${"00".repeat(36)}'`,
      ]) {
        expect(
          await errorCode(
            asActor(db, { kind: "user", id: user }, (q) =>
              q(`update public.events set ${set} where id = $1`, [eventA]),
            ),
          ),
          set,
        ).toBe("42501");
      }
      const seen = await asActor(db, { kind: "user", id: user }, (q) =>
        q(
          `select visibility, access_code_encrypted is not null as set from public.events
           where id = $1`,
          [eventA],
        ),
      );
      expect(seen.rows[0]).toEqual({ visibility: "private", set: true });
    }
    // A stranger sees nothing of it.
    const hidden = await asActor(db, { kind: "user", id: stranger }, (q) =>
      q(`select access_code_encrypted from public.events where id = $1`, [eventA]),
    );
    expect(hidden.rowCount).toBe(0);
  });
});
