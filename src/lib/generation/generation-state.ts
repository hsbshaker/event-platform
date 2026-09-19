import "server-only";

import type { SemanticPalette, SemanticRole } from "@/lib/renderer/compile/palette";
import type {
  ArtworkSlotStatus,
  Database,
  GenerationBatchSiblingStatus,
  GenerationBatchStatus,
} from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isBatchInFlight } from "./batch";
import type {
  ConceptArtworkView,
  ConceptStage,
  ConceptView,
  GenerationStage,
  GenerationView,
} from "./generation-view";

/**
 * The durable read model behind the generation surface.
 *
 * `generation-view.ts` is the contract; this is the only thing allowed to satisfy it. The rule it
 * is built on is `spec.md §31 — Prompt, auth, and generation`:
 *
 * > The generation surface shows only artifacts the pipeline produced — no model reasoning, no
 * > fabricated progress or completion percentages (§7.10).
 *
 * So nothing here is computed from a clock, a counter, an estimate or a guess. **Every field is a
 * statement about rows that exist**, and a field whose row is absent is absent from the payload —
 * which is why `ConceptView`'s creative fields are all optional and none of them has a default.
 *
 * The other half of §31 is what makes the shape per-concept rather than per-batch:
 *
 * > Each concept becomes available as soon as its resolved spec exists; no concept waits on its
 * > siblings (§7.10).
 *
 * `previewable` is therefore derived from that concept's own verified spec and from nothing else.
 * No sibling's state, no batch state and no artwork state can withdraw it or delay it.
 *
 * # What is deliberately never read
 *
 * `spec.md §32 #41` forbids exposing backend generation counters, claim ids, attempt ordinals or
 * spend. The cheapest way to honour that is not to select them: the sibling query asks for
 * `status` and nothing else, the batch query asks for `round` and `status`, and neither
 * `generation_runs` nor `event_identity_call_claims` is touched at all. Prompts, raw trees, raw
 * DesignIntent, premises, premise rationale, provider and model strings and every version column
 * are likewise never loaded — `design_intent` is read for exactly two enum-valued fields and is
 * never passed on.
 *
 * # Recovery, on the read path
 *
 * `identity-orchestrator.ts` recovers this event's dead claims on every read rather than leaving a
 * waiting host to depend on a daily backstop. The same argument applies one level up and for a
 * sharper reason: `generation_batches_one_in_flight` has no expiry, so a batch whose process died
 * blocks the event for ever. `recoverStaleBatches` is that expiry, event-scoped and idempotent.
 *
 * Acceptance criteria: `spec.md §31 — Prompt, auth, and generation`. Guardrails: `spec.md §32
 * #41`, `#20`, `#24`.
 */

type Admin = SupabaseClient<Database>;

/* ------------------------------------------------------------------ the stale-batch bound */

/**
 * How long a batch may be in flight before a read declares its process dead.
 *
 * **Fifteen minutes, and the number is chosen from the wrong side of the trade.** A bound that is
 * too long costs a host whose batch genuinely crashed some minutes of waiting, on an event that is
 * already broken. A bound that is too short reaches into a batch that is *still running*: the live
 * process would go on to settle siblings against a batch this recovery had already settled,
 * `protect_generation_batch` would refuse to reopen it, and a concept that really was generated
 * could end up outside its own batch's outcome while a second paid batch starts alongside the
 * first. Those are not symmetric, so the bound sits far above the longest a batch can live.
 *
 * The measurements it is set from:
 *
 * | observed | |
 * | --- | --- |
 * | a full live batch, wall clock | ~87s |
 * | one Composition call | ~38s |
 *
 * A pessimistic run is worse than the observed one: one premise call, three DesignIntent calls,
 * three Composition calls each with the one permitted re-prompt (~76s), and rendered-geometry
 * verification at 390 and 1280 on top — call it 150s. Fifteen minutes is roughly ten times the
 * measured wall clock and six times that pessimistic estimate.
 *
 * It is also above every ceiling a batch process could survive to: the longest `maxDuration` in
 * this repository is 120s, and Vercel's hard platform maximum is 800s (13m20s). A batch older than
 * fifteen minutes cannot still be executing anywhere, whatever the route is configured to allow.
 */
export const STALE_BATCH_AFTER_MS = 15 * 60_000;

