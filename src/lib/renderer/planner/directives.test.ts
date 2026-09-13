/**
 * PARITY TEST. Compares the ported directives against `proof-b/directives.js`. This test dies
 * with `proof-b/`; nothing here writes to it.
 *
 * Acceptance criteria: `spec.md §31 — Renderer proof` and `DesignIntent, composition and
 * compiler`; no product behaviour change (this is a port). `docs/event-renderer-system.md §5`
 * (34,560 combinations) and §7.1 (directives never map to a fixture, silhouette or template).
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { A1_SITES, page } from "../library";
import type { CompositionTree } from "../composition/nodes";
import {
  DIMENSIONS,
  PHRASE,
  combos,
  compliance,
  describe as describeDirective,
  sample,
} from "./directives";

const PROOF_URL = new URL("../../../../proof-b/", import.meta.url);
const PROOF_DIR = PROOF_URL.pathname;
const requireProof = createRequire(PROOF_URL);

/* eslint-disable @typescript-eslint/no-explicit-any -- the reference side is untyped CommonJS. */
const D: any = requireProof("./directives.js");
const LIB: any = requireProof("./library.js");
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("parity: directives", () => {
  it("DIMENSIONS matches the reference, key order and value order included", () => {
    expect(DIMENSIONS).toEqual(D.DIMENSIONS);
  });

  it("PHRASE matches the reference", () => {
    expect(PHRASE).toEqual(D.PHRASE);
  });

  it("combos is 34,560 and matches the reference", () => {
    expect(combos).toBe(34560);
    expect(D.combos).toBe(34560);
    expect(combos).toBe(D.combos);
  });

  it("sample and describe are identical to the reference for 500 seeds", () => {
    for (let seed = 0; seed < 500; seed++) {
      const produced = sample(seed);
      const reference = D.sample(seed);
      expect(produced).toEqual(reference);
      expect(describeDirective(produced)).toBe(D.describe(reference));
    }
  });

  it("compliance matches the reference over all 16 A.1 pages crossed with 20 sampled directives", () => {
    let comparisons = 0;
    const trees: CompositionTree[] = A1_SITES.map((row) =>
      page(row.hero, row.details, row.rsvp, row.registry, row.plan, row.align),
    );
    expect(trees).toHaveLength(16);

    const directives = Array.from({ length: 20 }, (_, i) => sample(i * 37 + 5));

    for (const tree of trees) {
      for (const d of directives) {
        expect(compliance(tree, d)).toEqual(D.compliance(tree, d));
        comparisons += 1;
      }
    }
    expect(comparisons).toBe(320);
  });

  it("compliance matches the reference over the 72 frozen confirmation trees", () => {
    let comparisons = 0;
    for (const set of ["final", "final-reduced"]) {
      const results = JSON.parse(
        readFileSync(path.join(PROOF_DIR, "model", set, "results-verified.json"), "utf8"),
      ) as { spec: { composition: CompositionTree }; directive: unknown }[];
      for (const r of results) {
        expect(compliance(r.spec.composition, r.directive as never)).toEqual(
          D.compliance(r.spec.composition, r.directive),
        );
        comparisons += 1;
      }
    }
    expect(comparisons).toBe(72);
  });

  it("no directive value or description names a fixture identifier for 200 seeds", () => {
    const fixtureIds = [
      ...Object.keys(LIB.HEROES),
      ...Object.keys(LIB.DETAILS),
      ...Object.keys(LIB.RSVPS),
      ...Object.keys(LIB.REGISTRIES),
      ...Object.keys(LIB.PLANS),
    ];
    for (let seed = 0; seed < 200; seed++) {
      const d = sample(seed);
      const text = describeDirective(d);
      for (const id of fixtureIds) {
        expect(Object.values(d)).not.toContain(id);
        expect(text).not.toContain(id);
      }
    }
  });
});
