import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import identityJson from "../../../docs/model-schemas/event-identity.schema.json";

import {
  ARTWORK_INSPECTION_JSON_SCHEMA,
  ARTWORK_INSPECTION_PROMPT,
  artworkInspectionSchema,
} from "./artwork-inspection";
import {
  eventIdentitySchema,
  HOST_CONCEPTS,
  storedEventIdentitySchema,
  TYPOGRAPHY_CATEGORIES,
} from "./event-identity";
import type { EventIdentity } from "./event-identity";
import { extractedFactsSchema, FACT_EXTRACTION_JSON_SCHEMA } from "./fact-extraction";
import { SYSTEM_PROMPTS, systemPrompt } from "./prompts.server";

/**
 * The application validates every structured response against the canonical schemas
 * (`docs/model-contracts.md §3`, `spec.md §32 #19`). These tests hold each zod validator to the JSON
 * Schema the provider is sent, and each ported prompt to its source, so they cannot drift apart.
 */

const ROOT = process.cwd();

interface Node {
  [keyword: string]: unknown;
  properties?: Record<string, Node>;
  items?: Node;
}

/** Keywords both schemas must agree on; absent bounds of zero count as equal. */
function compare(json: Node, zod: Node, at: string, diffs: string[]) {
  const norm = (key: string, v: unknown) => {
    if ((key === "minLength" || key === "minItems") && (v === undefined || v === 0)) return 0;
    if ((key === "required" || key === "enum") && Array.isArray(v)) return [...v].sort();
    if (key === "type" && Array.isArray(v)) return [...v].sort();
    return v;
  };
  for (const key of [
    "type",
    "enum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "pattern",
    "required",
    "additionalProperties",
  ]) {
    const a = JSON.stringify(norm(key, json[key]));
    const b = JSON.stringify(norm(key, zod[key]));
    if (a !== b) diffs.push(`${at}.${key}: json=${a} zod=${b}`);
  }
  const names = new Set([
    ...Object.keys(json.properties ?? {}),
    ...Object.keys(zod.properties ?? {}),
  ]);
  for (const n of names) {
    const j = json.properties?.[n];
    const g = zod.properties?.[n];
    if (!j || !g) diffs.push(`${at}.${n}: present in only one schema`);
    else compare(j, g, `${at}.${n}`, diffs);
  }
  if (json.items || zod.items) {
    if (!json.items || !zod.items) diffs.push(`${at}.items: present in only one schema`);
    else compare(json.items, zod.items, `${at}[]`, diffs);
  }
}

/** zod renders `.nullable()` strings as anyOf; the JSON Schema uses a type list. */
function flattenNullable(node: Node): Node {
  if (Array.isArray(node.anyOf)) {
    const types = (node.anyOf as Node[]).map((n) => n.type);
    return { type: types };
  }
  const out: Node = { ...node };
  if (node.properties) {
    out.properties = Object.fromEntries(
      Object.entries(node.properties).map(([k, v]) => [k, flattenNullable(v)]),
    );
  }
  if (node.items) out.items = flattenNullable(node.items);
  return out;
}

function diff(json: unknown, schema: z.ZodType): string[] {
  const generated = flattenNullable(z.toJSONSchema(schema, { io: "input" }) as Node);
  const diffs: string[] = [];
  compare(json as Node, generated, "$", diffs);
  return diffs;
}

const IDENTITY: EventIdentity = {
  hostConcept: "cues",
  creativeDirection: "A sunlit Italian lemon grove rendered with linen calm and ceramic detail.",
  toneKeywords: ["sunlit", "refined", "relaxed"],
  colorsExplicitlyConstrained: false,
  paletteIntent: {
    requiredColors: [],
    preferredColors: ["olive"],
    avoidColors: [],
    dominanceNotes: "",
  },
  tonalIntent: "Light and airy.",
  toneExplicitlyConstrained: false,
  compatibleTypographyCategories: ["oldstyle"],
  visualMotifs: [],
  textureDirection: "gouache",
  typographyDirection: "Elegant serif.",
  copyTone: "warm",
  designConstraints: [],
  inspirationSummary: "No visual inspiration supplied.",
};

