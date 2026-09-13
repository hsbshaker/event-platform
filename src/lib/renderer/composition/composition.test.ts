/**
 * INTRINSIC TESTS. Nothing in this file calls `proof-b/`, so the suite still means something
 * once the reference implementation is deleted. Every fixture is hand-authored here, except the
 * 26 library hero skeletons, which are read from the committed oracle
 * (`tests/fixtures/renderer-golden/library-heroes.json`) rather than recomputed from `proof-b/`.
 *
 * The byte-for-byte comparisons against the reference live in `parity.test.ts`.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` and
 * `Renderer proof`; no product behaviour change (this is a port).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ATTRACTIVE_TOKENS } from "./attractive-tokens";
import { canonicalize } from "./canonicalize";
import { resolveLayout } from "./layout";
import type { Capabilities, CompositionTree } from "./nodes";
import { heroSimilarity, seqSim, skeleton } from "./signature";
import { validateSchema } from "./validate-schema";
import { validateStructure } from "./validate-structure";
import { clone, countNodes, walk } from "./walk";

const FULL_CAPS: Capabilities = {
  rsvp: true,
  registry: true,
  gifts: true,
  externalRegistry: true,
  cashFund: true,
  hosts: true,
  description: true,
  time: true,
  location: true,
  deadline: true,
};

const GOLDEN_HEROES = new URL(
  "../../../../tests/fixtures/renderer-golden/library-heroes.json",
  import.meta.url,
).pathname;

/** The hero skeletons of all 26 A.1 silhouettes, as captured before any production code existed. */
const LIBRARY_HERO_SKELETONS = JSON.parse(readFileSync(GOLDEN_HEROES, "utf8")) as Record<
  string,
  { skeletonDesktop: { hero: string[] }; skeletonMobile: { hero: string[] } }
>;

/**
 * A deliberately novel composition: a Rail whose rail is a MotifField, wrapping a Split whose
 * halves hold an Overlay and a ruled Grid, over a surface sequence (accent → contrast → alt →
 * base → contrast) that no library recipe uses.
 */
function novelTree(): CompositionTree {
  return {
    version: "composition_v1",
    sections: [
      {
        kind: "hero",
        surface: "accent",
        align: "center",
        fill: "screen",
        root: {
          t: "Rail",
          side: "end",
          width: "medium",
          mobile: "bottom",
          rail: { t: "MotifField", motif: { id: "gingham", role: "field" }, extent: "full" },
          child: {
            t: "Split",
            ratio: "62",
            align: "center",
            divider: "hairline",
            mobile: "stack-reverse",
            children: [
              {
                t: "Overlay",
                anchor: "bottom-end",
                extent: "third",
                mobile: "stack",
                content: {
                  t: "Stack",
                  gap: "tight",
                  align: "start",
                  children: [
                    { t: "Eyebrow" },
                    { t: "EventTitle", emphasis: "display", layout: "cascade" },
                    { t: "Hosts" },
                  ],
                },
                decoration: {
                  t: "MotifField",
                  motif: { id: "plaid", role: "field" },
                  extent: "third",
                },
              },
              {
                t: "Grid",
                columns: 2,
                mobile: 2,
                ruled: true,
                gap: "loose",
                children: [
                  { t: "Cell", child: { t: "Date", form: "numeral", emphasis: "display" } },
                  {
                    t: "Cell",
                    child: { t: "Stack", children: [{ t: "Venue" }, { t: "Location" }] },
                  },
                ],
              },
            ],
          },
        },
      },
      {
        kind: "details",
        surface: "contrast",
        root: {
          t: "Frame",
          rule: "double",
          inset: "deep",
          motif: { id: "stripe", role: "frame" },
          child: {
            t: "Stack",
            children: [
              { t: "SectionHeading", for: "details" },
              { t: "Description" },
              {
                t: "Cluster",
                children: [{ t: "Date", form: "full" }, { t: "Time" }, { t: "Venue" }],
              },
            ],
          },
        },
      },
      {
        kind: "rsvp",
        surface: "alt",
        root: {
          t: "Stack",
          children: [{ t: "SectionHeading", for: "rsvp" }, { t: "Deadline" }, { t: "RSVP" }],
        },
      },
      {
        kind: "registry",
        surface: "base",
        root: {
          t: "Surface",
          role: "alt",
          inset: "normal",
          child: {
            t: "Stack",
            children: [
              { t: "SectionHeading", for: "registry" },
              {
                t: "Registry",
                layout: {
                  t: "Grid",
                  columns: 3,
                  mobile: 1,
                  children: [
                    { t: "Cell", child: { t: "RegistryItem", kind: "gift" } },
                    { t: "Cell", child: { t: "RegistryItem", kind: "external" } },
                    { t: "Cell", child: { t: "RegistryItem", kind: "cashfund" } },
                  ],
                },
              },
            ],
          },
        },
      },
      {
        kind: "band",
        surface: "contrast",
        root: {
          t: "MotifBand",
          motif: { id: "linen", role: "band" },
          height: "tall",
          fill: "pattern",
        },
      },
    ],
  };
}

