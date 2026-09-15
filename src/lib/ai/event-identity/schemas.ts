/**
 * The committed Event Identity JSON Schemas, and the single place their content is defined.
 *
 * `docs/model-contracts.md §2` already makes generated schemas this repository's practice for
 * the composition call — "generated from the same table. Never hand-edit either." This applies
 * the same rule to Event Identity: `contract.ts` is the source, the files under
 * `docs/model-schemas/` are its emitted form, and `schema-drift.test.ts` fails when they
 * diverge. Hand-editing one of those files is a test failure, not a decision.
 *
 * Regenerate with `npm run schemas:event-identity`.
 */
import { canonicalJsonSchema, strictWireSchema } from "./wire-schema";

export const SCHEMA_FILES = {
  result: "docs/model-schemas/event-identity-result.schema.json",
  brief: "docs/model-schemas/event-identity.schema.json",
  wire: "docs/model-schemas/event-identity-result.wire.schema.json",
} as const;

type JsonSchema = Record<string, unknown>;

export function buildSchemaFiles(): Record<keyof typeof SCHEMA_FILES, JsonSchema> {
  const canonical = canonicalJsonSchema();
  const properties = canonical.properties as Record<string, JsonSchema>;

  return {
    result: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://event-platform.local/schemas/event-identity-result.schema.json",
      title: "EventIdentityResult",
      description:
        "Canonical structured output for the Event Identity call. Generated from " +
        "src/lib/ai/event-identity/contract.ts — do not hand-edit. `identity` is the creative " +
        "brief, `suppliedFacts` quotes the host verbatim or is null, `clarification` carries " +
        "either up to three creative questions or one boundary question. spec.md §7.5, §7.6b; " +
        "docs/model-contracts.md §4.",
      ...stripMeta(canonical),
      $comment:
        "event_identity_schema_v5: each clarification question declares a `kind` — `creative` or " +
        "`boundary` — and defer semantics follow it. v4: `designConstraints` splits into `hostConstraints` " +
        "(authoritative, host-grounded) and `creativeGuidance` (advisory), and `suppliedFacts` " +
        "gains `honoreeDescriptionText`. v3 introduced the envelope: `identity` plus " +
        "`suppliedFacts` (quoted or null, never inferred) and `clarification`. " +
        "Provider strict mode receives the reduced projection in " +
        "event-identity-result.wire.schema.json; the application always runs the full " +
        "contract (docs/model-contracts.md §3).",
    },
    brief: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://event-platform.local/schemas/event-identity.schema.json",
      title: "EventIdentity",
      description:
        "The creative brief alone, as nested at `identity` in " +
        "event-identity-result.schema.json. Generated from " +
        "src/lib/ai/event-identity/contract.ts — do not hand-edit.",
      ...properties.identity,
      $comment:
        "The creative brief as of event_identity_schema_v5. Operational event data is never " +
        "carried here; it lives in the result envelope's `suppliedFacts` sibling " +
        "(spec.md §7.5).",
    },
    wire: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://event-platform.local/schemas/event-identity-result.wire.schema.json",
      title: "EventIdentityResult (provider strict-mode projection)",
      description:
        "What is actually sent to the provider: the canonical schema reduced to the subset " +
        "OpenAI structured outputs accept in strict mode — every property required, " +
        "additionalProperties false everywhere, no length/count/format keywords. Committed so " +
        "the request payload is reviewable. Generated — do not hand-edit. The dropped " +
        "constraints are enforced by the application validator, which is the authority " +
        "(docs/model-contracts.md §3).",
      ...strictWireSchema(),
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
