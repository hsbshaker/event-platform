-- Phase 5c: the facts the prompt states, on the event; and one initial generation per event
-- (docs/development-plan.md, Phase 5).
--
-- Requirements: spec.md §7.3 (owner decision, 2026-10-04: a fact the prompt states is on the card
-- from the reveal, as the host wrote it, marked as needing confirmation; never published, never
-- shown to guests, never given to the card design as a fact), §7.5 (fact extraction keeps only what
-- the prompt literally states), §7.11 (the first card generated for an event becomes its active
-- design), §10 (no duplicate expensive calls), §24 (Event). Guardrails: spec.md §32 #15 (facts
-- come only from the host: these values are the host's own words, unconfirmed), #42 (server-only
-- writes).

-- ===========================================================================
-- 1. events.prompt_facts
-- ===========================================================================
-- The facts the host's prompt states, exactly as fact extraction returned them after the verbatim
-- check (src/lib/generation/identity.server.ts `keepVerbatimFacts`: every value a whole span of the
-- prompt, else null; partial hints likewise): an object with the fact_extraction_schema_v1 fields.
-- Null until a generation extracts them; written once, by that generation, in the same
-- transaction as the identity it interpreted (record_event_identity below), so a retry that reuses
-- the identity — and so never extracts again — always finds them. Unconfirmed values: the card
-- shows them marked as needing confirmation (src/lib/card/facts.ts `revealCardContent`); they
-- never become event details until the host confirms them in the details form.
--
-- Readable by the owner and co-hosts like every other event column (events_select_member).
-- Never written by end users (protect_event_server_columns below).

-- Whether p is a stored prompt-facts object: only the extraction's fields, each fact a string or
-- null, `partial` an array of { field, text } strings.
create or replace function public.prompt_facts_valid(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_value jsonb;
  v_hint jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  for v_key, v_value in select e.key, e.value from jsonb_each(p) e loop
    if v_key = 'partial' then
      if jsonb_typeof(v_value) <> 'array' then
        return false;
      end if;
      for v_hint in select h.value from jsonb_array_elements(v_value) h loop
        if jsonb_typeof(v_hint) <> 'object'
           or jsonb_typeof(v_hint -> 'field') is distinct from 'string'
           or jsonb_typeof(v_hint -> 'text') is distinct from 'string'
           or exists (select 1 from jsonb_object_keys(v_hint) k where k not in ('field', 'text')) then
          return false;
        end if;
      end loop;
    elsif v_key in ('eventType', 'title', 'hosts', 'honoree', 'date', 'time', 'venue', 'location') then
      if jsonb_typeof(v_value) not in ('string', 'null') then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter table public.events
  add column prompt_facts jsonb
    constraint events_prompt_facts_valid
      check (prompt_facts is null or public.prompt_facts_valid(prompt_facts));

comment on column public.events.prompt_facts is
  'The facts the host''s prompt states, as fact extraction returned them (verbatim spans, unconfirmed). Server-managed: written once by the generation that extracted them (record_event_identity). Shown on the card marked as needing confirmation; never published, never shown to guests, never given to the card design (spec.md §7.3).';

-- The server-managed column guard (last replaced in 20261004000000_phase4_card_data.sql), now
-- with prompt_facts: end users can neither set it on insert nor change it.
create or replace function public.protect_event_server_columns()
returns trigger
language plpgsql
as $$
begin
  if not public.is_end_user_request() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- End users do not insert events at all (Phase 2 revoked the grant); this branch stays
    -- as defence in depth if the grant is ever restored.
    if new.status <> 'DRAFT'
       or new.published_at is not null
       or new.paid_at is not null
       or new.slug is not null
       or new.active_card_design_id is not null
       or new.active_card_shape is not null
       or new.access_code_encrypted is not null
       or new.generation_requested_at is not null
       or new.prompt_facts is not null
       or new.message_sends_used <> 0 then
      raise exception 'column is managed by server code'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id
     or new.status is distinct from old.status
     or new.published_at is distinct from old.published_at
     or new.paid_at is distinct from old.paid_at
     or new.message_sends_used is distinct from old.message_sends_used
     or new.active_card_design_id is distinct from old.active_card_design_id
     or new.active_card_shape is distinct from old.active_card_shape
     or new.access_code_encrypted is distinct from old.access_code_encrypted
     or new.slug is distinct from old.slug
     or new.prompt is distinct from old.prompt
     or new.generation_requested_at is distinct from old.generation_requested_at
     or new.prompt_facts is distinct from old.prompt_facts then
    raise exception 'column is managed by server code'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 2. record_event_identity writes the prompt facts with the identity
-- ===========================================================================
-- As in 20261006000000_phase5_generation_persistence.sql, plus p_prompt_facts: the facts the
-- identity's own extraction kept (null when it gave none, or when this identity is a revision that
-- did not extract). Written to events.prompt_facts only while the column is null, so the first
-- extraction is the one kept and a later revision never replaces it. Nothing is written when the
-- identity is not (not running, published).
--
-- Errors: 22023 invalid argument (including prompt facts that are not a valid object).
drop function public.record_event_identity(uuid, uuid, jsonb, text, text, text);

