/**
 * The Phase 3 exit gate, minus geometry.
 *
 * `docs/event-renderer-system.md §9` lists the regression gates Phase 3 must clear. The ones that
 * need a browser live in `src/lib/renderer/verify/`; everything provable without one lives here,
 * so a failure points at the language, the compiler or the renderer rather than at Chromium.
 *
 * Every input is either a committed golden fixture or the reference library loaded read-only. The
 * 72 frozen confirmation trees are replayed through the **production** compiler and the
 * **production** renderer — one renderer, no recipe-specific path.
 *
 * Acceptance criteria: `spec.md §31 — Renderer proof` and `DesignIntent, composition and
 * compiler`; `spec.md §32` #14, #15, #22.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EventPage } from "@/components/event-renderer/page";
import { FULLY_CONFIGURED } from "@/components/event-renderer/feature-presentation";
import { assemblePreVerificationSpec } from "@/lib/renderer/compile/spec";
import { SEMANTIC_COPY_STRINGS } from "@/lib/renderer/compile/semantic-copy";
import { canonicalize } from "@/lib/renderer/composition/canonicalize";
import type { Capabilities, CompositionTree } from "@/lib/renderer/composition/nodes";
import { repair } from "@/lib/renderer/composition/repair";
import { heroSimilarity, seqSim, skeleton, similarity } from "@/lib/renderer/composition/signature";
import { validateSchema } from "@/lib/renderer/composition/validate-schema";
import { validateStructure } from "@/lib/renderer/composition/validate-structure";
import { walk } from "@/lib/renderer/composition/walk";
import {
  HEROES,
  HERO_KEYS,
  DETAILS,
  RSVPS,
  REGISTRIES,
  page,
  A1_SITES,
} from "@/lib/renderer/library";
import type { DesignIntent } from "@/lib/renderer/design-intent";
import { COLLISION_THRESHOLD } from "@/lib/renderer/planner/selector";

const PROOF = new URL("../../proof-b/", import.meta.url);
const GOLDEN = new URL("../../tests/fixtures/renderer-golden/", import.meta.url).pathname;
/* eslint-disable @typescript-eslint/no-explicit-any -- the reference side is untyped CommonJS. */
const requireProof = createRequire(PROOF);
const A: any = requireProof("./fixtures/adversarial.js");
const { FULL_CAPS, REDUCED_CAPS } = requireProof("./compile.js") as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const CAPS = FULL_CAPS as Capabilities;
const REDUCED = REDUCED_CAPS as Capabilities;

const CONTENT = {
  eyebrow: "A winter gathering",
  title: "Baby Shaker is on the way",
  hosts: "Hosted with love by Haseeb & Shezia",
  description: "An afternoon of good food and warm company.",
  date: "Saturday, December 19, 2026",
  dayNumeral: "19",
  monthShort: "Dec",
  year: "2026",
  weekday: "Saturday",
  time: "1:00–5:00 PM",
  venue: "The Lodge at Hanson Park",
  location: "Aldie, Virginia",
  deadline: "Kindly respond by December 1",
  initial: "B",
};

const INTENT: DesignIntent = {
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
    ornament: "restrained",
  },
  motifs: ["plaid", "equestrian"],
};

/** The canonical tree a spec actually handed to the renderer. */
function renderedComposition(spec: { composition: CompositionTree }): CompositionTree {
  return spec.composition;
}

function renderSpec(spec: Parameters<typeof EventPage>[0]["spec"]): string {
  return renderToStaticMarkup(
    createElement(EventPage, {
      spec,
      content: CONTENT,
      audience: "guest" as const,
      // Every feature configured: these are Phase 3 exit proofs about the compiled tree and the
      // production copy table, not about guest visibility of an unconfigured feature.
      presentation: FULLY_CONFIGURED,
    }),
  );
}

function renderTree(tree: CompositionTree, caps: Capabilities = CAPS): string {
  return renderSpec(
    assemblePreVerificationSpec({
      composition: tree,
      designIntent: INTENT,
      capabilities: caps,
      seed: 7,
    }),
  );
}

function frozen(set: "final" | "final-reduced") {
  const file = set === "final" ? "frozen-final.json" : "frozen-final-reduced.json";
  const recs = JSON.parse(readFileSync(path.join(GOLDEN, file), "utf8")) as Record<
    string,
    { spec: { composition: CompositionTree; designIntent: Record<string, string> } }
  >;
  return Object.entries(recs).map(([id, r]) => ({ id, ...r.spec }));
}

