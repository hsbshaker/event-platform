# Phase 4B plan — clarification lifecycle, sibling planner, DesignIntent × 3

**Status:** plan only. No production code, prompt, schema or corpus exists for any of it.
**Written at:** `acc9846e27cd234f7fbc8d33591b489e4ed77484`, immediately after Phase 4A closed **GO**
(`model-contracts.md §4.6`).

This document orders work. It defines no requirements: `spec.md` is the authority, and every
section below cites the canonical rule it implements rather than restating it as if new. Where a
canonical rule is missing or two canonical documents disagree, that is recorded in
**§Decisions required** and not resolved here.

---

## 0. Scope, and a naming conflict to settle first

`development-plan.md` splits this work across two lettered phases:

| | Canonical question | Canonical scope |
| --- | --- | --- |
| **4B** | Does it know when it needs to ask something? | the clarification loop, `You decide`, identity refinement after an answer, the minimal surface |
| **4C** | Can it invent three excellent, genuinely different directions from one identity? | `DesignIntent × 3` through the sibling planner |

The work requested as "Phase 4B" spans both. That is a real divergence from canon, not a detail —
the phase letters are what the exit-condition table is keyed on — so it is **Decision 1** below.
This plan is written so either resolution works: it is decomposed into two halves, **4B‑i**
(clarification lifecycle and provenance) and **4B‑ii** (planner and DesignIntent), with an explicit
gate between them. If canon keeps its letters, 4B‑i *is* 4B and 4B‑ii *is* 4C, and nothing else
changes.

**Out of scope, deliberately.** CompositionTree generation, the compiler, the renderer, generated
imagery (`spec.md §7.6a`), the full generation-progress surface (`§7.10`), concept cards and the
full-site reveal. Canon puts them in 4D–4F, and nothing in the requested scope requires pulling
them forward. 4B‑ii ends at *three persisted DesignIntents plus the evidence that they are three
genuinely different creative worlds* — which is the question 4C exists to answer, and it can be
answered without rendering anything.

---

## A. EventIdentity orchestration lifecycle

Binding source: `spec.md §7.6b` (provisional identity), `§7.7` (the consumption gate),
`model-contracts.md §4`. Phase 4A built and evidenced the *call*; none of this lifecycle exists.

### A.1 The two states

An `EventIdentity` result is **authoritative** when its `clarification.questions` contains no
question with `kind: "boundary"` — that is, zero questions, or only Route A creative questions. It
is **provisional** when it contains one (and by `§7.6b #1b` there can be at most one per response,
asked alone).

There is no field for this. `spec.md §7.6b`: *"No output field marks this — the presence of a
boundary-kind question is the machine-readable signal."* So the derivation lives in exactly one
place, a pure function, and everything else calls it:

```ts
// src/lib/ai/event-identity/lifecycle.ts  (new, pure, no I/O)
export function isProvisional(result: EventIdentityResult): boolean;
export function assertAuthoritative(result: EventIdentityResult): AuthoritativeIdentity;
```

`AuthoritativeIdentity` is a branded type. **The planner, the DesignIntent call and every
downstream creative stage accept only the branded type**, so "a provisional identity must not be
consumed" becomes a compile error rather than a code-review convention. This is the same technique
as the raw-prompt boundary (`src/lib/ai/raw-prompt-boundary.test.ts`), which is enforced by a test
because prose boundaries get crossed; here the type system can do it, and a test asserts that the
branding is not cast away.

### A.2 Persistence — the revision gap

`event_identities` today is `event_id uuid primary key … updated_at`: **one mutable row per
event**. That is incompatible with the v5 lifecycle and with the attribution requirement in §G. A
boundary round produces at least two identity results for one event, and a finished artifact must
name the exact one it was built from.

Phase 4B‑i therefore adds a migration introducing identity **revisions**:

- a revision row per `generateEventIdentity` result, append-only, never updated;
- `event_id`, `revision` (monotonic per event), the full result envelope, `prompt_version`,
  `schema_version`, `model`, `provider_request_id`, `is_provisional` (stored, derived once at
  write time by `isProvisional`, so a reader never re-derives it from JSON);
- a pointer on the event to the **authoritative** revision, which only a non-provisional revision
  may occupy — enforced by a trigger, in the style of the existing
  `events_validate_active_concept`.

Whether this replaces `event_identities` or supersedes it with a new table is an implementation
call for the task packet, not a product decision; the constraint is that no existing row is
mutated and the old shape does not survive as a second source of truth.

### A.3 The loop

1. Identity runs. Result persisted as a new revision.
2. **Provisional** → the event enters `awaiting_clarification`. No planner, no DesignIntent, no
   batch. The question is surfaced. Nothing downstream is started "optimistically" — §I.
3. Host answers. The answer is persisted as a clarification answer (§B), **not** merged into the
   prompt.
4. Identity runs **again**, with the original prompt unchanged plus the answer as current host
   input. New revision.
