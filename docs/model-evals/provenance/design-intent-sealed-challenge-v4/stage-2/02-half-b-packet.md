# Stage 2 author packet — half B

Six frozen situation cards are reproduced below. They are the entire input. Nothing else about this
project is shared with you.

The cards are the frozen artifact `half-b/01-situation-cards.json`, sha256 `969be131f15a5619218646746eb1edffb569c384cca85b0d8088d5ef13c76b9c`.

<!-- shared-semantic-contract:begin -->
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

<!-- shared-semantic-contract:end -->
## Output format

Return **JSON only**. No commentary, no preamble, no code fence, no explanation.

Exactly six cases, `DIC4-Q01` through `DIC4-Q06`, in that order:

```json
{
  "version": "design_intent_sealed_challenge_v4_half_b_eventidentity_cases",
  "cases": [
    {
      "id": "DIC4-Q01",
      "eventType": "...",
      "identity": {
        "creativeDirection": "...",
        "toneKeywords": ["..."],
        "colorsExplicitlyConstrained": false,
        "paletteIntent": {
          "requiredColors": [],
          "preferredColors": ["..."],
          "avoidColors": [],
          "dominanceNotes": "..."
        },
        "tonalIntent": "...",
        "toneExplicitlyConstrained": false,
        "compatibleTonalDirections": ["..."],
        "compatibleFamilies": ["..."],
        "compatibleTypographyCategories": ["..."],
        "visualMotifs": ["..."],
        "textureDirection": "...",
        "typographyDirection": "...",
        "copyTone": "...",
        "hostConstraints": [],
        "creativeGuidance": ["..."],
        "inspirationSummary": "No visual inspiration supplied."
      }
    }
  ]
}
```

The skeleton shows `hostConstraints` as `[]` because JSON carries no placeholder for "empty or not,
depending". It is **not** a hint that yours should be empty, and not a hint that it should not be:
apply the authority rule above to each card on its own and let the answer fall where it falls.

Every case carries every field. `id` and `eventType` are copied exactly from the card.

## The six frozen situation cards

#### Situation card `DIC4-Q01` — frozen, verbatim

- **Event type:** retirement party
- **Who is gathering:** a group of former factory workers and their families
- **Why it matters to them:** to honor the last shift of a 40-year employee who quietly mentored dozens of coworkers
- **What happens / context:** The factory closed three months ago, and this is the first time the team has reunited since. The retiree, a soft-spoken machinist, never sought recognition but is deeply respected for his patience and skill.
- **Complication:** The retiree has requested that no gifts be given, as he finds them embarrassing, but the group insists on acknowledging his impact in some tangible way.

#### Situation card `DIC4-Q02` — frozen, verbatim

- **Event type:** community potluck
- **Who is gathering:** a neighborhood watch group in a rapidly gentrifying area
- **Why it matters to them:** to rebuild trust after a series of misunderstandings between long-time residents and new arrivals
- **What happens / context:** The neighborhood has seen tension rise as property values soar, and older residents feel their history is being erased. The potluck is an attempt to share stories and food, but many are skeptical.
- **Complication:** One of the new residents, a chef, wants to bring an elaborate dish to impress, while long-time residents see this as performative rather than genuine.

#### Situation card `DIC4-Q03` — frozen, verbatim

- **Event type:** funeral
- **Who is gathering:** a divided family with estranged siblings and their children
- **Why it matters to them:** to honor a parent who was a bridge between the siblings, despite their personal conflicts
- **What happens / context:** The parent passed away suddenly, leaving behind a will that specifies no religious elements in the service. The siblings have not spoken in over a decade, but the parent’s wish for unity in death is clear.
- **Complication:** One sibling is a devout practitioner of a faith that requires specific rites, and they struggle to reconcile this with the parent’s wishes.

#### Situation card `DIC4-Q04` — frozen, verbatim

- **Event type:** birthday celebration
- **Who is gathering:** a group of elderly friends from a nursing home and their younger caregivers
- **Why it matters to them:** to celebrate the 100th birthday of a woman who has outlived most of her contemporaries
- **What happens / context:** The birthday honoree has a sharp memory and loves storytelling, but her hearing is poor, and she relies on lip-reading. The caregivers want to make the day special but are unsure how to include her fully.
- **Complication:** The honoree has a strong dislike for loud music, which the nursing home staff typically use to liven up such events.

#### Situation card `DIC4-Q05` — frozen, verbatim

- **Event type:** community potluck
- **Who is gathering:** a local hiking club with members ranging from beginners to seasoned mountaineers
- **Why it matters to them:** to welcome new members and share experiences from the past year’s expeditions
- **What happens / context:** The club has grown rapidly, and newer members often feel intimidated by the more experienced hikers. This potluck is meant to break down those barriers and foster camaraderie.
- **Complication:** A recent accident on a club hike has left some members wary of sharing their own stories, fearing they might be judged or blamed.

#### Situation card `DIC4-Q06` — frozen, verbatim

- **Event type:** wedding
- **Who is gathering:** a couple who met through a mutual hobby (competitive board games) and their close-knit but opinionated friends
- **Why it matters to them:** to celebrate a relationship built on shared passions and mutual respect, despite initial skepticism from their social circle
- **What happens / context:** The couple’s friends initially doubted their relationship would last, as they had very different personalities—one is outgoing and the other is reserved. Their bond over board games, however, proved stronger than anyone expected.
- **Complication:** *(none)*
