-- ---------------------------------------------------------------------------
-- Phase 4E — artwork slots, assets and their lineage.
--
-- # The rule every column here falls out of
--
-- A `ResolvedDesignSpec` is compiled, geometry-verified at 390 and 1280, and **frozen before any
-- image exists**. An artwork slot is a *reserved box* inside that already-verified geometry,
-- carrying a stable slot identifier the compiler assigned. An asset attaches to that slot
-- **afterwards — or never**. Attaching one never changes the spec, never re-runs verification and
-- never invalidates it.
--
-- Two consequences, and they are the whole design:
--
-- **1. Artwork rows are a side table keyed by `(resolved_spec_id, slot_id)`, not fields inside the
-- persisted spec.** Writing an asset into `resolved_design_specs.spec` would make the spec mutable,
-- and `spec.md §32 #18` and `CLAUDE.md §2` make generated design data immutable —
-- `reject_update()` already refuses every update to that table, so the alternative is not merely
-- discouraged, it is impossible. Keying by the *revision* rather than the concept is deliberate: a
-- content edit re-fits into a new revision with its own geometry, so its boxes are new boxes and
-- its slots are new slots. A slot never silently inherits a box it was not measured against.
--
-- **2. A slot with no asset is a valid, renderable, complete artifact.** `spec.md §7.6a #1` makes
-- imagery optional and `#5` keeps safe realization with the deterministic renderer: a page whose
-- artwork never arrives is a page, not a half-written one. So the status vocabulary makes that
-- state first-class — `reserved` is the *default*, it is terminal-compatible, and nothing in this
-- migration treats it as an error or an incomplete write.
--
-- # Status vocabulary
--
--   * `reserved`  — the box exists in verified geometry and no request has been made. The default,
--                   and a complete state. Covers both "the direction chose no artwork for this
--                   slot" and "the request has not happened yet": neither is distinguishable from
--                   the row, and neither needs to be, because both render identically.
--   * `requested` — a request is outstanding. Provider lineage may be recorded here, before any
--                   asset exists.
--   * `delivered` — an asset is attached. Terminal.
--   * `failed`    — terminally failed, with a classified kind. Terminal, and a *recorded outcome*:
--                   the row exists and says so, rather than the absence of a row standing in for
--                   a failure nobody can distinguish from a slot that was never requested.
--
-- Transitions are forward-only and enforced by a trigger, not by TypeScript: `reserved` →
-- `requested` → (`delivered` | `failed`), skipping forward permitted, backward refused, and both
-- terminal states frozen against any further update at all.
--
-- # No provider has been selected
--
-- `docs/technology-decisions.md` records no image model, and none has been called. Every provider
-- column is therefore nullable, and a row with a fully assembled `VisualArtIntent` and every
-- provider column null is a legitimate, expected row — not a partially written one.
--
-- # Alpha is measured, never inferred
--
-- `docs/product-doctrine.md §10` makes transparent-background reliability an empirical property of
-- a provider, and `src/lib/ai/visual-art/contract.ts` says the same of `BACKGROUND_TREATMENTS`:
-- "`required` is an **empirical** demand on the provider, not an assumption". So `has_alpha` is a
-- per-asset fact recorded from the delivered bytes and `not null` whenever an asset exists. It is
-- never derived from `role`, and a role that wanted transparency against a provider that did not
-- supply it is visible here rather than papered over.
--
-- Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` — *"Compiler
-- persists immutable, verified ResolvedDesignSpec"*, *"DesignIntent + CompositionTree (raw and
-- canonical) + ResolvedDesignSpec persist per concept with prompt, schema, primitive-set and
-- compiler versions"*. Guardrails: `spec.md §32 #13`, `#15`, `#18`, `#20`, `#24`, `#32`.
--
-- Additive throughout. No existing table, function, policy or grant is dropped, renamed or
-- relaxed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Enums.
--
-- `artwork_role` is an enum rather than a text check because its four members are canon's, not
-- this migration's: `src/lib/ai/visual-art/contract.ts` states that they are "`spec.md §7.6a`'s own
-- in-scope list rather than a taxonomy invented here", and that "a fifth role is a compiler change
-- and a version bump, never a prompt tweak". An enum makes adding one cost exactly that.
--
-- `artwork_slot_status` is an enum for the same reason it is not a boolean pair: the four states
-- are the lifecycle, the rank order below is derived from them, and a fifth state would change
-- what forward-only means.
-- ---------------------------------------------------------------------------
create type public.artwork_role as enum ('anchor', 'object', 'atmosphere', 'framed');