5. If that revision is authoritative, it becomes the event's authoritative identity and generation
   proceeds. If it carries another boundary question, it is provisional in turn and the loop
   repeats. `spec.md §7.6b`: **there is no lifetime cap** — "a spent quota is not authority". Round
   count is telemetry, never a limit that forces the system to proceed without authority.

---

## B. Clarification-answer provenance

Binding source: `development-plan.md` 4B obligation (c), carried from the v5 design review. This
is the obligation most likely to be satisfied badly, because the cheap implementation — appending
the answer to `events.prompt` — passes every test anyone would think to write.

### B.1 The requirements, restated as properties

| Requirement | What it forbids |
| --- | --- |
| distinct from the original event description | concatenation into `prompt` |
| attributable to the host | storing it as system or model text |
| original description preserved unchanged | any mutation of `events.prompt` |
| takes precedence over conflicting earlier input | ordering the answer before the prompt, or dropping it |
| available to EventIdentity on rerun | keeping it only in request scope or UI state |
| not `redesignFeedback` | overloading an existing field whose semantics are post-concept |
| multiple rounds without losing provenance | one answer column that the next round overwrites |

### B.2 Minimal durable model

A `clarification_answers` table — append-only, one row per answered question:

- `event_id`, `identity_revision_id` (**the revision that asked**, which is what makes provenance
  real rather than chronological), `round`;
- `question` and `why_it_matters` as asked, and `kind` — copied, not referenced, so the record
  stays readable if the revision JSON is ever superseded;
- the answer: `selected_option_label` and/or `free_text`, plus `is_defer`;
- `answered_at`, `answered_by` (the host or co-host `profiles` id).

**Input envelope.** `GenerateEventIdentityInput` gains an ordered, typed
`clarificationAnswers: ClarificationAnswer[]` alongside the existing `prompt` and `inspiration` —
a new field, never a rewritten prompt. The provider boundary assembles them into the request as
clearly labelled *current host input*, separate from the original description, with precedence
stated in the assembly rather than implied by position. `prompt` is passed byte-identical on every
round; a test asserts that the string sent on round *n* equals the string sent on round 1.

This is deliberately not a conversation system. There is no thread, no roles, no arbitrary turn
count, no free-form chat. It is a list of (question asked, answer given), bounded by the rounds
that actually occurred.

**Model-visible consequence.** Whether the v5 prompt needs a section teaching the model how to read
these answers is **Decision 2**. It is a prompt change, so it is a version bump and new evidence —
not something to slip in.

---

## C. Route A behaviour

Binding source: `spec.md §7.6b #4`, `§31 — Creation Mode`. Route A **never gates**. Every creative
question carries exactly one `isDefer` option; the host can always hand the call back.

| Situation | Behaviour |
| --- | --- |
| no answer supplied | generation proceeds on the identity as returned. The question stays open and answerable; it is never a blocker and never a retry trigger |
| host chooses the defer option | recorded as an answer with `is_defer: true`, generation proceeds. The defer is *data* — a host who defers everything is a signal worth having |
| concrete answer **before** the batch starts | the answer is persisted and identity **reruns** with it, exactly as in §A.3 but without the block. The new revision becomes authoritative and the batch is planned from it |
| concrete answer **after** the batch has started | the in-flight batch is **not** cancelled, mutated or silently re-based. The answer is persisted against the revision that asked. The host is offered a new round — which is the existing `Try another direction` / redesign path (`spec.md §7.9`), not a new mechanism |

That last row is the one that protects idempotency. A batch is keyed to an identity revision (§G);
an answer produces a *new* revision; a new revision means a *new* batch, if the host wants one.
Nothing rewrites a running batch's inputs, so "which identity produced this concept" always has one
answer. Concurrency guarantee: **one batch in flight per event** (§H) means the late answer cannot
start a second batch until the first settles.

---

## D. Deterministic sibling planner

Binding source: `spec.md §7.7`, `event-renderer-system.md`, `CLAUDE.md §5.1`. Application code. It
**calls no model**, and it **never selects a library silhouette or recipe** — the Library Boundary
Invariant is a stop condition, not a guideline.

### D.1 Inputs

From the **authoritative** identity only (branded type, §A.1): `compatibleFamilies`,
`compatibleTonalDirections`, `compatibleTypographyCategories`, plus whatever `§7.7` needs for
hierarchy. Not the raw prompt — that boundary is already test-enforced. Not `suppliedFacts`: the
planner plans *creative separation*, and facts belong to content fit.

`hostConstraints` are **authoritative** and pass through untouched; the planner may not assign a
sibling a directive that contradicts one. `creativeGuidance` is **advisory**
(`model-contracts.md §4`) — the planner may carry it to the DesignIntent call as guidance a sibling
is free to reconsider, and must not convert it into a constraint. A test asserts the planner never
writes a `creativeGuidance` string into a field the DesignIntent contract treats as binding.

### D.2 Output

