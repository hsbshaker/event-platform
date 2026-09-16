/**
 * The columns this repository's database contract claims each table has.
 *
 * `database.types.ts` is hand-authored (its own header says so), which means nothing has ever
 * held it to the migrations. It drifted: the whole Phase 4B surface — two tables, an events
 * pointer, a `generation_runs` column and two functions — was applied to the database and absent
 * from the contract, and the gap surfaced only when someone went looking before T10.
 *
 * TypeScript types vanish at runtime, so a drift check needs something a test can compare against
 * `information_schema`. This is that something, and it is tied to the types by the `satisfies`
 * below: every table in the contract must appear here, and every name must be a real key of that
 * table's `Row`, or this file does not compile. `tests/db/schema-drift.test.ts` closes the other
 * half, comparing these lists to the applied schema in both directions.
 *
 * Adding a migration therefore means adding the column here and to the `Row` type, and the db
 * suite fails until both are done.
 */
import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];

export const SCHEMA_MANIFEST = {
  profiles: ["id", "email", "name", "created_at", "updated_at"],
  events: [
    "id",
    "owner_id",
    "type",
    "prompt",
    "title",
    "description",
    "event_date",
    "start_time",
    "end_time",
    "timezone",
    "venue_name",
    "address",
    "hosts",
    "baby_name",
    "generation_requested_at",
    "visibility",
    "access_code_encrypted",
    "rsvp_deadline",
    "rsvp_deadline_edited",
    "status",
    "slug",
    "active_concept_id",
    "design_overrides",
    "message_sends_used",
    "published_at",
    "paid_at",
    "authoritative_identity_revision_id",
    "row_version",
    "created_at",
    "updated_at",
  ],
  event_members: ["event_id", "user_id", "role", "created_at"],
  pre_auth_event_drafts: [
    "id",
    "draft_token_hash",
    "prompt",
    "composer_state",
    "claim_email",
    "claimed_by",
    "claimed_event_id",
    "claimed_at",
    "expires_at",
    "created_at",
  ],
  inspiration_assets: [
    "id",
    "event_id",
    "pre_auth_draft_id",
    "storage_key",
    "mime_type",
    "size_bytes",
    "expires_at",
    "created_at",
  ],
  event_identities: [
    "event_id",
    "identity",
    "prompt_version",
    "schema_version",
    "created_at",
    "updated_at",
  ],
  design_concepts: [
    "id",
    "event_id",
    "round",
    "concept_index",
    "name",
    "description",
    "design_intent",
    "composition_raw",
    "composition",
    "composition_hash",
    "capabilities",
    "directive",
    "token_allotment",
    "fallback",
    "design_intent_prompt_version",
    "design_intent_schema_version",
    "composition_prompt_version",
    "composition_schema_version",
    "primitive_set_version",
    "compiler_version",
    "active_resolved_spec_id",
    "selected_at",
    "created_at",
  ],
  resolved_design_specs: [
    "id",
    "concept_id",
    "revision",
    "spec",
    "content_version",
    "supersedes_spec_id",
    "verified_clean",
    "compiler_version",
    "primitive_set_version",
    "created_at",
  ],
  event_identity_revisions: [
    "id",
    "event_id",
    "revision",
    "result",
    "prompt_version",
    "schema_version",
    "input_assembly_version",
    "provider",
    "model",
    "provider_config",
    "provider_request_id",
    "generation_run_id",
    "clarification_answer_ids",
    "is_provisional",
    "created_at",
  ],
  clarification_answers: [
    "id",
    "event_id",
    "identity_revision_id",
    "question_index",
    "round",
    "kind",
    "question_text",
    "options",
    "selected_option_label",
    "free_text",
    "is_defer",
    "answered_by",
    "answered_at",
  ],
  generation_runs: [
    "id",
    "event_id",
    "user_id",
    "provider",
    "provider_request_id",
    "operation",
    "round",
    "concept_index",
    "model",
    "input_tokens",
    "cached_input_tokens",
    "output_tokens",
    "reasoning_tokens",
    "cost_estimate_usd",
    "latency_ms",
    "success",
    "error_code",
    "prompt_version",
    "input_assembly_version",
    "schema_version",
    "primitive_set_version",
    "compiler_version",
    "diversity_assignment",
    "schema_valid_first_call",
    "reprompts",
    "compiler_repairs",
    "verified",
    "signature",
    "nearest_sibling",
    "fallback",
    "idempotency_key",
    "provider_response_evidence",
    "created_at",
  ],
  event_identity_call_claims: [
    "id",
    "event_id",
    "attempt_key",
    "basis_digest",
    "attempt_ordinal",
    "claimed_by",
    "claimed_at",
    "lease_expires_at",
    "provider_invoked_at",
    "state",
    "generation_run_id",
    "settled_at",
  ],
  rate_limits: ["bucket", "key_hash", "window_start", "count"],
  human_test_1_responses: ["id", "reviewer", "response_payload", "submission_key", "created_at"],
  human_test_1_test_responses: [
    "id",
    "reviewer",
    "response_payload",
    "submission_key",
    "created_at",
  ],
} satisfies { [K in keyof Tables]: readonly (keyof Tables[K]["Row"])[] };

/**
 * Columns the database computes and refuses on insert.
 *
 * Kept beside the manifest so the drift test can assert both directions: that the database really
 * does generate them, and that the contract's `Insert` shape really does leave them out.
 */
export const GENERATED_COLUMNS = {
  event_identity_revisions: ["is_provisional"],
} as const satisfies Partial<{ [K in keyof Tables]: readonly (keyof Tables[K]["Row"])[] }>;

/* ------------------------------------------------------------------ compile-time completeness */

/**
 * `satisfies` above requires every listed name to be a real `Row` key. It does **not** require the
 * manifest to list every `Row` key — so a phantom field added to a `Row` and to neither the
 * manifest nor the database would pass the compiler *and* the drift test, and T10 would read it
 * typed `string` and get `undefined`. This closes that direction.
 */
type Unlisted<K extends keyof Tables> = Exclude<
  keyof Tables[K]["Row"],
  (typeof SCHEMA_MANIFEST)[K][number]
>;
type AssertNever<T extends never> = T;
export type _EveryRowKeyIsListed = AssertNever<{ [K in keyof Tables]: Unlisted<K> }[keyof Tables]>;

/**
 * …and that a generated column really is absent from its table's `Insert`.
 *
 * `GENERATED_COLUMNS` claimed this was asserted and nothing asserted it: the database half was
 * checked by the drift test, the type half only by a hand-written `@ts-expect-error` for the one
 * column somebody remembered. This makes it structural, so a second generated column cannot be
 * added to `Insert` by accident.
 */
type GeneratedButInsertable<K extends keyof typeof GENERATED_COLUMNS> = Extract<
  (typeof GENERATED_COLUMNS)[K][number],
  keyof Tables[K]["Insert"]
>;
export type _NoGeneratedColumnIsInsertable = AssertNever<
  {
    [K in keyof typeof GENERATED_COLUMNS]: GeneratedButInsertable<K>;
  }[keyof typeof GENERATED_COLUMNS]
>;
