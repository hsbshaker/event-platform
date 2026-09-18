# v4 sealed challenge — authoring provenance

Empty on purpose. The protocol was frozen before any situation card or case existed, and this file
is the ledger that fills as artifacts arrive.

The protocol itself lives in `src/lib/ai/evals/design-intent-challenge-v4-protocol.ts` as checkable
values and in `docs/phase-4b-plan.md` Part IV as canon. v3's closure — why this version exists at
all — is `../design-intent-sealed-challenge-v3/CLOSURE.md`.

Nothing in this directory is a corpus. No eval set points here, the canonical sealed slot
`docs/model-evals/design-intent-sealed-challenge-v4.json` is absent, and these files are never run.

**Attribution is user-supplied provenance, not a cryptographic claim** — for the human author of
half A exactly as much as for the model family of half B. Nothing here can prove who wrote a file.
The record says who it is attributed to and on what basis, and never more.

## Author sources

| half | namespace | source class | chosen source |
| --- | --- | --- | --- |
| A | `DIC4-P01`…`DIC4-P06` | one fresh human author | no identifying attribution supplied — see below |
| B | `DIC4-Q01`…`DIC4-Q06` | one fresh model family, not OpenAI-, Anthropic- or Google-family, and no prior corpus in this programme | **Mistral** — see below |

The namespaces are neutral by design: `P` and `Q` say nothing about which half a human wrote. Case
ids never reach the blind qualitative reviewer, but they do reach the semantic and fairness
reviewers, and a reviewer who knows which half is human-authored is no longer reading the cases.

Half B's family is recorded **before** commissioning or half B is not commissioned, and that is
what happened: the slot was a declared `null` at the protocol freeze and was set to `Mistral` in a
later commit whose tree still contains **no `DIC4` situation card or case**. `git` carries the
ordering rather than a claim in prose.

### Half A's provenance, stated as it actually happened

Three separate facts, kept separate because collapsing them would overstate the record:

1. **The source class `human` was frozen before any card existed.** That is checkable: commit
   `3d65086` declares half A's `sourceClass` as `human`, and its tree contains no `DIC4` card or
   case. So is the fact that nothing in the protocol was edited after the cards arrived.
2. **The author is represented by the user as satisfying the eligibility restrictions** — not the
   user, not Claude, not a prior reviewer, and having seen no repository, corpus, v3 case, review
   finding, prompt or implementation. That is a representation carried in the commissioning ruling,
   and this repository cannot verify any part of it.
3. **No identifying attribution has been supplied, and none was registered before commissioning.**
   There is no name, role or description of the person on record — before, during or after. This is
   recorded as a **provenance limitation** rather than backdated or implied away.

The limitation attaches to the attribution, not to the cards. It is not grounds to alter, replace
or re-solicit anything, and the cards stand exactly as authored.

### Half B, and the pin that had to be corrected

| | |
| --- | --- |
| family | `Mistral` |
| model | `Mistral Medium 3.5` |
| identifier used | `mistral-medium-latest` — **a moving alias, not a snapshot** |
| basis for reading it as Medium 3.5 | Mistral documentation, 2026-09-18 |
| authoring surface | Mistral Studio Playground |
| superseded pin | `mistral-medium-3-5`, recorded at `ca98f93` |

The original pin named the fixed snapshot `mistral-medium-3-5`, chosen precisely so that "which
model authored this corpus" would stay answerable. **It could not be used**: the precommitted Studio
Playground does not expose the fixed identifier in its model picker, so the alias is the only
selectable value. The pin was corrected before half B was commissioned, before any `DIC4-Q` card
existed, and with no authoring result observed — which is the ordering that matters, since a pin
changed in response to output would be fatal rather than administrative.

**What the correction costs, stated plainly.** The whole reason to name a snapshot is that it stays
named. An alias does not: `mistral-medium-latest` may resolve to a different model later, so the
dated documentation mapping plus the operator's attestation is now the *entire* basis for the model
attribution, and a reader a year from now cannot recover the authoring model from this record alone.
That is a genuine weakening of the property the pin existed for. It is accepted because the surface
leaves no alternative, and it is written down because a record that quietly keeps the word "pinned"
while losing the property would be worse than the limitation itself. `identifierIsMoving: true` sits
in the data so no reader has to infer it from prose.

