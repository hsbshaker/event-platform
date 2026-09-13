/**
 * The sibling planner and the selector.
 *
 * The frozen confirmation run recorded what the planner produced for all 72 concepts — batch
 * seed, per-sibling seed, directive, token allotment and the DesignIntent the harness stood in
 * for — so the two `results-verified.json` files under `proof-b/model/` is a planner oracle, replayed here from the
 * two master seeds `proof-b/FREEZE.md` records.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity` and `Renderer proof`;
 * `spec.md §7.7`; `docs/event-renderer-system.md §5`; `spec.md §32` #14.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ATTRACTIVE_TOKENS } from "../composition/attractive-tokens";
import { canonicalize } from "../composition/canonicalize";
import type { CompositionTree } from "../composition/nodes";
import { skeleton } from "../composition/signature";
import { FAMILIES, TYPOGRAPHY } from "../vocabulary";
import * as plannerModule from "./index";
import { CAPS_PER_BATCH, neutralize, planBatch, tokenViolations } from "./index";
import { COLLISION_THRESHOLD, checkBatch, checkCollision } from "./selector";

const PROOF_URL = new URL("../../../../proof-b/", import.meta.url);
const PROOF_DIR = PROOF_URL.pathname;
const requireProof = createRequire(PROOF_URL);
/* eslint-disable @typescript-eslint/no-explicit-any -- the reference side is untyped CommonJS. */
const PL: any = requireProof("./planner.js");
const L: any = requireProof("./library.js");
/* eslint-enable @typescript-eslint/no-explicit-any */

/** `proof-b/FREEZE.md`: the confirmation run's two master seeds. */
const FROZEN = [
  { set: "final", master: 20260921, batches: 20, concepts: 60 },
  { set: "final-reduced", master: 20260922, batches: 4, concepts: 12 },
] as const;

interface FrozenRecord {
  id: string;
  seed: number;
  batch: {
    index: number;
    sibling: number;
    batchSeed: string;
    allowedTokens: string[];
    forbiddenTokens: string[];
  };
  directive: Record<string, string>;
  designIntent: {
    family: string;
    tonalDirection: string;
    typography: string;
    composition: { hierarchy: string };
  };
  spec: {
    composition: CompositionTree;
    designIntent: { typographyCategory?: string; tonalDirection: string };
  };
}

function frozenRecords(set: string): FrozenRecord[] {
  return JSON.parse(
    readFileSync(path.join(PROOF_DIR, "model", set, "results-verified.json"), "utf8"),
  ) as FrozenRecord[];
}