describe("§9 gate 1: language and repair", () => {
  it("rejects every schema-invalid payload with a rule and a path", () => {
    expect(A.schemaInvalid.length).toBeGreaterThan(0);
    for (const fixture of A.schemaInvalid as { name: string; tree: unknown }[]) {
      const result = validateSchema(fixture.tree);
      expect(result.ok, fixture.name).toBe(false);
      expect(result.errors!.length, fixture.name).toBeGreaterThan(0);
      for (const e of result.errors!) {
        expect(e.rule, fixture.name).toBeTruthy();
        expect(typeof e.path, fixture.name).toBe("string");
      }
    }
  });

  it("repairs every structural fixture to zero remaining violations", () => {
    expect(A.structural.length).toBe(37);
    for (const f of A.structural as {
      name: string;
      tree: CompositionTree;
      caps?: Capabilities;
    }[]) {
      const caps = f.caps ?? CAPS;
      const out = repair(f.tree, caps, 7);
      expect(out.remaining, f.name).toEqual([]);
      expect(validateStructure(out.tree, caps), f.name).toEqual([]);
    }
  });
});

describe("§9 gate 3: expressiveness through the one production renderer", () => {
  const tail = (rsvp: keyof typeof RSVPS, registry: keyof typeof REGISTRIES) => [
    { kind: "rsvp" as const, surface: "base" as const, root: RSVPS[rsvp]() },
    { kind: "registry" as const, surface: "alt" as const, root: REGISTRIES[registry]() },
  ];

  it("renders all 26 hero silhouettes, each through the same renderer", () => {
    expect(HERO_KEYS).toHaveLength(26);
    for (const key of HERO_KEYS) {
      const tree = canonicalize({
        version: "composition_v1",
        sections: [
          { kind: "hero", surface: "base", root: HEROES[key]() },
          ...tail("rsvp_typographic_stack", "registry_tiles"),
        ],
      } as unknown as CompositionTree).tree;
      expect(validateStructure(tree, CAPS), key).toEqual([]);
      const html = renderTree(tree);
      expect(html.length, key).toBeGreaterThan(0);
      expect(html, key).toContain('class="ev-site');
      // The silhouette's own name never reaches the markup: there is no path per recipe.
      expect(html.includes(key), key).toBe(false);
      expect(html.includes(key.split(":")[0]), key).toBe(false);
    }
  });

  it("keeps all 13 section recipes expressible and renderable", () => {
    const recipes: [string, () => ReturnType<(typeof HEROES)[keyof typeof HEROES]>][] = [
      ...Object.entries(DETAILS).map(([k, f]) => [`details:${k}`, f] as [string, typeof f]),
      ...Object.entries(RSVPS).map(([k, f]) => [`rsvp:${k}`, f] as [string, typeof f]),
      ...Object.entries(REGISTRIES).map(([k, f]) => [`registry:${k}`, f] as [string, typeof f]),
    ];
    expect(recipes).toHaveLength(13);

    for (const [name, factory] of recipes) {
      const kind = name.split(":")[0] as "details" | "rsvp" | "registry";
      const sections = [
        { kind: "hero" as const, surface: "base" as const, root: HEROES[HERO_KEYS[0]]() },
        { kind, surface: "base" as const, root: factory() },
        ...(kind === "rsvp" ? [] : tail("rsvp_typographic_stack", "registry_tiles").slice(0, 1)),
        ...(kind === "registry" ? [] : tail("rsvp_typographic_stack", "registry_tiles").slice(1)),
      ];
      const raw = { version: "composition_v1", sections } as unknown as CompositionTree;

      // The strict schema judges *raw model output*, so it is applied before canonicalization —
      // a canonical tree carries compiler-stamped ids the schema rightly rejects as unknown keys,
      // and validating one here would either fail or have to be waved through.
      const schema = validateSchema(raw);
      expect(schema.ok, `${name}: ${JSON.stringify(schema.errors?.slice(0, 3))}`).toBe(true);

      // What matters at this stage: the canonical tree is structurally valid, compiles, and
      // renders through the one production renderer. Geometry verifies it clean separately
      // (`verify/frozen-replay.test.ts` and the expressiveness run).
      const tree = canonicalize(raw).tree;
      expect(validateStructure(tree, CAPS), name).toEqual([]);

      const spec = assemblePreVerificationSpec({
        composition: tree,
        designIntent: INTENT,
        capabilities: CAPS,
        seed: 7,
      });
      expect(Object.keys(spec.layout).length, name).toBeGreaterThan(0);
      expect(spec.compositionHash, name).toBeTruthy();

      const html = renderTree(tree);
      expect(html.length, name).toBeGreaterThan(0);
      expect(html, name).toContain('class="ev-site');
      expect(html.includes(name.split(":")[1]), name).toBe(false);
    }
  });

  it("renders all 16 A.1 pages with no recipe-specific path", () => {
    expect(A1_SITES).toHaveLength(16);
    for (const site of A1_SITES) {
      const tree = canonicalize(
        page(site.hero, site.details, site.rsvp, site.registry, site.plan, site.align),
      ).tree;
      const html = renderTree(tree);
      expect(html.length, site.id).toBeGreaterThan(0);
      for (const id of [
        site.hero,
        site.hero.split(":")[0],
        site.details,
        site.rsvp,
        site.registry,
        site.plan,
      ])
        expect(html.includes(id), `${site.id} leaked ${id}`).toBe(false);
    }
  });
});

