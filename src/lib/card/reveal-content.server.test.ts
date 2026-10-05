import { describe, expect, it } from "vitest";

import { validateCardText } from "./entry";
import { cardTextFitsEveryDesign } from "./entry-fit.server";
import { revealCardContent, type PromptFacts } from "./facts";
import { promptFactFit, revealContentFor } from "./reveal-content.server";

/**
 * The reveal's words on the server (`spec.md §7.3`; `docs/card-system.md §2.5`): a prompt-stated
 * value is shown only when the fit check accepts it too, exactly as a host's own entry would be.
 */

/** Within the baby name's and venue's limits and accepted by `validateCardText`, yet too wide. */
const WIDE_BABY_NAME = "WMWMW WMWMW WMWMW WMWMW WMWMW WMWMW WMWM";
const WIDE_VENUE = "WWWWWWWWWWWW WWWWWWWWWWWW WWWWWWWWWWWW WWWWWWWWWWWW WWWWWWWW";

const wording = { title: "Lemons & Linen", invitationLine: "Please join us for a garden shower" };
const nothing = {
  babyName: null,
  hosts: null,
  eventDate: null,
  startTime: null,
  endTime: null,
  venueName: null,
  address: null,
  rsvpDeadline: null,
  timezone: null,
};
const now = new Date("2026-10-05T12:00:00Z");

describe("revealContentFor", () => {
  it("shows prompt facts that pass the entry and fit checks, as written and unconfirmed", async () => {
    const promptFacts: PromptFacts = {
      hosts: "Ana and Leo",
      honoree: "Maya Lopez",
      date: "December 19",
      time: "2pm",
      venue: "Villa Rosa",
      location: null,
    };
    const result = await revealContentFor({ wording, event: nothing, promptFacts, now });
    expect(result.content).toMatchObject({
      hosts: "Ana and Leo",
      babyName: "Maya Lopez",
      date: "December 19",
      time: "2pm",
      venue: "Villa Rosa",
    });
    expect(result.unconfirmed).toEqual(["babyName", "hosts", "date", "time", "venue"]);
  }, 60_000);

  it("refuses a value the entry check accepts but some design cannot fit", async () => {
    for (const [slot, value] of [
      ["babyName", WIDE_BABY_NAME],
      ["venue", WIDE_VENUE],
    ] as const) {
      expect(validateCardText(slot, value).ok).toBe(true);
      expect(await cardTextFitsEveryDesign(slot, value)).toBe(false);
    }
    const promptFacts: PromptFacts = {
      hosts: null,
      honoree: WIDE_BABY_NAME,
      date: null,
      time: null,
      venue: WIDE_VENUE,
      location: null,
    };
    const result = await revealContentFor({ wording, event: nothing, promptFacts, now });
    expect(result.content.babyName).toBeNull();
    expect(result.content.venue).toBe("Venue to be announced");
    expect(result.unconfirmed).toEqual(["date", "time", "venue"]);
  }, 60_000);

  it("is revealCardContent with the fit check's answers", async () => {
    const promptFacts: PromptFacts = {
      hosts: "Ana and Leo",
      honoree: WIDE_BABY_NAME,
      date: "December 19",
      time: null,
      venue: null,
      location: "Positano, Italy",
    };
    const input = { wording, event: nothing, promptFacts, now };
    const fits = await promptFactFit(input);
    expect(fits("babyName", WIDE_BABY_NAME)).toBe(false);
    expect(fits("hosts", "Ana and Leo")).toBe(true);
    // Only the candidates were checked: anything else is not accepted.
    expect(fits("hosts", "Someone else")).toBe(false);
    expect(await revealContentFor(input)).toEqual(revealCardContent({ ...input, fits }));
  }, 60_000);
});