/**
 * Fail the dead siblings of this event's stuck batch, and settle it.
 *
 * Opportunistic and idempotent: on the overwhelmingly common path it matches no batch, does
 * nothing and returns. Scoped to one event for `expire_identity_call_claims`' reason — a waiting
 * host must not depend on a housekeeping job to clear the batch blocking their own event.
 *
 * A recovery failure is **not** allowed to fail the read. The projection below is truthful about
 * rows that exist whether or not the stuck batch was cleared; turning a transient RPC error into
 * `GENERATION_UNAVAILABLE` would hide three finished concepts because a cleanup step did not run.
 */
export async function recoverStaleBatches(admin: Admin, eventId: string): Promise<void> {
  const { data, error } = await admin.rpc("recover_stale_generation_batches", {
    p_event_id: eventId,
    p_stale_after_seconds: Math.floor(STALE_BATCH_AFTER_MS / 1000),
  });
  if (error) {
    console.error("generation: stale-batch recovery failed", error);
    return;
  }
  for (const row of data ?? []) {
    // Server-side only. A recovered batch is a crash that happened, and an operator should be able
    // to find it; none of this reaches the view.
    console.warn(
      `generation: recovered stale batch ${row.batch_id} — ` +
        `${row.failed_siblings} sibling(s) failed, batch settled ${row.status}`,
    );
  }
}

/* ------------------------------------------------------------------ the rows the view is made of */

/** The batch the view is about: the event's latest round, and only its two public-ish facts. */
export interface BatchRow {
  readonly round: number;
  readonly status: GenerationBatchStatus;
}

export interface SiblingRow {
  readonly conceptIndex: number;
  readonly status: GenerationBatchSiblingStatus;
}

/** One persisted DesignIntent artifact. `designIntent` is read for two fields and never passed on. */
export interface ArtifactRow {
  readonly conceptIndex: number;
  readonly presentation: unknown;
  readonly designIntent: unknown;
}

export interface ConceptRow {
  readonly conceptIndex: number;
  readonly conceptId: string;
  readonly activeSpecId: string | null;
}

export interface SpecRow {
  readonly id: string;
  readonly conceptId: string;
  readonly revision: number;
  readonly verifiedClean: boolean;
  readonly spec: unknown;
}

export interface SlotRow {
  readonly resolvedSpecId: string;
  readonly status: ArtworkSlotStatus;
}

/**
 * Everything the projection reads, and nothing else.
 *
 * A separate type from the queries below so the derivation is a pure function of rows: the stage
 * rules are the part that is easy to get subtly wrong, and they are testable over fixtures without
 * a database.
 */
export interface GenerationStateRows {
  /** The authoritative identity's own ranked tone keywords, or null when there is no identity. */
  readonly vibe: readonly string[] | null;
  /** Whether the event has an authoritative identity — the precondition for starting a batch. */
  readonly hasAuthoritativeIdentity: boolean;
  readonly batch: BatchRow | null;
  readonly siblings: readonly SiblingRow[];
  readonly artifacts: readonly ArtifactRow[];
  readonly concepts: readonly ConceptRow[];
  readonly specs: readonly SpecRow[];
  readonly slots: readonly SlotRow[];
}

/* ------------------------------------------------------------------ narrowing persisted JSON */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A non-empty string, or nothing. An empty name is not a name, and the view has no placeholder. */
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function textList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter((entry): entry is string => typeof entry === "string");
  return entries.length === value.length ? entries : undefined;
}

/**
 * The order the palette is flattened in.
 *
 * Spelled out rather than taken from `Object.keys`, because the spec is stored as `jsonb` and
 * Postgres does not preserve object key order — it stores keys sorted by length then bytes. A
 * projection that iterated the parsed object would hand the surface a different order than the
 * compiler emitted, and a different one again if a role were renamed.
 *
 * `ROLE_CONTRACT` in `compile/palette.ts` is not usable for this: it enumerates the roles that
 * carry a *contrast* obligation, which excludes the three surfaces. The `Record<SemanticRole, ...>`
 * below is exhaustive by construction, so adding a role to `SemanticPalette` without listing it
 * here is a compile error rather than a colour that silently disappears from the view.
 */
const PALETTE_ROLE_RANK: Record<SemanticRole, number> = {
  surfaceBase: 0,
  surfaceAlt: 1,
  surfaceAccent: 2,
  surfaceContrast: 3,
  text: 4,
  textMuted: 5,
  textOnContrast: 6,
  textOnAccent: 7,
  button: 8,
  buttonText: 9,
  accent: 10,
  accentText: 11,
  border: 12,
  focus: 13,
  error: 14,
  errorText: 15,
};

const PALETTE_ROLE_ORDER: readonly SemanticRole[] = (
  Object.keys(PALETTE_ROLE_RANK) as SemanticRole[]
).sort((a, b) => PALETTE_ROLE_RANK[a] - PALETTE_ROLE_RANK[b]);

