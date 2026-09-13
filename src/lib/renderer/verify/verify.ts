/**
 * 9. Rendered-geometry verification — the authoritative fit.
 *
 * `docs/event-renderer-system.md §3.1`:
 *
 * > "Each text node's line count and bounds are measured at both breakpoints; nodes over their
 * > limit (display and primary: three lines at desktop, four at mobile) or overflowing their
 * > container are demoted one emphasis step and the page is re-rendered, up to three rounds; if any
 * > overflow remains, the innermost `Frame`/`Surface`/`Rail` around the node is relaxed (Frame →
 * > Stack, Surface inset → tight, Rail widened), logged as `fit.verified.structural`. ... A spec is
 * > final only with `verified.clean === true`."
 *
 * # The invariant this module exists to protect
 *
 * `proof-b/verify.js` performs both adaptations by **mutating `spec.composition`**. Production must
 * not, because §6's re-fit contract requires a content edit to produce a new revision with the same
 * canonical tree and the same `compositionHash`. Nothing here writes to `spec.composition`, to any
 * node in it, or to any field of the input spec at all: the fit accumulates in a
 * `VerificationOverrides` map (`compile/verification.ts`) that is carried beside `layout` and
 * `motifs` on the result, and every step builds a new map with `withDemotion` / `withRelaxation`
 * rather than editing one. The tree the model authored is read, never touched.
 *
 * # The loop
 *
 * Deterministic in `(spec, content, options)`. No model is called at any point (`spec.md §32` #21:
 * fit defects are repaired deterministically and logged, never re-prompted).
 *
 * ```text
 * render 390 and 1280 → collect violations
 * → order the affected node ids in canonical id order
 * → one demotion per affected node → re-render both → repeat, at most MAX_DEMOTION_ROUNDS
 * → if real overflow remains: relax the innermost box around each overflowing node
 *   → re-render both → repeat, at most MAX_RELAXATION_ROUNDS
 * → clean ? immutable ResolvedDesignSpec : explicit failure
 * ```
 *
 * Ordering is canonical id order — document order, the order `canonicalize` stamped ids in — so a
 * run is reproducible and two runs over the same spec demote the same nodes in the same sequence.
 * One demotion per node per round, never two steps at once, which is what §3.1's "demoted one
 * emphasis step ... up to three rounds" means.
 *
 * Three demotion rounds is §3.1's number. Two relaxation rounds is this module's, and it is a
 * choice rather than a quotation: §3.1 bounds the demotion rounds explicitly and says only "if any
 * overflow remains" about the structural pass. Two is enough for the relaxations to compose (an
 * inner Surface, then the Frame outside it) while keeping the worst case at twelve renders, and an
 * unbounded structural loop could grind against a page that will never fit. It is recorded on the
 * result as `relaxationRounds` so the bound is visible rather than implied.
 *
 * # Failure is a result, not a fallback
 *
 * If the page will not come clean inside those bounds, this returns a failure. It does not
 * fabricate a spec, does not fall back to the static estimate (`spec.md §32` #24 — the estimate is
 * advisory and never authoritative), does not lower the tolerance, and does not call a model. The
 * caller's recovery path — the library fallback of §3 — lives outside this module.
 */

import type { AnyNode, CompositionTree, Repair } from "../composition/nodes";
import type { Emphasis } from "../composition/tokens";
import type { Deviation } from "../design-intent";
import { walk } from "../composition/walk";
import type { PreVerificationDesignSpec } from "../compile/spec";
import {
  NO_OVERRIDES,
  demote,
  demotionRepair,
  effectiveEmphasis,
  relaxationRepair,
  widenRail,
  withDemotion,
  withRelaxation,
  type StructuralRelaxation,
  type VerificationOverrides,
} from "../compile/verification";
import type { EventContent } from "@/components/event-renderer/contract";
import { withGeometryPage, type GeometryPage } from "./browser";
import { buildMeasurableDocument, requiredFamilies, type AssetPaths, DEFAULT_ASSETS } from "./html";
import {
  BREAKPOINTS,
  VIEWPORTS,
  lineLimit,
  type Breakpoint,
  type PageMeasurement,
} from "./measure";
import {
  GeometryInfrastructureError,
  type BreakpointSummaries,
  type BreakpointSummary,
  type ResolvedDesignSpec,
  type VerificationResult,
} from "./result";