Three assignments, per `spec.md §7.7`: a distinct compatible **family** where possible, then
distinct **tonal direction** where the brief allows, then distinct **typography category** and
**hierarchy**; a **structural directive** (one value per independent dimension — opening object,
primary structure, date treatment, motif use, hero surface, details folded or own, RSVP intro
placement, registry layout — assembled into one sentence, with siblings differing at least on
structure and opening); and an **allotment of attractive tokens**, each token to at most one
sibling in three.

`§7.7` also fixes the negative: *"Never the same intent with different seeds"*, and if tone is
explicitly constrained, diversity falls back to family, directive, typography and hierarchy rather
than forcing dark/mid.

### D.3 Determinism, ordering, versioning, replay

- **Pure function**, no clock, no RNG, no I/O: `plan(identity, options) → [A, B, C]`. Any
  tie-breaking that would want randomness is resolved by a seed derived from stable inputs
  (identity revision id), so the same revision always plans the same three siblings.
- **Stable identity and ordering:** sibling index 0/1/2 is assigned by the planner and is the key
  everything downstream uses (`design_concepts.concept_index` already exists).
- **`PLANNER_VERSION`** joins `src/lib/ai/versions.ts` and is recorded on every run. Changing
  diversity behaviour bumps it; historical batches are never re-planned.
- **Replay:** identity revision + planner version reproduces the assignment exactly. The stored
  `generation_runs.diversity_assignment` is then a cross-check, not the only record.
- **Telemetry:** which dimensions actually separated the siblings, and which fell back — a batch
  where all three differ only on typography is the failure mode worth seeing before a human does.

`proof-b/planner.js` is the behavioural reference. Porting it means porting its behaviour, not
re-deriving it (`docs/README.md`: *"without changing their behaviour"*).

---

## E. DesignIntent × 3

Binding source: `spec.md §7.8`, `model-contracts.md §5`, `event-renderer-system.md`. The contract
exists on paper at `design_intent_v4` and has **never been exercised against a provider**.

### E.1 The quality requirement

Three schema-valid objects is the floor, not the goal. The three must be faithful to the *same*
authoritative identity, and materially distinct **creative worlds** — not palette or font swaps —
such that the compositions they later produce could not be mistaken for one another. Grounded in
*this* event, not in generic premium taste. Every `hostConstraint` respected by all three;
`creativeGuidance` free to be reconsidered, evolved or overridden by any of them.

The four **excellence-watch** items from `model-contracts.md §4.6` are watched here first, because
this is the first stage where "reusable finishing language" and "a preference for polish and
emotional moderation" become visible as *three* outputs that converge.

### E.2 Inputs, and the forbidden ones

**Receives:** the authoritative identity (including `inspirationSummary`), its own sibling
assignment and directive, its token allotment, and the event's capabilities and content profile.

**Never receives:** the raw host prompt (`spec.md §7.5`, `§32 #12`, already test-enforced — the
answer to §F below); raw inspiration images (§F); another sibling's DesignIntent — see
**Decision 3**; a library recipe or silhouette identifier (`CLAUDE.md §5.1`); anything that would
let it act as a template picker.

### E.3 Schema responsibilities and invariants

The schema owns shape and enum membership; the application validator owns lengths, counts and
cross-field rules (`model-contracts.md §3`), exactly as at Event Identity. Semantic invariants to
enforce deterministically: `palette.dominant ∈ palette.colors`; 3–5 validated hex colours;
`typographyPairing` inside the **assigned** category; `family` and `tonalDirection` equal to the
assignment; motifs drawn from the curated set. Runtime narrowing restricts enums to the sibling's
assignment before the call, so an out-of-assignment value is impossible rather than repaired.

**Repair policy is the one already canonical** (`model-contracts.md §8`): bounded transient
retries, and exactly **one** repair retry for schema-invalid output. Structural, coverage and
diversity defects are repaired deterministically or recorded — never re-prompted
(`spec.md §32`). `DESIGN_INTENT_PROMPT_VERSION` / `DESIGN_INTENT_SCHEMA_VERSION` bump together
(the v5 lesson) and both are persisted per concept.

### E.4 Diversity: what is checkable and what is not

**Deterministically checkable** (and therefore a mechanical invariant, §Part 3):

- assignment conformance — the three carry the three assigned families/tones/categories;
- palette separation — pairwise distance above a floor in a perceptual space, not hex equality;
- typography pairing distinctness;
- `composition` vector distinctness across `asymmetry`, `hierarchy`, `rhythm`, `sectionContrast`,
  `ornament`;
- motif-set overlap below a ceiling;
- token allotment respected.

**Not deterministically checkable, and no metric should pretend otherwise:** whether the three are
genuinely *different creative worlds* rather than three parameterisations of one. A batch can pass
every check above and still be one idea in three costumes. That judgement is qualitative, and
Part 3 puts it in front of a human rather than inventing a number for it.

---

