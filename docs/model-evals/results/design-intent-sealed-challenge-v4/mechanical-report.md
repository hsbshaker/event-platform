# DesignIntent — mechanical report

Run started: `2026-09-18T21:36:06.423Z` · corpus `design_intent_sealed_challenge_v4` · set `designIntentChallenge` · planner `planner_v2`

Evidence class: **DIAGNOSTIC / STRESS-TEST CHALLENGE (4C DesignIntent) — carried forward under explicit operator waiver after semantic-overlap review identified four ACTION REQUIRED cases (DIC4-P01, DIC4-P03, DIC4-Q02, DIC4-Q05). Authored after the T21 implementation and this harness froze, by authors who saw neither the prompt nor prior outputs nor known failures; mechanically validated, leakage-clean and Stage-2-faithfulness-clean. NOT pristine sealed generalization evidence and NOT evidence that every preregistered corpus-integrity gate passed: the semantic-overlap gate was waived and system-aware fairness was never spent. See docs/model-evals/provenance/design-intent-sealed-challenge-v4/OPERATOR-WAIVER.md. One run, then spent**

- A mechanical pass is necessary and never sufficient: three outputs can satisfy every distance metric and still be one idea.
- `advisory` and `n/a` are never folded into the pass count, in either half.

## Per batch

| Batch | Case | Mechanical | Checks |
| --- | --- | --- | --- |
| Batch 1 | DIC4-P01 | FAIL | schemaValid:pass, firstCallSchemaValid:advisory, retryCounts:advisory, assignmentConformance:pass, paletteSeparation:fail, typographyPairingDistinct:pass, compositionVectorDistinct:fail, motifOverlap:fail, tokenAllotmentRespected:n/a, hostConstraintColoursHonoured:n/a, hostConstraintsForReviewer:advisory, creativeGuidanceStaysAdvisory:n/a, noSuppliedFactSurfaced:n/a, presentationPresent:pass |
| Batch 2 | DIC4-P02 | FAIL | schemaValid:pass, firstCallSchemaValid:advisory, retryCounts:advisory, assignmentConformance:pass, paletteSeparation:fail, typographyPairingDistinct:fail, compositionVectorDistinct:fail, motifOverlap:fail, tokenAllotmentRespected:n/a, hostConstraintColoursHonoured:n/a, hostConstraintsForReviewer:n/a, creativeGuidanceStaysAdvisory:n/a, noSuppliedFactSurfaced:n/a, presentationPresent:pass |
| Batch 3 | DIC4-P03 | FAIL | schemaValid:pass, firstCallSchemaValid:advisory, retryCounts:advisory, assignmentConformance:pass, paletteSeparation:fail, typographyPairingDistinct:pass, compositionVectorDistinct:fail, motifOverlap:fail, tokenAllotmentRespected:n/a, hostConstraintColoursHonoured:n/a, hostConstraintsForReviewer:n/a, creativeGuidanceStaysAdvisory:n/a, noSuppliedFactSurfaced:n/a, presentationPresent:pass |
| Batch 4 | DIC4-P04 | FAIL | schemaValid:pass, firstCallSchemaValid:advisory, retryCounts:advisory, assignmentConformance:pass, paletteSeparation:fail, typographyPairingDistinct:pass, compositionVectorDistinct:fail, motifOverlap:fail, tokenAllotmentRespected:n/a, hostConstraintColoursHonoured:n/a, hostConstraintsForReviewer:n/a, creativeGuidanceStaysAdvisory:n/a, noSuppliedFactSurfaced:n/a, presentationPresent:pass |
| Batch 5 | DIC4-P05 | FAIL | schemaValid:pass, firstCallSchemaValid:advisory, retryCounts:advisory, assignmentConformance:pass, paletteSeparation:fail, typographyPairingDistinct:pass, compositionVectorDistinct:fail, motifOverlap:pass, tokenAllotmentRespected:n/a, hostConstraintColoursHonoured:n/a, hostConstraintsForReviewer:n/a, creativeGuidanceStaysAdvisory:n/a, noSuppliedFactSurfaced:n/a, presentationPresent:pass |
| Batch 6 | DIC4-P06 | FAIL | schemaValid:pass, firstCallSchemaValid:advisory, retryCounts:advisory, assignmentConformance:pass, paletteSeparation:fail, typographyPairingDistinct:fail, compositionVectorDistinct:fail, motifOverlap:fail, tokenAllotmentRespected:n/a, hostConstraintColoursHonoured:n/a, hostConstraintsForReviewer:advisory, creativeGuidanceStaysAdvisory:n/a, noSuppliedFactSurfaced:n/a, presentationPresent:pass |
| Batch 7 | DIC4-Q01 | FAIL | schemaValid:pass, firstCallSchemaValid:advisory, retryCounts:advisory, assignmentConformance:pass, paletteSeparation:fail, typographyPairingDistinct:pass, compositionVectorDistinct:fail, motifOverlap:fail, tokenAllotmentRespected:n/a, hostConstraintColoursHonoured:n/a, hostConstraintsForReviewer:advisory, creativeGuidanceStaysAdvisory:n/a, noSuppliedFactSurfaced:n/a, presentationPresent:pass |
| Batch 8 | DIC4-Q02 | FAIL | schemaValid:pass, firstCallSchemaValid:advisory, retryCounts:advisory, assignmentConformance:pass, paletteSeparation:fail, typographyPairingDistinct:pass, compositionVectorDistinct:fail, motifOverlap:fail, tokenAllotmentRespected:n/a, hostConstraintColoursHonoured:n/a, hostConstraintsForReviewer:n/a, creativeGuidanceStaysAdvisory:n/a, noSuppliedFactSurfaced:n/a, presentationPresent:pass |
| Batch 9 | DIC4-Q03 | FAIL | schemaValid:pass, firstCallSchemaValid:advisory, retryCounts:advisory, assignmentConformance:pass, paletteSeparation:fail, typographyPairingDistinct:pass, compositionVectorDistinct:fail, motifOverlap:fail, tokenAllotmentRespected:n/a, hostConstraintColoursHonoured:n/a, hostConstraintsForReviewer:advisory, creativeGuidanceStaysAdvisory:n/a, noSuppliedFactSurfaced:n/a, presentationPresent:pass |
| Batch 10 | DIC4-Q04 | FAIL | schemaValid:pass, firstCallSchemaValid:advisory, retryCounts:advisory, assignmentConformance:pass, paletteSeparation:fail, typographyPairingDistinct:pass, compositionVectorDistinct:fail, motifOverlap:fail, tokenAllotmentRespected:n/a, hostConstraintColoursHonoured:n/a, hostConstraintsForReviewer:n/a, creativeGuidanceStaysAdvisory:n/a, noSuppliedFactSurfaced:n/a, presentationPresent:pass |
| Batch 11 | DIC4-Q05 | FAIL | schemaValid:pass, firstCallSchemaValid:advisory, retryCounts:advisory, assignmentConformance:pass, paletteSeparation:fail, typographyPairingDistinct:fail, compositionVectorDistinct:fail, motifOverlap:fail, tokenAllotmentRespected:n/a, hostConstraintColoursHonoured:n/a, hostConstraintsForReviewer:n/a, creativeGuidanceStaysAdvisory:n/a, noSuppliedFactSurfaced:n/a, presentationPresent:pass |
| Batch 12 | DIC4-Q06 | FAIL | schemaValid:pass, firstCallSchemaValid:advisory, retryCounts:advisory, assignmentConformance:pass, paletteSeparation:fail, typographyPairingDistinct:fail, compositionVectorDistinct:fail, motifOverlap:fail, tokenAllotmentRespected:n/a, hostConstraintColoursHonoured:n/a, hostConstraintsForReviewer:n/a, creativeGuidanceStaysAdvisory:n/a, noSuppliedFactSurfaced:n/a, presentationPresent:pass |

