import { describe, expect, it } from "vitest";

import {
  CARD_SLOT_IDS,
  FACT_ENTRY_LIMITS,
  FACT_SLOT_IDS,
  isWordingSlot,
  WORDING_LIMITS,
  WORDING_SLOT_IDS,
} from "./slots";

describe("card slots", () => {
  it("are in render order and partition into wording and fact slots", () => {
    expect(CARD_SLOT_IDS).toEqual([
      "title",
      "invitationLine",
      "babyName",
      "hosts",
      "date",
      "time",
      "venue",
      "rsvpBy",
    ]);
    expect([...WORDING_SLOT_IDS, ...FACT_SLOT_IDS]).toEqual([...CARD_SLOT_IDS]);
    expect(isWordingSlot("title")).toBe(true);
    expect(isWordingSlot("venue")).toBe(false);
  });

  it("has limits for every slot", () => {
    expect(WORDING_LIMITS.title).toEqual({ min: 2, max: 40 });
    expect(WORDING_LIMITS.invitationLine).toEqual({ min: 8, max: 72 });
    expect(FACT_ENTRY_LIMITS).toEqual({
      babyName: 40,
      hosts: 60,
      date: 40,
      time: 24,
      venue: 60,
      rsvpBy: 40,
    });
  });
});
