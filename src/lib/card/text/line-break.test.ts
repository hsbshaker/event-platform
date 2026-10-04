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

  it("never breaks inside an unhyphenated word; one wider than the line overflows alone", () => {
    const result = breakLines("A Supercalifragilistic party", 100, mono);
    expect(result.lines).toEqual(["A", "Supercalifragilistic", "party"]);
    expect(result.overflow).toBe(true);
    expect(result.lines.join(" ")).toBe("A Supercalifragilistic party");
  });

  it("prefers a space to a hyphen, and keeps no-break spaces together", () => {
    // A hyphen break would avoid the one-word last line, but a space break ranks first.
    expect(breakLines("Okonkwo-Fitzgerald family", 190, mono).lines).toEqual([
      "Okonkwo-Fitzgerald",
      "family",
    ]);
    expect(breakLines("Maya Okafor and Tom", 130, mono).lines).toEqual(["Maya Okafor", "and Tom"]);
  });

  it("breaks after a hyphen between letters when that saves a line, keeping the hyphen", () => {
    // Too wide for one line; the hyphen is the only opportunity.
    expect(breakLines("Montgomery-Whitworth", 120, mono)).toEqual({
      lines: ["Montgomery-", "Whitworth"],
      widths: [110, 90],
      overflow: false,
    });
    // The double-barrelled name is wider than the line, so one of its hyphens must break; the
    // first one keeps the lines to two.
    expect(breakLines("Hosted by Okonkwo-Fitzgerald-Smith", 200, mono).lines).toEqual([
      "Hosted by Okonkwo-",
      "Fitzgerald-Smith",
    ]);
    // Several hyphens: only the breaks needed are taken, and the lines stay balanced.
    expect(breakLines("Anne-Marie-Louise-Claire", 140, mono).lines).toEqual([
      "Anne-Marie-",
      "Louise-Claire",
    ]);
    // HYPHEN (U+2010) breaks too.
    expect(breakLines("Montgomery\u2010Whitworth", 120, mono).lines).toEqual([
      "Montgomery\u2010",
      "Whitworth",
    ]);
  });

  it("never breaks at a hyphen that is not between letters, or anywhere else in a word", () => {
    expect(breakLines("x-ray", 30, mono).lines).toEqual(["x-", "ray"]);
    for (const text of [
      "12:30-4:45pm",
      "Smith-2026",
      "2026-Smith",
      "Anne\u2011Marie", // NON-BREAKING HYPHEN
      "Anne\u2013Marie", // EN DASH
      "Anne/Marie",
      "Anne--Marie",
    ]) {
      expect(breakLines(text, 30, mono)).toMatchObject({ lines: [text], overflow: true });
    }
    // A hyphen beside a space is not between letters; the space breaks.
    expect(breakLines("Anne - Marie", 60, mono).lines).toEqual(["Anne -", "Marie"]);
  });

  it("reports overflow for one piece of a hyphenated word wider than the line", () => {
    const result = breakLines("Supercalifragilistic-party", 100, mono);
    expect(result.lines).toEqual(["Supercalifragilistic-", "party"]);
    expect(result.overflow).toBe(true);
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

  it("holds its rules for random hyphenated text (property)", () => {
    let seed = 7;
    const r = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const prop = (line: string) => [...line].reduce((s, ch) => s + 6 + (ch.charCodeAt(0) % 9), 0);
    const letters = "abcdefghijklmnopqrstuvwxyz";
    for (let run = 0; run < 300; run += 1) {
      // Words of one to three hyphen-joined parts.
      const words = Array.from({ length: 1 + Math.floor(r() * 8) }, () =>
        Array.from({ length: 1 + Math.floor(r() * 3) }, () =>
          letters.slice(Math.floor(r() * 10), 11 + Math.floor(r() * 8)),
        ).join("-"),
      );
      const pieces = words.flatMap((w) =>
        w.split("-").map((part, k, all) => (k < all.length - 1 ? `${part}-` : part)),
      );
      const maxWidth = 60 + Math.floor(r() * 300);
      const text = words.join(" ");
      const result = breakLines(text, maxWidth, prop);
      // Nothing lost: each break is at a space or just after a hyphen.
      let rebuilt = result.lines[0];
      for (const line of result.lines.slice(1)) {
        rebuilt += rebuilt.endsWith("-") && text.startsWith(rebuilt + line) ? line : ` ${line}`;
      }
      expect(rebuilt).toBe(text);
      // Every line fits unless it is one over-wide piece.
      for (const line of result.lines) {
        if (!pieces.includes(line)) expect(prop(line)).toBeLessThanOrEqual(maxWidth);
      }
      expect(result.overflow).toBe(pieces.some((p) => prop(p) > maxWidth));
      // Never more lines than greedy filling over every break opportunity.
      let greedy = 0;
      let current = "";
      words.forEach((w, wi) => {
        w.split("-").forEach((part, k, all) => {
          const piece = k < all.length - 1 ? `${part}-` : part;
          const joiner = current === "" ? "" : k === 0 && wi > 0 ? " " : "";
          const next = current + joiner + piece;
          if (current && prop(next) > maxWidth) {
            greedy += 1;
            current = piece;
          } else current = next;
        });
      });
      greedy += 1;
      expect(result.lines.length).toBeLessThanOrEqual(greedy);
      // No hyphen break where spaces alone give the same number of lines without overflow.
      // (U+2011 never breaks; measured as a hyphen so only the break opportunities differ.)
      const asHyphen = (line: string) => prop(line.replaceAll("\u2011", "-"));
      const spacesOnly = breakLines(text.replaceAll("-", "\u2011"), maxWidth, asHyphen);
      if (!spacesOnly.overflow && spacesOnly.lines.length === result.lines.length) {
        expect(result.lines.map((l) => l.replaceAll("-", "\u2011"))).toEqual(spacesOnly.lines);
      }
    }
  });
});
