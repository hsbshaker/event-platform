import { createHash, createHmac, hkdfSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  hashPartyLinkToken,
  isWellFormedPartyLinkToken,
  partyLinkKey,
  partyLinkToken,
  personalLinkPath,
} from "./personal-link";

/**
 * Personal invitation links (`spec.md §12.5`; §32 #37; `spec.md §31` — RSVP: "Every party has a
 * personal invitation link ... and can be rotated by the host"): the token is derived from the
 * link row's id under an HKDF subkey of `APP_ENCRYPTION_KEY`, never stored; the row keeps its
 * SHA-256.
 */

const APP_KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_APP_KEY = Buffer.alloc(32, 8).toString("base64");
const LINK = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";
const OTHER_LINK = "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2";

describe("partyLinkToken", () => {
  const key = partyLinkKey(APP_KEY);

  it("is deterministic per link id, whatever the id's case", () => {
    expect(partyLinkToken(LINK, key)).toBe(partyLinkToken(LINK, key));
    expect(partyLinkToken(LINK.toUpperCase(), key)).toBe(partyLinkToken(LINK, key));
  });

  it("differs across link ids and across keys", () => {
    expect(partyLinkToken(LINK, key)).not.toBe(partyLinkToken(OTHER_LINK, key));
    expect(partyLinkToken(LINK, partyLinkKey(OTHER_APP_KEY))).not.toBe(partyLinkToken(LINK, key));
  });

  it("is 43 URL-safe characters", () => {
    for (let i = 0; i < 200; i += 1) {
      const id = `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`;
      const token = partyLinkToken(id, key);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(isWellFormedPartyLinkToken(token)).toBe(true);
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  it("is HMAC-SHA256 under an HKDF subkey with its own label, not the application key itself", () => {
    const subkey = Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(APP_KEY, "base64"),
        "event-platform",
        "party-invite-link:hmac-sha256:v1",
        32,
      ),
    );
    expect(key.equals(subkey)).toBe(true);
    expect(key.equals(Buffer.from(APP_KEY, "base64"))).toBe(false);
    expect(partyLinkToken(LINK, key)).toBe(
      createHmac("sha256", subkey).update(`party-link:v1:${LINK}`).digest("base64url"),
    );
  });
});

describe("hashPartyLinkToken", () => {
  it("is the hex SHA-256 of the token", () => {
    const token = partyLinkToken(LINK, partyLinkKey(APP_KEY));
    const hash = hashPartyLinkToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash).not.toBe(hashPartyLinkToken(partyLinkToken(OTHER_LINK, partyLinkKey(APP_KEY))));
  });
});

describe("personalLinkPath and isWellFormedPartyLinkToken", () => {
  it("builds the link's path", () => {
    expect(personalLinkPath("abc")).toBe("/g/abc");
  });

  it("refuses anything that is not a token", () => {
    for (const value of [null, 42, "", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}=`]) {
      expect(isWellFormedPartyLinkToken(value)).toBe(false);
    }
  });
});