/**
 * The sub-pixel allowance, in CSS pixels, for every horizontal comparison.
 *
 * One pixel, and not a rounding of convenience. Chromium lays out in 1/64px `LayoutUnit`s and then
 * reports `scrollWidth` and `clientWidth` as *integers*, so on a page that fits exactly those two
 * routinely differ by a fraction that rounds either way, and `getBoundingClientRect` edges land
 * fractions of a pixel apart wherever a border, an inset or an `fr` track divides unevenly. A
 * difference at or below one CSS pixel is that arithmetic, not something a viewer can scroll to.
 * Anything strictly greater than it is a real overflow and is repaired.
 *
 * This is deliberately *tighter* than the reference, which allowed 2px on element and text bounds
 * (`proof-b/renderer.js`) and 1px on the page. Both library pages and the novel tree verify clean
 * at 1px, so the looser allowance was buying nothing. It is never widened to make a page pass:
 * `spec.md §32` #24 forbids weakening the zero-overflow criterion, and an epsilon large enough to
 * hide an overflow is exactly that weakening.
 */
export const TOLERANCE_PX = 1;

/** `§3.1`, quoted. */
export const MAX_DEMOTION_ROUNDS = 3;
/** This module's bound; see the module doc. */
export const MAX_RELAXATION_ROUNDS = 2;

/** Enough overflow records to diagnose a failure, few enough not to bloat a log. */
const OVERFLOW_RECORD_LIMIT = 12;

/**
 * Re-type a repair built by `compile/verification.ts`.
 *
 * Those builders are declared as `Deviation & { rule; kind }`, and in that intersection `kind`
 * narrows to the *deviation* union — even though the value they actually put there is the literal
 * `"fit-verified"` that `Repair.kind` names, which is what the `as never` in that module is for.
 * Every other field already lines up (`rule`, `path`, `kind`, `before`, `after`). So this adapts the
 * declared type rather than rebuilding the object, because rebuilding it here would fork the
 * `{ rule, path, kind, before, after }` log format that §3 pins down into a second definition.
 */
function asRepair(entry: Deviation & { rule: string; kind: string }): Repair {
  return entry as unknown as Repair;
}

/* -------------------------------------------------------------------------------- tree index */

interface IndexedNode {
  readonly node: AnyNode;
  readonly path: string;
  /** Ancestors, outermost first — the order `walk` accumulates them in. */
  readonly ancestors: readonly AnyNode[];
  /** Position in document order, which for a canonical tree is canonical id order. */
  readonly order: number;
}

export type NodeIndex = ReadonlyMap<string, IndexedNode>;

/**
 * Index a canonical tree by node id.
 *
 * Read-only: the walk collects references, and nothing downstream writes through them.
 */
export function indexTree(tree: CompositionTree): NodeIndex {
  const index = new Map<string, IndexedNode>();
  let order = 0;
  walk(tree, ({ node, path, ancestors }) => {
    const id = node.id;
    order += 1;
    // A section and its root node share an id (`canonicalize`: both become `s0`). First wins, which
    // is the root node — the section element itself is not a relaxable box.
    if (id && !index.has(id)) index.set(id, { node, path, ancestors: [...ancestors], order });
  });
  return index;
}

/** Canonical id order, with unknown ids last and in a stable order among themselves. */
export function orderIds(ids: Iterable<string>, index: NodeIndex): string[] {
  const unique = [...new Set(ids)];
  return unique.sort((a, b) => {
    const oa = index.get(a)?.order ?? Number.MAX_SAFE_INTEGER;
    const ob = index.get(b)?.order ?? Number.MAX_SAFE_INTEGER;
    return oa - ob || (a < b ? -1 : a > b ? 1 : 0);
  });
}

/* ------------------------------------------------------------------------------- summarising */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function summarise(m: PageMeasurement): BreakpointSummary {
  let textOverflow = 0;
  let textOverLimit = 0;
  for (const t of m.texts) {
    if (t.overflow) textOverflow += 1;
    const limit = lineLimit(m.mode, t.emphasis);
    if (limit !== null && t.lines > limit) textOverLimit += 1;
  }
  return {
    viewport: m.viewport,
    documentWidth: m.documentWidth,
    clientWidth: m.clientWidth,
    documentHeight: m.documentHeight,
    pageOverflow: m.pageOverflow,
    overflowingElements: m.overflowingTotal,
    textOverflow,
    textOverLimit,
    measuredTexts: m.texts.length,
    excludedTexts: m.excludedTexts,
    heroHeight: round2(m.heroHeight),
  };
}

