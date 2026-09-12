# Event Platform Documentation — Revision 5

This folder is the reconciled documentation set after the creation-UX and renderer-architecture pressure tests.

## Source-of-truth order

1. **`../spec.md`** — product/business/architecture requirements.
2. **`technology-decisions.md`** — locked MVP stack; do not relitigate.
3. **`design-system.md`** — application UX, interaction, visual tokens, responsive/motion/accessibility system.
4. **`event-renderer-system.md`** — generated guest-site renderer architecture.
5. **`e2e-workflow.md`** — canonical journey reference.
6. **`screen-spec.md`** — screen/surface-level behavior.
7. **`CHANGELOG-v5.md`** — summary of the decisions reconciled into this revision.
8. **`prototypes/creation-flow.html`** — behavioral prototype; not architectural truth.
9. **`renderer-tests/`** — renderer evidence/test artifacts; not product requirements.

When documents conflict, use the highest source in the list unless a lower document is explicitly called out by the higher source as authoritative for implementation detail.

## Historical files

Revisioned files such as `spec_v4.md`, old prototypes, and the original renderer gallery are historical evidence.

Do not patch old revisions to look current. Preserve them so decisions remain auditable.

## Current renderer status

Architecture is now:
- six-field DesignIntent;
- versioned bundled archetypes;
- deterministic motif/typography/palette compiler;
- immutable ResolvedDesignSpec;
- event-level palette/typography overrides only.

The first three archetypes passed the **old bundled visual-distinctness experiment**, but they have not yet passed the complete new compiler contract.

Before implementing the remaining three archetypes:
1. refactor the gallery/renderer to consume the new contract;
2. run compiler unit tests;
3. rerun constrained Brief 1;
4. run five swap/repair tests;
5. run light-only Brief 2.