The superseded pin is preserved in `SEALED_CHALLENGE_V4_HALF_B_MODEL_PIN_HISTORY` with its reason
and date, rather than overwritten as though it had never been chosen.

**One forbidden affordance changed with it.** The list used to forbid `mistral-medium-latest`
outright — it cannot, now that the alias is the only selectable identifier — so it forbids what is
still within anyone's control: selecting any model other than the one the picker labels Mistral
Medium 3.5. The risk the old entry guarded against has not gone away; it has moved into the model
record as a stated limitation, which is the honest place for a risk nobody can close. The other
seven entries are unchanged: Vibe automatic model routing, an agent, connectors, repository access,
web search, uploaded files, prior conversation context. The first two would make the authoring model
unknowable, the middle four could reach material the author must never see, and the last makes
"fresh session" false. **The seal is not only about what an author is told; it is also about what it
can go and find.**

## Half A — Stage 1 received, `DIC4-P01`…`DIC4-P06`

Received 2026-09-18. Six situation cards, accepted without substantive correction.

| file | role | sha256 | bytes |
| --- | --- | --- | --- |
| `half-a/01-original-raw.txt` | the author's response, verbatim | `42436cdc391609d3891a7abcdb0db986ac8d2a581d5ba752f7b44e3eebc9bdc8` | 8,111 |
| `half-a/02-situation-cards.json` | **the frozen cards**, syntax-only mapping | `4f49b176ee5da81ab0bcc3b3460efc4d3f6af7c47ae24c02b54beb519c43e0ab` | 6,671 |

### The normalization was syntax only, and it is reproducible rather than transcribed

Produced by a script that parses the raw file and emits the JSON, so the mapping can be re-run
against the preserved raw rather than believed. What it does, and nothing else:

| rule | what changed |
| --- | --- |
| 1 | `eventType` lowercased — `Family Reunion` → `family reunion`, and so on |
| 2, 3 | `whoIsGathering` and `whyItMatters` carried verbatim |
| 4 | `context` = the "What actually happens" text, one space, the "Anything else" text |
| 5 | `complication` carried verbatim |
| 6 | Situation 5's `None.` became JSON `null` |

The join in rule 4 is a single `U+0020` and nothing else — no added punctuation, conjunction or
connective, because both source sentences already end in a full stop. Every other value is byte-
identical to its source span, asserted card by card: lowercase-fold equality for `eventType`,
string equality for the two verbatim fields, `contextA + " " + contextB` for `context`, and both
context halves confirmed present as substrings of the raw file. Nothing was added, removed,
shortened, generalized, reinterpreted or improved.

### `checkSituationCards()` — clean

**Zero problems and zero advisory hits.** Exact namespace, six cards, unique ids, one same-
`eventType` pair (`family reunion`) across five distinct types, every required field present, five
non-null complications against a floor of four. The advisory design-language screen returned
nothing at all, which is worth noting: the cards contain no design-adjacent vocabulary even at the
level that would only have been reported for a person to weigh.

### Human Stage-1 review

**Verdict: PASS on all three checks.**

*Each stated complication is genuinely non-aesthetic and materially relevant.* P01 pairs a sibling
conflict over selling versus keeping an inherited farm with a wheelchair user needing step-free
access across a sloped lawn — interpersonal and accessibility, both bearing on how the event may be
addressed. P02 is trauma-varying comfort with personal questions plus an unresolved falling-out
needing coordination. P03 is a missing translation system against 30% limited-English attendance,
solved by volunteer sentence-by-sentence translation that doubles the runtime. P04 is a committee
member on satellite from a research vessel, with lag and drop risk. P06 is blame that already
happened in messaging channels and a disagreement over who authorized the release, making
psychological safety the central difficulty. None is a matter of taste; each changes what the event
has to accommodate.

