import { describe, expect, it } from "vitest";

import {
  CARD_TEXT_FIELDS,
  VENUE_CLEARED_MESSAGE,
  cardTextFieldError,
  cardTextFieldErrors,
} from "./card-text";

describe("card text fields", () => {
  it("maps the details the card shows verbatim to their card slots", () => {
    expect(CARD_TEXT_FIELDS).toEqual({
      title: "title",
      hosts: "hosts",
      babyName: "babyName",
      venueName: "venue",
      address: "venue",
    });
  });

  it("checks only the address's first line, which is all the card shows of it", () => {
    const longRest = `12 Elm St, ${"Suite 100 Building C Industrial Park ".repeat(4)}`;
    expect(cardTextFieldError("address", longRest)).toBeNull();
    expect(cardTextFieldError("address", "Café 🎈 Lane, Austin")).toMatch(
      /^The card shows the address's first line\. The card can't show 🎈/,
    );
    expect(cardTextFieldError("address", `${"Long ".repeat(15)}Road, Austin`)).toMatch(
      /^The card shows the address's first line\. The card has room for 60 characters/,
    );
    expect(cardTextFieldError("address", " , ")).toBeNull();
  });

  it("accepts what the card can show, and absent or cleared fields", () => {
    expect(
      cardTextFieldErrors({
        title: "A Little Wild One",
        hosts: "Hosted by Maya & Tom",
        babyName: "Zoë",
        venueName: "The Willow House",
      }),
    ).toBeNull();
    expect(cardTextFieldErrors({})).toBeNull();
    expect(cardTextFieldErrors({ hosts: null, venueName: "" })).toBeNull();
  });

  it("gives each refused field its plain message, keyed by the form's field name", () => {
    expect(
      cardTextFieldErrors({
        hosts: "Maya & Tom 🎈",
        venueName: "V".repeat(61),
        babyName: "Mia",
      }),
    ).toEqual({
      hosts: "The card can't show 🎈 — please remove it.",
      venueName: "The card has room for 60 characters here — please shorten this to fit.",
    });
    expect(cardTextFieldError("title", "T".repeat(41))).toBe(
      "The card has room for 40 characters here — please shorten this to fit.",
    );
    expect(cardTextFieldError("babyName", undefined)).toBeNull();
  });

  describe("the address, which the card shows only without a venue name", () => {
    const badAddress = "Café 🎈 Lane, Austin";
    const prefix = /^The card shows the address's first line\./;

    it("accepts any address while there is a venue name", () => {
      expect(
        cardTextFieldError("address", "Łukasz 🎈 Lane", { venueName: "The Willow House" }),
      ).toBeNull();
      expect(
        cardTextFieldErrors({ address: badAddress }, { venueName: "The Willow House" }),
      ).toBeNull();
      expect(
        cardTextFieldErrors({ venueName: "The Willow House", address: badAddress }, {}),
      ).toBeNull();
    });

    it("checks the address without a venue name", () => {
      expect(cardTextFieldError("address", badAddress, { venueName: "  " })).toMatch(prefix);
      expect(cardTextFieldErrors({ address: badAddress }, { venueName: null })).toEqual({
        address: expect.stringMatching(prefix),
      });
      expect(cardTextFieldErrors({ venueName: "", address: badAddress }, {})).toEqual({
        address: expect.stringMatching(prefix),
      });
    });

    it("refuses clearing the venue name when the stored address cannot be shown", () => {
      expect(
        cardTextFieldErrors({ venueName: "" }, { venueName: "Old", address: badAddress }),
      ).toEqual({ venueName: VENUE_CLEARED_MESSAGE });
      expect(cardTextFieldErrors({ venueName: null }, { address: badAddress })).toEqual({
        venueName: VENUE_CLEARED_MESSAGE,
      });
      expect(cardTextFieldError("venueName", "", { address: badAddress })).toBe(
        VENUE_CLEARED_MESSAGE,
      );
    });

    it("accepts clearing the venue name when the stored address is fine", () => {
      expect(cardTextFieldErrors({ venueName: "" }, { address: "12 Elm St, Austin" })).toBeNull();
      expect(cardTextFieldErrors({ venueName: "" }, { address: null })).toBeNull();
    });
  });
});
