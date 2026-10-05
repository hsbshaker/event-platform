-- Card shape switches, server side (docs/development-plan.md, Phase 6 "switching to shapes the
-- existing artwork fits"; the generation path for a shape no existing artwork fits).
--
-- Requirements: spec.md §7.14 (the shape control: a shape an existing artwork fits applies
-- instantly with no model call; any other shape generates new artwork for it from the same art
-- brief, with the current artwork as the reference, counts toward the §10 limits, before publish
-- only; the current card stays as it is until the new artwork is ready; switching back is
-- instant), §8.1 (after publish: only shapes an existing artwork already fits), §8.2 (no shape
-- that needs new artwork after publish), §10 (a shape switch that needs new artwork is a
-- generation: one in flight, caps, idempotency), §20.5 (Event.activeCardShape), §24 (a design has
-- its original artwork plus one per shape switch no existing artwork fits; generated data is
-- immutable). docs/card-system.md §2.1, §2.4, §5 and the step table of §7.
-- Guardrails: spec.md §32 #25, #27 (a design and its artwork are never mutated: a switch adds an
-- artwork to the same design), #28 (a switch to a shape no existing artwork fits is a generation),
-- #30 (one artwork per round), #42 (nothing here is visible to end users).
--
-- Which shapes a design's layout supports is product code (src/lib/card/layouts.ts), not data:
-- the server action refuses an unsupported shape before calling anything here, and the
-- orchestration refuses it again before any image request. An artwork's fits_shapes are always
-- shapes its layout supports, so "an artwork of the design fits the shape" implies support.

-- ===========================================================================
-- 1. generations.shape: the shape a shape switch paints for
-- ===========================================================================
-- shape: kind `shape_switch` only, the shape the host asked for. from_design_id, until now
-- another direction's alone, also names a shape switch's design: the event's active design when
-- the switch started (start_generation checks it under the event's lock). The artwork is added
-- to that design.
--
-- The table constraints say what each kind may carry; start_generation is what requires a shape
-- switch's two fields. They are not written as "shape_switch if and only if both are set",
-- because the kind was accepted before this migration without either field and this migration
-- does not assume no such row exists (none was ever started by product code). The orchestration
-- refuses a shape switch that lacks either.
alter table public.generations
  add column shape public.card_shape,
  drop constraint generations_direction_fields_only_on_another_direction,
  add constraint generations_feedback_only_on_another_direction
    check (kind = 'another_direction' or feedback is null),
  add constraint generations_from_design_not_on_initial
    check (kind <> 'initial' or from_design_id is null),
  add constraint generations_shape_only_on_shape_switch
    check (kind = 'shape_switch' or shape is null);

-- ===========================================================================
-- 2. start_generation takes a shape switch's design and shape
-- ===========================================================================
-- As in 20261009000000_phase5d_another_direction.sql, plus p_shape. Kind `shape_switch` requires
-- p_from_design_id (the design the server action validated the shape against: the event's
-- active design) and p_shape, and takes no feedback; every other kind takes no p_shape.
-- Two more outcomes, for kind `shape_switch` only, each consuming nothing:
--   not_active — p_from_design_id is no longer the event's active design (another collaborator
--                chose another design meanwhile): the caller re-reads and decides again;
--   fitted     — an artwork of the design already fits p_shape (it was made meanwhile): the
--                switch is instant, so the caller switches instead of generating.
-- and `no_design` also answers a shape switch while the event has no active design.
-- Outcomes, in the order they are decided: existing, published, designed, no_design, not_active,
-- fitted, in_flight, event_cap, host_cap, started.
--
-- Errors: 22023 invalid argument · P0002 no such event · 42501 p_user_id is not the event's owner
-- or a co-host · 23514 another direction's from-design is not this event's.
drop function public.start_generation(
  uuid, uuid, text, text, bytea, bytea, integer, integer, integer, text, uuid);