create type public.artwork_slot_status as enum ('reserved', 'requested', 'delivered', 'failed');

comment on type public.artwork_role is
  'The four in-scope artwork roles of spec.md §7.6a, mirrored from ARTWORK_ROLES in '
  'src/lib/ai/visual-art/contract.ts. tests/db/phase4e-artwork.test.ts holds the two equal.';

comment on type public.artwork_slot_status is
  'reserved (no request; a complete, renderable state) -> requested -> delivered | failed. '
  'Forward-only; delivered and failed are terminal and frozen.';

-- ---------------------------------------------------------------------------
-- 2. `resolved_spec_artwork_slots`.
--
-- Named for what it is keyed by. The temptation is `concept_artwork_slots`, and it would be wrong:
-- a concept has many revisions, each with its own verified geometry, and a slot belongs to exactly
-- one of them.
-- ---------------------------------------------------------------------------
create table public.resolved_spec_artwork_slots (
  id uuid primary key default gen_random_uuid(),

  -- ---- the slot, inside one frozen revision ------------------------------
  -- `cascade`, matching `resolved_design_specs.concept_id`: a slot is an attachment point inside
  -- one revision's geometry and has no meaning once that revision is gone. Nothing downstream
  -- treats it as evidence of spend — that lives in `generation_runs` — so there is no reason to
  -- `restrict` here the way the evidence tables do.
  resolved_spec_id uuid not null references public.resolved_design_specs (id) on delete cascade,

  -- The compiler's stable identifier for this box within the tree. Constrained in shape rather
  -- than in vocabulary: the vocabulary belongs to the composition language, whose generation is
  -- already recorded on the revision as `primitive_set_version`.
  slot_id text not null check (slot_id ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),

  -- ---- the structural facts the compiler resolved ------------------------
  -- `spec.md §7.6a #3`: "The model never places the image." These five columns are the evidence
  -- that placement was compiler-owned — the box was measured, at both authoritative breakpoints,
  -- before any brief was assembled and long before any asset existed.
  role public.artwork_role not null,
  extent text not null check (extent ~ '^[a-z][a-z0-9_]{0,31}$'),
  mobile_width_px integer not null check (mobile_width_px > 0),
  mobile_height_px integer not null check (mobile_height_px > 0),
  desktop_width_px integer not null check (desktop_width_px > 0),
  desktop_height_px integer not null check (desktop_height_px > 0),

  -- ---- the brief ---------------------------------------------------------
  -- The assembled `VisualArtIntent`, verbatim. Immutable once written (section 3): an intent that
  -- could be edited after the fact would mean the row no longer records what was asked for, and
  -- the lineage claim — "this asset came from this brief" — would be unfalsifiable.
  visual_art_intent jsonb not null,
  visual_art_intent_version text not null,

  -- ---- lifecycle ---------------------------------------------------------
  status public.artwork_slot_status not null default 'reserved',

  -- ---- provider lineage, all nullable ------------------------------------
  -- No image model has been selected and none has been called. A row may legitimately carry a
  -- fully assembled intent and nothing here at all.
  provider text,
  model text,
  artwork_prompt_version text,
  artwork_contract_version text,

  -- ---- the asset, when one arrives ---------------------------------------
  storage_bucket text,
  storage_path text,
  width_px integer check (width_px > 0),
  height_px integer check (height_px > 0),
  byte_size bigint check (byte_size > 0),
  content_type text check (content_type in ('image/png', 'image/webp', 'image/avif', 'image/jpeg')),
  -- Measured from the delivered bytes. Never inferred from `role`; see the header.
  has_alpha boolean,

  -- ---- the failure, when one is terminal ---------------------------------
  failure_kind text check (
    failure_kind in (
      'provider_unavailable',  -- none selected/configured, or unreachable
      'provider_refused',      -- the provider declined the brief
      'provider_error',        -- the provider errored terminally
      'timeout',
      'asset_rejected'         -- an asset arrived and failed validation
    )
  ),
  failure_detail text check (failure_detail is null or length(failure_detail) <= 2000),

  -- ---- telemetry ---------------------------------------------------------
  latency_ms integer check (latency_ms >= 0),
  cost_estimate_usd numeric(12, 6) check (cost_estimate_usd >= 0),

  -- ---- clock -------------------------------------------------------------
  created_at timestamptz not null default now(),
  requested_at timestamptz,
  settled_at timestamptz,

  -- One slot identifier per revision. The pair is the slot's identity, and every write below
  -- addresses a row by it rather than by `id`, so an asset can only ever reach the revision that
  -- owns the slot.
  unique (resolved_spec_id, slot_id),

  -- An asset's facts arrive together or not at all, and only for a delivered slot.
  --
  -- Two constraints rather than one biconditional, and the difference is not cosmetic: written as
  -- `(status = 'delivered') = (every column is not null)`, a *partial* asset on a reserved slot —
  -- a path with no bucket, say — satisfies it, because both sides are then false. That row would
  -- claim a storage location while its status says nothing was ever requested.
  constraint resolved_spec_artwork_slots_asset_complete check (
    status <> 'delivered' or (
      storage_bucket is not null and storage_path is not null and width_px is not null
      and height_px is not null and byte_size is not null and content_type is not null
      and has_alpha is not null
    )
  ),
  constraint resolved_spec_artwork_slots_asset_only_when_delivered check (
    status = 'delivered' or (
      storage_bucket is null and storage_path is null and width_px is null and height_px is null
      and byte_size is null and content_type is null and has_alpha is null
    )
  ),

  -- A terminal failure is classified, and only a terminal failure is.
  constraint resolved_spec_artwork_slots_failure_classified check (
    (status = 'failed') = (failure_kind is not null)
  ),
  constraint resolved_spec_artwork_slots_detail_needs_kind check (
    failure_kind is not null or failure_detail is null
  ),

  -- Provider lineage is a pair. A provider with no model does not identify a call.
  constraint resolved_spec_artwork_slots_provider_pair check ((provider is null) = (model is null)),

  -- The clock agrees with the status. `requested_at` is set by `attach_artwork_asset` too, so
  -- "delivered implies it was requested" holds by construction rather than by convention.
  constraint resolved_spec_artwork_slots_requested_at check (
    (status = 'reserved') = (requested_at is null)
  ),
  constraint resolved_spec_artwork_slots_settled_at check (
    (status in ('delivered', 'failed')) = (settled_at is not null)
  )
);

