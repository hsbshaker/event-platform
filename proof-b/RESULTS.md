# Phase B results — can the model author compositions safely, and does it invent?

Model: `claude-sonnet-5` through the local CLI, one call per tree, default sampling. Brief: the same Ralph Lauren-inspired winter baby shower as Phases A and A.1. DesignIntent per tree sampled from the A.1 vocabulary by seed (the proof is about the composition call, not the intent call). No tree was edited after generation. Every number below is in `model/<run>/metrics.json`; every tree, verbatim model output and repair log is in `model/<run>/`.

## The three metrics, kept separate

| Run | Trees | Schema-valid on first call | After one re-prompt | Deterministic-repair valid | Trees with zero violations | Trees needing no repair at all |
| --- | --- | --- | --- | --- | --- | --- |
| zero-shot | 60 | 58 | 60 | 60 | 28 | 17 |
| few-shot (3 rotated library pages) | 60 | 59 | 60 | 60 | 40 | 27 |
| reduced capabilities (no registry, cash fund, description) | 12 | 12 | 12 | 12 | 4 | 0 |
| mode-collapse (one directive, one intent, 20 seeds) | 20 | 19 | 20 | 20 | 11 | 9 |

Schema failures were three in 152 clean calls: one unknown key, two `Split` with three children. All were fixed by the one permitted re-prompt. No tree fell back to the library.

"Zero violations" counts trees whose raw output broke no structural rule. The gap between that and "no repair at all" is content fit, which is verified against rendered geometry (below). Repairs by rule, both 60-tree runs combined: `fit.verified` 69, `motif.kind` 55 (an arrangement motif in a pattern slot or the reverse; the rule text naming which motifs are patterns was added to the prompt after the first collision run, so most of these trees never saw it), `fit.estimate` 9, `nesting.registryLeaf` 4, `nesting.rail` 3, `nesting.surfaceSame` 1. No coverage repair, no capability repair, no hoisting, no depth or node-budget repair was needed on any model tree. The reduced-capabilities run produced no reference to a disabled capability in 12 of 12 trees.

Human design quality is not measured here. `human-test-1280-gray-unlabeled.png` and `human-test-390-gray-unlabeled.png` hold 20 model heroes and 20 library heroes shuffled; `human-test-key.txt` is the key. The author's read is in the last section and is labelled as such.

## Geometry verification

Content fit is estimated in the compiler and then verified by rendering each tree at 390 and 1280 in headless Chromium, measuring every text node's line count and bounds, demoting emphasis, and re-rendering (up to three rounds).

| Run | Trees needing a verified demotion | Verified demotions | Estimated demotions | Residual overflow (desktop / mobile) |
| --- | --- | --- | --- | --- |
| zero-shot | 26 of 60 | 39 | 6 | 1 / 1 |
| few-shot | 20 of 60 | 30 | 3 | 0 / 0 |
| reduced | 7 of 12 | 8 | 0 | 0 / 0 |
| collapse | 2 of 20 | 2 | 0 | 1 / 1 |

The estimate caught 9 of the 79 demotions the geometry pass made. An estimate based on average character width cannot see a staggered title, a numeral in a rail, or nested insets; the verified pass can. Change 3 was the right call and the estimate should be treated as a hint, not a gate.

The residual overflows are two trees: a text node inside a wide rail (zero 41, desktop) and one stack inside a deep Frame inside a deep Surface at 390 (zero 01, mobile), plus the same pattern in collapse 04. Three rules were added during the proof, each after the renders showed the defect: a numeral inside a rail is sized by the rail, decorations render as watermarks, and nested insets compress on mobile. The pass criterion was zero; the result is two of 152.

## Adversarial fixtures

