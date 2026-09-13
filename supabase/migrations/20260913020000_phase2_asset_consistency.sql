-- Phase 2: consistency across the database/Storage boundary for pre-auth inspiration.
--
-- Every function here exists because a check and the act it guards were separated by a
-- network hop. Requirements: spec.md §7.2 (inspiration survives auth exactly; abandoned
-- pre-auth assets expire), §27 ("private AI inputs, stored privately with strict limits and
-- short raw-file retention"), §10 (anti-abuse limits). Guardrails: §32 #5, #32, #34.
--
-- The boundary invariant every function below preserves: an inspiration object in the private
-- bucket always has a row that knows its key until the object itself is gone. A row pointing
-- at a missing object is recoverable (the next purge run clears it); an object no row names is
-- not recoverable at all, so no code path may delete a row whose object still exists.

-- ---------------------------------------------------------------------------
-- Attaching an uploaded object to its owner, under the claim's own row lock
-- ---------------------------------------------------------------------------
-- The upload is a Storage round trip, so a draft can be claimed while it is in flight. Doing
-- the insert here, under `for update` on the draft — the same lock `claim_pre_auth_draft`
-- takes — makes the two orders of arrival converge instead of racing:
--   * still unclaimed: the asset joins the draft and is re-parented by the later claim;
--   * already claimed: the asset joins the event the draft was claimed into, so the host sees
--     the image they uploaded rather than a row belonging to nothing and excluded from the
--     purge (which only takes unclaimed drafts).
-- The claim's own behaviour is unchanged: it still decides everything it decided before, and
-- still sees either both rows or neither.
--
-- The file cap is enforced here for the same reason: counted outside the lock, two concurrent
-- uploads both see room and both insert. `p_max_files` is passed in so MAX_FILES_PER_DRAFT in
-- src/lib/drafts/inspiration.ts stays the single source of the number.
--
-- Outcomes: 'attached' (asset_id/asset_created_at set, attached_event_id set only when the
-- draft was already claimed), 'limit_reached', 'gone' (no such draft, an unclaimed draft past
-- its TTL, or a claimed draft whose event has since been deleted). On anything but 'attached'
-- the caller removes the object it just uploaded; nothing here leaves a row behind.
--
-- An unclaimed draft past its TTL is refused rather than extended: the purge job works from a
-- cutoff strictly in the past, so refusing here means an asset can never be inserted into a
-- draft a purge run has already listed and is about to delete.
create or replace function public.attach_inspiration_asset(
  p_draft_id uuid,
  p_storage_key text,
  p_mime_type text,
  p_size_bytes integer,
  p_max_files integer
)
returns table (
  outcome text,
  asset_id uuid,
  attached_event_id uuid,
  asset_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.pre_auth_event_drafts%rowtype;
  v_count integer;
  v_id uuid;
  v_created timestamptz;
begin
  if p_draft_id is null or p_storage_key is null or p_mime_type is null
     or p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'an inspiration asset needs a draft, a storage key, a type and a size';
  end if;
  if p_max_files is null or p_max_files < 1 then
    raise exception 'the file cap must be a positive number';
  end if;

  select * into v_draft
  from public.pre_auth_event_drafts
  where id = p_draft_id
  for update;

  if not found then
    return query select 'gone'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if v_draft.claimed_at is not null then
    if v_draft.claimed_event_id is null then
      return query select 'gone'::text, null::uuid, null::uuid, null::timestamptz;
      return;
    end if;
    select count(*) into v_count
    from public.inspiration_assets a
    where a.event_id = v_draft.claimed_event_id;
    if v_count >= p_max_files then
      return query select 'limit_reached'::text, null::uuid, null::uuid, null::timestamptz;
      return;
    end if;
    insert into public.inspiration_assets
      (event_id, storage_key, mime_type, size_bytes, expires_at)
    values
      (v_draft.claimed_event_id, p_storage_key, p_mime_type, p_size_bytes, v_draft.expires_at)
    returning id, created_at into v_id, v_created;
    return query select 'attached'::text, v_id, v_draft.claimed_event_id, v_created;
    return;
  end if;

  if v_draft.expires_at < now() then
    return query select 'gone'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  select count(*) into v_count
  from public.inspiration_assets a
  where a.pre_auth_draft_id = v_draft.id;
  if v_count >= p_max_files then
    return query select 'limit_reached'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  insert into public.inspiration_assets
    (pre_auth_draft_id, storage_key, mime_type, size_bytes, expires_at)
  values
    (v_draft.id, p_storage_key, p_mime_type, p_size_bytes, v_draft.expires_at)
  returning id, created_at into v_id, v_created;
  return query select 'attached'::text, v_id, null::uuid, v_created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Paged expiry of abandoned pre-auth state (§7.2, §27)
-- ---------------------------------------------------------------------------
-- `expired_pre_auth_storage_keys` + `purge_expired_pre_auth_state` are a matched pair only
-- when the caller sees every key: read through the Data API, the key list is capped by
-- `max_rows` (supabase/config.toml), while the purge deletes *every* expired draft under the
-- same cutoff. Past that cap the extra drafts were deleted with their assets while their
-- objects stayed in the bucket with nothing left that named them.
--
-- These two replace that pair for the purge job with one page at a time: a batch names the
-- drafts *and* their keys, and only those drafts are then purged. A run may stop at any point
-- and the next one resumes; the only state left behind is rows whose objects are already gone.
-- The superseded pair is left in place for the Phase 1 contract it documents; the purge route
-- no longer calls it, and new callers should not.
--
-- Keys come back aggregated per draft rather than one row per key so that the row count is the
-- draft count: a page can never be silently truncated by `max_rows` mid-draft. The 500 ceiling
-- keeps a page well under that limit even if the cap is lowered.
create or replace function public.expired_pre_auth_draft_batch(
  p_cutoff timestamptz,
  p_limit integer
)
returns table (draft_id uuid, storage_keys text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'batch limit must be between 1 and 500';
  end if;
  return query
  select
    d.id,
    coalesce(
      array_agg(a.storage_key order by a.storage_key) filter (where a.storage_key is not null),
      array[]::text[]
    )
  from public.pre_auth_event_drafts d
  left join public.inspiration_assets a on a.pre_auth_draft_id = d.id
  where d.claimed_at is null and d.expires_at < p_cutoff
  group by d.id
  order by min(d.expires_at)
  limit p_limit;
end;
$$;

-- Deletes only the drafts named, and only if they still match the cutoff the batch was read
-- with: a draft whose objects this run did not remove is never deleted. Assets cascade.
create or replace function public.purge_pre_auth_drafts(
  p_cutoff timestamptz,
  p_draft_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_drafts integer;
begin
  if p_cutoff > now() then
    raise exception 'cutoff must not be in the future';
  end if;
  if p_draft_ids is null or array_length(p_draft_ids, 1) is null then
    return 0;
  end if;
  delete from public.pre_auth_event_drafts d
  where d.id = any(p_draft_ids) and d.claimed_at is null and d.expires_at < p_cutoff;
  get diagnostics v_drafts = row_count;
  return v_drafts;
end;
$$;

-- Stale counters are independent of the draft pages, so the purge job sweeps them once per
-- run. Same retention as the Phase 1 function this splits it out of.
create or replace function public.purge_stale_rate_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  delete from public.rate_limits where window_start < now() - interval '2 days';
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- Server-only surface (same declaration as the existing server-only functions)
-- ---------------------------------------------------------------------------
revoke execute on function
  public.attach_inspiration_asset(uuid, text, text, integer, integer)
  from public, anon, authenticated;
revoke execute on function
  public.expired_pre_auth_draft_batch(timestamptz, integer) from public, anon, authenticated;
revoke execute on function
  public.purge_pre_auth_drafts(timestamptz, uuid[]) from public, anon, authenticated;
revoke execute on function public.purge_stale_rate_limits() from public, anon, authenticated;

grant execute on function
  public.attach_inspiration_asset(uuid, text, text, integer, integer) to service_role;
grant execute on function
  public.expired_pre_auth_draft_batch(timestamptz, integer) to service_role;
grant execute on function public.purge_pre_auth_drafts(timestamptz, uuid[]) to service_role;
grant execute on function public.purge_stale_rate_limits() to service_role;
