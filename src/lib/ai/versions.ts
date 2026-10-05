/**
 * Versioned production assets — docs/model-contracts.md.
 * Every generation record persists these. Never edit a prompt or schema while
 * keeping the same version. The card-design and card-art prompt/schema files are
 * written in Phase 3 (model validation).
 */
export const EVENT_IDENTITY_PROMPT_VERSION = "event_identity_v6";
export const EVENT_IDENTITY_SCHEMA_VERSION = "event_identity_schema_v5";
export const CARD_DESIGN_PROMPT_VERSION = "card_design_v3";
export const CARD_DESIGN_SCHEMA_VERSION = "card_design_schema_v2";
export const CARD_ART_PROMPT_VERSION = "card_art_v4";
export const CARD_LAYOUT_SET_VERSION = "card_layouts_v3";
/** Design validation, ink resolution, layoutCard's sizing steps and line breaking (slot specs are layout-set data). */
export const CARD_COMPILER_VERSION = "card_compiler_v4";

/** `docs/model-prompts/fact-extraction.system.md` (Phase 3 validation). */
export const FACT_EXTRACTION_PROMPT_VERSION = "fact_extraction_v1";
/** The fact-extraction output schema, ported from Phase 3 validation (`fact-extraction.ts`). */
export const FACT_EXTRACTION_SCHEMA_VERSION = "fact_extraction_schema_v1";
/** The artwork inspection chosen in Phase 3 validation (`artwork-inspection.ts`). */
export const CARD_ART_INSPECTION_PROMPT_VERSION = "card_art_inspection_v2";
export const CARD_ART_INSPECTION_SCHEMA_VERSION = "card_art_inspection_schema_v2";
/**
 * The image-safety moderation request (the artwork alone). Moderation has no prompt; this names
 * the request shape so its telemetry rows carry a version like every other call.
 */
export const CARD_ART_MODERATION_VERSION = "card_art_moderation_v1";
