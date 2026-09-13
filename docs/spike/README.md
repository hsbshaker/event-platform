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
  determinism check (identical geometry across repeats). It is 404 unless `SPIKE_TOKEN` is set
  and presented as `x-spike-token`, and always 404 in the production environment.
- `scripts/spike/run.mjs <baseUrl> --runs N --gap S --repeats R`: repeated invocations with
  optional idle gaps to observe cold starts; writes `docs/spike/results-<timestamp>.json` with a
  summary (success rate, determinism across invocations, cold/warm wall time, launch and render
  medians and p95, max RSS, region, memory size).

It is not the Phase 3 port: one fixed page, no compiler, no persistence, no model call. The
route and fixture are removed when the production verifier lands.

## Running it

```bash
# local production server (this container / your machine)
npm run build && SPIKE_TOKEN=local npx next start -p 3100 &
SPIKE_TOKEN=local node scripts/spike/run.mjs http://localhost:3100 --runs 8 --repeats 3 --out docs/spike/local-container-results.json

# deployed preview (after Vercel import; SPIKE_TOKEN as set in the project)
SPIKE_TOKEN=... node scripts/spike/run.mjs https://<preview>.vercel.app --runs 10 --repeats 3 --gap 0
SPIKE_TOKEN=... node scripts/spike/run.mjs https://<preview>.vercel.app --runs 3 --repeats 3 --gap 900 --out docs/spike/vercel-cold.json
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
| Geometry identical across invocations (hero and document height every repeat; hero 609.16 @390, 712.03 @1280) | yes | yes |
| Both font families loaded (`document.fonts.check`) | yes | yes |
| Overflow at 390 / 1280 (page, element and text-node overflow from `Renderer.measure`) | none | none |
| Module import (`@sparticuz/chromium`, `playwright-core`) | 0.5 s | 0 |
| Browser archive inflate | 2.5 s | 0 (cached in `/tmp`) |
| Browser launch | 71 ms | 41 ms median, 58 ms max |
| Render + measure, 390 | 144 ms first, ~70 ms after | 71 ms median, 129 ms p95 |
| Render + measure, 1280 | 76 ms first, ~70 ms after | 68 ms median, 77 ms p95 |
| Wall time per invocation (6 renders) | 3.8 s | 0.63 s median, 1.1 s p95 |
| Node process RSS after run (excludes the Chromium child process) | 286 MB | 288 MB max |
| Traced function size (route + externals; sum of the files listed in `.next/server/app/api/spike/geometry/route.js.nft.json`) | 80 MB, of which 67 MB are the compressed browser archives; ~200 MB inflated in `/tmp` | |

Browser memory is not measured locally; the deployed run's "Max Memory Used" in the Vercel
function log is the memory evidence.

Operational note: the package inflates `chromium`, `fonts/` and the swiftshader libraries into
`/tmp` once per instance and skips extraction when the first file of each set already exists.
Never delete part of that set (a partial `/tmp` made the browser exit on context creation
during this spike); on Vercel each instance starts with an empty `/tmp`, so this only matters
for local runs.

### Deployed Vercel preview

Project `event-platform` (team `haseeb-shakers-projects`), preview of this branch at
`https://event-platform-git-claude-phase-5ca18b-haseeb-shakers-projects.vercel.app`; Fluid
compute, Standard memory class (project settings), region `iad1`, Node `v22.23.2`, Chromium
`153.0.8010.0`. Files: `vercel-first-cold.json` (first invocation after the packaging fix),
`vercel-warm.json` (ten back-to-back invocations, of which run 1 was that instance's cold
start), `vercel-cold.json` (three invocations separated by 15-minute idle gaps, two of them
cold), `vercel-memory.json` (three invocations, one of them cold, on the build that reads Chromium
memory from `/proc`).

Columns: the first invocation on a fresh instance; the 9 warm invocations of the ten-run series;
the 2 cold invocations that followed idle gaps. The ten-run series' own run 1 and the
`vercel-memory.json` runs are counted where noted.

| Measure | First cold instance | Warm (9 of the 10-run series) | Cold after idle (2 runs) |
| --- | --- | --- | --- |
| Invocations succeeded | 1/1 | 10/10 in the series | 3/3 in the series |
| Geometry deterministic across the 3 repeats, both widths | yes | yes | yes |
| Geometry identical across invocations and identical to the local container (hero 609.16 @390, 712.03 @1280) | yes | yes | yes |
| Both font families loaded | yes | yes | yes |
| Overflow (page, element, text) | none | none | none |
| Module import | 0.9 s | 0 | 0.9 s, 1.1 s |
| Browser archive inflate | 2.2 s | 0 | 2.3 s, 3.1 s |
| Browser launch | 63 ms | 39 ms median, 44 ms p95 | 91 ms, 101 ms |
| Render + measure, 390 | 201 ms first, 117–143 after | 148 ms median, 181 ms p95 | 201–275 ms first, 85–238 after |
| Render + measure, 1280 | 166 ms first, 140–153 after | 138 ms median, 168 ms p95 | 180–183 ms first, 160–217 after |
| Browser close | 1.6 s | 0.2 s or 1.5–1.8 s (bimodal) | 0.2 s, 1.6 s |
| Function time (6 renders) | 5.7 s | 1.1–2.7 s | 4.6 s, 7.3 s |
| Wall time as seen by the caller | 6.8 s | 1.4–3.0 s (median 2.7 s) | 7.1 s, 9.7 s |
| Node process RSS | 222 MB | 175 MB max | 171 MB, 228 MB |
| Chromium processes RSS (from `/proc`, added after these series) | not measured | 197–202 MB, with Node 172–174 MB in the same runs (`vercel-memory.json`, 3 invocations on the instrumented build, one of them cold) | not measured |

Packaging finding: Vercel's static file tracing omitted `playwright-core/browsers.json`, which
the library reads at runtime, and the first deployed invocation failed with "Cannot find module";
both packages are now traced whole via `outputFileTracingIncludes` (93 MB function, per the
Vercel build output). The
fail-closed gate was confirmed on the deployment: 404 with no token configured, 403 with a wrong
token, 200 with the token, and 404 by construction in the production environment.

## Verdict

**GO — Vercel serverless Chromium**, recorded in `docs/technology-decisions.md` ("Phase 0 spike
verdict") and the Phase 0 row of `docs/development-plan.md`. Every platform-independent measure
(launch, fonts, determinism, geometry) and every platform-dependent one (cold start, package
acceptance, `/tmp` capacity, memory class, execution budget, cost) came in with margin; no
measured blocker exists, so the render-worker option is not adopted. Two things carry into the
Phase 3 verifier: serialize the first-request browser extraction per instance (the package's
`existsSync` gate is not atomic under concurrent cold requests), and treat the route's
`coldStart` flag as per-instance, not per-request.
