import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

import {
  asActor,
  connect,
  createAuthUser,
  databaseUrl,
  errorCode,
  insertCardDesign,
  resetDatabase,
  type Actor,
} from "./harness";

/**
 * Co-host invitations (supabase/migrations/20261012000000_cohost_invitations.sql).
 *
 * spec.md §6.2 (a co-host is invited by the owner; the invitation survives authentication; the
 * co-host cannot manage co-hosts), §25 ("Manage co-host access": owner only), §27 ("Co-host access
 * is explicit and invitation-based"); AGENTS.md "Co-host invitations": the end-user insert on
 * event_members is revoked and the write is server-side.
 *
 * Token hashes here are opaque 32-byte values, as the application's HMAC is
 * (`src/lib/cohosts/token.ts`).
 */

let db: Client;
let owner: string;
let cohost: string;
let invitee: string;
let stranger: string;
let eventA: string;
let eventB: string;

const hash = () => randomBytes(32);

type CreateRow = {
  outcome: string;
  invitation_id: string | null;
  created_at: Date | null;
  expires_at: Date | null;
};

async function create(
  tokenHash: Buffer,
  { event = eventA, user = owner, client = db } = {},
): Promise<CreateRow> {
  const { rows } = await client.query(`select * from public.create_cohost_invitation($1, $2, $3)`, [
    event,
    user,
    tokenHash,
  ]);
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function preview(tokenHash: Buffer, user: string | null) {
  const { rows } = await db.query(`select * from public.cohost_invitation_preview($1, $2)`, [
    tokenHash,
    user,
  ]);
  expect(rows).toHaveLength(1);
  return rows[0] as {
    status: string;
    event_id: string | null;
    event_title: string | null;
    inviter_name: string | null;
    role: string | null;
  };
}

async function accept(tokenHash: Buffer, user: string, client: Client = db) {
  const { rows } = await client.query(`select * from public.accept_cohost_invitation($1, $2)`, [
    tokenHash,
    user,
  ]);
  expect(rows).toHaveLength(1);
  return rows[0] as { outcome: string; event_id: string | null; role: string | null };
}

async function revoke(invitationId: string, { event = eventA, user = owner } = {}) {
  const { rows } = await db.query(`select public.revoke_cohost_invitation($1, $2, $3) as outcome`, [
    event,
    user,
    invitationId,
  ]);
  return rows[0].outcome as string;
}

async function remove(cohostId: string, { event = eventA, user = owner } = {}) {
  const { rows } = await db.query(`select public.remove_cohost($1, $2, $3) as outcome`, [
    event,
    user,
    cohostId,
  ]);
  return rows[0].outcome as string;
}

async function pending(event = eventA, user = owner) {
  const { rows } = await db.query(`select * from public.pending_cohost_invitations($1, $2)`, [
    event,
    user,
  ]);
  return rows as { id: string; created_at: Date; expires_at: Date }[];
}

async function members(event = eventA) {
  const { rows } = await db.query(
    `select user_id, role from public.event_members where event_id = $1 order by role::text, user_id`,
    [event],
  );
  return rows as { user_id: string; role: string }[];
}

async function invitation(id: string) {
  const { rows } = await db.query(`select * from public.cohost_invitations where id = $1`, [id]);
  return rows[0];
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
  owner = await createAuthUser(db, "owner@example.com", "Ana Lopez");
  cohost = await createAuthUser(db, "cohost@example.com", "Leo Park");
  invitee = await createAuthUser(db, "invitee@example.com");
  stranger = await createAuthUser(db, "stranger@example.com");
  const created = await db.query(
    `insert into public.events (owner_id, prompt, title) values ($1, 'Event A', 'Maya''s Shower'),
       ($1, 'Event B', null) returning id`,
    [owner],
  );
  [eventA, eventB] = created.rows.map((r) => r.id as string);
  await db.query(
    `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'cohost')`,
    [eventA, cohost],
  );
});

