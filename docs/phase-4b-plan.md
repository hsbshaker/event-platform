# Phase 4B and 4C plan — clarification lifecycle, then planner and DesignIntent × 3

**Status:** plan only, revised after review. No production code, prompt, schema, migration or corpus
exists for any of it.
**Written at:** `7c84ae67b4828e4b5c0638d8b231feddfd301a2b`, after Phase 4A closed **GO**
(`model-contracts.md §4.6`).

This document orders work. It defines no requirements: `spec.md` is the authority, and every
section cites the canonical rule it implements rather than restating it as new. Where a canonical
rule was missing, the decision taken is recorded in **§Resolved decisions** with its consequence.

---

## 0. Scope and phase boundaries — **resolved**

The canonical letters in `development-plan.md` stand. **They are not renamed and later letters do
not shift.**

| | Canonical question | Scope | Gate |
| --- | --- | --- | --- |
| **4B** | Does it know when it needs to ask something? | clarification lifecycle, answer provenance, the minimal clarification surface | **§4B gate** below. Must pass independently |
| **4C** | Can it invent three excellent, genuinely different directions from one identity? | deterministic sibling planner, `DesignIntent × 3`, and its creative evidence | **§4C gate** below |

The two may be built as one continuous workstream. They are **judged separately**. **Phase 4C does
not begin until Phase 4B has independently passed its gate**, because 4B carries no creative
evidence requirement and 4C is nothing but one — a single approval spanning both would let the
first carry the second.

**Out of scope for both:** CompositionTree generation, the compiler, the renderer, generated
imagery (`spec.md §7.6a`), the full generation-progress surface (`§7.10`), concept cards and the
full-site reveal. Those are 4D–4F. 4C ends at *three persisted immutable DesignIntent artifacts plus
the evidence that they are three genuinely different creative worlds*, which is answerable without
rendering anything.

---

# Part I — Phase 4B

## A. EventIdentity orchestration lifecycle

Binding source: `spec.md §7.6b` (provisional identity), `§7.7` (the consumption gate),
`model-contracts.md §4`. Phase 4A built and evidenced the *call*; none of this lifecycle exists.

### A.1 The two states, and one semantic definition

An `EventIdentity` result is **authoritative** when `clarification.questions` contains no question
with `kind: "boundary"` — zero questions, or only Route A creative questions. It is **provisional**
when it contains one (at most one per response, asked alone, `§7.6b #1b`).

`spec.md §7.6b`: *"No output field marks this — the presence of a boundary-kind question is the
machine-readable signal."* The rule therefore has exactly **two** implementations, one per runtime,
and they are held equal by test rather than by care:

| Runtime | Implementation | Role |
| --- | --- | --- |
| TypeScript | `isProvisional(result)` in `src/lib/ai/event-identity/lifecycle.ts` (new, pure, no I/O) | the canonical semantic for ordinary application code |
| SQL | `public.identity_is_provisional(result jsonb) returns boolean`, `immutable` | the authority at the persistence boundary (§A.3) |

`assertAuthoritative(result)` returns a branded `AuthoritativeIdentity`. **The planner, the
DesignIntent call and every downstream creative stage accept only the branded type**, so "a
provisional identity must not be consumed" is a compile error rather than a review convention —
the same problem the raw-prompt boundary solves with a test, solved here by the type system, with a
test asserting the brand is never cast away.

**Parity is proven, not assumed.** A test evaluates both implementations over the same fixture set
and requires identical answers on every case: zero questions; one, two and three creative
questions; one boundary question; and — the cheap and honest part — **every response already
persisted in the four `v5` evidence journals**, read-only, which is 50 real provider outputs
including the one boundary question SC2-12 produced. If the two implementations ever disagree, that
test fails before either is trusted.

### A.2 Persistence — identity revisions

`event_identities` today is `event_id uuid primary key … updated_at`: **one mutable row per
event**. That cannot express a boundary round (which produces at least two results for one event)
and cannot support the attribution invariant in §G.

Phase 4B adds append-only identity **revisions**, one row per `generateEventIdentity` result:

- `event_id`, `revision` (monotonic per event), the full result envelope as `jsonb`;
- `prompt_version`, `schema_version`, **`input_assembly_version`** (§B.3), `model`, provider
  configuration, `provider_request_id`, `generation_run_id`;
- `is_provisional` — **a generated column, not a supplied one** (§A.3);
- no `updated_at`, and a protect trigger refusing every `UPDATE` to the result or the version set,
  in the style of `protect_design_concept()`.

A pointer on the event names the **authoritative** revision. Whether the new table supersedes
`event_identities` or replaces it is an implementation call for the task packet; the constraint is
that no row is ever mutated and the old shape does not survive as a second source of truth.

### A.3 The provisional-state invariant — **the caller cannot lie**

The earlier draft had application code derive `is_provisional` and store it. That duplicates a
safety-critical truth in a place a buggy or malicious caller controls, and the whole point of the
flag is that nothing downstream may consume a provisional identity. Revised:

```sql
-- Pure JSON inspection, so it qualifies as IMMUTABLE and can back a generated column.
create function public.identity_is_provisional(result jsonb) returns boolean
  language sql immutable
as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(result -> 'clarification' -> 'questions', '[]'::jsonb)) q
    where q ->> 'kind' = 'boundary'
  );
$$;
```

Three properties follow, and together they are the invariant:

1. **`is_provisional` is `generated always as (public.identity_is_provisional(result)) stored`.**
   A caller cannot supply it at all — an `INSERT` naming the column is rejected by Postgres. It is a
   convenience for reads and indexes, derived by definition, never independently authoritative.
