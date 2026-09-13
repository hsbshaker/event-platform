/**
 * Resolved layout, stated intrinsically.
 *
 * `resolveLayout` itself was ported with the language core and is pinned byte-for-byte against
 * `proof-b` in `composition/parity.test.ts`. What the parity test cannot say is *why* the shape is
 * right, and those properties have to outlive `proof-b`: every canonical node gets an entry, every
 * value is a number or an enum token, the CompositionTree's mobile intent is carried through
 * untouched, and nothing is a CSS string (`docs/event-renderer-system.md §6`, `spec.md §32` #19).
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` and
 * `Responsive/accessibility`.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { canonicalize } from "../composition/canonicalize";
import { SCALES, resolveLayout } from "../composition/layout";
import type { CompositionTree } from "../composition/nodes";
import { walk } from "../composition/walk";
import type { Density } from "../design-intent";
import { novelTree } from "../../../../tests/fixtures/novel-composition";

const DENSITIES: Density[] = ["compact", "balanced", "spacious"];

const GOLDEN = new URL("../../../../tests/fixtures/renderer-golden/", import.meta.url).pathname;

/** The 16 A.1 pages and the 72 frozen trees, as captured — canonical trees, no `proof-b` needed. */
function capturedTrees(): { name: string; tree: CompositionTree }[] {
  const out: { name: string; tree: CompositionTree }[] = [];
  const pages = JSON.parse(readFileSync(`${GOLDEN}library-pages.json`, "utf8")) as Record<
    string,
    { canonical: { tree: CompositionTree } | CompositionTree }
  >;
  for (const [name, entry] of Object.entries(pages)) {
    const c = entry.canonical as { tree?: CompositionTree } & CompositionTree;
    out.push({ name: `page:${name}`, tree: (c.tree ?? c) as CompositionTree });
  }
  for (const set of ["frozen-final", "frozen-final-reduced"]) {
    const trees = JSON.parse(readFileSync(`${GOLDEN}${set}.json`, "utf8")) as Record<
      string,
      { spec: { composition: CompositionTree } }
    >;
    for (const [id, rec] of Object.entries(trees))
      out.push({ name: `${set}:${id}`, tree: rec.spec.composition });
  }
  return out;
}

/** Anything that looks like authored CSS rather than a resolved value. */
function looksLikeCss(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /(?:^|[^a-z])(?:px|rem|em|vw|vh|%|clamp|calc|var|color-mix|#[0-9a-f]{3,8}|;|:\s)/i.test(
    value,
  );
}

function everyValue(value: unknown, visit: (v: unknown) => void): void {
  if (Array.isArray(value)) value.forEach((v) => everyValue(v, visit));
  else if (value && typeof value === "object")
    Object.values(value).forEach((v) => everyValue(v, visit));
  else visit(value);
}

describe("resolved layout: coverage", () => {
  it("gives every canonical node in every captured tree an entry", () => {
    const trees = capturedTrees();
    expect(trees.length).toBe(16 + 72);
    for (const { name, tree } of trees) {
      const layout = resolveLayout(tree, "balanced");
      const ids: string[] = [];
      walk(tree, ({ node }) => ids.push(node.id!));
      expect(ids.length, `${name} has no nodes`).toBeGreaterThan(0);
      for (const id of ids)
        expect(layout[id], `${name}: node ${id} has no resolved layout`).toBeDefined();
      expect(Object.keys(layout).sort()).toEqual([...new Set(ids)].sort());
    }
  });

  it("covers a novel tree with no library counterpart just the same", () => {
    const tree = canonicalize(novelTree()).tree;
    const layout = resolveLayout(tree, "balanced");
    const ids: string[] = [];
    walk(tree, ({ node }) => ids.push(node.id!));
    for (const id of ids) expect(layout[id], `node ${id}`).toBeDefined();
  });
});

describe("resolved layout: no CSS, no free values", () => {
  it("emits no CSS string anywhere, at any density", () => {
    for (const { name, tree } of capturedTrees()) {
      for (const density of DENSITIES) {
        everyValue(resolveLayout(tree, density), (v) => {
          expect(
            looksLikeCss(v),
            `${name} at ${density} emitted a CSS-looking value: ${String(v)}`,
          ).toBe(false);
        });
      }
    }
  });

  it("emits only numbers from the declared scales, never a free pixel value", () => {
    const approved = new Set<number>([
      ...Object.values(SCALES.railPx),
      ...Object.values(SCALES.bandPx),
      ...Object.values(SCALES.insetPx),
      ...Object.values(SCALES.extentPct),
      ...DENSITIES.flatMap((d) => Object.values(SCALES.gapPx[d])),
    ]);
    for (const { name, tree } of capturedTrees()) {
      for (const density of DENSITIES) {
        for (const [id, entry] of Object.entries(resolveLayout(tree, density))) {
          const e = entry as Record<string, unknown>;
          for (const key of ["gapPx", "insetPx", "widthPx", "heightPx", "extentPct"]) {
            if (typeof e[key] === "number")
              expect(approved.has(e[key] as number), `${name} ${id}.${key} = ${e[key]}`).toBe(true);
          }
          // Split ratios and grid columns are the tree's own enum values, not derived pixels.
          if (typeof e.first === "number") expect([38, 50, 62]).toContain(e.first);
          if (typeof e.columns === "number") expect([2, 3, 4]).toContain(e.columns);
        }
      }
    }
  });
});

describe("resolved layout: density and mobile intent", () => {
  it("changes gaps with density and nothing else", () => {
    for (const { name, tree } of capturedTrees().slice(0, 20)) {
      const compact = resolveLayout(tree, "compact");
      const spacious = resolveLayout(tree, "spacious");
      let gapsDiffered = false;
      for (const id of Object.keys(compact)) {
        const a = compact[id] as Record<string, unknown>;
        const b = spacious[id] as Record<string, unknown>;
        for (const key of Object.keys(a)) {
          if (key === "gapPx") {
            if (a[key] !== b[key]) gapsDiffered = true;
          } else {
            expect(b[key], `${name} ${id}.${key} moved with density`).toEqual(a[key]);
          }
        }
      }
      expect(gapsDiffered || Object.keys(compact).length === 0).toBe(true);
    }
  });

  it("carries the tree's mobile intent through untouched, never inventing one", () => {
    // The tree owns mobile *intent*; the compiler owns the responsive values. So the intent token
    // must survive verbatim, and must only appear where the tree put one.
    for (const { name, tree } of capturedTrees()) {
      const layout = resolveLayout(tree, "balanced");
      walk(tree, ({ node }) => {
        const entry = layout[node.id!] as Record<string, unknown>;
        const authored = (node as unknown as Record<string, unknown>).mobile;
        if (node.t === "Split" || node.t === "Rail" || node.t === "Overlay") {
          expect(entry.mobile, `${name} ${node.t} ${node.id}`).toBe(authored);
        } else if (node.t === "Grid") {
          expect(entry.mobileColumns, `${name} Grid ${node.id}`).toBe(authored);
        } else {
          expect(
            entry.mobile,
            `${name} ${node.t} ${node.id} invented a mobile value`,
          ).toBeUndefined();
        }
      });
    }
  });

  it("resolves the same tree, density and versions to the same layout every time", () => {
    for (const { tree } of capturedTrees().slice(0, 30))
      for (const density of DENSITIES)
        expect(resolveLayout(tree, density)).toEqual(resolveLayout(tree, density));
  });
});