## Detail

### Batch 1 — `DIC4-P01`

- **schemaValid** · pass — all three responses satisfy the narrowed contract and its semantic invariants
- **firstCallSchemaValid** · advisory — 3 of 3 responses parsed strictly on the first call. Advisory, never gating: `docs/model-contracts.md §8` allows one repair retry, so a repaired response is a legal production outcome and failing the set on it would measure the retry policy rather than the model.
- **retryCounts** · advisory — 0 repair retry(ies) and 0 transient retry(ies) across the batch
- **assignmentConformance** · pass — each sibling returned the family, tone, hierarchy and typography category it was assigned
- **paletteSeparation** · fail — pairwise ΔE*ab (mean nearest-neighbour): 0↔1=3.5, 0↔2=3.4, 1↔2=5.5; dominants (all colours) 0↔1=27.5, 0↔2=3, 1↔2=30.1; floor 12
- **typographyPairingDistinct** · pass — three distinct pairings: oldstyle_garamond_worksans, soft_fraunces_manrope, transitional_instrument_manrope
- **compositionVectorDistinct** · fail — differing composition dimensions, of the 4 the model chooses (asymmetry, rhythm, sectionContrast, ornament; hierarchy is assigned and is checked by assignmentConformance): 0↔1=0/4, 0↔2=0/4, 1↔2=0/4; floor 2
- **motifOverlap** · fail — Jaccard overlap: 0↔1=1, 0↔2=1, 1↔2=1; must be strictly below 0.5, so two three-motif sets may share at most one
- **tokenAllotmentRespected** · n/a — not decidable at this layer: a DesignIntent carries no attractive token, because the allotment constrains the composition call (`spec.md §7.7`) and 4C runs no composition call. The plan the three calls were made under was checked anyway, and it holds: each attractive token is within its per-batch cap, and every sibling accounts for every token. That is a fact about the planner, proven over thousands of seeded plans in `src/lib/generation/planner.test.ts`, and it is reported here rather than scored — it is not evidence about the model
- **hostConstraintColoursHonoured** · n/a — `paletteIntent` names no colour in a form a machine can decide (a hex string), so nothing here is decidable. Every constraint this case carries is deferred to the reviewer under S4 instead — for non-contradiction, and for conformance where its subject is observable on the DesignIntent surface
- **hostConstraintsForReviewer** · advisory — 1 host constraint(s) are deferred to the reviewer (S4): either natural language, or naming a colour whose direction — required or prohibited — `paletteIntent` does not declare. What a machine can decide about a DesignIntent here is decided by `hostConstraintColoursHonoured`; each constraint below goes to the reviewer for **non-contradiction** — it is authoritative for all three siblings whatever its subject — and for **conformance where its subject is observable on the DesignIntent surface**. The reviewer must not require this stage to express content or behaviour outside the DesignIntent contract: a constraint whose satisfaction belongs to a later stage remains authoritative downstream, and its absence here is not erosion. Deferred means deferred — never reported passed, never reported failed, never counted as either: “The eldest uncle relies on a heavy motorized wheelchair, requiring step-free access across the sloped lawn and home.”
- **creativeGuidanceStaysAdvisory** · n/a — no creative guidance names a colour in a decidable form; whether guidance was promoted to host law is the reviewer's, under S3
- **noSuppliedFactSurfaced** · n/a — the case asserts no supplied facts
- **presentationPresent** · pass — all three siblings carry a host-facing name and description

### Batch 2 — `DIC4-P02`