create function public.start_generation(
  p_event_id uuid,
  p_user_id uuid,
  p_kind text,
  p_idempotency_key text,
  p_event_key_hash bytea,
  p_host_key_hash bytea,
  p_event_cap integer,
  p_host_cap integer,
  p_stale_seconds integer,
  p_feedback text default null,
  p_from_design_id uuid default null,
  p_shape public.card_shape default null
)
returns table (generation_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_published_at timestamptz;
  v_active uuid;
  v_existing_id uuid;
  v_existing_kind text;
  v_running uuid;
  v_id uuid;
  v_feedback text;
begin
  if p_event_id is null or p_user_id is null
     or p_kind is null or p_kind not in ('initial', 'another_direction', 'shape_switch')
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 200
     or p_event_key_hash is null or p_host_key_hash is null
     or p_event_cap is null or p_event_cap <= 0
     or p_host_cap is null or p_host_cap <= 0
     or p_stale_seconds is null or p_stale_seconds <= 0
     or (p_kind = 'another_direction' and p_from_design_id is null)
     or (p_kind = 'shape_switch' and (p_from_design_id is null or p_shape is null))
     or (p_kind <> 'another_direction' and p_feedback is not null)
     or (p_kind = 'initial' and p_from_design_id is not null)
     or (p_kind <> 'shape_switch' and p_shape is not null)
  then
    raise exception 'invalid start_generation arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  v_feedback := nullif(regexp_replace(p_feedback, '^\s+|\s+$', '', 'g'), '');
  if v_feedback is not null and char_length(v_feedback) > 500 then
    raise exception 'feedback is longer than 500 characters'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Serializes every start for this event. NO KEY UPDATE: it excludes other starts (and ordinary
  -- updates of the event) without blocking inserts of rows that reference the event.
  select e.status::text, e.published_at, e.active_card_design_id
  into v_status, v_published_at, v_active
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

  -- Designs and artwork are inserted only under this event's lock (persist_generated_card,
  -- persist_shape_switch_artwork), so none of these checks can race a card being persisted.
  if p_kind = 'initial'
     and exists (select 1 from public.card_designs d where d.event_id = p_event_id) then
    return query select null::uuid, 'designed'::text;
    return;
  end if;

  if p_kind = 'another_direction' then
    if not exists (select 1 from public.card_designs d where d.event_id = p_event_id) then
      return query select null::uuid, 'no_design'::text;
      return;
    end if;
    if not exists (
      select 1 from public.card_designs d
      where d.event_id = p_event_id and d.id = p_from_design_id
    ) then
      raise exception 'the design does not belong to this event'
        using errcode = 'check_violation';
    end if;
  end if;

  if p_kind = 'shape_switch' then
    if v_active is null then
      return query select null::uuid, 'no_design'::text;
      return;
    end if;
    -- The active design is this event's (events_active_card_design_same_event), so a design of
    -- another event is never active here either.
    if v_active <> p_from_design_id then
      return query select null::uuid, 'not_active'::text;
      return;
    end if;
    if exists (
      select 1 from public.card_art_assets a
      where a.event_id = p_event_id and a.card_design_id = p_from_design_id
        and p_shape = any (a.fits_shapes)
    ) then
      return query select null::uuid, 'fitted'::text;
      return;
    end if;
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
    insert into public.generations
      (event_id, kind, requested_by, idempotency_key, feedback, from_design_id, shape)
    values
      (p_event_id, p_kind, p_user_id, p_idempotency_key, v_feedback, p_from_design_id, p_shape)
    returning id into v_id;
  exception when sqlstate 'P5CAP' then
    -- The subtransaction is rolled back: neither counter keeps the refused unit.
    return query select null::uuid, sqlerrm;
    return;
  end;

  return query select v_id, 'started'::text;
end;
$$;

revoke execute on function
  public.start_generation(
    uuid, uuid, text, text, bytea, bytea, integer, integer, integer, text, uuid, public.card_shape)
  from public, anon, authenticated;
grant execute on function
  public.start_generation(
    uuid, uuid, text, text, bytea, bytea, integer, integer, integer, text, uuid, public.card_shape)
  to service_role;

