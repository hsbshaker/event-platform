# Stage 2 author packet — half A

You are the author of half A. You have six frozen situation cards, reproduced below exactly as you
wrote them at Stage 1. Nothing else about this project is shared with you, and nothing you write
here is compared against anyone else's work.

Your six cards are the frozen artifact `half-a/02-situation-cards.json`, sha256 `4f49b176ee5da81ab0bcc3b3460efc4d3f6af7c47ae24c02b54beb519c43e0ab`.

**Please do not write JSON.** Fill in the worksheet in plain text — sentences, or short lists where
a list is asked for. Someone else converts your words into the machine format afterwards, and that
conversion is mechanical: your wording is not edited, tightened or improved.

Where a value is shown as **fixed**, it is already decided and you can ignore it.

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
## Your worksheets

For each card, the frozen situation is printed first. Write your answers in the spaces under it.

---

### DIC4-P01

#### Situation card `DIC4-P01` — frozen, verbatim

- **Event type:** family reunion
- **Who is gathering:** Three generations of the extended Miller family (around 30 people), ranging in age from 4 to 82.
- **Why it matters to them:** It is the first time the family has gathered since the matriarch passed away six months prior, and they need to make decisions regarding the future of the ancestral family farm.
- **What happens / context:** A potluck lunch, unstructured outdoor time for children, and a formal evening meeting around the main dining table to review property documents and discuss selling versus preserving the land. Younger cousins are using handheld audio recorders to document older relatives' stories and memories of the house throughout the afternoon before any real estate decisions are finalized.
- **Complication:** High emotional tension exists between two siblings—one who wants to sell the farm immediately to cover personal debt, and another who lived on site as the primary caregiver for their mother and wants to preserve the home. Additionally, the eldest uncle relies on a heavy motorized wheelchair, requiring step-free access across the sloped lawn and home.

#### Your EventIdentity for `DIC4-P01`

Keep `id` as `DIC4-P01` and `eventType` as `family reunion` — both are fixed.

**Fixed, nothing to do:**

- Colors explicitly constrained: `false`
- Required colors: `[]`
- Avoid colors: `[]`
- Tone explicitly constrained: `false`
- Inspiration summary: `No visual inspiration supplied.`

**Yours to write:**

- **Creative direction** (1–3 sentences, 20–420 characters) —

- **Tone keywords** (3–7 short entries, each 2–48 characters) —

- **Preferred colors** (up to 7; describe them in words, e.g. "weathered brass") —

- **Dominance notes** (up to 300 characters; which colors carry, which accent) —

- **Tonal intent** (5–320 characters; the light/shadow character you read in this situation) —

- **Compatible tonal directions** (1–3 of `light`, `mid`, `dark`, strongest first) —

- **Compatible families** (1–3 of `editorial`, `invitation`, `statement`, strongest first) —

- **Compatible typography categories** (1–6 of `heritage`, `high_contrast_editorial`, `oldstyle`,
  `grotesk_led`, `soft_serif`, `transitional`, strongest first) —

- **Visual motifs** (up to 8, each 3–90 characters) —

- **Texture direction** (3–300 characters) —

- **Typography direction** (5–300 characters; character and hierarchy, never a font name) —

- **Copy tone** (3–260 characters) —

- **Host constraints** (up to 10; **only** a requirement, prohibition or correction already stated
  in the card above, kept in its own words. Leave empty if the card states none — empty is common
  and correct) —

- **Creative guidance** (up to 10; your advisory recommendations — this is where interpretation,
  suggestion and taste belong) —

---

### DIC4-P02

#### Situation card `DIC4-P02` — frozen, verbatim

- **Event type:** family reunion
- **Who is gathering:** A group of ten former foster siblings, now adults in their late 20s and 30s, along with their former foster parents.
- **Why it matters to them:** They lived in the same household at overlapping times across a fifteen-year period, but many have not seen each other since leaving care. It marks their first intentional effort to establish a formal support network as adults.
- **What happens / context:** An informal afternoon picnic in a public park, swapping life updates, sharing a group photo-scanning session, and creating a shared contact directory. Because there are no shared multi-generational ancestral traditions or inherited family legacies, the group is intentionally inventing new shared traditions for the very first time.
- **Complication:** Several attendees carry complex personal trauma connected to their early lives, resulting in varying comfort levels with personal questions. Two specific attendees have an unresolved interpersonal fallout, requiring careful group coordination to keep conversations comfortable for everyone.

