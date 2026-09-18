/**
 * The committed DesignIntent schemas cannot drift from the contract they are generated from.
 *
 * `design_intent_schema_v3` is the reason this file exists: it was hand-written, drifted from the
 * production vocabulary in three ways at once, and stayed drifted for a whole revision
 * (`docs/model-contracts.md §5.1`, "v4 reconciliation"). `tests/unit/model-contract.test.ts`
 * detects that drift; generating the file from `contract.ts` makes it unrepresentable, which is
 * the practice `§2` already sets for the composition call — "generated from the same table. Never
 * hand-edit either."
 *
 * `UPDATE_SCHEMAS=1` rewrites them (`npm run schemas:design-intent`); otherwise this fails.
 *
 * Acceptance criteria: N/A — internal contract hygiene, no product behaviour change.
 * `docs/model-contracts.md §2` (versioned assets, generated schemas never hand-edited), `§3`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DESIGN_INTENT_SCHEMA_VERSION } from "@/lib/ai/versions";
import { MOTIF_CATALOG } from "@/lib/renderer/compile/motifs";
import { FAMILY_KEYS, TONES, TYPOGRAPHY_KEYS } from "@/lib/renderer/vocabulary";

import type { SiblingAssignment } from "@/lib/renderer/planner";

import { buildSchemaFiles, SCHEMA_FILES, serializeSchema } from "./schemas";
import { narrowedWireSchema, strictWireSchema, UNSUPPORTED_KEYWORDS } from "./wire-schema";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const built = buildSchemaFiles();

if (process.env.UPDATE_SCHEMAS === "1") {
  for (const [key, relative] of Object.entries(SCHEMA_FILES)) {
    writeFileSync(
      path.join(ROOT, relative),
      serializeSchema(built[key as keyof typeof SCHEMA_FILES]),
    );
  }
}

type JsonSchema = Record<string, unknown>;
const properties = built.response.properties as Record<string, JsonSchema>;

describe("design intent schemas", () => {
  for (const [key, relative] of Object.entries(SCHEMA_FILES)) {
    it(`${relative} matches the contract`, () => {
      const onDisk = readFileSync(path.join(ROOT, relative), "utf8");
      expect(onDisk).toBe(serializeSchema(built[key as keyof typeof SCHEMA_FILES]));
    });
  }

  it("carries the eight response fields named by §5.1, and no others", () => {
    expect(Object.keys(properties)).toEqual([
      "family",
      "tonalDirection",
      "palette",
      "typographyPairing",
      "density",
      "composition",
      "motifs",
      "presentation",
    ]);
    expect(built.response.required).toEqual(Object.keys(properties));
    expect(built.response.additionalProperties).toBe(false);
  });

  it("offers the production vocabulary, not a copy of it", () => {
    expect(properties.family.enum).toEqual([...FAMILY_KEYS]);
    expect(properties.tonalDirection.enum).toEqual([...TONES]);
    expect(properties.typographyPairing.enum).toEqual([...TYPOGRAPHY_KEYS]);
    expect(properties.typographyPairing.enum).toHaveLength(12);
    const motifs = (properties.motifs.items as JsonSchema).enum as string[];
    expect([...motifs].sort()).toEqual(Object.keys(MOTIF_CATALOG).sort());
    expect(motifs).toHaveLength(7);
  });

  it("is stamped with the schema version the constants declare", () => {
    expect(DESIGN_INTENT_SCHEMA_VERSION).toBe("design_intent_schema_v6");
    expect(built.response.title).toContain(DESIGN_INTENT_SCHEMA_VERSION);
    expect(built.wire.title).toContain(DESIGN_INTENT_SCHEMA_VERSION);
  });

  it("keeps the bounds a provider schema can express", () => {
    const palette = properties.palette.properties as Record<string, JsonSchema>;
    expect(palette.colors.minItems).toBe(3);
    expect(palette.colors.maxItems).toBe(5);
    expect(palette.colors.uniqueItems).toBe(true);
    expect((palette.colors.items as JsonSchema).pattern).toBe("^#[0-9A-F]{6}$");
    expect(palette.dominant.pattern).toBe("^#[0-9A-F]{6}$");
    expect(properties.motifs.maxItems).toBe(3);
    expect(properties.motifs.uniqueItems).toBe(true);
  });

  it("the wire projection is a legal strict structured-output schema", () => {
    // Checked structurally rather than by eyeballing the emitted file, because the reduction is
    // what makes the call legal at all. Mirrors the Event Identity check.
    const problems: string[] = [];

    const walk = (node: unknown, at: string): void => {
      if (Array.isArray(node)) {
        node.forEach((child, i) => walk(child, `${at}[${i}]`));
        return;
      }
      if (node === null || typeof node !== "object") return;
      const schema = node as JsonSchema;

      for (const key of Object.keys(schema)) {
        if (UNSUPPORTED_KEYWORDS.has(key))
          problems.push(`${at}.${key} is not allowed in strict mode`);
      }

      if (schema.type === "object") {
        const props = (schema.properties ?? {}) as JsonSchema;
        const required = (schema.required ?? []) as string[];
        if (schema.additionalProperties !== false) {
          problems.push(`${at} must set additionalProperties: false`);
        }
        const missing = Object.keys(props).filter((p) => !required.includes(p));
        if (missing.length > 0) {
          problems.push(`${at} must require every property; missing ${missing.join(", ")}`);
        }
      }

      for (const [key, value] of Object.entries(schema)) walk(value, `${at}.${key}`);
    };

    walk(strictWireSchema(), "$");
    expect(problems).toEqual([]);
  });

  it("names no recipe, silhouette, template or archetype", () => {
    // The Library Boundary Invariant reaches the model-visible text too: a fixture identifier in
    // a description is a creative decision variable offered to the model (`CLAUDE.md §5.1`).
    const serialized = JSON.stringify(built).toLowerCase();
    for (const word of ["archetype", "silhouette", "recipe", "template", "surfaceplan"])
      expect(serialized.includes(word), `schema mentions "${word}"`).toBe(false);
  });

  it("offers no page system, and no per-node color, font, size or free-text field", () => {
    // `spec.md §7.8` and `§32 #12`: the model emits the six design fields plus presentation.
    // `src/lib/renderer/design-intent.ts` records that the page system is compiler-owned.
    const serialized = JSON.stringify(built.response).toLowerCase();
    for (const word of ["pagesystem", "borderlanguage", "cardlanguage", "buttonlanguage", "css"])
      expect(serialized.includes(word), `schema mentions "${word}"`).toBe(false);
  });
});

/* ------------------------------------------------------------------ description hygiene */

