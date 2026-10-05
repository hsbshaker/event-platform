-- Creation Mode slice 4: co-host invitations (spec.md §6.1, §6.2, §19.2, §25 "Manage co-host
-- access", §27 "Co-host access is explicit and invitation-based"; AGENTS.md "Co-host invitations").
--
-- Delivery (lead decision, for the owner to confirm): there is no email provider, so the owner
-- creates an invite link and passes it on themselves. The platform sends nothing. One link per
-- invitation; it works once, expires after 7 days and can be revoked.
--
-- The link carries 32 random bytes (base64url). The database stores only their keyed hash
-- (HMAC-SHA256 under APP_ENCRYPTION_KEY, computed by application code, as for pre-auth drafts and
-- rate-limit keys), so neither a database read nor a backup yields a working link.
--
-- Every write is server-side: the server actions (src/app/actions/cohosts.ts) authorize the
-- signed-in caller with src/lib/auth (`manage_cohosts` is owner-only) and call the functions below
-- with the service role. Each takes the event's lock and checks the caller again as the backstop.
-- The end-user INSERT on event_members that Phase 1 left for this flow is revoked, and so is the
-- end-user DELETE: removing a co-host goes through remove_cohost too, so one audited path changes
-- who can work on an event.

-- ===========================================================================
-- 1. cohost_invitations: server-only
-- ===========================================================================
create table public.cohost_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  -- HMAC-SHA256 of the link's token; never the token.
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at),
  -- accepted_by may be cleared by a deleted profile; it is never set without accepted_at.
  check (accepted_by is null or accepted_at is not null),
  -- Used or revoked, never both.
  check (accepted_at is null or revoked_at is null)
);

create index cohost_invitations_event_id_idx on public.cohost_invitations (event_id);

comment on table public.cohost_invitations is
  'Co-host invite links (spec.md §6.2, §27). Server-only: written and read through the service-role functions and server code after src/lib/auth authorized the owner. Stores only the HMAC of the link''s token.';

alter table public.cohost_invitations enable row level security;
-- No policies and no grants for end users: the owner's list is read by server code after
-- `manage_cohosts` is checked, and only its non-secret columns leave the server.
revoke all on table public.cohost_invitations from public, anon, authenticated;
grant select, insert, update, delete on table public.cohost_invitations to service_role;

-- ===========================================================================
-- 2. event_members: no end-user writes
-- ===========================================================================
drop policy if exists event_members_insert_owner on public.event_members;
drop policy if exists event_members_delete_owner on public.event_members;
revoke insert, update, delete on table public.event_members from anon, authenticated;

-- The owner trigger's comment said RLS let end users insert co-hosts; nothing does now. The
-- function body is unchanged: it still guards the trusted paths.

-- ===========================================================================
-- 3. profiles: the owner sees the people on their events
-- ===========================================================================
-- The owner's Co-hosts sheet names each co-host by display name or email. A user still sees and
-- edits their own profile; in addition, the owner of an event may read the profiles of that
-- event's members. Co-hosts gain nothing here.
create or replace function public.is_owner_of_shared_event(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_members mine
    join public.event_members theirs on theirs.event_id = mine.event_id
    where mine.user_id = auth.uid()
      and mine.role = 'owner'
      and theirs.user_id = p_profile_id
  );
$$;

revoke execute on function public.is_owner_of_shared_event(uuid) from public, anon;
grant execute on function public.is_owner_of_shared_event(uuid) to authenticated, service_role;

create policy profiles_select_event_owner on public.profiles
  for select to authenticated using (public.is_owner_of_shared_event(id));

