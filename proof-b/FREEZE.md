# Phase B freeze

Frozen on 2026-09-12T16:16Z before the confirmation run. No file below changed during or after the run.

| File | sha256 |
| --- | --- |
| `src/composition.ts` | 416a1c857fc29d88 |
| `dist/composition.js` | f3bb4d257393516f |
| `renderer.js` | 20d88666247f0735 |
| `harness.html` | f527609c068f4017 |
| `prompt.js` | 5bf70f71808f1648 |
| `planner.js` | 9569c24537587667 |
| `directives.js` | dcf932777c3edc8d |
| `compile.js` | 3df145e4ee7b55e1 |
| `verify.js` | b8d3db8fd33f89f7 |
| `run-model.js` | 7ef752745728a27a |
| `render-set.js` | 034b900b5d351479 |
| `evaluate.js` | 0b6042cb8742b067 |
| `library.js` | b64412cd6d13ca46 |
| `fixtures/adversarial.js` | fc87a5cf0bb41e12 |

Versions: primitiveSet composition_v1 · compiler proof-b-0.2 · compositionPrompt composition_v1_p2 · compositionSchema composition_v1 · model claude-sonnet-5 · planner caps {"staggerTitle":1,"heroNumeral":1,"watermark":1}

Confirmation run: `node run-model.js model/final 0 20260921 few --batches 20` (60 trees, 20 sibling batches) and `node run-model.js model/final-reduced 0 20260922 few --batches 4 --caps reduced` (12 trees).
