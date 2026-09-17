-- ---------------------------------------------------------------------------
-- Phase 4C, T16 — generation batches, and the batch/sibling half of the spend controls.
--
-- docs/phase-4b-plan.md §G.5 (what a batch carries), §H.2 (the seven batch and sibling controls),
-- §C (Route A behaviour, and the persisted half this task inherits), §I (failure semantics);
-- spec.md §10 ("one generation batch in flight per event at a time", and the rest of the six
-- configurable backend safety limits), §27, §32 #41.
--
-- **What is deliberately not here.** Every call-level EventIdentity control — the attempt key, the
-- pre-spend claim, the per-call caps, the ceiling admission, the lease and the recovery states —
-- is Phase 4B's (§A.5, T9A, `20260916000000`). Nothing below reimplements, wraps or weakens any of
-- it. `spec.md §10` lists six safety limits; exactly one is batch-shaped, and this is the migration
-- that finally lets the database enforce it. Nothing here makes a model call, and nothing here
-- knows what a DesignIntent is: T16 is the batch record and its uniqueness, T18 onward is the call.
--
-- The single idea: **one batch in flight per event is a uniqueness constraint, not application
-- etiquette.** A partial unique index over `(event_id) where status in ('planned','running')`
-- means the second concurrent planner is refused by Postgres, whatever order the application
-- happens to run in and however many serverless instances are awake. §H.2 says so in as many
-- words, and it is the same argument `event_identity_call_claims_one_in_flight` makes one level
-- down: a conflict that surfaces after two batches have been paid for is not idempotency.
--
-- **RLS posture: server-only, on the phase-1 pattern**, exactly as `generation_runs` and
-- `event_identity_call_claims`. RLS enabled with no policies and `revoke all … from anon,
-- authenticated`. A batch row is a backend generation counter in every field that matters — which
-- round this event is on, how many siblings failed, which attempt ordinal a sibling is up to — and
-- `spec.md §32 #41` forbids exposing those. Leaving Supabase's default grants in place would hand
-- `authenticated` a `SELECT` on precisely the counters a refusal payload is careful not to name.
-- A host learns about their concepts from the concepts, never from this table.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. `generation_runs.planner_version` (§G.5).
--
-- Nullable, with no default and no backfill. `input_assembly_version` arrived at T9A and is
-- already here; this is the other column §G.5 names. An `event_identity` run has no planner
-- version, and every row written before this migration has none either — a sentinel string would
-- say "planned by an unknown planner" about calls that were never planned at all.
--
-- `docs/phase-4b-plan.md §D`: replay identity is the identity revision plus the planner version,
-- so this column is what lets a sibling run say which algorithm chose its assignment. Historical
-- batches are never re-planned, which is only checkable because the version is recorded per run.
-- ---------------------------------------------------------------------------
alter table public.generation_runs
  add column planner_version text;

-- ---------------------------------------------------------------------------
-- 2. The batch lifecycle.
--
-- planned    the batch exists, its siblings are assigned, no sibling call has been issued
-- running    at least one sibling call has been issued
-- completed  settled, and at least two siblings produced a successful run
-- failed     settled, and the batch failed **as a batch** (§I: "multiple siblings fail")
--
-- `planned` and `running` are the in-flight pair §H.2 names, and they are the two the uniqueness
-- index is written over. The two terminal states come from §I, which draws the line in one place
-- and one place only: one failed sibling leaves the batch running to completion, because
-- concept-level readiness is canonical (`spec.md §7.10 #5`) and the failed sibling is **never**
-- replaced by a library recipe (`CLAUDE.md §5.1`); several failed siblings mean the batch failed,
-- because "fewer than three concepts is a visible state, never three where one is fabricated".
--
-- There is deliberately **no `cancelled`**. §C is explicit that a late clarification answer leaves
-- an in-flight batch alone — "not cancelled, mutated or re-based" — and a state nothing may reach
-- is an invitation to reach it. Nothing in canon asks for a batch to be cancelled, so nothing here
-- can cancel one.
--
-- `completed` is not a "generation complete" boolean by another name (§J). It says the batch is no
-- longer in flight; which concepts are ready is answered per sibling, and per concept after that.
-- ---------------------------------------------------------------------------
create type public.generation_batch_status as enum (
  'planned',
  'running',
  'completed',
  'failed'
);

