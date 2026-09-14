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
/**
 * The deterministic compiler. Bumped whenever its own output shape or behaviour changes —
 * including a compiler-internal addition like the verified-fit override layer — but never for a
 * change to the composition language, which carries `PRIMITIVE_SET_VERSION` separately
 * (`docs/event-renderer-system.md §6`).
 *
 * `3_1_0` is Phase 3.1. Three things changed at once, and each on its own would require the bump:
 * the clean criterion gained three defects, so a spec that verified before might not now; the
 * overrides produced for identical input changed, because a page that was contained but
 * fragmented now takes a demotion or a relaxation; and `verified` carries three new counters. A
 * spec stamped `compiler_phase3_0_1` was verified against the old criterion and rendered with the
 * old line breaking and heading wrap — it is not equivalent to one stamped here, and re-rendering
 * it needs re-verification rather than a silent recompile (`CLAUDE.md §5`).
 */
export const COMPILER_VERSION = "compiler_phase3_1_0";
