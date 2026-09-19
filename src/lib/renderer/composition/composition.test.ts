/**
 * INTRINSIC TESTS. Nothing in this file calls `proof-b/`, so the suite still means something
 * once the reference implementation is deleted. Every fixture is hand-authored here, except the
 * novel-composition fixture shared with the boundary test and the 26 library hero skeletons,
 * which are read from the committed oracle
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
import { repair } from "./repair";
import { resolveLayout } from "./layout";
import type { Capabilities, CompositionTree } from "./nodes";
import { heroSimilarity, seqSim, similarity, skeleton } from "./signature";
import { validateSchema } from "./validate-schema";
import { validateStructure } from "./validate-structure";
import { rulesText, specText } from "./prompt-text";
import { clone, countNodes, walk } from "./walk";
import { novelTree } from "../../../../tests/fixtures/novel-composition";

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

/** The novel tree lives in `tests/fixtures/` so the boundary test asserts against the same one. */

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

/**
 * Production conformance for the array-child repairs, independent of `proof-b/`.
 *
 * The reference implementation resolved an array child's path to the node that owns the array
 * rather than to the array, so `Array.isArray(parent)` was never true and no array-child repair
 * could reach its removal branch (reference defect #1,
 * `docs/phase-3-reference-defects.md`). Production corrects the lookup, which is the one place
 * the port deliberately diverges. These tests state the behaviour the canonical documents
 * require, so they stand on their own once the reference is gone:
 *
 * - `docs/event-renderer-system.md §2.3`: "the validator drops any reference to a disabled
 *   capability as a `capability` repair" — drops, not replaces with a decorative stand-in;
 * - `docs/event-renderer-system.md §3`: the node-budget repair drops decorative leaves first,
 *   then trailing optional text, and only flattens a section when no graded drop is available.
 */
