-- Phase 1: core data, auth and security foundation (docs/development-plan.md).
-- Scope: account linkage, events, ownership and collaborators, pre-auth draft state,
-- generation and concept persistence with immutable revisions, RLS foundations,
-- stable identifiers, abuse throttling primitives. No RSVP, registry, messaging or
-- payment tables (they arrive with Phases 7-10).
--
-- Requirements: spec.md §6 (roles), §7.2 (pre-auth draft), §9.4-9.6 (persistence,
-- telemetry, metering), §10 (limits), §23 (lifecycle), §24 (domain model), §25
-- (permissions), §27 (safety). Guardrails: spec.md §32 #4, #18, #20, #41, #43.

-- ---------------------------------------------------------------------------
-- Extensions and helpers
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when the request runs with the anon or authenticated role (PostgREST / RLS
-- path). Service-role and direct superuser connections return false and are treated
-- as trusted server code.
create or replace function public.is_end_user_request()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), current_user) in ('anon', 'authenticated');
$$;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.event_status as enum (
  'DRAFT', 'DESIGN_SELECTED', 'READY_TO_PUBLISH', 'PUBLISHED', 'PASSED', 'ARCHIVED'
);
create type public.event_visibility as enum ('public', 'private');
create type public.event_member_role as enum ('owner', 'cohost');
create type public.model_operation as enum (
  'event_identity', 'design_intent', 'composition', 'structured_extraction'
);

-- ---------------------------------------------------------------------------
-- profiles: product-side row per Supabase Auth user (spec.md §24 User)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- events (spec.md §24 Event, §23 lifecycle)
-- Required details are nullable until captured (spec.md §7.3): readiness is
-- computed from §23.1, never from column defaults.
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  type text not null default 'baby_shower' check (type in ('baby_shower')),
  prompt text not null check (char_length(prompt) between 1 and 4000),

  title text,
  description text,
  event_date date,
  start_time time,
  end_time time,
  timezone text,
  venue_name text,
  address text,

  visibility public.event_visibility,
  access_code_encrypted bytea,

  rsvp_deadline timestamptz,
  rsvp_deadline_edited boolean not null default false,

  status public.event_status not null default 'DRAFT',
  slug text unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$'),

  active_concept_id uuid,
  design_overrides jsonb,

  message_sends_used integer not null default 0 check (message_sends_used >= 0),
  published_at timestamptz,
  paid_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_private_requires_code_when_published
    check (status <> 'PUBLISHED' or visibility <> 'private' or access_code_encrypted is not null)
);

