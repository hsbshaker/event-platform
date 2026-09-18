# v4 semantic premise/device-overlap review

Independent semantic premise/device-overlap review of the twelve final v4 DesignIntent
sealed-challenge cases. Scope is overlap only: whether any v4 case is materially
derivative of, repetitious of, or teachable from already-readable benchmark material.

Repository state reviewed: `7222964c17e1b5c13cc37edac8380bdaa595788d`.

---

## Method

### v4 files reviewed

Stage-2 review targets (the twelve final cases):

- `docs/model-evals/provenance/design-intent-sealed-challenge-v4/half-a/06-stage-2-eventidentity-cases-corrected.json` (half P, `DIC4-P01`–`DIC4-P06`)
- `docs/model-evals/provenance/design-intent-sealed-challenge-v4/half-b/06-stage-2-eventidentity-cases-faithfulness-corrected.json` (half Q, `DIC4-Q01`–`DIC4-Q06`)

Frozen Stage-1 situation cards, used as premise anchors:

- `docs/model-evals/provenance/design-intent-sealed-challenge-v4/half-a/02-situation-cards.json`
- `docs/model-evals/provenance/design-intent-sealed-challenge-v4/half-b/01-situation-cards.json`

No other file under `design-intent-sealed-challenge-v4/` was opened.

### Historical corpus/artifact families searched

Readable prior DesignIntent corpora (all `cases[].identity` of the same EventIdentity shape):

- `docs/model-evals/design-intent-sealed-challenge.json` (12 cases, `DSC-01`–`DSC-12`)
- `docs/model-evals/design-intent-sealed-challenge-v2.json` (12 cases, `SC2-01`–`SC2-12`)
- `docs/model-evals/design-intent-regression.json` (12 cases, `DIR-01`–`DIR-12`)
- `docs/model-evals/design-intent-validation.json` (13 cases, `DIV-01`–`DIV-13`)
- `docs/model-evals/design-intent-validation-v2.json` (13 cases, `DIV2-01`–`DIV2-13`)

v3 candidates, replacement, invalidated set, failed assembly and preserved artifacts:

- `.../design-intent-sealed-challenge-v3/chatgpt/02-normalized-candidate.json`, `04-leakage-correction-normalized.json` (`DIC3-G01`–`G06`)
- `.../design-intent-sealed-challenge-v3/gemini/01-original.json`, `03-final-candidate.json`, `04-leakage-correction.json` (invalidated set, `DIC3-M01`–`M06`; `INVALIDATION.md` present but not used as a comparison source)
- `.../design-intent-sealed-challenge-v3/gemini-replacement/01-original.json`, `03-final-leakage-corrected-candidate.json` (`DIC3-M01`–`M06`, replacement premises)
- `.../design-intent-sealed-challenge-v3/assembly/01-assembled-pre-semantic-review.json`

Other readable benchmark artifacts containing authored case premises/identities:

- `docs/model-evals/creative-understanding.json` (`CU-01`–`CU-14`)
- `docs/model-evals/creative-understanding-holdout.json` (`HO-01`–`HO-12`)
- `docs/model-evals/creative-understanding-sealed-challenge.json` (`SC-01`–`SC-12`)
- `docs/model-evals/creative-understanding-sealed-challenge-v2.json` (`SC2-01`–`SC2-12`, creative-understanding series)
- `docs/model-evals/clarification-rerun-behaviour.json` (`RB-01`–`RB-10`)

Comparison universe totals 80 prior authored DesignIntent identities — 62 across the five
readable corpora, plus 18 across the three distinct v3 candidate sets (chatgpt, invalidated
gemini, gemini replacement) — and 60 authored host-prompt premises. Method was a full read
of every prior identity's premise, motif, palette, constraint and guidance fields, plus two
mechanical aids used as pointers only: a distinctive-term co-occurrence scan (v4 terms
appearing in four or fewer prior cases, keyed on distinct case id) and a 3-/4-gram phrase
scan across the same corpora. Every classification below rests on
the semantic reading; the lexical scans surfaced candidates and are cited only where a
phrase collocation is itself part of the evidence.

### Independence confirmation

Not inspected at any point in this review:

- the v4 `README.md`, and every file under `design-intent-sealed-challenge-v4/leakage/`
  (leakage history, correction packets, excluded outputs, correction requests/responses,
  corrected candidates, residual-collision and operator-exception records);
- `design-intent-sealed-challenge-v4/review/01-stage-2-faithfulness-review.md`,
  `02-OPERATOR-DIRECTED-CORRECTION.md`, `03-one-leaf-difference-proof.json`,
  `04-production-schema-validation.json`, `05-post-correction-leakage-scan.json`
  (prior v4 diagnostic ledgers and faithfulness-review conclusions);
- `design-intent-sealed-challenge-v4/stage-2/` packets and the shared semantic contract;
- the halves' `01-original-raw.txt` / `03-stage-2-original-raw.txt` /
  `05-leakage-correction-original-raw.txt` / `02-stage-2-original-raw.json` /
  `04-leakage-correction-original-raw.json` and the pre-correction case files;
- DesignIntent prompt text, provider implementation, input assembly, and everything under
  `src/lib/ai/` and `tests/eval/` (implementation/harness files were excluded as
  comparison material by rule, and were not read for premise content);
- any known DesignIntent model output, including `docs/model-evals/results/**`.

