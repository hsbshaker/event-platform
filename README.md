# Event Platform

AI-designed event invitations, with RSVP and registry. A host describes the event; the AI
designs an invitation card (generated artwork + real text) that guests open from an envelope,
above a standard event page. Product, architecture and acceptance criteria live in
[`spec.md`](spec.md); the card architecture in [`docs/card-system.md`](docs/card-system.md); the
locked stack in
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

| Command             | What it runs                                                                                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`      | ESLint (Next.js rules + the service-role boundary rule)                                                                                                                                                                                                                                              |
| `npm run typecheck` | `tsc --noEmit`                                                                                                                                                                                                                                                                                       |
| `npm test`          | Vitest unit tests (`src/**/*.test.ts`, `tests/unit`)                                                                                                                                                                                                                                                 |
| `npm run test:db`   | Migration + RLS integration suite against `TEST_DATABASE_URL`; installs an `auth` schema stub, applies `supabase/migrations`, and exercises policies as `anon`, `authenticated` and `service_role`. Runs on Postgres 16 locally and Postgres 17 (the Supabase major in `supabase/config.toml`) in CI |
| `npm run build`     | Production build                                                                                                                                                                                                                                                                                     |

CI (`.github/workflows/ci.yml`) runs all of the above on every pull request.

## Layout

```text
src/app/                    App Router routes (route shells; features arrive by phase)
src/components/app/         Canonical product components (design-system.md §10)
src/styles/app-tokens.css   Application chrome tokens (design-system.md §6)
src/styles/card-fonts.css   Card font faces; imported only by the card renderer
src/lib/card/               Card colour maths and font pairings (card-system.md)
src/lib/env.ts              Validated environment (server secrets stay server-only)
src/lib/supabase/           Browser, server, proxy and service-role clients
src/lib/auth/               Permission matrix and server-side authorization helpers
src/lib/ai/                 Thin model-provider boundary (implemented in Phase 5)
src/proxy.ts                Session refresh on every request
supabase/                   Project config and migrations
tests/db/                   Migration and RLS integration tests
public/fonts/card/          Self-hosted card fonts
```

## Deploying a preview on Vercel

The app deploys as a standard Next.js project; no `vercel.json` is needed.

1. In Vercel, **Add New → Project → Import** `hsbshaker/event-platform` (framework preset:
   Next.js, root directory `/`, Node 22). Production branch `main`; every pull request gets
   a preview deployment.
2. Environment variables: without `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   the session-refresh proxy is a no-op and pages render. Set the Supabase keys and the other
   values in `.env.example` for the prompt → auth → details flow; never commit them.
3. Verify the deployment: `GET <preview-url>/api/health` returns `{"ok":true}` and `/` renders.

## Phase status

See `docs/development-plan.md`. Phases 0–2 (scaffold, data/auth/security foundation,
prompt → auth → details) are complete. Revision 7 retired the website renderer; the next
phase is the creative bake-off that decides the image model and proves the card
(`docs/CHANGELOG-v7.md`).
