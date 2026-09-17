/**
 * Runtime narrowing — `docs/model-contracts.md §5.2`.
 *
 * The allowed output is restricted to the sibling's assignment **before** the call, so an
 * out-of-assignment value is structurally impossible rather than accepted and then repaired.
 * `docs/phase-4b-plan.md §E` states it the same way, and `spec.md §32 #21` is what it protects:
 * the compiler consumes the six design fields, so a family or tone that does not match the
 * assignment is not a taste disagreement, it is a batch whose diversity plan did not happen.
 *
 * Four narrowings, all of them derived from tables that already exist:
 *
 * - `family` to the assigned value;
 * - `tonalDirection` to the assigned value;
 * - `composition.hierarchy` to the assigned value, exactly like the two above;
 * - `typographyPairing` to the assigned category **and** to pairings that hold at the assigned
 *   hierarchy.
 *
 * # Why hierarchy is a hard assignment field and not a choice
 *
 * An earlier revision of this module narrowed hierarchy **by family** and argued that collapsing
 * it to the planner's value "would remove a dimension the evidence has to be able to separate
 * siblings on". That rationale does not survive T19. `docs/model-contracts.md §4.7` settles the
 * same question in the opposite direction and in its own sentence: composition-vector distinctness
 * "counts the four dimensions the model chooses — asymmetry, rhythm, section contrast and
 * ornament — and not `hierarchy`, which the planner assigns and actively separates; hierarchy
 * conformance is checked by assignment conformance, where it is a statement about the right
 * thing." The frozen evidence harness implements exactly that: `compositionVectorDistinct`
 * excludes hierarchy *because it is planner-owned*, and `assignmentConformance` gates an **exact**
 * match against `assignment.hierarchy`.
 *
 * So four production components agreed hierarchy was assigned and only this module disagreed, in a
 * way that could only ever produce a legal response the frozen harness would then fail. The
 * settled rule is `docs/phase-4b-plan.md §E`'s general one — "runtime narrowing restricts enums to
 * the sibling's assignment *before* the call, so an out-of-assignment value is impossible rather
 * than repaired" — applied to the field that carries the planner's own separation.
 *
 * `allowedHierarchies` stays, because `validate.ts` still needs to be able to say that a value is
 * outside the family's vocabulary altogether, which is a different failure from drift off the
 * assignment. And an assignment whose hierarchy its own family does not admit is refused here
 * rather than widened back to the family's list: widening would hand the model a hierarchy nobody
 * assigned and produce a concept that conforms to nothing.
 *
 * # Why it filters the planner's list rather than recomputing one
 *
 * `SiblingAssignment.typographyPairings` already carries a narrowed list. This module does **not**
 * compute a second, independent one: it filters the planner's list, so the set offered to the
 * model is always a subset of what the planner allowed and can never offer something the planner
 * excluded.
 *
 * Under the production planner that filter is a no-op, and that is the point. `planner_v2` emits
 * a coherent assignment: every pairing in `typographyPairings` is in `typographyCategory` and
 * holds at `hierarchy`. `planner_v1` did not — on `editorial` + `monumental` + drawn category
 * `oldstyle`, neither oldstyle pairing holds at monumental, so it fell back to *every*
 * monumental-capable pairing, ten of them spanning five categories, and set `typographyCategory`
 * from whichever one its seeded pick landed on. Canon is not ambiguous about which side owed the
 * fix: `§5.1` requires the pairing to be "from the allowed list, **in the assigned category**",
 * `§5.2` says "filtered by category and by whether they hold at the assigned hierarchy", and
 * `docs/phase-4b-plan.md §E` says "`typographyPairing` within the **assigned** category". One set,
 * and the planner owns the assignment, so the planner emits it. This module intersecting was a
 * compensation, not the settled architecture.
 *
 * The filter stays as a **guard**, for two reasons that survive the planner fix. It is what makes
 * the subset discipline above literally true rather than a convention. And the same
 * `SiblingAssignment` type is produced by `src/lib/renderer/planner`'s `assignmentFor` — the
 * Phase 3 reference, frozen by a 72-concept replay, which still emits the broad list on that path
 * — and carried by `planner_v1` artifacts persisted before the bump. So an incoherent assignment
 * remains constructible; it is simply no longer something production emits.
 *
 * `pairingsExcludedByCategory()` is what keeps such a disagreement reportable instead of silently
 * absorbed. `narrowing.test.ts` pins it empty across the production planner's whole reachable
 * space and non-empty for the reference's, so the guard is neither dead code nor load-bearing for
 * production output.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`, first bullet;
 * `§31 — Event Identity and diversity` ("Siblings never share an identical DesignIntent").
 * Plan: `docs/phase-4b-plan.md §E`, T18.
 */
