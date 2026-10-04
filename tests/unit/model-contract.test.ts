/**
 * The model-facing contracts cannot drift from the versions and catalogs production uses.
 *
 * `docs/model-schemas/event-identity.schema.json` is what a structured-output provider enforces and
 * what the application validates against; `src/lib/ai/versions.ts` is what every generation record
 * persists; `src/lib/card/typography.ts` is the catalog card designs choose pairings from. If they
 * disagree, the identity can rank a category no pairing belongs to, or a record can claim a version
 * the prompt does not carry.
 *
 * `docs/model-contracts.md §2`, `§4`; `spec.md §32` #19, #28.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { EVENT_IDENTITY_PROMPT_VERSION, EVENT_IDENTITY_SCHEMA_VERSION } from "@/lib/ai/versions";
import { TYPOGRAPHY, TYPOGRAPHY_KEYS } from "@/lib/card/typography";

const DOCS = new URL("../../docs/", import.meta.url).pathname;

interface JsonSchema {
  required: string[];
  properties: Record<string, { items?: { enum?: string[] } }>;
  $comment?: string;
}

const identitySchema = JSON.parse(
  readFileSync(`${DOCS}model-schemas/event-identity.schema.json`, "utf8"),
) as JsonSchema;
const identityPrompt = readFileSync(`${DOCS}model-prompts/event-identity.system.md`, "utf8");

describe("Event Identity contract (prompt v4, schema v4)", () => {
  it("names the same prompt and schema versions as versions.ts", () => {
    expect(identityPrompt).toContain(`**Prompt version:** \`${EVENT_IDENTITY_PROMPT_VERSION}\``);
    expect(identityPrompt).toContain(EVENT_IDENTITY_SCHEMA_VERSION);
    expect(identitySchema.$comment).toContain(EVENT_IDENTITY_SCHEMA_VERSION);
  });

  it("carries none of the retired website-era planner fields", () => {
    for (const retired of ["compatibleFamilies", "compatibleTonalDirections"]) {
      expect(identitySchema.properties).not.toHaveProperty(retired);
      expect(identitySchema.required).not.toContain(retired);
    }
  });

  it("carries no operational event fact", () => {
    for (const fact of ["date", "time", "venue", "address", "hosts", "babyName", "rsvpDeadline"]) {
      expect(identitySchema.properties).not.toHaveProperty(fact);
    }
  });

  it("ranks exactly the typography categories the pairing catalog uses", () => {
    const schemaCategories = identitySchema.properties.compatibleTypographyCategories.items!.enum!;
    const catalogCategories = new Set(TYPOGRAPHY_KEYS.map((id) => TYPOGRAPHY[id].category));
    expect(new Set(schemaCategories)).toEqual(catalogCategories);
  });
});
