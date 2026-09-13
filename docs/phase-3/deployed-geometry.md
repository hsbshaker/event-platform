# Phase 3 — deployed geometry verification

The Phase 0 spike proved the Vercel Node runtime could launch serverless Chromium at all. This
records the same question for the **finished verifier against the production renderer**, which is
the only thing that retests the packaging finding: a local pass says nothing about whether the
browser archives reached the deployed function.

Route: `/api/internal/verify-geometry` — fail-closed (404 without `SPIKE_TOKEN`, never in
production). Raw result: `deployed-geometry.json`.

## Run

Deployment `event-platform-dhtfnkpml` (branch `claude/phase-3-composition-engine`, after the
senior-review fixes), region `iad1`, `repeats=3`.

| case | what it exercises | result |
| --- | --- | --- |
| `novel` | a tree with no library counterpart, the normal creative path | clean, 0 demotions, hash preserved |
| `regression` | a structurally different composition — a centred framed hero on a contrast ground — so the run is not one page measured twice | clean, 0 demotions |
| `demotion` | `monumental` + long content, so the fit loop actually runs | clean after **2 demotions** |
| `refit` | short content verified, then long content re-fitted on the same tree | `hashPreserved: true`, `treePreserved: true`, `contentVersion: 2`, `supersedesSpecId` set, clean |
| `determinism` | the novel case measured three times in one function | **1 distinct geometry** across 3 runs |

Both widths (390 and 1280) in every case; `desktopOverflow` and `mobileOverflow` false throughout.

## Latency

| | total | novel case |
| --- | --- | --- |
| cold (invocation 1) | 9,273 ms | 3,504 ms |
| warm (earlier deployment) | 4,570 ms | 503 ms |

The cold delta is Chromium inflate + launch, consistent with the Phase 0 numbers. Warm renders are
~0.5 s per page across both breakpoints.

## Fonts

Every case reported its required families as loaded. No case draws on the legacy fixture library: this module is production source, and
`docs/event-renderer-system.md §7.1` lets only the two named adapters reach it. Expressiveness
against the real fixtures is a local gate — `tests/unit/phase3-exit.test.ts` renders all 26
silhouettes, all 13 recipes and all 16 A.1 pages. What this route proves is the runtime.

The `demotion` case deliberately uses
`grotesk_space_sourcesans` — the pairing whose unquoted `Source Sans 3` family name silently broke
`font-family` before this phase — and both `Space Grotesk` and `Source Sans 3` load. Geometry is
never declared clean on fallback typography: a missing font is an infrastructure failure.

## Packaging

`next.config.ts` traces `@sparticuz/chromium`, `playwright-core` and `react-dom` whole for this
route, and the event stylesheet and font directory globally. The whole-package rule is the Phase 0
finding and must not be narrowed: both browser packages read files by path at runtime that static
tracing does not see. A missing package is fail-closed — `browser.ts` turns the failed import into
an explicit `infrastructure` verification failure rather than a measurement.

**Any route or server action that calls `verifyGeometry` must add its own tracing key**, spreading
`GEOMETRY_BROWSER_PACKAGES`. The browser packages are keyed per route rather than globally because
they cost ~81 MB and the landing page should not carry Chromium.

## Not measured here

Memory: `AWS_LAMBDA_FUNCTION_MEMORY_SIZE` is unset on this runtime, so the Phase 0 `/proc`-based
browser RSS reading is the standing evidence for memory rather than anything in this run.