#### Your EventIdentity for `DIC4-P02`

Keep `id` as `DIC4-P02` and `eventType` as `family reunion` — both are fixed.

**Fixed, nothing to do:**

- Colors explicitly constrained: `false`
- Required colors: `[]`
- Avoid colors: `[]`
- Tone explicitly constrained: `false`
- Inspiration summary: `No visual inspiration supplied.`

**Yours to write:**

- **Creative direction** (1–3 sentences, 20–420 characters) —

- **Tone keywords** (3–7 short entries, each 2–48 characters) —

- **Preferred colors** (up to 7; describe them in words, e.g. "weathered brass") —

- **Dominance notes** (up to 300 characters; which colors carry, which accent) —

- **Tonal intent** (5–320 characters; the light/shadow character you read in this situation) —

- **Compatible tonal directions** (1–3 of `light`, `mid`, `dark`, strongest first) —

- **Compatible families** (1–3 of `editorial`, `invitation`, `statement`, strongest first) —

- **Compatible typography categories** (1–6 of `heritage`, `high_contrast_editorial`, `oldstyle`,
  `grotesk_led`, `soft_serif`, `transitional`, strongest first) —

- **Visual motifs** (up to 8, each 3–90 characters) —

- **Texture direction** (3–300 characters) —

- **Typography direction** (5–300 characters; character and hierarchy, never a font name) —

- **Copy tone** (3–260 characters) —

- **Host constraints** (up to 10; **only** a requirement, prohibition or correction already stated
  in the card above, kept in its own words. Leave empty if the card states none — empty is common
  and correct) —

- **Creative guidance** (up to 10; your advisory recommendations — this is where interpretation,
  suggestion and taste belong) —

---

### DIC4-P03

#### Situation card `DIC4-P03` — frozen, verbatim

- **Event type:** community town hall
- **Who is gathering:** Local residents, municipal city planners, and representatives from a commercial real estate developer (approximately 75 people total).
- **Why it matters to them:** The city is proposing to rezone a long-standing public park into a mixed-use commercial center, directly impacting neighborhood green space, noise levels, and property values.
- **What happens / context:** A 20-minute presentation by city planners outlining the development plan, followed by a moderated public Q&A at a floor microphone, and a written feedback card submission. A youth-led local environmental organization orchestrates a silent protest inside the room, holding informational placards rather than speaking during the microphone period.
- **Complication:** The venue lacks official audio translation systems, but roughly 30% of attending neighborhood residents are native Spanish speakers with limited English proficiency. A local community organizer steps in to provide live sentence-by-sentence translation, doubling the length of the presentation and Q&A.

#### Your EventIdentity for `DIC4-P03`

Keep `id` as `DIC4-P03` and `eventType` as `community town hall` — both are fixed.

**Fixed, nothing to do:**

- Colors explicitly constrained: `false`
- Required colors: `[]`
- Avoid colors: `[]`
- Tone explicitly constrained: `false`
- Inspiration summary: `No visual inspiration supplied.`

**Yours to write:**

- **Creative direction** (1–3 sentences, 20–420 characters) —

- **Tone keywords** (3–7 short entries, each 2–48 characters) —

- **Preferred colors** (up to 7; describe them in words, e.g. "weathered brass") —

- **Dominance notes** (up to 300 characters; which colors carry, which accent) —

- **Tonal intent** (5–320 characters; the light/shadow character you read in this situation) —

- **Compatible tonal directions** (1–3 of `light`, `mid`, `dark`, strongest first) —

- **Compatible families** (1–3 of `editorial`, `invitation`, `statement`, strongest first) —

- **Compatible typography categories** (1–6 of `heritage`, `high_contrast_editorial`, `oldstyle`,
  `grotesk_led`, `soft_serif`, `transitional`, strongest first) —

