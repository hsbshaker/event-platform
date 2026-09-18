# v3 sealed challenge — external authoring provenance

The raw halves as they were supplied, preserved before normalization or assembly, and the
mechanical result each one got. The protocol these are received under was frozen at `9da8010`,
before either author wrote a case, and is recorded in `docs/phase-4b-plan.md` Part IV.

**Attribution here is user-supplied provenance, not a cryptographic claim.** Nothing in a JSON file
proves which model produced it. Source family is recorded because the record should say who the
corpus is attributed to and on what basis — never because the file can be shown to be that model's
work. The labels are provenance only: they must never reach the DesignIntent model or the blind
qualitative reviewer.

Nothing in this directory is a corpus. No eval set points here, the canonical sealed slot
`docs/model-evals/design-intent-sealed-challenge-v3.json` remains absent, and these files are never
run.

## Gemini half — `DIC3-M01`…`DIC3-M06`

Received 2026-09-18. Six cases, namespace exact.

| file | role | sha256 | bytes | commit |
| --- | --- | --- | --- | --- |
| `gemini/01-original.json` | original raw half | `7d7587069a20fc333bb813328a39acdf5ec02dd72dd639490c8c167f6ec3ead7` | 15,842 | `bf3afc1` |
| `gemini/02-contract-correction.json` | first narrow contract-correction round | `c3e400ac31f7e9786e5091ddde3b9de62f686ecbaaed46670cebf86c5923d8ba` | 15,926 | `2bba4e5` |
| `gemini/03-final-candidate.json` | **the candidate** | `56ad64b072900428603b0b4f545db8118549e3c4d81705573c86c630ed5373d2` | 15,739 | `d53a45a` |

`01` and `02` are correction history and nothing else. **No case is ever selected from them, and no
version is ever mixed**: the candidate is `03` whole, or it is not the candidate. They are kept
because a lineage that discards its earlier rounds cannot show what the corrections were.

### Mechanical result on `03`: clean but for two leakage collisions, both in `DIC3-M01`

Run as a half, so the gated whole-corpus contract (twelve batches, two same-type pairs) is **not**
applied here — that runs once at assembly, and only when both halves are present.

Clean:

- `validateDesignIntentCorpusShape(..., { gated: false })` — no problems. That is the real
  `eventIdentityResultSchema`, the legal `suppliedFacts` keys, and the required-vs-avoided colour
  satisfiability floor, not a convenient subset.
- The protocol's own composition check — six cases, exact namespace, unique ids, **exactly one**
  same-`eventType` pair (`anniversary party`) across five distinct types.
- No id collides with any corpus on disk.
- No supplied-fact value appears in its own case's identity prose. Token overlap does
  (`conservatory`, `craftsman`, `clay`, `studio`), and it is **not** a finding: the frozen check
  compares the whole literal value, so an ordinary word a brief and a venue name share creates no
  false invention check.
- Cross-corpus `toneKeywords` overlap: **zero** exact matches against any other corpus, including
  the two invalidated candidates. Three successive corpora collided here before this one.
- Supplied-fact value reuse across corpora: **zero**. No shared names, venues or localities.

Two collisions against `docs/model-prompts/event-identity.system.md`, found by the frozen span
scan. All eight registered model-visible surfaces were scanned; every DesignIntent surface is
clean.

1. **`DIC3-M01.identity.creativeGuidance[0]`** contains the span `botanical line art`. The
   EventIdentity prompt lists `"soft botanical line art"` as a worked `visualMotifs` example. This
   is the collision class the scan exists to catch — a sealed case landing on a phrase that is
   already model-visible text — and the author, who never saw the prompt, could not have known.
2. **`DIC3-M01.identity.hostConstraints[1]`** begins `Do not include any…`. The span
   `do not include` is exactly fourteen characters, the scan's floor, and appears twice in the
   prompt as ordinary instruction boilerplate. It carries no benchmark content.

