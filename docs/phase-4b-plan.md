# Phase 4B and 4C plan — clarification lifecycle, then planner and DesignIntent × 3

**Status:** Phase 4B is **closed — GO** (Part V, *The Phase 4B close*). **T1–T14 have shipped** —
the identity-revision and clarification-answer migrations, the frozen T4/T5 validation machinery,
the T8 corpus frozen at its own SHA, `event_identity_input_v2`, **T9A**'s call-level spend,
idempotency, claim and telemetry controls, T10's orchestration, T11's clarification surface, the
T12 implementation freeze, the one authorized T13 validation run, and T14's evidence commit and
protection. **The whole of Phase 4C is still plan only**, and does not begin until it is separately
authorized.
The original header read *"plan only … no production code, prompt, schema, migration or corpus
exists for any of it"*; that stopped being true at T1 and is corrected here rather than left to
mislead a reader deciding what 4B still owes.
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
2. **Provisional** → the event is *awaiting clarification*, a state **derived** from the revision
   and never stored as an `event_status` value (§A.8). No planner, no DesignIntent, no batch, and
   nothing started optimistically (§I). The question is surfaced.
3. The host answers. The answer is persisted (§B), **not** merged into the prompt.
4. Identity runs **again**: original prompt unchanged, plus the answer as current host input. New
   revision.
5. Authoritative → it becomes the event's authoritative identity and generation may proceed.
   Another boundary question → provisional in turn, loop repeats. `spec.md §7.6b`: **no lifetime
   cap** — *"a spent quota is not authority."* Round count is telemetry, never a limit that forces
   the system to proceed without authority.

### A.5 Spend, idempotency and telemetry before the first production identity call

Binding source: `development-plan.md` principle 4 — *"Spend controls ship with the first production
model call, not in hardening"* — `spec.md §10` (the six configurable backend safety limits),
`spec.md §9.6` (per-call usage metering), `spec.md §6` (*"limits apply at both the event and
acting-account level, regardless of whether the caller is the owner or a co-host"*), and
`spec.md §32 #41` (*"Do not expose backend generation/spend counters"*). Phase 4's own exit
condition in `development-plan.md` is **"uncontrolled model calls impossible"**.

**The boundary this section defends.** `generateEventIdentity` is reachable today only from eval
runners under explicit authorization. It becomes reachable *by a host* the moment T10's orchestrator
entry exists behind an authenticated request; T11 only puts a control on it. **T10 is the first
production model call**, and the argument "T10 is not really production because there is no surface
yet" is not available while T11 is wired to T10. Every control below therefore lands in **T9A**,
which T10 depends on — the plan does not schedule protection after the thing it protects.

**The split.** `spec.md §10` lists six safety limits. Exactly **one** — *"one generation batch in
flight per event at a time"* — is batch-shaped and legitimately waits for `generation_batches`
(§G.5, T16). The other five are call-level and are Phase 4B's, together with the per-call usage
metering `spec.md §9.6` requires, which §10 does not list because it lives in §9.6 and §29. Phase 4B
owns:

| # | Phase 4B (T9A), in place before T10 is reachable | Mechanism |
| --- | --- | --- |
| 1 | per-event generation cap | `consume_rate_limit` bucket `identity:event:day`, keyed on the HMAC-hashed `event_id`. Event-level, so it spans owner and every co-host (`spec.md §6`) |
| 2 | per-account generation cap | bucket `identity:account:day`, keyed on the acting `user_id` — the actor, not the owner |
| 3 | global/project spend ceiling, refused **before** the call, and **serialized across events** | a pre-call check against recorded spend: the sum of `generation_runs.cost_estimate_usd` over the ceiling window, plus the reservation held by claims still in flight. Cost is knowable only after a call, so the bound is *recorded spend + (in-flight claims × the **logical-call** maximum)*, stated as a bound and never as exact spend. **An `expired_unknown` claim with no run row is reserved for too**, within the same window: it reached that state because the provider was invoked and we never learned the outcome, so §A.5.1 rule 2 costs it at the maximum — and being terminal with no run row it would otherwise drop out of both terms the instant it settled, which is fail-open in precisely the ambiguous, expensive case the rule exists for. **`cost_estimate_usd` is nullable and nothing populated it before T9A, so a null counts as the logical-call maximum, never as zero** — a ceiling that silently under-counts is the fail-open shape §A.3 exists to refuse. Admission is serialized on one dedicated advisory key for the few statements it takes, because an unserialized ceiling read is not a ceiling: N simultaneous claimers on different events each see the same reservation, each conclude there is room, and all pass. The lock is transaction-scoped and the provider is reached in a later transaction, so a model call never holds it — but every admission *and every refusal* does queue behind it, which is the throughput cost of having a real ceiling. How both the estimate and the maximum are computed is §A.5.1, and it is the part of this row that is easiest to get wrong |
| 4 | alert/observability path for the ceiling | a structured server-side alert record emitted when the window crosses its warn fraction and again at refusal, carrying window, recorded spend, ceiling and the refusing bucket. Delivery channel (email/pager) is explicit debt, not a new dependency — `technology-decisions.md` is locked |
| 4b | the request is billed the way the cost profile assumes | `service_tier` and `store` are sent explicitly on every request rather than inherited. Left unset the tier comes from provider or project configuration, and the profile is built against standard pricing — Fast Mode is 2× and Batch/Flex are ½ — so an inherited tier would price a call against a bound that does not describe it. Both are part of `modelConfig`, so another tier is a different attempt key and needs its own verified profile. `store: false` because EventIdentity is stateless: the repair resends the rejected turn explicitly, so nothing needs the provider to retain host prompts and model output in a store we neither read nor purge |
| 5 | rate limiting before the provider is reached | the claim RPC (below) runs to completion before `generateEventIdentity` is called at all. There is no provider factory to intercept — the client is constructed **inside** `generateEventIdentity` (`new OpenAI(…)`) — so the observable boundary is that function. **T9A proves the half it can**: the claim RPC refuses and returns before anything reaches the provider, and no module in T9A calls `generateEventIdentity` at all. The behavioural assertion that a refusal is never *followed* by a provider call belongs to **T10**, which is where the two are first composed — asserting it here would mean writing the composition inside a test and then testing the test. An earlier draft of this row named a `createOpenAIClient` seam that does not exist, and a later one claimed T9A made the assertion; neither was true |
| 6 | deterministic idempotency for an EventIdentity request | the attempt key below. Derived from the request, never random, never a client-supplied token |
| 7 | a concurrency claim so two requests cannot both pay | `event_identity_call_claims`, unique on the attempt key, **inserted before the provider is reached**. A uniqueness conflict that only surfaces after two calls have completed is not idempotency |
| 7b | **one identity call in flight per event** | a partial unique index over `(event_id)` where the claim is non-terminal. The key alone is not enough: the basis contains `model_config_digest` and three versions, so a rolling deploy between a host's request and their refresh produces a *different* key and would otherwise start a second paid call while the first runs. This is a **call-level** guard on identity calls and is not `spec.md §10`'s one-batch-in-flight rule arriving early — it knows nothing about batches, siblings or planning, and T16's rule still lands at T16. Because `response_captured` is non-terminal, this index also refuses a *legitimate* new call while one sits unrecovered; that is why §A.6 step 3's lookup is event-scoped and completes it on the hot path, rather than leaving recovery to the sweeper |
| 8 | usage telemetry per call | `generation_runs` as specified by `spec.md §9.6`, plus `input_assembly_version` (§B.3) and the paid-response evidence of §A.7 |

#### A.5.1 Cost accounting, and the cases that would have undercounted it

The ceiling in row 3 is only as good as the number it sums. The existing boundary makes this
harder than it looks, in four ways that a naive implementation gets wrong in the direction of
spending money:

- one logical `generateEventIdentity` call may make **several provider attempts**, because
  transient failures are retried inside it;
- it may produce **two billable responses**, when the first fails validation and the repair pass
  succeeds;
- it reports usage from the **final accepted response**, so the rejected first response's tokens
  would simply not be counted;
- a timeout or connection loss means **no response reached us**, which is not the same as the
  provider having done no billable work.

The correction, in four rules:

1. **Aggregate every observed response — but price each one separately.** The usage recorded for a
   logical invocation sums every provider response actually received, rejected and accepted alike:
   a successful repair records response 1 + response 2, an `invalid_output` failure records both,
   a provider failure on the repair path still records response 1. The ordinary `generation_runs`
   token columns therefore describe the invocation, not its last response, and
   `provider_request_id` keeps its singular shape as the **accepted or final** response's id rather
   than an identifier for every attempt. Usage is never smuggled into `reprompts`.

   **Pricing, though, reads per-response usage, because price is not linear across a call.** The
   long-context tier applies per request, so one attempt can cross the threshold while another does
   not; summing first and pricing afterwards charges both at whichever rate the aggregate happened
   to land in, and then calls the answer exact. Three further things the naive sum gets wrong:
   `output_tokens` **already includes** `reasoning_tokens`, so adding them bills reasoning twice —
   and on a high-effort call reasoning is most of the output, so the error is large; cache
   **writes** are billed at a premium over uncached input while cache **reads** are heavily
   discounted, so the two cannot share a column or a rate; and an input token that is neither is
   ordinary uncached input.
2. **Ambiguous attempts are costed, not ignored.** A provider attempt that threw before a response
   reached us may or may not have billed. We cannot know, so it contributes the **per-attempt
   maximum**, never zero. The boundary reports how many attempts had unknown usage, so the
   arithmetic is reviewable rather than inferred.
3. **Fail closed when usage is unavailable.** A response missing a billable token class, a response
   the summary claimed but the detail never described, and every attempt under an unverified
   profile are all priced at the per-attempt maximum. `exact` means literally that every observed
   response was priced from a verified profile at its own tier with every billable class present,
   and that no attempt's usage was unknown; anything less is `exact = false` with the unknown
   portion costed conservatively. There is no optimistic fallback.
4. **The maximum bounds the whole logical call.** `MAX_PROVIDER_ATTEMPTS_PER_CALL = passes ×
   (MAX_TRANSIENT_RETRIES + 1)` — 6 today — and the logical-call maximum is the per-attempt
   maximum times that. Defining it as one successful response would make the row-3 inequality
   false, because a single claim can cost six attempts. It is pinned to the retry and pass policy
   by a test, exactly as the lease is (§A.5), so raising `MAX_TRANSIENT_RETRIES` cannot silently
   raise worst-case spend past the reservation the ceiling already made.

**No invented token ceiling.** `generateEventIdentity` enforces no application-level output-token
limit, so the per-attempt maximum is **not** derived from "our bounded token ceiling" — an earlier
draft of row 3 said it was, and that bound does not exist. Adding a tight output limit for cleaner
accounting could change what EventIdentity produces, which is a creative decision and not an
accounting one (`CLAUDE.md §2`).

**Verified cost profiles, and a production contract that fails closed.** The bound instead comes
from a **cost profile for one exact model id**, recording the provider documentation it was read
from and the date. "Verified" is a property of that record, not of a number appearing in an
environment variable — which is why an override can only make a bound *more* conservative and can
never establish one. Production requires a profile for the configured `OPENAI_MODEL` and refuses
before the provider is reached without it, so changing the model to something nobody has priced
fails at configuration time rather than reserving one model's worst case against another model's
bill. Development and tests fall back to a labelled unverified profile whose bound is deliberately
larger than any verified one. None of this is an operator ritual: nothing is presented for
approval and no secret unlocks it — either the profile exists for this model or the call does not
happen.

**A profile expires.** Prices move and published commitments are time-bounded, so each profile
carries `reverifyAfter`: usable through that day inclusive, stale from the following UTC day, after
which production refuses a **new paid attempt** against it. A bound nobody re-read is the same
failure as one nobody verified — it just takes longer to become false. Re-verification is a person
reading the current documentation, moving the numbers if they moved, updating the dates and bumping
the version; nothing fetches pricing at runtime.

**The global ceiling is a production decision, not a default.** Development keeps one for
convenience; production requires `IDENTITY_CEILING_USD` explicitly and refuses — before a claim
exists — when it is missing, malformed or non-positive. How much this product may lose in a day has
an owner, and inheriting a developer's local number is that decision being skipped rather than made.

The bound is the worst legal request at the worst tier: every input token billed as a cache write
at long-context rates, plus the largest permitted output, rounded up. It is stored on the profile
rather than recomputed, so a pricing edit cannot move the reservation without the profile version
moving too — and that version is persisted as provenance beside the call it priced, so a revision
can say which bound its spend was reserved against, not merely which model answered.

**Refusals never leak a counter.** `spec.md §10` says creative work is *"effectively unlimited from
the user's perspective"* and `§32 #41` forbids exposing backend counters. A refusal is a neutral
"not available right now" with a server-side reason code. The **client-visible payload is identical
for every refusing control** — cap, ceiling, rate limit or in-flight guard — so which limit was hit
is not inferable either; only the server-side record distinguishes them. (Today's
`RateLimitedError(rule.bucket)` names its bucket, which is fine internally and must not reach a
response body.) It never says how many are left, and the
caps stay configurable backend safety limits rather than a user-facing quota (`spec.md §10`:
*"Do not impose an arbitrary user-facing cap before testing"*).

**These are not an arming token.** §H.2's rejection of *"arming token, confirmation secret or two-key
execution"* stands. A claim row is a server-derived uniqueness reservation computed from the request
itself; there is no second key, no human-supplied secret, and nothing for an operator to arm.

#### The EventIdentity attempt key

```text
basis_digest = sha256(
  events.prompt (exact bytes) ‖ ordered clarification_answer_ids ‖
  prompt_version ‖ schema_version ‖ input_assembly_version ‖ model_config_digest
)
attempt_key  = sha256(event_id ‖ 'event_identity' ‖ basis_digest ‖ attempt_ordinal)
```

`model_config_digest` covers everything that changes the request bytes without changing the three
versions: the model id and the reasoning effort today (`OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`),
plus any future request-shaping provider option. It is in the basis so that a config change is
honestly a different call — with the consequence §A.5's in-flight guard (row 7b) exists to contain.

The property that makes it work: **two requests that would send the same bytes to the model share a
key.** A double-tap, a refresh and a replayed POST all recompute the same basis and collide. A new
clarification answer changes `ordered clarification_answer_ids`, so a genuine new round is a
different key and a legitimately new paid call — which is why the answer ids are already ordered and
durable (§B.2). `attempt_ordinal` is **derived server-side, never carried on the request**, and the derivation has
two modes that an earlier draft ran together into a rule that contradicted itself:

- **Observing.** If a non-terminal claim exists for this basis, its ordinal *is* the answer. This is
  the path §A.6 steps 2→3 need for cases A, B and C — you cannot observe an in-flight claim without
  being able to derive its key — so it must not be refused.
- **Creating.** A *new* claim takes `coalesce(max(attempt_ordinal) over terminal claims for this
  basis, -1) + 1`, and creating one is refused while any non-terminal claim for that basis exists.

So it is 0 until a host explicitly retries a terminally failed attempt, it cannot become a silent
re-roll, and — the case a client-supplied or per-click counter would get wrong — **two clicks on
`Retry` derive the same ordinal, collide on the unique index and produce one call.** `(batch_id, operation, concept_index,
attempt)` — §H.2's key — is the *sibling* key and does not exist yet; this one does not depend on it.

#### The claim lifecycle

`event_identity_call_claims`: `attempt_key` unique, `event_id`, `basis_digest`, `attempt_ordinal`,
`claimed_by`, `claimed_at`, `lease_expires_at`, `provider_invoked_at` (nullable), `state`,
`generation_run_id` (nullable). `basis_digest` and `attempt_ordinal` are stored rather than
recovered from the key, because the key is a sha256 and the ordinal rule above has to ask both
*"is there a non-terminal claim for this basis"* and *"what is the highest ordinal among terminal
claims for this basis"* — neither question is answerable from a hash.
**Server-only, on the phase-1 pattern**: RLS enabled with no policies and
`revoke all … from anon, authenticated`. Per-event in-flight state and attempt ordinals are backend
generation counters, and `spec.md §32 #41` says not to expose those — leaving Supabase's default
grants in place would hand `authenticated` a `SELECT` on exactly that.

| State | Meaning | Exit |
| --- | --- | --- |
| `claimed` | the key is reserved; no provider client has been constructed | → `response_captured`, `failed_terminal`, or lease expiry |
| `response_captured` | the provider answered and the run row **including its evidence** is committed; the revision is not yet written | → `succeeded` by deterministic completion, with **no second model call**. This is **not** terminal and **must not** be left to a lease: the next request **on this event** completes it inline (§A.6 step 3) — on the event, not on the key, because a deploy or a new answer changes the key and the completer must still find it — and the sweeper completes any that no request returns for. It has **no lease expiry**, because expiring it would strand a paid response; for the same reason **§A.7's evidence purge must skip every run referenced by a non-terminal claim**, or the purge reintroduces the wedge the missing expiry was avoiding. Its other exit is → `recovery_failed` |
| `succeeded` | revision appended, pointer moved where allowed | terminal |
| `failed_terminal` | the **call** failed: a provider failure, or `invalid_output` after the one repair. The second of those *was* paid for and its responses are captured as evidence like any other — an earlier version of this row said "nothing paid for", which is true only of the first | terminal; a retry is a host action |
| `expired_unknown` | the lease elapsed with `provider_invoked_at` set and no captured response | terminal; **explicit host retry only** |
| `abandoned` | **provably unpaid**: committed `provider_invoked_at` null and no run row. Reached by the short pre-invocation reclaim below, or by lease expiry, whichever comes first | reclaimable automatically: provably no call was made |
| `recovery_failed` | the call **succeeded** and recovery failed: the captured text no longer validates, its schema version has no reader in this build, or the database refuses the completion deterministically | terminal; a retry is a host action. Distinct from `failed_terminal` because the diagnosis and the fix differ, and terminal because `response_captured` has no expiry — without this state one undeliverable response would hold that event's only in-flight slot for ever. The run row and its evidence are untouched and age out on the ordinary schedule |

#### Who recovers, and when

**Active recovery is request-driven. The daily job is only a backstop.** A host who is waiting must
never be waiting on a scheduled job. So every orchestration, re-entry and status request, before it
considers any new spend, does two things for **this event** inline:

1. **reclaims a claim that provably never reached the provider** — still `claimed`, committed
   `provider_invoked_at` null, no run row, and older than a **thirty-second** threshold. This is a
   different instrument from the lease and deliberately so: the lease is long because it bounds
   work that MAY have been paid for, and using the same clock for work that provably cost nothing
   left an actively waiting host sitting out fourteen minutes for a crash between step 4 and step
   5. Safety here is three database facts; the interval only decides eligibility, and the race
   against `mark_identity_call_invoked` is settled by the row lock;
2. **expires its due claims** — a claim whose lease elapsed is moved to `abandoned` or
   `expired_unknown` by the same rules the backstop uses. This is not optional politeness: a
   process that died after reaching the provider leaves the claim in `claimed`, and the
   one-in-flight index refuses every new call while it sits there. If only the scheduled job could
   clear it, a single crash would cost that host a day;
3. **completes a `response_captured` claim** (§A.6 step 3), with **no model call**.

A refresh, a reconnect, a status poll or a duplicate POST is therefore sufficient to finish either
state immediately.

The scheduled job exists for the other case: work nobody comes back to. Its role is eventual
cleanup and recovery for abandoned events, and it runs **once a day** — the platform plan this
project is on caps cron frequency at once daily and rejects anything more frequent at deploy time,
with per-hour precision (±59 minutes). That constraint is survivable only because of the sentence
above: a cadence measured in hours cannot be on a waiting person's path, and T10 is built so that
it is not — the orchestrator's settle step runs both obligations inline, on every orchestration and
every status read, before anything considers new spend, and a test refuses to let the orchestrator
reach for the sweeper at all. It is one implementation, not a request-side copy of the job: a
second function that merely looked equivalent is exactly how the two would drift, and the one
written here also settles a captured claim whose run row cannot be read — which the job's own
pending query, an inner join on `generation_runs`, would skip and thereby leave wedged.

**Giving up is bounded by age, not by attempts.** A failure that will fail identically next time —
an integrity violation, a data exception, an unsupported feature — terminates at once. Anything that
might be transient is held and retried, terminating only once the captured response has aged out
(two days). Counting attempts instead looks equivalent and is not: with the sweep on any short
cadence a three-attempt rule is a minutes-long rule, and one statement timeout or one
migration holding a lock would irreversibly terminalize every captured response in the backlog —
each of those hosts then paying again for a call that had already succeeded. The sweep also stops
early when several claims in a row fail the same way, because then the claims are not the problem.
Every terminal give-up reaches the alert sink, not only the log: the host paid, the response exists,
and the only way forward is for them to pay again.

**This trade has one named dependency.** Holding rather than terminalizing means a *permanent*
systemic fault drains a backlog slowly — roughly two age-checks per sweep once the halt engages —
and that is acceptable only because somebody is told. The sink's default is `console.warn` and its
delivery channel is the same explicit debt as the ceiling alert's (§A.5 row 4). Recorded here so it
reads as a known dependency rather than an assumption: an unread alert turns "hold and alert" into
"hold".

**Reclaiming and the right to spend are one condition.** `mark_identity_call_invoked` requires a
live lease as well as `claimed` and a null `provider_invoked_at`. That is what makes request-driven
reclaim safe: a driver whose pre-invocation claim was expired — by a request, by the backstop, or
merely by the lease elapsing before either ran — cannot afterwards reach the provider, because its
step 5 matches no row and the caller must read `false` as *do not call*. Without the lease in that
predicate the guarantee would rest on arithmetic instead: an expired `claimed` claim reserves
nothing against the ceiling, so "reserves nothing" and "cannot spend" have to be the same fact, and
the only reason they agreed before was that the boundary's own timeout happens to be shorter than
the default lease — two independently settable numbers.

`provider_invoked_at` is written **and committed in its own transaction** before the provider is
reached; the safety argument below depends on that commit, so it is a requirement, not an
implementation detail. A crash between that commit and the HTTP send yields a false positive — a
claim we treat as possibly-paid that was not. That is the safe direction: it costs the host a click
and never costs money, and the plan states it rather than claiming a precision the network cannot
give. `abandoned` is the one transition in this design that re-spends without a host decision, which
is exactly why it may be reached only from a claim whose committed `provider_invoked_at` is null.

**The lease floor is derived, not chosen.** A lease shorter than a legitimate call turns the one
mechanism built to stop double payment into the thing that causes it: a live call is declared
`expired_unknown`, the host retries, and a second call runs beside the first. The boundary's bounded
worst case today is two passes × (`MAX_TRANSIENT_RETRIES` + 1 = 3) attempts × a 120 s timeout, plus
the 500/1500 ms backoffs — about **12 minutes**, against a ~30 s median (§J). The lease must exceed
that worst case with margin, and T9A pins the two together in a test, so changing
`MAX_TRANSIENT_RETRIES` or the timeout fails until the lease is recomputed. An unpinned lease is a
money bug waiting for a config change.

#### What is guaranteed, and what is not

- **At-most-once per attempt key.** The unique index refuses the second claim *before* any provider
  client is constructed. Uniqueness happens before spend, not after it.
- **Idempotently observable.** A concurrent or repeated request observes the existing claim and its
  terminal result rather than starting a call, and consumes no cap unit. The lookup is *event*-scoped
  (§A.6 step 3); the key then decides whether that claim is this request's own answer or a recovery
  it must resubmit behind.
- **Not exactly-once.** The provider API offers no exactly-once guarantee and this plan does not
  invent one. A crash after invocation and before capture can leave a paid call with no row. That
  resolves to `expired_unknown` and an explicit host retry — never a silent second purchase.

| | Case | Behaviour |
| --- | --- | --- |
| **A** | two simultaneous first requests | identical basis → identical key; exactly one `INSERT` wins; the loser converges on observing the winner. One provider client is constructed, not two |
| **B** | refresh while a request is in flight | the event-scoped claim lookup precedes every cap and every call. The refresh is a read of the existing claim. If a deploy changed `model_config_digest` or a version between the two requests the key differs — row 7b's one-in-flight guard, not the key, is what refuses the second call there |
| **C** | repeated POST after completion | same key, terminal claim; the recorded result is returned. No call, no cap unit |
| **D** | crash before provider invocation | committed `provider_invoked_at` null and no run row → `abandoned` after the thirty-second pre-invocation threshold, or at lease expiry if nothing asks sooner → reclaimable automatically. No double spend, no host action. The cap and ceiling units consumed at §A.6 step 4 are **not** returned: an abandoned claim costs quota it did not spend money on, which is the conservative direction and deliberately not a refund path |
| **E** | crash after invocation, before persistence | `expired_unknown`. The response is genuinely lost; the host is told the attempt could not be recorded and retries deliberately, incrementing `attempt_ordinal` |
| **F** | retry after an `invalid_output` terminal failure | never automatic. A host action derives the next `attempt_ordinal`, producing a new key, a new claim and a new paid call, subject to every cap |

Two co-hosts answering *different* open questions at the same moment produce two different answer
sets, two different keys and therefore two paid calls in the same round. That is correct — they are
genuinely different requests — and it is bounded by the event-level cap, which spans all
collaborators (`spec.md §6`), not by the key.

**Out of scope here:** because a refusal rolls back every counter it touched (§A.6 step 4), nothing
in this section throttles the *volume* of refused requests. Refused requests cost no money and start
no call, and ordinary authenticated-endpoint abuse control is where that belongs; it is named so
nobody later reads the rollback as an oversight.

Every retry in this design, including one after a `provider` failure that paid for nothing, is a
host action. A transient provider outage therefore surfaces as a retryable error rather than an
automatic re-attempt — `generateEventIdentity` already exhausts its own bounded transient retries
inside the call. That is deliberate, not an omission.

### A.6 The authoritative T10 order, and its crash boundaries

1. Authenticate; authorize the actor as owner or co-host of the event (the existing matrix).
2. Resolve the exact `events.prompt` bytes and the ordered `clarification_answer_ids` visible now;
   derive `basis_digest` and `attempt_key`. **Before any cap is touched**, so cases B and C cannot
   burn quota.
3. **Look up any non-terminal claim for this event** — event-scoped, not key-scoped. An earlier
   draft looked the *key* up and justified it by saying the basis cannot change; row 7b of §A.5 says
   the opposite and is right, because a deploy or a new answer changes `model_config_digest` or an
   answer id and therefore the key. A key-scoped lookup would find nothing, step 4's non-terminal
   `(event_id)` index would refuse the insert, and the event would be blocked with no completer on
   the request path at all.
   - a claim **whose `basis_digest` matches this request** is this request's own: observed and
     returned in `claimed` or a terminal state, or completed first when `response_captured` (below)
     and then returned; stop;
   - a claim whose basis **differs** — the deploy or new-answer case — is still completed when it is
     `response_captured`, because leaving it is what wedges the event. But its revision is **not**
     this request's answer: it was computed from a basis that does not include, say, the
     clarification answer this host just submitted. The request receives an explicit *another
     identity call for this event was in flight and has just been recovered; resubmit* state, never
     someone else's revision presented as its own. It resolves on the resubmit: the recovered claim
     is terminal by then and non-matching, so control falls through to step 4 and the host's own
     round begins. No spend, no wedge, and no silent substitution.

   **The completion is gated by the state transition, not by the sequence.** It begins with
   `update event_identity_call_claims set state = 'succeeded' where id = $1 and state =
   'response_captured' returning *`; step 7 runs only if a row came back. **That update and step 7
   are one transaction**, unlike the deliberately separate commits of steps 5, 6 and 7 elsewhere in
   this section — so the claim row's own lock is what serialises two completers, and there is no
   window in which a claim reads `succeeded` (*"revision appended, pointer moved where allowed"*)
   with no revision behind it. Committing the transition first would orphan a paid response behind a
   claim no completer can find, and the host's next attempt would pay again. Without that, two
   completers — two requests, or a request and the sweeper — both read `response_captured` and both
   run step 7, and `validate_identity_revision()` will *not* stop the late one: it recomputes
   `max(revision) + 1` at insert time, so the second completer appends a second revision of one paid
   response and repoints the event at the duplicate. Belt and braces, the migration also puts
   `unique (generation_run_id)` on `event_identity_revisions`, so one paid call can produce exactly
   one revision as a database fact rather than as a property of the code path.
4. Otherwise, **one RPC in one transaction**: global ceiling → per-event cap → per-account cap →
   rate limit → `INSERT` the claim. A refusal rolls the whole transaction back, so a later refusal
   does not consume an earlier bucket's unit. (`consume_rate_limit` increments then compares; run
   per rule in its own transaction, as `enforceRateLimit` does today, a refusal would silently spend
   a unit of every bucket checked before it. That is why this is one RPC and not four calls.)
