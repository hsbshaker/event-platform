/**
 * Database contract for the Supabase client.
 *
 * Hand-authored for the Phase 1 migration (supabase/migrations/20260912000000_phase1_core.sql).
 *
 * **How a server-controlled column is classified here**, so the next one is treated the same way.
 * If the database *raises* for every caller, the column is omitted from `Insert` entirely, so the
 * compiler refuses it before Postgres does — `event_identity_revisions.is_provisional` is
 * `GENERATED ALWAYS` and rejected with SQLSTATE 428C9. If the database *silently overwrites*, the
 * column stays insert-optional, because supplying it is legal and simply has no effect —
 * `events.row_version`. And if some callers may legitimately write it, it stays insert-optional
 * too — `events.authoritative_identity_revision_id`, which service-role code sets and end users
 * cannot. A whole table that refuses every UPDATE is `AppendOnlyTable` rather than `Table`.
 * Regenerate with `npm run db:types` against a local stack when the schema changes; keep the
 * generated file in sync with the migration in the same PR.
 */
import type { Json } from "./json";

export type { Json };

export type EventStatus =
  "DRAFT" | "DESIGN_SELECTED" | "READY_TO_PUBLISH" | "PUBLISHED" | "PASSED" | "ARCHIVED";
export type EventVisibility = "public" | "private";
export type EventMemberRole = "owner" | "cohost";
/** Outcomes of public.claim_pre_auth_draft (supabase/migrations/20260913010000_phase2_prompt_auth.sql). */
export type ClaimOutcome =
  "claimed" | "already_claimed_by_user" | "claimed_by_other" | "expired" | "not_found";

/** Outcomes of public.attach_inspiration_asset (supabase/migrations/20260913020000_phase2_asset_consistency.sql). */
export type AttachInspirationOutcome = "attached" | "limit_reached" | "gone";

export type ModelOperation =
  | "event_identity"
  /** One per concept batch, ahead of the three DesignIntent calls (`spec.md §7.7a`). */
  | "concept_premise"
  | "design_intent"
  | "composition"
  | "structured_extraction";

/**
 * Claim states for one EventIdentity call
 * (supabase/migrations/20260916000000_phase4b_identity_call_claims.sql).
 *
 * `claimed` and `response_captured` are non-terminal; the other four are terminal.
 * `response_captured` deliberately has no expiry — expiring it would strand a paid response.
 */
export type IdentityCallClaimState =
  | "claimed"
  | "response_captured"
  | "succeeded"
  | "failed_terminal"
  | "expired_unknown"
  | "abandoned"
  /** Captured, paid, and undeliverable: distinct from a failed *call*, and terminal so the event
   * is released. */
  | "recovery_failed";

/** Outcomes of public.claim_identity_call. Only `claimed` reaches the provider. */
export type IdentityClaimOutcome =
  | "claimed"
  | "in_flight"
  | "duplicate_key"
  | "ceiling"
  | "cap_event"
  | "cap_account"
  | "rate_limited";

/**
 * The batch lifecycle (20260917000000_phase4c_t16_generation_batches.sql,
 * `docs/phase-4b-plan.md §H.2`, `§I`).
 *
 * `planned` and `running` are the in-flight pair the partial unique index is written over, so at
 * most one batch per event can hold either at a time. There is deliberately no `cancelled`: §C says
 * an in-flight batch is never cancelled, and a state nothing may reach is an invitation to reach it.
 */
export type GenerationBatchStatus = "planned" | "running" | "completed" | "failed";

/** Per-sibling status. `succeeded` holds iff a successful run row is named (a check constraint). */
export type GenerationBatchSiblingStatus = "pending" | "running" | "succeeded" | "failed";

/** Outcomes of public.plan_generation_batch. Only `planned` creates a batch. */
export type PlanGenerationBatchOutcome =
  | "planned"
  | "in_flight"
  | "duplicate_key"
  | "stale_round"
  | "not_authoritative"
  | "ceiling"
  | "cap_event"
  | "cap_account"
  | "rate_limited";

/** Outcomes of public.record_batch_sibling_run. */
export type RecordSiblingRunOutcome =
  "recorded" | "duplicate_key" | "already_succeeded" | "stale_attempt";

/**
 * Outcomes of public.record_batch_call_run.
 *
 * Two, not four: with no sibling row to compare against there is no `stale_attempt`, and no
 * per-sibling success to converge on as `already_succeeded` — a replay collides on the idempotency
 * key instead.
 */
export type RecordBatchCallRunOutcome = "recorded" | "duplicate_key";

/**
 * Outcomes of public.record_sibling_stage_run
 * (20260919000000_phase4d_composition_lineage.sql).
 *
 * The same four as `record_batch_sibling_run`, because it makes the same two refusals: a sibling
 * that has already succeeded takes no further paid call, and a run recorded against an ordinal the
 * sibling has moved past would let a stale driver overwrite a later attempt's history.
 */
export type RecordSiblingStageRunOutcome =
  "recorded" | "duplicate_key" | "already_succeeded" | "stale_attempt";

/** Outcomes of public.settle_batch_sibling. `already_succeeded` makes re-settling idempotent. */
export type SettleBatchSiblingOutcome = "succeeded" | "failed" | "already_succeeded";

/**
 * The four in-scope artwork roles of `spec.md §7.6a`
 * (20260919120000_phase4e_artwork_lineage.sql).
 *
 * Mirrors `ARTWORK_ROLES` in `src/lib/ai/visual-art/contract.ts`, which records that the list is
 * canon's rather than the code's and that "a fifth role is a compiler change and a version bump".
 * `src/lib/generation/persist-artwork.ts` ties the two spellings together at compile time, and
 * `tests/db/phase4e-artwork.test.ts` reads the enum's labels back out of the database.
 */
export type ArtworkRole = "anchor" | "object" | "atmosphere" | "framed";

/**
 * The lifecycle of one artwork slot.
 *
 * `reserved` is the default **and a complete state**: the box exists in verified geometry and no
 * request has been made, which is what a page whose creative direction chose no artwork looks
 * like. It is not a pending write. `delivered` and `failed` are terminal and frozen, and the
 * database refuses a backward transition.
 */
