# Event Platform Documentation — Revision 6

This folder is the reconciled documentation set after the creation-UX pressure test and the three renderer proof phases. The proofs' source, fixtures, tests and confirmation-run data live on `main` under `../proof-b/` and `../proof-a1/` (reference subset); the complete evidence, including screenshots, compiled specs, exploratory runs and judge output, is on the frozen proof branches `proof/phase-b` (`b74ccab`), `proof/phase-a1` (`01f65bc`) and `proof/phase-a` (`cda5fa6`).

## Source-of-truth order

1. **`../spec.md`** — product/business/architecture requirements.
2. **`technology-decisions.md`** — locked MVP stack; do not relitigate.
3. **`design-system.md`** — application UX, interaction, visual tokens, responsive/motion/accessibility system.
4. **`event-renderer-system.md`** — generated guest-site renderer architecture.
5. **`model-contracts.md`** — the three strong-model contracts (Event Identity, DesignIntent, Composition): prompts in `model-prompts/`, canonical schemas in `model-schemas/`.
6. **`e2e-workflow.md`** — canonical journey reference.
7. **`screen-spec.md`** — screen/surface-level behavior.
8. **`CHANGELOG-v6.md`** — what Revision 6 changed; `CHANGELOG-v5.md` for the prior revision.
9. **`prototypes/creation-flow.html`** — behavioral prototype; not architectural truth.
10. **`../proof-b/`** — reference implementation and regression suite of the composition language (source subset on `main`; full evidence on branch `proof/phase-b` at `b74ccab`); **`../proof-a1/`** — the recipe library it depends on (`sites.js`, `vocab.js`, fonts); **`renderer-tests/`** — older renderer evidence; none is product requirements.

When documents conflict, use the highest source in the list unless a lower document is explicitly called out by the higher source as authoritative for implementation detail.

## Historical files

Revisioned files such as `spec_v4.md`, old prototypes, and the original renderer gallery are historical evidence.

Do not patch old revisions to look current. Preserve them so decisions remain auditable.

## Current renderer status

Architecture is now:
- six-field DesignIntent (`family`, tone, palette, typography, density, `composition`);
- a model-authored `CompositionTree` of trusted primitives, scoped to the event's capabilities;
- a deterministic compiler: strict schema, structural repair by kind, attractive-token caps, canonicalization, semantic palette, layout resolution, rendered-geometry verification;
- immutable, verified `ResolvedDesignSpec`;
- a sibling planner for concept diversity (distinct intents, directives, token allotments, skeleton-signature collisions);
- the Phase A.1 recipes as a library (regression, examples, macros, calibration), not a template set;
- event-level palette/typography overrides only.

The proof harnesses in `../proof-b/` are the regression suite; thresholds are in `event-renderer-system.md §9`; the confirmation-run results and the two open conditions (renderer rule 0.3 frozen; human design-quality review pending) are in `CHANGELOG-v6.md` and `../proof-b/FINAL.md`. Production implementation ports `proof-b/src/composition.ts`, the planner and the renderer rules into the application package without changing their behaviour, then reruns the confirmation set (`proof-b/model/final` and `final-reduced`, 72 trees, on `main`). `proof-b/README.md` lists what is on `main` and what is only at the tag.
