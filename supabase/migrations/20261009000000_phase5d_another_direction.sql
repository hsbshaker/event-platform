-- Phase 5d: Try another direction as one box — the change the host asks for, or a new idea
-- (docs/development-plan.md, Phase 5; owner decisions 2026-10-05, docs/CHANGELOG-v7.md "Phase 5d").
--
-- Requirements: spec.md §7.7 (one design per round: a change to part of the card, a change to the
-- whole look, or a new idea; the design records which; the card it changes stays as it was and
-- stays active until the host chooses), §7.11 (the first card becomes active; later ones only when
-- chosen), §7.15 (the flow), §8.2 (no new design and no switching after publish), §10 (one
-- generation in flight, caps, idempotency), §24 (CardDesign, generated-data immutability).
-- Guardrails: spec.md §32 #17 (the host's feedback never reaches the image model: it is stored
-- here, server-only, and read by the design call alone), #25, #27 (designs stay immutable), #30
-- (one design per round), #42 (nothing here is visible to end users).

-- ===========================================================================
-- 1. card_designs.refinement and changed_from (docs/model-contracts.md §5.1, card_design_schema_v3)
-- ===========================================================================
-- What the design made: `part` (the card being changed, with a change to part of it), `whole` (the
-- same idea with its whole look changed) or `none` (a new idea; every first card). Existing designs
-- were made before the field existed and read as `none`: the column's default fills them without
-- an UPDATE, so the immutability trigger (protect_card_design) is not involved.
--
-- changed_from: on a Try another direction design, the design the host was looking at when they
-- asked (generations.from_design_id), whichever of the three it made; null on a first card. The
-- composite foreign key keeps it a design of the same event (MATCH SIMPLE: skipped while null).
-- A change the host asked for always names the card it changes.
alter table public.card_designs
  add column refinement text not null default 'none'
    constraint card_designs_refinement_valid check (refinement in ('none', 'part', 'whole')),
  add column changed_from uuid,
  add constraint card_designs_changed_from_same_event
    foreign key (event_id, changed_from) references public.card_designs (event_id, id),
  add constraint card_designs_refinement_names_its_card
    check (refinement = 'none' or changed_from is not null);

