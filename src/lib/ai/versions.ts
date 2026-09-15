/**
 * Versioned production assets — docs/model-contracts.md §2.
 * Every generation record persists these. Never edit a prompt or schema while
 * keeping the same version.
 */
/**
 * `v5` is the second Phase 4A remediation, after the first sealed challenge failed its
 * independent qualitative gate. A `v4` response is not a valid `v5` response.
 *
 * That run asked zero questions on all twelve cases, and one of them required the system to
 * settle a matter it had no authority to settle. The cause was structural rather than
 * dispositional: every model-visible instruction scoped clarification to taste — including two
 * inside the wire schema, where a prompt-only fix would never have reached them — so the
 * correct behaviour was unreachable however the model reasoned.
 *
 * Clarification therefore splits into two routes, declared per question in a new required
 * `kind`. Route A is the unchanged five-condition creative gate, with its one defer option and
 * its guarantee of never blocking. Route B is rare and asks about a decision that is not the
 * system's to make; it offers no defer option, is asked alone, and makes the identity beside it
 * provisional. `suppliedFacts.honoreeName` also gains the name-in-use rule, after the run stored
 * a term the host had called a nickname as the person's name.
 *
 * `v4` is preserved in `docs/model-prompts/history/`; the sealed-challenge evidence it produced
 * is immutable in `docs/model-evals/results/creative-understanding-sealed-challenge-v1/`, and
 * that corpus is spent — a regression set from `v5` onward, never generalization evidence again.
 */

/**
 * `v4` is the Phase 4A remediation, after the first live run failed its independent
 * qualitative gate. A `v3` response is not a valid `v4` response.
 *
 * `designConstraints` splits into `hostConstraints` and `creativeGuidance`. The run showed
 * roughly 39 of 55 constraints were the model's own taste carrying host authority, which
 * every downstream stage would have read as client instruction. `suppliedFacts` gains
 * `honoreeDescriptionText`, because "for a boy" and "our son" had no home and were dropped —
 * and in one case reappeared inverted as a fabricated prohibition.
 *
 * The prompt's originality section is rewritten rather than extended: it was titled
 * "Originality and restraint", three of its four rules prohibited literal subject matter, and
 * it instructed the model to take the harder reading. It taught the bias the gate failed on.
 * Clarification becomes a five-condition test with delegation biasing toward a concrete bet.
 *
 * `v3` is preserved in `docs/model-prompts/history/`; its baseline run is immutable evidence
 * in `docs/model-evals/results/creative-understanding-v1/`.
 */

/**
 * `v3` was Phase 4A. The creative brief's own shape is unchanged from `v2`; what changed is
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
export const EVENT_IDENTITY_PROMPT_VERSION = "event_identity_v5";
export const EVENT_IDENTITY_SCHEMA_VERSION = "event_identity_schema_v5";
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