5. Write and **commit** `provider_invoked_at` in its own transaction, then invoke
   `generateEventIdentity` **once**. The commit is what makes `abandoned` mean *provably unpaid*
   (§A.5); an uncommitted write would make the only automatic re-spend in the design unsafe.
6. **First commit — capture what was paid for.** `INSERT generation_runs` with usage, versions,
   `input_assembly_version`, the §A.7 evidence, and **the attempt key stamped into the already-unique
   `generation_runs.idempotency_key`** — without it a retried step 6 writes two run rows for one paid
   call and double-counts the spend the §A.5 ceiling reads back. Move the claim to
   `response_captured` (or `failed_terminal`). This commit exists so a crash after it never costs
   another call.
   On the failure path, `generation_runs.model`, `prompt_version`, `schema_version`, `latency_ms`
   and `success` are `NOT NULL` and **none of them arrives on the result**:
   `EventIdentityError.usage` is `Partial<EventIdentityUsage>` carrying only `latencyMs` and
   `transientRetries`, and a validator bug rethrows something that is not an `EventIdentityError` at
   all and carries no usage — yet §A.7 still gives that case an evidence value, so a row is written.
   Those columns therefore come from the **request side**: the versions and model configuration the
   orchestrator resolved at step 2, `success = false`, and a latency measured by the orchestrator
   when the boundary reports none.
7. **Second commit — derive and persist.** Append the identity revision naming the run id, prompt
   version, schema version, input assembly version, provider/model configuration and the ordered
   `clarification_answer_ids`; branch provisional vs authoritative; where authoritative, move
   `events.authoritative_identity_revision_id` **in the same transaction** — the FK is already
   `deferrable initially deferred` for exactly this reason, and `validate_authoritative_identity()`
   refuses a provisional pointer. Claim → `succeeded`.
8. Retries and refreshes re-enter at step 2 and converge on existing state.

**The crash between the revision insert and the pointer update is closed by construction** — by the
*single transaction*, not by the deferral. In step 7's order (revision, then pointer) a
non-deferrable FK would also pass; `deferrable initially deferred` is what allows the two writes in
either order within that transaction. It is **not** permission to write the pointer first:
`validate_authoritative_identity()` is a `BEFORE` trigger that looks the revision up eagerly and
raises when it is absent, so pointer-first still fails. The
window that *does* exist is between step 6 and step 7 — and it is recoverable **without a new model
call**: validation is deterministic over the captured text, so a claim left in `response_captured`
is completed by re-validating the stored evidence and running step 7. Recovery is the only reason
step 6 is a separate commit.

**What this needs before T10 can be implemented** (none of it built in this pass):

- a migration adding `event_identity_call_claims` — including its non-terminal partial unique index
  on `event_id` (§A.5 row 7b), **`enable row level security` with no policies and
  `revoke all … from anon, authenticated`** on the phase-1 pattern (the table holds per-event
  in-flight and attempt state, which is a backend generation counter under `spec.md §32 #41`), and
  `unique (generation_run_id)` on `event_identity_revisions`;
- the §A.7 evidence column, and an index supporting the ceiling's window sum — `generation_runs`
  has only `(event_id, created_at desc)` and `(user_id, created_at desc)` today, neither of which
  serves a global sum by `operation` and time;
- exporting `MAX_TRANSIENT_RETRIES` and `TRANSIENT_BACKOFF_MS` and hoisting the boundary's
  `timeout: 120_000` to a named exported constant. All three are module-private or inline literals
  today, so the lease-floor pin cannot be written against them without this, and a source scan is
  not an acceptable substitute (§A.5 row 5 disowns exactly that technique). Non-model-visible;
- one `security definer` RPC performing step 4 atomically and returning a claim or a reason code;
- the step-5 `provider_invoked_at` commit;
- one RPC (or server function) performing step 6, and one performing step 7;
- a reclaim/complete driver, specified rather than gestured at: a **once-daily backstop** on the
  existing housekeeping path, which marks `abandoned` every expired claim with a committed null
  `provider_invoked_at`, marks `expired_unknown` every expired claim with one set, and completes
  every `response_captured` claim through the same conditional transition step 3 uses — so the job
  and a concurrent request cannot both complete one — processing a bounded batch per run. **It is
  not on any active host's path**: see the recovery-ownership note below;
- a durable home for the §A.5 ceiling alert record;
- the new `rate_limits` rule constants beside the existing ones in `src/lib/auth/rate-limit.ts`.
  Note that `consume_rate_limit` takes `p_key_hash bytea` and `hashRateLimitKey` HMACs in TypeScript
  over `APP_ENCRYPTION_KEY`, so the step-4 RPC receives already-hashed keys from the caller; it does
  not hash, and the counters table still never holds a raw identifier;
- a small, **non-model-visible** change to the provider boundary: `EventIdentityCallResult` returns
  only `raw`, the accepted text, so a *successful repair* currently drops the rejected first
  response that was also paid for. The ordered list must leave the boundary on success as it already
  does on failure. This changes no prompt, schema, assembly or anything the model sees.

`event_identity_call_claims` is **not** `generation_batches` and does not anticipate it: it is keyed
to one identity call, carries no planner version, no assignment and no sibling state, and T16 neither
replaces it nor inherits from it.

### A.7 Paid provider responses: the durable home

T9's boundary preserves `EventIdentityError.rawResponses` precisely so a paid response is not lost,
and §I requires an `invalid_output` to be *"recorded … with every paid raw response preserved"*.
`generation_runs` has no field for them, and none of `reprompts`, `compiler_repairs` or `verified`
may be borrowed for it: `reprompts` is the repair-kind log `spec.md §9.5` defines, and "it is also
JSONB" is not a contract.

