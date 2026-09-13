-- Optimistic concurrency for event detail saves (spec.md §7.3, §7.4).
--
-- `updateEventDetails` reads the event, computes the patch and the derived RSVP deadline from
-- that snapshot, then writes. Between the read and the write another autosave can land, and
-- the two requests are independent: a date save that read the row before the mount-time
-- timezone save committed would compute its deadline against a timezone that is no longer
-- current, and nothing afterwards is obliged to recompute it. §7.4 makes the stored zone
-- authoritative for every lifecycle calculation, so a deadline derived from a stale mixed
-- snapshot is wrong in a way nobody sees.
--
-- The fix is a row version the writer must still hold. A save reads the version with the row
-- and updates `where id = ? and row_version = ?`; if another writer got there first the update
-- matches nothing, and the caller rereads and recomputes from the new authoritative state.
--
-- Named `row_version` rather than `version` because this table's neighbours already use
-- `*_version` for prompt, schema, compiler and primitive-set identifiers, and
-- `resolved_design_specs.content_version` counts content revisions. This one is neither: it
-- is a concurrency token, meaningful only for the compare-and-set above.

alter table public.events
  add column row_version integer not null default 1 check (row_version >= 1);

comment on column public.events.row_version is
  'Optimistic concurrency token. Incremented by trigger on every update; never written by application code. A writer updates WHERE row_version = the value it read, so a save that lost a race matches no row and recomputes instead of overwriting.';

-- Incremented here rather than by the caller, so it is monotonic no matter who writes and
-- cannot be forged: a value supplied in the UPDATE is overwritten before the row is stored.
-- Deliberately not gated on `is_end_user_request()` — service-role writes must bump it too,
-- or an end user's compare-and-set could silently pass over a server-side change.
create or replace function public.bump_event_row_version()
returns trigger
language plpgsql
as $$
begin
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

-- Named to sort after `events_a_protect_server_columns`, so the privilege check still runs
-- first and an unauthorised update is refused before anything is derived from it.
create trigger events_b_bump_row_version
  before update on public.events
  for each row execute function public.bump_event_row_version();
