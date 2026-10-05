import { describe, expect, it } from "vitest";

import { hasDetailsHiddenFromGuests } from "./preview";

describe("hasDetailsHiddenFromGuests", () => {
  it("is true when a fact guests would see is missing", () => {
    expect(hasDetailsHiddenFromGuests(["eventDate"])).toBe(true);
    expect(hasDetailsHiddenFromGuests(["timezone", "venue"])).toBe(true);
    expect(hasDetailsHiddenFromGuests(["rsvpDeadline"])).toBe(true);
  });

  it("is false when only details guests never see are missing, or none is", () => {
    expect(hasDetailsHiddenFromGuests([])).toBe(false);
    expect(hasDetailsHiddenFromGuests(["visibility", "title"])).toBe(false);
    // A missing timezone hides the RSVP-by line from guests.
    expect(hasDetailsHiddenFromGuests(["timezone"])).toBe(true);
  });
});