/** A real assignment, so the schema walked below is one production would actually send. */
const SENT_FOR: SiblingAssignment = {
  family: "editorial",
  tonalDirection: "mid",
  typographyCategory: "oldstyle",
  hierarchy: "editorial",
  typographyPairings: ["oldstyle_garamond_worksans", "oldstyle_cormorant_figtree"],
};

/**
 * Every description the model actually reads, addressed by path.
 *
 * The same walker `v5-proofs.test.ts` uses for Event Identity, over `narrowedWireSchema()` rather
 * than the committed file. `strictWireSchema()` strips the keywords a provider rejects and
 * `description` is deliberately **not** one of them, so every `.describe()` and
 * `meta({description})` string in `contract.ts` goes on the wire. That is how Phase 4A's leak 4
 * reached production, and it is why `corpus.ts` declares the wire schema a model-visible surface.
 *
 * The committed file's own `$id`/`title`/`description` header is deliberately **not** walked: it is
 * added by `buildSchemaFiles()` for a human reading the repository and is not part of what
 * `narrowedWireSchema()` builds, so it may say "do not hand-edit" and name the application
 * validator. Walking the sent schema rather than the committed one is what makes that distinction
 * true rather than assumed.
 */
function wireDescriptions(schema: JsonSchema): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (node: unknown, at: string) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.description === "string") out[at] = record.description;
    for (const key of Object.keys(record)) walk(record[key], `${at}/${key}`);
  };
  walk(schema, "");
  return out;
}