## F. Inspiration handling — resolved from canon, not a decision

`spec.md §7.5` and `model-contracts.md §1`, `§6.1` settle this:

- **EventIdentity** receives the raw host prompt *and* the private inspiration images. It is the
  only stage that does (`provider.ts: GenerateEventIdentityInput.inspiration`).
- It emits **`inspirationSummary`** as a field *inside* the identity (`spec.md §7.5`).
- **The planner and the DesignIntent call receive the identity, therefore the summary, and never
  the raw assets or the raw prompt.** `spec.md §9.4`: *"Do not re-send original raw inspiration for
  routine redesign after its summary is available."*

So Phase 4B does nothing new here except honour it. One additive guard: extend
`raw-prompt-boundary.test.ts` so that the DesignIntent call site is refused raw inspiration bytes
as well as raw prompt text — the same boundary, the other input.

Inspiration uploads remain private model inputs and never become site imagery (`spec.md §1304`,
`§32 #32`).

---

## G. Persistence and `GenerationRun`

Binding source: `spec.md §9.4`, `§9.5`, `§29`; existing schema in
`supabase/migrations/20260912000000_phase1_core.sql`.

### G.1 What already exists

`generation_runs` is close to sufficient: provider, `provider_request_id`, `operation`
(`event_identity` | `design_intent` | `composition`), `round`, `concept_index`, model, the four
token counters, `latency_ms`, `success`, `error_code`, prompt/schema/primitive-set/compiler
versions, `diversity_assignment`, `schema_valid_first_call`, `reprompts`, and a **unique**
`idempotency_key`.

### G.2 Gaps this phase must close

1. **Identity revisions** (§A.2) — the current single mutable row cannot express the lifecycle or
   support attribution.
2. **A batch identity.** There is no column tying three sibling runs into one batch.
   `generation_batches` (id, event_id, identity_revision_id, planner_version, round, status,
   started/finished, idempotency key) gives §H and §I something to reason about, and makes
   "one batch in flight per event" a uniqueness constraint rather than application etiquette.
3. **A DesignIntent-only artifact.** `design_concepts` requires `composition_raw`, `composition`,
   `composition_hash` and the composition/primitive/compiler versions **NOT NULL**, so a phase that
   stops before composition cannot persist its output there. Either the columns become nullable
   with a status discriminator, or DesignIntents get their own table that a later phase joins to.
   The plan takes no position; it records that this **must** be settled before the first
   DesignIntent write, because getting it wrong means either a migration on live evidence or three
   DesignIntents with nowhere to live.
4. **`PLANNER_VERSION`** on the run and the batch.

### G.3 The attribution invariant

> Any persisted DesignIntent names, and is reproducible from, exactly one `(identity_revision_id,
> planner_version, planner_assignment, design_intent_prompt_version, design_intent_schema_version,
> model, provider config)` tuple.

Immutability follows the established rule: generated design data is immutable; nothing persisted is
mutated; a change produces a new row (`CLAUDE.md §2`).

---

## H. Spend and concurrency controls

Binding source: `development-plan.md` principle 4 — *"Spend controls ship with the first production
model call, not in hardening"* — and `spec.md §1178`. The proof phase hit an organisation spend
ceiling mid-run; this is not theoretical.

| Control | Mechanism |
| --- | --- |
| one batch in flight per event | a partial unique index on `generation_batches (event_id) where status in ('planned','running')`. The database refuses the second, the application reports it |
| per-event and per-account daily caps | the existing `rate_limits` fixed-window table, already built for exactly this (`spec.md §10`, `§27`) |
| global ceiling and alerts | a counter checked before a batch starts, and an alert path. A breach refuses new batches; it never truncates a running one into a half-batch presented as whole |
| idempotency | `generation_runs.idempotency_key` is already unique. The key is derived from `(batch_id, operation, concept_index, attempt)` so a duplicated request collides instead of paying twice |
| retries | `model-contracts.md §8` unchanged: bounded transient retries, exactly one repair retry. Retries reuse the attempt's key |
| rate limiting | per-account, at the entry point, before any provider client is constructed |
| duplicate sibling calls | prevented by the idempotency key, not by in-process locks, which do not survive a serverless instance |
| safe resumption after partial failure | the batch records per-sibling status; resumption re-issues only the siblings that have no successful run, under the same keys |

**No arming token, confirmation secret or two-key execution.** That decision was made for the eval
process (`docs/model-evals/eval-incidents.md`) and it is not to be reintroduced here under another
name. Spend safety is a cap and an idempotency key, not a ritual.

---

## I. Failure semantics

The governing rule, from the Phase 4A evidence discipline: **nothing may make the evidence or the
user state lie.** A fallback that silently substitutes a creative world is worse than a visible
failure, because it is indistinguishable from success downstream.

