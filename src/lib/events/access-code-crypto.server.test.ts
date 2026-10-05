import { createDecipheriv } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetEnvCache } from "@/lib/env";

import {
  ACCESS_CODE_FORMAT_V1,
  AccessCodeCryptoError,
  decryptEventCode,
  encryptEventCode,
  eventCodesMatch,
  generateEventCode,
} from "./access-code-crypto.server";
import { EVENT_CODE_ALPHABET, normaliseEventCode } from "./event-code";

/**
 * The private event code at rest (`spec.md §14.2`, §27: one encrypted-at-rest representation,
 * server-side reveal and validation, constant-time comparison): AES-256-GCM under an HKDF subkey
 * of `APP_ENCRYPTION_KEY`, a random 96-bit IV per encryption, the layout
 * `0x01 | iv | tag | ciphertext`, the event id bound as additional data, and the tag verified on
 * every decryption.
 */

const EVENT = "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11";
const OTHER_EVENT = "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2";
const KEY = Buffer.alloc(32, 7).toString("base64");

function useKey(key: string) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.APP_ENCRYPTION_KEY = key;
  resetEnvCache();
}

beforeEach(() => useKey(KEY));
afterEach(() => resetEnvCache());

describe("generateEventCode", () => {
  it("makes eight characters of the unambiguous alphabet, different every time", () => {
    const codes = Array.from({ length: 2000 }, generateEventCode);
    for (const code of codes) {
      expect(code).toHaveLength(8);
      expect(normaliseEventCode(code)).toBe(code);
    }
    // 2000 draws from ~8.5e11 codes: a repeat would mean the generator is broken.
    expect(new Set(codes).size).toBe(codes.length);
    // Every character of the alphabet turns up; nothing outside it does.
    const seen = new Set(codes.join(""));
    expect([...seen].sort().join("")).toBe([...EVENT_CODE_ALPHABET].sort().join(""));
  });
});

describe("encryptEventCode / decryptEventCode", () => {
  it("binds the event by its canonical id, whatever the caller's spelling", () => {
    const code = "K7MP4QRT";
    expect(decryptEventCode(encryptEventCode(code, EVENT.toUpperCase()), EVENT)).toBe(code);
    expect(decryptEventCode(encryptEventCode(code, EVENT), EVENT.toUpperCase())).toBe(code);
  });

  it("round-trips a code", () => {
    const code = generateEventCode();
    expect(decryptEventCode(encryptEventCode(code, EVENT), EVENT)).toBe(code);
  });

  it("stores 0x01 | iv (12) | tag (16) | ciphertext, with a fresh IV every time", () => {
    const a = encryptEventCode("K7MP4QRT", EVENT);
    const b = encryptEventCode("K7MP4QRT", EVENT);
    expect(a[0]).toBe(ACCESS_CODE_FORMAT_V1);
    expect(a).toHaveLength(1 + 12 + 16 + 8);
    expect(a.subarray(1, 13).equals(b.subarray(1, 13))).toBe(false);
    expect(a.equals(b)).toBe(false);
    // The plaintext is nowhere in the stored bytes.
    expect(a.includes(Buffer.from("K7MP4QRT"))).toBe(false);
  });

  it("detects tampering anywhere in the value", () => {
    const stored = encryptEventCode("K7MP4QRT", EVENT);
    for (let i = 1; i < stored.length; i += 1) {
      const tampered = Buffer.from(stored);
      tampered[i] ^= 0x01;
      expect(() => decryptEventCode(tampered, EVENT), `byte ${i}`).toThrow(AccessCodeCryptoError);
    }
  });

  it("refuses an unknown version, a truncated value and an empty one", () => {
    const stored = encryptEventCode("K7MP4QRT", EVENT);
    const v2 = Buffer.from(stored);
    v2[0] = 0x02;
    expect(() => decryptEventCode(v2, EVENT)).toThrow(/version/);
    expect(() => decryptEventCode(stored.subarray(0, 29), EVENT)).toThrow(AccessCodeCryptoError);
    expect(() => decryptEventCode(Buffer.alloc(0), EVENT)).toThrow(AccessCodeCryptoError);
  });

  it("binds the value to its event: another event's code does not open this one", () => {
    const stored = encryptEventCode("K7MP4QRT", OTHER_EVENT);
    expect(() => decryptEventCode(stored, EVENT)).toThrow(AccessCodeCryptoError);
  });

  it("needs the same application key", () => {
    const stored = encryptEventCode("K7MP4QRT", EVENT);
    useKey(Buffer.alloc(32, 8).toString("base64"));
    expect(() => decryptEventCode(stored, EVENT)).toThrow(AccessCodeCryptoError);
  });

  it("uses a derived subkey, never APP_ENCRYPTION_KEY itself", () => {
    const stored = encryptEventCode("K7MP4QRT", EVENT);
    const raw = Buffer.from(KEY, "base64");
    const decipher = createDecipheriv("aes-256-gcm", raw, stored.subarray(1, 13));
    decipher.setAAD(Buffer.concat([Buffer.from([1]), Buffer.from(`event:${EVENT}`)]));
    decipher.setAuthTag(stored.subarray(13, 29));
    decipher.update(stored.subarray(29));
    expect(() => decipher.final()).toThrow();
  });

  it("stores only canonical codes", () => {
    expect(() => encryptEventCode("k7mp-4qrt", EVENT)).toThrow(AccessCodeCryptoError);
  });

  it("never puts a code in an error message", () => {
    const stored = encryptEventCode("K7MP4QRT", EVENT);
    const tampered = Buffer.from(stored);
    tampered[20] ^= 0xff;
    for (const attempt of [
      () => decryptEventCode(tampered, EVENT),
      () => decryptEventCode(stored, OTHER_EVENT),
      () => encryptEventCode("k7mp-4qrt", EVENT),
    ]) {
      try {
        attempt();
        expect.unreachable();
      } catch (error) {
        expect(String((error as Error).message)).not.toMatch(/K7MP|4QRT|k7mp/i);
        expect((error as Error).cause).toBeUndefined();
      }
    }
  });
});

describe("eventCodesMatch", () => {
  it("accepts the code however it is typed", () => {
    for (const typed of ["K7MP-4QRT", "k7mp4qrt", " k7mp 4qrt "]) {
      expect(eventCodesMatch(typed, "K7MP4QRT"), typed).toBe(true);
    }
  });

  it("refuses any other code, a near miss and something that is not a code", () => {
    for (const typed of ["K7MP-4QRS", "K7MP-4QR", "", "K7MP-4QRT-K7MP", "not a code"]) {
      expect(eventCodesMatch(typed, "K7MP4QRT"), typed).toBe(false);
    }
  });
});