36 structural fixtures (max depth, frames in frames, forms in rails, text under text, six overlays, missing title, missing sections, disabled capabilities, 73-node sections, seven sections): 36 of 36 repaired to zero remaining violations, all 36 re-validated against the schema, all 36 rendered with no overflow at either width (`fixtures/adversarial-render.json`, `adversarial-heroes-1280-gray.png`). 10 schema-invalid payloads (unknown node, `style` key, pixel ratio, free text, wrong version, an HTML string): 10 of 10 rejected with a rule and path.

## Expressiveness

All 27 A.1 hero silhouettes and all 13 section recipes are expressible as trees, validate with zero violations, and render through the primitive renderer (`library-heroes-1280-gray.png`, `compare-a1-vs-tree-1280.png`). Two additions were needed to express them faithfully: `EventTitle.layout` (`stagger`/`cascade`) for the statement stack, and `Split.divider` for the ticket's perforation. Against the A.1 shots, 25 silhouettes match closely; the offset plate is smaller than A.1's, and the stack's line proportions differ. The library CSS recipes are retired: the harness has one render function per primitive and none per recipe.

## Invention

| | zero-shot | few-shot |
| --- | --- | --- |
| Novel heroes (nearest library silhouette below .70) | 54 of 60 (.90) | 53 of 60 (.88) |
| Exact library skeletons reproduced | 0 | 0 |
| Distinct hero skeletons in 60 | 58 | 58 |
| Largest skeleton class | 2 | 2 |
| Rarefaction (distinct at 10/20/30/40/50/60) | 10/20/30/39/49/58 | 10/20/30/40/50/58 |
| Hero primitive entropy (library 4.05) | 4.16 | 4.17 |
| Hero root types | Surface 18, Frame 9, Split 8, Rail 8, Grid 7, Stack 7, Overlay 3 | Surface 13, Rail 10, Frame 10, Split 9, Overlay 6, Grid 6, Stack 6 |
| Nearest library silhouette, p50 / p90 | .50 / .71 | .50 / .70 |

The rarefaction curve does not plateau: the model is not drawing from a fixed repertoire at this scale. Few-shot examples did not push the output toward the library (zero exact matches, novelty within two trees of zero-shot), so the library can stay as examples.

**Mode-collapse test.** One directive, one DesignIntent, twenty seeds differing only in which three library examples were shown: 17 distinct hero skeletons in 20 (target 12), all built on the Rail the directive asked for. The selector saw 8 collisions among the twenty because plan, tone and typography were identical by construction; 3 were resolved by the one collision re-prompt, 5 were kept and reported. That is what the batch planner must never do in production: siblings get different intents, not only different seeds.

## Where the model converges

Distinct skeletons are not the whole story. Two tokens are over-used far beyond what the directives asked for:

| Token | Heroes using it (zero / few) | Directives asking for it |
| --- | --- | --- |
| `EventTitle.layout` stagger or cascade | 52 / 49 of 60 | never named in a directive |
| `Date` numeral in the hero | 43 / 46 of 60 | 32 / 33 |
| `Surface` as the hero root | 18 / 13 of 60 | — |
| details folded into the hero | 25 / 25 of 60 | 30 / 30 |

The staggered title is the Phase B equivalent of A.1's ticket: an attractive token the model reaches for by default. A reviewer of the unlabeled human-test sheet will find the model heroes by the stagger and the numeral, which is a convergence signal the skeleton metric cannot see. The fix is a batch-level cap on attractive tokens (as the A.1 silhouette cap was), and possibly removing `stagger` as a default-available value.

## Directives: nudges, not recipes

Nine independent dimensions, 103,680 combinations, one sentence per candidate. Compliance per dimension, zero-shot / few-shot: structure .98 / .93, surface .98 / .93, details 1.0 / 1.0, RSVP intro .92 / .98, date .80 / .85, opening .78 / .70, motif .68 / .63, registry .40 / .52, weight .38 / .53. The model follows structural directives and ignores the vague ones (visual weight, registry arrangement), so those two dimensions should be rewritten or dropped. Trees produced under the same `structure` value are not a recipe: the Grid directive produced 13 distinct hero skeletons in 15 trees, Frame 11, Split 10, Rail 9, Overlay 8, Stack 7.

