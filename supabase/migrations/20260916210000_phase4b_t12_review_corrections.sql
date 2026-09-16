-- ---------------------------------------------------------------------------
-- Phase 4B, T12 — two corrections the pre-freeze independent review found.
--
-- Forward-only, for the reason `20260916190000` records: a migration id an environment has
-- already recorded is never replayed there, so a correction ships as its own id rather than as an
-- edit to the file that introduced the defect.
--
-- docs/phase-4b-plan.md §A.3, §A.6; spec.md §7.6b, §32 #41; Phase 4B exit gate items 10 and 13.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The authority rule stops answering "not provisional" about JSON it cannot read.
--
-- `identity_questions` checked that `clarification.questions` is an array and then handed the
-- elements to `identity_is_provisional`, which asks `q ->> 'kind' = 'boundary'`. For any element
-- that is not an object with that exact key and value — `null`, a bare string, a nested array,
-- `{"Kind":"boundary"}`, `{"type":"boundary"}`, `{"kind":"Boundary"}`, `{"kind":null}`, or an
-- object with no `kind` at all — the comparison is false or null, `exists` is false, and the
-- revision is classed **authoritative**. Verified against a live database before this change: all
-- ten shapes returned `is_provisional = false`.
--
-- That is the fail-open direction in the one rule whose entire purpose is to hold when the writer
-- is buggy. Today both honest writers hand this function zod-validated output, and the table is
-- revoked from `anon` and `authenticated`, so it needs a direct service-role insert, a future
-- writer, or a restore under a laxer path to reach — which is exactly the caller §A.3 says the
-- database must not trust. The migration that introduced it said so itself: "nothing here ever
-- answers 'not provisional' about JSON it could not read."
--
-- So an unreadable element is refused, exactly as an unreadable array already was. Narrow on
-- purpose: this adds a third refusal to a reader, and changes nothing about which schema versions
-- are supported — "extend, never narrow" still governs that list, which is untouched.
--
-- `identity_is_provisional` is deliberately NOT replaced. Once every element is known to be an
-- object carrying one of the two kinds, `q ->> 'kind' = 'boundary'` is sound, and replacing one
-- function is a smaller change than replacing two.
--
-- Stored `is_provisional` values are not recomputed by this replacement, which is the behaviour we
-- want: an existing row keeps whatever it was stamped with, while
-- `validate_authoritative_identity` re-derives through this function on every pointer move — so a
-- malformed revision that predates this migration can never become authoritative either.
-- ---------------------------------------------------------------------------
create or replace function public.identity_questions(result jsonb, schema_version text)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  question jsonb;
begin
  -- Extend this list, never narrow it. `pg_dump` does not dump generated-column data and a
  -- restore recomputes it, so removing a version here would fail every restore and branch clone
  -- that contains a row stamped with it. That fails loudly rather than open, which is the right
  -- direction, but it makes "extend, never narrow" a rule rather than a preference.
  -- Kept equal to `SUPPORTED_IDENTITY_SCHEMA_VERSIONS` in
  -- src/lib/ai/event-identity/lifecycle.ts; tests/db/phase4b.test.ts asserts the pairing, and
  -- drift fails closed either way because the generated column would refuse the insert.
  if schema_version is distinct from 'event_identity_schema_v5' then
    raise exception 'identity_questions: unsupported schema version %', schema_version
      using errcode = 'feature_not_supported';
  end if;
  -- A missing or non-array questions path is malformed, never "no questions asked".
  if jsonb_typeof(result -> 'clarification' -> 'questions') is distinct from 'array' then
    raise exception 'identity_questions: clarification.questions is not an array'
      using errcode = 'check_violation';
  end if;
  -- And neither is an element the authority rule cannot read. Both checks, in this order, so the
  -- message names what was actually wrong.
  for question in
    select value from jsonb_array_elements(result -> 'clarification' -> 'questions')
  loop
    if jsonb_typeof(question) is distinct from 'object' then
      raise exception 'identity_questions: a clarification question is not an object'
        using errcode = 'check_violation';
    end if;
    if coalesce(question ->> 'kind', '') not in ('creative', 'boundary') then
      raise exception 'identity_questions: a clarification question has no readable kind'
        using errcode = 'check_violation';
    end if;
  end loop;
  return result -> 'clarification' -> 'questions';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. A member's own read of a revision stops carrying the provider internals.
