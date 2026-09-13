import { describe, expect, it } from "vitest";
import { computeEventPatch, type PatchableRow } from "./detail-patch";

/**
 * The two rules in the details patch that carry real behaviour (spec.md §7.3, §7.4).
 *
 * A wrong timezone is authoritative for the RSVP deadline and for PASSED, and a deadline that
 * keeps recomputing after the host set one is a silent override of their choice. Both are
 * cheap to get wrong and invisible when they are.
 */

const ROW: PatchableRow = {
  event_date: null,
  start_time: null,
  timezone: null,
  venue_name: null,
  address: null,
  rsvp_deadline: null,
  rsvp_deadline_edited: false,
};

const DATED: PatchableRow = {
  ...ROW,
  event_date: "2027-03-06",
  start_time: "13:00",
  timezone: "America/New_York",
};

const NOW = new Date("2027-01-10T12:00:00.000Z");

describe("timezone inference in a details patch (spec.md §7.4)", () => {
  it("infers from venue text the first time, when the event has no zone yet", () => {
    const patch = computeEventPatch(ROW, { venueName: "The Lodge, Aldie, Virginia" }, NOW);
    expect(patch.timezone).toBe("America/New_York");
  });

  it("falls back to the browser zone when the venue text says nothing", () => {
    const patch = computeEventPatch(
      ROW,
      { venueName: "The back garden", browserTimezone: "Europe/Lisbon" },
      NOW,
    );
    expect(patch.timezone).toBe("Europe/Lisbon");
  });

  it("ignores a browser zone that is not a real IANA name", () => {
    const patch = computeEventPatch(ROW, { browserTimezone: "Mars/Olympus" }, NOW);
    expect(patch.timezone).toBeUndefined();
  });

  it("leaves a settled zone alone when the patch does not touch the venue", () => {
    const patch = computeEventPatch(DATED, { title: "Baby shower" }, NOW);
    expect(patch.timezone).toBeUndefined();
  });

  it("re-infers when the venue actually changes", () => {
    const patch = computeEventPatch(
      { ...DATED, venue_name: "Aldie, Virginia" },
      { venueName: "Portland, Oregon" },
      NOW,
    );
    expect(patch.timezone).toBe("America/Los_Angeles");
  });

  it("does not re-infer when the venue is rewritten to the same text", () => {
    const row = { ...DATED, venue_name: "Aldie, Virginia" };
    const patch = computeEventPatch(row, { venueName: "Aldie, Virginia" }, NOW);
    expect(patch.timezone).toBeUndefined();
  });

  it("infers from what survives the patch, not from text the host just cleared", () => {
    // The venue name is being removed; only the address should feed inference.
    const row = { ...DATED, venue_name: "Bend, Oregon", address: "Aldie, Virginia" };
    const patch = computeEventPatch(row, { venueName: null }, NOW);
    expect(patch.timezone).toBe("America/New_York");
  });
});

describe("the RSVP deadline rule in a details patch (spec.md §7.3)", () => {
  it("derives a deadline once a date, time and zone exist", () => {
    const patch = computeEventPatch(ROW, {
      eventDate: "2027-03-06",
      startTime: "13:00",
      venueName: "Aldie, Virginia",
    });
    expect(typeof patch.rsvp_deadline).toBe("string");
    expect(patch.rsvp_deadline_edited).toBeUndefined();
  });

  it("stores an explicit deadline and stops recomputing for good", () => {
    const patch = computeEventPatch(DATED, { rsvpDeadline: "2027-02-20T23:59:00.000Z" }, NOW);
    expect(patch.rsvp_deadline).toBe("2027-02-20T23:59:00.000Z");
    expect(patch.rsvp_deadline_edited).toBe(true);
  });

  it("clearing the deadline releases it back to the derived rule", () => {
    const patch = computeEventPatch(
      { ...DATED, rsvp_deadline_edited: true },
      { rsvpDeadline: null },
      NOW,
    );
    expect(patch.rsvp_deadline).toBeNull();
    expect(patch.rsvp_deadline_edited).toBe(false);
  });

  it("never overwrites a deadline the host has already edited", () => {
    const row: PatchableRow = {
      ...DATED,
      rsvp_deadline: "2027-02-20T23:59:00.000Z",
      rsvp_deadline_edited: true,
    };
    const patch = computeEventPatch(row, { eventDate: "2027-04-10" }, NOW);
    expect(patch.rsvp_deadline).toBeUndefined();
    expect(patch.event_date).toBe("2027-04-10");
  });

  it("recomputes from the new date when the deadline is still derived", () => {
    const derived = computeEventPatch(DATED, { eventDate: "2027-04-10" }, NOW);
    expect(typeof derived.rsvp_deadline).toBe("string");
  });

  it("writes nothing for the deadline when the derived value has not moved", () => {
    const first = computeEventPatch(DATED, {}, NOW);
    const settled: PatchableRow = { ...DATED, rsvp_deadline: first.rsvp_deadline as string };
    expect(computeEventPatch(settled, {}, NOW).rsvp_deadline).toBeUndefined();
  });
});

describe("field copying", () => {
  it("treats an empty string as clearing the field", () => {
    const patch = computeEventPatch(DATED, { babyName: "", hosts: "Haseeb & Shezia" }, NOW);
    expect(patch.baby_name).toBeNull();
    expect(patch.hosts).toBe("Haseeb & Shezia");
  });

  it("omits every field the patch did not mention", () => {
    // A row with no date has no derived deadline either, so `title` is the whole patch.
    const undated: PatchableRow = { ...ROW, timezone: "America/New_York" };
    expect(Object.keys(computeEventPatch(undated, { title: "Baby shower" }, NOW))).toEqual([
      "title",
    ]);
  });
});
