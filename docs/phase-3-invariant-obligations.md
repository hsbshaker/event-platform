# Phase 3 — Library Boundary Invariant: mechanical obligations

Working checklist for the Phase 3 port. The invariant itself is canonical in
`docs/event-renderer-system.md §7.1`, with the agent-facing statement in `CLAUDE.md §5.1` and
`AGENTS.md`. This file tracks only which mechanical guarantee is enforced where, so that a
guarantee whose layer does not exist yet is an open obligation rather than a silent gap.

Delete this file when Phase 3 closes and every row reads "enforced".

| # | Guarantee | Enforced by | State |
| --- | --- | --- | --- |
| 1 | A valid novel `CompositionTree` with no corresponding fixture validates, canonicalizes and resolves layout, and collides with no library hero skeleton at either breakpoint | `composition.test.ts`, "novelty" | **enforced** |
| 2 | The same novel tree compiles, renders and geometry-verifies clean, with no library selection invoked | language, compiler and render halves are proven: `tests/unit/library-boundary.test.ts`, `compile/spec.test.ts`, and `components/event-renderer/renderer.test.ts` (a full page renders from a novel tree's spec, and from all 16 A.1 pages and sampled frozen trees, with no fixture identifier in the markup) | partial — the **geometry-verify** half still needs the Chromium verifier |
| 3 | No production module can import the legacy library | `eslint.config.mjs`, forbidden across `src/**`; `tests/unit/library-boundary.test.ts` runs the real config over the real composition, compiler, planner, selector, directives and vocabulary modules plus representative *future* generation and orchestration paths | **enforced**, mutation-checked against both a narrowed rule and a widened exemption |
| 4 | Exactly two adapters are exempt, one per role, and `recovery/**` cannot absorb few-shot retrieval | `tests/unit/library-boundary.test.ts` asserts the exemption list structurally: `src/lib/renderer/recovery/**`, `src/lib/renderer/few-shot/**`, and test files | **enforced** |
| 5 | The few-shot adapter exposes no recipe, silhouette or template identifier that could become a candidate-choice variable | `src/lib/renderer/few-shot/few-shot.test.ts`: the module exports only `compositionExamples` and its count, the returned trees carry none of the 61 library fixture identifiers (hero, details, rsvp, registry, plan and A.1 site) anywhere in their serialized shape, and the only parameter is a seed | **enforced** |
| 6 | Normal generation consumes example trees without learning where they came from | test that the composition-call input carries trees and no fixture identifier | open — needs the generation path (Phase 4) |
| 7 | The terminal fallback is unreachable until the documented retry was legitimately authorized *and* exhausted | `src/lib/renderer/recovery/fallback.ts` checks the whole attempt history, not just the last attempt: the first failure must be the one that authorized this reason's retry, and the retry must also have failed. `recovery.test.ts` enumerates every history of length 0–3 for both reasons and asserts exactly one is served (`[invalid, invalid]`; `[collided, collided]`), each refusal naming the right caller state. Mutation-checked: removing any one branch of the guard fails a test | **enforced** |
| 8 | Fallback use and reason are observable in generation telemetry | `FallbackTelemetry` — reason, source, seed, fixtureId, attemptsSpent — is returned with every served fallback and asserted in `recovery.test.ts` | **Phase 3 side done**; open — Phase 4 records it on the `GenerationRun` |
| 9 | Neither the `DesignIntent` nor the `CompositionTree` schema carries a recipe, silhouette or template identifier | **DesignIntent: `tests/unit/model-contract.test.ts`** — 12/12 pairing ids and 7/7 motif ids match the production vocabulary both ways, families and tones match, narrowing keeps category and pairing distinct. **CompositionTree: `composition/json-schema.test.ts`** — the committed `docs/model-schemas/composition.schema.json` must equal what `compositionJsonSchema()` generates from `NODE_SPEC`, the same table the validator and the prompt's primitive spec are generated from; the generated schema's primitives, props, required sets, token enums and children bounds are checked against the spec table, and both artifacts are scanned for forbidden identifiers | **enforced** |
| 10 | The renderer stays recipe-agnostic: one fixed component per primitive, no branch per recipe | `tests/unit/renderer-boundary.test.ts`, from outside the module so editing the renderer and its own tests together still fails: the map's keys equal `PRIMITIVE_KINDS` (29, derived from the language's `NODE_SPEC`), 29 distinct implementations, and no renderer source names a fixture identifier, an adapter, or `DesignIntent`. Mutation-checked against a dropped primitive and an added recipe branch | **enforced** |
| 11 | Seeded few-shot rotation is deterministic by specification, not by the engine's sort algorithm | replace the random-comparator sort with a specified shuffle; see **Phase 4 obligation** below | open — **Phase 4, before the first production model call** |