export type ArtworkSlotStatus = "reserved" | "requested" | "delivered" | "failed";

/** What an asset may be. Alpha is measured per asset, so a format without it is still admissible. */
export type ArtworkContentType = "image/png" | "image/webp" | "image/avif" | "image/jpeg";

/** How an artwork request failed, terminally. Classified, so the reason survives the provider. */
export type ArtworkFailureKind =
  "provider_unavailable" | "provider_refused" | "provider_error" | "timeout" | "asset_rejected";

/** Outcomes of public.request_artwork_slot. `already_requested` changes nothing. */
export type RequestArtworkSlotOutcome = "requested" | "already_requested";

/**
 * Outcomes of public.attach_artwork_asset.
 *
 * `already_delivered` is the idempotent replay of the *same* asset. A different asset against a
 * delivered slot is not an outcome — it raises, because the alternative is last-write-wins.
 */
export type AttachArtworkAssetOutcome = "attached" | "already_delivered";

/** Outcomes of public.fail_artwork_slot. The first classification stands. */
export type FailArtworkSlotOutcome = "failed" | "already_failed";

type ProfileRow = {
  id: string;
  email: string | null;
  name: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  owner_id: string;
  type: string;
  prompt: string;
  title: string | null;
  description: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  timezone: string | null;
  venue_name: string | null;
  address: string | null;
  hosts: string | null;
  baby_name: string | null;
  generation_requested_at: string | null;
  visibility: EventVisibility | null;
  access_code_encrypted: string | null;
  rsvp_deadline: string | null;
  rsvp_deadline_edited: boolean;
  status: EventStatus;
  slug: string | null;
  active_concept_id: string | null;
  design_overrides: Json | null;
  message_sends_used: number;
  published_at: string | null;
  paid_at: string | null;
  /**
   * The identity revision this event's design work reads (20260915000000_phase4b_identity_revisions).
   *
   * Server-controlled, and by a different mechanism from `row_version`:
   * `protect_event_server_columns` enumerates this column and refuses an end-user update on both
   * its branches, where `row_version` is not enumerated there at all and is instead overwritten
   * silently by `bump_event_row_version`. `validate_authoritative_identity` additionally
   * re-derives provisional state from the revision's own JSON before allowing it to move. So a
   * caller can read it and service-role code can set it, but it is never something application
   * code sets on behalf of a signed-in user.
   */
  authoritative_identity_revision_id: string | null;
  /**
   * Optimistic concurrency token (20260913040000_phase2_event_row_version.sql). A trigger
   * increments it on every update and overwrites anything the caller supplies, so it is
   * readable and usable as an update filter but never written by application code.
   */
  row_version: number;
  created_at: string;
  updated_at: string;
};

type EventMemberRow = {
  event_id: string;
  user_id: string;
  role: EventMemberRole;
  created_at: string;
};

type PreAuthEventDraftRow = {
  id: string;
  draft_token_hash: string;
  prompt: string;
  composer_state: Json | null;
  /**
   * Lowercased address a sign-in link was requested for
   * (20260913030000_phase2_email_claim.sql), so the callback can restore this draft when the link
   * is opened in another browser.
   *
   * Absent from this contract until the Phase 4B sync found it: a real column, live since Phase 2,
   * that no type described. It is exactly what the drift test now exists to catch.
   */
  claim_email: string | null;
  claimed_by: string | null;
  claimed_event_id: string | null;
  claimed_at: string | null;
  expires_at: string;
  created_at: string;
};

type InspirationAssetRow = {
  id: string;
  event_id: string | null;
  pre_auth_draft_id: string | null;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  expires_at: string | null;
  created_at: string;
};

type EventIdentityRow = {
  event_id: string;
  identity: Json;
  prompt_version: string;
  schema_version: string;
  created_at: string;
  updated_at: string;
};

/**
 * One successfully generated DesignIntent sibling
 * (20260917210000_phase4c_t17_design_intent_artifacts.sql, `docs/phase-4b-plan.md §G.2`, `§G.4`).
 *
 * Append-only: `reject_update()` refuses every UPDATE with no carve-out, which is why the table
 * below is `AppendOnlyTable`. Before composition a sibling *is* `(batch_id, concept_index)`
 * (`§G.3` point 4); from composition onward `design_concepts.id` identifies the concept, and
 * `design_concepts.design_intent_artifact_id` is the lineage in the one direction canon allows.
 */
type DesignIntentArtifactRow = {
  id: string;
  event_id: string;
  /** The batch this sibling belongs to; `(batch_id, concept_index)` is unique. */
  batch_id: string;
  /** Which identity produced this — part of `§G.4`'s attribution tuple. */
  identity_revision_id: string;
  concept_index: number;
  round: number;
  planner_version: string;
  /** family, tonal direction, typography category, hierarchy. */
  assignment: Json;
  /**
   * Recorded for lineage, and **not** inputs to the DesignIntent call — `§G.4` is explicit that
   * both are composition's. `not null` here, where `design_concepts` still types them nullable for
   * its pre-4C shape; the insert-time equality check makes a 4C concept supply them.
   */
  directive: Json;
  token_allotment: Json;
  design_intent_prompt_version: string;
  design_intent_schema_version: string;
  design_intent_input_assembly_version: string;
  provider: string;
  model: string;
  provider_config: Json | null;
  provider_request_id: string | null;
  /**
   * Deliberately not a foreign key (see the migration): `on delete set null` would make the
   * referential-integrity system UPDATE this immutable row, so pruning telemetry would fail. The
   * same rule applies to any column added to this table later.
   */
  generation_run_id: string | null;
  /** The validated output, immutable. Its shape is T18's contract, not this file's. */
  design_intent: Json;
  /**
   * The premise this concept was authored from, and the three versions that produced it
   * (`spec.md §7.7a`, `docs/model-contracts.md §4.8`).
   *
   * One member of the batch's set of three, bound by `concept_index`. Recorded because after
   * `design_intent_input_v2` the premise is one of the things `§G.4`'s attribution tuple names:
   * without it the row would describe a concept whose creative direction came from somewhere it
   * cannot name. A payload snapshot, not a pointer — the artifact is evidence.
   */
  concept_premise: Json;
  concept_premise_prompt_version: string;
  concept_premise_schema_version: string;
  concept_premise_input_assembly_version: string;
  /** Non-design, host-facing concept metadata: `{ name, description }`, both non-empty strings. */
  presentation: Json;
  /**
   * What the deterministic set review changed about the card above, logged by kind.
   *
   * `presentation` can only hold a **resolved** card, and `spec.md §7.8`'s duplicate-name fallback
   * is decidable only across three siblings at once — so for a repaired sibling the card here is
   * not the one the model returned. Each entry carries the rule, the path, the before and the
   * after, which is what keeps that substitution recoverable rather than silent. `[]` is the true
   * and complete value for a card that needed no repair.
   */
  card_deviations: Json;
  created_at: string;
};

