-- Phase 2: prompt → auth/save → minimal missing-details flow (docs/development-plan.md).
--
-- Additive on the Phase 1 foundation. Scope: the content columns the Phase 2 details flow
-- owns, the generation-state marker set when a draft is claimed, server-only event creation,
-- and one atomic claim function so an OAuth callback can be retried without creating a second
-- event. No RSVP, registry, messaging or payment tables (those arrive with Phases 7-10).
--
-- Requirements: spec.md §7.2 (pre-auth draft and authentication), §7.3 (required details run
-- in parallel; provisional content), §11.4 (content profile), §23.1 (publish requirements —
-- this migration adds none), §27 (private inspiration). Guardrails: §32 #4 (no generation
-- before auth), #10 and #44 (no new publish requirements).

-- ---------------------------------------------------------------------------
-- Content columns owned by the Phase 2 details flow
-- ---------------------------------------------------------------------------
-- Hosts and the baby name are optional content, not publish requirements (§23.1 lists
-- neither). Hosts is an optional text leaf in the content profile (§11.4); the baby name
-- supplies the family name for the provisional title (§7.3).
alter table public.events
  add column hosts text,
  add column baby_name text,
  -- Set when the pre-auth draft is claimed: the point after which generation may run
  -- (§7.2 "strong-model generation does not begin until authentication succeeds").
  -- Server-managed; Phase 4 uses it to keep one batch in flight per event (§10).
  add column generation_requested_at timestamptz;

-- ---------------------------------------------------------------------------
-- Server-managed columns now include generation_requested_at
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
    -- End users no longer insert events at all (see the revoke below); this branch stays
    -- as defence in depth if the grant is ever restored.
    if new.status <> 'DRAFT'
       or new.published_at is not null
       or new.paid_at is not null
       or new.slug is not null
       or new.active_concept_id is not null
       or new.access_code_encrypted is not null
       or new.design_overrides is not null
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
     or new.active_concept_id is distinct from old.active_concept_id
     or new.access_code_encrypted is distinct from old.access_code_encrypted
     or new.slug is distinct from old.slug
     or new.prompt is distinct from old.prompt
     or new.generation_requested_at is distinct from old.generation_requested_at
     or new.design_overrides is distinct from old.design_overrides then
    raise exception 'column is managed by server code'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Events are created by server code when a pre-auth draft is claimed (§7.2 step 5)
-- ---------------------------------------------------------------------------
drop policy if exists events_insert_owner on public.events;
revoke insert on table public.events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Atomic claim of a pre-auth draft (§7.2)
-- ---------------------------------------------------------------------------
-- One statement decides the outcome under a row lock, so concurrent or retried auth
-- callbacks with the same token converge on one event:
--   claimed                  — the draft became this user's event (created here)
--   already_claimed_by_user  — a previous call already did it; same event returned
--   claimed_by_other         — someone else claimed it; caller gets nothing
--   expired                  — the draft outlived its TTL and was not claimed
--   not_found                — no such token
-- The caller (the auth callback) restores prompt and inspiration from the event that comes
-- back; inspiration assets are re-parented from the draft to the event here so the one-owner
-- constraint holds at every instant and the purge job can never take them.
create or replace function public.claim_pre_auth_draft(p_token_hash bytea, p_user_id uuid)
returns table (event_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.pre_auth_event_drafts%rowtype;
  v_event_id uuid;
begin
  if p_token_hash is null or p_user_id is null then
    return query select null::uuid, 'not_found'::text;
    return;
  end if;

  select * into v_draft
  from public.pre_auth_event_drafts
  where draft_token_hash = p_token_hash
  for update;

  if not found then
    return query select null::uuid, 'not_found'::text;
    return;
  end if;

  if v_draft.claimed_at is not null then
    if v_draft.claimed_by = p_user_id and v_draft.claimed_event_id is not null then
      return query select v_draft.claimed_event_id, 'already_claimed_by_user'::text;
    else
      return query select null::uuid, 'claimed_by_other'::text;
    end if;
    return;
  end if;

  if v_draft.expires_at < now() then
    return query select null::uuid, 'expired'::text;
    return;
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return query select null::uuid, 'not_found'::text;
    return;
  end if;

  insert into public.events (owner_id, prompt, generation_requested_at)
  values (p_user_id, v_draft.prompt, now())
  returning id into v_event_id;

  update public.inspiration_assets
  set event_id = v_event_id, pre_auth_draft_id = null
  where pre_auth_draft_id = v_draft.id;

  update public.pre_auth_event_drafts
  set claimed_by = p_user_id, claimed_event_id = v_event_id, claimed_at = now()
  where id = v_draft.id;

  return query select v_event_id, 'claimed'::text;
end;
$$;

revoke execute on function public.claim_pre_auth_draft(bytea, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private storage bucket for pre-auth inspiration (§7.2, §27)
-- ---------------------------------------------------------------------------
-- Uploads and reads go through server code with the service role; the bucket is private and
-- gets no anon/authenticated policies, so a raw object URL is never publicly resolvable.
-- Guarded because the database test harness installs no Supabase storage schema.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'inspiration',
      'inspiration',
      false,
      10485760,
      array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
    )
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
