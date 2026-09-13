/**
 * PARITY TESTS. Prove this port of `proof-b/library.js` produces byte-identical
 * `CompositionTree` data to the reference, and that the production composition core still
 * reproduces the captured golden oracle when driven by this module instead of the reference
 * library.
 *
 * `proof-b/` is read-only and is never imported from production `src/**` outside the two named
 * adapters (`eslint.config.mjs`, `docs/event-renderer-system.md §7.1`) — this test file is
 * exempted from that boundary the same way `composition/parity.test.ts` is.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` and
 * `Renderer proof`; no product behaviour change (this is a port, Phase 3 item 2).
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalize } from "../composition/canonicalize";
import { validateSchema } from "../composition/validate-schema";
import { validateStructure } from "../composition/validate-structure";
import { skeleton } from "../composition/signature";
import type { CompositionTree, Section } from "../composition/nodes";

import { DETAILS, REGISTRIES, RSVPS } from "./sections";
import { HEROES, HERO_KEYS } from "./heroes";
import { A1_SITES, PLANS, page } from "./pages";

const PROOF_URL = new URL("../../../../proof-b/", import.meta.url);
const GOLDEN_DIR = new URL("../../../../tests/fixtures/renderer-golden/", import.meta.url).pathname;

const requireProof = createRequire(PROOF_URL);
/* eslint-disable @typescript-eslint/no-explicit-any -- the reference side is untyped CommonJS. */
const L: any = requireProof("./library.js");
const { FULL_CAPS } = requireProof("./compile.js") as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

function golden(name: string): unknown {
  return JSON.parse(readFileSync(path.join(GOLDEN_DIR, name), "utf8"));
}

/** The same stable projection `scripts/renderer/capture-golden.mjs` wrote the oracle through. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, stable((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** Key-sorted and JSON-normalized, so a comparison sees exactly what the oracle file holds. */
function normalize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(stable(value)));
}

describe("port parity: the library vs proof-b/library.js", () => {
  it("has the same 26 hero keys, in the same order, as the reference", () => {
    expect(HERO_KEYS).toHaveLength(26);
    expect(HERO_KEYS).toEqual(L.heroKeys);
  });

  it("produces byte-identical hero silhouettes for every key", () => {
    for (const key of HERO_KEYS) {
      expect(normalize(HEROES[key]())).toEqual(normalize(L.HEROES[key]()));
    }
  });

  it("has the same 13 section recipe keys, in the same order, across details/rsvp/registry", () => {
    expect(Object.keys(DETAILS)).toEqual(Object.keys(L.DETAILS));
    expect(Object.keys(RSVPS)).toEqual(Object.keys(L.RSVPS));
    expect(Object.keys(REGISTRIES)).toEqual(Object.keys(L.REGISTRIES));
    expect(
      Object.keys(DETAILS).length + Object.keys(RSVPS).length + Object.keys(REGISTRIES).length,
    ).toBe(13);
  });

  it("produces byte-identical section recipes for every key", () => {
    for (const key of Object.keys(DETAILS) as (keyof typeof DETAILS)[]) {
      expect(normalize(DETAILS[key]())).toEqual(normalize(L.DETAILS[key]()));
    }
    for (const key of Object.keys(RSVPS) as (keyof typeof RSVPS)[]) {
      expect(normalize(RSVPS[key]())).toEqual(normalize(L.RSVPS[key]()));
    }
    for (const key of Object.keys(REGISTRIES) as (keyof typeof REGISTRIES)[]) {
      expect(normalize(REGISTRIES[key]())).toEqual(normalize(L.REGISTRIES[key]()));
    }
  });

  it("has byte-identical surface plans", () => {
    expect(normalize(PLANS)).toEqual(normalize(L.PLANS));
  });

  it("carries the same 16 A.1 site rows, in the same order, as the reference", () => {
    expect(A1_SITES).toHaveLength(16);
    expect(L.A1_SITES).toHaveLength(16);
    A1_SITES.forEach((site, i) => {
      const row = L.A1_SITES[i] as string[];
      expect([row[0], row[1], row[2], row[3], row[4], row[5], row[6]]).toEqual([
        site.id,
        site.hero,
        site.details,
        site.rsvp,
        site.registry,
        site.plan,
        site.align,
      ]);
    });
  });

  it("produces byte-identical pages for all 16 A.1 sites", () => {
    for (const site of A1_SITES) {
      const ours = page(site.hero, site.details, site.rsvp, site.registry, site.plan, site.align);
      const row = L.A1_SITES.find((r: string[]) => r[0] === site.id) as string[];
      const ref = L.page(row[1], row[2], row[3], row[4], row[5], row[6]);
      expect(normalize(ours)).toEqual(normalize(ref));
    }
  });

  it("returns a fresh object from every factory call", () => {
    const a = HEROES[HERO_KEYS[0]]();
    const b = HEROES[HERO_KEYS[0]]();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately mutating a fixture-shaped object for the freshness proof
    (a as any).mutated = "yes";
    expect(b).not.toHaveProperty("mutated");

    const detailsA = DETAILS.details_stacked();
    const detailsB = DETAILS.details_stacked();
    expect(detailsA).toEqual(detailsB);
    expect(detailsA).not.toBe(detailsB);

    const pageA = page(
      A1_SITES[0].hero,
      A1_SITES[0].details,
      A1_SITES[0].rsvp,
      A1_SITES[0].registry,
      A1_SITES[0].plan,
      A1_SITES[0].align,
    );
    const pageB = page(
      A1_SITES[0].hero,
      A1_SITES[0].details,
      A1_SITES[0].rsvp,
      A1_SITES[0].registry,
      A1_SITES[0].plan,
      A1_SITES[0].align,
    );
    expect(pageA).toEqual(pageB);
    expect(pageA).not.toBe(pageB);
    expect(pageA.sections).not.toBe(pageB.sections);
  });
});

