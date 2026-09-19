/**
 * The CompositionTree schema boundary — invariant obligation row 9, CompositionTree half.
 *
 * `docs/model-contracts.md §2`: "The composition prompt's primitive spec and rules blocks are
 * generated from the validator's spec table; the JSON Schema is generated from the same table.
 * Never hand-edit either." Before this, `docs/model-schemas/composition.schema.json` was a
 * hand-written artifact that happened to agree with the language — which is exactly how the
 * DesignIntent schema drifted for a whole revision without anything noticing.
 *
 * These tests make the committed artifact genuinely derived: it must equal what the generator
 * produces from `NODE_SPEC`, and the generator's output must agree with the validator that judges
 * real model responses.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` and `Renderer
 * proof`; `spec.md §32` #14, #15.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { compositionJsonSchema } from "./json-schema";
import { NODE_SPEC, SECTION_SPEC } from "./spec";
import { ENUM } from "./tokens";
import { validateSchema } from "./validate-schema";

/* eslint-disable @typescript-eslint/no-explicit-any -- JSON Schema is untyped by nature. */
const COMMITTED = JSON.parse(
  readFileSync(
    new URL("../../../../docs/model-schemas/composition.schema.json", import.meta.url).pathname,
    "utf8",
  ),
) as any;
const generated = compositionJsonSchema() as any;
const L: any = createRequire(new URL("../../../../proof-b/", import.meta.url))("./library.js");
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("the committed schema is generated, not hand-maintained", () => {
  it("equals what the production spec table generates, byte for byte", () => {
    expect(COMMITTED).toEqual(generated);
    expect(JSON.stringify(COMMITTED)).toBe(JSON.stringify(generated));
  });

  it("names the production spec table as its source", () => {
    expect(COMMITTED.description).toContain("src/lib/renderer/composition/spec.ts");
    expect(COMMITTED.description).toContain("Never hand-edit");
  });
});

describe("the schema agrees with the production language", () => {
  it("defines exactly the 30 primitives, and nothing else", () => {
    const primitiveDefs = Object.keys(generated.$defs).filter(
      (k) => !["Node", "Section", "MotifRef"].includes(k),
    );
    expect(primitiveDefs.sort()).toEqual(Object.keys(NODE_SPEC).sort());
    expect(primitiveDefs).toHaveLength(30);
    expect(generated.$defs.Node.oneOf).toHaveLength(30);
  });

  /**
   * The artwork leaf is the *where*, never the *what* (`spec.md §7.6a #3`, `§32 #13`). The
   * schema is the gate the model is actually constrained by, so the absence of a placement or
   * asset field is asserted here rather than trusted to review.
   */
  it("gives Artwork a role and an extent, and no way to place or name an asset", () => {
    const art = generated.$defs.Artwork;
    expect(Object.keys(art.properties).sort()).toEqual(["extent", "role", "t"]);
    expect(art.required.sort()).toEqual(["role", "t"]);
    expect(art.additionalProperties).toBe(false);
    expect(art.properties.role.enum).toEqual([...ENUM.ArtworkRole]);
    expect(art.properties.extent.enum).toEqual([...ENUM.Extent]);

    for (const forbidden of [
      "url",
      "src",
      "asset",
      "assetId",
      "x",
      "y",
      "top",
      "left",
      "width",
      "height",
      "aspectRatio",
      "zIndex",
      "css",
      "className",
      "style",
      "subject",
      "medium",
      "prompt",
      "alt",
      "color",
    ])
      expect(art.properties[forbidden], `Artwork.${forbidden}`).toBeUndefined();
  });

  it("gives every primitive exactly the props the spec table declares", () => {
    for (const [name, spec] of Object.entries(NODE_SPEC)) {
      const def = generated.$defs[name];
      const expected = ["t", ...Object.keys(spec.props), ...(spec.children ? ["children"] : [])];
      expect(Object.keys(def.properties).sort(), name).toEqual(expected.sort());
      expect(def.additionalProperties, name).toBe(false);

      const required = [
        "t",
        ...Object.entries(spec.props)
          .filter(([, p]) => p.required)
          .map(([k]) => k),
        ...(spec.children ? ["children"] : []),
      ];
      expect([...def.required].sort(), `${name} required`).toEqual(required.sort());
    }
  });

  it("uses the language's own token enums, never a copy", () => {
    // Spot-check every enum-valued prop against `ENUM`/`SECTION_SPEC` rather than a literal list.
    for (const [name, spec] of Object.entries(NODE_SPEC))
      for (const [prop, ps] of Object.entries(spec.props))
        if (ps.enum)
          expect(generated.$defs[name].properties[prop].enum, `${name}.${prop}`).toEqual([
            ...ps.enum,
          ]);

    expect(generated.$defs.Section.properties.kind.enum).toEqual([...SECTION_SPEC.kind]);
    expect(generated.$defs.Section.properties.surface.enum).toEqual([...SECTION_SPEC.surface]);
    expect(generated.$defs.MotifRef.properties.id.enum).toEqual([...ENUM.MotifId]);
    expect(generated.$defs.MotifRef.properties.role.enum).toEqual([...ENUM.MotifRole]);
  });

  it("bounds children exactly where the validator does, and nowhere else", () => {
    for (const [name, spec] of Object.entries(NODE_SPEC)) {
      const children = generated.$defs[name].properties.children;
      if (!spec.children) {
        expect(children, `${name} has no children in the spec table`).toBeUndefined();
        continue;
      }
      expect(children.minItems, name).toBe(spec.children.min);
      expect(children.maxItems, name).toBe(spec.children.max);
    }
    // Section count is a structural limit, repaired deterministically — not a schema rejection.
    expect(generated.properties.sections.minItems).toBeUndefined();
    expect(generated.properties.sections.maxItems).toBeUndefined();
  });
});

