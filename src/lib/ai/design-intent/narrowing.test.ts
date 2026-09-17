/**
 * Runtime narrowing, and its reconciliation with the planner's own.
 *
 * `docs/model-contracts.md §5.2` narrows the allowed output to the sibling's assignment **before**
 * the call, so an out-of-assignment value is structurally impossible rather than accepted and then
 * repaired. Two things have to hold for that to mean anything: the narrowed pool is never empty
 * for an assignment the planner can actually produce, and it never offers a value the planner
 * excluded.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`, first bullet;
 * `§31 — Event Identity and diversity` ("Siblings never share an identical DesignIntent").
 * Plan: `docs/phase-4b-plan.md §E`, T18.
 */
import { describe, expect, it } from "vitest";

import { assignmentFor, emptyAvoidList, type SiblingAssignment } from "@/lib/renderer/planner";
import {
  FAMILIES,
  FAMILY_KEYS,
  TYPOGRAPHY,
  TYPOGRAPHY_KEYS,
  type Family,
  type Hierarchy,
  type TypographyCategory,
  type TypographyPairingId,
} from "@/lib/renderer/vocabulary";

import {
  allowedHierarchies,
  allowedPairings,
  narrowingFor,
  pairingsExcludedByCategory,
  UnnarrowableAssignmentError,
} from "./narrowing";

/** The planner's own filter, restated here only so the enumeration can reproduce its pools. */
const plannerPairings = (
  category: TypographyCategory,
  hierarchy: Hierarchy,
): TypographyPairingId[] => {
  const inCategory = TYPOGRAPHY_KEYS.filter(
    (k) =>
      TYPOGRAPHY[k].category === category &&
      (hierarchy !== "monumental" || TYPOGRAPHY[k].holdsAtMonumental),
  );
  return inCategory.length
    ? inCategory
    : TYPOGRAPHY_KEYS.filter((k) => TYPOGRAPHY[k].holdsAtMonumental);
};

/**
 * Every assignment `assignmentFor` can emit, derived rather than sampled.
 *
 * The planner draws family, then hierarchy from that family, then a category from that family,
 * then resolves `typographyCategory` from a seeded pick inside the pairing pool. On the fallback
 * path the pool spans several categories, so *each* of them is a reachable resolved category and
 * all of them are enumerated.
 */
function reachableAssignments(): SiblingAssignment[] {
  const out: SiblingAssignment[] = [];
  for (const family of FAMILY_KEYS) {
    for (const hierarchy of FAMILIES[family].hierarchies) {
      for (const drawn of FAMILIES[family].categories) {
        const pairings = plannerPairings(drawn, hierarchy);
        for (const resolved of new Set(pairings.map((p) => TYPOGRAPHY[p].category))) {
          out.push({
            family,
            tonalDirection: "mid",
            typographyCategory: resolved,
            hierarchy,
            typographyPairings: pairings,
          });
        }
      }
    }
  }
  return out;
}

const REACHABLE = reachableAssignments();

describe("hierarchy narrowing", () => {
  it("is §5.2's rule, read off the family table rather than restated", () => {
    expect(allowedHierarchies({ family: "invitation" } as SiblingAssignment)).not.toContain(
      "monumental",
    );
    expect([...allowedHierarchies({ family: "statement" } as SiblingAssignment)]).toEqual([
      "dramatic",
      "monumental",
    ]);
    expect(allowedHierarchies({ family: "editorial" } as SiblingAssignment)).toHaveLength(4);
  });

  it("always admits the hierarchy the planner assigned", () => {
    for (const assignment of REACHABLE)
      expect(
        allowedHierarchies(assignment),
        `${assignment.family}/${assignment.hierarchy}`,
      ).toContain(assignment.hierarchy);
  });
});