create index events_owner_id_idx on public.events (owner_id);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- Stored timezone must be a valid IANA name (spec.md §23.1, §32 #40).
create or replace function public.validate_event_timezone()
returns trigger
language plpgsql
as $$
begin
  if new.timezone is not null
     and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'invalid IANA timezone: %', new.timezone
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger events_validate_timezone
  before insert or update of timezone on public.events
  for each row execute function public.validate_event_timezone();

-- Columns only server code may change (ownership, lifecycle, payment, quotas).
-- Owners and co-hosts edit content through RLS; these transitions are computed
-- server-side (spec.md §23, §25, §28).
create or replace function public.protect_event_server_columns()
returns trigger
language plpgsql
as $$
begin
  if public.is_end_user_request() then
    if new.owner_id is distinct from old.owner_id
       or new.status is distinct from old.status
       or new.published_at is distinct from old.published_at
       or new.paid_at is distinct from old.paid_at
       or new.message_sends_used is distinct from old.message_sends_used
       or new.active_concept_id is distinct from old.active_concept_id
       or new.access_code_encrypted is distinct from old.access_code_encrypted
       or new.slug is distinct from old.slug
       or new.prompt is distinct from old.prompt then
      raise exception 'column is managed by server code'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create trigger events_protect_server_columns
  before update on public.events
  for each row execute function public.protect_event_server_columns();

-- ---------------------------------------------------------------------------
-- event_members: owner and co-hosts (spec.md §6, §25)
-- ---------------------------------------------------------------------------
create table public.event_members (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.event_member_role not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_members_user_id_idx on public.event_members (user_id);
create unique index event_members_one_owner_idx on public.event_members (event_id) where role = 'owner';

-- The owner row is created with the event and mirrors events.owner_id.
create or replace function public.add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_members (event_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger events_add_owner_membership
  after insert on public.events
  for each row execute function public.add_owner_membership();

-- Ownership transfer is not in MVP (spec.md §25): the owner row is fixed.
create or replace function public.protect_owner_membership()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' and exists (select 1 from public.events e where e.id = old.event_id) then
      raise exception 'the owner membership cannot be removed'
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (old.role = 'owner' or new.role = 'owner') then
    raise exception 'owner membership cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  -- The only valid owner row mirrors events.owner_id; RLS lets end users insert
  -- co-hosts only, so this guards the trusted paths as well.
  if tg_op = 'INSERT' and new.role = 'owner'
     and not exists (
       select 1 from public.events e where e.id = new.event_id and e.owner_id = new.user_id
     ) then
    raise exception 'owner membership must match events.owner_id'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger event_members_protect_owner
  before insert or update or delete on public.event_members
  for each row execute function public.protect_owner_membership();

-- Membership helpers used by RLS. SECURITY DEFINER so policies on events and
-- event_members can consult membership without recursive policy evaluation.
create or replace function public.event_role(p_event_id uuid)
returns public.event_member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.event_members m
  where m.event_id = p_event_id and m.user_id = auth.uid();
$$;

create or replace function public.is_event_member(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.event_role(p_event_id) is not null;
$$;

create or replace function public.is_event_owner(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.event_role(p_event_id) = 'owner';
$$;

-- ---------------------------------------------------------------------------
-- pre_auth_event_drafts (spec.md §7.2, §24 PreAuthEventDraft)
-- Server-managed: looked up by token hash only; never readable by end users.
-- ---------------------------------------------------------------------------
create table public.pre_auth_event_drafts (
  id uuid primary key default gen_random_uuid(),
  draft_token_hash bytea not null unique,
  prompt text not null check (char_length(prompt) between 1 and 4000),
  composer_state jsonb,
  claimed_by uuid references public.profiles (id) on delete set null,
  claimed_event_id uuid references public.events (id) on delete set null,
  claimed_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  constraint drafts_claim_consistent
    check ((claimed_at is null) = (claimed_by is null))
);

create index pre_auth_event_drafts_expires_at_idx on public.pre_auth_event_drafts (expires_at)
  where claimed_at is null;

-- ---------------------------------------------------------------------------
-- inspiration_assets (spec.md §7.2, §24 InspirationAsset, §27)
-- Private AI inputs. Belong to a pre-auth draft until claimed, then to an event.
-- ---------------------------------------------------------------------------
create table public.inspiration_assets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete cascade,
  pre_auth_draft_id uuid references public.pre_auth_event_drafts (id) on delete set null,
  storage_key text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint inspiration_assets_has_owner
    check (event_id is not null or pre_auth_draft_id is not null)
);

create index inspiration_assets_event_id_idx on public.inspiration_assets (event_id);
create index inspiration_assets_draft_id_idx on public.inspiration_assets (pre_auth_draft_id);

-- ---------------------------------------------------------------------------
-- event_identities (spec.md §7.5, §24 EventIdentity)
-- One creative brief per event; the JSON is the canonical event-identity schema.
-- ---------------------------------------------------------------------------
create table public.event_identities (
  event_id uuid primary key references public.events (id) on delete cascade,
  identity jsonb not null,
  prompt_version text not null,
  schema_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger event_identities_set_updated_at
  before update on public.event_identities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- design_concepts (spec.md §24 DesignConcept, §9.4, §32 #18 #20)
-- design_intent, composition_raw, composition and the version set are immutable.
-- Only active_resolved_spec_id and selected_at may change after insert.
-- ---------------------------------------------------------------------------
create table public.design_concepts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  round integer not null check (round >= 1),
  concept_index integer not null check (concept_index between 0 and 2),

  name text not null,
  description text not null,

  design_intent jsonb not null,
  composition_raw jsonb not null,
  composition jsonb not null,
  composition_hash text not null,
  capabilities jsonb not null,

  directive jsonb,
  token_allotment jsonb,
  fallback text check (fallback in ('library')),

  design_intent_prompt_version text not null,
  design_intent_schema_version text not null,
  composition_prompt_version text not null,
  composition_schema_version text not null,
  primitive_set_version text not null,
  compiler_version text not null,

  active_resolved_spec_id uuid,
  selected_at timestamptz,
  created_at timestamptz not null default now(),

  unique (event_id, round, concept_index)
);

alter table public.events
  add constraint events_active_concept_fk
  foreign key (active_concept_id) references public.design_concepts (id)
  on delete set null deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- resolved_design_specs: immutable revisions per concept (spec.md §4.10, §7.9)
-- A revision is persisted only after rendered-geometry verification is clean
-- (spec.md §32 #24; CLAUDE.md "do not persist a spec that has not passed").
-- ---------------------------------------------------------------------------
create table public.resolved_design_specs (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.design_concepts (id) on delete cascade,
  revision integer not null check (revision >= 1),
  spec jsonb not null,
  content_version integer not null check (content_version >= 1),
  supersedes_spec_id uuid references public.resolved_design_specs (id) on delete restrict,
  verified_clean boolean not null check (verified_clean),
  compiler_version text not null,
  primitive_set_version text not null,
  created_at timestamptz not null default now(),
  unique (concept_id, revision)
);

create index resolved_design_specs_concept_id_idx on public.resolved_design_specs (concept_id);

alter table public.design_concepts
  add constraint design_concepts_active_spec_fk
  foreign key (active_resolved_spec_id) references public.resolved_design_specs (id)
  on delete restrict deferrable initially deferred;

create or replace function public.reject_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'rows in % are immutable', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger resolved_design_specs_immutable
  before update on public.resolved_design_specs
  for each row execute function public.reject_update();

-- supersedes_spec_id must point at an earlier revision of the same concept.
create or replace function public.validate_resolved_spec_lineage()
returns trigger
language plpgsql
as $$
declare
  v_prev record;
begin
  if new.supersedes_spec_id is not null then
    select concept_id, revision into v_prev
    from public.resolved_design_specs where id = new.supersedes_spec_id;
    if v_prev.concept_id is distinct from new.concept_id or v_prev.revision >= new.revision then
      raise exception 'supersedes_spec_id must reference an earlier revision of the same concept'
        using errcode = 'check_violation';
    end if;
  elsif new.revision <> 1 then
    raise exception 'revisions after the first must reference the revision they supersede'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger resolved_design_specs_validate_lineage
  before insert on public.resolved_design_specs
  for each row execute function public.validate_resolved_spec_lineage();

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
     or new.composition_raw is distinct from old.composition_raw
     or new.composition is distinct from old.composition
     or new.composition_hash is distinct from old.composition_hash
     or new.capabilities is distinct from old.capabilities
     or new.directive is distinct from old.directive
     or new.token_allotment is distinct from old.token_allotment
     or new.fallback is distinct from old.fallback
     or new.design_intent_prompt_version is distinct from old.design_intent_prompt_version
     or new.design_intent_schema_version is distinct from old.design_intent_schema_version
     or new.composition_prompt_version is distinct from old.composition_prompt_version
     or new.composition_schema_version is distinct from old.composition_schema_version
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

create trigger design_concepts_protect
  before update on public.design_concepts
  for each row execute function public.protect_design_concept();

-- events.active_concept_id must belong to the event.
create or replace function public.validate_active_concept()
returns trigger
language plpgsql
as $$
begin
  if new.active_concept_id is not null
     and not exists (
       select 1 from public.design_concepts c
       where c.id = new.active_concept_id and c.event_id = new.id
     ) then
    raise exception 'active_concept_id must belong to this event'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger events_validate_active_concept
  before update of active_concept_id on public.events
  for each row execute function public.validate_active_concept();

-- ---------------------------------------------------------------------------
-- generation_runs: model usage and compilation telemetry (spec.md §9.5, §9.6, §29)
-- Server-only. Never exposed to end users (spec.md §32 #41).
-- ---------------------------------------------------------------------------
create table public.generation_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,

  provider text not null,
  provider_request_id text,
  operation public.model_operation not null,
  round integer,
  concept_index integer,
  model text not null,

  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  reasoning_tokens integer,
  cost_estimate_usd numeric(10, 6),
  latency_ms integer not null,
  success boolean not null,
  error_code text,

  prompt_version text not null,
  schema_version text not null,
  primitive_set_version text,
  compiler_version text,

  diversity_assignment jsonb,
  schema_valid_first_call boolean,
  reprompts jsonb,
  compiler_repairs jsonb,
  verified jsonb,
  signature text,
  nearest_sibling numeric(4, 3),
  fallback text,

  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create index generation_runs_event_id_idx on public.generation_runs (event_id, created_at desc);
create index generation_runs_user_id_idx on public.generation_runs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- rate_limits: fixed-window counters for signup throttling and later OTP,
-- access-code and generation limits (spec.md §10, §27). Server-only.
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  bucket text not null,
  key_hash bytea not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, key_hash, window_start)
);

create index rate_limits_window_start_idx on public.rate_limits (window_start);

-- Atomically consume one unit in the current window. Returns true when allowed.
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_key_hash bytea,
  p_window_seconds integer,
  p_max integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_window_seconds <= 0 or p_max <= 0 then
    raise exception 'window and max must be positive';
  end if;
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  insert into public.rate_limits as r (bucket, key_hash, window_start, count)
  values (p_bucket, p_key_hash, v_window_start, 1)
  on conflict (bucket, key_hash, window_start)
  do update set count = r.count + 1
  returning r.count into v_count;
  return v_count <= p_max;
end;
$$;

-- Housekeeping: drop expired drafts, orphaned draft assets and stale counters.
create or replace function public.purge_expired_pre_auth_state()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.pre_auth_event_drafts where claimed_at is null and expires_at < now();
  delete from public.inspiration_assets where event_id is null and pre_auth_draft_id is null;
  delete from public.rate_limits where window_start < now() - interval '2 days';
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.pre_auth_event_drafts enable row level security;
alter table public.inspiration_assets enable row level security;
alter table public.event_identities enable row level security;
alter table public.design_concepts enable row level security;
alter table public.resolved_design_specs enable row level security;
alter table public.generation_runs enable row level security;
alter table public.rate_limits enable row level security;

-- profiles: a user sees and edits only their own row.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- events: members read; the authenticated creator inserts as owner; members update
-- content (server-managed columns are protected by trigger); only the owner deletes.
-- owner_id is checked directly as well as membership so INSERT ... RETURNING works
-- before the AFTER trigger has created the owner membership row.
create policy events_select_member on public.events
  for select to authenticated using (owner_id = auth.uid() or public.is_event_member(id));
create policy events_insert_owner on public.events
  for insert to authenticated with check (owner_id = auth.uid());
create policy events_update_member on public.events
  for update to authenticated
  using (public.is_event_member(id))
  with check (public.is_event_member(id));
create policy events_delete_owner on public.events
  for delete to authenticated using (public.is_event_owner(id));

-- event_members: members see the roster; only the owner adds or removes co-hosts.
create policy event_members_select_member on public.event_members
  for select to authenticated using (public.is_event_member(event_id));
create policy event_members_insert_owner on public.event_members
  for insert to authenticated
  with check (public.is_event_owner(event_id) and role = 'cohost');
create policy event_members_delete_owner on public.event_members
  for delete to authenticated
  using (public.is_event_owner(event_id) and role = 'cohost');

-- inspiration_assets: members may list an event's private inspiration; writes are
-- server-side (upload handling arrives in Phase 2).
create policy inspiration_assets_select_member on public.inspiration_assets
  for select to authenticated using (event_id is not null and public.is_event_member(event_id));

-- Generated artifacts: members read; only server code writes.
create policy event_identities_select_member on public.event_identities
  for select to authenticated using (public.is_event_member(event_id));
create policy design_concepts_select_member on public.design_concepts
  for select to authenticated using (public.is_event_member(event_id));
create policy resolved_design_specs_select_member on public.resolved_design_specs
  for select to authenticated using (
    exists (
      select 1 from public.design_concepts c
      where c.id = concept_id and public.is_event_member(c.event_id)
    )
  );

-- Server-only tables: no policies for end-user roles, and no grants either.
revoke all on table public.pre_auth_event_drafts from anon, authenticated;
revoke all on table public.generation_runs from anon, authenticated;
revoke all on table public.rate_limits from anon, authenticated;

-- Server-only functions.
revoke execute on function public.consume_rate_limit(text, bytea, integer, integer) from public, anon, authenticated;
revoke execute on function public.purge_expired_pre_auth_state() from public, anon, authenticated;
-- Trigger functions (handle_new_auth_user, add_owner_membership) keep default execute
-- so supabase_auth_admin and end-user inserts can fire them; PostgREST cannot call
-- trigger-returning functions directly.

-- Column-level: end users never write generated artifacts or telemetry.
revoke insert, update, delete on table public.event_identities from anon, authenticated;
revoke insert, update, delete on table public.design_concepts from anon, authenticated;
revoke insert, update, delete on table public.resolved_design_specs from anon, authenticated;
revoke insert, update, delete on table public.inspiration_assets from anon, authenticated;
revoke insert, delete on table public.profiles from anon, authenticated;
revoke all on table public.profiles from anon;
revoke all on table public.events from anon;
revoke all on table public.event_members from anon;
revoke all on table public.inspiration_assets from anon;
revoke all on table public.event_identities from anon;
revoke all on table public.design_concepts from anon;
revoke all on table public.resolved_design_specs from anon;
