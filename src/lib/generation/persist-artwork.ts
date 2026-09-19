import "server-only";

/**
 * Artwork slots, assets and their lineage — the writes that happen *after* a spec is frozen.
 *
 * # Why this is a sibling module rather than more of `persist-concept.ts`
 *
 * `persist-concept.ts` is about one moment: a verified concept and its first revision, written in
 * one pass and then never touched. Artwork does not live in that moment. A slot is reserved there,
 * but the request, the asset and the failure arrive later, on a timeline the concept write has
 * already finished — possibly minutes later, possibly never. Folding four later-in-life operations
 * into a module whose whole shape is "write this once, atomically" would misdescribe both.
 *
 * `persist-concept.ts` therefore imports exactly one function from here — `reserveArtworkSlots` —
 * and everything else in this file is reached by whatever drives image generation, once such a
 * thing exists.
 *
 * # The ownership direction, restated because every signature here depends on it
 *
 * `src/lib/ai/visual-art/contract.ts` fixes it: composition happens first and owns *where*; the
 * compiler resolves the artwork leaf into real geometry; only then is a `VisualArtIntent` assembled
 * *from* that resolved placement to say *what*. So by the time anything in this module runs, the
 * `ResolvedDesignSpec` is compiled, geometry-verified at 390 and 1280, and frozen. A slot is a
 * reserved box in that verified geometry. An asset attaches to it afterwards, **or never**, and
 * attaching one changes no spec, re-runs no verification and invalidates nothing.
 *
 * That is why these rows are a side table keyed by `(resolved spec revision, slot id)` and not
 * fields inside the persisted spec: `spec.md §32 #18` and `CLAUDE.md §2` make generated design
 * data immutable, and `resolved_design_specs` enforces it with `reject_update()`.
 *
 * # A slot with no asset is finished work
 *
 * `spec.md §7.6a #1` makes imagery optional and `#5` leaves safe realization with the
 * deterministic renderer. `reserved` is therefore the default status and a complete, renderable
 * state — not a pending write, not an error, and nothing here ever treats it as one.
 *
 * # Nothing here calls a provider
 *
 * No provider has been selected (`docs/technology-decisions.md`), and this module imports no
 * provider client. Every provider field is optional in the types and nullable in the database,
 * because a row carrying a fully assembled intent and no provider lineage at all is the expected
 * shape today.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` — *"Compiler
 * persists immutable, verified ResolvedDesignSpec"*, *"DesignIntent + CompositionTree (raw and
 * canonical) + ResolvedDesignSpec persist per concept with prompt, schema, primitive-set and
 * compiler versions"*. Guardrails: `spec.md §32 #13`, `#15`, `#18`, `#20`, `#24`, `#32`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ARTWORK_ROLES,
  type ArtworkRole,
  type VisualArtIntent,
} from "@/lib/ai/visual-art/contract";
import type {
  ArtworkFailureKind,
  ArtworkRole as DbArtworkRole,
  ArtworkSlotStatus,
  AttachArtworkAssetOutcome,
  Database,
  FailArtworkSlotOutcome,
  Json,
  RequestArtworkSlotOutcome,
} from "@/lib/supabase/database.types";
import type { Extent } from "@/lib/renderer/composition/tokens";

type Admin = SupabaseClient<Database>;

/* ------------------------------------------------------------------ the role vocabulary is one */

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * The database's `artwork_role` enum and the contract's `ARTWORK_ROLES` are the same four, or this
 * file does not compile.
 *
 * The contract calls them "`spec.md §7.6a`'s own in-scope list rather than a taxonomy invented
 * here", and says a fifth is "a compiler change and a version bump". Two independent spellings of
 * a closed canonical list is exactly how one quietly grows a fifth member, so they are tied here
 * at compile time and again at runtime in `tests/db/phase4e-artwork.test.ts`, which reads the
 * enum's labels out of `pg_enum`.
 */
export type _ArtworkRoleParity = Exact<ArtworkRole, DbArtworkRole>;
const _artworkRoleParity: readonly DbArtworkRole[] = ARTWORK_ROLES;
void _artworkRoleParity;

export type { ArtworkFailureKind, ArtworkSlotStatus };

/* ------------------------------------------------------------------------------- reserving slots */

/** The box the compiler reserved, at the two breakpoints geometry verification is authoritative at. */
export interface ReservedBox {
  readonly mobile: { readonly widthPx: number; readonly heightPx: number };
  readonly desktop: { readonly widthPx: number; readonly heightPx: number };
}

