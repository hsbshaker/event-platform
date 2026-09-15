# Creative-understanding run — mechanical results

**FRESH SEALED CHALLENGE (sealed_challenge_v2) — independently authored after the v5 implementation and harness froze, and unseen while they were written; the fresh generalization evidence for v5**

Corpus: `docs/model-evals/creative-understanding-sealed-challenge-v2.json` (`creative_understanding_sealed_challenge_v2`, 12 cases)
Rubric: `docs/model-contracts.md §4.5`
Run started: 2026-09-15T10:12:45.772Z
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
| Valid on the first call | 10 / 12 |
| Repair retries consumed | 2 |
| Transient provider retries | 0 |
| Mechanical pass | 11 / 12 |
| Latency p50 | 27514 ms |
| Latency p95 | 54177 ms (nearest-rank; on a sample this small this is the maximum) |
| Latency min / max | 22295 / 54177 ms |
| Total input / output tokens | 93413 / 15574 |
| Reasoning tokens | 9152 |

## Clarification behaviour

| Case | Expected | Asked | Questions |
| --- | --- | --- | --- |
| SC2-01 | no | 0 | — |
| SC2-02 | acceptable | 0 | — |
| SC2-03 | acceptable | 0 | — |
| SC2-04 | no | 0 | — |
| SC2-05 | no | 0 | — |
| SC2-06 | no | 0 | — |
| SC2-07 | no | 0 | — |
| SC2-08 | no | 0 | — |
| SC2-09 | no | 0 | — |
| SC2-10 | no | 0 | — |
| SC2-11 | likely | 1 | Which style of play should the invitation encourage most strongly? |
| SC2-12 | expected | 1 | What has been settled with Denise about revealing and featuring her sister on the invitation? |

## Per-case checks

### SC2-01 — `Soup night with the neighbors. That's all I've got.`

Class: 
Latency 23780 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | n/a | the case declares no phrases |
| expectedFacts | pass | 1 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="Soup night" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC2-02 — `My 40th birthday party. I want to feel like we've wandered into another world, somewhere glowing and strange. Still a good party, with room for dancing.`

Class: 
Latency 27514 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 1 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 2 declared phrase(s) routed correctly |
| expectedFacts | pass | 1 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="40th birthday party" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | advisory | corpus expects "acceptable"; model asked 0. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC2-03 — `We're doing a fundraiser for the community radio station. I keep saying 'old school'—that's about as far as I've got. Some of the presenters are coming out of retirement for it.`

Class: 
Latency 27343 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | pass | 1 declared phrase(s) routed correctly |
| expectedFacts | pass | 1 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="fundraiser" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | advisory | corpus expects "acceptable"; model asked 0. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC2-04 — `Leïla and Tomás here—we're hosting our civil partnership party: 07/08/2027, 18:30–late, The Old Pump Room, 6B Quay Lane, St Ives. RSVP by 30/06/2027. Keep 07/08/2027 unchanged; don't interpret it, reformat it or spell it out. No rings or 'Mr & Mrs'. Give it the swagger of an old seaside dance poster.`

Class: 
Latency 33260 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: FAIL**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | fail | "No rings." is not something the host said — it is the model's own recommendation; "No 'Mr & Mrs'." is not something the host said — it is the model's own recommendation |
| hostPhraseRouting | fail | "No rings or 'Mr & Mrs'" is a host constraint and was not carried as one |
| expectedFacts | pass | 8 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 8 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: hostNames="Leïla and Tomás"; eventType="civil partnership party"; dateText="07/08/2027"; timeText="18:30–late"; venueText="The Old Pump Room"; addressText="6B Quay Lane"; localityText="St Ives"; rsvpDeadlineText="30/06/2027" |
| hostNegationRespected | pass | negated term(s) [rings] absent from the positive brief |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC2-05 — `A housewarming for my cousin Beatriz, who goes by Bia. She's finally got a balcony big enough for two chairs and is ridiculously proud of her tomato plants. Tiny urban jungle energy. No moving boxes or key clip art, please.`

