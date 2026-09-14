/**
 * The JSON Schema sent to the provider, and the canonical schema committed under
 * `docs/model-schemas/`.
 *
 * Two projections of one source (`contract.ts`):
 *
 * - `canonicalJsonSchema()` keeps every constraint and is what `docs/model-schemas/`
 *   holds, so the committed schema documents the real contract.
 * - `strictWireSchema()` is the same shape reduced to the subset OpenAI structured
 *   outputs accept in strict mode: every property required, `additionalProperties: false`
 *   everywhere, and no length/count/format keywords.
 *
 * The reduction is safe because provider enforcement was never the authority.
 * `docs/model-contracts.md §3`: "the application **always** runs the canonical schema
 * validator ... Provider enforcement, where available, is a free improvement on top."
 * Strict mode therefore guarantees shape and enum membership; `validate.ts` enforces
 * everything the wire schema had to drop.
 */
import { z } from "zod";
import { eventIdentityResultSchema } from "./contract";

type JsonSchema = Record<string, unknown>;

/** Keywords OpenAI strict structured outputs reject. Shape and enums survive; bounds do not. */
const UNSUPPORTED_KEYWORDS = new Set([
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minProperties",
  "maxProperties",
  "default",
  "contentEncoding",
  "contentMediaType",
]);

export function canonicalJsonSchema(): JsonSchema {
  // `io: "input"` keeps the pre-transform shape, which is what the model must produce.
  return z.toJSONSchema(eventIdentityResultSchema, {
    target: "draft-2020-12",
    io: "input",
    // Zod emits `allOf`/`anyOf` wrappers for refinements it cannot express; the
    // refinements are re-checked in `validate.ts`, so representing them is not required.
    unrepresentable: "any",
  }) as JsonSchema;
}

/**
 * Reduce a JSON Schema to the strict-mode subset, in place over a deep copy.
 *
 * `nullable` string fields arrive as `anyOf: [{type:"string",...},{type:"null"}]` or as
 * `type: ["string","null"]`; both are accepted by strict mode and are left alone.
 */
function reduce(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(reduce);
  if (node === null || typeof node !== "object") return node;

  const source = node as JsonSchema;
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(source)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    out[key] = reduce(value);
  }

  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    // Strict mode requires every declared property to be required, and no open objects.
    out.required = Object.keys(out.properties as JsonSchema);
    out.additionalProperties = false;
  }
  return out;
}

export function strictWireSchema(): JsonSchema {
  const reduced = reduce(canonicalJsonSchema()) as JsonSchema;
  // `$schema` is metadata the provider does not want on the payload.
  delete reduced.$schema;
  return reduced;
}