*No card proposes a visual or design solution.* Confirmed by reading, and independently by the
advisory screen returning empty. The ordinary objects — property documents, audio recorders, a
floor microphone, feedback cards, informational placards, safety gear, transport crates, a physical
whiteboard — are situation facts about what people do, not design vocabulary, and are treated as
such.

*The premise floor.* Five of six carry a complication and all six carry specificity the event type
alone would not supply: two family reunions that share a label and almost nothing else — one a
grief-shadowed inheritance negotiation, the other foster siblings with no inherited tradition
inventing one — a town hall whose real constraint is bilingual delivery, a defense with a lagged
remote examiner and publicly opposed advisors, a post-mortem where the blame preceded the meeting.

**The weakest card against that floor is `DIC4-P05`, and it is recorded rather than glossed.** Its
complication is honestly `None.`, and its differentiator is an audience spread from high-school
students to retired veterinary technicians. That is a real audience-composition fact, and the floor
explicitly permits a card with no complication — but of the six, this is the one where the event
type does most of the work in suggesting an obvious direction. It passes; it is the one to watch at
Stage 2. That the author wrote `None.` rather than manufacturing a complication to fill a quota is
itself a point in the half's favour.

### Diagnostic for the eventual semantic review — not a finding, not acted on

`DIC4-P01` names an "extended Miller family". The **invalidated** first Gemini v3 half used
`hostNames: "The Miller Children"`. The human author saw no v3 artifact, `Miller` is among the most
common surnames there are, and the protocol counts name reuse as substantive only when it is too
distinctive to be coincidence. Recorded here so the semantic reviewer weighs it with everything
else in front of it, rather than discovering it and wondering whether anyone noticed.

## Half B — Stage 1 received and frozen, `DIC4-Q01`…`DIC4-Q06`

Received 2026-09-18. Six situation cards, accepted without correction.

| file | role | sha256 | bytes | commit |
| --- | --- | --- | --- | --- |
| `half-b/01-situation-cards.json` | **the frozen cards**, verbatim | `969be131f15a5619218646746eb1edffb569c384cca85b0d8088d5ef13c76b9c` | 4,041 | `eddcb36` |

The response arrived as valid JSON in the required shape, so there was no normalization round at all
and nothing to diff: the artifact preserved is the artifact validated.

**Generation provenance, as supplied by the operator:** family Mistral, displayed model
`Mistral Medium`, alias `mistral-medium-latest`, Mistral Studio Playground, 2026-09-18, temperature
`0.7`, `max_tokens` 4096, `top_p` 1, JSON response format, no capabilities, **one generation only**,
triggered by the user message `Proceed.`, with no files, connectors, web, repository access, tools or
prior conversation context. That matches every forbidden affordance the protocol lists. As
everywhere in this programme, it is provenance the operator supplies and this repository cannot
verify — and the alias limitation recorded above applies: `Mistral Medium` displayed in the picker
and `mistral-medium-latest` selected are read as Mistral Medium 3.5 on the strength of a dated
documentation mapping, not of the identifier.

### Structural facts, verified rather than assumed

| expected | verified |
| --- | --- |
| six cards | 6 |
| ids exactly `DIC4-Q01`…`DIC4-Q06` | exact, in order |
| exactly one same-`eventType` pair, `community potluck` on Q02 and Q05 | one pair, and it is that pair |
| five distinct event types | 5 — retirement party, community potluck, funeral, birthday celebration, wedding |
| five non-null complications | 5; `DIC4-Q06`'s is genuine JSON `null`, not the string `"None"` |
| no hard Stage-2 design vocabulary | none |
| no advisory design-language finding | none |

`checkSituationCards()` returned `{ problems: [], advisory: [] }`. Half A, re-run in the same pass,
still returns the same.

### Human Stage-1 review

**Verdict: PASS on all three checks.**

