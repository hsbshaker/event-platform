/**
 * Database contract for the Supabase client.
 *
 * Hand-authored to match supabase/migrations/ through 20261012000000_cohost_invitations.sql.
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
/**
 * Outcomes of public.start_generation (`designed`: an initial generation refused because the
 * event already has a card design, 20261008000000_phase5c_prompt_facts.sql; `no_design`: another
 * direction or a shape switch refused because the event has no card design yet,
 * 20261009000000_phase5d_another_direction.sql; `not_active` and `fitted`: a shape switch refused
 * because its design is no longer the active one, or because an artwork of it already fits the
 * shape, 20261010000000_shape_switch.sql).
 */
export type StartGenerationOutcome =
  | "started"
  | "existing"
  | "published"
  | "designed"
  | "no_design"
  | "not_active"
  | "fitted"
  | "in_flight"
  | "event_cap"
  | "host_cap";

/** What a card design made (`card_designs.refinement`, `card_design_schema_v3`). */
export type CardRefinement = "none" | "part" | "whole";

/** Outcomes of public.choose_card_design (20261009000000_phase5d_another_direction.sql). */
export type ChooseCardDesignOutcome = "chosen" | "published" | "not_found";

/** Outcomes of public.switch_card_shape (20261010000000_shape_switch.sql). */
export type SwitchCardShapeOutcome =
  "switched" | "needs_artwork" | "not_active" | "no_design" | "not_found";

/** Outcomes of public.set_event_privacy and public.rotate_event_code (20261011000000_event_privacy.sql). */
export type SetEventPrivacyOutcome = "saved" | "not_found";
export type RotateEventCodeOutcome = "rotated" | "not_private" | "not_found";

/** Outcomes of the co-host invitation functions (20261012000000_cohost_invitations.sql). */
export type CreateCohostInvitationOutcome = "created" | "not_found";
export type CohostInvitationPreviewStatus = "valid" | "member" | "invalid";
export type AcceptCohostInvitationOutcome = "joined" | "already_member" | "invalid";
export type RevokeCohostInvitationOutcome = "revoked" | "not_pending" | "not_found";
export type RemoveCohostOutcome = "removed" | "not_found";

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
  /**
   * Server-managed (20261008000000_phase5c_prompt_facts.sql): the facts the prompt states, as fact
   * extraction returned them (`ExtractedFacts`, verbatim); null until extracted. Unconfirmed.
   */
  prompt_facts: Json | null;
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

