/**
 * 4. Content fit (estimate).
 *
 * Advisory only. A spec is final only when rendered-geometry verification is clean at 390 and
 * 1280; this static estimate never becomes authoritative and never weakens the zero-overflow
 * criterion (`docs/event-renderer-system.md §1.6`, §3.1; `spec.md §32` #24).
 *
 * Ported from `proof-b/src/composition.ts` with no behaviour change (Phase 3, item 1).
 */

import type {
  AnyNode,
  Cell,
  CompositionTree,
  CTA,
  DateNode,
  Frame,
  Grid,
  Heading,
  Overlay,
  Rail,
  Repair,
  Split,
} from "./nodes";
import type { Emphasis, Extent, Inset, RailWidth } from "./tokens";
import { childrenOf, clone, isText, walk } from "./walk";

/** Line limits per emphasis: display and primary get three lines at desktop, four at mobile. */
export const FIT_LIMITS = {
  desktop: { display: 3, primary: 3 },
  mobile: { display: 4, primary: 4 },
};

export interface FitMetrics {
  displayPx: Record<Emphasis, number>;
  avgCharEm: number;
  widthPx: number;
}

export function textFor(node: AnyNode, content: Record<string, string>): string {
  if (node.t === "Date") {
    const d = node as DateNode;
    return d.form === "numeral"
      ? content.dayNumeral
      : d.form === "month-year"
        ? `${content.monthShort} ${content.year}`
        : d.form === "weekday"
          ? content.weekday
          : content.date;
  }
  // SectionHeading copy comes from a compiler table, never from the model.
  if (node.t === "SectionHeading")
    return {
      details: "Join us at the lodge.",
      rsvp: "Will you be there?",
      registry: "A few things we love.",
    }[(node as Heading).for];
  if (node.t === "CTA") return (node as CTA).target === "rsvp" ? "RSVP" : "Registry";
  return content[node.t.toLowerCase()] || "";
}

/** Fraction of the section width available to each node, by path. */
export function widthShares(
  tree: CompositionTree,
  mode: "desktop" | "mobile",
): Record<string, number> {
  const shares: Record<string, number> = {};
  const rec = (n: AnyNode, path: string, share: number) => {
    shares[path] = share;
    if (n.t === "Split") {
      const a = n as Split;
      const r = Number(a.ratio) / 100;
      const stacked = mode === "mobile" && a.mobile !== "keep";
      rec(a.children[0], `${path}.children[0]`, stacked ? share : share * r);
      rec(a.children[1], `${path}.children[1]`, stacked ? share : share * (1 - r));
      return;
    }
    if (n.t === "Rail") {
      const a = n as Rail;
      const rw = { thin: 0.08, medium: 0.15, wide: 0.25 }[a.width as RailWidth];
      const stacked = mode === "mobile";
      rec(a.rail, `${path}.rail`, stacked ? share : share * rw);
      rec(a.child, `${path}.child`, stacked ? share : share * (1 - rw));
      return;
    }
    if (n.t === "Grid") {
      const a = n as Grid;
      const cols = mode === "mobile" ? a.mobile : a.columns;
      a.children.forEach((c, i) =>
        rec(c, `${path}.children[${i}]`, share * Math.min(1, ((c as Cell).span || 1) / cols)),
      );
      return;
    }
    if (n.t === "Frame") {
      const a = n as Frame;
      const ins = { tight: 0.04, normal: 0.08, deep: 0.14 }[a.inset as Inset];
      rec(a.child, `${path}.child`, share * (1 - 2 * ins));
      return;
    }
    if (n.t === "Overlay") {
      const a = n as Overlay;
      rec(a.content, `${path}.content`, share);
      rec(
        a.decoration,
        `${path}.decoration`,
        share * { quarter: 0.25, third: 0.33, half: 0.5, full: 1 }[a.extent as Extent],
      );
      return;
    }
    for (const c of childrenOf(n)) rec(c.node, `${path}.${c.key}`, share);
  };
  tree.sections.forEach((s, i) => rec(s.root as AnyNode, `sections[${i}].root`, 1));
  return shares;
}

export function estimateFit(
  tree: CompositionTree,
  content: Record<string, string>,
  metrics: Record<"desktop" | "mobile", FitMetrics>,
): { tree: CompositionTree; repairs: Repair[] } {
  const out = clone(tree);
  const repairs: Repair[] = [];
  for (const mode of ["desktop", "mobile"] as const) {
    const m = metrics[mode];
    const shares = widthShares(out, mode);
    walk(out, ({ node, path }) => {
      if (!isText(node)) return;
      const a = node as { emphasis?: Emphasis };
      let emph: Emphasis =
        a.emphasis ||
        (node.t === "EventTitle"
          ? "display"
          : node.t === "SectionHeading"
            ? "primary"
            : "secondary");
      const text = textFor(node, content);
      if (!text) return;
      for (let i = 0; i < 3; i++) {
        const limit = (FIT_LIMITS[mode] as Partial<Record<Emphasis, number>>)[emph];
        if (!limit) break;
        const px = m.displayPx[emph];
        const width = m.widthPx * shares[path];
        const charsPerLine = Math.max(4, width / (px * m.avgCharEm));
        const lines = Math.ceil(text.length / charsPerLine);
        if (lines <= limit) break;
        const next: Emphasis =
          emph === "display" ? "primary" : emph === "primary" ? "secondary" : "caption";
        repairs.push({
          rule: "fit.estimate",
          path,
          kind: "fit-estimate",
          before: `${emph} (${mode}: ~${lines} lines)`,
          after: next,
        });
        a.emphasis = next;
        emph = next;
      }
    });
  }
  return { tree: out, repairs };
}
