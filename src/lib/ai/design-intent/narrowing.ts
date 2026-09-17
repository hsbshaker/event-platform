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
 * # Reconciling with the planner's own narrowing (T15)
 *
 * `SiblingAssignment.typographyPairings` already carries a narrowed list, computed in
 * `src/lib/renderer/planner/index.ts`. This module does **not** compute a second, independent
 * one: it filters the planner's list, so the set offered to the model is always a subset of what
 * the planner allowed and can never offer something the planner excluded.
 *
 * The two can nevertheless disagree, in one reachable case, and that disagreement is a defect
 * rather than a design:
 *
 *   `editorial` + `monumental` + drawn category `oldstyle`. Neither oldstyle pairing holds at
 *   monumental, so the planner falls back to *every* monumental-capable pairing — ten of them,
 *   spanning five categories — and then sets `typographyCategory` from whichever one its seeded
 *   pick landed on. The emitted list is therefore broader than the emitted category.
 *
 * Canon is not ambiguous about which side is right. `§5.1` requires the pairing to be "from the
 * allowed list, **in the assigned category**"; `§5.2` says "filtered by category and by whether
 * they hold at the assigned hierarchy"; `§E`'s invariant list says "`typographyPairing` within
 * the **assigned** category"; and the v4 prompt draft states both rules at once. So the
 * intersection is canon's set, and taking it is a reconciliation rather than a third opinion: it
 * is a subset of the planner's list, it satisfies both of canon's clauses, and
 * `narrowing.test.ts` proves it is never empty for an assignment the planner can produce.
 *
 * `pairingsExcludedByCategory()` exposes the difference so the divergence is reportable instead
 * of silently absorbed. It is empty on every path but the one above.
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
 * Non-empty only on the `editorial` + `monumental` + `oldstyle` fallback path described in the
 * module header. Reported, never repaired away here: which of the two narrowings should change is
 * a planner decision, not this module's.
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