Both block assembly, because `prompt-leakage.test.ts` asserts an empty list and that scan is frozen
machinery — it is not weakened to admit a corpus. Under the repair policy a narrow leakage-collision
rewrite is allowed, but both need authorial prose, so both go back to the same external author as
abstract findings through the user. **No replacement prose is written here.**

The second finding is recorded with a caveat rather than passed along as though it were the first
one's equal. A three-word ordinary-English prohibition tripping a leakage scan is a heuristic false
positive, and the author-facing contract actively asks for host-voice prohibitions — so the scan is,
on this one string, penalising the behaviour it asked for. That is this programme's recurring defect
class, and whether it is the corpus or the machinery that should move is an escalation, not a
custodian's call.

### Diagnostic, not a finding

Three cases share the span `clean high contrast` and two share `high contrast editorial`, in
`typographyDirection` and `tonalIntent`. That is mild authorial-template pressure, it is recorded
for the eventual semantic-overlap review to weigh with both halves in front of it, and it is **not**
grounds for an edit on its own. `No visual inspiration supplied.` recurring in two cases is the
canonical sentinel used exactly as specified, which is correct behaviour rather than a template.

## ChatGPT half — `DIC3-G01`…`DIC3-G06`

Received 2026-09-18. Six cases, namespace exact.

| file | role | sha256 | bytes | commit |
| --- | --- | --- | --- | --- |
| `chatgpt/01-original-raw.txt` | original raw response | `e49d340ba0f67bcb86f2ac5a913140405996c027ff75bd1315132c1ae4e6c554` | 16,705 | `dbbdaac` |
| `chatgpt/02-normalized-candidate.json` | **the candidate** | `38963c46189013e8e969ef5d706a9a5ea67089bfefb904e166d948d452f05fd5` | 15,353 | `7d3d535` |

The raw response is not parseable JSON: its structural quotes are `U+201C`/`U+201D`. The candidate
is the normalized form, and the normalization was **verified rather than trusted**: replacing only
those two characters in the raw file yields an object deep-equal to the committed candidate. In-prose
apostrophes (`U+2019`) and `é` survive unchanged. That is a JSON/syntax correction, which the repair
policy allows, and it alters no content — which is a fact this record can show rather than assert.

### Mechanical result on `02`: clean but for six leakage collisions, none carrying benchmark content

Clean on the same battery as the Gemini half: structural contract with `gated: false`, the
protocol's composition check (exact namespace, unique ids, **exactly one** same-`eventType` pair —
`birthday party` — across five distinct types), no id collision, no supplied-fact value in its own
identity prose.

Six collisions, four distinct strings:

1. `DIC3-G03.toneKeywords[2]` = `reflective` — a bare adjective, matched against the EventIdentity
   prompt's "reflective surfaces".
2. `DIC3-G04.inspirationSummary` and `DIC3-G05.inspirationSummary` — the span `the host supplied`,
   against the prompt's "unless the host supplied exact colors".
3. `DIC3-G06.toneKeywords[1]` = `generous` — a bare adjective, matched on three surfaces, in three
   unrelated senses.

**None of these is benchmark content.** They are ordinary English words that a brief and a prompt
both happen to use, which is the overlap class the protocol classes as diagnostic. They block all
the same, because the scan asserts an empty list.

One of the six is worth separating, because it says something about the scan rather than the
corpus. `generous` matched `src/lib/ai/openai/design-intent.ts` inside a **code comment** about byte
budgets — text that never ships to any model. The scan reads whole source files as model-visible
surfaces when only their string literals are, so a comment can convict a corpus of leaking into a
prompt it never touched.

### Diagnostic, not a finding

`unhurried` (`DIC3-G04`) appears in the regression corpus, the validation corpus and the invalidated
second candidate; `companionable` (`DIC3-G04`) appears in that candidate. Both are ordinary English,
both were written by an author who saw none of those files, and under the protocol ordinary
vocabulary overlap is **diagnostic, never a gate**. Recorded for the semantic review to weigh, not
acted on.

