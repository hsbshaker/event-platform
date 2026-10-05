import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { cardDesignSchema, validateCardDesign } from "./design";
import type { CardDesign } from "./design";
import { RENDERINGS } from "./renderings";

const valid: CardDesign = {
  presentation: { name: "Little Bear", description: "A watercolour bear holding a balloon." },
  shape: "arch",
  layout: "art-top",
  artMode: "illustration",
  typography: {
    primary: "soft_fraunces_manrope",
    alternates: ["oldstyle_garamond_worksans", "heritage_caslon_karla"],
  },
  wording: { title: "A Little Bear Is Coming", invitationLine: "Please join us for a baby shower" },
  artBrief: {
    subject: "A small bear holding a red balloon",
    rendering: "painterly",
    aesthetic: "romantic",
    medium: "watercolour on cotton paper",
    mood: "tender and playful",
    palette: {
      description: "warm honey and dusty rose",
      colors: ["#F2D7A0", "#C98B8B", "#FFF8EE"],
    },
    texture: "soft paper grain",
    avoid: ["text", "balloons with faces"],
  },
  refinement: "none",
};

const clone = () => structuredClone(valid) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fails(raw: unknown, kind: "schema" | "compatibility", options = {}) {
  const r = validateCardDesign(raw, options);
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error("unreachable");
  expect(r.kind).toBe(kind);
  expect(r.problems.length).toBeGreaterThan(0);
  return r.problems.join(" | ");
}

describe("validateCardDesign — schema", () => {
  it("accepts a valid design", () => {
    const r = validateCardDesign(valid);
    expect(r).toEqual({ ok: true, design: valid });
  });

  it("accepts a design with no alternates and no avoid list", () => {
    const d = clone();
    d.typography.alternates = [];
    d.artBrief.avoid = [];
    expect(validateCardDesign(d).ok).toBe(true);
  });

  it("rejects an unknown key at any level", () => {
    const top = clone();
    top.css = "color: red";
    expect(fails(top, "schema")).toMatch(/css/);
    const nested = clone();
    nested.wording.fontSize = 12;
    expect(fails(nested, "schema")).toMatch(/wording.*fontSize/);
  });

  it("rejects a bad enum", () => {
    const d = clone();
    d.layout = "collage";
    expect(fails(d, "schema")).toMatch(/layout/);
    const p = clone();
    p.typography.primary = "comic_sans";
    expect(fails(p, "schema")).toMatch(/typography.primary/);
  });

  it("rejects a title that is too long or too short", () => {
    const long = clone();
    long.wording.title = "x".repeat(41);
    expect(fails(long, "schema")).toMatch(/wording.title/);
    const short = clone();
    short.wording.invitationLine = "Join us";
    expect(fails(short, "schema")).toMatch(/wording.invitationLine/);
  });

  it("rejects a bad hex colour and the wrong number of colours", () => {
    const bad = clone();
    bad.artBrief.palette.colors = ["#F2D7A0", "red", "#FFF8EE"];
    expect(fails(bad, "schema")).toMatch(/palette.colors/);
    const few = clone();
    few.artBrief.palette.colors = ["#F2D7A0", "#C98B8B"];
    expect(fails(few, "schema")).toMatch(/palette.colors/);
    const many = clone();
    many.artBrief.palette.colors = Array(6).fill("#F2D7A0");
    expect(fails(many, "schema")).toMatch(/palette.colors/);
  });

  it("rejects duplicate alternates and more than two", () => {
    const dup = clone();
    dup.typography.alternates = ["oldstyle_garamond_worksans", "oldstyle_garamond_worksans"];
    expect(fails(dup, "schema")).toMatch(/unique/);
    const three = clone();
    three.typography.alternates = [
      "oldstyle_garamond_worksans",
      "heritage_caslon_karla",
      "hc_bodoni_inter",
    ];
    expect(fails(three, "schema")).toMatch(/typography.alternates/);
  });

  it("rejects missing fields and non-objects", () => {
    const d = clone();
    delete d.artBrief;
    expect(fails(d, "schema")).toMatch(/artBrief/);
    fails(null, "schema");
    fails("a design", "schema");
  });
});

describe("validateCardDesign — rendering (card_design_schema_v2)", () => {
  it.each(RENDERINGS)("accepts the %s rendering", (rendering) => {
    const d = clone();
    d.artBrief.rendering = rendering;
    expect(validateCardDesign(d).ok).toBe(true);
  });

  it("rejects a missing rendering", () => {
    const d = clone();
    delete d.artBrief.rendering;
    expect(fails(d, "schema")).toMatch(/artBrief.rendering/);
  });

  it("rejects an unknown rendering", () => {
    for (const rendering of ["watercolour", "photo", "3d", "graphic", "craft", "", null]) {
      const d = clone();
      d.artBrief.rendering = rendering;
      expect(fails(d, "schema")).toMatch(/artBrief.rendering/);
    }
  });

  it("requires an aesthetic of 3–40 characters, free text", () => {
    const missing = clone();
    delete missing.artBrief.aesthetic;
    expect(fails(missing, "schema")).toMatch(/artBrief.aesthetic/);
    for (const aesthetic of ["ab", "x".repeat(41)]) {
      const d = clone();
      d.artBrief.aesthetic = aesthetic;
      expect(fails(d, "schema")).toMatch(/artBrief.aesthetic/);
    }
    for (const aesthetic of ["bold", "fashion-forward", "x".repeat(40)]) {
      const d = clone();
      d.artBrief.aesthetic = aesthetic;
      expect(validateCardDesign(d).ok).toBe(true);
    }
  });
});

