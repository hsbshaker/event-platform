import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeAdmin } from "../../../tests/unit/support/fake-admin";
import type { FakeAdmin } from "../../../tests/unit/support/fake-admin";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { resetEnvCache } from "@/lib/env";
import { decryptEventCode, encryptEventCode } from "@/lib/events/access-code-crypto.server";
import { EVENT_CODE_ROTATION } from "@/lib/events/privacy.server";

/**
 * Privacy and the private event code, server side (`spec.md §14.1`, §14.2, §8.1, §25 "Manage
 * privacy/access code", §27; `spec.md §31` — Invitations, messaging and privacy: "Private code
 * stored encrypted once"): the owner or a co-host only (`manage_privacy`), anyone else the same
 * plain not-found; every visibility change through the server-only `set_event_privacy` with a
 * freshly encrypted code offered for going private; a new code through `rotate_event_code`,
 * rate-limited per event and counted only for members; the code decrypted server-side and returned
 * formatted; no plaintext code in any log line. The SQL behind the functions is tested against
 * Postgres in `tests/db/privacy.test.ts`.
 */

const EVENT = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";
const USER = "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2";

const admin = vi.hoisted(() => ({ fake: undefined as unknown as FakeAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.fake.client }));
const access = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/event-access", () => ({
  requireEventAccess: (...args: unknown[]) => access(...args),
}));
/** The member's own session: the event row `revealEventCode` reads through RLS. */
const sessionRow = vi.hoisted(() => ({
  value: null as null | { visibility: string | null; access_code_encrypted: string | null },
  error: null as null | { message: string },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: sessionRow.value, error: sessionRow.error }),
        }),
      }),
    }),
  }),
}));
const loadEventDraft = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/event-details", () => ({
  loadEventDraft: (...args: unknown[]) => loadEventDraft(...args),
}));

const { newEventCode, revealEventCode, setEventPrivacy } = await import("./privacy");

const member = () => ({
  user: { id: USER },
  role: "cohost",
  eventId: EVENT,
  context: { paymentSatisfied: false, published: false },
});

const hex = (bytes: Buffer) => `\\x${bytes.toString("hex")}`;
const unhex = (value: string) => Buffer.from(value.slice(2), "hex");
const formatted = (canonical: string) => `${canonical.slice(0, 4)}-${canonical.slice(4)}`;

/** Every argument of every console call, serialized, so a test can search what was logged. */
let logged: string[];