| Failure | Behaviour |
| --- | --- |
| EventIdentity provider failure | bounded transient retries (`§8`), then a real error state. No cached or default identity |
| EventIdentity invalid output, repair fails | recorded as `invalid_output` with every paid raw response preserved — the Phase 4A journal rule (`model-contracts.md §4.5`) applied to production telemetry. Never relabelled a provider error |
| provisional (Route B) identity | not a failure. `awaiting_clarification`; no batch; the question surfaced. §A.3 |
| one DesignIntent sibling fails | the batch continues. Concept-level readiness is canonical (`spec.md §7.10 #5`), so two ready concepts appear while the third is retried or reported failed. **The failed sibling is never replaced by a library recipe** (`CLAUDE.md §5.1`); the documented terminal fallback is the only exception and it is recorded as a fallback in `generation_runs.fallback`, visible in telemetry |
| multiple siblings fail | the batch fails as a batch. Fewer than the canonical three concepts is a visible state, never three concepts where one is fabricated |
| timeout | a bounded per-call deadline; a timed-out call is a failed attempt, retried under the same idempotency key |
| user refresh / retry | idempotent: the same batch is observed, not restarted. Refresh is a read |
| duplicate requests | collide on the batch uniqueness index or the run idempotency key |
| stale host edit during generation | content edits do not recompose a page (`CLAUDE.md §2`) and do not invalidate a running batch. An edit that would change the identity is a new round, not a mutation of the in-flight one |
| clarification answer during generation | §C, last row: persisted, batch untouched, new round offered |

---

## J. Latency architecture

Measured today: EventIdentity median **~30 s** on the fresh challenge (`§4.6`). `spec.md §7.10`
targets p75 identity ≤ 5 s, first concept ≤ 15 s, all three ≤ 45 s. The gap is real, recorded as
debt, and **not** this phase's work — quality first.

What Phase 4B must nonetheless get structurally right, because retrofitting it is expensive:

1. **The three DesignIntent calls run in parallel** (`spec.md §7.10 #3`). They are independent by
   construction — no sibling reads another's output (Decision 3) — so parallelism is safe and the
   batch is *not* three sequential calls. The eval runner is sequential on purpose; production is
   not.
2. **Per-sibling readiness from the start.** No aggregate "generation complete" gate; each sibling
   settles independently (`§7.10 #5`). A surface built on a batch-level boolean would have to be
   rebuilt for 4D.
3. **No concept waits on a sibling** — a failed or slow third does not hold the other two.
4. **The surface shows only real pipeline state** (`§7.10`, `CHANGELOG-v6.md`): no invented
   percentages, no simulated reasoning, no stage claiming work that has not happened. A truthful
   surface is a constraint on the data model, which is why it belongs in this phase even though the
   surface itself does not.

**Deferred to a later phase, explicitly:** streaming identity output, prompt-size and
reasoning-effort tuning, model selection for latency, caching. Each trades against interpretation
quality, and the north star (`§4.6`) puts quality first.

---

# Part 3 — Evidence strategy, designed before the prompt

Phase 4A's most expensive lessons were procedural: four benchmark leaks, three accidental runs, and
a corpus that could only be used once. The DesignIntent evidence plan is written **now**, before a
line of its prompt exists, for exactly that reason.

**No corpus cases are authored in this task.**

## 3.1 Capability dimensions

What DesignIntent evidence must test, at minimum — the ten given, restated as the dimensions a
corpus is built to probe:

1. sibling distinctness beyond palette/font swaps;
2. faithfulness of all three to the same identity;
3. `hostConstraint` preservation across all three;
4. `creativeGuidance` remaining advisory — a sibling may depart from it without penalty;
5. emotional and aesthetic range across the three;
6. personalization versus generic premium output;
7. no convergence onto one house style;
8. useful differences in organizing idea, visual language and experience — not just parameters;
9. downstream suitability: each could plausibly yield a materially different CompositionTree;
10. no invented host facts, and no `creativeGuidance` promoted to `hostConstraint`.

Dimensions 1, 3, 4 and 10 are substantially mechanical. 2, 5, 6, 7, 8 and 9 are substantially
qualitative. The corpus must be built so that each case exercises a *named* dimension, and so that
no case's expected answer can be satisfied by a rule the prompt could be taught directly.

## 3.2 Mechanical invariants

Per batch of three, deterministically checkable (§E.4): assignment conformance; palette separation
above a floor; typography distinctness; composition-vector distinctness; motif overlap below a
ceiling; token allotment respected; every `hostConstraint` traceable into all three; no
`suppliedFacts` value invented or altered; no `creativeGuidance` string appearing as a constraint;
schema validity and first-call success; repair and transient retry counts.

As at 4A, a mechanical pass is **necessary and never sufficient**, and the reasons are already
known: three outputs can satisfy every distance metric and still be one idea. Any case where the
checker cannot decide reports `n/a` or **advisory** — never a silent pass, and advisory labels are
never folded into the pass count.

## 3.3 Qualitative review dimensions

