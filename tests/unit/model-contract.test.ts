/**
 * The model-facing contract cannot drift from the production vocabulary.
 *
 * `docs/model-schemas/design-intent.schema.json` is what the structured-output provider enforces;
 * `src/lib/renderer/vocabulary/` and `src/lib/renderer/compile/motifs.ts` are what the compiler
 * can actually resolve. If they disagree, the model can return something production cannot render,
 * and nothing else in the suite would notice — v3 drifted this way for a whole revision.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`;
 * `docs/model-contracts.md §2` (versioned assets) and §5.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DESIGN_INTENT_PROMPT_VERSION, DESIGN_INTENT_SCHEMA_VERSION } from "@/lib/ai/versions";
import { MOTIF_CATALOG } from "@/lib/renderer/compile/motifs";
import {
  TYPOGRAPHY,
  TYPOGRAPHY_KEYS,
  FAMILIES,
  FAMILY_KEYS,
  TONES,
} from "@/lib/renderer/vocabulary";
import { ENUM } from "@/lib/renderer/composition/tokens";

const DOCS = new URL("../../docs/", import.meta.url).pathname;

interface JsonSchema {
  properties: Record<
    string,
    { enum?: string[]; items?: { enum?: string[] }; description?: string }
  >;
  description?: string;
  title?: string;
}

const designIntentSchema = JSON.parse(
  readFileSync(`${DOCS}model-schemas/design-intent.schema.json`, "utf8"),
) as JsonSchema;

const prompt = readFileSync(`${DOCS}model-prompts/design-intent.system.md`, "utf8");

describe("DesignIntent schema v4 ↔ production vocabulary", () => {
  it("offers exactly the twelve production typography pairings, in catalog order", () => {
    expect(designIntentSchema.properties.typographyPairing.enum).toEqual([...TYPOGRAPHY_KEYS]);
    expect(TYPOGRAPHY_KEYS).toHaveLength(12);
  });

  it("offers exactly the seven canonical motif ids", () => {
    const schemaMotifs = designIntentSchema.properties.motifs.items!.enum!;
    expect([...schemaMotifs].sort()).toEqual(Object.keys(MOTIF_CATALOG).sort());
    expect(schemaMotifs).toHaveLength(7);
    // And the same seven the composition language accepts.
    expect([...schemaMotifs].sort()).toEqual([...ENUM.MotifId].sort());
  });

  it("reintroduces none of the retired motif ids", () => {
    const retired = [
      "plaid_restrained",
      "botanical_line",
      "stripe_classic",
      "deco_border",
      "linen_texture",
      "equestrian_line",
      "scallop_subtle",
      "star_celestial",
      "ribbon_line",
    ];
    const serialized = JSON.stringify(designIntentSchema);
    for (const id of retired)
      expect(serialized.includes(id), `schema still offers "${id}"`).toBe(false);
  });

  it("offers exactly the production families and tones", () => {
    expect(designIntentSchema.properties.family.enum).toEqual([...FAMILY_KEYS]);
    expect(designIntentSchema.properties.tonalDirection.enum).toEqual([...TONES]);
  });

  it("carries no recipe, silhouette, template or archetype identifier", () => {
    const serialized = JSON.stringify(designIntentSchema).toLowerCase();
    for (const word of [
      "archetype",
      "silhouette",
      "recipe",
      "template",
      "herorecipe",
      "surfaceplan",
    ])
      expect(serialized.includes(word), `schema mentions "${word}"`).toBe(false);
  });

  it("keeps category and pairing distinct — no category name is offered as a pairing", () => {
    const categories = new Set(Object.values(TYPOGRAPHY).map((p) => p.category));
    for (const pairing of designIntentSchema.properties.typographyPairing.enum!)
      expect(categories.has(pairing as never), `"${pairing}" is a category, not a pairing`).toBe(
        false,
      );
    // Every category is represented by at least one offered pairing.
    const offered = new Set(
      designIntentSchema.properties.typographyPairing.enum!.map(
        (id) => TYPOGRAPHY[id as keyof typeof TYPOGRAPHY].category,
      ),
    );
    expect(offered).toEqual(categories);
  });
});

describe("runtime narrowing of the pairing enum", () => {
  /** `docs/model-contracts.md §5.2`: filter by assigned category, then by the hierarchy. */
  const narrow = (category: string, hierarchy: string) =>
    TYPOGRAPHY_KEYS.filter(
      (k) =>
        TYPOGRAPHY[k].category === category &&
        (hierarchy !== "monumental" || TYPOGRAPHY[k].holdsAtMonumental),
    );

  it("offers only pairings from the assigned category", () => {
    for (const category of new Set(Object.values(TYPOGRAPHY).map((p) => p.category))) {
      for (const hierarchy of ["restrained", "editorial", "dramatic"]) {
        const allowed = narrow(category, hierarchy);
        expect(allowed.length, `${category}/${hierarchy}`).toBeGreaterThan(0);
        for (const id of allowed) expect(TYPOGRAPHY[id].category).toBe(category);
      }
    }
  });

  it("never offers a non-monumental pairing at monumental hierarchy", () => {
    const nonHolding = TYPOGRAPHY_KEYS.filter((k) => !TYPOGRAPHY[k].holdsAtMonumental);
    expect(nonHolding).toEqual(["oldstyle_garamond_worksans", "oldstyle_cormorant_figtree"]);
    for (const category of new Set(Object.values(TYPOGRAPHY).map((p) => p.category)))
      for (const id of narrow(category, "monumental"))
        expect(TYPOGRAPHY[id].holdsAtMonumental, id).toBe(true);
  });

  it("leaves the whole oldstyle category empty at monumental — the planner must not assign it", () => {
    // Both oldstyle pairings fail to hold. The planner's own narrowing handles this
    // (`planner/index.ts`), and this pins the fact the two depend on.
    expect(narrow("oldstyle", "monumental")).toEqual([]);
    for (const family of FAMILY_KEYS) {
      if (FAMILIES[family].hierarchies.includes("monumental"))
        expect(
          FAMILIES[family].categories.some((c) => narrow(c, "monumental").length > 0),
          `${family} admits monumental but offers no monumental-capable category`,
        ).toBe(true);
    }
  });
});