No attempt was made to infer which v4 half came from which source. The halves are
referred to throughout as P and Q. Where v3 provenance appears (directory names such as
`chatgpt/`, `gemini/`), that is intrinsic to those historical artifacts and predates this
review; it played no part in any judgment here.

Prior review conclusions were not used to decide what overlaps. The v3 review documents
(`.../design-intent-sealed-challenge-v3/review/01-…`, `02-…`) and `CLOSURE.md` were left
unread; all findings below derive from the underlying corpus artifacts.

---

## Findings

### Finding 1

**v4 case:** `DIC4-Q02` and `DIC4-Q05` (both half Q)

**comparison artifact/case:** each other — intra-v4, intra-half

**classification:** `ACTION REQUIRED`

**v4 evidence (`DIC4-Q02`):**

Situation card — `eventType: "community potluck"`; "a neighborhood watch group in a
rapidly gentrifying area"; "to rebuild trust after a series of misunderstandings between
long-time residents and new arrivals"; "The potluck is an attempt to share stories and
food, but many are skeptical."

Identity — `tonalIntent`: "A cautious optimism—warm but not naive, inviting but not
forced."; `dominanceNotes`: "Earth tones anchor; pops of warm color for energy.";
`visualMotifs`: "shared bowl silhouettes", "patchwork tablecloths", "faded neighborhood
maps"; `textureDirection`: "Handmade, slightly irregular—like clay, linen, or
hand-painted signs."; `creativeGuidance`: "Avoid imagery that centers the chef or their
dish." / "Prioritize visuals that feel collaborative (e.g., communal serving, overlapping
contributions)." / "Acknowledge tension subtly—e.g., through layered or uneven textures."

**comparison evidence (`DIC4-Q05`):**

Situation card — `eventType: "community potluck"`; "a local hiking club with members
ranging from beginners to seasoned mountaineers"; "newer members often feel intimidated by
the more experienced hikers. This potluck is meant to break down those barriers and foster
camaraderie."; "A recent accident on a club hike has left some members wary of sharing
their own stories."

Identity — `tonalIntent`: "A steady, reassuring warmth—adventurous but not reckless,
communal but not performative."; `dominanceNotes`: "Earthy tones lead; accents in
terrain-inspired hues."; `visualMotifs`: "shared campfire silhouettes", "overlapping
footprints", "topographic lines"; `textureDirection`: "Rough-hewn but welcoming—like
canvas, weathered wood, or trail dust."; `creativeGuidance`: "Avoid imagery that glorifies
risk or extreme hiking." / "Use composition to suggest safety in numbers (e.g., clustered
elements, overlapping shapes)." / "Subtly acknowledge the accident's shadow—e.g., through
muted or layered textures."