describe("planner parity: the frozen confirmation run", () => {
  it("replays the batch seed, sibling seeds, directives and token allotments for all 72 concepts", () => {
    let compared = 0;
    for (const { set, master, concepts } of FROZEN) {
      const records = frozenRecords(set);
      expect(records).toHaveLength(concepts);
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const plan = planBatch(master, Math.floor(i / 3));
        const sib = plan.siblings[i % 3];

        expect(plan.batchSeed, `${set}:${r.id} batchSeed`).toBe(r.batch.batchSeed);
        expect(sib.seed, `${set}:${r.id} seed`).toBe(r.seed);
        expect(sib.directive, `${set}:${r.id} directive`).toEqual(r.directive);
        expect(sib.allowedTokens, `${set}:${r.id} allowed`).toEqual(r.batch.allowedTokens);
        expect(sib.forbiddenTokens, `${set}:${r.id} forbidden`).toEqual(r.batch.forbiddenTokens);
        compared++;
      }
    }
    expect(compared).toBe(72);
  });

  it("replays every assignment field the planner owns, for all 72 concepts", () => {
    // family, tonal direction, typography category and hierarchy — `spec.md §7.7`. The pairing,
    // density and the rest of the composition object are the model's; the frozen run's values for
    // those came from the harness standing in for `generateDesignIntent`.
    let compared = 0;
    for (const { set, master } of FROZEN) {
      const records = frozenRecords(set);
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const sib = planBatch(master, Math.floor(i / 3)).siblings[i % 3];
        const where = `${set}:${r.id}`;

        expect(sib.assignment.family, `${where} family`).toBe(r.designIntent.family);
        expect(sib.assignment.tonalDirection, `${where} tone`).toBe(r.designIntent.tonalDirection);
        expect(sib.assignment.hierarchy, `${where} hierarchy`).toBe(
          r.designIntent.composition.hierarchy,
        );
        // The recorded pairing resolves to the category the planner assigned.
        expect(sib.assignment.typographyCategory, `${where} category`).toBe(
          TYPOGRAPHY[r.designIntent.typography as keyof typeof TYPOGRAPHY].category,
        );
        compared++;
      }
    }
    expect(compared).toBe(72);
  });

  it("narrows the pairings to exactly the ones the model may choose from", () => {
    for (const { set, master } of FROZEN) {
      const records = frozenRecords(set);
      for (let i = 0; i < records.length; i++) {
        const sib = planBatch(master, Math.floor(i / 3)).siblings[i % 3];
        const { typographyPairings, hierarchy } = sib.assignment;
        expect(typographyPairings.length).toBeGreaterThan(0);
        // The pairing the frozen run used is one the assignment admits.
        expect(typographyPairings).toContain(records[i].designIntent.typography);
        if (hierarchy === "monumental")
          for (const p of typographyPairings) expect(TYPOGRAPHY[p].holdsAtMonumental).toBe(true);
      }
    }
  });

  it("matches the reference planner's own output on the fields the contract keeps, over many seeds", () => {
    for (const master of [20260921, 20260922, 1, 7, 999, 123456]) {
      for (let b = 0; b < 12; b++) {
        const mine = planBatch(master, b);
        const theirs = PL.planBatch(master, b);
        expect(mine.batchSeed).toBe(theirs.batchSeed);
        for (let k = 0; k < 3; k++) {
          const a = mine.siblings[k];
          const t = theirs.siblings[k];
          expect(a.seed).toBe(t.seed);
          expect(a.directive).toEqual(t.directive);
          expect(a.allowedTokens).toEqual(t.allowedTokens);
          expect(a.forbiddenTokens).toEqual(t.forbiddenTokens);
          expect(a.assignment.family).toBe(t.designIntent.family);
          expect(a.assignment.tonalDirection).toBe(t.designIntent.tonalDirection);
          expect(a.assignment.typographyCategory).toBe(t.designIntent.typographyCategory);
          expect(a.assignment.hierarchy).toBe(t.designIntent.composition.hierarchy);
        }
      }
    }
  });
});

