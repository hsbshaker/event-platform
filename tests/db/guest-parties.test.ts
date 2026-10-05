import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

import { asActor, connect, createAuthUser, errorCode, resetDatabase, type Actor } from "./harness";

/**
 * The guest list (supabase/migrations/20261014000000_guest_parties.sql).
 *
 * spec.md §12.2 (party data; Needs phone from CSV; manual add needs a phone or the No phone
 * available override; shared numbers allowed), §12.5 (every party has one personal link, surfaced
 * and rotatable once published), §24, §25 ("Manage guests / import CSV", "Copy/rotate a party's
 * personal link": owner and co-host), §8.1 (allowed after publish); §31 — RSVP: "Manual add
 * requires phone or explicit no-phone acknowledgement.", "CSV with missing phone rows imports and
 * flags Needs phone.", "Every party has a personal invitation link ... and can be rotated by the
 * host"; §32 #34–37.
 *
 * Token hashes here are opaque 64-character hex values, as the application's SHA-256 of a derived
 * token is (`src/lib/guests/personal-link.ts`).
 */

let db: Client;
let owner: string;
let cohost: string;
let stranger: string;
let eventA: string;
let eventB: string;

const tokenHash = () => createHash("sha256").update(randomUUID()).digest("hex");

type Person = { id?: string; name: string; type: "adult" | "child" };
type PartyInput = {
  display_name?: string;
  phone?: string | null;
  email?: string | null;
  no_phone_available?: boolean;
  plus_one_allowed?: boolean;
  people?: Person[];
  link_id?: string;
  token_hash?: string;
};

function party(input: PartyInput = {}) {
  const people = input.people ?? [{ name: "Ana Garcia", type: "adult" as const }];
  return {
    display_name: input.display_name ?? people[0]?.name ?? "Nobody",
    phone: "phone" in input ? input.phone : "+15125550123",
    email: input.email ?? null,
    no_phone_available: input.no_phone_available ?? false,
    plus_one_allowed: input.plus_one_allowed ?? false,
    people,
    link_id: input.link_id ?? randomUUID(),
    token_hash: input.token_hash ?? tokenHash(),
  };
}

async function save(
  input: object,
  { event = eventA, user = owner, partyId = null as string | null, client = db } = {},
) {
  const { rows } = await client.query(`select * from public.save_guest_party($1, $2, $3, $4)`, [
    event,
    user,
    partyId,
    JSON.stringify(input),
  ]);
  expect(rows).toHaveLength(1);
  return rows[0] as { outcome: string; party_id: string | null };
}

async function importParties(
  parties: object[],
  { event = eventA, user = owner, client = db } = {},
) {
  const { rows } = await client.query(`select * from public.import_guest_parties($1, $2, $3)`, [
    event,
    user,
    JSON.stringify(parties),
  ]);
  expect(rows).toHaveLength(1);
  return rows[0] as { outcome: string; imported: number; parties: number; people: number };
}

async function remove(partyId: string, { event = eventA, user = owner } = {}) {
  const { rows } = await db.query(`select public.delete_guest_party($1, $2, $3) as outcome`, [
    event,
    user,
    partyId,
  ]);
  return rows[0].outcome as string;
}

async function rotate(
  partyId: string,
  { event = eventA, user = owner, linkId = randomUUID() } = {},
) {
  const { rows } = await db.query(
    `select public.rotate_party_link($1, $2, $3, $4, $5) as outcome`,
    [event, user, partyId, linkId, tokenHash()],
  );
  return rows[0].outcome as string;
}

async function link(partyId: string, { event = eventA, user = owner } = {}) {
  const { rows } = await db.query(`select * from public.party_link($1, $2, $3)`, [
    event,
    user,
    partyId,
  ]);
  return rows[0] as { outcome: string; link_id: string | null };
}

async function partyRow(id: string) {
  const { rows } = await db.query(`select * from public.guest_parties where id = $1`, [id]);
  return rows[0];
}

