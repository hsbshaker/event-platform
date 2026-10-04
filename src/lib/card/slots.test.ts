import { describe, expect, it } from "vitest";

import { CARD_FACT_MAX_LENGTH } from "./facts";
import {
  CARD_SLOT_IDS,
  FACT_ENTRY_LIMITS,
  FACT_SLOT_IDS,
  FORMATTED_FACT_SLOT_IDS,
  FREE_TEXT_FACT_SLOT_IDS,
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
    expect(FACT_ENTRY_LIMITS).toEqual({ babyName: 40, hosts: 60, venue: 60 });
    expect(CARD_FACT_MAX_LENGTH).toEqual({ date: 23, time: 19, rsvpBy: 20 });
  });

  it("splits the fact slots into typed and formatted ones", () => {
    expect([...FREE_TEXT_FACT_SLOT_IDS, ...FORMATTED_FACT_SLOT_IDS].sort()).toEqual(
      [...FACT_SLOT_IDS].sort(),
    );
  });
});
