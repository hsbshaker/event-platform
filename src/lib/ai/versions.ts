/**
 * Versioned production assets — docs/model-contracts.md §2.
 * Every generation record persists these. Never edit a prompt or schema while
 * keeping the same version.
 */
export const EVENT_IDENTITY_PROMPT_VERSION = "event_identity_v2";
export const EVENT_IDENTITY_SCHEMA_VERSION = "event_identity_schema_v2";
export const DESIGN_INTENT_PROMPT_VERSION = "design_intent_v4";
export const DESIGN_INTENT_SCHEMA_VERSION = "design_intent_schema_v4";
export const COMPOSITION_PROMPT_VERSION = "composition_v1_p2";
export const COMPOSITION_SCHEMA_VERSION = "composition_schema_v1";
export const PRIMITIVE_SET_VERSION = "composition_v1";
/** Set by the Phase 3 engine port; placeholder until the compiler exists. */
export const COMPILER_VERSION = "compiler_v0_unported";
