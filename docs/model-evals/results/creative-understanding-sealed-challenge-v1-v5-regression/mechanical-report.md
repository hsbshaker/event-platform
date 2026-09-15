# Creative-understanding run — mechanical results

**KNOWN / SPENT CHALLENGE RE-RUN — the v1 sealed cases against v5, as regression and diagnostic evidence only. These cases were known while v5 was written. NOT fresh generalization evidence**

Corpus: `docs/model-evals/creative-understanding-sealed-challenge.json` (`sealed_challenge_v1`, 12 cases)
Rubric: `docs/model-contracts.md §4.5`
Run started: 2026-09-15T07:20:56.580Z
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
| Latency p50 | 25708 ms |
| Latency p95 | 45076 ms (nearest-rank; on a sample this small this is the maximum) |
| Latency min / max | 15814 / 45076 ms |
| Total input / output tokens | 93027 / 14069 |
| Reasoning tokens | 8002 |

## Clarification behaviour

| Case | Expected | Asked | Questions |
| --- | --- | --- | --- |
| SC-01 | no | 0 | — |
| SC-02 | no | 0 | — |
| SC-03 | no | 0 | — |
| SC-04 | no | 0 | — |
| SC-05 | acceptable | 0 | — |
| SC-06 | expected | 1 | What has your sister agreed may be shared on the invitation about why everyone is gathering? |
| SC-07 | acceptable | 0 | — |
| SC-08 | no | 0 | — |
| SC-09 | no | 0 | — |
| SC-10 | no | 0 | — |
| SC-11 | likely | 0 | — |
| SC-12 | acceptable | 0 | — |

## Per-case checks

### SC-01 — `Milo is turning 7! He's really into beetles and moths, so please use actual insects on the invite, just no cartoon faces. Saturday 18 May, 2–4 pm, in the Willow Room.`

Class: literal_subject_matter, narrow_exclusion, exact_logistical_facts
Latency 45076 ms · first-call valid: false · repair retries: 1 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 2 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 2 declared phrase(s) routed correctly |
| expectedFacts | pass | 4 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 4 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeName="Milo"; dateText="Saturday 18 May"; timeText="2–4 pm"; venueText="the Willow Room" |
| hostNegationRespected | pass | negated term(s) [cartoon] absent from the positive brief |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC-02 — `My mum's retiring after 32 years driving the number 8 bus. The whole depot calls her 'Captain', and she thinks that nickname is hilarious. I'd love the party to feel proud and affectionate, with a bit of her cheek.`

Class: 
Latency 35628 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | n/a | the case declares no phrases |
| expectedFacts | pass | 2 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 2 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeDescriptionText="My mum"; eventType="party" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidNameEchoes | advisory | a word from a forbidden name appears; translation or reproduction is a judgement: "Captain" (from: Presenting Captain as her given name.) |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC-03 — `Having a few neighbors over for dinner. I don't have a theme in mind; you pick something and give the evening a personality.`

Class: 
Latency 19640 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | n/a | the case declares no phrases |
| expectedFacts | n/a | the case asserts no facts |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="dinner" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC-04 — `Need an idea for the welcome lunch at work next Friday. Nine new hires, mostly meeting each other for the first time.`

Class: 
Latency 20652 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | n/a | the case declares no phrases |
| expectedFacts | n/a | the case asserts no facts |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 4 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeDescriptionText="Nine new hires"; eventType="welcome lunch"; dateText="next Friday"; venueText="at work" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC-05 — `My 40th needs an old-school club feel. Make it a proper night.`

Class: 
Latency 27115 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | pass | 1 declared phrase(s) routed correctly |
| expectedFacts | n/a | the case asserts no facts |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="40th" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | advisory | corpus expects "acceptable"; model asked 0. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC-06 — `Trying to get some friends together for my sister before treatment starts. A few don't know what's going on. I'd like the invite to explain why we're doing this, but she's pretty private.`

Class: 
Latency 39494 ms · first-call valid: false · repair retries: 1 · transient retries: 0

**Mechanical: FAIL**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | fail | "The invite should explain why we're doing this." is not something the host said — it is the model's own recommendation |
| hostPhraseRouting | n/a | the case declares no phrases |
| expectedFacts | n/a | the case asserts no facts |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeDescriptionText="my sister" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| clarificationCeiling | pass | 1 question(s) |
| clarificationFlagAgrees | pass | needed=true, 1 |
| clarificationExpectation | advisory | corpus expects "expected"; model asked 1. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | pass | no question asks for an operational field |
| clarificationOffersDefer | pass | creative questions offer exactly one defer; boundary questions offer none |
| clarificationRouteExclusivity | pass | one boundary question, asked alone |

