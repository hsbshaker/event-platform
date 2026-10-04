import { describe, expect, it } from "vitest";

import { breakLines } from "./line-break";

/** A monospace measure: 10 units per character. */
const mono = (line: string) => line.length * 10;

describe("breakLines", () => {
  it("gives no lines for empty or blank text", () => {
    expect(breakLines("", 100, mono)).toEqual({ lines: [], widths: [], overflow: false });
    expect(breakLines("  \n \t ", 100, mono).lines).toEqual([]);
  });

  it("keeps a line that fits whole and collapses whitespace", () => {
    expect(breakLines("  Hello   there ", 200, mono).lines).toEqual(["Hello there"]);
  });

  it("uses the fewest lines, balanced rather than greedy", () => {
    // Greedy would give "aaa bbb ccc" / "ddd"; balanced keeps two lines of equal width.
    expect(breakLines("aaa bbb ccc ddd", 110, mono).lines).toEqual(["aaa bbb", "ccc ddd"]);
    // Three lines are needed; they come out even.
    expect(breakLines("one two six ten red tan", 80, mono).lines).toEqual([
      "one two",
      "six ten",
      "red tan",
    ]);
  });

  it("never leaves a one-word last line where another break exists", () => {
    // Balance alone would choose "aa bb" / "cccccccc" (slack 60 and 30); the rule wins.
    expect(breakLines("aa bb cccccccc", 110, mono).lines).toEqual(["aa", "bb cccccccc"]);
    // ... but never at the cost of an extra line.
    expect(breakLines("aa bb cccccccc", 90, mono).lines).toEqual(["aa bb", "cccccccc"]);
  });

  it("accepts a one-word last line when it is the only break", () => {
    expect(breakLines("Hello world", 60, mono).lines).toEqual(["Hello", "world"]);
  });

  it("never breaks inside a word; a word wider than the line overflows on its own line", () => {
    const result = breakLines("A Supercalifragilistic party", 100, mono);
    expect(result.lines).toEqual(["A", "Supercalifragilistic", "party"]);
    expect(result.overflow).toBe(true);
    expect(result.lines.join(" ")).toBe("A Supercalifragilistic party");
  });

  it("keeps hyphenated names and no-break spaces together", () => {
    expect(breakLines("Okonkwo-Fitzgerald family", 190, mono).lines).toEqual([
      "Okonkwo-Fitzgerald",
      "family",
    ]);
    expect(breakLines("Maya Okafor and Tom", 130, mono).lines).toEqual(["Maya Okafor", "and Tom"]);
  });

  it("honours hard breaks the host typed, keeping an interior blank line", () => {
    expect(breakLines("Line one\nLine two", 1000, mono).lines).toEqual(["Line one", "Line two"]);
    expect(breakLines("A\r\n\r\nB\rC D", 1000, mono).lines).toEqual(["A", "", "B", "C", "D"]);
    expect(breakLines("\n\nTitle\n\n", 1000, mono).lines).toEqual(["Title"]);
  });

  it("reports the measured width of every line", () => {
    const result = breakLines("aaa bbb ccc ddd", 110, mono);
    expect(result.widths).toEqual([70, 70]);
  });

  it("refuses a non-positive width", () => {
    expect(() => breakLines("a", 0, mono)).toThrow();
  });

  it("holds its rules for random text (property)", () => {
    let seed = 1;
    const r = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    // A proportional-ish measure: each character weighs 6–14 units by its code.
    const prop = (line: string) => [...line].reduce((s, ch) => s + 6 + (ch.charCodeAt(0) % 9), 0);
    for (let run = 0; run < 300; run += 1) {
      const words = Array.from({ length: 1 + Math.floor(r() * 14) }, () =>
        "abcdefghijklmnopqrstuvwxyz".slice(0, 1 + Math.floor(r() * 12)),
      );
      const maxWidth = 40 + Math.floor(r() * 300);
      const result = breakLines(words.join(" "), maxWidth, prop);
      // Nothing lost, nothing split.
      expect(result.lines.join(" ").split(" ")).toEqual(words);
      // Every multi-word line fits; overflow only for a lone over-wide word.
      for (const line of result.lines) {
        if (line.includes(" ")) expect(prop(line)).toBeLessThanOrEqual(maxWidth);
      }
      expect(result.overflow).toBe(words.some((w) => prop(w) > maxWidth));
      // The fewest lines: no more than greedy filling needs.
      let greedy = 0;
      let current = "";
      for (const w of words) {
        const next = current ? `${current} ${w}` : w;
        if (current && prop(next) > maxWidth) {
          greedy += 1;
          current = w;
        } else current = next;
      }
      greedy += 1;
      expect(result.lines.length).toBe(greedy);
      // Deterministic.
      expect(breakLines(words.join(" "), maxWidth, prop)).toEqual(result);
    }
  });
});
