import { describe, expect, it } from "vitest";

import {
  PUBLISH_BLOCKER_KEYS,
  publishReadiness,
  type PublishReadinessInput,
} from "./publish-readiness";
import type { EventDetailFields } from "./required-details";

const EMPTY: EventDetailFields = {
  title: null,
  eventDate: null,
  startTime: null,
  endTime: null,
  timezone: null,
  venueName: null,
  address: null,
  hosts: null,
  babyName: null,
  visibility: null,
  rsvpDeadline: null,
};

const COMPLETE: EventDetailFields = {
  title: "Maya's Garden Shower",
  eventDate: "2026-12-19",
  startTime: "13:00",
  endTime: null,
  timezone: "America/Chicago",
  venueName: "Villa Rosa",
  address: null,
  hosts: null,
  babyName: null,
  visibility: "public",
  rsvpDeadline: "2026-12-05T17:00:00.000Z",
};

function ask(
  over: Partial<Omit<PublishReadinessInput, "details">> & {
    details?: Partial<EventDetailFields>;
  } = {},
) {
  const { details, ...rest } = over;
  return publishReadiness({
    details: { ...COMPLETE, ...details },
    designTitle: "Lemons & Linen",
    hasCard: true,
    accessCodeSet: false,
    ...rest,
  });
}

const keys = (r: ReturnType<typeof ask>) => r.blockers.map((b) => b.key);

describe("publishReadiness (spec.md §23.1)", () => {
  it("is ready when every §23.1 requirement is saved, public, with a card", () => {
    const r = ask();
    expect(r.ready).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it("is ready with the host's title left empty once a design supplies one (§20.2)", () => {
    expect(ask({ details: { title: null } }).ready).toBe(true);
    expect(ask({ details: { title: "   " } }).ready).toBe(true);
  });

  it("blocks on the title only when neither the host nor a design has one", () => {
    expect(keys(ask({ details: { title: null }, designTitle: null, hasCard: false }))).toEqual([
      "card",
      "title",
    ]);
    expect(keys(ask({ details: { title: null }, designTitle: "  " }))).toEqual(["title"]);
  });

  it("blocks without a card", () => {
    expect(keys(ask({ hasCard: false }))).toEqual(["card"]);
  });

  it("lists a brand-new event's blockers in §23.1's order", () => {
    const r = ask({ details: { ...EMPTY } });
    expect(keys(r)).toEqual([
      "eventDate",
      "startTime",
      "venue",
      "timezone",
      "rsvpDeadline",
      "visibility",
    ]);
    expect(r.ready).toBe(false);
  });

  it("accepts a venue name or an address for the venue", () => {
    expect(keys(ask({ details: { venueName: null, address: "12 Rose Lane" } }))).toEqual([]);
    expect(keys(ask({ details: { venueName: null, address: null } }))).toEqual(["venue"]);
    expect(keys(ask({ details: { venueName: " ", address: " " } }))).toEqual(["venue"]);
  });

  it("blocks each of start time, timezone and visibility on its own", () => {
    expect(keys(ask({ details: { startTime: null } }))).toEqual(["startTime"]);
    expect(keys(ask({ details: { timezone: null } }))).toEqual(["timezone"]);
    expect(keys(ask({ details: { visibility: null } }))).toEqual(["visibility"]);
  });

  describe("the RSVP deadline", () => {
    it("is a row of its own, as spec §23.1 lists it, even while there is no date", () => {
      const r = ask({ details: { eventDate: null, rsvpDeadline: null } });
      expect(keys(r)).toEqual(["eventDate", "rsvpDeadline"]);
      expect(r.ready).toBe(false);
    });

    it("is a blocker when a date is saved and no deadline is", () => {
      expect(keys(ask({ details: { rsvpDeadline: null } }))).toEqual(["rsvpDeadline"]);
    });

    it("is satisfied by the stored default, with no extra step", () => {
      expect(keys(ask({ details: { rsvpDeadline: "2026-12-05T05:59:00.000Z" } }))).toEqual([]);
    });
  });

  describe("private events", () => {
    it("block until an access code is stored", () => {
      const r = ask({ details: { visibility: "private" }, accessCodeSet: false });
      expect(keys(r)).toEqual(["accessCode"]);
      expect(r.ready).toBe(false);
      expect(r.blockers[0].focusId).toBeNull();
    });

    it("are ready with a code", () => {
      expect(ask({ details: { visibility: "private" }, accessCodeSet: true }).ready).toBe(true);
    });

    it("a public event never needs a code, stored or not", () => {
      expect(ask({ details: { visibility: "public" }, accessCodeSet: false }).ready).toBe(true);
      expect(ask({ details: { visibility: "public" }, accessCodeSet: true }).ready).toBe(true);
    });

    it("an event whose visibility is not chosen blocks on visibility, not the code", () => {
      expect(keys(ask({ details: { visibility: null } }))).toEqual(["visibility"]);
    });
  });

  it("counts only saved values: prompt-stated facts and placeholders satisfy nothing", () => {
    // The shape of an event draft, which also carries what the prompt states.
    const draft = {
      ...EMPTY,
      promptFacts: { date: "December 19", time: "2pm", venue: "Villa Rosa", hosts: "Ana & Leo" },
      provisional: { eventDate: { value: "2026-12-19" } },
    };
    const r = publishReadiness({
      details: draft,
      designTitle: "Lemons & Linen",
      hasCard: true,
      accessCodeSet: false,
    });
    expect(keys(r)).toEqual([
      "eventDate",
      "startTime",
      "venue",
      "timezone",
      "rsvpDeadline",
      "visibility",
    ]);
  });

  it("never lists guests, registry, invitations, a co-host or payment (§32 #45)", () => {
    expect(PUBLISH_BLOCKER_KEYS).toEqual([
      "card",
      "title",
      "eventDate",
      "startTime",
      "venue",
      "timezone",
      "rsvpDeadline",
      "visibility",
      "accessCode",
    ]);
    const labels = ask({ details: { ...EMPTY }, hasCard: false })
      .blockers.map((b) => `${b.label} ${b.description}`)
      .join(" ");
    expect(labels).not.toMatch(/guest|registry|co-?host|payment/i);
  });

  it("points each answerable blocker at a field of the details editor", () => {
    const r = ask({ details: { ...EMPTY, rsvpDeadline: null }, designTitle: null });
    const byKey = Object.fromEntries(r.blockers.map((b) => [b.key, b.focusId]));
    expect(byKey).toMatchObject({
      title: "title",
      eventDate: "eventDate",
      startTime: "startTime",
      venue: "venueName",
      timezone: "venueName",
      visibility: "visibility-public",
    });
  });
});