describe("version constants", () => {
  it("are at v5, and the prompt and schema say so too", () => {
    expect(DESIGN_INTENT_PROMPT_VERSION).toBe("design_intent_v5");
    expect(DESIGN_INTENT_SCHEMA_VERSION).toBe("design_intent_schema_v5");
    expect(prompt).toContain("**Prompt version:** `design_intent_v5`");
    expect(designIntentSchema.title).toContain("design_intent_schema_v5");
  });

  it("preserve v3 rather than rewriting it", () => {
    const v3Schema = JSON.parse(
      readFileSync(`${DOCS}model-schemas/history/design-intent.v3.schema.json`, "utf8"),
    ) as JsonSchema;
    // The whole point: v3 still shows the drift, so the correction stays legible.
    expect(v3Schema.properties.typographyPairing.enum).toHaveLength(6);
    expect(v3Schema.properties.motifs.items!.enum).toContain("plaid_restrained");
    expect(
      readFileSync(`${DOCS}model-prompts/history/design-intent.v3.system.md`, "utf8"),
    ).toContain("design_intent_v3");
  });

  it("preserve the v4 pre-provider draft rather than relabelling it", () => {
    // `docs/phase-4b-plan.md`, Part IV, "The version rule": if T21 changes model-visible text,
    // prompt and schema versions bump together, "the previous asset is preserved in `history/`,
    // and old bytes are never relabelled as the new version". v4 is the draft no model was ever
    // sent, and it is the artifact that makes the v5 diff reviewable.
    const v4Prompt = readFileSync(
      `${DOCS}model-prompts/history/design-intent.v4.system.md`,
      "utf8",
    );
    expect(v4Prompt).toContain("**Prompt version:** `design_intent_v4`");
    // The three inputs the draft addressed and this call has never had. Their presence here, and
    // their absence from the live prompt below, is the correction in one pair of assertions.
    for (const absent of ["redesignFeedback", "priorConceptNames", "priorIntentSignatures"]) {
      expect(v4Prompt).toContain(absent);
    }
    const v4Schema = JSON.parse(
      readFileSync(`${DOCS}model-schemas/history/design-intent.v4.schema.json`, "utf8"),
    ) as JsonSchema;
    expect(v4Schema.title).toContain("design_intent_schema_v4");
    // The implementer-directed sentence that shipped to the model, kept where it can be seen.
    expect(v4Schema.properties.dominant?.description ?? "").toBe("");
    expect(JSON.stringify(v4Schema)).toContain("Enforce with post-schema semantic validation");
    expect(
      readFileSync(`${DOCS}model-schemas/history/design-intent.v4.wire.schema.json`, "utf8"),
    ).toContain("design_intent_schema_v4");
  });
});

