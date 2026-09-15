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
machine-readable signal."* The rule therefore has implementations in two runtimes, held equal by
test rather than by care:

| Runtime | Implementation | Role |
| --- | --- | --- |
| TypeScript | `isProvisional(result, schemaVersion)` in `src/lib/ai/event-identity/lifecycle.ts` (new, pure, no I/O) | the canonical semantic for ordinary application code |
| SQL | `public.identity_is_provisional(result jsonb, schema_version text)`, `immutable` | the authority at the persistence boundary (§A.3) |

**Both take the schema version, and both refuse rather than answer** on an unrecognised version or a
malformed `clarification.questions` path. The TypeScript side **throws**; it never returns `false`,
because returning `false` is the fail-open answer §A.3 exists to remove. Matched signatures are what
make "identical answers" a meaningful claim on exactly the cases that matter.

`assertAuthoritative(result)` returns a branded `AuthoritativeIdentity`. **The planner, the
DesignIntent call and every downstream creative stage accept only the branded type**, so "a
provisional identity must not be consumed" is a compile error rather than a review convention —
the same problem the raw-prompt boundary solves with a test, solved here by the type system, with a
test asserting the brand is never cast away.

**Parity is proven, not assumed.** A test evaluates **every** implementation of this rule over one
fixture set and requires identical answers on each case: zero questions; one, two and three
creative questions; one boundary question; malformed and absent shapes (§A.3); and — the cheap and
honest part — **every response already persisted in the four `v5` evidence journals**, read-only,
which is 50 real provider outputs carrying **two** boundary questions, SC-06 in the spent-challenge
diagnostic and SC2-12 in the fresh challenge. If any two implementations disagree, the test fails
before either is trusted.

**"Every implementation" means three, not two.** The answer-binding trigger in §B.2 also reads this
JSON — `kind`, the question text, option labels and `isDefer` — so it is a third site that knows the
envelope's shape. It does not open-code a path: §A.3 defines **`public.identity_questions(result
jsonb, schema_version text) returns jsonb`**, which performs the same two refusals and returns the
validated questions array, and both `identity_is_provisional` and the §B.2 trigger read through it.
One accessor, one refusal policy, one fixture set — because a third reader with its own path is how
two carefully-matched ones drift.

### A.2 Persistence — identity revisions

`event_identities` today is `event_id uuid primary key … updated_at`: **one mutable row per
event**. That cannot express a boundary round (which produces at least two results for one event)
and cannot support the attribution invariant in §G.

Phase 4B adds append-only identity **revisions**, one row per `generateEventIdentity` result:

- `event_id`, `revision` (monotonic per event), **the full result envelope** as `jsonb` — note that
  today's `event_identities.identity` holds the *brief* only, which is why legacy rows are not
  migrated into this column (§A.3);
- `prompt_version`, `schema_version`, **`input_assembly_version`** (§B.3) — all three `NOT NULL`,
  with any row created before a version existed stamped `event_identity_pre_versioning` rather than
  left null, so "not recorded" and "the writer forgot" are never the same value. §A.3 forbids
  migrating legacy briefs into this table at all, so the sentinel should never be reachable — it is
  defence in depth against a future import path, not a planned value;
- `model`, provider configuration, `provider_request_id`, `generation_run_id`;
- **`clarification_answer_ids`** — the ordered ids of the answers actually assembled into this
  request, written in the same transaction. Without it, "which answers were in scope" is
  reconstructible only by comparing `answered_at` with `created_at`, which is inference, not
  attribution: §B.2 does not require an answer to be inserted against the *latest* revision, so an
  answer to revision 1 may legitimately arrive after revision 5 exists;
- `is_provisional` — **a generated column, not a supplied one** (§A.3);
- no `updated_at`, and a protect trigger refusing every `UPDATE` to the result, the version set or
  the answer-id list, in the style of `protect_design_concept()`.

**Append-only, and still deletable with the event.** These rows sit under `events` with
`on delete cascade`, and `spec.md §11` makes deleting an event an owner capability a co-host does
not have. A protect trigger that refused `DELETE` unconditionally would fire inside that cascade
and abort it, so an event with one revision could never be deleted — by its owner or by any
account-erasure path. The refusal is therefore carved out for the cascade: it applies while the
parent event still exists, which is exactly what `protect_owner_membership()` already does in the
phase-1 migration. The same applies to clarification answers (§B.2). This is a decision, not an
omission: the alternative is soft-deleting events, which nothing else in the schema does.

A pointer on the event names the **authoritative** revision. Whether the new table supersedes
`event_identities` or replaces it is an implementation call for the task packet; the constraints
are that no row is ever mutated, the old shape does not survive as a second source of truth, and no
legacy brief is carried across as though it were an envelope.

### A.3 The provisional-state invariant — **the caller cannot lie**

The earlier draft had application code derive `is_provisional` and store it. That duplicates a
safety-critical truth in a place a buggy or malicious caller controls, and the whole point of the
flag is that nothing downstream may consume a provisional identity. Revised:

**It must fail closed.** The obvious implementation `coalesce(result -> 'clarification' ->
'questions', '[]')` turns *"this path is missing"* into *"authoritative"*, which is the worst
available default: a schema version that renames `kind` or moves `clarification`, or any row whose
JSON is not the envelope, silently reads as consumable. `spec.md §7.6b` derives this signal from
JSON shape, so a shape that is not recognised is not evidence of absence — it is a state the
function has no right to judge.

```sql
-- The one reader of the envelope's question array. Every other SQL site goes through it.
create function public.identity_questions(result jsonb, schema_version text)
  returns jsonb language plpgsql immutable
  set search_path = pg_catalog
as $$
begin
  -- An unrecognised schema version is a shape this function cannot read. Refuse.
  if schema_version is distinct from 'event_identity_schema_v5' then
    raise exception 'identity_questions: unsupported schema version %', schema_version
      using errcode = 'feature_not_supported';
  end if;
  -- A missing or non-array questions path is malformed, never "no questions". Refuse.
  if jsonb_typeof(result -> 'clarification' -> 'questions') is distinct from 'array' then
    raise exception 'identity_questions: clarification.questions is not an array'
      using errcode = 'check_violation';
  end if;
  return result -> 'clarification' -> 'questions';
end;
$$;

-- Pure JSON inspection, so it qualifies as IMMUTABLE and can back a generated column.
create function public.identity_is_provisional(result jsonb, schema_version text)
  returns boolean language sql immutable
  set search_path = pg_catalog
