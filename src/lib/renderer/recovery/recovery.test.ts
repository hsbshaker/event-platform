/**
 * The recovery adapter: repair macros, and a terminal fallback that fails closed.
 *
 * Closes `docs/phase-3-invariant-obligations.md` row 7 and defines the Phase 3 side of row 8.
 * `docs/event-renderer-system.md §3` and §5 allow the composition call exactly one re-prompt for
 * a schema-invalid response and exactly one for a selector collision; §7.1 permits the library as
 * the terminal fallback only "after the retry §3 and §5 allow has been exhausted".
 *
 * Acceptance criteria: `spec.md §31 — Renderer proof` and `DesignIntent, composition and
 * compiler`; `spec.md §32` #14 and #22.
 */

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { canonicalize } from "../composition/canonicalize";
import type { Capabilities, CompositionTree } from "../composition/nodes";
import { repair } from "../composition/repair";
import { validateSchema } from "../composition/validate-schema";
import { validateStructure } from "../composition/validate-structure";
import * as recoveryModule from "./index";
import { libraryMacros, terminalFallback, type TerminalFallbackRequest } from "./index";

const PROOF_URL = new URL("../../../../proof-b/", import.meta.url);
const requireProof = createRequire(PROOF_URL);
/* eslint-disable @typescript-eslint/no-explicit-any -- the reference side is untyped CommonJS. */
const L: any = requireProof("./library.js");
const { FULL_CAPS } = requireProof("./compile.js") as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const CAPS = FULL_CAPS as Capabilities;
const SEEDS = [0, 1, 2, 5, 13, 16, 17, 64, 999];

const spent = {
  schema: (seed: number): TerminalFallbackRequest => ({
    reason: "schema-invalid-after-retry",
    seed,
    attempts: [{ schemaValid: false }, { schemaValid: false }],
  }),
  collision: (seed: number): TerminalFallbackRequest => ({
    reason: "selector-collision-after-retry",
    seed,
    attempts: [
      { schemaValid: true, resolved: false },
      { schemaValid: true, resolved: false },
    ],
  }),
};

describe("library repair macros", () => {
  it("matches the reference's seeded macro selection", () => {
    for (const seed of SEEDS) {
      const macros = libraryMacros(seed);
      const rsvpKeys = Object.keys(L.RSVPS);
      for (const s of [0, 1, 2, 7, 25, 26]) {
        expect(macros.hero(s)).toEqual(L.HEROES[L.heroKeys[(s + seed) % L.heroKeys.length]]());
        expect(macros.rsvpSection(s)).toEqual({
          kind: "rsvp",
          surface: "base",
          root: L.RSVPS[rsvpKeys[(s + seed) % 5]](),
        });
      }
    }
  });

  it("repairs a hero with no EventTitle into a library hero, deterministically", () => {
    const broken = {
      version: "composition_v1",
      sections: [
        { kind: "hero", surface: "base", root: { t: "Stack", children: [{ t: "Venue" }] } },
        { kind: "rsvp", surface: "base", root: { t: "Stack", children: [{ t: "RSVP" }] } },
        { kind: "registry", surface: "alt", root: { t: "Stack", children: [{ t: "Registry" }] } },
      ],
    } as unknown as CompositionTree;

    const once = repair(broken, CAPS, 7, libraryMacros(7));
    const twice = repair(broken, CAPS, 7, libraryMacros(7));
    expect(once.repairs.some((r) => r.rule === "coverage.missing")).toBe(true);
    expect(once.remaining).toEqual([]);
    expect(canonicalize(once.tree).hash).toBe(canonicalize(twice.tree).hash);
  });
});