comment on table public.resolved_spec_artwork_slots is
  'One reserved artwork box inside one frozen ResolvedDesignSpec revision, and the asset that may '
  'later attach to it. Never part of the spec: attaching an asset must not mutate, re-verify or '
  'invalidate a spec that spec.md §32 #18 makes immutable.';

comment on column public.resolved_spec_artwork_slots.status is
  'reserved is the default and a complete, renderable state - a slot with no asset is not a '
  'half-written row. Forward-only; delivered and failed are frozen.';

comment on column public.resolved_spec_artwork_slots.has_alpha is
  'Whether the delivered asset actually carries alpha, measured from its bytes. '
  'docs/product-doctrine.md §10 makes this an empirical per-provider property; it is never '
  'inferred from role or from the brief background treatment.';

-- The queue read: slots still awaiting an outcome. Partial, because the terminal rows are the
-- overwhelming majority once a batch has run and no worker ever wants them.
create index resolved_spec_artwork_slots_outstanding_idx
  on public.resolved_spec_artwork_slots (status, created_at)
  where status in ('reserved', 'requested');

-- ---------------------------------------------------------------------------
-- 3. Immutability and forward-only transitions, in the database.
--
-- `resolved_design_specs` uses `reject_update()`, which refuses every update with no column list
-- to fall out of date. This table cannot: an asset legitimately arrives later. So it takes the
-- `protect_design_concept()` shape instead — an explicit enumeration of what may never change,
-- plus the transition rule — and the enumeration is exhaustive over the reservation: the slot's
-- identity, its structural facts, its brief and its creation time.
--
-- The three things this refuses, in the order they would hurt:
--
--   * **editing the intent.** The lineage claim is that *this* asset answered *this* brief. An
--     editable brief makes that claim unfalsifiable, so `visual_art_intent` and its version join
--     the immutable set exactly as `design_intent` and `composition` do on `design_concepts`.
--   * **moving a settled slot.** `delivered` and `failed` are terminal. A settled row refuses
--     every update, which is what makes `attach_artwork_asset` idempotent rather than
--     last-write-wins.
--   * **going backwards.** A delivered slot reverting to `requested`, or a requested slot to
--     `reserved`, would erase an outcome. Rank order is inlined rather than exposed as a public
--     function: it is this trigger's private business and adds no callable surface.
-- ---------------------------------------------------------------------------
create or replace function public.protect_resolved_spec_artwork_slot()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_old integer;
  v_new integer;
