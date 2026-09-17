/**
 * Runtime narrowing, and its relationship to the planner's own.
 *
 * `docs/model-contracts.md §5.2` narrows the allowed output to the sibling's assignment **before**
 * the call, so an out-of-assignment value is structurally impossible rather than accepted and then
 * repaired. Three things have to hold for that to mean anything: the narrowed pool is never empty
 * for an assignment the planner can actually produce, it never offers a value the planner
 * excluded, and — since `planner_v2` — it never has to *discard* one either.
 *
 * That last one is the change this file now pins. `planner_v1` could emit a `typographyPairings`
 * list broader than the `typographyCategory` beside it, and these tests recorded that divergence
 * as expected behaviour. The planner owns the assignment and now emits a coherent one, so the
 * tests pin its **absence** under production output, and keep the guard honest by showing what it
 * still catches elsewhere.
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

/** Every non-empty subset of the six categories — the range a brief's compatible set can take. */
const CATEGORY_SUBSETS: TypographyCategory[][] = (() => {
  const all = [...new Set(FAMILY_KEYS.flatMap((f) => [...FAMILIES[f].categories]))];
  const out: TypographyCategory[][] = [];
  for (let mask = 1; mask < 1 << all.length; mask++)
    out.push(all.filter((_, i) => mask & (1 << i)));
  return out;
})();

/**
 * The production planner's pairing pool, restated here only so the enumeration can reproduce it.
 *
 * `src/lib/generation/planner.test.ts` is where this is checked against the planner's real seeded
 * output, over the same space and by set equality; this file consumes the space rather than
 * re-proving it.
 */
const productionPairings = (
  drawn: TypographyCategory,
  hierarchy: Hierarchy,
  compatible: readonly TypographyCategory[],
): TypographyPairingId[] => {
  const holds = (k: TypographyPairingId) =>
    hierarchy !== "monumental" || TYPOGRAPHY[k].holdsAtMonumental;
  let pool = TYPOGRAPHY_KEYS.filter((k) => TYPOGRAPHY[k].category === drawn && holds(k));
  if (!pool.length)
    pool = TYPOGRAPHY_KEYS.filter((k) => holds(k) && compatible.includes(TYPOGRAPHY[k].category));
  if (!pool.length) pool = TYPOGRAPHY_KEYS.filter(holds);
  return [...pool];
};

/**
 * Every assignment the **production** planner can emit, derived rather than sampled.
 *
 * It draws family, then hierarchy from that family, then a category from that family narrowed by
 * the brief, then resolves `typographyCategory` from a seeded pick inside the pairing pool — and
 * then narrows the pool to that resolved category. On the fallback path the pool before that
 * narrowing spans several categories, so each of them is a reachable resolved category and all of
 * them are enumerated.
 */
function reachableAssignments(): SiblingAssignment[] {
  const seen = new Map<string, SiblingAssignment>();
  for (const family of FAMILY_KEYS) {
    for (const compatible of CATEGORY_SUBSETS) {
      const inFamily = FAMILIES[family].categories.filter((c) => compatible.includes(c));
      const drawable = inFamily.length ? inFamily : FAMILIES[family].categories;
      for (const hierarchy of FAMILIES[family].hierarchies) {
        for (const drawn of drawable) {
          const pool = productionPairings(drawn, hierarchy, compatible);
          for (const resolved of new Set(pool.map((p) => TYPOGRAPHY[p].category))) {
            const typographyPairings = pool.filter((p) => TYPOGRAPHY[p].category === resolved);
            const assignment: SiblingAssignment = {
              family,
              tonalDirection: "mid",
              typographyCategory: resolved,
              hierarchy,
              typographyPairings,
            };
            seen.set(
              `${family}|${hierarchy}|${resolved}|${typographyPairings.join(",")}`,
              assignment,
            );
          }
        }
      }
    }
  }
  return [...seen.values()];
}

const REACHABLE = reachableAssignments();

/** The frozen Phase 3 reference planner's output, which is a different and broader set. */
const REFERENCE = Array.from({ length: 4000 }, (_, seed) => assignmentFor(seed, emptyAvoidList()));

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
    // Subset, not equality by construction: the narrowed pool is derived *from* the planner's
    // list, so a value the planner never allowed cannot appear here however the category and
    // hierarchy rules are read.
    for (const assignment of REACHABLE)
      for (const pairing of allowedPairings(assignment))
        expect(assignment.typographyPairings).toContain(pairing);
  });

  it("is never empty for an assignment the planner can produce", () => {
    // Taking the planner's list cannot leave the model with nothing legal to say. Checked over the
    // derived space above and, separately, over the reference planner's real seeded output, so the
    // enumeration cannot be wrong in the same way twice.
    expect(REACHABLE.length).toBeGreaterThan(30);
    for (const [seed, assignment] of REFERENCE.entries())
      expect(allowedPairings(assignment).length, `seed ${seed}`).toBeGreaterThan(0);
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

describe("the category guard", () => {
  /**
   * `docs/model-contracts.md §5.1` requires the pairing to be "in the assigned category" and
   * `§5.2` filters "by category and by whether they hold at the assigned hierarchy". `planner_v1`
   * satisfied the second and, on one path, not the first; `planner_v2` satisfies both, so the
   * guard has nothing to remove from production output. Its absence is pinned here, in the file
   * that used to pin its presence.
   */
  it("finds nothing to exclude in any assignment the production planner can emit", () => {
    for (const assignment of REACHABLE) {
      const where = `${assignment.family}/${assignment.hierarchy}/${assignment.typographyCategory}`;
      expect(pairingsExcludedByCategory(assignment), where).toEqual([]);
      // The stronger form: narrowing is the identity on the planner's list, not a repair of it.
      expect(allowedPairings(assignment), where).toEqual(assignment.typographyPairings);
      expect(narrowingFor(assignment).pairings, where).toEqual(assignment.typographyPairings);
    }
  });

  it("is not dead code: the frozen reference planner still produces what it catches", () => {
    // `src/lib/renderer/planner`'s `assignmentFor` is the Phase 3 replay gate and is deliberately
    // unchanged — it returns the same `SiblingAssignment` type on the broad fallback path, as do
    // `planner_v1` artifacts persisted before the bump. So the guard still has a caller's mistake
    // to report, which is why it survives the planner fix rather than being deleted with it.
    const diverging = REFERENCE.filter((a) => pairingsExcludedByCategory(a).length > 0);
    expect(diverging.length).toBeGreaterThan(0);
    for (const assignment of diverging) {
      expect(assignment.hierarchy).toBe("monumental");
      // Every monumental-capable pairing: ten, spanning five categories — broader than the single
      // category emitted beside them.
      expect(assignment.typographyPairings).toHaveLength(10);
      expect(
        new Set(assignment.typographyPairings.map((p) => TYPOGRAPHY[p].category)).size,
      ).toBeGreaterThan(1);
    }
    // Only `editorial` admits both `monumental` and the `oldstyle` category.
    expect([...new Set(diverging.map((a) => a.family))]).toEqual(["editorial" satisfies Family]);
  });

  it("resolves toward canon whenever it does find something", () => {
    for (const assignment of [...REACHABLE, ...REFERENCE]) {
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