async function peopleOf(id: string) {
  const { rows } = await db.query(
    `select id, name, type, position from public.guest_people where party_id = $1 order by position`,
    [id],
  );
  return rows as { id: string; name: string; type: string; position: number }[];
}

async function linksOf(id: string) {
  const { rows } = await db.query(
    `select id, revoked_at from public.party_invite_links where party_id = $1 order by created_at, revoked_at nulls last`,
    [id],
  );
  return rows as { id: string; revoked_at: Date | null }[];
}

async function count(table: string, event = eventA): Promise<number> {
  const { rows } = await db.query(
    `select count(*)::int as n from public.${table} where event_id = $1`,
    [event],
  );
  return rows[0].n;
}

async function publish(event = eventA) {
  await db.query(
    `update public.events set status = 'PUBLISHED', published_at = now(), paid_at = now(),
       visibility = 'public' where id = $1`,
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
  owner = await createAuthUser(db, "owner@example.com", "Ana Lopez");
  cohost = await createAuthUser(db, "cohost@example.com", "Leo Park");
  stranger = await createAuthUser(db, "stranger@example.com");
  const created = await db.query(
    `insert into public.events (owner_id, prompt) values ($1, 'Event A'), ($1, 'Event B')
     returning id`,
    [owner],
  );
  [eventA, eventB] = created.rows.map((r) => r.id as string);
  await db.query(
    `insert into public.event_members (event_id, user_id, role) values ($1, $2, 'cohost')`,
    [eventA, cohost],
  );
});

