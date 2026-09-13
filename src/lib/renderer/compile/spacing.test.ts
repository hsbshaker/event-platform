/**
 * `spacing.ts`. Covers every `Density`, determinism, and that every emitted number is a member of
 * the declared, enumerated scale — never a free pixel value.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`: "compiler owns
 * execution ... spacing". `docs/design-system.md §15.2` (page system is compiler-owned).
 */

import { describe, expect, it } from "vitest";

import type { Density } from "../design-intent";
import { SCALES } from "../composition/layout";
import { resolveSpacing, SPACING_SCALE } from "./spacing";

const DENSITIES: readonly Density[] = ["compact", "balanced", "spacious"];

function allApprovedValues(): number[] {
  const values: number[] = [];
  for (const density of DENSITIES) {
    values.push(SPACING_SCALE.sectionY[density].mobile, SPACING_SCALE.sectionY[density].desktop);
  }
  for (const density of DENSITIES) {
    values.push(...Object.values(SCALES.gapPx[density]));
  }
  values.push(...Object.values(SCALES.insetPx));
  return values;
}

describe("resolveSpacing", () => {
  it("resolves every density without throwing", () => {
    for (const density of DENSITIES) {
      expect(() => resolveSpacing(density)).not.toThrow();
    }
  });

  it("is deterministic: same density -> deep-equal result, every time", () => {
    for (const density of DENSITIES) {
      expect(resolveSpacing(density)).toEqual(resolveSpacing(density));
    }
  });

  it("every emitted number is a member of the declared, enumerated scale", () => {
    const approved = new Set(allApprovedValues());
    for (const density of DENSITIES) {
      const spacing = resolveSpacing(density);
      for (const step of [spacing.sectionY, spacing.containerGap, spacing.inset]) {
        expect(approved.has(step.mobile)).toBe(true);
        expect(approved.has(step.desktop)).toBe(true);
      }
    }
  });

  it("sectionY matches proof-b/renderer.js's DENS table exactly", () => {
    expect(resolveSpacing("compact").sectionY).toEqual({ mobile: 44, desktop: 64 });
    expect(resolveSpacing("balanced").sectionY).toEqual({ mobile: 64, desktop: 96 });
    expect(resolveSpacing("spacious").sectionY).toEqual({ mobile: 88, desktop: 128 });
  });

  it("containerGap and inset agree with composition/layout.ts's SCALES for the same density", () => {
    for (const density of DENSITIES) {
      const spacing = resolveSpacing(density);
      expect(spacing.containerGap.mobile).toBe(SCALES.gapPx[density].normal);
      expect(spacing.containerGap.desktop).toBe(SCALES.gapPx[density].normal);
      expect(spacing.inset.mobile).toBe(SCALES.insetPx.normal);
      expect(spacing.inset.desktop).toBe(SCALES.insetPx.normal);
    }
  });

  it("every number across every density is finite and non-negative", () => {
    for (const density of DENSITIES) {
      const spacing = resolveSpacing(density);
      for (const step of [spacing.sectionY, spacing.containerGap, spacing.inset]) {
        expect(Number.isFinite(step.mobile)).toBe(true);
        expect(Number.isFinite(step.desktop)).toBe(true);
        expect(step.mobile).toBeGreaterThanOrEqual(0);
        expect(step.desktop).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
