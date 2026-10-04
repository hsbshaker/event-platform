/**
 * Fact extraction's output (`fact_extraction_schema_v1`; `docs/model-contracts.md §4.3`,
 * `spec.md §7.5`): only what the host's prompt literally states, each value the host's exact
 * string, missing as null, partial hints in `partial`. Written to the event draft as values for the
 * host to confirm, never to the identity.
 *
 * The JSON Schema sent to the provider is ported unchanged from Phase 3 validation
 * (`scripts/phase-3/run.mjs` `FACTS_SCHEMA`, used with `docs/model-prompts/fact-extraction.system.md`);
 * the zod schema is what the application validates every response with
 * (`fact-extraction.test.ts` holds them together). Changing either is a
 * `FACT_EXTRACTION_SCHEMA_VERSION` bump.
 */
import { z } from "zod";

const FACT_FIELDS = [
  "eventType",
  "title",
  "hosts",
  "honoree",
  "date",
  "time",
  "venue",
  "location",
] as const;

export const FACT_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...FACT_FIELDS, "partial"],
  properties: {
    ...Object.fromEntries(FACT_FIELDS.map((f) => [f, { type: ["string", "null"] }])),
    partial: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "text"],
        properties: { field: { type: "string" }, text: { type: "string" } },
      },
    },
  },
} as const;

const fact = z.string().nullable();

export const extractedFactsSchema = z.strictObject({
  eventType: fact,
  title: fact,
  hosts: fact,
  honoree: fact,
  date: fact,
  time: fact,
  venue: fact,
  location: fact,
  partial: z.array(z.strictObject({ field: z.string(), text: z.string() })),
});

export type ExtractedFacts = z.infer<typeof extractedFactsSchema>;
