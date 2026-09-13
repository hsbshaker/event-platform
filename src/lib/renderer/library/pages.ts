/**
 * Surface plans, `page()`, and the 16 A.1 site rows.
 *
 * Regression/expressiveness fixtures and rotated few-shot material only
 * (`docs/event-renderer-system.md §7.1`) — never a selection menu for generation.
 *
 * Ported from `proof-b/library.js` with no behaviour change (Phase 3, item 2).
 */

import type { Align, MotifId, SurfaceRole } from "../composition/tokens";
import type { CompositionTree, Section } from "../composition/nodes";
import {
  DETAILS,
  REGISTRIES,
  RSVPS,
  type DetailsKey,
  type RegistryKey,
  type RsvpKey,
} from "./sections";
import { HEROES, type HeroKey } from "./heroes";

export interface SurfacePlan {
  hero: SurfaceRole;
  band: SurfaceRole | null;
  details: SurfaceRole;
  rsvp: SurfaceRole;
  registry: SurfaceRole;
  axis: Align;
}

export type PlanKey =
  | "SP1_dark_opening"
  | "SP2_continuous_light"
  | "SP3_interrupted"
  | "SP4_alternating"
  | "SP5_framed_body"
  | "SP6_deepening";

export const PLANS: Record<PlanKey, SurfacePlan> = {
  SP1_dark_opening: {
    hero: "contrast",
    band: null,
    details: "base",
    rsvp: "contrast",
    registry: "base",
    axis: "start",
  },
  SP2_continuous_light: {
    hero: "base",
    band: null,
    details: "base",
    rsvp: "alt",
    registry: "base",
    axis: "start",
  },
  SP3_interrupted: {
    hero: "base",
    band: "alt",
    details: "base",
    rsvp: "contrast",
    registry: "alt",
    axis: "start",
  },
  SP4_alternating: {
    hero: "contrast",
    band: null,
    details: "alt",
    rsvp: "base",
    registry: "contrast",
    axis: "start",
  },
  SP5_framed_body: {
    hero: "base",
    band: null,
    details: "base",
    rsvp: "base",
    registry: "base",
    axis: "start",
  },
  SP6_deepening: {
    hero: "base",
    band: null,
    details: "alt",
    rsvp: "alt",
    registry: "contrast",
    axis: "start",
  },
};

export function page(
  heroKey: HeroKey,
  details: DetailsKey,
  rsvp: RsvpKey,
  registry: RegistryKey,
  plan: PlanKey,
  align: Align = "start",
  bandMotif: MotifId = "linen",
): CompositionTree {
  const P = PLANS[plan];
  const secs: Section[] = [
    { kind: "hero", surface: P.hero, align, fill: "screen", root: HEROES[heroKey]() },
  ];
  if (P.band) {
    secs.push({
      kind: "band",
      surface: P.band,
      root: { t: "MotifBand", motif: { id: bandMotif, role: "band" }, height: "tall" },
    });
  }
  secs.push({ kind: "details", surface: P.details, align, root: DETAILS[details]() });
  secs.push({ kind: "rsvp", surface: P.rsvp, align, root: RSVPS[rsvp]() });
  secs.push({ kind: "registry", surface: P.registry, align, root: REGISTRIES[registry]() });
  return { version: "composition_v1", sections: secs };
}

export interface A1Site {
  id: string;
  hero: HeroKey;
  details: DetailsKey;
  rsvp: RsvpKey;
  registry: RegistryKey;
  plan: PlanKey;
  align: "start" | "center";
}

export const A1_SITES: readonly A1Site[] = [
  {
    id: "01",
    hero: "editorial_split:field_right",
    details: "details_split_panel",
    rsvp: "rsvp_contrast_split",
    registry: "registry_featured",
    plan: "SP1_dark_opening",
    align: "start",
  },
  {
    id: "02",
    hero: "framed_invitation:thin_frame",
    details: "details_stacked",
    rsvp: "rsvp_typographic_stack",
    registry: "registry_tiles",
    plan: "SP5_framed_body",
    align: "center",
  },
  {
    id: "03",
    hero: "typography_first:band_below",
    details: "details_grid",
    rsvp: "rsvp_typographic_stack",
    registry: "registry_uneven_grid",
    plan: "SP3_interrupted",
    align: "start",
  },
  {
    id: "04",
    hero: "editorial_masthead:rail_right",
    details: "details_sidebar_rows",
    rsvp: "rsvp_edge_interruption",
    registry: "registry_editorial_list",
    plan: "SP2_continuous_light",
    align: "start",
  },
  {
    id: "05",
    hero: "editorial_offset:plate_left",
    details: "details_sidebar_rows",
    rsvp: "rsvp_contained_card",
    registry: "registry_uneven_grid",
    plan: "SP4_alternating",
    align: "start",
  },
  {
    id: "06",
    hero: "invitation_card:floating",
    details: "details_grid",
    rsvp: "rsvp_typographic_stack",
    registry: "registry_tiles",
    plan: "SP6_deepening",
    align: "center",
  },
  {
    id: "07",
    hero: "invitation_monogram:crest",
    details: "details_stacked",
    rsvp: "rsvp_edge_interruption",
    registry: "registry_featured",
    plan: "SP2_continuous_light",
    align: "center",
  },
  {
    id: "08",
    hero: "statement_stack:alternate",
    details: "details_split_panel",
    rsvp: "rsvp_edge_interruption",
    registry: "registry_editorial_list",
    plan: "SP4_alternating",
    align: "start",
  },
  {
    id: "09",
    hero: "editorial_split:field_left",
    details: "details_grid",
    rsvp: "rsvp_typographic_stack",
    registry: "registry_tiles",
    plan: "SP6_deepening",
    align: "start",
  },
  {
    id: "10",
    hero: "framed_invitation:deep_margin",
    details: "details_grid",
    rsvp: "rsvp_contained_card",
    registry: "registry_editorial_list",
    plan: "SP1_dark_opening",
    align: "center",
  },
  {
    id: "11",
    hero: "typography_first:band_rail",
    details: "details_sidebar_rows",
    rsvp: "rsvp_wide_heading",
    registry: "registry_featured",
    plan: "SP5_framed_body",
    align: "start",
  },
  {
    id: "12",
    hero: "editorial_masthead:band_top",
    details: "details_split_panel",
    rsvp: "rsvp_contrast_split",
    registry: "registry_uneven_grid",
    plan: "SP3_interrupted",
    align: "start",
  },
  {
    id: "13",
    hero: "editorial_daterail:rail_left",
    details: "details_grid",
    rsvp: "rsvp_wide_heading",
    registry: "registry_uneven_grid",
    plan: "SP4_alternating",
    align: "start",
  },
  {
    id: "14",
    hero: "invitation_ticket:stub_right",
    details: "details_stacked",
    rsvp: "rsvp_contained_card",
    registry: "registry_tiles",
    plan: "SP6_deepening",
    align: "center",
  },
  {
    id: "15",
    hero: "statement_numeral:numeral_left",
    details: "details_split_panel",
    rsvp: "rsvp_contrast_split",
    registry: "registry_editorial_list",
    plan: "SP1_dark_opening",
    align: "start",
  },
  {
    id: "16",
    hero: "editorial_rulegrid:cells",
    details: "details_sidebar_rows",
    rsvp: "rsvp_edge_interruption",
    registry: "registry_featured",
    plan: "SP2_continuous_light",
    align: "start",
  },
];
