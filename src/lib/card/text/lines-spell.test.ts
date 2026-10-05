import { describe, expect, it } from "vitest";

import { breakLines, linesSpell } from "./line-break";

/**
 * `linesSpell`: whether stored lines are a breaking of a text, so a reader can tell lines broken
 * from other words (a fact or title changed since) from current ones (`docs/card-system.md §7`).
 */

/** A monospace measure: 10 units per character. */
const mono = (line: string) => line.length * 10;

describe("linesSpell", () => {
  it("accepts exactly the lines breakLines gives, for any width", () => {
    const texts = [
      "A Little Wild One",
      "Hosted by Maya & Tom",
      "Ann Montgomery-Whitworth Lee",
      "  Spaces   everywhere\there  ",
      "First line\n\nThird line after a blank one",
      "Wilhelmina Montgomery-Whitworth-Smythe",
      "Windows\r\nline ends",
      "",
    ];
    for (const text of texts) {
      for (const width of [30, 60, 90, 140, 400]) {
        const { lines } = breakLines(text, width, mono);
        expect(linesSpell(lines, text), `${text} @ ${width}`).toBe(true);
      }
    }
  });

  it("refuses lines broken from other words", () => {
    expect(linesSpell(["Saturday, June 6"], "Saturday, June 13")).toBe(false);
    expect(linesSpell(["Saturday,", "June 6"], "Sunday, June 6")).toBe(false);
    expect(linesSpell([], "Venue to be announced")).toBe(false);
    expect(linesSpell(["The Willow House"], "")).toBe(false);
    // A word lost, or one added.
    expect(linesSpell(["A Little"], "A Little Wild One")).toBe(false);
    expect(linesSpell(["A Little", "Wild One", "Too"], "A Little Wild One")).toBe(false);
  });

  it("accepts no lines for no words", () => {
    expect(linesSpell([], "")).toBe(true);
    expect(linesSpell([], "  \n ")).toBe(true);
  });

  it("allows a break inside a word only just after a hyphen between letters", () => {
    expect(linesSpell(["Montgomery-", "Whitworth"], "Montgomery-Whitworth")).toBe(true);
    expect(linesSpell(["Montgo", "mery"], "Montgomery")).toBe(false);
    expect(linesSpell(["12:30-", "4:45"], "12:30-4:45")).toBe(false);
    // A space after the hyphen is an ordinary space break.
    expect(linesSpell(["Montgomery-", "Whitworth"], "Montgomery- Whitworth")).toBe(true);
    // A space is never dropped.
    expect(linesSpell(["AnnLee"], "Ann Lee")).toBe(false);
  });

  it("keeps paragraphs: hard breaks and blank lines between them", () => {
    expect(linesSpell(["One", "", "Two"], "One\n\nTwo")).toBe(true);
    expect(linesSpell(["One", "Two"], "One\n\nTwo")).toBe(false);
    expect(linesSpell(["One Two"], "One\nTwo")).toBe(false);
    // Leading and trailing blank lines are not kept, as breakLines drops them.
    expect(linesSpell(["One"], "\n\nOne\n")).toBe(true);
  });

  it("refuses untrimmed or empty lines inside a paragraph", () => {
    expect(linesSpell([" One"], "One")).toBe(false);
    expect(linesSpell(["One", ""], "One")).toBe(false);
    expect(linesSpell(["One ", "Two"], "One Two")).toBe(false);
  });

  it("compares the text's own case, not the drawn case", () => {
    expect(linesSpell(["Saturday, June 6"], "Saturday, June 6")).toBe(true);
    expect(linesSpell(["SATURDAY, JUNE 6"], "Saturday, June 6")).toBe(false);
  });
});
