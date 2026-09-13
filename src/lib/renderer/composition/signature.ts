/**
 * 6. Skeleton + signature.
 *
 * The skeleton is the structural fingerprint of a page: primitive types with structural tokens
 * only, plain text dropped. Hero similarity is normalized token-sequence edit distance with a
 * floor on partial overlap, computed separately for desktop and the mobile-resolved skeleton.
 * The collision threshold is 0.70, calibrated on the library — mirror pairs collide, distinct
 * recipes do not (`docs/event-renderer-system.md §5`, §7).
 *
 * Ported from `proof-b/src/composition.ts` with no behaviour change (Phase 3, item 1).
 */

import type { AnyNode, Cell, CompositionTree, Grid, Overlay, Rail, Split } from "./nodes";

export function skeletonTokens(n: AnyNode, mode: "desktop" | "mobile"): string[] {
  const kids = (arr: AnyNode[]) => arr.flatMap((c) => skeletonTokens(c, mode));
  switch (n.t) {
    case "Split": {
      const a = n as Split;
      if (mode === "mobile" && a.mobile !== "keep") {
        const ch = a.mobile === "stack-reverse" ? [a.children[1], a.children[0]] : a.children;
        return ["Stack(", ...kids(ch), ")"];
      }
      return [`Split:${a.ratio}(`, ...kids(a.children), ")"];
    }
    case "Rail": {
      const a = n as Rail;
      if (mode === "mobile") {
        if (a.mobile === "hide") return skeletonTokens(a.child, mode);
        const ch = a.mobile === "top" ? [a.rail, a.child] : [a.child, a.rail];
        return ["Stack(", ...kids(ch), ")"];
      }
      return [
        `Rail:${a.side}:${a.width}(`,
        ...skeletonTokens(a.rail, mode),
        "|",
        ...skeletonTokens(a.child, mode),
        ")",
      ];
    }
    case "Grid": {
      const a = n as Grid;
      if (mode === "mobile" && a.mobile === 1)
        return ["Stack(", ...kids(a.children.map((c) => (c as Cell).child)), ")"];
      return [
        `Grid:${mode === "mobile" ? a.mobile : a.columns}${a.ruled ? ":ruled" : ""}(`,
        ...a.children.flatMap((child) => {
          const c = child as Cell;
          return [
            `Cell:${c.span || 1}${(c.rowSpan || 1) > 1 ? ":tall" : ""}(`,
            ...skeletonTokens(c.child, mode),
            ")",
          ];
        }),
        ")",
      ];
    }
    case "Overlay": {
      const a = n as Overlay;
      if (mode === "mobile" && a.mobile === "stack")
        return ["Stack(", ...skeletonTokens(a.content, mode), "MotifBand", ")"];
      return [
        `Overlay:${a.anchor}:${a.extent}(`,
        ...skeletonTokens(a.content, mode),
        "|",
        ...skeletonTokens(a.decoration, mode),
        ")",
      ];
    }
    case "Frame":
      return [
        `Frame:${n.rule === "none" ? "inset" : "ruled"}:${n.inset}(`,
        ...skeletonTokens(n.child, mode),
        ")",
      ];
    case "Surface":
      return [`Surface:${n.role}(`, ...skeletonTokens(n.child, mode), ")"];
    case "Stack":
      return ["Stack(", ...kids(n.children), ")"];
    case "Cluster":
      return [];
    case "Cell":
      return skeletonTokens(n.child, mode);
    case "MotifField":
      return [`MotifField:${n.motif.role}`];
    case "MotifBand":
      return [`MotifBand:${n.height}`];
    case "Date":
      return [`Date:${n.form}`];
    case "EventTitle":
      return [n.layout && n.layout !== "block" ? `Title:${n.layout}` : "Title"];
    case "Monogram":
      return [`Monogram:${n.style}`];
    case "Registry":
      return ["Registry(", ...skeletonTokens(n.layout, mode), ")"];
    case "RegistryItem":
      return [`Item:${n.kind}`];
    case "RSVP":
      return ["RSVP"];
    case "CashFund":
      return ["CashFund"];
    default:
      return []; // plain text, CTA, Rule, Glyph, headings are not structural
  }
}

function levenshtein(a: string[], b: string[]): number {
  const m = a.length,
    n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[m][n];
}

export function seqSim(a: string[], b: string[]) {
  const L = Math.max(a.length, b.length);
  return L ? 1 - levenshtein(a, b) / L : 1;
}

/** Drop empty containers left after removing plain text. */
function compress(tokens: string[]) {
  const out: string[] = [];
  for (const t of tokens) {
    if (t === ")" && /\($/.test(out[out.length - 1] || "")) {
      out.pop();
      continue;
    }
    out.push(t);
  }
  return out;
}

export interface Skeleton {
  hero: string[];
  surfaces: string[];
  rsvp: string[];
  registry: string[];
  align: string;
  heroString: string;
}

export function skeleton(tree: CompositionTree, mode: "desktop" | "mobile"): Skeleton {
  const sec = (k: string) => tree.sections.find((s) => s.kind === k);
  const hero = compress(skeletonTokens(sec("hero")!.root as AnyNode, mode));
  const r = sec("rsvp"),
    g = sec("registry");
  return {
    hero,
    surfaces: tree.sections.map((s) => s.surface),
    rsvp: r ? compress(skeletonTokens(r.root as AnyNode, mode)) : [],
    registry: g ? compress(skeletonTokens(g.root as AnyNode, mode)) : [],
    align: sec("hero")!.align || "start",
    heroString: hero.join(" "),
  };
}

export const SIG_WEIGHTS = {
  desktop: {
    hero: 0.45,
    surfaces: 0.15,
    rsvp: 0.1,
    registry: 0.1,
    align: 0.05,
    category: 0.1,
    tone: 0.05,
  },
  mobile: {
    hero: 0.5,
    surfaces: 0.2,
    rsvp: 0.05,
    registry: 0.1,
    align: 0,
    category: 0.1,
    tone: 0.05,
  },
};

export interface SigInput {
  tree: CompositionTree;
  category?: string;
  tone?: string;
}

export function similarity(a: SigInput, b: SigInput, mode: "desktop" | "mobile"): number {
  const w = SIG_WEIGHTS[mode];
  const sa = skeleton(a.tree, mode),
    sb = skeleton(b.tree, mode);
  // partial overlap below .5 (every hero has a title stack) earns nothing
  const heroTerm = Math.max(0, (seqSim(sa.hero, sb.hero) - 0.5) / 0.5);
  let s =
    w.hero * heroTerm +
    w.surfaces * (sa.surfaces.join() === sb.surfaces.join() ? 1 : 0) +
    w.rsvp * seqSim(sa.rsvp, sb.rsvp) +
    w.registry * seqSim(sa.registry, sb.registry) +
    w.align * (sa.align === sb.align ? 1 : 0);
  // tree-only comparison assumes the rest matches (conservative)
  if (a.category !== undefined)
    s += w.category * (a.category === b.category ? 1 : 0) + w.tone * (a.tone === b.tone ? 1 : 0);
  else s += w.category + w.tone;
  return Math.round(s * 100) / 100;
}

export function heroSimilarity(
  a: CompositionTree,
  b: CompositionTree,
  mode: "desktop" | "mobile" = "desktop",
) {
  return Math.round(seqSim(skeleton(a, mode).hero, skeleton(b, mode).hero) * 100) / 100;
}
