import { describe, expect, it } from "vitest";

import { statedTitle, statedTitleSpan, withoutQuotes } from "./stated-title.server";

/**
 * The stated-title guard (owner decisions, 2026-10-06; `docs/model-contracts.md §4.3`): fact
 * extraction decides what is a title; code keeps one only where the prompt names it — in quotation
 * marks or right after called/named/titled — verbatim, without its quotation marks, and only if a
 * typed title would be accepted (the entry and fit checks).
 */

const NOTORIOUS =
  "The whole idea is “The Notorious ONE”—a little legend turning one. I want the invitation to feel like a beautifully designed ’90s hip-hop album cover with a playful first-birthday twist.";

describe("statedTitleSpan", () => {
  it("keeps a title in curly quotation marks, with or without them in the extraction", () => {
    expect(statedTitleSpan(NOTORIOUS, "“The Notorious ONE”")).toEqual({
      title: "The Notorious ONE",
    });
    expect(statedTitleSpan(NOTORIOUS, "The Notorious ONE")).toEqual({
      title: "The Notorious ONE",
    });
  });

  it("keeps a title in straight quotation marks, single or double", () => {
    expect(statedTitleSpan('we are calling it "Little Legend"', "Little Legend")).toEqual({
      title: "Little Legend",
    });
    expect(statedTitleSpan("her dinner, 'The Last Bell', at home", "'The Last Bell'")).toEqual({
      title: "The Last Bell",
    });
  });

  it("keeps a title in guillemets and low quotation marks", () => {
    expect(statedTitleSpan("un brunch «Petit Soleil» au jardin", "Petit Soleil")).toEqual({
      title: "Petit Soleil",
    });
    expect(statedTitleSpan("ein Fest „Kleiner Stern“ bitte", "Kleiner Stern")).toEqual({
      title: "Kleiner Stern",
    });
  });

  it("keeps an apostrophe inside the title", () => {
    const prompt = "we're calling it “Taco ’Bout a Baby”, bright and fun";
    expect(statedTitleSpan(prompt, "“Taco ’Bout a Baby”")).toEqual({
      title: "Taco ’Bout a Baby",
    });
    expect(statedTitleSpan("a shower called 'Taco 'Bout a Baby'", "Taco 'Bout a Baby")).toEqual({
      title: "Taco 'Bout a Baby",
    });
  });

  it("keeps a title right after called, named or titled, in any case", () => {
    for (const word of ["called", "named", "titled", "Called", "TITLED"]) {
      expect(
        statedTitleSpan(`a garden party ${word} Tea at Two Willows for Mum`, "Tea at Two Willows"),
      ).toEqual({ title: "Tea at Two Willows" });
    }
    expect(statedTitleSpan("an evening titled: Moon Over Maple", "Moon Over Maple")).toEqual({
      title: "Moon Over Maple",
    });
  });

  it("does not read a so-called phrase as a name the host gives", () => {
    expect(statedTitleSpan("the so-called Big Day for the twins", "Big Day")).toEqual({
      dropped: "not-named",
    });
  });

  it("rejects an unquoted phrase that no naming word introduces", () => {
    expect(statedTitleSpan(NOTORIOUS, "a little legend")).toEqual({ dropped: "not-named" });
    expect(statedTitleSpan("a renamed Little Legend party", "Little Legend")).toEqual({
      dropped: "not-named",
    });
  });

  it("rejects a title that is not verbatim in the prompt", () => {
    expect(statedTitleSpan(NOTORIOUS, "The Notorious One")).toEqual({ dropped: "not-verbatim" });
    expect(statedTitleSpan(NOTORIOUS, "Notorious ONE Party")).toEqual({ dropped: "not-verbatim" });
    expect(statedTitleSpan(NOTORIOUS, "“”")).toEqual({ dropped: "not-verbatim" });
  });

  it("never keeps a fragment cut out of a longer word", () => {
    expect(statedTitleSpan('a "Legendary" night', "Legend")).toEqual({ dropped: "not-verbatim" });
  });

  it("matches across Unicode normalization forms", () => {
    const decomposed = "a brunch called Café Soleil".normalize("NFD");
    expect(statedTitleSpan(decomposed, "Café Soleil")).toEqual({ title: "Café Soleil" });
  });
});

describe("withoutQuotes", () => {
  it("strips one pair of surrounding quotation marks and nothing else", () => {
    expect(withoutQuotes(" “The Notorious ONE” ")).toBe("The Notorious ONE");
    expect(withoutQuotes("’Twas the Night")).toBe("’Twas the Night");
    expect(withoutQuotes("Taco ’Bout a Baby")).toBe("Taco ’Bout a Baby");
  });
});

describe("statedTitle", () => {
  it("keeps a named title that a typed title would pass with", async () => {
    expect(await statedTitle(NOTORIOUS, "“The Notorious ONE”")).toEqual({
      title: "The Notorious ONE",
      dropped: null,
    });
  });

  it("returns nothing for no extracted title", async () => {
    expect(await statedTitle(NOTORIOUS, null)).toEqual({ title: null, dropped: null });
    expect(await statedTitle(NOTORIOUS, "  ")).toEqual({ title: null, dropped: null });
  });

  it("drops one the prompt does not name, with the reason", async () => {
    expect(await statedTitle(NOTORIOUS, "a little legend")).toEqual({
      title: null,
      dropped: "not-named",
    });
  });

  it("drops one that fails the entry check: over the limit, or characters the card cannot draw", async () => {
    const long = "The Most Notorious and Legendary First Birthday Ever";
    expect(await statedTitle(`a party called "${long}"`, long)).toEqual({
      title: null,
      dropped: "entry",
    });
    expect(
      await statedTitle('a party called "Little \u{1F451} Legend"', "Little \u{1F451} Legend"),
    ).toEqual({ title: null, dropped: "entry" });
  });

  it("drops one that fails the fit check", async () => {
    // Forty characters of wide capitals: within the limit, but not every design can fit it
    // (docs/card-system.md §2.5).
    const wide = "WELCOME WILHELMINA MONTGOMERY-WHITWORTH!";
    expect(await statedTitle(`a party called "${wide}"`, wide)).toEqual({
      title: null,
      dropped: "fit",
    });
  });
});
