-- Phase 7a: the guest list — parties, their named guests and their personal invitation links
-- (spec.md §12.1–§12.3, §12.5, §24 GuestParty / GuestPerson / PartyInviteLink, §25 "Manage
-- guests / import CSV" and "Copy/rotate a party's personal link": owner and co-host; §8.1 "guest
-- list, invitations and RSVP operations" stay allowed after publish; §32 #34–37).
--
-- Every write is server-side. The server actions (src/app/actions/guests.ts) authorize the
-- signed-in owner or co-host with src/lib/auth (`manage_guests`) and call the functions below with
-- the service role. Each takes the event's lock, checks membership again as the backstop, and
-- enforces the per-event limits inside the lock. End users read the parties and their guests
-- through RLS (collaborators of the event only) and write nothing directly. Nobody but the service
-- role reads personal links.
--
-- A party's personal link token is never stored. Application code derives it from the link row's
-- id (HMAC-SHA256 under an HKDF subkey of APP_ENCRYPTION_KEY, src/lib/guests/personal-link.ts) and
-- the row keeps only the token's SHA-256 (hex), so a guest route can look a presented token up and
-- nobody holding the database can make a working link. Every party gets its link row in the same
-- transaction that creates it; rotating revokes the active row and inserts another.
--
-- Limits (build decision, generous abuse caps): at most 1,000 parties and 2,000 named guests per
-- event (src/lib/guests/limits.ts holds the same numbers).

-- ===========================================================================
-- 1. Enumerations
-- ===========================================================================
create type public.guest_contact_source as enum ('host_entered', 'csv_import', 'guest_confirmed');
create type public.guest_invitation_status as enum (
  'not_sent', 'sent', 'delivery_failed', 'opted_out'
);
-- A party's RSVP and a guest's attendance share their states.
create type public.guest_response_status as enum ('awaiting', 'attending', 'declined');
create type public.guest_person_type as enum ('adult', 'child', 'plus_one');

-- ===========================================================================
-- 2. guest_parties
-- ===========================================================================
create table public.guest_parties (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  -- "Name on the invitation": the host's, the CSV household's, or derived from the guests.
  display_name text not null check (
    char_length(display_name) between 1 and 120
    and display_name !~ '^\s' and display_name !~ '\s$'
  ),
  -- The main contact: the party's first guest, an adult.
  primary_contact_name text not null check (
    char_length(primary_contact_name) between 1 and 80
    and primary_contact_name !~ '^\s' and primary_contact_name !~ '\s$'
  ),
  -- E.164, US and Canada only (spec.md §13.3: international SMS is out of scope). Shared numbers
  -- across parties are allowed: families share phones (spec.md §12.2).
  phone text check (phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  email text check (
    email is null
    or (char_length(email) between 3 and 254 and email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$')
  ),
  -- The explicit collaborator override (spec.md §12.2); never set together with a phone.
  no_phone_available boolean not null default false,
  contact_consent_source public.guest_contact_source not null,
  max_adults integer not null check (max_adults >= 1),
  max_children integer not null default 0 check (max_children >= 0),
  plus_one_allowed boolean not null default false,
  invitation_status public.guest_invitation_status not null default 'not_sent',
  invitations_sent integer not null default 0 check (invitations_sent >= 0),
  rsvp_status public.guest_response_status not null default 'awaiting',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_parties_phone_or_override check (not (phone is not null and no_phone_available)),
  -- The target of the composite keys below: a guest or a link can only sit under a party of
  -- its own event.
  constraint guest_parties_id_event_key unique (id, event_id)
);

create index guest_parties_event_id_idx on public.guest_parties (event_id, created_at);

create trigger guest_parties_set_updated_at
  before update on public.guest_parties
  for each row execute function public.set_updated_at();

comment on table public.guest_parties is
  'Invited parties (spec.md §12.2, §24 GuestParty). Collaborators of the event read them through RLS; every write goes through the service-role guest functions after src/lib/auth authorized manage_guests. Contact state (Ready / Needs phone / No phone available) is derived from phone and no_phone_available, never stored.';

-- ===========================================================================
-- 3. guest_people
-- ===========================================================================
create table public.guest_people (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null,
  event_id uuid not null,
  name text not null check (
    char_length(name) between 1 and 80 and name !~ '^\s' and name !~ '\s$'
  ),
  type public.guest_person_type not null,
  attendance_status public.guest_response_status not null default 'awaiting',
  meal_choice text,
  dietary_restrictions text,
  notes text,
  position integer not null check (position >= 0),
  constraint guest_people_party_fkey foreign key (party_id, event_id)
    references public.guest_parties (id, event_id) on delete cascade
);

create index guest_people_party_idx on public.guest_people (party_id, position);
create index guest_people_event_id_idx on public.guest_people (event_id);

comment on table public.guest_people is
  'The named guests of a party (spec.md §12.2, §24 GuestPerson); the party''s first adult is its main contact. Read like guest_parties; written only by the guest functions. The composite key keeps every guest under a party of its own event.';

-- ===========================================================================
-- 4. party_invite_links: server-only
-- ===========================================================================
create table public.party_invite_links (
  id uuid primary key,
  event_id uuid not null,
  party_id uuid not null,
  -- SHA-256 (hex) of the token derived from this row's id; never the token.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint party_invite_links_party_fkey foreign key (party_id, event_id)
    references public.guest_parties (id, event_id) on delete cascade
);

-- One working link per party.
create unique index party_invite_links_one_active_idx
  on public.party_invite_links (party_id) where revoked_at is null;
create index party_invite_links_event_id_idx on public.party_invite_links (event_id);

comment on table public.party_invite_links is
  'Personal invitation links (spec.md §12.5, §24 PartyInviteLink; §32 #37). Server-only: no end-user grants or policies. The token is derived from the row id by application code and never stored; token_hash is its SHA-256. One active (unrevoked) row per party.';

-- ===========================================================================
-- 5. RLS and grants
-- ===========================================================================
alter table public.guest_parties enable row level security;
alter table public.guest_people enable row level security;
alter table public.party_invite_links enable row level security;

-- Collaborators (the owner and co-hosts) read their event's guest list. Nothing for anon.
create policy guest_parties_select_member on public.guest_parties
  for select to authenticated using (public.is_event_member(event_id));
create policy guest_people_select_member on public.guest_people
  for select to authenticated using (public.is_event_member(event_id));

-- No end-user writes at all: the guest functions are the only path.
revoke all on table public.guest_parties from public, anon, authenticated;
revoke all on table public.guest_people from public, anon, authenticated;
revoke all on table public.party_invite_links from public, anon, authenticated;
grant select on table public.guest_parties to authenticated;
grant select on table public.guest_people to authenticated;
grant select, insert, update, delete on table public.guest_parties to service_role;
grant select, insert, update, delete on table public.guest_people to service_role;
grant select, insert, update, delete on table public.party_invite_links to service_role;

-- ===========================================================================
-- 6. guest_lock_event: the event's lock and the membership backstop
-- ===========================================================================
-- Takes p_event_id's lock (the one every collaborator write takes) and checks that p_user_id is
-- its owner or a co-host. Returns false when there is no such event.
--
-- Errors: 22023 invalid argument · 42501 p_user_id is not the event's owner or a co-host.
create function public.guest_lock_event(p_event_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event_id is null or p_user_id is null then
    raise exception 'invalid guest list arguments' using errcode = 'invalid_parameter_value';
  end if;
  perform 1 from public.events e where e.id = p_event_id for no key update;
  if not found then
    return false;
  end if;
  if not exists (
    select 1 from public.event_members m where m.event_id = p_event_id and m.user_id = p_user_id
  ) then
    raise exception 'only the event''s owner or a co-host can manage its guests'
      using errcode = 'insufficient_privilege';
  end if;
  return true;
end;
$$;

-- ===========================================================================
-- 7. guest_write_party: one party and its guests (internal)
-- ===========================================================================
-- Writes one party of p_event_id from p_party, under the event's lock (the caller holds it and
-- has counted the limits). p_party_id null creates the party with its personal link row;
-- otherwise it updates that party of the event (the caller has checked it exists).
--
-- p_party (jsonb):
--   display_name        text, required (the caller derives it when the host left it blank)
--   phone               text or null, E.164
--   email               text or null
--   no_phone_available  boolean
--   plus_one_allowed    boolean
--   people              array of { id?: uuid, name: text, type: "adult" | "child" }, at least one;
--                       the first is the main contact and is an adult. On an update a guest with
--                       an id keeps their row (and anything they answered); guests left out are
--                       removed. Plus-ones are the guests' own (a later RSVP slice) and untouched.
--   link_id, token_hash on a create only: the personal link row's id and its token's SHA-256.
--
-- p_require_contact: a phone or the No phone available override is required (every save from
-- the party editor); an import may leave a party with neither (Needs phone, spec.md §12.2).
--
-- Errors: 22023 invalid party · 23514 a value the table refuses (a name's length, a phone's form).
create function public.guest_write_party(
  p_event_id uuid,
  p_party_id uuid,
  p_party jsonb,
  p_source public.guest_contact_source,
  p_require_contact boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_people jsonb := p_party -> 'people';
  v_phone text := nullif(p_party ->> 'phone', '');
  v_no_phone boolean := coalesce((p_party ->> 'no_phone_available')::boolean, false);
  v_email text := nullif(p_party ->> 'email', '');
  v_plus_one boolean := coalesce((p_party ->> 'plus_one_allowed')::boolean, false);
  v_display text := p_party ->> 'display_name';
  v_main text;
  v_adults integer;
  v_children integer;
  v_party uuid := p_party_id;
  v_old_phone text;
  v_keep uuid[] := '{}';
  v_person jsonb;
  v_position bigint;
  v_person_id uuid;
begin
  if p_party is null or jsonb_typeof(p_party) <> 'object'
     or v_people is null or jsonb_typeof(v_people) <> 'array' or jsonb_array_length(v_people) = 0
  then
    raise exception 'a party needs at least one guest' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_people) p
    where jsonb_typeof(p) <> 'object'
       or coalesce(p ->> 'type', '') not in ('adult', 'child')
       or jsonb_typeof(p -> 'name') is distinct from 'string'
  ) then
    raise exception 'each guest needs a name and a type' using errcode = 'invalid_parameter_value';
  end if;
  if v_people -> 0 ->> 'type' <> 'adult' then
    raise exception 'the main contact is an adult' using errcode = 'invalid_parameter_value';
  end if;
  if p_require_contact and v_phone is null and not v_no_phone then
    raise exception 'a party needs a phone or No phone available'
      using errcode = 'invalid_parameter_value';
  end if;
  if (
    select count(*) <> count(distinct p ->> 'id')
    from jsonb_array_elements(v_people) p where nullif(p ->> 'id', '') is not null
  ) then
    raise exception 'a guest is listed twice' using errcode = 'invalid_parameter_value';
  end if;

  v_main := v_people -> 0 ->> 'name';
  select count(*) filter (where p ->> 'type' = 'adult'), count(*) filter (where p ->> 'type' = 'child')
  into v_adults, v_children
  from jsonb_array_elements(v_people) p;

  if v_party is null then
    if nullif(p_party ->> 'link_id', '') is null or nullif(p_party ->> 'token_hash', '') is null then
      raise exception 'a new party needs its personal link' using errcode = 'invalid_parameter_value';
    end if;
    insert into public.guest_parties (
      event_id, display_name, primary_contact_name, phone, email, no_phone_available,
      contact_consent_source, max_adults, max_children, plus_one_allowed, created_at, updated_at
    )
    values (
      p_event_id, v_display, v_main, v_phone, v_email, v_no_phone, p_source, v_adults, v_children,
      v_plus_one, clock_timestamp(), clock_timestamp()
    )
    returning id into v_party;
    insert into public.party_invite_links (id, event_id, party_id, token_hash)
    values ((p_party ->> 'link_id')::uuid, p_event_id, v_party, p_party ->> 'token_hash');
  else
    select g.phone into v_old_phone
    from public.guest_parties g where g.id = v_party and g.event_id = p_event_id;
    update public.guest_parties g
    set display_name = v_display,
        primary_contact_name = v_main,
        phone = v_phone,
        email = v_email,
        no_phone_available = v_no_phone,
        max_adults = v_adults,
        max_children = v_children,
        plus_one_allowed = v_plus_one,
        -- A number the host typed in is theirs; otherwise the source stands.
        contact_consent_source = case
          when v_phone is not null and v_phone is distinct from v_old_phone then p_source
          else g.contact_consent_source
        end
    where g.id = v_party and g.event_id = p_event_id;
  end if;

  for v_person, v_position in select * from jsonb_array_elements(v_people) with ordinality loop
    v_person_id := nullif(v_person ->> 'id', '')::uuid;
    if v_person_id is not null and p_party_id is not null then
      update public.guest_people gp
      set name = v_person ->> 'name',
          type = (v_person ->> 'type')::public.guest_person_type,
          position = v_position - 1
      where gp.id = v_person_id and gp.party_id = v_party and gp.type <> 'plus_one';
      if not found then
        raise exception 'a guest who is not in this party' using errcode = 'invalid_parameter_value';
      end if;
    else
      insert into public.guest_people (party_id, event_id, name, type, position)
      values (
        v_party, p_event_id, v_person ->> 'name', (v_person ->> 'type')::public.guest_person_type,
        v_position - 1
      )
      returning id into v_person_id;
    end if;
    v_keep := v_keep || v_person_id;
  end loop;

  if p_party_id is not null then
    delete from public.guest_people gp
    where gp.party_id = v_party and gp.type <> 'plus_one' and gp.id <> all (v_keep);
  end if;

  return v_party;
end;
$$;

-- ===========================================================================
-- 8. save_guest_party (owner or co-host): add or edit one party
-- ===========================================================================
-- Creates a party (p_party_id null) with its guests and personal link, or updates one, replacing
-- its guests (see guest_write_party for p_party). A phone or the No phone available override is
-- required (spec.md §12.2, §31 RSVP "Manual add requires phone or explicit no-phone
-- acknowledgement"). Allowed before and after publish (spec.md §8.1).
--
-- Returns one row: outcome and the party's id.
--   created    — a new party, contact source host_entered, invitation not sent, awaiting;
--   saved      — the party was updated;
--   over_limit — the event would pass 1,000 parties or 2,000 guests; nothing changes;
--   not_found  — no such event, or no such party of this event.
--
-- Errors: 22023 invalid argument or party · 42501 p_user_id is not the event's owner or a co-host
-- · 23514 a value the table refuses · 23505 a link id or token hash already recorded.
create function public.save_guest_party(
  p_event_id uuid,
  p_user_id uuid,
  p_party_id uuid,
  p_party jsonb
)
returns table (outcome text, party_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parties integer;
  v_people integer;
  v_current integer := 0;
  v_new integer;
  v_id uuid;
begin
  if not public.guest_lock_event(p_event_id, p_user_id) then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if p_party_id is not null and not exists (
    select 1 from public.guest_parties g where g.id = p_party_id and g.event_id = p_event_id
  ) then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  v_new := case when jsonb_typeof(p_party -> 'people') = 'array'
    then jsonb_array_length(p_party -> 'people') else 0 end;
  select count(*) into v_parties from public.guest_parties g where g.event_id = p_event_id;
  select count(*) into v_people from public.guest_people gp where gp.event_id = p_event_id;
  if p_party_id is not null then
    select count(*) into v_current
    from public.guest_people gp where gp.party_id = p_party_id and gp.type <> 'plus_one';
  end if;
  if (p_party_id is null and v_parties + 1 > 1000) or v_people - v_current + v_new > 2000 then
    return query select 'over_limit'::text, p_party_id;
    return;
  end if;

  v_id := public.guest_write_party(p_event_id, p_party_id, p_party, 'host_entered', true);
  return query select (case when p_party_id is null then 'created' else 'saved' end)::text, v_id;
end;
$$;

-- ===========================================================================
-- 9. delete_guest_party (owner or co-host)
-- ===========================================================================
-- Deletes one party of the event, with its guests and links (cascade). Allowed before and after
-- publish.
--
-- Returns: deleted · not_found (no such event, or no such party of this event).
--
-- Errors: 22023 invalid argument · 42501 p_user_id is not the event's owner or a co-host.
create function public.delete_guest_party(p_event_id uuid, p_user_id uuid, p_party_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_party_id is null then
    raise exception 'invalid delete_guest_party arguments' using errcode = 'invalid_parameter_value';
  end if;
  if not public.guest_lock_event(p_event_id, p_user_id) then
    return 'not_found';
  end if;
  delete from public.guest_parties g where g.id = p_party_id and g.event_id = p_event_id;
  if not found then
    return 'not_found';
  end if;
  return 'deleted';
end;
$$;

-- ===========================================================================
-- 10. import_guest_parties (owner or co-host): a CSV import, all or nothing
-- ===========================================================================
-- Adds every party of p_parties (an array of 1–2,000 parties, each as guest_write_party takes
-- it, with its link_id and token_hash) to the event in one transaction, each with contact source
-- csv_import. A party may have neither a phone nor the override: it imports as Needs phone
-- (spec.md §12.2, §31 RSVP "CSV with missing phone rows imports and flags Needs phone"; §32 #35).
-- Nothing is matched against existing parties. Any invalid party refuses the whole import.
--
-- Returns one row: outcome, the parties imported, and the event's parties and guests — after the
-- import, or, for over_limit, as the import would have left them.
--   imported   — every party was added;
--   over_limit — the event would pass 1,000 parties or 2,000 guests; nothing changes;
--   not_found  — no such event.
--
-- Errors: 22023 invalid argument or party · 42501 p_user_id is not the event's owner or a co-host
-- · 23514 a value the table refuses · 23505 a link id or token hash already recorded.
create function public.import_guest_parties(p_event_id uuid, p_user_id uuid, p_parties jsonb)
returns table (outcome text, imported integer, parties integer, people integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parties integer;
  v_people integer;
  v_new_parties integer;
  v_new_people integer;
  v_party jsonb;
begin
  if p_parties is null or jsonb_typeof(p_parties) <> 'array'
     or jsonb_array_length(p_parties) not between 1 and 2000 then
    raise exception 'invalid import_guest_parties arguments'
      using errcode = 'invalid_parameter_value';
  end if;
  if not public.guest_lock_event(p_event_id, p_user_id) then
    return query select 'not_found'::text, 0, 0, 0;
    return;
  end if;

  v_new_parties := jsonb_array_length(p_parties);
  select coalesce(sum(case when jsonb_typeof(p -> 'people') = 'array'
    then jsonb_array_length(p -> 'people') else 0 end), 0)
  into v_new_people
  from jsonb_array_elements(p_parties) p;
  select count(*) into v_parties from public.guest_parties g where g.event_id = p_event_id;
  select count(*) into v_people from public.guest_people gp where gp.event_id = p_event_id;
  if v_parties + v_new_parties > 1000 or v_people + v_new_people > 2000 then
    return query select 'over_limit'::text, 0, v_parties + v_new_parties, v_people + v_new_people;
    return;
  end if;

  for v_party in select * from jsonb_array_elements(p_parties) loop
    if jsonb_typeof(v_party) <> 'object' or v_party ? 'id' then
      raise exception 'an import only adds parties' using errcode = 'invalid_parameter_value';
    end if;
    perform public.guest_write_party(p_event_id, null, v_party, 'csv_import', false);
  end loop;

  return query select 'imported'::text, v_new_parties, v_parties + v_new_parties,
    v_people + v_new_people;
end;
$$;

-- ===========================================================================
-- 11. party_link (owner or co-host): the active link of a party, once published
-- ===========================================================================
-- The id of the party's working link row, from which server code derives the token for `Copy
-- personal link`. Personal links are surfaced to the host only once the event is published
-- (spec.md §12.5); before that nothing about them leaves the database. Changes nothing.
--
-- Returns one row: outcome and the link row's id (null unless ok).
--   ok            — the event is published and the party is its own;
--   not_published — the event is not published;
--   not_found     — no such event, or no such party of this event.
--
-- Errors: 22023 invalid argument · 42501 p_user_id is not the event's owner or a co-host.
create function public.party_link(p_event_id uuid, p_user_id uuid, p_party_id uuid)
returns table (outcome text, link_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_published timestamptz;
  v_link uuid;
begin
  if p_event_id is null or p_user_id is null or p_party_id is null then
    raise exception 'invalid party_link arguments' using errcode = 'invalid_parameter_value';
  end if;
  select e.published_at into v_published from public.events e where e.id = p_event_id;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if not exists (
    select 1 from public.event_members m where m.event_id = p_event_id and m.user_id = p_user_id
  ) then
    raise exception 'only the event''s owner or a co-host can read a personal link'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.guest_parties g where g.id = p_party_id and g.event_id = p_event_id
  ) then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if v_published is null then
    return query select 'not_published'::text, null::uuid;
    return;
  end if;
  select l.id into v_link
  from public.party_invite_links l
  where l.party_id = p_party_id and l.event_id = p_event_id and l.revoked_at is null;
  if v_link is null then
    -- Every party is made with a link and rotation always leaves one; never in practice.
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  return query select 'ok'::text, v_link;
end;
$$;

-- ===========================================================================
-- 12. rotate_party_link (owner or co-host): a new personal link, once published
-- ===========================================================================
-- Revokes the party's working link and records p_link_id (with its token's SHA-256) as the new
-- one, in one transaction under the event's lock, so the party always has exactly one working
-- link and the old one stops resolving at once (spec.md §12.5). Only once the event is published,
-- when links are surfaced to the host.
--
-- Returns: rotated · not_published · not_found (no such event, or no such party of this event).
--
-- Errors: 22023 invalid argument · 42501 p_user_id is not the event's owner or a co-host · 23505
-- a link id or token hash already recorded.
create function public.rotate_party_link(
  p_event_id uuid,
  p_user_id uuid,
  p_party_id uuid,
  p_link_id uuid,
  p_token_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_published timestamptz;
begin
  if p_party_id is null or p_link_id is null or p_token_hash is null then
    raise exception 'invalid rotate_party_link arguments' using errcode = 'invalid_parameter_value';
  end if;
  if not public.guest_lock_event(p_event_id, p_user_id) then
    return 'not_found';
  end if;
  perform 1 from public.guest_parties g
  where g.id = p_party_id and g.event_id = p_event_id
  for update;
  if not found then
    return 'not_found';
  end if;
  select e.published_at into v_published from public.events e where e.id = p_event_id;
  if v_published is null then
    return 'not_published';
  end if;

  update public.party_invite_links l
  set revoked_at = now()
  where l.party_id = p_party_id and l.event_id = p_event_id and l.revoked_at is null;
  insert into public.party_invite_links (id, event_id, party_id, token_hash)
  values (p_link_id, p_event_id, p_party_id, p_token_hash);
  return 'rotated';
end;
$$;

-- ===========================================================================
-- 13. Grants: service role only
-- ===========================================================================
revoke execute on function public.guest_lock_event(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.guest_write_party(
  uuid, uuid, jsonb, public.guest_contact_source, boolean
) from public, anon, authenticated, service_role;

revoke execute on function public.save_guest_party(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.delete_guest_party(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.import_guest_parties(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.party_link(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.rotate_party_link(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.save_guest_party(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.delete_guest_party(uuid, uuid, uuid) to service_role;
grant execute on function public.import_guest_parties(uuid, uuid, jsonb) to service_role;
grant execute on function public.party_link(uuid, uuid, uuid) to service_role;
grant execute on function public.rotate_party_link(uuid, uuid, uuid, uuid, text) to service_role;
