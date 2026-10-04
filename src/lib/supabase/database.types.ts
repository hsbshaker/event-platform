/**
 * Database contract for the Supabase client.
 *
 * Hand-authored to match supabase/migrations/ through 20261005000000_phase5_spend_controls.sql.
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

/**
 * Telemetry operations of generation_runs (supabase/migrations/20261004000000_phase4_card_data.sql;
 * `card_art_moderation` from 20261005000000_phase5_spend_controls.sql).
 */
export type ModelOperation =
  | "event_identity"
  | "structured_extraction"
  | "card_design"
  | "card_art"
  | "card_art_inspection"
  | "card_art_moderation";

/** Generations (supabase/migrations/20261005000000_phase5_spend_controls.sql; spec.md §10). */
export type GenerationKind = "initial" | "another_direction" | "shape_switch";
export type GenerationStatus = "running" | "succeeded" | "failed";
/** Outcomes of public.start_generation. */
export type StartGenerationOutcome =
  "started" | "existing" | "published" | "in_flight" | "event_cap" | "host_cap";

/** Card enumerations (supabase/migrations/20261004000000_phase4_card_data.sql). */
export type CardShape = "rectangle" | "rounded-rectangle" | "arch" | "oval" | "square" | "circle";
/** Database spelling of a proportion; `src/lib/card/shapes.ts` `CardProportion` is "5:7" | "1:1". */
export type CardProportionCode = "portrait_5_7" | "square_1_1";
export type CardLayout = "art-top" | "art-bottom" | "framed" | "corners" | "atmosphere";
export type CardArtMode = "illustration" | "framed" | "atmosphere" | "minimal";

/**
 * SQLSTATE raised by public.save_card_customization when the save was based on a stale
 * revision (someone else saved first). PostgREST answers it with HTTP 409; the error's detail
 * reads `current revision: N` (or `none`).
 */
export const CARD_CUSTOMIZATION_STALE_SQLSTATE = "PT409";

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
  /** Server-managed; must name a design of this event. */
  active_card_design_id: string | null;
  /** Server-managed; null means the active design's own shape. Requires an active design. */
  active_card_shape: CardShape | null;
  message_sends_used: number;
  published_at: string | null;
  paid_at: string | null;
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
 * A generated card design (spec.md §24 CardDesign). Written by server code only and immutable
 * except `selected_at`; never deleted while its event exists.
 */
type CardDesignRow = {
  id: string;
  event_id: string;
  round: number;
  name: string;
  description: string;
  shape: CardShape;
  layout: CardLayout;
  art_mode: CardArtMode;
  typography: Json;
  wording: Json;
  art_brief: Json;
  raw: Json;
  standard_wording_slots: string[];
  versions: Json;
  selected_at: string | null;
  created_at: string;
};

/** A design's artwork (spec.md §24 CardArtAsset). Server-written and immutable. */
type CardArtAssetRow = {
  id: string;
  event_id: string;
  card_design_id: string;
  proportion: CardProportionCode;
  fits_shapes: CardShape[];
  storage_key: string;
  mime_type: string;
  width: number;
  height: number;
  size_bytes: number;
  ink: Json;
  image_model: string;
  art_prompt_version: string;
  created_at: string;
};

/**
 * The host's edited text layer for one design and shape (spec.md §20.5). End users write it only
 * through `save_card_customization`; `revision` is maintained by trigger.
 */
