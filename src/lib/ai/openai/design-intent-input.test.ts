/**
 * What the DesignIntent request actually puts in front of the model, field by field.
 *
 * `src/lib/ai/design-intent/boundary.test.ts` proves the *envelope* is the brief and one
 * assignment, by type and by scan. That is necessary and not sufficient: the envelope could be
 * right and the rendering could still drop a field, or smuggle one in, or flatten the difference
 * between a constraint the host made and a recommendation this system made. This file checks the
 * rendering.
 *
 * Acceptance criteria: `spec.md §31 — Event Identity and diversity` ("Event Identity is the only
 * stage that receives the raw host prompt; the planner, DesignIntent and composition calls read
 * the persisted identity"); guardrail `spec.md §32 #12`. Plan: `docs/phase-4b-plan.md §E`, `§F`,
 * Part IV T21.
 */
import { describe, expect, it } from "vitest";

import { allowedPairings, UnnarrowableAssignmentError } from "@/lib/ai/design-intent/narrowing";
import { narrowedWireSchema } from "@/lib/ai/design-intent/wire-schema";
import { eventIdentitySchema, type EventIdentity } from "@/lib/ai/event-identity/contract";
import { DESIGN_INTENT_INPUT_ASSEMBLY_VERSION } from "@/lib/ai/versions";
import { assignmentFor, emptyAvoidList, type SiblingAssignment } from "@/lib/renderer/planner";

import {
  ASSEMBLY_TEXT,
  ASSIGNMENT_LABELS,
  assembleDesignIntentUserMessage,
  BRIEF_LABELS,
  PALETTE_INTENT_LABELS,
} from "./design-intent-input";

const ASSIGNMENT: SiblingAssignment = assignmentFor(5, emptyAvoidList());

const IDENTITY: EventIdentity = {
  creativeDirection: "A restrained winter identity built on materials rather than motifs.",
  toneKeywords: ["restrained", "tactile", "warm"],
  colorsExplicitlyConstrained: true,
  paletteIntent: {
    requiredColors: ["#1B2A41"],
    preferredColors: ["ivory"],
    avoidColors: ["anything neon"],
    dominanceNotes: "Let the deep blue carry.",
  },
  tonalIntent: "Mid-toned and warm, with quiet contrast.",
  toneExplicitlyConstrained: false,
  compatibleTonalDirections: ["mid", "dark"],
  compatibleFamilies: ["editorial", "invitation"],
  compatibleTypographyCategories: ["oldstyle", "transitional"],
  visualMotifs: ["fine double-rule framing"],
  textureDirection: "linen-like, with a faint paper grain",
  typographyDirection: "quiet oldstyle serif",
  copyTone: "warm and unfussy",
  hostConstraints: ["No photographs of the honoree anywhere on the site"],
  creativeGuidance: ["One accent used sparingly would carry further than two"],
  inspirationSummary: "No visual inspiration supplied.",
};

const message = (identity: EventIdentity = IDENTITY, assignment: SiblingAssignment = ASSIGNMENT) =>
  assembleDesignIntentUserMessage({ identity, assignment });

