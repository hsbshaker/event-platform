/**
 * The few-shot adapter: deterministic rotation, and a public surface that cannot become a
 * selection menu.
 *
 * Closes `docs/renderer-invariant-obligations.md` row 5. The second block is the one that matters
 * for the Library Boundary Invariant: it asserts no recipe, silhouette or template identifier
 * crosses the adapter's boundary, because an identifier that reaches a decision is a
 * candidate-choice variable, which `docs/event-renderer-system.md §7.1` forbids by name.
 *
 * Acceptance criteria: `spec.md §31 — Renderer proof`; `spec.md §32` #14.
 */

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { validateSchema } from "../composition/validate-schema";
import { validateStructure } from "../composition/validate-structure";
import type { Capabilities } from "../composition/nodes";
import * as fewShotModule from "./index";
import { FEW_SHOT_EXAMPLE_COUNT, compositionExamples } from "./index";

const PROOF_URL = new URL("../../../../proof-b/", import.meta.url);
const requireProof = createRequire(PROOF_URL);
/* eslint-disable @typescript-eslint/no-explicit-any -- the reference side is untyped CommonJS. */
const L: any = requireProof("./library.js");
const D: any = requireProof("./directives.js");
const { FULL_CAPS } = requireProof("./compile.js") as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const SEEDS = [0, 1, 2, 3, 7, 12, 41, 99, 100, 1234, 65535];

describe("few-shot rotation", () => {
  it("returns three example trees for any seed", () => {
    expect(FEW_SHOT_EXAMPLE_COUNT).toBe(3);
    for (const seed of SEEDS) expect(compositionExamples(seed)).toHaveLength(3);
  });

  it("is deterministic: the same seed returns the same three trees", () => {
    for (const seed of SEEDS) {
      expect(compositionExamples(seed)).toEqual(compositionExamples(seed));
    }
  });

  it("rotates: different seeds do not all return the same three trees", () => {
    const distinct = new Set(SEEDS.map((s) => JSON.stringify(compositionExamples(s))));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("picks exactly what the reference prompt builder picks, for every seed", () => {
    // `proof-b/prompt.js`: `mulberry(seed + 99)`, then `sort` with that comparator, then three.
    for (const seed of SEEDS) {
      const random = D.mulberry(seed + 99);
      const expected = [...L.A1_SITES]
        .sort(() => random() - 0.5)
        .slice(0, 3)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped positional rows
        .map((row: any) => L.page(row[1], row[2], row[3], row[4], row[5], row[6]));
      expect(compositionExamples(seed)).toEqual(expected);
    }
  });

  it("returns fresh trees the caller may mutate", () => {
    const a = compositionExamples(7);
    const b = compositionExamples(7);
    expect(a[0]).not.toBe(b[0]);
    a[0].sections.length = 0;
    expect(b[0].sections.length).toBeGreaterThan(0);
  });

  it("returns trees that are themselves valid compositions", () => {
    for (const seed of SEEDS) {
      for (const tree of compositionExamples(seed)) {
        expect(validateSchema(tree).ok).toBe(true);
        expect(validateStructure(tree, FULL_CAPS as Capabilities)).toEqual([]);
      }
    }
  });
});

describe("few-shot public surface (invariant obligation row 5)", () => {
  /** Every fixture identifier the library knows, in every spelling a leak could take. */
  const FIXTURE_IDS = [
    ...L.heroKeys,
    ...Object.keys(L.DETAILS),
    ...Object.keys(L.RSVPS),
    ...Object.keys(L.REGISTRIES),
    ...Object.keys(L.PLANS),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped positional rows
    ...L.A1_SITES.map((row: any) => row[0]),
  ] as string[];

  it("exports nothing but the example call and its count", () => {
    expect(Object.keys(fewShotModule).sort()).toEqual([
      "FEW_SHOT_EXAMPLE_COUNT",
      "compositionExamples",
    ]);
  });

  it("returns CompositionTrees carrying no fixture identifier, anywhere in the shape", () => {
    for (const seed of SEEDS) {
      const serialized = JSON.stringify(compositionExamples(seed));
      for (const id of FIXTURE_IDS) {
        expect(
          serialized.includes(id),
          `seed ${seed} leaked the fixture identifier "${id}" into the few-shot return shape. ` +
            `An identifier that reaches a decision is a candidate-choice variable ` +
            `(event-renderer-system.md §7.1).`,
        ).toBe(false);
      }
    }
  });

  it("returns only the CompositionTree shape: version, sections, and nodes", () => {
    for (const tree of compositionExamples(3)) {
      expect(Object.keys(tree).sort()).toEqual(["sections", "version"]);
      for (const section of tree.sections) {
        // No ranking, no score, no origin — the section keys are the language's own.
        for (const key of Object.keys(section)) {
          expect(["kind", "surface", "root", "align", "fill"]).toContain(key);
        }
      }
    }
  });

  it("gives generation no way to enumerate or choose a fixture", () => {
    const surface = fewShotModule as unknown as Record<string, unknown>;
    for (const forbidden of [
      "HEROES",
      "DETAILS",
      "RSVPS",
      "REGISTRIES",
      "PLANS",
      "A1_SITES",
      "HERO_KEYS",
      "page",
    ]) {
      expect(surface[forbidden]).toBeUndefined();
    }
    // The only parameter is a seed. There is no fixture argument to pass.
    expect(compositionExamples.length).toBe(1);
  });
});