- **schemaValid** · pass — all three responses satisfy the narrowed contract and its semantic invariants
- **firstCallSchemaValid** · advisory — 3 of 3 responses parsed strictly on the first call. Advisory, never gating: `docs/model-contracts.md §8` allows one repair retry, so a repaired response is a legal production outcome and failing the set on it would measure the retry policy rather than the model.
- **retryCounts** · advisory — 0 repair retry(ies) and 0 transient retry(ies) across the batch
- **assignmentConformance** · pass — each sibling returned the family, tone, hierarchy and typography category it was assigned
- **paletteSeparation** · fail — pairwise ΔE*ab (mean nearest-neighbour): 0↔1=6.1, 0↔2=6.6, 1↔2=3.9; dominants (all colours) 0↔1=7.4, 0↔2=11.9, 1↔2=4.5; floor 12
- **typographyPairingDistinct** · fail — repeated pairing where the assignment admitted three distinct ones: soft_fraunces_manrope, transitional_instrument_manrope, soft_fraunces_manrope
- **compositionVectorDistinct** · fail — differing composition dimensions, of the 4 the model chooses (asymmetry, rhythm, sectionContrast, ornament; hierarchy is assigned and is checked by assignmentConformance): 0↔1=0/4, 0↔2=0/4, 1↔2=0/4; floor 2
- **motifOverlap** · fail — Jaccard overlap: 0↔1=0.33, 0↔2=0.33, 1↔2=1; must be strictly below 0.5, so two three-motif sets may share at most one
- **tokenAllotmentRespected** · n/a — not decidable at this layer: a DesignIntent carries no attractive token, because the allotment constrains the composition call (`spec.md §7.7`) and 4C runs no composition call. The plan the three calls were made under was checked anyway, and it holds: each attractive token is within its per-batch cap, and every sibling accounts for every token. That is a fact about the planner, proven over thousands of seeded plans in `src/lib/generation/planner.test.ts`, and it is reported here rather than scored — it is not evidence about the model
- **hostConstraintColoursHonoured** · n/a — `paletteIntent` names no colour in a form a machine can decide (a hex string), so nothing here is decidable. Every constraint this case carries is deferred to the reviewer under S4 instead — for non-contradiction, and for conformance where its subject is observable on the DesignIntent surface
- **hostConstraintsForReviewer** · n/a — nothing is deferred: every host constraint this case carries was decided against `paletteIntent` by `hostConstraintColoursHonoured`, or there were none
- **creativeGuidanceStaysAdvisory** · n/a — no creative guidance names a colour in a decidable form; whether guidance was promoted to host law is the reviewer's, under S3
- **noSuppliedFactSurfaced** · n/a — the case asserts no supplied facts
- **presentationPresent** · pass — all three siblings carry a host-facing name and description

### Batch 3 — `DIC4-P03`

- **schemaValid** · pass — all three responses satisfy the narrowed contract and its semantic invariants
- **firstCallSchemaValid** · advisory — 3 of 3 responses parsed strictly on the first call. Advisory, never gating: `docs/model-contracts.md §8` allows one repair retry, so a repaired response is a legal production outcome and failing the set on it would measure the retry policy rather than the model.
- **retryCounts** · advisory — 0 repair retry(ies) and 0 transient retry(ies) across the batch
- **assignmentConformance** · pass — each sibling returned the family, tone, hierarchy and typography category it was assigned
- **paletteSeparation** · fail — pairwise ΔE*ab (mean nearest-neighbour): 0↔1=3.5, 0↔2=2.3, 1↔2=3.5; dominants (all colours) 0↔1=61.7, 0↔2=61.8, 1↔2=0.4; floor 12
- **typographyPairingDistinct** · pass — three distinct pairings: grotesk_archivo_inter, hc_playfair_dmsans, transitional_instrument_manrope
- **compositionVectorDistinct** · fail — differing composition dimensions, of the 4 the model chooses (asymmetry, rhythm, sectionContrast, ornament; hierarchy is assigned and is checked by assignmentConformance): 0↔1=1/4, 0↔2=2/4, 1↔2=1/4; floor 2
- **motifOverlap** · fail — Jaccard overlap: 0↔1=0.5, 0↔2=0.5, 1↔2=1; must be strictly below 0.5, so two three-motif sets may share at most one
- **tokenAllotmentRespected** · n/a — not decidable at this layer: a DesignIntent carries no attractive token, because the allotment constrains the composition call (`spec.md §7.7`) and 4C runs no composition call. The plan the three calls were made under was checked anyway, and it holds: each attractive token is within its per-batch cap, and every sibling accounts for every token. That is a fact about the planner, proven over thousands of seeded plans in `src/lib/generation/planner.test.ts`, and it is reported here rather than scored — it is not evidence about the model
- **hostConstraintColoursHonoured** · n/a — `paletteIntent` names no colour in a form a machine can decide (a hex string), so nothing here is decidable. Every constraint this case carries is deferred to the reviewer under S4 instead — for non-contradiction, and for conformance where its subject is observable on the DesignIntent surface
- **hostConstraintsForReviewer** · n/a — nothing is deferred: every host constraint this case carries was decided against `paletteIntent` by `hostConstraintColoursHonoured`, or there were none
- **creativeGuidanceStaysAdvisory** · n/a — no creative guidance names a colour in a decidable form; whether guidance was promoted to host law is the reviewer's, under S3
- **noSuppliedFactSurfaced** · n/a — the case asserts no supplied facts
- **presentationPresent** · pass — all three siblings carry a host-facing name and description

### Batch 4 — `DIC4-P04`

- **schemaValid** · pass — all three responses satisfy the narrowed contract and its semantic invariants
- **firstCallSchemaValid** · advisory — 3 of 3 responses parsed strictly on the first call. Advisory, never gating: `docs/model-contracts.md §8` allows one repair retry, so a repaired response is a legal production outcome and failing the set on it would measure the retry policy rather than the model.
- **retryCounts** · advisory — 0 repair retry(ies) and 0 transient retry(ies) across the batch
- **assignmentConformance** · pass — each sibling returned the family, tone, hierarchy and typography category it was assigned
- **paletteSeparation** · fail — pairwise ΔE*ab (mean nearest-neighbour): 0↔1=12.7, 0↔2=5.6, 1↔2=9.3; dominants (all colours) 0↔1=81.7, 0↔2=82.9, 1↔2=3.1; floor 12
- **typographyPairingDistinct** · pass — three distinct pairings: transitional_newsreader_tight, heritage_baskerville_inter, hc_bodoni_inter
- **compositionVectorDistinct** · fail — differing composition dimensions, of the 4 the model chooses (asymmetry, rhythm, sectionContrast, ornament; hierarchy is assigned and is checked by assignmentConformance): 0↔1=1/4, 0↔2=0/4, 1↔2=1/4; floor 2
- **motifOverlap** · fail — Jaccard overlap: 0↔1=1, 0↔2=1, 1↔2=1; must be strictly below 0.5, so two three-motif sets may share at most one
- **tokenAllotmentRespected** · n/a — not decidable at this layer: a DesignIntent carries no attractive token, because the allotment constrains the composition call (`spec.md §7.7`) and 4C runs no composition call. The plan the three calls were made under was checked anyway, and it holds: each attractive token is within its per-batch cap, and every sibling accounts for every token. That is a fact about the planner, proven over thousands of seeded plans in `src/lib/generation/planner.test.ts`, and it is reported here rather than scored — it is not evidence about the model
- **hostConstraintColoursHonoured** · n/a — `paletteIntent` names no colour in a form a machine can decide (a hex string), so nothing here is decidable. Every constraint this case carries is deferred to the reviewer under S4 instead — for non-contradiction, and for conformance where its subject is observable on the DesignIntent surface
- **hostConstraintsForReviewer** · n/a — nothing is deferred: every host constraint this case carries was decided against `paletteIntent` by `hostConstraintColoursHonoured`, or there were none
- **creativeGuidanceStaysAdvisory** · n/a — no creative guidance names a colour in a decidable form; whether guidance was promoted to host law is the reviewer's, under S3
- **noSuppliedFactSurfaced** · n/a — the case asserts no supplied facts
- **presentationPresent** · pass — all three siblings carry a host-facing name and description

