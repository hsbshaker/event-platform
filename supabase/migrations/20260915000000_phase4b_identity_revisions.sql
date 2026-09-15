-- ---------------------------------------------------------------------------
-- Phase 4B, T2 — Event Identity revisions and the authority invariant.
--
-- spec.md §7.6b, §7.7; docs/model-contracts.md §4; docs/phase-4b-plan.md §A.
--
-- `event_identities` holds one mutable row per event. That cannot express a boundary round,
-- which produces at least two results for one event, and it cannot support the attribution
-- invariant: a finished artifact must name the exact identity it was built from. This migration
-- adds append-only revisions and the rule that decides which of them may be consumed.
--
-- The rule is load-bearing, so it lives here rather than only in application code:
--
--   a boundary question is present  <=>  the identity is provisional
--                                   <=>  it must never become the event's authoritative identity
--
-- `spec.md §7.6b` derives that from JSON shape ("the presence of a boundary-kind question is the
-- machine-readable signal"), which means a shape this schema cannot read is a shape it has no
-- right to judge. Every function below therefore **fails closed**: an unrecognised schema version
-- or a malformed questions path raises, and nothing here ever answers "not provisional" about
-- JSON it could not read.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The one reader of the envelope's question array.
--
-- Every other SQL site goes through this, so there is exactly one refusal policy and one place
-- that knows the envelope's shape. `identity_is_provisional` below, and the clarification-answer
-- binding trigger in the next migration, both read through it.
--
-- IMMUTABLE is honest here: the result depends only on the arguments. The RAISEs do not make it
-- volatile — an immutable function may fail — and immutability is what lets it back a generated
-- column.
-- ---------------------------------------------------------------------------
create or replace function public.identity_questions(result jsonb, schema_version text)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  -- Extend this list, never narrow it. `pg_dump` does not dump generated-column data and a
  -- restore recomputes it, so removing a version here would fail every restore and branch clone
  -- that contains a row stamped with it. That fails loudly rather than open, which is the right
  -- direction, but it makes "extend, never narrow" a rule rather than a preference.
  if schema_version is distinct from 'event_identity_schema_v5' then
    raise exception 'identity_questions: unsupported schema version %', schema_version
      using errcode = 'feature_not_supported';
  end if;
  -- A missing or non-array questions path is malformed, never "no questions asked".
  if jsonb_typeof(result -> 'clarification' -> 'questions') is distinct from 'array' then
    raise exception 'identity_questions: clarification.questions is not an array'
      using errcode = 'check_violation';
  end if;
  return result -> 'clarification' -> 'questions';
end;
$$;

-- ---------------------------------------------------------------------------
-- The authority rule. The TypeScript twin is `isProvisional` in
-- src/lib/ai/event-identity/lifecycle.ts, and tests/db/phase4b.test.ts holds the two equal over
-- every response in the four v5 evidence journals.
-- ---------------------------------------------------------------------------
create or replace function public.identity_is_provisional(result jsonb, schema_version text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from jsonb_array_elements(public.identity_questions(result, schema_version)) as q
    where q ->> 'kind' = 'boundary'
  );
$$;

-- ---------------------------------------------------------------------------
-- event_identity_revisions: one row per generateEventIdentity result. Append-only.
--
-- Legacy `event_identities.identity` rows are NOT migrated in. That column holds the creative
-- *brief*, not the result envelope — it has no `clarification` key — so carrying it across would
-- either be refused by `identity_questions` or, worse under a laxer reader, classed authoritative
-- by default. Nothing is backfilled; the old table is left as it is.
-- ---------------------------------------------------------------------------
create table public.event_identity_revisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  revision integer not null check (revision >= 1),

  -- The full result envelope: identity, suppliedFacts, clarification.
  result jsonb not null,

  prompt_version text not null,
  schema_version text not null,
  -- How the request was assembled from prompt, inspiration and clarification answers
  -- (docs/phase-4b-plan.md §B.3). NOT NULL with an explicit sentinel rather than nullable, so
  -- "produced before this was recorded" and "the writer forgot" are never the same value.
  input_assembly_version text not null,

  provider text not null,
  model text not null,
  provider_config jsonb,
  provider_request_id text,
  generation_run_id uuid references public.generation_runs (id) on delete set null,

  -- The ordered clarification answers actually assembled into this call. Not "the answers that
  -- exist for this event now", which is a different and larger set once a later round is
  -- answered. Element integrity is enforced from the next migration, where the answers table
  -- exists; an array cannot carry a foreign key.
  clarification_answer_ids uuid[] not null default '{}',

  -- Derived, never supplied: a caller cannot name this column in an INSERT at all (SQLSTATE
  -- 428C9). It is a convenience for reads and indexes. The authority decision does not depend on
  -- it — `validate_authoritative_identity` re-derives from `result` — so a stale or corrupted
  -- value cannot make a boundary-bearing identity consumable.
  is_provisional boolean
    generated always as (public.identity_is_provisional(result, schema_version)) stored,

  created_at timestamptz not null default now(),

  unique (event_id, revision)
);