-- pending    assigned by the planner, not yet issued
-- running    issued; a run row may or may not exist yet
-- succeeded  a successful run row exists for this sibling
-- failed     the current attempt failed and was recorded; the next attempt has its own key
create type public.generation_batch_sibling_status as enum (
  'pending',
  'running',
  'succeeded',
  'failed'
);

-- Used by the RPCs below and by application reads. The partial index inlines the same list rather
-- than calling this, because `create or replace function` on an immutable function would leave a
-- stale index behind silently; `tests/db/phase4c-t16.test.ts` asserts the two agree for every
-- value of the enum, which is the same guard `identity_claim_is_terminal` carries.
create or replace function public.generation_batch_is_in_flight(
  p_status public.generation_batch_status
)
returns boolean
language sql
immutable
parallel safe
as $$
  select p_status in ('planned', 'running')
$$;

-- ---------------------------------------------------------------------------
-- 3. The batch itself (§G.5).
--
-- Every column here is an **input** except `status` and the timestamps, and the trigger in section
-- 6 refuses to let any input change after insert. That is §C's "not cancelled, mutated or
-- re-based" expressed as a database fact rather than as a rule reviewers have to remember: a late
-- clarification answer produces a new identity revision, and there is no UPDATE anywhere — service
-- role included — that can point this row at it.
-- ---------------------------------------------------------------------------
create table public.generation_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,

  -- Which identity revision this batch was planned from. `restrict`, not `set null` or `cascade`:
  -- §G.4's attribution invariant means "which identity produced this" must always have exactly one
  -- answer, and a null would erase it. Revisions are append-only and nothing deletes them today;
  -- this makes sure nothing can start.
  identity_revision_id uuid not null references public.event_identity_revisions (id)
    on delete restrict,

  -- The planner that produced the sibling assignments. Replay identity is
  -- (identity_revision_id, planner_version) — `docs/phase-4b-plan.md §D`.
  planner_version text not null,

  -- The event's generation round, derived server-side as max(round) + 1 and never supplied by a
  -- client. `Try another direction` (spec.md §7.9) is a new round; a refresh is not.
  round integer not null check (round >= 1),

  status public.generation_batch_status not null default 'planned',

  -- sha256 over (event_id, 'concept_batch', identity_revision_id, planner_version, round).
  -- Deterministic and derived from the request, never random and never client-supplied, so two
  -- simultaneous "start this round" requests collide here instead of planning twice.
  idempotency_key text not null
    constraint generation_batches_idempotency_key_uniq unique,

  created_at timestamptz not null default now(),
  -- When the first sibling call was issued, and when the batch settled. Both null until they
  -- happen; neither is ever rewritten.
  started_at timestamptz,
  settled_at timestamptz,

  -- One row per (event, round). The in-flight index below is the control §H.2 names; this is the
  -- weaker fact that has to hold even after a batch settles, so a replayed request for a round
  -- that already ran cannot quietly produce a second one.
  constraint generation_batches_event_round_uniq unique (event_id, round),

  -- Settled states carry a settlement time, in-flight states do not.
  constraint generation_batches_settled_at_matches_status
    check ((settled_at is not null) = (status in ('completed', 'failed')))
);

-- **The control.** One batch in flight per event at a time (`spec.md §10`, §H.2). The database
-- refuses the second; no application check is load-bearing, and none survives a second serverless
-- instance either way.
create unique index generation_batches_one_in_flight
  on public.generation_batches (event_id)
  where status in ('planned', 'running');

create index generation_batches_event_round_idx
  on public.generation_batches (event_id, round desc);

