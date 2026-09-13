import { describe, expect, it } from "vitest";

import {
  CAPABILITY_TTL_MS,
  issueCapability,
  renewCapability,
  resolveCapability,
} from "./capability";

/**
 * The authorization boundary in front of the service role.
 *
 * Two things have to hold. A capability this deployment minted must resolve to the submission
 * key inside it — that is what makes the row identifier server-issued rather than caller-chosen,
 * so one reviewer cannot name, and therefore overwrite, another's answers. And anything else at
 * all must be refused, because whatever gets past here reaches `createAdminClient`.
 */

const KEY = "a".repeat(44);
const OTHER_KEY = "b".repeat(44);

describe("a capability this deployment issued", () => {
  it("resolves to the submission key it carries", () => {
    const { capability, expiresAt } = issueCapability(KEY);
    const resolved = resolveCapability(capability, KEY);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.submissionKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(resolved.expiresAt).toBe(expiresAt);
  });

  it("names a different row every time, so two reviewers never share one", () => {
    const keys = new Set(
      Array.from({ length: 200 }, () => {
        const r = resolveCapability(issueCapability(KEY).capability, KEY);
        return r.ok ? r.submissionKey : "";
      }),
    );
    expect(keys.size).toBe(200);
    expect(keys.has("")).toBe(false);
  });

  it("resolves the same key again, which is what makes a retry idempotent", () => {
    const { capability } = issueCapability(KEY);
    const a = resolveCapability(capability, KEY);
    const b = resolveCapability(capability, KEY);
    expect(a.ok && b.ok && a.submissionKey === b.submissionKey).toBe(true);
  });

  it("stays valid across a long sitting, and stops after the window", () => {
    const now = 1_000_000;
    const { capability } = issueCapability(KEY, now);
    expect(resolveCapability(capability, KEY, now + CAPABILITY_TTL_MS - 1).ok).toBe(true);
    expect(resolveCapability(capability, KEY, now + CAPABILITY_TTL_MS).ok).toBe(false);
  });
});

describe("anything else is refused, and reaches no database", () => {
  const { capability } = issueCapability(KEY);
  const [version, nonce, expiry, signature] = capability.split(".");

  const cases: [string, unknown, string][] = [
    ["a missing capability", undefined, "malformed"],
    ["a null capability", null, "malformed"],
    ["an empty string", "", "malformed"],
    ["a number", 12345, "malformed"],
    ["free text", "let-me-in", "malformed"],
    ["too few parts", `${version}.${nonce}.${expiry}`, "malformed"],
    ["too many parts", `${capability}.extra`, "malformed"],
    ["an absurdly long string", "x".repeat(5000), "malformed"],
    ["a nonce of the wrong shape", `${version}.short.${expiry}.${signature}`, "malformed"],
    ["a non-numeric expiry", `${version}.${nonce}.soon.${signature}`, "malformed"],
    ["an unknown version", `v2.${nonce}.${expiry}.${signature}`, "unknown-version"],
    ["a tampered nonce", `${version}.${"A".repeat(43)}.${expiry}.${signature}`, "bad-signature"],
    [
      "an extended expiry",
      `${version}.${nonce}.${Number(expiry) + 60_000}.${signature}`,
      "bad-signature",
    ],
    ["a stripped signature", `${version}.${nonce}.${expiry}.`, "bad-signature"],
    ["a forged signature", `${version}.${nonce}.${expiry}.${"z".repeat(43)}`, "bad-signature"],
  ];

  it.each(cases)("refuses %s", (_label, presented, reason) => {
    const result = resolveCapability(presented, KEY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(reason);
  });

  it("refuses one minted with a different key, so another deployment's cannot be spent here", () => {
    const foreign = issueCapability(OTHER_KEY).capability;
    const result = resolveCapability(foreign, KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad-signature");
  });

  it("refuses an expired one even though its signature is perfectly good", () => {
    const now = 1_000_000;
    const { capability: stale } = issueCapability(KEY, now);
    const result = resolveCapability(stale, KEY, now + CAPABILITY_TTL_MS + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("never leaks the submission key on a refusal", () => {
    const result = resolveCapability(`${version}.${nonce}.${expiry}.${"z".repeat(43)}`, KEY);
    expect(Object.keys(result).sort()).toEqual(["ok", "reason"]);
  });
});

/**
 * Renewal keeps the row, not just the authorization.
 *
 * The nonce names the row a session owns. If renewing minted a new one, a reviewer who submitted
 * and came back after the window to fix a rating would write a *second* response instead of
 * correcting their own — and `score-stored.mjs` would then refuse to resolve five reviewers
 * without someone choosing between two rows by hand.
 */
describe("renewing a capability", () => {
  it("keeps the nonce, so a correction lands on the row the session already owns", () => {
    const now = 1_000_000;
    const original = issueCapability(KEY, now);
    const before = resolveCapability(original.capability, KEY, now);
    const renewed = renewCapability(original.capability, KEY, now + CAPABILITY_TTL_MS + 1);
    expect(renewed).not.toBeNull();
    const after = resolveCapability(renewed!.capability, KEY, now + CAPABILITY_TTL_MS + 1);
    expect(before.ok && after.ok && before.submissionKey === after.submissionKey).toBe(true);
  });

  it("renews one that has already expired — the whole point", () => {
    const now = 1_000_000;
    const stale = issueCapability(KEY, now).capability;
    const late = now + CAPABILITY_TTL_MS * 3;
    expect(resolveCapability(stale, KEY, late).ok).toBe(false);
    const renewed = renewCapability(stale, KEY, late);
    expect(renewed).not.toBeNull();
    expect(resolveCapability(renewed!.capability, KEY, late).ok).toBe(true);
  });

  it("extends the window from now, not from the original expiry", () => {
    const now = 1_000_000;
    const late = now + CAPABILITY_TTL_MS * 3;
    expect(renewCapability(issueCapability(KEY, now).capability, KEY, late)!.expiresAt).toBe(
      late + CAPABILITY_TTL_MS,
    );
  });

  it("refuses anything it did not sign, so renewal is not a way in", () => {
    const { capability } = issueCapability(KEY);
    const [version, nonce, expiry, signature] = capability.split(".");
    for (const bad of [
      undefined,
      null,
      "",
      "let-me-in",
      `${version}.${nonce}.${expiry}.${"z".repeat(43)}`,
      `${version}.${"A".repeat(43)}.${expiry}.${signature}`,
      `v2.${nonce}.${expiry}.${signature}`,
      issueCapability(OTHER_KEY).capability,
      "x".repeat(5000),
    ]) {
      expect(renewCapability(bad, KEY)).toBeNull();
    }
  });

  it("grants nothing new: the presenter already held that nonce", () => {
    // Renewal re-signs a nonce the caller demonstrably has. It cannot produce a nonce they did
    // not present, which is what would make it an escalation.
    const mine = issueCapability(KEY);
    const theirs = issueCapability(KEY);
    const renewed = renewCapability(mine.capability, KEY)!;
    const a = resolveCapability(renewed.capability, KEY);
    const b = resolveCapability(theirs.capability, KEY);
    expect(a.ok && b.ok && a.submissionKey !== b.submissionKey).toBe(true);
  });
});