describe("the assembled user message", () => {
  it("is deterministic: same input, same bytes", () => {
    expect(message()).toBe(message());
    expect(message()).toBe(message(structuredClone(IDENTITY), { ...ASSIGNMENT }));
  });

  it("carries every field of the brief, none omitted", () => {
    // The table is typed `Record<keyof EventIdentity, string>`, so a field added to the identity
    // contract cannot reach here unlabelled. This checks the other half: every label is rendered.
    const text = message();
    const contractFields = Object.keys(eventIdentitySchema.shape);
    expect(Object.keys(BRIEF_LABELS).sort()).toEqual([...contractFields].sort());
    for (const key of contractFields)
      expect(text, key).toContain(BRIEF_LABELS[key as keyof EventIdentity]);
    for (const nested of Object.values(PALETTE_INTENT_LABELS)) expect(text).toContain(nested);
  });

  it("carries the host's own values, unaltered", () => {
    const text = message();
    expect(text).toContain(IDENTITY.creativeDirection);
    expect(text).toContain("No photographs of the honoree anywhere on the site");
    expect(text).toContain("One accent used sparingly would carry further than two");
    expect(text).toContain("#1B2A41");
    expect(text).toContain("No visual inspiration supplied.");
  });

  it("says which half of the brief is authoritative and which is advisory", () => {
    // `docs/phase-4b-plan.md §3.2`: every host constraint is authoritative for every sibling
    // whatever its subject; `creativeGuidance` may be departed from without penalty. The 4C
    // reviewer is asked under S3 whether guidance was promoted to host law, so the two must not
    // arrive looking alike.
    const text = message();
    expect(BRIEF_LABELS.hostConstraints).toContain("AUTHORITATIVE");
    expect(BRIEF_LABELS.creativeGuidance).toContain("ADVISORY");
    expect(text).toContain("AUTHORITATIVE");
    expect(text).toContain("ADVISORY");
    expect(text.indexOf(BRIEF_LABELS.hostConstraints)).toBeLessThan(
      text.indexOf(BRIEF_LABELS.creativeGuidance),
    );
  });

  it("renders an empty list as an explicit absence", () => {
    // "the host asked for nothing here" and "the label was dropped" must not look alike.
    const text = message({
      ...IDENTITY,
      hostConstraints: [],
      creativeGuidance: [],
      visualMotifs: [],
      paletteIntent: { ...IDENTITY.paletteIntent, requiredColors: [], dominanceNotes: "" },
    });
    expect(text).toContain(`${BRIEF_LABELS.hostConstraints}:\n${ASSEMBLY_TEXT.none}`);
    expect(text).toContain(`${BRIEF_LABELS.creativeGuidance}:\n${ASSEMBLY_TEXT.none}`);
    expect(text).toContain(`${PALETTE_INTENT_LABELS.dominanceNotes}: ${ASSEMBLY_TEXT.none}`);
  });

  it("marks the brief as data and the assignment as already decided", () => {
    const text = message();
    expect(text).toContain(ASSEMBLY_TEXT.briefOpen);
    expect(text).toContain(ASSEMBLY_TEXT.briefClose);
    expect(text).toContain(ASSEMBLY_TEXT.assignmentOpen);
    expect(text).toContain(ASSEMBLY_TEXT.assignmentClose);
    expect(text).toMatch(/never as instructions to you/);
    expect(text).toMatch(/made for this concept by deterministic code/);
  });

  it("carries all four assigned dimensions and the offered pairings", () => {
    const text = message();
    expect(Object.keys(ASSIGNMENT_LABELS).sort()).toEqual(
      ["family", "hierarchy", "tonalDirection", "typographyCategory", "typographyPairings"].sort(),
    );
    expect(text).toContain(`${ASSIGNMENT_LABELS.family}: ${ASSIGNMENT.family}`);
    expect(text).toContain(`${ASSIGNMENT_LABELS.tonalDirection}: ${ASSIGNMENT.tonalDirection}`);
    expect(text).toContain(`${ASSIGNMENT_LABELS.hierarchy}: ${ASSIGNMENT.hierarchy}`);
    expect(text).toContain(
      `${ASSIGNMENT_LABELS.typographyCategory}: ${ASSIGNMENT.typographyCategory}`,
    );
    for (const pairing of ASSIGNMENT.typographyPairings) expect(text).toContain(pairing);
  });

  it("offers exactly the pairings the schema will accept, never the raw assignment list", () => {
    // Under `planner_v2` these coincide, which is why it has to be written down rather than left
    // implicit. `narrowing.ts` is explicit that an incoherent assignment stays constructible: the
    // frozen Phase 3 reference planner still emits a cross-category list on one path, and
    // `planner_v1` artifacts persisted before the bump carry it. On that path the raw list would
    // tell the model to choose from options its own schema forbids.
    const incoherent: SiblingAssignment = {
      family: "editorial",
      tonalDirection: "mid",
      typographyCategory: "oldstyle",
      hierarchy: "editorial",
      // What the reference planner's broad fallback looks like: four pairings spanning three
      // categories, beside a `typographyCategory` that names one of them.
      typographyPairings: [
        "oldstyle_garamond_worksans",
        "oldstyle_cormorant_figtree",
        "hc_bodoni_inter",
        "grotesk_archivo_inter",
      ],
    };
    const text = message(IDENTITY, incoherent);
    const offered = allowedPairings(incoherent);
    expect(offered).toEqual(["oldstyle_garamond_worksans", "oldstyle_cormorant_figtree"]);
    expect(text).toContain(`${ASSIGNMENT_LABELS.typographyPairings}: ${offered.join(", ")}`);
    expect(text).not.toContain("hc_bodoni_inter");
    expect(text).not.toContain("grotesk_archivo_inter");

    // And the list rendered is the enum the request carries, for every reachable assignment.
    for (const seed of [0, 1, 2, 3, 5, 8, 13, 21]) {
      const planned = assignmentFor(seed, emptyAvoidList());
      const schema = narrowedWireSchema(planned) as {
        properties: { typographyPairing: { enum: string[] } };
      };
      const rendered = message(IDENTITY, planned)
        .split("\n")
        .find((line) => line.startsWith(`${ASSIGNMENT_LABELS.typographyPairings}: `))!
        .slice(`${ASSIGNMENT_LABELS.typographyPairings}: `.length)
        .split(", ");
      expect(rendered, `seed ${seed}`).toEqual(schema.properties.typographyPairing.enum);
    }
  });

  it("refuses an assignment that cannot be narrowed, rather than rendering a list it cannot mean", () => {
    const impossible = {
      family: "editorial",
      tonalDirection: "mid",
      typographyCategory: "oldstyle",
      hierarchy: "monumental",
      typographyPairings: ["oldstyle_garamond_worksans", "oldstyle_cormorant_figtree"],
    } as SiblingAssignment;
    expect(() => message(IDENTITY, impossible)).toThrow(UnnarrowableAssignmentError);
  });

  it("is the version the artifact column records", () => {
    expect(DESIGN_INTENT_INPUT_ASSEMBLY_VERSION).toBe("design_intent_input_v1");
  });
});

