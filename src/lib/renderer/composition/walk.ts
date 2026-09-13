/**
 * Tree traversal helpers shared by validation, repair, fit estimation, canonicalization and
 * layout resolution.
 *
 * Traversal order is load-bearing: it decides the order violations and repairs are emitted in,
 * and therefore which node a "first fixable violation" repair picks. Do not reorder `childrenOf`
 * or `walk`.
 *
 * Ported from `proof-b/src/composition.ts` with no behaviour change (Phase 3, item 1).
 */

import type { AnyNode, CNode, CompositionTree } from "./nodes";
import { CONTAINERS, TEXT_KINDS } from "./tokens";

export type Visit = {
  node: AnyNode;
  path: string;
  parent: AnyNode | null;
  parentKey: string;
  ancestors: AnyNode[];
  sectionIndex: number;
};

/**
 * Children in a fixed order: the `children[]` array first, then the single-node slots in the
 * order `child, rail, content, decoration, layout`.
 */
export function childrenOf(n: AnyNode): { key: string; node: AnyNode }[] {
  const out: { key: string; node: AnyNode }[] = [];
  // The node union has no common index signature; the reference reached through `any` here and
  // the dynamic read is exactly the point of the helper.
  const a = n as unknown as Record<string, unknown>;
  if (Array.isArray(a.children))
    a.children.forEach((c: AnyNode, i: number) => out.push({ key: `children[${i}]`, node: c }));
  for (const k of ["child", "rail", "content", "decoration", "layout"])
    if (a[k] && typeof a[k] === "object") out.push({ key: k, node: a[k] as AnyNode });
  return out;
}

/** Depth-first pre-order walk over every section root. */
export function walk(tree: CompositionTree, fn: (v: Visit) => void) {
  tree.sections.forEach((s, si) => {
    const rec = (
      node: AnyNode,
      path: string,
      parent: AnyNode | null,
      parentKey: string,
      ancestors: AnyNode[],
    ) => {
      fn({ node, path, parent, parentKey, ancestors, sectionIndex: si });
      for (const c of childrenOf(node))
        rec(c.node, `${path}.${c.key}`, node, c.key, [...ancestors, node]);
    };
    rec(s.root as AnyNode, `sections[${si}].root`, null, "section", []);
  });
}

export function count(tree: CompositionTree, pred: (v: Visit) => boolean): number {
  let n = 0;
  walk(tree, (v) => {
    if (pred(v)) n++;
  });
  return n;
}

export function isText(n: AnyNode) {
  return TEXT_KINDS.includes(n.t) || n.t === "Date" || n.t === "SectionHeading";
}

export function hasTextDescendant(n: AnyNode): boolean {
  if (isText(n)) return true;
  return childrenOf(n).some((c) => hasTextDescendant(c.node));
}

export function containerDepth(ancestors: AnyNode[]) {
  return ancestors.filter((a) => CONTAINERS.includes(a.t)).length;
}

/**
 * Structural clone through JSON. It preserves key insertion order and drops `undefined`-valued
 * keys, both of which the canonical hash depends on.
 */
export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

/**
 * FNV-1a, 32-bit, lower-case hex, zero-padded to eight characters. This is the `compositionHash`
 * persisted per concept (`docs/event-renderer-system.md §1.8`), so the arithmetic must stay
 * bit-identical: `Math.imul`, `>>> 0`, `padStart(8, "0")`.
 */
export function fnv(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function countNodes(n: AnyNode): number {
  return 1 + childrenOf(n).reduce((a, c) => a + countNodes(c.node), 0);
}

/**
 * Counts text nodes in a subtree. The reference defines this helper but never calls it; it is
 * carried over so the port is complete.
 */
export function countText(n: AnyNode): number {
  let c = isText(n) ? 1 : 0;
  for (const ch of childrenOf(n)) c += countText(ch.node);
  return c;
}

/** Path of the last node of type `t` in section `si` (`si < 0` searches the whole page). */
export function findLast(tree: CompositionTree, si: number, t: string): string | null {
  let p: string | null = null;
  walk(tree, (v) => {
    if ((si < 0 || v.sectionIndex === si) && v.node.t === t) p = v.path;
  });
  return p;
}

export function findFirst(n: CNode, t: string): AnyNode | null {
  if (n.t === t) return n;
  for (const c of childrenOf(n)) {
    const f = findFirst(c.node, t);
    if (f) return f;
  }
  return null;
}
