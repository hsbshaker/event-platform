/**
 * `typography.ts`. Covers every pairing x hierarchy combination (12 x 4 = 48), determinism, the
 * monumental-substitution rule, and that every emitted number is finite and positive.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`: "typography
 * repair" and "compiler owns execution ... type scale". `spec.md §32` #15 (no token/prop without
 * a proof run — this module adds no new primitive, it only resolves an existing DesignIntent
 * field) and #19 (no CSS text from model output — this module emits only numbers).
 */

import { describe, expect, it } from "vitest";

import type { CompositionIntent, DesignIntent } from "../design-intent";
import {
  TYPOGRAPHY,
  TYPOGRAPHY_KEYS,
  type Hierarchy,
  type TypographyPairingId,
} from "../vocabulary";
import { resolveTypography } from "./typography";

const HIERARCHIES: readonly Hierarchy[] = ["restrained", "editorial", "dramatic", "monumental"];

function intentFor(pairing: TypographyPairingId, hierarchy: Hierarchy): DesignIntent {
  const composition: CompositionIntent = {
    asymmetry: "gentle",
    hierarchy,
    rhythm: "continuous",
    sectionContrast: "moderate",
    ornament: "restrained",
  };
  return {
    family: "editorial",
    tonalDirection: "mid",
    palette: { colors: ["#112233", "#445566", "#778899"], dominant: "#112233" },
    typographyPairing: pairing,
    density: "balanced",
    composition,
    motifs: [],
  };
}

const ALL_STEPS = ["display", "primary", "secondary", "caption"] as const;