begin
  if new.id is distinct from old.id
     or new.resolved_spec_id is distinct from old.resolved_spec_id
     or new.slot_id is distinct from old.slot_id
     or new.role is distinct from old.role
     or new.extent is distinct from old.extent
     or new.mobile_width_px is distinct from old.mobile_width_px
     or new.mobile_height_px is distinct from old.mobile_height_px
     or new.desktop_width_px is distinct from old.desktop_width_px
     or new.desktop_height_px is distinct from old.desktop_height_px
     or new.visual_art_intent is distinct from old.visual_art_intent
     or new.visual_art_intent_version is distinct from old.visual_art_intent_version
     or new.created_at is distinct from old.created_at then
    raise exception 'an artwork slot reservation and its intent are immutable'
      using errcode = 'insufficient_privilege';
  end if;

  if old.status in ('delivered', 'failed') then
    raise exception 'a settled artwork slot is final'
      using errcode = 'insufficient_privilege';
  end if;

  v_old := case old.status
             when 'reserved' then 0 when 'requested' then 1
             when 'delivered' then 2 when 'failed' then 2 end;
  v_new := case new.status
             when 'reserved' then 0 when 'requested' then 1
             when 'delivered' then 2 when 'failed' then 2 end;
  if v_new < v_old then
    raise exception 'artwork slot status is forward-only (% -> %)', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger resolved_spec_artwork_slots_protect
  before update on public.resolved_spec_artwork_slots
  for each row execute function public.protect_resolved_spec_artwork_slot();