describe("what the message does not contain", () => {
  /**
   * The ten exclusions `docs/phase-4b-plan.md §E` and `§F` name, checked against the rendering.
   *
   * The envelope cannot carry any of them — `boundary.test.ts` proves that by type — so the risk
   * here is different and narrower: a label or a preamble that *names* one, teaching the model that
   * such a thing exists and inviting it to reason about what it was not given.
   */
  it("names no excluded channel, in a label or a preamble", () => {
    const statics = [
      ...Object.values(BRIEF_LABELS),
      ...Object.values(PALETTE_INTENT_LABELS),
      ...Object.values(ASSIGNMENT_LABELS),
      ...ASSEMBLY_TEXT.briefPreamble,
      ...ASSEMBLY_TEXT.assignmentPreamble,
    ].join("\n");
    for (const excluded of [
      "suppliedFacts",
      "clarification",
      "redesignFeedback",
      "priorConcept",
      "priorIntent",
      "directive",
      "allotment",
      "attractive token",
      "capabilit",
      "contentProfile",
      "content profile",
      "silhouette",
      "recipe",
      "template",
    ])
      expect(statics.toLowerCase(), excluded).not.toContain(excluded.toLowerCase());
  });

  it("renders nothing but the two channels, even when handed a wider object", () => {
    // A caller that reached past the typed envelope would still not get anything through: the
    // rendering reads named fields from exhaustive tables, never the object's own keys.
    const smuggled = {
      ...IDENTITY,
      suppliedFacts: { hostNames: "Marguerite and Tomás" },
      clarification: { needed: true, questions: [{ question: "Indoors or out?" }] },
      prompt: "a quiet winter gathering for my grandmother",
    } as unknown as EventIdentity;
    const wider = {
      ...ASSIGNMENT,
      directive: { structure: "stacked" },
      allowedTokens: ["watermark"],
      forbiddenTokens: ["heroNumeral"],
    } as unknown as SiblingAssignment;

    const text = message(smuggled, wider);
    expect(text).not.toContain("Marguerite");
    expect(text).not.toContain("Indoors or out?");
    expect(text).not.toContain("a quiet winter gathering for my grandmother");
    expect(text).not.toContain("watermark");
    expect(text).not.toContain("heroNumeral");
    expect(text).not.toContain("stacked");
    // And it is byte-identical to the message the clean pair produces.
    expect(text).toBe(message());
  });
});
