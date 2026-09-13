/**
 * PARITY TESTS. Every test in this file compares the production composition core against the
 * reference implementation in `proof-b/`, either through the golden oracle captured from it
 * (`tests/fixtures/renderer-golden/`, see `scripts/renderer/capture-golden.mjs`) or by calling
 * the reference directly. They exist to prove Phase 3 item 1 is a port with no behaviour change.
 *
 * These tests die with `proof-b/`. The intrinsic behaviour tests that must outlive it are in
 * `composition.test.ts`.
 *
 * The inputs come from the reference side on purpose: `proof-b/library.js`,
 * `proof-b/fixtures/adversarial.js` and the frozen model responses under `proof-b/model/`*`/raw`
 * are the regression suite (`docs/event-renderer-system.md §9`). Nothing here writes to
 * `proof-b/` or to the golden fixtures.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` and
 * `Renderer proof`; no product behaviour change (this is a port).
 */

import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalize } from "./canonicalize";
import { estimateFit } from "./fit-estimate";
import { resolveLayout } from "./layout";
import { rulesText, specText } from "./prompt-text";
import { DEFAULT_MACROS, repair, type Macros } from "./repair";
import { skeleton } from "./signature";
import { validateSchema } from "./validate-schema";
import { validateStructure } from "./validate-structure";
import type { Capabilities, CompositionTree, Section } from "./nodes";

const PROOF_URL = new URL("../../../../proof-b/", import.meta.url);
const PROOF_DIR = PROOF_URL.pathname;
const GOLDEN_DIR = new URL("../../../../tests/fixtures/renderer-golden/", import.meta.url).pathname;

const requireProof = createRequire(PROOF_URL);
/* eslint-disable @typescript-eslint/no-explicit-any -- the reference side is untyped CommonJS. */
const REF: any = requireProof("./dist/composition.js");
const L: any = requireProof("./library.js");
const A: any = requireProof("./fixtures/adversarial.js");
const { CONTENT, FULL_CAPS, REDUCED_CAPS, FIT_METRICS } = requireProof("./compile.js") as any;
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

