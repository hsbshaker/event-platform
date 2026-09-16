-- ---------------------------------------------------------------------------
-- Phase 4B, T9A — call-level spend, idempotency, claim and telemetry controls.
--
-- docs/phase-4b-plan.md §A.5, §A.5.1, §A.6, §A.7, §A.8; docs/development-plan.md principle 4
-- ("spend controls ship with the first production model call, not in hardening"); spec.md §10,
-- §9.6, §6, §32 #41.
--
-- T10 is the first production EventIdentity call. Everything here has to exist before that call is
-- reachable, which is why it is a separate task ahead of the orchestrator rather than part of it.
--
-- The single idea this migration exists to enforce: **uniqueness happens before spend.** A claim
-- row, keyed deterministically on the bytes we are about to send, is inserted in the same
-- transaction that consumes the caps — and before any provider client exists. A conflict that
-- surfaces only after two calls have completed and been billed is not idempotency.
--
-- What is deliberately NOT here: anything batch- or sibling-shaped. `generation_batches`, planner
-- versions, concept assignments and the `(batch_id, operation, concept_index, attempt)` key are
-- Phase 4C, T16 (§H.2). A claim knows about one identity call and nothing else.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Paid provider responses get a durable home.
--
-- `EventIdentityError.rawResponses` exists because an `invalid_output` is a call that was answered
-- and billed; dropping that text loses a paid response. §I requires it preserved, and until now
-- nothing in the schema could hold it. `reprompts` is the repair-kind log spec.md §9.5 defines and
-- is not borrowed for this — "it is also jsonb" is not a contract.
--
-- Three values, three meanings, and the difference is load-bearing (§A.7):
--   null  — this evidence contract does not apply to this run (or it predates the contract);
--   []    — the contract applies and **no response text was captured**;
--   [...] — the ordered response texts, oldest first.
--
-- `[]` is NOT a claim that nothing was billed. A transport timeout can reach provider execution
-- with no response reaching us. What was captured and what was spent are different questions;
-- spend is answered by `cost_estimate_usd`, which costs an ambiguous attempt at the per-attempt
-- maximum rather than at zero.
--
-- Only `response.output_text` is stored, so no reasoning content is persisted — reasoning stays a
-- token count, as `src/lib/ai/openai/event-identity.ts` has said since Phase 4A.
-- ---------------------------------------------------------------------------
alter table public.generation_runs
  add column provider_response_evidence jsonb;

-- Cache **writes**, which GPT-5.6 bills at a premium over uncached input while cache reads are
-- heavily discounted. Three input classes, three rates; `cached_input_tokens` has always meant
-- reads, and folding writes into it would price the most expensive class at the cheapest rate.
alter table public.generation_runs
  add column cache_write_input_tokens integer;

-- When the evidence was dropped by the retention job. Without this, purging by setting the column
-- back to `null` would destroy the very distinction the three values above are for: a purged run
-- and a run the contract never covered would be indistinguishable forever after.
alter table public.generation_runs
  add column provider_response_evidence_purged_at timestamptz;

alter table public.generation_runs
  add constraint generation_runs_evidence_is_array
  check (
    provider_response_evidence is null
    or jsonb_typeof(provider_response_evidence) = 'array'
  );