2. **The authoritative-pointer trigger reads the JSON, not the column.** Setting the event's
   authoritative pointer re-derives from the referenced revision's `result` via the same function
   and raises if it is provisional. So even a future migration that dropped or corrupted the column
   could not let a boundary-bearing identity become authoritative.
3. **The pointer must reference a revision of the same event.** Modelled on
   `validate_active_concept()`.

**A caveat recorded rather than discovered later.** Changing `identity_is_provisional` re-derives
every historical row, because a stored generated column is recomputed on rewrite and the trigger
reads the function live. The derivation rule is therefore versioned data semantics, not a
refactor: changing it requires the same deliberation as a schema version bump, and the plan states
that here so nobody treats it as a tidy-up. The rule itself is fixed by `spec.md §7.6b` and is not
expected to change.

### A.4 The loop

1. Identity runs. Result persisted as a new revision. `is_provisional` is computed by the database.
2. **Provisional** → the event enters `awaiting_clarification`. No planner, no DesignIntent, no
   batch, and nothing started optimistically (§I). The question is surfaced.
3. The host answers. The answer is persisted (§B), **not** merged into the prompt.
4. Identity runs **again**: original prompt unchanged, plus the answer as current host input. New
   revision.
5. Authoritative → it becomes the event's authoritative identity and generation may proceed.
   Another boundary question → provisional in turn, loop repeats. `spec.md §7.6b`: **no lifetime
   cap** — *"a spent quota is not authority."* Round count is telemetry, never a limit that forces
   the system to proceed without authority.

---

## B. Clarification-answer provenance

Binding source: `development-plan.md` 4B obligation (c). This is the obligation most easily
satisfied badly, because appending the answer to `events.prompt` passes every test anyone would
think to write.

### B.1 The requirements as properties

| Requirement | What it forbids |
| --- | --- |
| distinct from the original description | concatenation into `prompt` |
| attributable to the host | storing it as system or model text |
| original description preserved unchanged | any mutation of `events.prompt` |
| takes precedence over conflicting earlier input | dropping it, or leaving precedence to position |
| available to EventIdentity on rerun | keeping it in request scope or UI state |
| not `redesignFeedback` | overloading a field whose semantics are post-concept |
| multiple rounds without losing provenance | one answer column the next round overwrites |
| **proves which question it answers** | relying on copied text alone |

### B.2 Binding an answer to the question it answers

An answer that merely *quotes* a question proves nothing: two revisions can ask the same question,
and copied text can be edited. The binding is a **stable locator plus database-enforced agreement**.

**Locator: `(identity_revision_id, question_index)`** — the ordinal in that revision's persisted
`clarification.questions` array. It is stable because the revision is immutable and its JSON array
order is fixed at insert. No new identifier is invented, and none is asked of the model.

`clarification_answers`, append-only, one row per answered question:

- `event_id`, `identity_revision_id`, `question_index`, `round`;
- `kind` (`creative` | `boundary`), and the question text and options **copied for readability**;
- the answer: `selected_option_label` and/or `free_text`, plus `is_defer`;
- `answered_at`, `answered_by` (a `profiles` id — owner or co-host).

A **BEFORE INSERT trigger** verifies, against the referenced revision's JSON, that:

1. the revision exists **and belongs to `event_id`** — an answer cannot be attached to another
   event's revision;
2. a question exists at `question_index`;
3. the stored `kind` equals that question's `kind`;
4. the copied question text and option labels equal that question's, exactly — so the readable copy
   can never drift from what was asked;
5. `is_defer` is consistent with the route: a `boundary` answer can never be a defer, because Route
   B offers no defer option (`spec.md §7.6b #4`), and a `creative` answer marked as a defer must
   name the question's one `isDefer` option.

Plus `unique (identity_revision_id, question_index)` — one answer per question — and a protect
trigger refusing `UPDATE` and `DELETE`, so the record is append-only in the database and not merely
by application habit.

This is deliberately **not** a conversation system: no thread, no roles, no arbitrary turns, no
free-form chat. It is a set of (question asked, answer given) rows, bounded by the rounds that
actually occurred.

### B.3 Input assembly, and its own version — **resolved**

The `v5` system prompt file does not change and **`event_identity_v5` remains the prompt version**.
But the *effective model input contract* does change the moment clarification answers appear in the
request, and hiding a behaviour change under an unchanged label is exactly the failure this project
has already paid for. So the assembly gets a version of its own:

```ts
// src/lib/ai/versions.ts
export const EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION = "event_identity_input_v1";
```

**What it identifies.** How the request envelope is built from the host's inputs: which channels
are present (original prompt, inspiration assets, inspiration summary where applicable,
clarification answers), how each is labelled to the model, in what order they appear, how
precedence between them is expressed, and how an answer is represented.

**Its values.**

| Value | Assembly |
| --- | --- |
| `event_identity_input_v1` | what Phase 4A shipped and evidenced: original prompt + inspiration assets. No clarification answers |
| `event_identity_input_v2` | adds clarification answers as labelled current host input with stated precedence. Introduced by **T4** |

**No backfill.** Existing persisted rows and every completed evidence artifact predate the column
and carry nothing. Absence means *"produced before this was recorded"*, on the same principle as
the eval journal's rule that a measurement nobody made is left absent rather than filled with a
zero. Canon says so rather than retrofitting a label onto finished evidence.

**When it bumps.** Any change to precedence, labelling, ordering or representation of clarification
answers; adding or removing an input channel; changing how the original prompt is delimited. It
does **not** bump for a prompt-file edit (that is the prompt version) or a schema change (that is
the schema version), and the three are independent.

