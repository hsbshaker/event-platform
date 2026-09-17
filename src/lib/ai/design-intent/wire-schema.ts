/**
 * The JSON Schema sent to the provider, and the canonical schema committed under
 * `docs/model-schemas/`.
 *
 * Two projections of one source (`./contract.ts`), following the Event Identity precedent in
 * `src/lib/ai/event-identity/wire-schema.ts`:
 *
 * - `canonicalJsonSchema()` keeps every constraint and is what `docs/model-schemas/` holds, so
 *   the committed schema documents the real contract.
 * - `strictWireSchema()` is the same shape reduced to the subset OpenAI structured outputs accept
 *   in strict mode: every property required, `additionalProperties: false` everywhere, and no
 *   length, count, pattern or uniqueness keyword.
 *
 * The reduction is safe because provider enforcement was never the authority.
 * `docs/model-contracts.md §3`: "the application **always** runs the canonical schema validator …
 * Provider enforcement, where available, is a free improvement on top." Strict mode therefore
 * guarantees shape and enum membership; `./validate.ts` enforces everything it had to drop —
 * including the hex pattern, the 3–5 count, uniqueness and the presentation bounds.
 *
 * # One difference from Event Identity
 *
 * The request is **narrowed per sibling** (`./narrowing.ts`), so there is no single wire schema
 * that is "what is sent". `narrowedWireSchema(assignment)` builds the one actually sent; the file
 * committed to `docs/model-schemas/` is the unnarrowed superset's reduction, which is what makes
 * the reduction itself reviewable. Its description says so rather than letting a reader assume
 * the committed bytes go on the wire.
 */
import { z } from "zod";

import type { SiblingAssignment } from "@/lib/renderer/planner";

import { designIntentResponseSchemaFor, type SemanticsNarrowing } from "./contract";
import { narrowingFor } from "./narrowing";

type JsonSchema = Record<string, unknown>;

/** Keywords OpenAI strict structured outputs reject. Shape and enums survive; bounds do not. */
export const UNSUPPORTED_KEYWORDS = new Set([
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

export function canonicalJsonSchema(narrowing?: SemanticsNarrowing): JsonSchema {
  // `io: "input"` keeps the pre-transform shape, which is what the model must produce.
  return z.toJSONSchema(designIntentResponseSchemaFor(narrowing), {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "any",
  }) as JsonSchema;
}

/** Reduce a JSON Schema to the strict-mode subset, over a deep copy. */
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
    out.required = Object.keys(out.properties as JsonSchema);
    out.additionalProperties = false;
  }
  return out;
}

export function strictWireSchema(narrowing?: SemanticsNarrowing): JsonSchema {
  const reduced = reduce(canonicalJsonSchema(narrowing)) as JsonSchema;
  // `$schema` is metadata the provider does not want on the payload.
  delete reduced.$schema;
  return reduced;
}

/**
 * The schema actually sent for one sibling: the strict projection of the narrowed contract.
 *
 * Narrowing happens here, before the request exists, which is the whole point of §5.2 — an
 * out-of-assignment family or pairing is not offered, so it cannot come back and be repaired.
 */
export function narrowedWireSchema(assignment: SiblingAssignment): JsonSchema {
  return strictWireSchema(narrowingFor(assignment));
}
