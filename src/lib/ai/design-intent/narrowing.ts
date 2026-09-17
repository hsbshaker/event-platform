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
 * - `composition.hierarchy` by **family**, from `FAMILIES[family].hierarchies` — which is already
 *   exactly §5.2's rule ("invitation excludes monumental; statement allows only dramatic and
 *   monumental"), so no second table is written here. Note this is narrowed by family and *not*
 *   to the assigned hierarchy: §5.2 and `docs/model-schemas/design-intent.schema.json` both say
 *   "narrowed by family", and the assigned hierarchy's job is to shape the pairing pool below.
 *   `composition` is also a diversity-measurable vector (`§E`, "Diversity: what is checkable"),
 *   and collapsing one of its five dimensions to a planner constant would remove a dimension the
 *   evidence has to be able to separate siblings on.
 * - `typographyPairing` to the assigned category **and** to pairings that hold at the assigned
 *   hierarchy.
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

/** §5.2's hierarchy rule, read off the family table rather than restated. */
export function allowedHierarchies(assignment: SiblingAssignment): readonly Hierarchy[] {
  return FAMILIES[assignment.family].hierarchies;
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
    hierarchies: allowedHierarchies(assignment),
  };
}
