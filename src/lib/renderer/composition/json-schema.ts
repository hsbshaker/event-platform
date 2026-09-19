/**
 * The CompositionTree JSON Schema, generated from `NODE_SPEC`.
 *
 * `docs/model-contracts.md §2`: "The composition prompt's primitive spec and rules blocks are
 * generated from the validator's spec table; the JSON Schema is generated from the same table.
 * Never hand-edit either."
 *
 * So this module exists rather than a second, hand-maintained table. The structured-output schema
 * the model is constrained by, the prompt text it reads, and the validator that judges its answer
 * all come from `NODE_SPEC`, and none of them can drift from the others without this function
 * changing. `docs/model-schemas/composition.schema.json` is the committed artifact;
 * `json-schema.test.ts` fails if it stops matching what this generates.
 *
 * The schema is a *superset* gate. It rejects unknown primitives, unknown props and out-of-enum
 * tokens — the defects `spec.md §31` says earn the one re-prompt. Structural rules (nesting,
 * depth, coverage, capability, limits) are not expressible here and are not meant to be: they are
 * repaired deterministically, never re-prompted (`spec.md §32` #22).
 */

import { NODE_SPEC, SECTION_SPEC, type NodeSpec, type PropSpec } from "./spec";
import { ENUM } from "./tokens";

/** Minimal JSON Schema shapes; enough for what `NODE_SPEC` can express, and nothing more. */
type JsonSchema = Record<string, unknown>;

const NODE_REF = { $ref: "#/$defs/Node" } as const;

/** `{ id, role }`, referenced rather than repeated at each motif-bearing prop. */
const MOTIF_REF = { $ref: "#/$defs/MotifRef" } as const;

const motifRefSchema = (): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  description: "a curated motif and the role it plays in its slot",
  required: ["id", "role"],
  properties: {
    id: { type: "string", enum: [...ENUM.MotifId] },
    role: { type: "string", enum: [...ENUM.MotifRole] },
  },
});

function propSchema(name: string, spec: PropSpec, node: NodeSpec): JsonSchema {
  if (spec.type === "motif")
    return { ...MOTIF_REF, ...(spec.doc ? { description: spec.doc } : {}) };
  if (spec.type === "node") return { ...NODE_REF, ...(spec.doc ? { description: spec.doc } : {}) };
  if (spec.type === "nodes")
    return {
      type: "array",
      items: NODE_REF,
      ...(node.children ? { minItems: node.children.min, maxItems: node.children.max } : {}),
      ...(spec.doc ? { description: spec.doc } : {}),
    };
  if (spec.enum) {
    const values = [...spec.enum];
    const allNumbers = values.every((v) => typeof v === "number");
    return {
      type: allNumbers ? "number" : "string",
      enum: values,
      ...(spec.doc ? { description: spec.doc } : {}),
    };
  }
  throw new Error(`NODE_SPEC prop "${name}" declares neither an enum nor a type`);
}

/** One primitive, as a closed object with a `t` discriminator. */
function nodeSchema(name: string, spec: NodeSpec): JsonSchema {
  const properties: JsonSchema = { t: { type: "string", const: name } };
  const required: string[] = ["t"];

  for (const [prop, ps] of Object.entries(spec.props)) {
    properties[prop] = propSchema(prop, ps, spec);
    if (ps.required) required.push(prop);
  }
  if (spec.children) {
    properties.children = {
      type: "array",
      items: NODE_REF,
      minItems: spec.children.min,
      maxItems: spec.children.max,
      description: spec.children.allow,
    };
    required.push("children");
  }

  return {
    type: "object",
    additionalProperties: false,
    description: spec.doc,
    required,
    properties,
  };
}

/**
 * Build the schema. Deterministic: the key order of `NODE_SPEC` and of each `props` object is
 * observable (it is the order the prompt lists them in), and it is preserved here so the
 * generated artifact is byte-stable.
 */
export function compositionJsonSchema(): JsonSchema {
  const defs: JsonSchema = {};
  for (const [name, spec] of Object.entries(NODE_SPEC)) defs[name] = nodeSchema(name, spec);

  defs.MotifRef = motifRefSchema();

  defs.Node = {
    description: "Any primitive. The `t` discriminator selects which.",
    oneOf: Object.keys(NODE_SPEC).map((name) => ({ $ref: `#/$defs/${name}` })),
  };

  defs.Section = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "surface", "root"],
    properties: {
      kind: { type: "string", enum: [...SECTION_SPEC.kind] },
      surface: { type: "string", enum: [...SECTION_SPEC.surface] },
      align: { type: "string", enum: [...SECTION_SPEC.align] },
      fill: { type: "string", enum: [...SECTION_SPEC.fill] },
      root: NODE_REF,
    },
  };

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://event-platform.local/schemas/composition.schema.json",
    title: "CompositionTree (composition_schema_v2)",
    description:
      "The model-authored page composition: trusted layout primitives with enum tokens only. " +
      "Generated from the production spec table (`src/lib/renderer/composition/spec.ts`), which " +
      "is the same table the structural validator and the prompt's primitive spec are generated " +
      "from — see docs/model-contracts.md §2. Never hand-edit this file. " +
      "This schema is a superset gate: it rejects unknown primitives, unknown props and " +
      "out-of-enum tokens. Nesting, depth, coverage, capability and limit rules are not " +
      "expressible in JSON Schema and are repaired deterministically instead.",
    type: "object",
    additionalProperties: false,
    required: ["version", "sections"],
    properties: {
      version: { type: "string", const: "composition_v1" },
      // Deliberately unbounded. `validateSchema` does not bound the section count either: too
      // few or too many sections is `sections.count`, a structural defect repaired
      // deterministically (`spec.md §32` #22). A bound here would make the model-facing schema
      // reject a tree the validator accepts, which is drift in the other direction.
      sections: { type: "array", items: { $ref: "#/$defs/Section" } },
    },
    $defs: defs,
  };
}