describe("array-child repairs (production conformance)", () => {
  /** The graded order the node-budget repair drops in: decorative first, optional text last. */
  const DROP_ORDER = [
    "Glyph",
    "Rule",
    "MotifBand",
    "MotifField",
    "Monogram",
    "Deadline",
    "Location",
    "Eyebrow",
    "Time",
    "Description",
    "Hosts",
  ];

  /** The rsvp and registry sections every tree needs to satisfy the coverage rules. */
  const tail = (): CompositionTree["sections"] =>
    [
      { kind: "rsvp", surface: "base", root: { t: "Stack", children: [{ t: "RSVP" }] } },
      { kind: "registry", surface: "alt", root: { t: "Stack", children: [{ t: "Registry" }] } },
    ] as unknown as CompositionTree["sections"];

  it("drops decorative and optional leaves in the documented order, without demolishing the section", () => {
    // One over-budget hero: a Frame wrapping a Cluster of required content, plus a long run of
    // droppable leaves, one of every kind in DROP_ORDER and enough repeats to exceed the budget.
    const droppable = [
      ...DROP_ORDER.flatMap((t) =>
        t === "Rule"
          ? [{ t: "Rule", weight: "hairline" }]
          : t === "Glyph"
            ? [{ t: "Glyph", motif: { id: "linen", role: "glyph" } }]
            : t === "MotifBand"
              ? [{ t: "MotifBand", height: "medium" }]
              : t === "MotifField"
                ? [{ t: "MotifField", motif: { id: "linen", role: "field" } }]
                : t === "Monogram"
                  ? [{ t: "Monogram" }]
                  : [{ t }],
      ),
      ...Array.from({ length: 34 }, () => ({ t: "Rule", weight: "hairline" })),
    ];
    const tree = {
      version: "composition_v1",
      sections: [
        {
          kind: "hero",
          surface: "base",
          root: {
            t: "Stack",
            children: [
              { t: "EventTitle", emphasis: "display" },
              {
                t: "Frame",
                rule: "hairline",
                inset: "normal",
                child: { t: "Cluster", children: [{ t: "Date", form: "full" }, { t: "Venue" }] },
              },
              ...droppable,
            ],
          },
        },
        ...tail(),
      ],
    } as unknown as CompositionTree;

    expect(countNodes(tree.sections[0].root)).toBeGreaterThan(40);

    const out = repair(clone(tree), FULL_CAPS, 7);
    const budget = out.repairs.filter((r) => r.rule === "limits.sectionNodes");

    // Graded drops actually ran, and the section was never flattened to its first eight leaves.
    expect(budget.length).toBeGreaterThan(0);
    expect(budget.map((r) => r.after)).not.toContain("flattened to leaves");
    expect(out.remaining).toEqual([]);

    // Each drop is of a kind no later in DROP_ORDER than the one before it.
    const ranks = budget.map((r) => DROP_ORDER.indexOf(r.before as string));
    expect(ranks).not.toContain(-1);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);

    // The structure the model authored survives: the Frame and its Cluster are still there, and
    // the content leaves were never candidates.
    const kinds: string[] = [];
    walk({ ...tree, sections: [out.tree.sections[0]] } as CompositionTree, (v) =>
      kinds.push(v.node.t),
    );
    expect(kinds).toContain("Frame");
    expect(kinds).toContain("Cluster");
    expect(kinds).toContain("EventTitle");
    expect(kinds).toContain("Date");
    expect(kinds).toContain("Venue");
  });

  it("removes a duplicate leaf instead of leaving a placeholder in its slot", () => {
    const tree = {
      version: "composition_v1",
      sections: [
        {
          kind: "hero",
          surface: "base",
          root: {
            t: "Stack",
            children: [
              { t: "EventTitle", emphasis: "display" },
              { t: "Date", form: "full" },
              { t: "Date", form: "full" },
              { t: "Venue" },
            ],
          },
        },
        ...tail(),
      ],
    } as unknown as CompositionTree;

    const out = repair(clone(tree), FULL_CAPS, 7);
    expect(out.repairs.some((r) => r.rule === "coverage.duplicate")).toBe(true);

    const hero = out.tree.sections[0].root as { children: { t: string }[] };
    expect(hero.children.map((c) => c.t)).toEqual(["EventTitle", "Date", "Venue"]);
    expect(out.remaining).toEqual([]);
  });

  it("removes a capability-disabled leaf instead of leaving a placeholder in its slot", () => {
    const caps: Capabilities = { ...FULL_CAPS, hosts: false, time: false };
    const tree = {
      version: "composition_v1",
      sections: [
        {
          kind: "hero",
          surface: "base",
          root: {
            t: "Stack",
            children: [
              { t: "EventTitle", emphasis: "display" },
              { t: "Hosts" },
              { t: "Date", form: "full" },
              { t: "Time" },
              { t: "Venue" },
            ],
          },
        },
        ...tail(),
      ],
    } as unknown as CompositionTree;

    const out = repair(clone(tree), caps, 7);
    expect(out.repairs.filter((r) => r.kind === "capability").map((r) => r.before)).toEqual([
      "Hosts",
      "Time",
    ]);

    const hero = out.tree.sections[0].root as { children: { t: string }[] };
    expect(hero.children.map((c) => c.t)).toEqual(["EventTitle", "Date", "Venue"]);
    expect(out.remaining).toEqual([]);
  });

  it("still replaces rather than removes when the node is an only child", () => {
    // Removal would leave an empty container, so the in-place substitution is correct here.
    const caps: Capabilities = { ...FULL_CAPS, hosts: false };
    const tree = {
      version: "composition_v1",
      sections: [
        {
          kind: "hero",
          surface: "base",
          root: {
            t: "Stack",
            children: [
              { t: "EventTitle", emphasis: "display" },
              { t: "Date", form: "full" },
              { t: "Stack", children: [{ t: "Hosts" }] },
            ],
          },
        },
        ...tail(),
      ],
    } as unknown as CompositionTree;

    const out = repair(clone(tree), caps, 7);
    expect(out.repairs.some((r) => r.kind === "capability" && r.before === "Hosts")).toBe(true);
    expect(JSON.stringify(out.tree)).not.toContain('"Hosts"');
    expect(out.remaining).toEqual([]);
  });
});

/**
 * Signature calibration, stated without `proof-b`.
 *
 * `docs/event-renderer-system.md §5`: the .70 threshold is "calibrated on the library" — mirror
 * pairs must collide, structurally distinct recipes must not, and the sixteen A.1 pages must all
 * sit below it. Those three facts are what make the threshold a usable collision test rather than
 * an arbitrary number, and they are properties of the signature, not of the reference.
 *
 * The library trees here come from the committed golden oracle's skeletons, so the calibration
 * still means something once `proof-b/` is gone.
 */
