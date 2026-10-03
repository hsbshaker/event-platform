# Phase 4 — first full pipeline run on the deployed QA preview

One live batch against the deployed preview, run to verify that the re-derived EventIdentity spend
bound (`$90 → $21` per logical call) actually admits a call on a real deployment, and that nothing
downstream of the ceiling was broken while the ceiling hid it.

| | |
| --- | --- |
| Deployment | `event-platform-git-claude-design-7ad5b1-haseeb-shakers-projects.vercel.app` |
| Commit | `6e4c907` |
| Supabase | preview, ref `ihdaifbyvlvivuctkrwn` — **not** production |
| Event | `9f911c58-60aa-42ef-9ca8-e081396514b3` |
| Wall clock | 151.9s, prompt submitted to third concept verified |
| Spend | **$0.4793** across 8 model calls, 0 artwork slots |

The prompt is the frozen QA prompt (`scripts/qa/engagement-brunch-prompt.mjs`, committed in
`ac30ae8` before any run submitted it). `raw-prompt.txt` is what was actually sent.

## What this run establishes

- **The deployed runtime reaches the provider.** The preview `OPENAI_API_KEY` had never been
  exercised: the spend ceiling refused every identity call before a client was constructed, so a
  bad key and a refused claim were indistinguishable until the bound was fixed.
- **Rendered-geometry verification runs on Vercel.** All three concepts came back
  `verified_clean: true` with `authoritative: "rendered-geometry"`, no overflow at 390 or 1280.
  This is the headless Chromium pass executing in the deployed function, not locally.
- **Three distinct directions, not one in three shades.** `Citrus Rhythm` (Fraunces / Manrope),
  `Loose Botanicals` (Playfair Display / DM Sans), `Natural Poise` (Instrument Serif / Manrope).
- **The spend provenance is recorded.** The claim's `provider_config` carries
  `attemptProfileVersion: event_identity_attempt_v2@2026-10-03` beside
  `costProfileVersion: gpt-5.6-sol@2026-09-16` and `maxOutputTokens: 32000`.
- **Concept previews are collaborator-only.** All three render at 200 from the persisted resolved
  spec; an anonymous request returns 404 rather than a redirect that would confirm the event exists.

## What it does not establish

- **It was driven over HTTP, not through a browser.** Server actions were invoked directly with
  `Next-Action` headers. No client JavaScript ran, so the progress surface, its polling, the
  reconnect behaviour and the rendered previews were verified by their server responses and
  database rows rather than by a person or a browser looking at them. Chromium cannot reach any
  HTTPS host from the agent container (the egress proxy re-terminates TLS and the browser-trust fix
  is refused by the sandbox), so operator verification in a real browser is still outstanding.
- Latency targets were missed, consistently: identity authoritative at ~41s, concepts pending at
  48s, running at 73s, all three settled at 148s, against targets of 5s / 15s / 45s.
- `hasConceptName: false` in `run-summary.json` is expected — the preview renders the event site,
  which does not carry the internal concept name.

## The defect this run exposed

Seven of the eight `generation_runs` rows persisted `cost_estimate_usd = NULL`: only
`event_identity` (and `artwork`, unused here) ever recorded one. `plan_generation_batch` costs a
null at the per-run maximum (`docs/phase-4b-plan.md §A.5.1` rule 3, currently $48), so this single
successful batch put the project ceiling sum at **$336.06** against a $25 ceiling and refused every
subsequent batch for the 24-hour window.

It had been invisible because the identity call was itself refused by the ceiling, so no batch had
ever completed on a deployment.

The seven rows were corrected in place on the preview database, with the operator's authorisation,
by pricing the token counts already stored on them at the verified `gpt-5.6-sol` standard rates —
the values the fixed code would have written. Ceiling sum before `$336.06` / 7 null rows; after
`$0.48` / 0 null rows; same 8 rows throughout, none deleted. The code fix is tracked separately.

## Files

| file | what it holds |
| --- | --- |
| `raw-prompt.txt` | the exact prompt submitted |
| `generation-timeline.jsonl` | one line per observed transition, with elapsed ms |
| `provider-telemetry.jsonl` | per-call model telemetry as the run recorded it |
| `run-summary.json` | batch, geometry verification, preview responses, run rows, artwork slots |