`memorial gathering` occurs in both halves. Cross-half event-type matches are legal by protocol and
are explicitly not grounds for editing anything. Cross-half `toneKeywords` overlap is zero, and
cross-half supplied-fact value overlap is zero.

Two of the three inspiration-bearing cases open `inspirationSummary` with "The host supplied…",
which is mild authorial-template pressure for the semantic review to weigh with both halves in
front of it.

## The leakage-correction round, and what it was allowed to touch

Both authors were sent an abstract finding through the user — the colliding span, and nothing about
the system, the prompt, the other half or what the corpus is for. Neither was shown replacement
prose, because none was written here.

| file | role | sha256 | bytes |
| --- | --- | --- | --- |
| `gemini/04-leakage-correction.json` | **the Gemini candidate** | `89fc79fba1afe4471f977d750eead96fcc57961c0e3d807766d63211be2b88c2` | 15,743 |
| `chatgpt/03-leakage-correction-raw.txt` | raw ChatGPT response | `9547fc272debb426e87a79912dec46a5979136894b6b0be3d7655195498dbcad` | 16,703 |
| `chatgpt/04-leakage-correction-normalized.json` | **the ChatGPT candidate** | `74f31e7d5f6001dc3851f5a8114c9d4b565da5d2d0bbefef91c229e543047ada` | 15,351 |

The ChatGPT response again arrived with `U+201C`/`U+201D` structural quotes, and the same two-character
swap again reproduces the candidate exactly, apostrophes untouched.

**The corrections are narrow, and that is checked rather than asked for.** Comparing every leaf of
the corrected halves against their predecessors: the key sets are identical, nothing was added or
removed, and exactly six leaves changed across twelve cases — two in the Gemini half, four in the
ChatGPT half, every one of them a string the scan had flagged.

| case | field | before | after |
| --- | --- | --- | --- |
| `DIC3-M01` | `creativeGuidance[0]` | `…subtle botanical line art to reinforce…` | `…subtle botanical illustration accents to reinforce…` |
| `DIC3-M01` | `hostConstraints[1]` | `Do not include any bright hot pink or synthetic neon colors.` | `Avoid any bright hot pink or synthetic neon colors.` |
| `DIC3-G03` | `toneKeywords[2]` | `reflective` | `contemplative` |
| `DIC3-G04` | `inspirationSummary` | `The host supplied a phone photograph…` | `The host shared a phone photograph…` |
| `DIC3-G05` | `inspirationSummary` | `The host supplied the novel's jacket…` | `The host shared the novel's jacket…` |
| `DIC3-G06` | `toneKeywords[1]` | `generous` | `giving` |

No premise, palette, enum, name, supplied fact, inspiration, note, id or event type moved. The
`DIC3-M01` constraint keeps exactly its authority — bright hot pink and synthetic neon colours
remain prohibited, neither weakened nor strengthened.

**The frozen scan is clean on both corrected halves**, across all eight registered model-visible
surfaces. That ends author correction.

## Assembly

Mechanical, in the order precommitted at `9da8010`: `DIC3-G01`–`DIC3-G06`, then
`DIC3-M01`–`DIC3-M06`, top-level version `design_intent_sealed_challenge_v3`. Nothing was reordered
by quality, difficulty or content, and no author's prose was touched to make the halves sound
alike — every assembled case is deep-equal to the object its author supplied, which is checked
rather than asserted.

| | |
| --- | --- |
| path | `docs/model-evals/design-intent-sealed-challenge-v3.json` |
| sha256 | `1419a89093d95c50a49c4e8d413a97d9ca42e66c6dfd678cbab3c4c77ac869a3` |
| bytes | 37,871 |
| cases | 12 |

The **gated** whole-corpus contract passes: twelve batches, and three same-`eventType` pairs
against a required minimum of two — `birthday party` and `memorial gathering` from the ChatGPT
half's own pair plus the cross-half match, and `anniversary party` from the Gemini half. The frozen
leakage scan now covers the corpus at its canonical path with no edit to any benchmark tooling,
which is the arrangement the protocol freeze existed to produce.