type DesignConceptRow = {
  id: string;
  event_id: string;
  round: number;
  concept_index: number;
  name: string;
  description: string;
  design_intent: Json;
  /**
   * The artifact this concept was composed from
   * (20260917210000_phase4c_t17_design_intent_artifacts.sql, `docs/phase-4b-plan.md §G.3`).
   *
   * `NOT NULL`, and enumerated by `protect_design_concept()` so it cannot be re-pointed at another
   * sibling's artifact after insert. A BEFORE INSERT trigger additionally requires the concept to
   * agree with the artifact on every column they both carry: `design_intent`, `event_id`, `round`,
   * `concept_index`, the two DesignIntent version columns, `directive` and `token_allotment`.
   */
  design_intent_artifact_id: string;
  composition_raw: Json;
  composition: Json;
  composition_hash: string;
  capabilities: Json;
  /**
   * The `ContentProfile` this composition was fitted against
   * (20260919000000_phase4d_composition_lineage.sql, `docs/event-renderer-system.md §2.3`).
   *
   * `NOT NULL` and immutable. It records which fields were bounded provisional stand-ins at
   * generation time, which is what a later content edit re-fits against (`spec.md §7.3`, §4.10).
   */
  content_profile: Json;
  directive: Json | null;
  token_allotment: Json | null;
  fallback: string | null;
  design_intent_prompt_version: string;
  design_intent_schema_version: string;
  composition_prompt_version: string;
  composition_schema_version: string;
  /** Which assembly built the Composition request, beside its prompt and schema versions. */
  composition_input_assembly_version: string;
  primitive_set_version: string;
  compiler_version: string;
  active_resolved_spec_id: string | null;
  selected_at: string | null;
  created_at: string;
};

type ResolvedDesignSpecRow = {
  id: string;
  concept_id: string;
  revision: number;
  spec: Json;
  content_version: number;
  supersedes_spec_id: string | null;
  verified_clean: boolean;
  compiler_version: string;
  primitive_set_version: string;
  created_at: string;
};

/**
 * One reserved artwork box inside one frozen spec revision, and the asset that may later attach
 * to it (20260919120000_phase4e_artwork_lineage.sql).
 *
 * Keyed by `(resolved_spec_id, slot_id)` and never folded into `resolved_design_specs.spec`: the
 * spec is compiled, geometry-verified at 390 and 1280 and frozen *before any image exists*, and
 * `spec.md §32 #18` makes it immutable. An asset attaches afterwards — or never — and a slot with
 * no asset is a complete, renderable artifact rather than a half-written row.
 *
 * Every provider column is nullable because no image model has been selected and none has been
 * called: a row with a fully assembled `visual_art_intent` and nothing else is expected, not
 * partial.
 */
type ResolvedSpecArtworkSlotRow = {
  id: string;
  resolved_spec_id: string;
  slot_id: string;
  role: ArtworkRole;
  extent: string;
  mobile_width_px: number;
  mobile_height_px: number;
  desktop_width_px: number;
  desktop_height_px: number;
  visual_art_intent: Json;
  visual_art_intent_version: string;
  status: ArtworkSlotStatus;
  provider: string | null;
  model: string | null;
  artwork_prompt_version: string | null;
  artwork_contract_version: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  width_px: number | null;
  height_px: number | null;
  /** `bigint`, which PostgREST and node-postgres both return as a string. */
  byte_size: string | null;
  content_type: ArtworkContentType | null;
  /** Measured from the delivered bytes; never inferred from `role`. */
  has_alpha: boolean | null;
  failure_kind: ArtworkFailureKind | null;
  failure_detail: string | null;
  latency_ms: number | null;
  /** `numeric`, returned as a string so no precision is lost on the way through. */
  cost_estimate_usd: string | null;
  created_at: string;
  requested_at: string | null;
  settled_at: string | null;
};

