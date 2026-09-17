/**
 * The production deterministic sibling planner — `spec.md §7.7`.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity`:
 *   - "The sibling planner assigns three distinct compatible families whenever possible, then
 *     distinct tones, typography categories and hierarchies when the brief allows."
 *   - "Siblings receive distinct structural directives (at least structure and opening differ)
 *     and attractive-token allotments (each token to at most one sibling in three)."
 *   - "Tone diversity is used only when compatible with the brief."
 *   - "Event Identity is the only stage that receives the raw host prompt; the planner,
 *     DesignIntent and composition calls read the persisted identity (§7.5)."
 *
 * Plan: `docs/phase-4b-plan.md §D`, T15. Guardrails: `spec.md §32` #12, #14;
 * `docs/event-renderer-system.md §7.1`.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  eventIdentityResultSchema,
  type EventIdentity,
  type EventIdentityResult,
} from "@/lib/ai/event-identity/contract";
import {
  assertAuthoritative,
  ProvisionalIdentityError,
  type AuthoritativeIdentity,
} from "@/lib/ai/event-identity/lifecycle";
import { EVENT_IDENTITY_SCHEMA_VERSION, PLANNER_VERSION } from "@/lib/ai/versions";
import { CAPS_PER_BATCH, planBatch } from "@/lib/renderer/planner";
import {
  DIMENSIONS,
  PHRASE,
  describe as describeDirective,
} from "@/lib/renderer/planner/directives";
import { FAMILIES, FAMILY_KEYS, TONES, TYPOGRAPHY } from "@/lib/renderer/vocabulary";
import * as plannerModule from "./planner";
import {
  planConceptBatch,
  SEPARATION_DIMENSIONS,
  SIBLING_COUNT,
  UnplannableIdentityError,
  type ConceptBatchPlan,
  type PlanBatchInput,
  type SeparationDimension,
} from "./planner";

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

type IdentityOverrides = Partial<EventIdentity>;

/**
 * A real, schema-valid identity result. Built through `eventIdentityResultSchema.parse` on
 * purpose: a fixture that the contract would reject proves nothing about the production path,
 * and "minimal but valid" has to mean valid.
 */
function identityResult(overrides: IdentityOverrides = {}): EventIdentityResult {
  return eventIdentityResultSchema.parse({
    identity: {
      creativeDirection:
        "A quiet late-summer supper in a walled garden, read as warm stone and long light.",
      toneKeywords: ["warm", "unhurried", "generous"],
      colorsExplicitlyConstrained: false,
      paletteIntent: {
        requiredColors: [],
        preferredColors: [],
        avoidColors: [],
        dominanceNotes: "",
      },
      tonalIntent: "Mid-bright, with depth held in the shadows rather than the ground.",
      toneExplicitlyConstrained: false,
      compatibleTonalDirections: ["light", "mid", "dark"],
      compatibleFamilies: ["editorial", "invitation", "statement"],
      compatibleTypographyCategories: [
        "heritage",
        "high_contrast_editorial",
        "oldstyle",
        "grotesk_led",
        "soft_serif",
        "transitional",
      ],
      visualMotifs: [],
      textureDirection: "Soft paper grain, nothing glossy.",
      typographyDirection: "Confident display with a quiet text face beneath it.",
      copyTone: "Warm and plain.",
      hostConstraints: [],
      creativeGuidance: [],
      inspirationSummary: "No visual inspiration supplied.",
      ...overrides,
    },
    suppliedFacts: {
      hostNames: null,
      honoreeName: null,
      honoreeDescriptionText: null,
      eventType: null,
      dateText: null,
      timeText: null,
      venueText: null,
      addressText: null,
      localityText: null,
      rsvpDeadlineText: null,
    },
    clarification: { needed: false, questions: [] },
  });
}

/** The only way to get a plannable identity: through the branded lifecycle boundary. */
function authoritative(overrides: IdentityOverrides = {}): AuthoritativeIdentity {
  return assertAuthoritative(identityResult(overrides), EVENT_IDENTITY_SCHEMA_VERSION);
}

function input(revisionId: string, overrides: IdentityOverrides = {}): PlanBatchInput {
  return { identity: authoritative(overrides), identityRevisionId: revisionId };
}

const plan = (revisionId: string, overrides: IdentityOverrides = {}): ConceptBatchPlan =>
  planConceptBatch(input(revisionId, overrides));

const REVISIONS = [
  "rev_00000000-0000-4000-8000-000000000001",
  "rev_00000000-0000-4000-8000-000000000002",
  "rev_5f2a",
  "rev_c0ffee",
  "rev_zzz",
  "rev_1",
];

/** Many distinct revision ids, for distribution claims. */
const manyRevisions = (n: number) =>
  Array.from({ length: n }, (_, i) => `rev_${i.toString(16).padStart(6, "0")}`);