/**
 * Mirrors `composition/parity.test.ts`'s `describe("parity: the library")` exactly, but sources
 * the fixtures from this production module instead of `proof-b/library.js`. Same golden files,
 * same tree construction, same skeleton/canonicalization calls — proof that the port is
 * indistinguishable from the reference through the whole composition core, not just at the data
 * layer.
 */
describe("parity: the library (production module against the golden oracle)", () => {
  it("validates, canonicalizes and skeletonizes all 26 hero silhouettes identically", () => {
    const heroes: Record<string, unknown> = {};
    for (const key of HERO_KEYS) {
      const tree: CompositionTree = {
        version: "composition_v1",
        sections: [
          { kind: "hero", surface: "base", root: HEROES[key]() },
          { kind: "rsvp", surface: "base", root: RSVPS.rsvp_typographic_stack() },
          { kind: "registry", surface: "alt", root: REGISTRIES.registry_tiles() },
        ],
      };
      const canon = canonicalize(tree);
      heroes[key] = {
        schemaOk: validateSchema(tree).ok,
        structureViolations: validateStructure(tree, FULL_CAPS),
        canonicalHash: canon.hash,
        canonical: canon.tree,
        skeletonDesktop: skeleton(tree, "desktop"),
        skeletonMobile: skeleton(tree, "mobile"),
      };
    }
    expect(Object.keys(heroes)).toHaveLength(26);
    expect(normalize(heroes)).toEqual(golden("library-heroes.json"));
  });

  it("canonicalizes all 13 section recipes identically", () => {
    const sections: Record<string, unknown> = {};
    for (const [group, table] of [
      ["details", DETAILS],
      ["rsvp", RSVPS],
      ["registry", REGISTRIES],
    ] as [string, Record<string, () => Section["root"]>][]) {
      for (const key of Object.keys(table)) {
        sections[`${group}:${key}`] = canonicalize({
          version: "composition_v1",
          sections: [
            { kind: "hero", surface: "base", root: HEROES[HERO_KEYS[0]]() },
            { kind: group as Section["kind"], surface: "base", root: table[key]() },
          ],
        });
      }
    }
    expect(Object.keys(sections)).toHaveLength(13);
    expect(normalize(sections)).toEqual(golden("library-sections.json"));
  });

  it("reproduces the 16 A.1 pages, hashes and canonicalization idempotence", () => {
    const pages: Record<string, unknown> = {};
    for (const site of A1_SITES) {
      const tree: CompositionTree = page(
        site.hero,
        site.details,
        site.rsvp,
        site.registry,
        site.plan,
        site.align,
      );
      const once = canonicalize(tree);
      const twice = canonicalize(once.tree);
      pages[site.id] = {
        schemaOk: validateSchema(tree).ok,
        structureViolations: validateStructure(tree, FULL_CAPS),
        hash: once.hash,
        idempotent: once.hash === twice.hash,
        canonical: once.tree,
      };
    }
    expect(Object.keys(pages)).toHaveLength(16);
    expect(normalize(pages)).toEqual(golden("library-pages.json"));
  });
});