describe("planner determinism and diversity", () => {
  const MASTERS = [20260921, 20260922, 0, 1, 42, 7777, 20270101];

  it("is deterministic: the same master seed and batch index give the same plan", () => {
    for (const master of MASTERS)
      for (let b = 0; b < 8; b++) expect(planBatch(master, b)).toEqual(planBatch(master, b));
  });

  it("gives different batches different plans", () => {
    const seen = new Set(
      MASTERS.flatMap((m) => [0, 1, 2, 3].map((b) => JSON.stringify(planBatch(m, b)))),
    );
    expect(seen.size).toBe(MASTERS.length * 4);
  });

  it("always gives three siblings distinct family, tone, directive structure and opening", () => {
    // These four have room for three distinct values under every brief, so the guarantee is hard.
    let batches = 0;
    for (const master of MASTERS) {
      for (let b = 0; b < 20; b++) {
        const { siblings } = planBatch(master, b);
        const distinct = (f: (s: (typeof siblings)[number]) => string) =>
          new Set(siblings.map(f)).size;
        const where = `master ${master} batch ${b}`;
        expect(
          distinct((s) => s.assignment.family),
          `${where} families`,
        ).toBe(3);
        expect(
          distinct((s) => s.assignment.tonalDirection),
          `${where} tones`,
        ).toBe(3);
        expect(
          distinct((s) => s.directive.structure),
          `${where} structures`,
        ).toBe(3);
        expect(
          distinct((s) => s.directive.opening),
          `${where} openings`,
        ).toBe(3);
        batches++;
      }
    }
    expect(batches).toBe(MASTERS.length * 20);
  });

  it("gives distinct typography category and hierarchy whenever the families allow it", () => {
    // `spec.md §7.7` qualifies these two: "whenever possible", "where the brief allows". A family
    // constrains its own hierarchies — `statement` offers only dramatic and monumental — so three
    // distinct values are not always reachable. Measured over 140 batches: 139 have three distinct
    // categories, 129 have three distinct hierarchies, and the reference planner produces exactly
    // the same numbers.
    const three = { categories: 0, hierarchies: 0 };
    let batches = 0;
    for (const master of MASTERS) {
      for (let b = 0; b < 20; b++) {
        const { siblings } = planBatch(master, b);
        const cats = new Set(siblings.map((s) => s.assignment.typographyCategory));
        const hiers = new Set(siblings.map((s) => s.assignment.hierarchy));
        const where = `master ${master} batch ${b}`;
        // Never all three the same: "never the same intent with different seeds".
        expect(cats.size, `${where} categories`).toBeGreaterThanOrEqual(2);
        expect(hiers.size, `${where} hierarchies`).toBeGreaterThanOrEqual(2);
        if (cats.size === 3) three.categories++;
        if (hiers.size === 3) three.hierarchies++;
        batches++;
      }
    }
    expect(batches).toBe(140);
    expect(three.categories).toBe(139);
    expect(three.hierarchies).toBe(129);
  });

  it("repeats a hierarchy only when the sibling's family had none left to take", () => {
    // The fallback in `not()` must fire on exhaustion, never as a shortcut. When a sibling repeats
    // a hierarchy, every hierarchy its family offers must already be taken.
    let forcedRepeats = 0;
    for (const master of MASTERS) {
      for (let b = 0; b < 20; b++) {
        const { siblings } = planBatch(master, b);
        const taken: string[] = [];
        for (const s of siblings) {
          if (taken.includes(s.assignment.hierarchy)) {
            const offered = FAMILIES[s.assignment.family].hierarchies;
            expect(
              offered.every((h) => taken.includes(h)),
              `master ${master} batch ${b}: ${s.assignment.family} repeated ${s.assignment.hierarchy} ` +
                `while ${offered.filter((h) => !taken.includes(h)).join(", ")} was still free`,
            ).toBe(true);
            forcedRepeats++;
          }
          taken.push(s.assignment.hierarchy);
        }
      }
    }
    expect(forcedRepeats).toBeGreaterThan(0);
  });

  it("never allots an attractive token to more than one sibling in three", () => {
    for (const master of MASTERS) {
      for (let b = 0; b < 20; b++) {
        const { siblings } = planBatch(master, b);
        for (const id of Object.keys(CAPS_PER_BATCH)) {
          const holders = siblings.filter((s) => s.allowedTokens.includes(id as never)).length;
          expect(holders, `${id} in master ${master} batch ${b}`).toBeLessThanOrEqual(
            CAPS_PER_BATCH[id as keyof typeof CAPS_PER_BATCH],
          );
          expect(holders).toBe(1);
        }
        // Allowed and forbidden partition the token set for every sibling.
        for (const s of siblings)
          expect([...s.allowedTokens, ...s.forbiddenTokens].sort()).toEqual(
            Object.keys(CAPS_PER_BATCH).sort(),
          );
      }
    }
  });

  it("never gives a sibling a directive asking for a device it was not allotted", () => {
    for (const master of MASTERS) {
      for (let b = 0; b < 20; b++) {
        for (const s of planBatch(master, b).siblings) {
          if (s.forbiddenTokens.includes("heroNumeral")) {
            expect(s.directive.opening).not.toBe("numeral");
            expect(s.directive.date).not.toBe("numeral");
          }
        }
      }
    }
  });
});

