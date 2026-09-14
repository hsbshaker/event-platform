/**
 * Where a staggered or cascaded title breaks.
 *
 * The cases are the ones Human Test #1 reviewers named
 * (`docs/human-test-1/qualitative-findings.md`, F1, mechanisms M1-M2, screens 01/06/20/25/27) plus
 * the shapes that must keep working. Every assertion is about the *words*, never about pixels:
 * fitting is the geometry verifier's job and is tested against a browser elsewhere.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` ("Every structural
 * rule ... is validated and repaired deterministically"); `spec.md §32` #19, #21.
 */

import { describe, expect, it } from "vitest";

import { MAX_TITLE_LINES, titleLines } from "./title-lines";

/** Words survive exactly, in order — the event's own copy (`event-renderer-system.md §2.2`). */
function preservesWords(title: string): boolean {
  return titleLines(title).join(" ") === title.trim().replace(/\s+/g, " ");
}

const FUNCTION_ONLY =
  /^(?:a|an|and|are|as|at|be|by|for|from|in|is|it|of|on|or|our|the|their|to|with|&)(?:\s+(?:a|an|and|are|as|at|be|by|for|from|in|is|it|of|on|or|our|the|their|to|with|&))*$/i;

describe("the title line breaker", () => {
  it("never strands a line of nothing but connectives — the screen 20/27 defect", () => {
    // The old fixed split gave ["Baby Shaker", "is on", "the way"] and the treatment then threw
    // "is on" to the opposite margin.
    const lines = titleLines("Baby Shaker is on the way");
    expect(lines).toEqual(["Baby Shaker", "is on the way"]);
    for (const line of lines) expect(line).not.toMatch(FUNCTION_ONLY);
  });

  it("does not break after a preposition or article", () => {
    expect(titleLines("An Evening of Music and Light")).toEqual([
      "An Evening",
      "of Music and Light",
    ]);
    expect(titleLines("A Baby Shower for Our Little Boy")).toEqual([
      "A Baby Shower",
      "for Our Little Boy",
    ]);
  });

  it("leaves a title that fits on one line alone", () => {
    // Breaking a short title to satisfy a treatment is the same artifact the treatment avoids.
    expect(titleLines("Maya & Tom")).toEqual(["Maya & Tom"]);
    expect(titleLines("Sunday Supper")).toEqual(["Sunday Supper"]);
    expect(titleLines("Celebrate")).toEqual(["Celebrate"]);
  });

  it("never orphans a single short word on the last line", () => {
    for (const title of [
      "Baby Shaker is on the way",
      "The Wedding of Alice and Robert Hastings",
      "Join us for the Hanson Park Harvest Dinner",
      "Marissa and Eren are getting married",
      "A Baby Shower for Our Little Boy",
    ]) {
      const lines = titleLines(title);
      if (lines.length < 2) continue;
      const last = lines[lines.length - 1]!;
      const mean = lines.reduce((a, l) => a + l.length, 0) / lines.length;
      expect(last.split(" ").length > 1 || last.length >= mean * 0.55).toBe(true);
    }
  });

  it("stays within the §3.1 line limit and never emits an empty line", () => {
    for (const title of [
      "Baby Shaker is on the way",
      "Marissa Aleksandrova and Erenhardt Kristoffersen are finally getting married",
      "The Wedding of Alice and Robert Hastings",
      "A",
      "",
      "   spaced   out   title   here   ",
    ]) {
      const lines = titleLines(title);
      expect(lines.length).toBeLessThanOrEqual(MAX_TITLE_LINES);
      for (const line of lines) expect(line.trim()).not.toBe("");
    }
  });

  it("preserves the host's words exactly, in order", () => {
    for (const title of [
      "Baby Shaker is on the way",
      "Maya & Tom",
      "  Ruth's   80th  ",
      "The Wedding of Alice and Robert Hastings",
      "Marissa Aleksandrova and Erenhardt Kristoffersen are finally getting married",
    ]) {
      expect(preservesWords(title), title).toBe(true);
    }
  });

  it("is deterministic and pure", () => {
    const title = "The Wedding of Alice and Robert Hastings";
    expect(titleLines(title)).toEqual(titleLines(title));
  });

  it("handles degenerate input without throwing", () => {
    expect(titleLines("")).toEqual([]);
    expect(titleLines("   ")).toEqual([]);
    expect(titleLines("Supercalifragilisticexpialidocious")).toEqual([
      "Supercalifragilisticexpialidocious",
    ]);
  });

  it("honours a caller's lower cap", () => {
    const long = "Marissa Aleksandrova and Erenhardt Kristoffersen are finally getting married";
    expect(titleLines(long, 2)).toHaveLength(2);
    expect(titleLines(long, 2).join(" ")).toBe(long);
  });
});
