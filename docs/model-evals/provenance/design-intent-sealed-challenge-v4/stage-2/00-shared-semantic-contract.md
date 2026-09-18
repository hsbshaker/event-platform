## Stage 2 — what you are being asked to do

You are turning each of six frozen **situation cards** into an **EventIdentity**: a creative brief
that tells a strong designer what assignment they have been given.

Each card describes a real gathering — who is coming together, why it matters to them, what happens,
and where a difficulty sits. Your job is to read that situation closely and express what it asks of
a design, in the fields listed below.

### The situation is fixed

The card is the whole of the factual authority. It may not be replaced, re-premised, simplified into
a generic version of its event type, or materially changed to make the design easier.

**Do not invent facts.** No names for people, no dates, no times, no venue names, no addresses, no
cities, no guest counts beyond those already stated, no relationships beyond those stated, no
history the card did not give you, and no host preferences the card did not state.

**Do not resolve a disagreement on behalf of the people in it.** Where a card holds two people or
groups in tension, the brief may acknowledge the tension and creatively accommodate it. It may not
decide who is right, and it may not quietly dissolve the difficulty by choosing a direction that
only one side would want.

### What is yours to decide

Creative inference is expected — that is the work. It belongs in the creative thesis, the tone
keywords, the preferred palette, the tonal reading, family and typography compatibility, motifs,
texture, copy tone and the advisory guidance.

### The bar

**The event type alone must not determine the identity.** Reading the finished brief, it should be
obvious that you understood *this* situation rather than its category. Avoid the mapping of event
label → obvious genre → obvious motifs.

The specific relationships, activities, tensions, accessibility needs, rituals and reasons for
gathering should materially shape the interpretation. At the same time, do not mechanically convert
every factual detail into a motif — in particular, a person's occupation, hobby or activity should
not become literal themed decoration simply because it is mentioned.

A brief that preserves an unresolved human tension is doing its job. One that silently solves it is
not.

## The fields

Each finished case has exactly three top-level keys: `id`, `eventType`, `identity`. There is no
`suppliedFacts`, no `notes` and no clarification object.

`id` and `eventType` must be **exactly** what the frozen card says. Do not adjust, retitle or
tidy them.

`identity` has exactly these fields:

| field | rule |
| --- | --- |
| `creativeDirection` | 20–420 characters. A concise creative thesis, one to three sentences. No renderer or layout implementation choices. |
| `toneKeywords` | 3–7 entries, each 2–48 characters. Useful, distinct adjectives or short phrases — not synonym padding. |
| `colorsExplicitlyConstrained` | **Must be `false`.** |
| `paletteIntent.requiredColors` | **Must be `[]`.** |
| `paletteIntent.preferredColors` | Up to 7 entries, each 2–60 characters. Creatively inferred palette directions are welcome. |
| `paletteIntent.avoidColors` | **Must be `[]`.** |
| `paletteIntent.dominanceNotes` | Up to 300 characters. An inferred palette hierarchy is allowed. |
| `tonalIntent` | 5–320 characters. |
| `toneExplicitlyConstrained` | **Must be `false`.** |
| `compatibleTonalDirections` | 1–3 values, ranked strongest fit first, from exactly: `light`, `mid`, `dark`. No padding with values that do not fit. |
| `compatibleFamilies` | 1–3 values, ranked strongest first, from exactly: `editorial`, `invitation`, `statement`. A family is a compositional character, not a fixed layout. |
| `compatibleTypographyCategories` | 1–6 values, ranked strongest first, from exactly: `heritage`, `high_contrast_editorial`, `oldstyle`, `grotesk_led`, `soft_serif`, `transitional`. Broad categories only — never a literal font. |
| `visualMotifs` | Up to 8 entries, each 3–90 characters. Natural-language motif ideas. No proprietary or branded asset. |
| `textureDirection` | 3–300 characters. Tactile and visual character — never an image asset. |
| `typographyDirection` | 5–300 characters. Typographic character and hierarchy. No literal font-family choice. |
| `copyTone` | 3–260 characters. |
| `hostConstraints` | Up to 10 entries, each 3–180 characters. See the rule below. `[]` is common and correct. |
| `creativeGuidance` | Up to 10 entries, each 3–180 characters. Advisory recommendations; later stages may reconsider them. |
| `inspirationSummary` | **Must be exactly:** `No visual inspiration supplied.` |

The five fixed values above are fixed because Stage 1 deliberately supplied no explicit palette
constraint and no explicit light/mid/dark instruction. They are not a judgement about your case.

### `hostConstraints` — the one field with a hard authority rule

Only an explicit **requirement, prohibition or correction already stated in the frozen card** may
enter this field, kept verbatim or near-verbatim.

Do **not** convert a tension, a preference, an implication, an inferred need or a creative
recommendation into host authority. Positive aesthetic direction never belongs here — that is
`creativeGuidance`.

The distinction matters because a downstream stage treats `hostConstraints` as binding and
`creativeGuidance` as advisory. A recommendation promoted into a constraint becomes a rule nobody
actually made.
