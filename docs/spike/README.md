# Phase 0 geometry-runtime spike

**Question (docs/development-plan.md, Phase 0):** can the locked Vercel Node runtime launch
serverless Chromium, render the production-shaped renderer with self-hosted fonts at 390 and
1280, and return deterministic DOM geometry reliably, within acceptable package size, cold
start, latency, memory and cost? The invariant under test: rendered-geometry verification is
server-side and authoritative before a `ResolvedDesignSpec` is persisted
(`docs/technology-decisions.md`, "Geometry verification runtime"). The customer browser is
never part of compilation.

## What the spike is

- `scripts/spike/build-fixture.mjs` builds `src/spike/fixture.generated.html`: A.1 site `01`
  rewritten as a CompositionTree, rendered by the real `proof-b/renderer.js` with the harness
  stylesheet and the site's two font families (`proof-a1/fonts`) inlined as data URIs. The
  measurement is the renderer's own `Renderer.measure` (text line counts, overflow, hero
  height), the same function `proof-b/verify.js` uses.
- `src/app/api/spike/geometry/route.ts`: a Node-runtime route (`maxDuration 60`) that launches
  `@sparticuz/chromium` through `playwright-core`, renders the fixture at 390 and 1280 `repeats`
  times in one browser, and returns timings, memory, environment, font-load checks and a
  determinism check (identical geometry across repeats). `SPIKE_TOKEN` protects it.
- `scripts/spike/run.mjs <baseUrl> --runs N --gap S --repeats R`: repeated invocations with
  optional idle gaps to observe cold starts; writes `docs/spike/results-<timestamp>.json` with a
  summary (success rate, determinism across invocations, cold/warm wall time, launch and render
  medians and p95, max RSS, region, memory size).

It is not the Phase 3 port: one fixed page, no compiler, no persistence, no model call. The
route and fixture are removed when the production verifier lands.

## Running it

```bash
# local production server (this container / your machine)
npm run build && npx next start -p 3100 &
node scripts/spike/run.mjs http://localhost:3100 --runs 8 --repeats 3 --out docs/spike/local-container-results.json

# deployed preview (after Vercel import; SPIKE_TOKEN as set in the project)
SPIKE_TOKEN=... node scripts/spike/run.mjs https://<preview>.vercel.app --runs 10 --repeats 3 --gap 0
SPIKE_TOKEN=... node scripts/spike/run.mjs https://<preview>.vercel.app --runs 5 --repeats 3 --gap 900 --out docs/spike/vercel-cold.json
```

Package impact: `@sparticuz/chromium` 67 MB (three brotli archives; inflates to ~200 MB in
`/tmp`), `playwright-core` 14 MB; both are `serverExternalPackages` and the archives are traced
into the function via `outputFileTracingIncludes` in `next.config.ts`.

## Results so far

### Local production server (this repository's CI-like Linux container, x86_64, Node 22)

`local-container-cold.json` (fresh process, empty `/tmp`) and `local-container-results.json`
(ten warm invocations). Every invocation renders 390 and 1280 three times each.

| Measure | Cold (1 run) | Warm (12 runs) |
| --- | --- | --- |
| Invocations succeeded | 1/1 | 12/12 |
| Geometry deterministic across the 3 repeats, both widths | yes | yes |
| Geometry identical across invocations (hero height 609.16 @390, 712.03 @1280) | yes | yes |
| Both font families loaded (`document.fonts.check`) | yes | yes |
| Overflow at 390 / 1280 | none | none |
| Browser archive inflate | 2.2 s | 0 (cached in `/tmp`) |
| Browser launch | 69 ms | 40 ms median, 43 ms p95 |
| Render + measure, 390 | 140 ms first, ~75 ms after | 75 ms median, 141 ms p95 |
| Render + measure, 1280 | 85 ms first, ~75 ms after | 73 ms median, 79 ms p95 |
| Wall time per invocation (6 renders) | 3.5 s | 0.65 s median, 1.2 s p95 |
| Process RSS after run | 241 MB | 263 MB max |
| Traced function size (route + externals) | 80 MB compressed archives; ~200 MB inflated in `/tmp` | |

Operational note: the package inflates `chromium`, `fonts/` and the swiftshader libraries into
`/tmp` once per instance and skips extraction when the first file of each set already exists.
Never delete part of that set (a partial `/tmp` made the browser exit on context creation
during this spike); on Vercel each instance starts with an empty `/tmp`, so this only matters
for local runs.

### Deployed Vercel preview

Not yet run: this repository's agent environment has no Vercel credentials and its network
policy refuses `api.vercel.com`. Run the two `run.mjs` commands above against the preview and
commit the two result files here; then record the verdict.

## Verdict

Pending the deployed runs. The local evidence supports **GO — Vercel serverless Chromium**
on every measure that does not depend on the platform (launch, fonts, determinism, geometry,
memory); the platform-dependent measures (cold start on Lambda, package acceptance under the
250 MB limit, `/tmp` capacity, execution time budget, cost per run) are what the deployed runs
confirm. The verdict is recorded in `docs/technology-decisions.md` and the Phase 0 row of
`docs/development-plan.md` only after those runs.
