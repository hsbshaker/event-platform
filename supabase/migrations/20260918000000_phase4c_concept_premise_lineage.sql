-- ---------------------------------------------------------------------------
-- Phase 4C — concept-premise lineage, and the run row that makes its call visible.
--
-- `spec.md §7.7a` (the premise stage), `§9.1` (four creative capabilities), `§31 — Event Identity
-- and diversity` and `§31 — DesignIntent, composition and compiler` (persistence);
-- `docs/phase-4b-plan.md §G.2` (the artifact's column list) and `§G.4` (the DesignIntent
-- attribution invariant); `docs/designintent-sibling-convergence.md` (why the stage exists);
-- `docs/model-contracts.md §4.8`.
--
-- **Why this migration exists at all.** The premise stage was built as a capability and reached
-- only through the eval seam. Running it on the production path needs two things the schema does
-- not have:
--
--   1. a `model_operation` value for the call, because the project-wide spend ceiling reads
--      `generation_runs` and `§A.5` refuses a model call nobody can see the price of. Recording it
--      as `design_intent` would misattribute it and corrupt the per-operation record; recording it
--      as `structured_extraction` would be untrue.
--   2. somewhere on the artifact to say **which premise produced this concept**. `§G.4` requires a
--      persisted DesignIntent to name exactly one tuple of the things that produced it, and after
--      `design_intent_input_v2` the premise is one of them. Without these columns the artifact
--      records a concept whose creative direction came from somewhere the row cannot name.
--
-- **What is deliberately not here.** No shape check on `concept_premise`. T17 settled that for
-- `design_intent` and the reasoning is unchanged: a shape assertion here would be the contract in
-- `src/lib/ai/concept-premise/contract.ts` written twice, in the one place a correction has to ship
-- as a whole new migration. The application validator is the authority
-- (`docs/model-contracts.md §3`).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. `model_operation` gains `concept_premise`.
--
-- One value, appended. The enum's existing order is `event_identity`, `design_intent`,
-- `composition`, `structured_extraction`; appending rather than inserting before a peer keeps every
-- existing ordinal stable, which matters because `generation_runs.operation` is indexed.
--
-- **Nothing in this migration uses the new value**, and that is a requirement rather than a
-- coincidence: PostgreSQL permits `alter type … add value` inside a transaction block from 12
-- onward, but the new label cannot be *referenced* until that transaction commits. A CHECK, a
-- partial index or a seed row naming `concept_premise` here would fail at apply time. The only
-- consumer is `record_batch_sibling_run`, which casts at call time, long after commit.
-- ---------------------------------------------------------------------------
alter type public.model_operation add value if not exists 'concept_premise';

-- ---------------------------------------------------------------------------
-- 2. The premise on the artifact (§G.2, extended by `spec.md §7.7a`).
--
-- Four columns, mirroring how the DesignIntent call is already recorded one field group up: the
-- payload, plus the three versions that say which contract produced it. Same spellings, same
-- types, so the two stages answer "what produced this" in the same shape.
--
-- **`not null` with no default, and the failure is the point.** §G.3 point 2 established this as
-- the standing check on this pair of tables: *"`add column … not null` with no default is itself
-- the standing check: against a non-empty table this statement fails outright (SQLSTATE 23502)
-- instead of inventing a lineage for a row that never had one."* The argument holds here exactly.
-- No production orchestrator has ever written a `design_intent_artifacts` row — the batch record
-- (T16), the artifact table (T17) and the provider boundary (T21) all landed without one, and the
-- only writer before now was the eval seam, which persists nothing. So this table is empty
-- wherever it exists, and if it is not, this migration stops rather than backfilling a premise
-- that never existed.
--
-- **No referential action on any of these, and none is a foreign key.** The table's own standing
-- rule, set by `generation_run_id`: *"The same rule applies to any column added to this table
-- later."* `concept_premise` is a payload snapshot, not a pointer, for the same reason
-- `design_intent` is — the artifact is evidence, and evidence that can be re-pointed is not
-- evidence.
-- ---------------------------------------------------------------------------
alter table public.design_intent_artifacts
  add column concept_premise jsonb not null,
  add column concept_premise_prompt_version text not null,
  add column concept_premise_schema_version text not null,
  add column concept_premise_input_assembly_version text not null;

-- ---------------------------------------------------------------------------
-- 3. What the deterministic set review changed about the host-facing card.
--
-- `presentation` on this table is `not null` with a non-empty name and description, so it can only
-- ever hold a **resolved** card. `spec.md §7.8` requires a deterministic fallback when a name is
-- missing, invalid or duplicates a sibling's, and duplication is decidable only across the three
-- siblings at once — so the card written here is the one the set review produced, which for a
-- repaired sibling is not the one the model returned.
--
-- Without this column that substitution would be unrecoverable: the row would assert a card the
-- model never wrote, with nothing anywhere recording that it had been replaced or why.
-- `spec.md §31` asks for repairs *logged by kind*, and `CLAUDE.md §2` for repairs that are never
-- silent. Each entry carries the rule, the path, the before and the after, so the model's own card
-- is recoverable from the row that replaced it.
--
-- `default '[]'::jsonb` rather than `not null` with no default, and the asymmetry with section 2 is
-- deliberate: an empty array is the **true and complete** value for a concept whose card needed no
-- repair, so a default invents nothing. A premise, by contrast, has no empty value that would be
-- true.
-- ---------------------------------------------------------------------------
alter table public.design_intent_artifacts
  add column card_deviations jsonb not null default '[]'::jsonb
    constraint design_intent_artifacts_card_deviations_array check (
      jsonb_typeof(card_deviations) = 'array'
    );

-- ---------------------------------------------------------------------------
-- 4. The column-level member grant, extended (T17 section 6).
--
-- T17's grant is column-level precisely so that adding a column is a decision rather than an
-- inheritance, and T12's rule decides each of these five: *"everything describing how the call was
-- made is server-only"*.
--
-- All five are on the readable side, and none of them describes how a call was made. The premise is
-- creative output a member may read for the same reason `design_intent` and `presentation` are —
-- it is the concept's own creative direction, and it is what the concept card is derived from. The
-- three version columns join `design_intent_prompt_version` and its two peers, which T17 kept
-- readable on the stated ground that a version column *"says which contract produced it"*.
-- `card_deviations` is the record of a deterministic repair to a member-readable field; withholding
-- it would leave a member able to read a card but not that it had been substituted.
--
-- Carries no counter: no token count, no cost, no latency, no attempt ordinal, no failure tally
-- (`spec.md §32 #41`).
-- ---------------------------------------------------------------------------
grant select (
  concept_premise,
  concept_premise_prompt_version,
  concept_premise_schema_version,
  concept_premise_input_assembly_version,
  card_deviations
) on public.design_intent_artifacts to authenticated;

-- ---------------------------------------------------------------------------
-- 5. `record_batch_call_run` — a run row for a call that belongs to the **batch**, not a sibling.
--
-- The premise call needed a home in `generation_runs` and the obvious one is wrong.
-- `record_batch_sibling_run` (T16) does two things: it writes the run, and it settles
-- `generation_batch_siblings` for `(batch_id, concept_index)`. Recording a batch-level call through
-- it would therefore consume a sibling's lifecycle slot — a successful premise call would mark
-- sibling 0 `succeeded`, that sibling's own DesignIntent run would then be refused as
-- `already_succeeded` and **never recorded at all**, and the batch would settle from a lifecycle
-- describing calls that did not happen. A failed one would mark sibling 0 failed and bump its
-- attempt ordinal. Neither is a rounding error: the ceiling reads this table back as spend.
--
-- So the insert half is repeated here without the settle half, and `concept_index` is left **null**
-- — which is what the column already means for `event_identity`, and what is true of a premise
-- call: it belongs to all three concepts, so naming one of them would be false.
--
-- Everything else is T16's, deliberately: `security definer` with an empty `search_path`, the batch
-- read that fails loudly on a bad id, the unique-violation convergence that refuses to write a
-- second row for one paid call, and the conditional `planned` → `running` transition. The
-- convergence is the load-bearing half — the ceiling reads this table as spend, so two rows for one
-- call is double-counted money.
--
-- No `for update` lock and no attempt check, because there is no sibling row to serialize on or to
-- compare against. `p_attempt` is carried into the idempotency key by the caller instead
-- (`batchCallIdempotencyKey`), which is what makes a retry a new row and a replay a collision.
-- ---------------------------------------------------------------------------
create or replace function public.record_batch_call_run(
  p_batch_id uuid,
  p_operation public.model_operation,
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
  v_run_id uuid;
begin
  select * into v_batch from public.generation_batches where id = p_batch_id;
  if not found then
    raise exception 'no such generation batch' using errcode = 'foreign_key_violation';
  end if;

  begin
    insert into public.generation_runs (
      event_id, user_id, provider, provider_request_id, operation, round, concept_index, model,
      input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_tokens,
      cost_estimate_usd, latency_ms, success, error_code, prompt_version, schema_version,
      input_assembly_version, planner_version, schema_valid_first_call, reprompts, idempotency_key
    )
    values (
      v_batch.event_id,
      (p_run ->> 'user_id')::uuid,
      p_run ->> 'provider',
      p_run ->> 'provider_request_id',
      p_operation,
      v_batch.round,
      -- Null, and true: this call produced all three concepts.
      null,
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
      (p_run ->> 'schema_valid_first_call')::boolean,
      p_run -> 'reprompts',
      p_idempotency_key
    )
    returning id into v_run_id;
  exception
    when unique_violation then
      -- This exact attempt has already been recorded. Converge on the row that exists; never write
      -- a second one, because the ceiling reads this table back as spend.
      select r.id into v_run_id
        from public.generation_runs r
       where r.idempotency_key = p_idempotency_key;
      return query select 'duplicate_key'::text, v_run_id;
      return;
  end;

  -- A batch with a call issued against it is running. Conditional, so a settled batch is never
  -- reopened and `started_at` is written once.
  update public.generation_batches
     set status = 'running',
         started_at = coalesce(started_at, pg_catalog.now())
   where id = p_batch_id and status = 'planned';

  return query select 'recorded'::text, v_run_id;
end;
$$;

revoke all on function public.record_batch_call_run(uuid, public.model_operation, text, boolean, jsonb)
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. What this migration deliberately leaves alone.
--
-- `design_concepts` gains nothing. §G.3's equality check is exhaustive over *the columns both
-- tables carry*, and the premise is carried only by the artifact — a concept reaches its premise
-- through `design_intent_artifact_id`, which is `not null` and enumerated by
-- `protect_design_concept()` so it cannot be re-pointed. Adding a denormalised copy would create a
-- second place for the same immutable value and a fifth clause for the equality check to keep in
-- step, for no read that `design_intent_artifact_id` does not already serve.
--
-- `reject_update()` needs no change: it raises unconditionally on UPDATE with no column list, so
-- the five columns above are immutable from the moment they exist. That is the property the T17
-- header chose it for — *"no column list that can fall out of date"*.
-- ---------------------------------------------------------------------------
