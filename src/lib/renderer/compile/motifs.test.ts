/**
 * Motif resolution. Intrinsic: `proof-b` has no motif resolution stage, so there is nothing to
 * compare against and everything here states the canonical contract directly
 * (`docs/event-renderer-system.md §8`, `docs/design-system.md §15.7`, `spec.md §32` #25).
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`.
 */

import { describe, expect, it } from "vitest";

import { canonicalize } from "../composition/canonicalize";
import type { CompositionTree } from "../composition/nodes";
import { ARRANGEMENT_MOTIFS, PATTERN_MOTIFS } from "../composition/tokens";
import type { MotifId, MotifRole } from "../composition/tokens";
import { walk } from "../composition/walk";
import type { DesignIntent, Ornament } from "../design-intent";
import {
  CATALOG_IS_CONSISTENT,
  MOTIF_CATALOG,
  MOTIF_OPACITY_STEPS,
  MOTIF_SCALE_STEPS,
  ORNAMENT_BUDGET,
  resolveMotifs,
} from "./motifs";

const intent = (ornament: Ornament, motifs: MotifId[] = []): DesignIntent => ({
  family: "editorial",
  tonalDirection: "dark",
  palette: { colors: ["#22364F", "#F3ECDD", "#2E4638"], dominant: "#22364F" },
  typographyPairing: "heritage_caslon_karla",
  density: "balanced",
  composition: {
    asymmetry: "gentle",
    hierarchy: "editorial",
    rhythm: "alternating",
    sectionContrast: "moderate",
    ornament,
  },
  motifs,
});

/** A tree with `count` pattern fields plus one glyph and one glyph divider. */
function treeWith(
  fields: { id: MotifId; role: MotifRole }[],
  glyphs: MotifId[] = [],
): CompositionTree {
  return canonicalize({
    version: "composition_v1",
    sections: [
      {
        kind: "hero",
        surface: "base",
        root: {
          t: "Stack",
          children: [
            { t: "EventTitle", emphasis: "display" },
            ...fields.map((m) => ({ t: "MotifField", motif: m })),
            ...glyphs.map((g) => ({ t: "Glyph", motif: g })),
            { t: "Date", form: "full" },
          ],
        },
      },
      { kind: "rsvp", surface: "base", root: { t: "Stack", children: [{ t: "RSVP" }] } },
      {
        kind: "registry",
        surface: "alt",
        root: {
          t: "Stack",
          children: [
            {
              t: "Registry",
              layout: { t: "Stack", children: [{ t: "RegistryItem", kind: "gift" }] },
            },
          ],
        },
      },
    ],
  } as unknown as CompositionTree).tree;
}

describe("the motif catalog", () => {
  it("agrees with the language core about which motifs are patterns and which are arrangements", () => {
    expect(CATALOG_IS_CONSISTENT).toBe(true);
    expect(Object.keys(MOTIF_CATALOG).sort()).toEqual(
      [...PATTERN_MOTIFS, ...ARRANGEMENT_MOTIFS].sort(),
    );
  });

  it("gives every motif at least one role it can serve", () => {
    for (const [id, entry] of Object.entries(MOTIF_CATALOG)) {
      expect(entry.roles.length, id).toBeGreaterThan(0);
    }
  });

  it("has an ornament budget for every ornament value, with an approved opacity ceiling", () => {
    for (const [ornament, budget] of Object.entries(ORNAMENT_BUDGET)) {
      expect(budget.max, ornament).toBeGreaterThan(0);
      expect(MOTIF_OPACITY_STEPS).toContain(budget.opacity);
    }
    expect(ORNAMENT_BUDGET.none.arrangement).toBe(false);
  });
});