For a blind reviewer, per batch: are these three *worlds* or three *settings*? Is each rooted in
this event rather than in premium taste generally? Does each suggest a different experience, not
just a different look? Is the verbal identity as distinctive as the visual idea (excellence-watch
item 3)? Does any finishing language repeat across siblings (item 2)? Does any sibling restrict
sentimentality, theatricality or kitsch without support from the identity (item 1)? Do all three
sit in the same register of polish and emotional moderation (item 4)?

## 3.4 Evidence classes and the sealing rule

The 4A classes carry over unchanged, and so does the rule that they are **not interchangeable**:

| Class | When authored | What it can support |
| --- | --- | --- |
| **regression** | before implementation; may be read freely | catching regressions, forever |
| **pre-registered validation** | authored and frozen **before** the DesignIntent prompt is written, independently reviewed for fairness | validation against pre-registered invariants; not generalization |
| **sealed challenge** | authored **after** the implementation and harness freeze, by someone who has not seen the prompt, prior outputs or known failures | generalization. **One run, then spent** |

**Authored before implementation:** the regression corpus and the pre-registered validation set.
**Must remain unauthored and unseen until after the implementation freeze:** the sealed challenge.
Its slot — `EVAL_SET`, corpus filename, output directory, leakage-scan entry — is wired **while its
cases are unknown**, exactly as `challenge2` was, so that adding the corpus file is the entire
change. That property was observed twice in 4A and is cheap to keep.

## 3.5 Leakage controls

- The existing `prompt-leakage.test.ts` is extended to scan the DesignIntent prompt **and its wire
  schema** — the schema matters because `.describe()` strings ship to the model, which is how leak
  4 reached production in 4A.
- Scanning is **necessary and not sufficient**: it catches literal reuse and cannot catch a
  paraphrase or a case-specific instruction dressed as a general principle. An independent
  engineering read of the prompt for benchmark integrity remains required.
- A collision between an independently authored corpus and pre-existing prompt text is resolved
  **at the corpus**, never by relaxing the scanner — the precedent set when `sealed_challenge_v2`
  hit `"exactly as written"` and `"quinceañera"`.

## 3.6 Write-once evidence rules

Unchanged and already implemented: a completed run's directory is immutable in full and joins
`PROTECTED_RESULT_DIRS` **in the same change** that commits its evidence; the journal is appended
per response before any deterministic evaluation; nothing about the runner is verified by running
it; incidents go to `docs/model-evals/eval-incidents.md`.

## 3.7 Thresholds — when they are frozen

**The threshold is frozen before the sealed challenge is authored, and recorded in canon at that
point.** Not after results. This is the `spec.md §11.9` discipline applied one level down: moving
the goalposts post-result voids the gate.

Proposed shape, for approval rather than assumed:

- **Mechanical:** every invariant in §3.2 must hold on every batch, with the same treatment 4A
  gave a checker/contract edge — recorded as a failure, read as an edge only in the go/no-go
  narrative, never edited out of the artifact.
- **Qualitative**, per batch, on the four-band scale **Excellent / Good / Borderline / Fail**, with
  the bands defined in writing *before* any batch is reviewed.

A gate that rewards Excellent without being gameable by a small set:

> **No `Fail`. At most one `Borderline`. And `Excellent` must be the modal band — strictly more
> Excellent than Good.**

That is stronger than 4A's outcome (7 Excellent / 5 Good would pass it, but 6/6 would not), it
cannot be satisfied by a single lucky case, and it does not demand a literal 12/12 that would
invite tuning against spent cases. The alternative shapes — a fixed Excellent percentage, or a
weighted score — are worse for the same reason a percentage always is: they invite optimising the
number.

## 3.8 Independent qualitative review process

Unchanged from 4A because it worked: a blind artifact generated by the runner, containing outputs
and no case metadata, no expectations and no route labels; sent to a **fresh** reviewer session
with no access to this repository's prompt, prior evidence or failure history; the reviewer returns
band judgements plus prose; the go/no-go is recorded with the SHA chain. The reviewer is not asked
whether the system passed — they are asked what they see.

---

# Part 4 — Implementation decomposition

Small, auditable commits. No adjacent refactors. **Every task before T9 is offline** — no provider
call is permitted until the gate.

### 4B‑i — clarification lifecycle and provenance