### Batch 5 — `DIC4-P05`

- **schemaValid** · pass — all three responses satisfy the narrowed contract and its semantic invariants
- **firstCallSchemaValid** · advisory — 3 of 3 responses parsed strictly on the first call. Advisory, never gating: `docs/model-contracts.md §8` allows one repair retry, so a repaired response is a legal production outcome and failing the set on it would measure the retry policy rather than the model.
- **retryCounts** · advisory — 0 repair retry(ies) and 0 transient retry(ies) across the batch
- **assignmentConformance** · pass — each sibling returned the family, tone, hierarchy and typography category it was assigned
- **paletteSeparation** · fail — pairwise ΔE*ab (mean nearest-neighbour): 0↔1=4, 0↔2=3.2, 1↔2=2.9; dominants (all colours) 0↔1=7.9, 0↔2=2, 1↔2=6.6; floor 12
- **typographyPairingDistinct** · pass — three distinct pairings: transitional_instrument_manrope, soft_dmserif_dmsans, grotesk_archivo_inter
- **compositionVectorDistinct** · fail — differing composition dimensions, of the 4 the model chooses (asymmetry, rhythm, sectionContrast, ornament; hierarchy is assigned and is checked by assignmentConformance): 0↔1=1/4, 0↔2=1/4, 1↔2=0/4; floor 2
- **motifOverlap** · pass — Jaccard overlap: 0↔1=0.33, 0↔2=0.33, 1↔2=0.33; must be strictly below 0.5, so two three-motif sets may share at most one
- **tokenAllotmentRespected** · n/a — not decidable at this layer: a DesignIntent carries no attractive token, because the allotment constrains the composition call (`spec.md §7.7`) and 4C runs no composition call. The plan the three calls were made under was checked anyway, and it holds: each attractive token is within its per-batch cap, and every sibling accounts for every token. That is a fact about the planner, proven over thousands of seeded plans in `src/lib/generation/planner.test.ts`, and it is reported here rather than scored — it is not evidence about the model
- **hostConstraintColoursHonoured** · n/a — `paletteIntent` names no colour in a form a machine can decide (a hex string), so nothing here is decidable. Every constraint this case carries is deferred to the reviewer under S4 instead — for non-contradiction, and for conformance where its subject is observable on the DesignIntent surface
- **hostConstraintsForReviewer** · n/a — nothing is deferred: every host constraint this case carries was decided against `paletteIntent` by `hostConstraintColoursHonoured`, or there were none
- **creativeGuidanceStaysAdvisory** · n/a — no creative guidance names a colour in a decidable form; whether guidance was promoted to host law is the reviewer's, under S3
- **noSuppliedFactSurfaced** · n/a — the case asserts no supplied facts
- **presentationPresent** · pass — all three siblings carry a host-facing name and description

### Batch 6 — `DIC4-P06`

- **schemaValid** · pass — all three responses satisfy the narrowed contract and its semantic invariants
- **firstCallSchemaValid** · advisory — 3 of 3 responses parsed strictly on the first call. Advisory, never gating: `docs/model-contracts.md §8` allows one repair retry, so a repaired response is a legal production outcome and failing the set on it would measure the retry policy rather than the model.
- **retryCounts** · advisory — 0 repair retry(ies) and 0 transient retry(ies) across the batch
- **assignmentConformance** · pass — each sibling returned the family, tone, hierarchy and typography category it was assigned
- **paletteSeparation** · fail — pairwise ΔE*ab (mean nearest-neighbour): 0↔1=2.4, 0↔2=4.3, 1↔2=3.7; dominants (all colours) 0↔1=59.2, 0↔2=0.7, 1↔2=58.7; floor 12
- **typographyPairingDistinct** · fail — repeated pairing where the assignment admitted three distinct ones: transitional_instrument_manrope, grotesk_archivo_inter, grotesk_archivo_inter
- **compositionVectorDistinct** · fail — differing composition dimensions, of the 4 the model chooses (asymmetry, rhythm, sectionContrast, ornament; hierarchy is assigned and is checked by assignmentConformance): 0↔1=1/4, 0↔2=1/4, 1↔2=0/4; floor 2
- **motifOverlap** · fail — Jaccard overlap: 0↔1=0.5, 0↔2=0.5, 1↔2=1; must be strictly below 0.5, so two three-motif sets may share at most one
- **tokenAllotmentRespected** · n/a — not decidable at this layer: a DesignIntent carries no attractive token, because the allotment constrains the composition call (`spec.md §7.7`) and 4C runs no composition call. The plan the three calls were made under was checked anyway, and it holds: each attractive token is within its per-batch cap, and every sibling accounts for every token. That is a fact about the planner, proven over thousands of seeded plans in `src/lib/generation/planner.test.ts`, and it is reported here rather than scored — it is not evidence about the model
- **hostConstraintColoursHonoured** · n/a — `paletteIntent` names no colour in a form a machine can decide (a hex string), so nothing here is decidable. Every constraint this case carries is deferred to the reviewer under S4 instead — for non-contradiction, and for conformance where its subject is observable on the DesignIntent surface
- **hostConstraintsForReviewer** · advisory — 1 host constraint(s) are deferred to the reviewer (S4): either natural language, or naming a colour whose direction — required or prohibited — `paletteIntent` does not declare. What a machine can decide about a DesignIntent here is decided by `hostConstraintColoursHonoured`; each constraint below goes to the reviewer for **non-contradiction** — it is authoritative for all three siblings whatever its subject — and for **conformance where its subject is observable on the DesignIntent surface**. The reviewer must not require this stage to express content or behaviour outside the DesignIntent contract: a constraint whose satisfaction belongs to a later stage remains authoritative downstream, and its absence here is not erosion. Deferred means deferred — never reported passed, never reported failed, never counted as either: “The session leader institutes a strict no-device policy during the discussion.”
- **creativeGuidanceStaysAdvisory** · n/a — no creative guidance names a colour in a decidable form; whether guidance was promoted to host law is the reviewer's, under S3
- **noSuppliedFactSurfaced** · n/a — the case asserts no supplied facts
- **presentationPresent** · pass — all three siblings carry a host-facing name and description

