/**
 * The primitive map: one component per primitive, keyed by node type.
 *
 * The keys must equal `PRIMITIVE_KINDS` exactly, which is itself generated from the language's own
 * `NODE_SPEC` (`contract.ts`). That equality is the renderer's half of the Library Boundary
 * Invariant (`docs/event-renderer-system.md §7.1`, `docs/phase-3-invariant-obligations.md` row 10):
 * a renderer that had grown a branch per recipe would need a key here that is not a primitive, and
 * a primitive that had quietly lost its component would leave one missing. Both directions fail the
 * test.
 *
 * Nothing in this map is chosen at runtime. There is no ranking, no matching and no fallback entry
 * — a node type either is a primitive, in which case it has exactly one component, or it is not a
 * node the language admits and never reaches the renderer.
 */

import type { PrimitiveComponent } from "../contract";
import {
  CellPrimitive,
  ClusterPrimitive,
  FramePrimitive,
  GridPrimitive,
  OverlayPrimitive,
  RailPrimitive,
  SplitPrimitive,
  StackPrimitive,
  SurfacePrimitive,
} from "./containers";
import {
  GlyphPrimitive,
  MonogramPrimitive,
  MotifBandPrimitive,
  MotifFieldPrimitive,
  RulePrimitive,
} from "./decorative";
import {
  CTAPrimitive,
  DatePrimitive,
  DeadlinePrimitive,
  DescriptionPrimitive,
  EventTitlePrimitive,
  EyebrowPrimitive,
  HostsPrimitive,
  LocationPrimitive,
  SectionHeadingPrimitive,
  TimePrimitive,
  VenuePrimitive,
} from "./text";
import {
  CashFundPrimitive,
  RegistryItemPrimitive,
  RegistryPrimitive,
  RSVPPrimitive,
} from "./components";

export const PRIMITIVES: Record<string, PrimitiveComponent> = {
  // containers
  Stack: StackPrimitive,
  Cluster: ClusterPrimitive,
  Split: SplitPrimitive,
  Rail: RailPrimitive,
  Grid: GridPrimitive,
  Cell: CellPrimitive,
  Frame: FramePrimitive,
  Surface: SurfacePrimitive,
  Overlay: OverlayPrimitive,
  // decorative
  MotifField: MotifFieldPrimitive,
  MotifBand: MotifBandPrimitive,
  Rule: RulePrimitive,
  Glyph: GlyphPrimitive,
  Monogram: MonogramPrimitive,
  // text and semantic
  Eyebrow: EyebrowPrimitive,
  EventTitle: EventTitlePrimitive,
  Hosts: HostsPrimitive,
  Description: DescriptionPrimitive,
  Deadline: DeadlinePrimitive,
  Venue: VenuePrimitive,
  Location: LocationPrimitive,
  Time: TimePrimitive,
  Date: DatePrimitive,
  CTA: CTAPrimitive,
  SectionHeading: SectionHeadingPrimitive,
  // opaque components
  RSVP: RSVPPrimitive,
  Registry: RegistryPrimitive,
  RegistryItem: RegistryItemPrimitive,
  CashFund: CashFundPrimitive,
};