describe("RLS and grants", () => {
  it("collaborators read their event's parties and guests; nobody else reads anything", async () => {
    const { party_id } = await save(party());
    await save(party({ people: [{ name: "Bo Chen", type: "adult" }] }), { event: eventB });
    for (const user of [owner, cohost]) {
      const parties = await asActor(db, { kind: "user", id: user }, (q) =>
        q(`select id, phone, event_id from public.guest_parties`),
      );
      // The owner owns both events; the co-host is on event A only.
      expect(parties.rows.filter((r) => r.event_id === eventA).map((r) => r.id)).toEqual([
        party_id,
      ]);
      expect(parties.rows.some((r) => r.event_id === eventB)).toBe(user === owner);
      const people = await asActor(db, { kind: "user", id: user }, (q) =>
        q(`select name from public.guest_people where party_id = $1`, [party_id]),
      );
      expect(people.rows).toEqual([{ name: "Ana Garcia" }]);
    }
    const strangers = await asActor(db, { kind: "user", id: stranger }, async (q) => [
      (await q(`select * from public.guest_parties`)).rowCount,
      (await q(`select * from public.guest_people`)).rowCount,
    ]);
    expect(strangers).toEqual([0, 0]);
    for (const table of ["guest_parties", "guest_people"]) {
      expect(
        await errorCode(asActor(db, { kind: "anon" }, (q) => q(`select * from public.${table}`))),
        table,
      ).toBe("42501");
    }
  });

  it("nobody but the service role reads personal links", async () => {
    await save(party());
    const actors: Actor[] = [
      { kind: "anon" },
      { kind: "user", id: owner },
      { kind: "user", id: cohost },
      { kind: "user", id: stranger },
    ];
    for (const actor of actors) {
      expect(
        await errorCode(
          asActor(db, actor, (q) => q(`select id, token_hash from public.party_invite_links`)),
        ),
        JSON.stringify(actor),
      ).toBe("42501");
    }
    const service = await asActor(db, { kind: "service" }, (q) =>
      q(`select id from public.party_invite_links`),
    );
    expect(service.rowCount).toBe(1);
  });

  it("refuses every end-user write", async () => {
    const { party_id } = await save(party());
    const [person] = await peopleOf(party_id!);
    const statements = [
      `insert into public.guest_parties (event_id, display_name, primary_contact_name,
         contact_consent_source, max_adults) values ('${eventA}', 'X', 'X', 'host_entered', 1)`,
      `update public.guest_parties set phone = null`,
      `delete from public.guest_parties`,
      `insert into public.guest_people (party_id, event_id, name, type, position)
         values ('${party_id}', '${eventA}', 'Y', 'adult', 1)`,
      `update public.guest_people set name = 'Z' where id = '${person.id}'`,
      `delete from public.guest_people`,
      `insert into public.party_invite_links (id, event_id, party_id, token_hash)
         values ('${randomUUID()}', '${eventA}', '${party_id}', '${tokenHash()}')`,
      `update public.party_invite_links set revoked_at = now()`,
      `delete from public.party_invite_links`,
    ];
    const actors: Actor[] = [
      { kind: "anon" },
      { kind: "user", id: owner },
      { kind: "user", id: cohost },
    ];
    for (const actor of actors) {
      for (const sql of statements) {
        expect(await errorCode(asActor(db, actor, (q) => q(sql))), `${actor.kind}: ${sql}`).toBe(
          "42501",
        );
      }
    }
  });

  it("only the service role may call the guest functions, and nobody calls the internal ones", async () => {
    const { party_id } = await save(party());
    const calls = [
      [`select * from public.save_guest_party($1, $2, null, $3)`, [eventA, owner, party()]],
      [`select public.delete_guest_party($1, $2, $3)`, [eventA, owner, party_id]],
      [`select * from public.import_guest_parties($1, $2, $3)`, [eventA, owner, [party()]]],
      [`select * from public.party_link($1, $2, $3)`, [eventA, owner, party_id]],
      [
        `select public.rotate_party_link($1, $2, $3, $4, $5)`,
        [eventA, owner, party_id, randomUUID(), tokenHash()],
      ],
    ] as const;
    const ends: Actor[] = [
      { kind: "anon" },
      { kind: "user", id: owner },
      { kind: "user", id: cohost },
    ];
    for (const actor of ends) {
      for (const [sql, params] of calls) {
        expect(
          await errorCode(
            asActor(db, actor, (q) =>
              q(
                sql,
                params.map((p) => (typeof p === "object" ? JSON.stringify(p) : p)),
              ),
            ),
          ),
          `${actor.kind}: ${sql}`,
        ).toBe("42501");
      }
    }
    for (const [sql, params] of calls) {
      expect(
        await errorCode(
          asActor(db, { kind: "service" }, (q) =>
            q(
              sql,
              params.map((p) => (typeof p === "object" ? JSON.stringify(p) : p)),
            ),
          ),
        ),
        `service: ${sql}`,
      ).toBeNull();
    }
    for (const [sql, params] of [
      [`select public.guest_lock_event($1, $2)`, [eventA, owner]],
      [
        `select public.guest_write_party($1, null, $2, 'host_entered', true)`,
        [eventA, JSON.stringify(party())],
      ],
    ] as const) {
      for (const actor of [...ends, { kind: "service" } as Actor]) {
        expect(
          await errorCode(asActor(db, actor, (q) => q(sql, [...params]))),
          `${actor.kind}: ${sql}`,
        ).toBe("42501");
      }
    }
  });

  it("refuses a non-member on every function, and answers not_found for no such event", async () => {
    const { party_id } = await save(party());
    for (const call of [
      () => save(party(), { user: stranger }),
      () => importParties([party()], { user: stranger }),
      () => remove(party_id!, { user: stranger }),
      () => rotate(party_id!, { user: stranger }),
      () => link(party_id!, { user: stranger }),
    ]) {
      expect(await errorCode(call())).toBe("42501");
    }
    const missing = randomUUID();
    expect((await save(party(), { event: missing })).outcome).toBe("not_found");
    expect((await importParties([party()], { event: missing })).outcome).toBe("not_found");
    expect(await remove(party_id!, { event: missing })).toBe("not_found");
    expect(await rotate(party_id!, { event: missing })).toBe("not_found");
    expect((await link(party_id!, { event: missing })).outcome).toBe("not_found");
  });
});