### Batch 7 — `DIC4-Q01`

- **schemaValid** · pass — all three responses satisfy the narrowed contract and its semantic invariants
- **firstCallSchemaValid** · advisory — 3 of 3 responses parsed strictly on the first call. Advisory, never gating: `docs/model-contracts.md §8` allows one repair retry, so a repaired response is a legal production outcome and failing the set on it would measure the retry policy rather than the model.
- **retryCounts** · advisory — 0 repair retry(ies) and 0 transient retry(ies) across the batch
- **assignmentConformance** · pass — each sibling returned the family, tone, hierarchy and typography category it was assigned
- **paletteSeparation** · fail — pairwise ΔE*ab (mean nearest-neighbour): 0↔1=7.4, 0↔2=8.3, 1↔2=2.9; dominants (all colours) 0↔1=21.7, 0↔2=19.8, 1↔2=2.1; floor 12
- **typographyPairingDistinct** · pass — three distinct pairings: grotesk_archivo_inter, transitional_instrument_manrope, oldstyle_garamond_worksans
- **compositionVectorDistinct** · fail — differing composition dimensions, of the 4 the model chooses (asymmetry, rhythm, sectionContrast, ornament; hierarchy is assigned and is checked by assignmentConformance): 0↔1=2/4, 0↔2=2/4, 1↔2=0/4; floor 2
- **motifOverlap** · fail — Jaccard overlap: 0↔1=1, 0↔2=1, 1↔2=1; must be strictly below 0.5, so two three-motif sets may share at most one
- **tokenAllotmentRespected** · n/a — not decidable at this layer: a DesignIntent carries no attractive token, because the allotment constrains the composition call (`spec.md §7.7`) and 4C runs no composition call. The plan the three calls were made under was checked anyway, and it holds: each attractive token is within its per-batch cap, and every sibling accounts for every token. That is a fact about the planner, proven over thousands of seeded plans in `src/lib/generation/planner.test.ts`, and it is reported here rather than scored — it is not evidence about the model
- **hostConstraintColoursHonoured** · n/a — `paletteIntent` names no colour in a form a machine can decide (a hex string), so nothing here is decidable. Every constraint this case carries is deferred to the reviewer under S4 instead — for non-contradiction, and for conformance where its subject is observable on the DesignIntent surface
- **hostConstraintsForReviewer** · advisory — 1 host constraint(s) are deferred to the reviewer (S4): either natural language, or naming a colour whose direction — required or prohibited — `paletteIntent` does not declare. What a machine can decide about a DesignIntent here is decided by `hostConstraintColoursHonoured`; each constraint below goes to the reviewer for **non-contradiction** — it is authoritative for all three siblings whatever its subject — and for **conformance where its subject is observable on the DesignIntent surface**. The reviewer must not require this stage to express content or behaviour outside the DesignIntent contract: a constraint whose satisfaction belongs to a later stage remains authoritative downstream, and its absence here is not erosion. Deferred means deferred — never reported passed, never reported failed, never counted as either: “no gifts”
- **creativeGuidanceStaysAdvisory** · n/a — no creative guidance names a colour in a decidable form; whether guidance was promoted to host law is the reviewer's, under S3
- **noSuppliedFactSurfaced** · n/a — the case asserts no supplied facts
- **presentationPresent** · pass — all three siblings carry a host-facing name and description

### Batch 8 — `DIC4-Q02`

- **schemaValid** · pass — all three responses satisfy the narrowed contract and its semantic invariants
- **firstCallSchemaValid** · advisory — 3 of 3 responses parsed strictly on the first call. Advisory, never gating: `docs/model-contracts.md §8` allows one repair retry, so a repaired response is a legal production outcome and failing the set on it would measure the retry policy rather than the model.
- **retryCounts** · advisory — 0 repair retry(ies) and 0 transient retry(ies) across the batch
- **assignmentConformance** · pass — each sibling returned the family, tone, hierarchy and typography category it was assigned
- **paletteSeparation** · fail — pairwise ΔE*ab (mean nearest-neighbour): 0↔1=5.2, 0↔2=5.1, 1↔2=3.6; dominants (all colours) 0↔1=66.8, 0↔2=70.8, 1↔2=5.4; floor 12
- **typographyPairingDistinct** · pass — three distinct pairings: transitional_newsreader_tight, soft_fraunces_manrope, oldstyle_garamond_worksans
- **compositionVectorDistinct** · fail — differing composition dimensions, of the 4 the model chooses (asymmetry, rhythm, sectionContrast, ornament; hierarchy is assigned and is checked by assignmentConformance): 0↔1=1/4, 0↔2=1/4, 1↔2=0/4; floor 2
- **motifOverlap** · fail — Jaccard overlap: 0↔1=1, 0↔2=1, 1↔2=1; must be strictly below 0.5, so two three-motif sets may share at most one
- **tokenAllotmentRespected** · n/a — not decidable at this layer: a DesignIntent carries no attractive token, because the allotment constrains the composition call (`spec.md §7.7`) and 4C runs no composition call. The plan the three calls were made under was checked anyway, and it holds: each attractive token is within its per-batch cap, and every sibling accounts for every token. That is a fact about the planner, proven over thousands of seeded plans in `src/lib/generation/planner.test.ts`, and it is reported here rather than scored — it is not evidence about the model
- **hostConstraintColoursHonoured** · n/a — `paletteIntent` names no colour in a form a machine can decide (a hex string), so nothing here is decidable. Every constraint this case carries is deferred to the reviewer under S4 instead — for non-contradiction, and for conformance where its subject is observable on the DesignIntent surface
- **hostConstraintsForReviewer** · n/a — nothing is deferred: every host constraint this case carries was decided against `paletteIntent` by `hostConstraintColoursHonoured`, or there were none
- **creativeGuidanceStaysAdvisory** · n/a — no creative guidance names a colour in a decidable form; whether guidance was promoted to host law is the reviewer's, under S3
- **noSuppliedFactSurfaced** · n/a — the case asserts no supplied facts
- **presentationPresent** · pass — all three siblings carry a host-facing name and description

