-- Phase 4: the card data model (docs/development-plan.md, Phase 4).
--
-- One forward-only migration that retires the Revision 6 website schema and creates the
-- invitation card's persistence: generated designs and their artwork (immutable), the host's
-- card-editor customizations (revisioned), the platform font store, the event's active design
-- and shape, and the two storage buckets the card needs.
--
-- Requirements: spec.md §20.5 (customizations: one per event × design × shape, revisioned,
-- stale saves refused, `Reset card` is a new revision), §24 (CardDesign, CardArtAsset,
-- CardCustomization, CardFont, Event.activeCardDesignId, Event.activeCardShape; generated-data
-- immutability), §25 (owner and co-host edit the card; guests never write), §27 (privacy);
-- docs/card-system.md §2.1 (six shapes, two proportions), §2.3 (layouts), §2.4 (art modes and
-- fit), §5 (persistence and immutability). Guardrails: spec.md §32 #25, #27, #28.
--
-- Values mirror versioned application code: shapes `src/lib/card/shapes.ts`, art modes
-- `src/lib/card/art-modes.ts`, layouts `card_layouts_v1` (docs/card-system.md §2.3). Adding a
-- shape, layout or art mode is a layout-set version bump (§32 #24) and an `alter type ... add
-- value` here. Which layouts support which shapes and art modes is layout-set data, validated by
-- the compiler, not duplicated in the database.

-- ===========================================================================
-- 1. Retire the website-era schema (Revision 6)
-- ===========================================================================
-- No `if exists` and no `cascade`: every object below is known to exist, and an unexpected
-- dependency should stop the migration rather than be dropped silently.

-- events.active_concept_id: its validation trigger (column-scoped, so it depends on the
-- column), the function behind it, and the foreign key into design_concepts.
drop trigger events_validate_active_concept on public.events;
drop function public.validate_active_concept();
alter table public.events drop constraint events_active_concept_fk;

-- The server-managed column guard named both retired columns; replace it before they go. The
-- new card columns take their place: the active design and shape are switched by server code
-- after it has checked the layout supports the shape, existing artwork fits it, and the event is
-- not yet published (spec.md §8.2, §20.6, §32 #28). End users never set them directly.
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
     or new.generation_requested_at is distinct from old.generation_requested_at then
    raise exception 'column is managed by server code'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

alter table public.events
  drop column active_concept_id,
  drop column design_overrides;

-- The concept and resolved-spec tables. Their policies, triggers, indexes and the foreign keys
-- between them go with the tables; the trigger functions that only they used go after.
drop table public.resolved_design_specs, public.design_concepts;
drop function public.protect_design_concept();
drop function public.validate_resolved_spec_lineage();
drop function public.reject_update();

-- generation_runs stays for Phase 5 telemetry (spec.md §24 GenerationRun, §9.5). These columns
-- belonged to the website pipeline only: three concepts per round, the primitive set, diversity
-- assignment and nearest-sibling similarity, the compiler's repairs and rendered-geometry
-- verification, the composition signature, and the template-library fallback (§32 #21).
alter table public.generation_runs
  drop column concept_index,
  drop column primitive_set_version,
  drop column diversity_assignment,
  drop column compiler_repairs,
  drop column verified,
  drop column signature,
  drop column nearest_sibling,
  drop column fallback;

-- The operation vocabulary moves to the card pipeline (spec.md §9.6). Runs of the retired website
-- operations go with the website (owner decision: website-era data may be dropped).
delete from public.generation_runs where operation in ('design_intent', 'composition');
alter type public.model_operation rename to model_operation_r6;
create type public.model_operation as enum (
  'event_identity',
  'structured_extraction', -- fact extraction
  'card_design',
  'card_art',
  'card_art_inspection'    -- the check of generated artwork (card-system §4.1)
);
alter table public.generation_runs
  alter column operation type public.model_operation
  using operation::text::public.model_operation;
drop type public.model_operation_r6;

-- Human Test #1 reviewer data. The owner approved dropping it with no export
-- (docs/development-plan.md, "Database").
drop table public.human_test_1_responses, public.human_test_1_test_responses;

-- ===========================================================================
-- 2. Card enumerations (docs/card-system.md §2.1, §2.3, §2.4)
-- ===========================================================================
create type public.card_shape as enum (
  'rectangle', 'rounded-rectangle', 'arch', 'oval', 'square', 'circle'
);
create type public.card_proportion as enum ('portrait_5_7', 'square_1_1');
create type public.card_layout as enum ('art-top', 'art-bottom', 'framed', 'corners', 'atmosphere');
create type public.card_art_mode as enum ('illustration', 'framed', 'atmosphere', 'minimal');

-- ===========================================================================
-- 3. card_designs (spec.md §24 CardDesign; card-system §5)
-- ===========================================================================
-- One validated design per generation round, with the model's raw response beside it and the
-- version set it was produced under. Written by server code only. Immutable except selected_at.
-- Artwork lives in card_art_assets (the §24 artAssetIds[] is that relation).
create table public.card_designs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  -- Each round generates one design (spec.md §32 #30).
  round integer not null check (round >= 1),

  name text not null,
  description text not null,

  shape public.card_shape not null,
  layout public.card_layout not null,
  art_mode public.card_art_mode not null,

  -- { primary, alternates[] } pairing IDs.
  typography jsonb not null check (jsonb_typeof(typography) = 'object'),
  -- { title, invitationLine } after the wording fact check.
  wording jsonb not null check (jsonb_typeof(wording) = 'object'),
  art_brief jsonb not null check (jsonb_typeof(art_brief) = 'object'),
  -- The model response as returned.
  raw jsonb not null,
  -- Wording slots that fell back to standard wording after a failed fact check (§31, §29).
  standard_wording_slots text[] not null default '{}'
    check (standard_wording_slots <@ array['title', 'invitationLine']::text[]),
  -- designPrompt, designSchema, layoutSet, compiler, artPrompt, imageModel (card-system §8).
  versions jsonb not null check (jsonb_typeof(versions) = 'object'),

  selected_at timestamptz,
  created_at timestamptz not null default now(),

  constraint card_designs_one_per_round unique (event_id, round),
  -- Target of the same-event foreign keys below: a row that names both an event and a design
  -- can only name a design of that event.
  constraint card_designs_event_id_id_key unique (event_id, id)
);

-- ===========================================================================
-- 4. card_art_assets (spec.md §24 CardArtAsset; card-system §2.4, §5)
-- ===========================================================================
-- The design's original artwork plus one per shape switch no existing artwork fits. The image
-- itself is in the private `card-art` bucket under storage_key. Immutable once written.
--
-- Two artworks of one design may fit the same shape (a retry after a failed validation, two
-- concurrent shape switches); nothing here prevents it. The rule for readers: for a design and
-- shape, the artwork rendered is the newest by created_at among those whose fits_shapes holds
-- that shape. A generation inserts a design together with its first artwork, so a design with
-- no artwork is a failure, never a card.
create table public.card_art_assets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  card_design_id uuid not null,

  proportion public.card_proportion not null,
  -- The shapes this artwork may be shown in; all of its own proportion.
  fits_shapes public.card_shape[] not null,

  storage_key text not null unique,
  mime_type text not null check (mime_type in ('image/png', 'image/webp', 'image/jpeg')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  size_bytes integer not null check (size_bytes > 0),

  -- Resolved ink and panels, keyed by fitted shape, then by zone: { ink, panel?, panelColor? }.
  ink jsonb not null check (jsonb_typeof(ink) = 'object'),

  image_model text not null,
  art_prompt_version text not null,
  created_at timestamptz not null default now(),

  constraint card_art_assets_design_same_event
    foreign key (event_id, card_design_id)
    references public.card_designs (event_id, id) on delete cascade,
  constraint card_art_assets_fits_own_proportion check (
    cardinality(fits_shapes) >= 1
    and fits_shapes <@ (
      case proportion
        when 'portrait_5_7' then
          array['rectangle', 'rounded-rectangle', 'arch', 'oval']::public.card_shape[]
        else array['square', 'circle']::public.card_shape[]
      end
    )
  ),
  -- Ink is resolved for every shape the artwork fits (card-system §4.2), so none renders
  -- without it.
  constraint card_art_assets_ink_per_fitted_shape check (ink ?& fits_shapes::text[])
);

create index card_art_assets_design_idx on public.card_art_assets (event_id, card_design_id);

-- ===========================================================================
-- 5. Immutability of generated data (spec.md §24, §32 #25, #27)
-- ===========================================================================
-- Updates: a design may only be marked selected; artwork never changes. Deletes: generated data
-- goes only with its event (the cascade from events), never on its own. Both apply to every
-- role, service role included: no code path may rewrite or discard a persisted design.
create or replace function public.protect_card_design()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.events e where e.id = old.event_id) then
      raise exception 'card designs are kept for the life of their event'
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - 'selected_at') is distinct from (to_jsonb(old) - 'selected_at') then
    raise exception 'card designs are immutable; only selected_at may change'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger card_designs_protect
  before update or delete on public.card_designs
  for each row execute function public.protect_card_design();

create or replace function public.protect_card_art_asset()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.events e where e.id = old.event_id) then
      raise exception 'card artwork is kept for the life of its event'
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;
  raise exception 'card artwork is immutable'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger card_art_assets_protect
  before update or delete on public.card_art_assets
  for each row execute function public.protect_card_art_asset();

-- ===========================================================================
-- 6. events.active_card_design_id / active_card_shape (spec.md §20.5, §24)
-- ===========================================================================
-- The composite foreign key enforces that the active design belongs to this event; it is
-- skipped while active_card_design_id is null (MATCH SIMPLE). A null active_card_shape means
-- the active design's own shape.
alter table public.events
  add column active_card_design_id uuid,
  add column active_card_shape public.card_shape,
  add constraint events_active_card_design_same_event
    foreign key (id, active_card_design_id) references public.card_designs (event_id, id),
  add constraint events_active_card_shape_needs_design
    check (active_card_shape is null or active_card_design_id is not null);

-- ===========================================================================
-- 7. card_customizations (spec.md §20.5, §24 CardCustomization; card-system §7)
-- ===========================================================================
-- The host's edited text layer, one per event × design × shape. Never mutates the design.
-- Written only through save_card_customization (end users) or by server code (for example a
-- fact edit re-breaking fact boxes). Every write bumps the revision, so a collaborator holding
-- an older revision is refused whoever wrote in between. `Reset card` is a save like any other.
create table public.card_customizations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  card_design_id uuid not null,
  shape public.card_shape not null,
  -- TextBox[] (spec.md §20.5). The database holds an array of objects under a storage backstop,
  -- not a product limit (per-box limits are set by the card editor, §20.2). The box shape is not
  -- checked here, and save_card_customization is reachable directly over RPC, so stored boxes
  -- are untrusted: every read parses them through the TextBox schema, and a parse failure is an
  -- explicit state (the generated layout with a notice), never a broken card.
  boxes jsonb not null check (jsonb_typeof(boxes) = 'array'),
  revision integer not null default 1 check (revision >= 1),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint card_customizations_one_per_design_shape unique (event_id, card_design_id, shape),
  constraint card_customizations_design_same_event
    foreign key (event_id, card_design_id)
    references public.card_designs (event_id, id) on delete cascade,
  constraint card_customizations_boxes_size check (octet_length(boxes::text) <= 262144)
);

-- Revision is maintained here, not by callers: 1 on create, +1 on every update, so it is
-- monotonic and cannot be forged. A customization never moves to another event, design or shape.
-- The one update that is not an edit: deleting a profile nulls updated_by (on delete set null),
-- which leaves the revision alone so open editors are not made stale by it.
create or replace function public.maintain_card_customization()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if new.event_id is distinct from old.event_id
     or new.card_design_id is distinct from old.card_design_id
     or new.shape is distinct from old.shape
     or new.created_at is distinct from old.created_at then
    raise exception 'a card customization cannot move to another event, design or shape'
      using errcode = 'insufficient_privilege';
  end if;
  if new.updated_by is null and old.updated_by is not null
     and new.boxes is not distinct from old.boxes
     and new.revision is not distinct from old.revision
     and new.updated_at is not distinct from old.updated_at then
    return new;
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger card_customizations_maintain
  before insert or update on public.card_customizations
  for each row execute function public.maintain_card_customization();

-- save_card_customization: the only end-user write path (spec.md §20.5, §25).
--
-- Optimistic concurrency on `revision`:
--   p_expected_revision = 0  → create at revision 1; refused as stale if one already exists.
--   p_expected_revision = n  → update only while the stored revision is still n.
-- Returns the new revision.
--
-- It checks that boxes is an array of objects, not that each object is a valid TextBox: a direct
-- RPC call can store any objects, so readers never trust the stored shape (see boxes above).
--
-- Errors (SQLSTATE — meaning):
--   PT409 — stale revision: someone else saved since p_expected_revision was read (or created
--           the customization first). The editor reloads the latest and shows a short notice.
--           Message 'card customization revision is stale'; DETAIL carries the current revision
--           ('current revision: N', or 'current revision: none'). PostgREST answers PTxyz codes
--           with HTTP status xyz, so this reaches the client as 409 Conflict with code PT409.
--   42501 — the caller is not the event's owner or a co-host.
--   22023 — invalid argument: missing argument, unknown shape, a shape no artwork of this
--           design fits, boxes not an array of objects, negative expected revision.
--   23514 — the design does not belong to the event.
--   23514 — boxes exceed the storage backstop (card_customizations_boxes_size).
create or replace function public.save_card_customization(
  p_event_id uuid,
  p_card_design_id uuid,
  p_shape text,
  p_boxes jsonb,
  p_expected_revision integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_shape public.card_shape;
  v_revision integer;
  v_current integer;
begin
  if p_event_id is null or v_uid is null or not public.is_event_member(p_event_id) then
    raise exception 'only the event''s owner or a co-host can edit its card'
      using errcode = 'insufficient_privilege';
  end if;

  if p_card_design_id is null or p_boxes is null or p_expected_revision is null then
    raise exception 'design, boxes and expected revision are required'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_shape is null
     or not (p_shape = any (enum_range(null::public.card_shape)::text[])) then
    raise exception 'unknown card shape: %', coalesce(p_shape, 'null')
      using errcode = 'invalid_parameter_value';
  end if;
  v_shape := p_shape::public.card_shape;
  if p_expected_revision < 0 then
    raise exception 'expected revision must be 0 (create) or the revision being replaced'
      using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_boxes) <> 'array'
     or exists (select 1 from jsonb_array_elements(p_boxes) b where jsonb_typeof(b) <> 'object') then
    raise exception 'boxes must be an array of text-box objects'
      using errcode = 'invalid_parameter_value';
  end if;

  if not exists (
    select 1 from public.card_designs d
    where d.id = p_card_design_id and d.event_id = p_event_id
  ) then
    raise exception 'the design does not belong to this event'
      using errcode = 'check_violation';
  end if;
  -- A shape is editable once this design has artwork that fits it; a shape without artwork is
  -- a generation first (spec.md §32 #28, card-system §7).
  if not exists (
    select 1 from public.card_art_assets a
    where a.card_design_id = p_card_design_id and v_shape = any (a.fits_shapes)
  ) then
    raise exception 'this design has no artwork for shape %', p_shape
      using errcode = 'invalid_parameter_value';
  end if;

  if p_expected_revision = 0 then
    insert into public.card_customizations (event_id, card_design_id, shape, boxes, updated_by)
    values (p_event_id, p_card_design_id, v_shape, p_boxes, v_uid)
    on conflict (event_id, card_design_id, shape) do nothing
    returning revision into v_revision;
  else
    update public.card_customizations c
    set boxes = p_boxes, updated_by = v_uid
    where c.event_id = p_event_id
      and c.card_design_id = p_card_design_id
      and c.shape = v_shape
      and c.revision = p_expected_revision
    returning c.revision into v_revision;
  end if;

  if v_revision is null then
    select c.revision into v_current
    from public.card_customizations c
    where c.event_id = p_event_id and c.card_design_id = p_card_design_id and c.shape = v_shape;
    raise exception 'card customization revision is stale'
      using errcode = 'PT409',
            detail = 'current revision: ' || coalesce(v_current::text, 'none'),
            hint = 'reload the latest customization and apply the edit again';
  end if;

  return v_revision;
end;
$$;

-- ===========================================================================
-- 8. card_fonts (spec.md §24 CardFont; technology-decisions.md §8.3)
-- ===========================================================================
-- Platform-wide font store: Google Fonts families copied to our own storage so guests never
-- fetch fonts from a third party (spec.md §20.4). Server-only; the licence travels with the
-- files, as OFL redistribution requires.
create table public.card_fonts (
  id uuid primary key default gen_random_uuid(),
  family text not null unique check (btrim(family) <> ''),
  category text not null
    check (category in ('serif', 'sans-serif', 'display', 'handwriting', 'monospace')),
  variants text[] not null check (cardinality(variants) >= 1),
  license_name text not null check (btrim(license_name) <> ''),
  license_text text not null check (btrim(license_text) <> ''),
  -- Variant → object key in the `card-fonts` bucket.
  storage_keys jsonb not null check (jsonb_typeof(storage_keys) = 'object'),
  metrics_version text not null,
  added_at timestamptz not null default now()
);

-- ===========================================================================
-- 9. Row Level Security and grants
-- ===========================================================================
alter table public.card_designs enable row level security;
alter table public.card_art_assets enable row level security;
alter table public.card_customizations enable row level security;
alter table public.card_fonts enable row level security;

-- Owner and co-hosts read the event's designs, artwork records and customizations. Guests see
-- the card through server rendering and server-signed URLs, never through these tables.
create policy card_designs_select_member on public.card_designs
  for select to authenticated using (public.is_event_member(event_id));
create policy card_art_assets_select_member on public.card_art_assets
  for select to authenticated using (public.is_event_member(event_id));
create policy card_customizations_select_member on public.card_customizations
  for select to authenticated using (public.is_event_member(event_id));

-- Generated data is written by server code only; customizations only through the function.
revoke insert, update, delete, truncate on table public.card_designs from authenticated;
revoke insert, update, delete, truncate on table public.card_art_assets from authenticated;
revoke insert, update, delete, truncate on table public.card_customizations from authenticated;
revoke all on table public.card_designs from anon;
revoke all on table public.card_art_assets from anon;
revoke all on table public.card_customizations from anon;
-- TRUNCATE skips row triggers, so the immutability above would not hold against it: no role
-- below the superuser may truncate generated data.
revoke truncate on table public.card_designs, public.card_art_assets from service_role;

-- Server-only: no policies for end-user roles, and no grants either.
revoke all on table public.card_fonts from anon, authenticated;

revoke execute on function
  public.save_card_customization(uuid, uuid, text, jsonb, integer) from public, anon;
grant execute on function
  public.save_card_customization(uuid, uuid, text, jsonb, integer) to authenticated;

-- ===========================================================================
-- 10. Storage buckets (card-system §5, §6.4; technology-decisions.md §8.3)
-- ===========================================================================
-- card-art: private. Server code writes with the service role and serves members and guests
-- through short-lived server-signed URLs; no anon/authenticated policies, so a raw object URL
-- never resolves.
-- card-fonts: open-licensed font files that guests' browsers and link previews load directly, so
-- the bucket is public-read (objects are served by URL; listing still needs a policy and there
-- is none). Writes are server-only: no insert/update/delete policies exist.
-- Guarded because the database test harness installs no Supabase storage schema.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      (
        'card-art',
        'card-art',
        false,
        20971520, -- 20 MB: a 1440 × 2016 PNG with headroom
        array['image/png', 'image/webp', 'image/jpeg']
      ),
      (
        'card-fonts',
        'card-fonts',
        true,
        20971520, -- 20 MB: large CJK families
        array['font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'text/plain']
      )
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- Refresh PostgREST's schema cache however this migration is applied (see
-- 20260913050000_human_test_1_responses.sql); a no-op without a listener.
notify pgrst, 'reload schema';
