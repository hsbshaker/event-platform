/**
 * Motif resolution: the compiler decides the treatment, the tree decided the placement.
 *
 * `docs/event-renderer-system.md §8`: "motifs are placed by the tree (`MotifField`, `MotifBand`,
 * `Frame.motif`, `Glyph`, `Rule.glyphs`) within the ornament budget from `composition.ornament`;
 * roles, channels, opacity bounds and caps are unchanged; a motif of the wrong kind for its slot
 * is swapped and logged (`motif.kind`), never dropped silently." `docs/design-system.md §15.7`:
 * "Code assigns motif→slot deterministically. Unplaceable motifs are logged, not silently
 * ignored." `spec.md §32` #25: do not silently drop motifs.
 *
 * # This has no reference implementation
 *
 * `proof-b` has no motif resolution stage. Its renderer paints patterns from a fixed table and
 * never reads `composition.ornament` at all, and the fake DesignIntent carried no `motifs` array.
 * So there is nothing to port and no parity to prove: this is built from the canonical contract.
 * Wrong-*kind* validation and repair is the exception — it is already in the language core
 * (`composition/validate-structure.ts`, rule `motif.kind`), so by the time a tree reaches here
 * every motif is of the right kind for its slot.
 *
 * # Two places the canonical text runs out, recorded rather than invented
 *
 * 1. **"channels" has no surviving definition.** The phrase appears once in §8 and once in the
 *    changelog, both as carry-forward from Revision 1, and no current document says what a motif
 *    channel is. Nothing here invents one. When the renderer slice needs it, it needs a spec
 *    first.
 * 2. **The ornament budget is a hard rendering cap.** `composition.ornament` limits how many
 *    motifs actually render. `spec.md §32` #25 — "do not silently drop motifs" — requires the
 *    suppression to be explicit and logged; it does not require every motif the tree placed to be
 *    visible.
 *
 *    So: the composition tree is never mutated, motifs are resolved in document order, eligible
 *    ones consume the budget until `max`, and everything past it resolves with `render: false`
 *    and a `motif.budget` deviation. The evidence stays in the spec; the pixels do not. The
 *    renderer reads `render` and must not draw a suppressed motif.
 */

import type {
  CompositionTree,
  Frame,
  Glyph,
  MotifBand,
  MotifField,
  RuleNode,
} from "../composition/nodes";
import type { MotifId, MotifRole } from "../composition/tokens";
import { ARRANGEMENT_MOTIFS, PATTERN_MOTIFS } from "../composition/tokens";
import { walk } from "../composition/walk";
import type { Deviation, DesignIntent, Ornament } from "../design-intent";

export type MotifKind = "pattern" | "arrangement";

/**
 * The curated motif catalog: what each motif is, and which slots it may fill
 * (`proof-a1/vocab.js`'s `VOCAB.motifs`, the canonical vocabulary).
 */
export const MOTIF_CATALOG: Record<MotifId, { kind: MotifKind; roles: readonly MotifRole[] }> = {
  plaid: { kind: "pattern", roles: ["field", "band", "frame"] },
  stripe: { kind: "pattern", roles: ["band", "field", "divider"] },
  gingham: { kind: "pattern", roles: ["field", "band"] },
  linen: { kind: "pattern", roles: ["field", "frame"] },
  equestrian: { kind: "arrangement", roles: ["accent", "divider", "frame"] },
  botanical: { kind: "arrangement", roles: ["accent", "divider", "frame"] },
  celestial: { kind: "arrangement", roles: ["accent", "divider"] },
};

/** `VOCAB.mapping.ornament`: how ornate this concept is allowed to be. */
export const ORNAMENT_BUDGET: Record<
  Ornament,
  { max: number; arrangement: boolean; opacity: number }
> = {
  none: { max: 1, arrangement: false, opacity: 0.22 },
  restrained: { max: 2, arrangement: true, opacity: 0.22 },
  decorative: { max: 3, arrangement: true, opacity: 0.35 },
};

/** `VOCAB.parameters.cosmetic`: the only opacity and scale values a motif may take. */
export const MOTIF_OPACITY_STEPS = [0.08, 0.14, 0.22, 0.35] as const;
export const MOTIF_SCALE_STEPS = [0.75, 1, 1.5, 2.25] as const;

export interface ResolvedMotif {
  readonly id: MotifId;
  readonly kind: MotifKind;
  readonly role: MotifRole;
  /** A member of `MOTIF_OPACITY_STEPS`, never above the ornament's ceiling. */
  readonly opacity: number;
  /** A member of `MOTIF_SCALE_STEPS`. */
  readonly scale: number;
  /**
   * Whether this motif is drawn. `false` means the ornament budget was already spent, or the
   * ornament direction admits no arrangement motifs. The entry stays in the spec as evidence and
   * carries a matching `motif.budget` deviation; the renderer must not draw it.
   */
  readonly render: boolean;
  /** Why it is not drawn. Absent when `render` is true. */
  readonly suppressedBy?: "ornament-budget" | "arrangement-disabled";
}