### Batch 9 — `DIC4-Q03`

- **schemaValid** · pass — all three responses satisfy the narrowed contract and its semantic invariants
- **firstCallSchemaValid** · advisory — 3 of 3 responses parsed strictly on the first call. Advisory, never gating: `docs/model-contracts.md §8` allows one repair retry, so a repaired response is a legal production outcome and failing the set on it would measure the retry policy rather than the model.
- **retryCounts** · advisory — 0 repair retry(ies) and 0 transient retry(ies) across the batch
- **assignmentConformance** · pass — each sibling returned the family, tone, hierarchy and typography category it was assigned
- **paletteSeparation** · fail — pairwise ΔE*ab (mean nearest-neighbour): 0↔1=8.4, 0↔2=1.4, 1↔2=8.4; dominants (all colours) 0↔1=39.5, 0↔2=2.9, 1↔2=39.7; floor 12
- **typographyPairingDistinct** · pass — three distinct pairings: hc_playfair_dmsans, oldstyle_garamond_worksans, transitional_newsreader_tight
- **compositionVectorDistinct** · fail — differing composition dimensions, of the 4 the model chooses (asymmetry, rhythm, sectionContrast, ornament; hierarchy is assigned and is checked by assignmentConformance): 0↔1=1/4, 0↔2=0/4, 1↔2=1/4; floor 2
- **motifOverlap** · fail — Jaccard overlap: 0↔1=1, 0↔2=1, 1↔2=1; must be strictly below 0.5, so two three-motif sets may share at most one
- **tokenAllotmentRespected** · n/a — not decidable at this layer: a DesignIntent carries no attractive token, because the allotment constrains the composition call (`spec.md §7.7`) and 4C runs no composition call. The plan the three calls were made under was checked anyway, and it holds: each attractive token is within its per-batch cap, and every sibling accounts for every token. That is a fact about the planner, proven over thousands of seeded plans in `src/lib/generation/planner.test.ts`, and it is reported here rather than scored — it is not evidence about the model
- **hostConstraintColoursHonoured** · n/a — `paletteIntent` names no colour in a form a machine can decide (a hex string), so nothing here is decidable. Every constraint this case carries is deferred to the reviewer under S4 instead — for non-contradiction, and for conformance where its subject is observable on the DesignIntent surface
- **hostConstraintsForReviewer** · advisory — 1 host constraint(s) are deferred to the reviewer (S4): either natural language, or naming a colour whose direction — required or prohibited — `paletteIntent` does not declare. What a machine can decide about a DesignIntent here is decided by `hostConstraintColoursHonoured`; each constraint below goes to the reviewer for **non-contradiction** — it is authoritative for all three siblings whatever its subject — and for **conformance where its subject is observable on the DesignIntent surface**. The reviewer must not require this stage to express content or behaviour outside the DesignIntent contract: a constraint whose satisfaction belongs to a later stage remains authoritative downstream, and its absence here is not erosion. Deferred means deferred — never reported passed, never reported failed, never counted as either: “no religious elements”
- **creativeGuidanceStaysAdvisory** · n/a — no creative guidance names a colour in a decidable form; whether guidance was promoted to host law is the reviewer's, under S3
- **noSuppliedFactSurfaced** · n/a — the case asserts no supplied facts
- **presentationPresent** · pass — all three siblings carry a host-facing name and description

### Batch 10 — `DIC4-Q04`

- **schemaValid** · pass — all three responses satisfy the narrowed contract and its semantic invariants
- **firstCallSchemaValid** · advisory — 3 of 3 responses parsed strictly on the first call. Advisory, never gating: `docs/model-contracts.md §8` allows one repair retry, so a repaired response is a legal production outcome and failing the set on it would measure the retry policy rather than the model.
- **retryCounts** · advisory — 0 repair retry(ies) and 0 transient retry(ies) across the batch
- **assignmentConformance** · pass — each sibling returned the family, tone, hierarchy and typography category it was assigned
- **paletteSeparation** · fail — pairwise ΔE*ab (mean nearest-neighbour): 0↔1=7.2, 0↔2=6, 1↔2=3.5; dominants (all colours) 0↔1=18.3, 0↔2=14.3, 1↔2=4.3; floor 12
- **typographyPairingDistinct** · pass — three distinct pairings: oldstyle_garamond_worksans, soft_fraunces_manrope, transitional_instrument_manrope
- **compositionVectorDistinct** · fail — differing composition dimensions, of the 4 the model chooses (asymmetry, rhythm, sectionContrast, ornament; hierarchy is assigned and is checked by assignmentConformance): 0↔1=1/4, 0↔2=0/4, 1↔2=1/4; floor 2
- **motifOverlap** · fail — Jaccard overlap: 0↔1=1, 0↔2=1, 1↔2=1; must be strictly below 0.5, so two three-motif sets may share at most one
- **tokenAllotmentRespected** · n/a — not decidable at this layer: a DesignIntent carries no attractive token, because the allotment constrains the composition call (`spec.md §7.7`) and 4C runs no composition call. The plan the three calls were made under was checked anyway, and it holds: each attractive token is within its per-batch cap, and every sibling accounts for every token. That is a fact about the planner, proven over thousands of seeded plans in `src/lib/generation/planner.test.ts`, and it is reported here rather than scored — it is not evidence about the model
- **hostConstraintColoursHonoured** · n/a — `paletteIntent` names no colour in a form a machine can decide (a hex string), so nothing here is decidable. Every constraint this case carries is deferred to the reviewer under S4 instead — for non-contradiction, and for conformance where its subject is observable on the DesignIntent surface
- **hostConstraintsForReviewer** · n/a — nothing is deferred: every host constraint this case carries was decided against `paletteIntent` by `hostConstraintColoursHonoured`, or there were none
- **creativeGuidanceStaysAdvisory** · n/a — no creative guidance names a colour in a decidable form; whether guidance was promoted to host law is the reviewer's, under S3
- **noSuppliedFactSurfaced** · n/a — the case asserts no supplied facts
- **presentationPresent** · pass — all three siblings carry a host-facing name and description

