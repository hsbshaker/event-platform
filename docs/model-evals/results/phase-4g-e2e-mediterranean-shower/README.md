# Phase 4G — the whole creative system, from a raw host prompt, once

Diagnostic and product evidence. **Not a benchmark, not a gate, and nothing here is scored.** One
prompt, one seed, one run. No claim generalizes beyond it.

- Run: `2026-09-19T14:09:07Z`, **71.8s** wall
- Input: the frozen prompt in `raw-prompt.txt`, and nothing else. No identity fixture, no spent
  eval case. Frozen in its own commit before this harness existed.
- Text: **8 live calls** — 1 EventIdentity, 1 ConceptPremise set, 3 DesignIntent, 3 Composition —
  `gpt-5.6-sol`, **$0.1814**
- Images: **0 calls**, **$0.00** against a $1.50 ceiling
- Outcome: 3 concepts, all verified clean at 390 and 1280

Every stage was schema-valid on its first call. Zero re-prompts of any kind — schema, token-cap or
collision — zero fallbacks, zero repair retries, zero transient retries.

---

## 1. The system understood the prompt, and invented nothing

`EventIdentity` read it as:

> A sun-warmed, old-world Mediterranean courtyard garden interpreted with elegant ease: cultivated
> greenery, ripe lemons, time-softened tile, warm ivory, and faded blue. The atmosphere should feel
> intimate and celebratory rather than themed, juvenile, or ceremonious.

Tone: *sun-warmed · elegant · relaxed · old-world · garden-rich · intimate*. Motifs: ripe lemons
with leaves, climbing Mediterranean greenery, weathered courtyard tile geometry, garden arches and
trellises, subtle citrus blossom details.

The three exclusions survived verbatim as host constraints: `not nautical`, `not cartoonish`,
`not overly formal` — and the creative direction restates them in its own terms as "rather than
themed, juvenile, or ceremonious".

**Facts present were extracted; facts absent stayed absent** (`spec.md §7.5`):

| | |
| --- | --- |
| Extracted | `timeText: "afternoon"`, `venueText: "at home"`, `eventType: "afternoon shower"`, `honoreeDescriptionText: "My sister"` |
| Left null | date, address, locality, honoree name, host names, RSVP deadline |

One judgement worth an operator's eye: **"November" was not taken as the event date.** The prompt
says the baby is due in November, not that the shower is in November, and `dateText` is null. That
looks like the right reading, and it is the kind of reading that is worth checking rather than
assuming.

## 2. Clarification was not asked, and not forced

`clarification.needed: false` on the first call. The real policy decided the prompt was clear
enough to interpret, so no question was asked and none was manufactured — `clarification/decision.json`
records that plainly. The harness is able to answer a blocking boundary question and was rehearsed
doing so; it simply had nothing to answer here.

## 3. Three concepts, three different readings of one garden

| # | Name | Premise | Family | Ornament | Typography |
| --- | --- | --- | --- | --- | --- |
| 1 | Courtyard Embrace | the garden as hospitable enclosure, drawing guests inward | editorial | decorative | oldstyle garamond / work sans |
| 2 | Ripe Radiance | ripeness as the pulse — fruit and leaves as concentrated sunlit moments | invitation | restrained | transitional newsreader / inter tight |
| 3 | Weathered Rhythm | repetition supplies order; age and growth loosen it | invitation | restrained | soft fraunces / manrope |

Nearest-sibling similarity after the selector: **0.000, 0.200, 0.250**, against a 0.70 collision
threshold. Whether they are *creatively* distinct is the operator's question, not this number's.

## 4. Artwork: offered to all three, taken by none

`capabilities.artwork` was **true** for every concept. Blocks 4 and 5 of every composition request
carried the `Artwork` primitive, its nesting, its limits and its purpose. No tree placed one, so
nothing was reserved, nothing was requested, and **$0.00 of the $1.50 ceiling was committed**.

This is the second consecutive batch to decline artwork unanimously — the Phase 4E full smoke did
the same on a different identity. Two runs is not a pattern, and neither run was tuned to change
it. The composition rules say plainly that "artwork is optional and a concept is often stronger
without it"; whether that sentence is calibrated or over-corrected is a product judgement about the
composition prompt, and `docs/development-plan.md` carries it as an open question rather than a fix.