as $$
  select exists (
    select 1
    from jsonb_array_elements(public.identity_questions(result, schema_version)) q
    where q ->> 'kind' = 'boundary'
  );
$$;
```

Adding a future schema version means extending this function deliberately, in the migration that
introduces it — which is the point. A row it cannot read cannot be inserted at all, so there is no
state in which a boundary-bearing identity is quietly classed authoritative.

**Nothing in `event_identities` is migrated into this column.** Today's `event_identities.identity`
is `jsonb not null` holding **the creative brief, not the result envelope** — it has no
`clarification` key, so the function above would (correctly) refuse it. A migration that carried
those rows across as envelopes would be exactly the fail-open path this design exists to remove.
Legacy rows are either left where they are or migrated into a column that is explicitly *not* an
envelope, and never become identity revisions.

Three properties follow, and together they are the invariant:

1. **`is_provisional` is `generated always as (public.identity_is_provisional(result,
   schema_version)) stored`.** A caller cannot supply it at all — an `INSERT` naming the column is
   rejected by Postgres (`428C9`). It is a convenience for reads and indexes, derived by
   definition, never independently authoritative.
2. **The authoritative-pointer trigger reads the JSON, not the column.** Setting the event's
   authoritative pointer re-derives from the referenced revision's `result` via the same function
   and raises if it is provisional. So even a dropped or corrupted column could not let a
   boundary-bearing identity become authoritative.
3. **The pointer must reference a revision of the same event.** Modelled on
   `validate_active_concept()`.
4. **The pointer column is server-managed.** It joins the enumerated list in
   `protect_event_server_columns()`, on **both** the insert and the update branch. That function
   protects only the columns it names, and `events_update_member` grants `UPDATE` on
   `public.events` to any member — so a new column is writable by a co-host until it is named
   there. Without this, a co-host could repoint the event at an earlier authoritative revision and
   silently change the creative interpretation everything downstream reads. Gate item 11 carries
   the negative test.

**A caveat recorded correctly, because the first draft of it was wrong.** A `STORED` generated
column is computed on `INSERT` and `UPDATE` **only**. `CREATE OR REPLACE FUNCTION` does not rewrite
the table and does not recompute anything — the same hazard Postgres documents for functional
indexes. So changing `identity_is_provisional` leaves every existing `is_provisional` value **stale
and silently disagreeing** with the live function the pointer trigger evaluates: precisely the
DB/application divergence this section exists to eliminate, introduced inside it.

Therefore: changing the derivation function requires, **in the same migration**, an explicit
rewrite of the column (`ALTER TABLE … ALTER COLUMN is_provisional SET EXPRESSION …`, or drop and
re-add), plus a test asserting that no stored row disagrees with a live re-derivation. The rule
itself is fixed by `spec.md §7.6b` and is not expected to change; adding a schema version to the
function is, and is governed by the same requirement.

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
| original description preserved unchanged | any mutation of `events.prompt`, **including by service role** |
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
   name the question's one `isDefer` option;
6. **`round` equals the referenced revision's round** — a denormalised field held to the same
   standard as the copied text, rather than a lower one;
7. **`answered_by` is a member of `event_id`** — otherwise any `profiles` id in the system can be
   recorded as the answering host;
8. **for an end-user request, `answered_by = auth.uid()`** — otherwise a co-host can attribute an
   answer to the owner, which defeats *"attributable to the host"* outright. Service-role writes are
   exempt from (8) and never from (7).

Plus `unique (identity_revision_id, question_index)` — one answer per question — and a protect
trigger refusing `UPDATE` and `DELETE`, so the record is append-only in the database and not merely
by application habit.

**Who writes, so gate item 11 is designable.** Answers are written by the host or co-host as an
**end-user request under RLS** — they are host input, and routing them through service role would
discard `auth.uid()`, which check (8) depends on. The orchestrator reads them server-side. The
permission matrix follows the existing member model: a member of the event may insert an answer for
themselves; nobody may update or delete one.

**And `events.prompt` is made immutable in the database, not by habit.** §B.1's strongest
requirement is that the original description is never mutated, and today
`protect_event_server_columns()` blocks only *end-user* updates to `prompt` — every write in this
pipeline is service role, so the guard that matters is absent. Phase 4B adds an unconditional
trigger refusing any change to `events.prompt` after insert, regardless of caller. Gate item 3 then
rests on a database refusal rather than on a source scan.

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
| `event_identity_input_v1` | what Phase 4A shipped and evidenced: **the original prompt only**, with inspiration explicitly declared absent — the request ends with the literal line *"There is no visual inspiration supplied with this request"*, and the provider boundary's own input type carries no inspiration field. No clarification answers |
| `event_identity_input_v2` | adds clarification answers as labelled current host input with stated precedence. Introduced by **T9** |

**No backfill onto finished evidence; an explicit sentinel in the database.** Completed evidence
artifacts predate the column and are never rewritten — retrofitting a label onto frozen evidence is
not something this project does. In the **database**, absence is ambiguous in a way that matters: a
legacy row and a future row whose writer forgot the column would look identical. So
`input_assembly_version` is `NOT NULL` on the new table, and any row carried across from before
versioning is stamped `event_identity_pre_versioning` — a value that says *"produced before this
was recorded"* out loud, rather than a null that could equally mean *"a bug"*.

**When it bumps.** Any change to precedence, labelling, ordering or representation of clarification
answers; adding or removing an input channel; changing how the original prompt is delimited. It
does **not** bump for a prompt-file edit (that is the prompt version) or a schema change (that is
the schema version), and the three are independent.

**How it is enforced — and not the way the first draft said.** A test process has no view of the
commit, so "the version must change in the same commit" is not implementable, and the cited model
does not have the property either: `schema-drift.test.ts` can be greened by `UPDATE_SCHEMAS=1`
(`npm run schemas:event-identity`), which rewrites the files in place with the version untouched.
An implementer following that precedent would build a guard a developer clears with one environment
variable — and Resolved Decision 2 rests entirely on this guard.

`input-assembly-drift.test.ts` therefore uses **version-named golden files** and never regenerates
in place:

- fixture envelopes live at `__fixtures__/envelope.<assembly-version>.json` — one set per declared
  value, over fixed inputs (no answers; with answers; with inspiration; multi-round);
- the test loads the file named by the **current** `EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION` and
  requires an exact match;
- a second test asserts one checked-in fixture set exists for **every** declared value, so an old
  one cannot be deleted to make room;
- there is no in-place update path and no environment-variable escape.

An assembly change under an unchanged version then fails against its own golden file, and a bump
requires adding a new file while the old one stays. **The version cannot drift from the behaviour
it names**, which is the property `event_identity_v5`'s history shows we need.

**Persistence.** `input_assembly_version` is stored on **every identity revision** (§A.2) and on
`generation_runs` for `operation = 'event_identity'`.

**Model-visible consequence.** T9 changes what the model sees, so it is model-visible work
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

**Blind and parallel — resolved.** Each call receives the **creative brief** from the same
authoritative identity — the `identity` sibling of the envelope, including `inspirationSummary` —
plus **only its own sibling assignment**, and nothing else.

**The brief, not the envelope.** `assertAuthoritative` brands the whole result, because that is what
carries the boundary signal; what *travels* from it is the `identity` sibling alone.
`suppliedFacts` and `clarification` do not leave the identity layer. `provider.ts` types the field
as `eventIdentity: EventIdentity`, which `model-contracts.md §6.1` glosses as the design brief — and
§D already closes the same door for the planner (*"Not `suppliedFacts` … facts belong to content
fit"*). Passing the envelope would smuggle the host's verbatim names, date, venue and address into
the creative call, which is the content profile this section excludes two paragraphs below and
which CA-1 records as unresolved. Admitting them would be a canonical change under `CLAUDE.md §12`,
not a plan edit.

That is `spec.md §7.7` exactly: *"The assignment is passed to the DesignIntent call; the directive,
allotment and DesignIntent are passed to the composition call."* `src/lib/ai/provider.ts` already
encodes the same split — `GenerateDesignIntentInput` is `{ eventIdentity, diversityAssignment }`,
while `capabilities` and `directive` belong to `GenerateCompositionInput`. **An earlier draft of
this plan sent the directive, the token allotment and the event's capabilities to DesignIntent,
which contradicted all three.** Withdrawn. `capabilities` reaching DesignIntent would additionally
breach `CLAUDE.md §2` — capabilities are enabled features and none of them recomposes a page — by
letting the enabled feature set shape the creative direction.

**What it returns includes `presentation`.** `model-contracts.md §5.1`, `spec.md §31` and `§32 #12`
and `#21` all place a non-design `presentation { name, description }` object on the DesignIntent
response — host-facing concept metadata the compiler never reads. It is part of 4C's output, is
persisted on the artifact (§G.2), and is in the reviewer's artifact (§3.8), because the verbal
identity it carries is what §3.3, §3.7's `Good` band and excellence-watch items 2 and 3 ask about.
Without it those questions are unanswerable and §3.2's finishing-language measurement has no field
to measure. (`spec.md §7.8`'s prose reads as though `presentation` arrives with the composition
response; four other canonical statements place it here. Recorded as **CA-3**.)