-- ===========================================================================
-- 2. generations.feedback and from_design_id (spec.md §7.15)
-- ===========================================================================
-- feedback: what the host typed in the box, trimmed, 1–500 characters; null for an empty box and
-- for every other kind. Host content: written only by start_generation, read only by the server
-- (the design call, as data; the identity revision), never by the image model (§32 #17), and never
-- returned to anyone (the table has no end-user grant).
--
-- from_design_id: the design the host was looking at (the card being changed, or the one a new
-- idea departs from). Same event, by the composite foreign key, as generations.card_design_id.
alter table public.generations
  add column feedback text
    constraint generations_feedback_trimmed check (
      feedback is null
      or (char_length(feedback) between 1 and 500 and feedback !~ '^\s' and feedback !~ '\s$')
    ),
  add column from_design_id uuid,
  add constraint generations_from_design_same_event
    foreign key (event_id, from_design_id)
    references public.card_designs (event_id, id) on delete cascade,
  add constraint generations_direction_fields_only_on_another_direction
    check (kind = 'another_direction' or (feedback is null and from_design_id is null));

-- ===========================================================================
-- 3. start_generation takes the box and the card it was opened from
-- ===========================================================================
-- As in 20261008000000_phase5c_prompt_facts.sql, plus p_feedback and p_from_design_id, which only
-- kind `another_direction` takes and which it requires the design of:
--   p_feedback        — the host's words; trimmed here (leading and trailing whitespace), an empty
--                       box is null, more than 500 characters is an invalid argument;
--   p_from_design_id  — the design the host was looking at; required for another_direction.
-- One more outcome:
--   no_design — kind `another_direction`, and the event has no card design yet: there is no card
--               to change or depart from, so nothing is started and nothing is consumed.
-- A from-design that is not a design of this event is refused (23514) before anything is consumed.
-- Outcomes, in the order they are decided: existing, published, designed, no_design, in_flight,
-- event_cap, host_cap, started. A repeat of a key answers `existing` whatever its feedback.
--
-- Errors: 22023 invalid argument · P0002 no such event · 42501 p_user_id is not the event's owner
-- or a co-host · 23514 the from-design is not this event's.
drop function public.start_generation(uuid, uuid, text, text, bytea, bytea, integer, integer, integer);

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
  p_from_design_id uuid default null
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
     or (p_kind <> 'another_direction' and (p_feedback is not null or p_from_design_id is not null))
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

  -- Designs are inserted only under this event's lock (persist_generated_card), so neither check
  -- can race a card being persisted.
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
      (event_id, kind, requested_by, idempotency_key, feedback, from_design_id)
    values
      (p_event_id, p_kind, p_user_id, p_idempotency_key, v_feedback, p_from_design_id)
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
  public.start_generation(uuid, uuid, text, text, bytea, bytea, integer, integer, integer, text, uuid)
  from public, anon, authenticated;
grant execute on function
  public.start_generation(uuid, uuid, text, text, bytea, bytea, integer, integer, integer, text, uuid)
  to service_role;

-- ===========================================================================
-- 4. persist_generated_card records what the design made, and activates only a first card
-- ===========================================================================
-- As in 20261006000000_phase5_generation_persistence.sql, plus:
--   p_refinement   — the design's `refinement` (none, part, whole). `part` and `whole` answer the
--                    host's feedback, so only an another_direction generation with feedback may
--                    persist them;
--   p_changed_from — must be the generation's from_design_id (null for every other kind).
-- and step 4 changes: only an `initial` generation's design becomes the event's active design
-- (while it has none). Any other design is listed and stays inactive until the host chooses it
-- (spec.md §7.7, §7.11, §7.15 step 7).
--
-- Errors: 22023 invalid argument (including a refinement or changed_from the generation does not
-- allow); 22P02 an unknown enum value; 23xxx a violated constraint.
drop function public.persist_generated_card(
  uuid, uuid, integer, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text[],
  text, text, integer, integer, integer, text, text[], jsonb, text, text, jsonb);

create function public.persist_generated_card(
  p_generation_id uuid,
  p_event_id uuid,
  p_identity_revision integer,
  p_name text,
  p_description text,
  p_shape text,
  p_layout text,
  p_art_mode text,
  p_typography jsonb,
  p_wording jsonb,
  p_art_brief jsonb,
  p_raw jsonb,
  p_versions jsonb,
  p_standard_wording_slots text[],
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
  p_telemetry jsonb,
  p_refinement text default 'none',
  p_changed_from uuid default null
)
returns table (card_design_id uuid, round integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_published_at timestamptz;
  v_kind text;
  v_feedback text;
  v_from_design_id uuid;
  v_round integer;
  v_design_id uuid;
begin
  if p_generation_id is null or p_event_id is null or p_identity_revision is null
     or p_raw is null or p_versions is null or jsonb_typeof(p_versions) <> 'object'
     or p_standard_wording_slots is null
     or p_storage_key is null or btrim(p_storage_key) = ''
     or p_fits_shapes is null
     or p_telemetry is null or jsonb_typeof(p_telemetry) <> 'object'
     or p_refinement is null or p_refinement not in ('none', 'part', 'whole') then
    raise exception 'invalid persist_generated_card arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  select e.status::text, e.published_at into v_status, v_published_at
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
  -- succeeded, so one generation produces one design.
  select g.kind, g.feedback, g.from_design_id into v_kind, v_feedback, v_from_design_id
  from public.generations g
  where g.id = p_generation_id and g.event_id = p_event_id and g.status = 'running';
  if not found then
    return;
  end if;

  if p_changed_from is distinct from v_from_design_id
     or (p_refinement <> 'none' and (v_kind <> 'another_direction' or v_feedback is null)) then
    raise exception 'refinement or changed_from does not match the generation'
      using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(max(d.round), 0) + 1 into v_round
  from public.card_designs d where d.event_id = p_event_id;

  insert into public.card_designs
    (event_id, round, name, description, shape, layout, art_mode, typography, wording, art_brief,
     raw, standard_wording_slots, versions, identity_revision, refinement, changed_from)
  values
    (p_event_id, v_round, p_name, p_description, p_shape::public.card_shape,
     p_layout::public.card_layout, p_art_mode::public.card_art_mode, p_typography, p_wording,
     p_art_brief, p_raw, p_standard_wording_slots, p_versions, p_identity_revision, p_refinement,
     p_changed_from)
  returning id into v_design_id;

  insert into public.card_art_assets
    (event_id, card_design_id, proportion, fits_shapes, storage_key, mime_type, width, height,
     size_bytes, ink, image_model, art_prompt_version)
  values
    (p_event_id, v_design_id, p_proportion::public.card_proportion,
     p_fits_shapes::public.card_shape[], p_storage_key, p_mime_type, p_width, p_height,
     p_size_bytes, p_ink, p_image_model, p_art_prompt_version);

  -- The first card becomes active; a later one only when the host chooses it (choose_card_design).
  if v_kind = 'initial' then
    update public.events e
    set active_card_design_id = v_design_id,
        active_card_shape = p_shape::public.card_shape
    where e.id = p_event_id and e.active_card_design_id is null;
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
  set schema_valid_first_call = (p_telemetry ->> 'schemaValidFirstCall')::boolean,
      reprompts = p_telemetry -> 'reprompts',
      standard_wording_slots = array(
        select jsonb_array_elements_text(coalesce(p_telemetry -> 'standardWording', '[]'))
      )
  where r.generation_id = p_generation_id and r.operation = 'card_design';

  update public.generation_runs r
  set art_regenerated = p_telemetry ->> 'artRegenerated',
      art_repaints = (p_telemetry ->> 'artRepaints')::integer,
      ink_panels = p_telemetry -> 'inkPanels'
  where r.generation_id = p_generation_id and r.operation = 'card_art';

  update public.generation_runs r
  set schema_valid_first_call = (p_telemetry ->> 'identityValidFirstCall')::boolean
  where r.generation_id = p_generation_id and r.operation = 'event_identity'
    and p_telemetry ? 'identityValidFirstCall';

  return query select v_design_id, v_round;
end;
$$;

revoke execute on function
  public.persist_generated_card(
    uuid, uuid, integer, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text[],
    text, text, integer, integer, integer, text, text[], jsonb, text, text, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function
  public.persist_generated_card(
    uuid, uuid, integer, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text[],
    text, text, integer, integer, integer, text, text[], jsonb, text, text, jsonb, text, uuid)
  to service_role;

-- ===========================================================================
-- 5. choose_card_design: the host chooses a design (spec.md §7.11, §7.14, §7.15 step 8, §8.2)
-- ===========================================================================
-- Makes p_design_id the event's active design, in the design's own shape. Server-only, like every
-- write of events.active_card_design_id (protect_event_server_columns refuses end users): the
-- server action authorizes the signed-in owner or co-host first (`choose_design`), and the
-- function checks the member again as the backstop. Under the event's lock, so a choice cannot
-- race a publish or a persist.
--
-- Outcomes:
--   chosen    — the design is now active in its own shape; choosing the design that is already
--               active changes nothing (its shape stays as the host left it);
--   published — the event is published (or past it): switching designs is disabled (§8.2);
--   not_found — no such event, or the design is not one of this event's with artwork for its
--               own shape (a design is always persisted with it; this never shows a card that
--               cannot be drawn).
-- Changes the design only: event details, guests, RSVP, registry, privacy and messages are never
-- touched (spec.md §31 Card experience).
--
-- Errors: 22023 invalid argument · 42501 p_user_id is not the event's owner or a co-host.
create function public.choose_card_design(
  p_event_id uuid,
  p_user_id uuid,
  p_design_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_published_at timestamptz;
  v_active uuid;
  v_shape public.card_shape;
begin
  if p_event_id is null or p_user_id is null or p_design_id is null then
    raise exception 'invalid choose_card_design arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  select e.status::text, e.published_at, e.active_card_design_id
  into v_status, v_published_at, v_active
  from public.events e where e.id = p_event_id
  for no key update;
  if not found then
    return 'not_found';
  end if;

  if not exists (
    select 1 from public.event_members m where m.event_id = p_event_id and m.user_id = p_user_id
  ) then
    raise exception 'only the event''s owner or a co-host can choose its design'
      using errcode = 'insufficient_privilege';
  end if;

  if v_published_at is not null or v_status in ('PUBLISHED', 'PASSED', 'ARCHIVED') then
    return 'published';
  end if;

  select d.shape into v_shape
  from public.card_designs d
  where d.id = p_design_id and d.event_id = p_event_id
    and exists (
      select 1 from public.card_art_assets a
      where a.card_design_id = d.id and a.event_id = p_event_id and d.shape = any (a.fits_shapes)
    );
  if not found then
    return 'not_found';
  end if;

  if v_active is distinct from p_design_id then
    update public.events e
    set active_card_design_id = p_design_id,
        active_card_shape = v_shape
    where e.id = p_event_id;
  end if;
  return 'chosen';
end;
$$;

revoke execute on function public.choose_card_design(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.choose_card_design(uuid, uuid, uuid) to service_role;

-- Refresh PostgREST's schema cache however this migration is applied; a no-op without a listener.
notify pgrst, 'reload schema';
