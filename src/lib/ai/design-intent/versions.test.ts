/**
 * The three DesignIntent version constants, and what each one is for.
 *
 * `docs/model-contracts.md §2`: prompts and schemas are versioned production assets, recorded with
 * generation telemetry, never edited while keeping the same version.
 * `docs/phase-4b-plan.md §B.3` adds the third: the **input assembly** version, because the prompt
 * version names the accepted contract while the effective model input can change underneath it.
 * `§G.2` makes `design_intent_artifacts.design_intent_input_assembly_version` `not null` for the
 * same reason, so "produced before this was recorded" and "the writer forgot" cannot collide.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`: "DesignIntent +
 * CompositionTree (raw and canonical) + ResolvedDesignSpec persist per concept with prompt,
 * schema, primitive-set and compiler versions." Plan: `docs/phase-4b-plan.md §E`, `§G.2`, T18.
 */
import { describe, expect, it } from "vitest";

import {
  DESIGN_INTENT_INPUT_ASSEMBLY_VERSION,
  DESIGN_INTENT_PROMPT_VERSION,
  DESIGN_INTENT_SCHEMA_VERSION,
} from "@/lib/ai/versions";
import { SCHEMA_MANIFEST } from "@/lib/supabase/schema-manifest";

import { designIntentInputAssemblyVersion } from "./input";

describe("the DesignIntent version constants", () => {
  it("are three independent values, and only two of them moved at T21", () => {
    // Prompt and schema bump **together** (`§5.1`'s paired rule, and the `v5` lesson Event
    // Identity paid for): T21 changed model-visible text on both sides, and a `v4` response is not
    // a valid `v5` response — `composition.hierarchy` narrows to the assigned value.
    expect(DESIGN_INTENT_PROMPT_VERSION).toBe("design_intent_v5");
    expect(DESIGN_INTENT_SCHEMA_VERSION).toBe("design_intent_schema_v5");
    // The assembly version did **not** move. `§B.3`'s rule bumps it for a change to the envelope's
    // contents, precedence, ordering or representation; T21 chose a representation for the first
    // time under a constant that had never rendered anything, and the contents are unchanged.
    expect(DESIGN_INTENT_INPUT_ASSEMBLY_VERSION).toBe("design_intent_input_v1");
    // Three labels, three things. `§B.3`: the assembly version "does not bump for a prompt-file
    // edit or a schema change; those have versions of their own and the three are independent."
    expect(
      new Set([
        DESIGN_INTENT_PROMPT_VERSION,
        DESIGN_INTENT_SCHEMA_VERSION,
        DESIGN_INTENT_INPUT_ASSEMBLY_VERSION,
      ]).size,
    ).toBe(3);
  });

  it("is the value the T17 artifact column records, not a parallel constant", () => {
    // The module re-export and the constant are the same value, and the column that stores it
    // exists. Two names for one version is how a persisted label drifts from the code that
    // produced it.
    expect(designIntentInputAssemblyVersion).toBe(DESIGN_INTENT_INPUT_ASSEMBLY_VERSION);
    expect(SCHEMA_MANIFEST.design_intent_artifacts).toContain(
      "design_intent_input_assembly_version",
    );
    expect(SCHEMA_MANIFEST.design_intent_artifacts).toContain("design_intent_prompt_version");
    expect(SCHEMA_MANIFEST.design_intent_artifacts).toContain("design_intent_schema_version");
  });

  it("follows the Event Identity naming, so the two read as one family", () => {
    expect(DESIGN_INTENT_INPUT_ASSEMBLY_VERSION).toMatch(/^design_intent_input_v\d+$/);
  });
});
