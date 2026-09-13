import { describe, expect, it } from "vitest";
import {
  PROVISIONAL_START_TIME,
  PROVISIONAL_TITLE_NO_NAME,
  PROVISIONAL_VENUE,
  provisionalContent,
} from "./provisional";

describe("provisionalContent", () => {
  const now = new Date("2026-09-01T00:00:00Z"); // a Tuesday

  it("uses real values when the event has them, marked non-provisional", () => {
    const result = provisionalContent(
      {
        title: "Welcome Baby Jordan!",
        eventDate: "2026-12-05",
        startTime: "15:00",
        endTime: "17:00",
        venue: "123 Main St",
        hosts: "Alex & Sam",
        timezone: null,
      },
      now,
    );
    expect(result.title).toEqual({ value: "Welcome Baby Jordan!", provisional: false });
    expect(result.eventDate).toEqual({ value: "2026-12-05", provisional: false });
    expect(result.startTime).toEqual({ value: "15:00", provisional: false });
    expect(result.endTime).toEqual({ value: "17:00", provisional: false });
    expect(result.venue).toEqual({ value: "123 Main St", provisional: false });
    expect(result.hosts).toEqual({ value: "Alex & Sam", provisional: false });
  });

  it("uses 'Baby shower for <name>' when the baby name is known but title is not", () => {
    const result = provisionalContent({ babyName: "Jordan" }, now);
    expect(result.title).toEqual({ value: "Baby shower for Jordan", provisional: true });
  });

  it("uses 'A baby shower' when neither title nor baby name is known", () => {
    const result = provisionalContent({}, now);
    expect(result.title.value).toBe(PROVISIONAL_TITLE_NO_NAME);
    expect(result.title.provisional).toBe(true);
  });

  it("uses the provisional venue, start time, and a twelve-weeks-out Saturday date", () => {
    const result = provisionalContent({}, now);
    expect(result.venue).toEqual({ value: PROVISIONAL_VENUE, provisional: true });
    expect(result.startTime).toEqual({ value: PROVISIONAL_START_TIME, provisional: true });
    expect(result.eventDate.provisional).toBe(true);
    // now (2026-09-01) + 84 days = 2026-11-24 (Tuesday); first Saturday on/after is 2026-11-28.
    expect(result.eventDate.value).toBe("2026-11-28");
    const day = new Date(`${result.eventDate.value}T00:00:00Z`).getUTCDay();
    expect(day).toBe(6); // Saturday
  });

  it("produces a Saturday date even when the 84-day mark already lands on a Saturday", () => {
    // now such that now + 84 days is itself a Saturday: 2026-09-01 is a Tuesday;
    // shift now back so the +84 target is a Saturday. 2026-11-28 is a Saturday, so
    // now = 2026-11-28 - 84 days = 2026-09-05 (a Saturday itself, unrelated).
    const alignedNow = new Date("2026-09-05T00:00:00Z");
    const result = provisionalContent({}, alignedNow);
    expect(result.eventDate.value).toBe("2026-11-28");
  });

  it("never produces a provisional end time or hosts value (they are omitted, not stand-ins)", () => {
    const result = provisionalContent({}, now);
    expect(result.endTime).toBeNull();
    expect(result.hosts).toBeNull();
  });

  it("keeps the real end time when supplied, with no provisional fallback ever offered", () => {
    const result = provisionalContent({ endTime: "16:00" }, now);
    expect(result.endTime).toEqual({ value: "16:00", provisional: false });
  });

  it("derives the RSVP deadline from the effective (possibly provisional) date/start", () => {
    const result = provisionalContent({}, now);
    expect(result.rsvpDeadline).not.toBeNull();
    expect(result.rsvpDeadline?.provisional).toBe(true);
  });

  it("marks the RSVP deadline non-provisional once both date and start time are real", () => {
    const result = provisionalContent(
      { eventDate: "2026-12-05", startTime: "15:00", timezone: null },
      now,
    );
    expect(result.rsvpDeadline?.provisional).toBe(false);
  });

  it("respects an explicitly supplied RSVP deadline as real, never recomputing it", () => {
    const explicit = new Date("2026-10-01T23:59:00Z");
    const result = provisionalContent({ rsvpDeadline: explicit }, now);
    expect(result.rsvpDeadline).toEqual({ value: explicit, provisional: false });
  });
});