**This is not a freeze.** The corpus is assembled and mechanically clean; the semantic
premise-overlap review and the system-aware fairness review still stand between it and a freeze,
and no result directory has been protected because no run exists.

## Semantic premise-overlap review: ACTION REQUIRED

Run before any system-aware review, by a reviewer restricted to the new corpus and the five prior
corpora, forbidden from opening the prompt, the schemas, `src/`, the results directories or the
plan — and told nothing about which cases anyone suspected. It confirmed reading only those six
files.

**No copying was found.** No reused venue names, no reused distinctive phrasing, no evidence either
author saw anything they should not have. The two prose hands are visibly different, which supports
the independence claim. What it found instead is convergence on the same unusual devices, which is
the thing a sealed corpus has to be free of.

Three findings were classed substantive:

| | cases | what is shared |
| --- | --- | --- |
| S1 | `DIC3-G02` ↔ `DIC3-M01` | **Inside the new corpus, across the two independent halves.** One brief written twice: a pale, daylit, botanical page in a glass-roofed venue, anchored by a required deep forest-green hex the host supplies as the one non-negotiable colour, `warm ivory` as the ground in both, a loud-finish exclusion, overlapping family and typography pools, foliage motifs. A system that solves one solves the other from the same lesson |
| S2 | `DIC3-M03` ↔ `DIR-04` (regression corpus) | The central device: a book-repair honoree rendered through bookbinding materials. `endpaper` appears in both motif lists and nowhere else in six corpora |
| S3 | `DIC3-M04` ↔ `DIV-12` (invalidated validation corpus, still readable) | The premise: a ceramics studio receiving the public around its kiln and wares, with the same earthy-matte clay-and-glaze material vocabulary |

Eight further similarities were classed noteworthy and five harmless; none of those is grounds for
action, and they are in the review for the record rather than for repair.

The reviewer's own summary of the split: the ChatGPT half is largely fresh, and the recall risk sits
in the Gemini half.

### RULING: the Gemini half is invalidated whole

`§G` applied exactly as frozen. `DIC3-M03` and `DIC3-M04` both need re-premising and S1's remedy
falls on `DIC3-M01`, so three of six in one half — not a narrow repair case. The precommitted rule
invalidates that half whole, and survivors are not cherry-picked. **No case was repaired
individually and no finding went back to that author.**

`gemini/INVALIDATION.md` is the record: what is invalidated (all four rounds, digests listed), why,
and what the replacement may and may not receive. The half is preserved exactly as authored — an
invalidated **half**, never a failed final corpus and never model evidence.

The replacement is a **new fresh Gemini session**, accepted whole or rejected whole, receiving only
the same frozen packet as the first commission. **The namespace does not move**: `DIC3-M01`–`M06`
identify six preregistered slots, not the prose that occupied them, and the protocol module stays
byte-identical to its freeze rather than minting a new namespace because a half was recommissioned.
The packet gains no avoid-list — not conservatories, not bookbinding, not ceramics, not anything
equivalent — because coaching a benchmark against cases the author must not know exist converts a
sealed challenge into a construction aimed at known answers.

The surviving **ChatGPT half is untouched and byte-identical**, and is not re-opened by any of this.

S1 deserves one note in fairness to both authors: two sessions that could not see each other's work
independently produced the same conservatory brief. That is not misconduct by either, and it is a
sharper version of the finding that ended the second candidate — convergence survives isolation.

### The failed assembly and the review that failed it, both preserved

| artifact | path | sha256 | bytes |
| --- | --- | --- | --- |
| the assembly the review read | `assembly/01-assembled-pre-semantic-review.json` | `1419a89093d95c50a49c4e8d413a97d9ca42e66c6dfd678cbab3c4c77ac869a3` | 37,871 |
| the review verbatim | `review/01-semantic-premise-overlap-review.md` | `650713803d9d12edc5544fabf1e4d07caa41a9e0ba3592670652b05119abca9a` | 14,846 |
| the invalidation record | `gemini/INVALIDATION.md` | `5eff8fe456e2668fe034ce736f0a9d7e425487c9dd5626df2325a255b6113331` | 5,124 |

