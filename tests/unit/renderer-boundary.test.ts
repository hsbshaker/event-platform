/**
 * Invariant obligation row 10, guarded from outside the renderer.
 *
 * `docs/event-renderer-system.md §6` and §7.1: "the renderer stays recipe-agnostic: one fixed
 * component per primitive, no branch per recipe." The renderer's own suite checks this too; this
 * file checks it from outside the module, so a change that edits the renderer and its tests
 * together still fails here.
 *
 * Acceptance criteria: `spec.md §31 — Renderer proof`; `spec.md §32` #14, #19.
 */

import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PRIMITIVE_KINDS, PRIMITIVES_BY_KIND } from "@/components/event-renderer/contract";
import { PRIMITIVES } from "@/components/event-renderer/primitives";
import { NODE_SPEC } from "@/lib/renderer/composition/spec";

/* eslint-disable @typescript-eslint/no-explicit-any -- the reference side is untyped CommonJS. */
const L: any = createRequire(new URL("../../proof-b/", import.meta.url))("./library.js");
/* eslint-enable @typescript-eslint/no-explicit-any */

const RENDERER_DIR = new URL("../../src/components/event-renderer/", import.meta.url).pathname;

function rendererSources(): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  const walkDir = (dir: string, prefix = "") => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walkDir(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test."))
        out.push({
          file: `${prefix}${entry.name}`,
          source: readFileSync(path.join(dir, entry.name), "utf8"),
        });
    }
  };
  walkDir(RENDERER_DIR);
  return out;
}

describe("row 10: the component map is the primitive allowlist", () => {
  it("has exactly one component per primitive, and no key that is not one", () => {
    expect(Object.keys(PRIMITIVES).sort()).toEqual([...PRIMITIVE_KINDS]);
    expect(PRIMITIVE_KINDS).toHaveLength(30);
    // And the allowlist is the language's own, not a copy that could drift from it.
    expect([...PRIMITIVE_KINDS]).toEqual(Object.keys(NODE_SPEC).sort());
  });

  it("covers every group the language declares", () => {
    expect(PRIMITIVES_BY_KIND.container).toHaveLength(9);
    expect(PRIMITIVES_BY_KIND.decorative).toHaveLength(6);
    expect(PRIMITIVES_BY_KIND.text).toHaveLength(11);
    expect(PRIMITIVES_BY_KIND.component).toHaveLength(4);
    for (const group of Object.values(PRIMITIVES_BY_KIND))
      for (const name of group) expect(typeof PRIMITIVES[name], name).toBe("function");
  });

  it("has 30 distinct implementations, not one shared stub behind many keys", () => {
    for (const [name, component] of Object.entries(PRIMITIVES))
      expect(typeof component, name).toBe("function");
    expect(new Set(Object.values(PRIMITIVES)).size).toBe(30);
  });
});

describe("row 10: the renderer is recipe-agnostic", () => {
  /**
   * Fixture identifiers in every spelling a branch could plausibly use: the full variant keys, and
   * the recipe names they are built from — a renderer branching by recipe would far more likely
   * name `editorial_split` than `editorial_split:field_right`.
   */
  const FIXTURE_IDS: string[] = [
    ...new Set<string>([
      ...(L.heroKeys as string[]),
      ...(L.heroKeys as string[]).map((k) => k.split(":")[0]),
      ...Object.keys(L.DETAILS),
      ...Object.keys(L.RSVPS),
      ...Object.keys(L.REGISTRIES),
      ...Object.keys(L.PLANS),
    ]),
  ];

  it("no renderer source mentions a recipe, silhouette or template identifier", () => {
    for (const { file, source } of rendererSources())
      for (const id of FIXTURE_IDS)
        expect(source.includes(id), `${file} mentions the fixture "${id}"`).toBe(false);
  });

  it("no renderer source reaches the legacy library or the adapters", () => {
    for (const { file, source } of rendererSources()) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      for (const forbidden of ["renderer/library", "few-shot", "recovery/", "proof-b", "proof-a1"])
        expect(code.includes(forbidden), `${file} names "${forbidden}"`).toBe(false);
    }
  });

  it("no renderer source reads the raw DesignIntent", () => {
    // `RenderContext` deliberately omits it. This catches a component that imported it anyway.
    for (const { file, source } of rendererSources()) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(code.includes("designIntent"), `${file} reads designIntent`).toBe(false);
      expect(/\bDesignIntent\b/.test(code), `${file} imports DesignIntent`).toBe(false);
    }
  });

  it("no renderer source builds a CSS string from anything but its own literals", () => {
    // Style values may be numbers with a unit this code chose. A template literal interpolating
    // a non-numeric expression into a declaration is how model data would leak in.
    for (const { file, source } of rendererSources()) {
      expect(
        /style=\{\{[^}]*:\s*`[^`]*\$\{/.test(source),
        `${file} interpolates into a style`,
      ).toBe(false);
    }
  });
});
