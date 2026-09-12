# Phase B proof — AI-authored composition over trusted primitives

> **On `main`:** this directory is the reference subset — source (`src/`, `dist/`), fixtures, tests, the pipeline scripts, the prompt, the schema, the harness, the write-ups, and the frozen confirmation-run data (`model/final/`, `model/final-reduced/`). Screenshots (`shots/`), compiled specs (`specs/`), the exploratory runs (`model/zero|few|reduced|collapse/`), judge output and the PNG sheets are only at the tag `proof-b-frozen` (`git checkout proof-b-frozen -- proof-b/shots`, or `git worktree add ../proof-b-full proof-b-frozen`). `test.js` and `adv-run.js` run from `main` as-is; `render-set.js`/`verify.js` need headless Chromium and regenerate `specs/` and `shots/` locally. The library depends on `../proof-a1/sites.js`, `vocab.js` and `fonts.css`, also on `main`.

Proof of the composition language proposed in `PROPOSAL.md`, built from the frozen Phase A.1 evidence. Nothing here is canonical; `spec.md`, the renderer docs, the model contracts and `CLAUDE.md` are untouched.

Five changes from the proposal, as agreed before implementation:
1. Semantic components are conditional on the event's capabilities (`Capabilities` in `composition.ts`; the prompt lists what is not available; the validator drops references to unavailable capabilities as `capability` repairs).
2. Directives are not a layout library: nine independent dimensions (103,680 combinations) assembled into a sentence; compliance is measured per dimension; `distinctPerStructureDirective` shows how many hero skeletons one directive value produced.
3. Content fit is estimated in the compiler and then **verified against rendered DOM geometry** at both breakpoints (`verify.js`, headless Chromium, `--dump-dom`); verified demotions are logged as `fit-verified`, separately from estimates.
4. Schema validity (raw model output), deterministic-repair validity, and human design quality are separate metrics (`evaluate.js`, `human-test-*`).
5. The model is re-prompted only for schema-invalid output (once) or a selector collision (once). Deterministic repairs never call the model and are reported by kind.

## Files

| File | What |
| --- | --- |
| `PROPOSAL.md` | The architecture proposal (unchanged). |
| `src/composition.ts` → `dist/composition.js` | The language: types, spec table (single source of truth for validation and the prompt), strict schema validation, structural validation, deterministic repair, content-fit estimate, canonicalization, layout resolution, skeleton signature. |
| `library.js` | The 27 A.1 hero silhouettes and 13 section recipes rewritten as trees; the six surface plans; the sixteen A.1 pages as trees. |
| `renderer.js`, `harness.html` | Primitive renderer (one render function per node type; CSS keyed by classes and numeric custom properties from the layout map) and the throwaway harness. `?lib=NN` renders an A.1 page as a tree; `?hero=key` a lone silhouette; `?spec=path` a compiled spec; `?set=path` a gallery; `&measure=1` emits geometry. |
| `fixtures/adversarial.js`, `test.js` | 36 structural fixtures and 10 schema-invalid payloads; unit tests for every repair rule. |
| `adv-run.js` | Compiles, verifies and renders every adversarial fixture. Results in `fixtures/adversarial-render.json`. |
| `directives.js`, `prompt.js` | Directive dimensions and compliance; the composition prompt (spec and rules generated from `composition.ts`). |
| `compile.js`, `verify.js` | Deterministic pipeline to `ResolvedDesignSpec`; DOM-geometry content-fit verification. |
| `run-model.js`, `render-set.js`, `evaluate.js` | The model runs, their rendering, and the metrics. |
| `model/<run>/` | `results.json` (raw trees, repairs, calls), `results-verified.json`, `metrics.json`, `raw/` (verbatim model output), `prompt-sample.txt`. Runs: exploratory `zero`, `few`, `reduced`, `collapse`; confirmation `final` (60, 20 sibling batches) and `final-reduced` (12, 4 batches). |
| `specs/<run>/`, `shots/<run>/` | Compiled specs and screenshots (390 gray, 390 color, 1280 gray). |
| `library-heroes-*.png`, `compare-a1-vs-tree-1280.png` | Expressiveness evidence: the 27 silhouettes through the primitive renderer; the sixteen A.1 pages, recipe render beside tree render. |
| `adversarial-heroes-1280-gray.png` | The 36 repaired adversarial trees rendered. |
| `human-test-*-unlabeled.png`, `human-test-key.txt` | 20 model heroes and 20 library heroes shuffled; the key is not for reviewers. |
| `RESULTS.md` | Exploratory-run numbers, pass criteria, visual read, verdict. |
| `FREEZE.md`, `FINAL.md` | The frozen file set and the confirmation run: schema, repairs, geometry, invention, tokens, collisions, review; recommendation. |
| `planner.js` | Sibling planner: distinct intents, directives, attractive-token allotments. |
| `judge.js`, `score-human.js`, `human-test-form.md`, `judge/` | Design-quality review protocol; AI-proxy reviewer runs and scores. |
| `gen-schema.js`, `composition.schema.json` | The canonical JSON Schema generated from the validator table. |

## Regenerate

```
npm run build && node test.js
node adv-run.js
node run-model.js model/zero 60 20260912 zero && node render-set.js zero && node evaluate.js zero
```
