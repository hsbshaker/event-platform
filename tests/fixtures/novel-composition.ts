/**
 * A hand-authored CompositionTree with no counterpart in the legacy fixture library.
 *
 * Shared by two tests that assert different halves of the Library Boundary Invariant
 * (`docs/event-renderer-system.md §7.1`): that a novel tree is first-class on the normal path
 * (`src/lib/renderer/composition/composition.test.ts`), and that handling it invokes neither
 * library adapter (`tests/unit/library-boundary.test.ts`). One fixture, so the two cannot drift.
 */

import type { CompositionTree } from "@/lib/renderer/composition/nodes";

/**
 * A deliberately novel composition: a Rail whose rail is a MotifField, wrapping a Split whose
 * halves hold an Overlay and a ruled Grid, over a surface sequence (accent → contrast → alt →
 * base → contrast) that no library recipe uses.
 */
export function novelTree(): CompositionTree {
  return {
    version: "composition_v1",
    sections: [
      {
        kind: "hero",
        surface: "accent",
        align: "center",
        fill: "screen",
        root: {
          t: "Rail",
          side: "end",
          width: "medium",
          mobile: "bottom",
          rail: { t: "MotifField", motif: { id: "gingham", role: "field" }, extent: "full" },
          child: {
            t: "Split",
            ratio: "62",
            align: "center",
            divider: "hairline",
            mobile: "stack-reverse",
            children: [
              {
                t: "Overlay",
                anchor: "bottom-end",
                extent: "third",
                mobile: "stack",
                content: {
                  t: "Stack",
                  gap: "tight",
                  align: "start",
                  children: [
                    { t: "Eyebrow" },
                    { t: "EventTitle", emphasis: "display", layout: "cascade" },
                    { t: "Hosts" },
                  ],
                },
                decoration: {
                  t: "MotifField",
                  motif: { id: "plaid", role: "field" },
                  extent: "third",
                },
              },
              {
                t: "Grid",
                columns: 2,
                mobile: 2,
                ruled: true,
                gap: "loose",
                children: [
                  { t: "Cell", child: { t: "Date", form: "numeral", emphasis: "display" } },
                  {
                    t: "Cell",
                    child: { t: "Stack", children: [{ t: "Venue" }, { t: "Location" }] },
                  },
                ],
              },
            ],
          },
        },
      },
      {
        kind: "details",
        surface: "contrast",
        root: {
          t: "Frame",
          rule: "double",
          inset: "deep",
          motif: { id: "stripe", role: "frame" },
          child: {
            t: "Stack",
            children: [
              { t: "SectionHeading", for: "details" },
              { t: "Description" },
              {
                t: "Cluster",
                children: [{ t: "Date", form: "full" }, { t: "Time" }, { t: "Venue" }],
              },
            ],
          },
        },
      },
      {
        kind: "rsvp",
        surface: "alt",
        root: {
          t: "Stack",
          children: [{ t: "SectionHeading", for: "rsvp" }, { t: "Deadline" }, { t: "RSVP" }],
        },
      },
      {
        kind: "registry",
        surface: "base",
        root: {
          t: "Surface",
          role: "alt",
          inset: "normal",
          child: {
            t: "Stack",
            children: [
              { t: "SectionHeading", for: "registry" },
              {
                t: "Registry",
                layout: {
                  t: "Grid",
                  columns: 3,
                  mobile: 1,
                  children: [
                    { t: "Cell", child: { t: "RegistryItem", kind: "gift" } },
                    { t: "Cell", child: { t: "RegistryItem", kind: "external" } },
                    { t: "Cell", child: { t: "RegistryItem", kind: "cashfund" } },
                  ],
                },
              },
            ],
          },
        },
      },
      {
        kind: "band",
        surface: "contrast",
        root: {
          t: "MotifBand",
          motif: { id: "linen", role: "band" },
          height: "tall",
          fill: "pattern",
        },
      },
    ],
  };
}