## 5. Latency: every target missed, and by how much

`spec.md §7.10` sets p75 goals and `§32 #45` says to measure them rather than hide them. This is one
sample, not a p75, but it is the only measurement that exists:

| Milestone | Target | This run |
| --- | --- | --- |
| Event Identity visible | ≤ 5s | **22.9s** |
| First concept rendered | ≤ 15s | **71.8s** |
| All three rendered | ≤ 45s | **71.8s** |

Where it went: EventIdentity 22.9s; ConceptPremise **35.5s** — the single largest cost in the run,
and it blocks all three siblings because one call authors the set; DesignIntent 6.4 / 7.5 / 9.8s in
parallel; Composition 25.1 / 25.1 / 25.5s in parallel. The targets predate both the premise stage
and artwork, and `docs/product-doctrine.md §14` conflict 9 already records that they need
re-setting deliberately against a measured pipeline rather than widened quietly. This is that
measurement.

## 6. The concepts did not arrive one at a time

`telemetry/generation-state.jsonl` holds 96 samples of the read model taken while the batch ran.
They contain **four** distinct states:

| at | stage | concepts |
| --- | --- | --- |
| 0ms | `not_started` | — |
| 755ms | `exploring` | all three `planned` |
| 45.3s | `designing` | all three `designing` |
| 71.8s | `ready` | all three `ready` and previewable |

So a host watching this run would have seen three concepts appear together, not one at a time. Two
separate causes, and they are different in kind:

- **The DesignIntent artifacts are persisted in one insert.** `concept-batch.ts` collects all three
  siblings and writes them as a single statement, so per-concept "designing" can never stagger, by
  construction — even though the three calls returned 3.4s apart. `spec.md §7.10` wants concept
  names surfaced "as each is genuinely resolved", and a batched insert forecloses that. This is a
  structural limitation, not a tuning question.
- **The three compositions genuinely finished together**, within 500ms of each other. Nothing is
  wrong here; that is just what happened.

**The mechanism for independent readiness is built and proven** — `previewable` follows each
concept's own verified spec and never its siblings', and the projection, the panel and the database
tests all hold it. What this run shows is that the mechanism had nothing to express, because the
work arrived in lockstep. Both facts belong in the record.

## 7. Geometry

Clean at 390 and 1280 on all three. `pageOverflow` false, `textOverflow` 0.

| Concept | 390 | 1280 |
| --- | --- | --- |
| 1 | 390 × 900 | 1280 × 949 |
| 2 | 390 × 900 | 1280 × 1021 |
| 3 | 390 × 900 | 1280 × 900 |

No no-art diagnostic pairs, because no concept received art.

## 8. Cost

| | |
| --- | --- |
| Text | **$0.1814** — input 51,927 (3,211 cached), output 10,489, reasoning 7,412 |
| Images | **$0.00** of a $1.50 ceiling; 0 of 8 permitted attempts |
| Total | **$0.1814** |

## 9. Files

| Path | What it is |
| --- | --- |
| `raw-prompt.txt` | the frozen host prompt, the only input |
| `event-identity.json` | the interpretation, its versions and its latency |
| `clarification/decision.json` | what was asked, what was answered, and that nothing was forced |
| `concept-premises.json` | the premise set, as one call authored it |
| `concepts/concept-N.json` | premise, presentation, DesignIntent, capabilities, content profile, raw and canonical trees, hash |
| `telemetry/text-provider.jsonl` | one row per live text call |
| `telemetry/artwork-provider.jsonl` | **empty** — no slot was reserved |
| `telemetry/generation-state.jsonl` | 96 samples of the 4F read model taken during the run |
| `visuals/concept-N-{mobile,desktop}.png` | the rendered page at each authoritative breakpoint |
| `visuals/index.html` | the operator contact sheet |
| `run-summary.json` | everything above, machine-readable |

## 10. Twelve questions for the operator

On the contact sheet, and deliberately unanswered there and here. This run is technically complete
and nothing about its *product quality* is claimed: whether these three feel designed rather than
generated, whether they feel like one system or like good pieces stitched together, and whether a
host would want one of them, are the questions the run exists to put in front of a person.
