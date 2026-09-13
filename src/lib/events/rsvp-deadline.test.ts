import { describe, expect, it } from "vitest";
import { computeRsvpDeadline, nextRsvpDeadline } from "./rsvp-deadline";

describe("computeRsvpDeadline", () => {
  it("returns null when the event date is unknown", () => {
    expect(
      computeRsvpDeadline({
        eventDate: null,
        startTime: null,
        timezone: null,
        now: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toBeNull();
  });

  it("uses event date minus 14 days at 23:59 when that instant is still in the future", () => {
    // Event Dec 1 2026; now is well before the 14-day-prior deadline candidate (Nov 17).
    const now = new Date("2026-09-01T00:00:00Z");
    const result = computeRsvpDeadline({
      eventDate: "2026-12-01",
      startTime: "14:00",
      timezone: null, // treated as UTC
      now,
    });
    expect(result?.toISOString()).toBe("2026-11-17T23:59:00.000Z");
  });

  it("falls back to the day before the event at 23:59 when the 14-day candidate is already past", () => {
    // Event is 9 days out (2026-09-10); the 14-day-prior candidate (2026-08-27) is
    // already past relative to `now`, and the event is neither today nor tomorrow.
    const now = new Date("2026-09-01T00:00:00Z");
    const result = computeRsvpDeadline({
      eventDate: "2026-09-10",
      startTime: "14:00",
      timezone: null,
      now,
    });
    expect(result?.toISOString()).toBe("2026-09-09T23:59:00.000Z");
  });

  it("uses the event start time when the event is today", () => {
    const now = new Date("2026-09-01T10:00:00Z");
    const result = computeRsvpDeadline({
      eventDate: "2026-09-01",
      startTime: "18:30",
      timezone: null,
      now,
    });
    expect(result?.toISOString()).toBe("2026-09-01T18:30:00.000Z");
  });

  it("uses the event start time when the event is tomorrow", () => {
    const now = new Date("2026-09-01T10:00:00Z");
    const result = computeRsvpDeadline({
      eventDate: "2026-09-02",
      startTime: "18:30",
      timezone: null,
      now,
    });
    expect(result?.toISOString()).toBe("2026-09-02T18:30:00.000Z");
  });

  it("uses the provisional 13:00 start when today/tomorrow and start time is unknown", () => {
    const now = new Date("2026-09-01T10:00:00Z");
    const result = computeRsvpDeadline({
      eventDate: "2026-09-02",
      startTime: null,
      timezone: null,
      now,
    });
    expect(result?.toISOString()).toBe("2026-09-02T13:00:00.000Z");
  });

  it("computes correctly in a DST-transition zone (America/New_York, March boundary)", () => {
    // 2027-03-14 is the US spring-forward Sunday; event 14 days later is 2027-03-28,
    // so the 14-day-prior candidate falls exactly on the transition date itself.
    // Pick a case where the candidate straddles the transition to prove correctness:
    // event date 2027-03-28 -> candidate 2027-03-14 23:59 America/New_York (EDT, UTC-4
    // by then since the transition is at 2am local on 2027-03-14).
    const now = new Date("2026-01-01T00:00:00Z");
    const result = computeRsvpDeadline({
      eventDate: "2027-03-28",
      startTime: "14:00",
      timezone: "America/New_York",
      now,
    });
    // 23:59 EDT (UTC-4) on 2027-03-14 = 2027-03-15T03:59:00.000Z
    expect(result?.toISOString()).toBe("2027-03-15T03:59:00.000Z");
  });

  it("computes correctly across the November DST fall-back boundary", () => {
    // Event 2026-11-14 -> 14 days prior is 2026-10-31, safely EDT (UTC-4) before the
    // Nov 1 2026 fall-back. Confirm offset is EDT, not EST.
    const now = new Date("2026-01-01T00:00:00Z");
    const result = computeRsvpDeadline({
      eventDate: "2026-11-14",
      startTime: "14:00",
      timezone: "America/New_York",
      now,
    });
    // 23:59 EDT (UTC-4) on 2026-10-31 = 2026-11-01T03:59:00.000Z
    expect(result?.toISOString()).toBe("2026-11-01T03:59:00.000Z");
  });

  it("computes correctly in a positive-offset zone with no DST (Asia/Tokyo)", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const result = computeRsvpDeadline({
      eventDate: "2026-12-15",
      startTime: "14:00",
      timezone: "Asia/Tokyo",
      now,
    });
    // 23:59 JST (UTC+9) on 2026-12-01 = 2026-12-01T14:59:00.000Z
    expect(result?.toISOString()).toBe("2026-12-01T14:59:00.000Z");
  });

  it("computes correctly in a half-hour-offset zone (Asia/Kolkata)", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const result = computeRsvpDeadline({
      eventDate: "2026-12-15",
      startTime: "14:00",
      timezone: "Asia/Kolkata",
      now,
    });
    // 23:59 IST (UTC+5:30) on 2026-12-01 = 2026-12-01T18:29:00.000Z
    expect(result?.toISOString()).toBe("2026-12-01T18:29:00.000Z");
  });
});

describe("nextRsvpDeadline", () => {
  it("never overwrites an edited deadline", () => {
    const current = new Date("2026-01-01T00:00:00Z");
    const result = nextRsvpDeadline({
      current,
      edited: true,
      eventDate: "2026-12-01",
      startTime: "14:00",
      timezone: null,
      now: new Date("2026-09-01T00:00:00Z"),
    });
    expect(result).toBe(current);
  });

  it("recomputes when the event date changes while the deadline is unedited", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    const result = nextRsvpDeadline({
      current: new Date("2026-11-01T23:59:00Z"),
      edited: false,
      eventDate: "2026-12-15", // date changed since `current` was computed
      startTime: "14:00",
      timezone: null,
      now,
    });
    expect(result?.toISOString()).toBe("2026-12-01T23:59:00.000Z");
  });

  it("returns null when unedited and the event date is unknown", () => {
    const result = nextRsvpDeadline({
      current: null,
      edited: false,
      eventDate: null,
      startTime: null,
      timezone: null,
      now: new Date("2026-09-01T00:00:00Z"),
    });
    expect(result).toBeNull();
  });
});