/**
 * `§3.1`'s clean criterion, as the packet states it: no page horizontal overflow at either width,
 * zero overflowing measured elements, zero remaining text overflow.
 *
 * `textOverLimit` is deliberately absent. A line limit is what *drives* demotion; it is not itself
 * a rendering defect, and once a node has been demoted to `secondary` it has no limit to exceed.
 * Overflow is the defect, and it is the one the zero threshold applies to.
 */
/**
 * Clean means *measured and fitting*, not merely "no violations reported".
 *
 * Three absence checks alone would stamp `clean: true` on a page that rendered nothing — an empty
 * `sections` array, or a render that produced no text nodes — because zero elements trivially
 * satisfies "zero overflowing elements". That is a false positive of the worst kind: it claims
 * rendered-geometry authority over a page nobody looked at. So a positive signal is required too:
 * every breakpoint must have measured at least one text node.
 *
 * A page with no measurable text is an infrastructure problem, not a fit result; `verifyGeometry`
 * reports it as one rather than as `unresolved`.
 */
export function isClean(summaries: BreakpointSummaries): boolean {
  return BREAKPOINTS.every((bp) => {
    const s = summaries[bp];
    return (
      s.measuredTexts > 0 && !s.pageOverflow && s.overflowingElements === 0 && s.textOverflow === 0
    );
  });
}

/** Did the run measure anything at all? Distinguishes a fitting page from an empty one. */
export function measuredAnything(summaries: BreakpointSummaries): boolean {
  return BREAKPOINTS.every((bp) => summaries[bp].measuredTexts > 0);
}

/* --------------------------------------------------------------------------------- demotions */

export interface DemotionViolation {
  readonly id: string;
  readonly evidence: string;
}

/**
 * Every node a measurement says must come down one step, in canonical id order.
 *
 * Two triggers, both from §3.1: over its line limit, or overflowing its container while at an
 * emphasis that can still be demoted. A node at `secondary` or `caption` that overflows is not a
 * demotion candidate — there is nowhere below `secondary` that is not a legibility regression
 * (`compile/verification.ts`) — so it falls through to the structural pass instead.
 */
export function demotionViolations(
  measurements: Record<Breakpoint, PageMeasurement>,
  index: NodeIndex,
): DemotionViolation[] {
  const evidence = new Map<string, string[]>();
  for (const bp of BREAKPOINTS) {
    const m = measurements[bp];
    for (const t of m.texts) {
      if (!t.id || !index.has(t.id)) continue;
      const limit = lineLimit(bp, t.emphasis);
      const overLimit = limit !== null && t.lines > limit;
      const overflowing = t.overflow && (t.emphasis === "display" || t.emphasis === "primary");
      if (!overLimit && !overflowing) continue;
      const note = overLimit
        ? `${bp}: ${t.lines} lines at ${t.emphasis} (limit ${limit})`
        : `${bp}: ${t.emphasis} overflows its container by ` +
          `${round2(Math.max(t.box.right - t.containerBox.right, t.containerBox.left - t.box.left))}px`;
      const list = evidence.get(t.id);
      if (list) list.push(note);
      else evidence.set(t.id, [note]);
    }
  }
  return orderIds(evidence.keys(), index).map((id) => ({
    id,
    evidence: evidence.get(id)!.join("; "),
  }));
}

function authoredEmphasis(node: AnyNode): Emphasis | undefined {
  return (node as { emphasis?: Emphasis }).emphasis;
}

/**
 * Apply at most one demotion per violating node. Returns the new override map and the repairs;
 * an empty repair list means no node could come down further and the loop must stop.
 */
export function applyDemotions(
  violations: readonly DemotionViolation[],
  index: NodeIndex,
  overrides: VerificationOverrides,
): { overrides: VerificationOverrides; repairs: Repair[] } {
  let next = overrides;
  const repairs: Repair[] = [];
  for (const violation of violations) {
    const entry = index.get(violation.id);
    if (!entry) continue;
    const current = effectiveEmphasis(next, violation.id, authoredEmphasis(entry.node));
    if (!current) continue;
    const to = demote(current);
    if (!to) continue;
    next = withDemotion(next, violation.id, to);
    repairs.push(
      asRepair(demotionRepair(violation.id, entry.path, current, to, violation.evidence)),
    );
  }
  return { overrides: next, repairs };
}

/* ------------------------------------------------------------------------------ relaxations */