describe("Event Identity validator (event_identity_schema_v6)", () => {
  it("matches docs/model-schemas/event-identity.schema.json", () => {
    expect(diff(identityJson, eventIdentitySchema)).toEqual([]);
  });

  it("enforces the uniqueness the strict mode cannot", () => {
    const uniqueFields = (node: Node, at: string, out: string[]) => {
      if (node.uniqueItems) out.push(at);
      for (const [k, v] of Object.entries(node.properties ?? {}))
        uniqueFields(v, `${at}.${k}`, out);
      return out;
    };
    const fields = uniqueFields(identityJson as Node, "$", []);
    expect(fields.length).toBeGreaterThan(0);
    for (const at of fields) {
      const keys = at.split(".").slice(1);
      const copy = structuredClone(IDENTITY) as Record<string, unknown>;
      let target = copy;
      for (const k of keys.slice(0, -1)) target = target[k] as Record<string, unknown>;
      const last = keys.at(-1)!;
      const sample =
        last === "compatibleTypographyCategories"
          ? "oldstyle"
          : last === "toneKeywords"
            ? "calm"
            : "olive";
      target[last] = last === "toneKeywords" ? [sample, sample, "warm"] : [sample, sample];
      expect(eventIdentitySchema.safeParse(copy).success, at).toBe(false);
    }
  });

  it("accepts a valid identity and rejects unknown keys", () => {
    expect(eventIdentitySchema.safeParse(IDENTITY).success).toBe(true);
    expect(eventIdentitySchema.safeParse({ ...IDENTITY, venue: "Positano" }).success).toBe(false);
  });

  it("requires hostConcept from the model, decided first (owner decisions, 2026-10-06)", () => {
    const withoutConcept: Partial<EventIdentity> = { ...IDENTITY };
    delete withoutConcept.hostConcept;
    expect(eventIdentitySchema.safeParse(withoutConcept).success).toBe(false);
    expect(eventIdentitySchema.safeParse({ ...IDENTITY, hostConcept: "maybe" }).success).toBe(
      false,
    );
    for (const hostConcept of HOST_CONCEPTS) {
      expect(eventIdentitySchema.safeParse({ ...IDENTITY, hostConcept }).success).toBe(true);
    }
    const json = identityJson as { required: string[]; properties: Record<string, Node> };
    expect(Object.keys(json.properties)[0]).toBe("hostConcept");
    expect(json.required[0]).toBe("hostConcept");
  });

  it("reads back an identity persisted before hostConcept, and nothing looser", () => {
    const legacy: Partial<EventIdentity> = { ...IDENTITY };
    delete legacy.hostConcept;
    expect(storedEventIdentitySchema.safeParse(legacy).success).toBe(true);
    expect(storedEventIdentitySchema.safeParse(IDENTITY).success).toBe(true);
    expect(storedEventIdentitySchema.safeParse({ ...legacy, venue: "Positano" }).success).toBe(
      false,
    );
    expect(storedEventIdentitySchema.safeParse({ ...IDENTITY, hostConcept: "x" }).success).toBe(
      false,
    );
  });

  it("ranks exactly the catalog's typography categories", () => {
    const schemaEnum = (identityJson as { properties: Record<string, Node> }).properties
      .compatibleTypographyCategories.items!.enum as string[];
    expect([...TYPOGRAPHY_CATEGORIES].sort()).toEqual([...schemaEnum].sort());
  });
});

describe("fact extraction (fact_extraction_schema_v1)", () => {
  it("validates with the same schema the provider is sent", () => {
    expect(diff(FACT_EXTRACTION_JSON_SCHEMA, extractedFactsSchema)).toEqual([]);
  });

  it("is the Phase 3 schema", () => {
    const source = readFileSync(path.join(ROOT, "scripts/phase-3/run.mjs"), "utf8");
    const block = source.match(/const FACTS_SCHEMA = (\{[\s\S]*?\n\});/)![1];
    const phase3 = new Function(`return (${block});`)();
    expect(FACT_EXTRACTION_JSON_SCHEMA).toEqual(phase3);
  });
});

describe("artwork inspection (card_art_inspection_v2)", () => {
  const source = readFileSync(path.join(ROOT, "scripts/phase-3/run.mjs"), "utf8");
  const PHASE_3_MOCKUP =
    "- isMockup: true if the image is a photograph or mockup of a card, paper or envelope (an object on a surface, with hands, shadows or a frame around it) rather than flat artwork filling the canvas.";
  const V2_MOCKUP =
    "- isMockup: true only if the image shows a card, invitation, sheet of paper or envelope as an object — on a surface, held in hands, with its own shadow or a frame around it — rather than artwork filling the canvas. A photograph of a scene, interior, landscape, objects, food or materials that fills the canvas is NOT a mockup.";
  const V2_PERSON =
    "- hasPerson: true if any person, human face, hands or human body appears, realistic or stylised. Animals and toy animals do not count.";

  it("is the Phase 3 prompt with the mockup line narrowed and the person line added, nothing else", () => {
    const phase3 = source.match(/const ART_CHECK_PROMPT = `([\s\S]*?)`;/)![1];
    expect(phase3).toContain(PHASE_3_MOCKUP);
    expect(ARTWORK_INSPECTION_PROMPT).toBe(
      phase3.replace(PHASE_3_MOCKUP, `${V2_MOCKUP}\n${V2_PERSON}`),
    );
  });

  it("is the Phase 3 schema plus hasPerson, and validates with it", () => {
    const block = source.match(/const ART_CHECK_SCHEMA = (\{[\s\S]*?\n\});/)![1];
    const phase3 = new Function(`return (${block});`)();
    expect(ARTWORK_INSPECTION_JSON_SCHEMA).toEqual({
      ...phase3,
      required: [
        "hasText",
        "textDescription",
        "hasLogoOrBrandMark",
        "isMockup",
        "hasPerson",
        "description",
      ],
      properties: { ...phase3.properties, hasPerson: { type: "boolean" } },
    });
    expect(diff(ARTWORK_INSPECTION_JSON_SCHEMA, artworkInspectionSchema)).toEqual([]);
  });

  it("parses hasPerson, and requires it", () => {
    const found = {
      hasText: false,
      textDescription: "",
      hasLogoOrBrandMark: false,
      isMockup: false,
      hasPerson: true,
      description: "Two hands holding a teacup.",
    };
    expect(artworkInspectionSchema.parse(found).hasPerson).toBe(true);
    const without: Partial<typeof found> = { ...found };
    delete without.hasPerson;
    expect(artworkInspectionSchema.safeParse(without).success).toBe(false);
  });
});

