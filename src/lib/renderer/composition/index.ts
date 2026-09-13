/**
 * The composition language core.
 *
 * `DesignIntent → CompositionTree (model-authored, trusted primitives) → deterministic compiler
 * (validate, repair, caps, geometry verification) → ResolvedDesignSpec → renderer`
 * (`docs/event-renderer-system.md`). This package is the language and the deterministic half of
 * the compiler up to layout resolution; the planner, the library, geometry verification and the
 * renderer components are separate.
 *
 * It is a port of `proof-b/src/composition.ts` with no behaviour change. The reference stays in
 * the repository as the regression suite, and `tests/fixtures/renderer-golden/` holds its exact
 * output; `*.test.ts` in this directory holds this port to it.
 *
 * Nothing here may depend on the A.1 library: the library's roles are repair macros, fallback,
 * few-shot examples, regression fixtures and signature calibration — never the normal path
 * (`docs/event-renderer-system.md §1.12`, §7).
 */

export * from "./tokens";
export * from "./nodes";
export * from "./spec";
export * from "./walk";
export * from "./validate-schema";
export * from "./validate-structure";
export * from "./repair";
export * from "./fit-estimate";
export * from "./canonicalize";
export * from "./signature";
export * from "./layout";
export * from "./prompt-text";
export * from "./attractive-tokens";
