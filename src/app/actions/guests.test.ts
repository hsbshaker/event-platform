import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeAdmin } from "../../../tests/unit/support/fake-admin";
import type { FakeAdmin } from "../../../tests/unit/support/fake-admin";

import { resetEnvCache } from "@/lib/env";
import { PARTY_LINK_ROTATION } from "@/lib/guests/guests.server";
import { hashPartyLinkToken, partyLinkKey, partyLinkToken } from "@/lib/guests/personal-link";

/**
 * The guest list's server side (`spec.md §12.2`, §12.5, §25 "Manage guests / import CSV" and
 * "Copy/rotate a party's personal link": owner and co-host; `spec.md §31` — RSVP: "Manual add
 * requires phone or explicit no-phone acknowledgement.", "CSV with missing phone rows imports and
 * flags Needs phone.", "Every party has a personal invitation link ... can be rotated by the host;
 * it resolves only once the event is published."): the actions authorized with the real
 * `requireEventAccess` and permission matrix against the caller's membership, the party checked
 * again on the server, the CSV read again from the file's own bytes, the personal link derived
 * from its row id (only its hash sent to the database), links only once published, and no guest
 * data or token in any log line. The SQL behind the functions is tested against Postgres in
 * `tests/db/guest-parties.test.ts`.
 */

const EVENT = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";
const OWNER = "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2";
const COHOST = "1c1c8f52-56a2-4b0f-8c4e-7d1d9cf6a9e3";
const STRANGER = "2d2d8f52-56a2-4b0f-8c4e-7d1d9cf6a9e4";
const PARTY = "3e3e8f52-56a2-4b0f-8c4e-7d1d9cf6a9e5";
const LINK = "4f4f8f52-56a2-4b0f-8c4e-7d1d9cf6a9e6";
const KEY = Buffer.alloc(32, 7).toString("base64");

type Row = Record<string, unknown>;

/** The signed-in user's own Supabase session, answering as RLS would (members of the event only). */
const session = vi.hoisted(() => ({
  user: null as null | { id: string },
  members: [] as { event_id: string; user_id: string; role: string }[],
  events: [] as { id: string; paid_at: string | null; published_at: string | null }[],
  parties: [] as Row[],
  people: [] as Row[],
}));

function sessionQuery(table: string) {
  const filters: [string, "eq" | "in", unknown][] = [];
  let head = false;
  let range: [number, number] | null = null;
  const memberOf = (eventId: unknown) =>
    session.members.some((m) => m.event_id === eventId && m.user_id === session.user?.id);
  const visible = (): Row[] => {
    switch (table) {
      case "event_members":
        return session.members.filter((m) => memberOf(m.event_id));
      case "events":
        return session.events.filter((e) => memberOf(e.id));
      case "guest_parties":
        return session.parties.filter((p) => memberOf(p.event_id));
      case "guest_people":
        return session.people.filter((p) => memberOf(p.event_id));
      default:
        throw new Error(`unexpected table ${table}`);
    }
  };
  const rows = () => {
    const found = visible().filter((row) =>
      filters.every(([column, op, value]) =>
        op === "eq" ? row[column] === value : (value as unknown[]).includes(row[column]),
      ),
    );
    return range ? found.slice(range[0], range[1] + 1) : found;
  };
  const query = {
    select(_columns: string, options?: { head?: boolean }) {
      head = options?.head === true;
      return query;
    },
    eq(column: string, value: unknown) {
      filters.push([column, "eq", value]);
      return query;
    },
    in(column: string, values: unknown[]) {
      filters.push([column, "in", values]);
      return query;
    },
    order() {
      return query;
    },
    range(from: number, to: number) {
      range = [from, to];
      return query;
    },
    async maybeSingle() {
      return { data: rows()[0] ?? null, error: null };
    },
    then<T>(resolve: (value: unknown) => T, reject?: (reason: unknown) => T) {
      const found = rows();
      return Promise.resolve(
        head ? { data: null, count: found.length, error: null } : { data: found, error: null },
      ).then(resolve, reject);
    },
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.user } }) },
    from: (table: string) => sessionQuery(table),
  }),
}));

const admin = vi.hoisted(() => ({ fake: undefined as unknown as FakeAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.fake.client }));