describe("parity: the library", () => {
  it("validates, canonicalizes and skeletonizes all 26 hero silhouettes identically", () => {
    const heroes: Record<string, unknown> = {};
    for (const key of L.heroKeys) {
      const tree: CompositionTree = {
        version: "composition_v1",
        sections: [
          { kind: "hero", surface: "base", root: L.HEROES[key]() },
          { kind: "rsvp", surface: "base", root: L.RSVPS.rsvp_typographic_stack() },
          { kind: "registry", surface: "alt", root: L.REGISTRIES.registry_tiles() },
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
      ["details", L.DETAILS],
      ["rsvp", L.RSVPS],
      ["registry", L.REGISTRIES],
    ] as [string, Record<string, () => Section["root"]>][]) {
      for (const key of Object.keys(table)) {
        sections[`${group}:${key}`] = canonicalize({
          version: "composition_v1",
          sections: [
            { kind: "hero", surface: "base", root: L.HEROES[L.heroKeys[0]]() },
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
    for (const row of L.A1_SITES) {
      const tree: CompositionTree = L.page(row[1], row[2], row[3], row[4], row[5], row[6]);
      const once = canonicalize(tree);
      const twice = canonicalize(once.tree);
      pages[row[0]] = {
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

describe("parity: the adversarial set", () => {
  it("rejects every schema-invalid payload with the same rule and path", () => {
    const produced = A.schemaInvalid.map((f: { name: string; tree: unknown }) => ({
      name: f.name,
      result: validateSchema(f.tree),
    }));
    expect(produced.length).toBeGreaterThan(0);
    expect(normalize(produced)).toEqual(golden("adversarial-schema-invalid.json"));
  });

  /**
   * The five fixtures on which production deliberately diverges from the reference, all through
   * the single correction of reference defect #1 (`docs/phase-3-reference-defects.md`). The
   * reference's parent lookup resolved an array child's path to the node that owns the array, so
   * `Array.isArray(parent)` was never true and no array-child repair could ever reach its removal
   * branch: a dropped duplicate or capability-disabled node was replaced in place by a hairline
   * `Rule` the model never authored, and the node-budget repair skipped its graded drops entirely.
   *
   * Every other fixture, all 26 silhouettes, all 13 section recipes, all 16 A.1 pages and all 72
   * frozen confirmation trees are byte-identical to the reference.
   */
  const DEFECT_1_DIVERGENCES = [
    "two EventTitles",
    "73 nodes in one section",
    "Date three times, same form, in the hero",
    "capabilities: Hosts, Description, CashFund and registry used on an event with none of them",
    "capabilities: no rsvp on this event but an rsvp section",
  ];

  const runStructural = (
    engine: { repair: typeof repair; validateStructure: typeof validateStructure },
    f: { name: string; tree: CompositionTree; caps?: Capabilities },
  ) => {
    const caps = f.caps || FULL_CAPS;
    const before = engine.validateStructure(f.tree, caps);
    const repaired = engine.repair(f.tree, caps, 7);
    return normalize({
      name: f.name,
      violationsBefore: before,
      repairs: repaired.repairs,
      remaining: repaired.remaining,
      repairedSchemaOk: validateSchema(repaired.tree).ok,
      repairedTree: repaired.tree,
    });
  };

  it("repairs every unaffected structural fixture with the same repair list, in the same order", () => {
    const oracle = golden("adversarial-structural.json") as { name: string }[];
    const fixtures = A.structural as { name: string; tree: CompositionTree; caps?: Capabilities }[];
    expect(fixtures).toHaveLength(oracle.length);

    const unaffected = fixtures
      .map((f, i) => [f, oracle[i]] as const)
      .filter(([f]) => !DEFECT_1_DIVERGENCES.includes(f.name));
    expect(unaffected).toHaveLength(fixtures.length - DEFECT_1_DIVERGENCES.length);

    for (const [f, expected] of unaffected)
      expect(runStructural({ repair, validateStructure }, f)).toEqual(expected);
  });

  it("diverges from the oracle on exactly the five fixtures defect #1 affects, and nowhere else", () => {
    const oracle = golden("adversarial-structural.json") as unknown[];
    const fixtures = A.structural as { name: string; tree: CompositionTree; caps?: Capabilities }[];
    const diverging = fixtures.filter(
      (f, i) =>
        JSON.stringify(runStructural({ repair, validateStructure }, f)) !==
        JSON.stringify(oracle[i]),
    );
    expect(diverging.map((f) => f.name)).toEqual(DEFECT_1_DIVERGENCES);
  });

  it("leaves the oracle an intact record of the reference: the reference still reproduces it", () => {
    // The divergence is ours and deliberate. The captured oracle is not edited to hide it, so the
    // reference must still replay to it exactly — including on the five fixtures above.
    const produced = (
      A.structural as { name: string; tree: CompositionTree; caps?: Capabilities }[]
    ).map((f) =>
      runStructural({ repair: REF.repair, validateStructure: REF.validateStructure }, f),
    );
    expect(produced).toEqual(golden("adversarial-structural.json"));
  });
});

/**
 * The frozen confirmation set. `proof-b/compile.js` is the pipeline the oracle was captured
 * through; it is replayed here with the production core substituted for the reference core, and
 * with the reference library still supplying the repair macros (the library's documented role —
 * `docs/event-renderer-system.md §7` — and a later Phase 3 packet).
 */
const proofMacros = (seed: number): Macros => ({
  hero: (s: number) => L.HEROES[L.heroKeys[(s + seed) % L.heroKeys.length]](),
  rsvpSection: (s: number) => ({
    kind: "rsvp",
    surface: "base",
    root: L.RSVPS[Object.keys(L.RSVPS)[(s + seed) % 5]](),
  }),
  registrySection: (s: number, caps: Capabilities) => DEFAULT_MACROS.registrySection(s, caps),
});

/* eslint-disable @typescript-eslint/no-explicit-any -- mirrors proof-b/compile.js, which is untyped. */
function compileWithPort({
  raw,
  caps,
  designIntent,
  pageSystem,
  seed = 1,
  id = "00",
  source = "model",
}: {
  raw: any;
  caps: Capabilities;
  designIntent: any;
  pageSystem: any;
  seed?: number;
  id?: string;
  source?: string;
}) {
  const schema = validateSchema(raw);
  if (!schema.ok) return { id, source, schemaValid: false, schemaErrors: schema.errors };
  const violationsBefore = validateStructure(raw, caps);
  const rep = repair(raw, caps, seed, proofMacros(seed));
  const fit = estimateFit(rep.tree, CONTENT, FIT_METRICS(designIntent));
  const canon = canonicalize(fit.tree);
  const layout = resolveLayout(canon.tree, designIntent.density);
  const repairs = [...rep.repairs, ...fit.repairs];
  return {
    id,
    source,
    schemaValid: true,
    repairValid: rep.remaining.length === 0,
    violationsBefore: violationsBefore.length,
    remaining: rep.remaining,
    spec: {
      version: "resolved_v2",
      designIntent,
      pageSystem,
      typography: designIntent.typographyObject,
      composition: canon.tree,
      compositionHash: canon.hash,
      layout,
      content: CONTENT,
      seed,
      capabilities: caps,
      compilerRepairs: repairs,
      repairSummary: repairs.reduce((o: Record<string, number>, r) => {
        o[r.kind] = (o[r.kind] || 0) + 1;
        return o;
      }, {}),
      verified: null,
      versions: {
        primitiveSet: "composition_v1",
        compiler: "proof-b-0.3",
        compositionPrompt: "composition_v1_p2",
        compositionSchema: "composition_v1",
      },
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("parity: the frozen confirmation set", () => {
  it("recompiles all 72 accepted trees, and only those, to the recorded specs", () => {
    const counts = { acceptedTrees: 0, rejectedAttempts: 0, modelCalls: 0 };
    const rejected: Record<string, unknown> = {};

    for (const [set, caps] of [
      ["final", FULL_CAPS],
      ["final-reduced", REDUCED_CAPS],
    ] as [string, Capabilities][]) {
      const dir = path.join(PROOF_DIR, "model", set, "raw");
      const results = JSON.parse(
        readFileSync(path.join(PROOF_DIR, "model", set, "results-verified.json"), "utf8"),
      );
      const byId = new Map(
        (results as { id: string | number }[]).map((r) => [String(r.id), r] as const),
      );
      const accepted: Record<string, unknown> = {};

      for (const file of readdirSync(dir).sort()) {
        const stem = file.replace(/\.txt$/, "");
        const id = stem.split("-")[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped recorded results
        const recorded: any = byId.get(id) ?? byId.get(stem);
        const source = readFileSync(path.join(dir, file), "utf8");
        const match = source.match(/\{[\s\S]*\}/);
        counts.modelCalls += 1;

        if (!match || !recorded?.spec?.designIntent) {
          rejected[`${set}:${stem}`] = {
            reason: match ? "no recorded designIntent" : "unparseable",
          };
          counts.rejectedAttempts += 1;
          continue;
        }

        const compiled = compileWithPort({
          raw: JSON.parse(match[0]),
          caps,
          designIntent: recorded.spec.designIntent,
          pageSystem: recorded.spec.pageSystem,
          seed: recorded.spec.seed ?? 1,
          id,
        });

        // The recorded hash is the arbiter of which attempt became the confirmation tree.
        if (
          "spec" in compiled &&
          compiled.spec?.compositionHash === recorded.spec.compositionHash
        ) {
          accepted[id] = compiled;
          counts.acceptedTrees += 1;
        } else {
          rejected[`${set}:${stem}`] = {
            reason: "superseded by a re-prompt after a selector collision",
            id,
            attemptHash: ("spec" in compiled && compiled.spec?.compositionHash) || null,
            acceptedHash: recorded.spec.compositionHash,
            schemaValid: compiled.schemaValid,
            repairValid: "repairValid" in compiled ? compiled.repairValid : undefined,
          };
          counts.rejectedAttempts += 1;
        }
      }

      expect(Object.keys(accepted)).toHaveLength(set === "final" ? 60 : 12);
      expect(normalize(accepted)).toEqual(golden(`frozen-${set}.json`));
    }

    // A silently shrinking replay set would otherwise pass; the gate is 72 of 72.
    expect(counts).toEqual({ acceptedTrees: 72, modelCalls: 74, rejectedAttempts: 2 });
    expect(counts).toEqual((golden("index.json") as { counts: unknown }).counts);
    // The two rejected first attempts are evidence that the collision path fired, not
    // confirmation trees; they never count toward a gate.
    expect(normalize(rejected)).toEqual(golden("frozen-rejected-attempts.json"));
  });
});

describe("parity: the generated prompt text", () => {
  it("emits byte-identical specText and rulesText for full capabilities", () => {
    expect(specText(FULL_CAPS)).toBe(REF.specText(FULL_CAPS));
    expect(rulesText(FULL_CAPS)).toBe(REF.rulesText(FULL_CAPS));
  });

  it("emits byte-identical specText and rulesText for reduced capabilities", () => {
    expect(specText(REDUCED_CAPS)).toBe(REF.specText(REDUCED_CAPS));
    expect(rulesText(REDUCED_CAPS)).toBe(REF.rulesText(REDUCED_CAPS));
  });

  it("drops exactly the primitives the event cannot use", () => {
    const reduced = specText(REDUCED_CAPS);
    expect(reduced).not.toMatch(/^Registry /m);
    expect(reduced).not.toMatch(/^RegistryItem /m);
    expect(reduced).not.toMatch(/^CashFund /m);
    expect(reduced).not.toMatch(/^Description /m);
    expect(specText(FULL_CAPS)).toMatch(/^Registry /m);
  });
});