describe("§9 gate 4: the frozen confirmation replay through production", () => {
  it("replays all 72 accepted trees through the compiler and the renderer", () => {
    let replayed = 0;
    for (const [set, caps] of [
      ["final", CAPS],
      ["final-reduced", REDUCED],
    ] as const) {
      const trees = frozen(set);
      expect(trees).toHaveLength(set === "final" ? 60 : 12);
      for (const { id, composition } of trees) {
        const where = `${set}:${id}`;
        expect(validateStructure(composition, caps), where).toEqual([]);

        // Captured *before* anything downstream touches the tree, so the assertions after the
        // render compare against a real earlier state rather than against themselves.
        const treeBefore = JSON.stringify(composition);
        const hashBefore = canonicalize(composition).hash;
        const shapeBefore: string[] = [];
        walk(composition, ({ node, path }) => {
          const n = node as unknown as Record<string, unknown>;
          const authored = Object.keys(n)
            .filter((k) => k !== "children" && k !== "child" && k !== "id")
            .sort()
            .map((k) => `${k}=${JSON.stringify(n[k])}`)
            .join(",");
          shapeBefore.push(`${path}|${node.id}|${node.t}|${authored}`);
        });
        expect(shapeBefore.length, where).toBeGreaterThan(0);

        const spec = assemblePreVerificationSpec({
          composition,
          designIntent: INTENT,
          capabilities: caps,
          seed: 1,
        });

        // The renderer is handed `spec.composition` — canonicalization's clone, not the input —
        // so the clone needs its own before/after. A primitive that wrote into the node it renders
        // would corrupt the tree that gets persisted, and comparing only the input would miss it.
        const canonicalBefore = JSON.stringify(spec.composition);
        const html = renderSpec(spec);
        expect(html.length, where).toBeGreaterThan(0);
        expect(
          JSON.stringify(renderedComposition(spec)),
          `${where}: the renderer wrote into the canonical tree`,
        ).toBe(canonicalBefore);

        // Compiling and rendering are read-only. The hash is compared against the value captured
        // above, not against a second call to the same function.
        expect(JSON.stringify(composition), `${where}: tree changed`).toBe(treeBefore);
        expect(canonicalize(composition).hash, `${where}: hash changed`).toBe(hashBefore);
        expect(spec.compositionHash, `${where}: spec hash differs from the tree's`).toBe(
          hashBefore,
        );

        // Node ids, types and authored props are all still what the model wrote.
        const shapeAfter: string[] = [];
        walk(composition, ({ node, path }) => {
          const n = node as unknown as Record<string, unknown>;
          const authored = Object.keys(n)
            .filter((k) => k !== "children" && k !== "child" && k !== "id")
            .sort()
            .map((k) => `${k}=${JSON.stringify(n[k])}`)
            .join(",");
          shapeAfter.push(`${path}|${node.id}|${node.t}|${authored}`);
        });
        expect(shapeAfter, `${where}: node ids, types or authored props changed`).toEqual(
          shapeBefore,
        );

        replayed++;
      }
    }
    expect(replayed).toBe(72);
  });

  it("counts 72 trees and 74 model calls — the two rejected attempts are not trees", () => {
    const index = JSON.parse(readFileSync(path.join(GOLDEN, "index.json"), "utf8")) as {
      counts: { acceptedTrees: number; modelCalls: number; rejectedAttempts: number };
    };
    expect(index.counts).toEqual({ acceptedTrees: 72, modelCalls: 74, rejectedAttempts: 2 });
  });

  it("leaks no disabled capability in the reduced-capability batch", () => {
    for (const { id, composition } of frozen("final-reduced")) {
      const html = renderTree(composition, REDUCED);
      for (const forbidden of [
        "ev-t-Registry",
        "ev-t-RegistryItem",
        "ev-t-CashFund",
        "ev-t-Description",
      ])
        expect(html.includes(forbidden), `final-reduced:${id} rendered ${forbidden}`).toBe(false);
      expect(validateStructure(composition, REDUCED), id).toEqual([]);
    }
  });
});