describe("pairing narrowing", () => {
  it("offers only pairings in the assigned category that hold at the assigned hierarchy", () => {
    for (const assignment of REACHABLE) {
      const allowed = allowedPairings(assignment);
      expect(allowed.length).toBeGreaterThan(0);
      for (const pairing of allowed) {
        expect(TYPOGRAPHY[pairing].category).toBe(assignment.typographyCategory);
        if (assignment.hierarchy === "monumental")
          expect(TYPOGRAPHY[pairing].holdsAtMonumental, pairing).toBe(true);
      }
    }
  });

  it("never offers a pairing the planner excluded", () => {
    // Subset, not equality: this is the reconciliation. The narrowed pool is derived *from* the
    // planner's list, so a value the planner never allowed cannot appear here however the
    // category and hierarchy rules are read.
    for (const assignment of REACHABLE)
      for (const pairing of allowedPairings(assignment))
        expect(assignment.typographyPairings).toContain(pairing);
  });

  it("is never empty for an assignment the planner can produce", () => {
    // The load-bearing claim of the reconciliation: taking the intersection cannot leave the model
    // with nothing legal to say. Checked over the derived space above and, separately, over the
    // planner's real seeded output, so the enumeration cannot be wrong in the same way twice.
    expect(REACHABLE.length).toBeGreaterThan(30);
    for (let seed = 0; seed < 4000; seed++) {
      const assignment = assignmentFor(seed, emptyAvoidList());
      expect(allowedPairings(assignment).length, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it("refuses an assignment that leaves nothing legal, rather than widening it", () => {
    // Hand-built, not planner-produced: oldstyle holds at no monumental hierarchy at all.
    const impossible: SiblingAssignment = {
      family: "editorial",
      tonalDirection: "mid",
      typographyCategory: "oldstyle",
      hierarchy: "monumental",
      typographyPairings: ["oldstyle_garamond_worksans", "oldstyle_cormorant_figtree"],
    };
    expect(() => allowedPairings(impossible)).toThrow(UnnarrowableAssignmentError);
    // And the failure is visible rather than a silent fall back to the full catalogue.
    expect(() => narrowingFor(impossible)).toThrow(/cannot be narrowed/);
  });
});

describe("where the planner's narrowing and canon's disagree", () => {
  /**
   * `docs/model-contracts.md §5.1` requires the pairing to be "in the assigned category" and
   * `§5.2` filters "by category and by whether they hold at the assigned hierarchy". The planner
   * satisfies the second and, on one path, not the first. That divergence is pinned here so it is
   * a recorded defect rather than something a later reader rediscovers.
   */
  it("is exactly the editorial + monumental + oldstyle fallback, and nowhere else", () => {
    const diverging = REACHABLE.filter((a) => pairingsExcludedByCategory(a).length > 0);
    expect(diverging.length).toBeGreaterThan(0);
    for (const assignment of diverging) {
      expect(assignment.hierarchy).toBe("monumental");
      // The pool the planner fell back to is every monumental-capable pairing, which spans five
      // categories — so it is broader than the category it emitted beside it.
      expect(assignment.typographyPairings).toHaveLength(10);
      expect(
        new Set(assignment.typographyPairings.map((p) => TYPOGRAPHY[p].category)).size,
      ).toBeGreaterThan(1);
    }
    // Only `editorial` admits both `monumental` and the `oldstyle` category.
    const families = new Set(diverging.map((a) => a.family));
    expect([...families]).toEqual(["editorial" satisfies Family]);
  });

  it("resolves toward canon: the excluded pairings are not offered to the model", () => {
    for (const assignment of REACHABLE) {
      const excluded = pairingsExcludedByCategory(assignment);
      const allowed = allowedPairings(assignment);
      for (const pairing of excluded) expect(allowed).not.toContain(pairing);
    }
  });
});

describe("narrowingFor", () => {
  it("pins family and tone to the assignment, and nothing else to a single value", () => {
    const assignment = assignmentFor(7, emptyAvoidList());
    const narrowing = narrowingFor(assignment);
    expect(narrowing.families).toEqual([assignment.family]);
    expect(narrowing.tones).toEqual([assignment.tonalDirection]);
    // `composition.hierarchy` is narrowed by family, not to the assigned hierarchy: it is one of
    // the five diversity-measurable composition dimensions (`docs/phase-4b-plan.md §E`).
    expect(narrowing.hierarchies).toEqual([...FAMILIES[assignment.family].hierarchies]);
  });
});