describe("the v5 prompt speaks Revision 6, and speaks to the inputs this call has", () => {
  it("says family, never archetype, outside its own changelog note", () => {
    const body = prompt
      .split("\n")
      .filter((l) => !l.startsWith("_v5 is the first") && !l.includes("replaces `archetype`"))
      .join("\n");
    expect(body.toLowerCase()).not.toContain("archetype");
  });

  it("names the page system as compiler-owned and structure as the composition call's", () => {
    expect(prompt).toMatch(/page system[\s\S]{0,200}the \*\*compiler\*\* resolves/i);
    expect(prompt).toMatch(/composition call\*\*\s+authors after you/i);
  });

  it("keeps the creative responsibilities it always had", () => {
    expect(prompt).toContain("exactly the assigned family");
    expect(prompt).toContain("one of the pairings offered in the assignment block");
    expect(prompt).toContain("They are **requests, not placements.**");
  });

  it("names the assigned hierarchy, which the schema deliberately does not narrow", () => {
    // `src/lib/ai/design-intent/narrowing.ts` narrows `composition.hierarchy` by *family*, so the
    // enum admits hierarchies the planner did not assign — and `docs/model-contracts.md §4.7`
    // checks hierarchy against the assignment under `assignmentConformance`. The prompt is the
    // only place that requirement can reach the model, so a prompt that did not state it would
    // be grading the model on something it was never told.
    expect(prompt).toContain("`composition.hierarchy` — exactly the assigned hierarchy");
    expect(prompt).toContain("`composition.hierarchy` is exactly the assigned hierarchy");
  });

  it("scopes the no-invented-facts rule to facts, so it cannot punish evocative language", () => {
    // `docs/phase-4b-plan.md`, "The recurring lesson": do not build a prompt requirement that
    // punishes correct behaviour. A blanket ban on naming a place would fail a concept called
    // `Lantern Season` for evoking one, which is the work rather than a violation of it.
    expect(prompt).toContain("state no **fact about this event**");
    expect(prompt).toContain("Evocative language is not a fact");
    expect(prompt).toContain("could someone act on it as though it were true?");
  });

  it("states the authority split in terms that cannot be mistaken", () => {
    expect(prompt).toMatch(/`hostConstraints` \| \*\*AUTHORITATIVE/);
    expect(prompt).toMatch(/`creativeGuidance` \| \*\*ADVISORY/);
    expect(prompt).toContain("you may adopt it, evolve it, or set it aside.");
    expect(prompt).toContain("Departing from\nit is never a fault");
  });

  it("addresses no input this call does not receive", () => {
    // The v4 draft named three, and instructed the model to differentiate itself from concepts it
    // cannot see. `docs/phase-4b-plan.md §E`: the call receives the brief and its own assignment,
    // "and nothing else"; the three calls are blind and parallel.
    for (const absent of [
      "redesignFeedback",
      "priorConceptNames",
      "priorIntentSignatures",
      "suppliedFacts",
      "capabilities",
      "contentProfile",
      "forbiddenTokens",
    ]) {
      expect(prompt, `the v5 prompt names ${absent}, which this call never receives`).not.toContain(
        absent,
      );
    }
  });

  it("asks for no cross-sibling coordination, which would measure the planner", () => {
    // `docs/phase-4b-plan.md`, "The recurring lesson": a requirement the model cannot satisfy from
    // what it is given is a defect in prompt form, and crediting the model for planner-owned
    // separation measures the planner.
    expect(prompt).toContain("you must not try to guess, complement or avoid them");
    expect(prompt.toLowerCase()).not.toContain("differ from prior concepts");
    expect(prompt.toLowerCase()).not.toContain("prior signatures");
  });
});
