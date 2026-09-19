import "server-only";

/**
 * Persisting one verified concept, and the row that may not exist before it.
 *
 * `docs/phase-4b-plan.md §G.3`: *"4D inserts `design_concepts` only after composition exists. It
 * already cannot do otherwise; this makes the constraint intentional rather than incidental. A
 * concept is a **composed** thing."* The database enforces it twice over — `composition_raw`,
 * `composition`, `composition_hash`, `content_profile` and every version column are `not null`, and
 * `protect_design_concept()` refuses to fill any of them in later — so there is no shape in which
 * a half-made concept can be written now and completed afterwards.
 *
 * # Order, and why it is this order
 *
 * `design_concepts.active_resolved_spec_id` references `resolved_design_specs`, and
 * `resolved_design_specs.concept_id` references `design_concepts`. The cycle is resolved by
 * writing the concept first with a null pointer, then the spec, then moving the pointer — the one
 * update `protect_design_concept()` permits. A concept therefore exists briefly with no active
 * spec, which is a real state and not a defect: `spec.md §4.10` makes the pointer the thing that
 * says *which revision is live*, and a concept whose only revision has not been written yet has no
 * live revision to name.
 *
 * # Idempotent replay
 *
 * `unique (event_id, round, concept_index)` means a replayed driver cannot create a second concept
 * for the same sibling. Rather than letting the insert raise, a conflict is read back and returned
 * as `replayed`, because the caller's next step — settling the sibling — must converge on the row
 * that exists rather than fail. `resolved_design_specs` is `unique (concept_id, revision)` and
 * carries the same treatment for the same reason.
 *
 * Nothing here recompiles, re-verifies or mutates anything: `verified_clean` is a `check (true)`
 * column, so a spec that did not verify cannot be written at all, and `reject_update()` refuses
 * every update to a persisted revision.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` — *"Compiler
 * persists immutable, verified ResolvedDesignSpec"*, *"DesignIntent + CompositionTree (raw and
 * canonical) + ResolvedDesignSpec persist per concept with prompt, schema, primitive-set and
 * compiler versions"*. Guardrails: `spec.md §32 #18`, `#20`, `#24`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";
import type { Capabilities, CompositionTree, ContentProfile } from "@/lib/renderer/composition";
import type { ResolvedDesignSpec } from "@/lib/renderer/verify";
import type { DesignIntent, Presentation } from "@/lib/renderer/design-intent";
import { COMPILER_VERSION, PRIMITIVE_SET_VERSION } from "@/lib/ai/versions";
import { reserveArtworkSlots, type ArtworkSlotReservation } from "./persist-artwork";

type Admin = SupabaseClient<Database>;

/** The first revision of a freshly generated concept. A content edit appends, never replaces. */
export const FIRST_REVISION = 1;

/**
 * A freshly generated concept has seen no content edit, so its content version is the first.
 * `spec.md §4.10`: a content edit re-fits into the *next* revision with the next content version.
 */
export const FIRST_CONTENT_VERSION = 1;

export interface PersistConceptRequest {
  readonly eventId: string;
  readonly round: number;
  readonly conceptIndex: number;
  /** The artifact this concept's DesignIntent came from; the lineage pointer. */
  readonly designIntentArtifactId: string;
  readonly designIntent: DesignIntent;
  /** The host-facing card. `design_concepts` denormalizes it into `name` / `description`. */
  readonly presentation: Presentation;
  readonly compositionRaw: CompositionTree;
  readonly compositionCanonical: CompositionTree;
  readonly compositionHash: string;
  readonly capabilities: Capabilities;
  readonly contentProfile: ContentProfile;
  readonly directive: Json;
  readonly tokenAllotment: Json;
  /** `"library"` when a documented fallback produced this tree, else null. Never invented. */
  readonly fallback: "library" | null;
  readonly designIntentPromptVersion: string;
  readonly designIntentSchemaVersion: string;
  readonly compositionPromptVersion: string;
  readonly compositionSchemaVersion: string;
  readonly compositionInputAssemblyVersion: string;
  /** Verified. `verified.clean` is true by the type's own construction. */
  readonly spec: ResolvedDesignSpec;
  /**
   * The artwork boxes this revision's geometry reserved, if the creative direction chose any.
   *
   * Optional and usually absent: `spec.md §7.6a #1` makes imagery "optional, and chosen by the
   * creative direction", so a typography-led concept passes nothing here and is complete. The
   * slots are *reservations* — `src/lib/generation/persist-artwork.ts` explains why an asset can
   * only ever attach afterwards, and why it never touches the spec when it does.
   */
  readonly artworkSlots?: readonly ArtworkSlotReservation[];
}

export interface PersistedConcept {
  readonly conceptId: string;
  readonly resolvedSpecId: string;
  /** True when this call found the concept already written by an earlier, identical attempt. */
  readonly replayed: boolean;
}