describe("planner: no legacy-library dependency", () => {
  const FIXTURE_IDS: string[] = [
    ...L.heroKeys,
    ...Object.keys(L.DETAILS),
    ...Object.keys(L.RSVPS),
    ...Object.keys(L.REGISTRIES),
    ...Object.keys(L.PLANS),
  ];

  it("emits no recipe, silhouette or template identifier in any plan", () => {
    for (const master of [20260921, 3, 500]) {
      for (let b = 0; b < 20; b++) {
        const serialized = JSON.stringify(planBatch(master, b));
        for (const id of FIXTURE_IDS)
          expect(serialized.includes(id), `plan leaked "${id}"`).toBe(false);
      }
    }
  });

  it("emits an assignment, never a DesignIntent", () => {
    // `spec.md §7.7` and `docs/model-contracts.md §1`: the planner assigns; `generateDesignIntent`
    // returns the palette, the pairing, density, the composition object and the motifs. If any of
    // those ever appears on a plan, production has started generating design without a model call.
    const MODEL_OWNED = [
      "palette",
      "colors",
      "dominant",
      "typographyPairing",
      "typography",
      "density",
      "composition",
      "motifs",
      "pageSystem",
      "designIntent",
      "typographyObject",
    ];
    for (const master of [20260921, 20260922, 11]) {
      for (let b = 0; b < 10; b++) {
        for (const sib of planBatch(master, b).siblings) {
          expect(Object.keys(sib).sort()).toEqual([
            "allowedTokens",
            "assignment",
            "directive",
            "forbiddenTokens",
            "seed",
          ]);
          expect(Object.keys(sib.assignment).sort()).toEqual([
            "family",
            "hierarchy",
            "tonalDirection",
            "typographyCategory",
            "typographyPairings",
          ]);
          for (const field of MODEL_OWNED)
            expect(
              (sib.assignment as unknown as Record<string, unknown>)[field],
              `the assignment carries "${field}", which is the model's to choose`,
            ).toBeUndefined();
        }
      }
    }
  });

  it("never grows a pageSystem field, at any level of the plan", () => {
    // `docs/design-system.md §15.2`: the page system — borders, cards, buttons, type scale,
    // spacing — is compiler-owned. `proof-b`'s fake DesignIntent carried one because the harness
    // had no `generateDesignIntent()` call and bundled model simulation with compiler work. If
    // this ever fails, resolved design has leaked back into the planner layer.
    const hasPageSystemKey = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some(hasPageSystemKey);
      if (value && typeof value === "object")
        return Object.entries(value as Record<string, unknown>).some(
          ([k, v]) =>
            /^(pageSystem|border|borderWeight|card|button|typeScale|spacing|defaultAlign|displayTracking)$/.test(
              k,
            ) || hasPageSystemKey(v),
        );
      return false;
    };
    for (const master of [20260921, 20260922, 5, 77]) {
      for (let b = 0; b < 15; b++) {
        const plan = planBatch(master, b);
        expect(
          hasPageSystemKey(plan),
          `master ${master} batch ${b} carries a page-system field`,
        ).toBe(false);
      }
    }
  });

  it("exports the planner surface and nothing library-shaped", () => {
    expect(Object.keys(plannerModule).sort()).toEqual([
      "CAPS_PER_BATCH",
      "assignmentFor",
      "directiveFor",
      "emptyAvoidList",
      "neutralize",
      "planBatch",
      "tokenViolations",
    ]);
  });
});