create function public.record_event_identity(
  p_generation_id uuid,
  p_event_id uuid,
  p_identity jsonb,
  p_raw text,
  p_prompt_version text,
  p_schema_version text,
  p_prompt_facts jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_published_at timestamptz;
  v_revision integer;
begin
  if p_generation_id is null or p_event_id is null
     or p_identity is null or jsonb_typeof(p_identity) <> 'object'
     or p_raw is null
     or p_prompt_version is null or btrim(p_prompt_version) = ''
     or p_schema_version is null or btrim(p_schema_version) = ''
     or (p_prompt_facts is not null and not public.prompt_facts_valid(p_prompt_facts)) then
    raise exception 'invalid record_event_identity arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  select e.status::text, e.published_at into v_status, v_published_at
  from public.events e where e.id = p_event_id
  for no key update;
  if not found then
    return null;
  end if;
  if v_published_at is not null or v_status in ('PUBLISHED', 'PASSED', 'ARCHIVED') then
    return null;
  end if;
  if not exists (
    select 1 from public.generations g
    where g.id = p_generation_id and g.event_id = p_event_id and g.status = 'running'
  ) then
    return null;
  end if;

  -- Numbered under the event's lock, so concurrent writers cannot take the same revision.
  select coalesce(max(i.revision), 0) + 1 into v_revision
  from public.event_identities i where i.event_id = p_event_id;

  insert into public.event_identities
    (event_id, revision, identity, raw, prompt_version, schema_version, generation_id)
  values
    (p_event_id, v_revision, p_identity, p_raw, p_prompt_version, p_schema_version,
     p_generation_id);

  if p_prompt_facts is not null then
    update public.events e
    set prompt_facts = p_prompt_facts
    where e.id = p_event_id and e.prompt_facts is null;
  end if;

  return v_revision;
end;
$$;

revoke execute on function
  public.record_event_identity(uuid, uuid, jsonb, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.record_event_identity(uuid, uuid, jsonb, text, text, text, jsonb) to service_role;

-- ===========================================================================
-- 3. start_generation refuses a second initial generation
-- ===========================================================================
-- As in 20261005000000_phase5_spend_controls.sql, with one more outcome:
--   designed — kind `initial`, and the event already has a card design: its first card exists
--              (spec.md §7.11), so no initial generation is started and nothing is consumed.
--              Another card is `another_direction`. A repeat of the key of the initial
--              generation that made it still answers `existing`.
-- Outcomes, in the order they are decided: existing, published, designed, in_flight, event_cap,
-- host_cap, started.
create or replace function public.start_generation(
  p_event_id uuid,
  p_user_id uuid,
  p_kind text,
  p_idempotency_key text,
  p_event_key_hash bytea,
  p_host_key_hash bytea,
  p_event_cap integer,
  p_host_cap integer,
  p_stale_seconds integer
)
returns table (generation_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_published_at timestamptz;
  v_existing_id uuid;
  v_existing_kind text;
  v_running uuid;
  v_id uuid;
begin
  if p_event_id is null or p_user_id is null
     or p_kind is null or p_kind not in ('initial', 'another_direction', 'shape_switch')
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 200
     or p_event_key_hash is null or p_host_key_hash is null
     or p_event_cap is null or p_event_cap <= 0
     or p_host_cap is null or p_host_cap <= 0
     or p_stale_seconds is null or p_stale_seconds <= 0 then
    raise exception 'invalid start_generation arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Serializes every start for this event. NO KEY UPDATE: it excludes other starts (and ordinary
  -- updates of the event) without blocking inserts of rows that reference the event.
  select e.status::text, e.published_at into v_status, v_published_at
  from public.events e where e.id = p_event_id
  for no key update;
  if not found then
    raise exception 'event not found' using errcode = 'no_data_found';
  end if;

  if not exists (
    select 1 from public.event_members m where m.event_id = p_event_id and m.user_id = p_user_id
  ) then
    raise exception 'only the event''s owner or a co-host can generate its card'
      using errcode = 'insufficient_privilege';
  end if;

  update public.generations g
  set status = 'failed', error_code = 'stale', finished_at = now()
  where g.event_id = p_event_id
    and g.status = 'running'
    and g.heartbeat_at < now() - make_interval(secs => p_stale_seconds);

  select g.id, g.kind into v_existing_id, v_existing_kind
  from public.generations g
  where g.event_id = p_event_id and g.idempotency_key = p_idempotency_key;
  if v_existing_id is not null then
    if v_existing_kind <> p_kind then
      raise exception 'idempotency key already used for a % generation', v_existing_kind
        using errcode = 'invalid_parameter_value';
    end if;
    return query select v_existing_id, 'existing'::text;
    return;
  end if;

  if v_published_at is not null or v_status in ('PUBLISHED', 'PASSED', 'ARCHIVED') then
    return query select null::uuid, 'published'::text;
    return;
  end if;

  -- Designs are inserted only under this event's lock (persist_generated_card), so the check
  -- cannot race a first card being persisted.
  if p_kind = 'initial'
     and exists (select 1 from public.card_designs d where d.event_id = p_event_id) then
    return query select null::uuid, 'designed'::text;
    return;
  end if;

  select g.id into v_running
  from public.generations g
  where g.event_id = p_event_id and g.status = 'running';
  if v_running is not null then
    return query select v_running, 'in_flight'::text;
    return;
  end if;

  begin
    if not public.consume_rate_limit('generation:event', p_event_key_hash, 86400, p_event_cap) then
      raise exception 'event_cap' using errcode = 'P5CAP';
    end if;
    if not public.consume_rate_limit('generation:host', p_host_key_hash, 86400, p_host_cap) then
      raise exception 'host_cap' using errcode = 'P5CAP';
    end if;
    insert into public.generations (event_id, kind, requested_by, idempotency_key)
    values (p_event_id, p_kind, p_user_id, p_idempotency_key)
    returning id into v_id;
  exception when sqlstate 'P5CAP' then
    -- The subtransaction is rolled back: neither counter keeps the refused unit.
    return query select null::uuid, sqlerrm;
    return;
  end;

  return query select v_id, 'started'::text;
end;
$$;

-- create or replace keeps the function's grants (service_role only, from the spend-controls
-- migration); restated so this file is correct on its own.
revoke execute on function
  public.start_generation(uuid, uuid, text, text, bytea, bytea, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function
  public.start_generation(uuid, uuid, text, text, bytea, bytea, integer, integer, integer)
  to service_role;

-- prompt_facts_valid keeps the default execute grant: it is a pure check, and the column's
-- constraint runs it as whoever updates an event row (an owner saving details included), so
-- revoking it would refuse their every save.

-- Refresh PostgREST's schema cache however this migration is applied; a no-op without a listener.
notify pgrst, 'reload schema';