type CardCustomizationRow = {
  id: string;
  event_id: string;
  card_design_id: string;
  shape: CardShape;
  boxes: Json;
  revision: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** A font in the platform font store (spec.md §24 CardFont). Server-only. */
type CardFontRow = {
  id: string;
  family: string;
  category: string;
  variants: string[];
  license_name: string;
  license_text: string;
  storage_keys: Json;
  metrics_version: string;
  added_at: string;
};

type GenerationRunRow = {
  id: string;
  event_id: string;
  user_id: string | null;
  provider: string;
  provider_request_id: string | null;
  operation: ModelOperation;
  round: number | null;
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
  /** Null for calls without a structured-output schema (artwork, moderation). */
  schema_version: string | null;
  compiler_version: string | null;
  schema_valid_first_call: boolean | null;
  reprompts: Json | null;
  idempotency_key: string | null;
  created_at: string;
  generation_id: string | null;
  image_units: number | null;
  layout_set_version: string | null;
  art_regenerated: string | null;
  art_repaints: number | null;
  standard_wording_slots: string[] | null;
  ink_panels: Json | null;
};

/**
 * One generation request (spec.md §10). Server-only. Holds the event's generation lock while
 * `running`; begun only by public.start_generation.
 */
type GenerationRow = {
  id: string;
  event_id: string;
  kind: GenerationKind;
  status: GenerationStatus;
  stage: string | null;
  requested_by: string | null;
  idempotency_key: string;
  round: number | null;
  card_design_id: string | null;
  error_code: string | null;
  artifacts: Json;
  started_at: string;
  heartbeat_at: string;
  finished_at: string | null;
};

/** The daily spend ledger (UTC day). Server-only; written by the ledger functions. */
type ModelSpendDayRow = {
  day: string;
  reserved_usd: number;
  spent_usd: number;
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
          | "active_card_design_id"
          | "active_card_shape"
          | "message_sends_used"
          | "published_at"
          | "paid_at"
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
      card_designs: Table<
        CardDesignRow,
        Insert<CardDesignRow, "id" | "standard_wording_slots" | "selected_at" | "created_at">
      >;
      card_art_assets: Table<CardArtAssetRow, Insert<CardArtAssetRow, "id" | "created_at">>;
      card_customizations: Table<
        CardCustomizationRow,
        Insert<CardCustomizationRow, "id" | "revision" | "updated_by" | "created_at" | "updated_at">
      >;
      card_fonts: Table<CardFontRow, Insert<CardFontRow, "id" | "added_at">>;
      generation_runs: Table<
        GenerationRunRow,
        Insert<
          GenerationRunRow,
          | "id"
          | "user_id"
          | "provider_request_id"
          | "round"
          | "input_tokens"
          | "cached_input_tokens"
          | "output_tokens"
          | "reasoning_tokens"
          | "cost_estimate_usd"
          | "error_code"
          | "schema_version"
          | "compiler_version"
          | "schema_valid_first_call"
          | "reprompts"
          | "idempotency_key"
          | "created_at"
          | "generation_id"
          | "image_units"
          | "layout_set_version"
          | "art_regenerated"
          | "art_repaints"
          | "standard_wording_slots"
          | "ink_panels"
        >
      >;
      generations: Table<
        GenerationRow,
        Insert<
          GenerationRow,
          | "id"
          | "status"
          | "stage"
          | "requested_by"
          | "round"
          | "card_design_id"
          | "error_code"
          | "artifacts"
          | "started_at"
          | "heartbeat_at"
          | "finished_at"
        >
      >;
      model_spend_days: Table<
        ModelSpendDayRow,
        Insert<ModelSpendDayRow, "reserved_usd" | "spent_usd">
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
       * The only end-user write to card_customizations. `p_expected_revision` 0 creates; n updates
       * revision n. Returns the new revision; a stale revision raises
       * CARD_CUSTOMIZATION_STALE_SQLSTATE.
       */
      /**
       * Reserves an estimate against today's (UTC) spend ceiling. Returns the day booked (to pass
       * back to settle_model_spend), or null when the reservation would pass the ceiling.
       */
      reserve_model_spend: {
        Args: { p_estimate_usd: number; p_ceiling_usd: number };
        Returns: string | null;
      };
      settle_model_spend: {
        Args: { p_day: string; p_reserved_usd: number; p_actual_usd: number };
        Returns: void;
      };
      /** Begins a generation under the event lock and the daily caps (spec.md §10). */
      start_generation: {
        Args: {
          p_event_id: string;
          p_user_id: string;
          p_kind: GenerationKind;
          p_idempotency_key: string;
          p_event_key_hash: string;
          p_host_key_hash: string;
          p_event_cap: number;
          p_host_cap: number;
          p_stale_seconds: number;
        };
        Returns: { generation_id: string | null; outcome: StartGenerationOutcome }[];
      };
      /** Bumps a running generation's heartbeat; false when it is not running. */
      heartbeat_generation: {
        Args: { p_generation_id: string; p_event_id: string };
        Returns: boolean;
      };
      save_card_customization: {
        Args: {
          p_event_id: string;
          p_card_design_id: string;
          p_shape: CardShape;
          p_boxes: Json;
          p_expected_revision: number;
        };
        Returns: number;
      };
    };
    Enums: {
      event_status: EventStatus;
      event_visibility: EventVisibility;
      event_member_role: EventMemberRole;
      model_operation: ModelOperation;
      card_shape: CardShape;
      card_proportion: CardProportionCode;
      card_layout: CardLayout;
      card_art_mode: CardArtMode;
    };
    CompositeTypes: Record<string, never>;
  };
};
