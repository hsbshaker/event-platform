-- Phase 5b-2: persisting a card generation (docs/development-plan.md, Phase 5).
--
-- One generation runs on the server after the request that started it (src/lib/generation/
-- run.server.ts, docs/technology-decisions.md §8.1 "Generation execution") and writes what it
-- produces through the functions below, each of which writes only while that generation is still
-- running for its event — a worker that was taken over as stale, failed, or overtaken by a
-- publish writes nothing.
--
-- Requirements: spec.md §7.5 (the identity is interpreted once and persisted), §7.10 (stage
-- results the wait surface may show, as they resolve), §7.11 (the first card becomes the active
-- design; later ones only when chosen), §8.2 (no generation after publish), §9.4 (persist every
-- identity revision, every design raw and validated with its versions, every artwork with its ink),
-- §9.5 (generation telemetry), §24 (EventIdentity revisions, CardDesign, CardArtAsset,
-- GenerationRun; generated-data immutability). Guardrails: spec.md §32 #25, #27 (never mutate or
-- regenerate generated data), #42 (nothing here is visible to end users).

-- ===========================================================================
-- 1. event_identities: one immutable row per revision (spec.md §9.4 "each revision", §24)
-- ===========================================================================
-- Existing rows (none on the hosted databases, but the migration does not assume it) become
-- revision 1, with an empty raw response: the response was not kept before this migration.
alter table public.event_identities
  add column revision integer not null default 1 check (revision >= 1),
  -- The accepted identity response as returned by the model (§9.4 "raw and validated").
  add column raw text not null default '',
  -- The generation that produced this revision. Telemetry, not ownership: the revision stays
  -- when its generation goes.
  add column generation_id uuid references public.generations (id) on delete set null;
alter table public.event_identities
  alter column revision drop default,
  alter column raw drop default;

alter table public.event_identities drop constraint event_identities_pkey;
alter table public.event_identities
  add constraint event_identities_pkey primary key (event_id, revision);

-- A revision is never updated, so it has no updated_at.
drop trigger event_identities_set_updated_at on public.event_identities;
alter table public.event_identities drop column updated_at;

-- Immutability, in the style of card_designs_protect: no update; a delete only through the
-- event's cascade. Applies to every role, service role included.
--
-- The one update that is not a change: deleting a generation nulls generation_id (on delete set
-- null), which happens while the event's own delete cascades. It is allowed when it changes
-- nothing else; no product code path deletes a generation on its own.
create or replace function public.protect_event_identity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.events e where e.id = old.event_id) then
      raise exception 'event identity revisions are kept for the life of their event'
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;
  if new.generation_id is null and old.generation_id is not null
     and (to_jsonb(new) - 'generation_id') = (to_jsonb(old) - 'generation_id') then
    return new;
  end if;
  raise exception 'event identity revisions are immutable'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger event_identities_protect
  before update or delete on public.event_identities
  for each row execute function public.protect_event_identity();

-- Members keep their select (phase 1 policy event_identities_select_member). End users never
-- write, and TRUNCATE skips row triggers, so nobody below the superuser may truncate.
revoke insert, update, delete, truncate on table public.event_identities from anon, authenticated;
revoke truncate on table public.event_identities from service_role;

-- ===========================================================================
-- 2. card_designs.identity_revision: the identity a design was made from (spec.md §9.4)
-- ===========================================================================
-- Existing designs (none on the hosted databases) take revision 1, which existing identities
-- became above; the column's default fills them without an UPDATE, so the immutability trigger is
-- not involved. A design whose event has no identity would fail the foreign key and stop the
-- migration rather than be linked to nothing.
alter table public.card_designs
  add column identity_revision integer not null default 1;
alter table public.card_designs alter column identity_revision drop default;
alter table public.card_designs
  add constraint card_designs_identity_revision_fk
    foreign key (event_id, identity_revision)
    references public.event_identities (event_id, revision);

