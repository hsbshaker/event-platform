/**
 * The committed ConceptPremise JSON Schemas, and the single place their content is defined.
 *
 * `docs/model-contracts.md §2` makes generated schemas this repository's practice — *"generated
 * from the same table. Never hand-edit either"* — after `design_intent_schema_v3` was hand-written
 * and stayed drifted from the production vocabulary for a whole revision. This stage is generated
 * from its contract from its first version, so there is no hand-written ancestor to drift from.
 *
 * Regenerate with `npm run schemas:concept-premise`.
 */
import { canonicalJsonSchema, strictWireSchema } from "./wire-schema";

export const SCHEMA_FILES = {
  response: "docs/model-schemas/concept-premise.schema.json",
  wire: "docs/model-schemas/concept-premise.wire.schema.json",
} as const;

type JsonSchema = Record<string, unknown>;

const V1_DESCRIPTION =
  "Canonical schema for the ConceptPremise model response: three creative premises authored as " +
  "one set from a single authoritative EventIdentity, plus any register axis the brief leaves no " +
  "room to vary. Deterministic code binds premise k to planned sibling k, and each DesignIntent " +
  "call then receives the same brief, its own planner assignment and its own premise. The " +
  "compiler never reads a premise. v1 is the first version of this stage, introduced after the " +
  "T22 diagnostic showed that three blind DesignIntent calls given a byte-identical brief and " +
  "four enum values converge on one creative answer.";

const V1_COMMENT =
  "concept_premise_schema_v1: a premise selects emphasis from the brief and never reinterprets " +
  "the host — there is no field here for a host fact, relationship, conflict, motive or " +
  "constraint, and the application validator refuses grounding that is not anchored in the brief. " +
  "Generated from src/lib/ai/concept-premise/contract.ts — do not hand-edit.";

export function buildSchemaFiles(): Record<keyof typeof SCHEMA_FILES, JsonSchema> {
  return {
    response: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://event-platform.local/schemas/concept-premise.v1.schema.json",
      title: "ConceptPremiseSet (concept_premise_schema_v1)",
      description: V1_DESCRIPTION,
      ...stripMeta(canonicalJsonSchema()),
      $comment: V1_COMMENT,
    },
    wire: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://event-platform.local/schemas/concept-premise.v1.wire.schema.json",
      title: "ConceptPremiseSet (provider strict-mode projection, concept_premise_schema_v1)",
      description:
        "The canonical schema reduced to the subset OpenAI structured outputs accept in strict " +
        "mode — every property required, additionalProperties false everywhere, no " +
        "length/count/pattern/uniqueness keywords. Unlike the DesignIntent wire schema this is " +
        "the schema actually sent: the premise set is authored blind to the sibling assignments, " +
        "so there is nothing to narrow. The dropped constraints, and the set-level and fidelity " +
        "rules no JSON Schema can express, are enforced by the application validator, which is " +
        "the authority (docs/model-contracts.md §3). Generated — do not hand-edit.",
      ...stripMeta(strictWireSchema()),
    },
  };
}

/** `$schema` is re-stated by each file's own header; keep one copy. */
function stripMeta(schema: JsonSchema): JsonSchema {
  const rest = { ...schema };
  delete rest.$schema;
  return rest;
}

export function serializeSchema(value: JsonSchema): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