-- ===========================================================================
-- 4. create_cohost_invitation (owner)
-- ===========================================================================
-- Records a new invitation for p_event_id under the event's lock, expiring 7 days from now.
-- Allowed before and after publish. The server action has authorized the signed-in owner and
-- rate-limited the event; the function checks the owner again.
--
-- Returns one row: outcome, the invitation's id, when it was made and when it expires.
--   created   — recorded;
--   not_found — no such event.
--
-- Errors: 22023 invalid argument · 42501 p_user_id is not the event's owner · 23505 a token hash
-- that is already recorded (never in practice: 32 random bytes).
create function public.create_cohost_invitation(
  p_event_id uuid,
  p_user_id uuid,
  p_token_hash bytea
)
returns table (
  outcome text,
  invitation_id uuid,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_id uuid;
  v_created timestamptz;
  v_expires timestamptz;
begin
  if p_event_id is null or p_user_id is null or p_token_hash is null
     or octet_length(p_token_hash) <> 32 then
    raise exception 'invalid create_cohost_invitation arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  select e.owner_id into v_owner from public.events e where e.id = p_event_id for no key update;
  if not found then
    return query select 'not_found'::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_owner <> p_user_id then
    raise exception 'only the event''s owner can invite co-hosts'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.cohost_invitations (event_id, token_hash, created_by, expires_at)
  values (p_event_id, p_token_hash, p_user_id, now() + interval '7 days')
  returning cohost_invitations.id, cohost_invitations.created_at, cohost_invitations.expires_at
  into v_id, v_created, v_expires;

  return query select 'created'::text, v_id, v_created, v_expires;
end;
$$;

-- ===========================================================================
-- 5. cohost_invitation_preview (anyone holding the link)
-- ===========================================================================
-- What the invite page may show for a token hash, read by server code for the person holding the
-- link (signed in or not). Changes nothing.
--
-- Returns one row:
--   valid   — usable (unexpired, unrevoked, unused) and p_user_id, if given, is not a member:
--             the event's effective title (the host's title, else the active design's; null when
--             the event has no card yet) and the inviter's display name (null when they have none).
--             The event id is not returned: the page shows nothing else about the event;
--   member  — p_user_id is already the owner or a co-host of the invitation's event, whatever
--             the invitation's state: the event id, its title and the member's role, so the page
--             can say so and link to the event. Only ever said to a member of that event;
--   invalid — anything else: unknown, expired, revoked or used. Nothing about any event.
create function public.cohost_invitation_preview(p_token_hash bytea, p_user_id uuid)
returns table (
  status text,
  event_id uuid,
  event_title text,
  inviter_name text,
  role public.event_member_role
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv public.cohost_invitations%rowtype;
  v_role public.event_member_role;
  v_title text;
  v_inviter text;
begin
  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    return query select 'invalid'::text, null::uuid, null::text, null::text,
      null::public.event_member_role;
    return;
  end if;

  select * into v_inv from public.cohost_invitations i where i.token_hash = p_token_hash;
  if not found then
    return query select 'invalid'::text, null::uuid, null::text, null::text,
      null::public.event_member_role;
    return;
  end if;

  select nullif(regexp_replace(e.title, '^\s+|\s+$', '', 'g'), '')
  into v_title
  from public.events e where e.id = v_inv.event_id;
  if v_title is null then
    select nullif(regexp_replace(d.wording ->> 'title', '^\s+|\s+$', '', 'g'), '')
    into v_title
    from public.events e
    join public.card_designs d on d.id = e.active_card_design_id and d.event_id = e.id
    where e.id = v_inv.event_id;
  end if;

  if p_user_id is not null then
    select m.role into v_role
    from public.event_members m
    where m.event_id = v_inv.event_id and m.user_id = p_user_id;
    if v_role is not null then
      return query select 'member'::text, v_inv.event_id, v_title, null::text, v_role;
      return;
    end if;
  end if;

  if v_inv.revoked_at is not null or v_inv.accepted_at is not null
     or v_inv.expires_at <= now() then
    return query select 'invalid'::text, null::uuid, null::text, null::text,
      null::public.event_member_role;
    return;
  end if;

  select nullif(regexp_replace(p.name, '^\s+|\s+$', '', 'g'), '')
  into v_inviter
  from public.profiles p where p.id = v_inv.created_by;

  return query select 'valid'::text, null::uuid, v_title, v_inviter,
    null::public.event_member_role;
end;
$$;

-- ===========================================================================
-- 6. accept_cohost_invitation (the signed-in person holding the link)
-- ===========================================================================
-- Makes p_user_id a co-host of the invitation's event and uses the invitation up, under the
-- event's lock and the invitation's row lock, so two accepts of one link cannot both succeed and
-- an accept cannot race a revoke or a removal.
--
-- Returns one row: outcome, the event id (null when invalid) and the caller's role on it.
--   joined         — p_user_id is now a co-host; the invitation is used by them;
--   already_member — p_user_id was already the owner or a co-host (including a retried accept of
--                    the invitation they used). Nothing changes: the invitation is not used up, so
--                    an owner opening their own link leaves it working for the person it is for,
--                    and the owner is never downgraded or duplicated;
--   invalid        — unknown, expired, revoked, or used by someone else. Nothing about any event.
--
-- Errors: 22023 invalid argument.
create function public.accept_cohost_invitation(p_token_hash bytea, p_user_id uuid)
returns table (outcome text, event_id uuid, role public.event_member_role)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
  v_inv public.cohost_invitations%rowtype;
  v_role public.event_member_role;
begin
  if p_token_hash is null or p_user_id is null or octet_length(p_token_hash) <> 32 then
    raise exception 'invalid accept_cohost_invitation arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  select i.event_id into v_event from public.cohost_invitations i where i.token_hash = p_token_hash;
  if not found then
    return query select 'invalid'::text, null::uuid, null::public.event_member_role;
    return;
  end if;

  -- The event first, then the invitation: the order every invitation function takes.
  perform 1 from public.events e where e.id = v_event for no key update;
  if not found then
    return query select 'invalid'::text, null::uuid, null::public.event_member_role;
    return;
  end if;
  select * into v_inv from public.cohost_invitations i where i.token_hash = p_token_hash for update;
  if not found then
    -- Deleted with its event between the two reads.
    return query select 'invalid'::text, null::uuid, null::public.event_member_role;
    return;
  end if;

  select m.role into v_role
  from public.event_members m
  where m.event_id = v_inv.event_id and m.user_id = p_user_id;
  if v_role is not null then
    return query select 'already_member'::text, v_inv.event_id, v_role;
    return;
  end if;

  if v_inv.revoked_at is not null or v_inv.accepted_at is not null
     or v_inv.expires_at <= now() then
    return query select 'invalid'::text, null::uuid, null::public.event_member_role;
    return;
  end if;

  insert into public.event_members (event_id, user_id, role)
  values (v_inv.event_id, p_user_id, 'cohost');
  update public.cohost_invitations i
  set accepted_by = p_user_id, accepted_at = now()
  where i.id = v_inv.id;

  return query select 'joined'::text, v_inv.event_id, 'cohost'::public.event_member_role;
end;
$$;

-- ===========================================================================
-- 7. revoke_cohost_invitation (owner)
-- ===========================================================================
-- Revokes a pending invitation of p_event_id: its link stops working at once.
--
-- Returns one outcome:
--   revoked     — it was pending and is now revoked;
--   not_pending — it was already used or revoked (nothing changes; an expired one is revoked);
--   not_found   — no such event, or no such invitation of this event.
--
-- Errors: 22023 invalid argument · 42501 p_user_id is not the event's owner.
create function public.revoke_cohost_invitation(
  p_event_id uuid,
  p_user_id uuid,
  p_invitation_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_inv public.cohost_invitations%rowtype;
begin
  if p_event_id is null or p_user_id is null or p_invitation_id is null then
    raise exception 'invalid revoke_cohost_invitation arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  select e.owner_id into v_owner from public.events e where e.id = p_event_id for no key update;
  if not found then
    return 'not_found';
  end if;
  if v_owner <> p_user_id then
    raise exception 'only the event''s owner can revoke a co-host invitation'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_inv
  from public.cohost_invitations i
  where i.id = p_invitation_id and i.event_id = p_event_id
  for update;
  if not found then
    return 'not_found';
  end if;
  if v_inv.accepted_at is not null or v_inv.revoked_at is not null then
    return 'not_pending';
  end if;

  update public.cohost_invitations i set revoked_at = now() where i.id = v_inv.id;
  return 'revoked';
end;
$$;

-- ===========================================================================
-- 8. remove_cohost (owner)
-- ===========================================================================
-- Removes p_cohost_id's co-host membership of p_event_id. Never the owner: only a `cohost` row is
-- ever deleted, and protect_owner_membership refuses the owner row on every path anyway.
--
-- Returns one outcome:
--   removed   — they were a co-host and are not any more;
--   not_found — no such event, or p_cohost_id is not a co-host of it (the owner included).
--
-- Errors: 22023 invalid argument · 42501 p_user_id is not the event's owner.
create function public.remove_cohost(p_event_id uuid, p_user_id uuid, p_cohost_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if p_event_id is null or p_user_id is null or p_cohost_id is null then
    raise exception 'invalid remove_cohost arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  select e.owner_id into v_owner from public.events e where e.id = p_event_id for no key update;
  if not found then
    return 'not_found';
  end if;
  if v_owner <> p_user_id then
    raise exception 'only the event''s owner can remove a co-host'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.event_members m
  where m.event_id = p_event_id and m.user_id = p_cohost_id and m.role = 'cohost';
  if not found then
    return 'not_found';
  end if;
  return 'removed';
end;
$$;

-- ===========================================================================
-- 9. pending_cohost_invitations (owner)
-- ===========================================================================
-- The event's invitations that still work (unused, unrevoked, unexpired), oldest first, for the
-- owner's Co-hosts sheet: their non-secret columns only, never the token hash.
--
-- Errors: 22023 invalid argument · 42501 p_user_id is not the event's owner (or no such event).
create function public.pending_cohost_invitations(p_event_id uuid, p_user_id uuid)
returns table (id uuid, created_at timestamptz, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_event_id is null or p_user_id is null then
    raise exception 'invalid pending_cohost_invitations arguments'
      using errcode = 'invalid_parameter_value';
  end if;
  if not exists (
    select 1 from public.events e where e.id = p_event_id and e.owner_id = p_user_id
  ) then
    raise exception 'only the event''s owner can list its co-host invitations'
      using errcode = 'insufficient_privilege';
  end if;
  return query
    select i.id, i.created_at, i.expires_at
    from public.cohost_invitations i
    where i.event_id = p_event_id
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now()
    order by i.created_at, i.id;
end;
$$;

-- ===========================================================================
-- 10. Grants: service role only
-- ===========================================================================
revoke execute on function public.create_cohost_invitation(uuid, uuid, bytea)
  from public, anon, authenticated;
revoke execute on function public.cohost_invitation_preview(bytea, uuid)
  from public, anon, authenticated;
revoke execute on function public.accept_cohost_invitation(bytea, uuid)
  from public, anon, authenticated;
revoke execute on function public.revoke_cohost_invitation(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.remove_cohost(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.pending_cohost_invitations(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.create_cohost_invitation(uuid, uuid, bytea) to service_role;
grant execute on function public.cohost_invitation_preview(bytea, uuid) to service_role;
grant execute on function public.accept_cohost_invitation(bytea, uuid) to service_role;
grant execute on function public.revoke_cohost_invitation(uuid, uuid, uuid) to service_role;
grant execute on function public.remove_cohost(uuid, uuid, uuid) to service_role;
grant execute on function public.pending_cohost_invitations(uuid, uuid) to service_role;