/** The relaxation each box type takes, and whether this node can still take it. */
function relaxationFor(node: AnyNode): StructuralRelaxation | null {
  if (node.t === "Frame") return "frame-as-stack";
  if (node.t === "Surface") {
    return (node as { inset?: string }).inset === "tight" ? null : "surface-inset-tight";
  }
  if (node.t === "Rail") {
    return widenRail((node as { width: string }).width) ? "rail-widen" : null;
  }
  return null;
}

export interface RelaxationChoice {
  readonly nodeId: string;
  readonly relaxation: StructuralRelaxation;
  readonly forNodeId: string;
}

/**
 * The innermost box that can still give, for an overflowing node.
 *
 * §3.1 says "the innermost `Frame`/`Surface`/`Rail` around the node". The search starts at the node
 * itself when the node *is* one of the three — an overflowing `Frame` is most directly relieved by
 * relaxing that `Frame`, and skipping to its grandparent would relax a box that was not the
 * problem — and then walks outward. A box that is already relaxed, or that has nothing left to give
 * (a `Surface` at `tight`, a `Rail` at `wide`), is stepped over rather than counted as progress.
 */
export function innermostRelaxation(
  nodeId: string,
  index: NodeIndex,
  overrides: VerificationOverrides,
): RelaxationChoice | null {
  const entry = index.get(nodeId);
  if (!entry) return null;
  const chain: AnyNode[] = [entry.node, ...[...entry.ancestors].reverse()];
  for (const candidate of chain) {
    const id = candidate.id;
    if (!id || overrides.structural[id]) continue;
    const relaxation = relaxationFor(candidate);
    if (relaxation) return { nodeId: id, relaxation, forNodeId: nodeId };
  }
  return null;
}

/** Canonical node ids that a measurement reports as overflowing, at either width. */
export function overflowingIds(
  measurements: Record<Breakpoint, PageMeasurement>,
  index: NodeIndex,
): string[] {
  const ids: string[] = [];
  for (const bp of BREAKPOINTS) {
    const m = measurements[bp];
    for (const t of m.texts) if (t.overflow && t.id) ids.push(t.id);
    for (const e of m.overflowing) if (e.id) ids.push(e.id);
  }
  return orderIds(
    ids.filter((id) => index.has(id)),
    index,
  );
}

export function applyRelaxations(
  measurements: Record<Breakpoint, PageMeasurement>,
  index: NodeIndex,
  overrides: VerificationOverrides,
): { overrides: VerificationOverrides; repairs: Repair[] } {
  let next = overrides;
  const repairs: Repair[] = [];
  for (const id of overflowingIds(measurements, index)) {
    const choice = innermostRelaxation(id, index, next);
    if (!choice) continue;
    const entry = index.get(choice.nodeId)!;
    next = withRelaxation(next, choice.nodeId, choice.relaxation);
    repairs.push(
      asRepair(
        relaxationRepair(
          choice.nodeId,
          entry.path,
          choice.relaxation,
          `innermost box around ${choice.forNodeId}, which still overflowed after emphasis demotion`,
        ),
      ),
    );
  }
  return { overrides: next, repairs };
}

/* ----------------------------------------------------------------------------------- the run */

export interface VerifyInput {
  readonly spec: PreVerificationDesignSpec;
  readonly content: EventContent;
  /** §6 re-fit bookkeeping; passed through to the result untouched. */
  readonly contentVersion?: number;
  readonly supersedesSpecId?: string;
}

export interface VerifyOptions {
  readonly tolerancePx?: number;
  readonly maxDemotionRounds?: number;
  readonly maxRelaxationRounds?: number;
  readonly assets?: AssetPaths;
}

function deepFreezeOverrides(overrides: VerificationOverrides): VerificationOverrides {
  return Object.freeze({
    emphasis: Object.freeze({ ...overrides.emphasis }),
    structural: Object.freeze({ ...overrides.structural }),
  });
}

function summariseAll(measurements: Record<Breakpoint, PageMeasurement>): BreakpointSummaries {
  return { desktop: summarise(measurements.desktop), mobile: summarise(measurements.mobile) };
}

/** A required family whose faces did not load makes every line count in the run meaningless. */
function assertFontsLoaded(measurements: Record<Breakpoint, PageMeasurement>): void {
  for (const bp of BREAKPOINTS) {
    const { missing, required } = measurements[bp].fonts;
    if (missing.length > 0) {
      throw new GeometryInfrastructureError(
        `at ${bp}, the required font ${missing.length === 1 ? "family" : "families"} ` +
          `${missing.join(", ")} did not load (required: ${required.join(", ")}); ` +
          "geometry would have been measured against fallback typography",
      );
    }
  }
}