## Selector

Pairwise structural signature (hero skeleton with a floor on partial overlap, surface sequence, RSVP and registry skeletons, alignment, typography category, tone), both modes:

| Run | Pairs ≥ .70 (desktop / mobile) | Nearest neighbour p50 / p90 / max (desktop) | Collisions at accept | Resolved by re-prompt |
| --- | --- | --- | --- | --- |
| zero-shot | 0 / 0 | .45 / .66 / .68 | 0 | — |
| few-shot | 3 / 3 | .45 / .71 / .79 | 0 at accept; 3 after all trees were in | 3 |
| reduced | 0 / 0 | .45 / .55 / .55 | 0 | — |

For comparison, Gate 2's seeded recipes reached nearest-neighbour p90 .65 only after rejection sampling; the model's zero-shot batch is at .66 with no rejection needed.

## Cost and calls

152 trees, 167 calls (15 re-prompts, all for schema or collision; deterministic repairs made none), $19.75 at list price, mean 85 s per call at four in parallel. A block of 38 calls failed on an organisation spend limit mid-run; those items were re-run with the same seeds after the limit reset (`rerunAfterInfraFailure` in each results file) and no library fallback was used. Infrastructure failures are counted separately from schema validity.

## Pass criteria, fixed before the run

| Criterion | Result |
| --- | --- |
| ≥ 90% valid after at most one repair pass with no re-prompt | 97% (117 of 120 schema-valid on the first call; 100% repair-valid) |
| 0 overflow at 390 and 1280 | **2 trees of 120 after verification** (1 desktop, 1 mobile), 0 in the few-shot run |
| ≥ 30 distinct hero skeletons in 60 | 58 and 58 |
| ≥ 40% novel | 90% and 88% |
| 0 pairs at or above threshold after the selector | 0 zero-shot; 3 few-shot (resolved by the collision re-prompt when run in order) |
| ≥ 70% rated designed by reviewers | not run; sheets and key prepared |

## Author's read of the renders (not a human test)

Desktop, grayscale, 120 heroes: the pages are coherent, the page system holds them together as it did for the recipes, and the first screens are more varied than Gate 2's sixty. The best of them (a ruled grid with the numeral in its own cell, a framed card beside a date column, a watermark monogram behind a right-aligned title, a full-bleed plate with a small dated card) are compositions the recipe library did not contain. The weakest are boxy: a Frame inside a Surface inside a framed hero, three levels of border. About a fifth of the heroes have the same silhouette family at a glance (numeral left, staggered title right) even though their skeletons differ. On mobile every tree holds; heroes are often taller than one screen because details were folded in.

Defects found only by rendering, all fixed as compiler rules during the proof: decorative numerals drawn at full opacity behind titles; display numerals overflowing thin rails; staggered titles ignoring fit demotion because their size was pinned to the display scale; nested insets compounding on mobile; arrangement motifs in pattern slots crashing the renderer.

## Verdict

The language is safe: 152 model trees, 46 adversarial payloads, zero unsafe output, every defect caught by validation, repair or geometry verification before a pixel reached a page, and the model was never re-prompted for anything but schema or collision. The language is expressive: it reproduces the recipe library and produced 58 distinct hero skeletons per 60, 90% of them outside the library, without a plateau.

What must change before it is canonical:
1. **Attractive-token caps in the batch planner**: staggered titles and hero numerals per batch, as the silhouette cap was for A.1.
2. **Geometry verification is the gate**; the estimate is advisory. Budget one headless render pass per candidate into the generation flow.
3. **Rewrite or drop the weight and registry directive dimensions**; they are not followed.
4. **Sibling candidates get different intents**, never the same intent with different seeds.
5. **Depth of boxes**: a lint on Frame-in-Surface-in-framed-hero (three borders) as a deviation, and a prompt line against it.
6. **Human test** on the prepared sheets before any claim about design quality.