**How it is enforced.** `input-assembly-drift.test.ts`, modelled on the existing
`schema-drift.test.ts`: a golden snapshot of the assembled envelope for a fixed set of fixture
inputs — no prompt, with answers, with inspiration, multi-round — checked in. Changing the assembly
changes the snapshot; the test refuses a changed snapshot unless
`EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION` changed in the same commit. **The version cannot drift from
the behaviour it names**, which is the property `event_identity_v5`'s history shows we need.

**Persistence.** `input_assembly_version` is stored on **every identity revision** (§A.2) and on
`generation_runs` for `operation = 'event_identity'`.

**Model-visible consequence.** T4 changes what the model sees, so it is model-visible work
requiring independent review, and it is validated by the pre-registered rerun-behaviour set (§3.9)
— not by reopening the `v5` sealed challenge, which is spent.

---

## C. Route A behaviour

Binding source: `spec.md §7.6b #4`, `§31 — Creation Mode`. Route A **never gates**.

| Situation | Behaviour |
| --- | --- |
| no answer supplied | generation proceeds on the identity as returned. The question stays open and answerable; never a blocker, never a retry trigger |
| host chooses the defer option | recorded as an answer with `is_defer: true`; generation proceeds. The defer is data — a host who defers everything is a signal worth having |
| concrete answer **before** the batch starts | persisted, and identity **reruns** with it as in §A.4, but without any block. The new revision becomes authoritative and the batch is planned from it |
| concrete answer **after** the batch has started | the in-flight batch is **not** cancelled, mutated or re-based. The answer is persisted against the revision that asked. The host is offered a new round — the existing `Try another direction` path (`spec.md §7.9`), not a new mechanism |

That last row is what protects idempotency. A batch is keyed to an identity revision (§G); an
answer produces a *new* revision; a new revision means a *new* batch if the host wants one. Nothing
rewrites a running batch's inputs, so "which identity produced this" always has exactly one answer.
One batch in flight per event (§H) means the late answer cannot start a second batch until the
first settles.

---

# Part II — Phase 4C

## D. Deterministic sibling planner

Binding source: `spec.md §7.7`, `event-renderer-system.md`, `CLAUDE.md §5.1`. Application code. It
**calls no model** and **never selects a library silhouette or recipe** — the Library Boundary
Invariant is a stop condition, not a guideline.

**Inputs** — from the **authoritative** identity only (branded type, §A.1): `compatibleFamilies`,
`compatibleTonalDirections`, `compatibleTypographyCategories`, and what `§7.7` needs for hierarchy.
Not the raw prompt (already test-enforced). Not `suppliedFacts` — the planner plans creative
separation; facts belong to content fit. `hostConstraints` pass through untouched and no directive
may contradict one; `creativeGuidance` is advisory (`model-contracts.md §4`) and may be carried as
guidance a sibling is free to reconsider, never converted into a constraint — asserted by test.

**Output** — per `spec.md §7.7`: a distinct compatible **family** where possible, then distinct
**tonal direction** where the brief allows, then distinct **typography category** and
**hierarchy**; a **structural directive** (one value per independent dimension — opening object,
primary structure, date treatment, motif use, hero surface, details folded or own, RSVP intro
placement, registry layout — assembled into one sentence, siblings differing at least on structure
and opening); and an **allotment of attractive tokens**, each to at most one sibling in three.
`§7.7`'s negative holds: *"never the same intent with different seeds"*, and under an explicit tone
constraint diversity falls back to family, directive, typography and hierarchy rather than forcing
dark/mid.

**Determinism, ordering, versioning, replay.** A pure function — no clock, no RNG, no I/O — where
any tie-break that would want randomness uses a seed derived from the identity revision id, so the
same revision always plans the same three siblings. Sibling index 0/1/2 is the planner's and is the
key everything downstream uses. **`PLANNER_VERSION`** joins `src/lib/ai/versions.ts`, is recorded on
every run and artifact, and bumps whenever diversity behaviour changes; historical batches are never
re-planned. Replay = identity revision + planner version. Telemetry records which dimensions
actually separated the siblings and which fell back — a batch separated only by typography is the
failure mode worth seeing before a human does.

`proof-b/planner.js` is the behavioural reference; porting means porting its behaviour.

## E. DesignIntent × 3

Binding source: `spec.md §7.8`, `model-contracts.md §5`. The contract exists on paper at
`design_intent_v4` and has **never been exercised against a provider**.

**The quality requirement.** Three schema-valid objects is the floor. The three must be faithful to
the *same* authoritative identity and be materially distinct **creative worlds** — not palette or
font swaps — such that the compositions they later produce could not be mistaken for one another;
grounded in *this* event rather than in premium taste generally; every `hostConstraint` respected by
all three; `creativeGuidance` free to be reconsidered, evolved or overridden by any of them. The
four excellence-watch items from `model-contracts.md §4.6` are watched here first, because this is
the first stage where "reusable finishing language" and "a preference for polish and emotional
moderation" become visible as three outputs that converge.

**Blind and parallel — resolved.** Each call receives the same authoritative identity (including
`inspirationSummary`) plus **only its own** assignment, directive and token allotment, and the
event's capabilities and content profile. It never receives the raw host prompt (`spec.md §7.5`,
`§32 #12`), raw inspiration assets (§F), **another sibling's output**, or any library recipe or
silhouette identifier (`CLAUDE.md §5.1`). The three calls run in parallel (`spec.md §7.10 #3`).
**No convergence-triggered re-prompt exists in the first implementation.** Convergence and
distinctness are first-class telemetry, checked mechanically where honest and judged qualitatively
where not; if fresh evidence shows blind siblings converge despite planner separation, that is a
deliberate subsequent design and spec decision argued from data, not a mechanism added on suspicion.

