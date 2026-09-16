-- ---------------------------------------------------------------------------
-- Phase 4B, T10/T11 — date an identity claim from when the row is created, not from when its
-- transaction started.
--
-- Corrects one line of `public.claim_identity_call`, forward only. The base migration
-- `20260916000000_phase4b_identity_call_claims.sql` is left exactly as it was applied: its id may
-- already be recorded in a persistent environment's `supabase_migrations.schema_migrations`, in
-- which case editing it in place would change nothing there and would leave the two histories
-- disagreeing about what that id means. So the fix ships as its own id, and applying the two in
-- order produces the same function whether or not the base had already been applied.
--
-- The defect: `claim_identity_call` waits for the global budget advisory lock before it inserts,
-- and `now()` is transaction-*start* time. The claim row's `claimed_at` therefore predated the
-- row by however long admission queued, and both horizons measured from that column were
-- shortened by the same amount — the 30-second pre-invocation reclaim age (which could make a
-- healthy request's claim reclaimable before it ever reached the provider) and the financial
-- lease (which must run from the provider call, not from the request's arrival).
--
-- Nothing else changes. Same signature, same admission, spend, cap and rate-limit logic, same
-- conflict handling, same return shape. `security definer`, `set search_path = ''` and the
-- server-only EXECUTE boundary are all restated below so this file is fail-closed on its own
-- terms rather than by inheritance.
--
-- docs/phase-4b-plan.md §A.5, §A.5.1, §A.6; spec.md §10, §32 #41.
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
  v_created timestamptz;
begin
  if p_lease_seconds <= 0 then
    raise exception 'lease seconds must be positive';
  end if;
  if p_logical_call_max_usd < 0 or p_ceiling_usd < 0 then
    raise exception 'ceiling and logical-call maximum must not be negative';
  end if;

  -- Serialized. Without this, N simultaneous claimers on *different* events each read the same
  -- reservation, each conclude there is room, and all pass — so the "ceiling" is not a ceiling at
  -- all, it is a ceiling times the concurrency. The per-event index does not help, because the
  -- races that matter are across events.
  --
  -- A transaction-scoped advisory lock on one key dedicated to this admission. It is released by
  -- commit or rollback, needs no row and no cleanup, and is held only for the few statements
  -- below: read spend, read reservations, check, consume buckets, insert. **The provider is not
  -- reached inside this transaction** — that happens after `claim_identity_call` has returned and
  -- `mark_identity_call_invoked` has committed separately — so a model call never holds the global
  -- lock, and a slow provider cannot block admissions.
  -- The lock orders the admissions; READ COMMITTED is what makes the reads that follow *see* the
  -- other claimer's committed work, because it takes a fresh snapshot per statement. Under
  -- REPEATABLE READ the snapshot is fixed at the transaction's first statement, so two claimers
  -- could serialize on the lock and still both read `reserved = 0` — the overshoot back, silently,
  -- with the lock apparently in place and the tests still green. SERIALIZABLE would in fact be
  -- safe here (the two claimers form a read-write conflict on this table and SSI aborts one with
  -- 40001), but it is refused with the rest: this function's guarantee should not rest on which
  -- stronger isolation level happens to rescue it. Asserted rather than assumed.
  --
  -- This also means the function must be invoked as its own transaction, which is how PostgREST
  -- calls it. Inside a larger transaction already holding `events`, `profiles` or `rate_limits`
  -- row locks, taking the advisory lock afterwards could build a cycle.
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception
      'claim_identity_call requires READ COMMITTED; got %',
      pg_catalog.current_setting('transaction_isolation')
      using errcode = 'invalid_transaction_state';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(public.identity_budget_lock_key());

  select coalesce(
           sum(coalesce(r.cost_estimate_usd, p_logical_call_max_usd)),
           0
         )
    into v_recorded
    from public.generation_runs r
   where r.operation = 'event_identity'
     and r.created_at >= pg_catalog.now() - (p_ceiling_window_seconds * interval '1 second');

  -- Reserve for what might still spend, or might already have spent. Nothing else.
  --
  --   * `response_captured` — the money is gone and the run row is not yet joined to this sum, so
  --     it must be held;
  --   * `claimed` whose lease has **not** elapsed — may still make every attempt its retry policy
  --     permits;
  --   * `claimed` whose lease *has* elapsed but whose `provider_invoked_at` is set — possibly paid,
  --     and not yet settled into `expired_unknown`;
  --   * `expired_unknown` with no run row — the provider was invoked and we never learned the
  --     outcome, so §A.5.1 rule 2 costs it at the maximum rather than at zero. Terminal and with no
  --     `generation_runs` row, it would otherwise drop out of both terms the instant it settled.
  --
  -- What is deliberately **not** reserved: a `claimed` claim whose lease elapsed with a committed
  -- null `provider_invoked_at`. That is provably unpaid and can never spend, so holding the
  -- maximum against it charges the project for money nobody can spend — and since expiry only
  -- happens in the housekeeping job, which now runs once a day, such a claim would hold that
  -- reservation for up to twenty-four hours. Ten instances dying mid-deploy would have frozen
  -- nine hundred dollars of a ceiling nobody was spending against.
  select coalesce(count(*), 0) * p_logical_call_max_usd
    into v_reserved
    from public.event_identity_call_claims c
   where c.state = 'response_captured'
      or (
        c.state = 'claimed'
        and (
          c.lease_expires_at >= pg_catalog.now()
          or c.provider_invoked_at is not null
        )
      )
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

    -- **The one timestamp in this function that must not be `now()`.**
    --
    -- `now()` is transaction-*start* time, and this transaction started before it queued for the
    -- global budget lock above. Two horizons are measured as elapsed time from this column, and
    -- both would be silently shortened by however long that queue was:
    --
    --   * the pre-invocation reclaim age (§7b of the base migration) — a claim that waited 40 s
    --     for admission would be born already eligible to be reclaimed, so a perfectly healthy
    --     request could have its claim taken from under it before it reached the provider;
    --   * the financial lease, which is derived from the provider call's bounded worst case and
    --     must be that long *from the call*, not from whenever the request happened to arrive.
    --
    -- So one actual wall-clock reading, taken after the waiting is over and immediately before the
    -- row exists, used for both. `clock_timestamp()` advances within a transaction; `now()` does
    -- not. Written explicitly rather than left to the column default, which is `now()`.
    --
    -- Deliberately narrow: every other `now()` in this function marks when something *was
    -- decided*, and transaction-start is the right reading for those.
    v_created := pg_catalog.clock_timestamp();

    insert into public.event_identity_call_claims (
      event_id, attempt_key, basis_digest, attempt_ordinal, clarification_answer_ids,
      provider_config, claimed_by, claimed_at, lease_expires_at
    )
    values (
      p_event_id,
      p_attempt_key,
      p_basis_digest,
      p_attempt_ordinal,
      coalesce(p_clarification_answer_ids, array[]::uuid[]),
      coalesce(p_provider_config, '{}'::jsonb),
      p_user_id,
      v_created,
      v_created + (p_lease_seconds * interval '1 second')
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
-- Server-only execution, restated.
--
-- PostgreSQL preserves an existing function's ACL across `create or replace function`, so this is
-- belt and braces. It is here anyway: a reader of this migration alone should be able to see that
-- the function it installs is not reachable from an end-user JWT, without having to go and read
-- the base migration to find out.
-- ---------------------------------------------------------------------------
revoke execute on function public.claim_identity_call(
  uuid, uuid, text, text, integer, uuid[], jsonb, integer,
  bytea, integer, integer, bytea, integer, integer, bytea, integer, integer,
  integer, numeric, numeric
) from public, anon, authenticated;
