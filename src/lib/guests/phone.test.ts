import { describe, expect, it } from "vitest";

import { formatPhone, isE164Nanp, normalizePhone } from "./phone";

/**
 * Guest phones (`spec.md §12.2`, §13.3): US and Canadian mobile numbers only, stored in E.164.
 * `spec.md §31` — RSVP: "Manual add requires phone or explicit no-phone acknowledgement."
 */

describe("normalizePhone", () => {
  it.each([
    ["5125550123", "+15125550123"],
    ["512-555-0123", "+15125550123"],
    ["512.555.0123", "+15125550123"],
    ["(512) 555-0123", "+15125550123"],
    ["  (512)555 0123  ", "+15125550123"],
    ["1 512 555 0123", "+15125550123"],
    ["1-512-555-0123", "+15125550123"],
    ["+1 (512) 555-0123", "+15125550123"],
    ["+15125550123", "+15125550123"],
    // Canada shares the plan.
    ["416 555 0199", "+14165550199"],
  ])("accepts %j as %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "555-0123", // seven digits
    "512555012", // nine
    "512 555 01234", // eleven, not starting with 1
    "2 512 555 0123", // eleven with another leading digit
    "+44 20 7946 0958", // another country
    "+5125550123", // a plus without the country code
    "0125550123", // area code starting 0
    "1125550123", // area code starting 1
    "5120550123", // exchange starting 0
    "5121550123", // exchange starting 1
    "512-555-0123 x12", // an extension
    "512-555-CALL",
    "512_555_0123",
    "++15125550123",
    "1+5125550123",
  ])("refuses %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it("agrees with the stored form", () => {
    expect(isE164Nanp(normalizePhone("(512) 555-0123")!)).toBe(true);
    expect(isE164Nanp("+44207946095")).toBe(false);
  });
});

describe("formatPhone", () => {
  it("formats a stored number for reading", () => {
    expect(formatPhone("+15125550123")).toBe("(512) 555-0123");
    expect(formatPhone("not a number")).toBe("not a number");
  });
});
