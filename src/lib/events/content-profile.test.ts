import { describe, expect, it } from "vitest";
import { contentProfile } from "./content-profile";

describe("contentProfile", () => {
  const now = new Date("2026-09-01T00:00:00Z");

  it("reports provisional fields matching provisionalContent for a bare event", () => {
    const profile = contentProfile({}, now);
    expect(profile.provisionalFields).toEqual(
      expect.arrayContaining(["title", "eventDate", "startTime", "venue", "rsvpDeadline"]),
    );
    expect(profile.time.present).toBe(false);
    expect(profile.location.present).toBe(false);
    expect(profile.deadline.present).toBe(false);
    expect(profile.hosts).toEqual({ present: false, length: 0 });
  });

  it("reports real content as present with no provisional fields once fully supplied", () => {
    const profile = contentProfile(
      {
        title: "Welcome Baby Jordan!",
        eventDate: "2026-12-05",
        startTime: "15:00",
        venue: "123 Main St",
        hosts: "Alex & Sam",
        description: "Join us for brunch and games.",
        timezone: null,
      },
      now,
    );
    expect(profile.provisionalFields).toEqual([]);
    expect(profile.titleWordCount).toBe(3);
    expect(profile.hosts).toEqual({ present: true, length: 10 });
    expect(profile.description).toEqual({
      present: true,
      length: "Join us for brunch and games.".length,
    });
    expect(profile.time.present).toBe(true);
    expect(profile.location).toEqual({ present: true, length: "123 Main St".length });
    expect(profile.deadline.present).toBe(true);
  });

  it("treats a missing/blank description as absent", () => {
    expect(contentProfile({ description: "" }, now).description).toEqual({
      present: false,
      length: 0,
    });
    expect(contentProfile({ description: "   " }, now).description).toEqual({
      present: false,
      length: 0,
    });
    expect(contentProfile({}, now).description).toEqual({ present: false, length: 0 });
  });

  it("defaults registry counts to zero when not supplied (Phase 8 populates these)", () => {
    const profile = contentProfile({}, now);
    expect(profile.registry).toEqual({
      nativeGiftCount: 0,
      externalRegistryCount: 0,
      hasCashFund: false,
    });
  });

  it("passes through supplied registry counts", () => {
    const profile = contentProfile({}, now, {
      nativeGifts: 3,
      externalRegistries: 1,
      hasCashFund: true,
    });
    expect(profile.registry).toEqual({
      nativeGiftCount: 3,
      externalRegistryCount: 1,
      hasCashFund: true,
    });
  });

  it("never disagrees with provisionalContent about what is provisional", () => {
    const profile = contentProfile({ eventDate: "2026-12-05" }, now);
    // eventDate supplied -> not provisional; startTime/venue/title still unsupplied.
    expect(profile.provisionalFields).not.toContain("eventDate");
    expect(profile.provisionalFields).toContain("startTime");
    expect(profile.provisionalFields).toContain("venue");
  });
});