describe("system prompts", () => {
  it.each(Object.keys(SYSTEM_PROMPTS) as (keyof typeof SYSTEM_PROMPTS)[])(
    "%s is read from docs/model-prompts and declares the recorded version",
    (name) => {
      const { file, version } = SYSTEM_PROMPTS[name];
      const text = systemPrompt(name);
      expect(text).toBe(readFileSync(path.join(ROOT, "docs/model-prompts", file), "utf8"));
      expect(text).toContain(`**Prompt version:** \`${version}\``);
    },
  );
});

/**
 * The rules the owner decided on 2026-10-06 are in the prompts the models are sent, under the
 * versions recorded with every run (`docs/model-contracts.md §2`).
 */
describe("prompt rules: the host's title and their own concept", () => {
  it("fact_extraction_v2 names the title rule, its examples and its exclusions", () => {
    const text = systemPrompt("structured_extraction");
    expect(text).toContain("**Prompt version:** `fact_extraction_v2`");
    expect(text).toContain('right after the word "called", "named" or "titled"');
    expect(text).toContain("**without** the quotation marks around it");
    expect(text).toContain("`The Notorious ONE`");
    expect(text).toContain("`Taco ’Bout a Baby`");
    for (const exclusion of [
      "**A quoted vibe or style word**",
      "**Words meant for something in the scene**",
      "**A saying, a quotation or a song lyric**",
      "**The bare name of a brand, show, film, game or character the party is themed on**",
      "a “Bluey”",
      "a banner that says “Oh Baby”",
    ]) {
      expect(text).toContain(exclusion);
    }
    expect(text).toContain(
      "When you are unsure whether something is the event's own name, return null.",
    );
  });

  it("event_identity_v7 decides hostConcept first, keeps listed motifs, and gates the seed", () => {
    const text = systemPrompt("event_identity");
    expect(text).toContain("**Prompt version:** `event_identity_v7`");
    expect(text).toContain("**Schema version:** `event_identity_schema_v6`");
    expect(text).toContain("### `hostConcept`\nDecide this first");
    for (const signal of [
      "a named format",
      "an explicit list of motifs",
      "a decade or era",
      "a named aesthetic",
    ]) {
      expect(text).toContain(signal);
    }
    expect(text).toContain("**Every motif the host explicitly lists is kept.**");
    expect(text).toContain("say so in `designConstraints`");
    expect(text).toContain("gold jewellery, chains and crowns on a hip-hop or album-cover homage");
    expect(text).toContain("When `hostConcept` is `cues` or `own`");
    expect(text).toContain("never the person's name, likeness or signature portrait");
  });

  it("card_design_v6 keeps the title out of the brief and reads a named format as a style signal", () => {
    const text = systemPrompt("card_design");
    expect(text).toContain("**Prompt version:** `card_design_v6`");
    expect(text).toContain("**The title never goes into the brief.**");
    expect(text).toContain("given in their description");
    expect(text).toContain(
      "or a named format — an album cover or\n  record sleeve, a poster, a magazine cover, a storybook page",
    );
    expect(text).toContain(
      "printed formats such\n  as album covers, record sleeves, posters, magazine covers and book covers",
    );
    expect(text).toContain('never "an album cover"');
    expect(text).toContain(
      "`suggestedRendering` is absent when the identity's `hostConcept` is `own`",
    );
  });

  it("card_design_v6 chooses a cover for bold briefs and named formats, top or bottom by the subject", () => {
    const text = systemPrompt("card_design");
    expect(text).toContain("**Schema version:** `card_design_schema_v4`");
    expect(text).toContain("**Cover layouts** (`cover-top`, `cover-bottom`)");
    expect(text).toContain("whenever the host names a format such as an album cover");
    expect(text).toContain(
      "Never choose one for a restrained, delicate, romantic or typography-led",
    );
    expect(text).toContain("Choose\n  `cover-top` when the subject is grounded");
    expect(text).toContain("choose `cover-bottom` when the subject hangs, rises or fills the sky");
  });
});