describe("grants", () => {
  const ends: [string, () => Actor][] = [
    ["anon", () => ({ kind: "anon" })],
    ["owner", () => ({ kind: "user", id: owner })],
    ["co-host", () => ({ kind: "user", id: cohost })],
  ];

  it("end users can neither read nor write invitations", async () => {
    await create(hash());
    for (const [label, actor] of ends) {
      for (const sql of [
        `select * from public.cohost_invitations`,
        `select id, created_at, expires_at from public.cohost_invitations`,
        `insert into public.cohost_invitations (event_id, token_hash, created_by, expires_at)
           values ('${eventA}', '\\x${"00".repeat(32)}', '${owner}', now() + interval '1 day')`,
        `update public.cohost_invitations set revoked_at = now()`,
        `delete from public.cohost_invitations`,
      ]) {
        expect(await errorCode(asActor(db, actor(), (q) => q(sql))), `${label}: ${sql}`).toBe(
          "42501",
        );
      }
    }
  });

  it("only the service role may call the invitation functions", async () => {
    const { rows } = await create(hash()).then((row) => ({ rows: [row] }));
    const id = rows[0].invitation_id!;
    const calls = [
      [`select * from public.create_cohost_invitation($1, $2, $3)`, [eventA, owner, hash()]],
      [`select * from public.cohost_invitation_preview($1, $2)`, [hash(), null]],
      [`select * from public.accept_cohost_invitation($1, $2)`, [hash(), invitee]],
      [`select public.revoke_cohost_invitation($1, $2, $3)`, [eventA, owner, id]],
      [`select public.remove_cohost($1, $2, $3)`, [eventA, owner, cohost]],
      [`select * from public.pending_cohost_invitations($1, $2)`, [eventA, owner]],
    ] as const;
    for (const [label, actor] of ends) {
      for (const [sql, params] of calls) {
        expect(
          await errorCode(asActor(db, actor(), (q) => q(sql, [...params]))),
          `${label}: ${sql}`,
        ).toBe("42501");
      }
    }
    for (const [sql, params] of calls) {
      expect(
        await errorCode(asActor(db, { kind: "service" }, (q) => q(sql, [...params]))),
        `service: ${sql}`,
      ).toBeNull();
    }
  });

  it("no end user can add or remove an event member; members still read the roster", async () => {
    for (const [label, actor] of [
      ["owner", owner],
      ["co-host", cohost],
      ["stranger", stranger],
    ] as const) {
      expect(
        await errorCode(
          asActor(db, { kind: "user", id: actor }, (q) =>
            q(
              `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'cohost')`,
              [eventA, actor === stranger ? stranger : invitee],
            ),
          ),
        ),
        `${label} insert`,
      ).toBe("42501");
      expect(
        await errorCode(
          asActor(db, { kind: "user", id: actor }, (q) =>
            q(`delete from public.event_members where event_id = $1 and user_id = $2`, [
              eventA,
              cohost,
            ]),
          ),
        ),
        `${label} delete`,
      ).toBe("42501");
      expect(
        await errorCode(
          asActor(db, { kind: "user", id: actor }, (q) =>
            q(`update public.event_members set role = 'cohost' where event_id = $1`, [eventA]),
          ),
        ),
        `${label} update`,
      ).toBe("42501");
    }
    expect(
      await errorCode(
        asActor(db, { kind: "anon" }, (q) =>
          q(
            `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'cohost')`,
            [eventA, stranger],
          ),
        ),
      ),
    ).toBe("42501");
    for (const id of [owner, cohost]) {
      const roster = await asActor(db, { kind: "user", id }, (q) =>
        q(`select user_id, role from public.event_members where event_id = $1`, [eventA]),
      );
      expect(roster.rowCount).toBe(2);
    }
    const none = await asActor(db, { kind: "user", id: stranger }, (q) =>
      q(`select user_id from public.event_members where event_id = $1`, [eventA]),
    );
    expect(none.rowCount).toBe(0);
    expect(
      await db.query(
        `select count(*)::int as n from pg_policies
         where tablename = 'event_members' and cmd in ('INSERT', 'DELETE', 'UPDATE')`,
      ),
    ).toMatchObject({ rows: [{ n: 0 }] });
  });

  it("the event's owner reads its members' profiles; nobody else gains any", async () => {
    const asUser = (id: string) =>
      asActor(db, { kind: "user", id }, (q) =>
        q(`select id, name, email from public.profiles order by email`),
      );
    expect((await asUser(owner)).rows).toEqual([
      { id: cohost, name: "Leo Park", email: "cohost@example.com" },
      { id: owner, name: "Ana Lopez", email: "owner@example.com" },
    ]);
    expect((await asUser(cohost)).rows.map((r) => r.id)).toEqual([cohost]);
    expect((await asUser(stranger)).rows.map((r) => r.id)).toEqual([stranger]);
    // Still only their own to write.
    const renamed = await asActor(db, { kind: "user", id: owner }, (q) =>
      q(`update public.profiles set name = 'X' where id = $1 returning id`, [cohost]),
    );
    expect(renamed.rowCount).toBe(0);
    // A removed co-host's profile is no longer visible.
    await remove(cohost);
    expect((await asUser(owner)).rows.map((r) => r.id)).toEqual([owner]);
  });

  it("the owner-membership guard still holds on the trusted path", async () => {
    expect(
      await errorCode(
        db.query(
          `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'owner')`,
          [eventA, stranger],
        ),
      ),
    ).toBe("42501");
  });
});

