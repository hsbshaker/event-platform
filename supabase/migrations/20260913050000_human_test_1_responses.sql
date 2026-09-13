-- Storage for the Human Test #1 reviewer survey (docs/human-test-1/README.md).
--
-- This is internal calibration data for a five-person design-quality review, not part of the
-- product's event domain. It has no owner, no event, no membership and no reader among end
-- users: `scripts/human-test/score-stored.mjs` reads it with the service role and nothing else
-- ever does. So both tables are server-only in the strongest sense this schema has — RLS on,
-- no policies at all, and every privilege revoked from `anon` and `authenticated` — exactly as
-- `public.rate_limits` is (20260912000000_phase1_core.sql). The submit endpoint writes through
-- the service-role client; the browser never holds a credential that could reach either table.
--
-- Two tables rather than one table with an `is_test` flag.
--
-- The scorer must consume the five real reviewer responses and nothing else. With a flag, that
-- guarantee is a `where` clause: correct today, and one forgotten predicate away from a
-- synthetic submission being counted as a reviewer. Separating the tables makes it structural —
-- the adapter names `human_test_1_responses`, and there is no row in it to filter out, because
-- a synthetic submission was never written there. The choice of table is made server-side from
-- a secret (`HUMAN_TEST_1_TEST_SECRET`); no request body field selects it, and the submission
-- schema rejects unknown fields, so a public client cannot ask for the test table at all.
--
-- Personal data is deliberately minimal (spec.md §27): the reviewer's name or initials, which
-- the protocol needs to tell five reviewers apart, and nothing else. No email, no phone, no
-- account, no event, and no IP or user-agent stored as application data.

-- The reviewer-facing table. Its five rows are the test.
create table public.human_test_1_responses (
  id uuid primary key default gen_random_uuid(),
  reviewer text not null check (length(btrim(reviewer)) between 1 and 120),
  response_payload jsonb not null,
  -- Opaque, browser-generated, one per survey session. Unique, so a double tap, a mobile
  -- retry, a network retry and a resubmitted form all collapse onto the row the first request
  -- created instead of adding a sixth reviewer. It identifies a submission attempt, not a
  -- person: a genuinely new reviewer carries a new key and gets their own row.
  submission_key text not null check (length(submission_key) between 16 and 200),
  created_at timestamptz not null default now(),
  constraint human_test_1_responses_submission_key_key unique (submission_key)
);

comment on table public.human_test_1_responses is
  'Human Test #1 reviewer responses (docs/human-test-1/README.md). Internal calibration data, server-only. Exactly the five real reviewers; synthetic submissions live in human_test_1_test_responses and are never read by the scorer.';
comment on column public.human_test_1_responses.response_payload is
  'The normalized reviewer response, byte-for-byte the contract scripts/human-test/score.mjs already reads: { reviewer, ok, protocol, result: { groups, ratings } }.';
comment on column public.human_test_1_responses.submission_key is
  'Opaque per-session key from the browser. Unique: makes submission idempotent under double taps and retries.';

-- The synthetic table. Same shape, so the submit path is one code path, and deliberately not
-- a partition or a view of the one above: nothing that joins them back together exists.
create table public.human_test_1_test_responses (
  id uuid primary key default gen_random_uuid(),
  reviewer text not null check (length(btrim(reviewer)) between 1 and 120),
  response_payload jsonb not null,
  submission_key text not null check (length(submission_key) between 16 and 200),
  created_at timestamptz not null default now(),
  constraint human_test_1_test_responses_submission_key_key unique (submission_key)
);

comment on table public.human_test_1_test_responses is
  'Synthetic Human Test #1 submissions used to verify the deployed flow. Written only when the request presents HUMAN_TEST_1_TEST_SECRET. Never read by scripts/human-test/score-stored.mjs.';

alter table public.human_test_1_responses enable row level security;
alter table public.human_test_1_test_responses enable row level security;

-- Server-only tables: no policies for end-user roles, and no grants either.
revoke all on table public.human_test_1_responses from anon, authenticated;
revoke all on table public.human_test_1_test_responses from anon, authenticated;

-- Tell PostgREST about the two new tables.
--
-- Not decoration: deployed verification hit exactly this. The tables existed, RLS and grants
-- were right, and a plain SQL insert worked — but a submission through the API returned 500,
-- because PostgREST was still serving a schema cache that predated them. Supabase's DDL event
-- trigger normally issues this notify, and it did not fire (or was raced) when the migration was
-- applied through the Management API's query endpoint. The visible symptom was the *reviewer*
-- path failing while everything else looked healthy, which is the worst way to find out.
--
-- Issuing it here makes the migration self-sufficient however it is applied. On a plain Postgres
-- with no listener — the `tests/db` harness — it is a successful no-op.
notify pgrst, 'reload schema';
