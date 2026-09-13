/**
 * Verified-fit overrides: how geometry adaptation is represented.
 *
 * `docs/event-renderer-system.md §3.1` allows two adaptations when rendered geometry says a page
 * does not fit — demote a text node's emphasis one step, and, only after demotion rounds fail,
 * relax the innermost box around it. `proof-b/verify.js` performs both by **mutating
 * `spec.composition`**. That was fine for a harness. It is wrong for production, because
 * §6's re-fit contract requires a content edit to produce a new revision with the *same*
 * canonical tree and the *same* `compositionHash`:
 *
 * > "A content edit that affects fit appends a new immutable revision (same tree, same
 * > `compositionHash`, no model call)."
 *
 * A verifier that rewrote `emphasis` in the tree would change the hash, and the concept's identity
 * with it. So geometry adaptation lives here instead: a map from canonical node id to a resolved
 * treatment, carried on the `ResolvedDesignSpec` beside `layout` and `motifs`, where every other
 * piece of compiler-resolved data lives. The tree the model authored is never touched.
 *
 * This is compiler-owned resolved data, **not** a new primitive, prop or token. The composition
 * language is unchanged and its version is unchanged; only the compiler's own output shape grows,
 * so only `versions.compiler` moves (`spec.md §32` #15, #16).
 */

import type { Emphasis } from "../composition/tokens";
import type { Deviation } from "../design-intent";

/** The emphasis ladder. Demotion is one step, never two (`§3.1`). */
export const EMPHASIS_LADDER: readonly Emphasis[] = ["display", "primary", "secondary", "caption"];

/**
 * One step down, or `null` at the bottom. `secondary` is the floor for a verified demotion:
 * §3.1 names display → primary → secondary, and dropping body text to caption would be a
 * legibility regression dressed up as a fit.
 */
export function demote(emphasis: Emphasis): Emphasis | null {
  const i = EMPHASIS_LADDER.indexOf(emphasis);
  if (i < 0 || i >= 2) return null;
  return EMPHASIS_LADDER[i + 1];
}

/**
 * The structural relaxations §3.1 permits, in the order it names them. Each is a *rendering
 * treatment*, applied by the renderer to a node that keeps its type, its id and its props.
 *
 * - `frame-as-stack` — a `Frame` renders without its rule and inset, as a plain stack. The node
 *   stays a `Frame`; it is not rewritten into a `Stack`.
 * - `surface-inset-tight` — a `Surface` renders at the tight inset whatever it asked for.
 * - `rail-widen` — a `Rail` renders at the next approved width.
 */
export type StructuralRelaxation = "frame-as-stack" | "surface-inset-tight" | "rail-widen";

/** Which primitive each relaxation applies to. A relaxation on the wrong type is a bug. */
export const RELAXATION_TARGET: Record<StructuralRelaxation, string> = {
  "frame-as-stack": "Frame",
  "surface-inset-tight": "Surface",
  "rail-widen": "Rail",
};

/** The approved rail widths, widest last. `rail-widen` moves one step along this. */
export const RAIL_WIDTHS: readonly string[] = ["thin", "medium", "wide"];

export function widenRail(width: string): string | null {
  const i = RAIL_WIDTHS.indexOf(width);
  return i >= 0 && i < RAIL_WIDTHS.length - 1 ? RAIL_WIDTHS[i + 1] : null;
}

/**
 * Everything geometry verification decided, keyed by canonical node id.
 *
 * Deliberately not breakpoint-keyed. §3.1's adaptations are page-level facts about a node, and a
 * per-breakpoint override would be a breakpoint-specific creative tree in disguise — the one thing
 * §2 forbids. Where a value legitimately differs by breakpoint, it already does so through the
 * resolved-layout contract, which the renderer reads separately.
 */
export interface VerificationOverrides {
  /** The emphasis the renderer must use, in place of the node's authored one. */
  readonly emphasis: Readonly<Record<string, Emphasis>>;
  /** The relaxed rendering treatment for a box. */
  readonly structural: Readonly<Record<string, StructuralRelaxation>>;
}

export const NO_OVERRIDES: VerificationOverrides = Object.freeze({
  emphasis: Object.freeze({}),
  structural: Object.freeze({}),
});

/** Add one demotion, returning a new object. Overrides are never mutated in place. */
export function withDemotion(
  overrides: VerificationOverrides,
  nodeId: string,
  to: Emphasis,
): VerificationOverrides {
  return {
    emphasis: { ...overrides.emphasis, [nodeId]: to },
    structural: overrides.structural,
  };
}

export function withRelaxation(
  overrides: VerificationOverrides,
  nodeId: string,
  relaxation: StructuralRelaxation,
): VerificationOverrides {
  return {
    emphasis: overrides.emphasis,
    structural: { ...overrides.structural, [nodeId]: relaxation },
  };
}

/**
 * The emphasis a node actually renders at: the verified override if one exists, else what the
 * model authored. The renderer reads this and never the raw prop, so honouring a verified fit is
 * the default path.
 */
export function effectiveEmphasis(
  overrides: VerificationOverrides | undefined,
  nodeId: string | undefined,
  authored: Emphasis | undefined,
): Emphasis | undefined {
  if (nodeId && overrides?.emphasis[nodeId]) return overrides.emphasis[nodeId];
  return authored;
}

/** The relaxation applied to a box, if any. */
export function effectiveRelaxation(
  overrides: VerificationOverrides | undefined,
  nodeId: string | undefined,
): StructuralRelaxation | null {
  return (nodeId && overrides?.structural[nodeId]) || null;
}

/** A repair log entry for a demotion, as `§3.1` and `§6` require it to be recorded. */
export function demotionRepair(
  nodeId: string,
  path: string,
  before: Emphasis,
  after: Emphasis,
  evidence: string,
): Deviation & { rule: string; kind: string } {
  return {
    rule: "fit.verified",
    kind: "fit-verified" as never,
    path: `${path} (${nodeId})`,
    before,
    after,
    detail: evidence,
  };
}

export function relaxationRepair(
  nodeId: string,
  path: string,
  relaxation: StructuralRelaxation,
  evidence: string,
): Deviation & { rule: string; kind: string } {
  return {
    rule: "fit.verified.structural",
    kind: "fit-verified" as never,
    path: `${path} (${nodeId})`,
    before: RELAXATION_TARGET[relaxation],
    after: relaxation,
    detail: evidence,
  };
}