describe("save_guest_party", () => {
  it("creates a party with its guests and exactly one personal link", async () => {
    const linkId = randomUUID();
    const { outcome, party_id } = await save(
      party({
        display_name: "Ana & Luis Garcia",
        email: "ana@example.com",
        plus_one_allowed: true,
        link_id: linkId,
        people: [
          { name: "Ana Garcia", type: "adult" },
          { name: "Luis Garcia", type: "adult" },
          { name: "Mia Garcia", type: "child" },
        ],
      }),
      { user: cohost },
    );
    expect(outcome).toBe("created");
    expect(await partyRow(party_id!)).toMatchObject({
      event_id: eventA,
      display_name: "Ana & Luis Garcia",
      primary_contact_name: "Ana Garcia",
      phone: "+15125550123",
      email: "ana@example.com",
      no_phone_available: false,
      contact_consent_source: "host_entered",
      max_adults: 2,
      max_children: 1,
      plus_one_allowed: true,
      invitation_status: "not_sent",
      invitations_sent: 0,
      rsvp_status: "awaiting",
      submitted_at: null,
    });
    expect((await peopleOf(party_id!)).map((p) => [p.name, p.type, p.position])).toEqual([
      ["Ana Garcia", "adult", 0],
      ["Luis Garcia", "adult", 1],
      ["Mia Garcia", "child", 2],
    ]);
    expect(await linksOf(party_id!)).toEqual([{ id: linkId, revoked_at: null }]);
  });

  it("requires a phone or the No phone available override, never both", async () => {
    expect(await errorCode(save(party({ phone: null })))).toBe("22023");
    const noPhone = await save(party({ phone: null, no_phone_available: true }));
    expect(noPhone.outcome).toBe("created");
    expect(await partyRow(noPhone.party_id!)).toMatchObject({
      phone: null,
      no_phone_available: true,
    });
    expect(await errorCode(save(party({ no_phone_available: true })))).toBe("23514");
    expect(await errorCode(save(party({ phone: "+445125550123" })))).toBe("23514");
    expect(await errorCode(save(party({ phone: "5125550123" })))).toBe("23514");
    // Shared numbers are fine (spec.md §12.2).
    expect((await save(party())).outcome).toBe("created");
    expect((await save(party())).outcome).toBe("created");
  });

  it("refuses a party without guests, with a child as main contact, or with a bad name", async () => {
    expect(await errorCode(save(party({ people: [] })))).toBe("22023");
    expect(await errorCode(save(party({ people: [{ name: "Mia", type: "child" }] })))).toBe(
      "22023",
    );
    expect(
      await errorCode(save(party({ people: [{ name: "Ana", type: "plus_one" as "adult" }] }))),
    ).toBe("22023");
    expect(await errorCode(save(party({ people: [{ name: " Ana", type: "adult" }] })))).toBe(
      "23514",
    );
    expect(
      await errorCode(save(party({ people: [{ name: "A".repeat(81), type: "adult" }] }))),
    ).toBe("23514");
    expect(await errorCode(save({ ...party(), link_id: null }))).toBe("22023");
    expect(await count("guest_parties")).toBe(0);
  });

  it("updates a party, keeping guests by id and removing the ones left out", async () => {
    const { party_id } = await save(
      party({
        people: [
          { name: "Ana Garcia", type: "adult" },
          { name: "Luis Garcia", type: "adult" },
          { name: "Mia Garcia", type: "child" },
        ],
      }),
    );
    const [ana, , mia] = await peopleOf(party_id!);
    const [{ id: linkId }] = await linksOf(party_id!);
    const result = await save(
      {
        display_name: "The Garcias",
        phone: null,
        email: null,
        no_phone_available: true,
        plus_one_allowed: true,
        people: [
          { id: mia.id, name: "Mia Garcia", type: "adult" },
          { id: ana.id, name: "Ana G. Garcia", type: "adult" },
          { name: "Leo Garcia", type: "child" },
        ],
      },
      { partyId: party_id, user: cohost },
    );
    expect(result).toEqual({ outcome: "saved", party_id });
    const people = await peopleOf(party_id!);
    expect(people.map((p) => [p.name, p.type])).toEqual([
      ["Mia Garcia", "adult"],
      ["Ana G. Garcia", "adult"],
      ["Leo Garcia", "child"],
    ]);
    expect(people[0].id).toBe(mia.id);
    expect(people[1].id).toBe(ana.id);
    expect(await partyRow(party_id!)).toMatchObject({
      display_name: "The Garcias",
      primary_contact_name: "Mia Garcia",
      phone: null,
      no_phone_available: true,
      max_adults: 2,
      max_children: 1,
      plus_one_allowed: true,
    });
    // The link is the party's, untouched by an edit.
    expect(await linksOf(party_id!)).toEqual([{ id: linkId, revoked_at: null }]);
  });

  it("marks a phone the host typed in as theirs, and keeps the source otherwise", async () => {
    await importParties([party({ phone: null })]);
    const { rows } = await db.query(`select id from public.guest_parties where event_id = $1`, [
      eventA,
    ]);
    const id = rows[0].id as string;
    const [person] = await peopleOf(id);
    const edit = (phone: string | null, noPhone = false) =>
      save(
        {
          display_name: "Ana Garcia",
          phone,
          no_phone_available: noPhone,
          people: [{ id: person.id, name: "Ana Garcia", type: "adult" }],
        },
        { partyId: id },
      );
    await edit(null, true);
    expect((await partyRow(id)).contact_consent_source).toBe("csv_import");
    await edit("+15125550199");
    expect((await partyRow(id)).contact_consent_source).toBe("host_entered");
  });

  it("refuses a guest of another party and a party of another event", async () => {
    const first = await save(party());
    const second = await save(party({ people: [{ name: "Bo Chen", type: "adult" }] }));
    const [bo] = await peopleOf(second.party_id!);
    expect(
      await errorCode(
        save(
          { ...party(), people: [{ id: bo.id, name: "Bo Chen", type: "adult" }] },
          { partyId: first.party_id },
        ),
      ),
    ).toBe("22023");
    const [ana] = await peopleOf(first.party_id!);
    expect(
      await errorCode(
        save(
          {
            ...party(),
            people: [
              { id: ana.id, name: "Ana", type: "adult" },
              { id: ana.id, name: "Ana", type: "adult" },
            ],
          },
          { partyId: first.party_id },
        ),
      ),
    ).toBe("22023");
    const other = await save(party(), { event: eventB });
    expect((await save(party(), { partyId: other.party_id })).outcome).toBe("not_found");
    expect(await peopleOf(second.party_id!)).toHaveLength(1);
  });

  it("keeps an event to 1,000 parties and 2,000 guests, counted inside the lock", async () => {
    const many = (n: number, size = 1) =>
      Array.from({ length: n }, (_, i) =>
        party({
          people: Array.from({ length: size }, (_, j) => ({
            name: `Guest ${i}-${j}`,
            type: "adult" as const,
          })),
        }),
      );
    expect((await importParties(many(999))).outcome).toBe("imported");
    const last = await save(party());
    expect(last.outcome).toBe("created");
    expect(await save(party())).toEqual({ outcome: "over_limit", party_id: null });
    expect(await count("guest_parties")).toBe(1000);
    // 1,000 guests so far: editing a party up to 1,001 more is refused, up to 1,000 more is fine.
    const grow = (size: number) =>
      save(
        party({
          people: Array.from({ length: size }, (_, j) => ({
            name: `Extra ${j}`,
            type: "adult" as const,
          })),
        }),
        { partyId: last.party_id },
      );
    expect((await grow(1002)).outcome).toBe("over_limit");
    expect((await grow(1001)).outcome).toBe("saved");
    expect(await count("guest_people")).toBe(2000);
  });
});

