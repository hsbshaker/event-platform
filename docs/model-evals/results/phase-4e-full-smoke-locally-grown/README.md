# Phase 4E — first full three-concept artwork smoke (locally grown baby shower)

Diagnostic and product evidence. **Not a benchmark, not a gate, and nothing here is scored.** One
event, one seed, one batch. No claim generalizes beyond this run.

- Run: `2026-09-19T12:56:47.762Z`, 87.5s wall
- Identity: `phase-4d-live-smoke-locally-grown/identity-fixture.json`, copied here byte-for-byte.
  Event Identity was **not** called; no new raw prompt, no clarification.
- Text: 7 live calls (1 premise + 3 DesignIntent + 3 Composition), `gpt-5.6-sol`, **$0.4094**
- Images: **0 calls**, **$0.00** against a $1.50 ceiling
- Outcome: 3 concepts, all `succeeded`, all specs verified clean at 390 and 1280

---

## The result: all three siblings were offered artwork and all three composed without it

No concept received artwork, and no image was requested. This is the unanimous-zero outcome the
brief for this run named in advance, and it is reported here as it stands: nothing was forced,
tuned or rerun to make the smoke more interesting.

What matters is that it was a real choice, so here is the evidence that artwork was genuinely on
the table for every one of the three.

| Layer | State on this run |
| --- | --- |
| `decideArtwork` (optionality gate) | **allowed** artwork on all three: `capabilities.artwork === true` for every concept |
| Block 2 of the composition request | `thematic artwork` listed under **Enabled for this event** |
| Block 4, the primitive spec | carried the `Artwork` node, generated from the same `NODE_SPEC` table the validator uses |
| Block 5, the rules | nesting admits `Artwork` as an `Overlay` decoration; limits allow 1 per section and 2 per page; a dedicated `Artwork` paragraph explains the node |
| Budget | 1, 1 and 2 slots were affordable (per-concept cap), $1.50 and 8 attempts unspent |
| Trees produced | **0** `Artwork` nodes, in raw and canonical alike — nothing was stripped by repair |

The primitive spec is generated **per capability into the user message**, not fixed in the system
prompt: `specText(caps)`/`rulesText(caps)` omit a node the event may not use, so an event without
artwork is never shown it (`docs/event-renderer-system.md §2.3`). On this run `caps.artwork` was
true for all three, so all three were shown the node, its nesting, its limits and its purpose. The
composition call uses JSON mode with no provider-side schema, so those blocks are the whole of what
the model had — and they contained artwork.

Three siblings, three different families (editorial, statement, invitation), two ornament settings
(`restrained`, `restrained`, `decorative`), and the same answer from each.

### The sentence the operator should look at

Block 5's artwork paragraph ends:

> Artwork is optional and a concept is often stronger without it. A page must read completely with
> no artwork present: never make it carry the title, the date or any other information.

That is deliberate and correct as product rule — `spec.md §7.6a #1` makes imagery optional and
`§32 #31` forbids a page that depends on it. Whether "often stronger without it" also reads as a
recommendation, and whether a unanimous zero across three directions is the intended calibration of
that sentence or an over-correction of it, is a product judgement about the composition prompt.
**This run does not answer it and nothing here was changed in response.** Changing that wording is a
`COMPOSITION_PROMPT_VERSION` bump whose effect can only be measured by another live batch, and this
run was authorized as exactly one.

### What this run therefore does and does not establish

**Established.** The seven-call batch shape; three distinct premises, DesignIntents and
compositions from one authoritative identity; the sibling selector running with nothing to correct;
clean rendered geometry at both breakpoints on all three; concept-level readiness; that artwork is
genuinely optional end to end — offered, affordable, and declined, with the pages finished anyway;
and that the artwork lifecycle costs nothing when nothing is reserved.

**Not established.** Anything about generated artwork in a real batch: placement, treatment,
readability, brief quality, provider behaviour across three concepts, or whether artwork improves a
page. The one-asset capability spike and the placement hardening remain the only artwork evidence
this project has, and both were single-slot and hand-driven.

---

## Cost

| | |
| --- | --- |
| Text | **$0.4094** (input 44,482; cached 6,422; output 10,827; reasoning 8,213) |
| Images | **$0.00** — 0 attempted of an 8-attempt limit; $0 of the $1.50 ceiling committed |
| Total | **$0.4094** |

The per-request image reservation was $0.25, which caps a batch at 6 requests arithmetically; the
compiler's own bound was at most 2 slots per concept. Neither bound was reached, because no slot was
ever reserved.

## Concepts

| # | Name | Family | Ornament | Motifs | Typography loaded | Artwork |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Cultivated Welcome | editorial | restrained | botanical, linen | Archivo / Inter | allowed, not used |
| 2 | Market Morning | statement | restrained | stripe, botanical | Fraunces / Manrope | allowed, not used |
| 3 | Gathered Abundance | invitation | decorative | botanical, linen, stripe | Newsreader / Inter Tight | allowed, not used |

All three: `fallback: null`, first-call schema-valid, zero re-prompts of any kind (schema,
token-cap or collision), zero fit demotions, zero relaxations.

Nearest-sibling similarity was computed for each concept against the ones already settled and never
approached the collision threshold, so the selector ran and had nothing to correct.

## Rendered geometry

Authoritative at 390 and 1280. `pageOverflow` false and `textOverflow` 0 on every page.

| Concept | 390 | 1280 |
| --- | --- | --- |
| 1 | 390 × 1117 | 1280 × 1330 |
| 2 | 390 × 1078 | 1280 × 1243 |
| 3 | 390 × 900 | 1280 × 900 |

There are no no-art diagnostic pairs in `visuals/`, because no concept received art: the pair exists
to isolate what an asset contributes, and with none attached the second render would be the same
page twice.

## Storage

`artworkStore.supabaseUploadExercised: false`. The run used a **diagnostic local-directory store**
behind the `ArtworkAssetStore` port, named so in `run-summary.json` by an id that cannot be mistaken
for the Supabase adapter. No local Supabase Storage was available in this environment and no hosted
Supabase project was touched. The real `supabaseArtworkStore` adapter exists and is unit-tested, but
**it was not exercised by this run** — and on this run nothing was stored by any adapter, because
nothing was generated.

## Files

| Path | What it is |
| --- | --- |
| `identity-fixture.json` | the authoritative identity, copied unmodified from the 4D directory |
| `run-summary.json` | batch, siblings, provider calls, spend, specs, page sizes, content |
| `provider-telemetry.jsonl` | one row per live provider call, read back from `generation_runs` |
| `artwork-telemetry.jsonl` | **empty** — no slot was reserved |
| `concepts/concept-N.json` | premise, presentation, DesignIntent, capabilities, content profile, raw and canonical trees, hash |
| `visuals/concept-N-{mobile,desktop}.png` | the rendered page at each authoritative breakpoint |
| `visuals/index.html` | the operator contact sheet |

## Ten questions for the operator

Reproduced on the contact sheet and deliberately unanswered there and here. On this run most of them
have nothing to look at, which is itself the answer to the one that matters.
