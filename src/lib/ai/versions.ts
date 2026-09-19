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
/**
 * `v5` is the first DesignIntent contract ever sent to a provider, and the two versions move
 * together because model-visible text moved on both sides (`docs/model-contracts.md §5.1`, and the
 * `v5` lesson Event Identity paid for).
 *
 * `v4` was a pre-provider draft. Read against the input contract T18 built, three things in it
 * were untrue rather than merely dated, and every one of them was model-visible:
 *
 * - it described request channels this call does not receive — `redesignFeedback`,
 *   `priorConceptNames`, `priorIntentSignatures` — and gave two whole sections to behaviour keyed
 *   off them. `docs/phase-4b-plan.md §E` makes the three calls blind and parallel, and
 *   `src/lib/ai/design-intent/input.ts` carries two channels: the brief, and this concept's own
 *   assignment;
 * - it named an `allowedMotifs` catalogue that does not exist — the seven curated ids are not
 *   narrowed per concept — and named the assignment as three fields when deterministic code
 *   assigns four;
 * - it did not say that `composition.hierarchy` is assigned, while the planner assigns it, the
 *   frozen 4C harness gates an exact match on it, and `§4.7` excludes it from model-owned
 *   distinctness for exactly that reason.
 *
 * `v5` also restates the two-tier authority split — `hostConstraints` authoritative whatever their
 * subject, `creativeGuidance` free to be departed from — in the terms `§3.2` requires, and asks
 * for a concept name in natural orthography rather than in ASCII Title Case.
 *
 * The schema moves with it. `composition.hierarchy` narrows to the assigned value, so a response
 * legal under the `v4` runtime schema can be illegal under this one; and the concept-name rule now
 * admits Unicode letters and combining marks, so a name `v4` discarded into a deterministic
 * fallback is now kept. A `v4` response is not a valid `v5` response.
 *
 * `v4` is preserved at `docs/model-prompts/history/design-intent.v4.system.md` and
 * `docs/model-schemas/history/design-intent.v4{,.wire}.schema.json`. No provider call was ever
 * attributed to it, so there is no evidence under `v4` to invalidate.
 */
/**
 * `v6` is the first contract to carry a **concept premise**, and prompt and schema move together
 * again because model-visible text moved on both sides.
 *
 * The T22 diagnostic run measured what `v5` actually produced: 12 of 12 batches failed
 * composition-vector distinctness, `composition.ornament` was `restrained` in 36 of 36 responses,
 * and one batch returned the same concept name three times.
 * `docs/designintent-sibling-convergence.md` is the causal diagnosis; the short form is that `v5`
 * asked three calls the same question from a byte-identical brief, told each of them to *"make
 * this one as good as it can be"*, and asserted that four planner-assigned enums were *"how three
 * concepts for one event are held genuinely apart"*. They are not, which `CLAUDE.md §2`'s closing
 * line already said.
 *
 * What moved on the prompt side:
 *
 * - **a third channel is described**: this concept's own `ConceptPremise`, authored for the batch
 *   as a set of three by the stage in `src/lib/ai/concept-premise/`. The prompt states its
 *   authority precisely — below `hostConstraints`, above `creativeGuidance`, and this system's own
 *   direction rather than the host's;
 * - **the independent-optimization instruction is gone.** `v5 §1`'s "do not hold an idea back for
 *   them. Make this one as good as it can be" is replaced by the accurate statement: the set was
 *   planned, this concept is one member of it, and fulfilling *this* premise well is the job;
 * - **the sufficiency claim is corrected.** The four assignment dimensions are described as what
 *   they are — style coordinates the concept works within — rather than as the diversity
 *   mechanism;
 * - **the free dimensions are tied to the premise.** `density`, `asymmetry`, `rhythm`,
 *   `sectionContrast`, `ornament` and `motifs` are to follow from the premise's register rather
 *   than from generally defensible taste, which is what 36-of-36 `restrained` was;
 * - **the concept card must communicate the choice** rather than restate the brief, which is blind
 *   review pattern S7.
 *
 * The schema moves with it: `presentation`'s model-visible descriptions now require the card to
 * name and explain *this* concept against the premise it came from, and the `composition` and
 * `motifs` descriptions say they answer to the premise. The seven design fields, every enum and
 * every bound are unchanged, so a `v5` response is still a structurally valid `v6` response — this
 * bump is about model-visible text, which is the thing `§5.1`'s paired rule exists to keep
 * honest, and the label is what lets evidence say which contract produced an artifact.
 *
 * `v5` is preserved at `docs/model-prompts/history/design-intent.v5.system.md` and
 * `docs/model-schemas/history/design-intent.v5{,.wire}.schema.json`. The T22 evidence stays
 * attributed to `v5` and is never relabelled.
 */
