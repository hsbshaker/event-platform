import { describe, expect, it } from "vitest";
import {
  draftTokenMatches,
  generateDraftToken,
  hashDraftToken,
  isWellFormedDraftToken,
} from "./token";

const KEY = "test-key-that-is-long-enough-for-hmac-purposes";

describe("pre-auth draft tokens", () => {
  it("generates unique, well-formed opaque tokens", () => {
    const a = generateDraftToken();
    const b = generateDraftToken();
    expect(a).not.toBe(b);
    expect(isWellFormedDraftToken(a)).toBe(true);
    expect(isWellFormedDraftToken("short")).toBe(false);
    expect(isWellFormedDraftToken(42)).toBe(false);
  });

  it("hashes deterministically with the key and never stores the token", () => {
    const token = generateDraftToken();
    const h1 = hashDraftToken(token, KEY);
    const h2 = hashDraftToken(token, KEY);
    expect(h1.equals(h2)).toBe(true);
    expect(h1.length).toBe(32);
    expect(h1.toString("base64url")).not.toContain(token);
    expect(hashDraftToken(token, KEY + "x").equals(h1)).toBe(false);
  });

  it("matches only the original token", () => {
    const token = generateDraftToken();
    const stored = hashDraftToken(token, KEY);
    expect(draftTokenMatches(token, stored, KEY)).toBe(true);
    expect(draftTokenMatches(generateDraftToken(), stored, KEY)).toBe(false);
    expect(draftTokenMatches(token, stored.subarray(0, 16), KEY)).toBe(false);
  });
});