-- ===========================================================================
-- 3. generations.telemetry: the §9.5 record of a finished generation
-- ===========================================================================
-- Server-only like the rest of the table; never returned to the host (§32 #42).
alter table public.generations
  add column telemetry jsonb check (telemetry is null or jsonb_typeof(telemetry) = 'object');

-- ===========================================================================
-- 4. Server-only write functions
-- ===========================================================================
-- Each is security definer, callable by service_role only, and takes the event row's lock first
-- (FOR NO KEY UPDATE, as start_generation does), so it is serialized with start_generation's
-- stale takeover and with every other write of this event's generation state.

-- record_event_identity: the next identity revision for the event, written only while the
-- generation is running for that event and the event is unpublished (start_generation's
-- published test). Returns the revision, or null when it wrote nothing.
--
-- Errors: 22023 invalid argument.
create or replace function public.record_event_identity(
  p_generation_id uuid,
  p_event_id uuid,
  p_identity jsonb,
  p_raw text,
  p_prompt_version text,
  p_schema_version text
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
     or p_schema_version is null or btrim(p_schema_version) = '' then
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
  return v_revision;
end;
$$;

-- record_generation_stage: a stage result the wait surface may show (spec.md §7.10). While the
-- generation is running: sets its stage, merges p_artifacts into its artifacts (top-level keys
-- replace), and bumps its heartbeat. Returns true, or false when it is not running.
--
-- Errors: 22023 invalid argument.
create or replace function public.record_generation_stage(
  p_generation_id uuid,
  p_event_id uuid,
  p_stage text,
  p_artifacts jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_generation_id is null or p_event_id is null
     or p_stage is null or char_length(p_stage) not between 1 and 64
     or p_artifacts is null or jsonb_typeof(p_artifacts) <> 'object' then
    raise exception 'invalid record_generation_stage arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.events e where e.id = p_event_id for no key update;
  if not found then
    return false;
  end if;

  update public.generations g
  set stage = p_stage,
      artifacts = g.artifacts || p_artifacts,
      heartbeat_at = now()
  where g.id = p_generation_id and g.event_id = p_event_id and g.status = 'running';
  return found;
end;
$$;

-- fail_generation: marks the generation failed with p_error_code, only while it is running. A
-- generation already finished, failed, taken over as stale, or failed by a publish is left as it
-- is. Returns whether it was marked.
--
-- Errors: 22023 invalid argument.
create or replace function public.fail_generation(
  p_generation_id uuid,
  p_event_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_generation_id is null or p_event_id is null
     or p_error_code is null or char_length(p_error_code) not between 1 and 64 then
    raise exception 'invalid fail_generation arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.events e where e.id = p_event_id for no key update;
  if not found then
    return false;
  end if;

  update public.generations g
  set status = 'failed', error_code = p_error_code, finished_at = now()
  where g.id = p_generation_id and g.event_id = p_event_id and g.status = 'running';
  return found;
end;
$$;

-- persist_generated_card: the finished card of a generation, in one transaction.
--
-- Under the event's lock, and only while the generation is running for that event and the event
-- is unpublished (start_generation's published test):
--   1. round = the event's highest round + 1;
--   2. the card_designs row: the validated design, the raw response, its versions, the slots that
--      fell back to standard wording, and the identity revision it was made from;
--   3. its one card_art_assets row (spec.md §24: a design is never inserted without its artwork);
--   4. when the event has no active design, this one becomes active in its own shape
--      (spec.md §7.11: the first card is active; later ones only when the host chooses them);
--   5. the generation is marked succeeded with the design, the round, the §9.5 telemetry, stage
--      `done` and finished_at;
--   6. this generation's generation_runs get their round, and the §9.5 columns for their
--      operation, from the same telemetry (spec.md §24 GenerationRun), so there is no second
--      source of truth.
-- Returns (card_design_id, round). When the generation is not running or the event is published
-- it writes nothing and returns no row. Any failing insert (a constraint, an unknown enum value)
-- aborts the whole call: nothing is half-written.
--
-- p_telemetry keys read here: schemaValidFirstCall (boolean), reprompts (array of kinds),
-- standardWording (array of slots), artRegenerated (text or null), artRepaints (integer),
-- inkPanels (array), identityValidFirstCall (boolean or null).
--
-- Errors: 22023 invalid argument; 22P02 an unknown enum value; 23xxx a violated constraint.
create or replace function public.persist_generated_card(
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
  p_telemetry jsonb
)
returns table (card_design_id uuid, round integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_published_at timestamptz;
  v_round integer;
  v_design_id uuid;
begin
  if p_generation_id is null or p_event_id is null or p_identity_revision is null
     or p_raw is null or p_versions is null or jsonb_typeof(p_versions) <> 'object'
     or p_standard_wording_slots is null
     or p_storage_key is null or btrim(p_storage_key) = ''
     or p_fits_shapes is null
     or p_telemetry is null or jsonb_typeof(p_telemetry) <> 'object' then
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
  if not exists (
    select 1 from public.generations g
    where g.id = p_generation_id and g.event_id = p_event_id and g.status = 'running'
  ) then
    return;
  end if;

  select coalesce(max(d.round), 0) + 1 into v_round
  from public.card_designs d where d.event_id = p_event_id;

  insert into public.card_designs
    (event_id, round, name, description, shape, layout, art_mode, typography, wording, art_brief,
     raw, standard_wording_slots, versions, identity_revision)
  values
    (p_event_id, v_round, p_name, p_description, p_shape::public.card_shape,
     p_layout::public.card_layout, p_art_mode::public.card_art_mode, p_typography, p_wording,
     p_art_brief, p_raw, p_standard_wording_slots, p_versions, p_identity_revision)
  returning id into v_design_id;

  insert into public.card_art_assets
    (event_id, card_design_id, proportion, fits_shapes, storage_key, mime_type, width, height,
     size_bytes, ink, image_model, art_prompt_version)
  values
    (p_event_id, v_design_id, p_proportion::public.card_proportion,
     p_fits_shapes::public.card_shape[], p_storage_key, p_mime_type, p_width, p_height,
     p_size_bytes, p_ink, p_image_model, p_art_prompt_version);

  update public.events e
  set active_card_design_id = v_design_id,
      active_card_shape = p_shape::public.card_shape
  where e.id = p_event_id and e.active_card_design_id is null;

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

-- ===========================================================================
-- 5. Grants: server only (spec.md §32 #42)
-- ===========================================================================
revoke execute on function
  public.record_event_identity(uuid, uuid, jsonb, text, text, text)
  from public, anon, authenticated;
revoke execute on function
  public.record_generation_stage(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
revoke execute on function
  public.fail_generation(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function
  public.persist_generated_card(
    uuid, uuid, integer, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text[],
    text, text, integer, integer, integer, text, text[], jsonb, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function
  public.record_event_identity(uuid, uuid, jsonb, text, text, text) to service_role;
grant execute on function
  public.record_generation_stage(uuid, uuid, text, jsonb) to service_role;
grant execute on function
  public.fail_generation(uuid, uuid, text) to service_role;
grant execute on function
  public.persist_generated_card(
    uuid, uuid, integer, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text[],
    text, text, integer, integer, integer, text, text[], jsonb, text, text, jsonb)
  to service_role;

-- Refresh PostgREST's schema cache however this migration is applied; a no-op without a listener.
notify pgrst, 'reload schema';