-- ===========================================================================
-- 3. switch_card_shape: the instant switch (spec.md §7.14, §8.1)
-- ===========================================================================
-- Shows the event's active design in p_shape when an artwork of that design already fits it: no
-- model call, no generation, no limit consumed. Server-only, like every write of
-- events.active_card_shape (protect_event_server_columns refuses end users): the server action
-- authorizes the signed-in owner or co-host first and checks that the design's layout supports
-- the shape; the function checks the member again as the backstop. Under the event's lock, so a
-- switch cannot race a choice of design, a persist or a publish.
--
-- p_design_id is the design the action validated the shape against; it must still be the active
-- design. After publish the switch is still allowed (§8.1): it only ever shows an artwork that
-- exists, so it never needs new artwork.
--
-- Outcomes:
--   switched      — the active design is shown in p_shape (already so: nothing changes);
--   needs_artwork — no artwork of the design fits p_shape: a generation would make one;
--   not_active    — p_design_id is not the event's active design (chosen meanwhile);
--   no_design     — the event has no active design yet;
--   not_found     — no such event.
-- Changes the shape only: the design, its artwork, event details, guests, RSVP, registry,
-- privacy and messages are never touched (spec.md §20.6).
--
-- Errors: 22023 invalid argument · 22P02 an unknown shape · 42501 p_user_id is not the event's
-- owner or a co-host.
create function public.switch_card_shape(
  p_event_id uuid,
  p_user_id uuid,
  p_design_id uuid,
  p_shape public.card_shape
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active uuid;
  v_active_shape public.card_shape;
begin
  if p_event_id is null or p_user_id is null or p_design_id is null or p_shape is null then
    raise exception 'invalid switch_card_shape arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  select e.active_card_design_id, e.active_card_shape into v_active, v_active_shape
  from public.events e where e.id = p_event_id
  for no key update;
  if not found then
    return 'not_found';
  end if;

  if not exists (
    select 1 from public.event_members m where m.event_id = p_event_id and m.user_id = p_user_id
  ) then
    raise exception 'only the event''s owner or a co-host can switch its card''s shape'
      using errcode = 'insufficient_privilege';
  end if;

  if v_active is null then
    return 'no_design';
  end if;
  if v_active <> p_design_id then
    return 'not_active';
  end if;

  if not exists (
    select 1 from public.card_art_assets a
    where a.event_id = p_event_id and a.card_design_id = p_design_id
      and p_shape = any (a.fits_shapes)
  ) then
    return 'needs_artwork';
  end if;

  if v_active_shape is distinct from p_shape then
    update public.events e set active_card_shape = p_shape where e.id = p_event_id;
  end if;
  return 'switched';
end;
$$;

revoke execute on function public.switch_card_shape(uuid, uuid, uuid, public.card_shape)
  from public, anon, authenticated;
grant execute on function public.switch_card_shape(uuid, uuid, uuid, public.card_shape)
  to service_role;

-- ===========================================================================
-- 4. persist_shape_switch_artwork: a shape switch's new artwork, in one transaction
-- ===========================================================================
-- Under the event's lock, and only while the shape-switch generation is running for that event
-- and the event is unpublished (start_generation's published test):
--   1. one more card_art_assets row for the generation's design (generations.from_design_id) —
--      never a new design, and no earlier artwork is touched (spec.md §24, §32 #25, #27). The new
--      artwork must fit the shape the switch asked for (generations.shape);
--   2. when that design is still the event's active design, the event shows it in the new shape
--      (the host asked for it; the current card stayed as it was until now, spec.md §7.14). When
--      the host chose another design meanwhile, the artwork is kept for a later switch and the
--      active design and shape are left as they are;
--   3. the generation is marked succeeded with the design, its round, the telemetry, stage `done`
--      and finished_at;
--   4. this generation's generation_runs get that round, and the card_art run its §9.5 columns
--      (art_regenerated, art_repaints, ink_panels) from the same telemetry.
-- Returns (card_design_id, round, art_asset_id, activated). When the generation is not running
-- (or not a shape switch) or the event is published it writes nothing and returns no row. Any
-- failing insert aborts the whole call: nothing is half-written.
--
-- p_telemetry keys read here: artRegenerated (text or null), artRepaints (integer), inkPanels
-- (array).
--
-- Errors: 22023 invalid argument (including artwork that does not fit the shape asked for);
-- 22P02 an unknown enum value; 23xxx a violated constraint.
create function public.persist_shape_switch_artwork(
  p_generation_id uuid,
  p_event_id uuid,
  p_storage_key text,
  p_mime_type text,
  p_size_bytes integer,
  p_width integer,
  p_height integer,
  p_proportion text,
  p_fits_shapes text[],
  p_ink jsonb,
  p_image_model text,
  p_art_prompt_version text,
  p_telemetry jsonb
)
returns table (card_design_id uuid, round integer, art_asset_id uuid, activated boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_published_at timestamptz;
  v_active uuid;
  v_design_id uuid;
  v_shape public.card_shape;
  v_round integer;
  v_asset_id uuid;
  v_activated boolean := false;
begin
  if p_generation_id is null or p_event_id is null
     or p_storage_key is null or btrim(p_storage_key) = ''
     or p_fits_shapes is null
     or p_ink is null or jsonb_typeof(p_ink) <> 'object'
     or p_image_model is null or btrim(p_image_model) = ''
     or p_art_prompt_version is null or btrim(p_art_prompt_version) = ''
     or p_telemetry is null or jsonb_typeof(p_telemetry) <> 'object' then
    raise exception 'invalid persist_shape_switch_artwork arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  select e.status::text, e.published_at, e.active_card_design_id
  into v_status, v_published_at, v_active
  from public.events e where e.id = p_event_id
  for no key update;
  if not found then
    return;
  end if;
  if v_published_at is not null or v_status in ('PUBLISHED', 'PASSED', 'ARCHIVED') then
    return;
  end if;
  -- Checked under the event's lock, and the generation leaves `running` below in the same
  -- transaction: a second persist of this generation waits for the lock and then finds it
  -- succeeded, so one generation adds one artwork.
  select g.from_design_id, g.shape into v_design_id, v_shape
  from public.generations g
  where g.id = p_generation_id and g.event_id = p_event_id and g.status = 'running'
    and g.kind = 'shape_switch';
  if not found then
    return;
  end if;
  if v_design_id is null or v_shape is null then
    raise exception 'the shape switch names no design or shape'
      using errcode = 'invalid_parameter_value';
  end if;
  if not (v_shape::text = any (p_fits_shapes)) then
    raise exception 'the artwork does not fit the shape the switch asked for'
      using errcode = 'invalid_parameter_value';
  end if;

  select d.round into v_round
  from public.card_designs d where d.id = v_design_id and d.event_id = p_event_id;

  insert into public.card_art_assets
    (event_id, card_design_id, proportion, fits_shapes, storage_key, mime_type, width, height,
     size_bytes, ink, image_model, art_prompt_version)
  values
    (p_event_id, v_design_id, p_proportion::public.card_proportion,
     p_fits_shapes::public.card_shape[], p_storage_key, p_mime_type, p_width, p_height,
     p_size_bytes, p_ink, p_image_model, p_art_prompt_version)
  returning id into v_asset_id;

  if v_active = v_design_id then
    update public.events e set active_card_shape = v_shape where e.id = p_event_id;
    v_activated := true;
  end if;

  update public.generations g
  set status = 'succeeded',
      card_design_id = v_design_id,
      round = v_round,
      telemetry = p_telemetry,
      stage = 'done',
      finished_at = now()
  where g.id = p_generation_id;

  update public.generation_runs r
  set round = v_round
  where r.generation_id = p_generation_id and r.round is null;

  update public.generation_runs r
  set art_regenerated = p_telemetry ->> 'artRegenerated',
      art_repaints = (p_telemetry ->> 'artRepaints')::integer,
      ink_panels = p_telemetry -> 'inkPanels'
  where r.generation_id = p_generation_id and r.operation = 'card_art';

  return query select v_design_id, v_round, v_asset_id, v_activated;
end;
$$;

revoke execute on function
  public.persist_shape_switch_artwork(
    uuid, uuid, text, text, integer, integer, integer, text, text[], jsonb, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.persist_shape_switch_artwork(
    uuid, uuid, text, text, integer, integer, integer, text, text[], jsonb, text, text, jsonb)
  to service_role;

-- Refresh PostgREST's schema cache however this migration is applied; a no-op without a listener.
notify pgrst, 'reload schema';