type GenerationRunRow = {
  id: string;
  event_id: string;
  user_id: string | null;
  provider: string;
  provider_request_id: string | null;
  operation: ModelOperation;
  round: number | null;
  concept_index: number | null;
  model: string;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  /** Cache **writes**, billed at a premium over uncached input. Reads are `cached_input_tokens`. */
  cache_write_input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  cost_estimate_usd: number | null;
  latency_ms: number;
  success: boolean;
  error_code: string | null;
  prompt_version: string;
  /**
   * Which input assembly produced the request (20260915000000_phase4b_identity_revisions).
   *
   * Nullable with no default: rows written before Phase 4B have none, and the column moves
   * independently of `prompt_version` and `schema_version` — `event_identity_input_v2` changed
   * what the model saw while both of those stayed still.
   */
  input_assembly_version: string | null;
  schema_version: string;
  /**
   * Which deterministic sibling planner chose this run's assignment
   * (20260917000000_phase4c_t16_generation_batches, `docs/phase-4b-plan.md §G.5`).
   *
   * Nullable and never backfilled: an `event_identity` call is not planned, and every row written
   * before Phase 4C has no planner. Replay identity for a batch is the identity revision plus this
   * version (`§D`), which is only checkable because it is recorded per run rather than inferred
   * from whatever `PLANNER_VERSION` happens to be today.
   */
  planner_version: string | null;
  primitive_set_version: string | null;
  compiler_version: string | null;
  diversity_assignment: Json | null;
  schema_valid_first_call: boolean | null;
  reprompts: Json | null;
  compiler_repairs: Json | null;
  verified: Json | null;
  signature: string | null;
  nearest_sibling: number | null;
  fallback: string | null;
  idempotency_key: string | null;
  /** When the retention job dropped the evidence, so "purged" is distinguishable from "n/a". */
  provider_response_evidence_purged_at: string | null;
  /**
   * Ordered paid provider response texts, oldest first
   * (`docs/phase-4b-plan.md §A.7`).
   *
   * `null` means the evidence contract does not apply to this run, or the run predates it. `[]`
   * means the contract applies and **no response text was captured** — which is not a claim that
   * nothing was billed; an ambiguous transport failure can reach provider execution. What was
   * spent is `cost_estimate_usd`'s question, and it charges such an attempt the per-attempt
   * maximum rather than zero.
   *
   * Server-only: the table has RLS on with no policies and is revoked from `anon` and
   * `authenticated`, and this field is never returned to a user.
   */
  provider_response_evidence: Json | null;
  created_at: string;
};

type RateLimitRow = {
  bucket: string;
  key_hash: string;
  window_start: string;
  count: number;
};

/**
 * A Human Test #1 reviewer response
 * (supabase/migrations/20260913050000_human_test_1_responses.sql). Both the real and the
 * synthetic table share this shape on purpose, so the submit path is one code path; which
 * table a submission lands in is decided server-side from a secret, never from the request.
 */
type HumanTest1ResponseRow = {
  id: string;
  reviewer: string;
  response_payload: Json;
  submission_key: string;
  created_at: string;
};

/**
 * One persisted EventIdentity result (20260915000000_phase4b_identity_revisions.sql).
 *
 * Immutable: `protect_identity_revision` refuses every UPDATE, carving out only the DELETE that
 * arrives inside an event's cascade. That is why its table below is `AppendOnlyTable` rather than
 * `Table` — a `.update()` here is not a runtime error to discover, it is a shape the contract
 * should refuse to describe.
 */
type EventIdentityRevisionRow = {
  id: string;
  event_id: string;
  revision: number;
  result: Json;
  prompt_version: string;
  schema_version: string;
  input_assembly_version: string;
  provider: string;
  model: string;
  provider_config: Json | null;
  provider_request_id: string | null;
  /**
   * Deliberately not a foreign key (see the migration): `on delete set null` would make the
   * referential-integrity system UPDATE this immutable row, so pruning telemetry would fail.
   */
  generation_run_id: string | null;
  /** The answers this revision was generated from, validated against `clarification_answers`. */
  clarification_answer_ids: string[];
  /**
   * `GENERATED ALWAYS AS (identity_is_provisional(result, schema_version)) STORED`.
   *
   * Readable, never writable — Postgres rejects an insert that supplies it with SQLSTATE 428C9.
   * It is omitted from `Insert` below rather than made optional, so the compiler refuses the
   * mistake instead of the database refusing it at runtime.
   */
  is_provisional: boolean | null;
  created_at: string;
};

/**
 * One clarification answer, bound to the question it answers
 * (20260915010000_phase4b_clarification_answers.sql).
 *
 * Append-only for the same reason as the revisions: `protect_clarification_answer` refuses every
 * UPDATE, and there is no RLS policy for one either. A correction is not in scope — the host
 * answers again by answering the next round's question.
 */
type ClarificationAnswerRow = {
  id: string;
  event_id: string;
  identity_revision_id: string;
  /** The ordinal in that revision's `clarification.questions`. Half of the locator. */
  question_index: number;
  round: number;
  kind: "creative" | "boundary";
  /** Copied from the question and checked against it by the insert trigger. */
  question_text: string;
  options: Json;
  selected_option_label: string | null;
  free_text: string | null;
  is_defer: boolean;
  answered_by: string;
  answered_at: string;
};

/** Columns with defaults or generated values are optional on insert. */
type Insert<Row, Optional extends keyof Row> = Omit<Row, Optional> & Partial<Pick<Row, Optional>>;

type Table<Row, Ins> = {
  Row: Row;
  Insert: Ins;
  Update: Partial<Ins>;
  Relationships: [];
};

/**
 * A table the database refuses to update.
 *
 * `Update: Record<string, never>` makes any field passed to `.update()` an excess property, so an
 * append-only table's immutability is a compile error rather than a trigger firing in production.
 *
 * Four tables today. The two Phase 4B evidence tables carve out only the DELETE that arrives
 * inside an event's cascade, while `resolved_design_specs` and `design_intent_artifacts` are
 * stricter still: `reject_update()` raises on every UPDATE with no carve-out at all — for the
 * artifacts that is `docs/phase-4b-plan.md §G.2`'s "a protect trigger refusing every UPDATE", and
 * their DELETE needs no carve-out because the trigger is scoped to UPDATE and the event cascade is
 * therefore never refused. `resolved_design_specs` is the immutability `spec.md §32 #18`
 * and `CLAUDE.md §2` make load-bearing — "generated design data is immutable" — and it was typed
 * `Table` here, so `.update()` on it compiled and would have failed only in production.
 * `design_concepts` is deliberately not in this set: its protect trigger permits
 * `active_resolved_spec_id` and `selected_at`.
 */
type AppendOnlyTable<Row, Ins> = {
  Row: Row;
  Insert: Ins;
  Update: Record<string, never>;
  Relationships: [];
};

/**
 * A table the application only ever reads directly; every write goes through a `security definer`
 * RPC.
 *
 * `event_identity_call_claims` is the first. Its whole value is that cap consumption, the claim
 * insert and each state transition happen inside one transaction with the right guard — a
 * `.insert()` or `.update()` from application code would bypass exactly the atomicity the table
 * exists to provide, so the contract refuses both at compile time rather than hoping nobody tries.
 */
