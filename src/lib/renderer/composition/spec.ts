/**
 * The spec table: one source of truth for schema validation, structural validation and the
 * primitive spec text the model is prompted with (`specText()` is generated from `NODE_SPEC`, so
 * the prompt and the validator cannot drift — `docs/event-renderer-system.md §2`).
 *
 * The key order of `NODE_SPEC` and of each `props` object is observable: it is the order the
 * prompt lists primitives and props in. Do not reorder.
 *
 * Ported from `proof-b/src/composition.ts` with no behaviour change (Phase 3, item 1).
 */

import { ENUM } from "./tokens";

export type PropSpec = {
  enum?: readonly (string | number | boolean)[];
  type?: "motif" | "node" | "nodes";
  required?: boolean;
  doc?: string;
};

export type NodeSpec = {
  props: Record<string, PropSpec>;
  kind: "container" | "decorative" | "text" | "component";
  doc: string;
  children?: { min: number; max: number; allow: string };
};

const textProps = (doc: string): NodeSpec => ({
  kind: "text",
  doc,
  props: { emphasis: { enum: ENUM.Emphasis }, case: { enum: ["upper", "none"] } },
});

export const NODE_SPEC: Record<string, NodeSpec> = {
  Stack: {
    kind: "container",
    doc: "vertical column of children",
    props: { gap: { enum: ENUM.Gap }, align: { enum: ENUM.Align } },
    children: { min: 1, max: 8, allow: "any node" },
  },
  Cluster: {
    kind: "container",
    doc: "inline row that wraps; small items only (text, Date, CTA, Glyph, vertical Rule)",
    props: { gap: { enum: ENUM.Gap }, justify: { enum: ENUM.Justify } },
    children: { min: 2, max: 6, allow: "text nodes, Date, CTA, Glyph, Rule" },
  },
  Split: {
    kind: "container",
    doc: "two columns; ratio is the first child's share; divider draws a rule between the columns",
    props: {
      ratio: { enum: ENUM.Ratio, required: true },
      align: { enum: ["start", "center", "stretch"] },
      divider: { enum: ["none", "hairline", "strong", "dashed"] },
      mobile: { enum: ["stack", "stack-reverse", "keep"], required: true },
    },
    children: { min: 2, max: 2, allow: "any node" },
  },
  Rail: {
    kind: "container",
    doc: "a fixed-width column (rail) beside the main child; rail holds a MotifField or a Stack of at most 4 small leaves",
    props: {
      side: { enum: ["start", "end"], required: true },
      width: { enum: ENUM.RailWidth, required: true },
      rail: { type: "node", required: true },
      mobile: { enum: ["top", "bottom", "hide"], required: true },
      child: { type: "node", required: true },
    },
  },
  Grid: {
    kind: "container",
    doc: "equal columns of Cells; ruled draws hairlines between cells",
    props: {
      columns: { enum: [2, 3, 4], required: true },
      ruled: { enum: [true, false] },
      gap: { enum: ENUM.Gap },
      mobile: { enum: [1, 2], required: true },
    },
    children: { min: 2, max: 8, allow: "Cell only" },
  },
  Cell: {
    kind: "container",
    doc: "one grid cell",
    props: {
      span: { enum: [1, 2, 3, 4] },
      rowSpan: { enum: [1, 2] },
      child: { type: "node", required: true },
    },
  },
  Frame: {
    kind: "container",
    doc: "a ruled box with an inset margin; rule none makes it a plain inset; motif fills the margin",
    props: {
      rule: { enum: [...ENUM.RuleWeight, "none"], required: true },
      inset: { enum: ENUM.Inset, required: true },
      motif: { type: "motif" },
      child: { type: "node", required: true },
    },
  },
  Surface: {
    kind: "container",
    doc: "switches the surface role for its subtree (a panel, plate or card)",
    props: {
      role: { enum: ENUM.SurfaceRole, required: true },
      inset: { enum: ENUM.Inset },
      child: { type: "node", required: true },
    },
  },
  Overlay: {
    kind: "container",
    doc: "text-bearing content with one decorative object placed behind or beside it at an anchor; decoration may be MotifField, Monogram, Glyph, or Date numeral",
    props: {
      content: { type: "node", required: true },
      decoration: { type: "node", required: true },
      anchor: { enum: ENUM.Anchor, required: true },
      extent: { enum: ENUM.Extent, required: true },
      mobile: { enum: ["stack", "keep"], required: true },
    },
  },
  MotifField: {
    kind: "decorative",
    doc: "a patterned panel",
    props: { motif: { type: "motif", required: true }, extent: { enum: ENUM.Extent } },
  },
  MotifBand: {
    kind: "decorative",
    doc: "a full-width strip, patterned or accent-filled",
    props: {
      motif: { type: "motif" },
      height: { enum: ENUM.BandHeight, required: true },
      fill: { enum: ["pattern", "accent"] },
    },
  },
  Rule: {
    kind: "decorative",
    doc: "a rule, optionally with a glyph divider",
    props: {
      weight: { enum: ENUM.RuleWeight, required: true },
      orientation: { enum: ["h", "v"] },
      glyphs: { enum: ENUM.MotifId },
    },
  },
  Glyph: {
    kind: "decorative",
    doc: "an arranged ornament from the motif library",
    props: { motif: { enum: ENUM.MotifId, required: true }, scale: { enum: ["s", "m", "l"] } },
  },
  Monogram: {
    kind: "decorative",
    doc: "the initial",
    props: { style: { enum: ["ring", "plain", "watermark"], required: true } },
  },
  Artwork: {
    kind: "decorative",
    doc: "a place for original thematic artwork; role says what it is for, extent how much room it takes. You choose where artwork belongs and what it is for — never what it depicts, how big it is in pixels, or where on the page it sits",
    props: {
      role: { enum: ENUM.ArtworkRole, required: true },
      extent: { enum: ENUM.Extent },
    },
  },
  Eyebrow: textProps("short line above the title"),
  EventTitle: {
    kind: "text",
    doc: "the event title (required exactly once); layout stagger/cascade breaks it into staggered lines",
    props: {
      emphasis: { enum: ENUM.Emphasis },
      case: { enum: ["upper", "none"] },
      layout: { enum: ["block", "stagger", "cascade"] },
    },
  },
  Hosts: textProps("host names"),
  Description: textProps("one-paragraph description"),
  Deadline: textProps("RSVP deadline"),
  Venue: textProps("venue name"),
  Location: textProps("city, state"),
  Time: textProps("time range"),
  Date: {
    kind: "text",
    doc: "the date in one of four forms",
    props: {
      form: { enum: ["full", "numeral", "month-year", "weekday"], required: true },
      emphasis: { enum: ENUM.Emphasis },
    },
  },
  CTA: {
    kind: "text",
    doc: "call to action",
    props: {
      target: { enum: ["rsvp", "registry"], required: true },
      style: { enum: ["button", "link"] },
    },
  },
  SectionHeading: {
    kind: "text",
    doc: "the section's heading (copy is fixed)",
    props: {
      for: { enum: ["details", "rsvp", "registry"], required: true },
      emphasis: { enum: ["primary", "display"] },
    },
  },
  RSVP: { kind: "component", doc: "the RSVP form (opaque)", props: {} },
  Registry: {
    kind: "component",
    doc: "arranges the registry items; layout is a Grid, Stack or Split whose leaves are RegistryItem",
    props: { layout: { type: "node", required: true } },
  },
  RegistryItem: {
    kind: "component",
    doc: "one registry object (opaque card)",
    props: {
      kind: { enum: ["gift", "external", "cashfund"], required: true },
      emphasis: { enum: ["featured", "standard"] },
    },
  },
  CashFund: { kind: "component", doc: "standalone cash fund block", props: {} },
};

export const SECTION_SPEC = {
  kind: ["hero", "details", "rsvp", "registry", "band"],
  surface: ENUM.SurfaceRole,
  align: ENUM.Align,
  fill: ["auto", "screen"],
};

/**
 * Structural caps (`docs/event-renderer-system.md §2.4`). Exceeding one is repaired
 * deterministically, never re-prompted (`spec.md §32` #22).
 */
export const LIMITS = {
  sectionsMin: 3,
  sectionsMax: 6,
  nodesPerSection: 40,
  nodesPerPage: 160,
  depth: 5,
  perSection: { Overlay: 1, Rail: 1, Grid: 1, Frame: 1, MotifField: 2, Artwork: 1 },
  perPage: { Overlay: 2, Frame: 2, Artwork: 2 },
  bodyBytes: 12000,
  splitNesting: 2,
};