/**
 * The compiled semantic palette, flattened.
 *
 * Read from `spec.tokens.palette` — the compiler's own output, the same place the Phase 4E smoke
 * reads it. Never from `DesignIntent.palette`: those are the model's raw creative colours and
 * `spec.md §32 #26` forbids using them as semantic roles, so showing them as "the palette" would
 * advertise colours the page does not contain.
 *
 * Deduped because several roles legitimately resolve to the same hex, and a host looking at a
 * swatch row should see the palette rather than sixteen entries with repeats.
 */
function palette(spec: unknown): readonly string[] | undefined {
  if (!isRecord(spec)) return undefined;
  const tokens = spec.tokens;
  if (!isRecord(tokens)) return undefined;
  const compiled = tokens.palette;
  if (!isRecord(compiled)) return undefined;

  const seen = new Set<string>();
  for (const role of PALETTE_ROLE_ORDER) {
    const hex = (compiled as Partial<SemanticPalette>)[role];
    if (typeof hex === "string" && hex.length > 0) seen.add(hex);
  }
  return seen.size > 0 ? [...seen] : undefined;
}

/* ------------------------------------------------------------------ the projection */

/**
 * The verified spec a concept renders from.
 *
 * `active_resolved_spec_id` is the canonical pointer and is preferred; the highest verified
 * revision is the fallback for the window between the spec insert and the pointer update, so a
 * concept is never reported as un-previewable because two statements had not both landed.
 *
 * `verified_clean` is filtered here even though the column carries `check (verified_clean)` and
 * cannot be false. `spec.md §32 #24` — "do not finalize or persist a spec that has not passed
 * rendered-geometry verification" — is the reason `previewable` exists at all, and reading the
 * column is what makes this code say so rather than inherit it.
 */
function activeSpec(concept: ConceptRow, specs: readonly SpecRow[]): SpecRow | null {
  const own = specs.filter((spec) => spec.conceptId === concept.conceptId && spec.verifiedClean);
  const active = own.find((spec) => spec.id === concept.activeSpecId);
  if (active) return active;
  let best: SpecRow | null = null;
  for (const spec of own) if (best === null || spec.revision > best.revision) best = spec;
  return best;
}

/**
 * What is known about one concept's artwork, as counts of rows.
 *
 * `reserved` counts as pending alongside `requested`, which is the honest reading of the lifecycle
 * from a row alone: both mean the slot has no outcome. The compiler reserves a slot whenever the
 * verified geometry admits one, and `spec.md §7.6a #1` makes the resulting page complete either
 * way — so this is telemetry about attachments, never a gate on the concept, and `previewable`
 * deliberately ignores it.
 */
function artwork(slots: readonly SlotRow[]): ConceptArtworkView | undefined {
  if (slots.length === 0) return undefined;
  let pending = 0;
  let delivered = 0;
  let failed = 0;
  for (const slot of slots) {
    if (slot.status === "delivered") delivered += 1;
    else if (slot.status === "failed") failed += 1;
    else pending += 1;
  }
  return { pending, delivered, failed };
}

/**
 * Where one concept stands, from the rows the pipeline writes in the order it writes them.
 *
 * `ready` is checked first and unconditionally, because a verified spec is the one fact that makes
 * a concept renderable and `spec.md §7.10 #5` makes that concept-level. Everything below it is the
 * question "what has it got so far", answered by the last row that exists.
 *
 * The settled-batch clause matters: a batch that has settled is not going to write anything more,
 * so a concept still sitting at `planned`, `designing` or `composing` inside one has failed —
 * whatever its sibling row says. Without it a crashed-then-recovered batch would leave a concept
 * reporting `composing` for ever, which is exactly the fabricated progress §31 forbids.
 */
function conceptStage(input: {
  readonly ready: boolean;
  readonly sibling: SiblingRow | undefined;
  readonly hasConcept: boolean;
  readonly hasArtifact: boolean;
  readonly batchInFlight: boolean;
}): ConceptStage {
  if (input.ready) return "ready";
  if (input.sibling?.status === "failed") return "failed";
  if (!input.batchInFlight) return "failed";
  if (input.hasConcept) return "composing";
  if (input.hasArtifact) return "designing";
  return "planned";
}

