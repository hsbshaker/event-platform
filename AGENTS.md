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
