-- Phase 5a: spend controls, the generation lock and generation telemetry (docs/development-plan.md,
-- Phase 5, principle 3: "spend controls ship with the first production model call").
--
-- Requirements: spec.md §9.5 (generation telemetry), §9.6 (model usage and cost metering), §10
-- (one generation in flight per event; per-event and per-acting-host daily caps, a co-host sharing
-- the event's; a global spend ceiling; idempotency so retries and double taps never duplicate an
-- expensive call), §24 (GenerationRun). Guardrails: spec.md §32 #4 (no model call for anonymous
-- users: every generation names an event member), #42 (no backend counters exposed: every object
-- here is server-only). Owner decision (docs/technology-decisions.md §8.1): $20/day across all
-- generation, 30 generations per event per day, 60 per acting host per day, held as server
-- configuration; the numbers are arguments here, never constants.
--
-- Everything below is server-only: RLS on, no end-user policies, grants revoked from anon and
-- authenticated, functions executable by service_role only.

-- ===========================================================================
-- 1. The daily spend ledger (spec.md §10 "global/project spend ceiling")
-- ===========================================================================
-- One row per UTC day. A model call reserves a conservative estimate of its cost before it is
-- made and settles its actual cost afterwards (src/lib/ai/meter.server.ts), so the ceiling holds
-- for calls in flight as well as calls finished.
create table public.model_spend_days (
  day date primary key,
  reserved_usd numeric(12, 6) not null default 0 check (reserved_usd >= 0),
  spent_usd numeric(12, 6) not null default 0 check (spent_usd >= 0)
);

-- Reserve p_estimate_usd against today's (UTC) ceiling. Returns the day the reservation was booked
-- on, which settle_model_spend must be given back, or null when spent + reserved + estimate would
-- exceed p_ceiling_usd (nothing is reserved then).
--
-- Atomic: the conditional UPDATE locks the day's row, and under READ COMMITTED a concurrent
-- reservation waiting on that lock re-evaluates the condition against the committed row, so
-- concurrent reservations can never together pass the ceiling.
--
-- It returns the day rather than a boolean so that a call reserved just before midnight UTC
-- settles against the day it was reserved on, not the next one.
create or replace function public.reserve_model_spend(p_estimate_usd numeric, p_ceiling_usd numeric)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
begin
  if p_estimate_usd is null or p_estimate_usd < 0 or p_ceiling_usd is null or p_ceiling_usd < 0 then
    raise exception 'estimate and ceiling must be non-negative'
      using errcode = 'invalid_parameter_value';
  end if;
  insert into public.model_spend_days (day) values (v_day) on conflict (day) do nothing;
  update public.model_spend_days d
  set reserved_usd = d.reserved_usd + p_estimate_usd
  where d.day = v_day
    and d.spent_usd + d.reserved_usd + p_estimate_usd <= p_ceiling_usd;
  if found then
    return v_day;
  end if;
  return null;
end;
$$;

-- Release a reservation and book the call's actual cost on the day it was reserved. The actual
-- cost is booked in full even when it exceeds the reservation; the reservation estimates are
-- conservative so that it does not (src/lib/ai/pricing.ts).
create or replace function public.settle_model_spend(
  p_day date,
  p_reserved_usd numeric,
  p_actual_usd numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_day is null or p_reserved_usd is null or p_reserved_usd < 0
     or p_actual_usd is null or p_actual_usd < 0 then
    raise exception 'day, reserved and actual amounts are required and non-negative'
      using errcode = 'invalid_parameter_value';
  end if;
  insert into public.model_spend_days as d (day, reserved_usd, spent_usd)
  values (p_day, 0, p_actual_usd)
  on conflict (day) do update
    set reserved_usd = greatest(d.reserved_usd - p_reserved_usd, 0),
        spent_usd = d.spent_usd + p_actual_usd;
end;
$$;

-- ===========================================================================
-- 2. generations: one row per generation request (spec.md §10)
-- ===========================================================================
-- A generation is one round: an initial card, another direction, or a shape switch that needs new
-- artwork. It holds the event's generation lock while `running` (the partial unique index below),
-- and its worker proves it is alive through heartbeat_at, which every metered model call bumps
-- (heartbeat_generation). Stage results the wait surface may show are written to `artifacts` as
-- they resolve (spec.md §7.10: real output only); that is Phase 5b.
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('initial', 'another_direction', 'shape_switch')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  -- Free-form progress marker (identity, design, art, compile, ...), set by server code.
  stage text check (stage is null or char_length(stage) between 1 and 64),
  requested_by uuid references public.profiles (id) on delete set null,
  -- Chosen by the client per user action, so a retried or double-tapped request finds the same row.
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  round integer check (round is null or round >= 1),
  card_design_id uuid,
  error_code text check (error_code is null or char_length(error_code) between 1 and 64),
  artifacts jsonb not null default '{}' check (jsonb_typeof(artifacts) = 'object'),
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  finished_at timestamptz,

  constraint generations_idempotency_key unique (event_id, idempotency_key),
  -- The design a generation produced belongs to the same event (as in the card tables).
  constraint generations_design_same_event
    foreign key (event_id, card_design_id)
    references public.card_designs (event_id, id) on delete cascade,
  constraint generations_finished_when_not_running
    check ((status = 'running') = (finished_at is null)),
  constraint generations_error_only_on_failure
    check (error_code is null or status = 'failed')
);

