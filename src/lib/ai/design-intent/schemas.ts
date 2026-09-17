/**
 * The committed DesignIntent JSON Schemas, and the single place their content is defined.
 *
 * `docs/model-contracts.md §2` already makes generated schemas this repository's practice for the
 * composition call — "generated from the same table. Never hand-edit either" — and
 * `src/lib/ai/event-identity/schemas.ts` applies it to Event Identity. This applies it to
 * DesignIntent, which is the call the rule was written for: `design_intent_schema_v3` was
 * hand-written, drifted from the production vocabulary in three ways at once, and stayed drifted
 * for a whole revision (`§5.1`, "v4 reconciliation").
 *
 * `docs/model-schemas/design-intent.schema.json` was still hand-written at v4. Its identity,
 * title, `$comment` and every model-visible description are preserved verbatim in `contract.ts`,
 * so this is a change of *provenance* rather than of contract: the same schema, now emitted from
 * the types the compiler actually consumes, with `schema-drift.test.ts` failing when the two
 * diverge. Hand-editing the file is now a test failure, not a decision.
 *
 * Regenerate with `npm run schemas:design-intent`.
 */
import { canonicalJsonSchema, strictWireSchema } from "./wire-schema";

export const SCHEMA_FILES = {
  response: "docs/model-schemas/design-intent.schema.json",
  wire: "docs/model-schemas/design-intent.wire.schema.json",
} as const;

type JsonSchema = Record<string, unknown>;

const V5_DESCRIPTION =
  "Canonical superset schema for the DesignIntent model response: the seven design fields " +
  "(family, tonalDirection, palette, typographyPairing, density, composition, motifs) plus a " +
  "non-design `presentation` object. The application splits the response into DesignIntent (the " +
  "seven fields, consumed by the compiler) and ConceptPresentation (name/description, never read " +
  "by the compiler). At runtime the hard-assignment enums are narrowed before the request is " +
  "sent. v5 is the first version sent to a provider: composition.hierarchy is a hard assignment " +
  "field like family and tonalDirection and narrows to the assigned value, and the concept-name " +
  "rule admits Unicode letters and combining marks so an ordinary host-facing name is not " +
  "discarded into a deterministic fallback. v4 is preserved at " +
  "history/design-intent.v4.schema.json and v3 at history/design-intent.v3.schema.json.";

const V5_COMMENT =
  "design_intent_schema_v5: composition.hierarchy is planner-assigned and narrows to the assigned " +
  "value; the presentation name accepts Unicode letters and combining marks. v4 and v3 are " +
  "preserved under history/. Generated from src/lib/ai/design-intent/contract.ts — do not " +
  "hand-edit.";

export function buildSchemaFiles(): Record<keyof typeof SCHEMA_FILES, JsonSchema> {
  return {
    response: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://event-platform.local/schemas/design-intent.v5.schema.json",
      title: "DesignIntentResponse (design_intent_schema_v5)",
      description: V5_DESCRIPTION,
      ...stripMeta(canonicalJsonSchema()),
      $comment: V5_COMMENT,
    },
    wire: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://event-platform.local/schemas/design-intent.v5.wire.schema.json",
      title: "DesignIntentResponse (provider strict-mode projection, design_intent_schema_v5)",
      description:
        "The canonical schema reduced to the subset OpenAI structured outputs accept in strict " +
        "mode — every property required, additionalProperties false everywhere, no " +
        "length/count/pattern/uniqueness keywords. Committed so the reduction is reviewable. " +
        "This is the UNNARROWED superset: the schema actually sent for one concept is this " +
        "reduction applied to the sibling's narrowed contract, where family, tonalDirection and " +
        "composition.hierarchy are single-value enums and typographyPairing is filtered to the " +
        "assigned category and hierarchy (docs/model-contracts.md §5.2). Generated — do not " +
        "hand-edit. The dropped " +
        "constraints are enforced by the application validator, which is the authority " +
        "(docs/model-contracts.md §3).",
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
