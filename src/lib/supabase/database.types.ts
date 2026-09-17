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
  "event_identity" | "design_intent" | "composition" | "structured_extraction";

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

type DesignConceptRow = {
  id: string;
  event_id: string;
  round: number;
  concept_index: number;
  name: string;
  description: string;
  design_intent: Json;
  composition_raw: Json;
  composition: Json;
  composition_hash: string;
  capabilities: Json;
  directive: Json | null;
  token_allotment: Json | null;
  fallback: string | null;
  design_intent_prompt_version: string;
  design_intent_schema_version: string;
  composition_prompt_version: string;
  composition_schema_version: string;
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
 * Three tables today. The two Phase 4B evidence tables carve out only the DELETE that arrives
 * inside an event's cascade, and `resolved_design_specs` is stricter still: `reject_update()`
 * raises on every UPDATE with no carve-out at all. That one is the immutability `spec.md §32 #18`
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
       * Settles a batch from its siblings (§I). Returns `in_flight` and changes nothing while any
       * sibling is unfinished.
       */
      settle_generation_batch: {
        Args: { p_batch_id: string };
        Returns: GenerationBatchStatus | "in_flight";
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
    };
    CompositeTypes: Record<string, never>;
  };
};
