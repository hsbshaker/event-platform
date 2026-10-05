import { describe, expect, it } from "vitest";

import type { PromptFacts } from "@/lib/card/facts";
import { formPrefill, promptPrefill, type PrefillCurrent } from "./prompt-prefill";

const EMPTY: PrefillCurrent = {
  hosts: null,
  babyName: null,
  venueName: null,
  address: null,
  eventDate: null,
  startTime: null,
};

const FACTS: PromptFacts = {
  hosts: "Ana & Leo",
  honoree: "Maya Lopez",
  date: "December 19",
  time: "2pm",
  venue: "Villa Rosa",
  location: "12 Elm Street, Austin",
};

describe("promptPrefill", () => {
  it("offers each stated value for an empty field, honoree as the baby's name", () => {
    expect(promptPrefill(FACTS, EMPTY)).toEqual({
      fields: {
        hosts: "Ana & Leo",
        babyName: "Maya Lopez",
        venueName: "Villa Rosa",
        address: "12 Elm Street, Austin",
      },
      hints: { date: "December 19", time: "2pm" },
    });
  });

  it("never offers a value for a field the event already has", () => {
    const result = promptPrefill(FACTS, {
      ...EMPTY,
      hosts: "Someone Else",
      venueName: "Casa Limone",
      eventDate: "2026-12-19",
    });
    expect(result.fields).toEqual({ babyName: "Maya Lopez", address: "12 Elm Street, Austin" });
    expect(result.hints).toEqual({ date: null, time: "2pm" });
  });

  it("treats a blank stored value as empty and a blank stated value as absent", () => {
    const result = promptPrefill(
      { ...FACTS, hosts: "   ", honoree: null },
      { ...EMPTY, hosts: " " },
    );
    expect(result.fields.hosts).toBeUndefined();
    expect(result.fields.babyName).toBeUndefined();
  });

  it("keeps the date and time as written, never parsing them", () => {
    const result = promptPrefill({ ...FACTS, date: "the   Saturday after\nthanksgiving" }, EMPTY);
    expect(result.hints.date).toBe("the Saturday after thanksgiving");
  });

  it("offers nothing when the prompt's facts are not extracted yet", () => {
    expect(promptPrefill(null, EMPTY)).toEqual({ fields: {}, hints: { date: null, time: null } });
  });
});

describe("formPrefill (the form as it stands, including facts that arrive late)", () => {
  it("offers the venue fields only when the form shows them", () => {
    expect(formPrefill(FACTS, EMPTY, false).fields).toEqual({
      hosts: "Ana & Leo",
      babyName: "Maya Lopez",
    });
    expect(formPrefill(FACTS, EMPTY, true).fields).toMatchObject({
      venueName: "Villa Rosa",
      address: "12 Elm Street, Austin",
    });
  });

  it("never overwrites what the host typed before the facts arrived", () => {
    // The form's fields are strings; "" is empty.
    const typed = { ...EMPTY, hosts: "Grandma Rose", eventDate: "2026-12-19" } as PrefillCurrent;
    const offered = formPrefill(FACTS, typed, true);
    expect(offered.fields.hosts).toBeUndefined();
    expect(offered.fields.babyName).toBe("Maya Lopez");
    expect(offered.hints).toEqual({ date: null, time: "2pm" });
    const blank = { ...EMPTY, hosts: "", babyName: " " } as unknown as PrefillCurrent;
    expect(formPrefill(FACTS, blank, false).fields).toEqual({
      hosts: "Ana & Leo",
      babyName: "Maya Lopez",
    });
  });
});
