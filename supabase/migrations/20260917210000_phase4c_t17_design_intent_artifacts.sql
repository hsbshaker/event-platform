-- ---------------------------------------------------------------------------
-- Phase 4C, T17 — the immutable DesignIntent artifact, and the lineage a concept cannot fake.
--
-- docs/phase-4b-plan.md §G.2 (the artifact and its column list), §G.3 (its relationship to
-- `design_concepts`, all four points), §G.4 (the DesignIntent attribution invariant), §G.1 (why
-- the nullable-then-fill lifecycle was withdrawn); spec.md §9.4, §31 — DesignIntent, composition
-- and compiler (persistence); CLAUDE.md §2 ("generated design data is immutable; nothing
-- persisted is mutated; a change produces a new row").
--
-- **What is deliberately not here.** T17 is persistence only. Nothing below knows the shape of a
-- `DesignIntent`, and nothing below makes or prepares a model call: the contract, the schema, the
-- runtime narrowing and the validator are T18's, and the prompt is T21's. The payload columns are
-- `jsonb` with no key checks for exactly that reason — a shape assertion here would be T18's
-- contract written twice, in the one place a correction has to ship as a whole new migration.
--
-- The single idea: **an artifact is evidence, and a concept may not claim a lineage it does not
-- have.** §G.4 requires every persisted DesignIntent to name exactly one
-- `(identity_revision_id, planner_version, assignment, design_intent_prompt_version,
-- design_intent_schema_version, design_intent_input_assembly_version, model, provider
-- configuration)` tuple. That is only true if the row can never be rewritten, and only *stays*
-- true through composition if the concept that later points at the artifact is forced to agree
-- with it on every column they both carry (§G.3 point 3). Both halves are enforced here, by the
-- database, rather than asserted in review.
--
-- **RLS posture: member-readable by column, server-written.** `design_concepts`,
-- `resolved_design_specs` and `event_identity_revisions` all enable RLS, carry one `select` policy
-- scoped by `is_event_member`, and revoke everything else from both end-user roles. This table is
-- the same kind of object: a generated artifact belonging to one event, whose creative payload
-- (`design_intent`, `directive`, `token_allotment`) a member can already read on `design_concepts`
-- once composition lands. It is *not* the server-only pattern — `generation_runs`,
-- `generation_batches`, `event_identity_call_claims` and `rate_limits` are server-only because
-- they carry backend generation and spend counters, which `spec.md §32 #41` forbids exposing, and
-- this table carries no counter: no token counts, no cost, no latency, no attempt ordinal, no
-- failure tally.
--
-- But the grant is **column-level, not table-wide** (section 6). `20260916210000` (T12) section 2
-- revoked the table-wide member SELECT on `event_identity_revisions` and replaced it with a column
-- list that deliberately withholds `provider`, `model`, `provider_config`, `provider_request_id`
-- and `generation_run_id`, on the rule "everything describing *how the call was made* is
-- server-only". This table carries those same five columns, and PostgREST is reachable from a
-- browser with the member's own session — so a table-wide grant here would reopen that exact door
-- one migration after it was closed.
--
-- **Naming and typing where canon names a concept but not a column.** §G.2's "provider
-- configuration" is spelled here as `provider` + `model` + `provider_config`, byte-identically to
-- `event_identity_revisions`, so the two evidence tables answer "which provider produced this"
-- in the same shape. `planner_version`, `round` and `concept_index` copy `generation_batches`'
-- spellings, checks and types exactly. The planner columns are `not null` because this table is
-- new and every row in it is, by construction, the output of a planned sibling: unlike
-- `generation_runs.planner_version`, there is no pre-existing row that was never planned, so a
-- nullable column here would only ever mean "the writer forgot".
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. `design_intent_artifacts` (§G.2) — append-only, one row per successfully generated sibling,
--    written the moment that DesignIntent completes and validates.
-- ---------------------------------------------------------------------------
create table public.design_intent_artifacts (
  id uuid primary key default gen_random_uuid(),

  -- ---- identity -----------------------------------------------------------
  event_id uuid not null references public.events (id) on delete cascade,

  -- The batch this sibling belongs to. `restrict`, not `cascade`: the artifact is evidence and a
  -- batch row is a working lifecycle record, so reworking or pruning a batch must never take the
  -- evidence with it. An event deletion still cascades cleanly, because the artifact is removed
  -- through its own `event_id` cascade in the same statement — `tests/db/phase4c-t17.test.ts`
  -- proves that rather than assuming it.
  batch_id uuid not null references public.generation_batches (id) on delete restrict,

  -- Which identity produced this. `restrict` for §G.4's reason, and the same choice
  -- `generation_batches.identity_revision_id` makes one level up: "which identity produced this"
  -- must always have exactly one answer, and both a null and a deletion would erase it.
  identity_revision_id uuid not null references public.event_identity_revisions (id)
    on delete restrict,

  -- The planner's index, 0–2, and the event's generation round. Spelled as `generation_batches`
  -- and `design_concepts` spell them, because the equality check in section 4 compares them.
  concept_index integer not null check (concept_index between 0 and 2),
  round integer not null check (round >= 1),

  -- ---- planner ------------------------------------------------------------
  -- Replay identity is (identity_revision_id, planner_version) — `docs/phase-4b-plan.md §D`.
  planner_version text not null,

  -- The sibling assignment: family, tonal direction, typography category, hierarchy (§G.2). Part
  -- of §G.4's tuple, so it is recorded on the artifact itself and not only on the batch's sibling
  -- row, which is a working record of a lifecycle rather than evidence of a call.
  assignment jsonb not null,

  -- Recorded for lineage and **not** inputs to this call — §G.4 is explicit that the directive and
  -- the token allotment are composition's. They are here because §G.2 puts them here and because
  -- `design_concepts` carries them too, which is what makes them part of §G.3's equality check.
  directive jsonb not null,
  token_allotment jsonb not null,

  -- ---- model --------------------------------------------------------------
  design_intent_prompt_version text not null,
  design_intent_schema_version text not null,
  -- §G.2: the DesignIntent envelope carries the identity and the assignment, and is exposed to
  -- exactly the drift §B.3 refuses to tolerate for EventIdentity — so it is versioned on the same
  -- terms, `not null` with an explicit value, never "if it gains one". As on
  -- `event_identity_revisions.input_assembly_version`, `not null` keeps "produced before this was
  -- recorded" and "the writer forgot" from being the same value.
  design_intent_input_assembly_version text not null,

  provider text not null,
  model text not null,
  provider_config jsonb,
  provider_request_id text,

  -- **Deliberately not a foreign key, and not a referential action of any kind (§G.2).**
  --
  -- `on delete set null` against a table whose protect trigger refuses every UPDATE is a
  -- contradiction the database resolves at the worst moment: pruning a telemetry row makes the
  -- referential-integrity system issue `UPDATE … SET generation_run_id = NULL` on the immutable
  -- row, the trigger refuses it, and the prune fails with "artifacts are immutable". Phase 4B hit
  -- exactly this on `event_identity_revisions` and settled it by dropping the referential action.
  -- `on delete restrict` is not the alternative: it makes telemetry unprunable instead.
  --
  -- A plain uuid can dangle once the run is pruned, exactly as `provider_request_id` can, and that
  -- is the honest record: this artifact came from that run, whether or not the run's telemetry
  -- still exists. **The same rule applies to any column added to this table later.**
  generation_run_id uuid,

  -- ---- payload ------------------------------------------------------------
  -- The validated output. Immutable, by the trigger in section 3.
  design_intent jsonb not null,

  -- §G.2: `presentation` is persisted here rather than waiting for `design_concepts`, which does
  -- not exist until composition. Canon names its two keys, so the check names them too — and only
  -- them. `design_concepts.name` and `.description` are `text not null`, so a presentation object
  -- missing either would produce a concept the database could not describe.
  --
  -- `coalesce(…, false)` is load-bearing, not defensive noise: a missing key makes `->` return SQL
  -- NULL, `jsonb_typeof(NULL)` is NULL, and a CHECK that evaluates to NULL **passes**. Without the
  -- coalesce this constraint would admit `{}` and `{"name":"…"}` while looking as though it did not.
  presentation jsonb not null
    constraint design_intent_artifacts_presentation_shape check (
      coalesce(
        jsonb_typeof(presentation -> 'name') = 'string'
        and jsonb_typeof(presentation -> 'description') = 'string'
        and length(presentation ->> 'name') > 0
        and length(presentation ->> 'description') > 0,
        false
      )
    ),

  created_at timestamptz not null default now(),

  -- §G.2. Before composition a sibling *is* `(batch_id, concept_index)` (§G.3 point 4), so this is
  -- that identity, and it is what makes "one row per successfully generated sibling" a fact rather
  -- than a convention.
  constraint design_intent_artifacts_batch_index_uniq unique (batch_id, concept_index)
);

create index design_intent_artifacts_event_idx
  on public.design_intent_artifacts (event_id, round desc, concept_index);

create index design_intent_artifacts_identity_revision_idx
  on public.design_intent_artifacts (identity_revision_id);

-- ---------------------------------------------------------------------------
-- 2. The artifact agrees with its own batch.
--
-- `event_id`, `round` and `identity_revision_id` are all recorded on the artifact by §G.2 and all
-- three are also carried by `generation_batches`. §G.3 point 3 settles the same question one level
-- down and settles it exhaustively: a row may not claim one lineage while pointing at another, and
-- an enumeration that let a shared column drift is a stale-list defect. The argument does not get
-- weaker one table up, so it is applied here too.
--
-- Without this, `unique (batch_id, concept_index)` would be the only uniqueness in play and an
-- artifact could sit at `(round 2, index 0)` inside a batch planned for round 1 — or name a
-- different event entirely. With it, the batch's own `unique (event_id, round)` makes
-- `(event_id, round, concept_index)` unique transitively, which is `design_concepts`' key.
-- ---------------------------------------------------------------------------
create or replace function public.validate_design_intent_artifact()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  -- A record of the three columns this trigger validates against, not the whole row. `select *`
  -- into a `%rowtype` demands SELECT on **every** column of `generation_batches`, which is the
  -- coupling `20260916210000` section 3 had to unpick after section 2 narrowed a grant — see the
  -- note on `validate_design_concept_artifact()` below. This function is not `security definer`
  -- either, so it reads only what it checks.
  b record;
begin
  select gb.event_id, gb.round, gb.identity_revision_id into b
    from public.generation_batches gb where gb.id = new.batch_id;
  if not found then
    raise exception 'design intent artifact names a batch that does not exist'
      using errcode = 'foreign_key_violation';
  end if;
  if b.event_id is distinct from new.event_id
     or b.round is distinct from new.round
     or b.identity_revision_id is distinct from new.identity_revision_id
  then
    raise exception
      'a design intent artifact must agree with its batch about the event, the round and the '
      'identity revision it was planned from'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger design_intent_artifacts_validate
  before insert on public.design_intent_artifacts
  for each row execute function public.validate_design_intent_artifact();

-- ---------------------------------------------------------------------------
-- 3. Every UPDATE is refused (§G.2), for every role.
--
-- `reject_update()` is the phase-1 function `resolved_design_specs` already uses, and it is the
-- right one here: it raises unconditionally, with no column list that can fall out of date and no
-- carve-out to reason about. The `event_identity_revisions` variant additionally carves out the
-- DELETE that arrives inside an event's cascade — this table needs no equivalent, because its
-- trigger is scoped to UPDATE and DELETE is therefore never refused here at all. §G.2 asks for
-- exactly that: "a protect trigger refusing every UPDATE".
-- ---------------------------------------------------------------------------
create trigger design_intent_artifacts_immutable
  before update on public.design_intent_artifacts
  for each row execute function public.reject_update();

-- ---------------------------------------------------------------------------
-- 4. `design_concepts.design_intent_artifact_id` (§G.3 point 2), and the equality check
--    (§G.3 point 3).
--
-- `not null`, because a concept created from 4C onward is always composed from an artifact. §G.3
-- point 2 records that the table has never been written in production — Phase 4 has not run — so
-- there is nothing to backfill. That was checked rather than assumed at implementation time, and
-- `add column … not null` with no default is itself the standing check: against a non-empty table
-- this statement fails outright (SQLSTATE 23502) instead of inventing a lineage for a row that
-- never had one.
--
-- `restrict`, for the reason the column exists: the artifact is the origin of record for the
-- concept's denormalised copy, and a deletion that left the concept behind would leave the copy
-- with nothing to have been copied from. An event deletion still cascades, for the same reason as
-- `batch_id` above.
-- ---------------------------------------------------------------------------
alter table public.design_concepts
  add column design_intent_artifact_id uuid not null
    references public.design_intent_artifacts (id) on delete restrict;

create index design_concepts_design_intent_artifact_idx
  on public.design_concepts (design_intent_artifact_id);

-- §G.3 point 3, and the enumeration is canon's, exhaustively.
--
-- The eight columns below are precisely the columns `design_concepts` and `design_intent_artifacts`
-- both carry, checked against the live schema rather than copied from memory. `name` and
-- `description` are deliberately not among them: the artifact holds them inside `presentation`,
-- not as columns, and §G.3's enumeration is explicit that it is exhaustive.
--
-- **Two copies of the same immutable values are not two sources of truth.** Neither side can be
-- updated — `reject_update()` on the artifact, `protect_design_concept()` on the concept, with
-- `design_intent_artifact_id` joining its list in section 5 — so equality checked once at the
-- boundary holds for the life of both rows.
--
-- Payload-only equality would not be enough, which is the whole point of the enumeration: it would
-- let a concept claim schema `v5` while its artifact records `v4`, or sit at `(round 2, index 0)`
-- pointing at an artifact from `(round 1, index 2)`, either of which makes §G.4's DesignIntent
-- attribution invariant false by the concept path.
create or replace function public.validate_design_concept_artifact()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  -- A record of exactly the eight columns this trigger compares, not the whole row — and the
  -- reason is `20260916210000` (T12) section 3, which is a trap this function would otherwise walk
  -- straight into.
  --
  -- `validate_clarification_answer` ran `select * into rev` against a `%rowtype`. That demands
  -- SELECT on **every** column of the table, and the function is deliberately not
  -- `security definer` — so the moment T12 section 2 narrowed the member's grant on
  -- `event_identity_revisions` to a column list, every honest co-host answer would have been
  -- refused with `42501`. Section 6 below narrows this table's member grant the same way, so the
  -- same `select *` here would bind this trigger to columns a member may not read.
  --
  -- Today no end-user role can reach this trigger at all: `20260912000000` revokes INSERT on
  -- `design_concepts` from `anon` and `authenticated`, so concepts are written by server code
  -- only, and the trap is latent rather than live. It is closed anyway, because "reading only what
  -- it checks is also the narrower thing to have been doing" (T12 section 3) and because a later
  -- migration that grants a member INSERT should not have to rediscover this.
  a record;
  mismatched text[] := '{}';
begin
  select dia.design_intent,
         dia.event_id,
         dia.round,
         dia.concept_index,
         dia.design_intent_prompt_version,
         dia.design_intent_schema_version,
         dia.directive,
         dia.token_allotment
    into a
    from public.design_intent_artifacts dia
    where dia.id = new.design_intent_artifact_id;
  if not found then
    raise exception 'design concept names a design intent artifact that does not exist'
      using errcode = 'foreign_key_violation';
  end if;

  if a.design_intent is distinct from new.design_intent then
    mismatched := pg_catalog.array_append(mismatched, 'design_intent');
  end if;
  if a.event_id is distinct from new.event_id then
    mismatched := pg_catalog.array_append(mismatched, 'event_id');
  end if;
  if a.round is distinct from new.round then
    mismatched := pg_catalog.array_append(mismatched, 'round');
  end if;
  if a.concept_index is distinct from new.concept_index then
    mismatched := pg_catalog.array_append(mismatched, 'concept_index');
  end if;
  if a.design_intent_prompt_version is distinct from new.design_intent_prompt_version then
    mismatched := pg_catalog.array_append(mismatched, 'design_intent_prompt_version');
  end if;
  if a.design_intent_schema_version is distinct from new.design_intent_schema_version then
    mismatched := pg_catalog.array_append(mismatched, 'design_intent_schema_version');
  end if;
  if a.directive is distinct from new.directive then
    mismatched := pg_catalog.array_append(mismatched, 'directive');
  end if;
  if a.token_allotment is distinct from new.token_allotment then
    mismatched := pg_catalog.array_append(mismatched, 'token_allotment');
  end if;

  if array_length(mismatched, 1) is not null then
    raise exception
      'a design concept must agree with its design intent artifact on every column they both '
      'carry; these disagree: %', array_to_string(mismatched, ', ')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger design_concepts_validate_artifact
  before insert on public.design_concepts
  for each row execute function public.validate_design_concept_artifact();

-- ---------------------------------------------------------------------------
-- 5. `design_intent_artifact_id` joins `protect_design_concept()`'s immutability list
--    (§G.3 point 2).
--
-- The trigger raises only for the columns it enumerates, so an unlisted column is the one
-- generated-design column an UPDATE may change — and it would be the column carrying the lineage.
-- A concept could be silently re-pointed at a different sibling's artifact after insert, which is
-- exactly what §G.3 point 4's one-direction lineage exists to prevent, and it would make the
-- equality check above a one-time formality instead of a standing invariant.
--
-- Shipped as a forward `create or replace` of the phase-1 body rather than an edit to
-- `20260912000000_phase1_core.sql`: that id has already been recorded by every environment, so
-- editing it there would change nothing in those databases while silently desynchronising the
-- repository from them (`CLAUDE.md §13.2`). The body below is phase-1's, with one line added and
-- nothing removed — `design_intent` stays enumerated and stays `not null`, because §G.3 point 3
-- keeps the inline snapshot deliberately and relaxing it to avoid duplication would weaken the
-- invariant the decision exists to preserve.
-- ---------------------------------------------------------------------------
create or replace function public.protect_design_concept()
returns trigger
language plpgsql
as $$
begin
  if new.event_id is distinct from old.event_id
     or new.round is distinct from old.round
     or new.concept_index is distinct from old.concept_index
     or new.name is distinct from old.name
     or new.description is distinct from old.description
     or new.design_intent is distinct from old.design_intent
     or new.design_intent_artifact_id is distinct from old.design_intent_artifact_id
     or new.composition_raw is distinct from old.composition_raw
     or new.composition is distinct from old.composition
     or new.composition_hash is distinct from old.composition_hash
     or new.capabilities is distinct from old.capabilities
     or new.directive is distinct from old.directive
     or new.token_allotment is distinct from old.token_allotment
     or new.fallback is distinct from old.fallback
     or new.design_intent_prompt_version is distinct from old.design_intent_prompt_version
     or new.design_intent_schema_version is distinct from old.design_intent_schema_version
     or new.composition_prompt_version is distinct from old.composition_prompt_version
     or new.composition_schema_version is distinct from old.composition_schema_version
     or new.primitive_set_version is distinct from old.primitive_set_version
     or new.compiler_version is distinct from old.compiler_version
     or new.created_at is distinct from old.created_at then
    raise exception 'generated design data is immutable'
      using errcode = 'insufficient_privilege';
  end if;

  if new.active_resolved_spec_id is not null
     and not exists (
       select 1 from public.resolved_design_specs s
       where s.id = new.active_resolved_spec_id and s.concept_id = new.id
     ) then
    raise exception 'active_resolved_spec_id must belong to this concept'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS — member-readable **by column**, server-written.
--
-- Members read their event's artifacts: this is their own generated design data, and the
-- `design_intent`, `directive` and `token_allotment` a member can read here are the same values
-- they can already read on `design_concepts` once composition lands. Nobody writes as an end user;
-- artifacts are written by server code alongside the provider call.
--
-- **The grant is column-level, and that is the whole point.** A table-wide
-- `grant select … to authenticated` would reopen, one migration later, precisely the door
-- `20260916210000` (T12) section 2 closed: PostgREST is reachable from a browser with the member's
-- own session, so every column of this table would be readable by any event member. This table
-- carries the same five provider columns T12 withheld on `event_identity_revisions` — `provider`,
-- `model`, `provider_config` (which carries `reasoningEffort`, `serviceTier` and
-- `costProfileVersion`), `provider_request_id` and the internal `generation_run_id` — and T12's
-- rule is stated generally: "Everything describing *how the call was made* is server-only, like
-- the claims table beside it." The same rule, the same columns, so the same treatment.
--
-- What a member keeps is what a member-facing read can legitimately want: the creative output
-- (`design_intent`, `presentation`), the planner's creative constraints (`assignment`,
-- `directive`, `token_allotment`), the identity and lineage columns, and the version columns that
-- say which contract produced it. `planner_version` is on the readable side with the other version
-- columns and with `assignment`, whose provenance it is — it names a deterministic in-repo
-- algorithm, not a provider call, and T12 likewise kept `prompt_version` and `schema_version`
-- readable beside `result`.
--
-- `revoke … on table` first, exactly as T12 does: a column grant does not shrink a table-wide one,
-- so leaving a table grant in place would make the column list decorative. The `revoke all` above
-- it is the phase-1 pattern for a member-scoped table — the narrower
-- `revoke insert, update, delete` would leave `anon` holding SELECT by Supabase's default
-- privileges, closed by RLS today since no policy names `anon`, but defence in depth is the point.
-- ---------------------------------------------------------------------------
alter table public.design_intent_artifacts enable row level security;

create policy design_intent_artifacts_select_member on public.design_intent_artifacts
  for select to authenticated using (public.is_event_member(event_id));

revoke all on table public.design_intent_artifacts from anon, authenticated;
revoke select on table public.design_intent_artifacts from authenticated;
grant select (
  id,
  event_id,
  batch_id,
  identity_revision_id,
  concept_index,
  round,
  planner_version,
  assignment,
  directive,
  token_allotment,
  design_intent_prompt_version,
  design_intent_schema_version,
  design_intent_input_assembly_version,
  design_intent,
  presentation,
  created_at
) on table public.design_intent_artifacts to authenticated;