function generationStage(input: {
  readonly batch: BatchRow | null;
  readonly concepts: readonly ConceptView[];
}): GenerationStage {
  if (!input.batch) return "not_started";
  if (isBatchInFlight(input.batch.status)) {
    // `exploring` is the one premise call, which authors all three propositions as a set
    // (`spec.md §7.7a`). There is genuinely nothing per-concept to show during it, so the absence
    // of any concept-level stage is the honest signal rather than an elapsed-time guess.
    return input.concepts.some((concept) => concept.stage !== "planned")
      ? "designing"
      : "exploring";
  }
  const ready = input.concepts.filter((concept) => concept.stage === "ready").length;
  if (ready === 0) return "failed";
  return ready === input.concepts.length ? "ready" : "partial";
}

/**
 * Rows in, view out. Pure, and the whole derivation lives here.
 *
 * Exported so the stage rules can be proven over constructed fixtures — the same reason
 * `identityClarificationState` is pure and separate from its loader.
 */
export function projectGenerationView(rows: GenerationStateRows): GenerationView {
  const siblings = [...rows.siblings].sort((a, b) => a.conceptIndex - b.conceptIndex);
  const batchInFlight = rows.batch !== null && isBatchInFlight(rows.batch.status);

  const artifactByIndex = new Map(rows.artifacts.map((row) => [row.conceptIndex, row]));
  const conceptByIndex = new Map(rows.concepts.map((row) => [row.conceptIndex, row]));

  const concepts = siblings.map<ConceptView>((sibling) => {
    const index = sibling.conceptIndex;
    const artifact = artifactByIndex.get(index);
    const concept = conceptByIndex.get(index);
    const spec = concept ? activeSpec(concept, rows.specs) : null;

    const stage = conceptStage({
      ready: spec !== null,
      sibling,
      hasConcept: concept !== undefined,
      hasArtifact: artifact !== undefined,
      batchInFlight,
    });

    const presentation = isRecord(artifact?.presentation) ? artifact.presentation : undefined;
    const designIntent = isRecord(artifact?.designIntent) ? artifact.designIntent : undefined;

    const name = text(presentation?.name);
    const description = text(presentation?.description);
    const vocabulary = textList(designIntent?.motifs);
    const typography = text(designIntent?.typographyPairing);
    const colors = spec ? palette(spec.spec) : undefined;
    const slots = spec
      ? artwork(rows.slots.filter((slot) => slot.resolvedSpecId === spec.id))
      : undefined;

    // A concept is settled when nothing further is coming for it: its sibling has reached a
    // terminal state and no artwork slot is still outstanding.
    const settled =
      (sibling.status === "succeeded" || sibling.status === "failed" || !batchInFlight) &&
      (slots === undefined || slots.pending === 0);

    return {
      index,
      stage,
      previewable: spec !== null,
      settled,
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(colors !== undefined ? { palette: colors } : {}),
      ...(vocabulary !== undefined ? { vocabulary } : {}),
      ...(typography !== undefined ? { typography } : {}),
      ...(slots !== undefined ? { artwork: slots } : {}),
    };
  });

  const vibe = rows.vibe && rows.vibe.length > 0 ? rows.vibe : undefined;

  return {
    stage: generationStage({ batch: rows.batch, concepts }),
    ...(vibe !== undefined ? { vibe } : {}),
    concepts,
    // Two facts, not one. A batch in flight is the database's own control (the partial unique
    // index), and an event with no authoritative identity has nothing to plan a batch from — so
    // offering the action would be offering a refusal. Neither is a counter and neither says why.
    canStart: !batchInFlight && rows.hasAuthoritativeIdentity,
  };
}

/* ------------------------------------------------------------------ the reads */

/**
 * The identity's ranked tone keywords, and whether the identity is authoritative.
 *
 * `spec.md §7.7`'s authoritative pointer is the only source. The latest revision is deliberately
 * not consulted: a provisional revision asking a clarification question is not an interpretation
 * anything downstream may consume, and showing its vibe would advertise an understanding the
 * pipeline has not committed to.
 */
async function readVibe(
  admin: Admin,
  eventId: string,
): Promise<{ vibe: readonly string[] | null; hasAuthoritativeIdentity: boolean }> {
  const { data: events, error: eventError } = await admin
    .from("events")
    .select("authoritative_identity_revision_id")
    .eq("id", eventId)
    .limit(1);
  if (eventError) throw eventError;
  const revisionId = (events ?? [])[0]?.authoritative_identity_revision_id ?? null;
  if (!revisionId) return { vibe: null, hasAuthoritativeIdentity: false };

  const { data: revisions, error: revisionError } = await admin
    .from("event_identity_revisions")
    .select("result")
    .eq("id", revisionId)
    .limit(1);
  if (revisionError) throw revisionError;

  const result = (revisions ?? [])[0]?.result;
  const identity = isRecord(result) ? result.identity : undefined;
  const keywords = isRecord(identity) ? textList(identity.toneKeywords) : undefined;
  return { vibe: keywords ?? null, hasAuthoritativeIdentity: true };
}

