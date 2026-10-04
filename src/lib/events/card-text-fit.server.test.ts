import { describe, expect, it } from "vitest";

import { validateCardText } from "@/lib/card/entry";
import { TYPICAL, WORST } from "@/lib/card/test-content";
import { cardTextFieldErrors, VENUE_CLEARED_MESSAGE } from "./card-text";
import {
  ADDRESS_FIT_MESSAGE,
  CARD_TEXT_FIT_MESSAGE,
  cardTextFitErrors,
} from "./card-text-fit.server";

/** Within every entry limit and accepted by the isomorphic entry check, yet too wide for some designs. */
const CAPS_TITLE = "WELCOME WILHELMINA MONTGOMERY-WHITWORTH!";
const WIDE_BABY_NAME = "WMWMW WMWMW WMWMW WMWMW WMWMW WMWMW WMWM";
const WIDE_LINE = "WWWWWWWWWWWW WWWWWWWWWWWW WWWWWWWWWWWW WWWWWWWWWWWW WWWWWWWW";

describe("the details form's card fit check", () => {
  it("passes the isomorphic entry check for these values, so only the fit check refuses them", () => {
    expect(
      cardTextFieldErrors({
        title: CAPS_TITLE,
        babyName: WIDE_BABY_NAME,
        hosts: WIDE_LINE,
        venueName: WIDE_LINE,
      }),
    ).toBeNull();
    expect(cardTextFieldErrors({ address: `${WIDE_LINE}, Austin TX` })).toBeNull();
    expect(validateCardText("venue", WIDE_LINE)).toEqual({ ok: true });
  });

  it("accepts typical content, and absent, null and cleared fields", async () => {
    expect(
      await cardTextFitErrors({
        title: TYPICAL.title!,
        hosts: TYPICAL.hosts!,
        babyName: "Zoë",
        venueName: TYPICAL.venue!,
        address: "12 Elm St, Austin, TX 78701",
      }),
    ).toBeNull();
    expect(await cardTextFitErrors({})).toBeNull();
    expect(await cardTextFitErrors({ title: null, hosts: "", babyName: null })).toBeNull();
  });

  it("refuses text the card cannot fit in every design, keyed by the form's field name", async () => {
    expect(await cardTextFitErrors({ title: CAPS_TITLE, hosts: TYPICAL.hosts! })).toEqual({
      title: CARD_TEXT_FIT_MESSAGE,
    });
    expect(
      await cardTextFitErrors({ babyName: WIDE_BABY_NAME, hosts: WIDE_LINE, title: "Hello" }),
    ).toEqual({ babyName: CARD_TEXT_FIT_MESSAGE, hosts: CARD_TEXT_FIT_MESSAGE });
    expect(await cardTextFitErrors({ venueName: WIDE_LINE })).toEqual({
      venueName: CARD_TEXT_FIT_MESSAGE,
    });
    expect(CARD_TEXT_FIT_MESSAGE).toBe(
      "This takes more room than the card has here — please shorten it.",
    );
  });

  it("checks the combination the event would have once saved, after each field alone", async () => {
    // The title fits on its own, but not beside details stored before this check existed.
    expect(await cardTextFitErrors({ title: WORST.title }, { venueName: WIDE_LINE })).toEqual({
      title: CARD_TEXT_FIT_MESSAGE,
    });
    expect(
      await cardTextFitErrors({ title: WORST.title }, { venueName: TYPICAL.venue! }),
    ).toBeNull();
    // A field that fails alone is named alone: its value is not held against the others.
    expect(await cardTextFitErrors({ title: CAPS_TITLE, hosts: TYPICAL.hosts! })).toEqual({
      title: CARD_TEXT_FIT_MESSAGE,
    });
  }, 60_000);

  it("checks the address's first line only when there is no venue name", async () => {
    const address = `${WIDE_LINE}, Austin TX`;
    // A venue name in the patch or stored: the card shows it, not the address.
    expect(await cardTextFitErrors({ address, venueName: "The Willow House" })).toBeNull();
    expect(await cardTextFitErrors({ address }, { venueName: "The Willow House" })).toBeNull();
    // No venue name: the card shows the address's first line.
    expect(await cardTextFitErrors({ address })).toEqual({ address: ADDRESS_FIT_MESSAGE });
    expect(await cardTextFitErrors({ address }, { venueName: "  " })).toEqual({
      address: ADDRESS_FIT_MESSAGE,
    });
    // Only the first line reaches the card.
    expect(await cardTextFitErrors({ address: `12 Elm St, ${WIDE_LINE}` })).toBeNull();
  });

  it("refuses clearing the venue name when the address's first line would not fit", async () => {
    const stored = { venueName: "The Willow House", address: `${WIDE_LINE}, Austin TX` };
    expect(await cardTextFitErrors({ venueName: "" }, stored)).toEqual({
      venueName: VENUE_CLEARED_MESSAGE,
    });
    expect(await cardTextFitErrors({ venueName: null }, stored)).toEqual({
      venueName: VENUE_CLEARED_MESSAGE,
    });
    expect(
      await cardTextFitErrors({ venueName: "" }, { ...stored, address: "12 Elm St, Austin" }),
    ).toBeNull();
    expect(
      await cardTextFitErrors({ venueName: "" }, { venueName: "The Willow House" }),
    ).toBeNull();
    // Both refused: only the address's message, which names the actual problem.
    expect(
      await cardTextFitErrors({ venueName: "", address: `${WIDE_LINE}, Austin TX` }, stored),
    ).toEqual({ address: ADDRESS_FIT_MESSAGE });
  });
});
