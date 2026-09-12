# Revision 5 Documentation Changelog

This document summarizes the reconciliation from the prior PRD/design artifacts to the current Revision 5 source-of-truth set.

## Product-flow changes

- Landing page is now the event prompt.
- Auth occurs after the user has written the idea but before strong-model generation.
- Prompt and inspiration must survive OAuth/auth exactly.
- Concept selection leads to a full guest-site reveal.
- `Make it yours` converts the same site into Creation Mode.
- Pre-publish setup uses contextual editing rather than a dashboard/wizard.
- Readiness distinguishes publish blockers from optional recommended work.
- `Try another direction` is available on initial concepts, reveal, and Design.
- Preview is exact guest rendering with Mobile/Desktop width controls on larger screens.
- Management mode becomes operational after setup/publish.

## Renderer-architecture changes

Removed:
- model-owned orthogonal section/card/button/border/treatment choices;
- model `overrides` block;
- archetype-as-hero-only mental model;
- raw palette roles directly driving backgrounds/text/buttons.

Added:
- six-field `DesignIntent`;
- versioned `ArchetypeDefinition`;
- archetype-owned composition and component defaults;
- motif roles and slots;
- semantic palette compiler;
- deterministic compiler repairs;
- persisted `DesignIntent + archetypeVersion + ResolvedDesignSpec`;
- explicit generated-data-vs-renderer-code immutability boundary;
- themed guest component system;
- mobile guest-layout convergence rule;
- renderer proof gates and five focused swap/compiler tests.

## Documentation hierarchy

1. `spec.md`
2. `docs/design-system.md`
3. `docs/event-renderer-system.md`
4. `docs/e2e-workflow.md`
5. `docs/screen-spec.md`
6. behavioral prototypes / renderer test artifacts

Historical versions remain historical and should not be edited to appear current.

## Renderer validation status

The old gallery proved that three bundled visual compositions could be distinct.

It did not prove the original orthogonal schema.

The remaining renderer work is explicitly gated:
1. implement the compiler-backed contract;
2. rerun constrained Brief 1;
3. run swap/repair tests;
4. run light-only Brief 2;
5. only then implement the remaining three archetypes.
