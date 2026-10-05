import { describe, expect, it } from "vitest";

import {
  EVENT_CODE_ALPHABET,
  EVENT_CODE_LENGTH,
  formatEventCode,
  normaliseEventCode,
} from "./event-code";

/**
 * The private event code's form (`spec.md §14.2`: "a reasonably strong random human-shareable
 * code, not a trivial 4-digit PIN").
 */

describe("the event code alphabet", () => {
  it("has nothing a guest could misread: no 0/O, 1/I/L", () => {
    for (const ambiguous of ["0", "O", "1", "I", "L"]) {
      expect(EVENT_CODE_ALPHABET).not.toContain(ambiguous);
    }
    expect(new Set(EVENT_CODE_ALPHABET).size).toBe(EVENT_CODE_ALPHABET.length);
    expect(EVENT_CODE_ALPHABET).toMatch(/^[2-9A-Z]+$/);
  });

  it("makes codes far stronger than a PIN (about 40 bits)", () => {
    expect(EVENT_CODE_LENGTH).toBe(8);
    const bits = EVENT_CODE_LENGTH * Math.log2(EVENT_CODE_ALPHABET.length);
    expect(bits).toBeGreaterThan(39);
  });
});

describe("normaliseEventCode", () => {
  it("ignores case, spaces and dashes", () => {
    for (const typed of [
      "K7MP-4QRT",
      "k7mp-4qrt",
      "k7mp4qrt",
      " K7MP 4QRT ",
      "K7MP–4QRT",
      "K7MP—4QRT",
      "k 7 m p - 4 q r t",
    ]) {
      expect(normaliseEventCode(typed), typed).toBe("K7MP4QRT");
    }
  });

  it("refuses anything that cannot be a code", () => {
    for (const typed of ["", "K7MP-4QR", "K7MP-4QRTX", "K7MP-4QR0", "OOOO-IIII", "K7MP_4QRT"]) {
      expect(normaliseEventCode(typed), typed).toBeNull();
    }
  });
});

describe("formatEventCode", () => {
  it("shows a canonical code as XXXX-XXXX", () => {
    expect(formatEventCode("K7MP4QRT")).toBe("K7MP-4QRT");
  });

  it("refuses a value that is not canonical", () => {
    expect(() => formatEventCode("k7mp4qrt")).toThrow();
    expect(() => formatEventCode("K7MP-4QRT")).toThrow();
  });
});