### Batch 11 — `DIC4-Q05`

- **schemaValid** · pass — all three responses satisfy the narrowed contract and its semantic invariants
- **firstCallSchemaValid** · advisory — 3 of 3 responses parsed strictly on the first call. Advisory, never gating: `docs/model-contracts.md §8` allows one repair retry, so a repaired response is a legal production outcome and failing the set on it would measure the retry policy rather than the model.
- **retryCounts** · advisory — 0 repair retry(ies) and 0 transient retry(ies) across the batch
- **assignmentConformance** · pass — each sibling returned the family, tone, hierarchy and typography category it was assigned
- **paletteSeparation** · fail — pairwise ΔE*ab (mean nearest-neighbour): 0↔1=5.6, 0↔2=7, 1↔2=4.3; dominants (all colours) 0↔1=56.4, 0↔2=59.4, 1↔2=5.7; floor 12
- **typographyPairingDistinct** · fail — repeated pairing where the assignment admitted three distinct ones: transitional_instrument_manrope, grotesk_archivo_inter, grotesk_archivo_inter
- **compositionVectorDistinct** · fail — differing composition dimensions, of the 4 the model chooses (asymmetry, rhythm, sectionContrast, ornament; hierarchy is assigned and is checked by assignmentConformance): 0↔1=0/4, 0↔2=0/4, 1↔2=0/4; floor 2
- **motifOverlap** · fail — Jaccard overlap: 0↔1=1, 0↔2=0.33, 1↔2=0.33; must be strictly below 0.5, so two three-motif sets may share at most one
- **tokenAllotmentRespected** · n/a — not decidable at this layer: a DesignIntent carries no attractive token, because the allotment constrains the composition call (`spec.md §7.7`) and 4C runs no composition call. The plan the three calls were made under was checked anyway, and it holds: each attractive token is within its per-batch cap, and every sibling accounts for every token. That is a fact about the planner, proven over thousands of seeded plans in `src/lib/generation/planner.test.ts`, and it is reported here rather than scored — it is not evidence about the model
- **hostConstraintColoursHonoured** · n/a — `paletteIntent` names no colour in a form a machine can decide (a hex string), so nothing here is decidable. Every constraint this case carries is deferred to the reviewer under S4 instead — for non-contradiction, and for conformance where its subject is observable on the DesignIntent surface
- **hostConstraintsForReviewer** · n/a — nothing is deferred: every host constraint this case carries was decided against `paletteIntent` by `hostConstraintColoursHonoured`, or there were none
- **creativeGuidanceStaysAdvisory** · n/a — no creative guidance names a colour in a decidable form; whether guidance was promoted to host law is the reviewer's, under S3
- **noSuppliedFactSurfaced** · n/a — the case asserts no supplied facts
- **presentationPresent** · pass — all three siblings carry a host-facing name and description

### Batch 12 — `DIC4-Q06`

- **schemaValid** · pass — all three responses satisfy the narrowed contract and its semantic invariants
- **firstCallSchemaValid** · advisory — 3 of 3 responses parsed strictly on the first call. Advisory, never gating: `docs/model-contracts.md §8` allows one repair retry, so a repaired response is a legal production outcome and failing the set on it would measure the retry policy rather than the model.
- **retryCounts** · advisory — 0 repair retry(ies) and 0 transient retry(ies) across the batch
- **assignmentConformance** · pass — each sibling returned the family, tone, hierarchy and typography category it was assigned
- **paletteSeparation** · fail — pairwise ΔE*ab (mean nearest-neighbour): 0↔1=5.7, 0↔2=2.8, 1↔2=5.5; dominants (all colours) 0↔1=72.2, 0↔2=67.2, 1↔2=5.8; floor 12
- **typographyPairingDistinct** · fail — repeated pairing where the assignment admitted three distinct ones: oldstyle_garamond_worksans, transitional_instrument_manrope, oldstyle_garamond_worksans
- **compositionVectorDistinct** · fail — differing composition dimensions, of the 4 the model chooses (asymmetry, rhythm, sectionContrast, ornament; hierarchy is assigned and is checked by assignmentConformance): 0↔1=1/4, 0↔2=1/4, 1↔2=2/4; floor 2
- **motifOverlap** · fail — Jaccard overlap: 0↔1=1, 0↔2=1, 1↔2=1; must be strictly below 0.5, so two three-motif sets may share at most one
- **tokenAllotmentRespected** · n/a — not decidable at this layer: a DesignIntent carries no attractive token, because the allotment constrains the composition call (`spec.md §7.7`) and 4C runs no composition call. The plan the three calls were made under was checked anyway, and it holds: each attractive token is within its per-batch cap, and every sibling accounts for every token. That is a fact about the planner, proven over thousands of seeded plans in `src/lib/generation/planner.test.ts`, and it is reported here rather than scored — it is not evidence about the model
- **hostConstraintColoursHonoured** · n/a — `paletteIntent` names no colour in a form a machine can decide (a hex string), so nothing here is decidable. Every constraint this case carries is deferred to the reviewer under S4 instead — for non-contradiction, and for conformance where its subject is observable on the DesignIntent surface
- **hostConstraintsForReviewer** · n/a — nothing is deferred: every host constraint this case carries was decided against `paletteIntent` by `hostConstraintColoursHonoured`, or there were none
- **creativeGuidanceStaysAdvisory** · n/a — no creative guidance names a colour in a decidable form; whether guidance was promoted to host law is the reviewer's, under S3
- **noSuppliedFactSurfaced** · n/a — the case asserts no supplied facts
- **presentationPresent** · pass — all three siblings carry a host-facing name and description

