import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { hashDraftToken } from "@/lib/drafts/token";

import {
  generateInviteToken,
  hashInviteToken,
  INVITE_TOKEN_BYTES,
  invitePath,
  isInvitePath,
  isWellFormedInviteToken,
} from "./token";

/**
 * Co-host invite tokens (`spec.md §6.2`, §27): 32 random bytes in the link, only a keyed hash in
 * the database, and the one destination sign-in may carry through authentication.
 */

const KEY = "k".repeat(48);

describe("invite tokens", () => {
  it("are 32 random bytes, base64url, never repeated", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateInviteToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(isWellFormedInviteToken(token)).toBe(true);
      expect(Buffer.from(token, "base64url")).toHaveLength(INVITE_TOKEN_BYTES);
    }
  });

  it("hash to a keyed, domain-separated HMAC-SHA256 that never contains the token", () => {
    const token = generateInviteToken();
    const hash = hashInviteToken(token, KEY);
    expect(hash).toHaveLength(32);
    expect(hash).toEqual(createHmac("sha256", KEY).update(`cohost-invite:${token}`).digest());
    // Deterministic for the same key; different under another key.
    expect(hashInviteToken(token, KEY)).toEqual(hash);
    expect(hashInviteToken(token, "x".repeat(48))).not.toEqual(hash);
    // Never the same as a draft token's hash of the same string.
    expect(hashDraftToken(token, KEY)).not.toEqual(hash);
    // The hash carries nothing of the token.
    expect(hash.toString("hex")).not.toContain(Buffer.from(token, "base64url").toString("hex"));
    expect(hash.toString("base64url")).not.toBe(token);
  });

  it("accepts only 43 base64url characters", () => {
    const token = generateInviteToken();
    expect(isWellFormedInviteToken(token)).toBe(true);
    for (const bad of [
      "",
      token.slice(1),
      `${token}a`,
      `${token.slice(0, 42)}=`,
      `${token.slice(0, 42)}/`,
      `${token.slice(0, 42)}+`,
      `${token.slice(0, 42)}.`,
      null,
      undefined,
      42,
    ]) {
      expect(isWellFormedInviteToken(bad), String(bad)).toBe(false);
    }
  });
});

describe("the sign-in destination", () => {
  it("is exactly an invite page's path", () => {
    const token = generateInviteToken();
    expect(invitePath(token)).toBe(`/invite/${token}`);
    expect(isInvitePath(invitePath(token))).toBe(true);
    for (const bad of [
      "/",
      "/events/abc",
      "/invite/",
      `/invite/${token}/`,
      `/invite/${token}?x=1`,
      `/invite/${token}#x`,
      `//evil.test/invite/${token}`,
      `/\\evil.test/invite/${token}`,
      `https://evil.test/invite/${token}`,
      `/invite/../events/${token}`,
      `/INVITE/${token}`,
      undefined,
      null,
    ]) {
      expect(isInvitePath(bad), String(bad)).toBe(false);
    }
  });
});