**Schema responsibilities and invariants.** The schema owns shape and enum membership; the
application validator owns lengths, counts and cross-field rules (`model-contracts.md §3`).
Deterministic semantic invariants: `palette.dominant ∈ palette.colors`; 3–5 validated hex colours;
`typographyPairing` within the **assigned** category; `family` and `tonalDirection` equal to the
assignment; motifs from the curated set. Runtime narrowing restricts enums to the sibling's
assignment *before* the call, so an out-of-assignment value is impossible rather than repaired.
Repair policy is the canonical one (`model-contracts.md §8`): bounded transient retries, exactly one
repair retry for schema-invalid output; structural, coverage and diversity defects are repaired
deterministically or recorded, never re-prompted (`spec.md §32`). Prompt and schema versions bump
together — the `v5` lesson — and both are persisted per artifact.

**Diversity: what is checkable.** Deterministic (and therefore mechanical invariants, §3.2):
assignment conformance; pairwise palette separation above a floor in a perceptual space, not hex
equality; typography pairing distinctness; `composition` vector distinctness across `asymmetry`,
`hierarchy`, `rhythm`, `sectionContrast`, `ornament`; motif-set overlap below a ceiling; token
allotment respected. **Not deterministic, and no metric should pretend otherwise:** whether the
three are genuinely different creative worlds rather than three parameterisations of one. A batch
can pass every check above and still be one idea in three costumes — which is precisely why §3.7's
systemic veto exists.

## F. Inspiration handling — resolved from canon

`spec.md §7.5`, `§9.4` and `model-contracts.md §1`, `§6.1` settle it: **EventIdentity** receives the
raw prompt *and* the private inspiration assets and is the only stage that does; it emits
**`inspirationSummary`** inside the identity; **the planner and the DesignIntent call receive the
identity, therefore the summary, and never the raw assets or the raw prompt**. `§9.4`: *"Do not
re-send original raw inspiration for routine redesign after its summary is available."* Inspiration
uploads stay private model inputs and never become site imagery (`§32 #32`).

One additive guard: extend `raw-prompt-boundary.test.ts` so the DesignIntent call site is refused
raw inspiration bytes as well as raw prompt text — the same boundary, the other input.

## G. Persistence, attribution and the immutable DesignIntent artifact

### G.1 Why the earlier recommendation was wrong

The previous draft proposed relaxing `design_concepts` to nullable composition columns and filling
them in as composition arrived. That contradicts a **live trigger**: `protect_design_concept()`
raises `'generated design data is immutable'` on any `UPDATE` touching `design_intent`,
`composition_raw`, `composition`, `composition_hash`, `capabilities`, `directive`,
`token_allotment`, `fallback`, all six version columns or `created_at` — only
`active_resolved_spec_id` and `selected_at` may change. A nullable-then-fill lifecycle is exactly
the mutation that trigger exists to refuse. Withdrawn.

### G.2 The immutable artifact

Phase 4C adds **`design_intent_artifacts`** — append-only, one row per successfully generated
sibling, written the moment that DesignIntent completes and validates, never updated by any later
phase:

| | |
| --- | --- |
| identity | `id`, `event_id`, `batch_id`, `identity_revision_id`, `concept_index` (0–2), `round` |
| planner | `planner_version`, `assignment` (family, tone, typography category, hierarchy), `directive`, `token_allotment` |
| model | `design_intent_prompt_version`, `design_intent_schema_version`, `input_assembly_version` if the DesignIntent envelope gains one, `model`, provider configuration, `provider_request_id`, `generation_run_id` |
| payload | `design_intent` jsonb — the validated output, immutable |
| | `created_at`; `unique (batch_id, concept_index)`; a protect trigger refusing every `UPDATE` |

### G.3 Relationship to `design_concepts` — settled now, to avoid known migration debt

1. **4D inserts `design_concepts` only after composition exists.** It already cannot do otherwise;
   this makes the constraint intentional rather than incidental. A concept is a *composed* thing.
2. **`design_concepts` gains `design_intent_artifact_id`**, a `NOT NULL` FK for concepts created
   from 4C onward. The table has never been written in production — Phase 4 has not run — so this
   is a cheap migration now and an expensive one later. (Verify emptiness at implementation time
   rather than assuming it.)
3. **The existing inline `design_intent` column is retained as a deliberate immutable snapshot**,
   not replaced. It is `NOT NULL` today, the protect trigger already forbids changing it, and
   relaxing a NOT NULL to avoid duplication would weaken the very invariant this decision exists to
   preserve. An insert-time check requires `design_concepts.design_intent` to equal the referenced
   artifact's `design_intent`. **Two copies of the same immutable value are not two sources of
   truth**: neither can be updated, and equality is enforced where they meet. The artifact is the
   origin of record; the column is a denormalised read that cannot drift.
4. **One stable identity per lifecycle stage, and lineage by FK.** Before composition, a sibling is
   identified by `(batch_id, concept_index)` on its artifact. From composition onward the concept is
   identified by `design_concepts.id`, which is what `resolved_design_specs` and
   `events.active_concept_id` already reference. They are different objects at different stages —
   an intent is not a concept — and the FK makes the lineage explicit in one direction, with no
   competing claim in the other.

### G.4 The attribution invariants

> **Identity.** Every persisted identity revision names, and is reproducible from, exactly one
> `(prompt_version, schema_version, input_assembly_version, model, provider configuration)` tuple,
> plus the ordered clarification answers that were in scope for it — which are themselves bound to
> the revision that asked (§B.2).

