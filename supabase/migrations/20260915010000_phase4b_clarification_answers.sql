-- ---------------------------------------------------------------------------
-- Phase 4B, T3 — clarification answers, bound to the question they answer.
--
-- spec.md §7.6b; docs/development-plan.md 4B obligation (c); docs/phase-4b-plan.md §B.
--
-- A clarification answer is first-class current host input. The cheap implementation — append it
-- to `events.prompt` — passes every test anyone would think to write and destroys the property
-- that makes it host input rather than a rewrite of what the host originally said. So:
--
--   * the answer is its own row, never text merged into the prompt;
--   * `events.prompt` becomes immutable at the database boundary, for every caller;
--   * the answer proves *which* question it answers, by locator and by database check, not by
--     quoting text that could later be edited to say something else.
--
-- The locator is (identity_revision_id, question_index): the ordinal in that revision's persisted
-- clarification.questions array. It is stable because the revision is immutable — the previous
-- migration refuses every UPDATE to it — so the array and its order cannot change under the
-- answer.
--
-- This is deliberately not a conversation model. No thread, no roles, no arbitrary turns. A set of
-- (question asked, answer given) rows, bounded by the rounds that actually occurred.
-- ---------------------------------------------------------------------------

create table public.clarification_answers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  identity_revision_id uuid not null
    references public.event_identity_revisions (id) on delete cascade,
  -- The ordinal in that revision's clarification.questions array.
  question_index integer not null check (question_index >= 0),
  -- The revision number that asked. Denormalised, and held to the same standard as the copied
  -- text below rather than a lower one.
  round integer not null check (round >= 1),

  -- Copied for readability, and checked against the question so the copy can never drift into
  -- describing something the host was not asked.
  kind text not null check (kind in ('creative', 'boundary')),
  question_text text not null,
  options jsonb not null,

  -- What the host said.
  selected_option_label text,
  free_text text,
  is_defer boolean not null default false,

  answered_by uuid not null references public.profiles (id) on delete restrict,
  answered_at timestamptz not null default now(),

  -- One answer per question. A second is a correction, and corrections are not in scope: the
  -- host answers again by answering the next round's question.
  unique (identity_revision_id, question_index),

  -- An answer that says nothing is not an answer.
  constraint clarification_answers_has_content
    check (selected_option_label is not null or nullif(btrim(coalesce(free_text, '')), '') is not null)
);

create index clarification_answers_event_idx
  on public.clarification_answers (event_id, round, question_index);

-- ---------------------------------------------------------------------------
-- The binding check. Everything here is verified against the referenced revision's own JSON,
-- through `identity_questions`, so this trigger shares the fail-closed refusal policy rather than
-- open-coding a second reader of the envelope's shape.
-- ---------------------------------------------------------------------------
create or replace function public.validate_clarification_answer()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  rev public.event_identity_revisions%rowtype;
  questions jsonb;
  question jsonb;
  defer_labels text[];
