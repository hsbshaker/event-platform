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
  it("are three independent values, and all three moved at the T22 remediation", () => {
    // Prompt and schema bump **together** (`§5.1`'s paired rule, and the `v5` lesson Event
    // Identity paid for): the remediation moved model-visible text on both sides. Unlike
    // `v4` → `v5`, the *shape* did not move — a `v5` response is still structurally valid — so the
    // pairing here is doing exactly the job it exists for, keeping the label honest about which
    // contract produced an artifact when only the wording changed.
    expect(DESIGN_INTENT_PROMPT_VERSION).toBe("design_intent_v6");
    expect(DESIGN_INTENT_SCHEMA_VERSION).toBe("design_intent_schema_v6");
    // The assembly version moved too, and for its own reason: `§B.3` bumps it for a change to the
    // envelope's **contents**, and the envelope gained a channel — this concept's `ConceptPremise`.
    // At T21 it stayed at `v1` because a representation chosen for the first time is not a change
    // to one; this is a change to the contents, which is the clearest case the rule has.
    expect(DESIGN_INTENT_INPUT_ASSEMBLY_VERSION).toBe("design_intent_input_v2");
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