> **DesignIntent.** Every persisted DesignIntent artifact names, and is reproducible from, exactly
> one `(identity_revision_id, planner_version, assignment, directive, token_allotment,
> design_intent_prompt_version, design_intent_schema_version, model, provider configuration)` tuple.

Both follow the established rule: generated design data is immutable; nothing persisted is mutated;
a change produces a new row (`CLAUDE.md §2`).

### G.5 Batches

`generation_runs` is close to sufficient — it already carries provider, `provider_request_id`,
`operation`, `round`, `concept_index`, model, four token counters, `latency_ms`, `success`,
`error_code`, the version columns, `diversity_assignment`, `schema_valid_first_call`, `reprompts`
and a **unique** `idempotency_key`. It gains `input_assembly_version` and `planner_version`.

What is missing is a **batch**: `generation_batches` (id, `event_id`, `identity_revision_id`,
`planner_version`, `round`, status, timestamps, idempotency key), which makes "one batch in flight
per event" a uniqueness constraint rather than application etiquette and gives §H and §I something
to reason about.

## H. Spend and concurrency controls

Binding source: `development-plan.md` principle 4 — *"Spend controls ship with the first production
model call, not in hardening"* — and `spec.md §1178`. The proof phase hit an organisation spend
ceiling mid-run; this is not theoretical.

| Control | Mechanism |
| --- | --- |
| one batch in flight per event | partial unique index on `generation_batches (event_id) where status in ('planned','running')`. The database refuses the second |
| per-event and per-account daily caps | the existing `rate_limits` fixed-window table, built for this (`spec.md §10`, `§27`) |
| global ceiling and alerts | a counter checked before a batch starts, plus an alert path. A breach refuses new batches; it never truncates a running one into a half-batch presented as whole |
| idempotency | `generation_runs.idempotency_key` is already unique; the key derives from `(batch_id, operation, concept_index, attempt)`, so a duplicated request collides instead of paying twice |
| retries | `model-contracts.md §8` unchanged; retries reuse the attempt's key |
| rate limiting | per-account, at the entry point, before any provider client is constructed |
| duplicate sibling calls | prevented by the idempotency key, not by in-process locks, which do not survive a serverless instance |
| resumption after partial failure | the batch records per-sibling status; resumption re-issues only siblings with no successful run, under the same keys |

**No arming token, confirmation secret or two-key execution.** That decision was made for the eval
process (`docs/model-evals/eval-incidents.md`) and is not reintroduced here under another name.
Spend safety is a cap and an idempotency key, not a ritual.

## I. Failure semantics

Governing rule, inherited from the Phase 4A evidence discipline: **nothing may make the evidence or
the user state lie.** A fallback that silently substitutes a creative world is worse than a visible
failure, because it is indistinguishable from success downstream.

| Failure | Behaviour |
| --- | --- |
| EventIdentity provider failure | bounded transient retries, then a real error state. No cached or default identity |
| EventIdentity invalid output, repair fails | recorded as `invalid_output` with every paid raw response preserved — the Phase 4A journal rule applied to production telemetry. Never relabelled a provider error |
| provisional (Route B) identity | not a failure. `awaiting_clarification`; no batch; question surfaced (§A.4) |
| one DesignIntent sibling fails | the batch continues; concept-level readiness is canonical (`§7.10 #5`). **The failed sibling is never replaced by a library recipe** (`CLAUDE.md §5.1`); the documented terminal fallback is the only exception and is recorded in `generation_runs.fallback` |
| multiple siblings fail | the batch fails as a batch. Fewer than three concepts is a visible state, never three where one is fabricated |
| timeout | bounded per-call deadline; a timed-out call is a failed attempt retried under the same idempotency key |
| user refresh / retry | idempotent: the same batch is observed, not restarted. Refresh is a read |
| duplicate requests | collide on the batch uniqueness index or the run idempotency key |
| stale host edit during generation | content edits do not recompose a page (`CLAUDE.md §2`) and do not invalidate a running batch. An edit that would change the identity is a new round |
| clarification answer during generation | §C, last row: persisted, batch untouched, new round offered |

## J. Latency architecture

Measured: EventIdentity median **~30 s** (`model-contracts.md §4.6`). `spec.md §7.10` targets p75
identity ≤ 5 s, first concept ≤ 15 s, all three ≤ 45 s. The gap is real, recorded as debt, and
**not** this work's job — quality first.

What must nonetheless be structurally right, because retrofitting is expensive: the three
DesignIntent calls **run in parallel** and are independent by construction (blind siblings), so the
batch is not three sequential calls; **per-sibling readiness from the start**, with no aggregate
"generation complete" boolean a later phase would have to unpick; **no concept waits on a sibling**;
and **the surface shows only real pipeline state** (`§7.10`, `CHANGELOG-v6.md`) — no invented
percentages, no simulated reasoning, no stage claiming work that has not happened. A truthful
surface is a constraint on the data model, which is why it belongs here even though the surface does
not.

Deferred explicitly: streaming identity output, prompt-size and reasoning-effort tuning, model
selection for latency, caching. Each trades against interpretation quality.

---

# Part III — Evidence strategy, designed before the prompts

Phase 4A's most expensive lessons were procedural: four benchmark leaks, three accidental runs, and
a corpus usable once. Both evidence plans are written **now**, before a line of either prompt
exists.

**No corpus cases are authored in this task.**

## 3.1 Capability dimensions (4C)

1. sibling distinctness beyond palette/font swaps; 2. faithfulness of all three to the same
identity; 3. `hostConstraint` preservation across all three; 4. `creativeGuidance` remaining
advisory — a sibling may depart from it without penalty; 5. emotional and aesthetic range;
6. personalization versus generic premium output; 7. no convergence onto one house style; 8. useful
differences in organizing idea, visual language and experience; 9. downstream suitability for
materially different CompositionTrees; 10. no invented host facts, and no `creativeGuidance`
promoted to `hostConstraint`.