describe("resolveTypography", () => {
  it("resolves every pairing x hierarchy combination without throwing", () => {
    for (const pairing of TYPOGRAPHY_KEYS) {
      for (const hierarchy of HIERARCHIES) {
        expect(() => resolveTypography(intentFor(pairing, hierarchy))).not.toThrow();
      }
    }
  });

  it("is deterministic: same intent -> deep-equal result, every time", () => {
    for (const pairing of TYPOGRAPHY_KEYS) {
      for (const hierarchy of HIERARCHIES) {
        const intent = intentFor(pairing, hierarchy);
        const a = resolveTypography(intent);
        const b = resolveTypography(intentFor(pairing, hierarchy));
        expect(a).toEqual(b);
      }
    }
  });

  it("every numeric value in the scale is finite and positive, for every combination", () => {
    for (const pairing of TYPOGRAPHY_KEYS) {
      for (const hierarchy of HIERARCHIES) {
        const { typography } = resolveTypography(intentFor(pairing, hierarchy));
        for (const bp of ["desktop", "mobile"] as const) {
          for (const step of ALL_STEPS) {
            const s = typography.scale[bp][step];
            for (const value of [s.sizePx, s.lineHeight, s.weight]) {
              expect(Number.isFinite(value)).toBe(true);
              expect(value).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it("never returns a pairing outside the twelve-id catalog", () => {
    for (const pairing of TYPOGRAPHY_KEYS) {
      for (const hierarchy of HIERARCHIES) {
        const { typography } = resolveTypography(intentFor(pairing, hierarchy));
        expect(TYPOGRAPHY_KEYS).toContain(typography.pairing);
      }
    }
  });

  it("preserves category when the pairing already holds at monumental (10 of 12 pairings)", () => {
    let preserved = 0;
    for (const pairing of TYPOGRAPHY_KEYS) {
      if (!TYPOGRAPHY[pairing].holdsAtMonumental) continue;
      const { typography, deviations } = resolveTypography(intentFor(pairing, "monumental"));
      expect(deviations).toEqual([]);
      expect(typography.pairing).toBe(pairing);
      expect(typography.category).toBe(TYPOGRAPHY[pairing].category);
      preserved++;
    }
    expect(preserved).toBe(10);
  });

  it("never returns a monumental pairing that does not hold at monumental scale", () => {
    for (const pairing of TYPOGRAPHY_KEYS) {
      const { typography } = resolveTypography(intentFor(pairing, "monumental"));
      expect(TYPOGRAPHY[typography.pairing].holdsAtMonumental).toBe(true);
    }
  });

  it("substitutes exactly the two non-holding (oldstyle) pairings at monumental, and only there", () => {
    const nonHolding = TYPOGRAPHY_KEYS.filter((id) => !TYPOGRAPHY[id].holdsAtMonumental);
    expect(nonHolding).toEqual(["oldstyle_garamond_worksans", "oldstyle_cormorant_figtree"]);

    let substitutions = 0;
    for (const pairing of TYPOGRAPHY_KEYS) {
      for (const hierarchy of HIERARCHIES) {
        const { deviations } = resolveTypography(intentFor(pairing, hierarchy));
        if (deviations.length > 0) {
          substitutions++;
          expect(hierarchy).toBe("monumental");
          expect(nonHolding).toContain(pairing);
          expect(deviations).toHaveLength(1);
          expect(deviations[0].rule).toBe("typography.monumental");
          expect(deviations[0].before).toBe(pairing);
        }
      }
    }
    expect(substitutions).toBe(2);
  });

  it("falls back to the first holding pairing in catalog order when the category has none", () => {
    // Neither oldstyle pairing holds at monumental, so there is no same-category substitute for
    // either; both must fall back to the first holding pairing in TYPOGRAPHY_KEYS order.
    const firstHolding = TYPOGRAPHY_KEYS.find((id) => TYPOGRAPHY[id].holdsAtMonumental);
    expect(firstHolding).toBe("heritage_caslon_karla");

    for (const pairing of ["oldstyle_garamond_worksans", "oldstyle_cormorant_figtree"] as const) {
      const { typography, deviations } = resolveTypography(intentFor(pairing, "monumental"));
      expect(deviations[0].after).toBe(firstHolding);
      expect(typography.pairing).toBe(firstHolding);
      expect(typography.category).not.toBe("oldstyle");
    }
  });

  it("evaluates the real clamp() semantics rather than assuming desktop hits the max bound", () => {
    // restrained.h2: clamp(1.5rem, 2.4vw, 2.1rem) evaluates to 30.72px at 1280px width, short of
    // its 33.6px ceiling. A max-bound assumption would have produced 33.6.
    const { typography } = resolveTypography(intentFor("heritage_caslon_karla", "restrained"));
    expect(typography.scale.desktop.primary.sizePx).toBeCloseTo(30.72, 2);
    expect(typography.scale.desktop.primary.sizePx).toBeLessThan(33.6);
  });

  it("clamps to the minimum bound at the mobile breakpoint for every hierarchy's display step", () => {
    const expectedMinPx: Record<Hierarchy, number> = {
      restrained: 32,
      editorial: 41.6,
      dramatic: 51.2,
      monumental: 60.8,
    };
    for (const hierarchy of HIERARCHIES) {
      const { typography } = resolveTypography(intentFor("heritage_caslon_karla", hierarchy));
      expect(typography.scale.mobile.display.sizePx).toBeCloseTo(expectedMinPx[hierarchy], 2);
    }
  });

  it("gives grotesk_led a heavier heading weight than every other category", () => {
    for (const pairing of TYPOGRAPHY_KEYS) {
      const { typography } = resolveTypography(intentFor(pairing, "editorial"));
      const expected = typography.category === "grotesk_led" ? 800 : 600;
      expect(typography.scale.desktop.display.weight).toBe(expected);
      expect(typography.scale.desktop.primary.weight).toBe(expected);
    }
  });

  it("keeps secondary and caption size fixed across every hierarchy", () => {
    for (const hierarchy of HIERARCHIES) {
      const { typography } = resolveTypography(intentFor("heritage_caslon_karla", hierarchy));
      expect(typography.scale.mobile.secondary.sizePx).toBe(16);
      expect(typography.scale.desktop.secondary.sizePx).toBe(16);
      expect(typography.scale.mobile.caption.sizePx).toBeCloseTo(10.88, 2);
      expect(typography.scale.desktop.caption.sizePx).toBeCloseTo(10.88, 2);
    }
  });
});