/** A minimal legal page, used where a test only needs a valid tree to mutate. */
function simplePage(heroRoot: CompositionTree["sections"][number]["root"]): CompositionTree {
  return {
    version: "composition_v1",
    sections: [
      { kind: "hero", surface: "base", root: heroRoot },
      {
        kind: "rsvp",
        surface: "base",
        root: {
          t: "Stack",
          children: [{ t: "SectionHeading", for: "rsvp" }, { t: "Deadline" }, { t: "RSVP" }],
        },
      },
      {
        kind: "registry",
        surface: "alt",
        root: {
          t: "Stack",
          children: [
            { t: "SectionHeading", for: "registry" },
            {
              t: "Registry",
              layout: {
                t: "Stack",
                children: [
                  { t: "RegistryItem", kind: "gift" },
                  { t: "RegistryItem", kind: "external" },
                ],
              },
            },
          ],
        },
      },
    ],
  };
}

const plainHero = (): CompositionTree["sections"][number]["root"] => ({
  t: "Stack",
  gap: "normal",
  children: [
    { t: "Eyebrow" },
    { t: "EventTitle", emphasis: "display" },
    { t: "Hosts" },
    { t: "Cluster", children: [{ t: "Date", form: "full" }, { t: "Time" }, { t: "Venue" }] },
  ],
});

describe("canonicalization", () => {
  it("is idempotent: the second pass changes neither the tree nor the hash", () => {
    const once = canonicalize(novelTree());
    const twice = canonicalize(once.tree);
    expect(twice.hash).toBe(once.hash);
    expect(twice.tree).toEqual(once.tree);
  });

  it("does not mutate its input", () => {
    const input = novelTree();
    const before = JSON.stringify(input);
    canonicalize(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("hashes the composition, not the order the model emitted props in", () => {
    const a = simplePage(plainHero());
    const b = simplePage({
      // the same Stack, props written in the other order
      children: [
        { t: "Eyebrow" },
        { t: "EventTitle", emphasis: "display" },
        { t: "Hosts" },
        { t: "Cluster", children: [{ t: "Date", form: "full" }, { t: "Time" }, { t: "Venue" }] },
      ],
      gap: "normal",
      t: "Stack",
    });
    expect(canonicalize(b).hash).toBe(canonicalize(a).hash);
  });
});

describe("schema validation", () => {
  it("rejects an unknown node type with a rule and a path", () => {
    const bad = clone(simplePage(plainHero()));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately illegal payload
    (bad.sections[0].root as any).children[0] = { t: "Marquee" };
    const result = validateSchema(bad);
    expect(result.ok).toBe(false);
    expect(result.errors[0].rule).toBe("schema.type");
    expect(result.errors[0].path).toBe("sections[0].root.children[0]");
  });

  it("rejects a number where a token string belongs, naming the prop path", () => {
    const bad = simplePage({
      t: "Split",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately illegal payload
      ratio: 62 as any,
      mobile: "stack",
      children: [plainHero(), { t: "Venue" }],
    });
    const result = validateSchema(bad);
    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.path === "sections[0].root.ratio");
    expect(err?.rule).toBe("schema.enum");
    expect(err?.detail).toContain("must be a string");
  });

  it("rejects an unknown key rather than tidying it away", () => {
    const bad = simplePage(plainHero());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately illegal payload
    (bad.sections[0].root as any).color = "#ff0000";
    const result = validateSchema(bad);
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ rule: "schema.key", path: "sections[0].root.color" }),
    );
  });
});

describe("attractive tokens", () => {
  const positives: Record<string, () => CompositionTree> = {
    staggerTitle: () =>
      simplePage({
        t: "Stack",
        children: [
          { t: "EventTitle", emphasis: "display", layout: "stagger" },
          { t: "Cluster", children: [{ t: "Date", form: "full" }, { t: "Venue" }] },
        ],
      }),
    heroNumeral: () =>
      simplePage({
        t: "Stack",
        children: [
          { t: "EventTitle", emphasis: "display" },
          { t: "Date", form: "numeral", emphasis: "display" },
          { t: "Venue" },
        ],
      }),
    watermark: () =>
      simplePage({
        t: "Overlay",
        anchor: "center",
        extent: "half",
        mobile: "keep",
        content: {
          t: "Stack",
          children: [
            { t: "EventTitle", emphasis: "display" },
            { t: "Cluster", children: [{ t: "Date", form: "full" }, { t: "Venue" }] },
          ],
        },
        decoration: { t: "Monogram", style: "watermark" },
      }),
  };

  it("covers every declared token with a positive fixture", () => {
    expect(ATTRACTIVE_TOKENS.map((t) => t.id).sort()).toEqual(Object.keys(positives).sort());
  });

  for (const token of ATTRACTIVE_TOKENS) {
    it(`detects ${token.id} and clears it by neutralizing`, () => {
      const tree = positives[token.id]();
      expect(token.detect(tree)).toBe(true);
      const repairs = token.neutralize(tree);
      expect(repairs.length).toBeGreaterThan(0);
      // Neutralization is a planner repair, logged like any other; it never calls a model.
      expect(repairs.every((r) => r.kind === "planner")).toBe(true);
      expect(repairs.every((r) => r.rule === "planner.attractiveToken")).toBe(true);
      expect(token.detect(tree)).toBe(false);
    });

    it(`leaves a tree without ${token.id} undetected and unchanged`, () => {
      const clean = simplePage(plainHero());
      expect(token.detect(clean)).toBe(false);
      const before = JSON.stringify(clean);
      expect(token.neutralize(clean)).toEqual([]);
      expect(JSON.stringify(clean)).toBe(before);
    });
  }
});

