# Creative-understanding run — mechanical results

**PRE-REGISTERED VALIDATION SET — frozen before remediation, but known to the implementation author; useful validation evidence, not the strongest evidence of generalization**

Corpus: `docs/model-evals/creative-understanding-holdout.json` (`creative_understanding_holdout_v1`, 12 cases)
Rubric: `docs/model-contracts.md §4.5`
Run started: 2026-09-15T07:39:00.055Z
Model: `gpt-5.6-sol`
Prompt version: `event_identity_v5`
Schema version: `event_identity_schema_v5`

## What this document does and does not establish

It establishes that no **outright failure** was committed: no invented fact, no dropped
fact, no excluded thing proposed, no forbidden named reference, no logistics question, no
creative question without its defer option and no boundary question offering one, no
boundary question asked alongside anything else, no breach of the ceiling.

It establishes nothing about whether the interpretation is any **good**. Intent
understanding, creative vocabulary and downstream usefulness are qualitative
(`§4.5` dimensions 1, 2, 7) and are judged from the blind artifact by a reviewer who has
not seen this file. **A clean mechanical run is necessary and never sufficient.**

## Summary

| | |
| --- | --- |
| Structured-output success | 12 / 12 |
| Valid on the first call | 12 / 12 |
| Repair retries consumed | 0 |
| Transient provider retries | 0 |
| Mechanical pass | 12 / 12 |
| Latency p50 | 20753 ms |
| Latency p95 | 38297 ms (nearest-rank; on a sample this small this is the maximum) |
| Latency min / max | 12885 / 38297 ms |
| Total input / output tokens | 91524 / 14078 |
| Reasoning tokens | 8314 |

## Clarification behaviour

| Case | Expected | Asked | Questions |
| --- | --- | --- | --- |
| HO-01 | no | 0 | — |
| HO-02 | no | 0 | — |
| HO-03 | expected | 0 | — |
| HO-04 | no | 0 | — |
| HO-05 | no | 0 | — |
| HO-06 | no | 0 | — |
| HO-07 | no | 0 | — |
| HO-08 | acceptable | 0 | — |
| HO-09 | acceptable | 0 | — |
| HO-10 | no | 0 | — |
| HO-11 | no | 0 | — |
| HO-12 | no | 0 | — |

## Per-case checks

### HO-01 — `40th for my wife. Absolutely no balloons — she'd hate that.`

Class: host-prohibition-vs-recommendation
Latency 27871 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 1 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 1 declared phrase(s) routed correctly |
| expectedFacts | pass | 1 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeDescriptionText="my wife" |
| hostNegationRespected | pass | negated term(s) [balloons] absent from the positive brief |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### HO-02 — `housewarming, we're completely obsessed with our cat Miso`

Class: literal-subject-matter, sentiment-not-suppressed
Latency 20075 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | n/a | the case declares no phrases |
| expectedFacts | pass | 1 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="housewarming" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### HO-03 — `30th anniversary party, we want it art deco`

Class: consequential-ambiguity, shorthand-multiple-worlds
Latency 20753 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | pass | 1 declared phrase(s) routed correctly |
| expectedFacts | pass | 1 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="30th anniversary party" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | advisory | corpus expects "expected"; model asked 0. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### HO-04 — `graduation party, something summery`

Class: bet-rather-than-ask
Latency 15062 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | pass | 1 declared phrase(s) routed correctly |
| expectedFacts | pass | 1 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="graduation party" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### HO-05 — `baby naming ceremony. honestly I have zero taste, just make it beautiful`

Class: creative-delegation, organizing-premise
Latency 26793 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | n/a | the case declares no phrases |
| expectedFacts | pass | 1 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="baby naming ceremony" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### HO-06 — `Tết dinner for my parents — we're Vietnamese, not Chinese, please`

Class: cultural-specificity, host-prohibition-vs-recommendation
Latency 25415 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 1 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 1 declared phrase(s) routed correctly |
| expectedFacts | pass | 2 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 2 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeDescriptionText="my parents"; eventType="Tết dinner" |
| hostNegationRespected | pass | negated term(s) [chinese] absent from the positive brief |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### HO-07 — `memorial gathering for my grandmother. she grew roses her whole life and we want it to feel like her.`

Class: sentiment-not-suppressed, literal-subject-matter, honoree-context-preserved
Latency 23149 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | n/a | the case declares no phrases |
| expectedFacts | pass | 2 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 2 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeDescriptionText="my grandmother"; eventType="memorial gathering" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### HO-08 — `50th birthday, western`

Class: shorthand-multiple-worlds
Latency 16581 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | pass | 1 declared phrase(s) routed correctly |
| expectedFacts | pass | 1 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="50th birthday" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | advisory | corpus expects "acceptable"; model asked 0. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### HO-09 — `a night at the opera`

Class: theme-is-not-event-type, organizing-premise
Latency 12885 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | n/a | the case declares no phrases |
| expectedFacts | pass | 1 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | no facts claimed |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | pass | no fact beyond those supplied |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | advisory | corpus expects "acceptable"; model asked 0. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### HO-10 — `party for my best friend, she's turning 25`

Class: organizing-premise, bet-rather-than-ask
Latency 18644 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | n/a | the case declares no phrases |
| expectedFacts | pass | 2 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 2 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeDescriptionText="my best friend"; eventType="party" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### HO-11 — `bat mitzvah for our daughter Noa. she wants it to feel grown up, nothing babyish.`

Class: honoree-context-preserved, host-prohibition-vs-recommendation
Latency 38297 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 1 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 2 declared phrase(s) routed correctly |
| expectedFacts | pass | 3 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 3 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeName="Noa"; honoreeDescriptionText="our daughter"; eventType="bat mitzvah" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### HO-12 — `Retirement dinner for my boss, Thursday March 12 at Ember & Oak. No black — he says it looks like a funeral.`

Class: verbatim-fact-discipline, explicit-colour-exclusion, host-prohibition-vs-recommendation, honoree-context-preserved
Latency 25656 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 1 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 1 declared phrase(s) routed correctly |
| expectedFacts | pass | 8 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 4 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeDescriptionText="my boss"; eventType="Retirement dinner"; dateText="Thursday March 12"; venueText="Ember & Oak" |
| hostNegationRespected | pass | negated term(s) [black] absent from the positive brief |
| exclusionSelfConsistency | pass | 1 exclusion(s), none contradicted |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

