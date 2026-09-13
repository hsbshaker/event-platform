/**
 * 5. Canonicalize (defaults, ids, hash).
 *
 * Fills every omitted token with its default, stamps a stable id on every node and section, and
 * hashes the result. The `compositionHash` is what a re-fit revision keeps unchanged when only
 * content changed (`docs/event-renderer-system.md §1.8`, §3), so both the defaults table and the
 * id scheme are part of the contract.
 *
 * Ported from `proof-b/src/composition.ts` with no behaviour change (Phase 3, item 1).
 */

import type { CompositionTree, DateNode } from "./nodes";
import { clone, fnv, walk } from "./walk";

export const DEFAULTS: Record<string, Record<string, unknown>> = {
  Stack: { gap: "normal" },
  Cluster: { gap: "normal", justify: "start" },
  Split: { align: "stretch", divider: "none" },
  Grid: { ruled: false, gap: "normal" },
  Cell: { span: 1, rowSpan: 1 },
  Surface: { inset: "normal" },
  MotifField: { extent: "full" },
  MotifBand: { fill: "pattern" },
  Rule: { orientation: "h" },
  Glyph: { scale: "m" },
  CTA: { style: "button" },
  SectionHeading: { emphasis: "primary" },
  RegistryItem: { emphasis: "standard" },
  // Date's default emphasis depends on its form; see below.
  Date: {},
  Eyebrow: { emphasis: "caption", case: "upper" },
  EventTitle: { emphasis: "display", case: "none", layout: "block" },
  Hosts: { emphasis: "secondary" },
  Description: { emphasis: "secondary" },
  Deadline: { emphasis: "caption" },
  Venue: { emphasis: "secondary" },
  Location: { emphasis: "secondary" },
  Time: { emphasis: "secondary" },
};

export function canonicalize(tree: CompositionTree): { tree: CompositionTree; hash: string } {
  const out = clone(tree);
  out.sections.forEach((s, i) => {
    s.align = s.align || "start";
    s.fill = s.fill || (s.kind === "hero" ? "screen" : "auto");
    s.id = `s${i}`;
  });
  walk(out, ({ node, path, sectionIndex }) => {
    // Writing defaults onto the node requires a dynamic key write; the node union has no index
    // signature, so the reference reached through `any` here.
    const rec = node as unknown as Record<string, unknown>;
    const d = DEFAULTS[node.t] || {};
    for (const [k, v] of Object.entries(d)) if (rec[k] === undefined) rec[k] = v;
    if (node.t === "Date" && rec.emphasis === undefined)
      rec.emphasis = (node as DateNode).form === "numeral" ? "display" : "secondary";
    node.id =
      `s${sectionIndex}` +
      path
        .replace(/^sections\[\d+\]\.root/, "")
        .replace(/\.children\[(\d+)\]/g, ".$1")
        .replace(/\.(child|rail|content|decoration|layout)/g, (_m, k: string) => "." + k[0]);
  });
  // The hash is taken over a key-sorted, id-free projection so that it identifies the composition
  // rather than the order the model happened to emit props in.
  const stable = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(stable)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x)
              .filter((k) => k !== "id")
              .sort()
              .map((k) => [k, stable((x as Record<string, unknown>)[k])]),
          )
        : x;
  return { tree: out, hash: fnv(JSON.stringify(stable(out))) };
}
