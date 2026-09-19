# Phase 4D live integration smoke — locally grown baby shower

**Phase 4D live integration smoke — locally grown baby shower — diagnostic/product evidence only;
not a benchmark and no generalization claim.**

One batch, one event, run once. It answers exactly one question:

> Can the completed downstream pipeline take a realistic authoritative `EventIdentity` and turn it
> into three real model-authored `CompositionTree`s that compile, geometry-verify, persist and
> render as three actual event websites?

It is **not** an EventIdentity test, a sealed benchmark, fresh or generalization evidence, or a
creative-quality score. One example shows a path works. It shows nothing about a population, and
no band, rating or wowability judgement is recorded here or belongs here.

## What ran

| | |
| --- | --- |
| Implementation | `2473e1c`, clean tree |
| Started | `2026-09-19T08:13:38Z` · 128.8 s wall |
| Provider calls | **7** — 1 `concept_premise`, 3 `design_intent`, 3 `composition`; 0 failures |
| Retries | 1 bounded premise repair retry; 0 elsewhere |
| Outcome | `generated`; batch `completed`; all three siblings `succeeded` at attempt 0 |
| Geometry | 3/3 `verified.clean = true` at 390 and 1280, zero overflow, zero fit demotions |
| Cost | ≈ **$0.39**, priced from recorded telemetry against the verified `gpt-5.6-sol` profile |

**EventIdentity was not called.** The run begins from the fixed authoritative fixture in
`identity-fixture.json`, which stands in for what the real interpreter is expected to produce. No
raw host prompt was sent anywhere, and no clarification was exercised.

Nothing operational was invented — no date, time, venue, honoree, host names, deadline, guest count
or registry. The pages render the production bounded provisional content of `spec.md §7.3`.

## Files

| | |
| --- | --- |
| `identity-fixture.json` | the exact authoritative identity the run started from |
| `run-summary.json` | calls, tokens, cost, lineage, premises, geometry, repairs |
| `provider-telemetry.jsonl` | one row per provider call, as production recorded it |
| `concepts/concept-N.json` | premise, DesignIntent, capabilities, content profile, raw and canonical trees |
| `visuals/index.html` | the contact sheet — open this |
| `visuals/concept-N-{mobile,desktop}.png` | 390 and 1280 full-page, `deviceScaleFactor` 1 |

Each screenshot is the **exact persisted `ResolvedDesignSpec`** rendered through the production
`EventPage` renderer with production CSS and fonts and that spec's own final verification
overrides. Not the raw tree, not the pre-verification spec, and not a mock renderer.

## What the run produced

| # | Premise | Register | Concept card |
| --- | --- | --- | --- |
| 1 | Tended Welcome | lingering / poised / considered | **Tended Welcome** — a calm, cultivated welcome that unfolds with quiet warmth, thoughtful care and purposeful garden character |
| 2 | Market Welcome | propulsive / poised / layered | **Market Welcome** — a bright, polished market welcome with lively produce colour, generous character and a sense of discovery |
| 3 | Gathered Abundance | measured / commanding / layered | **Gathered Abundance** — a generous harvest mood gathers seasonal warmth and tactile richness into a poised, celebratory welcome |

Three distinct composition hashes. No library fallback on any sibling. No card deviations: the
model's own names and descriptions survived the deterministic set review unchanged.

## Compiler and lineage

All three trees were **structurally valid as authored** — zero deterministic repairs of any kind,
zero attractive-token violations. Two `srgb-gamut-clamp` deviations on concept 2's palette are the
compiler doing its documented job.

Lineage verified in SQL across all three siblings: identity revision → batch → DesignIntent
artifact → `design_concepts` (raw and canonical trees) → `resolved_design_specs`, with
`active_resolved_spec_id` pointing at the right revision and each concept linked to **its own**
sibling's artifact.

## Host-constraint propagation

The two authoritative constraints — *Not childish.* and *Not cheesy.* — reach Composition through
the typed 4D path, verified deterministically by re-deriving the request the run sent
(`scripts/smoke/constraint-check.smoke.ts`, no provider call):

- both constraints arrive **verbatim and complete**, under an `AUTHORITATIVE` label;
- **no `creativeGuidance` string appears anywhere** in the message;
- **the host's own words never travel** — interpretation happened once;
- no guest data, RSVP data, registry contents or private code is present;
- the content profile carries measurements, not strings to lay out.

No observable Composition choice was found to contradict either constraint. That is a statement
about contradiction, not about taste: this file records no quality judgement.

## Known limitation this run exposed

**The selector never ran.** `nearest_sibling` is null on all three composition rows because
`runConceptBatch` passes neither `against` to `compileConcept` nor `collides` to the provider —
the siblings compose in parallel and none is settled when another starts, so no sibling skeleton is
available to compare against. The collision machinery exists and is unit-tested on both sides; it
is simply inert on the production path. Nothing collided here (three distinct hashes), so the run
was unaffected, but the guard did not fire because it was never fed. Recorded, not fixed: this run
is evidence of what the system does as-is.

## Frozen

Nothing was tuned after the result. The identity fixture, every prompt, the trees, the compiler,
the renderer, the CSS, the provisional content and the screenshot framing are all exactly what
produced this output.