-- One generation in flight per event (spec.md §10).
create unique index generations_one_running_per_event
  on public.generations (event_id) where status = 'running';
create index generations_event_started_idx on public.generations (event_id, started_at desc);

-- start_generation: the only way a generation begins.
--
-- Outcomes (generation_id is null for the refusals):
--   started    — a new running generation; the event and host daily caps were consumed.
--   existing   — this event already has a generation with this idempotency key (any status);
--                nothing was consumed. A key reused for a different kind is an error (22023).
--   published  — the event is published (or past it): generation is disabled after publish
--                (spec.md §8.2, §23); nothing was consumed.
--   in_flight  — another generation of this event is running; nothing was consumed. Its id is
--                returned so the caller can show it.
--   event_cap  — the event's daily cap (all collaborators together) is reached; nothing consumed.
--   host_cap   — the acting host's daily cap (across all their events) is reached; nothing consumed.
--
-- Before deciding, a running generation of this event whose heartbeat is older than
-- p_stale_seconds is marked failed with error_code 'stale' (its worker died: no live worker goes
-- that long without a metered call), so it neither blocks the event nor answers as in_flight.
--
-- Race safety: every call for one event first takes the event row's lock, so the stale check,
-- the idempotency lookup, the in-flight check and the insert run one at a time per event; the
-- partial unique index is the backstop. The host cap spans events, so it cannot rely on that
-- lock: consume_rate_limit's counter row is updated atomically under its own row lock. The caps
-- are consumed inside a subtransaction that is rolled back when either refuses, so a refused
-- start consumes nothing (spec.md §10: a cap counts generations, not attempts).
--
-- The daily windows are consume_rate_limit's fixed 86400 s windows, aligned to UTC midnight. Key
-- hashes are computed by the caller exactly as for every other rate limit (HMAC of the event id
-- and of the user id, src/lib/auth/rate-limit.ts `hashRateLimitKey`), so the counters table never
-- holds a raw identifier.
--
-- Errors: 22023 invalid argument · P0002 no such event · 42501 p_user_id is not the event's owner
-- or a co-host (a generation always names a member: no model call for anonymous users, §32 #4).
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

-- The worker's proof of life, called before every metered model call. Returns false when the
-- generation is not running (finished, failed, or failed as stale and taken over): the meter then
-- refuses the call, so a worker that lost its generation cannot keep spending.
create or replace function public.heartbeat_generation(p_generation_id uuid, p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Generation stops at publish (spec.md §23, §8.2): a generation started before another
  -- collaborator published is failed here, so the meter refuses its next model call.
  update public.generations g
  set status = 'failed', error_code = 'published', finished_at = now()
  from public.events e
  where g.id = p_generation_id and g.event_id = p_event_id and g.status = 'running'
    and e.id = g.event_id
    and (e.published_at is not null or e.status::text in ('PUBLISHED', 'PASSED', 'ARCHIVED'));
  if found then
    return false;
  end if;
  update public.generations g
  set heartbeat_at = now()
  where g.id = p_generation_id and g.event_id = p_event_id and g.status = 'running';
  return found;
end;
$$;

-- ===========================================================================
-- 3. generation_runs: one row per model call (spec.md §9.5, §9.6, §24 GenerationRun)
-- ===========================================================================
-- Image safety moderation (omni-moderation-latest) is a model call like any other and goes
-- through the meter, so it is recorded too. It is free; its row carries a zero cost.
-- (The new value is not used in this migration: an enum value added in a transaction cannot be
-- used before it commits.)
alter type public.model_operation add value 'card_art_moderation';

alter table public.generation_runs
  add column generation_id uuid references public.generations (id) on delete set null,
  add column image_units integer check (image_units is null or image_units >= 0),
  add column layout_set_version text,
  -- Null, or why the artwork was regenerated: the failed validation, or a panel repaint (§7.8).
  add column art_regenerated text,
  add column art_repaints integer check (art_repaints is null or art_repaints between 0 and 2),
  add column standard_wording_slots text[]
    check (standard_wording_slots is null
           or standard_wording_slots <@ array['title', 'invitationLine']::text[]),
  add column ink_panels jsonb,
  -- An image generation or a moderation has no structured-output schema.
  alter column schema_version drop not null;

create index generation_runs_generation_id_idx on public.generation_runs (generation_id);

-- ===========================================================================
-- 4. Row Level Security and grants: all of it is server-only (spec.md §32 #42)
-- ===========================================================================
alter table public.model_spend_days enable row level security;
alter table public.generations enable row level security;

revoke all on table public.model_spend_days from anon, authenticated;
revoke all on table public.generations from anon, authenticated;

revoke execute on function public.reserve_model_spend(numeric, numeric)
  from public, anon, authenticated;
revoke execute on function public.settle_model_spend(date, numeric, numeric)
  from public, anon, authenticated;
revoke execute on function
  public.start_generation(uuid, uuid, text, text, bytea, bytea, integer, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.heartbeat_generation(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.reserve_model_spend(numeric, numeric) to service_role;
grant execute on function public.settle_model_spend(date, numeric, numeric) to service_role;
grant execute on function
  public.start_generation(uuid, uuid, text, text, bytea, bytea, integer, integer, integer)
  to service_role;
grant execute on function public.heartbeat_generation(uuid, uuid) to service_role;

-- Refresh PostgREST's schema cache however this migration is applied; a no-op without a listener.
notify pgrst, 'reload schema';
