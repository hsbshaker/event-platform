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
2. The design-quality bar (reviewers rate ≥ 70% of model first screens designed) is **not yet evidenced by humans**. An AI-proxy review on the prepared unlabeled sheets rated 45% of model screens designed against 35–40% of the hand-authored library screens; the model meets or exceeds the library, the instrument is harsh on grayscale thumbnails. The five-reviewer human test (`proof-b/human-test-form.md`, scored by `proof-b/score-human.js`) must run before launch, and the threshold is to be calibrated against the library's score in the same session.

## Documentation hierarchy

`spec.md` Revision 6 → `technology-decisions.md` → `design-system.md` → `event-renderer-system.md` Revision 2 → `model-contracts.md` Revision 2 → `e2e-workflow.md` → `screen-spec.md` → this changelog → prototypes and proof folders as evidence. Revision 5 files are preserved unchanged where superseded text was moved, not rewritten.