describe("validateCardDesign — compatibility", () => {
  it("rejects a layout that does not support the shape", () => {
    const d = clone();
    d.layout = "corners";
    d.shape = "circle";
    expect(fails(d, "compatibility")).toMatch(/layout corners does not support shape circle/);
  });

  it("rejects an art mode the layout cannot carry", () => {
    const d = clone();
    d.artMode = "atmosphere";
    expect(fails(d, "compatibility")).toMatch(/art mode atmosphere is not compatible/);
  });

  it("rejects an alternate that repeats the primary", () => {
    const d = clone();
    d.typography.alternates = ["soft_fraunces_manrope"];
    expect(fails(d, "compatibility")).toMatch(/alternate repeats the primary/);
  });

  it("checks pairing categories only when compatibleCategories is given", () => {
    expect(validateCardDesign(valid).ok).toBe(true);
    expect(
      validateCardDesign(valid, { compatibleCategories: ["soft_serif", "oldstyle", "heritage"] })
        .ok,
    ).toBe(true);
    const problems = fails(valid, "compatibility", { compatibleCategories: ["soft_serif"] });
    expect(problems).toMatch(/oldstyle_garamond_worksans \(oldstyle\)/);
    expect(problems).toMatch(/heritage_caslon_karla \(heritage\)/);
    expect(problems).not.toMatch(/soft_fraunces_manrope/);
  });

  it("reports schema problems before compatibility problems", () => {
    const d = clone();
    d.layout = "corners";
    d.shape = "circle";
    d.wording.title = "";
    expect(fails(d, "schema")).not.toMatch(/does not support/);
  });
});

describe("validateCardDesign — refinement (card_design_schema_v3)", () => {
  it("requires refinement, one of none, part or whole", () => {
    const missing = clone();
    delete missing.refinement;
    expect(fails(missing, "schema")).toMatch(/refinement/);
    const unknown = clone();
    unknown.refinement = "sideways";
    expect(fails(unknown, "schema")).toMatch(/refinement/);
  });

  it("holds refinement to none when the call had no card being changed", () => {
    for (const refinement of ["part", "whole"]) {
      const d = clone();
      d.refinement = refinement;
      expect(fails(d, "compatibility")).toMatch(/refinement must be "none"/);
      expect(fails(d, "compatibility", { changing: false })).toMatch(/refinement must be "none"/);
      expect(validateCardDesign(d, { changing: true }).ok).toBe(true);
    }
    // A new idea is always allowed, with or without a card being changed.
    expect(validateCardDesign(valid, { changing: true }).ok).toBe(true);
  });
});

/** Constraint keywords the JSON schema and the zod schema must agree on. */
const KEYS = [
  "type",
  "enum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "pattern",
  "required",
  "additionalProperties",
] as const;

interface JsonSchemaNode {
  [keyword: string]: unknown;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
}

function compare(
  committed: JsonSchemaNode,
  generated: JsonSchemaNode,
  at: string,
  diffs: string[],
) {
  for (const key of KEYS) {
    const a = committed[key];
    const b = generated[key];
    const norm = (v: unknown) => (Array.isArray(v) && key === "required" ? [...v].sort() : v);
    if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b))) {
      diffs.push(`${at}.${key}: json=${JSON.stringify(a)} zod=${JSON.stringify(b)}`);
    }
  }
  if (committed.properties || generated.properties) {
    const names = new Set([
      ...Object.keys(committed.properties ?? {}),
      ...Object.keys(generated.properties ?? {}),
    ]);
    for (const n of names) {
      const c = committed.properties?.[n];
      const g = generated.properties?.[n];
      if (!c || !g) diffs.push(`${at}.${n}: present in only one schema`);
      else compare(c, g, `${at}.${n}`, diffs);
    }
  }
  if (committed.items || generated.items) {
    if (!committed.items || !generated.items) diffs.push(`${at}.items: present in only one schema`);
    else compare(committed.items, generated.items, `${at}[]`, diffs);
  }
}

describe("card-design.schema.json parity", () => {
  const file = path.join(process.cwd(), "docs/model-schemas/card-design.schema.json");
  const committed = JSON.parse(readFileSync(file, "utf8"));

  it("matches the zod schema's enums, bounds, patterns and strictness", () => {
    const generated = z.toJSONSchema(cardDesignSchema, {
      target: "draft-2020-12",
      io: "input",
    }) as JsonSchemaNode;
    const diffs: string[] = [];
    compare(committed, generated, "$", diffs);
    expect(diffs).toEqual([]);
  });

  it("keeps the alternates uniqueness rule on both sides", () => {
    expect(committed.properties.typography.properties.alternates.uniqueItems).toBe(true);
    const dup = clone();
    dup.typography.alternates = ["hc_bodoni_inter", "hc_bodoni_inter"];
    expect(cardDesignSchema.safeParse(dup).success).toBe(false);
  });
});
