# DIC4-Q04 Stage-2 faithfulness re-review

## Method

Narrow, independent re-review of a single corrected Stage-2 `EventIdentity` case
(`DIC4-Q04`) against its frozen situation card, under the shared Stage-2 semantic
contract.

Branch: `claude/stage-2-faithfulness-review-v4-57efyi`
Commit: `7222964c17e1b5c13cc37edac8380bdaa595788d`

Exactly three inputs were inspected:

1. `docs/model-evals/provenance/design-intent-sealed-challenge-v4/stage-2/00-shared-semantic-contract.md`
   — read in full.
2. `docs/model-evals/provenance/design-intent-sealed-challenge-v4/half-b/01-situation-cards.json`
   — the `DIC4-Q04` card only, extracted by id.
3. `docs/model-evals/provenance/design-intent-sealed-challenge-v4/half-b/06-stage-2-eventidentity-cases-faithfulness-corrected.json`
   — the `DIC4-Q04` case only, extracted by id.

Both files were read programmatically by id filter so that no other case in either
file was surfaced. Exactly one `DIC4-Q04` entry exists in each.

Not inspected: git history or commit authorship; provenance files identifying
source, author or model; prior diagnostic ledgers; leakage history; correction
history; excluded outputs; the previous faithfulness review; any prior finding
about this case; any earlier Half-B Stage-2 artifact (`02-`…`05-`). No attempt was
made to infer authorship from the case id. This case was not compared to any other
case. No provider or eval calls were made, and nothing was edited or repaired.

## DIC4-Q04

Verdict: **PASS**

### 1. Premise preservation

Preserved. The card's load-bearing elements survive as themselves:

- 100th birthday and a life of storytelling → `creativeDirection`
  "Celebrate a century of stories…"; `copyTone` "short, vivid phrases that evoke
  storytelling".
- Poor hearing and reliance on lip-reading → "prioritize lip-reading and intimacy
  over volume", carried structurally through `typographyDirection`
  ("slightly enlarged letterforms; avoid thin strokes"), the motif
  "magnified text fragments", and the guidance "Design for close-range
  interaction".
- The complication (strong dislike of loud music against the staff's usual
  liven-it-up default) → "over volume", `tonalIntent` "never overwhelming",
  and the guidance "Avoid visual noise".

The gathering is not re-premised into a generic birthday: nothing here would fit an
arbitrary birthday celebration, and nothing contradicts the card.

Two elements are carried thinly rather than replaced — noted below as borderline,
not gating.

### 2. Factual invention

Clean. No names, dates, times, venue, address, city, guest counts, relationships,
history, demographics or logistics beyond the card. The nursing home, the staff and
the caregivers are never given attributes the card did not state; they are simply
not elaborated.

The nearest calls are all design rationale rather than assertions of fact:
`textureDirection` "linen, suede, or embossed paper to aid touch and sight" and
`typographyDirection`'s legibility emphasis infer design needs for a very old
honoree and elderly guests; they do not claim a tactile or vision impairment the
card did not state, and `textureDirection` is by definition the tactile-character
field. `dominanceNotes` "Warm, saturated tones for visibility; avoid glare" is an
inferred palette hierarchy, which the contract explicitly permits, and it is
correctly *not* smuggled into `avoidColors` (which remains `[]`).

### 3. Tension preservation

Preserved by accommodation, which is what the contract asks for. The difficulty is
that the usual instrument of festivity — volume — is unavailable, and the brief
does not escape it by making the event quiet and subdued. It keeps the celebratory
charge and relocates it into registers the honoree can receive: `toneKeywords`
"vivid", `paletteIntent` "rich burgundy", "golden ochre", `tonalIntent` "storybook
richness", `copyTone` "Expressive but legible". The productive strain between
"vivid"/"saturated" and "never overwhelming"/"keep patterns subtle" is the card's
own difficulty held open, not smoothed away.

The brief also does not adjudicate the staff. It never characterises the loud-music
convention as wrong, never addresses the staff at all, and confines itself to what
the design should carry.

"The caregivers want to make the day special but are unsure how to include her
fully" is an unanswered *need*, not a disagreement between parties, so proposing a
creative direction that serves it is the brief doing its job rather than resolving a
dispute on someone's behalf.