*Each complication is non-aesthetic and materially affects interpretation.* A retiree who asked for
no gifts because they embarrass him, against a group determined to acknowledge him tangibly — a
direct conflict between the honoree's stated wish and the gathering's purpose. A new resident's
elaborate dish read as performative by long-time residents, which is the exact fault line the
potluck exists to cross. A will specifying no religious elements against a sibling whose faith
requires particular rites. A centenarian who dislikes loud music, in a home whose staff reach for it
by default. A recent accident on a club hike that has made members wary of telling their own
stories, at an event whose point is sharing them. Each changes what the event has to accommodate;
none is a matter of taste.

*No card proposes a visual or design solution.* Confirmed by reading and independently by both
screens returning empty. Half B names no objects at all, ordinary or otherwise.

*The event type does not substantially determine the answer.* A retirement party three months after
the factory closed, for a man who refuses recognition. A potluck about gentrification and erased
history. A funeral whose deceased legislated against religion and whose children have not spoken in
a decade. A hundredth birthday organised around lip-reading. And a second potluck that shares its
label with the first and almost nothing else — an intimidation gradient in a hiking club, chilled by
an accident — which is the same-type pair doing exactly what it is for.

**The weakest card is `DIC4-Q06`, recorded rather than glossed.** Its complication is legitimately
`null`, and its differentiator is a shared hobby plus friends who doubted the relationship. Of the
six it sits closest to its genre default, and it carries a specific risk the others do not: "couple
who met over competitive board games" is the one premise here that a Stage-2 author could answer by
theming the event around the hobby, which would let the event type plus one noun determine the
direction. It passes the floor — the floor permits a card without a complication, and the friends'
skepticism and the personality contrast are real social facts — but it is the card to watch when
Stage 2 maps it. Half A has an exact counterpart in `DIC4-P05`, for the same structural reason.

### Diagnostics for the eventual semantic review — not findings, not acted on

**Half B's cards are markedly more uniform in shape than half A's.** Context runs 28–36 words
across all six (a range of 8) against half A's 47–62 (a range of 15); complications run 21–26 words
(range 5) against half A's 30–56 (range 26). Every half-B complication is a single sentence naming
one interpersonal tension, where half A's `DIC4-P01` carries two distinct ones — an inheritance
conflict *and* a wheelchair access need. That is mild authorial-template pressure of exactly the
kind the v3 reviews learned to look for, it is recorded for the semantic reviewer to weigh with
everything else in front of it, and it is **not** grounds for action: the protocol's floor is met on
every card and uniformity of length is not overlap.

**Half B contains no proper nouns at all** — no names, no places, no venues. Half A names a Miller
family. Neither is a defect; the contrast is recorded because a reviewer comparing the halves will
see it and should know it was noticed rather than missed.

**Zero cross-half `eventType` overlap.** The twelve carry nine distinct types with one pair in each
half. Legal either way, and worth stating as a fact rather than leaving to be recomputed.

No comparison against prior corpora was performed beyond these per-half diagnostics, and no
semantic-overlap finding has been or will be returned to Mistral.

### Both Stage-1 halves are now frozen

Twelve situation cards exist and no v4 case does. Stage 2 has not begun for either author.

## Review order

1. mechanical and schema validation;
2. the frozen leakage scan across every registered model-visible surface;
3. **verification that each final case is still faithful to its frozen situation card**;
4. independent semantic premise and device overlap review, against every readable corpus, both
   earlier invalidated sealed challenges, **all v3 artifacts**, and the other new half;
5. system-aware fairness review — still unspent — only if the semantic review passes;
6. freeze the canonical corpus only if every prior stage passes;
7. stop for explicit paid-run authorisation.

Step 4 includes the v3 artifacts deliberately: the reviewer may read all of them, and no v4 author
sees any of them. That asymmetry is how we find out whether a new source lands on the same ground
without ever telling it where that ground is.

## What no author is told

No subject, genre or device to avoid — not from v3, not from anywhere. A benchmark coached against
cases its authors must not know exist is a construction aimed at known answers, and a corpus that
avoids what we already found would be evidence that we edited the test rather than that the system
generalizes.