/**
 * A table the application inserts into directly, and only ever *changes* through a
 * `security definer` RPC.
 *
 * `resolved_spec_artwork_slots` is the first. Reserving a slot is an ordinary insert alongside the
 * revision it belongs to, but every later transition — requested, delivered, failed — carries
 * guards that must hold inside one transaction: forward-only status, a terminal state that is
 * frozen, and an idempotent attach that converges on the asset already stored rather than
 * overwriting it. A `.update()` from application code would bypass all three, so the contract
 * refuses it at compile time.
 */
type RpcUpdatedTable<Row, Ins> = {
  Row: Row;
  Insert: Ins;
  Update: Record<string, never>;
  Relationships: [];
};

type RpcWrittenTable<Row> = {
  Row: Row;
  Insert: Record<string, never>;
  Update: Record<string, never>;
  Relationships: [];
};

/**
 * One EventIdentity call's claim
 * (supabase/migrations/20260916000000_phase4b_identity_call_claims.sql, `docs/phase-4b-plan.md §A.5`).
 *
 * Inserted before the provider is reached, in the same transaction that consumes the caps, so
 * uniqueness happens before spend rather than after it.
 */
type EventIdentityCallClaimRow = {
  id: string;
  event_id: string;
  /** sha256 over (event_id, operation, basis_digest, attempt_ordinal). Unique. */
  attempt_key: string;
  /** Stored, not recovered from the key: the ordinal rule has to query by basis, and a hash cannot be. */
  basis_digest: string;
  attempt_ordinal: number;
  /**
   * The rest of the basis, stored because recovery needs it.
   *
   * A `response_captured` claim may be completed by a different request, or by the sweeper with no
   * request at all, and the revision it writes still has to name the answers this call carried.
   */
  clarification_answer_ids: string[];
  provider_config: Json;
  claimed_by: string;
  claimed_at: string;
  lease_expires_at: string;
  /**
   * Committed on its own before the provider is reached. `abandoned` means *provably unpaid*, and
   * that meaning rests entirely on this being null at expiry.
   */
  provider_invoked_at: string | null;
  state: IdentityCallClaimState;
  generation_run_id: string | null;
  settled_at: string | null;
  /** Server-side diagnostic. Never surfaced to a host. */
  recovery_failure_reason: string | null;
  recovery_attempts: number;
};

/**
 * One planned concept batch
 * (supabase/migrations/20260917000000_phase4c_t16_generation_batches.sql,
 * `docs/phase-4b-plan.md §G.5`, `§H.2`).
 *
 * Every column but `status` and the timestamps is an input, and a trigger refuses to let an input
 * change after insert — which is §C's "not cancelled, mutated or re-based" as a database fact
 * rather than a rule reviewers have to remember.
 */
type GenerationBatchRow = {
  id: string;
  event_id: string;
  /** The revision this batch was planned from: one answer to "which identity produced this". */
  identity_revision_id: string;
  planner_version: string;
  /** Derived server-side as max(round) + 1; never supplied by a client. */
  round: number;
  status: GenerationBatchStatus;
  /** sha256 over (event_id, 'concept_batch', identity_revision_id, planner_version, round). */
  idempotency_key: string;
  created_at: string;
  /** When the first sibling was issued. Null while the batch is still `planned`. */
  started_at: string | null;
  /** Set iff the batch is settled; the table's check constraint ties the two together. */
  settled_at: string | null;
};

/**
 * One sibling of a batch: the planner's assignment, persisted at plan time, and its status.
 *
 * `plan` is immutable. Resumption asks "which siblings have no successful run", which is exactly
 * `status <> 'succeeded'`, and `attempt` is the ordinal that — with the batch id, the operation and
 * the concept index — derives that sibling's `generation_runs.idempotency_key` (§H.2 row 4).
 */
