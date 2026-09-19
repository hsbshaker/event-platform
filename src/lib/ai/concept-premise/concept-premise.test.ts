/**
 * The ConceptPremise stage, tested as a **capability** rather than against the cases that exposed
 * the need for it.
 *
 * `docs/designintent-sibling-convergence.md` is the diagnosis; this file is the proof that what was
 * built answers it. Every fixture is the printmaking-studio brief in `tests/fixtures/`, which comes
 * from no corpus, and `tests/unit/premise-no-case-leakage.test.ts` holds this whole implementation
 * to that. A test that recognised one of the twelve T22 events would pass for the wrong reason and
 * would say nothing about the thirteenth.
 *
 * The ordering below is the ordering that matters: **fidelity first, then distinctness.** One
 * correct concept plus two imaginative unsupported ones is a worse system than three that converge,
 * so the tests that protect correctness come before the tests that protect diversity, and one of
 * them proves the two cannot be traded against each other.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity`, `§31 — DesignIntent,
 * composition and compiler`. Guardrails: `spec.md §32 #12`, `#21`.
 */
import { describe, expect, it } from "vitest";

import { SIBLING_COUNT } from "@/lib/generation/planner";

import {
  PREMISE_FIXTURE_IDENTITY,
  premiseSetWith,
  validPremiseSet,
} from "../../../../tests/fixtures/concept-premise";
import {
  AXIS_VALUES,
  conceptPremiseSetSchema,
  MAX_CONSTRAINED_AXES,
  PREMISE_SET_SIZE,
  REGISTER_AXES,
  type ConceptPremiseSet,
} from "./contract";
import { CONCEPT_PREMISE_INPUT_CHANNELS } from "./input";
import {
  MAX_REPAIR_RETRIES,
  NEVER_REPROMPT_CONDITIONS,
  PREMISE_CLASS_PRECEDENCE,
  PREMISE_DISPOSITION,
} from "./policy";
import {
  dominantPremiseIssueClass,
  identityProse,
  validateConceptPremiseSet,
  type PremiseValidationIssue,
} from "./validate";

const classesOf = (issues: readonly PremiseValidationIssue[]) => [
  ...new Set(issues.map((i) => i.class)),
];

function issuesFor(set: ConceptPremiseSet) {
  const outcome = validateConceptPremiseSet(set, PREMISE_FIXTURE_IDENTITY);
  return outcome.ok ? [] : outcome.issues;
}

describe("one authoritative understanding", () => {
  it("is the only channel this stage receives", () => {
    // The strongest guarantee available: a stage whose sole input is the one authoritative
    // understanding cannot ground three premises in anything else, because there is nothing else.
    expect([...CONCEPT_PREMISE_INPUT_CHANNELS]).toEqual(["identity"]);
  });

  it("plans exactly as many premises as the planner plans siblings", () => {
    // `contract.ts` writes the three out rather than importing `SIBLING_COUNT`, to keep the
    // planner out of its closure. This is the check that makes that safe rather than convenient.
    expect(PREMISE_SET_SIZE).toBe(SIBLING_COUNT);
    expect(validPremiseSet().premises).toHaveLength(SIBLING_COUNT);
  });

  it("has no field anywhere for a host fact, constraint, relationship or stake", () => {
    // Structural prevention, not a word filter. A premise that wanted to assert a constraint would
    // have nowhere to put it, at any depth — which is why the check is over the schema rather than
    // over a sample value.
    const shape = conceptPremiseSetSchema.shape;
    expect(Object.keys(shape).sort()).toEqual(["constrainedAxes", "premises"]);
    const premiseKeys = Object.keys(validPremiseSet().premises[0]).sort();
    expect(premiseKeys).toEqual([
      "designConsequences",
      "distinctFrom",
      "experience",
      "foregrounds",
      "grounding",
      "organizingIdea",
      "register",
      "title",
    ]);
    for (const forbidden of [
      "hostConstraints",
      "constraints",
      "facts",
      "suppliedFacts",
      "relationships",
      "tension",
      "stakes",
      "motives",
    ]) {
      expect(premiseKeys).not.toContain(forbidden);
    }
  });
});