Dimensions 1, 3, 4 and 10 are substantially mechanical; 2, 5, 6, 7, 8 and 9 substantially
qualitative. Each case exercises a **named** dimension, and no case's expected answer may be
satisfiable by a rule the prompt could be taught directly.

## 3.2 Mechanical invariants (4C)

Per batch of three: assignment conformance; palette separation above a floor; typography
distinctness; composition-vector distinctness; motif overlap below a ceiling; token allotment
respected; every `hostConstraint` traceable into all three; no `suppliedFacts` value invented or
altered; no `creativeGuidance` string appearing as a constraint; schema validity and first-call
success; repair and transient retry counts.

A mechanical pass is **necessary and never sufficient** — three outputs can satisfy every distance
metric and still be one idea. Undecidable cases report `n/a` or **advisory**, never a silent pass,
and advisory labels are never folded into the pass count.

## 3.3 Qualitative review dimensions (4C)

Per batch: are these three *worlds* or three *settings*? Is each rooted in this event rather than in
premium taste generally? Does each suggest a different experience, not just a different look? Is the
verbal identity as distinctive as the visual idea? Does finishing language repeat across siblings?
Does any sibling restrict sentimentality, theatricality or kitsch without support from the identity?
Do all three sit in the same register of polish and emotional moderation?

## 3.4 Evidence classes and the sealing rule

| Class | When authored | What it supports |
| --- | --- | --- |
| **regression** | before implementation; may be read freely | catching regressions, forever |
| **pre-registered validation** | authored and frozen **before** the prompt is written, independently reviewed for fairness | validation against pre-registered invariants; **not** generalization |
| **sealed challenge** | authored **after** the implementation and harness freeze, by someone who has seen neither the prompt nor prior outputs nor known failures | generalization. **One run, then spent** |

Authored before implementation: the regression corpus and the pre-registered validation set.
**Unauthored and unseen until after the implementation freeze:** the sealed challenge. Its slot —
`EVAL_SET`, corpus filename, output directory, leakage-scan entry — is wired while its cases are
unknown, exactly as `challenge2` was, so adding the corpus file is the entire change. That property
was observed twice in 4A and is cheap to keep.

## 3.5 Leakage controls

`prompt-leakage.test.ts` is extended to scan each new prompt **and its wire schema** — the schema
matters because `.describe()` strings ship to the model, which is how leak 4 reached production.
Scanning is **necessary and not sufficient**: it catches literal reuse, not paraphrase or a
case-specific instruction dressed as a general principle, so an independent engineering read for
benchmark integrity remains required. A collision between an independently authored corpus and
pre-existing prompt text is resolved **at the corpus**, never by relaxing the scanner — the
precedent set when `sealed_challenge_v2` hit `"exactly as written"` and `"quinceañera"`.

## 3.6 Write-once evidence rules

Unchanged and already implemented: a completed run's directory is immutable in full and joins
`PROTECTED_RESULT_DIRS` **in the same change** that commits its evidence; the journal is appended
per response before any deterministic evaluation; nothing about the runner is verified by running
it; incidents go to `docs/model-evals/eval-incidents.md`.

## 3.7 The 4C gate — distribution **and** systemic veto, both frozen beforehand

**Both halves are frozen in canon before the sealed corpus is authored, and before any DesignIntent
prompt is written.** Moving either after results voids the gate (`spec.md §11.9` discipline).

**Half one — distribution.** Per-batch bands **Excellent / Good / Borderline / Fail**, defined in
writing before any batch is reviewed:

> **No `Fail`. At most one `Borderline`. `Excellent` strictly outnumbers `Good`.**

Stronger than 4A's outcome (7/5 passes; 6/6 does not), not satisfiable by one lucky case, and not a
literal 12/12 that would invite tuning against spent cases.

**Half two — the systemic veto.** A high distribution must not mask a systemic creative failure.
**The 4C gate fails regardless of distribution if the independent reviewer finds any predeclared
systemic pattern.**

*Predeclared categories* — the only ones that can trigger a veto, fixed now:

| | Pattern |
| --- | --- |
| S1 | siblings collapsing into one recognisable house style despite different assignments |
| S2 | "three concepts" that are parameter variants rather than different creative worlds |
| S3 | `creativeGuidance` promoted into host law |
| S4 | host constraints eroded or contradicted |
| S5 | generic-premium treatment overwhelming event-specific personality |
| S6 | unsupported emotional moderation / anti-sentimentality / anti-theatricality across siblings |
| S7 | another recurring pattern that directly defeats the core 4C question — **and which the reviewer must name and define in the same terms as S1–S6** |

*What counts as systemic*, so it is neither a discretionary escape hatch nor a rule that can only be
invoked by hindsight: a pattern is systemic when the reviewer finds it **present in at least two
distinct batches**, cites **each batch by id and at least one specific sibling within it**, quotes
the **specific output text** that exhibits it, and judges it a property of the system's output
rather than of the input cases. All four conditions, stated in the review artifact.

*The reviewer protocol.* The reviewer is **not** asked "should this pass?" and is not told the
distribution rule or the threshold. They produce:

1. **per-batch ratings** on the four bands, with reasons, completed before any cross-batch work;
2. **an explicit cross-batch systemic assessment**, answering **every** category S1–S7 as
   present/absent with citations — including the absent ones, so the veto is a checklist completed
   in every review rather than a finding volunteered only sometimes.