/**
 * Write one verified concept and its first resolved-spec revision, then make it live.
 *
 * Throws rather than returning a failure union: every caller's response to a failed write is the
 * same — do not settle the sibling succeeded — and a thrown error carries the database's own
 * message, which is more useful than a kind this module would have to invent.
 */
export async function persistConcept(
  admin: Admin,
  request: PersistConceptRequest,
): Promise<PersistedConcept> {
  const conceptRow = {
    event_id: request.eventId,
    round: request.round,
    concept_index: request.conceptIndex,
    name: request.presentation.name,
    description: request.presentation.description,
    design_intent: request.designIntent as unknown as Json,
    design_intent_artifact_id: request.designIntentArtifactId,
    composition_raw: request.compositionRaw as unknown as Json,
    composition: request.compositionCanonical as unknown as Json,
    composition_hash: request.compositionHash,
    capabilities: request.capabilities as unknown as Json,
    content_profile: request.contentProfile as unknown as Json,
    directive: request.directive,
    token_allotment: request.tokenAllotment,
    fallback: request.fallback,
    design_intent_prompt_version: request.designIntentPromptVersion,
    design_intent_schema_version: request.designIntentSchemaVersion,
    composition_prompt_version: request.compositionPromptVersion,
    composition_schema_version: request.compositionSchemaVersion,
    composition_input_assembly_version: request.compositionInputAssemblyVersion,
    primitive_set_version: PRIMITIVE_SET_VERSION,
    compiler_version: COMPILER_VERSION,
  };

  let replayed = false;
  let conceptId: string;

  const inserted = await admin
    .from("design_concepts")
    .insert(conceptRow)
    .select("id")
    .maybeSingle();

  if (inserted.error) {
    // 23505 is the `(event_id, round, concept_index)` uniqueness this sibling already satisfied on
    // an earlier attempt. Converge on that row; anything else is a real failure.
    if (inserted.error.code !== "23505") throw new Error(inserted.error.message);
    const existing = await admin
      .from("design_concepts")
      .select("id")
      .eq("event_id", request.eventId)
      .eq("round", request.round)
      .eq("concept_index", request.conceptIndex)
      .maybeSingle();
    if (existing.error || !existing.data) {
      throw new Error(existing.error?.message ?? "concept conflicted but could not be read back");
    }
    conceptId = existing.data.id;
    replayed = true;
  } else {
    if (!inserted.data) throw new Error("design_concepts insert returned no row");
    conceptId = inserted.data.id;
  }

  const specRow = {
    concept_id: conceptId,
    revision: FIRST_REVISION,
    spec: request.spec as unknown as Json,
    content_version: request.spec.contentVersion ?? FIRST_CONTENT_VERSION,
    supersedes_spec_id: request.spec.supersedesSpecId ?? null,
    // The column is `check (verified_clean)`, so this is the database refusing an unverified spec
    // rather than this module asserting a verified one.
    verified_clean: request.spec.verified.clean,
    compiler_version: COMPILER_VERSION,
    primitive_set_version: PRIMITIVE_SET_VERSION,
  };

  let resolvedSpecId: string;
  const specInsert = await admin
    .from("resolved_design_specs")
    .insert(specRow)
    .select("id")
    .maybeSingle();

  if (specInsert.error) {
    if (specInsert.error.code !== "23505") throw new Error(specInsert.error.message);
    const existingSpec = await admin
      .from("resolved_design_specs")
      .select("id")
      .eq("concept_id", conceptId)
      .eq("revision", FIRST_REVISION)
      .maybeSingle();
    if (existingSpec.error || !existingSpec.data) {
      throw new Error(existingSpec.error?.message ?? "spec conflicted but could not be read back");
    }
    resolvedSpecId = existingSpec.data.id;
    replayed = true;
  } else {
    if (!specInsert.data) throw new Error("resolved_design_specs insert returned no row");
    resolvedSpecId = specInsert.data.id;
  }

  // Slots are reserved against the revision that was just frozen, and before the concept points at
  // it, so a live revision always carries the boxes its geometry reserved. Nothing about this
  // write can change, re-verify or invalidate the spec: the reservations are a side table keyed by
  // `(resolved_spec_id, slot_id)`, and `resolved_design_specs` refuses every update regardless.
  await reserveArtworkSlots(admin, resolvedSpecId, request.artworkSlots ?? []);

  // The one permitted update. `protect_design_concept()` also checks the spec belongs to this
  // concept, so a cross-sibling mislink is refused by the database rather than trusted from here.
  const pointed = await admin
    .from("design_concepts")
    .update({ active_resolved_spec_id: resolvedSpecId })
    .eq("id", conceptId);
  if (pointed.error) throw new Error(pointed.error.message);

  return { conceptId, resolvedSpecId, replayed };
}