describe("hero similarity", () => {
  const railHero = (side: "start" | "end"): CompositionTree["sections"][number]["root"] => ({
    t: "Rail",
    side,
    width: "wide",
    mobile: "top",
    rail: { t: "MotifField", motif: { id: "linen", role: "field" } },
    child: {
      t: "Stack",
      children: [
        { t: "EventTitle", emphasis: "display" },
        { t: "Hosts" },
        { t: "Cluster", children: [{ t: "Date", form: "full" }, { t: "Venue" }] },
      ],
    },
  });

  it("scores a tree against itself at 1", () => {
    const t = novelTree();
    expect(heroSimilarity(t, t, "desktop")).toBe(1);
    expect(heroSimilarity(t, t, "mobile")).toBe(1);
  });

  it("collides mirrored heroes at or above the 0.70 threshold", () => {
    const a = simplePage(railHero("start"));
    const b = simplePage(railHero("end"));
    expect(heroSimilarity(a, b, "desktop")).toBeGreaterThanOrEqual(0.7);
  });

  it("keeps structurally distinct recipes below the 0.70 threshold", () => {
    const a = simplePage(railHero("start"));
    const b = simplePage(plainHero());
    expect(heroSimilarity(a, b, "desktop")).toBeLessThan(0.7);
  });
});

/**
 * WHY THIS TEST EXISTS.
 *
 * The 26 A.1 hero silhouettes are a library, not a menu: regression fixtures, rotated few-shot
 * examples, repair and fallback macros, and signature calibration
 * (`docs/event-renderer-system.md §1.12`, §7; `spec.md §32` guardrail against a template
 * gallery). Normal generation is always a model-authored CompositionTree over trusted
 * primitives. This test guards against quietly rebuilding the template system the architecture
 * rejected: a composition the rules admit must be first-class even when it resembles nothing in
 * the library.
 *
 * DEFERRED. This layer can observe schema validity, structural legality, canonicalization,
 * layout resolution and the signature. It cannot yet observe rendering or rendered-geometry
 * verification at 390 and 1280 (`docs/event-renderer-system.md §3.1`); those halves of the
 * guarantee arrive with the renderer packet and will be asserted here then.
 */
describe("novelty", () => {
  it("a novel composition is first-class without resembling any library silhouette", () => {
    const tree = novelTree();

    expect(validateSchema(tree).ok).toBe(true);
    expect(validateStructure(tree, FULL_CAPS)).toEqual([]);

    const once = canonicalize(tree);
    expect(once.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(canonicalize(once.tree).hash).toBe(once.hash);

    const layout = resolveLayout(once.tree, "balanced");
    const ids: string[] = [];
    walk(once.tree, ({ node }) => ids.push(node.id!));
    const nodeCount = once.tree.sections.reduce((n, s) => n + countNodes(s.root), 0);
    expect(ids).toHaveLength(nodeCount);
    expect(new Set(ids).size).toBe(nodeCount);
    for (const id of ids) expect(layout[id], `no resolved layout for node ${id}`).toBeDefined();

    const library = Object.entries(LIBRARY_HERO_SKELETONS);
    expect(library).toHaveLength(26);
    for (const mode of ["desktop", "mobile"] as const) {
      const hero = skeleton(tree, mode).hero;
      for (const [key, entry] of library) {
        const libraryHero =
          mode === "desktop" ? entry.skeletonDesktop.hero : entry.skeletonMobile.hero;
        const score = Math.round(seqSim(hero, libraryHero) * 100) / 100;
        expect(
          score,
          `the novel hero now resembles library silhouette "${key}" at ${mode} (${score} >= 0.70). ` +
            `Either the fixture stopped being novel, or something started constraining ` +
            `composition to the library — see docs/event-renderer-system.md §7.`,
        ).toBeLessThan(0.7);
      }
    }
  });
});