*How the go/no-go records it.* The decision states the band distribution **and** the systemic
verdict per category. A veto is a **NO-GO** with the category and the reviewer's citations recorded
verbatim. A pass records that all seven were assessed and found absent. **Neither half can be
waived by the other**: an excellent distribution does not override a veto, and an absent veto does
not rescue a failing distribution.

**The north star is unchanged.** 100% Excellent-quality creative direction is the aspiration. This
gate is the floor that protects generalization, never a license to settle for Good.

## 3.8 Independent qualitative review process

Unchanged from 4A because it worked: a blind artifact generated by the runner containing outputs
and no case metadata, expectations or route labels; a **fresh** reviewer session with no access to
this repository's prompts, prior evidence or failure history; band judgements plus the systemic
checklist plus prose; the go/no-go recorded with its SHA chain.

## 3.9 The Phase 4B rerun-behaviour validation set — classed honestly

Introducing clarification answers changes the effective model input (§B.3), and `v5` was evidenced
with no answer ever present. A small **pre-registered validation set** exercising a rerun with
answers present is authored and frozen **before T4 is implemented**, and run exactly once after the
implementation is frozen and an explicit live-run authorization is given.

What it is, stated so nobody upgrades it later:

- it is **pre-registered validation evidence** for the new clarification-answer input shape and
  lifecycle;
- it is **not** fresh generalization evidence for EventIdentity `v5`;
- it does **not** reopen, replace or substitute for the spent `v5` sealed challenge;
- it validates the input shape and lifecycle, not the interpreter's creative quality.

Its mechanical and qualitative criteria are frozen with the corpus, before the run. Its slot is
wired while its cases are unknown, and its cases are **not authored in this task**.

---

# Part IV — Implementation decomposition

Small, auditable commits. No adjacent refactors. **Every task is offline** — no provider call is
permitted until the gate that names one.

## Phase 4B

| # | Task | Files / modules | Depends on | Tests | Acceptance criteria | Model-visible? | Senior review? | Live call? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **T1** | `isProvisional`, `assertAuthoritative`, branded type | `src/lib/ai/event-identity/lifecycle.ts` | — | unit over all valid shapes; brand cannot be cast away | `spec.md §31 — Event Identity and diversity`; `§7.6b`, `§7.7` | no | no | no |
| **T2** | Identity revisions: table, `identity_is_provisional`, generated column, pointer trigger, protect trigger, RLS | `supabase/migrations/…_phase4b_identity_revisions.sql` | T1 | db: a supplied `is_provisional` is rejected; a provisional revision cannot become authoritative even with the column tampered; cross-event pointer refused; updates refused; **TS/SQL parity over the four `v5` journals** | `§7.6b`, `§7.7`, `§9.4` | no | **yes** | no |
| **T3** | `clarification_answers`: table, binding trigger, append-only trigger, RLS | migration; `src/lib/events/clarification.ts` | T2 | db: wrong event, wrong index, wrong `kind`, drifted copy, boundary-defer and duplicate answer all refused; `events.prompt` never written | `development-plan.md` 4B (c) | no | **yes** | no |
| **T4** | Input assembly + `EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION` → `event_identity_input_v2` | `src/lib/ai/versions.ts`, `src/lib/ai/provider.ts`, `src/lib/ai/openai/event-identity.ts` | T3 | `input-assembly-drift.test.ts` golden snapshots; snapshot change without a version bump fails; `prompt` byte-identical across rounds | `§7.6b`; guardrail `§32 #12` | **yes** | **yes** | no |
| **T5** | Orchestration: run → persist → branch → rerun | `src/lib/generation/identity-orchestrator.ts` | T1–T4 | unit + db: provisional blocks; rerun creates a revision; repeated boundary rounds; no cap; idempotent refresh | `§7.6b`, `§7.7`, `§31 — Creation Mode` | no | **yes** | no |
| **T6** | Minimal clarification surface | `src/app/…` per `screen-spec.md` | T5 | e2e at 390 and 1280; keyboard, focus, contrast | `§31 — Creation Mode`, `§31 — Responsive/accessibility` | no | no | no |
| **T7** | Rerun-behaviour validation corpus + harness slot — **cases authored separately, before T4 ships** | `src/lib/ai/evals/*`, runner slot | T4 | unit/static only; leakage scan covers it | `model-contracts.md §4.5` | no | **yes** | no |
| | **▶ 4B GATE — approval required before the single authorized validation run** | | | | | | | |

## Phase 4C — begins only after the 4B gate passes