create index generation_batches_identity_revision_idx
  on public.generation_batches (identity_revision_id);

-- ---------------------------------------------------------------------------
-- 4. Per-sibling status (§H.2, last row).
--
-- "The batch records per-sibling status; resumption re-issues only siblings with no successful
-- run, under the same keys." That sentence needs somewhere to write three statuses and three
-- attempt ordinals, and §G.5's column list for `generation_batches` has no room for them — so they
-- are a child table rather than three jsonb blobs, which buys real constraints: one row per
-- concept index, a status enum, and a check tying `succeeded` to an actual run row.
--
-- `plan` is the planner's output for this sibling — index, seed, assignment, directive, directive
-- sentence and token allotment — persisted at plan time and immutable thereafter. This is what
-- makes §C's inherited proof checkable at all: "the batch's sibling assignment and persisted
-- inputs are unchanged by the late answer" has no subject unless the assignment is persisted
-- before any call is made, and a `planned` batch has made none.
--
-- `generation_runs` deliberately gains no `batch_id`. §G.5 enumerates what that table gains and a
-- back-pointer is not on the list; the sibling's successful run is named here, and every run of
-- this batch is reachable through the deterministic idempotency key.
-- ---------------------------------------------------------------------------
create table public.generation_batch_siblings (
  batch_id uuid not null references public.generation_batches (id) on delete cascade,
  -- The planner's index, and the key everything downstream uses (`spec.md §7.7`).
  concept_index integer not null check (concept_index between 0 and 2),

  plan jsonb not null,

  status public.generation_batch_sibling_status not null default 'pending',

  -- The attempt ordinal that, with the batch id and the operation, derives this sibling's
  -- idempotency key. It advances only when an attempt has been **recorded** as failed, so a
  -- resumption that finds nothing recorded re-issues under the same key and a duplicate collides
  -- rather than paying twice (§H.2, rows 4 and 6).
  attempt integer not null default 0 check (attempt >= 0),

  -- The successful run, and only a successful one: "siblings with no successful run" is the
  -- question resumption asks, so this column is that answer and the check keeps it honest.
  generation_run_id uuid references public.generation_runs (id) on delete restrict,

  started_at timestamptz,
  settled_at timestamptz,

  primary key (batch_id, concept_index),

  constraint generation_batch_siblings_success_has_run
    check ((status = 'succeeded') = (generation_run_id is not null))
);

