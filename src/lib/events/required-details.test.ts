import { describe, expect, it } from "vitest";
import {
  missingRequiredDetails,
  REQUIRED_DETAIL_KEYS,
  REQUIREMENTS_OUTSIDE_PHASE_2,
  type EventDetailFields,
} from "./required-details";
import { getAiProvider } from "@/lib/ai/provider";

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
  title: "Baby shower for Shaker",
  eventDate: "2027-03-06",
  startTime: "13:00",
  endTime: null,
  timezone: "America/New_York",
  venueName: "The Lodge at Hanson Park",
  address: "Aldie, Virginia",
  hosts: "Haseeb & Shezia",
  babyName: "Shaker",
  visibility: "public",
  rsvpDeadline: "2027-02-20T23:59:00.000Z",
};

describe("required details (spec.md §23.1)", () => {
  it("adds no requirement beyond the ones §23.1 lists (§32 #44)", () => {
    expect([...REQUIRED_DETAIL_KEYS]).toEqual([
      "title",
      "eventDate",
      "startTime",
      "venue",
      "timezone",
      "rsvpDeadline",
      "visibility",
    ]);
    // Guests, registry, co-hosts and inspiration are explicitly not requirements.
    for (const notRequired of ["guests", "registry", "cashFund", "cohost", "inspiration"]) {
      expect(REQUIRED_DETAIL_KEYS as readonly string[]).not.toContain(notRequired);
    }
  });

  it("reports every requirement as missing on a brand new event", () => {
    expect(missingRequiredDetails(EMPTY)).toEqual([...REQUIRED_DETAIL_KEYS]);
  });

  it("reports nothing missing once the Phase 2 answers are in", () => {
    expect(missingRequiredDetails(COMPLETE)).toEqual([]);
  });

  it("keeps the end time optional (§7.3 'End time remains optional')", () => {
    expect(missingRequiredDetails({ ...COMPLETE, endTime: null })).toEqual([]);
    expect(missingRequiredDetails({ ...COMPLETE, endTime: "17:00" })).toEqual([]);
  });

  it("treats hosts and the baby name as content, never as publish blockers", () => {
    expect(missingRequiredDetails({ ...COMPLETE, hosts: null, babyName: null })).toEqual([]);
  });

  it("accepts either a venue name or an address as the location display value", () => {
    expect(missingRequiredDetails({ ...COMPLETE, venueName: null })).toEqual([]);
    expect(missingRequiredDetails({ ...COMPLETE, address: null })).toEqual([]);
    expect(missingRequiredDetails({ ...COMPLETE, venueName: null, address: null })).toEqual([
      "venue",
    ]);
  });

  it("counts visibility as answered only once it is chosen", () => {
    expect(missingRequiredDetails({ ...COMPLETE, visibility: null })).toContain("visibility");
    for (const visibility of ["public", "private"] as const) {
      expect(missingRequiredDetails({ ...COMPLETE, visibility })).toEqual([]);
    }
  });

  it("ignores whitespace-only answers", () => {
    expect(missingRequiredDetails({ ...COMPLETE, venueName: "   ", address: "" })).toEqual([
      "venue",
    ]);
  });

  it("says plainly which §23.1 requirements Phase 2 cannot settle", () => {
    expect(REQUIREMENTS_OUTSIDE_PHASE_2).toHaveLength(2);
    expect(REQUIREMENTS_OUTSIDE_PHASE_2.join(" ")).toMatch(/ResolvedDesignSpec/);
    expect(REQUIREMENTS_OUTSIDE_PHASE_2.join(" ")).toMatch(/access code/);
  });
});

describe("the model boundary stays shut in Phase 2 (spec.md §32 #4)", () => {
  it("refuses to hand out a provider at all, signed in or not", () => {
    expect(() => getAiProvider()).toThrow(/Phase 4/);
  });
});
