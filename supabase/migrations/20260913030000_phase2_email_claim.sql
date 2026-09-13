-- Phase 2: carry draft identity through an email sign-in link (spec.md §7.2, §31
-- "Prompt and successful inspiration uploads restore exactly after OAuth/email auth").
--
-- The draft lives in an httpOnly cookie on one browser. An email link opened in a mail-app
-- webview, another browser profile or another device therefore arrives with no cookie and no
-- local mirror, and the person is signed in with their prompt and uploads left behind. Two
-- senior reviews flagged this as the criterion above not actually being met for email auth.
--
-- The association is made server-side, not carried in the link: when someone asks for a
-- sign-in link we record the address on their draft, and the callback may claim a draft whose
-- recorded address matches the address the session proves control of. Nothing secret travels
-- in a URL, so nothing leaks through a referrer, a shared link or a mail scanner. Proving
-- control of the address is exactly the authority required to receive what was composed while
-- asking for a link to it.

alter table public.pre_auth_event_drafts
  add column claim_email text;

comment on column public.pre_auth_event_drafts.claim_email is
  'Lowercased address a sign-in link was requested for, so the callback can restore this draft when the link is opened in another browser. Never used without a session that proves control of the address.';

-- Only unclaimed drafts are ever looked up this way.
create index pre_auth_event_drafts_claim_email_idx
  on public.pre_auth_event_drafts (claim_email, created_at desc)
  where claimed_at is null;

-- ---------------------------------------------------------------------------
-- Shared claim body
-- ---------------------------------------------------------------------------
-- Both entry points below resolve a draft id and delegate here. The row lock is taken inside
-- this function, before any state is read, so two callbacks racing on the same draft — by
-- cookie, by address, or one of each — still converge on a single event.
create or replace function public.claim_draft_locked(p_draft_id uuid, p_user_id uuid)
returns table (event_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.pre_auth_event_drafts%rowtype;
  v_event_id uuid;
begin
  if p_draft_id is null or p_user_id is null then
    return query select null::uuid, 'not_found'::text;
    return;
  end if;

  select * into v_draft
  from public.pre_auth_event_drafts
  where id = p_draft_id
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

revoke execute on function public.claim_draft_locked(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_draft_locked(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Entry point 1: this browser's cookie (unchanged behaviour)
-- ---------------------------------------------------------------------------
create or replace function public.claim_pre_auth_draft(p_token_hash bytea, p_user_id uuid)
returns table (event_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft_id uuid;
begin
  if p_token_hash is null or p_user_id is null then
    return query select null::uuid, 'not_found'::text;
    return;
  end if;

  select id into v_draft_id
  from public.pre_auth_event_drafts
  where draft_token_hash = p_token_hash;

  if v_draft_id is null then
    return query select null::uuid, 'not_found'::text;
    return;
  end if;

  return query select * from public.claim_draft_locked(v_draft_id, p_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Entry point 2: the address the session proves control of
-- ---------------------------------------------------------------------------
-- Deliberately narrow: only an unclaimed, unexpired draft, and only the most recent one for
-- that address, so a stale abandoned draft can never displace what the person just wrote.
create or replace function public.claim_pre_auth_draft_by_email(p_email text, p_user_id uuid)
returns table (event_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft_id uuid;
begin
  if p_email is null or length(trim(p_email)) = 0 or p_user_id is null then
    return query select null::uuid, 'not_found'::text;
    return;
  end if;

  select id into v_draft_id
  from public.pre_auth_event_drafts
  where claim_email = lower(trim(p_email))
    and claimed_at is null
    and expires_at >= now()
  order by created_at desc
  limit 1;

  if v_draft_id is null then
    return query select null::uuid, 'not_found'::text;
    return;
  end if;

  return query select * from public.claim_draft_locked(v_draft_id, p_user_id);
end;
$$;

revoke execute on function public.claim_pre_auth_draft_by_email(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_pre_auth_draft_by_email(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Recording the address
-- ---------------------------------------------------------------------------
-- Called when a sign-in link is requested, from the browser that holds the draft. Only an
-- unclaimed draft can be bound, and binding never reveals whether one existed.
create or replace function public.bind_draft_claim_email(p_token_hash bytea, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token_hash is null or p_email is null or length(trim(p_email)) = 0 then
    return;
  end if;

  update public.pre_auth_event_drafts
  set claim_email = lower(trim(p_email))
  where draft_token_hash = p_token_hash
    and claimed_at is null;
end;
$$;

revoke execute on function public.bind_draft_claim_email(bytea, text) from public, anon, authenticated;
grant execute on function public.bind_draft_claim_email(bytea, text) to service_role;