-- ---------------------------------------------------------------------------
-- 5. Server-only (spec.md §32 #41), on the phase-1 pattern.
--
-- The narrower `revoke insert, update, delete` would leave `anon` a SELECT, which is the grant
-- that matters here: round ordinals, sibling attempt counters and failure counts are exactly the
-- backend generation counters a uniform refusal payload exists to keep unreadable.
-- ---------------------------------------------------------------------------
alter table public.generation_batches enable row level security;
revoke all on table public.generation_batches from anon, authenticated;

alter table public.generation_batch_siblings enable row level security;
revoke all on table public.generation_batch_siblings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. The inputs are immutable, and the database is what says so.
--
-- §C: an answer arriving after the batch has started is persisted against the revision that asked,
-- and the in-flight batch "is **not** cancelled, mutated or re-based". Enforced here rather than
-- asserted in review, because the failure mode is silent: a batch rebased onto a newer revision
-- still renders three concepts, and "which identity produced this" quietly gains a second answer.
--
-- Status and the timestamps move; nothing else does, for any role.
-- ---------------------------------------------------------------------------
create or replace function public.protect_generation_batch()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.event_id is distinct from old.event_id
     or new.identity_revision_id is distinct from old.identity_revision_id
     or new.planner_version is distinct from old.planner_version
     or new.round is distinct from old.round
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'a generation batch''s inputs are immutable: event, identity revision, planner version, '
      'round and idempotency key cannot change after it is planned'
      using errcode = 'restrict_violation';
  end if;
  -- A settled batch is finished. Reopening one would put two batches in flight for the event
  -- without ever tripping the index, because the index only sees the rows that are in flight now.
  if not public.generation_batch_is_in_flight(old.status)
     and new.status is distinct from old.status
  then
    raise exception 'a settled generation batch cannot change status'
      using errcode = 'restrict_violation';
  end if;
  if old.settled_at is not null and new.settled_at is distinct from old.settled_at then
    raise exception 'settled_at is written once' using errcode = 'restrict_violation';
  end if;
  if old.started_at is not null and new.started_at is distinct from old.started_at then
    raise exception 'started_at is written once' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger generation_batches_protect
  before update on public.generation_batches
  for each row execute function public.protect_generation_batch();

create or replace function public.protect_generation_batch_sibling()
returns trigger
language plpgsql
as $$
begin
  if new.batch_id is distinct from old.batch_id
     or new.concept_index is distinct from old.concept_index
     or new.plan is distinct from old.plan
  then
    raise exception
      'a planned sibling''s assignment is immutable: batch, concept index and plan cannot change'
      using errcode = 'restrict_violation';
  end if;
  -- A sibling that has a successful run keeps it. Re-issuing a sibling that already succeeded is
  -- spend with nothing to buy, and overwriting the run id would lose the attribution §G.4 needs.
  if old.status = 'succeeded'
     and (new.status is distinct from old.status
          or new.generation_run_id is distinct from old.generation_run_id
          or new.attempt is distinct from old.attempt)
  then
    raise exception 'a succeeded sibling is final' using errcode = 'restrict_violation';
  end if;
  -- Ordinals only ever go forward; winding one back would re-derive a key that has already been
  -- spent against.
  if new.attempt < old.attempt then
    raise exception 'a sibling attempt ordinal cannot move backwards'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger generation_batch_siblings_protect
  before update on public.generation_batch_siblings
  for each row execute function public.protect_generation_batch_sibling();

-- ---------------------------------------------------------------------------
-- 7. Admission: the ceiling, the batch-level caps, the batch and its siblings — one transaction.
--
-- The shape is `claim_identity_call`'s and for the same reason: consuming caps over four round
-- trips spends a unit of every bucket before the one that refuses, so a refused request would
-- quietly cost the host quota. The inner block is a subtransaction — a refusal raises, everything
-- it did rolls back, and the outcome is returned instead.
--
-- **Batch-level caps are consumed when a batch is planned**, not when an identity call is made
-- (§H.2 row 2). The buckets are the same `rate_limits` fixed-window table (`spec.md §10`, `§27`)
-- and the same `consume_rate_limit` function; there is no second limiter. The bucket names arrive
-- as parameters so `src/lib/auth/rate-limit.ts` stays the one place they are declared, and the
-- `batch:` prefix is checked here so a caller cannot reach into another subsystem's counters.
--
-- **The ceiling refuses new batches and never truncates a running one** (§H.2 row 3). It is
-- checked here, at admission, and **nowhere else**: `start_generation_batch`,
-- `record_batch_sibling_run` and `settle_generation_batch` contain no ceiling arithmetic at all,
-- so a breach that lands mid-batch cannot turn three concepts into two presented as whole.
--
-- The recorded-spend sum is the project-wide one (`spec.md §10`: one "global/project spend
-- ceiling"), over every operation rather than `event_identity` alone, and a null
-- `cost_estimate_usd` counts as `p_run_max_usd` rather than as zero — §A.5.1's rule, because a
-- ceiling that silently under-counts reports a safety it does not have. `p_batch_reservation_usd`
-- is what admitting this batch reserves; see `src/lib/generation/batch.ts` for why it is zero
-- today and what T18 owes it.
-- ---------------------------------------------------------------------------
create or replace function public.plan_generation_batch(
  p_event_id uuid,
  p_user_id uuid,
  p_identity_revision_id uuid,
  p_planner_version text,
  p_round integer,
  p_idempotency_key text,
  -- `{ "siblings": [ … ] }` rather than a bare array, deliberately. A top-level JSON array reaches
  -- Postgres as an *array literal* through node-postgres and as jsonb through PostgREST, so the
  -- two transports would disagree about the same call; an object is unambiguous in both.
  p_plan jsonb,
  p_event_cap_bucket text,
  p_event_cap_key bytea,
  p_event_cap_window integer,
  p_event_cap_max integer,
  p_account_cap_bucket text,
  p_account_cap_key bytea,
  p_account_cap_window integer,
  p_account_cap_max integer,
  p_rate_bucket text,
  p_rate_key bytea,
  p_rate_window integer,
  p_rate_max integer,
  p_ceiling_window_seconds integer,
  p_ceiling_usd numeric,
  p_run_max_usd numeric,
  p_batch_reservation_usd numeric
)
returns table (
  outcome text,
  batch_id uuid,
  -- Reported so a ceiling refusal can be alerted on with the number it refused against, rather
  -- than with a placeholder. A bound, never a measurement (§A.5.1).
  recorded_spend_usd numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outcome text := 'planned';
  v_batch_id uuid;
  v_recorded numeric := 0;
  v_expected_round integer;
  v_constraint text;
  v_sibling jsonb;
  v_siblings jsonb;
  v_indexes integer[];
begin
  if p_event_cap_bucket not like 'batch:%'
     or p_account_cap_bucket not like 'batch:%'
     or p_rate_bucket not like 'batch:%'
  then
    raise exception 'batch caps may only consume batch: buckets';
  end if;
  if p_ceiling_usd < 0 or p_run_max_usd < 0 or p_batch_reservation_usd < 0 then
    raise exception 'ceiling, run maximum and reservation must not be negative';
  end if;

  -- The identity this batch is planned from has to be the event's **authoritative** one.
  --
  -- §C row 3: an answer landing before a batch starts produces a new authoritative revision and
  -- "the batch is planned from it". §I: a provisional (Route B) identity means no batch at all.
  -- Both are one condition here, checked against the event's own pointer rather than against
  -- anything the caller asserts — `validate_authoritative_identity` already refuses to point that
  -- pointer at a provisional revision, so this inherits that guarantee instead of re-deriving it.
  if not exists (
    select 1
      from public.events e
     where e.id = p_event_id
       and e.authoritative_identity_revision_id = p_identity_revision_id
  ) then
    return query select 'not_authoritative'::text, null::uuid, 0::numeric;
    return;
  end if;

  -- Rounds are derived, never supplied. The caller computes the same number to build its
  -- idempotency key; this refuses if the world moved underneath it, so a stale request cannot
  -- reuse a round that already ran.
  select coalesce(max(b.round), 0) + 1 into v_expected_round
    from public.generation_batches b
   where b.event_id = p_event_id;
  if p_round is distinct from v_expected_round then
    return query select 'stale_round'::text, null::uuid, 0::numeric;
    return;
  end if;

  -- Three siblings, indexed 0, 1, 2. A malformed plan is a bug in the planner's caller, not a
  -- refusal a host should see, so it raises rather than returning an outcome.
  v_siblings := p_plan -> 'siblings';
  if v_siblings is null or jsonb_typeof(v_siblings) <> 'array' or jsonb_array_length(v_siblings) <> 3
  then
    raise exception 'a batch is exactly three siblings' using errcode = 'check_violation';
  end if;
  select array_agg((s.value ->> 'index')::integer order by (s.value ->> 'index')::integer)
    into v_indexes
    from jsonb_array_elements(v_siblings) as s(value);
  if v_indexes is distinct from array[0, 1, 2] then
    raise exception 'a batch''s siblings must be indexed 0, 1 and 2'
      using errcode = 'check_violation';
  end if;

  -- Recorded spend across the window, nulls costed at the per-run maximum (§A.5.1 rule 3).
  select coalesce(sum(coalesce(r.cost_estimate_usd, p_run_max_usd)), 0)
    into v_recorded
    from public.generation_runs r
   where r.created_at >= pg_catalog.now() - (p_ceiling_window_seconds * interval '1 second');

  begin
    if v_recorded + p_batch_reservation_usd > p_ceiling_usd then
      raise exception using errcode = 'ID001', message = 'ceiling';
    end if;

    if not public.consume_rate_limit(
      p_event_cap_bucket, p_event_cap_key, p_event_cap_window, p_event_cap_max
    ) then
      raise exception using errcode = 'ID001', message = 'cap_event';
    end if;

    if not public.consume_rate_limit(
      p_account_cap_bucket, p_account_cap_key, p_account_cap_window, p_account_cap_max
    ) then
      raise exception using errcode = 'ID001', message = 'cap_account';
    end if;

    if not public.consume_rate_limit(
      p_rate_bucket, p_rate_key, p_rate_window, p_rate_max
    ) then
      raise exception using errcode = 'ID001', message = 'rate_limited';
    end if;

    insert into public.generation_batches (
      event_id, identity_revision_id, planner_version, round, idempotency_key
    )
    values (
      p_event_id, p_identity_revision_id, p_planner_version, p_round, p_idempotency_key
    )
    returning id into v_batch_id;

    for v_sibling in select s.value from jsonb_array_elements(v_siblings) as s(value)
    loop
      insert into public.generation_batch_siblings (batch_id, concept_index, plan)
      values (v_batch_id, (v_sibling ->> 'index')::integer, v_sibling);
    end loop;

  exception
    when sqlstate 'ID001' then
      -- Everything the inner block did is rolled back, including every consumed unit. A refused
      -- request therefore consumes nothing at all.
      v_outcome := sqlerrm;
      v_batch_id := null;
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      -- Both named explicitly on the table, so this branch cannot quietly become the fallback.
      v_outcome := case
        when v_constraint = 'generation_batches_idempotency_key_uniq' then 'duplicate_key'
        when v_constraint = 'generation_batches_event_round_uniq' then 'duplicate_key'
        when v_constraint = 'generation_batches_one_in_flight' then 'in_flight'
        else 'in_flight'
      end;
      v_batch_id := null;
  end;

  -- A loser is handed the winner, so a duplicated request observes the one batch rather than
  -- being told only that it failed.
  if v_batch_id is null and v_outcome in ('in_flight', 'duplicate_key') then
    select b.id into v_batch_id
      from public.generation_batches b
     where b.event_id = p_event_id
       and (b.idempotency_key = p_idempotency_key
            or public.generation_batch_is_in_flight(b.status))
     order by b.round desc
     limit 1;
  end if;

  return query select v_outcome, v_batch_id, v_recorded;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. `planned` → `running`, conditionally.
--
-- Returns true only for the transition, so a second caller learns it did not make it happen. No
-- cap, no ceiling and no spend decision lives here: a batch that has been admitted runs.
-- ---------------------------------------------------------------------------
create or replace function public.start_generation_batch(p_batch_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.generation_batches
     set status = 'running',
         started_at = pg_catalog.now()
   where id = p_batch_id
     and status = 'planned';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8b. A sibling is issued.
--
-- The transition that makes `running` and `started_at` mean something: this sibling's call has
-- been handed to the provider boundary. It carries no spend decision either — admission already
-- happened — and it is deliberately **not** what prevents a duplicate call. §H.2 row 6 is explicit
-- that duplicates are prevented by the idempotency key rather than by a lock, because a lock does
-- not survive a serverless instance; marking a sibling `running` is telemetry, not mutual
-- exclusion, and a second instance that issues the same sibling collides at the run row.
--
-- `started_at` is written once, on the first issue, so a resumed sibling still records when this
-- batch first reached the provider for it.
-- ---------------------------------------------------------------------------
create or replace function public.issue_batch_sibling(
  p_batch_id uuid,
  p_concept_index integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.generation_batch_siblings
     set status = 'running',
         started_at = coalesce(started_at, pg_catalog.now()),
         settled_at = null
   where batch_id = p_batch_id
     and concept_index = p_concept_index
     and status in ('pending', 'failed');
  get diagnostics v_updated = row_count;

  if v_updated = 1 then
    update public.generation_batches
       set status = 'running',
           started_at = coalesce(started_at, pg_catalog.now())
     where id = p_batch_id and status = 'planned';
  end if;

  return v_updated = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. One sibling's run row, and the sibling's status, in one transaction.
--
-- The idempotency key is `(batch_id, operation, concept_index, attempt)` (§H.2 row 4), derived by
-- the caller and carried into `generation_runs.idempotency_key`, which has been unique since
-- Phase 1. Two instances that issue the same sibling therefore collide on the index rather than
-- both recording — **not** on an in-process lock, which does not survive a serverless instance
-- (§H.2 row 6).
--
-- Attribution is taken from the batch and the sibling, never from the caller: `event_id`, `round`,
-- `concept_index`, `planner_version` and `diversity_assignment` all come from rows this function
-- reads, so a caller cannot misattribute a run to another event, round or sibling. The caller
-- supplies only what it learned from the provider.
--
-- On a recorded failure the sibling's attempt ordinal advances, so the next issue is honestly a
-- different paid attempt with a different key. A failure that was never recorded leaves the
-- ordinal alone, which is what makes resumption "under the same keys" (§H.2 row 7) idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.record_batch_sibling_run(
  p_batch_id uuid,
  p_concept_index integer,
  p_attempt integer,
  p_idempotency_key text,
  p_success boolean,
  p_run jsonb
)
returns table (
  outcome text,
  run_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.generation_batches;
  v_sibling public.generation_batch_siblings;
  v_run_id uuid;
begin
  select * into v_batch from public.generation_batches where id = p_batch_id;
  if not found then
    raise exception 'no such generation batch' using errcode = 'foreign_key_violation';
  end if;

  -- Locked, so two completers of the same sibling serialize on the row rather than racing the
  -- status update after both have written.
  select * into v_sibling
    from public.generation_batch_siblings
   where batch_id = p_batch_id and concept_index = p_concept_index
     for update;
  if not found then
    raise exception 'no such sibling in this batch' using errcode = 'foreign_key_violation';
  end if;

  -- Already settled successfully: the answer is the run that succeeded, and nothing is written.
  if v_sibling.status = 'succeeded' then
    return query select 'already_succeeded'::text, v_sibling.generation_run_id;
    return;
  end if;

  if p_attempt is distinct from v_sibling.attempt then
    -- The caller is recording against an ordinal this sibling has moved past (or has not reached).
    -- Refusing is the whole point: accepting it would let a stale driver overwrite a later
    -- attempt's outcome.
    return query select 'stale_attempt'::text, null::uuid;
    return;
  end if;

  begin
    insert into public.generation_runs (
      event_id, user_id, provider, provider_request_id, operation, round, concept_index, model,
      input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_tokens,
      cost_estimate_usd, latency_ms, success, error_code, prompt_version, schema_version,
      input_assembly_version, planner_version, diversity_assignment, schema_valid_first_call,
      reprompts, idempotency_key
    )
    values (
      v_batch.event_id,
      (p_run ->> 'user_id')::uuid,
      p_run ->> 'provider',
      p_run ->> 'provider_request_id',
      (p_run ->> 'operation')::public.model_operation,
      v_batch.round,
      p_concept_index,
      p_run ->> 'model',
      (p_run ->> 'input_tokens')::integer,
      (p_run ->> 'cached_input_tokens')::integer,
      (p_run ->> 'cache_write_input_tokens')::integer,
      (p_run ->> 'output_tokens')::integer,
      (p_run ->> 'reasoning_tokens')::integer,
      (p_run ->> 'cost_estimate_usd')::numeric,
      (p_run ->> 'latency_ms')::integer,
      p_success,
      p_run ->> 'error_code',
      p_run ->> 'prompt_version',
      p_run ->> 'schema_version',
      p_run ->> 'input_assembly_version',
      v_batch.planner_version,
      v_sibling.plan -> 'assignment',
      (p_run ->> 'schema_valid_first_call')::boolean,
      p_run -> 'reprompts',
      p_idempotency_key
    )
    returning id into v_run_id;
  exception
    when unique_violation then
      -- This exact attempt has already been recorded. Converge on the row that exists; never
      -- write a second one, because the ceiling reads this table back as spend.
      select r.id into v_run_id
        from public.generation_runs r
       where r.idempotency_key = p_idempotency_key;
      return query select 'duplicate_key'::text, v_run_id;
      return;
  end;

  if p_success then
    update public.generation_batch_siblings
       set status = 'succeeded',
           generation_run_id = v_run_id,
           settled_at = pg_catalog.now()
     where batch_id = p_batch_id and concept_index = p_concept_index;
  else
    update public.generation_batch_siblings
       set status = 'failed',
           attempt = attempt + 1,
           settled_at = pg_catalog.now()
     where batch_id = p_batch_id and concept_index = p_concept_index;
  end if;

  -- A batch with an issued sibling is running. Conditional, so a settled batch is never reopened
  -- (the protect trigger refuses that anyway) and `started_at` is written once.
  update public.generation_batches
     set status = 'running',
         started_at = coalesce(started_at, pg_catalog.now())
   where id = p_batch_id and status = 'planned';

  return query select 'recorded'::text, v_run_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Settlement (§I).
--
-- One failed sibling: the batch continues and settles `completed`, because concept-level readiness
-- is canonical and two real concepts are two real concepts. Two or more: the batch failed **as a
-- batch**, because "fewer than three concepts is a visible state, never three where one is
-- fabricated" — and the failed sibling is never replaced by a library recipe (`CLAUDE.md §5.1`),
-- so there is no third concept to be had.
--
-- Returns `in_flight` and changes nothing while any sibling is unfinished. Idempotent: a settled
-- batch returns the status it already has.
-- ---------------------------------------------------------------------------
create or replace function public.settle_generation_batch(p_batch_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.generation_batch_status;
  v_unfinished integer;
  v_failed integer;
  v_next public.generation_batch_status;
begin
  select status into v_status from public.generation_batches where id = p_batch_id for update;
  if not found then
    raise exception 'no such generation batch' using errcode = 'foreign_key_violation';
  end if;
  if not public.generation_batch_is_in_flight(v_status) then
    return v_status::text;
  end if;

  select count(*) filter (where s.status in ('pending', 'running')),
         count(*) filter (where s.status = 'failed')
    into v_unfinished, v_failed
    from public.generation_batch_siblings s
   where s.batch_id = p_batch_id;

  if v_unfinished > 0 then
    return 'in_flight';
  end if;

  v_next := case when v_failed >= 2 then 'failed' else 'completed' end;
  update public.generation_batches
     set status = v_next,
         settled_at = pg_catalog.now()
   where id = p_batch_id
     and status in ('planned', 'running');
  return v_next::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Server-only execution. None of this is reachable from an end-user JWT.
-- ---------------------------------------------------------------------------
revoke execute on function public.plan_generation_batch(
  uuid, uuid, uuid, text, integer, text, jsonb,
  text, bytea, integer, integer,
  text, bytea, integer, integer,
  text, bytea, integer, integer,
  integer, numeric, numeric, numeric
) from public, anon, authenticated;
revoke execute on function public.start_generation_batch(uuid) from public, anon, authenticated;
revoke execute on function public.issue_batch_sibling(uuid, integer) from public, anon, authenticated;
revoke execute on function public.record_batch_sibling_run(uuid, integer, integer, text, boolean, jsonb)
  from public, anon, authenticated;
revoke execute on function public.settle_generation_batch(uuid) from public, anon, authenticated;
revoke execute on function public.generation_batch_is_in_flight(public.generation_batch_status)
  from public, anon, authenticated;