describe("§9 gate 4: diversity and signature, from the frozen outputs", () => {
  const all = [...frozen("final"), ...frozen("final-reduced")];

  it("has at least 30 distinct hero skeletons in the 60-tree batch", () => {
    const heroes = new Set(
      frozen("final").map((t) => skeleton(t.composition, "desktop").heroString),
    );
    expect(heroes.size).toBeGreaterThanOrEqual(30);
  });

  it("is at least 40% novel against the legacy regression library", () => {
    const libraryHeroes = HERO_KEYS.map(
      (k) =>
        skeleton(
          canonicalize({
            version: "composition_v1",
            sections: [
              { kind: "hero", surface: "base", root: HEROES[k]() },
              { kind: "rsvp", surface: "base", root: RSVPS.rsvp_typographic_stack() },
            ],
          } as unknown as CompositionTree).tree,
          "desktop",
        ).hero,
    );
    const batch = frozen("final");
    const novel = batch.filter((t) => {
      const hero = skeleton(t.composition, "desktop").hero;
      return libraryHeroes.every((lib) => seqSim(hero, lib) < COLLISION_THRESHOLD);
    });
    expect(novel.length / batch.length).toBeGreaterThanOrEqual(0.4);
  });

  it("has zero sibling collisions after the selector, across all 72", () => {
    const accepted: { tree: CompositionTree; category?: string; tone?: string }[] = [];
    for (const t of all) {
      const sig = {
        tree: t.composition,
        category: t.designIntent.typographyCategory,
        tone: t.designIntent.tonalDirection,
      };
      for (const a of accepted)
        for (const mode of ["desktop", "mobile"] as const)
          expect(similarity(sig, a, mode), `${t.id} vs an accepted sibling`).toBeLessThan(
            COLLISION_THRESHOLD,
          );
      accepted.push(sig);
    }
    expect(accepted).toHaveLength(72);
  });

  it("keeps the signature threshold at .70, unchanged", () => {
    expect(COLLISION_THRESHOLD).toBe(0.7);
    // And it still separates a mirror pair from a distinct pair, as it was calibrated to.
    const hero = (k: string) =>
      canonicalize({
        version: "composition_v1",
        sections: [
          { kind: "hero", surface: "base", root: HEROES[k as keyof typeof HEROES]() },
          { kind: "rsvp", surface: "base", root: RSVPS.rsvp_typographic_stack() },
        ],
      } as unknown as CompositionTree).tree;
    expect(
      heroSimilarity(hero("editorial_daterail:rail_left"), hero("editorial_daterail:rail_right")),
    ).toBeGreaterThanOrEqual(COLLISION_THRESHOLD);
    expect(
      heroSimilarity(hero("editorial_split:field_right"), hero("invitation_ticket:stub_right")),
    ).toBeLessThan(COLLISION_THRESHOLD);
  });
});

describe("§14: the geometry baseline uses the production copy table", () => {
  it("renders the canonical neutral headings, not proof-b's fictional lodge copy", () => {
    const tree = canonicalize(
      page(
        "editorial_split:field_right",
        "details_split_panel",
        "rsvp_contrast_split",
        "registry_featured",
        "SP1_dark_opening",
        "start",
      ),
    ).tree;
    const html = renderTree(tree);
    for (const copy of SEMANTIC_COPY_STRINGS) expect(html, copy).toContain(copy);
    for (const lodge of ["Join us at the lodge", "the lodge", "Kindly reply"])
      expect(html.includes(lodge), `rendered proof-b sample copy "${lodge}"`).toBe(false);
  });
});