const { copyPersonalLink, deleteParty, importGuests, loadGuests, rotatePersonalLink, saveParty } =
  await import("./guests");

let logged: string[];

const DRAFT = {
  displayName: "",
  people: [
    { name: "  Ana  Garcia ", type: "adult" as const },
    { name: "Mia Garcia", type: "child" as const },
  ],
  phone: "(512) 555-0123",
  noPhoneAvailable: false,
  email: " Ana@Example.com ",
  plusOneAllowed: true,
};

function csv(text: string, eventId = EVENT): FormData {
  const form = new FormData();
  form.set("eventId", eventId);
  form.set("file", new Blob([text], { type: "text/csv" }), "guests.csv");
  return form;
}

beforeEach(() => {
  admin.fake = fakeAdmin();
  admin.fake.state.rpcAnswers.consume_rate_limit = true;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.APP_ENCRYPTION_KEY = KEY;
  resetEnvCache();
  session.user = { id: OWNER };
  session.members = [
    { event_id: EVENT, user_id: OWNER, role: "owner" },
    { event_id: EVENT, user_id: COHOST, role: "cohost" },
  ];
  session.events = [{ id: EVENT, paid_at: null, published_at: null }];
  session.parties = [
    {
      id: PARTY,
      event_id: EVENT,
      display_name: "Ana & Mia Garcia",
      phone: "+15125550123",
      email: null,
      no_phone_available: false,
      plus_one_allowed: false,
      invitation_status: "not_sent",
      rsvp_status: "awaiting",
      created_at: "2026-10-05T12:00:00Z",
    },
  ];
  session.people = [
    { id: "p1", party_id: PARTY, event_id: EVENT, name: "Ana Garcia", type: "adult", position: 0 },
    { id: "p2", party_id: PARTY, event_id: EVENT, name: "Mia Garcia", type: "child", position: 1 },
  ];
  logged = [];
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
});

afterEach(() => {
  resetEnvCache();
  vi.restoreAllMocks();
});

const tokenOf = (linkId: string) => partyLinkToken(linkId, partyLinkKey(KEY));

describe("access", () => {
  it("lets the owner and co-hosts read the list, derived name left blank in the editor", async () => {
    for (const user of [OWNER, COHOST]) {
      session.user = { id: user };
      const result = await loadGuests(EVENT);
      expect(result).toEqual({
        ok: true,
        list: {
          published: false,
          parties: [
            {
              id: PARTY,
              displayName: "Ana & Mia Garcia",
              customDisplayName: "",
              phone: "+15125550123",
              email: null,
              noPhoneAvailable: false,
              plusOneAllowed: false,
              people: [
                { id: "p1", name: "Ana Garcia", type: "adult" },
                { id: "p2", name: "Mia Garcia", type: "child" },
              ],
              invitationStatus: "not_sent",
              rsvpStatus: "awaiting",
            },
          ],
        },
      });
    }
  });

  it("answers not_found to anyone else, signed out, or for a bad id, and calls nothing", async () => {
    for (const user of [{ id: STRANGER }, null]) {
      session.user = user;
      expect(await loadGuests(EVENT)).toMatchObject({ ok: false, reason: "not_found" });
      expect(await saveParty({ eventId: EVENT, partyId: null, draft: DRAFT })).toMatchObject({
        ok: false,
        reason: "not_found",
      });
      expect(await deleteParty({ eventId: EVENT, partyId: PARTY })).toMatchObject({
        reason: "not_found",
      });
      expect(await importGuests(csv("name\nAna"))).toMatchObject({ reason: "not_found" });
      expect(await copyPersonalLink({ eventId: EVENT, partyId: PARTY })).toMatchObject({
        reason: "not_found",
      });
      expect(await rotatePersonalLink({ eventId: EVENT, partyId: PARTY })).toMatchObject({
        reason: "not_found",
      });
    }
    expect(await loadGuests("not-a-uuid")).toMatchObject({ reason: "not_found" });
    expect(admin.fake.state.rpcs).toEqual([]);
  });
});

