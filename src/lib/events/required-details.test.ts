import { afterEach, describe, expect, it, vi } from "vitest";
import {
  missingRequiredDetails,
  REQUIRED_DETAIL_KEYS,
  REQUIREMENTS_OUTSIDE_PHASE_2,
  type EventDetailFields,
} from "./required-details";
import { GenerationDisabledError } from "@/lib/ai/errors";
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
  it("adds no requirement beyond the ones §23.1 lists (§32 #45)", () => {
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
    expect(REQUIREMENTS_OUTSIDE_PHASE_2.join(" ")).toMatch(/invitation card design/);
    expect(REQUIREMENTS_OUTSIDE_PHASE_2.join(" ")).toMatch(/access code/);
  });
});

describe("the model boundary stays shut until generation is switched on (spec.md §32 #4)", () => {
  const saved = process.env.GENERATION_ENABLED;
  afterEach(() => {
    process.env.GENERATION_ENABLED = saved;
    vi.restoreAllMocks();
  });

  it("refuses every model call by default, before any request (src/lib/ai/meter.server.ts)", async () => {
    delete process.env.GENERATION_ENABLED;
    const request = vi.spyOn(globalThis, "fetch");
    const ctx = {
      eventId: "6f1c1d64-34d4-4a43-9a42-0b6b3e2f6a11",
      userId: "0b0b8f52-56a2-4b0f-8c4e-7d1d9cf6a9e2",
      generationId: "c5d7b1a4-3f2e-4c8d-9b7a-1e2f3a4b5c6d",
    };
    await expect(
      getAiProvider().generateEventIdentity(ctx, { prompt: "A garden baby shower" }),
    ).rejects.toBeInstanceOf(GenerationDisabledError);
    expect(request).not.toHaveBeenCalled();
  });
});