describe("delete_guest_party", () => {
  it("deletes a party with its guests and links, and only the event's own", async () => {
    const { party_id } = await save(party());
    const other = await save(party(), { event: eventB });
    expect(await remove(other.party_id!)).toBe("not_found");
    expect(await remove(party_id!, { user: cohost })).toBe("deleted");
    expect(await count("guest_parties")).toBe(0);
    expect(await count("guest_people")).toBe(0);
    expect(await count("party_invite_links")).toBe(0);
    expect(await remove(party_id!)).toBe("not_found");
    expect(await count("guest_parties", eventB)).toBe(1);
  });
});

describe("import_guest_parties", () => {
  it("imports parties without phones as Needs phone, each with one link", async () => {
    const result = await importParties(
      [
        party({ phone: null }),
        party({ people: [{ name: "Bo Chen", type: "adult" }] }),
        party({
          phone: null,
          people: [
            { name: "Cy Diaz", type: "adult" },
            { name: "Di Diaz", type: "child" },
          ],
        }),
      ],
      { user: cohost },
    );
    expect(result).toEqual({ outcome: "imported", imported: 3, parties: 3, people: 4 });
    const { rows } = await db.query(
      `select id, phone, no_phone_available, contact_consent_source from public.guest_parties
       where event_id = $1 order by created_at`,
      [eventA],
    );
    expect(rows.map((r) => [r.phone, r.no_phone_available, r.contact_consent_source])).toEqual([
      [null, false, "csv_import"],
      ["+15125550123", false, "csv_import"],
      [null, false, "csv_import"],
    ]);
    for (const row of rows) expect(await linksOf(row.id)).toHaveLength(1);
  });

  it("is all or nothing", async () => {
    await save(party());
    for (const bad of [
      party({ phone: "+44000" }),
      party({ people: [{ name: "Mia", type: "child" }] }),
      { ...party(), link_id: null },
      { ...party(), id: randomUUID() },
    ]) {
      expect(await errorCode(importParties([party(), party(), bad, party()]))).not.toBeNull();
      expect(await count("guest_parties")).toBe(1);
      expect(await count("guest_people")).toBe(1);
      expect(await count("party_invite_links")).toBe(1);
    }
    // A link id used twice refuses the whole import too.
    const linkId = randomUUID();
    expect(
      await errorCode(importParties([party({ link_id: linkId }), party({ link_id: linkId })])),
    ).toBe("23505");
    expect(await count("guest_parties")).toBe(1);
    expect(await errorCode(importParties([]))).toBe("22023");
  });

  it("refuses an import that would pass a limit, whole, naming the counts", async () => {
    await importParties(
      Array.from({ length: 10 }, (_, i) =>
        party({ people: [{ name: `Guest ${i}`, type: "adult" }] }),
      ),
    );
    const parties = Array.from({ length: 991 }, (_, i) =>
      party({ people: [{ name: `New ${i}`, type: "adult" }] }),
    );
    expect(await importParties(parties)).toEqual({
      outcome: "over_limit",
      imported: 0,
      parties: 1001,
      people: 1001,
    });
    expect(await count("guest_parties")).toBe(10);
    const big = Array.from({ length: 2 }, (_, i) =>
      party({
        people: Array.from({ length: 996 }, (_, j) => ({
          name: `Big ${i}-${j}`,
          type: "adult" as const,
        })),
      }),
    );
    expect(await importParties(big)).toEqual({
      outcome: "over_limit",
      imported: 0,
      parties: 12,
      people: 2002,
    });
    expect(await count("guest_people")).toBe(10);
  });

  it("serializes concurrent imports on the event's lock, so the limit holds", async () => {
    const other = await connect();
    try {
      const batch = () =>
        Array.from({ length: 600 }, (_, i) =>
          party({ people: [{ name: `Guest ${i}`, type: "adult" }] }),
        );
      const results = await Promise.all([
        importParties(batch()),
        importParties(batch(), { client: other }),
      ]);
      expect(results.map((r) => r.outcome).sort()).toEqual(["imported", "over_limit"]);
      expect(await count("guest_parties")).toBe(600);
    } finally {
      await other.end();
    }
  });
});

