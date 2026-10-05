-- Creation Mode slice 3a: privacy and the private event code (spec.md §8.1, §14.1, §14.2, §23.1,
-- §25, §27; AGENTS.md: "The privacy action must write the encrypted access code before, or in the
-- same service-role transaction as, switching a published event to private").
--
-- One path for every visibility change, before and after publish: the privacy action
-- (src/app/actions/privacy.ts) authorizes the signed-in owner or co-host, encrypts a code in
-- application code (AES-256-GCM under a key derived from APP_ENCRYPTION_KEY; the database never
-- sees a plaintext code or the key), and calls the functions below with the service role. They
-- take the event's lock, check membership again as the backstop, and write the visibility and the
-- encrypted code in the same transaction, so `events_private_requires_code_when_published` can
-- never be met by a published private event without its code, and two concurrent requests can
-- never leave two different codes behind.
--
-- events.visibility joins the server-managed columns: end users can no longer write it directly,
-- so no request can make an event private without a code being stored with it.

-- ===========================================================================
-- 1. visibility is server-managed
-- ===========================================================================
-- The server-managed column guard (last replaced in 20261008000000_phase5c_prompt_facts.sql), now
-- with visibility: end users can neither set it on insert nor change it.
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
       or new.visibility is not null
       or new.access_code_encrypted is not null
       or new.generation_requested_at is not null
       or new.prompt_facts is not null
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
     or new.visibility is distinct from old.visibility
     or new.access_code_encrypted is distinct from old.access_code_encrypted
     or new.slug is distinct from old.slug
     or new.prompt is distinct from old.prompt
     or new.generation_requested_at is distinct from old.generation_requested_at
     or new.prompt_facts is distinct from old.prompt_facts then
    raise exception 'column is managed by server code'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

comment on column public.events.visibility is
  'Public or private (spec.md §14.1). Server-managed: changed only through set_event_privacy, which stores the encrypted event code in the same transaction when the event goes private.';

comment on column public.events.access_code_encrypted is
  'The private event code, encrypted at rest by application code (spec.md §14.2): 0x01 | IV (12) | GCM tag (16) | ciphertext, AES-256-GCM under a key derived from APP_ENCRYPTION_KEY, bound to the event id. The only representation of the code; never a hash beside it. Kept when the event goes public, so switching back reuses it. Server-managed: written only by set_event_privacy and rotate_event_code.';

-- ===========================================================================
-- 2. set_event_privacy: the one path for a visibility change
-- ===========================================================================
-- Sets the event's visibility, before or after publish (spec.md §8.1 "privacy settings/event code"
-- may change after publish). Server-only: the server action authorizes the signed-in owner or
-- co-host first (`manage_privacy`); the function checks the member again as the backstop. Under
-- the event's lock, so a privacy change cannot race another, a rotation or a publish.
--
-- p_code_encrypted is a freshly encrypted code the action offers for the case where none is
-- stored. Going private keeps a stored code (switching back to private reuses the code guests may
-- already have) and stores the offered one only when there is none, in the same statement that
-- makes the event private. Going public keeps the stored code. Nothing changes, and the row
-- version is not bumped, when the event already has the visibility asked for and a code where it
-- needs one.
--
-- Returns one row: outcome and the code stored after the call (null when none is).
--   saved     — the event has the visibility asked for (and, when private, its code);
--   not_found — no such event.
--
-- Errors: 22023 invalid argument (including going private with no code stored and none offered,
-- or an offered value too short to be an encrypted code) · 42501 p_user_id is not the event's owner
-- or a co-host.
create function public.set_event_privacy(
  p_event_id uuid,
  p_user_id uuid,
  p_visibility public.event_visibility,
  p_code_encrypted bytea
)
returns table (outcome text, code_encrypted bytea)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visibility public.event_visibility;
  v_code bytea;
begin
  if p_event_id is null or p_user_id is null or p_visibility is null then
    raise exception 'invalid set_event_privacy arguments'
      using errcode = 'invalid_parameter_value';
  end if;
  -- Version byte, IV, tag and at least one byte of ciphertext.
  if p_code_encrypted is not null and octet_length(p_code_encrypted) < 30 then
    raise exception 'invalid encrypted event code'
      using errcode = 'invalid_parameter_value';
  end if;

  select e.visibility, e.access_code_encrypted into v_visibility, v_code
  from public.events e where e.id = p_event_id
  for no key update;
  if not found then
    return query select 'not_found'::text, null::bytea;
    return;
  end if;

  if not exists (
    select 1 from public.event_members m where m.event_id = p_event_id and m.user_id = p_user_id
  ) then
    raise exception 'only the event''s owner or a co-host can change its privacy'
      using errcode = 'insufficient_privilege';
  end if;

  if p_visibility = 'private' then
    if v_code is null then
      if p_code_encrypted is null then
        raise exception 'a private event needs its event code'
          using errcode = 'invalid_parameter_value';
      end if;
      v_code := p_code_encrypted;
      update public.events e
      set visibility = 'private', access_code_encrypted = v_code
      where e.id = p_event_id;
    elsif v_visibility is distinct from 'private' then
      update public.events e set visibility = 'private' where e.id = p_event_id;
    end if;
  elsif v_visibility is distinct from p_visibility then
    update public.events e set visibility = p_visibility where e.id = p_event_id;
  end if;

  return query select 'saved'::text, v_code;
end;
$$;

revoke execute on function public.set_event_privacy(uuid, uuid, public.event_visibility, bytea)
  from public, anon, authenticated;
grant execute on function public.set_event_privacy(uuid, uuid, public.event_visibility, bytea)
  to service_role;

-- ===========================================================================
-- 3. rotate_event_code: a new code for a private event
-- ===========================================================================
-- Replaces a private event's code with p_code_encrypted, before or after publish (§8.1). The old
-- code stops working at once. Server-only, authorized and rate-limited by the server action;
-- membership checked again here, under the event's lock.
--
-- Returns one row: outcome and the code stored after the call.
--   rotated     — p_code_encrypted is now the event's code;
--   not_private — the event is not private: nothing changes (a public event's kept code is only
--                 ever replaced while it is private, where the host can see it);
--   not_found   — no such event.
--
-- Errors: 22023 invalid argument · 42501 p_user_id is not the event's owner or a co-host.
create function public.rotate_event_code(
  p_event_id uuid,
  p_user_id uuid,
  p_code_encrypted bytea
)
returns table (outcome text, code_encrypted bytea)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visibility public.event_visibility;
  v_code bytea;
begin
  if p_event_id is null or p_user_id is null or p_code_encrypted is null
     or octet_length(p_code_encrypted) < 30 then
    raise exception 'invalid rotate_event_code arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  select e.visibility, e.access_code_encrypted into v_visibility, v_code
  from public.events e where e.id = p_event_id
  for no key update;
  if not found then
    return query select 'not_found'::text, null::bytea;
    return;
  end if;

  if not exists (
    select 1 from public.event_members m where m.event_id = p_event_id and m.user_id = p_user_id
  ) then
    raise exception 'only the event''s owner or a co-host can change its event code'
      using errcode = 'insufficient_privilege';
  end if;

  if v_visibility is distinct from 'private' then
    return query select 'not_private'::text, v_code;
    return;
  end if;

  update public.events e set access_code_encrypted = p_code_encrypted where e.id = p_event_id;
  return query select 'rotated'::text, p_code_encrypted;
end;
$$;

revoke execute on function public.rotate_event_code(uuid, uuid, bytea)
  from public, anon, authenticated;
grant execute on function public.rotate_event_code(uuid, uuid, bytea) to service_role;