--
-- `grant select on table public.event_identity_revisions to authenticated` is every column, and
-- PostgREST is reachable from a browser with the member's own session. So the columns the T10
-- projection deliberately strips — `spec.md §32 #41`, and `src/lib/generation/identity-view.ts`
-- exists so "a component cannot forget" — were readable through the other door: `provider`,
-- `model`, `provider_config` (which carries `reasoningEffort`, `serviceTier` and
-- `costProfileVersion`), `provider_request_id`, and the internal `generation_run_id`.
--
-- Column-level grant instead. The member keeps exactly what the clarification surface reads
-- through their session today — `submitClarificationAnswer` selects `id, revision, result` — plus
-- the identifying and derived columns a member-facing read can legitimately want. Everything
-- describing *how the call was made* is server-only, like the claims table beside it.
--
-- `revoke … on table` first: a column grant does not shrink a table-wide one, and leaving the
-- table grant in place would make the column list decorative.
-- ---------------------------------------------------------------------------
revoke select on table public.event_identity_revisions from authenticated;
grant select (
  id,
  event_id,
  revision,
  result,
  prompt_version,
  schema_version,
  input_assembly_version,
  clarification_answer_ids,
  is_provisional,
  created_at
) on table public.event_identity_revisions to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The answer-binding trigger stops needing columns the answerer may not read.
--
-- `validate_clarification_answer` ran `select * into rev` against a `%rowtype`, which demands
-- SELECT on every column of `event_identity_revisions`. It is not `security definer` — deliberately,
-- so the binding check sees exactly what the answerer sees — so after section 2 above every honest
-- co-host answer would have been refused with `42501`.
--
-- It only ever reads four of those columns. Reading four is both the fix and the narrower thing to
-- have been doing; nothing else about the function changes.
-- ---------------------------------------------------------------------------
create or replace function public.validate_clarification_answer()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  -- A record of the four columns this trigger actually validates against, not the whole row.
  -- The trigger runs with the *caller's* privileges, and since T12 a member's SELECT on
  -- `event_identity_revisions` is column-level: `select *` would demand `provider_config` and
  -- the other provider columns they can no longer read, and refuse every honest answer with
  -- `42501`. Reading only what it checks is also the narrower thing to have been doing.
  rev record;
  questions jsonb;
  question jsonb;
  defer_labels text[];
begin
  select r.event_id, r.result, r.revision, r.schema_version into rev
    from public.event_identity_revisions r
    where r.id = new.identity_revision_id;
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

  -- (6) A selected option must be one the question actually offered. Without this a member can
  -- record an answer the host could not have given — bound to a real question, with a byte-exact
  -- copy of it — and T9's assembly then sends it to the model as current host input with stated
  -- precedence over the original description. That is manufactured host authority, which is the
  -- failure the whole binding exists to prevent.
  if new.selected_option_label is not null
     and not exists (
       select 1 from jsonb_array_elements(coalesce(question -> 'options', '[]'::jsonb)) as o
       where o ->> 'label' = new.selected_option_label
     ) then
    raise exception 'selected_option_label is not one of the options offered'
      using errcode = 'check_violation';
  end if;

  -- (7) Defer semantics follow the route. Route B offers no defer option at all
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

  -- (7b) A boundary answer is a supported choice, and only that.
  --
  -- `spec.md §7.6b #1a`: Route B asks the host "to state or confirm the boundary they can
  -- legitimately affirm as settled". The options are the statements that count; free prose is not
  -- one of them, and a brief that has to interpret an essay is back to taking the position the
  -- question exists to avoid. The check constraint below is satisfied by either field, so without
  -- this a boundary question could be answered entirely in free text.
  --
  -- Here rather than only in the application, because the application is not the only writer:
  -- `authenticated` holds INSERT under `clarification_answers_insert_member`, so a member with a
  -- session can reach this table directly. A rule enforced only above it is advisory.
  if new.kind = 'boundary' then
    if new.selected_option_label is null then
      raise exception 'a boundary answer must select one of the offered options'
        using errcode = 'check_violation';
    end if;
    if new.free_text is not null then
      raise exception 'a boundary answer carries no free text'
        using errcode = 'check_violation';
    end if;
  end if;

  -- (7c) Free text is bounded, for the same reason `events.prompt` is.
  --
  -- It is rendered verbatim into the model input (`event_identity_input_v2`), so an unbounded
  -- field is an unbounded request — and a request that fails or is truncated is still charged at
  -- the per-attempt maximum. The limit matches `events.prompt`'s because it is the same kind of
  -- thing: the host's own words, going to the same model. `MAX_CLARIFICATION_FREE_TEXT` is pinned
  -- to this number by a test.
  if new.free_text is not null and pg_catalog.char_length(new.free_text) > 4000 then
    raise exception 'clarification free text may be at most 4000 characters'
      using errcode = 'check_violation';
  end if;

  -- (8) The round is the revision's own number.
  if new.round is distinct from rev.revision then
    raise exception 'clarification answer round % does not match revision %',
      new.round, rev.revision
      using errcode = 'check_violation';
  end if;

  -- (9) The answer is attributable to someone who can actually speak for this event.
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

  -- (10) …and for an end-user request, it is the person making it. Without this a co-host could
  -- record an answer as the owner's, which defeats "attributable to the host" outright. Service
  -- role is exempt from (10) and never from (9).
  if public.is_end_user_request() and new.answered_by is distinct from auth.uid() then
    raise exception 'answered_by must be the authenticated user'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;