describe("create_cohost_invitation", () => {
  it("records only the hash, expiring in 7 days, for the owner before and after publish", async () => {
    const tokenHash = hash();
    const row = await create(tokenHash);
    expect(row.outcome).toBe("created");
    const stored = await invitation(row.invitation_id!);
    expect(stored).toMatchObject({
      event_id: eventA,
      token_hash: tokenHash,
      created_by: owner,
      accepted_by: null,
      accepted_at: null,
      revoked_at: null,
    });
    const days = (row.expires_at!.getTime() - row.created_at!.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(7, 5);
    expect(stored.expires_at).toEqual(row.expires_at);
    await db.query(
      `update public.events set status = 'PUBLISHED', published_at = now(), paid_at = now()
       where id = $1`,
      [eventA],
    );
    expect((await create(hash())).outcome).toBe("created");
  });

  it("refuses a co-host and a stranger, and says not_found for an unknown event", async () => {
    expect(await errorCode(create(hash(), { user: cohost }))).toBe("42501");
    expect(await errorCode(create(hash(), { user: stranger }))).toBe("42501");
    expect(await errorCode(create(hash(), { event: eventB, user: cohost }))).toBe("42501");
    expect((await create(hash(), { event: "00000000-0000-4000-8000-000000000000" })).outcome).toBe(
      "not_found",
    );
    expect(await errorCode(create(Buffer.alloc(16)))).toBe("22023");
    expect(await errorCode(create(Buffer.alloc(0)))).toBe("22023");
    const tokenHash = hash();
    await create(tokenHash);
    expect(await errorCode(create(tokenHash))).toBe("23505");
    expect(
      await db.query(`select count(*)::int as n from public.cohost_invitations`),
    ).toMatchObject({ rows: [{ n: 1 }] });
  });

  it("every write takes the event's lock: each waits for a writer holding the row", async () => {
    const tokenHash = hash();
    const { invitation_id: id } = await create(tokenHash);
    const other = new Client({ connectionString: databaseUrl() });
    await other.connect();
    try {
      await db.query("begin");
      await db.query(`select 1 from public.events where id = $1 for update`, [eventA]);
      const calls: [string, unknown[]][] = [
        [`select * from public.create_cohost_invitation($1, $2, $3)`, [eventA, owner, hash()]],
        [`select * from public.accept_cohost_invitation($1, $2)`, [tokenHash, invitee]],
        [`select public.revoke_cohost_invitation($1, $2, $3)`, [eventA, owner, id]],
        [`select public.remove_cohost($1, $2, $3)`, [eventA, owner, cohost]],
      ];
      for (const [sql, params] of calls) {
        await other.query("begin");
        await other.query("set local lock_timeout = '300ms'");
        expect(await errorCode(other.query(sql, params)), sql).toBe("55P03");
        await other.query("rollback");
      }
      await db.query("rollback");
    } finally {
      await other.end();
    }
  });
});

describe("cohost_invitation_preview", () => {
  it("shows the title and the inviter's name for a usable link, and nothing else", async () => {
    const tokenHash = hash();
    await create(tokenHash);
    for (const user of [null, invitee, stranger]) {
      expect(await preview(tokenHash, user)).toEqual({
        status: "valid",
        event_id: null,
        event_title: "Maya's Shower",
        inviter_name: "Ana Lopez",
        role: null,
      });
    }
  });

  it("falls back to the active design's title, and to no inviter name when there is none", async () => {
    const designId = await insertCardDesign(db, eventB);
    await db.query(`update public.events set active_card_design_id = $1 where id = $2`, [
      designId,
      eventB,
    ]);
    await db.query(`update public.profiles set name = '  ' where id = $1`, [owner]);
    const tokenHash = hash();
    await create(tokenHash, { event: eventB });
    expect(await preview(tokenHash, null)).toMatchObject({
      status: "valid",
      event_title: "Oh Baby",
      inviter_name: null,
    });
    // No card yet and no title: no title.
    await db.query(`update public.events set active_card_design_id = null where id = $1`, [eventB]);
    expect((await preview(tokenHash, null)).event_title).toBeNull();
  });

  it("is invalid, with nothing about the event, when unknown, expired, revoked or used", async () => {
    const blank = {
      status: "invalid",
      event_id: null,
      event_title: null,
      inviter_name: null,
      role: null,
    };
    expect(await preview(hash(), null)).toEqual(blank);
    expect(await preview(Buffer.alloc(5), null)).toEqual(blank);

    const expired = hash();
    const e = await create(expired);
    await db.query(
      `update public.cohost_invitations set created_at = now() - interval '8 days',
         expires_at = now() - interval '1 day' where id = $1`,
      [e.invitation_id],
    );
    expect(await preview(expired, invitee)).toEqual(blank);

    const revoked = hash();
    const r = await create(revoked);
    await revoke(r.invitation_id!);
    expect(await preview(revoked, null)).toEqual(blank);

    const used = hash();
    await create(used);
    await accept(used, invitee);
    expect(await preview(used, stranger)).toEqual(blank);
    expect(await preview(used, null)).toEqual(blank);
  });

  it("tells a member they are one, with the event, whatever the link's state", async () => {
    const tokenHash = hash();
    await create(tokenHash);
    expect(await preview(tokenHash, owner)).toEqual({
      status: "member",
      event_id: eventA,
      event_title: "Maya's Shower",
      inviter_name: null,
      role: "owner",
    });
    expect(await preview(tokenHash, cohost)).toMatchObject({ status: "member", role: "cohost" });
    await accept(tokenHash, invitee);
    expect(await preview(tokenHash, invitee)).toMatchObject({
      status: "member",
      event_id: eventA,
      role: "cohost",
    });
  });
});

describe("accept_cohost_invitation", () => {
  it("makes the person a co-host once, uses the link, and a retry is idempotent", async () => {
    const tokenHash = hash();
    const { invitation_id: id } = await create(tokenHash);
    expect(await accept(tokenHash, invitee)).toEqual({
      outcome: "joined",
      event_id: eventA,
      role: "cohost",
    });
    expect(await members()).toEqual(
      [
        { user_id: owner, role: "owner" },
        { user_id: cohost, role: "cohost" },
        { user_id: invitee, role: "cohost" },
      ].sort((a, b) =>
        a.role === b.role ? a.user_id.localeCompare(b.user_id) : a.role.localeCompare(b.role),
      ),
    );
    const used = await invitation(id!);
    expect(used.accepted_by).toBe(invitee);
    expect(used.accepted_at).not.toBeNull();

    // A retried accept by the same person: already a member, nothing changes.
    expect(await accept(tokenHash, invitee)).toEqual({
      outcome: "already_member",
      event_id: eventA,
      role: "cohost",
    });
    expect((await members()).filter((m) => m.user_id === invitee)).toHaveLength(1);
    expect((await invitation(id!)).accepted_at).toEqual(used.accepted_at);

    // Single use: nobody else can use it.
    expect(await accept(tokenHash, stranger)).toEqual({
      outcome: "invalid",
      event_id: null,
      role: null,
    });
    expect((await members()).some((m) => m.user_id === stranger)).toBe(false);
    // It never touches another event.
    expect(await members(eventB)).toEqual([{ user_id: owner, role: "owner" }]);
  });

  it("refuses an unknown, expired or revoked link with nothing about the event", async () => {
    const invalid = { outcome: "invalid", event_id: null, role: null };
    expect(await accept(hash(), invitee)).toEqual(invalid);

    const expired = hash();
    const e = await create(expired);
    await db.query(
      `update public.cohost_invitations set created_at = now() - interval '8 days',
         expires_at = now() - interval '1 second' where id = $1`,
      [e.invitation_id],
    );
    expect(await accept(expired, invitee)).toEqual(invalid);

    const revoked = hash();
    const r = await create(revoked);
    await revoke(r.invitation_id!);
    expect(await accept(revoked, invitee)).toEqual(invalid);

    expect((await members()).some((m) => m.user_id === invitee)).toBe(false);
    expect(await errorCode(accept(Buffer.alloc(31), invitee))).toBe("22023");
  });

  it("never downgrades or duplicates the owner, and leaves the link for its invitee", async () => {
    const tokenHash = hash();
    const { invitation_id: id } = await create(tokenHash);
    expect(await accept(tokenHash, owner)).toEqual({
      outcome: "already_member",
      event_id: eventA,
      role: "owner",
    });
    expect(await accept(tokenHash, cohost)).toEqual({
      outcome: "already_member",
      event_id: eventA,
      role: "cohost",
    });
    expect((await members()).filter((m) => m.user_id === owner)).toEqual([
      { user_id: owner, role: "owner" },
    ]);
    expect((await invitation(id!)).accepted_at).toBeNull();
    expect((await accept(tokenHash, invitee)).outcome).toBe("joined");
  });

  it("serializes two people accepting one link: exactly one joins", async () => {
    const tokenHash = hash();
    await create(tokenHash);
    const a = new Client({ connectionString: databaseUrl() });
    const b = new Client({ connectionString: databaseUrl() });
    await a.connect();
    await b.connect();
    try {
      await a.query("begin");
      expect((await accept(tokenHash, invitee, a)).outcome).toBe("joined");
      await b.query("begin");
      const second = accept(tokenHash, stranger, b);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await a.query("commit");
      expect((await second).outcome).toBe("invalid");
      await b.query("commit");
      const joined = (await members()).map((m) => m.user_id);
      expect(joined).toContain(invitee);
      expect(joined).not.toContain(stranger);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it("waits for the event's lock, so it cannot race a revoke", async () => {
    const tokenHash = hash();
    const { invitation_id: id } = await create(tokenHash);
    const other = new Client({ connectionString: databaseUrl() });
    await other.connect();
    try {
      await db.query("begin");
      expect(await revoke(id!)).toBe("revoked");
      await other.query("begin");
      const accepting = accept(tokenHash, invitee, other);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await db.query("commit");
      expect((await accepting).outcome).toBe("invalid");
      await other.query("commit");
      expect((await members()).some((m) => m.user_id === invitee)).toBe(false);
    } finally {
      await other.end();
    }
  });

  it("goes with its event", async () => {
    await create(hash());
    await db.query(`delete from public.events where id = $1`, [eventA]);
    expect(
      await db.query(`select count(*)::int as n from public.cohost_invitations`),
    ).toMatchObject({ rows: [{ n: 0 }] });
  });
});

describe("revoke_cohost_invitation", () => {
  it("revokes a pending link for the owner; a used or revoked one is not pending", async () => {
    const { invitation_id: id } = await create(hash());
    expect(await errorCode(revoke(id!, { user: cohost }))).toBe("42501");
    expect(await errorCode(revoke(id!, { user: stranger }))).toBe("42501");
    expect(await revoke(id!)).toBe("revoked");
    expect((await invitation(id!)).revoked_at).not.toBeNull();
    expect(await revoke(id!)).toBe("not_pending");

    const used = hash();
    const u = await create(used);
    await accept(used, invitee);
    expect(await revoke(u.invitation_id!)).toBe("not_pending");
    // Revoking an invitation never removes the co-host it made.
    expect((await members()).some((m) => m.user_id === invitee)).toBe(true);
  });

  it("says not_found for another event's invitation or an unknown one", async () => {
    const { invitation_id: id } = await create(hash(), { event: eventB });
    expect(await revoke(id!, { event: eventA })).toBe("not_found");
    expect(await revoke("00000000-0000-4000-8000-000000000000")).toBe("not_found");
    expect((await invitation(id!)).revoked_at).toBeNull();
  });
});

describe("remove_cohost", () => {
  it("removes a co-host for the owner, and never the owner", async () => {
    expect(await errorCode(remove(cohost, { user: cohost }))).toBe("42501");
    expect(await errorCode(remove(cohost, { user: stranger }))).toBe("42501");
    expect(await remove(owner)).toBe("not_found");
    expect(await remove(stranger)).toBe("not_found");
    expect(await remove(cohost)).toBe("removed");
    expect(await members()).toEqual([{ user_id: owner, role: "owner" }]);
    expect(await remove(cohost)).toBe("not_found");
    expect(await remove(cohost, { event: "00000000-0000-4000-8000-000000000000" })).toBe(
      "not_found",
    );
  });

  it("a removed co-host can come back only through a new invitation", async () => {
    const old = hash();
    await create(old);
    await accept(old, invitee);
    expect(await remove(invitee)).toBe("removed");
    expect((await accept(old, invitee)).outcome).toBe("invalid");
    const fresh = hash();
    await create(fresh);
    expect((await accept(fresh, invitee)).outcome).toBe("joined");
  });
});

describe("pending_cohost_invitations", () => {
  it("lists the owner's working links, oldest first, and nothing secret", async () => {
    const first = await create(hash());
    const second = await create(hash());
    const revoked = await create(hash());
    await revoke(revoked.invitation_id!);
    const usedHash = hash();
    await create(usedHash);
    await accept(usedHash, invitee);
    const expired = await create(hash());
    await db.query(
      `update public.cohost_invitations set created_at = now() - interval '8 days',
         expires_at = now() - interval '1 day' where id = $1`,
      [expired.invitation_id],
    );
    await create(hash(), { event: eventB });

    const rows = await pending();
    expect(rows.map((r) => Object.keys(r).sort())).toEqual([
      ["created_at", "expires_at", "id"],
      ["created_at", "expires_at", "id"],
    ]);
    expect(rows.map((r) => r.id).sort()).toEqual(
      [first.invitation_id, second.invitation_id].sort(),
    );
    expect(await errorCode(pending(eventA, cohost))).toBe("42501");
    expect(await errorCode(pending(eventA, stranger))).toBe("42501");
    expect(await errorCode(pending("00000000-0000-4000-8000-000000000000", owner))).toBe("42501");
  });
});