/** The largest approved opacity step at or below `ceiling`. */
const opacityAtOrBelow = (ceiling: number): number =>
  [...MOTIF_OPACITY_STEPS].reverse().find((o) => o <= ceiling) ?? MOTIF_OPACITY_STEPS[0];

/** The motif of the same kind, in catalog order, that admits `role`. */
function motifForRole(kind: MotifKind, role: MotifRole): MotifId | null {
  const ids = (Object.keys(MOTIF_CATALOG) as MotifId[]).filter(
    (id) => MOTIF_CATALOG[id].kind === kind && MOTIF_CATALOG[id].roles.includes(role),
  );
  return ids.length ? ids[0] : null;
}

/** The role a node's slot implies. `Glyph` is an accent; `Rule.glyphs` is a divider. */
type MotifSlot = { id: MotifId; role: MotifRole };

function slotOf(node: { t: string }): MotifSlot | null {
  switch (node.t) {
    case "MotifField":
      return { id: (node as MotifField).motif.id, role: (node as MotifField).motif.role };
    case "MotifBand": {
      const m = (node as MotifBand).motif;
      return m ? { id: m.id, role: m.role } : null;
    }
    case "Frame": {
      const m = (node as Frame).motif;
      return m ? { id: m.id, role: m.role } : null;
    }
    case "Glyph":
      return { id: (node as Glyph).motif, role: "accent" };
    case "Rule": {
      const g = (node as RuleNode).glyphs;
      return g ? { id: g, role: "divider" } : null;
    }
    default:
      return null;
  }
}

/**
 * Resolve every motif the tree placed, in document order.
 *
 * Deterministic in `(tree, intent.composition.ornament, seed)`. `seed` chooses the scale within
 * the approved steps, so two concepts of a batch do not render the same pattern at the same size.
 *
 * The tree must be canonicalized: entries are keyed by canonical node id.
 */
export function resolveMotifs(
  tree: CompositionTree,
  intent: DesignIntent,
  seed = 1,
): { motifs: Record<string, ResolvedMotif>; deviations: Deviation[] } {
  const budget = ORNAMENT_BUDGET[intent.composition.ornament];
  const motifs: Record<string, ResolvedMotif> = {};
  const deviations: Deviation[] = [];
  let spent = 0;
  let index = 0;

  walk(tree, ({ node, path }) => {
    const slot = slotOf(node);
    if (!slot) return;
    const id = node.id ?? path;

    let motifId = slot.id;
    let entry = MOTIF_CATALOG[motifId];

    // Role: the slot asks for something this motif does not do. Swap for one that does, in
    // catalog order, and record it — the same disposition §8 gives a wrong *kind*.
    if (!entry.roles.includes(slot.role)) {
      const replacement = motifForRole(entry.kind, slot.role);
      if (replacement) {
        deviations.push({
          rule: "motif.role",
          detail: `${motifId} does not serve the ${slot.role} role at ${path}`,
          before: motifId,
          after: replacement,
        });
        motifId = replacement;
        entry = MOTIF_CATALOG[motifId];
      } else {
        // No motif of this kind serves the role. Nothing is dropped; it is recorded and resolved
        // at the lowest step so it reads as texture rather than as a statement.
        deviations.push({
          rule: "motif.role",
          detail: `no ${entry.kind} motif serves the ${slot.role} role at ${path}`,
          before: motifId,
        });
      }
    }

    // Ornament "none" admits no arrangement motifs at all. Everything else competes for `max`,
    // in document order, which is why the tree's own ordering is the tiebreak: it is the only
    // ordering the model authored.
    const arrangementBlocked = entry.kind === "arrangement" && !budget.arrangement;
    const render = !arrangementBlocked && spent < budget.max;
    const suppressedBy = arrangementBlocked
      ? ("arrangement-disabled" as const)
      : render
        ? undefined
        : ("ornament-budget" as const);

    if (render) spent++;
    else
      deviations.push({
        rule: "motif.budget",
        kind: "budget",
        path,
        detail: arrangementBlocked
          ? `ornament none admits no arrangement motifs; ${motifId} at ${path} does not render`
          : `ornament ${intent.composition.ornament} renders ${budget.max} motifs; ${motifId} at ${path} does not render`,
        before: motifId,
      });

    motifs[id] = {
      id: motifId,
      kind: entry.kind,
      role: slot.role,
      opacity: opacityAtOrBelow(budget.opacity),
      scale: MOTIF_SCALE_STEPS[(seed + index) % MOTIF_SCALE_STEPS.length],
      render,
      ...(suppressedBy ? { suppressedBy } : {}),
    };
    index++;
  });

  return { motifs, deviations };
}

/** Every motif id the catalog knows, partitioned as the language core partitions them. */
export const CATALOG_IS_CONSISTENT =
  PATTERN_MOTIFS.every((id) => MOTIF_CATALOG[id as MotifId].kind === "pattern") &&
  ARRANGEMENT_MOTIFS.every((id) => MOTIF_CATALOG[id as MotifId].kind === "arrangement");
