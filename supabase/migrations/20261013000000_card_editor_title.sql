-- Card editor (Phase 6b part 1): a card-editor save that also edits the event's title.
--
-- spec.md §20.2: the title box shows the effective title, and editing it edits Event.title, which
-- the envelope, page and link previews use too. spec.md §20.5: every save carries the revision it
-- was based on, and a stale save is refused. A save that edits the title must therefore land
-- whole or not at all: a stale save changes neither the customization nor the title, and a title
-- is never written without the boxes it was laid out in.
--
-- save_card_customization_with_title runs save_card_customization (the revision check, the
-- membership check, the design and artwork checks, the storage backstop — unchanged) and then
-- writes events.title, in one transaction. SECURITY INVOKER: the title is written as the caller,
-- under events_update_member and the events triggers, exactly as the details form writes it; this
-- function grants nothing the caller does not already have. The title's entry and fit checks are
-- the server action's, as for the details form (src/app/actions/card-customization.ts).
--
-- Returns the customization's new revision.
--
-- Errors: those of save_card_customization (PT409 stale revision, 42501 not the event's owner or
-- a co-host, 22023 invalid argument, 23514 design not the event's or boxes over the backstop),
-- and 22023 for a missing or blank title.

create function public.save_card_customization_with_title(
  p_event_id uuid,
  p_card_design_id uuid,
  p_shape text,
  p_boxes jsonb,
  p_expected_revision integer,
  p_title text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_revision integer;
begin
  if p_title is null or btrim(p_title) = '' then
    raise exception 'a title is required'
      using errcode = 'invalid_parameter_value';
  end if;

  v_revision := public.save_card_customization(
    p_event_id, p_card_design_id, p_shape, p_boxes, p_expected_revision);

  update public.events e set title = p_title where e.id = p_event_id;
  if not found then
    -- Unreachable for a member (save_card_customization checked membership); kept so the title
    -- can never silently fail to land beside its boxes.
    raise exception 'only the event''s owner or a co-host can edit its title'
      using errcode = 'insufficient_privilege';
  end if;

  return v_revision;
end;
$$;

revoke execute on function
  public.save_card_customization_with_title(uuid, uuid, text, jsonb, integer, text)
  from public, anon;
grant execute on function
  public.save_card_customization_with_title(uuid, uuid, text, jsonb, integer, text)
  to authenticated;
