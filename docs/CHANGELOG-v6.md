# Revision 6 Documentation Changelog

Revision 6 replaces the bundled-archetype renderer model of Revision 5 with the **composition language**: the model authors the page composition from a bounded set of trusted primitives; a deterministic compiler validates, repairs, fits against rendered geometry and freezes the result. Decided by three proof phases (`proof/`, `proof-a1/`, `proof-b/`), each with committed evidence.

## Renderer-architecture changes

Removed:
- `ArchetypeDefinition` bundles and the six archetype IDs;
- archetype-owned section/component treatment defaults and their enums;
- `heroArchetype` in `DesignIntent`;
- the "first three archetypes, then the remaining three" implementation gate.

Added:
- `CompositionTree`: nine layout containers, five decorative leaves, thirteen semantic nodes, enum tokens only; nesting, depth, box-depth, coverage and limit rules; capability scoping;
- `DesignIntent` v3: `family` and `composition` replace `heroArchetype`;
- a third strong-model call, `generateComposition(...)`;
- deterministic repair by kind (structural, coverage, capability, responsive, planner, fit) with no model call; re-prompts only for schema-invalid output, token-cap violations and selector collisions;
- rendered-geometry verification as the authoritative content-fit gate, with a CSS floor guaranteeing zero horizontal overflow;
- the sibling planner: distinct DesignIntents and structural directives per batch of three, attractive-token allotments (staggered titles, hero numerals, watermarks);
- the skeleton signature (structural tokens, per-breakpoint) and the .70 collision threshold;
- the library: Phase A.1 recipes as regression fixtures, few-shot examples, repair/fallback macros and calibration data;
- `ResolvedDesignSpec` v2 with the canonical tree, per-node resolved layout, verification record and version set;
- the proof harnesses as the regression suite and the confirmation-run thresholds.

Unchanged: Event Identity; the semantic palette compiler and contrast rules; typography pairing IDs and categories; motif roles, channels and caps; density; guest semantic flow; mobile convergence; immutability of generated data; imagery boundaries; every product-flow rule of Revision 5.

## Evidence

- Phase A (`proof/`): twelve hand-composed sites from one brief; ten distinct; two collisions traced to heroes without a structural parameter.
- Phase A.1 (`proof-a1/`): hero admission rule, twelve heroes with 27 silhouettes; Gate 2: sixty seeded sites, zero collisions, all skeleton classes distinct.
- Phase B (`proof-b/`): the language, primitive renderer, adversarial fixtures (37 repaired, 10 rejected), 152 exploratory model trees, then the six gate changes and a frozen confirmation run (`FREEZE.md`, `FINAL.md`): 72 uncurated trees in sibling batches; 72 of 72 schema-valid on the first call; 72 of 72 repair-valid with 71 raw trees breaking no rule; 58 distinct hero skeletons in 60, 78% outside the library; 0 sibling collisions; staggered titles 20, hero numerals 12, watermarks 3 of 60 under the caps; geometry clean on 71 of 72 under the frozen compiler and 72 of 72 after one renderer rule (containers and components always take a Stack's full width), re-verified over the identical trees.

## Conditions recorded with this revision

1. The one post-freeze renderer rule (compiler `proof-b-0.3`) is part of the canonical rule set; any further change to the language, validator, compiler, renderer rules or planner reruns the regression gates of `event-renderer-system.md §9`.
2. The design-quality bar (reviewers rate ≥ 70% of model first screens designed) is a **launch and design-quality gate, not a canonicalization gate**, and is not yet evidenced by humans. It runs twice: once now on the Phase B sheets for calibration against the library and to inform the production model and prompt, and again on the frozen production generation stack as the launch gate. An AI-proxy review on the prepared unlabeled sheets rated 45% of model screens designed against 35–40% of the hand-authored library screens; the model meets or exceeds the library, the instrument is harsh on grayscale thumbnails. The five-reviewer human test (`proof-b/human-test-form.md`, scored by `proof-b/score-human.js`) must run before launch, and the threshold is to be calibrated against the library's score in the same session.

## Revision 6.1 — content lifecycle and generation sequencing

Clarifications, not architecture: three separate layers (`Capabilities` = enabled features, `ContentProfile` = present content, `FeaturePresentationState` = guest visibility, never sent to the model); DesignIntent and CompositionTree immutable with content edits appending new immutable `ResolvedDesignSpec` revisions per concept and no model call; required details as publish requirements collected during generation with bounded provisional content and deterministic re-fit, never a prerequisite for concepts; end time optional; an exact RSVP-deadline default; human review run twice. See `spec.md §0b`.

## Revision 6.2 — clerical reconciliation of the hero-silhouette count

Bookkeeping, not architecture. No behaviour changes and the composition language is untouched.

The canonical library holds **26** hero silhouettes, not 27. Phase A.1's `heroRecipes` contains twelve recipes whose declared structural variants sum to 26 (`editorial_masthead` and `typography_first` have three each, the other ten have two), and `proof-b/library.js` implements exactly those 26. The "27" was a counting error that propagated from the Phase A.1 write-up into this revision's text, and the comment in `library.js` repeating it is part of the same error. No fixture is missing, and none was invented to make the number fit.

Corrected here because both statements describe the actual library:

- `event-renderer-system.md §7` — the library is 26 silhouettes and 13 section recipes;
- `event-renderer-system.md §9` — the expressiveness gate is all 26 silhouettes and 13 section recipes;
- `e2e-workflow.md` — the same gate in the generation-run checklist.

The section-recipe count of 13 was already right: four details, five RSVP, four registry.

Frozen proof evidence keeps its original wording. `proof-a1/vocabulary.md`, `proof-b/README.md` and `proof-b/PROPOSAL.md` are the record of what those phases said at the time, and `FREEZE.md` pins their hashes; rewriting them to tidy a number would damage the evidence the architecture rests on. The correction is canonical here instead.

A related count, recorded so the Phase 3 replay gate is unambiguous: the frozen confirmation set is **72 trees**, 60 full-capability and 12 reduced. Phase B made 74 composition calls, because two selector collisions were re-prompted; those two rejected attempts are evidence of the collision path working, not confirmation trees. The Phase 3 replay gate is 72 of 72.

## Documentation hierarchy

`spec.md` Revision 6 → `technology-decisions.md` → `design-system.md` → `event-renderer-system.md` Revision 2 → `model-contracts.md` Revision 2 → `e2e-workflow.md` → `screen-spec.md` → this changelog → prototypes and proof folders as evidence. Revision 5 files are preserved unchanged where superseded text was moved, not rewritten.
