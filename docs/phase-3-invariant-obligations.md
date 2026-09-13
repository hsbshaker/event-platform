# Phase 3 — Library Boundary Invariant: mechanical obligations

Working checklist for the Phase 3 port. The invariant itself is canonical in
`docs/event-renderer-system.md §7.1`, with the agent-facing statement in `CLAUDE.md §5.1` and
`AGENTS.md`. This file tracks only which mechanical guarantee is enforced where, so that a
guarantee whose layer does not exist yet is an open obligation rather than a silent gap.

Delete this file when Phase 3 closes and every row reads "enforced".

| # | Guarantee | Enforced by | State |
| --- | --- | --- | --- |
| 1 | A valid novel `CompositionTree` with no corresponding fixture validates, canonicalizes and resolves layout, and collides with no library hero skeleton at either breakpoint | `composition.test.ts`, "novelty" | **enforced** |
| 2 | The same novel tree compiles, renders and geometry-verifies clean, with no library selection invoked | intrinsic test spanning compiler, renderer and verifier; a spy asserting no adapter was entered | open — needs the renderer and verifier |
| 3 | No production module can import the legacy library | `eslint.config.mjs`, forbidden across `src/**`; `tests/unit/library-boundary.test.ts` runs the real config over representative present *and future* module paths, including generation and orchestration | **enforced**, mutation-checked against both a narrowed rule and a widened exemption |
| 4 | Exactly two adapters are exempt, one per role, and `recovery/**` cannot absorb few-shot retrieval | `tests/unit/library-boundary.test.ts` asserts the exemption list structurally: `src/lib/renderer/recovery/**`, `src/lib/renderer/few-shot/**`, and test files | **enforced** |
| 5 | The few-shot adapter exposes no recipe, silhouette or template identifier that could become a candidate-choice variable | test over the adapter's public surface: it returns `CompositionTree`s and nothing that names or ranks their origin | open — needs the few-shot adapter |
| 6 | Normal generation consumes example trees without learning where they came from | test that the composition-call input carries trees and no fixture identifier | open — needs the generation path (Phase 4) |
| 7 | The terminal fallback is unreachable until the documented retry is exhausted | unit test over the recovery entry point: it refuses to produce a page unless told the allowed attempt has already failed | open — needs the recovery adapter |
| 8 | Fallback use and reason are observable in generation telemetry | the recovery result carries a reason; Phase 4 records it when generation is wired | open — shape defined in Phase 3, recorded in Phase 4 |
| 9 | Neither the `DesignIntent` nor the `CompositionTree` schema carries a recipe, silhouette or template identifier | test scanning both schemas for such a field | open — needs the ported schemas |
| 10 | The renderer stays recipe-agnostic: one fixed component per primitive, no branch per recipe | test asserting the component map's keys are exactly the primitive allowlist | open — needs the renderer components |

## Notes

**Why the rule is production-wide rather than renderer-scoped.** A rule that named the renderer
directories would have been silent about the modules most likely to want a shortcut: the Phase 4
generation and orchestration code that drives a real concept batch, which sits outside
`src/lib/renderer/` entirely. So the library is forbidden across `src/**` by default and the
exemptions are named one directory at a time. `tests/unit/library-boundary.test.ts` lints
synthetic modules at `src/lib/generation/**`, `src/lib/orchestration/**`, `src/lib/ai/**` and
`src/app/**` for exactly this reason — the boundary has to hold for code that does not exist yet.

**Why two adapters and not one.** `docs/event-renderer-system.md §3` specifies deterministic
repair macros drawn from the library, and §3 and §5 specify a terminal fallback after the allowed
retry; §4 separately specifies rotated library examples in the composition call. Those are two
different roles on two different paths — one is failure recovery, the other is a normal-path
prompt input — and merging them would make `recovery/**` the generic place a module goes to reach
the library, which is the erosion the invariant exists to prevent. Row 4 pins the split.

**What normal generation may and may not do.** It may consume the `CompositionTree`s the few-shot
adapter returns, as prompt examples. It may not import, enumerate, rank, match, schedule or select
from the library, and it may not receive a recipe or silhouette identifier alongside the examples:
an identifier that reaches a decision is a candidate-choice variable, which §7.1 forbids by name.
Row 3 enforces the first half by lint today; rows 5 and 6 enforce the second half once the
adapter and the generation path exist.

**Why row 7 is phrased as a refusal.** Making the fallback simply *not called* on the happy path
is a property of whoever calls it. Making it refuse unless the caller can show the retry was
spent is a property of the fallback, and survives a future caller that forgets.

**On the language core.** The composition language's own `DEFAULT_MACROS` builds generic
structures from primitives with no library reference and no seeded selection. The seeded
silhouette macros live in the reference harness's compile step, which is where the permitted
override enters. The core therefore needs no library import at all, and row 3 forbids it one.

**Tests and tooling are outside the rule on purpose.** Regression and expressiveness fixtures and
signature calibration are permitted roles under §7.1, so `src/**/*.test.ts`, `tests/**` and
`scripts/**` may read the library. `parity.test.ts` does exactly that, through `createRequire`.