describe("personal links", () => {
  it("are surfaced and rotatable only once the event is published", async () => {
    const { party_id } = await save(party());
    expect(await link(party_id!)).toEqual({ outcome: "not_published", link_id: null });
    expect(await rotate(party_id!)).toBe("not_published");
    expect(await linksOf(party_id!)).toHaveLength(1);
  });

  it("rotate revokes the working link and leaves exactly one active", async () => {
    const { party_id } = await save(party());
    const [{ id: first }] = await linksOf(party_id!);
    await publish();
    expect(await link(party_id!, { user: cohost })).toEqual({ outcome: "ok", link_id: first });

    const second = randomUUID();
    expect(await rotate(party_id!, { linkId: second, user: cohost })).toBe("rotated");
    const third = randomUUID();
    expect(await rotate(party_id!, { linkId: third })).toBe("rotated");
    const links = await linksOf(party_id!);
    expect(links).toHaveLength(3);
    expect(links.filter((l) => l.revoked_at === null).map((l) => l.id)).toEqual([third]);
    expect(links.find((l) => l.id === first)!.revoked_at).not.toBeNull();
    expect(await link(party_id!)).toEqual({ outcome: "ok", link_id: third });
  });

  it("allow one active link per party and only under a party of the same event", async () => {
    const { party_id } = await save(party());
    const other = await save(party(), { event: eventB });
    expect(
      await errorCode(
        db.query(
          `insert into public.party_invite_links (id, event_id, party_id, token_hash)
           values ($1, $2, $3, $4)`,
          [randomUUID(), eventA, party_id, tokenHash()],
        ),
      ),
    ).toBe("23505");
    expect(
      await errorCode(
        db.query(
          `insert into public.party_invite_links (id, event_id, party_id, token_hash, revoked_at)
           values ($1, $2, $3, $4, now())`,
          [randomUUID(), eventA, other.party_id, tokenHash()],
        ),
      ),
    ).toBe("23503");
    expect(await rotate(other.party_id!)).toBe("not_found");
    expect((await link(other.party_id!)).outcome).toBe("not_found");
  });

  it("guests and parties stay managed after publish (spec.md §8.1)", async () => {
    await publish();
    const created = await save(party());
    expect(created.outcome).toBe("created");
    expect((await importParties([party({ phone: null })])).outcome).toBe("imported");
    expect(await remove(created.party_id!)).toBe("deleted");
  });
});

describe("integrity", () => {
  it("a guest can never sit under a party of another event", async () => {
    const { party_id } = await save(party());
    expect(
      await errorCode(
        db.query(
          `insert into public.guest_people (party_id, event_id, name, type, position)
           values ($1, $2, 'Intruder', 'adult', 5)`,
          [party_id, eventB],
        ),
      ),
    ).toBe("23503");
    expect(
      await errorCode(
        db.query(`update public.guest_people set event_id = $1 where party_id = $2`, [
          eventB,
          party_id,
        ]),
      ),
    ).toBe("23503");
  });

  it("deleting the event deletes its guest list", async () => {
    await save(party());
    await db.query(`delete from public.events where id = $1`, [eventA]);
    for (const table of ["guest_parties", "guest_people", "party_invite_links"]) {
      const { rows } = await db.query(`select count(*)::int as n from public.${table}`);
      expect(rows[0].n, table).toBe(0);
    }
  });
});