**what overlaps:** The same design problem, stated twice: a standing community group in
which one sub-population is wary of participating must be drawn into a shared meal, and
the design must register that wariness without dramatising it. Both carry the identical
`eventType` string `"community potluck"`. Both resolve it with the same device bundle —
an earth-tone ground with warm accents, a "shared … silhouettes" motif, an "overlapping"
figure for collective contribution, an irregular/rough handmade texture, and a closing
guidance bullet that instructs subtle acknowledgement of the group's unease *through
texture*. The parallel extends to sentence construction: the `dominanceNotes` ("Earth
tones anchor; pops of warm color for energy." / "Earthy tones lead; accents in
terrain-inspired hues."), the double-hedged `tonalIntent` ("warm but not naive, inviting
but not forced" / "adventurous but not reckless, communal but not performative"), the
`textureDirection` frame (schematically, "Handmade, slightly irregular—like <three
materials>" against "Rough-hewn but welcoming—like <three materials>"), and the third
guidance bullet ("Acknowledge tension
subtly—e.g., through layered or uneven textures." / "Subtly acknowledge the accident's
shadow—e.g., through muted or layered textures.").

**analysis:** Substantive. This is not the shared-event-type exemption: "community
potluck" is not a broad archetype the schema forces, and `DIC4-Q05`'s own card describes a
hiking-club season-end welcome, so the label appears to have been carried across rather
than fitted to the premise. Nor is it ordinary motif coincidence — the correspondence runs
through premise (wary sub-group at a shared meal), solved creative problem (acknowledge
unease without staging it), device bundle (earth palette, shared-silhouette motif,
overlapping-contribution figure, irregular texture), and the phrasing of the guidance that
carries the solution. Two of the six cases in half Q are functionally the same design
problem under different wording, which is the disqualifying pattern named in the review
brief. Neither case is independent evidence of anything the other does not already test.

---

### Finding 2

**v4 case:** `DIC4-P03` (community town hall)

**comparison artifact/case:** `DIV2-08`, `docs/model-evals/design-intent-validation-v2.json`

**classification:** `ACTION REQUIRED`

**v4 evidence:**

Situation card — "The city is proposing to rezone a long-standing public park into a
mixed-use commercial center, directly impacting neighborhood green space, noise levels,
and property values."; "A 20-minute presentation by city planners outlining the
development plan, followed by a moderated public Q&A at a floor microphone, and a written
feedback card submission."; "The venue lacks official audio translation systems, but
roughly 30% of attending neighborhood residents are native Spanish speakers with limited
English proficiency."

Identity — `visualMotifs`: "side-by-side bilingual columns", "park contour maps", "floor
microphone icon", "protest placard silhouettes", "feedback card grid lines";
`typographyDirection`: "Rigorous grotesk and transitional typography establishing clean
side-by-side English and Spanish layouts with equal font sizes, line heights, and visual
prominence."; `dominanceNotes`: "Paper white and municipal slate carry the primary
information for maximum legibility…"; `textureDirection`: "High-contrast matte paper stock
and clean newsprint textures that feel utilitarian, urgent, and accessible."; `copyTone`:
"Direct, neutral, transparent, and fully accessible across languages."; `creativeGuidance`:
"Provide strict side-by-side bilingual symmetry across all printed agenda and feedback
materials." / "Maintain an authoritative yet neutral civic frame…"

**comparison evidence:**

`DIV2-08` — `creativeDirection`: "The neighbourhood association is holding an open meeting
on the proposed bus lane that would take a hundred and forty parking spaces off Dunmore
Avenue. Two hundred people, a school gym, interpreters in Somali and Spanish, comment
cards. The association takes no side and cannot be seen to."; `visualMotifs`: "a numbered
agenda", "a plan view of a street with its lanes marked", "a comment card with a ruled
box", "three columns of the same notice in three languages", "a clock on a gym wall";
`typographyDirection`: "Utility lettering that survives being printed badly and read in
translation: open shapes, generous size, and times and numbers set so they can be found at
a glance."; `dominanceNotes`: "Neutral paper colours carrying a single ink, with no second
colour strong enough to be read as a position."; `textureDirection`: "Photocopied paper, a
taped-up notice, floor tape. Institutional and unstyled, but not shabby."; `copyTone`:
"Neutral civic English at a low reading level…"; `hostConstraints`: "It has to hold up for
someone reading it in Somali or Spanish, not only in English".

**what overlaps:** Nine elements coincide, including the two most distinctive ones. A
contested municipal land-use proposal; a large public hearing in an institutional room;
multilingual column parity as the central structural device (Spanish named in both);
written comment/feedback cards as a designed artefact; a plan-view map of the contested
ground; a neutral paper-plus-single-ink institutional palette; a utility/newsprint texture
premised on bad reproduction; the printed agenda as a designed artefact; and a mandated
neutrality of voice. The
resolved design answer in `DIC4-P03` is `DIV2-08`'s answer.

**analysis:** Substantive. The shared event label ("community town hall" vs "public
meeting") is not the basis of this finding — the device bundle is. `DIV2-08` is fully
readable in the repository, including its motif list and typographic solution, so the
central creative problem `DIC4-P03` poses ("a neutral bilingual civic notice for a
contested land-use hearing") is answerable from readable benchmark material rather than
from the brief. The two cases are not identical: `DIV2-08`'s hardest content — the
exclusion of both campaigns' colours, the 1974 letterhead, the insight that most readers
meet the notice as a photocopy on a laundromat board — has no counterpart in `DIC4-P03`;
and `DIC4-P03`'s youth silent protest and its runtime doubling under live
sentence-by-sentence translation are its own. But the differentiators sit around the
edges of a core that is already solved in readable material, so the case is no longer
clean independent challenge evidence. See Finding 4, which compounds this.

---

### Finding 3

**v4 case:** `DIC4-P01` (family reunion)

**comparison artifact/case:** `DSC-08`, `docs/model-evals/design-intent-sealed-challenge.json`; reinforced by `DIV2-07`, `docs/model-evals/design-intent-validation-v2.json`

**classification:** `ACTION REQUIRED`

**v4 evidence:**

Situation card — "It is the first time the family has gathered since the matriarch passed
away six months prior, and they need to make decisions regarding the future of the
ancestral family farm."; "a formal evening meeting around the main dining table to review
property documents and discuss selling versus preserving the land."; complication: "High
emotional tension exists between two siblings—one who wants to sell the farm immediately
to cover personal debt, and another who lived on site as the primary caregiver for their
mother and wants to preserve the home."

Identity — `visualMotifs`: "farm property boundary lines"; `creativeGuidance`: "Maintain a
calm, balanced tone that honors family heritage without favoring either selling or keeping
the farm."; `copyTone`: "Respectful, clear, emotionally grounded, and neutral regarding
property outcomes."

**comparison evidence:**

`DSC-08` — `creativeDirection`: "Two halves of a family that have not spoken in nineteen
years are meeting over one meal to settle who takes on the farm. The aunt arranging it
wants people to come, eat, and say true things. It should be hospitable and completely
unfestive: something that does not pretend the day is a celebration and does not dramatise
the rift either."; `visualMotifs`: "one long table laid for both sides", "a field boundary
drawn on a deed map", "two gates in the same hedge", "a plain place card"; `creativeGuidance`:
"If anything is drawn at all, make it the land rather than the family."

`DIV2-07` — `eventType: "family reunion"`; `creativeDirection`: "The Aldergrove side of the
family has not been in one room since a will was contested twenty-four years ago. Winifred
has booked the lounge at a curling club because it belongs to nobody…"; `dominanceNotes`:
"Nothing should feel like a side has chosen it, so keep the range cool and shared.";
`copyTone`: "…not one word that could be read as taking a side."

**what overlaps:** The whole human premise. A family convenes around a shared meal to
decide the fate of an inherited farm, against a sibling rift, and the design is required
to stay neutral between the parties. `DSC-08` is that case; `DIC4-P01` is that case with
bereavement, an oral-history activity and a wheelchair-access constraint added around it.
The motif correspondence is specific — "farm property boundary lines" against "a field
boundary drawn on a deed map" — and "farm" occurs in exactly one prior case across all 80
prior identities. `DIV2-07` supplies a second readable instance of the surrounding
conflict: a family estranged by a contested will, meeting on deliberately neutral ground,
with non-partisanship stated as the design requirement.

**analysis:** Substantive. This is not the "family reunion" archetype exemption. The
recurring element is the specific and unusual conflict — heirs divided over whether to
sell or keep the inherited land, with the design forbidden to take a side — and it has two
independent readable precedents, one of them in a prior *sealed-challenge* corpus. The
resolved identities do differ, and that is worth recording: `DSC-08` answers with austerity
and an explicit ban on warmth signalling ("No warmth signalling: no hand-drawn wheat, no
soft script, nothing that implies reconciliation before it has happened"), while
`DIC4-P01` answers with warm intergenerational storytelling and lists "family memory
trees" among its motifs — the very instinct `DSC-08` and `DIV2-07` both forbid. So
`DIC4-P01` is not derivative of `DSC-08`'s *answer*. It is derivative of its *premise*, and
the brief treats materially the same premise and the same unusual human conflict as
disqualifying in their own right.

---

### Finding 4

**v4 case:** `DIC4-P03` (community town hall)

**comparison artifact/case:** `SC2-09`, `docs/model-evals/design-intent-sealed-challenge-v2.json`

**classification:** `DIAGNOSTIC`

**v4 evidence:** `creativeDirection`: "…It ensures full structural parity between English
and Spanish while providing clarity for public debate."; `visualMotifs`: "side-by-side
bilingual columns"; `creativeGuidance`: "Provide strict side-by-side bilingual symmetry
across all printed agenda and feedback materials."; `typographyDirection`: "…equal font
sizes, line heights, and visual prominence."

**comparison evidence:** `SC2-09` — `creativeDirection`: "Two volunteer fire companies that
have competed since 1931 are merging… a room watching to see whose name is bigger.
Scrupulously even-handed…"; `dominanceNotes`: "Neither of the two colours may lead. Equal
weight and equal placement, or the room will notice inside ten seconds…"; `visualMotifs`:
"two bands of exactly equal width", "a mirrored pair with nothing placed between them";
`creativeGuidance`: "Symmetry will do more here than any clever unifying emblem."

**what overlaps:** The solved creative move — exact structural parity, enforced down to
equal measure and placement, as the design answer to a demand for demonstrable fairness
between two watching parties.

**analysis:** Diagnostic rather than disqualifying on its own. The axis of parity differs
(two rival institutions versus two languages), and bilingual layout parity is a legitimate
and fairly standard response to a translation requirement. It is recorded because it
compounds Finding 2: between `DIV2-08` (three columns of the same notice in three
languages, neutral civic voice) and `SC2-09` (parity as the answer to a fairness demand),
both halves of `DIC4-P03`'s central move are already present and readable.

---

### Finding 5

**v4 case:** `DIC4-P02` (family reunion — former foster siblings)

**comparison artifact/case:** `DIV2-07`, `docs/model-evals/design-intent-validation-v2.json`

**classification:** `DIAGNOSTIC`

**v4 evidence:** `eventType: "family reunion"`; `creativeDirection`: "A flexible identity
centered on chosen kinship… It avoids traditional genealogical tropes to celebrate the
active creation of new shared traditions."; `creativeGuidance`: "Avoid multi-generational
legacy imagery or traditional family tree metaphors in favor of flexible network
concepts."

**comparison evidence:** `DIV2-07` — `eventType: "family reunion"`; `creativeGuidance`:
"Family-tree imagery - branches, roots, sepia photographs - would be exactly the wrong
instinct here"; `creativeDirection`: "The Aldergrove side of the family has not been in one
room since a will was contested twenty-four years ago…"

**what overlaps:** Both are `"family reunion"` cases whose first stated creative
instruction is a prohibition on family-tree and genealogical-legacy imagery.

**analysis:** Not substantive enough to disqualify. The prohibition arises from genuinely
different reasoning: in `DIC4-P02` the attendees share no lineage at all, so the metaphor
is factually inapplicable; in `DIV2-07` the lineage is shared but contested, so the
metaphor is tactless. The resulting identities diverge accordingly — `DIC4-P02` substitutes
a network/directory figure ("interconnected directory nodes", "modular grid lines") that
`DIV2-07` does not reach for. Recorded because the specific anti-family-tree directive is
distinctive enough that a reader of the prior corpus would recognise it, and because it is
the same solved sub-problem ("a reunion design that must refuse the obvious reunion
iconography") appearing twice under the same `eventType` label.

---

### Finding 6

**v4 case:** `DIC4-Q04` (birthday celebration — 100th, nursing home)

**comparison artifact/case:** `DIV-08`, `docs/model-evals/design-intent-validation.json`; secondarily `DSC-11`, `docs/model-evals/design-intent-sealed-challenge.json`

**classification:** `DIAGNOSTIC`

**v4 evidence:** Situation card — "a group of elderly friends from a nursing home and their
younger caregivers"; "to celebrate the 100th birthday of a woman who has outlived most of
her contemporaries"; "her hearing is poor, and she relies on lip-reading". Identity —
`typographyDirection`: "High-contrast, slightly enlarged letterforms; avoid thin strokes.";
`creativeGuidance`: "Design for close-range interaction (e.g., large print, clear
hierarchies)." / "Avoid visual noise—keep patterns subtle and backgrounds matte.";
`dominanceNotes`: "Warm, saturated tones for visibility; avoid glare."

**comparison evidence:** `DIV-08` — `creativeDirection`: "An eightieth held in the day room
of the home where she now lives, because she cannot travel to anything. Many of her guests
are old too."; `tonalIntent`: "Bright, with a wide gap between light and dark, because
several people reading this see poorly."; `typographyDirection`: "Large and open, nothing
thin, and nothing set in long unbroken runs."; `hostConstraints`: "Text must be large and
easy to read throughout; several guests read with difficulty."; `textureDirection`:
"Nothing busy behind the words; whatever they sit on stays calm."

`DSC-11` — "A hundredth birthday for the woman who sold ferry tickets from the same booth
for fifty-one years…"; `hostConstraints`: "Nobody is to call her young at heart. She has
heard it and she did not care for it."

**what overlaps:** A milestone birthday for a very old woman held in a residential care
setting, where a sensory impairment among the guests drives the typographic answer, and
that answer converges: large print, high contrast, no thin strokes, quiet backgrounds,
no glare. `DSC-11` separately supplies the centenarian-woman milestone and the
"refuse the sentimental cliché about her age" constraint.

**analysis:** Diagnostic, not disqualifying. The premises are distinct: `DIV-08`'s honoree
is housebound and her guests read poorly; `DIC4-Q04`'s honoree lip-reads and dislikes
volume, and the case's organising idea is storytelling at close range ("open book spines",
"magnified text fragments", "chapters, margins"). The convergence is on the design answer,
not the brief, and it is partly forced — large high-contrast type is the correct response
to several different impairments. Worth recording because `DIC4-Q04` reaches `DIV-08`'s
exact typographic prescription from a *hearing* impairment rather than a visual one, so the
answer is available from readable material without the brief needing to be read closely.

---

### Finding 7

**v4 case:** `DIC4-Q03` (funeral)

**comparison artifact/case:** `DIV-10`, `docs/model-evals/design-intent-validation.json`; secondarily `DSC-08` and `DIV2-07`

**classification:** `DIAGNOSTIC`

**v4 evidence:** Situation card — "a divided family with estranged siblings"; "a will that
specifies no religious elements in the service"; "The siblings have not spoken in over a
decade". Identity — `hostConstraints`: "no religious elements"; `creativeGuidance`: "Avoid
any motif or symbol tied to a specific faith or tradition."; `typographyDirection`: "Clean,
timeless serifs with generous spacing; no religious or cultural ornamentation.";
`tonalIntent`: "A serene, almost austere calm that holds space for both grief and
reconciliation."

**comparison evidence:** `DIV-10` — "A naming day for twins adopted at four and six…";
`hostConstraints`: "No religious language or symbols of any kind."; `textureDirection`:
"Growing things and unfinished wood; nothing churchlike."; notes: "it is a ceremony with no
religion".

`DSC-08` — `creativeGuidance`: "I would keep it near enough to one colour and almost
austere, the smallest possible amount of design." / "…nothing that implies reconciliation
before it has happened."

**what overlaps:** Two separable components, each with a readable precedent. The absolute
no-religion secular ceremony, with an explicit ban on faith-specific symbols, is `DIV-10`'s
device. The estranged-siblings-and-a-will substrate is `DIV2-07`'s, and the neutral
posture toward a family rift is `DSC-08`'s. The lexical scan also flagged that "austere"
and "reconciliation" each occur in exactly one prior *identity* — `DSC-08`, in its
`creativeGuidance` — and both surface in `DIC4-Q03`'s single `tonalIntent` sentence.
("austere" appears once more across the corpora, in `SC2-01`'s authoring note rather than
in any identity.)

**analysis:** Diagnostic. The combination is genuinely new: the prohibition originates in
the decedent's will rather than the host's taste, and the live tension — a devout sibling
who cannot perform their rites without breaching the parent's stated wish — has no
precedent in any corpus read here. The `DSC-08` word pair is recorded for completeness but
does not carry weight on its own; the two cases use it to opposite ends, `DSC-08`
forbidding any implication of reconciliation and `DIC4-Q03` explicitly holding space for it.
The case's components are teachable from readable material; its central problem is not.

---

### Finding 8

**v4 case:** `DIC4-Q01` (retirement party)

**comparison artifact/case:** `DIR-03`, `docs/model-evals/design-intent-regression.json`; device family also in `DIR-04`, `DIR-08`, `DIV2-04`, `DSC-11`, `SC2-03`, `DIC3-M05`

**classification:** `DIAGNOSTIC`

**v4 evidence:** Situation card — "a group of former factory workers and their families";
"to honor the last shift of a 40-year employee who quietly mentored dozens of coworkers";
"The retiree has requested that no gifts be given, as he finds them embarrassing".
Identity — `creativeDirection`: "Honor quiet mentorship and collective respect without
centering gifts—elevate shared history, craftsmanship, and understated gratitude.";
`hostConstraints`: "no gifts"; `visualMotifs`: "machine gears as subtle patterns", "shared
tool silhouettes", "faded blueprints"; `creativeGuidance`: "Avoid literal factory imagery
that feels cold or corporate." / "Emphasize the *group's* voice over the retiree's solitary
figure."

**comparison evidence:** `DIR-03` — "Forty-one years driving and then maintaining buses out
of the same depot… The day should honour a working life without dressing it up as something
posher than it was."; `visualMotifs`: "a spanner worn smooth"; `hostConstraints`: "No
balloons or party-shop styling." / "Do not call it a celebration of a career; he hates that
phrase."; `creativeGuidance`: "Treat the depot itself as the subject rather than him; he
will find that easier to accept."

Device family — `DIR-08`: "Nothing that implies gifts."; `DIR-04`: "No speeches, and nothing
on the page that implies there will be speeches."; `DIV2-04`: "Marguerite asked that the
word celebration not appear anywhere"; `DSC-11`: "Nobody is to call her young at heart.";
`SC2-03`: "This cannot read as a farewell service."; `DIC3-M05`: "Avoid cliché retirement
tropes like golf clubs, rocking chairs, or retirement clocks."

**what overlaps:** Two things. First, the archetype: a long-service blue-collar retirement
at or near the workplace, honoree modest about it, answered with an industrial palette,
worn-tool motifs, sturdy utilitarian lettering and an explicit instruction against
prettification. `DIR-03` is that case at 41 years; `DIC4-Q01` is that case at 40.
Second, and more broadly, the "honoree refuses the customary form of recognition" device
— no gifts / no speeches / not a celebration / not a farewell — which recurs across at
least six prior readable identities. `DIR-03` and `DIC4-Q01` also share the deflection
move, `DIR-03` redirecting attention from the man to the depot and `DIC4-Q01` from the
retiree to the group.

**analysis:** Diagnostic, not disqualifying. Retirement is a broad archetype and industrial
palettes for industrial lives are ordinary. `DIC4-Q01` carries content `DIR-03` does not:
the factory has closed, so the event doubles as the workforce's first reunion, and the
no-gifts constraint sits in tension with the group's wish to acknowledge him tangibly —
a genuine problem with no precedent found here. The "refused recognition" device is
recorded at corpus level rather than as a pairwise collision, because it is pervasive
enough in the readable material to be a house convention of this benchmark; see
corpus-wide question 5.

---

### Finding 9

**v4 case:** `DIC4-Q06` (wedding — competitive board-game couple)

**comparison artifact/case:** `CU-13`, `docs/model-evals/creative-understanding.json`; `SC2-05` and `SC2-08`, `docs/model-evals/creative-understanding-sealed-challenge-v2.json`

**classification:** `DIAGNOSTIC`

**v4 evidence:** `creativeDirection`: "Celebrate a bond forged in strategy and mutual
respect—playful but precise, with nods to the game without literal board game motifs.";
`visualMotifs`: "interlocking shapes", "paired symmetries", "abstract move counters";
`creativeGuidance`: "Avoid literal board game imagery (e.g., dice, cards, boards)."

**comparison evidence:** `CU-13` — prompt: "60th birthday for my dad, he likes jazz and old
maps"; notes: "Taste arrives through the guest of honour rather than a style name.
Cartography line work, foxed paper, brass, a late-night blue — interests translated, not
illustrated."

`SC2-05` — "No moving boxes or key clip art, please." `SC2-08` — "I want actual drains,
culverts and runoff arrows in it. Please don't turn it into a tasteful water theme."

**what overlaps:** The solved creative move: a personal hobby supplies the identity, and
the correct answer is to abstract it into structure and material rather than depict its
objects. `DIC4-Q06` states the move as guidance; `CU-13` states it as the benchmark's own
rationale for that case, in the phrase "interests translated, not illustrated".

**analysis:** Diagnostic. The move is documented benchmark doctrine, readable in
`creative-understanding.json`'s case notes, so a reader of that file would arrive at
`DIC4-Q06`'s guidance without reading `DIC4-Q06`'s brief. Against that, the premise is
distinct — a couple whose social circle doubted the match, where the design must satisfy
both an outgoing and a reserved partner — and no prior case in this universe pairs a hobby
abstraction with a skepticism-of-the-relationship problem. `SC2-05` and `SC2-08` are
recorded as the same anti-literalism device rather than as premise overlap; `SC2-08`
inverts it.

---

### Finding 10

**v4 case:** `DIC4-P01` (family reunion) and `DIC4-Q03` (funeral) — cross-half

**comparison artifact/case:** each other

**classification:** `DIAGNOSTIC`

**v4 evidence (`DIC4-P01`):** "the first time the family has gathered since the matriarch
passed away six months prior, and they need to make decisions regarding the future of the
ancestral family farm"; "High emotional tension exists between two siblings"; guidance:
"…without favoring either selling or keeping the farm."

**comparison evidence (`DIC4-Q03`):** "a divided family with estranged siblings and their
children"; "to honor a parent who was a bridge between the siblings"; "The parent passed
away suddenly, leaving behind a will"; "The siblings have not spoken in over a decade".

**what overlaps:** The same family structure and the same mandated posture: a parent has
died, the surviving siblings are divided, the deceased's estate or stated wishes are the
matter in dispute, and the design is required to hold neutrality between the siblings.

**analysis:** Diagnostic, not disqualifying. The complications diverge in the way that
matters: `DIC4-P01`'s dispute is material (sell the land to clear a debt, or preserve the
home the caregiver lived in) and the event is a decision meeting months after the death;
`DIC4-Q03`'s is a conflict between a devout sibling's rites and a will forbidding religious
elements, at the funeral itself. The identities diverge accordingly — warm, archival and
lineage-forward in `DIC4-P01`; austere, secular and symmetrical in `DIC4-Q03`. Recorded as
the one cross-half premise-family recurrence found, and as context for Finding 3: the
bereaved-and-divided-family situation carries three instances across the twelve v4 cases
and the readable prior corpora combined.

---

### Finding 11

**v4 case:** all six half-Q cases (`DIC4-Q01`–`DIC4-Q06`), and secondarily all six half-P
cases

**comparison artifact/case:** distribution-level, within v4

**classification:** `DIAGNOSTIC`

**v4 evidence:** Half Q: `creativeGuidance` is exactly three bullets in all six cases, and
every case contains an "Avoid …" bullet (five of six open with it); five of six contain a
parenthetical "(e.g., …)" exemplification; `compatibleTypographyCategories` contains both
`transitional` and `oldstyle` in all six; `compatibleTonalDirections` contains `mid` in all
six; `toneKeywords` is exactly five and `visualMotifs` exactly four in `Q02`–`Q06`.
Repeated sentence frames across cases: "Design should feel inclusive to all attendees,
regardless of belief." (`Q03`) / "Design should feel inclusive to both personalities
(outgoing/reserved)." (`Q06`); "Use symmetry or balance to subtly reinforce unity." (`Q03`)
/ "Use duality or pairing in visuals to reflect the couple's dynamic." (`Q06`) / "Use
composition to suggest safety in numbers…" (`Q05`).

**comparison evidence:** Half P: `toneKeywords` is exactly six, `preferredColors` exactly
five, `visualMotifs`
exactly five and `creativeGuidance` exactly three in all six cases; `compatibleFamilies`
contains `editorial` in all six; `compatibleTypographyCategories` contains `transitional`
in all six; `compatibleTonalDirections` is `["light","mid"]` in five of six. Guidance
bullets are uniformly imperative and cluster on a small verb set (`Ensure`, `Provide`,
`Maintain`, `Structure`), with `P01`, `P03` and `P04` all closing on "Maintain a …".

**what overlaps:** Each half is internally uniform in field cardinality, enum selection and
guidance register to a degree that reads as a single authoring template applied six times.

**analysis:** Diagnostic at distribution level. The two halves converge internally but on
*different* signatures — half P runs six tone keywords, five motifs and a light/mid
`editorial` bias; half Q runs five tone keywords, four motifs, an always-`mid` tonal band
and an always-`transitional`+`oldstyle` typography pool — so this is not cross-half
convergence, and no inference is drawn here about authorship of either half. Taken alone
this is stylistic rather than semantic, and the EventIdentity schema legitimately
constrains cardinality. It is recorded because in one place the template stops being
stylistic and becomes substantive: `DIC4-Q02` and `DIC4-Q05` share not just the frame but
the content poured into it, which is Finding 1.

---

### Considered and dismissed

Classified `BENIGN / COMMON`; listed so the reader knows they were examined.

- **`DIC4-P01` ↔ `DIC4-P02`** — both `eventType: "family reunion"` within half P. Deliberate
  opposites on one axis (inherited lineage versus chosen kinship), matching the same-type
  pairing convention visible in the prior corpora (`SC2-03`/`SC2-04`, `DIV2-03`/`DIV2-04`,
  `DIC3-M02`/`M03`). Shared label, materially different design problems.
- **`DIC4-P01` ↔ `DIC3-M01`** (v3 gemini set) — `DIC3-M01`'s `hostNames` is "The Miller
  Children" and `DIC4-P01`'s card names "the extended Miller family". "Miller" is not
  distinctive enough to carry weight, and the name appears only in the v4 situation card,
  not in the `DIC4-P01` identity. Coincidence.
- **`DIC4-Q02` ↔ `SC2-09`** — both concern two mutually wary groups who must be brought
  together. `SC2-09` answers with strict parity and symmetry; `DIC4-Q02` answers with
  collaborative overlap and uneven texture, and explicitly declines to centre either party.
  Different solved problems.
- **`DIC4-Q02`/`DIC4-Q05` ↔ `DIV-09`, `DIC3-M06`, `DIC3-G06`** — shared "community gathering
  over food" territory only. The v3 community cases are generically festive and share no
  device bundle with either v4 case.
- **`DIC4-P02` ↔ `DIV-07`** — both use a network/node figure. `DIV-07`'s is a literal rail
  network the honoree rode; `DIC4-P02`'s is an abstract kinship graph. Unrelated reasoning.
- **`DIC4-P04`, `DIC4-P05`, `DIC4-P06`** — no substantive overlap found anywhere in the
  comparison universe. An academic dissertation defence with a remote committee member, a
  wildlife-rehabilitation volunteer orientation, and a no-device analog product
  post-mortem have no counterpart in any prior readable DesignIntent corpus, in the v3
  candidate, replacement or invalidated sets, or in the creative-understanding and
  clarification-rerun premises. Their nearest neighbours share only register (institutional,
  instructional, procedural), which the brief excludes as insufficient.

---

## Corpus-wide assessment

**1. Cross-v4 overlap.** Yes, and one instance is substantive. `DIC4-Q02` and `DIC4-Q05`
(Finding 1) are functionally the same design problem under different wording, within half
Q, sharing an identical `eventType` string, the same device bundle and near-identical
guidance phrasing. Separately, `DIC4-P01` and `DIC4-Q03` (Finding 10) recur on the same
family structure across the halves — dead parent, estranged siblings, contested
estate/wishes, mandated neutrality — but resolve to genuinely different complications and
identities and are diagnostic only. `DIC4-P01` and `DIC4-P02` share an `eventType` label by
apparent design and are benign.

**2. Prior-corpus overlap.** Yes, at two levels. Substantively: `DIC4-P03` reproduces the
solved creative problem of `DIV2-08` across nine coinciding elements (Finding 2), and
`DIC4-P01` reproduces the whole human premise of `DSC-08`, with `DIV2-07` supplying a second
readable instance of the surrounding conflict (Finding 3). Diagnostically: `DIC4-Q04`
converges on `DIV-08`'s accessibility answer (Finding 6), `DIC4-Q03` assembles `DIV-10`'s
no-religion device onto `DIV2-07`'s estranged-family substrate (Finding 7), `DIC4-Q01` sits
inside a heavily precedented retirement archetype and device family (Finding 8), and
`DIC4-P02` repeats `DIV2-07`'s anti-family-tree directive (Finding 5). Half of the twelve
cases touch prior readable material at diagnostic level or above.

**3. Previously solved problem recurrence.** Yes, in three cases. `DIC4-P03`'s central
problem — a neutral, multilingual civic notice for a contested land-use hearing — is solved
in `DIV2-08`, and its parity mechanism is solved again in `SC2-09`. `DIC4-P01`'s central
premise is solved in `DSC-08`. `DIC4-Q06`'s creative move is stated as doctrine in
`CU-13`'s own case notes ("interests translated, not illustrated"), though its premise is
its own. `DIC4-Q04` arrives at `DIV-08`'s typographic prescription from a different stated
impairment, which makes the answer reachable without reading the brief closely.

**4. Distribution/template convergence.** Both halves show it, on different signatures
(Finding 11). Half Q: uniform three-bullet guidance always containing an "Avoid …" bullet,
mostly with "(e.g., …)" exemplification; `transitional`+`oldstyle` in every typography
pool; `mid` in every tonal pool; five tone keywords and four motifs in five of six cases;
and repeated sentence frames across cases ("Design should feel inclusive to …", "Use … to
…"). Half P: exactly six tone keywords, five preferred colours, five motifs and three
guidance bullets in every case; `editorial` in every family pool; `transitional` in every
typography pool; `["light","mid"]` in five of six; imperative guidance on a narrow verb
set. As a stylistic signature this is not by itself disqualifying and is partly schema-
driven. It becomes substantive only where the template carries shared content, which is
the `DIC4-Q02`/`DIC4-Q05` collision. No inference is drawn about the authorship of either
half.

**5. Distinctive phrase/device reuse.** Yes, exceeding ordinary coincidence in one place
and worth recording in several. Exceeding: the `DIC4-Q02`/`DIC4-Q05` guidance and palette
sentences, which are the same sentences with substituted nouns. Worth recording: "farm
property boundary lines" against `DSC-08`'s "a field boundary drawn on a deed map", with
"farm" appearing in exactly one of 80 prior identities; `DIC4-P03`'s "side-by-side
bilingual columns" against `DIV2-08`'s "three columns of the same notice in three
languages", with Spanish named in both; `DIC4-Q04`'s "avoid thin strokes" against
`DIV-08`'s "nothing thin"; the co-occurrence of "austere" and "reconciliation" in
`DIC4-Q03`'s single `tonalIntent` sentence when each word occurs in exactly one prior
identity, `DSC-08` ("austere" appears once more, in an authoring note). At device-family level, the "honoree refuses the customary form of
recognition" constraint (`DIC4-Q01`'s "no gifts") has at least six readable precedents
(`DIR-04`, `DIR-08`, `DIV2-04`, `DSC-11`, `SC2-03`, `DIC3-M05`) and is best read as a house
convention of this benchmark rather than as a collision. The "Miller" surname shared
between `DIC4-P01`'s card and `DIC3-M01`'s `hostNames` is dismissed as coincidence.

**6. Overall verdict: ACTION REQUIRED.**

Four cases are no longer clean independent challenge evidence:

- **`DIC4-Q02`** and **`DIC4-Q05`** — functionally the same design problem as each other,
  under the same `eventType` label, with the same device bundle and near-identical guidance
  phrasing (Finding 1).
- **`DIC4-P03`** — same solved creative problem as `DIV2-08`, a fully readable prior
  corpus case, across nine coinciding elements including the two most distinctive ones;
  compounded by `SC2-09` (Findings 2 and 4).
- **`DIC4-P01`** — materially the same premise and the same unusual human conflict as
  `DSC-08`, a readable prior *sealed-challenge* case, with a second readable precedent for
  the surrounding conflict in `DIV2-07` (Finding 3).

The remaining eight cases (`DIC4-P02`, `DIC4-P04`, `DIC4-P05`, `DIC4-P06`, `DIC4-Q01`,
`DIC4-Q03`, `DIC4-Q04`, `DIC4-Q06`) carry no overlap above diagnostic level.

---

## Summary

- **ACTION REQUIRED case ids:** `DIC4-P01`, `DIC4-P03`, `DIC4-Q02`, `DIC4-Q05`
- **DIAGNOSTIC case ids:** `DIC4-P02`, `DIC4-Q01`, `DIC4-Q03`, `DIC4-Q04`, `DIC4-Q06`, and
  `DIC4-P03` / `DIC4-P01` additionally (Findings 4 and 10); distribution-level diagnostic
  applies to all twelve (Finding 11)
- **No case was edited or repaired.** This review is read-only with respect to the corpus.
  No file under `half-a/`, `half-b/`, `leakage/` or `stage-2/` was modified, and no case
  text was rewritten, normalised or corrected. The only file added by this review is this
  document.

Per the review brief, work stops here. No replacement cases are proposed, no author is
contacted, no system-aware fairness review is begun, the canonical v4 corpus is not
assembled, and no DesignIntent or provider/eval call was made.