export const DESIGN_INTENT_PROMPT_VERSION = "design_intent_v6";
export const DESIGN_INTENT_SCHEMA_VERSION = "design_intent_schema_v6";

/**
 * How the DesignIntent request envelope is built: which channels are present, how each is
 * labelled to the model, in what order they appear, how precedence between them is expressed.
 *
 * The same rule as `EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION`, and here for the same reason. The
 * prompt version names the accepted contract; the *effective model input* can change underneath
 * it, and hiding a behaviour change under an unchanged label is what this project has already
 * paid for once. `design_intent_artifacts.design_intent_input_assembly_version` records this
 * constant, `not null`, so "produced before this was recorded" and "the writer forgot" cannot be
 * the same value (`docs/phase-4b-plan.md §G.2`).
 *
 * **`v1` is the authoritative creative brief plus one sibling assignment**, and nothing else.
 * `docs/phase-4b-plan.md §E`: each call receives "the **creative brief** from the same
 * authoritative identity — the `identity` sibling of the envelope, including
 * `inspirationSummary` — plus **only its own sibling assignment**". The brief is the branded
 * `AuthoritativeIdentity`, so the envelope around it does not travel: `suppliedFacts` and
 * `clarification` stay in the identity layer. The raw host prompt and raw inspiration assets
 * never reach this call at all (`spec.md §7.5`, `§F`), the structural directive and the
 * attractive-token allotment are the composition call's (`spec.md §7.7`), and capabilities, the
 * content profile, another sibling's output and any library recipe or silhouette identifier are
 * excluded by `§E` and `CLAUDE.md §5.1`. An earlier draft of the plan sent the directive, the
 * allotment and capabilities; it was withdrawn, and T17 persisting the first two on the artifact
 * for lineage is not a route back in. `src/lib/ai/design-intent/input.ts` is the typed form of
 * this paragraph and `boundary.test.ts` is its proof.
 *
 * It bumps for any change to that envelope's **contents, precedence, ordering or representation**
 * — adding or removing an input channel, relabelling one, reordering them, or changing how the
 * brief or the assignment is rendered. It does not bump for a prompt-file edit or a schema
 * change; those have versions of their own and the three are independent.
 *
 * `v1` declared the contents before any rendering of them existed, and left the next task to
 * decide whether it was choosing a representation for the first time or changing one. T21 chose
 * one for the first time: `src/lib/ai/openai/design-intent-input.ts` is the whole of it — the
 * labels, the delimiters, the order, and the sentence that states which half of the brief is
 * authoritative and which is advisory. The contents are unchanged, still exactly the two channels
 * `§E` names, so this stays `v1`. It bumps the first time any of that rendering changes.
 * **`v2` is `v1` plus this concept's own premise**, rendered as a third delimited block after the
 * brief and before the assignment, under a preamble that states its authority against the other
 * two: below `hostConstraints`, above `creativeGuidance`, and never the host's instruction. The
 * contents changed — a channel was added — so the rule above requires this bump, and it is what
 * lets a persisted artifact say whether a DesignIntent was authored with a premise or without one.
 *
 * The premise is produced by `src/lib/ai/concept-premise/`, which reads the same authoritative
 * brief and nothing else. It is still true that no sibling receives **another sibling's output**:
 * each call sees its own premise and neither of the other two.
 */
export const DESIGN_INTENT_INPUT_ASSEMBLY_VERSION = "design_intent_input_v2";

/**
 * The ConceptPremise stage — one model call per batch, three premises authored as a set.
 *
 * `docs/phase-4b-plan.md §E` reserved this decision in advance: *"if fresh evidence shows blind
 * siblings converge despite planner separation, that is a deliberate subsequent design and spec
 * decision argued from data, not a mechanism added on suspicion."* The T22 run is that data and
 * `docs/designintent-sibling-convergence.md` is that argument.
 *
 * Three constants from the first version, for the same three reasons the other two stages have
 * three: the prompt names the accepted contract, the schema names the shape, and the assembly
 * names the effective model input, which can change underneath either of the other two.
 *
 * `v1` sends **one channel** — the authoritative creative brief — and nothing else. Not the raw
 * prompt, not `suppliedFacts`, not the sibling assignments, not capabilities. The exclusion of
 * `suppliedFacts` is load-bearing rather than tidy: the validator refuses a premise that asserts a
 * specific the brief does not carry, and a stage that could see the host's literal names and dates
 * would turn that check into a test of whether the model copied a field.
 */
