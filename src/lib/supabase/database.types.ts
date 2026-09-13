/**
 * Database contract for the Supabase client.
 *
 * Hand-authored for the Phase 1 migration (supabase/migrations/20260912000000_phase1_core.sql).
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

/** Columns with defaults or generated values are optional on insert. */
type Insert<Row, Optional extends keyof Row> = Omit<Row, Optional> & Partial<Pick<Row, Optional>>;

type Table<Row, Ins> = {
  Row: Row;
  Insert: Ins;
  Update: Partial<Ins>;
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
      resolved_design_specs: Table<
        ResolvedDesignSpecRow,
        Insert<ResolvedDesignSpecRow, "id" | "supersedes_spec_id" | "created_at">
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