describe("attractive-token allotment enforcement", () => {
  const token = (id: string) => ATTRACTIVE_TOKENS.find((t) => t.id === id)!;

  const withStagger = (): CompositionTree =>
    ({
      version: "composition_v1",
      sections: [
        {
          kind: "hero",
          surface: "base",
          root: {
            t: "Stack",
            children: [
              { t: "EventTitle", emphasis: "display", layout: "stagger" },
              { t: "Date", form: "numeral", emphasis: "display" },
            ],
          },
        },
        { kind: "rsvp", surface: "base", root: { t: "Stack", children: [{ t: "RSVP" }] } },
        { kind: "registry", surface: "alt", root: { t: "Stack", children: [{ t: "Registry" }] } },
      ],
    }) as unknown as CompositionTree;

  it("detects exactly the forbidden tokens a tree uses", () => {
    const tree = withStagger();
    expect(tokenViolations(tree, ["staggerTitle", "heroNumeral", "watermark"]).sort()).toEqual([
      "heroNumeral",
      "staggerTitle",
    ]);
    expect(tokenViolations(tree, ["watermark"])).toEqual([]);
    expect(tokenViolations(tree, [])).toEqual([]);
  });

  it("neutralizes deterministically and logs planner repairs", () => {
    const a = withStagger();
    const b = withStagger();
    const ra = neutralize(a, ["staggerTitle", "heroNumeral"]);
    const rb = neutralize(b, ["staggerTitle", "heroNumeral"]);

    expect(ra.length).toBeGreaterThan(0);
    expect(ra).toEqual(rb);
    expect(new Set(ra.map((r) => r.kind))).toEqual(new Set(["planner"]));
    expect(canonicalize(a).hash).toBe(canonicalize(b).hash);
    expect(tokenViolations(a, ["staggerTitle", "heroNumeral"])).toEqual([]);
  });

  it("leaves an allotted token alone", () => {
    const tree = withStagger();
    expect(neutralize(tree, ["watermark"])).toEqual([]);
    expect(token("staggerTitle").detect(tree)).toBe(true);
  });

  it("matches the reference's violation and neutralization results", () => {
    const mine = withStagger();
    const theirs = withStagger();
    const forbidden = ["staggerTitle", "heroNumeral", "watermark"];
    expect(tokenViolations(mine, forbidden)).toEqual(PL.tokenViolations(theirs, forbidden));
    expect(neutralize(mine, forbidden)).toEqual(PL.neutralize(theirs, forbidden));
    expect(mine).toEqual(theirs);
  });
});

describe("selector: collision over the frozen confirmation set", () => {
  const sig = (r: FrozenRecord) => ({
    tree: r.spec.composition,
    category: r.spec.designIntent.typographyCategory,
    tone: r.spec.designIntent.tonalDirection,
  });

  it("uses the .70 threshold the canonical document specifies", () => {
    expect(COLLISION_THRESHOLD).toBe(0.7);
  });

  it("reproduces each frozen concept's nearest-at-accept score, for all 72", () => {
    let compared = 0;
    for (const { set } of FROZEN) {
      const records = frozenRecords(set) as (FrozenRecord & { nearestAtAccept: number })[];
      const accepted: ReturnType<typeof sig>[] = [];
      for (const r of records) {
        const check = checkCollision(sig(r), accepted);
        expect(check.nearest, `${set}:${r.id}`).toBeCloseTo(r.nearestAtAccept, 10);
        accepted.push(sig(r));
        compared++;
      }
    }
    expect(compared).toBe(72);
  });

  it("reports no sibling collision across the frozen set, as the confirmation run did", () => {
    for (const { set } of FROZEN) {
      const records = frozenRecords(set);
      const checks = checkBatch(records.map(sig));
      const collided = records.filter((_, i) => checks[i].collides).map((r) => r.id);
      expect(collided).toEqual([]);
    }
  });

  it("names the colliding skeleton, and nothing else, when it does collide", () => {
    const records = frozenRecords("final");
    const one = sig(records[0]);
    const check = checkCollision(one, [one]);
    expect(check.collides).toBe(true);
    expect(check.nearest).toBe(1);
    expect(check.collidingSkeletons).toEqual([skeleton(one.tree, "desktop").heroString]);
    // The re-prompt carries a shape, never a fixture identity.
    for (const id of L.heroKeys as string[])
      expect(check.collidingSkeletons.join(" ").includes(id)).toBe(false);
  });

  it("does not collide a candidate against an empty accepted set", () => {
    const r = frozenRecords("final")[0];
    expect(checkCollision(sig(r), [])).toEqual({
      nearest: 0,
      collides: false,
      collidingSkeletons: [],
    });
  });
});
