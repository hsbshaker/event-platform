/**
 * Composition language tokens.
 *
 * Every model-authored value is one of these enums. There are no numbers except `Grid.columns`,
 * `Grid.mobile`, `Cell.span` and `Cell.rowSpan`, and no strings outside the enums
 * (`docs/event-renderer-system.md §2.1`). The model never emits pixels, colors, fonts or free
 * text (`spec.md §32` #12–16).
 *
 * Ported from `proof-b/src/composition.ts` with no behaviour change (Phase 3, item 1).
 */

export type Ratio = "38" | "50" | "62";
export type RailWidth = "thin" | "medium" | "wide";
export type BandHeight = "thin" | "medium" | "tall";
export type Inset = "tight" | "normal" | "deep";
export type Gap = "tight" | "normal" | "loose";
export type Align = "start" | "center" | "end";
export type Justify = "start" | "center" | "end" | "between";
export type Emphasis = "display" | "primary" | "secondary" | "caption";
export type SurfaceRole = "base" | "alt" | "contrast" | "accent";
export type RuleWeight = "hairline" | "strong" | "double";
export type Anchor = "top-start" | "top-end" | "bottom-start" | "bottom-end" | "center";
export type Extent = "quarter" | "third" | "half" | "full";
/**
 * What a piece of artwork is *for* on this page.
 *
 * Closed, and the four entries are `spec.md §7.6a`'s own in-scope list rather than a taxonomy
 * invented here: an illustrative anchor, transparent-background object art, subtle atmospheric
 * artwork, and framed/editorial illustration.
 *
 * It lives here, in the composition language, rather than in the visual-art contract, because the
 * composition tree is authored first and the role is the one thing about a piece of artwork the
 * *tree* decides. `src/lib/ai/visual-art/contract.ts` re-exports this list so the leaf and the
 * intent assembled from it cannot drift, and so the dependency runs ai → renderer, the direction
 * `src/lib/ai/composition/contract.ts` already established.
 *
 * Role decides how the compiler realizes the asset and how it degrades when no asset exists, so a
 * fifth role is a compiler change and a primitive-set version bump, never a prompt tweak.
 */
export const ARTWORK_ROLES = ["anchor", "object", "atmosphere", "framed"] as const;
export type ArtworkRole = (typeof ARTWORK_ROLES)[number];
export type MotifId =
  "plaid" | "stripe" | "gingham" | "linen" | "equestrian" | "botanical" | "celestial";
export type MotifRole = "field" | "band" | "frame" | "divider" | "accent";

export interface MotifRef {
  id: MotifId;
  role: MotifRole;
}

/**
 * The runtime enum table. It backs schema validation and the generated prompt text alike, so the
 * prompt the model sees can never drift from the validator (`docs/event-renderer-system.md §2`).
 */
export const ENUM = {
  Ratio: ["38", "50", "62"] as const,
  RailWidth: ["thin", "medium", "wide"] as const,
  BandHeight: ["thin", "medium", "tall"] as const,
  Inset: ["tight", "normal", "deep"] as const,
  Gap: ["tight", "normal", "loose"] as const,
  Align: ["start", "center", "end"] as const,
  Justify: ["start", "center", "end", "between"] as const,
  Emphasis: ["display", "primary", "secondary", "caption"] as const,
  SurfaceRole: ["base", "alt", "contrast", "accent"] as const,
  RuleWeight: ["hairline", "strong", "double"] as const,
  Anchor: ["top-start", "top-end", "bottom-start", "bottom-end", "center"] as const,
  Extent: ["quarter", "third", "half", "full"] as const,
  ArtworkRole: ARTWORK_ROLES,
  MotifId: ["plaid", "stripe", "gingham", "linen", "equestrian", "botanical", "celestial"] as const,
  MotifRole: ["field", "band", "frame", "divider", "accent"] as const,
};

/**
 * Motif kind decides the slot: patterns fill fields, bands and frame margins; arrangements are
 * glyphs and rule dividers. A motif in the wrong slot is swapped and logged as `motif.kind`,
 * never dropped silently (`docs/event-renderer-system.md §8`, `spec.md §32` #28).
 *
 * Typed as `string[]` rather than readonly tuples on purpose: they are membership-tested against
 * arbitrary strings arriving from model output.
 */
export const PATTERN_MOTIFS: string[] = ["plaid", "stripe", "gingham", "linen"];
export const ARRANGEMENT_MOTIFS: string[] = ["equestrian", "botanical", "celestial"];

/** Semantic text leaves bound to event content; the model chooses form and emphasis only. */
export const TEXT_KINDS: string[] = [
  "Eyebrow",
  "EventTitle",
  "Hosts",
  "Description",
  "Deadline",
  "Venue",
  "Location",
  "Time",
];

/** What a `Cluster` (an inline row that wraps) may hold — small items only. */
export const INLINE_LEAVES: string[] = [...TEXT_KINDS, "Date", "CTA", "Glyph", "Rule"];

/** Node types that count toward container depth (`LIMITS.depth`). */
export const CONTAINERS: string[] = [
  "Stack",
  "Cluster",
  "Split",
  "Rail",
  "Grid",
  "Frame",
  "Surface",
  "Overlay",
  "Registry",
];

/** A non-band section root must be one of these; bare leaves are forbidden. */
export const ROOT_TYPES: string[] = [
  "Stack",
  "Split",
  "Rail",
  "Grid",
  "Frame",
  "Surface",
  "Overlay",
];

/** Opaque guest components. Their internals are compiler-owned, never model-authored. */
export const COMPONENTS: string[] = ["RSVP", "Registry", "CashFund"];

/** The only parents wide and simple enough to hold a component. */
export const COMPONENT_PARENTS: string[] = [
  "section",
  "Stack",
  "Surface",
  "Frame",
  "Split",
  "Cell",
];