describe("three choices, and none of them a reinterpretation", () => {
  it("accepts three genuinely different premises grounded in the same brief", () => {
    const outcome = validateConceptPremiseSet(validPremiseSet(), PREMISE_FIXTURE_IDENTITY);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // All three axes separate here, which is more than the gate requires — the fixture is what a
    // good answer looks like, not the minimum a legal one is.
    expect(outcome.telemetry.separatingAxes).toEqual([...REGISTER_AXES]);
    expect(outcome.telemetry.constrainedAxes).toEqual([]);
    expect(outcome.telemetry.groundingCounts.every((count) => count > 0)).toBe(true);
  });

  it("refuses a premise that invents a person, a place or a number", () => {
    // The adversarial case the whole stage exists to refuse: a tempting alternative interpretation
    // that would make the three concepts more different by asserting something the brief does not
    // carry. It is refused for being unsupported, not for being different.
    const fabricated = premiseSetWith(2, {
      organizingIdea:
        "The evening turns on the founder's fortieth year at the presses, and the site is built " +
        "as the tribute the workshop on Hallam Street never held for her.",
    });
    const issues = issuesFor(fabricated);
    expect(classesOf(issues)).toContain("fidelity");
    expect(issues.some((i) => /Hallam/.test(i.message))).toBe(true);
  });

  it("refuses grounding that is not anchored in the brief", () => {
    const unanchored = premiseSetWith(1, {
      grounding: ["nothing whatsoever substantiates this particular emphasis anywhere"],
    });
    const issues = issuesFor(unanchored);
    expect(classesOf(issues)).toEqual(["fidelity"]);
    expect(issues[0].path).toBe("premises.1.grounding.0");
  });

  it("refuses a premise that names a colour the brief excludes", () => {
    // `avoidColors` is absolute and binds all three premises. The brief mentions this colour only
    // in order to exclude it, which is what makes the use decidable rather than ordinary
    // vocabulary — a word the brief uses elsewhere stays freely available.
    const excluded = premiseSetWith(0, {
      experience: "Arriving should feel like walking into a neon-lit room that hums a little.",
    });
    expect(classesOf(issuesFor(excluded))).toContain("fidelity");

    const ordinary = premiseSetWith(0, {
      experience: "Arriving should feel like handling a sheet of raw paper under a working lamp.",
    });
    expect(issuesFor(ordinary)).toEqual([]);
  });

  it("refuses a premise that reaches into the palette", () => {
    const hex = premiseSetWith(0, {
      designConsequences: [
        "the page settles onto #2B2B2B with paper as relief",
        "sections are separated by a single ruled line",
      ],
    });
    expect(classesOf(issuesFor(hex))).toContain("fidelity");
  });

  it("reads every prose field of the brief when deciding what is supported", () => {
    // An exhaustive table keyed by `keyof EventIdentity` decides this, so a field added to the
    // identity contract cannot silently stop counting as support. The closed enums are excluded on
    // purpose: matching against them would measure the schema, not the brief.
    const prose = identityProse(PREMISE_FIXTURE_IDENTITY);
    expect(prose).toContain(PREMISE_FIXTURE_IDENTITY.creativeDirection);
    expect(prose).toContain(PREMISE_FIXTURE_IDENTITY.copyTone);
    expect(prose).toContain(PREMISE_FIXTURE_IDENTITY.hostConstraints[0]);
    expect(prose).toContain(PREMISE_FIXTURE_IDENTITY.creativeGuidance[0]);
    expect(prose).not.toContain("editorial");
  });
});