/**
 * Read the event's generation state and project it.
 *
 * **A bounded number of queries, never one per concept.** Seven round trips whatever the batch
 * contains: the identity pointer, the identity revision, the latest batch, its siblings, the
 * round's artifacts, the round's concepts, their specs and their slots — the last two keyed by an
 * `in` over at most three ids. A per-concept read would be three times the latency for a surface
 * that is polled.
 *
 * The latest batch by round is the right one to look at: `plan_generation_batch` derives the round
 * as `max(round) + 1`, so an in-flight batch is always the highest round the event has.
 *
 * Authorization is the **caller's** job, exactly as it is for `eventIdentityState`: this takes a
 * service-role client and would happily read any event.
 */
export async function readGenerationState(admin: Admin, eventId: string): Promise<GenerationView> {
  // Before projecting, not after: a batch whose process died would otherwise be reported as
  // in flight for ever, and `canStart` would stay false on an event nothing can ever unblock.
  await recoverStaleBatches(admin, eventId);

  const [identity, { data: batches, error: batchError }] = await Promise.all([
    readVibe(admin, eventId),
    admin
      .from("generation_batches")
      .select("id, round, status")
      .eq("event_id", eventId)
      .order("round", { ascending: false })
      .limit(1),
  ]);
  if (batchError) throw batchError;

  const batchRow = (batches ?? [])[0] ?? null;
  if (!batchRow) {
    return projectGenerationView({
      vibe: identity.vibe,
      hasAuthoritativeIdentity: identity.hasAuthoritativeIdentity,
      batch: null,
      siblings: [],
      artifacts: [],
      concepts: [],
      specs: [],
      slots: [],
    });
  }

  const round = batchRow.round;
  const [
    { data: siblingRows, error: siblingError },
    { data: artifactRows, error: artifactError },
    { data: conceptRows, error: conceptError },
  ] = await Promise.all([
    admin
      .from("generation_batch_siblings")
      .select("concept_index, status")
      .eq("batch_id", batchRow.id),
    admin
      .from("design_intent_artifacts")
      .select("concept_index, presentation, design_intent")
      .eq("batch_id", batchRow.id),
    admin
      .from("design_concepts")
      .select("id, concept_index, active_resolved_spec_id")
      .eq("event_id", eventId)
      .eq("round", round),
  ]);
  if (siblingError) throw siblingError;
  if (artifactError) throw artifactError;
  if (conceptError) throw conceptError;

  const concepts: ConceptRow[] = (conceptRows ?? []).map((row) => ({
    conceptIndex: row.concept_index,
    conceptId: row.id,
    activeSpecId: row.active_resolved_spec_id,
  }));

  let specs: SpecRow[] = [];
  let slots: SlotRow[] = [];
  if (concepts.length > 0) {
    const { data: specRows, error: specError } = await admin
      .from("resolved_design_specs")
      .select("id, concept_id, revision, verified_clean, spec")
      .in(
        "concept_id",
        concepts.map((concept) => concept.conceptId),
      );
    if (specError) throw specError;
    specs = (specRows ?? []).map((row) => ({
      id: row.id,
      conceptId: row.concept_id,
      revision: row.revision,
      verifiedClean: row.verified_clean,
      spec: row.spec,
    }));

    if (specs.length > 0) {
      const { data: slotRows, error: slotError } = await admin
        .from("resolved_spec_artwork_slots")
        .select("resolved_spec_id, status")
        .in(
          "resolved_spec_id",
          specs.map((spec) => spec.id),
        );
      if (slotError) throw slotError;
      slots = (slotRows ?? []).map((row) => ({
        resolvedSpecId: row.resolved_spec_id,
        status: row.status,
      }));
    }
  }

  return projectGenerationView({
    vibe: identity.vibe,
    hasAuthoritativeIdentity: identity.hasAuthoritativeIdentity,
    batch: { round, status: batchRow.status },
    siblings: (siblingRows ?? []).map((row) => ({
      conceptIndex: row.concept_index,
      status: row.status,
    })),
    artifacts: (artifactRows ?? []).map((row) => ({
      conceptIndex: row.concept_index,
      presentation: row.presentation,
      designIntent: row.design_intent,
    })),
    concepts,
    specs,
    slots,
  });
}
