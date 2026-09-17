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
  it("are at v4, and the prompt and schema say so too", () => {
    expect(DESIGN_INTENT_PROMPT_VERSION).toBe("design_intent_v4");
    expect(DESIGN_INTENT_SCHEMA_VERSION).toBe("design_intent_schema_v4");
    expect(prompt).toContain("**Prompt version:** `design_intent_v4`");
    expect(designIntentSchema.title).toContain("design_intent_schema_v4");
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
});

describe("the v4 prompt speaks Revision 6", () => {
  it("says family, never archetype, outside its own changelog note", () => {
    const body = prompt
      .split("\n")
      .filter((l) => !l.startsWith("_v4 reconciles") && !l.includes("replaces `archetype`"))
      .join("\n");
    expect(body.toLowerCase()).not.toContain("archetype");
  });

  it("names the page system as compiler-owned and structure as the composition call's", () => {
    expect(prompt).toMatch(/page system[\s\S]{0,200}resolved by the compiler/i);
    expect(prompt).toMatch(/composition call (that runs after|authors)/i);
  });

  it("keeps the creative responsibilities it always had", () => {
    expect(prompt).toContain("`family` MUST exactly equal `assignment.family`");
    expect(prompt).toContain("`typographyPairing` MUST come from `allowedTypographyPairings`");
    expect(prompt).toContain("Motifs are requests, not placements.");
  });
});