It never receives the raw host prompt (`spec.md §7.5`, `§31 — Event Identity and diversity`), raw
inspiration assets (§F), `suppliedFacts` or `clarification`, the directive or token allotment
(which are composition's), capabilities or content profile, **another sibling's output**, or any
library recipe or silhouette identifier (`CLAUDE.md §5.1`, `§32 #9` on the provisional flow).
The three calls run in parallel (`spec.md §7.10 #3`). A canonical tension this plan does **not**
resolve is recorded in §Canonical ambiguities raised.
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

**A gap between this requirement and the shipped code, recorded rather than assumed closed.**
`spec.md §7.5` requires inspiration assets to reach Event Identity, and `provider.ts` types an
optional `inspiration` on the input — but the implementation sends the prompt only and tells the
model no inspiration was supplied. Every `v5` evidence run was produced that way. Closing that gap
adds an input channel, which under §B.3's bump rule is its own `EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION`
bump and its own validation; it is **not** covered by `v1`, and it is not Phase 4B's work.

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
| model | `design_intent_prompt_version`, `design_intent_schema_version`, **`design_intent_input_assembly_version`** — the DesignIntent envelope carries the identity and the assignment and is exposed to exactly the drift §B.3 spends a page refusing to tolerate for EventIdentity, so it is versioned on the same terms, not "if it gains one" — `model`, provider configuration, `provider_request_id`, `generation_run_id` |
| payload | `design_intent` jsonb and `presentation` jsonb (`name`, `description`) — the validated output, immutable. `presentation` is persisted here rather than waiting for `design_concepts`, which does not exist until composition |
| | `created_at`; `unique (batch_id, concept_index)`; a protect trigger refusing every `UPDATE` |

**`generation_run_id` here takes no foreign key, for the reason 4B learned the expensive way.**
A `references public.generation_runs (id) on delete set null` on a table whose protect trigger
refuses every `UPDATE` is a contradiction the database resolves at the worst moment: pruning a
telemetry row makes the referential-integrity system issue `UPDATE … SET generation_run_id = NULL`
against the immutable row, which the trigger refuses, so the prune fails with "artifacts are
immutable". 4B hit exactly this on `event_identity_revisions` and settled it by dropping the
referential action: the artifact is evidence, and telemetry retention should never be able to
rewrite or block it. `on delete restrict` is not the alternative — it makes telemetry unprunable
instead. Apply the same rule to any other column added to an append-only evidence table.

### G.3 Relationship to `design_concepts` — settled now, to avoid known migration debt

1. **4D inserts `design_concepts` only after composition exists.** It already cannot do otherwise;
   this makes the constraint intentional rather than incidental. A concept is a *composed* thing.
2. **`design_concepts` gains `design_intent_artifact_id`**, a `NOT NULL` FK for concepts created
   from 4C onward, **and that column joins `protect_design_concept()`'s immutability list.** The
   trigger raises only for the columns it enumerates, so an unlisted column is the one generated-
   design column an `UPDATE` may change — and it would be the column carrying the lineage. A
   concept could be silently re-pointed at a different sibling's artifact after insert, defeating
   point 4 below. The table has never been written in production — Phase 4 has not run — so this is
   a cheap migration now and an expensive one later. (Verify emptiness at implementation time
   rather than assuming it.)
3. **The existing inline `design_intent` column is retained as a deliberate immutable snapshot**,
   not replaced. It is `NOT NULL` today, the protect trigger already forbids changing it, and
   relaxing a NOT NULL to avoid duplication would weaken the very invariant this decision exists to
   preserve. An insert-time check requires the concept to agree with its artifact on **everything
   they both carry**, and the enumeration is exhaustive rather than illustrative: `design_intent`,
   `event_id`, `round`, `concept_index`, `design_intent_prompt_version`,
   `design_intent_schema_version`, and — because `design_concepts` carries them too, nullably, and
   §G.2 records them on the artifact — `directive` and `token_allotment`. An enumeration that let
   those two drift would be the same stale-list defect as an unprotected column. Payload-only
   equality would
   let a concept claim schema `v5` while its artifact records `v4`, or sit at `(round 2, index 0)`
   pointing at an artifact from `(round 1, index 2)` — which would make §G.4's DesignIntent
   attribution invariant false by the concept path. **Two copies of the same immutable values are
   not two sources of truth**: neither side can be updated, and equality across every shared column
   is enforced where they meet. The artifact is the origin of record; the concept's columns are a
   denormalised read that cannot drift.
4. **One stable identity per lifecycle stage, and lineage by FK.** Before composition, a sibling is
   identified by `(batch_id, concept_index)` on its artifact. From composition onward the concept is
   identified by `design_concepts.id`, which is what `resolved_design_specs` and
   `events.active_concept_id` already reference. They are different objects at different stages —
   an intent is not a concept — and the FK makes the lineage explicit in one direction, with no
   competing claim in the other.

### G.4 The attribution invariants

> **Identity.** Every persisted identity revision names, and is reproducible from, exactly one
> `(prompt_version, schema_version, input_assembly_version, model, provider configuration)` tuple,
> plus **the ordered clarification answers recorded on the revision itself** (`clarification_answer_ids`,
> §A.2) — not the answers that happen to exist for the event now, which is a different and larger
> set once a later round has been answered.

> **DesignIntent.** Every persisted DesignIntent artifact names, and is reproducible from, exactly
> one `(identity_revision_id, planner_version, assignment, design_intent_prompt_version,
> design_intent_schema_version, design_intent_input_assembly_version, model, provider
> configuration)` tuple. The directive and token allotment are recorded on the artifact for
> lineage but are **not** inputs to this call (§E) — they are composition's.

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
model call, not in hardening"* — and `spec.md §9.6` (global/project spend ceiling and alerts). The proof phase hit an organisation spend
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

**Within a batch of three:** assignment conformance; palette separation above a floor; typography
distinctness; composition-vector distinctness; motif overlap below a ceiling; token allotment
respected; every `hostConstraint` traceable into all three; no `suppliedFacts` value invented or
altered; no `creativeGuidance` string appearing as a constraint; schema validity and first-call
success; repair and transient retry counts.

**Across batches — and this block is not optional.** Every metric above is within-batch, and a
system that produces three vivid, distinct, assignment-conforming worlds for *every* event, and
approximately the **same three** for a christening, a 60th birthday and a quinceañera, would pass
all of them. That is a three-template gallery arrived at without a library, and it is the
`CLAUDE.md §5.1` regression the Library Boundary Invariant exists to prevent. So the corpus-wide
block is frozen alongside the per-batch one:

- pairwise distance between **same-index siblings across different batches**, which should be no
  smaller than within-batch distance;
- the same distance restricted to **batches sharing an event type but carrying materially different
  identities** — the measurement that exposes per-type templating, and the reason the frozen corpus
  must contain at least two such pairs (below);
- corpus-wide frequency of palette families, typography pairings and motif sets — a long tail is
  expected, a short one is the finding;
- recurrence of finishing language: n-gram frequency across all `DesignIntent` prose fields,
  corpus-wide;
- how often the same organizing idea appears against materially different event types.

These are reported as measurements, not pass/fail thresholds invented in advance — with one
exception: they are the evidence the reviewer needs for category **S8** (§3.7), and a corpus-wide
recurrence they surface is a finding the reviewer must address.

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

**Both halves are frozen in canon at T19 — before any corpus is authored and before any DesignIntent
prompt is written.** Moving either after results voids the gate (`spec.md §11.9` discipline).

**The corpus size and composition are fixed in the same freeze.** A distribution rule is meaningless
without `N`: with a four-case corpus, `E=2, G=1, B=1` passes and "at least two batches" is half the
evidence. **The sealed corpus is twelve batches**, matching the 4A precedent, frozen at T19 before
the corpus is authored so it cannot be chosen to suit a result.

**And it must contain at least two pairs of batches sharing an event type with materially different
identities.** Twelve distinct event types would leave §3.2's same-type measurement with nothing to
compare and S8's same-type clause unevidenced — the gate would carry a category no run could ever
fire. This is a requirement on the corpus author, frozen with the rest, and it is the kind of thing
that is free now and impossible after T19 without voiding the gate.

**Half one — distribution.** Per-batch bands, **defined here rather than asserted to exist
elsewhere**, and frozen at T19 before any batch is reviewed:

| Band | Definition |
| --- | --- |
| **Excellent** | Three distinct creative worlds, each rooted in *this* event, each suggesting a different experience rather than a different look. A designer handed any one of them would know what to build, and would not confuse it with the other two. Nothing fabricated, nothing generic |
| **Good** | Three genuinely different directions, faithful and usable, but one or more is thinner than the others — a look rather than a world, or a world whose verbal identity does not carry its visual idea. No correctness defect |
| **Borderline** | The three are faithful and defensible, but the distinctness is largely parametric, or one sibling is a weak variant of another, or the set reads as competent premium work that this event did not specifically ask for. No correctness defect |
| **Fail** | Any correctness defect — an invented host fact, a `creativeGuidance` recommendation promoted to host law, a `hostConstraint` eroded or contradicted — **or** siblings that are not materially different directions at all |

**The rule:**

> **No `Fail`. At most one `Borderline`. `Excellent` strictly outnumbers `Good`.**

Stronger than 4A's outcome (7/5 passes; 6/6 does not), not satisfiable by one lucky case, and not a
literal 12/12 that would invite tuning against spent cases. Note that the `Fail` definition makes
any single-batch correctness defect fatal on its own — which is deliberate, and is what stops the
"one catastrophic batch rated Borderline" path through the gate.

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
| S7 | another recurring pattern that directly defeats the core 4C question — **which the reviewer must name and define in the same terms as the others** |
| **S8** | **the same creative worlds recurring across events — including across different instances of the same event type.** Organizing idea, palette family, typographic voice, motif set, finishing language or `presentation` voice repeating from batch to batch, whether the batches share an event type or not. S1 and S2 are both *within*-batch; without S8 a system producing three excellent, genuinely distinct worlds and roughly the *same* three every time passes every category and every within-batch metric. **The same-type clause is not a refinement, it is the case that matters:** a system with a "quinceañera set" and a "christening set" that differ from each other and barely differ within a type is a template gallery at the granularity a template gallery actually has, and a reviewer reading S8 as *different* event types only would decline it because the worlds do track the event. §3.2's corpus-wide block gives the reviewer evidence for both readings |

*What counts as systemic*, so it is neither a discretionary escape hatch nor invocable only by
hindsight. A pattern is systemic when the reviewer:

1. finds it present in **at least the threshold number of batches for its class** (below);
2. cites **each batch by id and at least one specific sibling within it**;
3. quotes the **specific output text** that exhibits it;
4. judges it a property of the system's output rather than an artefact of one unusual input — a
   judgement they must be *able* to make, which is why §3.8 gives them the identity alongside the
   three DesignIntents. A condition the blinding makes unanswerable would let every veto be declined
   on it.

*The threshold differs by class, because the categories are not the same kind of thing.*

| Class | Categories | Threshold |
| --- | --- | --- |
| **Correctness** | S3 (`creativeGuidance` promoted to host law), S4 (host constraints eroded or contradicted) | **one batch.** These are the failure `v4` already paid for; an 8% rate of fabricated host authority is not a quality wobble, and any occurrence also forces that batch to `Fail` under §3.7's band definitions |
| **Taste / convergence** | S1, S2, S5, S6, S7, S8 | **two batches** |

*The reviewer protocol.* The reviewer is **not** asked "should this pass?", is not told the
distribution rule, the band thresholds or the corpus size, and works from a repository they have no
access to (§3.8). They produce:

1. **per-batch ratings** on the four bands, with reasons;
2. **an explicit cross-batch systemic assessment**, answering **every** category S1–S8 as
   present/absent with citations — including the absent ones, so the veto is a checklist completed
   in every review rather than a finding volunteered only sometimes.

The per-batch ratings come first, which risks anchoring: twelve Excellents make a systemic finding
feel contradictory. The protocol therefore requires the systemic assessment to be written **against
the corpus-wide measurements of §3.2**, which the reviewer receives alongside the batches, rather
than from recollection of the ratings just given — an anchoring effect is answered with evidence,
not with an instruction not to be anchored.

One residual no protocol removes: a reviewer who *senses* a cross-batch pattern but cannot
articulate it may mark every category absent in good faith. So the go/no-go author has one duty
here — **if the reviewer's prose describes a cross-batch pattern that is not filed under any of
S1–S8, the review is returned for that pattern to be filed or explicitly declined**, before any
decision is recorded. That is a completeness check on the artifact, not a second opinion on the
outcome.

*How the go/no-go records it.* The decision states the band distribution **and** the systemic
verdict per category. A veto is a **NO-GO** with the category and the reviewer's citations recorded
verbatim. A pass records that all **eight** were assessed and found absent. **Neither half can be
waived by the other**: an excellent distribution does not override a veto, and an absent veto does
not rescue a failing distribution.

**The north star is unchanged.** 100% Excellent-quality creative direction is the aspiration. This
gate is the floor that protects generalization, never a license to settle for Good.

## 3.8 Independent qualitative review process

The 4A shape, with the 4C artifact defined rather than assumed.

**What the artifact contains**, per batch: the **authoritative EventIdentity brief** and the **three
DesignIntents** generated from it, **each with its `presentation` object** — without which the
verbal-identity questions in §3.3 and the `Good` band cannot be answered. Plus, once, the
corpus-wide measurements of §3.2. Nothing else — no case metadata, no expectations, no
clarification labels, no band definitions, no thresholds, no prior evidence. (The reviewer
necessarily learns the corpus size by rating every batch; what is withheld is the *threshold*,
which is why §3.8 excludes `model-contracts.md`.)

The identity is included deliberately. §3.3 asks whether each direction is rooted in *this* event,
S5 and S6 ask whether a treatment is supported by the identity, and systemic condition 4 asks
whether a pattern belongs to the system or to the input — **none of which is answerable from
outputs alone.** A blinding that withheld the identity would make the veto structurally
undeclinable-but-unprovable, which is worse than no veto.

**What the reviewer does not have:** access to this repository, in full. Not the prompts, not prior
evidence, not the failure history, and specifically **not `model-contracts.md`**, where T19 freezes
the distribution rule — a blinding phrased as "no prompts or prior evidence" would leave the
threshold readable in canon, which defeats §3.7's claim that the reviewer does not know it.

They return band judgements, the S1–S8 checklist with citations, and prose. The go/no-go is
recorded with its SHA chain.

## 3.9 The Phase 4B rerun-behaviour validation set — classed honestly

Introducing clarification answers changes the effective model input (§B.3), and `v5` was evidenced
with no answer ever present. A small **pre-registered validation set** exercising a rerun with
answers present is run exactly once, after the implementation is frozen and an explicit live-run
authorization is given.

**The sequence is what makes it pre-registered**, and it is fixed in Part IV rather than promised
here. In order: the **machinery and every acceptance criterion are built and frozen while no case
exists** (T4, reviewed and frozen at T5); an **independent author** who built none of it writes the
cases from the published dimensions (T6); they are **independently reviewed for fairness and
leakage** (T7) and frozen at their own input SHA (T8); only then is the assembly they exercise
implemented (T9). A harness written after the cases would be a harness whose author knew what it
had to grade — which is the same defect as a prompt written after a corpus, one level along.

**It is authored to its class, or it is not that class.** §3.4 defines pre-registered validation
as *authored and frozen before the prompt is written, and independently reviewed for fairness* —
so this set is authored by someone who implements **neither T4's machinery nor T9's assembly**, and
receives the same independent fairness and leakage review the `v5` holdout did. A set that skipped
either would be the implementer's own expectations, and calling it validation would be the label
doing work the process did not.

What it is, stated so nobody upgrades it later:

- it is **pre-registered validation evidence** for the new clarification-answer input shape and
  lifecycle;
- it is **not** fresh generalization evidence for EventIdentity `v5`;
- it does **not** reopen, replace or substitute for the spent `v5` sealed challenge;
- it validates the input shape and lifecycle, not the interpreter's creative quality.

Its mechanical and qualitative criteria are frozen at **T5**, strictly before the corpus exists,
and are applied to the run unchanged — not co-frozen with the corpus, which is the arrangement this
sequencing exists to replace. Its slot is wired while its cases are unknown, and its cases are
**not authored in this task**.

**A note on how §3.4's class definition applies here.** That definition says pre-registered
validation is *authored and frozen before the prompt is written*. `v5`'s prompt was frozen long
ago, so what this set must precede is the **assembly** it exercises — T9 — and that is the
substitution being made. T7 still scans the corpus against the frozen prompt and wire schema, so
the original protection is kept as well as adapted, and nothing about the class is relaxed by the
substitution.

---

# Part IV — Implementation decomposition

Small, auditable commits. No adjacent refactors. **Every task is offline** — no provider call is
permitted until the gate that names one.

## Phase 4B

**The causal order is the point, not the numbering.** The evaluation machinery and every acceptance
criterion are frozen **before any validation case exists**, and the cases are authored by someone
who did not build that machinery and does not build the assembly it tests. An earlier draft of this
table had the corpus frozen before the assembly task — now T9 — while letting the harness follow it,
which is the same contamination one level along: a harness implementer who has read the cases can decide how they are
graded. Fixed by ordering, not by a promise.

| # | Task | Files / modules | Depends on | Tests | Acceptance criteria | Model-visible? | Senior review? | Live call? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **T1** | `isProvisional`, `assertAuthoritative`, branded type | `src/lib/ai/event-identity/lifecycle.ts` | — | unit over all valid shapes; brand cannot be cast away | `spec.md §31 — Event Identity and diversity`; `§7.6b`, `§7.7` | no | no | no |
| **T2** | Identity revisions: table, `identity_questions` + `identity_is_provisional`, generated column, pointer trigger, protect trigger, RLS. **Record in the migration that `pg_dump` does not dump generated-column data and a restore recomputes it, so the supported-schema-version list may be extended but never narrowed** — narrowing it would fail every restore and branch clone on historical rows. That fails loudly, which is the right direction, but it makes "extend, never narrow" a rule rather than a preference | `supabase/migrations/…_phase4b_identity_revisions.sql` | T1 | db: a supplied `is_provisional` is rejected; a provisional revision cannot become authoritative even with the column tampered; cross-event pointer refused; updates refused; **TS/SQL parity over the four `v5` journals** | `§7.6b`, `§7.7`, `§9.4` | no | **yes** | no |
| **T3** | `clarification_answers`: table, binding trigger, append-only trigger, RLS; unconditional `events.prompt` immutability trigger | migration; `src/lib/events/clarification.ts` | T2 | db: wrong event, wrong index, wrong `kind`, drifted copy, boundary-defer, duplicate answer, non-member and mis-attributed `answered_by` all refused; `events.prompt` unwritable even by service role | `development-plan.md` 4B (c); `spec.md §31 — Prompt, auth, and generation` | no | **yes** | no |
| **T4** | **Prewire the rerun-behaviour validation machinery, while no cases exist.** Fixed corpus path and filename; fixed output directory; the evidence-class label (§3.9); the corpus structural contract the cases must satisfy; the runner slot; write-once and `PROTECTED_RESULT_DIRS` behaviour; the generic mechanical checks; the qualitative artifact and review contract; **the mechanical and qualitative acceptance criteria themselves**; and **leakage-scan coverage of two surfaces, not one** — the new corpus path, *and* the assembly's own static model-visible text as a third scanned surface beside the prompt and wire schema (see below, and note that `prompt-leakage.test.ts` hardcodes `SURFACES` today, so this is a T4 edit or it is never a legal one) | `src/lib/ai/evals/*`, runner slot | T3 | unit/static only, per the operational rule. **A named test asserts the corpus is absent and the slot refuses**, so the prewiring is verified without a case existing — the `challenge2` arrangement, reused | `model-contracts.md §4.5` | no | **yes** | no |
| **T5** | **Freeze and independently review the validation tooling.** Nothing below may change T4's paths, checks or criteria | — | T4 | the T4 suite, green at the freeze SHA | `model-contracts.md §4.5`; `spec.md §11.9` discipline | no | **yes** | no |
| **T6** | **An independent author writes the pre-registered rerun-behaviour cases**, working from the published capability and contract dimensions only — not this repository, not T4's checker source, and not the assembly they will exercise. Not the implementer of T4 or T9 (§3.9). The file lands in the repository at T8, not here | the corpus file, authored outside the repository | T5 | the frozen T4 structural contract accepts it | `model-contracts.md §4.5` | no | n/a — authored, not implemented | no |
| **T7** | **Independent fairness and leakage review of the corpus.** A collision with pre-existing production or model-visible text is fixed **at the corpus**, by its author — never by relaxing the scanner or the checker (§3.5) | — | T6 | leakage scan against the frozen prompt and wire schema; fairness read | `model-contracts.md §4.5` | no | **yes** | no |
| **T8** | **Freeze the corpus at its own input SHA**, in a commit that adds the corpus file and nothing else | the corpus file alone | T7 | the T4 suite still green; the absence test retires without a source edit | `model-contracts.md §4.5` | no | **yes** | no |
| **T9** | Input assembly + `EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION` → `event_identity_input_v2`. It **may** see the already-frozen cases — this is honestly pre-registered validation, not a sealed challenge — because the machinery that grades them was frozen at T5 and the cases at T8 | `src/lib/ai/versions.ts`, `src/lib/ai/provider.ts`, `src/lib/ai/openai/event-identity.ts` | T3, **T8** | `input-assembly-drift.test.ts` version-named golden files; an assembly change under an unchanged version fails against its own file; one file per declared value; `prompt` byte-identical across rounds; **leakage scan clean — the assembly's static text against the frozen corpus** | `spec.md §31 — Prompt, auth, and generation`; `§7.6b`; guardrail `§32 #9` | **yes** | **yes** | no |
| **T10** | Orchestration: run → persist → branch → rerun | `src/lib/generation/identity-orchestrator.ts` | T1–T3, T9 | unit + db: provisional blocks; rerun creates a revision; repeated boundary rounds; no cap; idempotent refresh; a late Route A answer leaves an in-flight batch untouched | `§7.6b`, `§7.7`, `§31 — Creation Mode` | no | **yes** | no |
| **T11** | Minimal clarification surface | `src/app/…` per `screen-spec.md` | T10 | e2e at 390 and 1280; keyboard, focus, contrast | `§31 — Creation Mode`, `§31 — Responsive/accessibility` | no | no | no |
| **T12** | Independent engineering review of the integrated change, then **implementation freeze** | — | T11 | gate items 1–11 all green at the freeze SHA | §4B gate | no | **yes** | no |
| | **▶ 4B GATE — STOP. Explicit authorization required before the one validation run** | | | | | | | |
| **T13** | Run the frozen pre-registered set **exactly once** | — | T12 + authorization | the frozen T4 criteria, applied unchanged | §4B gate item 12 | no | **yes** | **yes — one run** |
| **T14** | Commit the evidence unchanged **and protect its directory in the same change** | `src/lib/ai/evals/corpus.ts`, evidence dir | T13 | offline only; protection verified by pure/unit/static checks, never by running an eval | `model-contracts.md §4.5` | no | **yes** | no |

**Why T4 must name the assembly as a scan surface, and why it is the last chance to.** T9 is
model-visible: §B.3 says the assembly version identifies *how each input is labelled to the model,
in what order they appear, how precedence between them is expressed*. Those are static strings that
ship on every production request, and T9 may legitimately read the frozen cases — so a label or
precedence phrase could echo a case, on a path nothing currently scans. T7's scan is bounded to
text that exists at T7, §3.5's remedy is to fix the collision **at the corpus** and the corpus is
frozen at T8, and the scanner itself cannot be changed after T5. Every escape closes in sequence, so
the surface has to be declared at T4 or the gap is permanent. It is the one finding in this
restructuring with a deadline inside the plan.

(Phase 4C does not have this hole: T21 writes the prompt after the corpora are frozen and is scanned
against them.)

**What T5 freezing before T6 buys.** After the cases are revealed, none of T4's paths, structural
contract, mechanical checks, qualitative contract or acceptance criteria may change to accommodate
them, and the harness is not adjusted because a case is awkward. A corpus that collides with
existing model-visible text, or violates the frozen structural contract, is fixed by its author.
T9 may read the frozen cases — that is what makes this *validation* rather than a sealed challenge,
and the plan says so out loud rather than claiming a blinding it does not have (§3.9).

## Phase 4C — begins only after the 4B gate passes

The same rule holds here, and for the same reason: **the harness and the gate are frozen before any
case exists.**

| # | Task | Files / modules | Depends on | Tests | Acceptance criteria | Model-visible? | Senior review? | Live call? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **T15** | Sibling planner as a pure function + `PLANNER_VERSION` | `src/lib/generation/planner.ts`; reference `proof-b/planner.js` | 4B gate | unit: determinism, distinctness, allotment, tone-constrained fallback, `creativeGuidance` never binding; parity with the proof reference | `§31 — Event Identity and diversity`; `spec.md §7.7`; `CLAUDE.md §5.1` | no | **yes** | no |
| **T16** | `generation_batches` + spend, caps, idempotency | migration; `src/lib/generation/batch.ts`; `rate_limits` wiring | T15 | db: one in-flight batch enforced by index; caps refuse; duplicate keys collide; partial-failure resumption | `development-plan.md` principle 4; `spec.md §10`, `§27` | no | **yes** | no |
| **T17** | `design_intent_artifacts` + `design_concepts.design_intent_artifact_id` + equality check | migration | T16 | db: updates refused; equality check refuses a mismatched snapshot on every enumerated column; FK required | `spec.md §31 — DesignIntent, composition and compiler` (persistence); `§9.4`; `CLAUDE.md §2` | no | **yes** | no |
| **T18** | DesignIntent contract, schema, narrowing, validator — **no prompt** | `src/lib/ai/design-intent/*`; generated files under `docs/model-schemas/` | T17 | unit: semantic invariants, narrowing, repair rules, schema-drift | `spec.md §31 — DesignIntent, composition and compiler`; `model-contracts.md §5`; `§32 #12`, `#21` | **schema descriptions ship** | **yes** | no |
| **T19** | **Prewire the 4C evidence harness and freeze the gate, while no cases exist.** Paths, evidence-class labels, structural contract, runner slots, protection behaviour, leakage-scan coverage, the per-batch and corpus-wide mechanical checks (§3.2), the blind-artifact contract (§3.8), and **the whole of §3.7** — bands, distribution rule, corpus size, same-type composition requirement, S1–S8 and the class thresholds — written into canon | `src/lib/ai/evals/*`, `tests/eval/design-intent.eval.ts`, `model-contracts.md`, this document | T18 | unit/static only; absence tests for both corpora | `model-contracts.md §4.5`; `spec.md §11.9` discipline | no | **yes** | **no — never run to verify itself** |
| **T20** | **Independent authors write the regression and pre-registered corpora**, from the published dimensions only — not this repository, and specifically not T18's `.describe()` strings, which ship to the model and are prompt text under §3.5. Independent fairness and leakage review, then freeze each at its own input SHA | the corpus files alone | T19 | the frozen T19 structural contract accepts them; leakage scan clean | `model-contracts.md §4.5` | no | **yes** | no |
| **T21** | The DesignIntent prompt | `docs/model-prompts/design-intent.system.md` | T19, T20 | leakage scan; independent engineering read for benchmark integrity | `spec.md §31 — DesignIntent, composition and compiler`; `model-contracts.md §5`; `product-doctrine.md` | **yes** | **yes** | no |
| | **▶ STOP — APPROVAL REQUIRED BEFORE THE FIRST LIVE DesignIntent CALL** | | | | | | | |
| **T22** | Freeze; an independent author writes the **sealed** challenge, unseen while T21 was written; one run; blind review; evidence protected in the same change | — | T21 + authorization | the 4A protocol exactly | `model-contracts.md §4.5`; §3.7 | no | **yes** | **yes — one authorized run per set** |

> **The stop point.** No live DesignIntent provider call may happen before T21 is complete, frozen,
> independently reviewed and explicitly approved — and the gate (§3.7) is frozen at **T19**, before
> the prompt is written and before any corpus is authored. Every set is run at most once per
> authorization, and each completed run's directory is protected in the same commit as its
> evidence.

---

# Part V — Gates

## The Phase 4B exit gate

Phase 4B passes when all twelve hold. Items 1–11 are proven offline; item 12 requires the one
authorized live run.

| | Requirement | How it is proven |
| --- | --- | --- |
| 1 | A Route B identity is provisional and cannot flow downstream | type-level (branded `AuthoritativeIdentity`) plus a db test that the authoritative pointer refuses it |
| 2 | A zero-question or Route-A-only identity is authoritative | TS/SQL parity tests over constructed shapes and the four `v5` journals |
| 3 | The original event prompt is byte-identical across rounds | version-named assembly golden files (§B.3) comparing the prompt string sent on round *n* with round 1; **plus a db test that `events.prompt` cannot be updated even by service role** (§B.2) — a refusal, not a source scan |
| 4 | Clarification answers are first-class durable host input with provenance | the §B.2 binding triggers: wrong event, wrong index, wrong `kind`, drifted copy and duplicate all refused |
| 5 | Newer clarification input takes the intended precedence without mutating history | assembly golden snapshots show labelling and precedence; answer rows are append-only; earlier rounds unchanged |
| 6 | Multiple boundary rounds are possible with no lifetime cap | orchestration test driving ≥ 3 boundary rounds; no cap constant exists anywhere (asserted by scan) |
| 7 | Route A never blocks generation | test: an unanswered and a deferred creative question both proceed |
| 8 | A late Route A answer never mutates an in-flight batch | test: batch inputs unchanged; the answer binds to the asking revision; a new round is offered |
| 9 | Refresh and retry are idempotent | test: repeated requests observe one batch and one revision; keys collide |
| 10 | The database cannot mark a boundary-bearing identity authoritative via a stale or false flag | db tests: an `INSERT` naming `is_provisional` is rejected (`428C9`); the pointer trigger still refuses when the column is tampered with directly; an unrecognised `schema_version` and a malformed `clarification.questions` are **refused rather than read as authoritative** (§A.3) |
| 11 | Host/co-host authorization and RLS for answers and revisions are correct | db tests per the existing permission matrix, including negative cases: a non-member cannot answer; a co-host cannot attribute an answer to the owner (`answered_by = auth.uid()`); and **a member cannot move the event's authoritative-identity pointer**, which requires that column to be in `protect_event_server_columns()` (§A.3 property 4) |
| 12 | The pre-registered rerun-behaviour set passes its frozen mechanical and qualitative criteria | T13: one authorized live run after the T12 implementation freeze, graded against the criteria frozen at T5 — **before the cases existed** — and classed per §3.9. Evidence protected at T14, in the same change |

Plus the standing gate: deterministic checks green, independent engineering review, and an explicit
go/no-go recorded with its SHA chain.

## The Phase 4C exit gate

§3.7 in full — the distribution rule **and** the systemic veto, both frozen at T19 before the prompt
exists and before the sealed corpus is authored, with the reviewer protocol of §3.8. Neither half
can be waived by the other.

---

# Resolved decisions

| | Decision | Resolution |
| --- | --- | --- |
| **1** | Phase letters | **Canonical split kept.** 4B = clarification; 4C = planner + DesignIntent. No letters renamed or shifted. Continuous workstream permitted, separate gates required, and 4C does not begin until 4B passes |
| **2** | Does `v5` need prompt prose about clarification answers? | **No — and the input layer gets its own version.** `event_identity_v5` stays; answers are carried in the request envelope; `EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION` identifies the envelope, is persisted on every revision and run, bumps on any precedence/labelling/ordering/representation change, and is drift-tested against version-named golden files. A pre-registered rerun-behaviour set is run once, later, under explicit authorization — with its machinery and criteria frozen before its cases exist, and its cases written by someone who implemented neither (Part IV, T4–T9) |
| **3** | Do siblings see each other? | **Blind and parallel.** No convergence-triggered re-prompt in the first implementation. Convergence and distinctness are first-class telemetry, mechanical where honest and qualitative where not; a later mechanism is a deliberate spec decision argued from evidence. **A DesignIntent call receives the identity and its assignment only** — the directive, token allotment and capabilities belong to composition (`spec.md §7.7`, `provider.ts`), and an earlier draft of this plan wrongly sent them here |
| **4** | Where do DesignIntent-only artifacts live? | **A dedicated immutable `design_intent_artifacts` table.** The earlier nullable-then-fill recommendation is withdrawn: it contradicted `protect_design_concept()`. `design_concepts` is inserted only after composition, gains a `NOT NULL` FK to the artifact, keeps its inline `design_intent` as an immutable snapshot with insert-time equality enforced, and remains the stable concept identity from composition onward |

---

# Canonical ambiguities raised, not resolved

Two tensions live in canon rather than in this plan. A plan document orders work and defines no
requirements, so neither is settled here; both are raised for an explicit product decision under
`CLAUDE.md §12`.

### CA-1 — what reaches the DesignIntent call

`spec.md §7.7` is unambiguous: *"The assignment is passed to the DesignIntent call; the directive,
allotment and DesignIntent are passed to the composition call."* `provider.ts` encodes it, and §E
follows it.

But `spec.md §7.10 #3` says the three DesignIntent calls run *"using real details where present and
provisional content elsewhere"*, which reads as event content reaching DesignIntent — content that
`§7.7` does not give it and `GenerateDesignIntentInput` has no field for.

The plan follows `§7.7`, the more specific and more recently exercised statement. If content or
capabilities genuinely must reach DesignIntent, that is a change to `spec.md §7.7`,
`model-contracts.md §5.2` and `provider.ts` requiring explicit product approval — not a line in an
ordering document. **Raised, not resolved.**

### CA-2 — provisional state is defined by JSON shape

`spec.md §7.6b`: *"No output field marks this — the presence of a boundary-kind question is the
machine-readable signal."* That is the root of §A.3's difficulty: a safety-critical signal derived
by path-matching has no schema-version-proof reading, and the best a database can do is refuse
shapes it does not recognise (which is what §A.3 now does).

A durable fix would be canonical — a stable marker on the envelope, or a versioned reader contract
— not a SQL patch. It is not needed for Phase 4B, because refusing unknown shapes is safe. It will
be needed the first time the envelope's schema version changes. **Raised, not resolved.**

### CA-3 — where the `presentation` object arrives

Four canonical statements put the non-design `presentation { name, description }` object on the
**DesignIntent** response: `model-contracts.md §5.1`'s contract block, `spec.md §31 — Model design
output` (*"a six-field `DesignIntent` plus a non-design `presentation` object"*), `§31`'s
DesignIntent acceptance bullet, and `§32 #12` and `#21`.

`spec.md §7.8`'s prose reads the other way — *"The same response also carries a `presentation`
object"* follows the CompositionTree paragraph, which makes it sound like composition's.

The plan follows the four, per the source-of-truth order, and scopes `presentation` into 4C (§E,
§G.2, §3.8). The fix is a one-line clarification in `spec.md §7.8`, not a plan-side workaround.
**Raised, not resolved.**

---

*Nothing in this document changes production behaviour, and no part of it is approved for
implementation until reviewed and explicitly authorized. The next implementation authorization is
expected to be for **Phase 4B only**.*
