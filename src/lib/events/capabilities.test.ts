import { describe, expect, it } from "vitest";
import { capabilitiesForEvent, type Capabilities } from "./capabilities";

describe("capabilitiesForEvent", () => {
  it("returns the full capability set for a baby shower at first generation", () => {
    const expected: Capabilities = {
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
    };
    expect(capabilitiesForEvent({ eventType: "baby_shower" })).toEqual(expected);
  });

  it("does not depend on whether content has been entered", () => {
    // Same event shape either way; capabilities are not derived from content presence.
    const withNoOtherFields = capabilitiesForEvent({});
    const withEventType = capabilitiesForEvent({ eventType: "baby_shower" });
    expect(withNoOtherFields).toEqual(withEventType);
  });

  it("returns a fresh object each call (no shared mutable state)", () => {
    const a = capabilitiesForEvent({});
    const b = capabilitiesForEvent({});
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
