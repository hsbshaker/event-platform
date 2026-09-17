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

describe("DesignIntent schema v5 ↔ production vocabulary", () => {
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
    // `§5.1`'s paired rule: model-visible text moved on both sides at T21, so both versions moved.
    expect(DESIGN_INTENT_PROMPT_VERSION).toBe("design_intent_v5");
    expect(DESIGN_INTENT_SCHEMA_VERSION).toBe("design_intent_schema_v5");
    expect(prompt).toContain("**Prompt version:** `design_intent_v5`");
    expect(designIntentSchema.title).toContain("design_intent_schema_v5");
  });

  it("preserve v3 and v4 rather than rewriting them", () => {
    const v3Schema = JSON.parse(
      readFileSync(`${DOCS}model-schemas/history/design-intent.v3.schema.json`, "utf8"),
    ) as JsonSchema;
    // The whole point: v3 still shows the drift, so the correction stays legible.
    expect(v3Schema.properties.typographyPairing.enum).toHaveLength(6);
    expect(v3Schema.properties.motifs.items!.enum).toContain("plaid_restrained");
    expect(
      readFileSync(`${DOCS}model-prompts/history/design-intent.v3.system.md`, "utf8"),
    ).toContain("design_intent_v3");

    // v4 is kept as the bytes it was, never relabelled: it was a pre-provider draft, and the
    // history is what makes "no provider call was ever attributed to it" checkable.
    const v4Prompt = readFileSync(
      `${DOCS}model-prompts/history/design-intent.v4.system.md`,
      "utf8",
    );
    expect(v4Prompt).toContain("**Prompt version:** `design_intent_v4`");
    const v4Schema = JSON.parse(
      readFileSync(`${DOCS}model-schemas/history/design-intent.v4.schema.json`, "utf8"),
    ) as JsonSchema;
    expect(v4Schema.title).toContain("design_intent_schema_v4");
    expect(
      JSON.parse(
        readFileSync(`${DOCS}model-schemas/history/design-intent.v4.wire.schema.json`, "utf8"),
      ).title,
    ).toContain("design_intent_schema_v4");
  });
});

describe("the v5 prompt matches the contract it is sent under", () => {
  const body = prompt
    .split("\n")
    .filter((line) => !line.startsWith("_v5 is the first version"))
    .join("\n");

  it("says family, never archetype", () => {
    expect(body.toLowerCase()).not.toContain("archetype");
  });

  it("names the page system as compiler-owned and structure as the composition call's", () => {
    expect(prompt).toMatch(/page system[\s\S]{0,200}resolved by the compiler/i);
    expect(prompt).toMatch(/composition call (that runs after|authors)/i);
  });

  it("names all four assigned dimensions, hierarchy among them", () => {
    // `hierarchy` is planner-assigned, the frozen 4C harness gates an exact match on it, and
    // runtime narrowing offers only the assigned value. A prompt that presented it as a choice
    // would be describing a contract that does not exist.
    expect(prompt).toMatch(/`hierarchy`[^\n]*inside `composition`/);
    expect(prompt).toMatch(/four decisions/i);
  });

  it("states the authority split the evidence turns on", () => {
    // `docs/phase-4b-plan.md §3.2` and `docs/model-contracts.md §4.7`: every host constraint is
    // authoritative whatever its subject, and creative guidance may be departed from freely.
    expect(prompt).toMatch(/`hostConstraints` is \*\*authoritative\*\*/);
    expect(prompt).toMatch(/`creativeGuidance` is \*\*advisory\*\*/);
    expect(prompt).toMatch(/departing from it costs you nothing/);
    // And the stage-scope half: a constraint this object cannot express is still binding, and its
    // absence here is not an omission to be papered over with an invented field.
    expect(prompt).toMatch(/belongs to a later stage, it is still binding there/);
  });

  it("asks for a concept name in natural orthography, never for ASCII", () => {
    expect(prompt).toMatch(
      /natural title-style capitalisation where the language or script has case/,
    );
    expect(prompt).toMatch(/accents and marks/);
    // The specific instruction item B forbids: nothing may tell the model to avoid accents.
    expect(prompt.toLowerCase()).not.toMatch(/avoid (accents|diacritics)|ascii|plain letters only/);
  });

  it("describes only the two channels this call receives", () => {
    // `docs/phase-4b-plan.md §E`: the brief, plus only this concept's own assignment. v4 named
    // three channels that do not exist and gave two whole sections to behaviour keyed off them.
    for (const absent of [
      "redesignFeedback",
      "priorConceptNames",
      "priorIntentSignatures",
      "allowedMotifs",
      "allowedTypographyPairings",
      "contentProfile",
      "capabilities",
    ])
      expect(prompt, `prompt still names \`${absent}\``).not.toContain(absent);
  });

  it("keeps the creative responsibilities it always had", () => {
    expect(prompt).toMatch(/Motifs are \*\*requests, not placements\*\*/);
    expect(prompt).toMatch(/creative source colours only/i);
    expect(prompt).toMatch(/three to five unique uppercase six-digit hex/i);
  });

  it("carries no recipe, silhouette or template identifier", () => {
    // `CLAUDE.md §5.1`, the Library Boundary Invariant, reaches model-visible text too.
    for (const word of ["silhouette", "recipe", "template", "surfacePlan", "heroKeys"])
      expect(prompt.toLowerCase().includes(word.toLowerCase()), word).toBe(false);
  });
});
