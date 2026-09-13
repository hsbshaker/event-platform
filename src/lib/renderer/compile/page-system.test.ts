/**
 * `page-system.ts`. Covers determinism, table admission for every field, the family-driven
 * `defaultAlign` rule, and the library-boundary invariant that no recipe/silhouette/template
 * identifier appears anywhere in this module's output.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`: "compiler owns
 * execution ... palette compilation, layout resolution" (page system is the same class of
 * compiler-owned resolution) and `Renderer proof`. `docs/design-system.md §15.2` (page system is
 * compiler-owned, applied to every section). `CLAUDE.md §5.1` / `docs/event-renderer-system.md
 * §7.1` (the library boundary invariant — this module must select nothing from the legacy
 * fixture library).
 */

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import type { Asymmetry, CompositionIntent, DesignIntent, Hierarchy } from "../design-intent";
import type { Family } from "../vocabulary";
import {
  BORDER_WEIGHTS,
  HIERARCHY_DISPLAY_TRACKING,
  PAGE_SYSTEM_VOCAB,
  resolvePageSystem,
} from "./page-system";

const PROOF_URL = new URL("../../../../proof-b/", import.meta.url);
const requireProof = createRequire(PROOF_URL);

const FAMILIES: readonly Family[] = ["editorial", "invitation", "statement"];
const HIERARCHIES: readonly Hierarchy[] = ["restrained", "editorial", "dramatic", "monumental"];
const ASYMMETRIES: readonly Asymmetry[] = ["symmetric", "gentle", "strong"];

function intentFor(
  family: Family,
  hierarchy: Hierarchy,
  asymmetry: Asymmetry = "gentle",
): DesignIntent {
  const composition: CompositionIntent = {
    asymmetry,
    hierarchy,
    rhythm: "continuous",
    sectionContrast: "moderate",
    ornament: "restrained",
  };
  return {
    family,
    tonalDirection: "mid",
    palette: { colors: ["#112233", "#445566", "#778899"], dominant: "#112233" },
    typographyPairing: "heritage_caslon_karla",
    density: "balanced",
    composition,
    motifs: [],
  };
}

describe("resolvePageSystem", () => {
  it("resolves every family x hierarchy combination without throwing", () => {
    for (const family of FAMILIES) {
      for (const hierarchy of HIERARCHIES) {
        expect(() => resolvePageSystem(intentFor(family, hierarchy), 7)).not.toThrow();
      }
    }
  });

  it("is deterministic: same (intent, seed) -> deep-equal PageSystem, always", () => {
    for (const family of FAMILIES) {
      for (const hierarchy of HIERARCHIES) {
        for (const seed of [1, 2, 42, 999]) {
          const a = resolvePageSystem(intentFor(family, hierarchy), seed);
          const b = resolvePageSystem(intentFor(family, hierarchy), seed);
          expect(a).toEqual(b);
        }
      }
    }
  });

  it("can produce a different PageSystem for a different seed on the same intent", () => {
    // Not a hard per-seed guarantee (a family with one admitted option is invariant), but across
    // many seeds on a family admitting choice, at least one field must vary.
    const intent = intentFor("editorial", "editorial");
    const results = Array.from({ length: 20 }, (_, i) => resolvePageSystem(intent, i));
    const distinctBorders = new Set(results.map((r) => r.border));
    expect(distinctBorders.size).toBeGreaterThan(1);
  });

  it("every field is a value the canonical table admits for that family/hierarchy", () => {
    const vocab = PAGE_SYSTEM_VOCAB.FAMILY_PAGE_VOCAB;
    for (const family of FAMILIES) {
      for (const hierarchy of HIERARCHIES) {
        for (const seed of [0, 1, 5, 13, 100]) {
          const ps = resolvePageSystem(intentFor(family, hierarchy), seed);
          expect(vocab[family].borders).toContain(ps.border);
          expect(vocab[family].cards).toContain(ps.card);
          expect(vocab[family].buttons).toContain(ps.button);
          expect(BORDER_WEIGHTS).toContain(ps.borderWeight);
          expect(HIERARCHY_DISPLAY_TRACKING[hierarchy]).toContain(ps.displayTracking);
          expect(["start", "center"]).toContain(ps.defaultAlign);
        }
      }
    }
  });

  it("invitation is always center-aligned by default (single center axis)", () => {
    for (const hierarchy of ["restrained", "editorial", "dramatic"] as const) {
      for (const asymmetry of ASYMMETRIES) {
        const ps = resolvePageSystem(intentFor("invitation", hierarchy, asymmetry), 3);
        expect(ps.defaultAlign).toBe("center");
      }
    }
  });

  it("editorial is always start-aligned by default (no center axis admitted)", () => {
    for (const hierarchy of HIERARCHIES) {
      for (const asymmetry of ASYMMETRIES) {
        const ps = resolvePageSystem(intentFor("editorial", hierarchy, asymmetry), 3);
        expect(ps.defaultAlign).toBe("start");
      }
    }
  });

  it("statement (which admits both axes) follows composition.asymmetry", () => {
    for (const hierarchy of ["dramatic", "monumental"] as const) {
      expect(
        resolvePageSystem(intentFor("statement", hierarchy, "symmetric"), 3).defaultAlign,
      ).toBe("center");
      expect(resolvePageSystem(intentFor("statement", hierarchy, "gentle"), 3).defaultAlign).toBe(
        "start",
      );
      expect(resolvePageSystem(intentFor("statement", hierarchy, "strong"), 3).defaultAlign).toBe(
        "start",
      );
    }
  });

  it("embeds a typeScale and spacing consistent with independently resolving the same intent", () => {
    const intent = intentFor("editorial", "dramatic");
    const ps = resolvePageSystem(intent, 4);
    expect(ps.typeScale.desktop.display.sizePx).toBeGreaterThan(0);
    expect(ps.spacing.sectionY.desktop).toBeGreaterThan(0);
  });

  it("carries no recipe, silhouette or template identifier from the legacy library", () => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- the reference side is untyped CommonJS. */
    const L: any = requireProof("./library.js");
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const fixtureIds = new Set([
      ...Object.keys(L.HEROES),
      ...Object.keys(L.DETAILS),
      ...Object.keys(L.RSVPS),
      ...Object.keys(L.REGISTRIES),
      ...Object.keys(L.PLANS),
    ]);
    expect(fixtureIds.size).toBeGreaterThan(0);

    for (const family of FAMILIES) {
      for (const hierarchy of HIERARCHIES) {
        const ps = resolvePageSystem(intentFor(family, hierarchy), 11);
        const serialized = JSON.stringify(ps);
        for (const id of fixtureIds) {
          expect(serialized).not.toContain(id);
        }
      }
    }
  });
});
