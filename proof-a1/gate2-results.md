# Gate 2 — sixty seeded sites, no curation

Question: does a seed find the diversity, or did a human? Method: `generate.js` picks every value from `vocab.js` with a namespaced deterministic PRNG (master seed 20260912), constrained only by the rules the vocabulary declares, and accepts a candidate only if its structural signature is below .70 against every already-accepted site in both modes. No site was edited after generation. The harness rendered all sixty unchanged (`?set=gen`).

Three runs from the same seed, so the rules can be isolated:

| Run | Selector | Pairs ≥ .70 (desktop / mobile) | Pairs ≥ .60 | NN p50 / p90 / max | Rerolls | Silhouette max | Skeleton class max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| raw (`--no-reject`) | none | 17 / 21 | 49 / 54 | .65 / .85 / .95 | 0 | 6 | 2 |
| signature only (`--no-cap`) | reject ≥ .70 | 0 / 0 | 24 / 26 | .60 / .65 / .65 | 36 over 20 sites, max 5 | 5 | 1 |
| signature + silhouette cap (final) | reject ≥ .70, hero:variant ≤ 4 per batch | 0 / 0 | 24 / 27 | .60 / .65 / .65 | 42 over 20 sites, max 8 | 4 | 1 |

1,770 pairs per run. NN is each site's nearest neighbour by the worse of the two modes. Skeleton class = hero + variant + plan + typography category. Forced accepts (best-of after 60 tries): 0 in every run.

## Pass criteria, as set before the run

| Criterion | Result |
| --- | --- |
| No pair at or above .70 in either mode | 0 of 1,770 |
| Skeleton classes no larger than 3 | largest 1; all 60 distinct |
| At least 8 hero recipes used | 12 of 12; least used 3 (masthead), most used 7 (numeral, stack) |
| No forced accepts | 0 |
| All 60 valid against every `requires`/`excludes` rule | validated by script, 0 violations |

Usage in the final run: families 21 / 19 / 20; axes 21 left / 21 center / 18 alternating; 26 of 27 silhouettes used; six type categories from 6 to 14 sites each; plans from 6 to 19.

## What the renders show (`gate2-heroes-1280-gray.png`, `gate2-heroes-390-gray.png`, full sheets)

**Sixty coherent pages.** No combination broke. Every page reads as one system: same rule weight, same button object, same axis discipline, one surface plan. This held without a single per-site fix, which is the point of the page system.

**First-screen diversity is real but not unlimited.** At desktop, I would sort the sixty heroes into roughly 24 silhouette groups, which matches the 26 silhouettes the seed used. Within a silhouette, tone, type category and plan separate the sites at full size but not always at thumbnail size. The honest reading: the engine reliably produces sixty *different* sites and roughly twenty-five *different-looking first screens*. Sixty distinct first screens would need more heroes, not more parameters.

**The most recognizable repeat is the ticket.** It is the strongest object in the vocabulary, so its six appearances (four `stub_right`, two `stub_left`) read as "that ticket again" faster than six splits do. The silhouette cap is what kept it at four; without the cap the seed put five identical stubs in the batch. A per-object cap lower than the generic one is a reasonable next rule.

**Plan imbalance.** SP3 appears 19 times because `punctuated` rhythm maps to exactly one plan. Rhythm is sampled uniformly, so one third of sites are forced onto SP3. Fix in the vocabulary: a second punctuated plan, or sample rhythm in proportion to the plans that express it.

**Contrast relaxation is routine, and shouldn't be.** 35 of 60 sites logged `plan: contrast relaxed`, because `sectionContrast` is sampled independently of rhythm and only five of nine rhythm×contrast combinations have a plan. The compiler should derive `sectionContrast` from the chosen plan (or choose the plan from rhythm and contrast jointly) rather than repair after the fact. The repair is harmless here; the log is the finding.

**Three recipe-level defects surfaced only at sixty.** Numeral at monumental overran the first screen; the stack's third-line offset overran a phone at `alignOffset` 3; the rule-grid cell class collided with lab CSS. All three were fixed as recipe rules and the affected sites re-rendered from the same configs. Twelve hand-composed sites did not reach these corners; sixty seeded ones did within one run. That is the argument for Gate 2 as a permanent test, not a one-off.

## Verdict

Gate 2 passes on its stated criteria. The seeded selector, with only the signature check and a silhouette cap, finds sixty sites with no structural collision, every hero used, and no skeleton repeated, from a vocabulary of 12 heroes, 27 silhouettes, 6 plans, 5 RSVP shells, 4 details, 4 registries, 12 pairings and 7 motifs. The visual read agrees on coherence and on below-the-fold diversity, and puts first-screen diversity at about 25 groups in 60, which is the silhouette count, not a failure of the selector.

What should change before the canonical docs are updated:
1. Silhouette cap as a batch-planner rule (ceil(N / silhouettes) + 1, with a lower per-object cap for strong objects like the ticket).
2. Derive `sectionContrast` from the plan, or choose plan and contrast jointly.
3. A second punctuated plan.
4. Numeral title scale, stack mobile offset, and card/ticket surface rules written into the recipe definitions.
5. Keep `generate.js` + harness as the regression test: rerun at 60 whenever a recipe or plan changes.