begin
  select * into rev from public.event_identity_revisions
    where id = new.identity_revision_id;
  if not found then
    raise exception 'clarification answer references an identity revision that does not exist'
      using errcode = 'foreign_key_violation';
  end if;

  -- (1) The revision must belong to the event being answered for. Otherwise an answer could be
  -- filed against another event's question, and the provenance claim would be false.
  if rev.event_id <> new.event_id then
    raise exception 'clarification answer must reference a revision of the same event'
      using errcode = 'check_violation';
  end if;

  -- (2) A question must exist at that index. `identity_questions` refuses an unreadable envelope
  -- rather than treating it as empty.
  questions := public.identity_questions(rev.result, rev.schema_version);
  if new.question_index >= jsonb_array_length(questions) then
    raise exception 'clarification answer index % has no question on that revision',
      new.question_index
      using errcode = 'check_violation';
  end if;
  question := questions -> new.question_index;

  -- (3) The route must match what was actually asked.
  if new.kind is distinct from (question ->> 'kind') then
    raise exception 'clarification answer kind % does not match the question (%)',
      new.kind, question ->> 'kind'
      using errcode = 'check_violation';
  end if;

  -- (4) The readable copy must be the question, not a paraphrase of it.
  if new.question_text is distinct from (question ->> 'question') then
    raise exception 'clarification answer question_text does not match the question asked'
      using errcode = 'check_violation';
  end if;

  -- (5) …and so must the options.
  if new.options is distinct from (question -> 'options') then
    raise exception 'clarification answer options do not match the options offered'
      using errcode = 'check_violation';
  end if;

  -- (6) Defer semantics follow the route. Route B offers no defer option at all
  -- (spec.md §7.6b #4), so a boundary answer can never be one; a creative defer must name the
  -- question's single isDefer option rather than being asserted by the caller.
  select array_agg(o ->> 'label') into defer_labels
    from jsonb_array_elements(coalesce(question -> 'options', '[]'::jsonb)) as o
    where (o ->> 'isDefer')::boolean;

  if new.is_defer then
    if new.kind = 'boundary' then
      raise exception 'a boundary question offers no defer option (spec.md §7.6b #4)'
        using errcode = 'check_violation';
    end if;
    if new.selected_option_label is null
       or defer_labels is null
       or not (new.selected_option_label = any (defer_labels)) then
      raise exception 'a deferred answer must select the question''s own defer option'
        using errcode = 'check_violation';
    end if;
  elsif new.selected_option_label is not null
        and defer_labels is not null
        and new.selected_option_label = any (defer_labels) then
    raise exception 'selecting the defer option must be recorded as is_defer'
      using errcode = 'check_violation';
  end if;

  -- (7) The round is the revision's own number.
  if new.round is distinct from rev.revision then
    raise exception 'clarification answer round % does not match revision %',
      new.round, rev.revision
      using errcode = 'check_violation';
  end if;

  -- (8) The answer is attributable to someone who can actually speak for this event.
  if not exists (
    select 1 from public.events e
    where e.id = new.event_id
      and (e.owner_id = new.answered_by
           or exists (select 1 from public.event_members m
                      where m.event_id = e.id and m.user_id = new.answered_by))
  ) then
    raise exception 'answered_by must be a member of this event'
      using errcode = 'check_violation';
  end if;

  -- (9) …and for an end-user request, it is the person making it. Without this a co-host could
  -- record an answer as the owner's, which defeats "attributable to the host" outright. Service
  -- role is exempt from (9) and never from (8).
  if public.is_end_user_request() and new.answered_by is distinct from auth.uid() then
    raise exception 'answered_by must be the authenticated user'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger clarification_answers_validate
  before insert on public.clarification_answers
  for each row execute function public.validate_clarification_answer();

-- Append-only in the database, not by application habit.
create or replace function public.protect_clarification_answer()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'clarification answers are append-only'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger clarification_answers_protect
  before update or delete on public.clarification_answers
  for each row execute function public.protect_clarification_answer();

-- ---------------------------------------------------------------------------
-- The answers a revision was actually built from must exist and belong to the same event.
--
-- This could not be expressed in the previous migration — an array carries no foreign key, and
-- the answers table did not exist yet. It is added here, where both are true.
-- ---------------------------------------------------------------------------
create or replace function public.validate_identity_revision_answers()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  referenced integer;
begin
  if array_length(new.clarification_answer_ids, 1) is null then
    return new;
  end if;
  if exists (
    select 1 from unnest(new.clarification_answer_ids) as a(id)
    group by a.id having count(*) > 1
  ) then
    raise exception 'clarification_answer_ids contains a duplicate'
      using errcode = 'check_violation';
  end if;
  select count(*) into referenced
    from public.clarification_answers ca
    where ca.id = any (new.clarification_answer_ids)
      and ca.event_id = new.event_id;
  if referenced <> array_length(new.clarification_answer_ids, 1) then
    raise exception 'clarification_answer_ids must all exist and belong to this event'
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger event_identity_revisions_validate_answers
  before insert on public.event_identity_revisions
  for each row execute function public.validate_identity_revision_answers();

-- ---------------------------------------------------------------------------
-- events.prompt is immutable after insert, for every caller.
--
-- `protect_event_server_columns` already blocks end-user updates to `prompt`, but every write in
-- the generation pipeline is service role, so the guard that matters was the one missing. The
-- requirement is that the host's original description survives every clarification round
-- unchanged; this makes that a database refusal rather than a source-scan.
--
-- Nothing legitimately updates it: `claim_pre_auth_draft` sets it once at insert, and the only
-- prompt that is ever edited belongs to `pre_auth_event_drafts`, which is a different table.
-- ---------------------------------------------------------------------------
create or replace function public.protect_event_prompt()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.prompt is distinct from old.prompt then
    raise exception 'events.prompt is immutable: a clarification answer is its own row, never a rewrite of what the host said'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger events_protect_prompt
  before update of prompt on public.events
  for each row execute function public.protect_event_prompt();

-- ---------------------------------------------------------------------------
-- RLS. A member reads their event's answers and may record their own. Nobody updates or deletes:
-- the protect trigger refuses it whatever the policy says, and there is no policy for it either.
-- ---------------------------------------------------------------------------
alter table public.clarification_answers enable row level security;

create policy clarification_answers_select_member on public.clarification_answers
  for select to authenticated using (public.is_event_member(event_id));

create policy clarification_answers_insert_member on public.clarification_answers
  for insert to authenticated
  with check (public.is_event_member(event_id) and answered_by = auth.uid());

revoke update, delete on table public.clarification_answers from anon, authenticated;
grant select, insert on table public.clarification_answers to authenticated;