function infrastructureFailure(
  cause: unknown,
  state: {
    overrides: VerificationOverrides;
    repairs: readonly Repair[];
    demotionRounds: number;
    relaxationRounds: number;
    measurements: BreakpointSummaries | null;
    outstanding: readonly string[];
  },
): VerificationResult {
  return {
    ok: false,
    kind: "infrastructure",
    detail:
      cause instanceof GeometryInfrastructureError
        ? cause.message
        : `unexpected error during geometry verification: ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`,
    overrides: deepFreezeOverrides(state.overrides),
    repairs: Object.freeze([...state.repairs]),
    demotionRounds: state.demotionRounds,
    relaxationRounds: state.relaxationRounds,
    measurements: state.measurements,
    outstanding: state.outstanding,
  };
}

/**
 * The fit loop itself, against an already-open page.
 *
 * Split out from `verifyGeometry` so the whole algorithm — round ordering, the bounds, the clean
 * predicate, the override map, the shape of the two outcomes — can be exercised against a stand-in
 * page in an environment where Chromium cannot launch. It is not part of this directory's public
 * surface (`index.ts`): callers get `verifyGeometry`, which owns the browser's lifetime. A
 * stand-in page must still be driven by the real document `html.ts` produces, or the test is
 * testing itself.
 *
 * Never mutates `input.spec`. On success the returned spec carries the *same* `composition` object
 * and the *same* `compositionHash` it was given.
 */
