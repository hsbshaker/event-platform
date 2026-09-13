# Phase 3 — Library Boundary Invariant: mechanical obligations

Working checklist for the Phase 3 port. The invariant itself is canonical in
`docs/event-renderer-system.md §7.1`, with the agent-facing statement in `CLAUDE.md §5.1` and
`AGENTS.md`. This file tracks only which mechanical guarantee is enforced where, so that a
guarantee whose layer does not exist yet is an open obligation rather than a silent gap.

Delete this file when Phase 3 closes and every row reads "enforced".

| # | Guarantee | Enforced by | State |
| --- | --- | --- | --- |
| 1 | A valid novel `CompositionTree` with no corresponding fixture validates, canonicalizes and resolves layout, and collides with no library hero skeleton at either breakpoint | intrinsic test in the composition core | landing with the core port |
| 2 | The same novel tree compiles, renders and geometry-verifies clean, with no library selection invoked | intrinsic test spanning compiler, renderer and verifier; a spy asserting the recovery module was never entered | open — needs the renderer and verifier |
| 3 | Normal composition, compiler, planner and renderer modules cannot import library selection | `eslint.config.mjs` `libraryBoundaryRules`; the only approved importer is `src/lib/renderer/recovery/**` | enforced, and proven to reject a violating import |
| 4 | The terminal fallback is unreachable until the documented retry is exhausted | unit test over the recovery entry point: it refuses to produce a page unless told the allowed attempt has already failed | open — needs the recovery module |
| 5 | Fallback use and reason are observable in generation telemetry | the recovery result carries a reason; Phase 4 records it when generation is wired | open — shape defined in Phase 3, recorded in Phase 4 |
| 6 | Neither the `DesignIntent` nor the `CompositionTree` schema carries a recipe, silhouette or template identifier | test scanning both schemas for such a field | open — needs the ported schemas |
| 7 | The renderer stays recipe-agnostic: one fixed component per primitive, no branch per recipe | test asserting the component map's keys are exactly the primitive allowlist | open — needs the renderer components |

## Notes

**Why row 3 names a single approved importer.** `docs/event-renderer-system.md §3` specifies
deterministic repair macros drawn from the library, and §3 and §5 specify a terminal fallback
after the allowed retry. Those paths are canonical and stay. Confining them to one module keeps
the permission auditable: anything else reaching the library is a lint error, not a judgement
call.

**Why row 4 is phrased as a refusal.** Making the fallback simply *not called* on the happy path
is a property of whoever calls it. Making it refuse unless the caller can show the retry was
spent is a property of the fallback, and survives a future caller that forgets.

**On the language core.** The composition language's own `DEFAULT_MACROS` already builds generic
structures from primitives with no library reference and no seeded selection. The seeded
silhouette macros live in the reference harness's compile step, which is where the permitted
override enters. The core therefore needs no library import at all, and row 3 forbids it one.