/** Server-only (20261012000000_cohost_invitations.sql): no end-user grants. */
type CohostInvitationRow = {
  id: string;
  event_id: string;
  /** HMAC of the link's token (bytea); never the token. */
  token_hash: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
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

/**
 * One Event Identity revision (spec.md §24 EventIdentity; 20261006000000_phase5_generation_
 * persistence.sql). Immutable; written only through public.record_event_identity.
 */
type EventIdentityRow = {
  event_id: string;
  revision: number;
  identity: Json;
  /** The accepted identity response as returned by the model. */
  raw: string;
  prompt_version: string;
  schema_version: string;
  /** The generation that produced it; null once that generation is gone. */
  generation_id: string | null;
  created_at: string;
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
  /** The Event Identity revision the design was made from. */
  identity_revision: number;
  /** What the design made: a change to part of a card, to its whole look, or a new idea. */
  refinement: CardRefinement;
  /** On another direction: the design the host was looking at when they asked. */
  changed_from: string | null;
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
  /** The §9.5 record, written when the generation succeeds. Never shown to the host. */
  telemetry: Json | null;
  /**
   * Another direction: what the host typed, trimmed (1–500 characters), or null for an empty box.
   * Host content; read only by the server, never by the image model.
   */
  feedback: string | null;
  /**
   * Another direction: the design the host was looking at. Shape switch: the event's active
   * design when it started, to which the new artwork is added.
   */
  from_design_id: string | null;
  /** Shape switch only: the shape the host asked for (20261010000000_shape_switch.sql). */
  shape: CardShape | null;
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
          | "prompt_facts"
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
      cohost_invitations: Table<
        CohostInvitationRow,
        Insert<
          CohostInvitationRow,
          "id" | "created_at" | "accepted_by" | "accepted_at" | "revoked_at"
        >
      >;
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
        Insert<EventIdentityRow, "generation_id" | "created_at">
      >;
      card_designs: Table<
        CardDesignRow,
        Insert<
          CardDesignRow,
          | "id"
          | "standard_wording_slots"
          | "selected_at"
          | "created_at"
          | "refinement"
          | "changed_from"
        >
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
          | "telemetry"
          | "feedback"
          | "from_design_id"
          | "shape"
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
          /** Another direction only: the host's words (trimmed by the function; empty is none). */
          p_feedback?: string | null;
          /**
           * Required for another direction (the design the host was looking at) and for a shape
           * switch (the event's active design); never for an initial generation.
           */
          p_from_design_id?: string | null;
          /** Shape switch only, and required there: the shape the host asked for. */
          p_shape?: CardShape | null;
        };
        Returns: { generation_id: string | null; outcome: StartGenerationOutcome }[];
      };
      /** Bumps a running generation's heartbeat; false when it is not running. */
      heartbeat_generation: {
        Args: { p_generation_id: string; p_event_id: string };
        Returns: boolean;
      };
      /**
       * The event's next identity revision, written only while the generation is running and the
       * event unpublished; null when nothing was written
       * (20261006000000_phase5_generation_persistence.sql).
       */
      record_event_identity: {
        Args: {
          p_generation_id: string;
          p_event_id: string;
          p_identity: Json;
          p_raw: string;
          p_prompt_version: string;
          p_schema_version: string;
          /** The identity's own extraction; written to events.prompt_facts once. */
          p_prompt_facts?: Json | null;
        };
        Returns: number | null;
      };
      /** Sets a running generation's stage and merges its artifacts; false when not running. */
      record_generation_stage: {
        Args: { p_generation_id: string; p_event_id: string; p_stage: string; p_artifacts: Json };
        Returns: boolean;
      };
      /** Fails a generation only while it is running; returns whether it did. */
      fail_generation: {
        Args: {
          p_generation_id: string;
          p_event_id: string;
          p_error_code: string;
          /** The failure telemetry (`generations.telemetry`); omitted keeps none. */
          p_telemetry?: Json;
        };
        Returns: boolean;
      };
      /**
       * The design, its artwork, the first active design (an initial generation's only) and the
       * generation's success, in one transaction; no row when the generation is not running or the
       * event is published.
       */
      persist_generated_card: {
        Args: {
          p_generation_id: string;
          p_event_id: string;
          p_identity_revision: number;
          p_name: string;
          p_description: string;
          p_shape: CardShape;
          p_layout: CardLayout;
          p_art_mode: CardArtMode;
          p_typography: Json;
          p_wording: Json;
          p_art_brief: Json;
          p_raw: Json;
          p_versions: Json;
          p_standard_wording_slots: string[];
          p_storage_key: string;
          p_mime_type: string;
          p_size_bytes: number;
          p_width: number;
          p_height: number;
          p_proportion: CardProportionCode;
          p_fits_shapes: CardShape[];
          p_ink: Json;
          p_image_model: string;
          p_art_prompt_version: string;
          p_telemetry: Json;
          /** Default `none`; `part` and `whole` only for another direction with feedback. */
          p_refinement?: CardRefinement;
          /** The generation's from_design_id (null for other kinds). */
          p_changed_from?: string | null;
        };
        Returns: { card_design_id: string; round: number }[];
      };
      /**
       * The host chooses a design: active, in its own shape, before publish only
       * (20261009000000_phase5d_another_direction.sql).
       */
      choose_card_design: {
        Args: { p_event_id: string; p_user_id: string; p_design_id: string };
        Returns: ChooseCardDesignOutcome;
      };
      /**
       * Shows the active design in a shape an artwork of it already fits; no model call
       * (20261010000000_shape_switch.sql).
       */
      switch_card_shape: {
        Args: { p_event_id: string; p_user_id: string; p_design_id: string; p_shape: CardShape };
        Returns: SwitchCardShapeOutcome;
      };
      /**
       * Sets the event's visibility and, going private with no code stored, stores the offered
       * encrypted code in the same transaction (20261011000000_event_privacy.sql).
       */
      set_event_privacy: {
        Args: {
          p_event_id: string;
          p_user_id: string;
          p_visibility: EventVisibility;
          /** bytea, sent as `\x` and hex. */
          p_code_encrypted: string | null;
        };
        Returns: { outcome: SetEventPrivacyOutcome; code_encrypted: string | null }[];
      };
      /** Replaces a private event's encrypted code (20261011000000_event_privacy.sql). */
      rotate_event_code: {
        Args: { p_event_id: string; p_user_id: string; p_code_encrypted: string };
        Returns: { outcome: RotateEventCodeOutcome; code_encrypted: string | null }[];
      };
      /** Records a co-host invite link's hash for the event's owner (20261012000000_cohost_invitations.sql). */
      create_cohost_invitation: {
        /** p_token_hash: bytea, sent as `\x` and hex. */
        Args: { p_event_id: string; p_user_id: string; p_token_hash: string };
        Returns: {
          outcome: CreateCohostInvitationOutcome;
          invitation_id: string | null;
          created_at: string | null;
          expires_at: string | null;
        }[];
      };
      /** What the invite page may show for a token hash (20261012000000_cohost_invitations.sql). */
      cohost_invitation_preview: {
        Args: { p_token_hash: string; p_user_id: string | null };
        Returns: {
          status: CohostInvitationPreviewStatus;
          event_id: string | null;
          event_title: string | null;
          inviter_name: string | null;
          role: EventMemberRole | null;
        }[];
      };
      /** Makes the signed-in holder of a link a co-host (20261012000000_cohost_invitations.sql). */
      accept_cohost_invitation: {
        Args: { p_token_hash: string; p_user_id: string };
        Returns: {
          outcome: AcceptCohostInvitationOutcome;
          event_id: string | null;
          role: EventMemberRole | null;
        }[];
      };
      revoke_cohost_invitation: {
        Args: { p_event_id: string; p_user_id: string; p_invitation_id: string };
        Returns: RevokeCohostInvitationOutcome;
      };
      remove_cohost: {
        Args: { p_event_id: string; p_user_id: string; p_cohost_id: string };
        Returns: RemoveCohostOutcome;
      };
      /** The event's working invite links, for its owner (20261012000000_cohost_invitations.sql). */
      pending_cohost_invitations: {
        Args: { p_event_id: string; p_user_id: string };
        Returns: { id: string; created_at: string; expires_at: string }[];
      };
      /**
       * A shape switch's new artwork, added to its design, and the switch applied while that
       * design is active, in one transaction; no row when the generation is not running or the
       * event is published (20261010000000_shape_switch.sql).
       */
      persist_shape_switch_artwork: {
        Args: {
          p_generation_id: string;
          p_event_id: string;
          p_storage_key: string;
          p_mime_type: string;
          p_size_bytes: number;
          p_width: number;
          p_height: number;
          p_proportion: CardProportionCode;
          p_fits_shapes: CardShape[];
          p_ink: Json;
          p_image_model: string;
          p_art_prompt_version: string;
          p_telemetry: Json;
        };
        Returns: {
          card_design_id: string;
          round: number;
          art_asset_id: string;
          activated: boolean;
        }[];
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
      /** 20261013000000_card_editor_title.sql: the save and `events.title`, in one transaction. */
      save_card_customization_with_title: {
        Args: {
          p_event_id: string;
          p_card_design_id: string;
          p_shape: CardShape;
          p_boxes: Json;
          p_expected_revision: number;
          p_title: string;
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
