# Creative-understanding run — mechanical results

Corpus: `docs/model-evals/creative-understanding.json` (`creative_understanding_v1`, 14 cases)
Rubric: `docs/model-contracts.md §4.5`
Run started: 2026-09-14T14:02:55.333Z
Model: `gpt-5.6-sol`
Prompt version: `event_identity_v3`
Schema version: `event_identity_schema_v3`

## What this document does and does not establish

It establishes that no **outright failure** was committed: no invented fact, no dropped
fact, no excluded thing proposed, no forbidden named reference, no logistics question, no
question without a defer option, no breach of the ceiling.

It establishes nothing about whether the interpretation is any **good**. Intent
understanding, creative vocabulary and downstream usefulness are qualitative
(`§4.5` dimensions 1, 2, 7) and are judged from the blind artifact by a reviewer who has
not seen this file. **A clean mechanical run is necessary and never sufficient.**

## Summary

| | |
| --- | --- |
| Structured-output success | 14 / 14 |
| Valid on the first call | 13 / 14 |
| Repair retries consumed | 1 |
| Transient provider retries | 0 |
| Mechanical pass | 13 / 14 |
| Latency p50 | 23879 ms |
| Latency p95 | 46372 ms (nearest-rank; on a sample this small this is the maximum) |
| Latency min / max | 16634 / 46372 ms |
| Total input / output tokens | 65457 / 11134 |
| Reasoning tokens | 4695 |

## Clarification behaviour

| Case | Expected | Asked | Questions |
| --- | --- | --- | --- |
| CU-01 | likely | 0 | — |
| CU-02 | no | 0 | — |
| CU-03 | no | 0 | — |
| CU-04 | acceptable | 0 | — |
| CU-05 | no | 0 | — |
| CU-06 | no | 0 | — |
| CU-07 | acceptable | 0 | — |
| CU-08 | no | 0 | — |
| CU-09 | likely | 0 | — |
| CU-10 | no | 0 | — |
| CU-11 | no | 0 | — |
| CU-12 | no | 0 | — |
| CU-13 | no | 0 | — |
| CU-14 | expected | 0 | — |

## Per-case checks

### CU-01 — `Ralph Lauren but baby`

Class: taste-heavy, genuinely-ambiguous
Latency 26453 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | no facts claimed |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | pass | no fact beyond those supplied |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: copied campaign imagery |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | advisory | corpus expects "likely"; model asked 0. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |

### CU-02 — `Ralph Lauren baby shower for a boy, classy not cheesy`

Class: taste-heavy, negative-constraint
Latency 31793 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| factsPreserved | pass | all 1 supplied fact(s) carried verbatim |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | advisory | eventType -> eventType |
| surplusFacts | pass | no fact beyond those supplied |
| hostNegationRespected | pass | negated term(s) [cheesy] absent from the positive brief |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: cartoon or novelty treatments; primary-blue nursery clichés |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |

### CU-03 — `lemons in Italy but classy`

Class: taste-heavy, negative-constraint
Latency 23215 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | no facts claimed |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | pass | no fact beyond those supplied |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: cartoon citrus; novelty or kitsch treatments; inferring Positano, the Amalfi coast or any named place as a fact [fact discipline — see factsGrounded]; inferring the event is outdoors [fact discipline — see factsGrounded] |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |

### CU-04 — `Winnie the Pooh but not corny`

Class: taste-heavy, negative-constraint, genuinely-ambiguous
Latency 25528 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | no facts claimed |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | pass | no fact beyond those supplied |
| hostNegationRespected | pass | negated term(s) [corny] absent from the positive brief |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: primary red and yellow cartoon palette |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | advisory | corpus expects "acceptable"; model asked 0. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |

### CU-05 — `girly but no pink`

Class: negative-constraint
Latency 46372 ms · first-call valid: false · repair retries: 1 · transient retries: 0

**Mechanical: FAIL**

| Check | Status | Detail |
| --- | --- | --- |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | no facts claimed |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | pass | no fact beyond those supplied |
| hostNegationRespected | fail | host negated [pink] but the positive brief still proposes it |
| exclusionSelfConsistency | pass | 1 exclusion(s), none contradicted |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: pink in any role; blush, rose or dusty-pink as a workaround |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |

### CU-06 — `old money garden party`

Class: taste-heavy
Latency 26536 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| factsPreserved | pass | all 1 supplied fact(s) carried verbatim |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | advisory | eventType -> eventType |
| surplusFacts | pass | no fact beyond those supplied |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: overt luxury signalling; gold-on-black 'elegance' clichés; inferring a venue [fact discipline — see factsGrounded] |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |

### CU-07 — `modern Indian baby shower but subtle`

Class: taste-heavy, negative-constraint
Latency 22311 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| factsPreserved | pass | all 1 supplied fact(s) carried verbatim |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | advisory | eventType -> eventType |
| surplusFacts | pass | no fact beyond those supplied |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: saturated wedding-palette defaults; generic mandala or paisley wallpaper; religious iconography the host did not ask for |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | advisory | corpus expects "acceptable"; model asked 0. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |

### CU-08 — `luxury safari`

Class: taste-heavy
Latency 30077 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="luxury safari" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: cartoon animals; zoo or jungle-nursery treatments; animal-print maximalism |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |

### CU-09 — `cute but not childish`

Class: negative-constraint, genuinely-ambiguous
Latency 18329 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | no facts claimed |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | pass | no fact beyond those supplied |
| hostNegationRespected | pass | negated term(s) [childish] absent from the positive brief |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: balloons, clouds, rattles and similar baby-graphic defaults; script fonts as the sole 'cute' signal |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | advisory | corpus expects "likely"; model asked 0. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |

### CU-10 — `something unique, idk surprise me`

Class: open
Latency 23879 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | no facts claimed |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | pass | no fact beyond those supplied |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: asking the host to supply the taste they just delegated; defaulting to a generic house style |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |

### CU-11 — `Baby shower for our son on Saturday, December 19 2026 at 1pm, The Lodge at Hanson Park in Aldie, Virginia. Navy, cream and forest green, preppy and warm, a bit equestrian, not cheesy.`

Class: clear, fact-bearing
Latency 24575 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| factsPreserved | pass | all 5 supplied fact(s) carried verbatim |
| factsGrounded | pass | all 5 claimed fact(s) quotable from the prompt |
| factFieldMapping | advisory | eventType -> eventType; date -> dateText; time -> timeText; venue -> venueText; location -> localityText |
| surplusFacts | pass | no fact beyond those supplied |
| hostNegationRespected | pass | negated term(s) [cheesy] absent from the positive brief |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: asking for any supplied field; altering or paraphrasing a supplied fact |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |

### CU-12 — `bridal shower, tea party vibes, at my mum's house in June`

Class: fact-bearing, clear
Latency 16634 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| factsPreserved | pass | all 3 supplied fact(s) carried verbatim |
| factsGrounded | pass | all 3 claimed fact(s) quotable from the prompt |
| factFieldMapping | advisory | eventType -> eventType; venueHint -> venueText; monthHint -> dateText |
| surplusFacts | pass | no fact beyond those supplied |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidNameEchoes | advisory | a word from a forbidden name appears; translation or reproduction is a judgement: "June" (from: inventing a date from 'June') |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: inventing an address from 'my mum's house'; inferring a dress code [fact discipline — see factsGrounded] |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |

### CU-13 — `60th birthday for my dad, he likes jazz and old maps`

Class: taste-heavy, fact-bearing
Latency 22276 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| factsPreserved | pass | all 1 supplied fact(s) carried verbatim |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | advisory | eventType -> eventType |
| surplusFacts | pass | no fact beyond those supplied |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: generic milestone-birthday confetti; literal saxophone or globe clip-art |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |

### CU-14 — `engagement party, beachy`

Class: genuinely-ambiguous
Latency 22572 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| factsPreserved | pass | all 1 supplied fact(s) carried verbatim |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | advisory | eventType -> eventType |
| surplusFacts | pass | no fact beyond those supplied |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: inferring a beach as the venue [fact discipline — see factsGrounded]; asking where or when the event is |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | advisory | corpus expects "expected"; model asked 0. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |

