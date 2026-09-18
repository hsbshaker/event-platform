/**
 * The two projections of `./contract.ts`: the canonical schema and the provider's strict subset.
 *
 * Same construction and the same reasoning as `src/lib/ai/design-intent/wire-schema.ts`, one
 * difference: this request is **not narrowed**. There is no per-sibling assignment at this stage —
 * the premise set is authored blind to the four style coordinates, which is what keeps semantic
 * distinction primary and visual distinction downstream of it — so a single wire schema really is
 * what goes out, and the file committed under `docs/model-schemas/` is that schema rather than a
 * superset of it.
 *
 * `docs/model-contracts.md §3` remains the reason the reduction is safe: the application always
 * runs the canonical validator, so strict mode buys shape and enum membership and `./validate.ts`
 * enforces every bound, count and uniqueness keyword the reduction drops — plus the set-level and
 * fidelity rules a JSON Schema cannot express at all.
 */
import { z } from "zod";

import { UNSUPPORTED_KEYWORDS } from "@/lib/ai/design-intent/wire-schema";

import { conceptPremiseSetSchema } from "./contract";

type JsonSchema = Record<string, unknown>;

export function canonicalJsonSchema(): JsonSchema {
  return z.toJSONSchema(conceptPremiseSetSchema, {
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

export function strictWireSchema(): JsonSchema {
  const reduced = reduce(canonicalJsonSchema()) as JsonSchema;
  delete reduced.$schema;
  return reduced;
}