| # | Task | Files / modules | Depends on | Tests | Acceptance criteria | Model-visible? | Senior review? | Live call? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **T8** | Sibling planner as a pure function + `PLANNER_VERSION` | `src/lib/generation/planner.ts`; reference `proof-b/planner.js` | 4B gate | unit: determinism, distinctness, allotment, tone-constrained fallback, `creativeGuidance` never binding; parity with the proof reference | `§31 — Event Identity and diversity`; `spec.md §7.7`; `CLAUDE.md §5.1` | no | **yes** | no |
| **T9** | `generation_batches` + spend, caps, idempotency | migration; `src/lib/generation/batch.ts`; `rate_limits` wiring | T8 | db: one in-flight batch enforced by index; caps refuse; duplicate keys collide; partial-failure resumption | `development-plan.md` principle 4; `spec.md §10`, `§27` | no | **yes** | no |
| **T10** | `design_intent_artifacts` + `design_concepts.design_intent_artifact_id` + equality check | migration | T9 | db: updates refused; equality check refuses a mismatched snapshot; FK required | `spec.md §9.4`; `CLAUDE.md §2` | no | **yes** | no |
| **T11** | DesignIntent contract, schema, narrowing, validator — **no prompt** | `src/lib/ai/design-intent/*`; generated files under `docs/model-schemas/` | T10 | unit: semantic invariants, narrowing, repair rules, schema-drift | `model-contracts.md §5`; `§32 #12`–`#31` | **schema descriptions ship** | **yes** | no |
| **T12** | Evidence harness + regression and pre-registered corpora | `src/lib/ai/evals/*`, `tests/eval/design-intent.eval.ts` | T11 | unit/static only, per the operational rule; leakage scan extended | `model-contracts.md §4.5` | no | **yes** | **no — never run to verify itself** |
| **T13** | Freeze the 4C gate (§3.7) in canon | `model-contracts.md`, this document | T12 | doc guards | `spec.md §11.9` discipline | no | **yes** | no |
| **T14** | The DesignIntent prompt | `docs/model-prompts/design-intent.system.md` | T11–T13 | leakage scan; independent engineering read | `model-contracts.md §5`; `product-doctrine.md` | **yes** | **yes** | no |
| | **▶ STOP — APPROVAL REQUIRED BEFORE THE FIRST LIVE DesignIntent CALL** | | | | | | | |
| **T15** | Freeze; author the sealed challenge; one run; blind review | — | T14 | the 4A protocol exactly | `model-contracts.md §4.5` | no | **yes** | **yes — one authorized run per set** |

> **The stop point.** No live DesignIntent provider call may happen before T14 is complete, frozen,
> independently reviewed and explicitly approved — and the gate (§3.7) is frozen at T13, *before*
> the prompt is written and before the sealed corpus is authored. Every set is run at most once per
> authorization, and each completed run's directory is protected in the same commit as its evidence.

---

# Part V — Gates

## The Phase 4B exit gate

Phase 4B passes when all twelve hold. Items 1–11 are proven offline; item 12 requires the one
authorized live run.

| | Requirement | How it is proven |
| --- | --- | --- |
| 1 | A Route B identity is provisional and cannot flow downstream | type-level (branded `AuthoritativeIdentity`) plus a db test that the authoritative pointer refuses it |
| 2 | A zero-question or Route-A-only identity is authoritative | TS/SQL parity tests over constructed shapes and the four `v5` journals |
| 3 | The original event prompt is byte-identical across rounds | assembly test comparing the prompt string sent on round *n* with round 1; `events.prompt` never written |
| 4 | Clarification answers are first-class durable host input with provenance | the §B.2 binding triggers: wrong event, wrong index, wrong `kind`, drifted copy and duplicate all refused |
| 5 | Newer clarification input takes the intended precedence without mutating history | assembly golden snapshots show labelling and precedence; answer rows are append-only; earlier rounds unchanged |
| 6 | Multiple boundary rounds are possible with no lifetime cap | orchestration test driving ≥ 3 boundary rounds; no cap constant exists anywhere (asserted by scan) |
| 7 | Route A never blocks generation | test: an unanswered and a deferred creative question both proceed |
| 8 | A late Route A answer never mutates an in-flight batch | test: batch inputs unchanged; the answer binds to the asking revision; a new round is offered |
| 9 | Refresh and retry are idempotent | test: repeated requests observe one batch and one revision; keys collide |
| 10 | The database cannot mark a boundary-bearing identity authoritative via a stale or false flag | db test: the generated column rejects a supplied value, and the pointer trigger still refuses when the column is tampered with directly |
| 11 | Host/co-host authorization and RLS for answers and revisions are correct | db tests per the existing permission matrix, including negative cases |
| 12 | The pre-registered rerun-behaviour set passes its frozen mechanical and qualitative criteria | one authorized live run after the implementation freeze, classed per §3.9 |

Plus the standing gate: deterministic checks green, independent engineering review, and an explicit
go/no-go recorded with its SHA chain.

## The Phase 4C exit gate

§3.7 in full — the distribution rule **and** the systemic veto, both frozen at T13 before the prompt
exists and before the sealed corpus is authored, with the reviewer protocol of §3.8. Neither half
can be waived by the other.

---

# Resolved decisions

| | Decision | Resolution |
| --- | --- | --- |
| **1** | Phase letters | **Canonical split kept.** 4B = clarification; 4C = planner + DesignIntent. No letters renamed or shifted. Continuous workstream permitted, separate gates required, and 4C does not begin until 4B passes |
| **2** | Does `v5` need prompt prose about clarification answers? | **No — and the input layer gets its own version.** `event_identity_v5` stays; answers are carried in the request envelope; `EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION` identifies the envelope, is persisted on every revision and run, bumps on any precedence/labelling/ordering/representation change, and is drift-tested against a golden snapshot. A pre-registered rerun-behaviour set is authored before T4 and run once, later, under explicit authorization |
| **3** | Do siblings see each other? | **Blind and parallel.** No convergence-triggered re-prompt in the first implementation. Convergence and distinctness are first-class telemetry, mechanical where honest and qualitative where not; a later mechanism is a deliberate spec decision argued from evidence |
| **4** | Where do DesignIntent-only artifacts live? | **A dedicated immutable `design_intent_artifacts` table.** The earlier nullable-then-fill recommendation is withdrawn: it contradicted `protect_design_concept()`. `design_concepts` is inserted only after composition, gains a `NOT NULL` FK to the artifact, keeps its inline `design_intent` as an immutable snapshot with insert-time equality enforced, and remains the stable concept identity from composition onward |

---

*Nothing in this document changes production behaviour, and no part of it is approved for
implementation until reviewed and explicitly authorized. The next implementation authorization is
expected to be for **Phase 4B only**.*