describe("motif resolution", () => {
  it("resolves every motif the tree placed — nothing is dropped", () => {
    const tree = treeWith(
      [
        { id: "plaid", role: "field" },
        { id: "linen", role: "field" },
        { id: "gingham", role: "field" },
        { id: "stripe", role: "field" },
      ],
      ["equestrian", "botanical"],
    );
    const placed: string[] = [];
    walk(tree, ({ node }) => {
      if (["MotifField", "MotifBand", "Glyph"].includes(node.t)) placed.push(node.id!);
      if (node.t === "Frame" && (node as { motif?: unknown }).motif) placed.push(node.id!);
      if (node.t === "Rule" && (node as { glyphs?: unknown }).glyphs) placed.push(node.id!);
    });

    const { motifs } = resolveMotifs(tree, intent("restrained"), 3);
    expect(placed.length).toBe(6);
    expect(Object.keys(motifs).sort()).toEqual(placed.sort());
  });

  it("is deterministic for the same tree, intent and seed", () => {
    const tree = treeWith([{ id: "plaid", role: "field" }], ["botanical"]);
    for (const seed of [0, 1, 7, 41]) {
      expect(resolveMotifs(tree, intent("decorative"), seed)).toEqual(
        resolveMotifs(tree, intent("decorative"), seed),
      );
    }
  });

  it("emits only approved opacity and scale steps, never a free value", () => {
    const tree = treeWith(
      [
        { id: "plaid", role: "field" },
        { id: "linen", role: "field" },
        { id: "gingham", role: "field" },
        { id: "stripe", role: "band" },
      ],
      ["equestrian", "celestial"],
    );
    for (const ornament of ["none", "restrained", "decorative"] as const) {
      for (const seed of [0, 1, 2, 3, 4, 5]) {
        for (const m of Object.values(resolveMotifs(tree, intent(ornament), seed).motifs)) {
          expect(MOTIF_OPACITY_STEPS, `${ornament} seed ${seed}`).toContain(m.opacity);
          expect(MOTIF_SCALE_STEPS, `${ornament} seed ${seed}`).toContain(m.scale);
        }
      }
    }
  });

  it("never exceeds the ornament's opacity ceiling", () => {
    const tree = treeWith([{ id: "plaid", role: "field" }]);
    for (const ornament of ["none", "restrained", "decorative"] as const) {
      for (const m of Object.values(resolveMotifs(tree, intent(ornament), 1).motifs)) {
        expect(m.opacity).toBeLessThanOrEqual(ORNAMENT_BUDGET[ornament].opacity);
      }
    }
  });

  it("holds motifs past the budget at the lowest step and logs each one", () => {
    const tree = treeWith([
      { id: "plaid", role: "field" },
      { id: "linen", role: "field" },
      { id: "gingham", role: "field" },
      { id: "stripe", role: "field" },
    ]);
    const { motifs, deviations } = resolveMotifs(tree, intent("restrained"), 1);
    const within = Object.values(motifs).filter((m) => m.withinBudget);
    const held = Object.values(motifs).filter((m) => !m.withinBudget);

    expect(within).toHaveLength(ORNAMENT_BUDGET.restrained.max);
    expect(held).toHaveLength(4 - ORNAMENT_BUDGET.restrained.max);
    for (const m of held) expect(m.opacity).toBe(MOTIF_OPACITY_STEPS[0]);
    // Every held-back motif is recorded. Nothing is silent.
    expect(deviations.filter((d) => d.rule === "motif.budget")).toHaveLength(held.length);
  });

  it("holds arrangement motifs back entirely when ornament is none, without dropping them", () => {
    const tree = treeWith([], ["equestrian", "botanical"]);
    const { motifs, deviations } = resolveMotifs(tree, intent("none"), 1);
    expect(Object.keys(motifs)).toHaveLength(2);
    for (const m of Object.values(motifs)) {
      expect(m.withinBudget).toBe(false);
      expect(m.opacity).toBe(MOTIF_OPACITY_STEPS[0]);
    }
    expect(deviations.every((d) => d.rule === "motif.budget")).toBe(true);
    expect(deviations).toHaveLength(2);
  });

  it("swaps a motif that cannot serve its slot's role, and logs the swap", () => {
    // `gingham` serves field and band, never frame.
    const tree = treeWith([{ id: "gingham", role: "frame" }]);
    const { motifs, deviations } = resolveMotifs(tree, intent("decorative"), 1);
    const resolved = Object.values(motifs)[0];

    expect(resolved.id).not.toBe("gingham");
    expect(MOTIF_CATALOG[resolved.id].roles).toContain("frame");
    expect(MOTIF_CATALOG[resolved.id].kind).toBe("pattern");
    expect(deviations.filter((d) => d.rule === "motif.role")).toHaveLength(1);
    expect(deviations[0].before).toBe("gingham");
    expect(deviations[0].after).toBe(resolved.id);
  });

  it("records no deviation when every motif fits its slot and the budget", () => {
    const tree = treeWith([{ id: "plaid", role: "field" }]);
    expect(resolveMotifs(tree, intent("restrained"), 1).deviations).toEqual([]);
  });

  it("gives a glyph the accent role and a glyph divider the divider role", () => {
    const tree = canonicalize({
      version: "composition_v1",
      sections: [
        {
          kind: "hero",
          surface: "base",
          root: {
            t: "Stack",
            children: [
              { t: "Glyph", motif: "celestial" },
              { t: "Rule", weight: "hairline", glyphs: "botanical" },
              { t: "EventTitle", emphasis: "display" },
            ],
          },
        },
        { kind: "rsvp", surface: "base", root: { t: "Stack", children: [{ t: "RSVP" }] } },
        {
          kind: "registry",
          surface: "alt",
          root: {
            t: "Stack",
            children: [
              {
                t: "Registry",
                layout: { t: "Stack", children: [{ t: "RegistryItem", kind: "gift" }] },
              },
            ],
          },
        },
      ],
    } as unknown as CompositionTree).tree;

    const roles = Object.values(resolveMotifs(tree, intent("decorative"), 1).motifs).map(
      (m) => `${m.id}:${m.role}`,
    );
    expect(roles).toContain("celestial:accent");
    expect(roles).toContain("botanical:divider");
  });

  it("resolves a tree with no motifs to nothing, without complaint", () => {
    const tree = treeWith([]);
    expect(resolveMotifs(tree, intent("decorative"), 1)).toEqual({ motifs: {}, deviations: [] });
  });

  it("keys every entry by canonical node id", () => {
    const tree = treeWith([{ id: "plaid", role: "field" }], ["equestrian"]);
    const ids = new Set<string>();
    walk(tree, ({ node }) => ids.add(node.id!));
    for (const key of Object.keys(resolveMotifs(tree, intent("decorative"), 1).motifs))
      expect(ids.has(key), `${key} is not a canonical node id`).toBe(true);
  });
});