- **Visual motifs** (up to 8, each 3–90 characters) —

- **Texture direction** (3–300 characters) —

- **Typography direction** (5–300 characters; character and hierarchy, never a font name) —

- **Copy tone** (3–260 characters) —

- **Host constraints** (up to 10; **only** a requirement, prohibition or correction already stated
  in the card above, kept in its own words. Leave empty if the card states none — empty is common
  and correct) —

- **Creative guidance** (up to 10; your advisory recommendations — this is where interpretation,
  suggestion and taste belong) —

---

### DIC4-P04

#### Situation card `DIC4-P04` — frozen, verbatim

- **Event type:** academic dissertation defense
- **Who is gathering:** A doctoral candidate, a four-person faculty dissertation committee, and fifteen invited peers and family members.
- **Why it matters to them:** It is the culmination of five years of research for the candidate, determining whether they earn their doctorate and qualify for a pending university teaching appointment.
- **What happens / context:** A 45-minute research presentation by the candidate, a 60-minute questioning round by the committee, a brief public Q&A session, a closed-door committee deliberation, and the public announcement of the verdict. The candidate’s primary advisor and co-advisor hold opposing public stances on the core theoretical model used in the research, leading to spirited debate between the committee members during the candidate's defense period.
- **Complication:** One critical committee member is joining remotely via satellite connection from a field research vessel in a distant time zone, creating significant audio lag and potential connection drops during questioning.

#### Your EventIdentity for `DIC4-P04`

Keep `id` as `DIC4-P04` and `eventType` as `academic dissertation defense` — both are fixed.

**Fixed, nothing to do:**

- Colors explicitly constrained: `false`
- Required colors: `[]`
- Avoid colors: `[]`
- Tone explicitly constrained: `false`
- Inspiration summary: `No visual inspiration supplied.`

**Yours to write:**

- **Creative direction** (1–3 sentences, 20–420 characters) —

- **Tone keywords** (3–7 short entries, each 2–48 characters) —

- **Preferred colors** (up to 7; describe them in words, e.g. "weathered brass") —

- **Dominance notes** (up to 300 characters; which colors carry, which accent) —

- **Tonal intent** (5–320 characters; the light/shadow character you read in this situation) —

- **Compatible tonal directions** (1–3 of `light`, `mid`, `dark`, strongest first) —

- **Compatible families** (1–3 of `editorial`, `invitation`, `statement`, strongest first) —

- **Compatible typography categories** (1–6 of `heritage`, `high_contrast_editorial`, `oldstyle`,
  `grotesk_led`, `soft_serif`, `transitional`, strongest first) —

- **Visual motifs** (up to 8, each 3–90 characters) —

- **Texture direction** (3–300 characters) —

- **Typography direction** (5–300 characters; character and hierarchy, never a font name) —

- **Copy tone** (3–260 characters) —

- **Host constraints** (up to 10; **only** a requirement, prohibition or correction already stated
  in the card above, kept in its own words. Leave empty if the card states none — empty is common
  and correct) —

- **Creative guidance** (up to 10; your advisory recommendations — this is where interpretation,
  suggestion and taste belong) —

---

### DIC4-P05

#### Situation card `DIC4-P05` — frozen, verbatim

- **Event type:** volunteer orientation
- **Who is gathering:** Twelve newly onboarded volunteers and two staff program coordinators at a regional wildlife rehabilitation center.
- **Why it matters to them:** Volunteers require mandatory safety training and operational knowledge before they are permitted to handle injured animals or work independently on site.
- **What happens / context:** A presentation on facility rules and safety protocols, a guided walkthrough of the facility enclosures, a hands-on demonstration of safety gear and transport crates, and the completion of liability waivers. The participant group ranges from high school students completing required service hours to retired veterinary technicians, creating a very wide spread of existing domain knowledge in the room.
- **Complication:** *(none)*

#### Your EventIdentity for `DIC4-P05`

Keep `id` as `DIC4-P05` and `eventType` as `volunteer orientation` — both are fixed.

**Fixed, nothing to do:**