describe("saveParty", () => {
  it("creates a party with its personal link row: the link's id and its token's hash only", async () => {
    admin.fake.state.rpcAnswers.save_guest_party = [{ outcome: "created", party_id: PARTY }];
    session.user = { id: COHOST };
    const result = await saveParty({ eventId: EVENT, partyId: null, draft: DRAFT });
    expect(result).toMatchObject({ ok: true, partyId: PARTY });
    const [call] = admin.fake.rpc("save_guest_party");
    const party = call.p_party as Record<string, unknown>;
    expect(call).toMatchObject({ p_event_id: EVENT, p_user_id: COHOST, p_party_id: null });
    expect(party).toMatchObject({
      display_name: "Ana & Mia Garcia",
      phone: "+15125550123",
      email: "ana@example.com",
      no_phone_available: false,
      plus_one_allowed: true,
      people: [
        { name: "Ana Garcia", type: "adult" },
        { name: "Mia Garcia", type: "child" },
      ],
    });
    expect(party.token_hash).toBe(hashPartyLinkToken(tokenOf(party.link_id as string)));
    expect(JSON.stringify(admin.fake.state.rpcs)).not.toContain(tokenOf(party.link_id as string));
  });

  it("refuses a party with neither a phone nor No phone available, before the database", async () => {
    const result = await saveParty({
      eventId: EVENT,
      partyId: null,
      draft: { ...DRAFT, phone: "" },
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "invalid",
      fieldErrors: {
        phone: "Enter a US or Canadian mobile number, or choose No phone available.",
      },
    });
    const foreign = await saveParty({
      eventId: EVENT,
      partyId: null,
      draft: { ...DRAFT, phone: "+44 20 7946 0958" },
    });
    expect(foreign).toMatchObject({ reason: "invalid" });
    expect(admin.fake.rpc("save_guest_party")).toEqual([]);
  });

  it("saves the No phone available override with no phone, and edits without a new link", async () => {
    admin.fake.state.rpcAnswers.save_guest_party = [{ outcome: "saved", party_id: PARTY }];
    const result = await saveParty({
      eventId: EVENT,
      partyId: PARTY,
      draft: { ...DRAFT, phone: "512 555 0123", noPhoneAvailable: true },
    });
    expect(result).toMatchObject({ ok: true });
    const party = admin.fake.rpc("save_guest_party")[0].p_party as Record<string, unknown>;
    expect(party).toMatchObject({ phone: null, no_phone_available: true });
    expect(party).not.toHaveProperty("link_id");
    expect(party).not.toHaveProperty("token_hash");
  });

  it("says plainly when the event is at its limit", async () => {
    admin.fake.state.rpcAnswers.save_guest_party = [{ outcome: "over_limit", party_id: null }];
    expect(await saveParty({ eventId: EVENT, partyId: null, draft: DRAFT })).toEqual({
      ok: false,
      reason: "over_limit",
      error: "An event can have up to 1,000 parties and 2,000 guests.",
    });
  });

  it("logs a failure by its name and code, never the guest's details", async () => {
    admin.fake.state.errors.save_guest_party = {
      message: "new row violates check constraint for +15125550123 Ana Garcia",
      code: "23514",
    };
    expect(await saveParty({ eventId: EVENT, partyId: null, draft: DRAFT })).toMatchObject({
      reason: "failed",
    });
    expect(logged.join("\n")).toContain("23514");
    expect(logged.join("\n")).not.toMatch(/5125550123|Ana|example\.com/);
  });
});