beforeEach(() => {
  admin.fake = fakeAdmin();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  resetEnvCache();
  access.mockReset();
  access.mockResolvedValue(member());
  loadEventDraft.mockReset();
  loadEventDraft.mockImplementation(async (id: string) => ({ id, rowVersion: 2 }));
  sessionRow.value = null;
  sessionRow.error = null;
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

/** Asserts no log line holds `canonical`, dashed or not, in any case. */
function expectNotLogged(canonical: string) {
  const all = logged.join("\n").toUpperCase();
  expect(all).not.toContain(canonical);
  expect(all).not.toContain(formatted(canonical));
}

/** set_event_privacy as the database answers it: stores the offered code when none is stored. */
function privacyFunction(stored: Buffer | null) {
  let current = stored;
  admin.fake.state.rpcAnswers.set_event_privacy = (args: {
    p_visibility: string;
    p_code_encrypted: string | null;
  }) => {
    if (args.p_visibility === "private" && current === null && args.p_code_encrypted) {
      current = unhex(args.p_code_encrypted);
    }
    return [{ outcome: "saved", code_encrypted: current ? hex(current) : null }];
  };
}

describe("setEventPrivacy", () => {
  it("going private with no code stores a new one, encrypted, and returns it formatted", async () => {
    privacyFunction(null);
    const result = await setEventPrivacy({ eventId: EVENT, visibility: "private" });
    expect(access).toHaveBeenCalledWith(EVENT, "manage_privacy");
    const [call] = admin.fake.rpc("set_event_privacy");
    expect(call).toMatchObject({ p_event_id: EVENT, p_user_id: USER, p_visibility: "private" });
    // The offered value is an encrypted envelope for this event, never the plaintext.
    const offered = unhex(call.p_code_encrypted as string);
    expect(offered[0]).toBe(0x01);
    const canonical = decryptEventCode(offered, EVENT);
    expect(result).toEqual({
      ok: true,
      event: { id: EVENT, rowVersion: 2 },
      code: formatted(canonical),
    });
    expect(String(call.p_code_encrypted)).not.toContain(canonical);
    expect(loadEventDraft).toHaveBeenCalledWith(EVENT);
    expectNotLogged(canonical);
  });

  it("keeps a stored code: going private again returns the code guests may already have", async () => {
    privacyFunction(encryptEventCode("W9XH3NVC", EVENT));
    const result = await setEventPrivacy({ eventId: EVENT, visibility: "private" });
    expect(result).toMatchObject({ ok: true, code: "W9XH-3NVC" });
  });

  it("says when the change saved but the stored code cannot be read, so a new one can be made", async () => {
    // Encrypted for another event (as a damaged value or a changed key would also fail).
    privacyFunction(encryptEventCode("W9XH3NVC", "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2"));
    const result = await setEventPrivacy({ eventId: EVENT, visibility: "private" });
    expect(result).toEqual({
      ok: true,
      event: { id: EVENT, rowVersion: 2 },
      code: null,
      codeUnreadable: true,
    });
    expectNotLogged("W9XH3NVC");
  });

  it("going public offers no code and returns none; the stored one is kept by the function", async () => {
    privacyFunction(encryptEventCode("W9XH3NVC", EVENT));
    const result = await setEventPrivacy({ eventId: EVENT, visibility: "public" });
    expect(admin.fake.rpc("set_event_privacy")[0]).toMatchObject({
      p_visibility: "public",
      p_code_encrypted: null,
    });
    expect(result).toMatchObject({ ok: true, code: null });
  });

  it("works after publish too (spec.md §8.1)", async () => {
    access.mockResolvedValue({ ...member(), context: { paymentSatisfied: true, published: true } });
    privacyFunction(null);
    expect(await setEventPrivacy({ eventId: EVENT, visibility: "private" })).toMatchObject({
      ok: true,
    });
  });

  it("answers anyone but the owner or a co-host with the plain not-found, writing nothing", async () => {
    for (const error of [new ForbiddenError(), new UnauthorizedError()]) {
      access.mockRejectedValueOnce(error);
      expect(await setEventPrivacy({ eventId: EVENT, visibility: "private" })).toEqual({
        ok: false,
        reason: "not_found",
        error: "This event isn't available.",
      });
    }
    expect(admin.fake.rpcNames()).toEqual([]);
  });

  it("refuses malformed input as not found, before any check", async () => {
    for (const input of [
      { eventId: "not-a-uuid", visibility: "private" },
      { eventId: EVENT, visibility: "secret" },
      { eventId: EVENT, visibility: "private", code: "AAAA-BBBB" },
    ]) {
      expect(await setEventPrivacy(input as never)).toMatchObject({
        ok: false,
        reason: "not_found",
      });
    }
    expect(access).not.toHaveBeenCalled();
    expect(admin.fake.rpcNames()).toEqual([]);
  });

  it("passes the function's not_found on", async () => {
    admin.fake.state.rpcAnswers.set_event_privacy = [
      { outcome: "not_found", code_encrypted: null },
    ];
    expect(await setEventPrivacy({ eventId: EVENT, visibility: "private" })).toMatchObject({
      ok: false,
      reason: "not_found",
    });
    expect(loadEventDraft).not.toHaveBeenCalled();
  });

  it("fails visibly when the write fails, logging neither the code nor the error's details", async () => {
    admin.fake.state.errors.set_event_privacy = {
      message: "new row violates check constraint",
      code: "23514",
    };
    expect(await setEventPrivacy({ eventId: EVENT, visibility: "private" })).toEqual({
      ok: false,
      reason: "failed",
      error: "Couldn't save that. Try again.",
    });
    const offered = unhex(admin.fake.rpc("set_event_privacy")[0].p_code_encrypted as string);
    expectNotLogged(decryptEventCode(offered, EVENT));
    expect(logged.join("\n")).not.toContain("check constraint");
    expect(logged.join("\n")).not.toContain(offered.toString("hex"));
  });
});

describe("newEventCode", () => {
  beforeEach(() => {
    admin.fake.state.rpcAnswers.consume_rate_limit = true;
    admin.fake.state.rpcAnswers.rotate_event_code = (args: { p_code_encrypted: string }) => [
      { outcome: "rotated", code_encrypted: args.p_code_encrypted },
    ];
  });

  it("stores a new encrypted code and returns it formatted", async () => {
    const result = await newEventCode({ eventId: EVENT });
    expect(access).toHaveBeenCalledWith(EVENT, "manage_privacy");
    const [call] = admin.fake.rpc("rotate_event_code");
    expect(call).toMatchObject({ p_event_id: EVENT, p_user_id: USER });
    const canonical = decryptEventCode(unhex(call.p_code_encrypted as string), EVENT);
    expect(result).toEqual({ ok: true, code: formatted(canonical) });
    expectNotLogged(canonical);
  });

  it("makes a different code each time", async () => {
    const a = await newEventCode({ eventId: EVENT });
    const b = await newEventCode({ eventId: EVENT });
    expect(a.ok && b.ok && a.code !== b.code).toBe(true);
  });

  it("is rate-limited per event, counted before anything is written", async () => {
    admin.fake.state.rpcAnswers.consume_rate_limit = false;
    expect(await newEventCode({ eventId: EVENT })).toMatchObject({
      ok: false,
      reason: "rate_limited",
    });
    const [limit] = admin.fake.rpc("consume_rate_limit");
    expect(limit).toMatchObject({
      p_bucket: EVENT_CODE_ROTATION.bucket,
      p_window_seconds: EVENT_CODE_ROTATION.windowSeconds,
      p_max: EVENT_CODE_ROTATION.max,
    });
    expect(admin.fake.rpc("rotate_event_code")).toEqual([]);
  });

  it("spends no event's allowance for someone who may not manage it", async () => {
    access.mockRejectedValue(new ForbiddenError());
    expect(await newEventCode({ eventId: EVENT })).toMatchObject({
      ok: false,
      reason: "not_found",
    });
    expect(admin.fake.rpcNames()).toEqual([]);
  });

  it("explains a public event has no code to replace", async () => {
    admin.fake.state.rpcAnswers.rotate_event_code = [
      { outcome: "not_private", code_encrypted: null },
    ];
    expect(await newEventCode({ eventId: EVENT })).toMatchObject({
      ok: false,
      reason: "not_private",
    });
  });

  it("refuses malformed input as not found", async () => {
    expect(await newEventCode({ eventId: "x" })).toMatchObject({ reason: "not_found" });
    expect(access).not.toHaveBeenCalled();
  });
});

describe("revealEventCode", () => {
  it("decrypts the stored code for the owner or a co-host, read through their own session", async () => {
    sessionRow.value = {
      visibility: "private",
      access_code_encrypted: hex(encryptEventCode("B2DF6GJS", EVENT)),
    };
    expect(await revealEventCode(EVENT)).toEqual({ ok: true, code: "B2DF-6GJS" });
    expect(access).toHaveBeenCalledWith(EVENT, "manage_privacy");
    // No service role is needed to read it.
    expect(admin.fake.state.log).toEqual([]);
    expectNotLogged("B2DF6GJS");
  });

  it("shows no code for a public event, even with one kept", async () => {
    sessionRow.value = {
      visibility: "public",
      access_code_encrypted: hex(encryptEventCode("B2DF6GJS", EVENT)),
    };
    expect(await revealEventCode(EVENT)).toEqual({ ok: true, code: null });
  });

  it("answers anyone else, and an unknown or malformed id, with the plain not-found", async () => {
    access.mockRejectedValueOnce(new ForbiddenError());
    const notFound = { ok: false, reason: "not_found", error: "This event isn't available." };
    expect(await revealEventCode(EVENT)).toEqual(notFound);
    sessionRow.value = null;
    expect(await revealEventCode(EVENT)).toEqual(notFound);
    expect(await revealEventCode("not-a-uuid")).toEqual(notFound);
  });

  it("fails visibly on a value that does not decrypt (tampered, or another event's)", async () => {
    sessionRow.value = {
      visibility: "private",
      access_code_encrypted: hex(
        encryptEventCode("B2DF6GJS", "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2"),
      ),
    };
    expect(await revealEventCode(EVENT)).toMatchObject({ ok: false, reason: "failed" });
    expectNotLogged("B2DF6GJS");
  });
});