The assembly was built at `docs/model-evals/design-intent-sealed-challenge-v3.json` to run the
gated contract and the frozen leakage scan against it, both of which passed, and was then **moved
here** rather than left in place or deleted: a corpus that has failed a pre-freeze gate must not sit
in the slot an eval set points at, because the slot's refusal-without-a-file guard is what stops it
being run, and deleting it would discard what the review actually read. The canonical path is absent
again, and a test holds that this exact content never occupies it — written to tolerate a
*different* corpus arriving, which is the hard-absence shape T19B had to undo.

**The system-aware fairness review has not been run, and remains unspent.** `§H` places it after
semantic overlap passes, and semantic overlap did not pass. A system-aware reviewer's reading of
these cases is the one thing that cannot be un-spent, and spending it on a corpus that is already
going to change would waste it.

## Replacement Gemini half — `DIC3-M01`…`DIC3-M06`, second commission

Received 2026-09-18 from a new fresh Gemini session, into the same six preregistered slots. The
half is accepted whole or rejected whole; nothing from the invalidated half is mixed in.

| file | role | sha256 | bytes | commit |
| --- | --- | --- | --- | --- |
| `gemini-replacement/01-original.json` | raw replacement attempt, provenance only | `d20654358767c8b87295f2b391eced9c861293b50d657572b75cdc39256ee718` | 13,213 | `e7248db` |
| `gemini-replacement/02-contract-corrected-candidate.json` | **the replacement candidate** | `68158c50f7538902e774429c01f8f7bc0ca72fe5195ba17f2073d49eec5cfd3b` | 12,945 | `5a522f9` |

### The contract correction was narrow, and that is verified rather than trusted

Comparing every leaf of `01` against `02`: seventeen leaves removed, eleven changed, none added.
Every one of them sits in the palette/tone contract mechanics:

- `paletteIntent.avoidColors` and `requiredColors` entries removed or rewritten, including hexes
  replaced by colour names;
- `toneExplicitlyConstrained` lowered from `true` to `false` on three cases;
- two `dominanceNotes` losing a literal hex they quoted;
- `suppliedFacts: null` removed as a key on two cases, which is a schema-shape fix — the contract
  has the field optional, and a literal `null` is not an object.

**Nothing protected moved.** Checked field by field across all six cases: every `id`, every
`eventType`, and every `creativeDirection`, `toneKeywords`, `visualMotifs`, `inspirationSummary`,
`textureDirection`, `typographyDirection`, `copyTone`, `hostConstraints`, `creativeGuidance`,
`tonalIntent`, `colorsExplicitlyConstrained` and all three compatibility enums are identical. No
premise, name, motif or inspiration concept moved. Two `notes` changed, both consequentially: one
had described "strict dark palette enforcement" for a required hex that the correction removed, the
other "light tonal constraints" for a lock the correction released.

One residual inconsistency, disclosed rather than repaired: `DIC3-M01`'s notes still say
"dark-leaning tonal consistency" while its `toneExplicitlyConstrained` is now `false`. Notes are
never sent to the model and never shown to the blind reviewer, so this changes no measurement — and
it is not the custodian's to rewrite.

### Mechanical result: one leakage collision, otherwise clean

Clean: the real structural contract with `gated: false`; the protocol composition check — exact
namespace, unique ids, **exactly one** same-`eventType` pair (`wedding`) across five distinct types;
no id collision with any corpus; no supplied-fact value surfaced into its own identity prose.

**One collision blocks it**, against two surfaces:

`DIC3-M01.identity.toneKeywords[3]` is the single word `tactile`. The EventIdentity prompt uses it
inside a worked "good" example, and the wire schema uses it in the `textureDirection` description
("tactile/visual texture character"). It is the same ordinary-vocabulary class as the seven that
forced the first correction round — a one-word tone keyword is not benchmark content and cannot leak
anything — and it blocks all the same, because the scanner is frozen and is not weakened to admit a
corpus. `creativeDirection` also contains the word, but only inside a longer string that matches
nothing; the standalone keyword is the whole collision.

