-- Phase 5b follow-up: a failed generation records why (spec.md §9.5: art regeneration "with the
-- reason: the failed validation").
--
-- The corpus run on the production stack showed the gap: two generations failed with
-- `artwork_invalid` and nothing durable said which check each image failed. fail_generation now
-- takes the generation's telemetry beside its code — the failed stage and, for the artwork, each
-- image's validation failure — written in the same statement that fails it, only while it is
-- running. Server-only, like the rest of the generation functions (spec.md §32 #42).

drop function public.fail_generation(uuid, uuid, text);

-- fail_generation: marks the generation failed with p_error_code, only while it is running, and
-- stores p_telemetry (a JSON object, or null for none) as its telemetry. Returns whether it did.
-- A failed generation's telemetry is { failure: {...} }; a succeeded one's is the §9.5 record.
-- Errors: 22023 invalid argument.
create function public.fail_generation(
  p_generation_id uuid,
  p_event_id uuid,
  p_error_code text,
  p_telemetry jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_generation_id is null or p_event_id is null
     or p_error_code is null or char_length(p_error_code) not between 1 and 64
     or (p_telemetry is not null and jsonb_typeof(p_telemetry) <> 'object') then
    raise exception 'invalid fail_generation arguments'
      using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.events e where e.id = p_event_id for no key update;
  if not found then
    return false;
  end if;

  update public.generations g
  set status = 'failed', error_code = p_error_code, finished_at = now(),
      telemetry = coalesce(p_telemetry, g.telemetry)
  where g.id = p_generation_id and g.event_id = p_event_id and g.status = 'running';
  return found;
end;
$$;

revoke execute on function public.fail_generation(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.fail_generation(uuid, uuid, text, jsonb) to service_role;

-- Refresh PostgREST's schema cache however this migration is applied; a no-op without a listener.
notify pgrst, 'reload schema';