## Corpus-wide measurements

Measurements, not verdicts. They are here so a cross-batch question is answered against
evidence rather than against recollection of the per-batch answers already given.

### Concept separation, within a batch and across batches

Palette distance is the mean nearest-neighbour ΔE*ab between two palettes: near zero means
one palette is a recolour of the other.

- mean **within**-batch palette distance: 5.1
- mean **across**-batch distance between concepts at the same position: 22.6
- smallest such across-batch distance: 11.5

### Batches that are instances of the same kind of event

| Batches | Concept | Palette ΔE | Composition dimensions differing | Same typography | Same motifs |
| --- | --- | --- | --- | --- | --- |
| Batch 1 ↔ Batch 2 | 1 | 20.1 | 0/4 | no | no |
| Batch 1 ↔ Batch 2 | 2 | 21.5 | 0/4 | no | no |
| Batch 1 ↔ Batch 2 | 3 | 23.5 | 0/4 | no | no |
| Batch 8 ↔ Batch 11 | 1 | 17.9 | 2/4 | no | no |
| Batch 8 ↔ Batch 11 | 2 | 18.6 | 1/4 | no | no |
| Batch 8 ↔ Batch 11 | 3 | 18.1 | 1/4 | no | no |

### Palette families

| Family | Concepts |
| --- | --- |
| hue 60–90 · light | 11 |
| neutral · light | 5 |
| hue 0–30 · dark | 3 |
| neutral · mid | 3 |
| hue 120–150 · mid | 2 |
| hue 150–180 · dark | 2 |
| hue 240–270 · mid | 2 |
| hue 270–300 · dark | 2 |
| hue 30–60 · mid | 2 |
| hue 90–120 · light | 2 |
| neutral · dark | 2 |

### Typography pairings

| Pairing | Concepts |
| --- | --- |
| transitional_instrument_manrope | 9 |
| grotesk_archivo_inter | 7 |
| oldstyle_garamond_worksans | 7 |
| soft_fraunces_manrope | 5 |
| transitional_newsreader_tight | 3 |
| hc_playfair_dmsans | 2 |
| hc_bodoni_inter | 1 |
| heritage_baskerville_inter | 1 |
| soft_dmserif_dmsans | 1 |

### Motif sets

| Motifs | Concepts |
| --- | --- |
| linen+stripe | 15 |
| linen | 6 |
| botanical+linen | 5 |
| stripe | 4 |
| gingham+linen | 3 |
| botanical+stripe | 2 |
| gingham+stripe | 1 |

### Language repeating across batches

| Span | Batches |
| --- | --- |
| common ground a | Batch 11, Batch 2, Batch 3 |
| a grounded welcoming | Batch 11, Batch 5 |
| a warm grounded | Batch 7, Batch 8 |
| and the comfort | Batch 11, Batch 8 |
| grounded welcoming direction | Batch 11, Batch 5 |
| shaped by shared | Batch 7, Batch 8 |
| the comfort of | Batch 11, Batch 8 |
| together with clarity | Batch 1, Batch 6 |
| welcoming direction that | Batch 11, Batch 5 |

### Design signatures recurring across batches

A signature is family · tone · typography · composition · motifs. This is a **proxy**: an
organizing idea is not a field, and whether two concepts are the same idea is yours to say.

| Signature | Batches |
| --- | --- |
| invitation · mid · oldstyle_garamond_worksans · gentle/restrained/alternating/moderate/restrained · linen+stripe | Batch 12, Batch 7 |

## Acceptance criteria, frozen at T19

- **Mechanical:** Every batch passes mechanically: no check reports `fail`. `schemaValid`, `assignmentConformance`, `paletteSeparation`, `typographyPairingDistinct`, `compositionVectorDistinct`, `motifOverlap`, `hostConstraintColoursHonoured`, `noSuppliedFactSurfaced` and `presentationPresent` gate. `firstCallSchemaValid`, `retryCounts`, `hostConstraintsForReviewer`, `creativeGuidanceStaysAdvisory` and `tokenAllotmentRespected` never gate, because each of them measures something whose verdict belongs to the reviewer, to the retry policy or to the planner rather than to the model's creative output. A host constraint `hostConstraintsForReviewer` cannot decide from the DesignIntent in front of it is **deferred to the reviewer** — for non-contradiction, which every constraint is owed whatever its subject, and for conformance where that subject is observable on the DesignIntent surface. It is never reported as passed, never reported as failed and never counted as either, and the reviewer is not asked to require this stage to express content or behaviour the DesignIntent contract has no field for. `tokenAllotmentRespected` is the sharpest of those: a DesignIntent carries no attractive token at all — the allotment constrains the composition call (`spec.md §7.7`) and 4C runs none — so it reports `n/a`, and a `pass` there would have put a true-looking verdict about model output into an evidence report on a property the model never had the chance to violate. The planner facts behind it are decided in `src/lib/generation/planner.test.ts` and reported here as detail only.
- **Corpus-wide:** The corpus-wide block is reported as measurements, not thresholds. It exists so the reviewer can answer S8 and S9 against evidence rather than against recollection of the per-batch ratings they have just given.
- **Qualitative:** The gate is `docs/phase-4b-plan.md §3.7`, frozen at T19 and deliberately not restated here: one normative copy, and the reviewer does not receive it. Every category is explicitly assessed, with none meeting its frozen systemic threshold. The arithmetic happens outside the blind review, by someone applying that frozen rule to what the reviewer returned.
