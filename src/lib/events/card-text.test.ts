import { describe, expect, it } from "vitest";

import { CARD_TEXT_FIELDS, cardTextFieldError, cardTextFieldErrors } from "./card-text";

describe("card text fields", () => {
  it("maps the details the card shows verbatim to their card slots", () => {
    expect(CARD_TEXT_FIELDS).toEqual({
      title: "title",
      hosts: "hosts",
      babyName: "babyName",
      venueName: "venue",
    });
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
});