describe("what the shipped descriptions may say", () => {
  const WIRE_DESC = wireDescriptions(narrowedWireSchema(SENT_FOR) as JsonSchema);

  it("carries no header of its own — the sent schema is properties, not provenance", () => {
    // The committed file's header is repository metadata. If it ever started reaching the wire,
    // every rule below would have to cover it, so its absence is asserted rather than assumed.
    expect(WIRE_DESC[""]).toBeUndefined();
  });

  it("ships descriptions at all, so the checks below are not vacuous", () => {
    expect(Object.keys(WIRE_DESC).length).toBeGreaterThan(5);
  });

  /**
   * No description may address an implementer.
   *
   * `v4` shipped "Must exactly equal one member of colors. **Enforce with post-schema semantic
   * validation.**" — an instruction to whoever builds the pipeline, handed to a model that has no
   * post-schema stage, on the surface declared model-visible precisely because everything on it is
   * read by the model. It also disclosed internal validation topology for no benefit. Nothing
   * caught it, because Event Identity had this check and DesignIntent did not.
   */
  it("addresses the model, never an implementer or the pipeline's internals", () => {
    const forbidden = [
      /\benforce\b/i,
      /post-schema/i,
      /semantic validation/i,
      /\bvalidator\b/i,
      /application code/i,
      /\bimplementer\b/i,
      /do not hand-edit/i,
      /\bTODO\b|\bFIXME\b/,
    ];
    const offenders: string[] = [];
    for (const [at, description] of Object.entries(WIRE_DESC))
      for (const pattern of forbidden)
        if (pattern.test(description)) offenders.push(`${at}: ${pattern} — "${description}"`);
    expect(offenders).toEqual([]);
  });

  /**
   * No description may describe a narrowing that does not exist.
   *
   * `v4` told the model that runtime narrowing "may further constrain" the motif catalog. It does
   * not — `narrowing.ts` narrows families, tones, pairings and hierarchies, and never motifs — and
   * the same phantom catalogue in the prompt was one of the reasons `v4` was untrue rather than
   * merely dated. A description that promises a constraint the request never applies teaches the
   * model to reason about a rule it will not be given.
   */
  it("claims narrowing only for the four fields that are actually narrowed", () => {
    const narrowed = ["family", "tonalDirection", "typographyPairing", "hierarchy"];
    for (const [at, description] of Object.entries(WIRE_DESC)) {
      if (!/narrow/i.test(description)) continue;
      expect(
        narrowed.some((field) => at.endsWith(`/${field}`)),
        `${at} claims narrowing, but only ${narrowed.join(", ")} are narrowed`,
      ).toBe(true);
    }
    expect(WIRE_DESC["/properties/motifs"]).not.toMatch(/narrow/i);
  });

  /**
   * A description must stay true in the schema actually sent, not only in the committed superset.
   *
   * `v4`'s hierarchy description ended "the four listed here are the whole vocabulary" — true of
   * this file, false of `narrowedWireSchema()`, where the enum is one value and there is no list of
   * four in front of the model. The committed superset is documentation; the narrowed projection is
   * what the model reads.
   */
  it("says nothing about a list of options that the narrowed schema contradicts", () => {
    const at = "/properties/composition/properties/hierarchy";
    const narrowed = narrowedWireSchema(SENT_FOR) as JsonSchema;
    const hierarchy = (
      ((narrowed.properties as Record<string, JsonSchema>).composition as JsonSchema)
        .properties as Record<string, JsonSchema>
    ).hierarchy;
    expect(hierarchy.enum).toEqual([SENT_FOR.hierarchy]);
    expect(WIRE_DESC[at]).toBeDefined();
    expect(WIRE_DESC[at]).not.toMatch(/\bfour\b|listed here/i);
  });
});
