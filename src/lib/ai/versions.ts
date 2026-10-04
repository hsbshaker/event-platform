/**
 * Versioned production assets — docs/model-contracts.md.
 * Every generation record persists these. Never edit a prompt or schema while
 * keeping the same version. The card-design and card-art prompt/schema files are
 * written in Phase 3 (model validation).
 */
export const EVENT_IDENTITY_PROMPT_VERSION = "event_identity_v4";
export const EVENT_IDENTITY_SCHEMA_VERSION = "event_identity_schema_v4";
export const CARD_DESIGN_PROMPT_VERSION = "card_design_v1";
export const CARD_DESIGN_SCHEMA_VERSION = "card_design_schema_v1";
export const CARD_ART_PROMPT_VERSION = "card_art_v1";
export const CARD_LAYOUT_SET_VERSION = "card_layouts_v1";
/** Design validation, ink resolution, layoutCard's slot specs and sizing, and line breaking. */
export const CARD_COMPILER_VERSION = "card_compiler_v1";