describe("terminal fallback: fails closed (invariant obligation row 7)", () => {
  it("refuses on a first failure, before the allowed retry is made", () => {
    for (const reason of [
      "schema-invalid-after-retry",
      "selector-collision-after-retry",
    ] as const) {
      const request = {
        reason,
        seed: 3,
        attempts: [
          reason === "schema-invalid-after-retry"
            ? { schemaValid: false }
            : { schemaValid: true, resolved: false },
        ],
      } as TerminalFallbackRequest;
      expect(terminalFallback(request)).toEqual({ ok: false, refusal: "retry-not-attempted" });
    }
  });

  it("refuses when no attempt was made at all", () => {
    expect(
      terminalFallback({ reason: "schema-invalid-after-retry", seed: 3, attempts: [] }),
    ).toEqual({ ok: false, refusal: "retry-not-attempted" });
  });

  it("refuses when the allowed retry succeeded", () => {
    expect(
      terminalFallback({
        reason: "schema-invalid-after-retry",
        seed: 3,
        attempts: [{ schemaValid: false }, { schemaValid: true }],
      }),
    ).toEqual({ ok: false, refusal: "retry-not-spent" });

    expect(
      terminalFallback({
        reason: "selector-collision-after-retry",
        seed: 3,
        attempts: [
          { schemaValid: true, resolved: false },
          { schemaValid: true, resolved: true },
        ],
      }),
    ).toEqual({ ok: false, refusal: "retry-not-spent" });
  });

  it("refuses more attempts than §3 and §5 allow", () => {
    expect(
      terminalFallback({
        reason: "schema-invalid-after-retry",
        seed: 3,
        attempts: [{ schemaValid: false }, { schemaValid: false }, { schemaValid: false }],
      }),
    ).toEqual({ ok: false, refusal: "retry-budget-exceeded" });
  });

  it("throws on a seed that is not a non-negative safe integer", () => {
    for (const seed of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 2]) {
      expect(() => terminalFallback({ ...spent.schema(0), seed })).toThrow(TypeError);
    }
  });
});

describe("terminal fallback: the two canonical reasons", () => {
  it("serves schema-invalid-after-retry", () => {
    const out = terminalFallback(spent.schema(5));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.telemetry.reason).toBe("schema-invalid-after-retry");
    expect(out.telemetry.source).toBe("library");
    expect(out.telemetry.attemptsSpent).toBe(2);
    expect(out.telemetry.seed).toBe(5);
    expect(out.telemetry.fixtureId).toBe(L.A1_SITES[5 % L.A1_SITES.length][0]);
  });

  it("serves selector-collision-after-retry", () => {
    const out = terminalFallback(spent.collision(5));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.telemetry.reason).toBe("selector-collision-after-retry");
    expect(out.telemetry.attemptsSpent).toBe(2);
  });

  it("has exactly these two reasons and no others", () => {
    // A third reason would need a spec change (§3, §5, §7.1). This pins the set.
    const reasons = new Set(
      [spent.schema(1), spent.collision(1)].map((r) => {
        const out = terminalFallback(r);
        return out.ok ? out.telemetry.reason : "refused";
      }),
    );
    expect([...reasons].sort()).toEqual([
      "schema-invalid-after-retry",
      "selector-collision-after-retry",
    ]);
  });
});

describe("terminal fallback: the page it serves", () => {
  it("is deterministic for the same seed and input", () => {
    for (const seed of SEEDS) {
      const a = terminalFallback(spent.schema(seed));
      const b = terminalFallback(spent.schema(seed));
      expect(a).toEqual(b);
    }
  });

  it("picks the reference's fixture for the seed, and rotates with it", () => {
    for (const seed of SEEDS) {
      const out = terminalFallback(spent.schema(seed));
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const row = L.A1_SITES[seed % L.A1_SITES.length];
      expect(out.tree).toEqual(L.page(row[1], row[2], row[3], row[4], row[5], row[6]));
    }
    const across = new Set(SEEDS.map((s) => JSON.stringify(terminalFallback(spent.schema(s)))));
    expect(across.size).toBeGreaterThan(1);
  });

  it("serves a page that is itself a valid, repair-clean composition", () => {
    for (const seed of SEEDS) {
      const out = terminalFallback(spent.schema(seed));
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(validateSchema(out.tree).ok).toBe(true);
      expect(validateStructure(out.tree, CAPS)).toEqual([]);
    }
  });

  it("does not depend on the reason: the same seed serves the same page either way", () => {
    for (const seed of SEEDS) {
      const a = terminalFallback(spent.schema(seed));
      const b = terminalFallback(spent.collision(seed));
      expect(a.ok && b.ok && a.tree).toEqual(b.ok && b.tree);
    }
  });
});

describe("recovery public surface", () => {
  it("exports the two permitted roles and nothing else", () => {
    expect(Object.keys(recoveryModule).sort()).toEqual(["libraryMacros", "terminalFallback"]);
  });

  it("does not re-export the library, so the adapters cannot be collapsed into one API", () => {
    const surface = recoveryModule as unknown as Record<string, unknown>;
    for (const forbidden of [
      "HEROES",
      "HERO_KEYS",
      "DETAILS",
      "RSVPS",
      "REGISTRIES",
      "PLANS",
      "A1_SITES",
      "page",
      "compositionExamples",
    ]) {
      expect(surface[forbidden]).toBeUndefined();
    }
  });
});