That is a narrow leakage-collision repair, it needs authorial prose, and **no replacement prose is
written here**.

### Diagnostics for the semantic reviewer — recorded, not acted on, and never returned to the author

These are observations from the mechanical pass. Classifying them is the semantic reviewer's job,
not the custodian's, and none of them is a gate.

1. **`DIC3-M01` is a gallery opening for hand-thrown architectural ceramics at a venue named
   "Kiln & Vault Gallery".** The invalidated half's `DIC3-M04` was a ceramics studio at
   "Kiln & Clay Gallery" — and that case was invalidated for duplicating `DIV-12`'s ceramics
   premise. This session saw none of that: not the old half, not the review, not `DIV-12`, and no
   avoid-list. So a fresh Gemini session, told nothing, returned a ceramics-gallery premise with a
   near-identical venue name. That is exactly the question the ruling said including the invalidated
   half in review would answer.
2. **Three supplied-fact values reappear from the invalidated half**, redistributed across different
   cases: `October 24, 2026` and `Seattle, WA` (now in `DIC3-M01`) and `Portland, OR` (now in
   `DIC3-M06`). Individually ordinary; the pattern is what is worth weighing.
3. **Cross-corpus `toneKeywords` matches**, diagnostic only under the protocol: `contemplative`
   (also the surviving `DIC3-G03`, where ChatGPT chose it during *its* correction round), `sunlit`,
   `nocturnal`, `dignified`.

### Final leakage correction: one leaf, and the half is mechanically clean

| file | role | sha256 | bytes | commit |
| --- | --- | --- | --- | --- |
| `gemini-replacement/03-final-leakage-corrected-candidate.json` | **the accepted replacement half** | `381c9b8ac0d7ffc2cdfae7825a752c9a56a0127e5f29512b88da6caafcebc112` | 12,366 | `9d04927` |

Verified independently rather than accepted on report: comparing every leaf against `02`, **exactly
one** changed, at exactly `.cases[0].identity.toneKeywords[3]` — `tactile` becomes `sculptural` —
with no key added and none removed. Nothing else in any of the six cases moved.

**A provenance limitation, stated rather than glossed.** This file was reconstructed mechanically
from the previous candidate plus that one verified substitution, so its JSON whitespace and key
serialization are **not** asserted to be byte-identical to the author's own rendering. The parsed
content is the candidate, and the one-leaf property is what was checked. That is weaker than the
byte-for-byte preservation the other artifacts carry, and the record says so plainly rather than
letting a digest imply more than it proves.

Re-running the full frozen battery on `03`: the real structural contract with `gated: false`, the
protocol composition check — exact namespace, unique ids, **exactly one** same-`eventType` pair
(`wedding`) across five distinct types — no id collision with any corpus, no supplied-fact value
surfaced into its own identity prose, and the **frozen leakage scan clean across all eight
registered model-visible surfaces**. No scanner or frozen machinery was touched.

**Author correction is over.** No semantic-review finding goes back to that author from here.

### Status

Mechanically clean, so the independent semantic premise-overlap review runs next, comparing these
six against the surviving ChatGPT half, the invalidated first Gemini half, both earlier invalidated
sealed challenges and the earlier programme corpora. The ceramics/gallery recurrence noted above was
**not** pre-classified for that reviewer: the required corpora go in, and the reviewer decides
independently whether it is substantive. The system-aware fairness review remains unspent.

## The scan defect, recorded as debt rather than fixed

Seven of the eight collisions that forced the correction round carried no benchmark content. That
is a real defect in the scan, and it is **deliberately not fixed during v3**: the cases exist and
have been read, so changing the scan now would be changing the referee with this game's collisions
in view. `docs/model-evals/eval-incidents.md` holds the analysis and the requirements for the
prospective redesign, written before any result can shape them.
