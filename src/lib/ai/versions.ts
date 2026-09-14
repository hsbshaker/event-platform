/**
 * Versioned production assets — docs/model-contracts.md §2.
 * Every generation record persists these. Never edit a prompt or schema while
 * keeping the same version.
 */
/**
 * `v3` is Phase 4A. The creative brief's own shape is unchanged from `v2`; what changed is
 * everything around it, and each part on its own would require the bump.
 *
 * The schema became an envelope: `identity` (the v2 brief, untouched) now has two siblings,
 * `suppliedFacts` and `clarification` (`spec.md §7.5`, `§7.6b`). A `v2` response is not a
 * valid `v3` response, and a `v3` response carries understanding a `v2` consumer would drop.
 *
 * The prompt gained the two sections that govern those siblings — quote-never-infer for facts,
 * prefer-zero for clarification — and its reference-translation example changed from Ralph
 * Lauren to Bauhaus. That last one is not cosmetic: the old example taught the skill on the
 * same reference two evaluation cases test, with close to the answer they expect
 * (`docs/model-evals/creative-understanding.json` CU-01, CU-02), so keeping it would have
 * scored the prompt on a question it had been shown.
 */
export const EVENT_IDENTITY_PROMPT_VERSION = "event_identity_v3";
export const EVENT_IDENTITY_SCHEMA_VERSION = "event_identity_schema_v3";
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