describe("collapse is detected before a single design is paid for", () => {
  const withRegisters = (
    registers: readonly { pace: string; presence: string; surfaceRichness: string }[],
  ): ConceptPremiseSet => {
    const set = validPremiseSet();
    return {
      ...set,
      premises: set.premises.map((premise, at) => ({
        ...premise,
        register: registers[at] as ConceptPremiseSet["premises"][number]["register"],
      })),
    };
  };

  it("refuses three premises at one register", () => {
    // The collapse the rule exists for: one register three times is one concept three times.
    const one = { pace: "measured", presence: "poised", surfaceRichness: "considered" };
    const issues = issuesFor(withRegisters([one, one, one]));
    expect(classesOf(issues)).toEqual(["set"]);
    expect(issues[0].path).toBe("premises.register");
  });

  it("refuses two premises at one register, while the third differs", () => {
    const one = { pace: "measured", presence: "poised", surfaceRichness: "considered" };
    const other = { pace: "lingering", presence: "commanding", surfaceRichness: "layered" };
    const issues = issuesFor(withRegisters([one, one, other]));
    expect(issues.some((issue) => issue.message.includes("every axis"))).toBe(true);
  });

  it("accepts three distinct registers even when no axis separates all three", () => {
    // The false rejection the first version of this gate produced, as a case. These are three
    // different registers by any reading, and no axis takes three distinct values — so a rule
    // demanding one would refuse them, with no honest escape: `constrainedAxes` requires the axis
    // it names to be uniform, and none of these is. The only way through would have been to move a
    // register the idea did not ask to move.
    const outcome = validateConceptPremiseSet(
      withRegisters([
        { pace: "measured", presence: "poised", surfaceRichness: "considered" },
        { pace: "measured", presence: "commanding", surfaceRichness: "bare" },
        { pace: "lingering", presence: "poised", surfaceRichness: "considered" },
      ]),
      PREMISE_FIXTURE_IDENTITY,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // And the weakness is visible rather than hidden: no axis fully separates, reported as
    // telemetry and never as a defect.
    expect(outcome.telemetry.separatingAxes).toEqual([]);
  });

  it("accepts two premises sharing one axis, which is ordinary", () => {
    const outcome = validateConceptPremiseSet(
      withRegisters([
        { pace: "measured", presence: "poised", surfaceRichness: "considered" },
        { pace: "measured", presence: "commanding", surfaceRichness: "bare" },
        { pace: "propulsive", presence: "understated", surfaceRichness: "layered" },
      ]),
      PREMISE_FIXTURE_IDENTITY,
    );
    expect(outcome.ok).toBe(true);
  });

  it("reports which axes fully separate, without requiring any of them to", () => {
    const set = validPremiseSet();
    const outcome = validateConceptPremiseSet(
      withRegisters([0, 1, 2].map((at) => set.premises[at].register)),
      PREMISE_FIXTURE_IDENTITY,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.telemetry.separatingAxes).toEqual([...REGISTER_AXES]);
    // The vocabularies are three-valued, which is what makes full separation expressible at all.
    for (const axis of REGISTER_AXES) expect(AXIS_VALUES[axis]).toHaveLength(3);
  });

  it("bounds the declared-constraint escape, belt and braces", () => {
    // Under the corrected gate this bound is no longer load-bearing — declaring all three axes
    // constrained would make the three registers identical and be refused on its own terms — but
    // it is kept because it fails with a clearer message.
    expect(MAX_CONSTRAINED_AXES).toBe(REGISTER_AXES.length - 1);
    const set = validPremiseSet();
    const escaped = {
      ...set,
      constrainedAxes: REGISTER_AXES.map((axis) => ({
        axis,
        why: "the brief leaves no room to vary this at all",
      })),
    };
    expect(conceptPremiseSetSchema.safeParse(escaped).success).toBe(false);
  });

  it("still accepts an honest narrow set with two axes declared constrained", () => {
    const outcome = validateConceptPremiseSet(
      {
        ...withRegisters(
          [0, 1, 2].map((at) => ({
            pace: AXIS_VALUES.pace[at] as string,
            presence: "poised",
            surfaceRichness: "considered",
          })),
        ),
        constrainedAxes: [
          { axis: "presence", why: "the brief asks for one level of address throughout" },
          { axis: "surfaceRichness", why: "the brief fixes how much the surfaces may carry" },
        ],
      },
      PREMISE_FIXTURE_IDENTITY,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.telemetry.constrainedAxes).toEqual(["presence", "surfaceRichness"]);
  });

  it("checks a declared constraint against what the set actually did", () => {
    const set = validPremiseSet();
    const lying = {
      ...set,
      constrainedAxes: [{ axis: "pace" as const, why: "the brief fixes the pace of the evening" }],
    };
    const issues = issuesFor(lying);
    expect(classesOf(issues)).toEqual(["set"]);
    expect(issues[0].message).toContain("declared constrained but takes 3 values");
  });

  it("refuses two premises that are one idea reworded", () => {
    // Three outputs that differ in their parameters while sharing one underlying proposition: the
    // exact shape the T22 batches took, detected here on the semantics rather than on a distance.
    const source = validPremiseSet().premises[0].organizingIdea;
    const reworded = premiseSetWith(1, {
      organizingIdea: source.replace("laid out", "arranged").replace("visitor", "guest"),
    });
    const issues = issuesFor(reworded);
    expect(classesOf(issues)).toEqual(["set"]);
    expect(issues[0].path).toBe("premises.organizingIdea");
  });

  it("refuses two premises that carry the same name, in either word order", () => {
    const set = validPremiseSet();
    expect(
      issuesFor(premiseSetWith(1, { title: set.premises[0].title })).some(
        (i) => i.path === "premises.title",
      ),
    ).toBe(true);
    expect(
      issuesFor(
        premiseSetWith(1, { title: set.premises[0].title.split(" ").reverse().join(" ") }),
      ).some((i) => i.message.includes("different order")),
    ).toBe(true);
  });
});

describe("correctness outranks diversity, in the code", () => {
  it("reports the fidelity class first when a set fails on both", () => {
    // A run that failed on both must never be read as a diversity problem: the distinctness is
    // worthless if the set is unsupported, and the reader has to be told which one to fix.
    const both = premiseSetWith(2, {
      title: validPremiseSet().premises[0].title,
      organizingIdea:
        "Everything turns on what happened at the Vernon Street fire, which the studio has never " +
        "spoken about since.",
    });
    const issues = issuesFor(both);
    expect(classesOf(issues)).toEqual(expect.arrayContaining(["fidelity", "set"]));
    expect(dominantPremiseIssueClass(issues)).toBe("fidelity");
    expect(PREMISE_CLASS_PRECEDENCE[0]).toBe("fidelity");
  });

  it("returns every issue at once, because there is only ever one correction turn", () => {
    const broken = premiseSetWith(1, {
      title: validPremiseSet().premises[0].title,
      grounding: ["unsupported claim with no purchase whatsoever"],
    });
    const issues = issuesFor(broken);
    expect(issues.length).toBeGreaterThan(1);
    expect(classesOf(issues).sort()).toEqual(["fidelity", "set"]);
  });
});

describe("the repair is bounded and cannot loop", () => {
  it("permits one pass for the whole response, whatever the class", () => {
    expect(MAX_REPAIR_RETRIES).toBe(1);
    // Every class gets the same answer, so there is no class-dependent branch that could open a
    // second pass — which is what makes the loop bound the only thing that has to hold.
    expect(new Set(Object.values(PREMISE_DISPOSITION))).toEqual(new Set(["repair_retry_once"]));
  });

  it("names the conditions no stage may ever re-prompt for", () => {
    // Kept as data beside the permitted list so "we repaired it deterministically" and "we asked
    // the model again" cannot quietly swap places in a later change.
    expect([...NEVER_REPROMPT_CONDITIONS]).toEqual([
      "design_intent_sibling_convergence",
      "design_intent_motif_overlap",
      "design_intent_palette_proximity",
      "design_intent_card_duplication",
      "premise_not_expressed_by_design_intent",
    ]);
  });
});