describe("the schema carries no recipe, silhouette, template or archetype identifier", () => {
  it("mentions none of the forbidden words", () => {
    const serialized = JSON.stringify(COMMITTED).toLowerCase();
    for (const word of [
      "archetype",
      "silhouette",
      "recipe",
      "template",
      "surfaceplan",
      "herorecipe",
    ])
      expect(serialized.includes(word), `schema mentions "${word}"`).toBe(false);
  });

  it("mentions no legacy fixture id", () => {
    const serialized = JSON.stringify(COMMITTED);
    const ids = [
      ...(L.heroKeys as string[]),
      ...(L.heroKeys as string[]).map((k) => k.split(":")[0]),
      ...Object.keys(L.DETAILS),
      ...Object.keys(L.RSVPS),
      ...Object.keys(L.REGISTRIES),
      ...Object.keys(L.PLANS),
    ];
    for (const id of ids) expect(serialized.includes(id), `schema mentions "${id}"`).toBe(false);
  });
});

describe("the schema and the validator judge the same trees", () => {
  /** A minimal legal tree, built from the spec table's own required props. */
  const legal = {
    version: "composition_v1",
    sections: [
      {
        kind: "hero",
        surface: "base",
        root: { t: "Stack", children: [{ t: "EventTitle", emphasis: "display" }] },
      },
      { kind: "rsvp", surface: "base", root: { t: "Stack", children: [{ t: "RSVP" }] } },
    ],
  };

  it("accepts what the validator accepts", () => {
    expect(validateSchema(legal).ok).toBe(true);
    // And the schema's closed objects would too: every key used is a declared property.
    for (const section of legal.sections)
      for (const key of Object.keys(section))
        expect(Object.keys(generated.$defs.Section.properties)).toContain(key);
  });

  it("accepts an Artwork leaf, and rejects an unknown prop on it", () => {
    const withArt = {
      ...legal,
      sections: [
        {
          ...legal.sections[0],
          root: {
            t: "Stack",
            children: [{ t: "EventTitle" }, { t: "Artwork", role: "anchor", extent: "half" }],
          },
        },
        legal.sections[1],
      ],
    };
    expect(validateSchema(withArt).ok).toBe(true);

    const badProp = {
      ...legal,
      sections: [
        {
          ...legal.sections[0],
          root: {
            t: "Stack",
            children: [
              { t: "EventTitle" },
              { t: "Artwork", role: "anchor", url: "https://example.test/a.png" },
            ],
          },
        },
        legal.sections[1],
      ],
    };
    expect(validateSchema(badProp).ok).toBe(false);

    const badRole = {
      ...legal,
      sections: [
        {
          ...legal.sections[0],
          root: { t: "Stack", children: [{ t: "EventTitle" }, { t: "Artwork", role: "mural" }] },
        },
        legal.sections[1],
      ],
    };
    expect(validateSchema(badRole).ok).toBe(false);
  });

  it("rejects an unknown primitive, as the validator does", () => {
    const bad = { ...legal, sections: [{ ...legal.sections[0], root: { t: "Carousel" } }] };
    expect(validateSchema(bad).ok).toBe(false);
    expect(Object.keys(generated.$defs)).not.toContain("Carousel");
  });

  it("rejects an unknown prop and an out-of-enum token, as the validator does", () => {
    const unknownProp = {
      ...legal,
      sections: [
        {
          ...legal.sections[0],
          root: { t: "Stack", tone: "loud", children: [{ t: "EventTitle" }] },
        },
      ],
    };
    expect(validateSchema(unknownProp).ok).toBe(false);
    expect(generated.$defs.Stack.properties.tone).toBeUndefined();

    const badToken = {
      ...legal,
      sections: [
        {
          ...legal.sections[0],
          root: { t: "Stack", gap: "enormous", children: [{ t: "EventTitle" }] },
        },
      ],
    };
    expect(validateSchema(badToken).ok).toBe(false);
    expect(generated.$defs.Stack.properties.gap.enum).not.toContain("enormous");
  });
});
