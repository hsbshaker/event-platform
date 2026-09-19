/**
 * The primitive allowlist as TypeScript.
 *
 * A `CompositionTree` is trusted primitives with semantic leaves and enum tokens — never HTML,
 * CSS, JSX, JavaScript, pixels, free text, colors, fonts, or any node outside this union
 * (`docs/event-renderer-system.md §1.1`, §2.2; `spec.md §32` #15 forbids adding a primitive,
 * token or prop without a proof run and a primitive-set version bump).
 *
 * Ported from `proof-b/src/composition.ts` with no behaviour change (Phase 3, item 1).
 */

import type {
  Align,
  Anchor,
  BandHeight,
  Emphasis,
  Extent,
  Gap,
  Inset,
  Justify,
  MotifId,
  MotifRef,
  RailWidth,
  Ratio,
  RuleWeight,
  SurfaceRole,
} from "./tokens";

// ---------------------------------------------------------------- layout containers

export interface Stack {
  t: "Stack";
  gap?: Gap;
  align?: Align;
  children: CNode[];
}

export interface Cluster {
  t: "Cluster";
  gap?: Gap;
  justify?: Justify;
  children: CNode[];
}

export interface Split {
  t: "Split";
  ratio: Ratio;
  align?: "start" | "center" | "stretch";
  divider?: "none" | "hairline" | "strong" | "dashed";
  mobile: "stack" | "stack-reverse" | "keep";
  children: CNode[];
}

export interface Rail {
  t: "Rail";
  side: "start" | "end";
  width: RailWidth;
  rail: CNode;
  mobile: "top" | "bottom" | "hide";
  child: CNode;
}

export interface Grid {
  t: "Grid";
  columns: 2 | 3 | 4;
  ruled?: boolean;
  gap?: Gap;
  mobile: 1 | 2;
  children: CNode[];
}

export interface Cell {
  t: "Cell";
  span?: 1 | 2 | 3 | 4;
  rowSpan?: 1 | 2;
  child: CNode;
}

export interface Frame {
  t: "Frame";
  rule: RuleWeight | "none";
  inset: Inset;
  motif?: MotifRef;
  child: CNode;
}

export interface Surface {
  t: "Surface";
  role: SurfaceRole;
  inset?: Inset;
  child: CNode;
}

export interface Overlay {
  t: "Overlay";
  content: CNode;
  decoration: CNode;
  anchor: Anchor;
  extent: Extent;
  mobile: "stack" | "keep";
}

// ---------------------------------------------------------------- decorative leaves

export interface MotifField {
  t: "MotifField";
  motif: MotifRef;
  extent?: Extent;
}

export interface MotifBand {
  t: "MotifBand";
  motif?: MotifRef;
  height: BandHeight;
  fill?: "pattern" | "accent";
}

export interface RuleNode {
  t: "Rule";
  weight: RuleWeight;
  orientation?: "h" | "v";
  glyphs?: MotifId;
}

export interface Glyph {
  t: "Glyph";
  motif: MotifId;
  scale?: "s" | "m" | "l";
}

export interface Monogram {
  t: "Monogram";
  style: "ring" | "plain" | "watermark";
}

// ---------------------------------------------------------------- semantic leaves

export type TextKind =
  "Eyebrow" | "EventTitle" | "Hosts" | "Description" | "Deadline" | "Venue" | "Location" | "Time";

export interface TextNode {
  t: TextKind;
  emphasis?: Emphasis;
  case?: "upper" | "none";
  /** `layout` is EventTitle only. */
  layout?: "block" | "stagger" | "cascade";
}

export interface DateNode {
  t: "Date";
  form: "full" | "numeral" | "month-year" | "weekday";
  emphasis?: Emphasis;
}

export interface CTA {
  t: "CTA";
  target: "rsvp" | "registry";
  style?: "button" | "link";
}

export interface Heading {
  t: "SectionHeading";
  for: "details" | "rsvp" | "registry";
  emphasis?: "primary" | "display";
}

// ---------------------------------------------------------------- opaque components

export interface RSVP {
  t: "RSVP";
}

export interface Registry {
  t: "Registry";
  layout: CNode;
}

export interface RegistryItem {
  t: "RegistryItem";
  kind: "gift" | "external" | "cashfund";
  emphasis?: "featured" | "standard";
}

export interface CashFund {
  t: "CashFund";
}

export type CNode =
  | Stack
  | Cluster
  | Split
  | Rail
  | Grid
  | Cell
  | Frame
  | Surface
  | Overlay
  | MotifField
  | MotifBand
  | RuleNode
  | Glyph
  | Monogram
  | TextNode
  | DateNode
  | CTA
  | Heading
  | RSVP
  | Registry
  | RegistryItem
  | CashFund;

/** A node once canonicalization has stamped ids onto it. */
export type AnyNode = CNode & { id?: string };

export interface Section {
  kind: "hero" | "details" | "rsvp" | "registry" | "band";
  surface: SurfaceRole;
  align?: Align;
  fill?: "auto" | "screen";
  root: CNode;
  id?: string;
}

export interface CompositionTree {
  version: "composition_v1";
  sections: Section[];
}

/**
 * Capabilities: what this event actually has. The tree may only reference what is enabled.
 *
 * They derive from enabled features, never from whether content exists
 * (`docs/event-renderer-system.md §2.3`), so a first generation always has a designed place for
 * RSVP and registry.
 */
export interface Capabilities {
  rsvp: boolean;
  registry: boolean;
  gifts: boolean;
  externalRegistry: boolean;
  cashFund: boolean;
  hosts: boolean;
  description: boolean;
  time: boolean;
  location: boolean;
  deadline: boolean;
}

/**
 * How many registry items of each kind exist, so a Registry layout can be fitted against a real
 * shape rather than a guess.
 *
 * Keyed off `RegistryItem["kind"]` rather than a hand-written duplicate: a kind added to the
 * primitive without a count here is a compile error, which is the only way these two stay in step.
 */
export type RegistryCounts = Record<RegistryItem["kind"], number>;

/**
 * Present content, sent to the model for fit (`docs/event-renderer-system.md §2.3`).
 *
 * Separate from `Capabilities` on purpose, and no longer carries it. The two answer different
 * questions — *what is enabled* versus *what is written* — and merging them is how a stage starts
 * scoping a tree to content presence, which `spec.md §32 #16` forbids. `provisionalFields` names
 * every entry whose measurement came from a bounded stand-in rather than the host
 * (`spec.md §7.3`), so a re-fit knows what to re-measure when a real value arrives.
 */
export interface ContentProfile {
  titleWords: number;
  titleChars: number;
  hostsChars: number;
  venueChars: number;
  descriptionChars: number;
  registryCounts: RegistryCounts;
  provisionalFields: string[];
}

export interface Violation {
  rule: string;
  path: string;
  detail?: string;
}

/**
 * Every repair is logged as `{ rule, path, kind, before, after }`. No repair calls a model
 * (`docs/event-renderer-system.md §3`, `spec.md §32` #22).
 */
export interface Repair {
  rule: string;
  path: string;
  before?: string;
  after?: string;
  kind:
    | "structural"
    | "coverage"
    | "capability"
    | "responsive"
    | "fit-estimate"
    | "fit-verified"
    | "planner";
}