| # | Task | Files / modules | Depends on | Tests | Acceptance criteria | Model-visible? | Senior review? | Live call? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **T1** | Lifecycle predicate and branded authoritative type | `src/lib/ai/event-identity/lifecycle.ts` (new) | — | unit: provisional iff a boundary question is present, across all valid shapes; a cast-away brand fails typecheck | `spec.md §31 — Event Identity and diversity`; `§7.6b`, `§7.7` | no | no | no |
| **T2** | Identity-revision migration + authoritative pointer trigger | `supabase/migrations/…_phase4b_identity_revisions.sql` | T1 | db: append-only; a provisional revision cannot become authoritative; revisions monotonic per event | `§7.6b`, `§7.7`, `§9.4` | no | **yes** (schema + RLS) | no |
| **T3** | `clarification_answers` table and repository | migration; `src/lib/events/clarification.ts` | T2 | db + unit: rounds preserved, answer bound to the revision that asked, `events.prompt` never written | `development-plan.md` 4B (c) | no | **yes** | no |
| **T4** | Provider input envelope for answers | `src/lib/ai/provider.ts`, `src/lib/ai/openai/event-identity.ts` | T3 | unit: `prompt` byte-identical across rounds; answers labelled as current host input; no concatenation | `§7.6b`; guardrail `§32 #12` | **prompt assembly changes** — see Decision 2 | **yes** | no |
| **T5** | Orchestration: run → persist → branch → rerun | `src/lib/generation/identity-orchestrator.ts` (new) | T1–T4 | unit + db: provisional blocks; rerun produces a new revision; repeated boundary rounds allowed; no cap | `§7.6b`, `§7.7`, `§31 — Creation Mode` | no | **yes** | no |
| **T6** | Minimal clarification surface | `src/app/…` per `screen-spec.md` | T5 | e2e at 390 and 1280; focus and contrast | `§31 — Creation Mode`, `§31 — Responsive/accessibility` | no | no | no |

**Gate 1:** 4B‑i is complete and reviewed before 4B‑ii begins. It touches no creative generation and
needs no new evidence run beyond its own tests.

### 4B‑ii — planner and DesignIntent

| # | Task | Files / modules | Depends on | Tests | Acceptance criteria | Model-visible? | Senior review? | Live call? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **T7** | Port the sibling planner as a pure function | `src/lib/generation/planner.ts`; reference `proof-b/planner.js` | T1 | unit: determinism, distinctness, token allotment, tone-constrained fallback, `creativeGuidance` never binding; parity against the proof reference | `§31 — Event Identity and diversity`; `spec.md §7.7`; `CLAUDE.md §5.1` | no | **yes** | no |
| **T8** | Batch + spend + idempotency infrastructure | migration (`generation_batches`); `src/lib/generation/batch.ts`; `rate_limits` wiring | T2, T7 | db: one in-flight batch per event enforced by index; caps refuse; duplicate keys collide; partial-failure resumption | `development-plan.md` principle 4; `spec.md §10`, `§27` | no | **yes** | no |
| **T9** | DesignIntent contract, schema, narrowing, validator — **no prompt** | `src/lib/ai/design-intent/*`; generated files under `docs/model-schemas/` | T7 | unit: semantic invariants, runtime narrowing, repair rules, schema-drift | `model-contracts.md §5`; `§32 #12`–`#31` | **schema descriptions ship** | **yes** | no |
| **T10** | Evidence harness for DesignIntent + regression and validation corpora | `src/lib/ai/evals/*`, `tests/eval/design-intent.eval.ts` | T9 | unit/static only, per the operational rule; leakage scan extended to the new prompt and wire schema | `model-contracts.md §4.5` | no | **yes** | **no — and the harness is never run to verify itself** |
| **T11** | The DesignIntent prompt | `docs/model-prompts/design-intent.system.md` | T9, T10 | leakage scan; independent engineering read for benchmark integrity | `model-contracts.md §5`; `product-doctrine.md` | **yes** | **yes** | no |
| | **▶ STOP — APPROVAL REQUIRED** | | | | | | | |
| **T12** | Freeze; author the sealed challenge; run it once | — | T11 | the 4A protocol exactly | `model-contracts.md §4.5` | no | **yes** | **yes — one authorized run per set** |

> ### The stop point
>
> **No live DesignIntent provider call may happen before T11 is complete, frozen, independently
> reviewed, and explicitly approved.** The freeze SHA is recorded, the thresholds (§3.7) are frozen
> in canon, and only then is the sealed challenge authored — by someone who has not seen the prompt.
> Every set is run at most once per authorization, and each completed run's directory is protected
> in the same commit as its evidence.

---

# PHASE 4B DECISIONS REQUIRED BEFORE IMPLEMENTATION

### Decision 1 — Phase letters: is this one phase or two?

**Canonical requirement.** `development-plan.md` defines **4B** as *"Does it know when it needs to
ask something?"* (the clarification loop) and **4C** as *"Can it invent three excellent, genuinely
different directions from one identity?"* (`DesignIntent × 3` through the planner). The requested
scope covers both. The exit-condition table and the rule that *"the next does not begin until the
previous one is judged good enough"* are keyed on these letters.

| Option | Consequence |
| --- | --- |
| **(a) Keep canon.** 4B‑i ships and is judged as **4B**; 4B‑ii ships and is judged as **4C** | Two gates, two evidence sets. Matches the plan's own rule that each phase is judged before the next begins. Requires no doc change |
| **(b) Merge and rename.** `development-plan.md` is edited so 4B covers both and later letters shift | One gate. Cheaper to run, but it merges a phase with *no* creative evidence requirement into one whose entire point is creative evidence — and shifting letters invalidates every existing citation |
| (c) Keep the letters, run the work as one stream, judge at two gates | The letters survive, the gates survive, and only the scheduling is merged |

