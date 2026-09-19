import { describe, expect, it } from "vitest";

import {
  deriveCapabilities,
  deriveContentProfile,
  PROVISIONAL_REGISTRY_COUNTS,
  type EventContentRow,
} from "./content-profile";

const NOW = new Date("2027-01-10T12:00:00.000Z");

const EMPTY_EVENT: EventContentRow = {
  title: null,
  description: null,
  hosts: null,
  baby_name: null,
  venue_name: null,
  address: null,
  event_date: null,
  start_time: null,
  timezone: null,
  rsvp_deadline: null,
};

const FULL_EVENT: EventContentRow = {
  title: "Welcome Baby Rowan",
  description: "Join us for brunch and celebration as we welcome Rowan into the world.",
  hosts: "Jamie and Alex Rivera",
  baby_name: "Rowan",
  venue_name: "The Garden Room",
  address: "12 Barn Lane, Aldie, Virginia",
  event_date: "2027-04-17",
  start_time: "14:00",
  timezone: "America/Los_Angeles",
  rsvp_deadline: "2027-04-03T18:59:00.000Z",
};

describe("deriveCapabilities", () => {
  it("is the full set at first generation (docs/event-renderer-system.md §2.3)", () => {
    const capabilities = deriveCapabilities(EMPTY_EVENT);
    expect(capabilities).toEqual({
      rsvp: true,
      registry: true,
      gifts: true,
      externalRegistry: true,
      cashFund: true,
      hosts: true,
      description: true,
      time: true,
      location: true,
      deadline: true,
    });
  });

  it("never turns on/off from content presence: null and fully-filled events agree exactly", () => {
    // This is the invariant spec.md §32 #16 and docs/event-renderer-system.md §2.3 both name:
    // capabilities derive from enabled features, never from whether content exists. An event with
    // every field null and one with every field filled must produce byte-identical capabilities.
    expect(deriveCapabilities(EMPTY_EVENT)).toEqual(deriveCapabilities(FULL_EVENT));
  });
});

describe("deriveContentProfile: real content", () => {
  it("measures real values when present", () => {
    const profile = deriveContentProfile(FULL_EVENT, NOW, { gift: 3, external: 1, cashfund: 0 });
    expect(profile.titleChars).toBe(FULL_EVENT.title!.length);
    expect(profile.titleWords).toBe(3); // "Welcome Baby Rowan"
    expect(profile.hostsChars).toBe(FULL_EVENT.hosts!.length);
    expect(profile.venueChars).toBe(FULL_EVENT.venue_name!.length);
    expect(profile.descriptionChars).toBe(FULL_EVENT.description!.length);
    expect(profile.registryCounts).toEqual({ gift: 3, external: 1, cashfund: 0 });
  });

  it("an event with all fields filled (including supplied registry counts) has an empty provisionalFields", () => {
    const profile = deriveContentProfile(FULL_EVENT, NOW, { gift: 3, external: 1, cashfund: 0 });
    expect(profile.provisionalFields).toEqual([]);
  });
});

describe("deriveContentProfile: bounded provisional content (spec.md §7.3)", () => {
  it("produces the bounded provisional title and records it in provisionalFields", () => {
    const profile = deriveContentProfile(EMPTY_EVENT, NOW);
    // spec.md §7.3: "a title from the event type (`Baby shower for <family name>` when a name is
    // known, else `A baby shower`)" — no baby name here, so the no-name form applies.
    expect(profile.titleChars).toBe("A baby shower".length);
    expect(profile.titleWords).toBe(3);
    expect(profile.provisionalFields).toContain("title");
  });

  it("uses the family-name title form and stays bounded when a baby name is known", () => {
    const withName: EventContentRow = { ...EMPTY_EVENT, baby_name: "Rowan" };
    const profile = deriveContentProfile(withName, NOW);
    expect(profile.titleChars).toBe("Baby shower for Rowan".length);
    expect(profile.provisionalFields).toContain("title");
  });

  it("produces the bounded provisional venue text and records it in provisionalFields", () => {
    const profile = deriveContentProfile(EMPTY_EVENT, NOW);
    // spec.md §7.3: "`Venue to be announced`".
    expect(profile.venueChars).toBe("Venue to be announced".length);
    expect(profile.provisionalFields).toContain("venue");
  });

  it("omits hosts rather than inventing a bounded stand-in, and never lists it as provisional", () => {
    // spec.md §7.3: "hosts omitted" — distinct from the other fields, which get a filler value.
    const profile = deriveContentProfile(EMPTY_EVENT, NOW);
    expect(profile.hostsChars).toBe(0);
    expect(profile.provisionalFields).not.toContain("hosts");
  });

  it("treats an absent description the same way: real empty content, never provisional", () => {
    const profile = deriveContentProfile(EMPTY_EVENT, NOW);
    expect(profile.descriptionChars).toBe(0);
    expect(profile.provisionalFields).not.toContain("description");
  });

  it("falls back to the bounded default registry counts and records 'registry' as provisional", () => {
    const profile = deriveContentProfile(EMPTY_EVENT, NOW);
    expect(profile.registryCounts).toEqual(PROVISIONAL_REGISTRY_COUNTS);
    expect(profile.provisionalFields).toContain("registry");
  });

  it("keeps real content free of any provisional flag when only registry counts are supplied", () => {
    const profile = deriveContentProfile(FULL_EVENT, NOW, { gift: 2, external: 0, cashfund: 1 });
    expect(profile.provisionalFields).toEqual([]);
  });
});
