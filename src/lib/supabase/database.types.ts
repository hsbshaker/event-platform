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
          | "output_tokens"
          | "reasoning_tokens"
          | "cost_estimate_usd"
          | "error_code"
          | "input_assembly_version"
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
          | "created_at"
        >
      >;
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
    };
    Enums: {
      event_status: EventStatus;
      event_visibility: EventVisibility;
      event_member_role: EventMemberRole;
      model_operation: ModelOperation;
    };
    CompositeTypes: Record<string, never>;
  };
};