/**
 * One artwork slot, as the compiler resolved it and the brief was assembled for it.
 *
 * Deliberately carries no asset, no provider and no status: none of those exist yet, and a
 * reservation that could carry them would invite a caller to write an asset at the moment the spec
 * is frozen — which is the one ordering this whole design exists to prevent.
 */
export interface ArtworkSlotReservation {
  /** The compiler's stable identifier for this box within the tree. */
  readonly slotId: string;
  readonly role: ArtworkRole;
  /**
   * The extent the compiler **resolved**, from the composition language's own vocabulary.
   *
   * Not optional here although `Artwork.extent` is optional on the leaf: the leaf records what the
   * model asked for and the compiler has a default per role, so by the time a slot is reserved the
   * question has an answer. Recording `null` would lose which one, and the whole point of these
   * columns is that the resolved placement is evidence. The vocabulary's generation travels with
   * the revision's `primitive_set_version`.
   */
  readonly extent: Extent;
  readonly box: ReservedBox;
  /** The assembled brief, stored verbatim and immutable from the moment it is written. */
  readonly intent: VisualArtIntent;
}

export interface ReservedArtworkSlot {
  readonly slotId: string;
  readonly rowId: string;
  /** True when this slot was already reserved by an earlier, identical attempt. */
  readonly replayed: boolean;
}

/** Addresses one slot. Never an opaque row id: the pair is what makes cross-revision attachment
 * impossible, because a slot id only resolves within the revision that owns it. */
export interface ArtworkSlotRef {
  readonly resolvedSpecId: string;
  readonly slotId: string;
}

/**
 * Reserve every artwork slot of one freshly persisted, verified revision.
 *
 * Called from `persistConcept` after the revision exists and before the concept points at it, so a
 * live revision always has its slots. Idempotent on replay: the batch insert conflicts as a whole
 * on `(resolved_spec_id, slot_id)` — a replay re-offers the same set — and the existing rows are
 * read back rather than the write being retried row by row.
 */
export async function reserveArtworkSlots(
  admin: Admin,
  resolvedSpecId: string,
  slots: readonly ArtworkSlotReservation[],
): Promise<readonly ReservedArtworkSlot[]> {
  if (slots.length === 0) return [];

  const seen = new Set<string>();
  for (const slot of slots) {
    if (seen.has(slot.slotId)) {
      throw new Error(`duplicate artwork slot id in one revision: ${slot.slotId}`);
    }
    seen.add(slot.slotId);
  }

  const rows = slots.map((slot) => ({
    resolved_spec_id: resolvedSpecId,
    slot_id: slot.slotId,
    role: slot.role,
    extent: slot.extent,
    mobile_width_px: slot.box.mobile.widthPx,
    mobile_height_px: slot.box.mobile.heightPx,
    desktop_width_px: slot.box.desktop.widthPx,
    desktop_height_px: slot.box.desktop.heightPx,
    visual_art_intent: slot.intent as unknown as Json,
    visual_art_intent_version: slot.intent.version,
  }));

  const inserted = await admin
    .from("resolved_spec_artwork_slots")
    .insert(rows)
    .select("id, slot_id");

  if (!inserted.error) {
    const byId = new Map(inserted.data.map((r) => [r.slot_id, r.id]));
    return slots.map((slot) => ({
      slotId: slot.slotId,
      rowId: mustHave(byId, slot.slotId),
      replayed: false,
    }));
  }

  // 23505 is the `(resolved_spec_id, slot_id)` uniqueness an earlier attempt already satisfied.
  // Anything else is a real failure and is thrown with the database's own message.
  if (inserted.error.code !== "23505") throw new Error(inserted.error.message);

  const existing = await admin
    .from("resolved_spec_artwork_slots")
    .select("id, slot_id")
    .eq("resolved_spec_id", resolvedSpecId);
  if (existing.error) throw new Error(existing.error.message);

  const byId = new Map(existing.data.map((r) => [r.slot_id, r.id]));
  return slots.map((slot) => ({
    slotId: slot.slotId,
    rowId: mustHave(byId, slot.slotId),
    replayed: true,
  }));
}

function mustHave(byId: ReadonlyMap<string, string>, slotId: string): string {
  const id = byId.get(slotId);
  // A reservation that conflicted but cannot be read back is not a slot we may claim exists.
  if (!id) throw new Error(`artwork slot ${slotId} was neither inserted nor found`);
  return id;
}

/* -------------------------------------------------------------------------- the later operations */

/**
 * Which provider produced, or failed to produce, this asset.
 *
 * Every field optional, and that is not laxity: no image model has been selected and none has been
 * called, so a slot may legitimately move through its whole lifecycle with none of this known.
 */