### SC-07 — `We're having a wedding welcome dinner. Our families are Punjabi and Tamil, and we'd like both sides to feel at home in the design. No religious symbols please.`

Class: 
Latency 24002 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 1 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 1 declared phrase(s) routed correctly |
| expectedFacts | n/a | the case asserts no facts |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="wedding welcome dinner" |
| hostNegationRespected | pass | negated term(s) [religious] absent from the positive brief |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| mustAvoidTasteJudgements | advisory | not mechanically checkable, for the qualitative reviewer: Presenting an inferred religion, nationality, or family tradition as a fact supplied by the host. [fact discipline — see factsGrounded] |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | advisory | corpus expects "acceptable"; model asked 0. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC-08 — `Tenth anniversary gala for our drama society. We're thinking swags, gold lettering, ridiculous grandeur. Everyone here loves making an entrance.`

Class: ornate_direction, playful_formality
Latency 27499 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | pass | 1 declared phrase(s) routed correctly |
| expectedFacts | n/a | the case asserts no facts |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 2 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: honoreeDescriptionText="our drama society"; eventType="Tenth anniversary gala" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC-09 — `Housewarming at last! My daughter and I have spent two years moving between short-term rentals, and now we have somewhere we can settle into. I want it to feel like a real celebration, even with just a few people.`

Class: 
Latency 26713 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | pass | 1 declared phrase(s) routed correctly |
| expectedFacts | n/a | the case asserts no facts |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="Housewarming" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC-10 — `Launch party for our ceramics studio. Our work is loud and a little ugly in a way we love—think wonky fruit bowls and clashing glazes. The invitation can be funny, but no jokes about us being amateurs.`

Class: unconventional_aesthetic_intent, humour_with_a_specific_boundary
Latency 25708 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 1 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 2 declared phrase(s) routed correctly |
| expectedFacts | n/a | the case asserts no facts |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="Launch party" |
| hostNegationRespected | pass | negated term(s) [jokes] absent from the positive brief |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | pass | asked nothing, as required |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC-11 — `It's black tie with a space-age feel. Wednesday 6 November, 7.15 for 7.45, at the Glasshouse.`

Class: 
Latency 21128 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | all 1 host constraint(s) quotable from the prompt |
| hostPhraseRouting | pass | 2 declared phrase(s) routed correctly |
| expectedFacts | pass | 4 assertion(s) hold |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 3 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: dateText="Wednesday 6 November"; timeText="7.15 for 7.45"; venueText="the Glasshouse" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoidNamedThings | pass | no forbidden named thing appears in the identity |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | advisory | corpus expects "likely"; model asked 0. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

### SC-12 — `We're making invitations for a neighborhood garden tour. I keep coming back to a storybook feel.`

Class: 
Latency 15814 ms · first-call valid: true · repair retries: 0 · transient retries: 0

**Mechanical: pass**

| Check | Status | Detail |
| --- | --- | --- |
| hostConstraintsGrounded | pass | no host constraint claimed |
| hostPhraseRouting | pass | 1 declared phrase(s) routed correctly |
| expectedFacts | n/a | the case asserts no facts |
| factsPreserved | n/a | the case supplies no facts |
| factsGrounded | pass | all 1 claimed fact(s) quotable from the prompt |
| factFieldMapping | n/a | the case supplies no facts |
| surplusFacts | advisory | carried but not listed by the case: eventType="neighborhood garden tour" |
| hostNegationRespected | n/a | no negation in the prompt |
| exclusionSelfConsistency | n/a | no colors excluded |
| mustAvoid | n/a | the case forbids nothing explicitly |
| clarificationCeiling | pass | 0 question(s) |
| clarificationFlagAgrees | pass | needed=false, 0 |
| clarificationExpectation | advisory | corpus expects "acceptable"; model asked 0. Whether the question earned its place is a qualitative judgement |
| clarificationNotLogistics | n/a | no questions |
| clarificationOffersDefer | n/a | no questions |
| clarificationRouteExclusivity | n/a | no questions |

