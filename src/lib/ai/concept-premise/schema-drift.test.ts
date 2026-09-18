/**
 * The committed ConceptPremise schemas are the ones this contract produces.
 *
 * Same arrangement as `src/lib/ai/design-intent/schema-drift.test.ts`, and for the reason
 * `docs/model-contracts.md §2` gives: a hand-maintained schema beside a contract drifts, and
 * `design_intent_schema_v3` proved it by staying drifted for a whole revision. Regenerate with
 * `npm run schemas:concept-premise`; hand-editing either file is a test failure, not a decision.
 *
 * Acceptance criteria: N/A — contract provenance. Guardrail `spec.md §32 #12`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CONCEPT_PREMISE_SCHEMA_VERSION } from "@/lib/ai/versions";

import { buildSchemaFiles, SCHEMA_FILES, serializeSchema } from "./schemas";
import { UNSUPPORTED_KEYWORDS } from "@/lib/ai/design-intent/wire-schema";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const built = buildSchemaFiles();
const keys = Object.keys(SCHEMA_FILES) as (keyof typeof SCHEMA_FILES)[];

/** `UPDATE_SCHEMAS=1` writes; the default run only compares. */
if (process.env.UPDATE_SCHEMAS === "1") {
  for (const key of keys) {
    writeFileSync(`${ROOT}${SCHEMA_FILES[key]}`, serializeSchema(built[key]), "utf8");
  }
}

describe("concept premise schemas", () => {
  it.each(keys)("%s matches the contract it is generated from", (key) => {
    expect(readFileSync(`${ROOT}${SCHEMA_FILES[key]}`, "utf8")).toBe(serializeSchema(built[key]));
  });

  it("is stamped with the schema version the constants declare", () => {
    expect(CONCEPT_PREMISE_SCHEMA_VERSION).toBe("concept_premise_schema_v1");
    expect(built.response.title).toContain(CONCEPT_PREMISE_SCHEMA_VERSION);
    expect(built.wire.title).toContain(CONCEPT_PREMISE_SCHEMA_VERSION);
  });

  it("drops every keyword strict mode rejects, and nothing else", () => {
    const seen = new Set<string>();
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node === null || typeof node !== "object") return;
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        seen.add(k);
        walk(v);
      }
    };
    walk(built.wire);
    expect([...seen].filter((k) => UNSUPPORTED_KEYWORDS.has(k))).toEqual([]);
  });

  it("requires every property and forbids unknown keys, at every depth", () => {
    const offenders: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (Array.isArray(node)) return node.forEach((child, i) => walk(child, `${path}[${i}]`));
      if (node === null || typeof node !== "object") return;
      const schema = node as Record<string, unknown>;
      if (schema.type === "object" && schema.properties) {
        const properties = Object.keys(schema.properties as Record<string, unknown>);
        if (schema.additionalProperties !== false) offenders.push(`${path}: additionalProperties`);
        if (JSON.stringify(schema.required) !== JSON.stringify(properties)) {
          offenders.push(`${path}: required`);
        }
      }
      for (const [k, v] of Object.entries(schema)) walk(v, `${path}.${k}`);
    };
    walk(built.wire, "(root)");
    expect(offenders).toEqual([]);
  });
});
