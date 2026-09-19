# Phase 4 — QA preview deployment, and the defect that stops it

**Status: the deployment is live and correct; generation cannot start on it.** The blocker is a
configured spend ceiling that is smaller than the reservation one generation call must place
against it, so every `EventIdentity` call is refused before it begins. It is a one-value operator
decision, and it is not preview-specific — the same value is configured for production.

## What was completed

| | |
| --- | --- |
| Preview deployment | `dpl_3LkxDSLbpMBLL4owpX1C9zA1TaBg`, READY, commit `00c646e9` |
| QA URL | `https://event-platform-git-claude-design-7ad5b1-haseeb-shakers-projects.vercel.app` |
| Branch | `claude/designintent-sibling-convergence-hl508n` (preview target; production is `main`) |
| Preview Supabase | `ihdaifbyvlvivuctkrwn` — **six migrations applied**, now matching HEAD |
| Protection | none; the URL is publicly reachable, so no auth was weakened for QA |

**Preview Supabase was six migrations behind, not one.** The Phase-4 handoff named only
`20260919180000`. In fact the project was applied through Phase 4B and missing everything from
`20260917000000` onward — `generation_batches`, `generation_batch_siblings`,
`design_intent_artifacts`, the composition and artwork lineage, and the stale-batch recovery RPC.
All six are additive (zero `drop`/`truncate`/`delete` statements, checked before applying). Applied
in filename order through the Management API. Before: 15 public tables, 47 functions, 0 events, 1
profile. After: 19 tables, 65 functions, same rows. The function set now matches the local schema
exactly — 65 each, no differences either way.

Preview still has **no `supabase_migrations` ledger** (`CLAUDE.md §13.0`), so the applied set was
determined by probing for each migration's marker objects rather than read from a table. No ledger
was created: a partial one would mislead `supabase db push` into replaying Phase 1.

## The blocker

`claim_identity_call` admits a call only when

```sql
v_recorded + v_reserved + p_logical_call_max_usd <= p_ceiling_usd
```

`p_logical_call_max_usd` is the worst case one logical call can cost — `perAttemptMaxUsd` ($15,
from the verified `gpt-5.6-sol@2026-09-16` profile) × `MAX_PROVIDER_ATTEMPTS_PER_CALL`
(`EVENT_IDENTITY_PASSES` 2 × (`MAX_TRANSIENT_RETRIES` 2 + 1) = 6) = **$90**.

`IDENTITY_CEILING_USD` is configured as **25**, on one entry covering **preview and production**.

So `0 + 0 + 90 > 25` on a completely idle project, and the claim is refused before any provider is
reached. The server action returns 200 carrying the frozen refusal payload, the surface reports
`temporarily_unavailable`, and no claim, revision or run row is ever written. That matches what the
preview database showed after two attempts: `claims 0, revisions 0, runs 0, batches 0`.

**This is not a preview-only problem.** The same entry configures production, so no deployment of
this product can currently run `EventIdentity`.

It has never been caught because `isProductionRuntime()` is false locally, where `DEV_CEILING_USD`
is $3,000 — so every local smoke, including the 4D, 4E and 4G runs, reserved against a ceiling 33×
larger than the deployed one.

## Why this was not fixed here

Raising it is a financial decision with a named owner, and the code says so itself: *"How much this
product is willing to lose in a day is a financial choice with a real owner, and inheriting a number
a developer picked for local convenience is not that choice being made — it is that choice being
skipped."* The task's instruction was also explicit: do not silently raise the limit.

The ceiling cannot be worked around from the other side either. `IDENTITY_PROVIDER_ATTEMPT_MAX_USD`
is deliberately `Math.max(override, profile.perAttemptMaxUsd)` — an environment variable may make
the bound more conservative, never less.

## What the requested $2.00 QA ceiling would do

It would make the blocker worse, and it cannot be implemented as asked. The ceiling is not a cap on
money spent; it is pre-authorisation headroom checked against a worst case. At $2 nothing is ever
admitted. A branch-scoped `IDENTITY_CEILING_USD=2` was created during this task, found to be
unworkable for that reason, and **removed** — the variable is back to its single original entry, so
nothing is left behind that would trap a later fix.

The real bound on this smoke's spend is elsewhere and is already configured: `IDENTITY_EVENT_DAILY_MAX`
is 20 logical calls per event per day, and artwork is unreachable from the app by construction
(`artworkStageDepsForBatch(admin, { authorized: false })` returns `null`), so image spend is $0
rather than merely bounded. A full batch measured **$0.18** on 2026-09-19.

## What was proven on the deployment before the blocker

Driven over the app's own HTTP surface, signed in as a preview-only identity through Supabase's own
auth library:

- the deployment serves (`/` and `/signin`, HTTP 200);
- a real session is established and carried;
- `createEvent` runs as a server action and persists an event from the frozen prompt;
- the create page's server actions are all present and reachable — `startEventIdentityForEvent`,
  `readEventIdentityForEvent`, `submitClarificationAnswer`, `readGenerationForEvent`,
  `startConceptGenerationForEvent`, `loadGenerationView`;
- `startConceptGenerationForEvent` **correctly refused** to plan a batch with no authoritative
  identity, scheduling nothing — the guard working, not a defect.

## What remains unproven

Everything the deployed run was meant to establish: that the batch starts from the button, that
`after()` survives the response, that Chromium launches inside the deployed function, that geometry
verification runs at 390 and 1280 there, that concepts arrive and previews render. None of it can
be reached until a call can be admitted.

Separately, and independently of the ceiling: **no browser drove this deployment.** Playwright's
Chromium in this environment trusts no CA — every HTTPS navigation fails
`ERR_CERT_AUTHORITY_INVALID`, including to `example.com` — `certutil` is unavailable to add the
proxy CA to the NSS store, and pinning the CA's SPKI is refused as a TLS weakening. The HTTP drive
above crosses the same server seams but renders nothing, so there are no screenshots and no
evidence about layout, paint or clicks.

## Files

| Path | What it is |
| --- | --- |
| `raw-prompt.txt` | the frozen QA prompt, committed before the smoke that submits it |
| `generation-timeline.jsonl` | every observed transition from the deployed attempts |
| `deployment-summary.json` | deployment, Supabase and environment facts |
