-- ---------------------------------------------------------------------------
-- Phase 4F — recovering a concept batch whose process died.
--
-- spec.md §10 ("one generation batch in flight per event at a time"), §31 — Prompt, auth, and
-- generation ("Each concept becomes available as soon as its resolved spec exists; no concept
-- waits on its siblings (§7.10)"), §32 #41.
--
-- # The defect this closes
--
-- `generation_batches_one_in_flight` is a partial unique index over `(event_id) where status in
-- ('planned','running')`. That is the control, and it is the right one — but it has no expiry. A
-- serverless instance that is killed mid-batch leaves its siblings `pending`/`running` and its
-- batch `running`, `settle_generation_batch` keeps answering `in_flight` because unfinished
-- siblings exist, and the index then refuses every future batch for that event **for ever**. The
-- event is not slow; it is bricked, and nothing in the schema can notice.
--
-- Phase 4B met the same shape one level down and settled it the same way: a claim carries a lease,
-- `expire_identity_call_claims` expires the due ones, and the orchestrator calls it **scoped to
-- the event being read** on every request — because "a waiting host must not depend on the daily
-- backstop to clear the dead claim blocking their own event" (`20260916000000`, section 8). This
-- is that argument applied to batches, and it is deliberately the same shape: event-scoped,
-- opportunistic, driven by the read path, idempotent on a second call.
--
-- # Why a batch clock and not a sibling clock
--
-- `generation_batch_siblings.started_at` is only written by `issue_batch_sibling`, which the
-- current batch driver does not call: a sibling can legitimately sit at `pending` with a null
-- `started_at` for the whole run. Age is therefore measured from
-- `coalesce(batches.started_at, batches.created_at)`, which is written by `plan_generation_batch`
-- and `start_generation_batch` and can never be null. One clock for the whole batch is also the
-- honest unit — a batch is one process, and it is the process that died.
--
-- # Why this never races a live batch
--
-- The bound is passed by the caller (`STALE_BATCH_AFTER_MS` in
-- `src/lib/generation/generation-state.ts`, which explains the number) and defaults here to the
-- same 15 minutes. It has to sit **above the longest a batch process can possibly still be
-- alive**, because failing the siblings of a running batch is far worse than making a host wait:
-- the live process would go on to call `settle_batch_sibling(..., true)` against a batch this
-- function had already settled, and `protect_generation_batch` refuses to reopen a settled batch —
-- so a concept that really was generated could end up outside its own batch's outcome, and a
-- second paid batch could start alongside the first. A generous bound costs a rare crashed event
-- some minutes. A tight one corrupts a live one.
--
-- Nothing here is a new control and nothing here relaxes an old one. The uniqueness index is
-- untouched, the ceiling and the caps are untouched, no spend decision is made, and a sibling that
-- succeeded is never rewritten — `settle_batch_sibling`'s own rule, restated in the WHERE clause.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. `recover_stale_generation_batches(event, bound)`.
--
-- Fails every non-terminal sibling of every in-flight batch of one event that is older than the
-- bound, then settles each of those batches through the existing `settle_generation_batch` — which
-- is the only thing in this repository allowed to decide a batch's terminal state (§I: one failed
-- sibling completes, two or more fail). This function deliberately does not reimplement that rule,
-- so a batch that had already produced two real concepts still settles `completed` and both stay
-- previewable.
--
-- `attempt = attempt + 1` matches `settle_batch_sibling`'s failure path exactly: the ordinal is
-- what derives the sibling idempotency key, so a resumption after this must not re-issue under the
-- key the dead attempt may already have spent against.
--
-- Returns one row per batch it touched, for logging. Empty is the overwhelmingly common answer and
-- is not an error.
-- ---------------------------------------------------------------------------
create or replace function public.recover_stale_generation_batches(
  p_event_id uuid,
  p_stale_after_seconds integer default 900
)
returns table (batch_id uuid, failed_siblings integer, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch record;
  v_failed integer;
  v_status text;
begin
  if p_event_id is null then
    raise exception 'recovery is event-scoped: p_event_id is required'
      using errcode = 'null_value_not_allowed';
  end if;
  -- A non-positive bound would fail the siblings of a batch planned in this same second. Not a
  -- defensive nicety: the bound is the entire safety argument above.
  if p_stale_after_seconds is null or p_stale_after_seconds < 60 then
    raise exception 'the stale-batch bound must be at least 60 seconds, got %',
      p_stale_after_seconds
      using errcode = 'check_violation';
  end if;

  for v_batch in
    select b.id
      from public.generation_batches b
     where b.event_id = p_event_id
       and public.generation_batch_is_in_flight(b.status)
       and coalesce(b.started_at, b.created_at)
             < pg_catalog.now() - pg_catalog.make_interval(secs => p_stale_after_seconds)
     -- At most one batch is in flight per event, so this loop runs at most once in practice. The
     -- ordering and the lock are here for the pathological case and for two concurrent readers:
     -- `skip locked` means the second reader observes rather than waits, which is what an
     -- opportunistic step on a read path has to do.
     order by b.created_at
       for update skip locked
  loop
    with stale as (
      update public.generation_batch_siblings s
         set status = 'failed',
             attempt = s.attempt + 1,
             settled_at = pg_catalog.now()
       where s.batch_id = v_batch.id
         -- `succeeded` is final (`protect_generation_batch_sibling`), and a `failed` sibling is
         -- already settled: touching either would move an ordinal for nothing.
         and s.status in ('pending', 'running')
      returning 1
    )
    select pg_catalog.count(*)::integer into v_failed from stale;

    -- The batch's terminal state is `settle_generation_batch`'s decision and nobody else's. It
    -- takes its own `for update` on the row this loop already holds, which is a no-op re-lock
    -- inside the same transaction.
    v_status := public.settle_generation_batch(v_batch.id);

    batch_id := v_batch.id;
    failed_siblings := coalesce(v_failed, 0);
    status := v_status;
    return next;
  end loop;

  return;
end;
$$;

comment on function public.recover_stale_generation_batches(uuid, integer) is
  'Opportunistic, event-scoped recovery for a concept batch whose process died: fails its '
  'non-terminal siblings past a bound and settles it through settle_generation_batch, so the '
  'one-in-flight index cannot brick an event for ever. Called from the generation read path.';

-- ---------------------------------------------------------------------------
-- 2. Server-only execution, on the same pattern as every other batch function.
--
-- `generation_batches` and `generation_batch_siblings` are revoked from `anon` and `authenticated`
-- entirely (`20260917000000`, section 5) precisely because round ordinals, attempt counters and
-- failure counts are the backend generation counters `spec.md §32 #41` forbids exposing. A
-- `security definer` function over those tables that `authenticated` could execute would hand back
-- the counters the revoke exists to withhold — this one returns a failed-sibling count, so the
-- revoke is load-bearing rather than ceremonial.
-- ---------------------------------------------------------------------------
revoke execute on function public.recover_stale_generation_batches(uuid, integer)
  from public, anon, authenticated;