type GenerationBatchSiblingRow = {
  batch_id: string;
  /** 0, 1 or 2 — the planner's index (`spec.md §7.7`). */
  concept_index: number;
  plan: Json;
  status: GenerationBatchSiblingStatus;
  attempt: number;
  /** The successful run, and only a successful one. */
  generation_run_id: string | null;
  started_at: string | null;
  settled_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        Insert<ProfileRow, "email" | "name" | "created_at" | "updated_at">
      >;
      events: Table<
        EventRow,
        Insert<
          EventRow,
          | "id"
          | "type"
          | "title"
          | "description"
          | "event_date"
          | "start_time"
          | "end_time"
          | "timezone"
          | "venue_name"
          | "address"
          | "hosts"
          | "baby_name"
          | "generation_requested_at"
          | "visibility"
          | "access_code_encrypted"
          | "rsvp_deadline"
          | "rsvp_deadline_edited"
          | "status"
          | "slug"
          | "active_concept_id"
          | "design_overrides"
          | "message_sends_used"
          | "published_at"
          | "paid_at"
          | "authoritative_identity_revision_id"
          | "row_version"
          | "created_at"
          | "updated_at"
        >
      >;
      event_members: Table<EventMemberRow, Insert<EventMemberRow, "created_at">>;
      pre_auth_event_drafts: Table<
        PreAuthEventDraftRow,
        Insert<
          PreAuthEventDraftRow,
          | "id"
          | "composer_state"
          | "claim_email"
          | "claimed_by"
          | "claimed_event_id"
          | "claimed_at"
          | "expires_at"
          | "created_at"
        >
      >;
      inspiration_assets: Table<
        InspirationAssetRow,
        Insert<
          InspirationAssetRow,
          "id" | "event_id" | "pre_auth_draft_id" | "expires_at" | "created_at"
        >
      >;
      event_identities: Table<
        EventIdentityRow,
        Insert<EventIdentityRow, "created_at" | "updated_at">
      >;
      design_intent_artifacts: AppendOnlyTable<
        DesignIntentArtifactRow,
        Insert<
          DesignIntentArtifactRow,
          "id" | "provider_config" | "provider_request_id" | "generation_run_id" | "created_at"
        >
      >;
      design_concepts: Table<
        DesignConceptRow,
        Insert<
          DesignConceptRow,
          | "id"
          | "directive"
          | "token_allotment"
          | "fallback"
          | "active_resolved_spec_id"
          | "selected_at"
          | "created_at"
        >
      >;
      resolved_design_specs: AppendOnlyTable<
        ResolvedDesignSpecRow,
        Insert<ResolvedDesignSpecRow, "id" | "supersedes_spec_id" | "created_at">
      >;
      resolved_spec_artwork_slots: RpcUpdatedTable<
        ResolvedSpecArtworkSlotRow,
        Insert<
          ResolvedSpecArtworkSlotRow,
          // Everything a *reservation* does not know. The status defaults to `reserved`, and every
          // provider, asset, failure and telemetry column is null until something later fills it
          // through one of the three RPCs.
          | "id"
          | "status"
          | "provider"
          | "model"
          | "artwork_prompt_version"
          | "artwork_contract_version"
          | "storage_bucket"
          | "storage_path"
          | "width_px"
          | "height_px"
          | "byte_size"
          | "content_type"
          | "has_alpha"
          | "failure_kind"
          | "failure_detail"
          | "latency_ms"
          | "cost_estimate_usd"
          | "created_at"
          | "requested_at"
          | "settled_at"
        >
      >;
      event_identity_revisions: AppendOnlyTable<
        EventIdentityRevisionRow,
        Insert<
          // `is_provisional` is generated by the database and rejected on insert (428C9), so it is
          // not part of the insert shape at all.
          Omit<EventIdentityRevisionRow, "is_provisional">,
          | "id"
          | "provider_config"
          | "provider_request_id"
          | "generation_run_id"
          | "clarification_answer_ids"
          | "created_at"
        >
      >;
      clarification_answers: AppendOnlyTable<
        ClarificationAnswerRow,
        Insert<
          ClarificationAnswerRow,
          "id" | "selected_option_label" | "free_text" | "is_defer" | "answered_at"
        >
      >;
      generation_runs: Table<
        GenerationRunRow,
        Insert<
          GenerationRunRow,
          | "id"
          | "user_id"
          | "provider_request_id"
          | "round"
          | "concept_index"
          | "input_tokens"
          | "cached_input_tokens"
          | "cache_write_input_tokens"
          | "output_tokens"
          | "reasoning_tokens"
          | "cost_estimate_usd"
          | "error_code"
          | "input_assembly_version"
          | "planner_version"
          | "primitive_set_version"
          | "compiler_version"
          | "diversity_assignment"
          | "schema_valid_first_call"
          | "reprompts"
          | "compiler_repairs"
          | "verified"
          | "signature"
          | "nearest_sibling"
          | "fallback"
          | "idempotency_key"
          | "provider_response_evidence"
          | "provider_response_evidence_purged_at"
          | "created_at"
        >
      >;
      event_identity_call_claims: RpcWrittenTable<EventIdentityCallClaimRow>;
      generation_batches: RpcWrittenTable<GenerationBatchRow>;
      generation_batch_siblings: RpcWrittenTable<GenerationBatchSiblingRow>;
      rate_limits: Table<RateLimitRow, Insert<RateLimitRow, "count">>;
      human_test_1_responses: Table<
        HumanTest1ResponseRow,
        Insert<HumanTest1ResponseRow, "id" | "created_at">
      >;
      human_test_1_test_responses: Table<
        HumanTest1ResponseRow,
        Insert<HumanTest1ResponseRow, "id" | "created_at">
      >;
    };
    Views: Record<string, never>;
    Functions: {
      event_role: { Args: { p_event_id: string }; Returns: EventMemberRole | null };
      is_event_member: { Args: { p_event_id: string }; Returns: boolean };
      is_event_owner: { Args: { p_event_id: string }; Returns: boolean };
      claim_pre_auth_draft: {
        Args: { p_token_hash: string; p_user_id: string };
        Returns: { event_id: string | null; outcome: ClaimOutcome }[];
      };
      claim_pre_auth_draft_by_email: {
        Args: { p_email: string; p_user_id: string };
        Returns: { event_id: string | null; outcome: ClaimOutcome }[];
      };
      bind_draft_claim_email: { Args: { p_token_hash: string; p_email: string }; Returns: void };
      consume_rate_limit: {
        Args: { p_bucket: string; p_key_hash: string; p_window_seconds: number; p_max: number };
        Returns: boolean;
      };
      expired_pre_auth_storage_keys: { Args: { p_cutoff: string }; Returns: string[] };
      purge_expired_pre_auth_state: { Args: { p_cutoff: string }; Returns: number };
      attach_inspiration_asset: {
        Args: {
          p_draft_id: string;
          p_storage_key: string;
          p_mime_type: string;
          p_size_bytes: number;
          p_max_files: number;
        };
        Returns: {
          outcome: AttachInspirationOutcome;
          asset_id: string | null;
          attached_event_id: string | null;
          asset_created_at: string | null;
        }[];
      };
      expired_pre_auth_draft_batch: {
        Args: { p_cutoff: string; p_limit: number };
        Returns: { draft_id: string; storage_keys: string[] }[];
      };
      purge_pre_auth_drafts: {
        Args: { p_cutoff: string; p_draft_ids: string[] };
        Returns: number;
      };
      purge_stale_rate_limits: { Args: Record<string, never>; Returns: number };
      /**
       * Phase 2's locked claim path (20260913030000_phase2_email_claim.sql), granted to
       * `service_role`. Live since Phase 2 and undeclared until the Phase 4B contract sync, like
       * `pre_auth_event_drafts.claim_email`.
       */
      claim_draft_locked: {
        Args: { p_draft_id: string; p_user_id: string };
        Returns: { outcome: ClaimOutcome; event_id: string | null }[];
      };
      /** Whether the current request carries an end-user JWT rather than the service role. */
      is_end_user_request: { Args: Record<string, never>; Returns: boolean };
      /**
       * The fail-closed reader (20260915000000_phase4b_identity_revisions.sql). Raises rather than
       * returning empty for an unsupported `schema_version` or a malformed clarification block, so
       * an unreadable envelope can never be mistaken for one that asked nothing.
       */
      identity_questions: { Args: { result: Json; schema_version: string }; Returns: Json };
      /** Whether a boundary question makes that identity non-consumable (`spec.md §7.6b`). */
      identity_is_provisional: {
        Args: { result: Json; schema_version: string };
        Returns: boolean;
      };

      /* --------- Phase 4B T9A: call-level spend, idempotency and recovery (§A.5, §A.6) -------- */

      /**
       * The one advisory-lock key the global-budget admission serializes on. A named function so
       * the number cannot drift between callers or collide with another subsystem's lock.
       */
      identity_budget_lock_key: {
        Args: Record<string, never>;
        // `bigint` from 64 bits of md5, so it exceeds 2^53 and arrives as a string through
        // PostgREST. Typed as it arrives rather than as a `number` that would silently round.
        Returns: string;
      };
      /** True for every terminal claim state. */
      identity_claim_is_terminal: {
        Args: { p_state: IdentityCallClaimState };
        Returns: boolean;
      };
      /**
       * Ceiling, caps, rate limit and the claim insert — one transaction, so a refusal rolls back
       * every unit it consumed and a refused request costs the host nothing.
       */
      claim_identity_call: {
        Args: {
          p_event_id: string;
          p_user_id: string;
          p_attempt_key: string;
          p_basis_digest: string;
          p_attempt_ordinal: number;
          p_clarification_answer_ids: string[];
          p_provider_config: Json;
          p_lease_seconds: number;
          p_event_cap_key: string;
          p_event_cap_window: number;
          p_event_cap_max: number;
          p_account_cap_key: string;
          p_account_cap_window: number;
          p_account_cap_max: number;
          p_rate_key: string;
          p_rate_window: number;
          p_rate_max: number;
          p_ceiling_window_seconds: number;
          p_ceiling_usd: number;
          p_logical_call_max_usd: number;
        };
        Returns: {
          outcome: IdentityClaimOutcome;
          claim_id: string | null;
          recorded_spend_usd: number;
          reserved_usd: number;
        }[];
      };
      /** Step 5: committed before the provider is reached. False when the claim already moved on. */
      mark_identity_call_invoked: { Args: { p_claim_id: string }; Returns: boolean };
      /** Step 6: the run row (with evidence and the attempt key) and the claim, in one transaction. */
      capture_identity_call_response: {
        Args: { p_claim_id: string; p_success: boolean; p_run: Json };
        Returns: string | null;
      };
      /**
       * Step 7: the conditional transition and the revision, atomically. Returns no row when
       * another completer got there first — not an error, just someone else's work.
       */
      complete_identity_call: {
        Args: { p_claim_id: string; p_result: Json };
        Returns: {
          revision_id: string;
          revision: number;
          is_provisional: boolean;
          authoritative: boolean;
        }[];
      };
      /**
       * Releases a captured response that cannot become a revision, without discarding it.
       * Returns `terminal`, `retryable` or `not_captured`.
       */
      fail_identity_call_recovery: {
        Args: {
          p_claim_id: string;
          p_reason: string;
          p_deterministic: boolean;
          p_max_age_seconds: number;
        };
        Returns: "terminal" | "retryable" | "not_captured";
      };
      /** Lease expiry only. `response_captured` is never expired here. */
      expire_identity_call_claims: {
        /** `p_event_id` scopes the sweep to one event, for request-driven recovery. */
        Args: { p_limit: number; p_event_id?: string | null };
        Returns: { abandoned: number; expired_unknown: number }[];
      };
      /** Settles claims that provably never reached the provider, on a horizon of seconds. */
      reclaim_uninvoked_identity_claims: {
        Args: { p_max_age_seconds: number; p_event_id?: string | null; p_limit?: number };
        Returns: number;
      };
      /** Paid responses no request has come back to complete. */
      pending_identity_call_completions: {
        Args: { p_limit: number; p_event_id?: string | null };
        Returns: {
          claim_id: string;
          event_id: string;
          generation_run_id: string;
          schema_version: string;
          provider_response_evidence: Json | null;
          captured_at: string;
        }[];
      };
      /** Nulls aged evidence, skipping every run a non-terminal claim still needs. */
      purge_identity_response_evidence: { Args: { p_cutoff: string }; Returns: number };

      /* ------------- Phase 4C T16: batch and sibling caps and idempotency (§G.5, §H.2) --------- */

      /** True for the two in-flight batch states the uniqueness index is written over. */
      generation_batch_is_in_flight: {
        Args: { p_status: GenerationBatchStatus };
        Returns: boolean;
      };
      /**
       * Ceiling, batch-level caps, the batch row and its three siblings — one transaction, so a
       * refusal rolls back every unit it consumed and costs the host nothing.
       */
      plan_generation_batch: {
        Args: {
          p_event_id: string;
          p_user_id: string;
          p_identity_revision_id: string;
          p_planner_version: string;
          p_round: number;
          p_idempotency_key: string;
          /** `{ siblings: [ … ] }` — an object, so node-postgres and PostgREST agree it is jsonb. */
          p_plan: Json;
          p_event_cap_bucket: string;
          p_event_cap_key: string;
          p_event_cap_window: number;
          p_event_cap_max: number;
          p_account_cap_bucket: string;
          p_account_cap_key: string;
          p_account_cap_window: number;
          p_account_cap_max: number;
          p_rate_bucket: string;
          p_rate_key: string;
          p_rate_window: number;
          p_rate_max: number;
          p_ceiling_window_seconds: number;
          p_ceiling_usd: number;
          p_run_max_usd: number;
          p_batch_reservation_usd: number;
        };
        Returns: {
          outcome: PlanGenerationBatchOutcome;
          batch_id: string | null;
          recorded_spend_usd: number;
        }[];
      };
      /** `planned` to `running`. True only for the transition. */
      start_generation_batch: { Args: { p_batch_id: string }; Returns: boolean };
      /** Marks a sibling issued. Telemetry, never mutual exclusion — the key does that (§H.2 row 6). */
      issue_batch_sibling: {
        Args: { p_batch_id: string; p_concept_index: number };
        Returns: boolean;
      };
      /** The sibling's run row and its status, in one transaction, under the derived key. */
      record_batch_sibling_run: {
        Args: {
          p_batch_id: string;
          p_concept_index: number;
          p_attempt: number;
          p_idempotency_key: string;
          p_success: boolean;
          p_run: Json;
        };
        Returns: { outcome: RecordSiblingRunOutcome; run_id: string | null }[];
      };
      /**
       * A run row for a call that belongs to the **batch** rather than to one sibling — today, the
       * premise call (`spec.md §7.7a`).
       *
       * Deliberately not `record_batch_sibling_run`: that one also settles
       * `generation_batch_siblings`, so recording a batch-level call through it would consume a
       * sibling's lifecycle slot and the sibling's own DesignIntent run would then be refused as
       * `already_succeeded` and never recorded. `concept_index` is left null here, which is what
       * the column already means for `event_identity` and what is true of a premise call.
       */
      record_batch_call_run: {
        Args: {
          p_batch_id: string;
          p_operation: ModelOperation;
          p_idempotency_key: string;
          p_success: boolean;
          p_run: Json;
        };
        Returns: { outcome: RecordBatchCallRunOutcome; run_id: string | null }[];
      };
      /**
       * Records one stage of one sibling's work — DesignIntent, then Composition — and settles
       * nothing (20260919000000_phase4d_composition_lineage.sql).
       *
       * Split from `record_batch_sibling_run` because a 4D sibling makes two calls and then still
       * has to compile and verify: settling on the first would mark a sibling ready whose concept
       * does not exist. Every paid response is recorded when it happens, so the ceiling sees spend
       * even for a sibling that later fails to verify.
       */
      record_sibling_stage_run: {
        Args: {
          p_batch_id: string;
          p_concept_index: number;
          p_operation: ModelOperation;
          p_attempt: number;
          p_idempotency_key: string;
          p_success: boolean;
          p_run: Json;
        };
        Returns: { outcome: RecordSiblingStageRunOutcome; run_id: string | null }[];
      };
      /**
       * Settles one sibling once its concept is verified and persisted, or once it has terminally
       * failed. A success must name the run it succeeded with, so
       * `(status = 'succeeded') = (generation_run_id is not null)` keeps holding.
       */
      settle_batch_sibling: {
        Args: {
          p_batch_id: string;
          p_concept_index: number;
          p_success: boolean;
          p_generation_run_id?: string | null;
        };
        Returns: SettleBatchSiblingOutcome;
      };
      /**
       * Settles a batch from its siblings (§I). Returns `in_flight` and changes nothing while any
       * sibling is unfinished.
       */
      settle_generation_batch: {
        Args: { p_batch_id: string };
        Returns: GenerationBatchStatus | "in_flight";
      };
      /**
       * Opportunistic, event-scoped recovery for a batch whose process died
       * (`20260919180000_phase4f_stale_batch_recovery.sql`).
       *
       * Fails the non-terminal siblings of any in-flight batch of this event older than the bound
       * and settles it through `settle_generation_batch`, so the one-in-flight index cannot brick
       * an event for ever. Returns one row per batch it touched — usually none.
       */
      recover_stale_generation_batches: {
        Args: { p_event_id: string; p_stale_after_seconds?: number };
        Returns: {
          batch_id: string;
          failed_siblings: number;
          status: GenerationBatchStatus | "in_flight";
        }[];
      };
      /**
       * Marks one artwork slot's request outstanding, with the lineage of the call being made.
       * Addressed by `(spec revision, slot id)`, so a slot belonging to another revision simply
       * does not resolve.
       */
      request_artwork_slot: {
        Args: {
          p_resolved_spec_id: string;
          p_slot_id: string;
          p_provider?: string | null;
          p_model?: string | null;
          p_artwork_prompt_version?: string | null;
          p_artwork_contract_version?: string | null;
        };
        Returns: RequestArtworkSlotOutcome;
      };
      /**
       * Attaches a delivered asset. Idempotent for the same asset; raises for a different one
       * against an already-delivered slot. `p_has_alpha` has no default: alpha is measured from
       * the bytes, never inferred from the slot's role.
       */
      attach_artwork_asset: {
        Args: {
          p_resolved_spec_id: string;
          p_slot_id: string;
          p_storage_bucket: string;
          p_storage_path: string;
          p_width_px: number;
          p_height_px: number;
          p_byte_size: number;
          p_content_type: ArtworkContentType;
          p_has_alpha: boolean;
          p_provider?: string | null;
          p_model?: string | null;
          p_artwork_prompt_version?: string | null;
          p_artwork_contract_version?: string | null;
          p_latency_ms?: number | null;
          p_cost_estimate_usd?: number | null;
        };
        Returns: AttachArtworkAssetOutcome;
      };
      /** Records a terminal failure as an outcome. The first classification stands. */
      fail_artwork_slot: {
        Args: {
          p_resolved_spec_id: string;
          p_slot_id: string;
          p_failure_kind: ArtworkFailureKind;
          p_failure_detail?: string | null;
          p_provider?: string | null;
          p_model?: string | null;
          p_artwork_prompt_version?: string | null;
          p_artwork_contract_version?: string | null;
          p_latency_ms?: number | null;
          p_cost_estimate_usd?: number | null;
        };
        Returns: FailArtworkSlotOutcome;
      };
    };
    Enums: {
      event_status: EventStatus;
      event_visibility: EventVisibility;
      event_member_role: EventMemberRole;
      model_operation: ModelOperation;
      identity_call_claim_state: IdentityCallClaimState;
      generation_batch_status: GenerationBatchStatus;
      generation_batch_sibling_status: GenerationBatchSiblingStatus;
      artwork_role: ArtworkRole;
      artwork_slot_status: ArtworkSlotStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
