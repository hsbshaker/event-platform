/**
 * Pre-verification spec assembly, end to end over real trees.
 *
 * Intrinsic: nothing here imports `proof-b`. The trees come from the committed golden oracle, so
 * the regression outlives the reference.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` and
 * `Renderer proof`; `spec.md §32` #19, #20, #26.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { canonicalize } from "../composition/canonicalize";
import type { Capabilities, CompositionTree } from "../composition/nodes";
import { validateSchema } from "../composition/validate-schema";
import { validateStructure } from "../composition/validate-structure";
import { walk } from "../composition/walk";
import type { DesignIntent, MotifId } from "../design-intent";
import { planBatch } from "../planner";
import { TYPOGRAPHY, TYPOGRAPHY_KEYS } from "../vocabulary";
import { novelTree } from "../../../../tests/fixtures/novel-composition";
import { assemblePreVerificationSpec, VERSIONS } from "./spec";

const GOLDEN = new URL("../../../../tests/fixtures/renderer-golden/", import.meta.url).pathname;

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

/** A DesignIntent the model could plausibly have returned for a given planner assignment. */
function intentFor(
  overrides: Partial<DesignIntent> = {},
  motifs: MotifId[] = ["plaid", "equestrian"],
): DesignIntent {
  return {
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
    motifs,
    ...overrides,
  };
}

/** The reduced-capability batch was generated without registry, gifts, cash fund or description. */
const REDUCED_CAPS: Capabilities = {
  ...FULL_CAPS,
  registry: false,
  gifts: false,
  externalRegistry: false,
  cashFund: false,
  description: false,
};

function frozenTrees(): { id: string; tree: CompositionTree; caps: Capabilities }[] {
  const out: { id: string; tree: CompositionTree; caps: Capabilities }[] = [];
  for (const set of ["frozen-final", "frozen-final-reduced"]) {
    const recs = JSON.parse(readFileSync(`${GOLDEN}${set}.json`, "utf8")) as Record<
      string,
      { spec: { composition: CompositionTree } }
    >;
    const caps = set === "frozen-final" ? FULL_CAPS : REDUCED_CAPS;
    for (const [id, r] of Object.entries(recs))
      out.push({ id: `${set}:${id}`, tree: r.spec.composition, caps });
  }
  return out;
}

/** Every intent the planner's four assignment dimensions can produce, paired with a pairing. */
function intentMatrix(): DesignIntent[] {
  const out: DesignIntent[] = [];
  for (const pairing of TYPOGRAPHY_KEYS) {
    for (const tone of ["light", "mid", "dark"] as const) {
      for (const density of ["compact", "balanced", "spacious"] as const) {
        out.push(
          intentFor({
            family: TYPOGRAPHY[pairing].category === "grotesk_led" ? "statement" : "editorial",
            tonalDirection: tone,
            typographyPairing: pairing,
            density,
            composition: {
              asymmetry: "gentle",
              hierarchy: TYPOGRAPHY[pairing].holdsAtMonumental ? "monumental" : "editorial",
              rhythm: "alternating",
              sectionContrast: "moderate",
              ornament: "decorative",
            },
          }),
        );
      }
    }
  }
  return out;
}

