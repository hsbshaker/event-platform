/**
 * PARITY TEST. Compares the ported design vocabulary against `proof-a1/vocab.js`, loaded the
 * way `proof-b/planner.js` loads it. This test dies with `proof-a1/`; nothing here writes to it.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`; no product
 * behaviour change (this is a port). `docs/event-renderer-system.md §7.1` — the vocabulary
 * ported here excludes every recipe/fixture-shaped table.
 */

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import * as vocabulary from "./index";
import { FAMILIES, FAMILY_KEYS, TONES, TYPOGRAPHY, TYPOGRAPHY_KEYS } from "./index";

const PROOF_URL = new URL("../../../../proof-a1/", import.meta.url);
const requireProof = createRequire(PROOF_URL);

/* eslint-disable @typescript-eslint/no-explicit-any -- the reference side is untyped CommonJS. */
(global as any).window = global;
requireProof("./sites.js");
const { VOCAB }: any = requireProof("./vocab.js");
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("parity: design vocabulary", () => {
  it("FAMILY_KEYS matches Object.keys(VOCAB.families), order included", () => {
    expect(FAMILY_KEYS).toEqual(Object.keys(VOCAB.families));
  });

  it("each family's categories and hierarchies match the reference, order included", () => {
    for (const f of FAMILY_KEYS) {
      expect(FAMILIES[f].categories).toEqual(VOCAB.families[f].categories);
      expect(FAMILIES[f].hierarchies).toEqual(VOCAB.families[f].hierarchies);
    }
  });

  it("TONES matches VOCAB.tones", () => {
    expect(TONES).toEqual(VOCAB.tones);
  });

  it("TYPOGRAPHY_KEYS matches Object.keys(VOCAB.typography), order included, length 12", () => {
    expect(TYPOGRAPHY_KEYS).toEqual(Object.keys(VOCAB.typography));
    expect(TYPOGRAPHY_KEYS).toHaveLength(12);
  });

  it("each typography pairing's four fields match the reference", () => {
    for (const id of TYPOGRAPHY_KEYS) {
      expect(TYPOGRAPHY[id]).toEqual(VOCAB.typography[id]);
    }
  });

  it("exports nothing recipe/fixture-shaped", () => {
    const exportNames = Object.keys(vocabulary);
    const suspicious = exportNames.filter((name) =>
      /recipe|silhouette|hero|surfacePlan|template/i.test(name),
    );
    expect(suspicious).toEqual([]);
  });
});
