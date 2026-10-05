import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeAdmin } from "../../../tests/unit/support/fake-admin";
import type { FakeAdmin } from "../../../tests/unit/support/fake-admin";

import { generateInviteToken, hashInviteToken } from "@/lib/cohosts/token";
import { resetEnvCache } from "@/lib/env";
import {
  INVITE_CREATION,
  INVITE_LOOKUP_PER_IP,
  INVITE_LOOKUP_PER_USER,
  cohostSummary,
  previewInvitation,
} from "@/lib/cohosts/invitations.server";

/**
 * Co-host invitations, server side (`spec.md §6.2`, §25 "Manage co-host access": owner only, §27;
 * `spec.md §31` — Roles/publishing: "Owner-only billing/co-host management/delete"): the owner's
 * actions authorized with the real `requireEventAccess` and permission matrix against the caller's
 * membership (owner, co-host, stranger, signed out), the token hashed before any query, look-ups
 * rate-limited per IP and account, and no token in any log line. The SQL behind the functions is
 * tested against Postgres in `tests/db/cohost-invitations.test.ts`.
 */

const EVENT = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";
const OWNER = "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2";
const COHOST = "1c1c8f52-56a2-4b0f-8c4e-7d1d9cf6a9e3";
const STRANGER = "2d2d8f52-56a2-4b0f-8c4e-7d1d9cf6a9e4";
const INVITATION = "3e3e8f52-56a2-4b0f-8c4e-7d1d9cf6a9e5";
const KEY = Buffer.alloc(32, 7).toString("base64");

type Row = Record<string, unknown>;

/**
 * The signed-in user's own Supabase session, answering as RLS would: `event_members` and `events`
 * only for a member, `profiles` for the owner's members (and oneself).
 */
const session = vi.hoisted(() => ({
  user: null as null | { id: string },
  members: [] as { event_id: string; user_id: string; role: string; created_at: string }[],
  profiles: [] as { id: string; name: string | null; email: string | null }[],
  events: [] as { id: string; paid_at: string | null; published_at: string | null }[],
}));

function sessionQuery(table: string) {
  const filters: [string, "eq" | "in", unknown][] = [];
  let head = false;
  const visible = (): Row[] => {
    const me = session.user?.id;
    const memberOf = (eventId: unknown) =>
      session.members.some((m) => m.event_id === eventId && m.user_id === me);
    const ownerOf = (eventId: unknown) =>
      session.members.some((m) => m.event_id === eventId && m.user_id === me && m.role === "owner");
    switch (table) {
      case "event_members":
        return session.members.filter((m) => memberOf(m.event_id));
      case "events":
        return session.events.filter((e) => memberOf(e.id));
      case "profiles":
        return session.profiles.filter(
          (p) =>
            p.id === me || session.members.some((m) => m.user_id === p.id && ownerOf(m.event_id)),
        );
      default:
        throw new Error(`unexpected table ${table}`);
    }
  };
  const rows = () =>
    visible().filter((row) =>
      filters.every(([column, op, value]) =>
        op === "eq" ? row[column] === value : (value as unknown[]).includes(row[column]),
      ),
    );
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

const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.value }));

const { acceptCohostInvite, createCohostInvite, loadCohosts, removeCohost, revokeCohostInvite } =
  await import("./cohosts");

/** Every argument of every console call, serialized, so a test can search what was logged. */
let logged: string[];

/** Rate-limit buckets consumed, in order. */
function limits(): string[] {
  return admin.fake.rpc("consume_rate_limit").map((a) => a.p_bucket as string);
}

beforeEach(() => {
  admin.fake = fakeAdmin();
  admin.fake.state.rpcAnswers.consume_rate_limit = true;
  admin.fake.state.rpcAnswers.pending_cohost_invitations = [
    {
      id: INVITATION,
      created_at: "2026-10-04T12:00:00+00:00",
      expires_at: "2026-10-11T12:00:00+00:00",
    },
  ];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.APP_ENCRYPTION_KEY = KEY;
  resetEnvCache();
  requestHeaders.value = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
  session.user = { id: OWNER };
  session.members = [
    { event_id: EVENT, user_id: COHOST, role: "cohost", created_at: "2026-10-03T00:00:00Z" },
    { event_id: EVENT, user_id: OWNER, role: "owner", created_at: "2026-10-01T00:00:00Z" },
  ];
  session.profiles = [
    { id: OWNER, name: "Ana Lopez", email: "ana@example.com" },
    { id: COHOST, name: null, email: "leo@example.com" },
    { id: STRANGER, name: "Stranger", email: "s@example.com" },
  ];
  session.events = [{ id: EVENT, paid_at: null, published_at: null }];
  logged = [];
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(
        args
          .map((a) =>
            typeof a === "string"
              ? a
              : JSON.stringify(a, (_k, v) => (v instanceof Error ? { ...v, m: v.message } : v)),
          )
          .join(" "),
      );
    });
  }
});