Class: 
Latency 23531 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 1 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 2 declared phrase(s) routed correctly |
| expectedFacts | pass | 3 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 3 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeName="Bia"; honoreeDescriptionText="my cousin"; eventType="housewarming" |
| hostNegationRespected | pass | negated term(s) [moving] absent from the positive brief |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC2-06 — `We've landed our first export order at the tile workshop, so we're throwing a staff lunch. I spend all day approving swatches and don't want to do that for this. You pick the look. It should feel like we actually made something worth celebrating.`

Class: 
Latency 24992 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | n/a | the case declares no phrases |
| expectedFacts | pass | 2 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="staff lunch" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC2-07 — `I'm organizing a pre-Carnaval costume-making afternoon for our samba group. Take your cue from our old parade banner: hand-painted sun faces, orange fringe and little mirrored discs. Make it big, bright and gloriously busy. Use 'Bora brilhar!' as the heading. No tasteful beige version, please.`

Class: 
Latency 33730 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 2 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 4 declared phrase(s) routed correctly |
| expectedFacts | pass | 1 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 2 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeDescriptionText="our samba group"; eventType="pre-Carnaval costume-making afternoon" |
| hostNegationRespected | pass | negated term(s) [tasteful] absent from the positive brief |
| exclusionSelfConsistency | pass | 1 exclusion(s), none contradicted |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC2-08 — `Birthday drinks for my friend Miro. His chosen theme is municipal drainage. He works in a café; he just really loves this stuff. I want actual drains, culverts and runoff arrows in it. Please don't turn it into a tasteful water theme.`

Class: 
Latency 22295 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 2 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 3 declared phrase(s) routed correctly |
| expectedFacts | pass | 3 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 3 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeName="Miro"; honoreeDescriptionText="my friend"; eventType="Birthday drinks" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC2-09 — `A memorial tea for my uncle Arun. He collected bus timetables and always had a packet of ginger biscuits in his coat. Warm and ordinary, like sitting at his kitchen table. No halos, clouds or 'gone too soon'. People should be able to laugh about him.`

Class: 
Latency 34567 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 1 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 2 declared phrase(s) routed correctly |
| expectedFacts | pass | 3 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 3 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeName="Arun"; honoreeDescriptionText="my uncle"; eventType="memorial tea" |
| hostNegationRespected | pass | negated term(s) [halos] absent from the positive brief |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC2-10 — `We're holding a key handover for the first residents of our housing co-op. It's taken eleven years to get here. The children are helping hand over the keys. Make it feel ceremonial and almost regal—we've earned a bit of pomp. Please don't make it look like a property launch.`

Class: 
Latency 32505 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 1 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 2 declared phrase(s) routed correctly |
| expectedFacts | pass | 1 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 2 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeDescriptionText="the first residents of our housing co-op"; eventType="key handover" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC2-11 — `We're doing a mystery dinner for friends. I keep going between ridiculously glamorous suspects making a scene over dinner and those icy thrillers where a glance across the table does all the work. I love both. I want the invitation to set the tone for how everyone plays along.`

Class: 
Latency 35178 ms · first-call valid: false · repair retries: 1 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | pass | 2 declared phrase(s) routed correctly |
| expectedFacts | pass | 1 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="mystery dinner" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 1 question(s) |
| clarificationFlagAgrees | pass | needed=true, 1 |
| clarificationExpectation | advisory | corpus expects "likely"; model asked 1. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | pass | no question asks for an operational field |
| clarificationOffersDefer | pass | creative questions offer exactly one defer; boundary questions offer none |
| clarificationRouteExclusivity | pass | creative only |

### SC2-12 — `I'm organizing a retirement dinner for my mum, Denise. Her sister is coming; they haven't spoken in years. I want the invitation built around 'together again', with the two of them pictured side by side. My aunt is keen. Mum doesn't know she's coming, and I honestly don't know how she'll take it.`

Class: 
Latency 54177 ms · first-call valid: false · repair retries: 1 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 2 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 1 declared phrase(s) routed correctly |
| expectedFacts | pass | 3 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 3 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeName="Denise"; honoreeDescriptionText="my mum"; eventType="retirement dinner" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 1 question(s) |
| clarificationFlagAgrees | pass | needed=true, 1 |
| clarificationExpectation | advisory | corpus expects "expected"; model asked 1. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | pass | no question asks for an operational field |
| clarificationOffersDefer | pass | creative questions offer exactly one defer; boundary questions offer none |
| clarificationRouteExclusivity | pass | one boundary question, asked alone |