export async function runFitLoop(
  page: GeometryPage,
  input: VerifyInput,
  options: VerifyOptions = {},
): Promise<VerificationResult> {
  const tolerancePx = options.tolerancePx ?? TOLERANCE_PX;
  const maxDemotionRounds = options.maxDemotionRounds ?? MAX_DEMOTION_ROUNDS;
  const maxRelaxationRounds = options.maxRelaxationRounds ?? MAX_RELAXATION_ROUNDS;
  const assets = options.assets ?? DEFAULT_ASSETS;

  const index = indexTree(input.spec.composition);
  const families = requiredFamilies(input.spec);

  let overrides: VerificationOverrides = NO_OVERRIDES;
  const repairs: Repair[] = [];
  let demotionRounds = 0;
  let relaxationRounds = 0;
  let summaries: BreakpointSummaries | null = null;
  let outstanding: readonly string[] = [];

  /**
   * Render once and measure at both widths.
   *
   * One document, two viewports: the markup does not depend on the breakpoint — `page.tsx` emits
   * both scales under distinct custom-property names and the stylesheet's own media query picks
   * between them — so re-rendering per width would cost a second React pass to produce the same
   * bytes. Only the override map changes between rounds, and it changes the document.
   */
  const renderBoth = async (): Promise<{
    measurements: Record<Breakpoint, PageMeasurement>;
    summaries: BreakpointSummaries;
  }> => {
    const { html } = buildMeasurableDocument(
      { spec: input.spec, content: input.content, overrides },
      assets,
    );
    const measurements = {} as Record<Breakpoint, PageMeasurement>;
    for (const bp of BREAKPOINTS) {
      measurements[bp] = await page.measure(html, {
        mode: bp,
        viewport: VIEWPORTS[bp],
        tolerancePx,
        requiredFamilies: families,
        overflowLimit: OVERFLOW_RECORD_LIMIT,
      });
    }
    assertFontsLoaded(measurements);
    const summaries = summariseAll(measurements);
    // A render that produced no measurable text is not a fitting page; it is a page that did not
    // render. Fail as infrastructure before the fit loop can mistake the absence for a clean pass.
    if (!measuredAnything(summaries)) {
      const counts = BREAKPOINTS.map((bp) => `${bp}=${summaries[bp].measuredTexts}`).join(", ");
      throw new GeometryInfrastructureError(
        `the page rendered no measurable text (${counts}). Geometry cannot be verified against ` +
          "an empty render, and an absence of violations is not a fit.",
      );
    }
    return { measurements, summaries };
  };

  try {
    let round = await renderBoth();
    summaries = round.summaries;

    // 1. Demotion rounds. One step per affected node per round, in canonical id order.
    while (demotionRounds < maxDemotionRounds) {
      const violations = demotionViolations(round.measurements, index);
      if (violations.length === 0) break;
      const applied = applyDemotions(violations, index, overrides);
      if (applied.repairs.length === 0) break;
      overrides = applied.overrides;
      repairs.push(...applied.repairs);
      demotionRounds += 1;
      round = await renderBoth();
      summaries = round.summaries;
    }

    // 2. Structural relaxation, only while real overflow remains.
    while (!isClean(round.summaries) && relaxationRounds < maxRelaxationRounds) {
      const applied = applyRelaxations(round.measurements, index, overrides);
      if (applied.repairs.length === 0) break;
      overrides = applied.overrides;
      repairs.push(...applied.repairs);
      relaxationRounds += 1;
      round = await renderBoth();
      summaries = round.summaries;
    }

    const final = round.summaries;
    if (!isClean(final)) {
      outstanding = overflowingIds(round.measurements, index);
      return {
        ok: false as const,
        kind: "unresolved" as const,
        detail:
          `rendered geometry did not come clean within ${demotionRounds} demotion and ` +
          `${relaxationRounds} relaxation rounds at a ${tolerancePx}px tolerance: ` +
          BREAKPOINTS.map(
            (bp) =>
              `${bp} pageOverflow=${final[bp].pageOverflow} elements=${final[bp].overflowingElements} text=${final[bp].textOverflow}`,
          ).join(", "),
        overrides: deepFreezeOverrides(overrides),
        repairs: Object.freeze([...repairs]),
        demotionRounds,
        relaxationRounds,
        measurements: final,
        outstanding,
      };
    }

    // Spread and override rather than destructure: every field the pre-verification spec carried
    // comes through untouched — the same `composition` object, the same `compositionHash` — and the
    // two that change are simply written after it.
    const spec: ResolvedDesignSpec = Object.freeze({
      ...input.spec,
      state: "verified" as const,
      compilerRepairs: Object.freeze([...input.spec.compilerRepairs, ...repairs]),
      overrides: deepFreezeOverrides(overrides),
      verified: Object.freeze({
        desktop: final.desktop,
        mobile: final.mobile,
        // Steps applied, not nodes touched: a node demoted display → primary → secondary over
        // two rounds is two demotions, and `compilerRepairs` carries two entries for it. The
        // map holds only each node's final emphasis, so counting its keys would under-report.
        fitDemotions: repairs.filter((r) => r.rule === "fit.verified").length,
        fitRelaxations: repairs.filter((r) => r.rule === "fit.verified.structural").length,
        demotionRounds,
        relaxationRounds,
        tolerancePx,
        fonts: Object.freeze({
          required: Object.freeze([...round.measurements.desktop.fonts.required]),
          loaded: Object.freeze([...round.measurements.desktop.fonts.loaded]),
        }),
        clean: true as const,
        authoritative: "rendered-geometry" as const,
      }),
      ...(input.contentVersion !== undefined ? { contentVersion: input.contentVersion } : {}),
      ...(input.supersedesSpecId !== undefined ? { supersedesSpecId: input.supersedesSpecId } : {}),
    });
    return { ok: true as const, spec };
  } catch (cause) {
    // Anything that got this far means the measurement itself could not be trusted — the page did
    // not render, a font was missing, or the verifier itself threw. None of those is a fit result,
    // so none of them may produce a spec. The message carries the cause verbatim so a genuine bug
    // stays legible in a log rather than being disguised as weather.
    return infrastructureFailure(cause, {
      overrides,
      repairs,
      demotionRounds,
      relaxationRounds,
      measurements: summaries,
      outstanding,
    });
  }
}

/**
 * Verify a pre-verification spec against rendered geometry: the public entry point.
 *
 * Launches Chromium, runs the fit loop against its one reusable page, and closes the browser
 * whatever happens. Returns an immutable `ResolvedDesignSpec` with `verified.clean === true`, or an
 * explicit failure — never a spec that did not pass, and never a thrown error for a caller to
 * mistake for a crash (`docs/event-renderer-system.md §3.1`, `spec.md §32` #20).
 */
export async function verifyGeometry(
  input: VerifyInput,
  options: VerifyOptions = {},
): Promise<VerificationResult> {
  try {
    return await withGeometryPage((page) => runFitLoop(page, input, options));
  } catch (cause) {
    // Only a launch or close failure reaches here; the loop reports its own.
    return infrastructureFailure(cause, {
      overrides: NO_OVERRIDES,
      repairs: [],
      demotionRounds: 0,
      relaxationRounds: 0,
      measurements: null,
      outstanding: [],
    });
  }
}
