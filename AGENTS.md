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

## Phase 1 placeholders to close in later phases

- **Co-host invitations**: RLS currently lets the owner insert a `cohost` membership for any
  profile id. When the invitation flow lands (spec.md §6.2, §27 "explicit, invitation-based"),
  move that write server-side and revoke the end-user `insert` on `event_members`.
- **Signup throttling**: `enforceSignupThrottle` in `src/lib/auth/rate-limit.ts` has no caller
  until Phase 2 adds the server-mediated auth entry point; until then the only signup limit is
  `[auth.rate_limit]` in `supabase/config.toml`.
- **Pre-auth cleanup job**: pick one cutoff timestamp, run
  `expired_pre_auth_storage_keys(cutoff)`, delete those Storage objects, then
  `purge_expired_pre_auth_state(cutoff)` (same cutoff, so objects are never orphaned). Schedule
  it in Phase 2 with the upload flow. A claim re-parents an asset from its draft to the event
  (exactly one owner). The privacy action must write the encrypted access code before, or in
  the same service-role transaction as, switching a published event to private.
- **Event creation**: end users may insert `DRAFT` events directly (server-managed columns are
  rejected by trigger). Phase 2 creates the event server-side when a pre-auth draft is claimed
  (spec.md §7.2 step 5); revoke the end-user `insert` on `events` at that point.