**Recommendation: (a)**, with (c) as the pragmatic form of it — build continuously, gate twice.
4B‑i has no creative evidence requirement and 4B‑ii has a heavy one; merging them would let the
easy half carry the hard half through a single approval, which is precisely the failure mode the
phase gates exist to prevent.

### Decision 2 — Does the v5 prompt need to be taught how to read clarification answers?

**Canonical requirement.** `spec.md §7.6b` requires Event Identity to run again *"with that answer
as current host input"*, and `development-plan.md` 4B (c) requires the answer to be distinct,
attributable and precedence-bearing. **Canon does not say whether the prompt needs a section
explaining how to weigh an answer against the original description.** The v5 prompt was written and
evidenced with no clarification answer ever present in its input.

| Option | Consequence |
| --- | --- |
| **(a) Assembly only, no prompt change.** Answers are labelled in the request envelope; the prompt is untouched at `v5` | The accepted contract stays frozen; no new version, no new evidence run. Risk: an untested input shape reaches a prompt that has never seen one — the same class of gap that produced the v5 remediation |
| (b) Prompt section + `v6` | Correct on its face, but a version bump means a **new sealed corpus** for Event Identity, and every existing set is spent. Expensive, and it reopens a contract that just passed |
| (c) (a) now, plus a small **pre-registered** rerun-behaviour set exercising a rerun with an answer present, before 4B‑i ships | Keeps `v5` frozen, and buys evidence that the untested input shape behaves, without spending a sealed corpus |

**Recommendation: (c).** The risk in (a) is real and the cost of (b) is disproportionate. A
pre-registered set authored before T4 is written, run once, is the cheap middle — and it is
validation evidence, honestly labelled, not generalization.

### Decision 3 — Do the three DesignIntent siblings see each other?

**Canonical requirement.** `spec.md §7.10 #3` says the three calls *"run in parallel"*, which
forbids a sequential chain where sibling B reads sibling A. `§7.7` gives the planner sole
responsibility for creating separation *before* the calls. But the quality requirement in `§7.8`
and the excellence-watch item about **convergence onto one house style** describe a failure that
pre-call assignment may not prevent: three calls, independently made, can still land in the same
register.

| Option | Consequence |
| --- | --- |
| **(a) Blind siblings.** Each sees only its own assignment | Parallel, simple, idempotent, replayable. Diversity rests entirely on the planner. Matches `§7.10` and `§7.7` as written |
| (b) Sequential with awareness | Directly attacks convergence, but triples latency against a `≤ 45 s` target, breaks per-sibling idempotency and replay, and contradicts `§7.10 #3` |
| (c) Blind first pass, then a deterministic convergence **check** (§E.4) that can trigger one bounded re-prompt of the least distinct sibling | Keeps parallelism and the common path; adds a bounded, measurable escape hatch. But `spec.md §32` forbids re-prompting for defects that should be repaired deterministically, so whether convergence counts as such a defect is itself a spec question |

**Recommendation: (a) for implementation, and measure.** Ship blind siblings, make the convergence
metrics of §E.4 first-class telemetry, and let the first real evidence say whether planner-side
separation is sufficient. If it is not, (c) is a spec change argued from data rather than a
mechanism added on suspicion. This is the same discipline the excellence-watch items are under: do
not guess where the leverage is.

### Decision 4 — Where do DesignIntent-only artifacts live?

**Canonical requirement.** `spec.md §9.4` requires persisting *"every generated DesignIntent"*. The
implementing table, `design_concepts`, requires `composition_raw`, `composition`,
`composition_hash`, `composition_prompt_version`, `composition_schema_version`,
`primitive_set_version` and `compiler_version` — all **NOT NULL**. A phase that stops before
composition therefore has nowhere canonical to write.

| Option | Consequence |
| --- | --- |
| **(a) Relax `design_concepts`.** Composition columns become nullable behind a status discriminator and a check constraint requiring them once the row reaches `composed` | One row per concept across its whole life; the join everything downstream already expects is preserved. Costs a migration that weakens NOT NULLs on a table 4D depends on |
| (b) A separate `design_intents` table that 4D joins | No change to a table a later phase needs. Costs a join, a second identity for one concept, and a migration later to reconcile them |
| (c) Defer DesignIntent persistence until composition exists | Violates `§9.4` and makes 4B‑ii unevidenceable — the evidence *is* the persisted DesignIntents |

**Recommendation: (a).** One artifact should have one row for its whole life, and the constraint
that matters — composition fields present exactly when the concept is composed — is expressible as
a check constraint rather than as a NOT NULL that happens to be true later. (c) is not viable.

---

*Nothing in this document changes production behaviour, and no part of it is approved for
implementation until reviewed.*
