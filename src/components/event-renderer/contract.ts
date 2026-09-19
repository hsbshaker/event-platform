/**
 * The renderer contract: what a primitive component is, and what it is allowed to see.
 *
 * `docs/event-renderer-system.md §6`: "The renderer has one fixed component per primitive and per
 * semantic node and a static stylesheet keyed by classes and numeric custom properties from
 * `layout`. No CSS text is ever derived from model output."
 *
 * Three rules follow, and the types here exist to make them structural rather than remembered:
 *
 * 1. **One component per primitive, no branch per recipe.** `PRIMITIVE_KINDS` is the allowlist,
 *    generated from the language's own `NODE_SPEC`, and the component map's keys must equal it
 *    exactly (`docs/renderer-invariant-obligations.md` row 10). A renderer that grew a
 *    recipe-shaped branch would have to add a key that is not a primitive.
 * 2. **A component reads resolved values, never creative ones.** `RenderContext` carries the
 *    resolved layout, the resolved motifs and the semantic tokens. It deliberately does not carry
 *    `DesignIntent`: the raw palette, the pairing id and the composition intent have already been
 *    compiled, and a component that could reach them could re-derive design the compiler owns.
 * 3. **Style comes from classes and numeric custom properties only.** `cssVars` accepts numbers,
 *    and the renderer never interpolates a string from model data into a style attribute
 *    (`spec.md §32` #19).
 */

import type { CSSProperties } from "react";

import type { AnyNode, CompositionTree } from "@/lib/renderer/composition/nodes";
import { NODE_SPEC } from "@/lib/renderer/composition/spec";
import type { ResolvedMotif } from "@/lib/renderer/compile/motifs";
import type { PageSystem } from "@/lib/renderer/compile/page-system";
import type { SemanticPalette } from "@/lib/renderer/compile/palette";
import type { ResolvedTypography } from "@/lib/renderer/compile/typography";
import type { VerificationOverrides } from "@/lib/renderer/compile/verification";

/** The primitive allowlist, taken from the language spec so the two cannot drift. */
export const PRIMITIVE_KINDS: readonly string[] = Object.keys(NODE_SPEC).sort();

/** The four groups `NODE_SPEC` declares, for the coverage tests. */
export const PRIMITIVES_BY_KIND: Record<string, readonly string[]> = Object.entries(
  NODE_SPEC as Record<string, { kind: string }>,
).reduce<Record<string, string[]>>((out, [name, spec]) => {
  (out[spec.kind] ??= []).push(name);
  return out;
}, {});

/** The content a guest site displays. Plain strings; the renderer never formats or invents them. */
export interface EventContent {
  readonly eyebrow?: string;
  readonly title: string;
  readonly hosts?: string;
  readonly description?: string;
  readonly date: string;
  readonly dayNumeral: string;
  readonly monthShort: string;
  readonly year: string;
  readonly weekday: string;
  readonly time?: string;
  readonly venue?: string;
  readonly location?: string;
  readonly deadline?: string;
  readonly initial?: string;
}

/**
 * Who is looking. Guests never see collaborator affordances — not hidden by CSS, not rendered at
 * all (`spec.md §31 — Creation Mode`; `docs/screen-spec.md`).
 */
import type { FeaturePresentationState } from "./feature-presentation";

export type RenderAudience = "guest" | "collaborator";

export type {
  FeaturePresentationState,
  LeafPresentation,
  SectionPresentation,
} from "./feature-presentation";

/**
 * What a primitive component may read.
 *
 * Note what is absent: `DesignIntent`. By the time the renderer runs, the palette is semantic, the
 * typography is resolved and the page system is chosen. A component with access to the raw intent
 * could reach a creative value the compiler already decided, which is the drift §6 forbids.
 */
export interface RenderContext {
  readonly layout: Record<string, unknown>;
  readonly motifs: Record<string, ResolvedMotif>;
  readonly pageSystem: PageSystem;
  readonly palette: SemanticPalette;
  readonly typography: ResolvedTypography;
  readonly content: EventContent;
  readonly audience: RenderAudience;
  /**
   * Guest visibility and readiness (`docs/event-renderer-system.md §2.3`). Never sent to the model,
   * and it changes what renders, never what was composed.
   */
  readonly presentation: FeaturePresentationState;
  /**
   * What rendered-geometry verification decided, keyed by canonical node id
   * (`@/lib/renderer/compile/verification`). Required, not optional: the verifier fits a page by
   * re-rendering it under a growing override map, so a context that could omit it would be a
   * context that renders the unfitted page. `NO_OVERRIDES` is the empty map, and `EventPage`
   * supplies it when a caller passes none.
   *
   * Components never read this map directly — `effectiveEmphasis` and `effectiveRelaxation` are
   * the accessors, so honouring a verified fit is the default path rather than a thing each
   * component has to remember.
   */
  readonly overrides: VerificationOverrides;
  /** Renders a child node. Passed down so components never import the dispatcher directly. */
  readonly renderNode: (node: AnyNode) => React.ReactNode;
}

export interface PrimitiveProps<N extends AnyNode = AnyNode> {
  readonly node: N;
  readonly ctx: RenderContext;
}

export type PrimitiveComponent = (props: PrimitiveProps) => React.ReactNode;

/**
 * Numeric custom properties only.
 *
 * Every value is a number and is emitted with a fixed unit suffix chosen here, in code — never a
 * string that came from model output, and never a unit the model could influence. Passing a string
 * is a type error.
 */
export function cssVars(vars: Record<string, number | undefined>, unit = "px"): CSSProperties {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(vars)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    out[name.startsWith("--") ? name : `--${name}`] = `${value}${unit}`;
  }
  return out as CSSProperties;
}

/** A bare numeric custom property, for ratios and counts that take no unit. */
export function cssNumbers(vars: Record<string, number | undefined>): CSSProperties {
  return cssVars(vars, "");
}

/** The resolved layout entry for a node, typed at the call site. */
export function layoutOf<T>(ctx: RenderContext, node: AnyNode): T | undefined {
  return node.id ? (ctx.layout[node.id] as T | undefined) : undefined;
}

/**
 * The motif resolved for a node, **only if it renders**.
 *
 * The hard ornament cap (`docs/event-renderer-system.md §8`) lives here: a suppressed motif is
 * present in the spec as evidence and must not be drawn. Components call this rather than reading
 * `ctx.motifs` directly, so honouring the cap is the default and skipping it is a visible mistake.
 */
export function renderableMotif(ctx: RenderContext, node: AnyNode): ResolvedMotif | null {
  const m = node.id ? ctx.motifs[node.id] : undefined;
  return m && m.render ? m : null;
}

/** The section kinds a page is built from. */
export type SectionKind = CompositionTree["sections"][number]["kind"];