## Notes

**What landed with the adapters (Phase 3, item 2).** `src/lib/renderer/library/` holds the 26
silhouettes, 13 section recipes, 6 surface plans and 16 A.1 site rows as typed, inert data plus
`page()`. It has no `chooseHero`, no `nearestRecipe`, no similarity, ranking or scheduling helper,
and it is not reachable from production source outside the two adapters. `library.test.ts` proves
it byte-identical to `proof-b/library.js` and proves the production module still reproduces the
captured golden oracle through the production composition core.

**On the few-shot rotation, and the Phase 4 obligation it carries (row 11).**
`compositionExamples(seed)` preserves the reference's rotation exactly — `mulberry32(seed + 99)`,
then `Array.sort` with that comparator, then three — and Phase 3 keeps it that way, because
changing it would re-roll the prompt examples of every seed in the frozen confirmation set and
break the reference port's honesty.

It is not a sound long-term mechanism. `sort` with a random comparator is not a shuffle: the
permutation depends on the engine's sort algorithm as well as the comparator. It is stable in
practice today (V8 uses binary insertion sort below 64 elements and `A1_SITES` has 16), and
`few-shot.test.ts` pins the result against the reference expression for eleven seeds, so drift
fails a test rather than surfacing in a generation run. That pins V8's behaviour, not an
algorithm.

**This is not fixed in Phase 3.** Before the first production model call in Phase 4, all four of
these must happen together:

1. replace the random-comparator sort with a specified deterministic shuffle — seeded
   Fisher-Yates over `mulberry32`, or another algorithm written down in
   `docs/model-contracts.md`;
2. bump the composition-prompt version identifier (`compositionPrompt`, currently
   `composition_v1_p2`, carried in `ResolvedDesignSpec.versions`), because the examples a seed
   receives change;
3. change `few-shot.test.ts` to pin the algorithm itself — its output for known seeds computed
   from the specification — instead of comparing against `proof-b/prompt.js`;
4. run a fresh production generation and confirmation evaluation against the
   `docs/event-renderer-system.md §9` thresholds. The frozen Phase B run does not carry over,
   because its prompts are not the prompts the new rotation produces.

Doing 1 without 2 and 4 would silently invalidate the confirmation evidence. Doing it after the
first production model call would mean two prompt regimes under one version identifier.

**On `fixtureId` in fallback telemetry.** It records which fixture a failed run fell back to, so
fallback rate can be measured per fixture. It is an output of a failure, never an input to a
decision. Feeding it back into generation would make it a candidate-choice variable, which §7.1
forbids by name; row 6 is where that stays enforced once the generation path exists.

**What the compiler slice added, and what it deliberately did not.** `src/lib/renderer/compile/`
resolves the page system, the semantic palette, typography, motifs, density spacing and layout,
and assembles them into a `PreVerificationDesignSpec`. That type's `verified` is `null` and its
`state` is `"pre-verification"`: rendered geometry is authoritative (`§3.1`), it has not run, and
the type makes claiming otherwise unrepresentable. Nothing here closes a row that depends on the
renderer or the verifier.


**The planner is on the right side of the boundary by construction.** `src/lib/renderer/planner`
works over DesignIntent assignment dimensions (family, tonal direction, typography category,
hierarchy) and the eight independent directive dimensions. It has no runtime dependency on the
library or on `proof-a1/`, no fixture identifier appears in any plan it emits, and the selector
hands a re-prompt the *colliding skeleton string* rather than any fixture identity. A collision
authorizes the one re-prompt and then the terminal fallback in `recovery/**`, which is the only
path from a collision to the library, and it fails closed (row 7).


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