describe("pre-verification spec: shape and honesty", () => {
  const spec = assemblePreVerificationSpec({
    composition: novelTree(),
    designIntent: intentFor(),
    capabilities: FULL_CAPS,
    seed: 7,
  });

  it("carries every §6 field the deterministic engine can fill", () => {
    expect(Object.keys(spec).sort()).toEqual(
      [
        "artwork",
        "capabilities",
        "composition",
        "compositionHash",
        "compilerRepairs",
        "designIntent",
        "intentDeviations",
        "layout",
        "motifs",
        "pageSystem",
        "seed",
        "signature",
        "state",
        "tokens",
        "verified",
        "version",
        "versions",
      ].sort(),
    );
    expect(spec.version).toBe("resolved_v2");
    expect(spec.versions).toEqual(VERSIONS);
  });

  it("never claims to be verified — geometry has not run", () => {
    expect(spec.state).toBe("pre-verification");
    expect(spec.verified).toBeNull();
    // The type forbids `clean: true` here; this asserts the runtime value too.
    expect(JSON.stringify(spec)).not.toContain('"clean"');
  });

  it("is deterministic for the same composition, intent, capabilities and seed", () => {
    for (const seed of [0, 1, 7, 99]) {
      const a = assemblePreVerificationSpec({
        composition: novelTree(),
        designIntent: intentFor(),
        capabilities: FULL_CAPS,
        seed,
      });
      const b = assemblePreVerificationSpec({
        composition: novelTree(),
        designIntent: intentFor(),
        capabilities: FULL_CAPS,
        seed,
      });
      expect(a).toEqual(b);
    }
  });

  it("keys layout and motifs by canonical node id", () => {
    const ids = new Set<string>();
    walk(spec.composition, ({ node }) => ids.add(node.id!));
    for (const id of Object.keys(spec.layout)) expect(ids.has(id)).toBe(true);
    for (const id of Object.keys(spec.motifs)) expect(ids.has(id)).toBe(true);
    expect(Object.keys(spec.layout).length).toBe(ids.size);
  });
});

describe("pre-verification spec: raw palette cannot reach the renderer", () => {
  it("emits no raw DesignIntent color anywhere in the spec's resolved data", () => {
    // `spec.md §32` #26 and `docs/design-system.md §15.6`: raw creative colors never become
    // rendering roles. The intent itself is persisted verbatim (it must be), so the check is on
    // everything the renderer actually reads.
    for (const intent of intentMatrix().slice(0, 18)) {
      const s = assemblePreVerificationSpec({
        composition: novelTree(),
        designIntent: intent,
        capabilities: FULL_CAPS,
        seed: 3,
      });
      const rendererFacing = JSON.stringify({
        pageSystem: s.pageSystem,
        tokens: s.tokens,
        layout: s.layout,
        motifs: s.motifs,
      });
      for (const raw of intent.palette.colors) {
        expect(
          rendererFacing.toUpperCase().includes(raw.toUpperCase()),
          `raw palette color ${raw} reached the renderer-facing spec unchanged`,
        ).toBe(false);
      }
    }
  });

  it("gives every tonal direction a materially different ground", () => {
    const grounds = (["light", "mid", "dark"] as const).map(
      (tonalDirection) =>
        assemblePreVerificationSpec({
          composition: novelTree(),
          designIntent: intentFor({ tonalDirection }),
          capabilities: FULL_CAPS,
          seed: 1,
        }).tokens.palette.surfaceBase,
    );
    expect(new Set(grounds).size).toBe(3);
  });
});

describe("pre-verification spec: typography and page system", () => {
  it("never gives monumental hierarchy a pairing that cannot hold it", () => {
    let substitutions = 0;
    for (const pairing of TYPOGRAPHY_KEYS) {
      const s = assemblePreVerificationSpec({
        composition: novelTree(),
        designIntent: intentFor({
          typographyPairing: pairing,
          composition: {
            asymmetry: "gentle",
            hierarchy: "monumental",
            rhythm: "alternating",
            sectionContrast: "moderate",
            ornament: "restrained",
          },
        }),
        capabilities: FULL_CAPS,
        seed: 2,
      });
      expect(TYPOGRAPHY[s.tokens.typography.pairing].holdsAtMonumental, pairing).toBe(true);
      if (s.tokens.typography.pairing !== pairing) {
        substitutions++;
        expect(s.intentDeviations.some((d) => d.rule.startsWith("typography"))).toBe(true);
      }
    }
    // Two of the twelve pairings do not hold at monumental.
    expect(substitutions).toBe(2);
  });

  it("resolves a page system for every intent in the matrix, from approved values only", () => {
    const matrix = intentMatrix();
    expect(matrix.length).toBe(TYPOGRAPHY_KEYS.length * 3 * 3);
    for (const intent of matrix) {
      const ps = assemblePreVerificationSpec({
        composition: novelTree(),
        designIntent: intent,
        capabilities: FULL_CAPS,
        seed: 5,
      }).pageSystem;
      expect(["none", "hairline", "double", "accented"]).toContain(ps.border);
      expect(["flat", "outlined", "tinted", "plate"]).toContain(ps.card);
      expect(["solid_square", "solid_rounded", "outline_square", "underline"]).toContain(ps.button);
      expect([1, 2, 3]).toContain(ps.borderWeight);
      expect(["start", "center"]).toContain(ps.defaultAlign);
      expect(Number.isFinite(ps.displayTracking)).toBe(true);
    }
  });
});