describe("signature calibration", () => {
  const THRESHOLD = 0.7;

  /** Skeleton-level similarity, from the oracle's captured hero token sequences. */
  const heroSim = (a: string, b: string, mode: "skeletonDesktop" | "skeletonMobile") =>
    Math.round(
      seqSim(LIBRARY_HERO_SKELETONS[a][mode].hero, LIBRARY_HERO_SKELETONS[b][mode].hero) * 100,
    ) / 100;

  it("collides the library's mirror pairs, which is what the threshold is calibrated on", () => {
    // Same silhouette, opposite handedness: the skeleton drops handedness, so these read as the
    // same page and must land on or above the threshold.
    for (const [a, b] of [
      ["editorial_daterail:rail_left", "editorial_daterail:rail_right"],
      ["editorial_masthead:rail_left", "editorial_masthead:rail_right"],
      ["statement_stack:alternate", "statement_stack:cascade"],
      ["invitation_ticket:stub_right", "invitation_ticket:stub_left"],
    ] as const) {
      expect(heroSim(a, b, "skeletonDesktop"), `${a} vs ${b}`).toBeGreaterThanOrEqual(THRESHOLD);
    }
  });

  it("keeps structurally distinct silhouettes below the threshold", () => {
    for (const [a, b] of [
      ["editorial_split:field_right", "invitation_ticket:stub_right"],
      ["typography_first:band_below", "statement_numeral:numeral_left"],
      ["editorial_rulegrid:cells", "invitation_monogram:crest"],
      ["framed_invitation:thin_frame", "editorial_masthead:rail_right"],
      // Not every "mirror" is one: this pair swaps the Split's ratio token as well as the side,
      // so the skeleton sees two different pages. The threshold is not a handedness test.
      ["editorial_split:field_right", "editorial_split:field_left"],
    ] as const) {
      expect(heroSim(a, b, "skeletonDesktop"), `${a} vs ${b}`).toBeLessThan(THRESHOLD);
    }
  });

  it("is symmetric, and scores a skeleton against itself as 1", () => {
    const keys = Object.keys(LIBRARY_HERO_SKELETONS);
    expect(keys).toHaveLength(26);
    for (const k of keys) expect(heroSim(k, k, "skeletonDesktop")).toBe(1);
    for (let i = 0; i < keys.length; i += 5)
      for (let j = 0; j < keys.length; j += 7)
        expect(heroSim(keys[i], keys[j], "skeletonDesktop")).toBe(
          heroSim(keys[j], keys[i], "skeletonDesktop"),
        );
  });

  it("credits nothing for the partial overlap every hero shares", () => {
    // Every hero contains a title stack, so `similarity` floors the hero term at .5 overlap.
    // Two trees sharing only that must score below the threshold on the hero term alone.
    const a = novelTree();
    const bare = {
      version: "composition_v1",
      sections: [
        {
          kind: "hero",
          surface: "base",
          root: { t: "Stack", children: [{ t: "EventTitle", emphasis: "display" }] },
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
    } as unknown as CompositionTree;

    for (const mode of ["desktop", "mobile"] as const) {
      const score = similarity(
        { tree: a, category: "heritage", tone: "dark" },
        { tree: bare, category: "grotesk_led", tone: "light" },
        mode,
      );
      expect(score, mode).toBeLessThan(THRESHOLD);
    }
  });

  it("scores an identical tree as a collision, in both modes", () => {
    const tree = novelTree();
    for (const mode of ["desktop", "mobile"] as const)
      expect(
        similarity(
          { tree, category: "heritage", tone: "dark" },
          { tree, category: "heritage", tone: "dark" },
          mode,
        ),
      ).toBe(1);
  });
});

/**
 * The Artwork leaf (`spec.md §7.6a`, primitive set `composition_v2`).
 *
 * Artwork is the composition language's answer to "where", never "what". Every rule added with it
 * is structural or capability-scoped, so every one of them repairs deterministically and none is
 * ever a re-prompt (`spec.md §32` #21, #22, #24).
 */
describe("the Artwork leaf", () => {
  const ART_CAPS: Capabilities = { ...FULL_CAPS, artwork: true };

  /** A hero that satisfies coverage on its own, plus whatever artwork a test wants to place. */
  const heroWith = (...extra: Record<string, unknown>[]) =>
    ({
      t: "Stack",
      gap: "normal",
      children: [
        { t: "EventTitle", emphasis: "display" },
        { t: "Venue" },
        { t: "Date", form: "full" },
        ...extra,
      ],
    }) as unknown as CompositionTree["sections"][number]["root"];

  /** Repair, and assert it left nothing behind. */
  const repaired = (tree: CompositionTree, caps: Capabilities) => {
    const out = repair(tree, caps);
    expect(out.remaining, "repair left violations behind").toEqual([]);
    expect(validateStructure(out.tree, caps)).toEqual([]);
    return out;
  };

  describe("validates", () => {
    it("accepts the leaf with only its required role, in every role", () => {
      for (const role of ["anchor", "object", "atmosphere", "framed"]) {
        const tree = simplePage(heroWith({ t: "Artwork", role }));
        expect(validateSchema(tree).ok, role).toBe(true);
        expect(validateStructure(tree, ART_CAPS), role).toEqual([]);
      }
    });

    it("accepts the leaf with every optional prop set, in every extent", () => {
      for (const extent of ["quarter", "third", "half", "full"]) {
        const tree = simplePage(heroWith({ t: "Artwork", role: "anchor", extent }));
        expect(validateSchema(tree).ok, extent).toBe(true);
        expect(validateStructure(tree, ART_CAPS), extent).toEqual([]);
      }
    });

    it("carries no asset, no geometry and no creative brief", () => {
      // `spec.md §7.6a #3` and `§32 #13`: the leaf says where artwork goes, never what it is or
      // how big it is. The brief is assembled downstream into `VisualArtIntent`.
      const tree = simplePage(heroWith({ t: "Artwork", role: "anchor", extent: "half" }));
      expect(validateSchema(tree).ok).toBe(true);
      walk(tree, ({ node: n }) => {
        if (n.t !== "Artwork") return;
        expect(Object.keys(n).sort()).toEqual(["extent", "role", "t"]);
      });
    });

    it("stays valid and renderable with no asset in existence", () => {
      // The leaf is a declaration of intent, not a dependency. Nothing downstream of the language
      // needs an asset for the tree to canonicalize and resolve.
      const tree = simplePage(heroWith({ t: "Artwork", role: "atmosphere" }));
      expect(validateStructure(tree, ART_CAPS)).toEqual([]);
      const canon = canonicalize(tree);
      expect(validateStructure(canon.tree, ART_CAPS)).toEqual([]);
      const layout = resolveLayout(canon.tree, "balanced");
      // The leaf resolves to a real layout entry, so the compiler has somewhere to put artwork —
      // and the page still resolves when nothing ever fills it.
      expect(Object.keys(layout).length).toBeGreaterThan(0);
    });
  });

  describe("capability scoping", () => {
    it("is a capability violation when artwork is not enabled, and is stripped", () => {
      const tree = simplePage(heroWith({ t: "Artwork", role: "anchor" }));
      const violations = validateStructure(tree, FULL_CAPS);
      expect(violations.map((v) => v.rule)).toEqual(["capability.node"]);
      expect(violations[0].detail).toBe("Artwork not available");

      const out = repaired(tree, FULL_CAPS);
      expect(out.repairs.some((r) => r.rule === "capability.node" && r.kind === "capability")).toBe(
        true,
      );
      expect(countArtwork(out.tree)).toBe(0);
    });

    it("treats an absent artwork flag as disabled, never as permitted", () => {
      // Default-deny: `Capabilities.artwork` is optional, and a caller that never heard of
      // artwork must not silently be granted it.
      const tree = simplePage(heroWith({ t: "Artwork", role: "anchor" }));
      expect("artwork" in FULL_CAPS).toBe(false);
      expect(validateStructure(tree, FULL_CAPS).map((v) => v.rule)).toEqual(["capability.node"]);
      expect(validateStructure(tree, { ...FULL_CAPS, artwork: false }).map((v) => v.rule)).toEqual([
        "capability.node",
      ]);
      expect(validateStructure(tree, ART_CAPS)).toEqual([]);
    });

    it("is not offered in the prompt unless artwork is enabled", () => {
      expect(specText(FULL_CAPS)).not.toContain("Artwork");
      expect(rulesText(FULL_CAPS)).not.toContain("Artwork");
      expect(specText(ART_CAPS)).toMatch(/^Artwork /m);
      expect(rulesText(ART_CAPS)).toContain("Artwork");
      // And the caps that predate artwork produce exactly the bytes they always did.
      expect(specText({ ...FULL_CAPS, artwork: false })).toBe(specText(FULL_CAPS));
      expect(rulesText({ ...FULL_CAPS, artwork: false })).toBe(rulesText(FULL_CAPS));
    });
  });

  describe("placement", () => {
    it("may be an Overlay decoration, behind the text", () => {
      const tree = simplePage({
        t: "Overlay",
        anchor: "center",
        extent: "full",
        mobile: "stack",
        content: heroWith(),
        decoration: { t: "Artwork", role: "atmosphere", extent: "full" },
      } as unknown as CompositionTree["sections"][number]["root"]);
      expect(validateStructure(tree, ART_CAPS)).toEqual([]);
    });

    it("is refused where any decorative leaf is refused, and repaired there", () => {
      const cases: [string, CompositionTree][] = [
        // a bare leaf cannot be a section root
        ["sections.root", simplePage({ t: "Artwork", role: "anchor" } as never)],
        // a Cluster is an inline row of small items
        [
          "nesting.cluster",
          simplePage(
            heroWith({
              t: "Cluster",
              children: [{ t: "Time" }, { t: "Artwork", role: "object" }],
            }),
          ),
        ],
        // a Rail's rail is a MotifField or a Stack of small leaves
        [
          "nesting.rail",
          simplePage({
            t: "Rail",
            side: "start",
            width: "thin",
            mobile: "top",
            rail: { t: "Artwork", role: "object" },
            child: heroWith(),
          } as unknown as CompositionTree["sections"][number]["root"]),
        ],
      ];
      for (const [rule, tree] of cases) {
        expect(
          validateStructure(tree, ART_CAPS).map((v) => v.rule),
          rule,
        ).toContain(rule);
        repaired(tree, ART_CAPS);
      }
    });
  });

  describe("caps", () => {
    it("allows one per section and drops the surplus", () => {
      const tree = simplePage(
        heroWith({ t: "Artwork", role: "anchor" }, { t: "Artwork", role: "object" }),
      );
      const violations = validateStructure(tree, ART_CAPS);
      expect(violations.map((v) => v.rule)).toContain("limits.perSection");

      const out = repaired(tree, ART_CAPS);
      expect(countArtwork(out.tree)).toBe(1);
      expect(
        out.repairs.some((r) => r.rule === "limits.perSection" && r.after?.includes("dropped")),
      ).toBe(true);
    });

    it("allows two per page and drops the surplus", () => {
      const tree = simplePage(heroWith({ t: "Artwork", role: "anchor" }));
      // one more in each of the other two sections: within the per-section cap, over the page cap
      for (const i of [1, 2])
        (tree.sections[i].root as { children: unknown[] }).children.push({
          t: "Artwork",
          role: "object",
        });
      expect(validateStructure(tree, ART_CAPS).map((v) => v.rule)).toContain("limits.perPage");

      const out = repaired(tree, ART_CAPS);
      expect(countArtwork(out.tree)).toBe(2);
    });
  });

  describe("repair discipline", () => {
    /**
     * `spec.md §32` #21/#24: the three re-prompts are schema-invalid output, a token-cap
     * violation and a selector collision. Nothing artwork adds may join that list, so every rule
     * it introduces must repair to a clean tree and be logged by kind.
     */
    it("repairs every artwork defect deterministically, logged, and never re-promptably", () => {
      const capability = simplePage(heroWith({ t: "Artwork", role: "anchor" }));
      const overCap = simplePage(
        heroWith({ t: "Artwork", role: "anchor" }, { t: "Artwork", role: "object" }),
      );
      // A bad enum is the one artwork defect the schema catches; it never reaches repair.
      const badRole = simplePage(heroWith({ t: "Artwork", role: "mural" }));
      expect(validateSchema(badRole).ok).toBe(false);

      for (const [label, tree, caps] of [
        ["capability", capability, FULL_CAPS],
        ["over cap", overCap, ART_CAPS],
      ] as const) {
        expect(validateSchema(tree).ok, label).toBe(true);
        const out = repaired(tree, caps);
        expect(out.repairs.length, label).toBeGreaterThan(0);
        for (const r of out.repairs) {
          expect(r.rule, label).toBeTruthy();
          expect(r.path, label).toBeTruthy();
          expect(
            ["structural", "coverage", "capability", "responsive", "planner"],
            `${label} kind`,
          ).toContain(r.kind);
        }
      }
    });

    it("is deterministic: the same defective tree repairs to the same tree twice", () => {
      const tree = simplePage(
        heroWith({ t: "Artwork", role: "anchor" }, { t: "Artwork", role: "object" }),
      );
      const a = repair(clone(tree), ART_CAPS);
      const b = repair(clone(tree), ART_CAPS);
      expect(JSON.stringify(a.tree)).toBe(JSON.stringify(b.tree));
      expect(JSON.stringify(a.repairs)).toBe(JSON.stringify(b.repairs));
    });
  });
});

/** How many Artwork leaves a tree holds. */
function countArtwork(tree: CompositionTree): number {
  let n = 0;
  walk(tree, ({ node }) => {
    if (node.t === "Artwork") n++;
  });
  return n;
}