describe("importGuests", () => {
  it("reads the file again on the server and imports rows without a phone as Needs phone", async () => {
    admin.fake.state.rpcAnswers.import_guest_parties = [
      { outcome: "imported", imported: 2, parties: 3, people: 5 },
    ];
    const result = await importGuests(
      csv("Name,Household,Phone\nAna Garcia,G,512-555-0123\nLuis Garcia,G,\nBo Chen,,555-12\n"),
    );
    expect(result).toMatchObject({ ok: true, imported: 2 });
    if (!result.ok) return;
    expect(result.issues).toEqual([
      {
        row: 4,
        message: "Row 4: “555-12” isn't a US or Canadian mobile number, so it was left out.",
      },
    ]);
    const [call] = admin.fake.rpc("import_guest_parties");
    const parties = call.p_parties as Record<string, unknown>[];
    expect(parties.map((p) => [p.display_name, p.phone, p.no_phone_available])).toEqual([
      ["G", "+15125550123", false],
      ["Bo Chen", null, false],
    ]);
    for (const party of parties) {
      expect(party.token_hash).toBe(hashPartyLinkToken(tokenOf(party.link_id as string)));
    }
    expect(new Set(parties.map((p) => p.link_id)).size).toBe(2);
  });

  it("refuses a file without a name column, a file over 1 MB, and an over-limit import whole", async () => {
    expect(await importGuests(csv("Who,Phone\nAna,1"))).toMatchObject({
      reason: "invalid_file",
      error:
        "We need a Name column (or First name and Last name). The columns we read are: Who, Phone.",
    });
    expect(await importGuests(csv(`name\n${"a".repeat(1_000_001)}`))).toMatchObject({
      reason: "invalid_file",
    });
    expect(admin.fake.rpc("import_guest_parties")).toEqual([]);
    admin.fake.state.rpcAnswers.import_guest_parties = [
      { outcome: "over_limit", imported: 0, parties: 1050, people: 1980 },
    ];
    expect(await importGuests(csv("name\nAna"))).toEqual({
      ok: false,
      reason: "over_limit",
      error:
        "This import would bring your guest list to 1,050 parties and 1,980 guests. An event can have up to 1,000 parties and 2,000 guests, so nothing was imported.",
    });
  });
});

describe("personal links", () => {
  it("are not surfaced or rotated before publish", async () => {
    admin.fake.state.rpcAnswers.party_link = [{ outcome: "not_published", link_id: null }];
    expect(await copyPersonalLink({ eventId: EVENT, partyId: PARTY })).toMatchObject({
      ok: false,
      reason: "not_published",
    });
    expect(await rotatePersonalLink({ eventId: EVENT, partyId: PARTY })).toMatchObject({
      ok: false,
      reason: "not_published",
    });
    // Refused before any limit is spent or link made.
    expect(admin.fake.rpc("consume_rate_limit")).toEqual([]);
    expect(admin.fake.rpc("rotate_party_link")).toEqual([]);
  });

  it("copy re-derives the party's link from its row id; rotate makes a new one", async () => {
    session.events = [{ id: EVENT, paid_at: "2026-10-05", published_at: "2026-10-05" }];
    admin.fake.state.rpcAnswers.party_link = [{ outcome: "ok", link_id: LINK }];
    session.user = { id: COHOST };
    const copied = await copyPersonalLink({ eventId: EVENT, partyId: PARTY });
    expect(copied).toEqual({ ok: true, path: `/g/${tokenOf(LINK)}` });
    expect(await copyPersonalLink({ eventId: EVENT, partyId: PARTY })).toEqual(copied);

    admin.fake.state.rpcAnswers.rotate_party_link = "rotated";
    const rotated = await rotatePersonalLink({ eventId: EVENT, partyId: PARTY });
    if (!rotated.ok) throw new Error(rotated.error);
    const [call] = admin.fake.rpc("rotate_party_link");
    expect(rotated.path).toBe(`/g/${tokenOf(call.p_link_id as string)}`);
    expect(rotated.path).not.toBe(copied.ok && copied.path);
    expect(call.p_token_hash).toBe(hashPartyLinkToken(tokenOf(call.p_link_id as string)));
    expect(JSON.stringify(admin.fake.state.rpcs)).not.toContain(tokenOf(call.p_link_id as string));
    expect(admin.fake.rpc("consume_rate_limit")).toEqual([
      expect.objectContaining({ p_bucket: PARTY_LINK_ROTATION.bucket }),
    ]);
    expect(logged).toEqual([]);
  });

  it("refuses a rotation past the event's limit, before making a link", async () => {
    session.events = [{ id: EVENT, paid_at: "2026-10-05", published_at: "2026-10-05" }];
    admin.fake.state.rpcAnswers.consume_rate_limit = false;
    expect(await rotatePersonalLink({ eventId: EVENT, partyId: PARTY })).toMatchObject({
      reason: "rate_limited",
    });
    expect(admin.fake.rpc("rotate_party_link")).toEqual([]);
  });
});
