/**
 * The committed Event Identity schemas cannot drift from the contract they are generated from.
 *
 * Three files have to agree with `contract.ts`: the canonical envelope, the creative brief
 * nested inside it, and the reduced projection actually sent to the provider. A schema that
 * says something the validator does not enforce is worse than no schema, because reviewers
 * read the file and the model obeys the wire copy.
 *
 * `UPDATE_SCHEMAS=1` rewrites them (`npm run schemas:event-identity`); otherwise this fails.
 *
 * Acceptance criteria: N/A — internal contract hygiene.
 * `docs/model-contracts.md §2` (versioned assets, generated schemas never hand-edited), `§3`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildSchemaFiles, serializeSchema, SCHEMA_FILES } from "./schemas";
import { strictWireSchema } from "./wire-schema";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const built = buildSchemaFiles();

if (process.env.UPDATE_SCHEMAS === "1") {
  for (const [key, relative] of Object.entries(SCHEMA_FILES)) {
    writeFileSync(
      path.join(ROOT, relative),
      serializeSchema(built[key as keyof typeof SCHEMA_FILES]),
    );
  }
}

describe("event identity schemas", () => {
  for (const [key, relative] of Object.entries(SCHEMA_FILES)) {
    it(`${relative} matches the contract`, () => {
      const onDisk = readFileSync(path.join(ROOT, relative), "utf8");
      expect(onDisk).toBe(serializeSchema(built[key as keyof typeof SCHEMA_FILES]));
    });
  }

  it("the wire projection is a legal strict structured-output schema", () => {
    // Every object must be closed and list every property as required, and no keyword the
    // provider rejects may survive the reduction. Checked structurally rather than by
    // eyeballing the emitted file, because the reduction is what makes the call legal at all.
    const forbidden = new Set([
      "minLength",
      "maxLength",
      "pattern",
      "format",
      "minItems",
      "maxItems",
      "uniqueItems",
      "minimum",
      "maximum",
      "multipleOf",
      "default",
    ]);
    const problems: string[] = [];

    const walk = (node: unknown, at: string): void => {
      if (Array.isArray(node)) {
        node.forEach((child, i) => walk(child, `${at}[${i}]`));
        return;
      }
      if (node === null || typeof node !== "object") return;
      const schema = node as Record<string, unknown>;

      for (const key of Object.keys(schema)) {
        if (forbidden.has(key)) problems.push(`${at}.${key} is not allowed in strict mode`);
      }

      if (schema.type === "object") {
        const properties = (schema.properties ?? {}) as Record<string, unknown>;
        const required = (schema.required ?? []) as string[];
        if (schema.additionalProperties !== false) {
          problems.push(`${at} must set additionalProperties: false`);
        }
        const missing = Object.keys(properties).filter((p) => !required.includes(p));
        if (missing.length > 0) {
          problems.push(`${at} must require every property; missing ${missing.join(", ")}`);
        }
      }

      for (const [key, value] of Object.entries(schema)) walk(value, `${at}.${key}`);
    };

    walk(strictWireSchema(), "$");
    expect(problems).toEqual([]);
  });

  it("the creative brief carries no operational event field", () => {
    // spec.md §7.5: the identity object is a creative brief and never an event-data dump.
    // Supplied facts live in the envelope's sibling, and this is the guard on that boundary.
    const identity = built.brief.properties as Record<string, unknown>;
    const operational = Object.keys(identity).filter((key) =>
      /date|time|venue|address|locality|rsvp|deadline|guest|host|honoree/i.test(key),
    );
    expect(operational).toEqual([]);
  });
});
