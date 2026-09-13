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

- **Secrets** are read only through `serverEnv()` in `src/lib/env.ts` from server code.
  `NEXT_PUBLIC_*` values are the only ones that reach the browser.
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
  `src/components/app`, renderer under `src/components/event-renderer`; the ESLint boundary
  rule blocks cross-imports.
- **Tests**: unit tests next to the code as `*.test.ts`; database tests in `tests/db`.
  Run `npm run lint && npm run typecheck && npm test` before reporting; `npm run test:db`
  when a migration or policy changed.
- **Model calls**: only through `src/lib/ai/provider.ts`. The compiler/renderer never
  calls a model.

## Phase 2 notes

- **Event creation is server-side only.** End users have no `insert` on `events`; the only
  path is `claim_pre_auth_draft`, called from the auth callback with the service role. It
  decides under a row lock, so a retried or concurrent callback returns the first event rather
  than creating a second.
- **The draft cookie** (`ep_draft`, httpOnly, `SameSite=Lax`) is what carries the prompt and
  inspiration through the OAuth redirect. The database stores only its keyed hash.
- **Inspiration** is private: allowlisted image types, magic-byte sniffed, at most 6 files of
  10 MB each per draft, read back through short-lived signed URLs, re-parented to the event on
  claim, and removed by the scheduled cleanup when a draft is abandoned.
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
  (exactly one owner). The privacy action must write the encrypted access code before, or in
  the same service-role transaction as, switching a published event to private.
- **Event creation**: closed in Phase 2 — the end-user `insert` on `events` is revoked and
  creation happens inside `claim_pre_auth_draft`.
