# Event Platform

AI-native event website, RSVP and registry platform. Product, architecture and acceptance
criteria live in [`spec.md`](spec.md); the locked stack in
[`docs/technology-decisions.md`](docs/technology-decisions.md); the build sequence in
[`docs/development-plan.md`](docs/development-plan.md). Agents start from
[`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md).

## Getting started

Requirements: Node 22 (`.nvmrc`), npm, and for database work either the
[Supabase CLI](https://supabase.com/docs/guides/local-development) with Docker or any
Postgres 16+ instance.

```bash
npm ci
cp .env.example .env.local        # fill in Supabase keys and APP_ENCRYPTION_KEY
npm run dev                       # http://localhost:3000
```

### Local Supabase

```bash
npx supabase start                # local stack from supabase/config.toml
npx supabase db reset             # applies supabase/migrations in order
npm run db:types                  # regenerate src/lib/supabase/database.types.ts
```

### Checks

| Command              | What it runs                                                                                                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`       | ESLint (Next.js rules + the app/event boundary rule)                                                                                                                                                                                                                                                 |
| `npm run typecheck`  | `tsc --noEmit`                                                                                                                                                                                                                                                                                       |
| `npm test`           | Vitest unit tests (`src/**/*.test.ts`, `tests/unit`)                                                                                                                                                                                                                                                 |
| `npm run test:db`    | Migration + RLS integration suite against `TEST_DATABASE_URL`; installs an `auth` schema stub, applies `supabase/migrations`, and exercises policies as `anon`, `authenticated` and `service_role`. Runs on Postgres 16 locally and Postgres 17 (the Supabase major in `supabase/config.toml`) in CI |
| `npm run proof:test` | The renderer proof regression suite in `proof-b/`                                                                                                                                                                                                                                                    |
| `npm run build`      | Production build                                                                                                                                                                                                                                                                                     |

CI (`.github/workflows/ci.yml`) runs all of the above on every pull request.

## Layout

```text
src/app/                    App Router routes (route shells; features arrive by phase)
src/components/app/         Canonical product components (design-system.md §10)
src/components/event-renderer/  One component per composition primitive (Phase 3)
src/styles/app-tokens.css   Application chrome tokens (design-system.md §6)
src/styles/event-tokens.css Renderer-owned tokens; never imported by app chrome
src/lib/env.ts              Validated environment (server secrets stay server-only)
src/lib/supabase/           Browser, server, proxy and service-role clients
src/lib/auth/               Permission matrix and server-side authorization helpers
src/lib/ai/                 Thin model-provider boundary (implemented in Phase 4)
src/proxy.ts                Session refresh on every request
supabase/                   Project config and migrations
tests/db/                   Migration and RLS integration tests
proof-b/, proof-a1/         Renderer proof reference (not product code)
```

## Phase status

See `docs/development-plan.md`. Phase 0 items that need an operator: the Vercel
project and preview deployment, the serverless-Chromium geometry spike and the human
design test #1. Everything else in Phase 0 and the Phase 1 data/auth/security
foundation is in this repository.