const dimension = (p: ConceptBatchPlan, name: SeparationDimension) => {
  const found = p.telemetry.dimensions.find((d) => d.dimension === name);
  if (!found) throw new Error(`telemetry has no ${name} dimension`);
  return found;
};

const distinct = (values: readonly string[]) => new Set(values).size;

const MODULE_SOURCE = readFileSync(new URL("./planner.ts", import.meta.url).pathname, "utf8");
/** The module with comments stripped, so prose about a rule is not mistaken for the rule. */
const MODULE_CODE = MODULE_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(
  /(^|[^:])\/\/.*$/gm,
  "$1",
);

// ---------------------------------------------------------------------------

describe("purity and determinism", () => {
  it("reaches no clock, no RNG, no environment and no I/O", () => {
    // A source scan rather than a mock, because the claim is about what the module *can* do.
    for (const forbidden of [
      /\bMath\s*\.\s*random\b/,
      /\bDate\b/,
      /\bprocess\s*\.\s*env\b/,
      /\bperformance\s*\.\s*now\b/,
      /\bfetch\s*\(/,
      /\brequire\s*\(/,
      /\bnode:/,
      /\bcrypto\b/,
    ]) {
      expect(forbidden.test(MODULE_CODE), `planner.ts reaches ${forbidden}`).toBe(false);
    }
  });

  it("imports nothing that could vary a plan per process", () => {
    const imports = [...MODULE_CODE.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual([
      "@/lib/ai/event-identity/lifecycle",
      "@/lib/ai/versions",
      "@/lib/renderer/composition/walk",
      "@/lib/renderer/planner",
      "@/lib/renderer/planner/directives",
      "@/lib/renderer/seeded-random",
      "@/lib/renderer/vocabulary",
    ]);
  });

  it("gives deep-equal output for the same input, twice", () => {
    for (const revision of REVISIONS) {
      expect(plan(revision)).toEqual(plan(revision));
      // And across two separately constructed identities with the same content.
      expect(JSON.stringify(plan(revision))).toBe(JSON.stringify(plan(revision)));
    }
  });

  it("gives different revisions different plans", () => {
    const seen = new Set(manyRevisions(200).map((r) => JSON.stringify(plan(r))));
    expect(seen.size).toBeGreaterThan(150);
  });

  it("stamps the planner version on every plan", () => {
    expect(plan(REVISIONS[0]).plannerVersion).toBe(PLANNER_VERSION);
    expect(PLANNER_VERSION).toBe("planner_v1");
  });

  it("refuses an empty revision id rather than planning from a constant seed", () => {
    expect(() => planConceptBatch({ identity: authoritative(), identityRevisionId: "" })).toThrow(
      UnplannableIdentityError,
    );
  });
});

describe("shape and ordering", () => {
  it("returns exactly three siblings at stable indexes 0, 1, 2", () => {
    for (const revision of REVISIONS) {
      const p = plan(revision);
      expect(p.siblings).toHaveLength(SIBLING_COUNT);
      expect(p.siblings.map((s) => s.index)).toEqual([0, 1, 2]);
    }
  });

  it("emits an assignment and a directive, never a DesignIntent", () => {
    // `spec.md §7.7`: the strong model returns palette, pairing, density, composition and motifs.
    // If any of those appears here, production has started generating design without a model call.
    const p = plan(REVISIONS[0]);
    for (const sibling of p.siblings) {
      expect(Object.keys(sibling).sort()).toEqual([
        "allowedTokens",
        "assignment",
        "directive",
        "directiveSentence",
        "forbiddenTokens",
        "index",
        "seed",
      ]);
      expect(Object.keys(sibling.assignment).sort()).toEqual([
        "family",
        "hierarchy",
        "tonalDirection",
        "typographyCategory",
        "typographyPairings",
      ]);
      for (const modelOwned of [
        "palette",
        "colors",
        "dominant",
        "typographyPairing",
        "density",
        "composition",
        "motifs",
        "pageSystem",
        "presentation",
      ]) {
        expect(
          (sibling.assignment as unknown as Record<string, unknown>)[modelOwned],
          `the assignment carries "${modelOwned}", which is the model's to choose`,
        ).toBeUndefined();
      }
    }
  });

  it("assembles the directive into one sentence, as §7.7 requires", () => {
    for (const sibling of plan(REVISIONS[1]).siblings) {
      expect(sibling.directiveSentence).toBe(describeDirective(sibling.directive));
      expect(sibling.directiveSentence.endsWith(".")).toBe(true);
      // Every dimension is spoken for, in `DIMENSIONS` order. Counting `;` would be wrong —
      // one phrase ("fold the event details into the hero; no separate details section")
      // contains one of its own.
      for (const [key, values] of Object.entries(DIMENSIONS)) {
        const chosen = (sibling.directive as Record<string, string>)[key];
        expect(values as readonly string[]).toContain(chosen);
        expect(sibling.directiveSentence).toContain(
          (PHRASE[key as keyof typeof PHRASE] as Record<string, string>)[chosen],
        );
      }
    }
  });

  it("emits no recipe, silhouette or template identifier", () => {
    // `docs/event-renderer-system.md §7.1`. The planner has no library import (lint enforces
    // that); this says the *output* carries no fixture identity either.
    for (const revision of REVISIONS) {
      const serialized = JSON.stringify(plan(revision));
      expect(/recipe|silhouette|template|hero_[a-z]/i.test(serialized)).toBe(false);
    }
  });

  it("exports the planner surface and nothing library-shaped", () => {
    expect(Object.keys(plannerModule).sort()).toEqual([
      "SEPARATION_DIMENSIONS",
      "SIBLING_COUNT",
      "UnplannableIdentityError",
      "planConceptBatch",
    ]);
  });
});

describe("separation: family, tone, typography category, hierarchy", () => {
  it("gives three distinct families whenever the compatible list allows", () => {
    for (const revision of manyRevisions(120)) {
      const p = plan(revision);
      expect(distinct(p.siblings.map((s) => s.assignment.family))).toBe(3);
      expect(dimension(p, "family").status).toBe("distinct");
      expect(dimension(p, "family").fallback).toBe("none");
      expect(dimension(p, "family").poolSize).toBe(3);
    }
  });

  it("draws every family from the compatible list, never outside it", () => {
    const compatibleFamilies = ["editorial", "statement"] as const;
    for (const revision of manyRevisions(60)) {
      const p = plan(revision, { compatibleFamilies: [...compatibleFamilies] });
      for (const sibling of p.siblings) {
        expect(compatibleFamilies).toContain(sibling.assignment.family);
      }
      // Two compatible families cannot separate three siblings; that is pool exhaustion, and it
      // is reported rather than hidden.
      expect(dimension(p, "family").distinctValues).toBe(2);
      expect(dimension(p, "family").status).toBe("partial");
      expect(dimension(p, "family").fallback).toBe("pool-exhausted");
      expect(dimension(p, "family").poolSize).toBe(2);
    }
  });

  it("collapses to one family, visibly, when the brief admits only one", () => {
    for (const revision of manyRevisions(40)) {
      const p = plan(revision, { compatibleFamilies: ["invitation"] });
      expect(new Set(p.siblings.map((s) => s.assignment.family))).toEqual(new Set(["invitation"]));
      expect(dimension(p, "family").status).toBe("uniform");
      expect(dimension(p, "family").fallback).toBe("pool-exhausted");
      expect(p.telemetry.separatingDimensions).not.toContain("family");
    }
  });

  it("separates tone when three tonal directions are legitimately available", () => {
    for (const revision of manyRevisions(120)) {
      const p = plan(revision);
      expect(distinct(p.siblings.map((s) => s.assignment.tonalDirection))).toBe(3);
      expect(dimension(p, "tonalDirection").fallback).toBe("none");
    }
  });

  it("draws every tone from the compatible list, never outside it", () => {
    for (const revision of manyRevisions(60)) {
      const p = plan(revision, { compatibleTonalDirections: ["light", "mid"] });
      for (const sibling of p.siblings) {
        expect(["light", "mid"]).toContain(sibling.assignment.tonalDirection);
      }
      expect(dimension(p, "tonalDirection").poolSize).toBe(2);
      expect(dimension(p, "tonalDirection").fallback).toBe("pool-exhausted");
    }
  });

  it("separates typography category and hierarchy whenever the families allow", () => {
    // `spec.md §7.7` qualifies both: "when the brief allows". A family constrains its own
    // hierarchies — `statement` offers only dramatic and monumental — so three distinct values
    // are not always reachable. What is guaranteed is that they are never all three the same:
    // "never the same intent with different seeds".
    let threeCategories = 0;
    let threeHierarchies = 0;
    const revisions = manyRevisions(140);
    for (const revision of revisions) {
      const p = plan(revision);
      const categories = distinct(p.siblings.map((s) => s.assignment.typographyCategory));
      const hierarchies = distinct(p.siblings.map((s) => s.assignment.hierarchy));
      expect(categories, `${revision} categories`).toBeGreaterThanOrEqual(2);
      expect(hierarchies, `${revision} hierarchies`).toBeGreaterThanOrEqual(2);
      if (categories === 3) threeCategories++;
      if (hierarchies === 3) threeHierarchies++;
    }
    // Most batches reach three; the shortfall is the vocabulary's, not a planner defect.
    expect(threeCategories / revisions.length).toBeGreaterThan(0.9);
    expect(threeHierarchies / revisions.length).toBeGreaterThan(0.8);
  });

  it("repeats a hierarchy only when the sibling's family had none left to take", () => {
    let forcedRepeats = 0;
    for (const revision of manyRevisions(140)) {
      const taken: string[] = [];
      for (const sibling of plan(revision).siblings) {
        if (taken.includes(sibling.assignment.hierarchy)) {
          const offered = FAMILIES[sibling.assignment.family].hierarchies;
          expect(
            offered.every((h) => taken.includes(h)),
            `${revision}: ${sibling.assignment.family} repeated ${sibling.assignment.hierarchy} ` +
              `while ${offered.filter((h) => !taken.includes(h)).join(", ")} was still free`,
          ).toBe(true);
          forcedRepeats++;
        }
        taken.push(sibling.assignment.hierarchy);
      }
    }
    expect(forcedRepeats).toBeGreaterThan(0);
  });

  it("keeps every typography category inside the brief when the family can", () => {
    const compatible = ["heritage", "oldstyle", "soft_serif"] as const;
    for (const revision of manyRevisions(60)) {
      const p = plan(revision, { compatibleTypographyCategories: [...compatible] });
      for (const sibling of p.siblings) {
        expect(compatible, `${revision} ${sibling.assignment.family}`).toContain(
          sibling.assignment.typographyCategory,
        );
      }
      expect(dimension(p, "typographyCategory").fallback).not.toBe("constraint-relaxed");
    }
  });

  it("reports `constraint-relaxed` when family and brief admit no common category", () => {
    // `invitation` offers no grotesk. `spec.md §7.7` ranks family above typography category, so
    // the family stands and the category leaves the brief — deterministically and visibly.
    for (const revision of manyRevisions(20)) {
      const p = plan(revision, {
        compatibleFamilies: ["invitation"],
        compatibleTypographyCategories: ["grotesk_led"],
      });
      expect(p.siblings.every((s) => s.assignment.family === "invitation")).toBe(true);
      expect(p.siblings.every((s) => s.assignment.typographyCategory !== "grotesk_led")).toBe(true);
      const reported = dimension(p, "typographyCategory");
      expect(reported.fallback).toBe("constraint-relaxed");
      expect(p.telemetry.fallbackDimensions).toContain("typographyCategory");
    }
  });

  it("narrows the pairings to exactly the ones the model may choose from", () => {
    for (const revision of manyRevisions(60)) {
      for (const { assignment } of plan(revision).siblings) {
        expect(assignment.typographyPairings.length).toBeGreaterThan(0);
        if (assignment.hierarchy === "monumental") {
          for (const pairing of assignment.typographyPairings) {
            expect(TYPOGRAPHY[pairing].holdsAtMonumental).toBe(true);
          }
        }
      }
    }
  });
});

describe("tone lock — `spec.md §7.7`", () => {
  it("does not force tonal diversity when the host explicitly constrained tone", () => {
    // "If tone is explicitly constrained, do not force dark/mid; diversity then relies on family,
    // directive, typography and hierarchy."
    let anyUniform = 0;
    for (const revision of manyRevisions(80)) {
      const p = plan(revision, { toneExplicitlyConstrained: true });
      const reported = dimension(p, "tonalDirection");
      expect(reported.fallback).toBe("tone-locked");
      expect(reported.fallback).not.toBe("pool-exhausted");
      if (reported.status === "uniform") anyUniform++;
      // Family, structure and opening still separate the batch.
      expect(p.telemetry.separatingDimensions).toContain("family");
      expect(p.telemetry.separatingDimensions).toContain("structure");
      expect(p.telemetry.separatingDimensions).toContain("opening");
    }
    // The lock is real: with tone unlocked these batches would all be three distinct tones.
    expect(anyUniform).toBeGreaterThan(0);
  });

  it("reports `tone-locked`, not `pool-exhausted`, when only one tone is compatible", () => {
    for (const revision of manyRevisions(40)) {
      const p = plan(revision, { compatibleTonalDirections: ["dark"] });
      expect(p.siblings.every((s) => s.assignment.tonalDirection === "dark")).toBe(true);
      const reported = dimension(p, "tonalDirection");
      expect(reported.status).toBe("uniform");
      expect(reported.fallback).toBe("tone-locked");
      expect(reported.poolSize).toBe(1);
    }
  });

  it("locking tone changes tone and nothing else about the batch", () => {
    // The tone draw consumes one PRNG value on every path, so the lock cannot shift the rest of
    // the seeded sequence. That property is what keeps `tone-locked` a tone decision.
    for (const revision of manyRevisions(40)) {
      const open = plan(revision);
      const locked = plan(revision, { toneExplicitlyConstrained: true });
      expect(locked.siblings.map((s) => s.assignment.family)).toEqual(
        open.siblings.map((s) => s.assignment.family),
      );
      expect(locked.siblings.map((s) => s.assignment.hierarchy)).toEqual(
        open.siblings.map((s) => s.assignment.hierarchy),
      );
      expect(locked.siblings.map((s) => s.assignment.typographyCategory)).toEqual(
        open.siblings.map((s) => s.assignment.typographyCategory),
      );
      expect(locked.siblings.map((s) => s.directive)).toEqual(
        open.siblings.map((s) => s.directive),
      );
      expect(locked.siblings.map((s) => s.allowedTokens)).toEqual(
        open.siblings.map((s) => s.allowedTokens),
      );
    }
  });
});

describe("structural directives", () => {
  it("differs on structure and opening, as §7.7 requires", () => {
    for (const revision of manyRevisions(200)) {
      const p = plan(revision);
      expect(distinct(p.siblings.map((s) => s.directive.structure)), `${revision}`).toBe(3);
      expect(distinct(p.siblings.map((s) => s.directive.opening)), `${revision}`).toBe(3);
      expect(dimension(p, "structure").status).toBe("distinct");
      expect(dimension(p, "opening").status).toBe("distinct");
    }
  });

  it("draws one value per independent dimension, all from the directive vocabulary", () => {
    for (const revision of manyRevisions(40)) {
      for (const { directive } of plan(revision).siblings) {
        expect(Object.keys(directive).sort()).toEqual(Object.keys(DIMENSIONS).sort());
        for (const [key, values] of Object.entries(DIMENSIONS)) {
          expect(values as readonly string[]).toContain((directive as Record<string, string>)[key]);
        }
      }
    }
  });

  it("never asks for a device the sibling was not allotted", () => {
    for (const revision of manyRevisions(200)) {
      for (const sibling of plan(revision).siblings) {
        if (sibling.forbiddenTokens.includes("heroNumeral")) {
          expect(sibling.directive.opening).not.toBe("numeral");
          expect(sibling.directive.date).not.toBe("numeral");
        }
      }
    }
  });
});

describe("attractive-token allotment", () => {
  it("gives each token to at most one sibling in three", () => {
    for (const revision of manyRevisions(200)) {
      const p = plan(revision);
      for (const id of Object.keys(CAPS_PER_BATCH) as (keyof typeof CAPS_PER_BATCH)[]) {
        const holders = p.siblings.filter((s) => s.allowedTokens.includes(id)).length;
        expect(holders, `${id} in ${revision}`).toBeLessThanOrEqual(CAPS_PER_BATCH[id]);
        expect(holders).toBe(1);
      }
      for (const sibling of p.siblings) {
        expect([...sibling.allowedTokens, ...sibling.forbiddenTokens].sort()).toEqual(
          Object.keys(CAPS_PER_BATCH).sort(),
        );
      }
    }
  });

  it("is not systematically biased toward index 0", () => {
    // `docs/phase-4b-plan.md §D`: no sibling may gain an advantage from ordering, so the start
    // offset is seeded. Over many revision ids each index should hold each token roughly a third
    // of the time; the bounds are loose enough to be stable and tight enough to catch a
    // hard-coded or drifting offset.
    const revisions = manyRevisions(900);
    const counts: Record<string, number[]> = {};
    for (const id of Object.keys(CAPS_PER_BATCH)) counts[id] = [0, 0, 0];
    for (const revision of revisions) {
      for (const sibling of plan(revision).siblings) {
        for (const id of sibling.allowedTokens) counts[id][sibling.index]++;
      }
    }
    for (const [id, perIndex] of Object.entries(counts)) {
      expect(perIndex.reduce((a, b) => a + b, 0)).toBe(revisions.length);
      for (let index = 0; index < SIBLING_COUNT; index++) {
        const share = perIndex[index] / revisions.length;
        expect(share, `${id} at index ${index} held ${share}`).toBeGreaterThan(0.25);
        expect(share, `${id} at index ${index} held ${share}`).toBeLessThan(0.42);
      }
    }
  });
});

describe("host constraints and creative guidance", () => {
  const HOST = ["no photographs of the children", "must say 'black tie'"];
  const GUIDANCE = ["consider a deep oxblood as the dominant", "keep ornament to a single motif"];

  it("carries hostConstraints through verbatim, in order, in their own field", () => {
    const p = plan(REVISIONS[0], { hostConstraints: HOST, creativeGuidance: GUIDANCE });
    expect(p.hostConstraints).toEqual(HOST);
    expect(p.creativeGuidance).toEqual(GUIDANCE);
    // Copied, not aliased: a caller mutating the plan cannot reach back into the identity.
    expect(p.hostConstraints).not.toBe(HOST);
  });

  it("never lets a constraint or a piece of guidance influence a draw", () => {
    // The strongest honest guarantee the planner can give about "no directive may contradict a
    // host constraint" (`docs/phase-4b-plan.md §D`): it never *derives* anything from either
    // list. Both are free text; reading them would take a model, which this stage does not have.
    // Contradiction avoidance for their content belongs to the composition call, which receives
    // the constraints alongside the directive.
    for (const revision of REVISIONS) {
      const bare = plan(revision);
      const loaded = plan(revision, { hostConstraints: HOST, creativeGuidance: GUIDANCE });
      expect(loaded.siblings).toEqual(bare.siblings);
      expect(loaded.telemetry).toEqual(bare.telemetry);
      expect(loaded.batchSeed).toBe(bare.batchSeed);
    }
    // And the module does not read their content anywhere: the two names appear only where the
    // plan copies them.
    const mentions = [...MODULE_CODE.matchAll(/identity\.(hostConstraints|creativeGuidance)/g)];
    expect(mentions).toHaveLength(2);
    expect(/\[\.\.\.identity\.hostConstraints\]/.test(MODULE_CODE)).toBe(true);
    expect(/\[\.\.\.identity\.creativeGuidance\]/.test(MODULE_CODE)).toBe(true);
  });

  it("keeps guidance advisory: it never merges into hostConstraints", () => {
    const p = plan(REVISIONS[2], { hostConstraints: [], creativeGuidance: GUIDANCE });
    expect(p.hostConstraints).toEqual([]);
    expect(p.creativeGuidance).toEqual(GUIDANCE);
    for (const guidance of GUIDANCE) expect(p.hostConstraints).not.toContain(guidance);
  });

  it("commits a directive only to structure, never to a palette, font or word", () => {
    // Why the planner cannot contradict a constraint it does not read: its whole output space on
    // the directive is the closed structural enum below. No directive value names a color, a
    // font, a size or a piece of copy, so a directive cannot assert anything a host constraint
    // about those could contradict.
    const everyValue = Object.values(DIMENSIONS).flatMap((v) => [...v]);
    for (const revision of manyRevisions(40)) {
      for (const { directive } of plan(revision).siblings) {
        for (const value of Object.values(directive)) expect(everyValue).toContain(value);
      }
    }
  });
});

describe("the identity boundary", () => {
  it("cannot be called with a provisional identity, at compile time", () => {
    const brief = identityResult().identity;
    // @ts-expect-error — only `assertAuthoritative` can produce an `AuthoritativeIdentity`, so an
    // unbranded brief (provisional or merely unchecked) is a type error, not a review comment.
    const rejected: PlanBatchInput = { identity: brief, identityRevisionId: "rev_x" };
    expect(rejected.identityRevisionId).toBe("rev_x");
  });

  it("gets its input from `assertAuthoritative`, which refuses a provisional result", () => {
    const provisional = {
      ...identityResult(),
      clarification: {
        needed: true,
        questions: [
          {
            kind: "boundary",
            question: "Whose name should lead the invitation?",
            whyItMatters: "The brief would otherwise choose on someone else's behalf.",
            options: [
              { label: "Mine", isDefer: false },
              { label: "Both", isDefer: false },
            ],
          },
        ],
      },
    };
    expect(() => assertAuthoritative(provisional, EVENT_IDENTITY_SCHEMA_VERSION)).toThrow(
      ProvisionalIdentityError,
    );
    // And the non-provisional result does produce a plannable input.
    expect(plan("rev_ok").siblings).toHaveLength(3);
  });

  it("never names the raw prompt, supplied facts or clarification", () => {
    // `spec.md §7.5`: "No later stage receives the prompt text." The brand wraps the brief rather
    // than the envelope, so those siblings are not even reachable — this holds the module to it.
    for (const forbidden of [
      /\bprompt\b/i,
      /suppliedFacts/,
      /clarification/i,
      /honoreeName/,
      /hostNames/,
      /venueText/,
      /dateText/,
    ]) {
      expect(forbidden.test(MODULE_CODE), `planner.ts names ${forbidden}`).toBe(false);
    }
  });

  it("refuses an identity whose compatible sets are empty", () => {
    // The zod contract forbids these, so reaching the planner means something upstream is broken.
    // Substituting the full vocabulary would turn that into three plausible concepts nobody
    // questions, so it throws instead.
    const emptied = (field: keyof EventIdentity) =>
      ({
        ...identityResult().identity,
        [field]: [],
      }) as unknown as AuthoritativeIdentity;
    for (const field of [
      "compatibleFamilies",
      "compatibleTonalDirections",
      "compatibleTypographyCategories",
    ] as const) {
      expect(() =>
        planConceptBatch({ identity: emptied(field), identityRevisionId: "rev_x" }),
      ).toThrow(UnplannableIdentityError);
    }
  });
});

describe("telemetry", () => {
  it("reports every separation dimension exactly once, in priority order", () => {
    const p = plan(REVISIONS[0]);
    expect(p.telemetry.dimensions.map((d) => d.dimension)).toEqual([...SEPARATION_DIMENSIONS]);
  });

  it("agrees with the plan it describes", () => {
    const read: Record<SeparationDimension, (p: ConceptBatchPlan) => string[]> = {
      family: (p) => p.siblings.map((s) => s.assignment.family),
      tonalDirection: (p) => p.siblings.map((s) => s.assignment.tonalDirection),
      typographyCategory: (p) => p.siblings.map((s) => s.assignment.typographyCategory),
      hierarchy: (p) => p.siblings.map((s) => s.assignment.hierarchy),
      structure: (p) => p.siblings.map((s) => s.directive.structure),
      opening: (p) => p.siblings.map((s) => s.directive.opening),
    };
    for (const revision of manyRevisions(120)) {
      const p = plan(revision);
      for (const reported of p.telemetry.dimensions) {
        expect(reported.distinctValues, reported.dimension).toBe(
          distinct(read[reported.dimension](p)),
        );
        expect(reported.poolSize).toBeGreaterThanOrEqual(reported.distinctValues);
        expect(reported.status).toBe(
          reported.distinctValues === 3
            ? "distinct"
            : reported.distinctValues === 1
              ? "uniform"
              : "partial",
        );
      }
      expect(p.telemetry.distinctDimensionCount).toBe(p.telemetry.separatingDimensions.length);
      expect(p.telemetry.separatingDimensions).toEqual(
        p.telemetry.dimensions.filter((d) => d.status === "distinct").map((d) => d.dimension),
      );
      expect(p.telemetry.fallbackDimensions).toEqual(
        p.telemetry.dimensions.filter((d) => d.fallback !== "none").map((d) => d.dimension),
      );
    }
  });

  it("makes a batch separated only by typography and structure visibly weak", () => {
    // The failure mode `docs/phase-4b-plan.md §D` names. One family, one tone: the batch still
    // has three directives, but family and tone are `uniform` and neither is claimed as
    // separating. Nothing here averages the weakness away.
    const p = plan("rev_weak", {
      compatibleFamilies: ["statement"],
      compatibleTonalDirections: ["dark"],
    });
    expect(dimension(p, "family").status).toBe("uniform");
    expect(dimension(p, "tonalDirection").status).toBe("uniform");
    expect(p.telemetry.separatingDimensions).not.toContain("family");
    expect(p.telemetry.separatingDimensions).not.toContain("tonalDirection");
    expect(p.telemetry.distinctDimensionCount).toBeLessThanOrEqual(4);
    expect(p.telemetry.fallbackDimensions).toContain("family");
    expect(p.telemetry.fallbackDimensions).toContain("tonalDirection");
  });

  it("carries deterministic facts only — no score, rank or judgement", () => {
    // Stated as a closed shape rather than a blocklist of words: every field is either a name
    // from a fixed enum or a count bounded by the batch, so there is nowhere for a subjective
    // number to live.
    const p = plan(REVISIONS[0]);
    expect(Object.keys(p.telemetry).sort()).toEqual([
      "dimensions",
      "distinctDimensionCount",
      "fallbackDimensions",
      "separatingDimensions",
    ]);
    for (const reported of p.telemetry.dimensions) {
      expect(Object.keys(reported).sort()).toEqual([
        "dimension",
        "distinctValues",
        "fallback",
        "poolSize",
        "status",
      ]);
      expect(SEPARATION_DIMENSIONS).toContain(reported.dimension);
      expect(["distinct", "partial", "uniform"]).toContain(reported.status);
      expect(["none", "pool-exhausted", "tone-locked", "constraint-relaxed"]).toContain(
        reported.fallback,
      );
      expect(Number.isInteger(reported.distinctValues)).toBe(true);
      expect(reported.distinctValues).toBeGreaterThanOrEqual(1);
      expect(reported.distinctValues).toBeLessThanOrEqual(SIBLING_COUNT);
      expect(Number.isInteger(reported.poolSize)).toBe(true);
      expect(reported.poolSize).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("pathological briefs", () => {
  const CASES: { name: string; overrides: IdentityOverrides }[] = [
    { name: "exactly one compatible family", overrides: { compatibleFamilies: ["statement"] } },
    { name: "one tonal direction", overrides: { compatibleTonalDirections: ["light"] } },
    {
      name: "one typography category",
      overrides: { compatibleTypographyCategories: ["heritage"] },
    },
    { name: "explicit tone lock", overrides: { toneExplicitlyConstrained: true } },
    {
      name: "everything narrowed at once",
      overrides: {
        compatibleFamilies: ["invitation"],
        compatibleTonalDirections: ["mid"],
        compatibleTypographyCategories: ["oldstyle"],
        toneExplicitlyConstrained: true,
      },
    },
    { name: "all plentiful", overrides: {} },
  ];

  for (const { name, overrides } of CASES) {
    it(`plans three usable siblings: ${name}`, () => {
      for (const revision of manyRevisions(30)) {
        const p = plan(revision, overrides);
        expect(p.siblings).toHaveLength(3);
        expect(p.siblings.map((s) => s.index)).toEqual([0, 1, 2]);
        for (const sibling of p.siblings) {
          expect(FAMILY_KEYS).toContain(sibling.assignment.family);
          expect(TONES).toContain(sibling.assignment.tonalDirection);
          expect(FAMILIES[sibling.assignment.family].hierarchies).toContain(
            sibling.assignment.hierarchy,
          );
          expect(sibling.assignment.typographyPairings.length).toBeGreaterThan(0);
        }
        // The two dimensions §7.7 hard-requires survive every narrowing above, because the
        // directive space is independent of the brief.
        expect(distinct(p.siblings.map((s) => s.directive.structure))).toBe(3);
        expect(distinct(p.siblings.map((s) => s.directive.opening))).toBe(3);
        // Repeated invocation stays byte-identical under every brief.
        expect(plan(revision, overrides)).toEqual(p);
      }
    });
  }
});

describe("parity with the ported reference planner", () => {
  /**
   * THE PARITY CLAIM, stated precisely.
   *
   * `src/lib/renderer/planner`'s `planBatch(masterSeed, batchIndex)` is the parity-checked port
   * of `proof-b/planner.js` and is pinned by a 72-concept frozen replay. It draws from the full
   * design vocabulary; this planner draws from the identity's compatible sets.
   *
   * The claim proved here: **when the identity's compatible sets are the full vocabulary and tone
   * is not explicitly constrained, and the production planner is given a revision id whose FNV
   * hash is the reference's batch seed, the two produce identical sibling seeds, identical
   * directives, identical token allotments, and identical assignments — all five fields, family,
   * tonalDirection, typographyCategory, hierarchy and the narrowed typographyPairings list — for
   * all three siblings of every batch compared.**
   *
   * That is exact, not approximate, and it is the whole of what the two produce in common. It
   * holds because the constrained draw changes only the pools: `narrow()` keeps catalog order, so
   * a full compatible set narrows to the catalog itself; the hierarchy pool was never
   * identity-derived; the tone lock is off; the extra pairing fallback added for a narrowed brief
   * degenerates to the reference's when every category is compatible; and the fourth draw is
   * still consumed rather than emitted, so the PRNG sequence does not shift.
   *
   * One equality is by construction rather than by parity, and is called out so it is not read as
   * evidence: `batchSeed` matches because the revision id below is chosen to make it match. The
   * production planner takes no master seed and no batch index, so there is no other way to put
   * the two planners on the same seed at all.
   */
  const MASTERS = [20260921, 20260922, 1, 7, 999, 123456];

  /** The revision id whose FNV hash is `planBatch(master, batchIndex)`'s batch seed. */
  const revisionMatching = (master: number, batchIndex: number) => `${master}|batch|${batchIndex}`;

  it("reproduces the reference's assignments, directives and allotments", () => {
    let compared = 0;
    for (const master of MASTERS) {
      for (let batchIndex = 0; batchIndex < 12; batchIndex++) {
        const reference = planBatch(master, batchIndex);
        const production = plan(revisionMatching(master, batchIndex));
        const where = `master ${master} batch ${batchIndex}`;

        expect(production.batchSeed, `${where} batchSeed`).toBe(reference.batchSeed);
        for (let k = 0; k < 3; k++) {
          const mine = production.siblings[k];
          const theirs = reference.siblings[k];
          expect(mine.seed, `${where} sib ${k} seed`).toBe(theirs.seed);
          expect(mine.directive, `${where} sib ${k} directive`).toEqual(theirs.directive);
          expect(mine.allowedTokens, `${where} sib ${k} allowed`).toEqual(theirs.allowedTokens);
          expect(mine.forbiddenTokens, `${where} sib ${k} forbidden`).toEqual(
            theirs.forbiddenTokens,
          );
          expect(mine.assignment.family, `${where} sib ${k} family`).toBe(theirs.assignment.family);
          expect(mine.assignment.tonalDirection, `${where} sib ${k} tone`).toBe(
            theirs.assignment.tonalDirection,
          );
          expect(mine.assignment.typographyCategory, `${where} sib ${k} category`).toBe(
            theirs.assignment.typographyCategory,
          );
          expect(mine.assignment.hierarchy, `${where} sib ${k} hierarchy`).toBe(
            theirs.assignment.hierarchy,
          );
          expect(mine.assignment.typographyPairings, `${where} sib ${k} pairings`).toEqual(
            theirs.assignment.typographyPairings,
          );
          compared++;
        }
      }
    }
    expect(compared).toBe(MASTERS.length * 12 * 3);
  });

  it("diverges from the reference exactly when the brief narrows a pool", () => {
    // The other half of the claim: parity is a consequence of the pools being full, not a
    // coincidence. Narrow one set and the assignments must move.
    const revision = revisionMatching(20260921, 0);
    const reference = planBatch(20260921, 0);
    const narrowed = plan(revision, { compatibleFamilies: ["invitation", "statement"] });
    expect(narrowed.siblings.map((s) => s.assignment.family)).not.toEqual(
      reference.siblings.map((s) => s.assignment.family),
    );
    expect(narrowed.siblings.every((s) => s.assignment.family !== "editorial")).toBe(true);
  });
});