afterEach(() => {
  resetEnvCache();
  vi.restoreAllMocks();
});

const hex = (token: string) => `\\x${hashInviteToken(token, KEY).toString("hex")}`;

describe("the owner's co-host management", () => {
  it("lists the owner first, then co-hosts by name or email, and the working links", async () => {
    const result = await loadCohosts(EVENT);
    expect(result).toEqual({
      ok: true,
      roster: {
        members: [
          { userId: OWNER, role: "owner", name: "Ana Lopez", email: "ana@example.com", you: true },
          { userId: COHOST, role: "cohost", name: null, email: "leo@example.com", you: false },
        ],
        pending: [
          {
            id: INVITATION,
            createdAt: "2026-10-04T12:00:00.000Z",
            expiresAt: "2026-10-11T12:00:00.000Z",
          },
        ],
      },
    });
    expect(admin.fake.rpc("pending_cohost_invitations")).toEqual([
      { p_event_id: EVENT, p_user_id: OWNER },
    ]);
  });

  it("creates a link: a fresh token in the path, only its hash sent to the database", async () => {
    admin.fake.state.rpcAnswers.create_cohost_invitation = [
      {
        outcome: "created",
        invitation_id: INVITATION,
        created_at: "2026-10-05T12:00:00+00:00",
        expires_at: "2026-10-12T12:00:00+00:00",
      },
    ];
    const result = await createCohostInvite(EVENT);
    if (!result.ok) throw new Error(result.error);
    const token = result.path.slice("/invite/".length);
    expect(result.path).toMatch(/^\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(result.invitation).toEqual({
      id: INVITATION,
      createdAt: "2026-10-05T12:00:00.000Z",
      expiresAt: "2026-10-12T12:00:00.000Z",
    });
    const [call] = admin.fake.rpc("create_cohost_invitation");
    expect(call).toEqual({ p_event_id: EVENT, p_user_id: OWNER, p_token_hash: hex(token) });
    // Nothing that reaches the database or a log holds the token.
    expect(JSON.stringify(admin.fake.state.rpcs)).not.toContain(token);
    expect(logged.join("\n")).not.toContain(token);
    // Counted per event, and only after the owner was authorized.
    expect(admin.fake.rpc("consume_rate_limit")).toEqual([
      expect.objectContaining({ p_bucket: INVITE_CREATION.bucket }),
    ]);
    // Two links never share a token.
    const second = await createCohostInvite(EVENT);
    expect(second.ok && second.path).not.toBe(result.path);
  });

  it("refuses a new link past the event's limit, before making one", async () => {
    admin.fake.state.rpcAnswers.consume_rate_limit = false;
    const result = await createCohostInvite(EVENT);
    expect(result).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(admin.fake.rpc("create_cohost_invitation")).toEqual([]);
  });

  it("revokes a link and removes a co-host, returning the roster", async () => {
    admin.fake.state.rpcAnswers.revoke_cohost_invitation = "revoked";
    admin.fake.state.rpcAnswers.remove_cohost = "removed";
    expect(await revokeCohostInvite({ eventId: EVENT, invitationId: INVITATION })).toMatchObject({
      ok: true,
    });
    expect(admin.fake.rpc("revoke_cohost_invitation")).toEqual([
      { p_event_id: EVENT, p_user_id: OWNER, p_invitation_id: INVITATION },
    ]);
    expect(await removeCohost({ eventId: EVENT, userId: COHOST })).toMatchObject({ ok: true });
    expect(admin.fake.rpc("remove_cohost")).toEqual([
      { p_event_id: EVENT, p_user_id: OWNER, p_cohost_id: COHOST },
    ]);
  });

  it("says plainly when a link was already used or revoked, or a person is not a co-host", async () => {
    admin.fake.state.rpcAnswers.revoke_cohost_invitation = "not_pending";
    admin.fake.state.rpcAnswers.remove_cohost = "not_found";
    expect(await revokeCohostInvite({ eventId: EVENT, invitationId: INVITATION })).toMatchObject({
      ok: false,
      reason: "not_pending",
    });
    expect(await removeCohost({ eventId: EVENT, userId: OWNER })).toMatchObject({
      ok: false,
      reason: "not_found",
    });
  });

  it("tells Creation Mode the owner manages co-hosts, and how many there are", async () => {
    expect(await cohostSummary(EVENT)).toEqual({ manage: true, count: 1 });
  });

  describe.each([
    ["a co-host", () => (session.user = { id: COHOST })],
    ["a stranger", () => (session.user = { id: STRANGER })],
    ["a signed-out visitor", () => (session.user = null)],
  ])("for %s", (_label, signIn) => {
    it("every action is the same not-found, and nothing reaches the database", async () => {
      signIn();
      admin.fake.state.rpcAnswers.create_cohost_invitation = [{ outcome: "created" }];
      admin.fake.state.rpcAnswers.revoke_cohost_invitation = "revoked";
      admin.fake.state.rpcAnswers.remove_cohost = "removed";
      for (const result of [
        await loadCohosts(EVENT),
        await createCohostInvite(EVENT),
        await revokeCohostInvite({ eventId: EVENT, invitationId: INVITATION }),
        await removeCohost({ eventId: EVENT, userId: COHOST }),
      ]) {
        expect(result).toEqual({
          ok: false,
          reason: "not_found",
          error: "This event isn't available.",
        });
      }
      // Not even a rate-limit unit is spent for them.
      expect(admin.fake.state.rpcs).toEqual([]);
      expect(await cohostSummary(EVENT)).toEqual({ manage: false });
    });
  });

  it("rejects ids that are not ids without a call", async () => {
    for (const result of [
      await loadCohosts("nope"),
      await createCohostInvite("nope"),
      await revokeCohostInvite({ eventId: EVENT, invitationId: "nope" }),
      await removeCohost({ eventId: "nope", userId: COHOST }),
    ]) {
      expect(result).toMatchObject({ ok: false, reason: "not_found" });
    }
    expect(admin.fake.state.rpcs).toEqual([]);
  });

  it("logs a failure by its name and code only", async () => {
    admin.fake.state.errors.create_cohost_invitation = {
      message: "duplicate key value violates unique constraint (token_hash)=(\\xdeadbeef)",
      code: "23505",
    };
    const result = await createCohostInvite(EVENT);
    expect(result).toMatchObject({ ok: false, reason: "failed" });
    expect(logged.join("\n")).not.toContain("deadbeef");
    expect(logged.join("\n")).toContain("23505");
  });
});

describe("joining with a link", () => {
  beforeEach(() => {
    session.user = { id: STRANGER };
  });

  it("hashes the token, joins the signed-in person, and returns their event", async () => {
    const token = generateInviteToken();
    admin.fake.state.rpcAnswers.accept_cohost_invitation = [
      { outcome: "joined", event_id: EVENT, role: "cohost" },
    ];
    expect(await acceptCohostInvite(token)).toEqual({ ok: true, eventId: EVENT });
    expect(admin.fake.rpc("accept_cohost_invitation")).toEqual([
      { p_token_hash: hex(token), p_user_id: STRANGER },
    ]);
    expect(JSON.stringify(admin.fake.state.rpcs)).not.toContain(token);
    // Counted per IP and per account; the IP is the client's, never stored raw.
    expect(limits()).toEqual([INVITE_LOOKUP_PER_IP.bucket, INVITE_LOOKUP_PER_USER.bucket]);
    expect(JSON.stringify(admin.fake.state.rpcs)).not.toContain("203.0.113.9");
  });

  it("an owner or co-host already on the event goes to it; the link is not theirs to use", async () => {
    admin.fake.state.rpcAnswers.accept_cohost_invitation = [
      { outcome: "already_member", event_id: EVENT, role: "owner" },
    ];
    expect(await acceptCohostInvite(generateInviteToken())).toEqual({ ok: true, eventId: EVENT });
  });

  it("says one calm thing for every link that does not work, and nothing about the event", async () => {
    admin.fake.state.rpcAnswers.accept_cohost_invitation = [
      { outcome: "invalid", event_id: null, role: null },
    ];
    const message =
      "This invitation link isn't valid anymore. Ask the person who invited you for a new one.";
    expect(await acceptCohostInvite(generateInviteToken())).toEqual({
      ok: false,
      reason: "invalid",
      error: message,
    });
    // A malformed token never reaches the database or the limiter.
    admin.fake.state.rpcs = [];
    for (const bad of ["", "short", `${generateInviteToken()}x`, "../../etc/passwd"]) {
      expect(await acceptCohostInvite(bad)).toEqual({
        ok: false,
        reason: "invalid",
        error: message,
      });
    }
    expect(admin.fake.state.rpcs).toEqual([]);
  });

  it("asks a signed-out visitor to sign in, without a look-up", async () => {
    session.user = null;
    expect(await acceptCohostInvite(generateInviteToken())).toMatchObject({
      ok: false,
      reason: "signed_out",
    });
    expect(admin.fake.state.rpcs).toEqual([]);
  });

  it("stops at the IP's or the account's limit before the look-up", async () => {
    for (const bucket of [INVITE_LOOKUP_PER_IP.bucket, INVITE_LOOKUP_PER_USER.bucket]) {
      admin.fake = fakeAdmin();
      admin.fake.state.rpcAnswers.consume_rate_limit = (args: { p_bucket: string }) =>
        args.p_bucket !== bucket;
      admin.fake.state.rpcAnswers.accept_cohost_invitation = [
        { outcome: "joined", event_id: EVENT, role: "cohost" },
      ];
      expect(await acceptCohostInvite(generateInviteToken()), bucket).toMatchObject({
        ok: false,
        reason: "rate_limited",
      });
      expect(admin.fake.rpc("accept_cohost_invitation")).toEqual([]);
    }
  });

  it("never logs the token, its hash or the database's message", async () => {
    const token = generateInviteToken();
    admin.fake.state.errors.accept_cohost_invitation = {
      message: `failed for ${token} ${hex(token)}`,
      code: "XX000",
    };
    expect(await acceptCohostInvite(token)).toMatchObject({ ok: false, reason: "failed" });
    const all = logged.join("\n");
    expect(all).toContain("XX000");
    expect(all).not.toContain(token);
    expect(all).not.toContain(hashInviteToken(token, KEY).toString("hex"));
  });
});

describe("the invite page's look-up", () => {
  it("shows a usable link's title and inviter, a member their event, and nothing otherwise", async () => {
    const token = generateInviteToken();
    admin.fake.state.rpcAnswers.cohost_invitation_preview = [
      {
        status: "valid",
        event_id: null,
        event_title: "Maya's Shower",
        inviter_name: "Ana Lopez",
        role: null,
      },
    ];
    expect(await previewInvitation(token, null)).toEqual({
      status: "valid",
      eventTitle: "Maya's Shower",
      inviterName: "Ana Lopez",
    });
    expect(admin.fake.rpc("cohost_invitation_preview")).toEqual([
      { p_token_hash: hex(token), p_user_id: null },
    ]);
    // Signed out: counted per IP only.
    expect(limits()).toEqual([INVITE_LOOKUP_PER_IP.bucket]);

    admin.fake.state.rpcAnswers.cohost_invitation_preview = [
      { status: "member", event_id: EVENT, event_title: null, inviter_name: null, role: "owner" },
    ];
    expect(await previewInvitation(token, OWNER)).toEqual({
      status: "member",
      eventId: EVENT,
      eventTitle: null,
      role: "owner",
    });

    admin.fake.state.rpcAnswers.cohost_invitation_preview = [
      { status: "invalid", event_id: null, event_title: null, inviter_name: null, role: null },
    ];
    expect(await previewInvitation(token, STRANGER)).toEqual({ status: "invalid" });
  });

  it("is rate-limited per IP and per account before any look-up", async () => {
    admin.fake.state.rpcAnswers.consume_rate_limit = false;
    expect(await previewInvitation(generateInviteToken(), STRANGER)).toEqual({
      status: "rate_limited",
    });
    expect(admin.fake.rpc("cohost_invitation_preview")).toEqual([]);
  });
});
