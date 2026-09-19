-- ---------------------------------------------------------------------------
-- Phase 4D — composition lineage, and the sibling lifecycle a two-call concept needs.
--
-- Two problems, one migration.
--
-- **1. A sibling now makes two model calls, and `record_batch_sibling_run` settles on the first.**
-- Through 4C a sibling was one DesignIntent call, so recording its run and settling the sibling
-- were the same event. In 4D a sibling is a DesignIntent call, then a Composition call, then a
-- deterministic compile and a rendered-geometry verification that can still fail. Settling
-- `succeeded` when DesignIntent returns would mark a sibling ready whose concept does not exist
-- and may never exist — "do not silently mark failed work ready", and `spec.md §32 #24`'s rule
-- that a spec is final only with `verified.clean = true` would be decided after the row already
-- claimed success.
--
-- So recording and settling are split, exactly as `record_batch_call_run` split them for the
-- batch-level premise call at `20260918000000`:
--
--   * `record_sibling_stage_run`  — writes the `generation_runs` row for one stage of one sibling.
--                                   Never settles. Every paid response is recorded when it
--                                   happens, so the ceiling sees spend even for a sibling that
--                                   later fails to verify.
--   * `settle_batch_sibling`      — settles the sibling once its concept is verified and
--                                   persisted, or once it has terminally failed.
--
-- `record_batch_sibling_run` is **left exactly as it is**. An applied migration is frozen
-- (`CLAUDE.md §13.2`), its behaviour is still correct for a single-stage sibling, and its Phase 4C
-- tests still describe it truthfully. 4D simply stops calling it.
--
-- **2. `design_concepts` records what a composition was made from, but not what it was fitted
-- against, nor which assembly built the request.** `capabilities` is there; the `ContentProfile`
-- is not, and it is the input a later content edit changes — without it a re-fit cannot say what
-- moved. The input-assembly version is the same lineage `design_intent_artifacts` already keeps
-- for its own call.
--
-- Additive throughout. Nothing is dropped, renamed or relaxed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Lineage columns on `design_concepts`.
--
-- `not null` with no default, following `20260918000000`'s precedent: a concept without the
-- profile it was fitted against is not a concept whose re-fit can be reasoned about, and there is
-- no honest default for "what the host had written at the time".
-- ---------------------------------------------------------------------------
alter table public.design_concepts
  add column if not exists content_profile jsonb not null,
  add column if not exists composition_input_assembly_version text not null;

comment on column public.design_concepts.content_profile is
  'The ContentProfile the composition was fitted against (docs/event-renderer-system.md §2.3), '
  'including which fields were bounded provisional stand-ins. What a content edit changes.';

comment on column public.design_concepts.composition_input_assembly_version is
  'Which assembly built the Composition request, alongside the prompt and schema versions.';

-- Both are generated design data, so they join the immutable set rather than sitting outside it.
create or replace function public.protect_design_concept()
returns trigger
language plpgsql
as $$
begin
  if new.event_id is distinct from old.event_id
     or new.round is distinct from old.round
     or new.concept_index is distinct from old.concept_index
     or new.name is distinct from old.name
     or new.description is distinct from old.description
     or new.design_intent is distinct from old.design_intent
     or new.design_intent_artifact_id is distinct from old.design_intent_artifact_id
     or new.composition_raw is distinct from old.composition_raw
     or new.composition is distinct from old.composition
     or new.composition_hash is distinct from old.composition_hash
     or new.capabilities is distinct from old.capabilities
     or new.content_profile is distinct from old.content_profile
     or new.directive is distinct from old.directive
     or new.token_allotment is distinct from old.token_allotment
     or new.fallback is distinct from old.fallback
     or new.design_intent_prompt_version is distinct from old.design_intent_prompt_version
     or new.design_intent_schema_version is distinct from old.design_intent_schema_version
     or new.composition_prompt_version is distinct from old.composition_prompt_version
     or new.composition_schema_version is distinct from old.composition_schema_version
     or new.composition_input_assembly_version
        is distinct from old.composition_input_assembly_version
     or new.primitive_set_version is distinct from old.primitive_set_version
     or new.compiler_version is distinct from old.compiler_version
     or new.created_at is distinct from old.created_at then
    raise exception 'generated design data is immutable'
      using errcode = 'insufficient_privilege';
  end if;

  if new.active_resolved_spec_id is not null
     and not exists (
       select 1 from public.resolved_design_specs s
       where s.id = new.active_resolved_spec_id and s.concept_id = new.id
     ) then
    raise exception 'active_resolved_spec_id must belong to this concept'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. A concept belongs to the sibling that produced it.
--
-- `design_concepts` already points at its `design_intent_artifact_id`, and an artifact already
-- carries `(batch_id, concept_index)` uniquely. So the mislink this guards is a concept claiming
-- an artifact from a *different* sibling or a different event — which the existing
-- `validate_design_concept_artifact()` catches for `concept_index` and `event_id`. What it does
-- not yet catch is a concept whose composition lineage contradicts its own artifact's round.
-- Nothing further is needed here; the check stays where it is and this comment records that the
-- question was asked rather than left to a reader to re-derive.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. `record_sibling_stage_run` — record one stage's paid call, settle nothing.
--
-- Mirrors `record_batch_call_run`'s insert half, but scoped to a sibling so `concept_index` is
-- written and per-sibling attribution survives. The `attempt` check is the same staleness refusal
-- `record_batch_sibling_run` makes: a driver recording against an ordinal the sibling has moved
-- past is refused rather than allowed to overwrite a later attempt's history.
--
-- It refuses a sibling that is already `succeeded`, because a settled concept must never acquire
-- another paid call against it.
-- ---------------------------------------------------------------------------
create or replace function public.record_sibling_stage_run(
  p_batch_id uuid,
  p_concept_index integer,
  p_operation public.model_operation,
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

  select * into v_sibling
    from public.generation_batch_siblings
   where batch_id = p_batch_id and concept_index = p_concept_index
     for update;
  if not found then
    raise exception 'no such sibling in this batch' using errcode = 'foreign_key_violation';
  end if;

  if v_sibling.status = 'succeeded' then
    return query select 'already_succeeded'::text, v_sibling.generation_run_id;
    return;
  end if;

  if p_attempt is distinct from v_sibling.attempt then
    return query select 'stale_attempt'::text, null::uuid;
    return;
  end if;

  begin
    insert into public.generation_runs (
      event_id, user_id, provider, provider_request_id, operation, round, concept_index, model,
      input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_tokens,
      cost_estimate_usd, latency_ms, success, error_code, prompt_version, schema_version,
      input_assembly_version, planner_version, primitive_set_version, compiler_version,
      diversity_assignment, schema_valid_first_call, reprompts, compiler_repairs, verified,
      signature, nearest_sibling, fallback, idempotency_key
    )
    values (
      v_batch.event_id,
      (p_run ->> 'user_id')::uuid,
      p_run ->> 'provider',
      p_run ->> 'provider_request_id',
      p_operation,
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
      p_run ->> 'primitive_set_version',
      p_run ->> 'compiler_version',
      p_run -> 'diversity_assignment',
      (p_run ->> 'schema_valid_first_call')::boolean,
      p_run -> 'reprompts',
      p_run -> 'compiler_repairs',
      p_run -> 'verified',
      p_run ->> 'signature',
      (p_run ->> 'nearest_sibling')::numeric,
      p_run ->> 'fallback',
      p_idempotency_key
    )
    returning id into v_run_id;
  exception
    when unique_violation then
      -- Converge on the row that exists. Never a second row: the ceiling reads this table as spend.
      select r.id into v_run_id
        from public.generation_runs r
       where r.idempotency_key = p_idempotency_key;
      return query select 'duplicate_key'::text, v_run_id;
      return;
  end;

  -- A batch with an issued sibling is running. Conditional, so a settled batch is never reopened.
  update public.generation_batches
     set status = 'running',
         started_at = coalesce(started_at, pg_catalog.now())
   where id = p_batch_id and status = 'planned';

  return query select 'recorded'::text, v_run_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. `settle_batch_sibling` — settle a sibling whose stages are done.
--
-- Success names the run that stands for the concept (the Composition call), so
-- `generation_batch_siblings.generation_run_id` keeps meaning "the run this sibling succeeded
-- with" and the `(status = 'succeeded') = (generation_run_id is not null)` check still holds.
--
-- Failure increments `attempt`, exactly as `record_batch_sibling_run` does, so a resumed driver
-- derives the next ordinal from the row rather than from its own memory.
-- ---------------------------------------------------------------------------
create or replace function public.settle_batch_sibling(
  p_batch_id uuid,
  p_concept_index integer,
  p_success boolean,
  p_generation_run_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sibling public.generation_batch_siblings;
begin
  select * into v_sibling
    from public.generation_batch_siblings
   where batch_id = p_batch_id and concept_index = p_concept_index
     for update;
  if not found then
    raise exception 'no such sibling in this batch' using errcode = 'foreign_key_violation';
  end if;

  -- Idempotent: a settled success is final and re-settling it changes nothing.
  if v_sibling.status = 'succeeded' then
    return 'already_succeeded';
  end if;

  if p_success then
    if p_generation_run_id is null then
      raise exception 'a succeeded sibling must name the run it succeeded with'
        using errcode = 'check_violation';
    end if;
    update public.generation_batch_siblings
       set status = 'succeeded',
           generation_run_id = p_generation_run_id,
           settled_at = pg_catalog.now()
     where batch_id = p_batch_id and concept_index = p_concept_index;
    return 'succeeded';
  end if;

  update public.generation_batch_siblings
     set status = 'failed',
         attempt = attempt + 1,
         settled_at = pg_catalog.now()
   where batch_id = p_batch_id and concept_index = p_concept_index;
  return 'failed';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Execution grants.
--
-- Server-only, like every other batch function: `generation_batches` and
-- `generation_batch_siblings` are revoked from `anon` and `authenticated` entirely, and these
-- are `security definer`.
-- ---------------------------------------------------------------------------
revoke all on function public.record_sibling_stage_run(
  uuid, integer, public.model_operation, integer, text, boolean, jsonb
) from public;
revoke all on function public.settle_batch_sibling(uuid, integer, boolean, uuid) from public;

-- ---------------------------------------------------------------------------
-- 6. Column grants on the new `design_concepts` columns.
--
-- `design_concepts` grants members `select` on the table rather than a column list, so the two new
-- columns are readable by members exactly as `capabilities` and the version columns already are.
-- Neither carries provider, spend or attempt detail, so nothing here needs withholding — the
-- "how the call was made" columns live on `design_intent_artifacts` and `generation_runs`, which
-- keep their own narrower grants.
-- ---------------------------------------------------------------------------