-- ---------------------------------------------------------------------------
-- 4. `request_artwork_slot` — reserved -> requested, with the lineage of the call being made.
--
-- Addressed by `(resolved_spec_id, slot_id)`, like every write below, so a caller cannot name a
-- slot belonging to another revision: there is no such row, and the function raises rather than
-- creating one.
--
-- Idempotent on replay: a second request against an outstanding slot returns `already_requested`
-- and changes nothing, because the first request's lineage is the one that was actually sent.
-- ---------------------------------------------------------------------------
create or replace function public.request_artwork_slot(
  p_resolved_spec_id uuid,
  p_slot_id text,
  p_provider text default null,
  p_model text default null,
  p_artwork_prompt_version text default null,
  p_artwork_contract_version text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.resolved_spec_artwork_slots;
begin
  select * into v_slot
    from public.resolved_spec_artwork_slots
   where resolved_spec_id = p_resolved_spec_id and slot_id = p_slot_id
     for update;
  if not found then
    raise exception 'no such artwork slot on this resolved spec'
      using errcode = 'foreign_key_violation';
  end if;

  if v_slot.status = 'requested' then
    return 'already_requested';
  end if;

  -- Terminal means terminal. A settled slot being requested again is a caller-state bug, and
  -- returning a soft outcome for it would hide the bug behind a string.
  if v_slot.status in ('delivered', 'failed') then
    raise exception 'a settled artwork slot cannot be requested again'
      using errcode = 'insufficient_privilege';
  end if;

  update public.resolved_spec_artwork_slots
     set status = 'requested',
         provider = p_provider,
         model = p_model,
         artwork_prompt_version = p_artwork_prompt_version,
         artwork_contract_version = p_artwork_contract_version,
         requested_at = pg_catalog.now()
   where id = v_slot.id;
  return 'requested';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. `attach_artwork_asset` — the asset arrives.
--
-- **Idempotency.** The same asset delivered twice is one row in one state. A replay whose storage
-- reference matches the stored one returns `already_delivered` and touches nothing; a *different*
-- asset against a delivered slot raises, because silently keeping one and discarding the other
-- would be a last-write-wins race dressed as convergence, and silently overwriting would mutate a
-- terminal outcome. The trigger in section 3 refuses the update independently, so this function
-- is the friendly path rather than the enforcement.
--
-- **`has_alpha` has no default.** A caller that has not measured the asset cannot accidentally
-- record `false`, and cannot record `true` because the role asked for transparency.
--
-- `requested_at` is backfilled here when a driver attached without first marking the slot
-- requested, so the `requested_at` check holds and "delivered implies requested" stays true.
-- ---------------------------------------------------------------------------
create or replace function public.attach_artwork_asset(
  p_resolved_spec_id uuid,
  p_slot_id text,
  p_storage_bucket text,
  p_storage_path text,
  p_width_px integer,
  p_height_px integer,
  p_byte_size bigint,
  p_content_type text,
  p_has_alpha boolean,
  p_provider text default null,
  p_model text default null,
  p_artwork_prompt_version text default null,
  p_artwork_contract_version text default null,
  p_latency_ms integer default null,
  p_cost_estimate_usd numeric default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.resolved_spec_artwork_slots;
begin
  if p_has_alpha is null then
    raise exception 'has_alpha must be measured from the asset, not left unknown'
      using errcode = 'not_null_violation';
  end if;

  select * into v_slot
    from public.resolved_spec_artwork_slots
   where resolved_spec_id = p_resolved_spec_id and slot_id = p_slot_id
     for update;
  if not found then
    raise exception 'no such artwork slot on this resolved spec'
      using errcode = 'foreign_key_violation';
  end if;

  if v_slot.status = 'delivered' then
    if v_slot.storage_bucket is not distinct from p_storage_bucket
       and v_slot.storage_path is not distinct from p_storage_path then
      return 'already_delivered';
    end if;
    raise exception 'a delivered artwork slot already holds a different asset'
      using errcode = 'unique_violation';
  end if;

  if v_slot.status = 'failed' then
    raise exception 'a terminally failed artwork slot cannot accept an asset'
      using errcode = 'insufficient_privilege';
  end if;

  update public.resolved_spec_artwork_slots
     set status = 'delivered',
         storage_bucket = p_storage_bucket,
         storage_path = p_storage_path,
         width_px = p_width_px,
         height_px = p_height_px,
         byte_size = p_byte_size,
         content_type = p_content_type,
         has_alpha = p_has_alpha,
         provider = coalesce(p_provider, v_slot.provider),
         model = coalesce(p_model, v_slot.model),
         artwork_prompt_version =
           coalesce(p_artwork_prompt_version, v_slot.artwork_prompt_version),
         artwork_contract_version =
           coalesce(p_artwork_contract_version, v_slot.artwork_contract_version),
         latency_ms = coalesce(p_latency_ms, v_slot.latency_ms),
         cost_estimate_usd = coalesce(p_cost_estimate_usd, v_slot.cost_estimate_usd),
         requested_at = coalesce(v_slot.requested_at, pg_catalog.now()),
         settled_at = pg_catalog.now()
   where id = v_slot.id;
  return 'attached';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. `fail_artwork_slot` — a terminal failure is a recorded outcome.
--
-- Not a missing row, and not a row left in `requested` forever. The distinction matters because
-- `reserved` and "the request failed" render identically and mean entirely different things to
-- anyone asking why this page has no artwork.
--
-- The first classification stands: a replay returns `already_failed` and does not reclassify.
-- Failing a delivered slot raises — an asset exists, and an outcome cannot be un-happened.
-- ---------------------------------------------------------------------------
create or replace function public.fail_artwork_slot(
  p_resolved_spec_id uuid,
  p_slot_id text,
  p_failure_kind text,
  p_failure_detail text default null,
  p_provider text default null,
  p_model text default null,
  p_artwork_prompt_version text default null,
  p_artwork_contract_version text default null,
  p_latency_ms integer default null,
  p_cost_estimate_usd numeric default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.resolved_spec_artwork_slots;
begin
  select * into v_slot
    from public.resolved_spec_artwork_slots
   where resolved_spec_id = p_resolved_spec_id and slot_id = p_slot_id
     for update;
  if not found then
    raise exception 'no such artwork slot on this resolved spec'
      using errcode = 'foreign_key_violation';
  end if;

  if v_slot.status = 'failed' then
    return 'already_failed';
  end if;

  if v_slot.status = 'delivered' then
    raise exception 'a delivered artwork slot cannot be recorded as failed'
      using errcode = 'insufficient_privilege';
  end if;

  update public.resolved_spec_artwork_slots
     set status = 'failed',
         failure_kind = p_failure_kind,
         failure_detail = p_failure_detail,
         provider = coalesce(p_provider, v_slot.provider),
         model = coalesce(p_model, v_slot.model),
         artwork_prompt_version =
           coalesce(p_artwork_prompt_version, v_slot.artwork_prompt_version),
         artwork_contract_version =
           coalesce(p_artwork_contract_version, v_slot.artwork_contract_version),
         latency_ms = coalesce(p_latency_ms, v_slot.latency_ms),
         cost_estimate_usd = coalesce(p_cost_estimate_usd, v_slot.cost_estimate_usd),
         requested_at = coalesce(v_slot.requested_at, pg_catalog.now()),
         settled_at = pg_catalog.now()
   where id = v_slot.id;
  return 'failed';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS — member-readable by column, server-written.
--
-- The table's creative payload is the member's own generated design data, exactly like
-- `design_concepts.design_intent`. But it also carries provider, model, prompt-version, latency
-- and cost columns, and `20260916210000` (T12) section 2 set the standing rule for those:
-- *everything describing how the call was made is server-only*, because PostgREST is reachable
-- from a browser with the member's own session. `20260917210000` applied the same column-level
-- grant to `design_intent_artifacts`. This table gets it too.
--
-- `failure_detail` is withheld with them. `failure_kind` is the product-visible classification —
-- "no artwork arrived, and why, in our vocabulary" — while the detail is provider diagnostics and
-- may quote a provider's own message verbatim.
--
-- Writes are server-only in both directions: end users get no insert, update or delete, and the
-- three functions above are `security definer` with execute revoked from `public`, `anon` and
-- `authenticated`.
-- ---------------------------------------------------------------------------
alter table public.resolved_spec_artwork_slots enable row level security;

create policy resolved_spec_artwork_slots_select_member on public.resolved_spec_artwork_slots
  for select to authenticated using (
    exists (
      select 1
        from public.resolved_design_specs s
        join public.design_concepts c on c.id = s.concept_id
       where s.id = resolved_spec_id and public.is_event_member(c.event_id)
    )
  );

revoke all on table public.resolved_spec_artwork_slots from anon, authenticated;

grant select (
  id, resolved_spec_id, slot_id, role, extent,
  mobile_width_px, mobile_height_px, desktop_width_px, desktop_height_px,
  visual_art_intent, visual_art_intent_version, status,
  storage_bucket, storage_path, width_px, height_px, byte_size, content_type, has_alpha,
  failure_kind, created_at, requested_at, settled_at
) on table public.resolved_spec_artwork_slots to authenticated;

revoke all on function public.request_artwork_slot(uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.attach_artwork_asset(
  uuid, text, text, text, integer, integer, bigint, text, boolean,
  text, text, text, text, integer, numeric
) from public, anon, authenticated;
revoke all on function public.fail_artwork_slot(
  uuid, text, text, text, text, text, text, text, integer, numeric
) from public, anon, authenticated;