- Colors explicitly constrained: `false`
- Required colors: `[]`
- Avoid colors: `[]`
- Tone explicitly constrained: `false`
- Inspiration summary: `No visual inspiration supplied.`

**Yours to write:**

- **Creative direction** (1–3 sentences, 20–420 characters) —

- **Tone keywords** (3–7 short entries, each 2–48 characters) —

- **Preferred colors** (up to 7; describe them in words, e.g. "weathered brass") —

- **Dominance notes** (up to 300 characters; which colors carry, which accent) —

- **Tonal intent** (5–320 characters; the light/shadow character you read in this situation) —

- **Compatible tonal directions** (1–3 of `light`, `mid`, `dark`, strongest first) —

- **Compatible families** (1–3 of `editorial`, `invitation`, `statement`, strongest first) —

- **Compatible typography categories** (1–6 of `heritage`, `high_contrast_editorial`, `oldstyle`,
  `grotesk_led`, `soft_serif`, `transitional`, strongest first) —

- **Visual motifs** (up to 8, each 3–90 characters) —

- **Texture direction** (3–300 characters) —

- **Typography direction** (5–300 characters; character and hierarchy, never a font name) —

- **Copy tone** (3–260 characters) —

- **Host constraints** (up to 10; **only** a requirement, prohibition or correction already stated
  in the card above, kept in its own words. Leave empty if the card states none — empty is common
  and correct) —

- **Creative guidance** (up to 10; your advisory recommendations — this is where interpretation,
  suggestion and taste belong) —

---

### DIC4-P06

#### Situation card `DIC4-P06` — frozen, verbatim

- **Event type:** product post-mortem meeting
- **Who is gathering:** A cross-functional technology team of 14 people, including software engineers, product managers, user experience designers, and customer support leads.
- **Why it matters to them:** A major software release failed over the weekend, resulting in extended service downtime, lost data for end-users, and significant customer churn.
- **What happens / context:** A detailed review of the deployment timeline, a root-cause analysis mapping technical and procedural failures, and the assignment of preventive action items to team members. The session leader institutes a strict no-device policy during the discussion, forcing digital product workers to rely entirely on a physical whiteboard to map out the failure sequence together.
- **Complication:** Significant personal finger-pointing occurred in team messaging channels prior to the meeting. The engineering manager and product director strongly disagree on who authorized releasing the update without final quality testing, making psychological safety and constructive communication a central difficulty.

#### Your EventIdentity for `DIC4-P06`

Keep `id` as `DIC4-P06` and `eventType` as `product post-mortem meeting` — both are fixed.

**Fixed, nothing to do:**

- Colors explicitly constrained: `false`
- Required colors: `[]`
- Avoid colors: `[]`
- Tone explicitly constrained: `false`
- Inspiration summary: `No visual inspiration supplied.`

**Yours to write:**

- **Creative direction** (1–3 sentences, 20–420 characters) —

- **Tone keywords** (3–7 short entries, each 2–48 characters) —

- **Preferred colors** (up to 7; describe them in words, e.g. "weathered brass") —

- **Dominance notes** (up to 300 characters; which colors carry, which accent) —

- **Tonal intent** (5–320 characters; the light/shadow character you read in this situation) —

- **Compatible tonal directions** (1–3 of `light`, `mid`, `dark`, strongest first) —

- **Compatible families** (1–3 of `editorial`, `invitation`, `statement`, strongest first) —

- **Compatible typography categories** (1–6 of `heritage`, `high_contrast_editorial`, `oldstyle`,
  `grotesk_led`, `soft_serif`, `transitional`, strongest first) —

- **Visual motifs** (up to 8, each 3–90 characters) —

- **Texture direction** (3–300 characters) —

- **Typography direction** (5–300 characters; character and hierarchy, never a font name) —

- **Copy tone** (3–260 characters) —

- **Host constraints** (up to 10; **only** a requirement, prohibition or correction already stated
  in the card above, kept in its own words. Leave empty if the card states none — empty is common
  and correct) —

- **Creative guidance** (up to 10; your advisory recommendations — this is where interpretation,
  suggestion and taste belong) —
