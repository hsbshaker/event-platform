# AGENTS.md

Entry point for coding agents working in this repository. Read `CLAUDE.md` first: it
sets the source-of-truth order, product principles, locked stack, guardrails and PR
contract. This file adds the engineering conventions of the application package.

## Next.js

This project uses **Next.js 16 (App Router)**. Its conventions differ from older
versions: before touching Next.js code read the relevant guide in
`node_modules/next/dist/docs/01-app/` (installed with `npm ci`), in particular:

- `01-getting-started/02-project-structure.md`
- `01-getting-started/05-server-and-client-components.md`
- `01-getting-started/07-mutating-data.md` (Server Actions)
- `01-getting-started/15-route-handlers.md`
- `01-getting-started/16-proxy.md` (`proxy.ts` replaces `middleware.ts`)

Heed deprecation notices in those docs over training-data habits.

## Conventions

- **Secrets** are read only through `serverEnv()` in `src/lib/env.ts` from server code, or
  through a named accessor in that same file for an optional one (`cronSecret()`). Never read a secret straight from `process.env` elsewhere: the schema is
  what rejects a malformed or trivially weak value. `NEXT_PUBLIC_*` values are the only ones
  that reach the browser, and because Next.js inlines them at build time they must be
  available to the build — on Vercel that means they must not be marked "Sensitive".
- **Supabase clients**: `src/lib/supabase/server.ts` in Server Components, Server Actions
  and Route Handlers; `client.ts` in Client Components; `admin.ts` (service role, bypasses
  RLS) only after the caller has been authorized with `src/lib/auth` and only for
  server-managed tables. Never return a service-role client or its key to the client.
- **Authorization**: check permissions with `src/lib/auth` (`requireUser`,
  `requireEventAccess`, `can`). RLS is the backstop, not the only check. Permissions
  follow `spec.md §25` exactly.
- **Migrations**: `supabase/migrations/<timestamp>_<name>.sql`, forward-only, applied in
  order by `supabase db reset` and by `tests/db`. Every new table enables RLS in the same
  migration. Server-only tables get no `authenticated`/`anon` policies and have their
  grants revoked.
- **Styling**: semantic tokens only (`docs/design-system.md §23`). App chrome under
  `src/components/app`; the house-style guest page uses the same app tokens. Card styling and
  card fonts (`src/styles/card-fonts.css`) belong to the card renderer only and are never
  imported by app or guest-page components (`docs/design-system.md §15.1`, `§23.7`).
- **Tests**: unit tests next to the code as `*.test.ts`; database tests in `tests/db`.
  Run `npm run lint && npm run typecheck && npm test` before reporting; `npm run test:db`
  when a migration or policy changed.
- **Model calls**: only through `src/lib/ai/provider.ts` (`getAiProvider()`: `generateEventIdentity`,
  `extractEventFacts`, `generateCardDesign`, `generateCardArt`, `moderateCardArt`,
  `inspectCardArt`). Every method takes the `MeterContext` of a generation begun with
  `startGeneration` (`src/lib/ai/generations.server.ts`) and runs inside the meter
  (`src/lib/ai/meter.server.ts`): kill switch, running generation, daily spend ceiling, then a
  recorded run. Never call the provider's API any other way. The card compiler — validation,
  wording fact check, ink and legibility, `layoutCard` — and the renderer never call a model
  (`docs/card-system.md §4`).
- **Card code** lives under `src/lib/card/` (colour maths, typography pairings, the layout set and
  shapes, `CardDesign` validation, the wording check, art-prompt assembly; the rest of the
  compiler and the fixtures are being built in Phase 4). The generated card's text is laid out by `layoutCard`,
  and every edited text box is broken by one deterministic function with its lines stored
  (`docs/card-system.md §7`); never let the browser re-wrap card text and never derive CSS from
  model output. The card editor edits the text layer only.

## Phase 2 notes

- **Event creation is server-side only.** End users have no `insert` on `events`; the only
  paths are `claim_pre_auth_draft` (this browser's cookie) and `claim_pre_auth_draft_by_email`
  (the address the session proves control of, for a link opened in another browser), both
  called from the auth callback with the service role. Both delegate to one locked body, so a
  retried, concurrent, or mixed pair of callbacks returns the first event rather than creating
  a second.
- **The draft cookie** (`ep_draft`, httpOnly, `SameSite=Lax`) is what carries the prompt and
  inspiration through the OAuth redirect. The database stores only its keyed hash.
- **Inspiration** is private: allowlisted image types, magic-byte sniffed, at most 6 files of
  4 MB each per draft, read back through short-lived signed URLs, re-parented to the event on
  claim, and removed by the scheduled cleanup when a draft is abandoned. The 4 MB ceiling is
  the platform's serverless request-body limit, not a preference: the upload route buffers the
  whole body, so a larger documented limit would be rejected before our code runs. Raising it
  means moving to a signed direct-to-Storage upload first.
- **Required details never block anything.** They are §23.1 publish requirements collected
  while generation runs; no code path gates on them.

## Phase 1 placeholders to close in later phases

- **Co-host invitations**: RLS currently lets the owner insert a `cohost` membership for any
  profile id. When the invitation flow lands (spec.md §6.2, §27 "explicit, invitation-based"),
  move that write server-side and revoke the end-user `insert` on `event_members`.
- **Signup throttling**: now called from `signInWithEmail` in `src/app/actions/auth.ts`. OAuth
  sign-in starts at the provider, so it is throttled by Supabase's own limits rather than here.
- **Pre-auth cleanup job**: implemented in Phase 2 at `/api/cron/purge-pre-auth` and scheduled
  daily by `vercel.json`. It needs `CRON_SECRET` set on the deployment, and is 404 without it. A claim re-parents an asset from its draft to the event
  (exactly one owner).
- **Privacy**: closed in Creation Mode slice 3 — every visibility change goes through the privacy
  action (`src/app/actions/privacy.ts`, `set_event_privacy` / `rotate_event_code`), which writes
  the encrypted event code in the same service-role transaction as switching to private;
  `events.visibility` is server-managed (`protect_event_server_columns`).
- **Event creation**: closed in Phase 2 — the end-user `insert` on `events` is revoked and
  creation happens inside `claim_pre_auth_draft`.
