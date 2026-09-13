/**
 * The 13 section recipes: 4 details, 5 rsvp, 4 registry — `recipe key` → a fresh section
 * `Section.root` on each call.
 *
 * Regression/expressiveness fixtures and rotated few-shot material only
 * (`docs/event-renderer-system.md §7.1`) — never a selection menu for generation.
 *
 * Ported from `proof-b/library.js` with no behaviour change (Phase 3, item 2).
 */

import type { CNode } from "../composition/nodes";
import { T, cell, split, stack } from "./helpers";

export type DetailsKey =
  "details_split_panel" | "details_stacked" | "details_grid" | "details_sidebar_rows";

export const DETAILS: Record<DetailsKey, () => CNode> = {
  details_split_panel: () =>
    split("38", [
      T("Surface", {
        role: "accent",
        child: stack([T("SectionHeading", { for: "details" }), T("Description")]),
      }),
      T("Frame", {
        rule: "hairline",
        inset: "normal",
        child: stack([
          stack([T("Date", { form: "full", emphasis: "primary" }), T("Time")]),
          T("Rule", { weight: "hairline" }),
          stack([T("Venue", { emphasis: "primary" }), T("Location")]),
        ]),
      }),
    ]),
  details_stacked: () =>
    stack(
      [
        T("SectionHeading", { for: "details" }),
        T("Description"),
        T("Rule", { weight: "hairline" }),
        stack([T("Date", { form: "full", emphasis: "primary" }), T("Time")], { align: "center" }),
        T("Rule", { weight: "hairline" }),
        stack([T("Venue", { emphasis: "primary" }), T("Location")], { align: "center" }),
        T("Rule", { weight: "hairline" }),
      ],
      { align: "center" },
    ),
  details_grid: () =>
    stack([
      T("SectionHeading", { for: "details" }),
      T("Description"),
      T("Grid", {
        columns: 3,
        ruled: true,
        mobile: 1,
        children: [
          cell(T("Date", { form: "full", emphasis: "primary" })),
          cell(T("Time", { emphasis: "primary" })),
          cell(stack([T("Venue", { emphasis: "primary" }), T("Location")])),
        ],
      }),
    ]),
  details_sidebar_rows: () =>
    stack([
      T("Rule", { weight: "hairline" }),
      split("38", [T("SectionHeading", { for: "details" }), T("Description")]),
      T("Rule", { weight: "hairline" }),
      split("38", [T("Date", { form: "full", emphasis: "primary" }), T("Time")]),
      T("Rule", { weight: "hairline" }),
      split("38", [T("Venue", { emphasis: "primary" }), T("Location")]),
      T("Rule", { weight: "hairline" }),
    ]),
};

export type RsvpKey =
  | "rsvp_contrast_split"
  | "rsvp_contained_card"
  | "rsvp_edge_interruption"
  | "rsvp_typographic_stack"
  | "rsvp_wide_heading";

export const RSVPS: Record<RsvpKey, () => CNode> = {
  rsvp_contrast_split: () =>
    split("38", [stack([T("SectionHeading", { for: "rsvp" }), T("Deadline")]), T("RSVP")]),
  rsvp_contained_card: () =>
    T("Frame", {
      rule: "hairline",
      inset: "normal",
      child: stack([T("SectionHeading", { for: "rsvp" }), T("Deadline"), T("RSVP")]),
    }),
  rsvp_edge_interruption: () =>
    stack([T("SectionHeading", { for: "rsvp", emphasis: "display" }), T("RSVP")]),
  rsvp_typographic_stack: () =>
    stack([T("SectionHeading", { for: "rsvp" }), T("Deadline"), T("RSVP")]),
  rsvp_wide_heading: () =>
    stack([
      T("Surface", {
        role: "accent",
        child: stack([T("Deadline"), T("SectionHeading", { for: "rsvp" })]),
      }),
      split("38", [T("Glyph", { motif: "botanical" }), T("RSVP")]),
    ]),
};

export type RegistryKey =
  "registry_featured" | "registry_tiles" | "registry_editorial_list" | "registry_uneven_grid";

export const REGISTRIES: Record<RegistryKey, () => CNode> = {
  registry_featured: () =>
    stack([
      T("SectionHeading", { for: "registry" }),
      T("Registry", {
        layout: split("62", [
          T("RegistryItem", { kind: "gift", emphasis: "featured" }),
          stack([T("RegistryItem", { kind: "external" }), T("RegistryItem", { kind: "cashfund" })]),
        ]),
      }),
    ]),
  registry_tiles: () =>
    stack([
      T("SectionHeading", { for: "registry" }),
      T("Registry", {
        layout: T("Grid", {
          columns: 3,
          mobile: 1,
          children: [
            cell(T("RegistryItem", { kind: "gift" })),
            cell(T("RegistryItem", { kind: "external" })),
            cell(T("RegistryItem", { kind: "cashfund" })),
          ],
        }),
      }),
    ]),
  registry_editorial_list: () =>
    stack([
      T("SectionHeading", { for: "registry" }),
      T("Registry", {
        layout: stack([
          T("RegistryItem", { kind: "gift" }),
          T("RegistryItem", { kind: "external" }),
          T("RegistryItem", { kind: "cashfund" }),
        ]),
      }),
    ]),
  registry_uneven_grid: () =>
    stack([
      T("SectionHeading", { for: "registry" }),
      T("Registry", {
        layout: T("Grid", {
          columns: 3,
          mobile: 1,
          children: [
            cell(T("RegistryItem", { kind: "gift", emphasis: "featured" }), { rowSpan: 2 }),
            cell(T("RegistryItem", { kind: "external" })),
            cell(T("RegistryItem", { kind: "cashfund" })),
          ],
        }),
      }),
    ]),
};