-- The spend ceiling sums cost over a window for one operation. The existing indexes are
-- (event_id, created_at) and (user_id, created_at); neither serves a global sum.
create index generation_runs_operation_created_idx
  on public.generation_runs (operation, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. One paid call produces at most one identity revision.
--
-- `validate_identity_revision()` recomputes max(revision)+1 at insert time, so two completers of
-- one captured response do **not** collide on `unique (event_id, revision)`: the late one appends
-- a second revision of the same paid response and the event gets repointed at the duplicate. The
-- conditional state transition in `complete_identity_call` is the intended gate; this index is the
-- same invariant as a database fact, so it holds whatever the code path does.
-- ---------------------------------------------------------------------------
create unique index event_identity_revisions_generation_run_uniq
  on public.event_identity_revisions (generation_run_id)
  where generation_run_id is not null;

-- ---------------------------------------------------------------------------
-- 3. The claim lifecycle.
--
-- claimed            the key is reserved; no provider client has been constructed
-- response_captured  the provider answered and the run row (with its evidence) is committed; the
--                    revision is not yet written. NOT terminal, and deliberately has no expiry:
--                    expiring it would strand a paid response
-- succeeded          revision appended, pointer moved where allowed
-- failed_terminal    a provider failure, or invalid output after the one repair
-- expired_unknown    the lease elapsed with `provider_invoked_at` set — possibly paid, so only an
--                    explicit host retry may follow
-- abandoned          the lease elapsed with `provider_invoked_at` null — provably unpaid, so this
--                    is the one transition that re-spends without a host decision
-- ---------------------------------------------------------------------------
create type public.identity_call_claim_state as enum (
  'claimed',
  'response_captured',
  'succeeded',
  'failed_terminal',
  'expired_unknown',
  'abandoned',
  -- A paid response we captured and then could not turn into a revision: its stored text no longer
  -- validates, it was written under a schema version this build has no reader for, or the database
  -- refused the completion deterministically.
  --
  -- Terminal, and distinct from `failed_terminal` on purpose: that one means the *call* failed,
  -- this one means the call succeeded and *recovery* failed. Different diagnosis, different fix.
  -- Being terminal is what releases the event — `response_captured` has no expiry, so without this
  -- state one undeliverable response would block that event's identity calls for good.
  'recovery_failed'
);

-- Used by queries and by the sweeper. The partial index below inlines the same list rather than
-- calling this, because `create or replace function` on an immutable function would silently leave
-- a stale index behind; `tests/db/phase4b-t9a.test.ts` asserts the two agree for every enum value.
create or replace function public.identity_claim_is_terminal(
  p_state public.identity_call_claim_state
)
returns boolean
language sql
immutable
parallel safe
as $$
  select p_state in (
    'succeeded', 'failed_terminal', 'expired_unknown', 'abandoned', 'recovery_failed'
  )
$$;

create table public.event_identity_call_claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,

  -- sha256 over (event_id, operation, basis_digest, attempt_ordinal). Unique, and inserted before
  -- the provider is reached.
  attempt_key text not null
    constraint event_identity_call_claims_attempt_key_uniq unique,

  -- Stored rather than recovered from the key: the key is a hash, and the ordinal rule has to ask
  -- both "is there a non-terminal claim for this basis" and "what is the highest ordinal among
  -- terminal claims for this basis". Neither question is answerable from a digest.
  basis_digest text not null,
  attempt_ordinal integer not null check (attempt_ordinal >= 0),

  -- The rest of the basis, in the shape the revision needs it.
  --
  -- Recovery is the reason these are columns rather than inputs the requester remembers. A
  -- `response_captured` claim may be completed by a **different** request, or by the sweeper with
  -- no request at all, and the revision it writes still has to name the answers this call actually
  -- carried and the provider configuration that produced it. A recovering completer cannot ask the
  -- original caller, so the claim has to already know.
  clarification_answer_ids uuid[] not null default array[]::uuid[],
  provider_config jsonb not null default '{}'::jsonb,

  claimed_by uuid not null references public.profiles (id) on delete restrict,
  claimed_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,

  -- Committed before the provider is reached. `abandoned` may only be reached from a committed
  -- null, because it is the one automatic re-spend.
  provider_invoked_at timestamptz,

  state public.identity_call_claim_state not null default 'claimed',
  -- `restrict`, not `set null`: a claim in `response_captured` whose run row vanished could never
  -- be completed (the completion re-validates that row's stored evidence) and never expires, which
  -- is the permanent wedge by another route. Nothing prunes `generation_runs` today; this makes
  -- sure whatever does one day cannot open it.
  generation_run_id uuid references public.generation_runs (id) on delete restrict,
  settled_at timestamptz,

  -- Why recovery gave up, for an operator. Server-side only: the host is told the attempt could
  -- not be completed and nothing more, because a reason is a diagnostic, not a product surface.
  recovery_failure_reason text,
  -- Completion attempts the recovery driver has made and lost. A deterministic failure terminates
  -- at once; anything that might be transient is retried, but only so many times — an unclassified
  -- error must not be able to hold the event open forever either.
  recovery_attempts integer not null default 0,

  -- The ordinal rule as a constraint, not only as a convention. Named, because the RPC below
  -- branches on which uniqueness was violated and Postgres truncates generated names at 63
  -- characters — a guessed name silently becomes the fallback branch.
  constraint event_identity_call_claims_basis_attempt_uniq
    unique (event_id, basis_digest, attempt_ordinal)
);

-- One identity call in flight per event. The attempt key alone is not enough: the basis contains
-- the model configuration digest and three versions, so a rolling deploy between a host's request
-- and their refresh yields a *different* key and would otherwise start a second paid call beside
-- the first. This is call-level and knows nothing about batches; spec.md §10's one-batch-in-flight
-- rule is still Phase 4C's (§H.2).
create unique index event_identity_call_claims_one_in_flight
  on public.event_identity_call_claims (event_id)
  where state in ('claimed', 'response_captured');

create index event_identity_call_claims_basis_idx
  on public.event_identity_call_claims (event_id, basis_digest, attempt_ordinal desc);

create index event_identity_call_claims_lease_idx
  on public.event_identity_call_claims (lease_expires_at)
  where state = 'claimed';

create index event_identity_call_claims_run_idx
  on public.event_identity_call_claims (generation_run_id)
  where generation_run_id is not null;

-- Server-only, on the phase-1 pattern. Per-event in-flight state and attempt ordinals are backend
-- generation counters, and spec.md §32 #41 says not to expose those. The narrower
-- `revoke insert, update, delete` would leave `anon` a SELECT.
alter table public.event_identity_call_claims enable row level security;
revoke all on table public.event_identity_call_claims from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Step 4 of §A.6 — ceiling, caps, rate limit and the claim, atomically.
--
-- One transaction on purpose. `enforceRateLimit` consumes one rule per round trip, so checking
-- four limits that way spends a unit of every bucket before the one that refuses — a refused
-- request would quietly cost the host quota. The inner block below is a subtransaction: a refusal
-- raises, everything it did rolls back, and the outcome is returned instead. A refused request
-- therefore consumes nothing at all.
--
-- The ceiling is a bound, not a measurement (§A.5.1). Recorded spend treats a null
-- `cost_estimate_usd` as the logical-call maximum rather than as zero, and in-flight claims each
-- reserve that maximum, because a claim may still cost every attempt its retry policy permits.
-- ---------------------------------------------------------------------------
create or replace function public.claim_identity_call(
  p_event_id uuid,
  p_user_id uuid,
  p_attempt_key text,
  p_basis_digest text,
  p_attempt_ordinal integer,
  p_clarification_answer_ids uuid[],
  p_provider_config jsonb,
  p_lease_seconds integer,
  p_event_cap_key bytea,
  p_event_cap_window integer,
  p_event_cap_max integer,
  p_account_cap_key bytea,
  p_account_cap_window integer,
  p_account_cap_max integer,
  p_rate_key bytea,
  p_rate_window integer,
  p_rate_max integer,
  p_ceiling_window_seconds integer,
  p_ceiling_usd numeric,
  p_logical_call_max_usd numeric
)
returns table (
  outcome text,
  claim_id uuid,
  recorded_spend_usd numeric,
  reserved_usd numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outcome text := 'claimed';
  v_claim_id uuid;
  v_recorded numeric := 0;
  v_reserved numeric := 0;
  v_answers integer;
  v_constraint text;
begin
  if p_lease_seconds <= 0 then
    raise exception 'lease seconds must be positive';
  end if;
  if p_logical_call_max_usd < 0 or p_ceiling_usd < 0 then
    raise exception 'ceiling and logical-call maximum must not be negative';
  end if;

  -- Read without a lock, at READ COMMITTED. Per event the one-in-flight index serializes claims,
  -- so the ceiling is exact there; across events, N simultaneous claimers can each observe the
  -- same reservation and all pass, overshooting by at most
  -- `(concurrent claimers - 1) x logical-call maximum`. Bounded and small against the ceiling, and
  -- closing it would mean an advisory lock on one global key in the hot path of every identity
  -- call: a project-wide serialization point bought for an overshoot we can already name. Stated
  -- rather than closed.
  select coalesce(
           sum(coalesce(r.cost_estimate_usd, p_logical_call_max_usd)),
           0
         )
    into v_recorded
    from public.generation_runs r
   where r.operation = 'event_identity'
     and r.created_at >= pg_catalog.now() - (p_ceiling_window_seconds * interval '1 second');

  -- In-flight claims reserve the maximum, because each may still cost every attempt its retry
  -- policy permits.
  --
  -- `expired_unknown` claims with no run row are counted too, and this is not belt-and-braces: a
  -- claim reaches that state because the provider was invoked and we never learned the outcome, so
  -- §A.5.1 rule 2 says it must be costed at the maximum rather than at zero. It is terminal and
  -- has no `generation_runs` row, so without this term the possibly-spent money disappears from
  -- the ceiling the instant the claim settles — fail-open in exactly the ambiguous, expensive case
  -- the rule exists for. Bounded to the ceiling window so it ages out with recorded spend.
  select coalesce(count(*), 0) * p_logical_call_max_usd
    into v_reserved
    from public.event_identity_call_claims c
   where c.state in ('claimed', 'response_captured')
      or (
        c.state = 'expired_unknown'
        and c.generation_run_id is null
        and c.settled_at >= pg_catalog.now() - (p_ceiling_window_seconds * interval '1 second')
      );

  -- Validated here, before a claim exists and long before the provider is reached.
  --
  -- The same ids are checked again by `validate_identity_revision_answers` when the revision is
  -- written — but that is *after* the model has been paid, and by then the completer may be the
  -- sweeper rather than the caller that got them wrong. A caller bug would become a permanent
  -- post-spend failure. Fail before the money instead.
  if p_clarification_answer_ids is not null and array_length(p_clarification_answer_ids, 1) > 0 then
    if exists (
      select 1 from unnest(p_clarification_answer_ids) as a(id)
      group by a.id having count(*) > 1
    ) then
      raise exception 'clarification_answer_ids contains a duplicate'
        using errcode = 'check_violation';
    end if;
    select count(*) into v_answers
      from public.clarification_answers ca
     where ca.id = any (p_clarification_answer_ids)
       and ca.event_id = p_event_id;
    if v_answers <> array_length(p_clarification_answer_ids, 1) then
      raise exception 'clarification_answer_ids must all exist and belong to this event'
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  begin
    -- Admitting this call means reserving one more logical-call maximum.
    if v_recorded + v_reserved + p_logical_call_max_usd > p_ceiling_usd then
      raise exception using errcode = 'ID001', message = 'ceiling';
    end if;

    if not public.consume_rate_limit(
      'identity:event:day', p_event_cap_key, p_event_cap_window, p_event_cap_max
    ) then
      raise exception using errcode = 'ID001', message = 'cap_event';
    end if;

    if not public.consume_rate_limit(
      'identity:account:day', p_account_cap_key, p_account_cap_window, p_account_cap_max
    ) then
      raise exception using errcode = 'ID001', message = 'cap_account';
    end if;

    if not public.consume_rate_limit(
      'identity:account:rate', p_rate_key, p_rate_window, p_rate_max
    ) then
      raise exception using errcode = 'ID001', message = 'rate_limited';
    end if;

    insert into public.event_identity_call_claims (
      event_id, attempt_key, basis_digest, attempt_ordinal, clarification_answer_ids,
      provider_config, claimed_by, lease_expires_at
    )
    values (
      p_event_id,
      p_attempt_key,
      p_basis_digest,
      p_attempt_ordinal,
      coalesce(p_clarification_answer_ids, array[]::uuid[]),
      coalesce(p_provider_config, '{}'::jsonb),
      p_user_id,
      pg_catalog.now() + (p_lease_seconds * interval '1 second')
    )
    returning id into v_claim_id;

  exception
    when sqlstate 'ID001' then
      -- Everything the inner block did is rolled back, including every consumed unit.
      --
      -- A dedicated SQLSTATE, not the generic `P0001` a bare `raise exception` produces:
      -- `consume_rate_limit` raises `P0001` for a non-positive window or max, so catching that
      -- class here would turn an operator misconfiguration into a silent refusal carrying a
      -- sentence of English where the declared contract promises one of six outcomes. Anything
      -- that is not one of our four refusals now propagates, as it should.
      v_outcome := sqlerrm;
      v_claim_id := null;
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      -- Both named explicitly above so this branch cannot quietly become the fallback.
      v_outcome := case
        when v_constraint = 'event_identity_call_claims_attempt_key_uniq' then 'duplicate_key'
        when v_constraint = 'event_identity_call_claims_basis_attempt_uniq' then 'duplicate_key'
        when v_constraint = 'event_identity_call_claims_one_in_flight' then 'in_flight'
        else 'in_flight'
      end;
      v_claim_id := null;
  end;

  if v_claim_id is null and v_outcome in ('in_flight', 'duplicate_key') then
    select c.id into v_claim_id
      from public.event_identity_call_claims c
     where c.event_id = p_event_id
       and not public.identity_claim_is_terminal(c.state)
     limit 1;
  end if;

  return query select v_outcome, v_claim_id, v_recorded, v_reserved;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Step 5 — `provider_invoked_at`, committed on its own before the provider is reached.
--
-- `abandoned` means *provably unpaid*, and that meaning rests entirely on this commit landing
-- before the request leaves. A crash between this commit and the HTTP send marks a claim
-- possibly-paid that was not: the safe direction, costing a click rather than money.
-- ---------------------------------------------------------------------------
create or replace function public.mark_identity_call_invoked(p_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.event_identity_call_claims
     set provider_invoked_at = pg_catalog.now()
   where id = p_claim_id
     and state = 'claimed'
     and provider_invoked_at is null;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Step 6 — the capture commit.
--
-- Writes the run row (usage, versions, evidence, and the attempt key in the already-unique
-- `idempotency_key` so a retried capture cannot double-count spend) and moves the claim, in one
-- transaction. This commit is why a crash afterwards never costs a second model call.
--
-- On the failure path `model`, `prompt_version`, `schema_version`, `latency_ms` and `success` are
-- NOT NULL and arrive on no error object, so they come from the request side — the caller passes
-- what it resolved before the call.
-- ---------------------------------------------------------------------------
create or replace function public.capture_identity_call_response(
  p_claim_id uuid,
  p_success boolean,
  p_run jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.event_identity_call_claims;
  v_run_id uuid;
begin
  -- Locked first, whatever state it is in. The run row is written **regardless** of that state:
  -- if the sweeper expired this claim while the provider call was still running, refusing to
  -- record would throw away both the paid response and the money it cost, which is the one
  -- outcome this whole mechanism exists to prevent. Only the state transition is conditional.
  select * into v_claim
    from public.event_identity_call_claims
   where id = p_claim_id
   for update;

  if not found then
    return null;
  end if;

  -- A capture whose HTTP response was lost is retried. The attempt key is unique on
  -- `generation_runs`, so the retry finds its own earlier row instead of writing a second one
  -- and double-counting the spend the ceiling reads back.
  select id into v_run_id
    from public.generation_runs
   where idempotency_key = v_claim.attempt_key;

  if found then
    return v_run_id;
  end if;

  insert into public.generation_runs (
    event_id, user_id, provider, provider_request_id, operation, model,
    input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_tokens,
    cost_estimate_usd, latency_ms, success, error_code,
    prompt_version, schema_version, input_assembly_version,
    schema_valid_first_call, reprompts, provider_response_evidence, idempotency_key
  )
  values (
    v_claim.event_id,
    v_claim.claimed_by,
    p_run ->> 'provider',
    p_run ->> 'provider_request_id',
    'event_identity',
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
    (p_run ->> 'schema_valid_first_call')::boolean,
    p_run -> 'reprompts',
    coalesce(p_run -> 'provider_response_evidence', '[]'::jsonb),
    v_claim.attempt_key
  )
  returning id into v_run_id;

  update public.event_identity_call_claims
     set generation_run_id = v_run_id,
         state = case
                   when state <> 'claimed' then state
                   when p_success then 'response_captured'
                   else 'failed_terminal'
                 end,
         settled_at = case
                        when state <> 'claimed' then settled_at
                        when p_success then null
                        else pg_catalog.now()
                      end
   where id = p_claim_id;

  return v_run_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Step 7 — the conditional transition and the revision, in ONE transaction.
--
-- Unlike steps 5 and 6, which are deliberately separate commits, this one is atomic with the state
-- change. The `update … where state = 'response_captured' returning` is the gate: step 7 runs only
-- if a row came back, so two completers — two requests, or a request and the sweeper — cannot both
-- append a revision, and the claim row's lock serialises them. Committing the transition first
-- would leave a claim reading `succeeded` with no revision behind it, orphaning a paid response no
-- completer could find and making the host's next attempt pay again.
--
-- The revision copies provider, model, versions and request id from the run row rather than from
-- the caller, so the artifact and its telemetry cannot disagree about which call produced it. The
-- pointer moves in the same transaction, which is why `events_authoritative_identity_fk` is
-- deferrable — and only when the result is not provisional, which
-- `validate_authoritative_identity()` independently refuses to allow otherwise.
-- ---------------------------------------------------------------------------
create or replace function public.complete_identity_call(p_claim_id uuid, p_result jsonb)
returns table (
  revision_id uuid,
  revision integer,
  is_provisional boolean,
  authoritative boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.event_identity_call_claims;
  v_run public.generation_runs;
  v_revision integer;
  v_id uuid;
  v_provisional boolean;
begin
  update public.event_identity_call_claims
     set state = 'succeeded',
         settled_at = pg_catalog.now()
   where id = p_claim_id
     and state = 'response_captured'
  returning * into v_claim;

  if not found then
    -- Another completer got there first, or this claim was never captured. Not an error: the
    -- caller re-reads and observes whatever that completer produced.
    return;
  end if;

  select * into v_run
    from public.generation_runs
   where id = v_claim.generation_run_id;

  if not found then
    raise exception 'claim % is response_captured with no generation run', p_claim_id;
  end if;

  select coalesce(max(r.revision), 0) + 1 into v_revision
    from public.event_identity_revisions r
   where r.event_id = v_claim.event_id;

  insert into public.event_identity_revisions (
    event_id, revision, result, prompt_version, schema_version, input_assembly_version,
    provider, model, provider_config, provider_request_id, generation_run_id,
    clarification_answer_ids
  )
  values (
    v_claim.event_id,
    v_revision,
    p_result,
    v_run.prompt_version,
    v_run.schema_version,
    v_run.input_assembly_version,
    v_run.provider,
    v_run.model,
    v_claim.provider_config,
    v_run.provider_request_id,
    v_run.id,
    v_claim.clarification_answer_ids
  )
  returning id, event_identity_revisions.is_provisional into v_id, v_provisional;

  if not v_provisional then
    update public.events
       set authoritative_identity_revision_id = v_id
     where id = v_claim.event_id;
  end if;

  return query select v_id, v_revision, v_provisional, not v_provisional;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. The recovery driver's SQL half.
--
-- Expiry is decidable in SQL; completion is not, because it re-validates the captured text through
-- the same TypeScript validator production uses. So this function does the two expiry transitions
-- and `pending_identity_call_completions` hands the rest to the server-side sweeper.
--
-- `abandoned` requires a committed null `provider_invoked_at`. That is the whole safety argument:
-- it is the only transition that lets a new call start without a host deciding to retry.
-- `response_captured` is never expired here — expiring it is what would strand a paid response.
-- ---------------------------------------------------------------------------
create or replace function public.expire_identity_call_claims(p_limit integer default 100)
returns table (abandoned integer, expired_unknown integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_abandoned integer := 0;
  v_unknown integer := 0;
begin
  with due as (
    select id
      from public.event_identity_call_claims
     where state = 'claimed'
       and lease_expires_at < pg_catalog.now()
     order by lease_expires_at
     limit greatest(p_limit, 0)
     for update skip locked
  ),
  moved as (
    update public.event_identity_call_claims c
       set state = (
             case
               when c.provider_invoked_at is null then 'abandoned'
               else 'expired_unknown'
             end
           )::public.identity_call_claim_state,
           settled_at = pg_catalog.now()
      from due
     where c.id = due.id
    returning c.state
  )
  select
    count(*) filter (where moved.state = 'abandoned'),
    count(*) filter (where moved.state = 'expired_unknown')
  into v_abandoned, v_unknown
  from moved;

  return query select coalesce(v_abandoned, 0), coalesce(v_unknown, 0);
end;
$$;

-- Claims holding a paid response that no request has come back to complete.
create or replace function public.pending_identity_call_completions(p_limit integer default 50)
returns table (
  claim_id uuid,
  event_id uuid,
  generation_run_id uuid,
  schema_version text,
  provider_response_evidence jsonb,
  captured_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select c.id, c.event_id, c.generation_run_id, r.schema_version,
         r.provider_response_evidence, r.created_at
    from public.event_identity_call_claims c
    join public.generation_runs r on r.id = c.generation_run_id
   where c.state = 'response_captured'
   order by r.created_at
   limit greatest(p_limit, 0)
$$;

-- ---------------------------------------------------------------------------
-- 8b. Giving up on a captured response, without losing it.
--
-- `response_captured` is non-terminal and deliberately has no expiry, so a response that cannot be
-- turned into a revision would hold that event's one in-flight slot for ever. This is the release:
-- the claim goes terminal, the run row and its evidence stay exactly where they are for the normal
-- retention window, and the host may start a new paid attempt by retrying explicitly — which still
-- passes every cap and the ceiling, because it is an ordinary new claim.
--
-- `p_deterministic` is the caller's classification: a failure that will fail identically next time
-- terminates now.
--
-- Everything else is held, and held by **elapsed time since the response was captured**, not by a
-- count of attempts. Counting attempts looks equivalent and is not: the sweep runs every fifteen
-- minutes, so three failures is forty-five minutes, and a statement timeout, a lock held by a
-- migration or a bad grant would irreversibly terminalize every captured response in the backlog
-- inside one short degradation — each of those hosts then paying again for a call that had
-- already succeeded. An age bound holds through an outage and still guarantees the slot is
-- released eventually.
-- ---------------------------------------------------------------------------
create or replace function public.fail_identity_call_recovery(
  p_claim_id uuid,
  p_reason text,
  p_deterministic boolean default true,
  p_max_age_seconds integer default 172800
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.event_identity_call_claims;
  v_captured_at timestamptz;
begin
  update public.event_identity_call_claims
     set recovery_attempts = recovery_attempts + 1,
         recovery_failure_reason = left(coalesce(p_reason, 'unspecified'), 500)
   where id = p_claim_id
     and state = 'response_captured'
  returning * into v_claim;

  if not found then
    return 'not_captured';
  end if;

  -- When the response was captured, which is what the age bound is measured from. Falls back to
  -- the claim itself if the run row is somehow unreadable, so an unknown age is treated as old
  -- rather than as new.
  select r.created_at into v_captured_at
    from public.generation_runs r
   where r.id = v_claim.generation_run_id;
  if not found then
    v_captured_at := v_claim.claimed_at;
  end if;

  if
    p_deterministic
    or v_captured_at < pg_catalog.now() - (greatest(p_max_age_seconds, 0) * interval '1 second')
  then
    update public.event_identity_call_claims
       set state = 'recovery_failed',
           settled_at = pg_catalog.now()
     where id = p_claim_id
       and state = 'response_captured';
    return 'terminal';
  end if;

  return 'retryable';
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Evidence retention.
--
-- The run row and every ordinary metric survive; only the response text is dropped. The
-- `not exists` is not an optimisation: `response_captured` has no expiry by design, so nulling the
-- evidence of a claim that has not settled would leave one that can never be completed and never
-- expires — the permanent wedge, reintroduced through the retention rule instead of the state
-- machine.
-- ---------------------------------------------------------------------------
create or replace function public.purge_identity_response_evidence(p_cutoff timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_cutoff > pg_catalog.now() then
    raise exception 'cutoff must not be in the future';
  end if;

  update public.generation_runs g
     set provider_response_evidence = null,
         provider_response_evidence_purged_at = pg_catalog.now()
   where g.provider_response_evidence is not null
     and g.created_at < p_cutoff
     and not exists (
       select 1
         from public.event_identity_call_claims c
        where c.generation_run_id = g.id
          and not public.identity_claim_is_terminal(c.state)
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Server-only execution. None of this is reachable from an end-user JWT.
-- ---------------------------------------------------------------------------
revoke execute on function public.claim_identity_call(
  uuid, uuid, text, text, integer, uuid[], jsonb, integer,
  bytea, integer, integer, bytea, integer, integer, bytea, integer, integer,
  integer, numeric, numeric
) from public, anon, authenticated;
revoke execute on function public.mark_identity_call_invoked(uuid) from public, anon, authenticated;
revoke execute on function public.capture_identity_call_response(uuid, boolean, jsonb)
  from public, anon, authenticated;
revoke execute on function public.complete_identity_call(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.expire_identity_call_claims(integer)
  from public, anon, authenticated;
revoke execute on function public.fail_identity_call_recovery(uuid, text, boolean, integer)
  from public, anon, authenticated;
revoke execute on function public.pending_identity_call_completions(integer)
  from public, anon, authenticated;
revoke execute on function public.purge_identity_response_evidence(timestamptz)
  from public, anon, authenticated;
revoke execute on function public.identity_claim_is_terminal(public.identity_call_claim_state)
  from public, anon, authenticated;