export const CONCEPT_PREMISE_PROMPT_VERSION = "concept_premise_v1";
export const CONCEPT_PREMISE_SCHEMA_VERSION = "concept_premise_schema_v1";
export const CONCEPT_PREMISE_INPUT_ASSEMBLY_VERSION = "concept_premise_input_v1";
/**
 * `p3` carries the host constraints (`docs/model-prompts/composition.system.md` block 1a).
 *
 * `p2` listed "constraints" inside block 1 without saying they bind, and the call shape in
 * `src/lib/ai/provider.ts` — `{designIntent, capabilities, directive, reprompt?}` — had nowhere to
 * put one. A host constraint whose subject is structure could therefore survive Event Identity and
 * never reach the stage that authors structure. The block states the authority and scopes the
 * obligation rather than filtering the evidence, for the reason in
 * `src/lib/ai/composition/brief.ts`. Nothing else about `p2` changed, and the Phase B
 * confirmation-run evidence behind `p2` is evidence about `p2`.
 */
/**
 * `p4` offers the `Artwork` leaf to directions that asked for artwork, and to no others.
 *
 * `spec.md §7.6a #1` makes imagery "optional, and chosen by the creative direction", so the
 * primitive is a **narrowing** rather than a new universal: a typography-led direction is sent a
 * primitive spec that does not mention artwork at all, exactly as a capability-less event is sent
 * no RSVP node. Two concepts in one batch can therefore receive different `p4` prompts, which is
 * what `COMPOSITION_INPUT_ASSEMBLY_VERSION` is for.
 */
export const COMPOSITION_PROMPT_VERSION = "composition_v1_p4";
/** `v2` admits the `Artwork` leaf; every `composition_schema_v1` tree remains valid under it. */
export const COMPOSITION_SCHEMA_VERSION = "composition_schema_v2";
/**
 * The Composition request assembly (`src/lib/ai/openai/composition-input.ts`).
 *
 * Bumps when the request's *contents*, precedence, ordering or representation change — the same
 * rule the other three assemblies follow. It travels with `PRIMITIVE_SET_VERSION` in practice,
 * because the primitive-spec and rules blocks are generated from `NODE_SPEC`: a primitive added to
 * the language changes the bytes this assembly sends without anyone editing the assembly.
 */
export const COMPOSITION_INPUT_ASSEMBLY_VERSION = "composition_input_v2";
/**
 * The primitive set a concept was compiled against (`spec.md §32 #15`).
 *
 * **`composition_v2`** adds the `Artwork` leaf. Note what does *not* move with it: the
 * `CompositionTree.version` wire literal stays `"composition_v1"`, because adding a member to the
 * node union is additive — every tree a `composition_v1` model produced is still valid under the
 * `v2` schema, and nothing persisted needs rewriting. The two strings answer different questions.
 * The literal says *what shape arrived*; this constant says *which language was on offer*, and
 * only the second changed.
 *
 * That split is what keeps "never silently recompile historical concepts against a newer primitive
 * set" enforceable rather than aspirational: the 36 specs already persisted keep
 * `primitive_set_version = "composition_v1"`, render from their own stored
 * `ResolvedDesignSpec`, and are distinguishable in the ledger from anything generated since.
 */
export const PRIMITIVE_SET_VERSION = "composition_v2";
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
 *
 * **`planner_v2`** makes every emitted assignment internally coherent. `planner_v1` could emit a
 * `typographyPairings` list broader than the `typographyCategory` beside it: when no pairing in
 * the drawn category held at the assigned hierarchy — reachable on `editorial` + `monumental` +
 * `oldstyle`, and there alone — it fell back to a pool spanning several categories and then
 * resolved the category from one pick inside that pool, emitting the whole pool. Canon describes
 * one set, not two (`docs/model-contracts.md §5.1` "in the assigned category", `§5.2` "filtered by
 * category and by whether they hold at the assigned hierarchy", `docs/phase-4b-plan.md §E` "within
 * the **assigned** category"), so the planner now narrows the pool to the resolved category after
 * the pick. Nothing else moves: the filter consumes no PRNG value and runs after every draw, so
 * family, tonalDirection, typographyCategory, hierarchy, the directive, the seeds and the token
 * allotment are byte-identical to `planner_v1` for the same revision. Only `typographyPairings`
 * changes, and only on that one path.
 *
 * It is still a bump, because the same identity revision now yields a different assignment, and a
 * persisted `planner_v1` batch is the artifact its version says it is. Historical `planner_v1`
 * output stays exactly what it was and is never re-planned: replay identity remains
 * `(identityRevisionId, PLANNER_VERSION)`, and running `planner_v2` against a `planner_v1`
 * revision produces a different, equally legitimate batch — not a correction of the old one.
 */
export const PLANNER_VERSION = "planner_v2";

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