### 4. `hostConstraints` authority

Clean, and conservatively so. `hostConstraints` is `[]`, so there is no entry to
lack card authority.

This is the correct reading. The card's nearest candidate — "The honoree has a
strong dislike for loud music" — is a stated preference appearing as the
complication, not a host requirement, prohibition or correction, and the contract
explicitly forbids converting a tension or a preference into host authority. The
volume and legibility material is instead carried in `creativeDirection` and
`creativeGuidance`, where advisory direction belongs, and all three
`creativeGuidance` entries are recommendations rather than rules.

### 5. Situation-specific interpretation

Passes the bar. The distinguishing moves are card-derived, not category-derived:
"prioritize lip-reading and intimacy over volume", "magnified text fragments",
"High-contrast, slightly enlarged letterforms; avoid thin strokes", "Expressive but
legible". A reader of the finished brief would recognise this specific situation —
a centenarian who lip-reads, loves telling stories, and cannot have the room turned
up — rather than "100th birthday".

Two motifs are weaker and closer to the mapping the contract warns about; see
borderline notes.

### 6. Stage ownership

Holds. The artifact stays a creative brief: no renderer or layout implementation,
no components, grids, sections, breakpoints or pixel values; no literal font family
("Serifs with personality" is category-level, and
`compatibleTypographyCategories` stays within the permitted enum).

Notably, it does not drift into event operating procedure — there is no seating
plan, no run of show, no instruction to the caregivers about how to conduct the
day, which is the failure mode this card most invites. "Design for close-range
interaction" and "spatial clarity" describe design character, not party logistics.

Field shape also conforms: three top-level keys (`id`, `eventType`, `identity`);
`id` and `eventType` exactly as frozen; every length and cardinality within
contract bounds; all five fixed values correct
(`colorsExplicitlyConstrained: false`, `requiredColors: []`, `avoidColors: []`,
`toneExplicitlyConstrained: false`,
`inspirationSummary: "No visual inspiration supplied."`); enum fields drawn only
from the permitted vocabularies.

### 7. Overall faithfulness

Faithful. The corrected `DIC4-Q04` identity reads the card rather than its
category, preserves the accessibility premise and the volume complication as live
design problems, keeps binding authority empty where the card granted none, and
stays inside Stage 2's remit.

## Evidence / notes

Gating defects: none.

Borderline observations (taste-level; explicitly **not** grounds for ACTION
REQUIRED):

- **"outlived most of her contemporaries" is under-carried.** The card's
  `whyItMatters` holds a note of survivorship and loss that the brief does not
  explicitly reach for; "Celebrate a century of stories" holds the centenary but
  not the poignancy. Nothing contradicts the card, and the brief's insistence on
  intimacy over spectacle is compatible with it, so this is thinness rather than
  re-premising.
- **The two-group audience is implicit only.** "a group of elderly friends from a
  nursing home and their younger caregivers" is an intergenerational room; the
  brief gestures at it via `toneKeywords` "patient" and "intimate" but never works
  the elder/caregiver relationship directly. Again under-engagement, not
  replacement.
- **"open book spines" and "chapters, margins, illustrations" edge toward literal
  decoration.** The card's storytelling is oral; rendering it as book furniture is
  the hobby → themed-decoration move the contract cautions against. It is mitigated
  by the brief also using storytelling non-literally (`copyTone`, "storybook
  richness"), and by these being one motif of four and one guidance item of three.
- **"quilted patterns" is the weakest element.** Nothing in the card mentions
  quilting, sewing or craft; it reads as category shorthand for an elderly woman.
  One motif of four, alongside three that are card-derived.
- **"illustrations" in `creativeGuidance`** nudges faintly toward supplied imagery.
  The contract bars image assets in `textureDirection` and branded assets in
  `visualMotifs`, and states no such rule for `creativeGuidance`, where entries are
  advisory and may be reconsidered downstream. Noted only.
- **`compatibleTonalDirections: ["mid", "dark"]`** sits slightly against the
  brief's own legibility emphasis at first glance, but is coherent: a dark ground
  suppresses glare, which `dominanceNotes` explicitly asks for, and tonal reading is
  named in the contract as the author's to decide.