**Canon audit first, because this was a stop condition.** Nothing in canon forbids persisting
provider response text. `spec.md §9.6` is a minimum record list (*"Every model call records, where
exposed: …"*), not a closed allowlist; `spec.md §7.10`'s *"Never model reasoning or chain-of-thought"*
and `§32 #41` govern what the **surface shows**, not what telemetry stores. The one real prohibition
is on **reasoning content**, and it is satisfied structurally: the boundary stores
`response.output_text`, which contains no reasoning item. Reasoning is recorded as a token count and
never as text — the rule already stated at the top of `src/lib/ai/openai/event-identity.ts`.

**Decision.** A nullable `jsonb` column on `generation_runs`, `provider_response_evidence`, holding
the ordered paid response texts, oldest first, constrained to a JSON array. Semantics:

| Outcome | Value |
| --- | --- |
| success, valid on the first call | one entry: the accepted text |
| success after the one repair | two entries: the rejected text, then the accepted text |
| `provider` failure before any response | `[]` — **no response text was captured**. Not a claim that nothing was billed: see below |
| `provider` failure on the repair attempt | one entry: the first response, already paid for |
| `invalid_output` after the repair | two entries, both paid for |
| a validator bug thrown out of validation | whatever the boundary annotated onto the error |
| any run written before this contract, or an operation it does not cover | `null` |
| evidence dropped by the retention job | `null`, **plus `provider_response_evidence_purged_at`** |

`null` means *this evidence contract does not apply* — a run the contract does not cover, or one
written before it. `[]` means *the contract applies and no response text was captured*. They are not
the same and neither is a silent drop.

**A response captured after its claim expired is recorded, and stays case E.** The run row and its
evidence are written whatever state the claim is in — refusing would throw away both the paid
response and the money it cost. But the claim stays terminal, so that response never becomes a
revision and the evidence ages out at 30 days. That is §A.5 case E working as designed, not a leak:
the host was already told the attempt could not be recorded and has already decided whether to
retry. Recorded here so nobody later reads the surviving evidence as a bug or as something to
resurrect.

**Purging needs a third value, or the retention rule destroys the first two.** Nulling the column on
purge would make a purged run and a pre-contract run indistinguishable forever after, which is
exactly the distinction this section calls load-bearing — the rule would quietly eat it in steady
state. So the purge also stamps `provider_response_evidence_purged_at`, and *purged* is its own
answer.

**`[]` is not a proof of zero spend, and nothing in the code, comments or tests may say it is.** A
transport timeout, a connection reset or a cancelled request can reach provider execution without a
response ever reaching us; we see an exception and know nothing about what was billed. Evidence
records what we *captured*. What was *spent* is §A.5.1's job, and there an attempt with no response
is costed at the per-attempt maximum rather than at zero. Reading `provider_response_evidence = []`
as "provably unpaid" would join the two honest halves into one false claim, and it is precisely the
expensive case — an ambiguous failure after a repair — where it would be most wrong.

**Privacy and retention, stated rather than assumed.** This is server-only telemetry:
`generation_runs` has RLS on, no policies, and is revoked from `anon` and `authenticated`. It must
never be returned to a user, and the orchestrator's own return type must not carry it. The content
is host-entered event material and the model's interpretation of it — including a named honoree —
which is already persisted in `events.prompt` and in the identity revisions; the genuine marginal
addition is the text of *rejected* outputs. Canon sets no retention period for it, so one is
required rather than inherited: the evidence column is nulled out on a bounded schedule by extending
the existing purge job, keeping the run row and its metrics. **The purge predicate must exclude
every run referenced by a non-terminal claim.** `response_captured` deliberately has no expiry
(§A.5), so a purge that nulled its evidence would leave a claim that can never be completed and
never expires — the permanent wedge, reintroduced through the retention rule instead of the state
machine. **T9A does not ship without that purge
path**, and gate item 14 tests it. The interval itself is a product decision: this plan proposes
**30 days**, long enough to investigate a failed round and short enough that rejected model output
about a named person does not accumulate indefinitely, and T9A confirms or replaces that number
before implementing. What is not available is shipping the column with no purge and no interval.

**On whether this needs a `CLAUDE.md §12` approval: no, and an earlier draft of this section said
both things at once.** If §9.6 is a floor — it is a record *minimum* with nothing in canon closing it, and its neighbour
§9.5 is explicitly optional (*"Each concept compilation **may** emit deterministic telemetry"*); the
*"where exposed"* qualifier says which fields are conditionally required, not that the list is open,
so it is the weaker of the two supports and not the one this rests on — then adding a server-only telemetry column
changes no canonical requirement and needs no spec edit. That is the reading this plan takes, and it
cannot also claim the column is a §12 change. What *is* worth doing, separately and at product
discretion, is one clarifying line in §9.6 saying the list is a minimum and additional server-only
fields are permitted; that is an optional tidy-up, not a precondition for T9A.

### A.8 `awaiting_clarification` is derived, not a stored status

The `event_status` enum is `DRAFT, DESIGN_SELECTED, READY_TO_PUBLISH, PUBLISHED, PASSED, ARCHIVED`.
`awaiting_clarification` is not in it, appears nowhere in `spec.md`, and was this plan's own
shorthand.

**Decision: derived** — and derived as **two** facts, because they are genuinely independent and
collapsing them is how T11 and a downstream consumer would come to disagree:

- *awaiting clarification*: the latest identity revision is provisional. This is what the surface
  reads to decide whether to show an open question.
- *consumable downstream*: `events.authoritative_identity_revision_id` is set. This is what the
  planner and every creative stage read.

Both can hold at once. `spec.md §7.6b` puts no lifetime cap on boundary rounds, so a rerun after an
already-authoritative identity may itself return a boundary question: the pointer still names the
earlier authoritative revision while the latest revision is provisional. `identityClarificationState`
therefore returns both, and neither is inferred from the other.

The underlying signal is unchanged — it is already the canonical one
(`spec.md §7.6b`: the identity beside a `kind: "boundary"` question is provisional) and is already
computed by the database as `is_provisional` (§A.3). Adding an enum value would create a second
place that answer can be written, and §A.3 exists to guarantee there is exactly one and that **the
caller cannot lie**. A stored status would be precisely the stale flag §A.3's tamper test refuses.

No migration. T9A exposes one named derivation — `identityClarificationState(event)` — so T11 reads
it instead of inventing an interpretation, and `event_status` keeps meaning publishing lifecycle.

---

### A.9 What T10 exposes, and what it must not

T11 will poll this every few seconds. The contract therefore has to be safe to read repeatedly and
safe to read by someone who should not learn how close the project is to its ceiling.

**Six states.** `running`, `recovering`, `clarification_required`, `ready`, `retry_available`,
`temporarily_unavailable`. Beside them, one boolean: whether the event has an authoritative
identity, because §A.8 is explicit that "the latest revision is provisional" and "the event has a
consumable identity" are independent facts and collapsing them is how a surface and a downstream
stage come to disagree. Beside them, the latest revision's **unanswered** questions, whenever
it has any — not only while blocking. `spec.md §7.6b` makes Route A "Non-blocking", and §C above
records what follows: the question "stays open and answerable; never a blocker, never a retry
trigger". A contract that surfaced questions only in `clarification_required` would make that
unimplementable. The state says whether the event is
waiting on the host; the questions say what there is to answer. `temporarily_unavailable` carries
the one frozen sentence. Nothing else leaves.

**The set is small on purpose.** `spec.md §32 #41` forbids exposing backend generation and spend
counters, and a richer state machine is one with extra steps: a caller who can tell "the project
ceiling refused you" from "your event is capped" from "you are being rate limited" has read three
counters. So every refusal collapses into `temporarily_unavailable` and every terminal failure into
`retry_available` — which deliberately does not distinguish *never attempted* from *the last attempt
failed* either, since that distinction is the attempt history. No claim id, no attempt key, no
ordinal, no basis digest, no cost, no SQLSTATE, no provider internals and no response evidence
appear in any state.

**The resting state is derived from the record, not from the request.** A POST that has just
recorded a terminal failure and a poll a second later read the same database and must not disagree:
if the poll derived nothing it would answer `ready` from an earlier round's identity and erase the
failure from the surface within one tick of T11's polling. So `retry_available` comes from the
newest settled claim being one of `failed_terminal`, `expired_unknown` or `recovery_failed` with
nothing produced since — never from a flag one code path sets and the other cannot. `abandoned` is
**ignored** by that rule rather than merely absent from it: a retry that dies before reaching the
provider settles as `abandoned` *after* the failure it was retrying, and a newest-wins rule would
let a provably-unpaid row mask the decision the host still has to make.

Two consequences worth stating rather than discovering. A capture that could not be recorded leaves
the failure out of the record, so that request answers `recovering` — what the record says — instead
of a `retry_available` the next poll would contradict. And a configuration rolled *back* after a
failed round leaves the event resting on `retry_available` until something newer settles: every
attempt resolves to the round that already succeeded and costs nothing, `hasAuthoritativeIdentity`
stays true throughout, and nothing downstream is affected. A stale affordance, not a defect.

**`recovering` is not an error.** It means: no new call may start yet, and none is needed from the
host. Three situations reach it — a captured response being completed, a claim of a *different*
round just recovered (the resubmit case of §A.6 step 3), and a call still in flight past the product
deadline below. In all three the host keeps polling, and a resubmit is safe.

**The wait a host is shown is not the lease.** The claim lease is a financial instrument derived
from the provider boundary's worst case: about fourteen minutes today. The product deadline is
ninety seconds, near three times §J's median call, and crossing it changes nothing financial — no
call is abandoned, no second call is bought, no claim moves. What changes is the sentence: a call
still running past its expected window is reported as `recovering` rather than as a spinner
promising imminent completion. A test pins the two apart, because the failure to guard against is
somebody raising the lease for a sound financial reason and silently lengthening the wait a host is
shown.

**Configuration refusals are not `temporarily_unavailable`.** A ceiling that has been *reached* is a
busy system and "try again shortly" is true. A ceiling that was never *set*, or a model with no
verified cost profile, refuses identically for ever: answering that with the same payload tells the
host to keep trying and pages nobody. T10 raises those, and emits a configuration alert, before a
claim exists and before any provider client is constructed.

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

**Who proves which half.** The behaviour above is a single product guarantee, but it is not provable
in one phase, because `generation_batches` (defined in §G.5, constrained by §H) does not exist until **T16, in Phase 4C**. The proof
is therefore split, and the split is a division of responsibility — not a relaxation of the
behaviour, which is stated here in full and unchanged.

- **Phase 4B proves, at T10, everything that does not require the batches table**: a late concrete
  answer is appended rather than applied in place; it stays bound to the identity revision that
  asked the question; `events.prompt` is unchanged; the authoritative revision that launched the
  downstream handoff is neither mutated nor silently rebased onto a newly rerun identity; no second
  downstream generation is started merely because the answer arrived; the answer is offered as input
  to a new round. **One caveat, so that nothing is recorded as a pass it did not earn:** when T10
  lands there is no downstream generation stage in production at all — the planner is T15 and the
  batch T16 — so "no second downstream generation is started" has no observable subject yet. T10
  records that clause as **`n/a` — not observable in 4B, owned by T16**, following the same evidence
  discipline §3.2 states for undecidable mechanical cases: `n/a` or advisory, never a silent pass.
  T10 does **not** build a downstream port in order to make it observable — that would be a
  future-proof abstraction with no present requirement (`CLAUDE.md §10`) and exactly the phase
  erosion this correction exists to prevent. If production happens to have such a port by the time
  T10 lands, for its own reasons, the test may use it: production orchestration only, never a fake
  batch object or a test double, claiming only what it actually observes through it.
- **Phase 4C proves, at T16, the persisted half**, against a real `planned` or `running`
  `generation_batches` row: that the row's `identity_revision_id`, planner version, assignment and
  persisted inputs are unchanged by the late answer; that the row is neither cancelled nor rebased;
  that a second in-flight batch for the same event cannot be created; that the answer remains
  attached to the earlier asking revision; and that a new round may begin only through the canonical
  new-round path, once the current batch no longer blocks it. **Row 3 of the table above splits the
  same way:** that an answer landing *before* a batch starts yields a batch planned from the new
  authoritative revision is also a T16 proof, for the same reason — 4B proves only that the rerun
  produces the new authoritative revision. So does gate item 9: 4B proves one identity revision per
  redundant refresh, 4C proves one in-flight batch and the colliding **batch and sibling**
  idempotency keys. The `generation_runs.idempotency_key` collision is *not* deferred — that column
  has existed since Phase 1 and its refusal is already proven in the Phase 1 suite.

Phase 4B does not claim the persisted half, and Phase 4C inherits it as a named obligation — the
T16 row and the Phase 4C exit gate both carry it — rather than as a courtesy. `generation_batches`
is not moved earlier to make the 4B wording true.

---

# Part II — Phase 4C

## D. Deterministic sibling planner

Binding source: `spec.md §7.7`, `event-renderer-system.md`, `CLAUDE.md §5.1`. Application code. It
**calls no model** and **never selects a library silhouette or recipe** — the Library Boundary
Invariant is a stop condition, not a guideline.

**Inputs** — from the **authoritative** identity only (branded type, §A.1): `compatibleFamilies`,
`compatibleTonalDirections`, `compatibleTypographyCategories`, and what `§7.7` needs for hierarchy.
Not the raw prompt (already test-enforced). Not `suppliedFacts` — the planner plans creative
separation; facts belong to content fit. `hostConstraints` pass through untouched and the planner
derives nothing from them; `creativeGuidance` is advisory (`model-contracts.md §4`) and may be
carried as guidance a sibling is free to reconsider, never converted into a constraint — asserted
by test.

**Who owns host-constraint conformance, stated precisely because an earlier draft of this
paragraph overstated it.** That draft said "no directive may contradict one", which is a property
this stage cannot honestly establish. `hostConstraints` are free text and **authoritative**
(`spec.md §7.5`: "later stages must respect it unless the host changes it"), and some are
structural — *no registry section*, *keep everything on one continuous page*, *nothing dramatic at
the top*. A structural directive can contradict one of those without naming a colour, a font, a
size or a word, so "the directive only uses structural enums" bounds what it can assert but proves
nothing about entailment. Nor may that gap be closed by pattern-matching the text:
`model-contracts.md §4` makes prompt-grounding the gating check precisely because it is "decidable
without a semantic classifier", and records that "a probe that guesses at entailment is what
produced the baseline's only mechanical failure". `spec.md §7.7`, the planner's binding source,
asks it for families, tones, typography, hierarchy, a directive and an allotment — and says nothing
about constraint conformance.

So the ownership is: the **directive is subordinate structural guidance, never host law**, and
where it and a host constraint conflict the constraint wins and the directive yields. The stages
that must respect a constraint are the ones that can read it. The DesignIntent call receives
`hostConstraints` inside the brief (§E: "every `hostConstraint` respected by all three"), §3.2
checks that all three **contradict** none of them and that the ones whose subject a DesignIntent can
carry are **conformed to here**, and §3.7 makes "a `hostConstraint` eroded or contradicted" a
**Fail** for the batch — judged, since T19B, on the surface this stage actually has. A constraint
whose satisfaction belongs to a later stage stays authoritative and is owed to the first stage able
to express it, which is the same sentence as the one above: the stages that must respect a
constraint are the ones that can read it, and the stage that must *fulfil* one is the first that can
say it. What the planner is held to, and all it is held to, is that it carries both lists through
unchanged, derives nothing from either, and never promotes guidance or a directive into a
constraint.

**One gap this exposes, recorded rather than asserted away.** `GenerateCompositionInput` is
`{ designIntent, capabilities, directive, reprompt? }` — it carries no `hostConstraints`. So a
constraint whose subject is *structure* has no typed path to the stage that authors structure: it
survives only insofar as the DesignIntent the model wrote while seeing it encodes it, and
DesignIntent has no structural field. That is a real 4D question about the composition input
contract, not a planner defect and not something to fix by widening the planner. It is named here
so the sentence above is a statement of ownership rather than another aspiration.

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
model call, not in hardening"* — and `spec.md §10` (the six configurable backend safety limits) with
`§9.6` (usage metering). The proof phase hit an organisation spend ceiling mid-run; this is not
theoretical.

### H.1 Call-level controls — **Phase 4B owns these, and they land before T10**

They are specified in **§A.5** and implemented in **T9A**, not here and not at T16. They are listed
again here only so this section is not read as the complete account of spend safety: per-event and
per-account daily caps, the global ceiling with its pre-call refusal and alert path, rate limiting
ahead of provider construction, the deterministic EventIdentity attempt key, the pre-spend claim
that makes uniqueness precede payment, and per-call usage telemetry.

**T16 gets no credit for any of them.** They had to exist before Phase 4B could expose a model call
at all, and a 4C task cannot retroactively own a 4B precondition — the same causal rule the §C
proof-ownership note applies in the other direction.

### H.2 Batch and sibling controls — Phase 4C, T16

| Control | Mechanism |
| --- | --- |
| one batch in flight per event | partial unique index on `generation_batches (event_id) where status in ('planned','running')`. The database refuses the second |
| batch-level caps | the same `rate_limits` fixed-window table (`spec.md §10`, `§27`), consumed when a batch is planned rather than when an identity call is made |
| ceiling breach during a batch | a breach refuses **new** batches; it never truncates a running one into a half-batch presented as whole |
| sibling idempotency | `generation_runs.idempotency_key`, derived from `(batch_id, operation, concept_index, attempt)`, so a duplicated sibling request collides instead of paying twice. This key needs `batch_id` and therefore cannot serve the identity call — §A.5's attempt key does |
| retries | `model-contracts.md §8` unchanged; retries reuse the attempt's key |
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
| EventIdentity invalid output, repair fails | recorded as `invalid_output` with every paid raw response preserved in `generation_runs.provider_response_evidence` (§A.7) — the Phase 4A journal rule applied to production telemetry. Never relabelled a provider error |
| provisional (Route B) identity | not a failure. Awaiting clarification as a **derived** state (§A.8); no batch; question surfaced (§A.4) |
| one DesignIntent sibling fails | the batch continues; concept-level readiness is canonical (`§7.10 #5`). **The failed sibling is never replaced by a library recipe** (`CLAUDE.md §5.1`); the documented terminal fallback is the only exception and is recorded in `generation_runs.fallback` |
| multiple siblings fail | the batch fails as a batch. Fewer than three concepts is a visible state, never three where one is fabricated |
| timeout | bounded per-call deadline; a timed-out call is a failed attempt retried under the same idempotency key |
| user refresh / retry | idempotent: the same claim or batch is observed, not restarted. Refresh is a read. For the identity call the key lookup precedes every cap, so a refresh consumes no quota (§A.6 step 2) |
| duplicate requests | for an identity call, the claim's unique attempt key refuses the second **before** a provider client exists (§A.5); for siblings, the batch uniqueness index or the run idempotency key |
| crash after a paid identity response, before persistence | §A.5's `expired_unknown`: never a silent second purchase, and never a claim that the call did not happen. A crash after the response is *captured* is completed deterministically with no new call (§A.6) |
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
respected; **every `hostConstraint` non-contradicted by all three, and additionally conformed to at
this stage where its subject is observable on the DesignIntent surface**; no `suppliedFacts` value
invented or altered; no `creativeGuidance` string appearing as a constraint; schema validity and
first-call success; repair and transient retry counts.

That clause is stage-scoped on purpose, and the end of this section says exactly how.

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

**Why that clause is stage-scoped, and why an earlier draft of it was unfair.** It used to read
"every `hostConstraint` traceable into all three", which is a requirement this stage cannot always
meet. `spec.md §7.5` defines a host constraint broadly and authoritatively — a prohibition, an
explicit requirement of a specific thing, or a correction — and deliberately does **not** limit it
to things a DesignIntent can encode. A production identity may therefore carry a perfectly valid
constraint whose subject is event-detail copy, RSVP or payment behaviour, meal and alcohol
disclosure, section ordering or placement. A DesignIntent has seven design fields and a host-facing
`presentation` card. It has no field for any of those.

So the obligation splits, and both halves are binding:

1. **Universal non-contradiction.** Every host constraint is authoritative for every sibling,
   whatever its subject. A DesignIntent must never contradict one, reinterpret one as optional,
   promote an incompatible recommendation over it, fabricate an opposing fact or preference, or
   encode design semantics that would make it impossible to satisfy downstream.
2. **Observable conformance, at the stage that can express it.** A constraint must additionally be
   *visibly* conformed to here only when its subject is observable on the DesignIntent surface:
   required or avoided palette treatment, a typography restriction, a motif restriction, a
   tone or aesthetic boundary, a restriction on concept-card language, or any design-semantic
   requirement the seven fields can carry. A constraint whose satisfaction belongs to a later stage
   **remains authoritative downstream** and is enforced at the first stage able to express it;
   its absence from a DesignIntent is not erosion.

This is stage ownership, not a loophole, and it narrows nothing about the constraint's authority.
The alternative — leaving the broad wording — would fail a correct DesignIntent for not putting an
event's start time into an object with nowhere to put it, which is a defect in the benchmark rather
than in the model.

**How host constraints are split between the machine and the reviewer.** No classifier decides which
arbitrary English constraint belongs to which stage, and none is to be built — not a keyword table,
not a model. The division is by what the checker can actually decide from the DesignIntent in front
of it:

1. a constraint whose subject the machine can read off the DesignIntent surface — a required or
   prohibited palette treatment it can match against the compiled palette — is **checked here**,
   and a violation is a gating failure;
2. every remaining constraint is **handed to the reviewer**, named and unreduced, to be judged for
   non-contradiction and for conformance where its subject is observable in a DesignIntent;
3. the reviewer **must not require this stage to express content or behaviour outside the
   DesignIntent contract**, and the packet says so in those terms (§3.8).

A constraint the machine cannot decide is reported as **deferred to the reviewer** — never as
passed, never as failed, and never counted as either. Calling it passed would be the silent pass
this section forbids; calling it failed would be the unfair benchmark this scoping exists to
prevent.

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
| **Excellent** | Three distinct creative worlds, each rooted in *this* event, each suggesting a different experience rather than a different look. A designer handed any one of them would know what to build, and would not confuse it with the other two. Nothing fabricated, nothing generic. **And all six of the minimum-wowable requirements below.** |
| **Good** | Three genuinely different directions, faithful, polished and usable, but one or more is thinner, more expected, more generic or less emotionally and verbally resolved than the minimum-wowable standard — a look rather than a world, or a world whose verbal identity does not carry its visual idea. No correctness defect. **`Good` is a diagnosis, not a pass** |
| **Borderline** | The three are faithful and defensible, but the distinctness is largely parametric, or one sibling is a weak variant of another, or the set reads as competent premium work that this event did not specifically ask for. No correctness defect |
| **Fail** | Any correctness defect — an invented host fact, a `creativeGuidance` recommendation promoted to host law, a `hostConstraint` eroded or contradicted — **or** siblings that are not materially different directions at all |

**What `Excellent` now requires, beyond the row above.** The band is the product bar, not "strong
professional work". An `Excellent` batch satisfies everything in its row **and** all six of:

1. the set feels unmistakably authored for *this* event and identity, not merely appropriate to the
   event type;
2. the directions demonstrate **interpretation**, not just application of tasteful design
   vocabulary;
3. the creative ideas contain memorable, grounded choices that are not the obvious premium
   defaults;
4. the host-facing verbal identity is as specific as the visual direction;
5. none of the three siblings is filler, a safe third option, or a weaker version included only to
   complete the set;
6. the batch as a whole is specific, perceptive and memorable enough that a reasonable host could
   plausibly react with *"it got me"* rather than *"these are nice"*.

**This is not a demand for fabrication, theatricality, maximalism or novelty for its own sake.**
Wow comes from accurate interpretation and creative specificity, and a restrained event is wowable
through precision and insight. A batch that manufactures drama an identity does not support fails
`Fail`'s correctness clause and S6, not passes this one.

**The rule:**

> **12 / 12 `Excellent`. No `Good`, no `Borderline`, no `Fail`. And 12 / 12 minimum-wowable
> `YES` (below). Any batch below `Excellent`, or any minimum-wowable `NO`, is a NO-GO.**

**Why this replaced "Excellent strictly outnumbers Good", and why it is not tunable.** The earlier
rule passed `E=6, G=5, B=1`. A product whose baseline promise is *"it understood what I was
envisioning, and I need to show someone"* cannot be evidenced by a run where five of twelve hosts
get work the reviewer called thinner and more expected than that bar. `Good` was doing double duty
as both a diagnosis and a pass, and the two are not the same thing: it stays, because naming *how*
a batch fell short is what makes a NO-GO actionable, but it does not pass.

The cost of the stringency is accepted in advance, in the only place it can honestly be accepted —
**before any case exists, before the prompt is written, and before a single output has been seen.**
If a sealed challenge returns 11 `Excellent` and 1 `Good`, that is evidence the system did not meet
the frozen bar. The challenge is then **spent**: we fix the system and author a genuinely new
sealed corpus. We do not move the threshold, average the bands, introduce a score, or discover that
one `Good` was really an `Excellent` after all. `spec.md §11.9`: a threshold chosen after the
result is not a threshold.

Note the `Fail` definition still makes any single-batch correctness defect fatal on its own, which
is what stops the "one catastrophic batch rated Borderline" path through the gate. The order is
**faithful and correct first, wowable second** — wow never excuses a correctness defect, and a
fabricated host fact fails whatever else the batch achieves.

**Half one-and-a-half — the explicit minimum-wowable judgement.** The word `Excellent` is not
trusted to carry the bar on its own, because a band label drifts toward "the best of what I was
shown". So the reviewer answers, per batch, one additional binary question, in these terms:

> **Does this batch clear the minimum-wowable bar — is it specific, perceptive and creatively
> memorable enough that the host could plausibly feel *"it understood me"* and want to show the
> result to someone, rather than simply thinking *"this is polished"* or *"this is nice"*?**
>
> Answer **YES** or **NO**, and cite the specific text that decided it.

**`YES` requires all five**, and the reviewer states which, if any, is missing:

| | Criterion |
| --- | --- |
| 1 | **Event-specific understanding** — the concepts clearly arise from *this* identity rather than from a generic event of the same type |
| 2 | **Creative leap** — grounded, non-obvious creative thinking, rather than only translating the identity's adjectives into palette, type and motif choices |
| 3 | **No passenger concept** — none of the three exists as safe filler or a weak variant of another |
| 4 | **Memorable verbal identity** — the `presentation` name and description carry *this* concept, rather than reading as language reusable across unrelated events |
| 5 | **Plausible share impulse** — the set has enough specificity and character that *"I need to show someone"* is a plausible reaction |

This judgement is **qualitative and stays qualitative**. There is no numerical wow score, no
embedding distance standing in for delight, and no deterministic metric may be introduced later and
called this. §3.2's mechanical block measures what is decidable; this measures what is not, which
is precisely why a human-equivalent independent reviewer answers it.

The band and the minimum-wowable answer are **both required and are not interchangeable**. A batch
rated `Excellent` with minimum-wowable `NO` is a NO-GO, and so is a batch rated `Good` with
minimum-wowable `YES`. Where they disagree, that disagreement is itself a finding the go/no-go
records verbatim rather than resolving in favour of the more convenient one.

**Half two — the systemic veto.** A high distribution must not mask a systemic creative failure.
**The 4C gate fails regardless of distribution if the independent reviewer finds any predeclared
systemic pattern.**

*Predeclared categories* — the only ones that can trigger a veto, fixed now:

| | Pattern |
| --- | --- |
| S1 | siblings collapsing into one recognisable house style despite different assignments |
| S2 | "three concepts" that are parameter variants rather than different creative worlds |
| S3 | `creativeGuidance` promoted into host law |
| S4 | **host constraints eroded or contradicted**, judged at this stage. S4 is present when a concept contradicts a host constraint, weakens an authoritative constraint into optional guidance, makes a design choice the constraint prohibits, violates a constraint whose subject is observable in DesignIntent, or uses `presentation` language that itself breaches one. S4 is **not** present merely because a DesignIntent does not restate or fulfil an obligation whose satisfaction belongs to a later content, composition or publishing stage — see §3.2. The category keeps its one-batch threshold and its zero tolerance; what is scoped is the surface it is judged on, never the constraint's authority |
| S5 | generic-premium treatment overwhelming event-specific personality |
| S6 | unsupported emotional moderation / anti-sentimentality / anti-theatricality across siblings |
| S7 | another recurring pattern that directly defeats the core 4C question — **which the reviewer must name and define in the same terms as the others** |
| **S8** | **the same creative worlds recurring across events — including across different instances of the same event type.** Organizing idea, palette family, typographic voice, motif set, finishing language or `presentation` voice repeating from batch to batch, whether the batches share an event type or not. S1 and S2 are both *within*-batch; without S8 a system producing three excellent, genuinely distinct worlds and roughly the *same* three every time passes every category and every within-batch metric. **The same-type clause is not a refinement, it is the case that matters:** a system with a "quinceañera set" and a "christening set" that differ from each other and barely differ within a type is a template gallery at the granularity a template gallery actually has, and a reviewer reading S8 as *different* event types only would decline it because the worlds do track the event. §3.2's corpus-wide block gives the reviewer evidence for both readings |
| **S9** | **safe competence — no creative leap.** Across batches, the outputs are faithful, distinct and professionally attractive, and they repeatedly stop at tasteful obviousness: competent premium work without a memorable, event-specific organizing idea or a perceptive creative leap. **This is the failure mode the minimum-wowable bar exists to reject, and none of the other eight catches it.** It is not S2, which is parameter variants *within* a batch — an S9 system produces three genuinely different directions. It is not S5, where generic-premium treatment overwhelms event personality — an S9 system does adapt to each event, visibly and correctly. It is not S8, where the same worlds recur — an S9 system's worlds differ from event to event. S9 is the system that gets everything right and is still only *nice*: it adapts, it separates, it stays faithful, and it never risks the specific, memorable choice that would make a host want to show someone. A batch rated `Excellent` cannot exhibit S9; a corpus of batches rated `Good` for the same reason almost certainly does, and the reviewer should reach for this category when their own per-batch prose keeps saying some version of *"polished, but I have seen this"* |

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
| **Taste / convergence** | S1, S2, S5, S6, S7, S8, **S9** | **two batches** |

*The reviewer protocol.* The reviewer is **not** asked "should this pass?", is not told the
distribution rule, the systemic thresholds or how many `Excellent`s a GO needs, and works from a
repository they have no access to (§3.8). They **are** given the band definitions, the six
`Excellent` requirements and the minimum-wowable question and its five criteria, because those are
the definitions the judgements are made against and a reviewer asked to rate against a scale they
cannot see is guessing. What is withheld is the arithmetic. They produce:

1. **per-batch ratings** on the four bands, with reasons;
2. **a per-batch minimum-wowable `YES`/`NO`**, with the deciding text cited and, on a `NO`, which
   of the five criteria is missing;
3. **an explicit cross-batch systemic assessment**, answering **every** category S1–S9 as
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
S1–S9, the review is returned for that pattern to be filed or explicitly declined**, before any
decision is recorded. That is a completeness check on the artifact, not a second opinion on the
outcome. S9 is the category this duty most often lands on: "polished, but I have seen this" is
exactly the observation a reviewer writes in prose and does not think to file.

*How the go/no-go records it.* The decision states the band distribution, **the minimum-wowable
tally**, and the systemic verdict per category. A veto is a **NO-GO** with the category and the
reviewer's citations recorded verbatim. **A GO requires all nine categories explicitly assessed and
none of them meeting its frozen threshold** — not that every one was found absent. A category the
reviewer marks *present* while citing fewer distinct batches than its class threshold is a
**recorded finding, not a veto**: it stays in the decision artifact with its citations intact, and
it does not on its own fail the gate. That is what the threshold is for, and an earlier draft of
this paragraph made it decorative by reading "found absent" as the pass condition — an isolated
observation and a recurring pattern are different things, which is the whole reason the table above
has numbers in it. A batch that genuinely is weak, generic or parametric is already caught by the
per-batch layer, which requires twelve of twelve `Excellent` and twelve of twelve minimum-wowable
`YES`; the systemic layer exists to catch **recurrence** that the per-batch layer may not expose.
**No half can be waived by another**: an excellent distribution does not override a veto, an absent
veto does not rescue a failing distribution, and neither rescues a minimum-wowable `NO`.

**The north star and the floor are now the same line.** Earlier drafts of this section called 100%
`Excellent` the aspiration and set the gate below it, which made `Good` a passing grade for a
product whose whole promise is that the host feels understood. The gate is now the bar: twelve of
twelve `Excellent`, twelve of twelve minimum-wowable, nine systemic categories assessed with none
of them meeting its frozen threshold. It is deliberately stringent, it was set before any case
existed, and it does not move because a run comes back close.

## 3.8 Independent qualitative review process

The 4A shape, with the 4C artifact defined rather than assumed.

**What the artifact contains**, per batch: the **authoritative EventIdentity brief** and the **three
DesignIntents** generated from it, **each with its `presentation` object** — without which the
verbal-identity questions in §3.3, the `Good` band and minimum-wowable criterion 4 cannot be
answered. Plus, once, the corpus-wide measurements of §3.2. Nothing else — no case metadata, no
expectations, no clarification labels, no prior evidence.

**The packet opens with what this artifact is, before any judgement is asked for.** Without it S4 is
not answerable fairly, because a reviewer cannot tell an eroded constraint from one this stage has
no field for. In substance:

> You are reviewing DesignIntent, not the finished site. A DesignIntent carries design semantics —
> family, tonal direction, palette, typography pairing, density, a composition vector and motifs —
> plus a host-facing concept card of a name and a description. It does not carry event-detail copy,
> RSVP or payment behaviour, section structure, or any other later-stage content. Host constraints
> remain authoritative. At this stage, judge them for **contradiction**, and for **conformance
> where the constraint's subject is observable in a DesignIntent**. Do not mark a constraint eroded
> merely because satisfying it requires a later stage that this artifact does not represent.

That statement is about the shape of the artifact, not about the rule applied to the ratings, so it
withholds nothing: it tells the reviewer what they are looking at, which is the precondition for
every judgement that follows.

**It says, in the same general terms, what this stage can express and which of its fields it
chooses.** Two facts are needed for the same reason S4 needs the one above, and a reviewer without
them can mark a lawful output down for something no output could have avoided. The expressive
surface is bounded: `typographyPairing` and `motifs` are ids from curated tables that exist before
any concept does, so a brief's typographic or ornamental language can ask for something no
available value carries. And some fields are not this stage's decisions at all: the deterministic
planner assigns `family`, `tonalDirection` and `composition.hierarchy` per concept and runtime
narrowing reduces each enum to the assigned value, so a reviewer who reads those as taste — or
reads the separation between three concepts' assigned values as creative range — is rating the
planner. In substance:

> What this stage can express is bounded, and the bounds are not choices made here.
> `typographyPairing` is an id from a fixed curated table of twelve conventional pairings — a
> display face and a body face, grouped in six typographic categories, two to a category. `motifs`
> are up to three ids from a fixed set of seven: four surface patterns (plaid, stripe, gingham,
> linen) and three ornamental arrangements (equestrian, botanical, celestial). Nothing outside
> those tables is expressible at this stage — no other typeface, no invented lettering, no
> described or custom ornament. The palette is not drawn from a table: it is three to five
> validated hex colours. So where a brief asks for a typographic or ornamental quality that no
> available value carries, its absence is a property of the vocabulary, and what is open to
> judgement is the choice made among the values that exist.

> Some fields are fixed before a concept is generated, and some are chosen. `family`,
> `tonalDirection` and `composition.hierarchy` are assigned to each concept by a deterministic step
> that runs first, and generation is restricted to the assigned value, so no alternative was
> available. `typographyPairing` is chosen, but only from within one assigned typographic category.
> Chosen here are the palette, `density`, the rest of the composition vector — asymmetry, rhythm,
> section contrast and ornament — the motifs, and the concept card's name and description. Read an
> assigned field as a given condition rather than as evidence of taste, and read the way three
> concepts differ in family, tonal direction and hierarchy the same way.

> This changes attribution, not correctness. A concept still owes every authoritative host
> constraint in full. If the concept in front of you contradicts or erodes one, that is a finding
> and belongs in your answer, whatever produced it — including when an assigned field produced it.
> Nothing above is a reason to excuse a host-constraint failure: the statement of what this stage
> carries is the only limit on where a constraint is judged, and it limits it by stage, never by
> cause.

Like the scope statement, these are properties of the stage rather than of any batch, written for
every output this stage will ever produce. They name no case, no expectation, no prior evidence and
no rule applied to the ratings, so they withhold everything the paragraph below withholds, and the
blinding scan runs over the packet they now sit in. Nor do they hand over the repository the
paragraph after that withholds: what a reviewer receives is the shape of this stage's expressive
surface and the split between what it was given and what it decided — never a prompt, never code,
never the assignment behind any particular concept, and nothing about how this stage came to work
this way.

**The third statement is what keeps attribution from becoming an exemption.** The two before it say
only what this stage chose; they say nothing about what a concept owes. The model does not choose
the assigned fields, so it is neither credited nor blamed for them — but the concept as a whole
still owes every authoritative host constraint, and a concept that erodes or contradicts one is a
real finding whatever caused it, including when an assigned value caused it. `§3.7`'s correctness
class judges the system's output, not the model's intentions. Context that let a reviewer forgive a
host-constraint violation because the planner caused it would be worse than the omission it fixes:
it would quietly retire the one class of finding this gate cannot afford to lose. Where a
constraint is judged is bounded by the scope statement, by stage — never by cause.

**The reviewer packet carries the definitions and withholds the arithmetic.** It includes the four
band definitions with `Excellent`'s six requirements, the minimum-wowable question with its five
criteria, and the S1–S9 definitions — a reviewer asked to rate against a scale they cannot see is
guessing, and a checklist they have not been given is one they cannot complete. It excludes the
distribution rule, the systemic thresholds, how many `Excellent`s a GO needs, that `Good` does not
pass, any expected outcome, any prior review, and anything about what this project hopes the answer
is. (The reviewer necessarily learns the corpus size by rating every batch; what is withheld is the
*rule applied to it*, which is why §3.8 excludes `model-contracts.md` and this document.)

The identity is included deliberately. §3.3 asks whether each direction is rooted in *this* event,
S5 and S6 ask whether a treatment is supported by the identity, and systemic condition 4 asks
whether a pattern belongs to the system or to the input — **none of which is answerable from
outputs alone.** A blinding that withheld the identity would make the veto structurally
undeclinable-but-unprovable, which is worse than no veto.

**What the reviewer does not have:** access to this repository, in full. Not the prompts, not prior
evidence, not the failure history, not implementation details, and specifically **not
`model-contracts.md` and not this document**, where T19 freezes the distribution rule — a blinding
phrased as "no prompts or prior evidence" would leave the threshold readable in canon, which
defeats §3.7's claim that the reviewer does not know it.

They return band judgements, a minimum-wowable `YES`/`NO` per batch with the deciding text cited,
the S1–S9 checklist with citations, and prose. **The GO/NO-GO arithmetic happens afterwards,
outside the blind review**, by someone applying §3.7's frozen rule to what the reviewer returned.
The reviewer is never asked whether the set passes, and never learns that twelve of twelve is what
passing means.

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
| **T6** | **An independent author writes the pre-registered rerun-behaviour cases**, working from the published capability and contract dimensions only — not this repository, not T4's checker source, and not the assembly they will exercise. Not the implementer of T4 or T9 (§3.9). The file lands in the repository at T8, not here | the corpus file, authored outside the repository | T5 | the frozen T4 structural contract accepts it; the brief publishes the four authoring hazards the validator cannot catch (§B.3) | `model-contracts.md §4.5` | no | n/a — authored, not implemented | no |
| **T7** | **Independent fairness and leakage review of the corpus.** A collision with pre-existing production or model-visible text is fixed **at the corpus**, by its author — never by relaxing the scanner or the checker (§3.5) | — | T6 | leakage scan against the frozen prompt and wire schema; fairness read; the four authoring hazards checked case by case, dimension coverage included | `model-contracts.md §4.5` | no | **yes** | no |
| **T8** | **Freeze the corpus at its own input SHA**, in a commit that adds the corpus file and nothing else | the corpus file alone | T7 | the T4 suite still green; the absence test retires without a source edit | `model-contracts.md §4.5` | no | **yes** | no |
| **T9** | Input assembly + `EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION` → `event_identity_input_v2`. It **may** see the already-frozen cases — this is honestly pre-registered validation, not a sealed challenge — because the machinery that grades them was frozen at T5 and the cases at T8 | `src/lib/ai/versions.ts`, `src/lib/ai/provider.ts`, `src/lib/ai/openai/event-identity.ts`, `src/lib/ai/openai/event-identity-input.ts`, **`src/lib/ai/evals/rerun-seam.ts`** (the one file in the frozen validation harness T9 may touch) | T3, **T8** | `input-assembly-drift.test.ts` version-named golden files; an assembly change under an unchanged version fails against its own file; one file per declared value; `prompt` byte-identical across rounds; **leakage scan clean — the assembly's static text against the frozen corpus** | `spec.md §31 — Prompt, auth, and generation`; `§7.6b`; guardrail `§32 #9` | **yes** | **yes** | no |
| **T9A** | **Call-level EventIdentity spend, idempotency, claim and telemetry controls** (§A.5–§A.8). Nothing here is batch-shaped and nothing anticipates `generation_batches`. **T10 may not be implemented before this lands** | migration: `event_identity_call_claims`, `generation_runs.provider_response_evidence`, the claim/capture/complete RPCs; `src/lib/generation/identity-spend.ts`, `identity-claim.ts`, `identity-state.ts` (the §A.8 derivation); new `rate_limits` buckets in `src/lib/auth/rate-limit.ts`; a non-model-visible provider-boundary change returning the ordered paid responses on success too | T3, T9 | db + unit: two concurrent requests on the same basis produce **one** claim and **one** call to `generateEventIdentity` (module mocked — there is no provider factory to count, §A.5 row 5); a refusal rolls back every bucket it touched, so a later refusal spends no earlier unit; `generateEventIdentity` is never called on a refusal; the attempt key is stable across refresh and changes when a clarification answer is added; two clicks on `Retry` derive one ordinal and one call; a `response_captured` claim is completed by the next request **with no second model call**, and cannot wedge the event; the lease floor is pinned to `MAX_TRANSIENT_RETRIES` and the boundary timeout, so raising either fails the test; a null `cost_estimate_usd` counts as the per-call maximum in the ceiling sum; the step-6 insert carries the attempt key in `generation_runs.idempotency_key`, so a retried capture cannot write two run rows; a deploy-changed `model_config_digest` mid-flight is refused by the one-in-flight guard rather than starting a second call; every refusal returns the same client-visible payload; the evidence purge path runs, nulls only the evidence, and leaves a `response_captured` claim's evidence intact; the claims table is unreadable by `anon` and `authenticated`; the lease constant is computed from the exported retry/timeout constants, so changing either fails the test; each of cases A–F; all seven `provider_response_evidence` outcomes including `[]` versus `null`; the evidence column is unreadable by `anon` and `authenticated`; no refusal payload carries a counter (`§32 #41`); the derived clarification state agrees with `is_provisional` on every constructed shape | `development-plan.md` principle 4; `spec.md §10`, `§9.6`, `§6`, `§32 #41`; `§31 — Prompt, auth, and generation` | no | **yes** | no |
| **T10** | Orchestration: run → persist → branch → rerun | `src/lib/generation/identity-orchestrator.ts` | T1–T3, T9, **T9A** | unit + db: the §A.6 order is the implemented order, and no provider client is constructed before step 5; a crash simulated between steps 6 and 7 completes deterministically **with no second model call**; the revision and the pointer commit together, so the crash between them has no window; provisional blocks; rerun creates a revision; repeated boundary rounds; no lifetime round cap; idempotent refresh; and, for a late Route A answer, that it is appended, stays bound to the asking revision, leaves `events.prompt` and the authoritative revision untouched, does not rebase the event onto a newly rerun identity, and starts no second downstream handoff. **That last clause has no observable subject at T10** — the planner is T15 and the batch T16 — so it is recorded `n/a`, owned by T16, and T10 builds no downstream port to make it observable (see the proof-ownership note at the end of §C) | `§7.6b`, `§7.7`, `§31 — Creation Mode` | no | **yes** | no |
| **T11** | Minimal clarification surface | `src/app/…` per `screen-spec.md` | T10 | e2e at 390 and 1280; keyboard, focus, contrast | `§31 — Creation Mode`, `§31 — Responsive/accessibility` | no | no | no |
| **T12** | Independent engineering review of the integrated change, then **implementation freeze** | — | T11 | gate items 1–14 all green at the freeze SHA, **PostgreSQL 17 included** | §4B gate | no | **yes** | no |
| | **▶ 4B GATE — STOP. Explicit authorization required before the one validation run** | | | | | | | |
| **T13** | Run the frozen pre-registered set **exactly once** | — | T12 + authorization | the frozen T4 criteria, applied unchanged | §4B gate item 15 | no | **yes** | **yes — one run** |
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
| **T16** | `generation_batches` + **batch and sibling** spend, caps and idempotency only (§H.2) — the call-level controls are Phase 4B's (§A.5, T9A) and T16 takes no credit for them. **Inherits the persisted half of the late-Route-A invariant from the 4B gate** (items 8 and 9), which could not be proven before this table existed | migration; `src/lib/generation/batch.ts`; `rate_limits` wiring | T15 | db: one in-flight batch enforced by index; caps refuse; duplicate keys collide; partial-failure resumption. **Plus, against a real `planned` or `running` row and not a mock:** a late Route A answer leaves that batch's `identity_revision_id`, planner version, assignment and persisted inputs unchanged; does not cancel or rebase it; cannot create a second in-flight batch for the same event; leaves the answer attached to the earlier asking revision; a new round may begin only through the canonical new-round path, once the current batch no longer blocks it; and, for §C row 3, an answer landing **before** a batch starts yields a batch planned from the new authoritative revision | `development-plan.md` principle 4; `spec.md §10`, `§27` | no | **yes** | no |
| **T17** | `design_intent_artifacts` + `design_concepts.design_intent_artifact_id` + equality check | migration | T16 | db: updates refused; equality check refuses a mismatched snapshot on every enumerated column; FK required | `spec.md §31 — DesignIntent, composition and compiler` (persistence); `§9.4`; `CLAUDE.md §2` | no | **yes** | no |
| **T18** | DesignIntent contract, schema, narrowing, validator — **no prompt** | `src/lib/ai/design-intent/*`; generated files under `docs/model-schemas/` | T17 | unit: semantic invariants, narrowing, repair rules, schema-drift | `spec.md §31 — DesignIntent, composition and compiler`; `model-contracts.md §5`; `§32 #12`, `#21` | **schema descriptions ship** | **yes** | no |
| **T19** | **Prewire the 4C evidence harness and freeze the gate, while no cases exist.** Paths, evidence-class labels, structural contract, runner slots, **the production seam T21 fills** (below), protection behaviour, leakage-scan coverage, the per-batch and corpus-wide mechanical checks (§3.2), the blind-artifact and reviewer-packet contract (§3.8), and **the whole of §3.7** — bands including `Excellent`'s six requirements, the **minimum-wowable question and its five criteria**, the **12/12** distribution rule, corpus size, same-type composition requirement, **S1–S9** and the class thresholds — written into canon and hash-pinned | `src/lib/ai/evals/*`, `tests/eval/design-intent.eval.ts`, `model-contracts.md`, this document | T18 | unit/static only; absence tests for both corpora; a freeze test that fails on any edit to a threshold, band, minimum-wowable definition, S-category, corpus requirement, reviewer contract or path | `model-contracts.md §4.5`; `spec.md §11.9` discipline | no | **yes** | **no — never run to verify itself** |
| **T19B** | **The corrective freeze.** T19's host-constraint criterion overclaimed what a DesignIntent can express (`§3.2`, and the record below). T19B restates it stage-scoped in §3.2, §3.7's S4 row and §3.8's packet, corrects the machinery's wording so a downstream-only constraint is **deferred to the reviewer** rather than called passed or failed, opens a **fresh pre-registered validation slot** because the old corpus was read while the rule was being changed, and re-pins every affected hash. **Nothing about creative quality moves**: the bands, `Excellent`'s six requirements, the minimum-wowable question and its five criteria, the 12/12 distribution rule, S1–S9, the thresholds, the corpus size and the same-type requirement are byte-identical, and `design-intent-gate.ts` does not change at all | `src/lib/ai/evals/*`, `model-contracts.md`, this document | T19, T20 | the gate module's hash is unchanged; §3.7's values re-asserted; absence tests for all three corpora; the five stage-scope tests below | `spec.md §7.5`; `spec.md §11.9` discipline | no | **yes** | **no** |
| **T20** | **Independent authors write the regression and pre-registered corpora**, from the published dimensions only — not this repository, and specifically not T18's `.describe()` strings, which ship to the model and are prompt text under §3.5. Independent fairness and leakage review, then freeze each at its own input SHA | the corpus files alone | T19 | the frozen T19 structural contract accepts them; leakage scan clean | `model-contracts.md §4.5` | no | **yes** | no |
| **T20B** | **A replacement pre-registered validation corpus**, written by a **fresh** independent author who has not seen the invalidated one, from the corrected published dimensions alone. The author is told the stage-scope rule, so a case may legitimately carry a downstream-only host constraint — DesignIntent must not contradict it — but no case may define success as a DesignIntent emitting site content it has no field for. Independent fairness and leakage review again; frozen at its own path and digest | the new corpus file alone | T19B | the corrected T19B structural contract accepts it; leakage scan clean; no case reused from the invalidated corpus | `model-contracts.md §4.5` | no | **yes** | no |
| **T21** | The DesignIntent prompt **and the production provider boundary it is sent through** — request assembly, the narrowed structured-output schema, model configuration with explicit reasoning effort, `service_tier` and `store: false`, transient-retry bounds, the single schema-invalid repair retry, application validation, request-id capture, usage and latency telemetry, raw paid-response preservation, and a **verified DesignIntent cost bound derived from the model's verified rate table** rather than inherited from EventIdentity's attempt shape. It repoints the T19 seam, and prompt and schema versions bump together if model-visible text changes (§5.1's rule). **This is the implementation freeze before the first live call** | `docs/model-prompts/design-intent.system.md`, `src/lib/ai/openai/design-intent*.ts`, `src/lib/ai/versions.ts`, `src/lib/generation/*-cost.ts`, the T19 seam | T19, T20 | leakage scan; independent engineering read for benchmark integrity; deterministic validation of the boundary with the provider mocked — **never by calling it** | `spec.md §31 — DesignIntent, composition and compiler`; `model-contracts.md §5`, `§8`; `product-doctrine.md` | **yes** | **yes** | no |
| | **▶ STOP — APPROVAL REQUIRED BEFORE THE FIRST LIVE DesignIntent CALL** | | | | | | | |
| **T22** | Freeze; **two external model families** write the **sealed** challenge, six cases each and none from Claude, unseen while T21 was written (protocol frozen before either authored a case, below); one run; blind review; evidence protected in the same change | — | T21 + authorization | the 4A protocol exactly | `model-contracts.md §4.5`; §3.7 | no | **yes** | **yes — one authorized run per set** |

> **The stop point.** No live DesignIntent provider call may happen before T21 is complete, frozen,
> independently reviewed and explicitly approved — and the gate (§3.7) is frozen at **T19**, before
> the prompt is written and before any corpus is authored. Every set is run at most once per
> authorization, and each completed run's directory is protected in the same commit as its
> evidence.

**What T20B froze, and the four things the freeze record has to carry.** The replacement
pre-registered validation corpus is `docs/model-evals/design-intent-validation-v2.json`: thirteen
cases, `DIV2-01`–`DIV2-13`, written by a second independent author who saw the corrected published
dimensions and nothing else. Isolation was established from that author's own recorded actions
rather than from their account of them — every read was of their sealed packet, no repository path
was reached for, and no `git` ran. Two independent reviews, an overlap check against all seven
other corpora, and the frozen leakage scan stand behind it. Four things it does **not** prove are
recorded here, because a set whose limits live only in a conversation has limits nobody can read
later:

1. **`mid` is admissible in all thirteen cases**, so a mid-tone concentration in the outputs is
   partly guaranteed before the model is called. This is a property of a three-value tonal
   vocabulary rather than an authoring habit — the regression corpus, different author, carries
   `mid` in twelve of twelve with almost the same pool distribution. Forcing a brief off `mid` to
   improve the number would distort a case to flatter a measurement, which is why it is recorded
   instead. Magnitude, so the record is usable: with two-value pools and the planner preferring
   free values, roughly two of three siblings per batch take distinct tones and the third repeats.
2. **Tonal pools are two values wide in eleven of thirteen cases**, and exactly one case is
   `toneExplicitlyConstrained`. So the planner exhausts the tonal pool in most batches, and §3.2's
   tonal measurements are near-uninformative in either direction rather than evidence about the
   model. The separation telemetry already distinguishes `pool-exhausted` from `tone-locked`, so
   this reads as a corpus property rather than a planner defect.
3. **`hierarchy` is planner-assigned, drawn from the family's own table and never from the
   identity**, while §3.8's packet — frozen — does not tell the reviewer so. A reviewer can
   therefore read a sibling as moderating a host's maximalism when the planner made that choice.
   The corpus cannot fix this and the packet cannot move, so it is recorded.
4. **Two cases share a teachable half.** The pair that brackets the default register from both
   sides — one host forbidding *tasteful*, the other forbidding *subtle* — are both partly
   satisfiable by the single rule "when a host forbids restraint, do not moderate". Neither
   breaches §3.1's rule against an expected answer a prompt could be taught directly, because the
   full expected answer for each is to be specifically *that* event three ways, which is not
   teachable. A reader of this record should still know the bracket shares that half.

**One contamination route the corpus cannot close, and who closes it.** The invalidated corpus is
preserved on disk and readable. `corpus.ts`'s isolation language binds the *corpus* author; nothing
binds the **prompt** author. T20B's own DIV2-13 converged independently on a premise the
invalidated corpus already had — the author had never seen it — which is evidence that the design
problem is well-trodden rather than evidence of reuse, and which is exactly why the route matters.
**T21 is therefore written without reading `docs/model-evals/design-intent-validation.json`**, and
that is a condition of the task rather than a courtesy.

**T21 reaffirmation under the corrected reviewer context.** The reviewer packet is part of the
pre-registered benchmark, so reopening it reopens the ordering question: was the implementation
still frozen when the replacement challenge was authored? Verified rather than assumed, after
T19C and before any replacement author started — every model-visible T21 artifact is
byte-identical to its accepted state at `fc1ae8b`, by `git diff --quiet` on each path:

| artifact | sha256 (first 16) |
| --- | --- |
| `docs/model-prompts/design-intent.system.md` | `a268cbd1b97d3e11` |
| `docs/model-schemas/design-intent.wire.schema.json` | `60c5907bbe44dac4` |
| `src/lib/ai/openai/design-intent.ts` | `2447d972dab0fa8d` |
| `src/lib/ai/openai/design-intent-input.ts` | `7d31907b5db11888` |
| `src/lib/ai/evals/design-intent-seam.ts` | `09723fd9435ff468` |
| `src/lib/generation/design-intent-cost.ts` | `47bed9bf280f7531` |

Also identical, checked the same way: both generated schemas, the runner adapter, `contract.ts`,
`narrowing.ts`, `validate.ts`, `schemas.ts`, `wire-schema.ts`, `policy.ts`, `input.ts`,
`versions.ts` and `planner.ts`. So the prompt, schema, provider boundary, input assembly, seam,
model configuration and cost profile are unchanged, and **T21 was not "improved" in response to
the correction** — which was the point of checking. The correction moved what a human reviewer is
told; it moved nothing the model is sent.

**The v3 sealed challenge is authored by two external model families, and this protocol is frozen
before either of them has written a case.** That ordering is the whole point of the record: a
provenance claim made after the artifact arrives is worth nothing, so the namespace, the split, the
per-half composition rule, the assembly order and the corpus version are fixed here while **no case
exists**. `src/lib/ai/evals/design-intent-challenge-protocol.ts` carries the same facts as checkable
values, and `git` carries the proof of the ordering: the protocol commit adds no corpus file, and
`docs/model-evals/design-intent-sealed-challenge-v3.json` does not exist in its tree.

**The author split, precommitted.** Six cases `DIC3-G01`–`DIC3-G06` from a fresh ChatGPT session;
six cases `DIC3-M01`–`DIC3-M06` from a fresh Gemini session; **zero from Claude**, which authored
every prior corpus in this programme and is therefore prohibited from supplying prose, premises,
identity content, names, event concepts, constraints, inspiration devices or notes for any v3 case.
The lead's role here is custodian and operator only: receive the halves, preserve provenance,
validate, assemble mechanically, run the corpus-integrity reviews, freeze if clean, stop. It does
not author, rewrite, complete, creatively repair or substitute a case, and `DIC3-` collides with no
prior namespace (`CU`, `DIR`, `DIV`, `DIV2`, `DSC`, `HO`, `RB`, `SC`, `SC2`).

The source labels are **provenance only** and must never reach the DesignIntent model or the blind
qualitative reviewer — a reviewer who knows which family wrote a case is no longer rating the case.
And the attribution is **user-supplied provenance, not a cryptographic claim**: nothing in a JSON
file proves which model produced it, the record says so plainly, and no later reader is entitled to
treat the label as stronger than that.

**What neither author sees.** Any previous corpus; any invalidated sealed challenge; any prior model
output; the DesignIntent prompt; wire schemas beyond the published author-facing field contract;
provider code; input assembly; the planner or validator implementation; known model failures; prior
qualitative reviews; §3.7's arithmetic; the expected outcome; any statement about what would produce
GO; and the other author's half before both are complete. Each author receives only the same
published author-facing capability, structural and expressive-surface contract, with the namespace
changed for its half, and **no examples drawn from existing corpora**.

**Composition, fixed before the cases so that nothing is selected after them.** Each half is exactly
six cases. Within each half, exactly one pair shares an `eventType` — two materially different
instances of that type — and the other four types are distinct within that half. That guarantees at
least two same-event-type pairs in the final twelve without anyone choosing cases after reading
them. Cross-half accidental matches are legal and are not on their own grounds for editing
anything. There is **no "best six from a larger pool"**: one commission, exactly six cases.

**The author-facing expressive surface is the already-accepted published contract** (§3.8, T19C),
restated for the external packet rather than rewritten. The author writes authoritative
`EventIdentity` fixture state — not a host prompt and not a DesignIntent. `family`, `tonalDirection`
and `composition.hierarchy` are planner-assigned; typography is chosen downstream from twelve
conventional pairings across six categories, and motifs from a bounded curated vocabulary; the model
still owns palette, the pairing within its narrowed category, density, the four non-hierarchy
composition dimensions, motifs within the allowed surface and the host-facing presentation. So a
case must not turn on the model inventing a specific typeface, script, handwritten, stencil,
proprietary or custom lettering system: `typographyDirection` describes scale, weight, contrast,
case, spacing and hierarchy character, and natural-language `visualMotifs` may inspire downstream
interpretation without a literal unavailable motif being the only acceptable answer. A planner-owned
value is never scored as though the model chose it. **Planner ownership never excuses correctness**:
a concept that contradicts an authoritative `hostConstraint` is a genuine failure whatever produced
it.

**The quality rules carried forward, both halves.** Authoritative `hostConstraints` come only from
explicit host voice; positive style direction belongs in the creative brief rather than
automatically in constraints; `creativeGuidance` is advisory; a case may correctly carry zero
constraints; briefs must be satisfiable; `suppliedFacts` are never shown to DesignIntent, and where
they are invention traps their literal values must not also appear in the identity prose; no
manufactured impossible colour combination; ordinary real-world events are welcome; not all six
cases quirky, tragic, anti-premium, anti-restraint, maximalist or benchmark-clever; range emerging
from genuinely different events rather than a checklist of opposites; varied presence of visual
inspiration; no one inspiration-device formula repeated across a half; no authorial house template
for `creativeDirection`, `hostConstraints`, `creativeGuidance` or notes.

On tone keywords the guidance is deliberately guidance. Event-rooted particulars are preferable to
generic category adjectives *when natural*, because generic adjectives have repeatedly collided with
model-visible language — but **"no bare adjective ever" and "no cross-corpus word overlap ever" are
not acceptance criteria**. Cross-corpus ordinary vocabulary overlap stays diagnostic: "practical",
"working", "proud" and "warm" recurring across unrelated events invalidate nothing. The goal is
natural briefs, not lexical gaming, and a mechanical zero-overlap rule would buy the second at the
cost of the first.

**Receiving, and what is recorded.** Each half arrives as one JSON object — version plus exactly its
six ids. The raw external response is preserved byte-for-byte as provenance before any
normalization, and the record carries source family, date received, namespace, SHA256 of the raw
artifact and byte count. A half that arrives first may be inspected for syntax, schema and mechanics
immediately; the final semantic comparison waits for both, and neither half's contents are exposed
to the other author.

**Mechanical checks per half, then assembly.** Exactly six cases; the exact namespace; unique ids;
exactly one within-half same-`eventType` pair with the other four distinct; `EventIdentity` schema
validity; legal `suppliedFacts` keys; required and avoided hex satisfiable; no literal supplied-fact
value improperly echoed into identity prose where the case relies on invention detection; the
leakage scan against every registered model-visible surface; within-half recurring-phrase
diagnostics; no repeated names or identifiers; no authorial template collapse. Assembly is then
mechanical and predeclared: top-level version `design_intent_sealed_challenge_v3`, cases in the order
`DIC3-G01`–`DIC3-G06` then `DIC3-M01`–`DIC3-M06`, **never reordered by quality, difficulty or
content**, neither author's prose edited to make the halves sound alike, and the whole-corpus
structural contract run with `gated: true`.

**Semantic premise-overlap review, before the system-aware one.** Lexical comparison is diagnostic,
not dispositive — that is the lesson the second candidate cost, and the review that found it is now
a standing gate. The semantic reviewer may read the new twelve and the prior corpus premises and
notes needed for comparison, and must not read the DesignIntent prompt, provider implementation,
model-visible request assembly, known outputs or prior qualitative failures. Nobody tells that
reviewer which cases either author suspects. It looks for whole-premise duplication, the same event
imagined twice, distinctive device reuse, the same unusual emotional or design problem, the same
solved creative problem under different wording, unusual phrase reuse, name or identifier reuse too
distinctive to dismiss, recognisable benchmark-author house patterns, ChatGPT/Gemini cross-half
overlap, and overlap with readable prior corpora that makes a new case answerable from known
benchmark patterns. Ordinary archetypes and generic English are not enough. The verdict separates
harmless common-domain similarity, noteworthy but non-disqualifying overlap, and substantive
teachable overlap requiring action.

**Repair policy, and the line it draws.** Mechanical, corpus-only repairs are allowed: JSON, syntax
or schema correction, exact id and namespace correction, a narrow leakage-collision rewrite, a
narrow accidental duplicated name. Where such a repair needs authorial prose, an **abstract** finding
goes back to the same external author through the user — **Claude supplies no replacement prose**.
One isolated case with a clearly severable premise or device problem is reported and stopped on
rather than silently replaced. If several cases in one half need re-premising, or that author's
distribution is visibly converging again, the **entire six-case half is invalidated and
recommissioned from the same precommitted family**; survivors are never cherry-picked from a larger
pool, because iteratively coaching an author produces a bespoke benchmark, which is the failure this
protocol exists to avoid.

**The system-aware fairness review is final, and it is the last gate before freeze.** It runs only
after semantic overlap passes. That reviewer may understand the true expressive surface and must
explicitly consider satisfiability — whether a correct Phase 4C system could succeed on each case
without capabilities outside its contract. PASS with no case change required freezes the corpus
unchanged. **Any required case change invalidates the assembled corpus**: a system-aware finding is
never returned to an author and the corpus then reused, because a corpus a system-aware reviewer has
read is no longer sealed whatever the packet later says — which is exactly what the first candidate
cost. A reviewer-packet or benchmark-machinery defect is a stop-and-escalate, not an edit. And **no
implementation remediation is permitted in response to the cases**, in either direction.

**Freeze, and then stop.** If every pre-run gate passes, `docs/model-evals/design-intent-sealed-challenge-v3.json`
is frozen with its final SHA256, byte count, twelve ids, author split, per-half raw-artifact
digests, structural result, leakage result, lexical diagnostics, semantic-overlap verdict,
system-aware fairness verdict, and the isolation and provenance limitations stated rather than
smoothed over. **No result directory joins `PROTECTED_RESULT_DIRS`**, because no evidence run
exists and a directory joins that list in the same change that commits the evidence it holds. The
freeze reconfirms that every model-visible T21 artifact is byte-identical to the accepted state at
`be016f8`, that `design-intent-gate.ts` is byte-identical at `8f5ca5ab…`, and that no prompt,
schema, provider, seam, planner or validator change occurred.

**No paid run is authorised by any of this.** The earlier T22 authorisation was never consumed —
no provider invocation occurred — and it does not transfer to this corpus. After v3 survives every
review and freezes, the task stops and returns for an explicit new run authorisation.

**The second sealed challenge was invalidated too, and for a reason no repair reaches: a fresh
session is a fresh context, not a fresh distribution.** `819e5fc` authored twelve cases,
`SC2-01`–`SC2-12`, digest `296245d5…`, 39,465 bytes. It was mechanically clean before semantic
review — gated contract, leakage scan, within-corpus recurrence, and an author-command isolation
audit showing no prior corpus was read. **Preserve that distinction: this was not process
contamination.** The author obeyed its seal.

The independent semantic premise-overlap review — the control added precisely because lexical
scanning had missed this class once already — found two whole-premise duplicates of existing
cases, four more reusing a distinctive device or landing on a design problem a readable corpus
already teaches, reused surnames, and a programme-wide house idiom visible across corpora written
in separately sealed sessions: the archival printed artefact as inspiration, the anti-elegiac
memorial, "the object not the person", the host who forbids the premium default, "do not name the
painful fact".

Those are one authoring distribution showing through six independent contexts. For the strongest
generalization evidence in the programme that is not enough, because the regression corpus is
**readable during implementation** — so a sealed case drawn from the same distribution measures
in-distribution recall rather than generalization. Repairing the cited cases would clean the
symptoms and leave the cause, so the candidate is invalidated whole: preserved at its authored
path, recorded in `INVALIDATED_CORPORA`, pointed at by nothing, never used as evidence. The slot
now names a third path and a third result directory.

**The next sealed challenge must come from a genuinely different source distribution** — a human
author who has seen none of the implementation or prior cases, or a model family that has authored
no corpus in this programme. Another fresh session of the family that wrote the earlier corpora
does not qualify, which is the whole finding.

**One nuance, so this does not become its own defect.** Ordinary vocabulary recurring across
unrelated events — "practical", "proud", "working", "deadpan" — is *diagnostic*, never a hard
gate. Twenty-two of this candidate's tone keywords appear in other corpora and that fact alone
convicts nothing; real events share ordinary words. What is disqualifying is whole-premise
duplication, distinctive device reuse, unusual phrase or name reuse, recognisable
benchmark-author house patterns, and anything else making a new challenge answerable from what is
already readable. A mechanical zero-overlap rule would push authors into lexical gaming and buy
nothing.

**Also recorded, because the lead's own control was narrower than its description.** Tone-keyword
uniqueness had been checked *within* a corpus and reported as though it settled recurrence. Across
corpora it does not, and the gap was invisible until a reviewer with no lexical tooling read the
cases and saw the idiom. Cross-corpus lexical comparison is now part of the pipeline as a
diagnostic feeding the semantic review, not as an acceptance criterion.

**The first sealed challenge was invalidated before it was frozen, and it was the reviewer's
context that failed rather than the cases.** `c6ccf2a` authored twelve cases, `DSC-01`–`DSC-12`,
digest `080cbaa1…`, 43,482 bytes. They passed the gated structural contract, the leakage scan
across all eight model-visible surfaces, the cross-case recurrence checks and the cross-corpus
overlap check, and their author's isolation was audited clean across fifteen commands. The
system-aware fairness review then accepted every case and asked instead for two things the
**reviewer packet** does not say: that typography is chosen from a bounded curated table and
motifs from a fixed set, and that `family`, `tonalDirection` and `composition.hierarchy` are
planner-assigned rather than model-chosen. A blind reviewer without those facts can mark a lawful
output down for a capability this stage does not have, or read a planner-assigned value as the
model eroding a host constraint.

Correcting the packet and reusing the same corpus was refused, and the reason is worth stating
plainly because it is not obvious: **a sealed challenge is sealed by who has read it, not by what
its packet says.** Once a reviewer who has seen the prompt, the schema and the provider boundary
has read the cases, no later correction to the packet makes those cases unseen again. Repairing
the corpus in response to that reviewer's findings would have been the same move, one step
further on. So the candidate is invalidated, preserved at its authored path, recorded in
`INVALIDATED_CORPORA` with its digest, pointed at by nothing, and never used as evidence — and
the challenge slot now names a replacement path and a replacement result directory, so its v1
evidence identity is not reused either.

Two further things the review established, both kept: the **zero-provider-call** state was never
broken — no run happened, no money was spent, and the T22 authorization is therefore unconsumed;
and lexical overlap controls **cannot see premise-level duplication**. Two cases reproduced the
shape of cases in the pre-registered set closely enough to measure in-distribution recall rather
than generalization, while sharing no n-gram the scanner could catch. The replacement therefore
adds a **semantic premise-overlap review, run before the system-aware fairness review**, by a
reviewer who compares corpora but does not see the implementation — so a premise defect can still
be repaired by the still-isolated author, while a system-aware finding cannot.

**Two freeze commits described themselves more tidily than they were, and both corrections are
kept here rather than in a conversation.** A record that rounds off its own edges is worth less
than one that does not, and in both cases the overstatement was caught by review rather than by
the author.

*T20B* is recorded in its row as *"the new corpus file alone"*. `7c0799e` was not literally a
one-file commit: besides `design-intent-validation-v2.json` it changed `docs/model-contracts.md`,
this document, and comment-only text in `src/lib/ai/evals/corpus.ts`. The property that actually
matters held exactly — no grading machinery, runner, checker, gate, prompt, schema, model
implementation or production behaviour changed at T20B — and every edited line in `corpus.ts` sat
inside a block comment, verified line by line.

*T21* says the eval seam was its **only** touch to frozen evidence machinery. That is overstated
in the same direction. `fc1ae8b` also added two entries to `MODEL_VISIBLE_SURFACES` in
`corpus.ts` — `"design intent provider boundary"` and `"design intent input assembly"` — where at
T20B that map named only the DesignIntent prompt and wire schema. Three things keep it a
disclosure rather than a gate failure, and all three are checkable. `corpus.ts` is not one of the
hash-pinned modules, and the map is the declared extension point: `prompt-leakage.test.ts` reads
it rather than a literal list, which is why nothing in the frozen scanner had to move. The change
only **widens** leakage coverage — without it, every label, delimiter and preamble T21 introduced
would be unscanned model-visible text, which is the hole the Event Identity pair exists to close,
and it caught a real collision on its first run. And the gate, the checker, the runner and the
evidence module are byte-identical to their T19/T19B digests, so nothing about grading moved.

Most importantly for the evidence: **the sealed challenge did not exist when this widened surface
list was frozen.** Its author writes against the list as it stands, so the strongest evidence set
in the programme is authored after the expansion rather than before it — which is the order that
makes the expansion harmless.

**The T19/T20 candidate chain, and why it is recorded rather than rewritten.** `411cf1c` (the first
T19 freeze) and `86e9551` (the first 4C corpora) stay in history exactly as they happened. They are
**candidate evidence design, invalidated at T19B**, and the reason is the one above: independent
review found a stage-observability mismatch in the host-constraint criterion. Two things make this
recoverable rather than a lost programme. No DesignIntent provider call had been made, so no model
output existed to tune a criterion against; and no T21 implementation had entered history, so the
prompt was not written against the broken rule either. That is the whole window in which a frozen
benchmark may honestly be corrected, and it closes the moment either of those becomes false.

What the correction costs is the **pre-registered validation corpus**, and the cost is paid rather
than argued away. `docs/model-evals/design-intent-validation.json` was authored under the old rule
and was read while the rule was being changed; whatever its cases say, it can no longer be called a
set whose criteria were fixed before it existed. It is preserved unchanged, its digest pinned, no
eval set points at it, and it is never run as pre-registered evidence for the corrected contract.
The **regression** corpus is a different class — `§3.4`: freely readable, claiming no
pre-registered generalization — so it stays in service if the corrected machinery still accepts it,
which is a fact to demonstrate rather than assume. The **sealed challenge** does not exist and is
untouched.

**Who owns the production DesignIntent call, settled at T19 because no row owned it.** T18 built
`src/lib/ai/design-intent/*` — the contract, schema, narrowing and validator — and deliberately
built no call; `getAiProvider()` still throws and `src/lib/ai/openai/` holds only the EventIdentity
implementation. Read literally, the table left the provider boundary unassigned, and the cheapest
way for T22 to proceed would have been for the eval runner to construct its own OpenAI request.
**That is forbidden, and the reason is already written down.** `rerun-runner.ts`, citing 4B's T9:
*"the eval seam should call the same production assembly logic used by the real EventIdentity rerun
path … A second assembly written for the harness would let the set pass while production sent
something else, which is the one outcome that makes the whole exercise worthless."* A sealed
challenge is generalization evidence **about an implementation**; evidence about a request shape
that ships nowhere is evidence about nothing.

So **T21 owns it**, and the row above now says so. This follows 4B's own shape rather than
inventing one: T4 prewired the harness with a one-line seam pointing at a refusal, and T9 — the
last implementation before the run — repointed that seam at production and changed nothing else in
the frozen harness. T19 therefore prewires the 4C seam the same way, and T21's only permitted touch
to frozen evidence machinery is repointing it.

Two obligations come with that ownership, both T21's and neither optional. **The cost bound.** The
verified rate table in `identity-cost.ts` is a property of the *model* and applies to any call on
it; `perAttemptMaxUsd` is a property of an *attempt shape*, and EventIdentity's was derived from
EventIdentity's. T21 derives DesignIntent's own bound from the same verified rates and its own
output configuration, records it under its own profile version, and leaves the live path failing
closed when the configured model has no verified profile. Inheriting the number, or inventing one,
are both refused. **The version rule.** `design_intent_v4` and `design_intent_schema_v4` are a
pre-provider contract and draft that no model has ever been sent. If T21 changes model-visible
text, prompt and schema versions bump **together** (§5.1's rule, and the `v5` lesson), the previous
asset is preserved in `history/`, and old bytes are never relabelled as the new version.

---

# Part V — Gates

## The Phase 4B exit gate

Phase 4B passes when all **fifteen** hold. Items 1–14 are proven offline — item 12 being the
PostgreSQL 17 requirement, run before the T12 implementation freeze — and item 15 requires the one
authorized live run. (An earlier version of this sentence said "twelve", and named item 12 as the
live run; it contradicted the table below it and the `T12` and `T13` rows.)

| | Requirement | How it is proven |
| --- | --- | --- |
| 1 | A Route B identity is provisional and cannot flow downstream | type-level (branded `AuthoritativeIdentity`) plus a db test that the authoritative pointer refuses it |
| 2 | A zero-question or Route-A-only identity is authoritative | TS/SQL parity tests over constructed shapes and the four `v5` journals |
| 3 | The original event prompt is byte-identical across rounds | version-named assembly golden files (§B.3) comparing the prompt string sent on round *n* with round 1; **plus a db test that `events.prompt` cannot be updated even by service role** (§B.2) — a refusal, not a source scan |
| 4 | Clarification answers are first-class durable host input with provenance | the §B.2 binding triggers: wrong event, wrong index, wrong `kind`, drifted copy and duplicate all refused |
| 5 | Newer clarification input takes the intended precedence without mutating history | assembly golden snapshots show labelling and precedence; answer rows are append-only; earlier rounds unchanged |
| 6 | Multiple boundary rounds are possible with no lifetime cap | orchestration test driving ≥ 3 boundary rounds; no cap constant exists anywhere (asserted by scan) |
| 7 | Route A never blocks generation | test: an unanswered and a deferred creative question both proceed |
| 8 | Late Route A input never retroactively changes the identity or the downstream handoff already in progress | orchestration + db: the answer is appended and stays bound to the revision that asked it; `events.prompt` is unchanged; the authoritative revision that launched the handoff is neither mutated nor silently rebased onto a newly rerun identity; no second downstream generation is started merely because the answer arrived; the answer is offered as input to a **new** round. **The persisted-batch half of this invariant is proven at T16**, where `generation_batches` exists — see the proof-ownership note at the end of §C |
| 9 | Identity refresh and retry are idempotent | orchestration + db: repeated requests observe **one identity revision**, not a second; a redundant refresh starts no additional downstream handoff. **Batch idempotency — one in-flight batch per event, and the colliding batch and sibling idempotency keys — is proven at T16**, for the same reason as item 8. The `generation_runs.idempotency_key` collision is not deferred: that column predates Phase 4B and its refusal is proven in the Phase 1 suite |
| 10 | The database cannot mark a boundary-bearing identity authoritative via a stale or false flag | db tests: an `INSERT` naming `is_provisional` is rejected (`428C9`); the pointer trigger still refuses when the column is tampered with directly; an unrecognised `schema_version` and a malformed `clarification.questions` are **refused rather than read as authoritative** (§A.3) |
| 11 | Host/co-host authorization and RLS for answers and revisions are correct | db tests per the existing permission matrix, including negative cases: a non-member cannot answer; a co-host cannot attribute an answer to the owner (`answered_by = auth.uid()`); and **a member cannot move the event's authoritative-identity pointer**, which requires that column to be in `protect_event_server_columns()` (§A.3 property 4) |
| 12 | **The migrations and the whole database suite pass against PostgreSQL 17**, the version `supabase/config.toml` pins | run before the T12 implementation freeze, on 17 rather than a local 16 substitute. Phase 4B does not close on the substitute: `ALTER TABLE … SET EXPRESSION` is 17-only and was worked around locally, and a generated column plus deferrable-FK design is exactly where a version difference would surface |
| 13 | **No production EventIdentity call is reachable without the call-level controls in front of it** | unit + db (§A.5, T9A): caps, ceiling and rate limit are consumed in one transaction that rolls back on refusal; `generateEventIdentity` is not called when the claim is refused; two concurrent identical requests yield one claim and one call; a refresh and a replayed POST consume no quota and start no call; `expired_unknown` requires an explicit host retry while `abandoned` is reclaimed automatically — and only from a committed null `provider_invoked_at`; a `response_captured` claim is always completed without a second model call and can never wedge the event's identity — including after a config change alters the key, because the step-3 lookup is event-scoped; two concurrent completers produce exactly one revision, enforced by the conditional state transition **and** by `unique (generation_run_id)`; the lease exceeds the boundary's bounded worst case and is pinned to it; a mid-flight config change cannot start a second paid call; every refusal returns one indistinguishable payload and leaks no counter |
| 14 | **Every paid provider response has a durable home, and the clarification state has exactly one source** | db: `generation_runs.provider_response_evidence` holds the ordered texts for all seven outcomes of §A.7, with `[]` and `null` distinguished; the column is unreadable by `anon` and `authenticated` and absent from the orchestrator's return type; no response body is written to `reprompts`; the bounded purge path nulls the evidence, keeps the run row and its metrics, and **skips every run referenced by a non-terminal claim**; and `awaiting_clarification` exists nowhere as a stored value, with the §A.8 derivation returning *awaiting clarification* and *consumable downstream* separately and agreeing with `is_provisional` and the authoritative pointer respectively |
| 15 | The pre-registered rerun-behaviour set passes its frozen mechanical and qualitative criteria | T13: one authorized live run after the T12 implementation freeze, graded against the criteria frozen at T5 — **before the cases existed** — and classed per §3.9. Evidence protected at T14, in the same change |

Plus the standing gate: deterministic checks green, independent engineering review, and an explicit
go/no-go recorded with its SHA chain.

## The Phase 4B close — the go/no-go record

**PHASE 4B — GO.** Recorded here, beside the gate it answers, so a reader does not have to
reconstruct the decision from a changelog. This is a **closure record, not a new evaluation**: it
adds no requirement, and it neither softens nor strengthens a frozen criterion. Nothing below was
decided after the results were seen.

| | |
| --- | --- |
| Implementation freeze (T12) | `4d168ed45455495acd8e2acbaad5c47feeb4843b` |
| Operational lineage carrying T13 into T14 | `5993c52993dfbf3a0ec1c4f250c94975e50dc0be` |
| T13 evidence committed and protected (T14) | `356eb245a991a49daa2903d95dafa9f8f72b56ec` |

Gate items 1–14 were proven offline at the implementation freeze and its reviewed lineage, item 12
on PostgreSQL 17 as that row requires. Item 15 passed under the criteria frozen at T5, **before the
cases existed**, applied unchanged.

**T13 — one authorized invocation.** The set ran once, from a detached worktree pinned to the
implementation freeze, so the evidence cites the frozen implementation rather than operational
HEAD. Ten logical calls and ten provider responses, one attempt each: **0 transient retries, 0
repair retries**, every response schema-valid on the first call. Recorded cost approximately
**$0.4987**, priced from recorded telemetry against the verified `gpt-5.6-sol` profile. No attempt
had unknown usage.

**Mechanical — 10/10.** Every case passes; **no frozen check reports `fail`**, and none reports
`advisory`. The five absolute checks decided on every case they apply to, `answerBoundToItsQuestion`
on the four cases carrying two or more answers.

**Independent blind qualitative — 30/30 Yes, 0 No.** A fresh GPT Astra session with no prior
project context read `blind-review.md` **alone** — no mechanical report, no corpus, no case ids, no
dimensions, no rationales, no expected outcome, and no position-to-case mapping — and answered the
three frozen questions on each of the ten cases, citing the text.

The generated evidence was committed **unchanged** and its directory joined
`PROTECTED_RESULT_DIRS` in the same change (T14). No criterion was altered after the results were
seen, and there was no rerun and no tuning.

### What this GO does not license

Five limits are part of the record, not caveats to be dropped when it is cited later.

1. **T13 validates the clarification-answer input shape and lifecycle, not EventIdentity's creative
   quality.** Design and interpretation quality are evidenced by the `v5` sealed challenge
   (`model-contracts.md §4.6`), and by nothing here.
2. **The prior clarification rounds in the T13 cases are hand-authored fixture state.** Only the
   rerun was a live call, so T13 does **not** show that EventIdentity chooses good questions, or
   chooses to ask at the right time. No frozen check in this set observes question generation.
3. **Cumulative history is verified as rendering, not as selection.** The harness hands the
   assembly the full history, so the production query that gathers every prior answer sits *above*
   that seam and is not evidenced by T13. That production behaviour is owned by Phase 4B's
   deterministic orchestration and provenance coverage (gate items 4, 5, 8 and 9), which is where
   it is proven.
4. **The T13 command's Vitest process exited nonzero, and that is preserved as history.** The
   sibling `creative-understanding.eval.ts` runner refused `EVAL_SET=rerunBehaviour` during
   collection, exactly as its guard is written to, and made no provider call. The clarification
   runner itself completed all ten cases and wrote `mechanical-report.md`, this set's completion
   artifact. The ergonomics of a shared eval project are recorded as future debt; they were not
   "fixed" at T14 or here, because doing so would edit frozen machinery after a run it graded.
5. **The `response_captured` long-recovery behaviour remains held debt**, technical and product
   both. A durably captured paid response whose deterministic completion keeps failing for a
   non-deterministic reason can sit in recovery until the 48-hour terminaliser while polling
   retries, costing no second model call and losing no evidence. What the host should be told, and
   after how long, is an open product decision. This GO does **not** declare it solved.

## The Phase 4C exit gate

§3.7 in full — the distribution rule **and** the systemic veto, both frozen at T19 before the prompt
exists and before the sealed corpus is authored, with the reviewer protocol of §3.8. Neither half
can be waived by the other.

**Plus one requirement inherited from Phase 4B, which could not be proven there.** The persisted
half of the late-Route-A invariant (4B gate items 8 and 9, §C) is **proven at T16 and verified
here**, because `generation_batches` is created at T16. Against a real `planned` or `running` row — never a mock,
a fake batch object or a test double — it must be proven that a late concrete Route A answer leaves
that batch's `identity_revision_id`, planner version, assignment and persisted inputs unchanged;
does not cancel it and does not rebase it onto a newly rerun identity; cannot create a second
in-flight batch for the same event; leaves the answer attached to the earlier asking revision; and
that a new round may begin only through the canonical new-round path, once the current batch no
longer blocks it. Two companions close here for the same reason: §C row 3 — an answer landing
*before* a batch starts yields a batch planned from the new authoritative revision — and
idempotency's persisted half, one in-flight batch per event with colliding batch and sibling keys. Phase 4C does not pass its gate with this item open, and it is not
satisfied by re-citing the 4B orchestration test, which by construction never saw a batch row.

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

Three tensions live in canon rather than in this plan. A plan document orders work and defines no
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

### CA-4 — RESOLVED: the question is rendered with the answer

`event_identity_input_v2` gives the model the exact prior clarification question together with the
host's answer. For each carried clarification it renders the question text, the selected option
label when the host selected one, the host's typed text when supplied, and the defer state when
that was the host's choice.

It does **not** resend the unselected option menu for context, `whyItMatters`, or any other
model-generated rationale that is not needed to interpret the answer. The point is attribution —
*previous system question → host's current answer* — rather than presenting model-authored question
text to the model as though the host had written it.

Encoded in the frozen machinery, not only here. `questionRenderedWithAnswer` requires every carried
question's exact text in the transmitted request, in chronological order, and fails an assembly
that sends the answer alone. `menuNotResent` fails one that sends back an unselected label or the
revision's `whyItMatters`; a label the host or a question already used is never counted against the
assembly. And `answerBoundToItsQuestion` is what makes this attribution rather than co-presence: an
assembly that renders question 1 with answer 2 and question 2 with answer 1 satisfies both of the
above and fails this one. Occurrences falling inside a rendered question are discounted, so an
option label that is a word of its own question stem — "Warm or cool in feel?" with options
"Warm"/"Cool" — cannot satisfy a check by accident.

It carries one obligation for T9, stated in the seam because no check can verify it: render each
answer adjacent to its own question, and do not repeat a question's text earlier in the message.
Grouping every question into one block and every answer into another is not wrong in itself, but it
is indistinguishable from a crossing by any local rule, so the harness refuses it.

### CA-5 — RESOLVED: clarification history is cumulative

Round N carries every prior clarification answer still relevant to that rerun, in chronological
order. EventIdentity is a stateless call, so an earlier answer omitted from round N is no longer
available to the model at all, which contradicts `multi_round_provenance`.

With it: the latest clarification takes precedence where it directly conflicts with earlier host
input; `events.prompt` stays byte-identical and separate; history is never flattened into the
prompt; and provenance stays per answer, per question, per revision.

Encoded in the frozen machinery. `historyDelivered` requires every carried answer's option label
and typed text in the transmitted request — discounting occurrences inside a rendered question, so
a label that is a word of its own question stem cannot stand in for the answer — which means an
assembly that sends answer 1 in one round and silently drops it when sending answer 2 fails
mechanically. `answersAssembledAsGiven` no longer
accepts "either this round's answers or the cumulative set": it requires the cumulative history for
that rerun, in order, field for field.

### The setup dependency, and how it was removed

The first version of this contract asked the T6 author to predeclare `questionIndex`, `kind`, an
option label and a defer state — for a question that would not exist until a live model call
produced it, during the very run those answers were meant to drive. The corpus referred *forward*
to a stochastic output its author could not observe, which had two failure modes and no good one:
either the live setup call asked no question, or a different route, index or labels, and a correct
assembly failed permanently for a reason unrelated to assembly; or the harness answered a question
nobody had asked, and stopped exercising production's clarification semantics. `defer_is_an_answer`
made it plainest — a corpus cannot truthfully name the model's single defer option before that
option exists.

**The prior clarification history is now frozen setup state, authored with the case.** A case
carries the host's original prompt and a `history` of rounds; each round holds the questions that
were asked and the host's answers to them. `buildSeededRevision` turns each round into a
schema-valid `EventIdentityResult` — the same shape `event_identity_revisions.result` persists,
parsed by the real schema in a static test — and the runner sends those as `priorRevisions`, so T9
resolves `(revision, questionIndex)` exactly as production resolves `(identity_revision_id,
question_index)` against an immutable revision. The **one** paid call per case is the rerun.

Nothing was loosened to achieve it:

- an answer still cannot name a question that does not exist — the contract refuses an out-of-range
  `questionIndex`, an option the question did not offer, a defer that is not the question's own
  defer option, and a boundary answer marked deferred;
- `kind` is derived from the question rather than declared by the author, so an answer's route can
  never disagree with the question it answers;
- the answer carries no question text through the seam, so an assembly cannot render a question the
  host was never asked; it must read the question out of the revision envelope;
- a missing or mismatched live question is not turned into an advisory result — there is no live
  setup question to mismatch;
- the evidence claim is unchanged and does not expand to question-generation quality. No frozen
  check asks whether the rerun chose to ask anything.

The setup is fixture state and says so where it can be misread: the placeholder brief names itself
a fixture in its own text, and the blind artifact labels the setup **"written by hand, not
generated"** and tells the reviewer only the final interpretation came from a live call.

**One scope limit to state before a clean T13 run is read as more than it is.** This set exercises
the rerun's assembly, not the production path that *creates* a clarification question: no frozen
check observes, and no evidence here supports a claim about, whether EventIdentity asks well or at
all. That remains the spent v5 sealed challenge's territory. And T9 owes the harness three things
the frozen seam states but this plan should not leave only there: `requestText` is the assembled
user message rather than an encoded request body, host free text reaches it unnormalised (trimming
excepted), and it is the assembly's **own user message and nothing else** — not the correction turn
a repair retry appends, and not the assistant echo of the model's previous schema-invalid response
that the boundary puts between them. That echo is raw model output carrying model-invented option
labels, and `menuNotResent` is a negative substring scan, so including it would let a stochastic
repair reach a permanent verdict — the same defect that reopened this freeze. Nothing is lost:
the boundary rebuilds the user message identically on every attempt.

**What the T6 author brief must publish, and T7 must check.** The frozen validator now checks far
more than it did — an answer's locator, its option, its defer semantics, duplicate question text,
multi-round coverage for the multi-round dimension, and `expectedFacts` keys against the real
schema. These are what it still cannot check, and each is a way a *correct* T9 implementation could
fail the one paid run permanently. All are fixable at the corpus, which is what T7 is for (§3.5).

1. **`mustNotInvent` is a case-insensitive substring match over the rerun's fact *values*.** A term
   must not be a substring of anything the host legitimately said in that case. (`expectedFacts`
   needs no guidance any more: its keys are refused against `SUPPLIED_FACT_FIELDS` and its values
   must be `null`, because a quoted value would ask the author to predict a trimmed verbatim span.)
2. **A question's text must not appear inside the case's own prompt or an answer's free text**, or
   `questionRenderedWithAnswer` cannot distinguish a rendered question from an echo of the
   description, and `menuNotResent`'s allowlist would mask a resent label.
3. **Dimension coverage is T7's to check**, since nothing frozen requires the corpus to span all
   seven — only that a `multi_round_provenance` case carries at least two rounds, which the
   validator does enforce.
4. **At least one case must carry two or more answers**, or `answerBoundToItsQuestion` reports
   `n/a` for the whole run and attribution — the point of CA-4 — is never decided by this set. With
   a single carried answer the window is the whole request, so the check can only fail where
   `historyDelivered` already has; it reports `n/a` rather than a `pass` that would claim more than
   it measured. The validator enforces dimension *validity*, never *coverage*, so this one is a
   review obligation and cannot be moved into the frozen file.

The hazards an earlier draft listed here are now refused in code instead, which is the right place
for anything a reviewer would have to catch by eye in a corpus written by someone who cannot see
the checker: the response-level boundary-exclusivity and question-ceiling rules the real schema
enforces, question and label length bounds, leading or trailing whitespace on a question or a
label, a question text that contains another's, and answers listed out of `questionIndex` order.

**Three procedural notes that are not code.** (1) `src/lib/ai/evals/rerun-behaviour.ts` and
`tests/eval/clarification-rerun.eval.ts` compile against `report.ts`, `journal.ts`, `lifecycle.ts`,
`corpus.ts` and `event-identity/contract.ts`; a signature change in any of those would force an edit
to a file that must never change, so treat them as frozen-by-dependency until T14. (2) The T8
corpus-freeze commit should re-pin `corpusPath("rerunBehaviour")` and `RERUN_BEHAVIOUR_OUT` beside
the corpus digest — the paths live in an editable file, and the T13 evidence is only as attributable
as they are. (3) The T13 reviewer instruction must say that the artifact is given **alone**:
blinding in `blind-review.md` is positional, and `mechanical-report.md` lists the case ids in the
same order.

**What T9 must render, spelled out because T7 found both readings available.** Two obligations the
frozen seam implies but does not say in so many words, each of which would fail an absolute check on
an otherwise-correct assembly:

1. **A deferred answer's own selected label is rendered verbatim, alongside the defer state.**
   `historyDelivered` checks `selectedOptionLabel` unconditionally, including when `isDefer` is
   true, and the corpus contract *forces* a deferred answer to name its question's own defer
   option — so a defer case cannot be written any other way. An implementer who reads CA-4's "do
   not resend the menu" as covering the defer label, and renders only a defer marker, fails two
   cases. "Do not resend the menu" means the options the host did **not** pick.
2. **Host free text reaches the request unnormalised**, trimming excepted — no sentence-casing, no
   re-punctuation. `menuNotResent`'s allowlist and `historyDelivered` are case-sensitive, so an
   assembly that capitalised a host's lowercase phrase could both lose it from `historyDelivered`
   and trip `menuNotResent` against an unselected label it now matches.

**The 42-versus-41 label reconciliation.** T7 reported collision coverage over 42 option labels and
15 question texts; the T9 review reported hand-checking 41. The corpus has **42 label slots, all 42
distinct** (and 15 question texts, all distinct), so the discrepancy was an omission from the T9
review's inventory rather than a total-versus-unique distinction. The missing check was performed
afterwards and is now computed rather than eyeballed: `src/lib/ai/evals/rerun-compatibility.test.ts`
runs the production assembly over every frozen case and applies the frozen checker's own predicates
to the result. **No collision, on any of the 42.** Neither the corpus nor the checker was touched.
That test also keeps the property covered from here on, which matters because the frozen leakage
scan reads neither option labels nor question texts. That test now grades against
`checkRerunCase` itself rather than a re-implementation of its predicates, so what it proves is the
frozen checker's own verdict: on all ten cases, none of the five absolute checks fails.

**Two notes for the T9 packet.** The harness deliberately withholds the `question_text` and
`options` copies that `clarification_answers` carries, so the assembly must resolve the question out
of the revision envelope. That is stronger than production's minimum, and it means T9 must be
written to accept revision envelopes rather than growing a harness-only adapter — otherwise the
tested path is not the production path. And a case cannot represent a revision that asked nothing:
every history round carries at least one question, so a "revision 2 asked nothing, revision 3 asked"
shape is outside this set's fidelity. Neither affects a check; both should be known before T9.

### The T8 freeze record

| | |
| --- | --- |
| input-freeze commit | `943699547454f147b9beb2608622eece00765f3e` |
| corpus | `docs/model-evals/clarification-rerun-behaviour.json` |
| sha256 | `f637494fee567487e8b09d0fa405e3a014e5fc3565f8b464c53fdf85bc019394` |
| bytes | 15677 |
| output directory | `docs/model-evals/results/clarification-rerun-behaviour-v1` |
| cases | 10 (`RB-01`–`RB-10`) |

Dimension distribution: `answer_is_current_input` 2 (RB-01, RB-08);
`original_description_survives` 1 (RB-02); `answer_precedence` 1 (RB-03); `defer_is_an_answer` 1
(RB-04); `boundary_resolution` 1 (RB-05); `no_fact_invention` 2 (RB-06, RB-09);
`multi_round_provenance` 2 (RB-07, RB-10).

All six of those are pinned executably in `src/lib/ai/evals/corpus-provenance.test.ts`, which is an
integrity guard and nothing else: it reads no case content, grades nothing, and touches no criterion.
A commit SHA freezes the bytes for anyone who goes looking; it does not fail a build, and
`corpus.ts` — which decides where the set reads and writes — is not frozen. The guard fails on a
one-byte corpus edit, on a corpus-path redirect and on an output-path redirect, each verified by
mutation.

### Two provenance facts, recorded rather than smoothed over

**The presence tripwire (`c5e4abc`) was committed before the corpus entered the repository, but
after the independently authored cases had been returned and were known to this session.** It
changed only the non-scoring corpus-presence tripwire; it changed neither frozen scoring file,
no acceptance criterion, and used no case-specific content. It is therefore a **disclosed process
deviation**, not a claim that the edit predated case authoring, and it must not be described as
"written before the cases existed" or "before the cases were known". What it does buy is real and
narrower than that: T8 adds the corpus file and changes nothing else.

**The T6 author's isolation was instructed, not enforced.** They were told not to access the
repository, the checker, the prompt or the schema, and were given a self-contained packet instead.
The tooling did not prevent access. T7 was asked to look for artifact-level evidence that more had
been seen and found none — style, vocabulary and structure all diverge from the existing corpora —
but that is evidence, not proof, and this must not be upgraded to a claim of technically guaranteed
blindness.

### Why the database contract is hand-authored, and what stands in for generation

`npm run db:types` is `supabase gen types typescript --local`, and it could not be run here. Not
for want of a credential: the CLI is reachable, but `gen types` executes its introspection inside a
Docker container whatever `--db-url` it is given, and this sandbox has no reachable Docker daemon.
There is also no linked hosted project — no access token, no project ref, and the only configured
Supabase URL points at localhost. A token would not have unblocked it.

So the contract is hand-authored, as its own header has always said, and derived by introspecting
`information_schema` on a freshly migrated database rather than by reading SQL. **No PostgreSQL 17
generation is claimed**, and gate item 12 — the migration and DB suite passing on 17 before the T12
freeze — is unchanged and is where that gap actually closes.

What stands in for the generator is `tests/db/schema-drift.test.ts`, which checks the contract
against the applied schema in both directions: the column sets, the generated columns, the
callable functions, and — parsed out of `database.types.ts` itself rather than a third
hand-written list — the nullability of every column of every table. A column the database can
leave null while the contract types it non-null is precisely the bug T10 would hit, and it is the
one thing a name-only comparison cannot see. All three failure modes are mutation-verified: a
contract that under-states nullability, one that over-states it, and a parse that silently stops
matching.

### A third provenance fact: `prompt-leakage.test.ts` changed at T9

The T9 authorization said *"do not weaken or edit the leakage checker"*, and the file changed
anyway. Recorded plainly rather than argued away:

- **`src/lib/ai/evals/prompt-leakage.test.ts` was edited after the corpus freeze, despite the
  instruction.** It must not later be described as byte-identical across T9.
- **The change was generic and was required for the predeclared guard to keep compiling.** The
  guard pairs the assembly version with the existence of the file that version names, and it has a
  branch for each side of the bump. Both constants are literal types, so once
  `EVENT_IDENTITY_INPUT_ASSEMBLY_VERSION` became `event_identity_input_v2` TypeScript judged the
  `v1` branch unreachable and refused to compile the very guard designed to survive the bump. The
  edit widens one comparison to `string` so both branches still typecheck.
- **No corpus text and no observed result drove it.** It was a compile error, visible before any
  case was read and independent of what any case contains.
- **Scan coverage and collision criteria were not relaxed.** No surface was removed, no corpus was
  exempted, no threshold moved; the scanned surfaces, the folding, the span logic and the failure
  conditions are unchanged. The post-bump branch is in fact the stricter one — it requires the
  input-assembly file to exist and be scanned, which is what now puts every string T9 added in
  front of the scanner.

**Two scan-scope facts to record rather than leave looking like coverage.** The frozen
`prompt-leakage.test.ts` scans a case's `prompt`, `mustAvoid`, `hostPhrases`, `expectedFacts` string
values, `notes` and `rationale` — it never scans question texts, option labels or `mustNotInvent`
terms. T7 found two defer
labels colliding verbatim with model-visible text that the scan therefore could not see; they were
reworded at the corpus, as §3.5 requires, but the gap is real until T14 and a future corpus author
should not assume the scanner covers everything a case contains. Separately, `menuNotResent`'s
allowlist and `historyDelivered` compare case-**sensitively** while `noInventedFacts` compares
case-**insensitively**. Both are correct on this corpus and both are frozen; the asymmetry belongs in
the T13 evidence note so nobody reads a clean run as evidence about the other comparison.

**The inspiration channel is not T9's to add.** `event_identity_input_v2` is being validated for
clarification-answer assembly. Phase 4A's v1 input did not send inspiration even though canon
ultimately requires it, and that gap is recorded as debt. Adding it in the same model-visible change
would introduce a second untested input channel into the one run that grades the first, so it stays
a separate assembly-version change unless canon explicitly schedules it elsewhere.

### A fourth provenance fact: the leakage scan changed again at T19

The same rule about recording it, one phase along. **`src/lib/ai/evals/prompt-leakage.test.ts`
changed at T19 and must not later be described as byte-identical across it**, and the probe logic it
now calls changed once more in the T19 review round. Both happened before any 4C case existed.

- **The file itself changed once, to read a corpus shape it could not read.** A Phase 4C case has no
  host `prompt`: its frozen input is an authoritative `identity` brief. The scan reached for
  `.prompt` directly, so the moment T20 landed a corpus it would either have thrown on the first
  case or — quieter and worse — scanned nothing. The extraction moved into `corpus.ts` as the pure
  `leakageProbes`, unit-tested in `corpus.test.ts`, and the scan now reads whichever shape a case
  has. Coverage of the 4A/4B shape is unchanged, which its own test asserts field by field. The
  unscanned-corpus reporter became a subset assertion in the same change, so T20 and T22 can land
  corpus files without anyone editing benchmark-integrity tooling after seeing the cases.
- **`leakageProbes` then changed in review, to stop the scan reporting a leak nobody could fix.**
  Its first version pushed every string in the brief into the scan, including `compatibleFamilies`,
  `compatibleTonalDirections` and `compatibleTypographyCategories` — closed enums whose values are in
  the Event Identity prompt and the DesignIntent wire schema *because the schema puts them there* —
  and the `inspirationSummary` sentinel, which `contract.ts` requires verbatim. Every 4C case would
  have reported a leak on a value its author is not allowed to change, and §3.5 says a collision is
  fixed **at the corpus**. A corpus author cannot fix a forced value, so the only escape would have
  been editing the scanner after the cases existed — the one move the T19-before-T20 ordering exists
  to prevent. The enums and the sentinel are now excluded; every prose field an author actually
  writes is still scanned. `eventType` was dropped from the probes in the same change: it never
  reaches the model and never appears in the blind artifact, so it is not benchmark content.
- **Neither change was driven by a case.** No 4C corpus exists; both were decided from the schema
  and the corpus contract alone. Coverage was widened, not relaxed: two model-visible surfaces were
  added at T19 — `docs/model-prompts/design-intent.system.md` and
  `docs/model-schemas/design-intent.wire.schema.json` — so the DesignIntent prompt T21 writes is
  scanned against the 4C corpora from the moment either lands.

**A scan-scope fact to record rather than leave looking like coverage.** A 4C brief's prose is
scanned with the same six-character floor the claims list has always used, so a short, common tone
keyword can collide with ordinary prompt vocabulary. That collision is genuinely fixable at the
corpus — the author chose the word — which is what makes it a control rather than the tripwire the
enums would have been. A T20 author should expect it and reword, and should not read a clean scan
as proof that nothing paraphrased leaked: §3.5's "necessary and not sufficient" applies here
exactly as it does one level up.

---

*Nothing in this document changes production behaviour, and no part of it is approved for
implementation until reviewed and explicitly authorized. The next implementation authorization is
expected to be for **Phase 4B only**.*