export interface ArtworkProviderLineage {
  readonly provider?: string;
  readonly model?: string;
  readonly artworkPromptVersion?: string;
  readonly artworkContractVersion?: string;
  readonly latencyMs?: number;
  readonly costEstimateUsd?: number;
}

/**
 * The asset, as delivered.
 *
 * `hasAlpha` is required, with no default and no inference from `role`. `docs/product-doctrine.md
 * §10` makes transparency reliability an empirical property to measure per provider, and
 * `src/lib/ai/visual-art/contract.ts` says the same of a `transparent` background treatment: it is
 * "an **empirical** demand on the provider, not an assumption". A caller that has not measured the
 * bytes has nothing to pass, and the database refuses a null.
 */
export interface ArtworkAsset {
  readonly storageBucket: string;
  readonly storagePath: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly byteSize: number;
  readonly contentType: "image/png" | "image/webp" | "image/avif" | "image/jpeg";
  readonly hasAlpha: boolean;
}

/** Mark a slot's request outstanding. `already_requested` on replay; nothing is overwritten. */
export async function requestArtworkSlot(
  admin: Admin,
  ref: ArtworkSlotRef,
  lineage: ArtworkProviderLineage = {},
): Promise<RequestArtworkSlotOutcome> {
  const { data, error } = await admin.rpc("request_artwork_slot", {
    p_resolved_spec_id: ref.resolvedSpecId,
    p_slot_id: ref.slotId,
    p_provider: lineage.provider ?? null,
    p_model: lineage.model ?? null,
    p_artwork_prompt_version: lineage.artworkPromptVersion ?? null,
    p_artwork_contract_version: lineage.artworkContractVersion ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Attach a delivered asset to its slot.
 *
 * **Idempotent.** The same asset delivered twice is one row in one state: a replay whose storage
 * reference matches returns `already_delivered` and changes nothing. A *different* asset against a
 * delivered slot throws, because keeping one and discarding the other silently is last-write-wins
 * wearing a convergence costume, and overwriting would mutate a terminal outcome.
 *
 * **Cross-revision attachment is impossible.** The row is addressed by
 * `(resolved_spec_id, slot_id)`, so naming a slot that belongs to another revision resolves to no
 * row and the database raises. There is no code path that looks a slot up by id alone.
 */
export async function attachArtworkAsset(
  admin: Admin,
  ref: ArtworkSlotRef,
  asset: ArtworkAsset,
  lineage: ArtworkProviderLineage = {},
): Promise<AttachArtworkAssetOutcome> {
  const { data, error } = await admin.rpc("attach_artwork_asset", {
    p_resolved_spec_id: ref.resolvedSpecId,
    p_slot_id: ref.slotId,
    p_storage_bucket: asset.storageBucket,
    p_storage_path: asset.storagePath,
    p_width_px: asset.widthPx,
    p_height_px: asset.heightPx,
    p_byte_size: asset.byteSize,
    p_content_type: asset.contentType,
    p_has_alpha: asset.hasAlpha,
    p_provider: lineage.provider ?? null,
    p_model: lineage.model ?? null,
    p_artwork_prompt_version: lineage.artworkPromptVersion ?? null,
    p_artwork_contract_version: lineage.artworkContractVersion ?? null,
    p_latency_ms: lineage.latencyMs ?? null,
    p_cost_estimate_usd: lineage.costEstimateUsd ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Record a terminal failure as an outcome.
 *
 * Not a missing row and not a slot left `requested` forever: `reserved` and "the request failed"
 * render identically and mean entirely different things to anyone asking why a page has no
 * artwork. The first classification stands — a replay returns `already_failed` — and failing a
 * delivered slot throws.
 */
export async function failArtworkSlot(
  admin: Admin,
  ref: ArtworkSlotRef,
  failure: { readonly kind: ArtworkFailureKind; readonly detail?: string },
  lineage: ArtworkProviderLineage = {},
): Promise<FailArtworkSlotOutcome> {
  const { data, error } = await admin.rpc("fail_artwork_slot", {
    p_resolved_spec_id: ref.resolvedSpecId,
    p_slot_id: ref.slotId,
    p_failure_kind: failure.kind,
    p_failure_detail: failure.detail ?? null,
    p_provider: lineage.provider ?? null,
    p_model: lineage.model ?? null,
    p_artwork_prompt_version: lineage.artworkPromptVersion ?? null,
    p_artwork_contract_version: lineage.artworkContractVersion ?? null,
    p_latency_ms: lineage.latencyMs ?? null,
    p_cost_estimate_usd: lineage.costEstimateUsd ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}