import type { SiblingAssignment } from "@/lib/renderer/planner";
import {
  FAMILIES,
  TYPOGRAPHY,
  type Hierarchy,
  type TypographyPairingId,
} from "@/lib/renderer/vocabulary";

import { type SemanticsNarrowing } from "./contract";

/**
 * An assignment that leaves the model nothing legal to say.
 *
 * Thrown rather than widened. Silently restoring the full pairing catalogue would hand the model
 * a category the planner never assigned and produce a concept nobody would question — the same
 * reasoning `UnplannableIdentityError` gives one stage earlier.
 */
export class UnnarrowableAssignmentError extends Error {
  constructor(detail: string) {
    super(`sibling assignment cannot be narrowed: ${detail}`);
    this.name = "UnnarrowableAssignmentError";
  }
}

/** `docs/event-renderer-system.md §8`: only some pairings hold at monumental hierarchy. */
export function pairingHoldsAt(pairing: TypographyPairingId, hierarchy: Hierarchy): boolean {
  return hierarchy !== "monumental" || TYPOGRAPHY[pairing].holdsAtMonumental;
}

/**
 * Every hierarchy the assigned family admits, read off the family table rather than restated.
 *
 * This is the **vocabulary** check, not the narrowing. `validate.ts` uses it to tell a hierarchy
 * the family does not admit at all (a shape failure) from one that is merely not the assigned one
 * (drift off the assignment), which are different defects with different dispositions.
 */
export function allowedHierarchies(assignment: SiblingAssignment): readonly Hierarchy[] {
  return FAMILIES[assignment.family].hierarchies;
}

/**
 * The single hierarchy this concept may return.
 *
 * Refuses, rather than widening, when the assigned family does not admit the assigned hierarchy:
 * that is an incoherent assignment, and the failure belongs where it was made.
 */
export function assignedHierarchies(assignment: SiblingAssignment): readonly Hierarchy[] {
  if (!allowedHierarchies(assignment).includes(assignment.hierarchy)) {
    throw new UnnarrowableAssignmentError(
      `family "${assignment.family}" does not admit hierarchy "${assignment.hierarchy}" ` +
        `(${allowedHierarchies(assignment).join(", ")})`,
    );
  }
  return [assignment.hierarchy];
}

/**
 * The pairings this sibling may return: the planner's list, filtered to the assigned category and
 * to pairings that hold at the assigned hierarchy.
 */
export function allowedPairings(assignment: SiblingAssignment): readonly TypographyPairingId[] {
  const allowed = assignment.typographyPairings.filter(
    (pairing) =>
      TYPOGRAPHY[pairing].category === assignment.typographyCategory &&
      pairingHoldsAt(pairing, assignment.hierarchy),
  );
  if (allowed.length === 0) {
    throw new UnnarrowableAssignmentError(
      `no pairing offered by the planner is in category "${assignment.typographyCategory}" and ` +
        `holds at hierarchy "${assignment.hierarchy}"`,
    );
  }
  return allowed;
}

/**
 * Pairings the planner offered that canon's category rule excludes.
 *
 * **Empty for every assignment the production planner can emit** — `narrowing.test.ts` proves it
 * over that planner's whole reachable space, and `src/lib/generation/planner.test.ts` proves the
 * same property from the planner's side. It is non-empty only for an assignment built by hand, by
 * the frozen Phase 3 reference planner, or persisted under `planner_v1`, and then only on the
 * `editorial` + `monumental` + `oldstyle` fallback path described in the module header.
 *
 * Reported, never repaired away silently: a non-empty result means the assignment beside it does
 * not mean what it says, which is a planner defect and should be visible as one.
 */
export function pairingsExcludedByCategory(
  assignment: SiblingAssignment,
): readonly TypographyPairingId[] {
  return assignment.typographyPairings.filter(
    (pairing) => TYPOGRAPHY[pairing].category !== assignment.typographyCategory,
  );
}

/** The four narrowings as one value, for `contract.ts`'s shape factory. */
export function narrowingFor(assignment: SiblingAssignment): SemanticsNarrowing {
  return {
    families: [assignment.family],
    tones: [assignment.tonalDirection],
    pairings: allowedPairings(assignment),
    hierarchies: assignedHierarchies(assignment),
  };
}