create index event_identity_revisions_event_idx
  on public.event_identity_revisions (event_id, revision desc);

-- Revisions are numbered 1, 2, 3 … per event, with no gaps and no reuse.
create or replace function public.validate_identity_revision()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  expected integer;
begin
  select coalesce(max(revision), 0) + 1 into expected
    from public.event_identity_revisions where event_id = new.event_id;
  if new.revision <> expected then
    raise exception 'identity revision % is not the next revision for this event (expected %)',
      new.revision, expected
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger event_identity_revisions_validate
  before insert on public.event_identity_revisions
  for each row execute function public.validate_identity_revision();

-- Generated identity data is immutable. There is no column worth changing after the fact: the
-- envelope, its versions, its provenance and the answers that produced it are what the artifact
-- is. A correction is a new revision.
create or replace function public.protect_identity_revision()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'identity revisions are immutable'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger event_identity_revisions_protect
  before update or delete on public.event_identity_revisions
  for each row execute function public.protect_identity_revision();

-- ---------------------------------------------------------------------------
-- The event's authoritative identity.
--
-- Deferrable, like `events_active_concept_fk`, so the revision and the pointer can be written in
-- one transaction.
-- ---------------------------------------------------------------------------
alter table public.events
  add column authoritative_identity_revision_id uuid;

alter table public.events
  add constraint events_authoritative_identity_fk
  foreign key (authoritative_identity_revision_id)
  references public.event_identity_revisions (id)
  on delete set null deferrable initially deferred;

-- The invariant, enforced where it cannot be talked past.
create or replace function public.validate_authoritative_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  rev public.event_identity_revisions%rowtype;
begin
  if new.authoritative_identity_revision_id is null then
    return new;
  end if;

  select * into rev from public.event_identity_revisions
    where id = new.authoritative_identity_revision_id;
  if not found then
    raise exception 'authoritative identity revision does not exist'
      using errcode = 'foreign_key_violation';
  end if;

  -- A pointer into another event's revision would hand this event someone else's brief.
  if rev.event_id <> new.id then
    raise exception 'authoritative identity revision must belong to this event'
      using errcode = 'check_violation';
  end if;

  -- Re-derived from the persisted JSON, deliberately NOT read from rev.is_provisional. The
  -- convenience column is a cache of this answer; the answer is this call. If the column were
  -- ever wrong, dropped, or recomputed under a changed definition, this check would still refuse.
  if public.identity_is_provisional(rev.result, rev.schema_version) then
    raise exception 'a provisional identity cannot become authoritative (spec.md §7.6b)'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger events_validate_authoritative_identity
  before insert or update of authoritative_identity_revision_id on public.events
  for each row execute function public.validate_authoritative_identity();

-- ---------------------------------------------------------------------------
-- The pointer is server-managed.
--
-- `events_update_member` grants UPDATE on public.events to any member, and
-- `protect_event_server_columns` protects only the columns it enumerates — so a new column is
-- writable by a co-host until it is named here. Without this, a co-host could repoint the event
-- at an earlier authoritative revision and silently change the creative interpretation every
-- later stage reads.
--
-- Replaced wholesale rather than patched, because that is how the phase-2 migration extended it.
-- ---------------------------------------------------------------------------
create or replace function public.protect_event_server_columns()
returns trigger
language plpgsql
as $$
begin
  if not public.is_end_user_request() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- End users no longer insert events at all (phase 2 revoked the grant); this branch stays
    -- as defence in depth if the grant is ever restored.
    if new.status <> 'DRAFT'
       or new.published_at is not null
       or new.paid_at is not null
       or new.slug is not null
       or new.active_concept_id is not null
       or new.access_code_encrypted is not null
       or new.design_overrides is not null
       or new.generation_requested_at is not null
       or new.authoritative_identity_revision_id is not null
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
     or new.active_concept_id is distinct from old.active_concept_id
     or new.access_code_encrypted is distinct from old.access_code_encrypted
     or new.slug is distinct from old.slug
     or new.prompt is distinct from old.prompt
     or new.generation_requested_at is distinct from old.generation_requested_at
     or new.authoritative_identity_revision_id is distinct from old.authoritative_identity_revision_id
     or new.design_overrides is distinct from old.design_overrides then
    raise exception 'column is managed by server code'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS. Members read their event's revisions — the clarification surface needs the question.
-- Nobody writes as an end user: revisions are written by server code alongside the provider call.
-- ---------------------------------------------------------------------------
alter table public.event_identity_revisions enable row level security;

create policy event_identity_revisions_select_member on public.event_identity_revisions
  for select to authenticated using (public.is_event_member(event_id));

revoke insert, update, delete on table public.event_identity_revisions from anon, authenticated;
grant select on table public.event_identity_revisions to authenticated;
