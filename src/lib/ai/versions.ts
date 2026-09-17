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
/**
 * How the request envelope is built from the host's inputs: which channels are present (original
 * prompt, inspiration assets, clarification answers), how each is labelled to the model, in what
 * order they appear, how precedence between them is expressed, and how an answer is represented.
 *
 * Separate from the prompt version on purpose. `event_identity_v5` is the accepted contract and
 * its file does not change when clarification answers are introduced — but the *effective model
 * input* does, and hiding a behaviour change under an unchanged label is what this project has
 * already paid for once.
 *
 * **`v1` is the original prompt only**, with inspiration explicitly declared absent — the request
 * ends with the literal line "There is no visual inspiration supplied with this request", and
 * `GenerateEventIdentityInput` at the provider boundary carries no inspiration field. That is what
 * Phase 4A shipped and every piece of `v5` evidence was produced under. `spec.md §7.5` requires
 * inspiration assets to reach this call, so adding that channel is a real gap to close — and,
 * under the bump rule below, it is its own version bump rather than something `v1` already covers.
 * **`v2` is `v1` plus the clarification block** that Phase 4B T9 introduced: a rerun carries every
 * clarification answer still in scope, oldest first, each rendered with the exact question it
 * answers, under a stated precedence rule. With nothing to carry it is byte-identical to `v1`, so
 * a first call is not a different request than it was — `assembly.golden.test.ts` pins that
 * against the `v1` fixture rather than asserting it in prose. The inspiration channel is still
 * absent and still owes its own bump; putting two model-visible channels in one version would
 * leave the evidence unable to say which one moved the result.
 *
 * It bumps for any change to precedence, labelling, ordering or representation of clarification
 * answers, for adding or removing an input channel, and for changing how the original prompt is
 * delimited. It does not bump for a prompt-file edit or a schema change; those have versions of
 * their own and the three are independent.
 */
export const EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION = "event_identity_input_v2";

export const EVENT_IDENTITY_PROMPT_VERSION = "event_identity_v5";
export const EVENT_IDENTITY_SCHEMA_VERSION = "event_identity_schema_v5";
export const DESIGN_INTENT_PROMPT_VERSION = "design_intent_v4";
export const DESIGN_INTENT_SCHEMA_VERSION = "design_intent_schema_v4";
export const COMPOSITION_PROMPT_VERSION = "composition_v1_p2";
export const COMPOSITION_SCHEMA_VERSION = "composition_schema_v1";
export const PRIMITIVE_SET_VERSION = "composition_v1";
/**
 * The deterministic sibling planner (`spec.md §7.7`, `src/lib/generation/planner.ts`).
 *
 * It bumps whenever diversity behaviour changes — the pools a draw is taken from, the draw order,
 * the seed derivation, the separation priority, the tone-lock rule, the directive resampler or the
 * attractive-token allotment. Anything that would plan a different batch from the same identity
 * revision is a bump; adding a telemetry field that reports the same plan differently is not.
 *
 * Historical batches are never silently re-planned. A persisted batch records the version that
 * produced it, and **replay identity is the identity revision plus the planner version**: running
 * this version against that revision reproduces the batch byte for byte, and running a later
 * version against it produces a different, equally legitimate batch that is not the same artifact.
 * The version is a label on the artifact rather than an input to the algorithm, so it is
 * deliberately not mixed into the seed.
 */
export const PLANNER_VERSION = "planner_v1";

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