describe("pre-verification spec: the frozen confirmation trees", () => {
  const trees = frozenTrees();

  it("assembles a spec for all 72, each still structurally valid", () => {
    expect(trees).toHaveLength(72);
    for (const { id, tree, caps } of trees) {
      const s = assemblePreVerificationSpec({
        composition: tree,
        designIntent: intentFor(),
        capabilities: caps,
        seed: 1,
      });
      expect(validateStructure(s.composition, caps), id).toEqual([]);
      expect(s.compositionHash, id).toBe(canonicalize(tree).hash);
      expect(Object.keys(s.layout).length, id).toBeGreaterThan(0);
      expect(s.signature.desktop.hero.length, id).toBeGreaterThan(0);
      expect(s.signature.mobile.hero.length, id).toBeGreaterThan(0);
    }
  });

  it("the strict schema is for model output, not compiler output", () => {
    // A canonical tree carries node ids, which the strict schema rejects as unknown keys — it
    // validates what the model returned, before canonicalization. Asserting the rejection keeps
    // a later change from quietly relaxing the schema to accept compiler-stamped fields.
    for (const { id, tree } of trees.slice(0, 12)) {
      const result = validateSchema(tree);
      expect(result.ok, id).toBe(false);
      expect(
        result.errors!.every((e) => e.rule === "schema.key" && e.path.endsWith("id")),
        id,
      ).toBe(true);
    }
  });

  it("leaves every composition hash unchanged — assembly never mutates the tree", () => {
    for (const { id, tree } of trees) {
      const before = JSON.stringify(tree);
      assemblePreVerificationSpec({
        composition: tree,
        designIntent: intentFor(),
        capabilities: FULL_CAPS,
        seed: 1,
      });
      expect(JSON.stringify(tree), `${id} was mutated in place`).toBe(before);
    }
  });
});

describe("pre-verification spec: a novel tree needs no library match", () => {
  it("resolves page system, palette, typography, motifs and layout for a tree with no fixture counterpart", () => {
    const s = assemblePreVerificationSpec({
      composition: novelTree(),
      designIntent: intentFor(),
      capabilities: FULL_CAPS,
      seed: 11,
    });
    expect(s.pageSystem.border).toBeDefined();
    expect(Object.keys(s.tokens.palette).length).toBeGreaterThan(0);
    expect(s.tokens.typography.display).toBeTruthy();
    expect(Object.keys(s.layout).length).toBeGreaterThan(0);
    expect(s.state).toBe("pre-verification");
  });

  it("carries no recipe, silhouette or template identifier", () => {
    const s = assemblePreVerificationSpec({
      composition: novelTree(),
      designIntent: intentFor(),
      capabilities: FULL_CAPS,
      seed: 11,
    });
    const serialized = JSON.stringify(s);
    for (const id of [
      "editorial_split",
      "framed_invitation",
      "invitation_monogram",
      "statement_numeral",
      "details_split_panel",
      "rsvp_contrast_split",
      "registry_featured",
      "SP1_dark_opening",
    ]) {
      expect(serialized.includes(id), `spec leaked "${id}"`).toBe(false);
    }
  });
});

describe("the planner hands the compiler an assignment, and the compiler owns the rest", () => {
  it("a plan carries no page system, palette, typography or layout", () => {
    for (const master of [20260921, 4]) {
      for (let b = 0; b < 6; b++) {
        const serialized = JSON.stringify(planBatch(master, b));
        for (const field of ["pageSystem", "palette", "typeScale", "spacing", "layout", "motifs"])
          expect(serialized.includes(`"${field}"`), `plan carries ${field}`).toBe(false);
      }
    }
  });
});
