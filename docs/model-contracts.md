# Model Contracts
## Event Identity, DesignIntent and Composition prompts and structured-output schemas

**Status:** Revision 2 — composition-language baseline. Event Identity is in production at `v5`
(Phase 4A closed **GO**, `§4.6`). DesignIntent is built at `v5` and **has never been sent to a
provider**: T21 is the implementation freeze before the first live call, which needs explicit
authorization (`phase-4b-plan.md` Part IV, "The stop point"). Composition is a contract on paper.  
**Prompt versions:** `event_identity_v5`, `design_intent_v5`, `composition_v1_p2`  
**Schema versions:** `event_identity_schema_v5`, `design_intent_schema_v5`, `composition_schema_v1`  
**PRD:** `../spec.md` Revision 6  
**Renderer:** `event-renderer-system.md` Revision 2

This document defines the three strong-model creative contracts in the MVP. The goal is not merely valid JSON. The goal is **faithful user-intent capture, predictable diversity, low prompt-injection exposure, stable schema evolution, and deterministic handoff to application code**.

---

# 1. The three calls

```text
Host prompt + private inspiration
        ↓
generateEventIdentity(...)                 strong model
        ↓
EventIdentity
        ↓
deterministic sibling planner              three DesignIntent assignments, three directives, token allotments
        ↓
generateDesignIntent(...) × 3              strong model, parallel
        ↓
DesignIntent × 3
        ↓
generateComposition(...) × 3               strong model, parallel
        ↓
CompositionTree × 3
        ↓
deterministic compiler                     validate → repair → caps → canonicalize → page system + palette → layout → geometry verification
        ↓
ResolvedDesignSpec × 3
```

Strong models are used only for Event Identity, DesignIntent and Composition. The compiler is application code and calls no model.

---

# 2. Versioning requirements

Prompts and schemas are versioned production assets:

```ts
export const EVENT_IDENTITY_PROMPT_VERSION = "event_identity_v5"
export const EVENT_IDENTITY_SCHEMA_VERSION = "event_identity_schema_v5"
export const DESIGN_INTENT_PROMPT_VERSION  = "design_intent_v5"
export const DESIGN_INTENT_SCHEMA_VERSION  = "design_intent_schema_v5"
export const COMPOSITION_PROMPT_VERSION    = "composition_v1_p2"
export const COMPOSITION_SCHEMA_VERSION    = "composition_schema_v1"
export const PRIMITIVE_SET_VERSION         = "composition_v1"
export const COMPILER_VERSION              = "…"
```

`src/lib/ai/versions.ts` is where these live; the Event Identity pair reached `v5` through Phase 4A
and its history is recorded there, prompt by prompt. The DesignIntent and Composition values are
the contract as designed and have never been exercised against a provider.

Record every version with generation telemetry. Do not silently edit a production prompt while keeping the same version. The primitive set is versioned separately from the compiler because the renderer must support every set that has a live spec.

The composition prompt's primitive spec and rules blocks are **generated from the validator's spec table**; the JSON Schema is generated from the same table. Never hand-edit either.

---

# 3. Provider-neutral structured output

The JSON files in `model-schemas/` are the canonical validation schemas. Provider structured-output modes enforce JSON Schema unevenly; the application **always** runs the canonical schema validator plus the structural validator on every response. For the composition call the application validator is stricter than JSON Schema (unknown keys, node-count and section-count limits, nesting, coverage, capabilities) and is the one that decides.

The Phase B confirmation run used raw JSON output without provider-side schema enforcement, so schema validity is a measured property of the prompt, not of the provider. Provider enforcement, where available, is a free improvement on top.

---

# 4. Event Identity

**This call is the product's creative interpreter, not a preprocessing step.** Its question is
*what does this host mean, and what creative world should this event belong to?*, and the bar on its
output is that a strong human designer reading it would know what assignment they had been given.
It is also the only call that sees the raw host prompt (§1, §6.1): a raw prompt is never forwarded
into a generic website- or image-generation prompt, so whatever this call fails to understand is
lost for the rest of the pipeline. `product-doctrine.md §3`–`§5` state what that means for
interpretation, and in particular the boundary this call must hold: **aesthetic implication is
inferred; a date, a venue, a dress code or any other fact is quoted from the host or absent.**

Unchanged from Revision 1 except the catalogs: `availableHeroArchetypes` becomes `availableFamilies` (`editorial`, `invitation`, `statement`, each with an intent sentence) and `compatibleHeroArchetypes` becomes `compatibleFamilies`. Runtime narrowing, semantic invariants, the untrusted-input rules and evals EI-01…EI-10 stand with that substitution. `docs/model-prompts/event-identity.system.md` carries the family catalog.

### 4.1 The result envelope (`event_identity_schema_v5`, Phase 4A)

`spec.md §7.5` left the supplied-fact mechanism to Phase 4 and named two options. Phase 4A took
the second in schema terms and neither in call terms: **one call returns three siblings**, so the
creative brief keeps `additionalProperties: false` and carries no operational field, exactly as its
prompt has always promised.

| | |
| --- | --- |
| `identity` | the creative brief. Inference expected and generous — except in `hostConstraints` |
| `suppliedFacts` | ten `*Text` fields — hosts, honoree, type, date, time, venue, address, locality, RSVP deadline — each a **verbatim quotation from the host or `null`** |
| `clarification` | `needed`, plus questions on one of two routes: up to three **creative** questions, or exactly one **boundary** question (`spec.md §7.6b`) |

Facts and identity share one round trip because a second call would roughly double latency
(`spec.md §7.10`) to separate what the schema has already separated. Two details exist so that
requirements are checkable rather than inferred from wording: the `You decide` option `§7.6b #4`
requires is a structural `isDefer` boolean, not a phrase to pattern-match; and every fact field is
named `*Text` and described as a quotation, because **normalization is the application's job, never
the model's** — `1pm` stays `1pm`.

### The clarification routes (`v5`)

The first sealed challenge returned zero questions on all twelve cases, and a human reviewer found
one where proceeding required the system to settle a matter it had no authority to settle. The
cause was structural rather than dispositional: every model-visible instruction scoped clarification
to taste, so the correct behaviour was unreachable. `v5` splits the routes.

| | |
| --- | --- |
| **Route A — creative** (`kind: "creative"`) | a taste call that is genuinely open. Up to three, governed by the five conditions. **Exactly one `isDefer` option each**, which is why it never blocks: the host can always hand the call back |
| **Route B — boundary** (`kind: "boundary"`) | a decision the system has no authority to make — a consequential position on behalf of a real person that the host never settled. Governed by four conditions. **Zero `isDefer` options**, because offering to decide it would contradict the reason for asking |

`kind` is required on every question, so a question cannot be asked without declaring the authority
it rests on, and the two routes stay separable in evidence. **Exclusivity:** a decision holds zero
questions, or 1–3 creative questions, or exactly one boundary question asked alone. There is **no
lifetime cap** on boundary questions — a later call may raise a new one if all four conditions hold
again, because a spent quota is not authority.

Two rules live only in runtime validation, not in the wire schema, because the strict
structured-output subset admits no conditionals and no length keywords: the per-`kind` defer count,
and exclusivity. The model therefore learns them from the field descriptions, and a violation is
caught by the single repair retry (`§8`).

**Provisional identity.** When a response carries a boundary question, the `identity` beside it is
**provisional**: Route B fires only when the brief could not do its job without settling the
position, so that brief is a working interpretation, not an authoritative one. It must not be
consumed by the sibling planner (`spec.md §7.7`), DesignIntent, composition generation or any
downstream creative stage, and concept generation is blocked until the host answers. Event Identity
then **runs again** with the answer as current host input; only a result with no boundary question
becomes authoritative, and a rerun that raises another boundary question is provisional in turn. No
field marks this — the presence of a boundary-kind question is the signal. Phase 4A implemented
none of this orchestration and never claimed to: it built and evidenced the call, not the lifecycle
around it. The lifecycle is a binding obligation of the phase that follows, recorded in
`development-plan.md` and planned in `phase-4b-plan.md §A`–`§C`, along with the requirement that a
clarification answer be carried as first-class host input rather than concatenated into the
original prompt.

### The authority boundary (`v4`)

`designConstraints` is gone. In its place:

| | |
| --- | --- |
| `hostConstraints` | **authoritative.** Grounded in an explicit phrase from the host's own words. Respected unless the host changes them |
| `creativeGuidance` | **advisory.** The model's own recommendations; later creative stages may reconsider, override or evolve them |

Platform rules belong in neither. The gating check is prompt-grounding — every
`hostConstraints` entry must be quotable from the raw prompt — chosen because it is decidable
without a semantic classifier, and a probe that guesses at entailment is what produced the
baseline's only mechanical failure.

`suppliedFacts` gains `honoreeDescriptionText`, and both honoree fields populate when a name
and a relationship co-occur. `spec.md §7.5` carries the requirement and the evidence.

Source of truth is `src/lib/ai/event-identity/contract.ts`. The three files under
`model-schemas/` — the envelope, the brief nested inside it, and the reduced strict-mode projection
actually sent to the provider — are generated from it and drift-tested, as the composition schema
is (`§2`). Never hand-edit them.

Provider: OpenAI `gpt-5.6-sol` via the Responses API with strict structured output
(`docs/technology-decisions.md §8`). Strict mode guarantees shape and enum membership only; `§3`
still applies and the application validator remains the authority for lengths, counts and the
cross-field rules.

## 4.5 Creative-understanding evaluation contract

Everything else in this document measures whether output is **legal**. This measures whether it is
**right**, which is the capability Phase 4 exists to deliver (`product-doctrine.md §3`). Phase 4 is
not complete without it.

**Corpus:** `docs/model-evals/creative-understanding.json` (`creative_understanding_v1`), fourteen
cases. It is deliberately small and deliberately durable: vague and taste-heavy prompts, prompts
carrying a negative constraint, prompts already clear enough that the right number of questions is
zero, prompts carrying facts that must survive verbatim, one open delegation, and one genuinely
ambiguous case where a question should earn its place. Each case declares its class, the facts the
host actually supplied, whether clarification is expected, and what would count as an outright
failure.

**Three evidence classes, and they are not interchangeable.**

| Set | Class | What it supports |
| --- | --- | --- |
| `creative-understanding.json`, 14 cases | **regression suite** — every output inspected and discussed | catching regressions; never fresh evidence again |
| `creative-understanding-holdout.json`, 12 cases | **pre-registered validation set** — frozen and independently reviewed before the remediation, but authored by the same person who then wrote the prompt | validation against pre-registered invariants; not the strongest evidence of generalization |
| `creative-understanding-sealed-challenge.json`, 12 cases (`sealed_challenge_v1`) | **spent.** It was a sealed challenge — authored independently, unseen while `v4` was written — and it was run once at `v4`, where it failed its human gate. `v5` was written knowing these cases | regression from `v5` onward. **Never generalization evidence again** |
| `creative-understanding-sealed-challenge-v2.json`, 12 cases (`sealed_challenge_v2`) | **spent.** The fresh sealed challenge for `v5`: independently authored after the implementation and harness froze at `19f1ec8`, input-frozen at `9053b6d`, run once at that SHA, evidence at `acc9846`. It carried the Phase 4A GO | it *was* the generalization evidence. **Never generalization evidence again** |
| *(none)* | a sealed challenge for any future prompt version | generalization. **A new corpus and a new slot must be authored; no existing set can stand in** |

Every set in this table has now been run, so none of them can produce fresh evidence for a future
prompt version. That is the intended terminal state, not an obstacle: the cost of authoring a new
sealed corpus is exactly what stops a rerun of known cases from being quietly accepted as
generalization.

**A limit the go/no-go record must carry, not just the blind reviewer.** The clarification
check gates only against *over*-asking: `expectClarification: "no"` fails a question that
should not have been asked, and the other labels are advisory because whether a question
earned its place is a judgement. The baseline failure was *under*-asking — zero questions on
all fourteen cases. So a remediation that fixes authority correctly and still asks nothing
anywhere passes both sets mechanically, and only a human reading the briefs can see it. Do not
read a clean mechanical run as evidence on clarification.

The middle row is the one most easily overstated, and `results/creative-understanding-v1/process-notes.md`
records why, along with the one semantic axis inside it that is not novel.

**Where evidence and incidents live.** A `results/*/` directory holding a completed run is
immutable in full — the machine evidence and the narrative files beside it. **Seven** such
directories now exist. Six are the creative-understanding runs this section is about — the `v3`
baseline, the `v1` sealed challenge, and the four `v5` runs. The seventh,
`clarification-rerun-behaviour-v1`, came from Phase 4B and belongs to **none** of the classes in
the table above: it is pre-registered validation evidence for the clarification-answer input shape
and lifecycle (`phase-4b-plan.md §3.9`), it is **not** fresh generalization evidence for
`event_identity_v5`, it does **not** replace or reopen the spent `v5` sealed challenge, and because
the prior clarification rounds in its cases are hand-authored fixture state it is **not** evidence
about whether EventIdentity asks good questions, asks at the right time, or produces good design.
It is listed here because it is protected evidence, not because it evidences the same thing.
`PROTECTED_RESULT_DIRS` refuses all seven as an output path. A directory is added to that list as
part of finishing the run that produced it, never as a follow-up: until it is, the only guard is
the write-once check, which `EVAL_OVERWRITE=1` exists to override. No eval set **in this section**
has a writable output path; the three Phase 4C DesignIntent slots of §4.7 do, because none of them
has run yet, and each joins the list in the same change that commits its own evidence. `process-notes.md` under
`creative-understanding-v1/` is a **frozen historical record**, not a current append target.
Operational incidents from here on are recorded only in `docs/model-evals/eval-incidents.md`,
which sits outside every protected directory and carries the rule those incidents produced:
**never execute the eval runner to verify the harness** — its paths, guards, schemas, reports and
refusals are verified by pure, unit and static checks, and a live eval command runs only after
explicit authorization for that exact evidence run.

**Runner:** `tests/eval/creative-understanding.eval.ts`, added in Phase 4A. The sets and their
evidence classes are defined once in `src/lib/ai/evals/corpus.ts`, which both this runner and the
leakage scan read, so they cannot disagree about which file a set means:

| script | `EVAL_SET` | corpus | output | state |
| --- | --- | --- | --- | --- |
| `eval:regression` | `regression` | the original 14 | `…-v1-regression` | **run at `v5`, refused** |
| `eval:holdout` | `holdout` | the 12 pre-registered | `…-holdout-v1` | **run at `v5`, refused** |
| `eval:spent-challenge` | `spentChallenge` | `sealed_challenge_v1` | `…-sealed-challenge-v1-v5-regression` | **run at `v5`, refused** |
| `eval:challenge2` | `challenge2` | `sealed_challenge_v2` | `…-sealed-challenge-v2` | **run at `v5`, refused**. It was the fresh generalization evidence |
| ~~`eval:challenge`~~ | `challenge` | `sealed_challenge_v1` | *(refused)* | historical; its first run is the immutable evidence |

All five now stop at the protected-path refusal instead of writing. Each is still invokable, and
each still names its corpus and directory, so the refusal is targeted rather than a generic
"unknown set". A future prompt version needs a new corpus and a new slot.

`eval:challenge` was kept and always refused, naming the two paths that replaced it, because the
command is still printed in this document's history and in operators' shells. Every other set has
since joined it in refusing, for the opposite reason: not that its path was always wrong, but that
its run is done.

It runs the cases **sequentially** against the live model — concurrent calls
would report a latency no host will ever experience — records failures rather than retrying
them away, and writes four files to the directory its `EVAL_SET` names — never a directory holding
a completed run's evidence, which it refuses along with anything inside or above one:
`raw-responses.jsonl` (below), `run.json` (every response and its telemetry),
`mechanical-report.md` (for us), and `blind-review.md` (for an independent qualitative reviewer).
It is excluded from `npm test`: it costs money and measures the creative stack, not the compiler.

**A paid response is durable before our own code can destroy it.** `raw-responses.jsonl` is
appended the moment each response arrives, ahead of any deterministic evaluation, because a bug
in the checker used to abort the loop before `run.json` existed and take every response already
paid for with it — unrecoverable on a one-shot sealed challenge. Text the provider returned and
our validation then rejected is journaled too, on `EventIdentityError.rawResponses`: `invalid_output`
is a call that was answered and billed, not one that produced nothing, and no status may say
otherwise. Nor may `kind` decide that on its own — a provider failure on the *repair* attempt
also follows a response that was returned and billed, so what the error carries decides, not what
it is called. The three reports are rewritten on each run; the journal is rotated aside — kept
under a stamped name, never appended to and never deleted — so two runs can never blend into one
file. `run.json` is written only on a clean finish, so a journal with no `run.json` beside it is
visibly an aborted run.

**What the journal must contain, so that recovery is possible at all.** If deterministic
evaluation or report generation crashes after a case has finished its provider interaction, that
case's journal entry plus the frozen corpus and code must be enough to reconstruct it faithfully,
with no second model call and nothing guessed. So each entry carries the case's identity and the
corpus it indexes into (`caseId`, `evalSet`, `corpusVersion`), the run it came from
(`runStartedAt`), and the fully-built telemetry the report itself records — `promptVersion` and
`schemaVersion` among it, kept in one place rather than duplicated, because two copies of a
version are two chances to disagree. A successful entry adds the raw provider text and the
validated output; a failed one adds the error kind, message and validation issues, and every paid
raw response. Fields the provider never returned stay absent: a zero token count would be a
measurement nobody made. Every field is required, so a call site that forgets one does not
compile.

Recovering a *report* from a journal is still a manual job: `readJournal` returns the intact
entries and reports damaged lines, and nothing rebuilds `run.json` or the two documents from them.
That is a known tooling gap, recorded rather than implied — the journal guarantees the evidence is
recoverable, not that it rebuilds itself.

Two things a manual reconstruction must not get wrong. `run.json`'s `complete: true` is a
constant written only on a clean finish, so a report rebuilt from an aborted run's journal must
not carry it. And `corpusVersion` is a version string the corpus declares about itself, not a
hash — a corpus edited without bumping it defeats the join, which is why the corpora are frozen.

**The sealed challenge path was wired before its cases existed, and the arrangement held twice.**
`EVAL_SET=challenge` names a corpus and an output directory fixed once and never since; when
`sealed_challenge_v1` was written the corpus file was deliberately absent, authored independently
after the implementation froze, and dropped in unchanged. The same arrangement is already in place for the
corpus the `v5` GO required: `EVAL_SET=challenge2` named
`creative-understanding-sealed-challenge-v2.json` and its own output directory, wired at the `v5`
freeze before its cases were known, and when the corpus arrived the input freeze `9053b6d` changed
**one file and nothing else** — 288 added lines, no runner, checker, prompt, schema, model or
script. The property the dormant slot existed to make true was therefore observed, not asserted. `EVAL_SET=spentChallenge` reruns
the spent `v1` cases into a separate `-v5-regression` directory as diagnostic evidence, and the
`v1` first-run evidence is refused as an output by every set. A challenge invocation before a corpus lands fails at
module scope — before the API-key check, before a client is constructed, and with no provider call
— and the runner refuses any set whose corpus is missing, uniformly. `prompt-leakage.test.ts`
already names the challenge filename behind an existence check, so the independently authored
corpus is scanned against the frozen prompt and wire schema the moment it lands, without anyone
editing benchmark-integrity tooling after seeing the cases. Adding the file is then the entire
change: no runner, checker, prompt, schema or model code moves, because moving any of it after
seeing the cases is precisely what a sealed challenge exists to prevent.

**The corpus contract, published so an independent author can satisfy it without reading the
runner.** A corpus is a JSON object with a non-empty `version` string and a non-empty `cases`
array. Every case needs a unique non-empty `id` (the journal's join key), a non-empty `prompt`
(the host's own words, the only thing sent to the model), and an `expectClarification` of exactly
`"no"`, `"likely"`, `"acceptable"` or `"expected"`. Everything else is optional and each check
reports `n/a` when its input is absent: `facts` and `mustAvoid` in the regression style,
`hostPhrases`, `expectedFacts`, `mustNotBeClaimedAsHostConstraint` and `tests` in the validation
style, or any mix. The runner asserts this shape at module scope, before any provider call,
because a malformed case in a one-shot corpus would otherwise spend a sealed case on a prompt of
`undefined`. The rule itself lives in `src/lib/ai/evals/corpus.ts`, not in the runner, so it can
be unit-tested — against the real corpora — without importing the module that spends money.

The deterministic checks live in `src/lib/ai/evals/creative-understanding.ts` and decide exactly
one thing — whether an **outright failure** was committed. Two of them are derived from the host's
prompt rather than from the corpus, so they would work on any prompt and are not tuned to these
fourteen: every claimed fact must be quotable from the host's words, and a term the host negated
must not reappear as a positive part of the brief.

`blind-review.md` carries the prompt and the response and nothing else — no expected verdict, no
`mustAvoid` list, no mechanical result, no notes. That blinding is asserted by test against every
case in the corpus, because a reviewer shown our expectations is no longer evidence about the
model.

### The rubric

Seven dimensions apply to `EventIdentity` alone and are gradeable as soon as the call exists. Three
more become gradeable only when later stages do.

| # | Dimension | Question | Method |
| --- | --- | --- | --- |
| 1 | Intent understanding | Did it capture the actual vibe and subtext rather than keyword-match? | **Qualitative** |
| 2 | Creative vocabulary | Are the inferred associations coherent, specific, and useful to a designer? | **Qualitative** |
| 3 | Taste / cliché avoidance | Where the prompt asked for restraint, did it avoid the obvious, cheesy or over-literal reading? | **Mixed** — `mustAvoid` is deterministic; whether the rest reads as cliché is not |
| 4 | Fact discipline | Did it invent no venue, date, location, dress code or preference the host did not supply, while carrying supplied facts verbatim? | **Deterministic** — compare against the case's `facts` |
| 5 | Clarification judgment | Did it ask only when ambiguity materially affects the creative identity, ask nothing when the prompt was sufficient, ask no logistics, stay within the ceiling, and always offer a `You decide` option? | **Mixed** — count, ceiling, logistics-freedom and the `You decide` option are deterministic; whether a question was *worth asking* is not |
| 6 | Reference translation | Did a named reference become original visual language, with no logo, proprietary character or campaign artwork? | **Mixed** — `mustAvoid` terms are deterministic; genuine originality is not |
| 7 | Downstream usefulness | Would a strong human designer know what assignment they had been given? | **Qualitative** |
| 8 | Direction diversity | Are the three directions genuinely different creative expressions rather than palette or font swaps? | **Mixed** — the skeleton signature and planner distinctness (§5.3, `spec.md §11.9`) are deterministic and necessary; whether they *feel* like different ideas is not. Requires DesignIntent |
| 9 | Intent fidelity | Do all three remain faithful to the interpreted identity? | **Qualitative.** Requires DesignIntent |
| 10 | One-shot quality | Does the result need personalization, or rescue? | **Human gate.** Requires the full stack; judged at Human Test #2 |

**Do not pretend all ten automate.** Four of the seven identity dimensions are wholly or partly
deterministic — fact discipline fully, and cliché avoidance, clarification judgment and reference
translation in their negative half, which is the half that catches outright failures. Intent
understanding, creative vocabulary and downstream usefulness need a qualitative evaluator, and the
one-shot bar needs humans. A mechanical pass on 3–6 is necessary and never sufficient.

### What this does not become

A benchmark project. Fourteen cases, one rubric, run against a real model when Phase 4 has one. Do
not grow the corpus to chase coverage, do not build a scoring service, and do not gate ordinary
code changes on it — it measures the creative stack, not the compiler.

---

---

## 4.6 Phase 4A close — the `v5` go/no-go record

**PHASE 4A — GO.** `event_identity_v5` / `event_identity_schema_v5` is the accepted production
interpretation contract for the phases that follow. Recorded here, beside the contract it judges,
so a reader of §4 does not have to reconstruct the decision from a changelog.

| | |
| --- | --- |
| Final `v5` pre-eval freeze | `19f1ec8ee6b7634592fa248cc4a44d24f973c470` |
| `v5` regression evidence | `20a7490bf89fdbc089bf405986a83732f2f300e7` |
| Spent-challenge diagnostic | `6822ef727ce139b68e11ad95d81dc8498345ccbd` |
| Pre-registered holdout | `15d7ed871f70ed3e20c4ed83b0917d06b655a5c1` |
| Sealed challenge v2 input freeze | `9053b6d5f7f670d9444e900b20bee676108de72b` |
| Fresh challenge2 evidence | `acc9846e27cd234f7fbc8d33591b489e4ed77484` |

The decisive run is the fresh sealed challenge: 12/12 completed, 10/12 structured on the first call
with one successful repair each on SC2-11 and SC2-12, 11/12 mechanical, 28/28 expected-fact
assertions holding, `factsGrounded` 12/12, no transient retries, latency min 22.3 s / median 30.0 s
/ mean 31.1 s / max 54.2 s. Both clarification routes fired and neither misfired: Route A on
SC2-11, Route B on SC2-12, no response mixed routes, the creative question carried exactly one
defer, the boundary question carried none and was asked alone, and all eight cases the corpus
labels `no` asked nothing. The independent blind review returned 7 Excellent, 5 Good, 0 Borderline,
0 Fail, passed the premium-product test, and found nothing serious enough to block the next phase.

**SC2-04 stands at 11/12 and is not to be rewritten.** The host wrote one compound prohibition —
*"No rings or 'Mr & Mrs'."* — and the model split it faithfully into two host constraints, `"No
rings."` and `"No 'Mr & Mrs'."`. The frozen containment rule (`§4`, prompt-grounding) cannot
recognise a faithful split and reads each half as ungrounded. Both halves are the host's own words
and nothing was invented, so this is a checker/contract edge rather than the authority failure the
check exists to catch — but the recorded evidence is the evidence, and the distinction lives here
in the reading, never in the artifact.

**What the GO does not license.** It is not a finding that `v5` interpretation is finished, and
7/12 Excellent is not a standing target. Four qualities recurred in the blind review and are
carried forward as **excellence watch** items for the phases that consume this contract, not as
`v5` defects to remediate now:

1. unsupported anti-sentimentality, anti-theatricality and anti-kitsch taste restrictions;
2. reusable finishing language in typography, texture, hierarchy and copy;
3. verbal identity sometimes less distinctive than the visual organizing idea;
4. a visible preference for polished composition and emotional moderation.

They are watched through DesignIntent, Composition and rendered-concept evaluation, because where
the highest-leverage fix belongs is not yet known and changing the interpreter first would be a
guess. **Latency is explicit debt on the same terms:** a ~30 s median is materially above the
destination in `spec.md §7.10`, and it is addressed after the creative pipeline is proven, not
before. The north star is that every interpretation is Excellent — and the way not to get there is
to manufacture a 12/12 by tuning against spent cases.

---

## 4.7 DesignIntent evaluation contract

§4.5 measures whether an *interpretation* is right. This measures whether the three design
directions built on it are — the Phase 4C question, and the one `product-doctrine.md §2` calls core
functionality rather than polish. The harness, the corpus contract and the gate were all frozen at
**T19**, before any case was authored and before the DesignIntent prompt was written
(`docs/phase-4b-plan.md` Part IV).

**The gate lives in `docs/phase-4b-plan.md §3.7` and only there.** Its bands, its
`Excellent` requirements, its minimum-wowable question and criteria, its S1–S9 categories, its class
thresholds, its corpus size and its distribution rule are **not** restated here. One normative copy
is the whole point: a second would drift, and §3.8 additionally withholds §3.7 from the blind
reviewer, which a copy in this document would defeat. `src/lib/ai/evals/design-intent-gate.ts`
transcribes that section verbatim, is hash-pinned, and is checked against the plan's own bytes by
`src/lib/ai/evals/design-intent.test.ts`.

**Three evidence classes, and they are not interchangeable** (`phase-4b-plan.md §3.4`):

| script | `EVAL_SET` | corpus | output | class |
| --- | --- | --- | --- | --- |
| `eval:design-intent-regression` | `designIntentRegression` | `design-intent-regression.json` | `docs/model-evals/results/design-intent-regression-v1` | **regression** — authored before the prompt, readable freely, catches regressions forever |
| `eval:design-intent-validation` | `designIntentValidation` | `design-intent-validation-v2.json` | `docs/model-evals/results/design-intent-validation-v2` | **pre-registered validation, the replacement** — its predecessor `design-intent-validation.json` was invalidated at T19B for a stage-observability mismatch: it was authored under a host-constraint criterion this stage cannot always meet, and was read while that criterion was being corrected. This one is authored and frozen against the corrected contract before the prompt was written, by a second independent author who implemented none of the harness and saw none of the invalidated cases, independently reviewed for fairness and leakage |
| `eval:design-intent-challenge` | `designIntentChallenge` | `design-intent-sealed-challenge.json` | `docs/model-evals/results/design-intent-sealed-challenge-v1` | **sealed challenge** — authored after the T21 implementation and the harness froze, unseen while they were written. The generalization evidence the §3.7 gate is applied to. One run, then spent |

**The regression and replacement-validation corpora are on disk; the sealed challenge is absent,
and a slot refuses at module scope without its file** — before an API key is read and before a client is constructed. T20 authored the
regression corpus, and it stays in service because its class claims no pre-registration (§3.4). T20
also authored a pre-registered validation corpus, and **T19B invalidated it**: the host-constraint
criterion it was written under asked this stage for conformance a DesignIntent has no field for, and
the correction was made while that corpus was on disk and being read, so it can no longer be called
a set whose criteria were fixed before its cases existed. It is preserved unchanged and pinned by
digest in `src/lib/ai/evals/corpus.ts` as `INVALIDATED_CORPORA`; no eval set points at it, and it
is never run as pre-registered evidence for the corrected contract. **T20B** wrote the replacement
named above — thirteen cases, from the corrected published dimensions alone, by a second
independent author whose isolation was established from their own recorded actions, and accepted
after two independent reviews. What that set does **not** prove is recorded in
`phase-4b-plan.md` Part IV rather than left to memory, and the invalidated corpus is **withheld
from T21's prompt author**, which is the one contamination route the corpus cannot close from its
own side. T22 writes the sealed challenge, after the implementation freeze. Adding a corpus file is then the entire change: no runner, checker,
prompt, schema or model code moves, because moving any of it after seeing the cases is precisely
what these classes exist to prevent. Each output
directory joins `PROTECTED_RESULT_DIRS` in the same change that commits its evidence, never as a
follow-up.

**No live DesignIntent call may happen before T21** is complete, frozen, independently reviewed and
explicitly approved. `tests/eval/design-intent.eval.ts` calls through a one-binding seam,
`src/lib/ai/evals/design-intent-seam.ts`, which today points at a refusal that explains itself. T21
repoints that binding and touches nothing else in the frozen harness. The seam exists so the eval
goes through the **same production assembly** the real generation path uses: a second assembly
written for the harness would let a set pass while production sent something else.

**The corpus structural contract, published so an independent author can satisfy it without reading
the checker.** A corpus is a JSON object with a non-empty `version` string and a non-empty `cases`
array. Each case is one **batch** — one event, three concepts — and needs:

- a unique non-empty `id`. It is the journal's join key, and it is also the identity revision id the
  deterministic planner seeds from, so two cases sharing one would be planned identically;
- a non-empty `eventType`: a short label such as `"christening"` or `"60th birthday"`, compared only
  for equality after trimming and case folding. Two batches of the same type must spell it the same
  way. It is never sent to the model and never appears in the blind artifact as metadata; it exists
  because §3.2's same-type measurement and §3.7's S8 same-type clause need to know which batches are
  instances of the same kind of event;
- an `identity`: the **authoritative creative brief**, in exactly the shape §4.1's result envelope
  holds under `identity`, and parsed with that same schema. It is hand-authored fixture state — no
  model produces it, and the run makes no call to obtain it, so nothing stochastic sits upstream of
  the thing being measured. A brief carrying a boundary question is not representable here: the
  envelope the runner builds is authoritative by construction (`spec.md §7.6b`);
- optionally `suppliedFacts`: keys from §4.1's supplied-fact fields, values either `null` or the
  host's own words. A DesignIntent call never receives them, so a value that surfaces in a concept's
  `presentation` is a fact the model invented. Absent, the check reports `n/a`;
- optionally `notes`: the author's own, never sent to the model and never shown to the reviewer.

**A brief must be satisfiable.** If a hex under `paletteIntent.requiredColors` is within ΔE 10 — the
neighbourhood an exclusion covers — of a hex under `paletteIntent.avoidColors`, the case is refused.
No output could honour both: carrying the required colour puts the palette inside the exclusion and
omitting it breaks the requirement, so the case would fail every sibling whatever the model
returned. The contract uses the same frozen neighbourhood the check uses, so the two cannot
disagree about what "too near" means.

**Every prose field of the brief is leakage-scanned** against the model-visible surfaces, so a
distinctive phrase an author writes must not already appear in a prompt or a wire schema — and a
collision is resolved at the corpus, never at the scanner (`phase-4b-plan.md §3.5`). The three
`compatible*` enum arrays and the `"No visual inspiration supplied."` sentinel are exempt, because
the schema forces those values and an author cannot change them. `eventType` is not scanned at all:
it never reaches the model. The scan catches literal reuse and not paraphrase, so an independent
read for benchmark integrity is still required.

The gated corpus — the sealed challenge — additionally has to satisfy §3.7's frozen size and
composition requirement. The runner asserts the whole contract at module scope, before any provider
call, and `validateDesignIntentCorpusShape` is a pure function so it can be unit-tested without
importing the module that spends money.

**What a run writes**, to the directory its `EVAL_SET` names and never to one holding a completed
run's evidence: `raw-responses.jsonl` (appended per response, the moment it arrives, ahead of any
deterministic evaluation) and `mechanical-report.md` at the top level, and **`review/`** holding
`blind-review.md` and `reviewer-packet.md`. The split is the point: `mechanical-report.md` carries
the check details, the acceptance criteria and the batch-label-to-case-id join, and handing a
reviewer "the results directory" with that file beside the artifact would hand them part of what
§3.8 withholds. What gets handed over is `review/`. The artifact is written before the report,
because the report is this set's completion signal and a directory that reads as complete with no
artifact in it would be worse than an obviously aborted one. The journal and all three reports are
rotated aside at the start of a run rather than appended to or left standing.

**What the blind artifact contains** (`phase-4b-plan.md §3.8`), per batch: the authoritative brief
and the three DesignIntents, each with its `presentation` object — without which the verbal-identity
questions, the `Good` band and minimum-wowable criterion 4 cannot be answered. Plus, once, the
corpus-wide measurements. Nothing else: no case id, no event type, no expectations, no prior
evidence. Batches are labelled positionally, so the reviewer has an id to cite that is not the
corpus's own case name. The identity is included **deliberately** — whether a treatment is supported
by the identity, and whether a pattern belongs to the system or to one unusual input, are not
answerable from outputs alone.

**What the reviewer packet contains, and what it must not.** It carries the definitions: the four
bands with `Excellent`'s requirements, the minimum-wowable question with its criteria, and the
S1–S9 checklist. A reviewer asked to rate against a scale they cannot see is guessing, and a
checklist they have not been given is one they cannot complete. It withholds the arithmetic, in
§3.8's terms, and that exclusion is asserted by test against the rendered packet rather than
asserted in prose — and against the rendered `mechanical-report.md` as well, because a directory
layout is a convention and a scan is a test. The GO/NO-GO arithmetic happens **afterwards, outside the blind review**, by
someone applying §3.7's frozen rule to what the reviewer returned;
`decideDesignIntentGate` is that rule as a pure function, and it refuses to decide at all on an
incomplete review.

**The mechanical block** (`phase-4b-plan.md §3.2`) is deterministic, per batch and corpus-wide. Per
batch: schema validity against production's own validator, assignment conformance, palette
separation above a frozen floor measured in CIELAB rather than by hex equality, typography-pairing
distinctness, composition-vector distinctness, motif-set overlap strictly below a ceiling,
host-constraint colours honoured, no supplied fact surfaced, and a present host-facing
`presentation`.

Three of those are narrower than they first look, and each for the same reason — a metric must
measure the model, not something the model never chose. **Palette separation is measured over the
non-required colours only**: a colour `paletteIntent.requiredColors` demands is carried by all three
siblings by obligation and scores zero distance, so counting it would fail a model for honouring a
constrained palette exactly as canon asks. Where no free colour is left, the check is advisory and
the judgement is the reviewer's. **Composition-vector distinctness counts the four dimensions the
model chooses** — asymmetry, rhythm, section contrast and ornament — and not `hierarchy`, which the
planner assigns and actively separates; hierarchy conformance is checked by assignment conformance,
where it is a statement about the right thing. **Required and excluded colours are read from
`paletteIntent`**, never from a hex inside constraint prose: a constraint may be a prohibition, a
requirement or a correction, and `"No #C8102E anywhere"` and `"it has to carry #C8102E"` are the
same string to a regex. A hex whose direction is not declared goes to the reviewer under S4.

**What a host constraint is judged for here is stage-scoped, and both halves bind**
(`phase-4b-plan.md §3.2`). Every host constraint is authoritative for all three siblings whatever
its subject, so no DesignIntent may contradict one, reinterpret it as optional, promote an
incompatible recommendation over it, fabricate an opposing fact, or encode design semantics that
make it impossible to satisfy downstream. A constraint must additionally be *visibly* conformed to
**at this stage** only where its subject is observable on the DesignIntent surface — a required or
avoided palette treatment, a typography restriction, a motif restriction, a tone or aesthetic
boundary, a restriction on concept-card language, or any design-semantic requirement the seven
fields carry. `spec.md §7.5` defines a constraint broadly and does not limit it to what a
DesignIntent can encode, so a valid brief may carry one whose subject is event-detail copy, RSVP
or payment behaviour, or section ordering; such a constraint **remains authoritative downstream**
and is enforced at the first stage able to express it, and its absence from a DesignIntent is not
erosion. No classifier decides which arbitrary English constraint belongs to which stage, and none
is to be built — not a keyword table, not a model. What the checker can decide from `paletteIntent`
it decides, and a violation gates; every remaining constraint is **deferred** to the reviewer, named
and unreduced, and is never reported passed, never reported failed and never counted as either.

Corpus-wide, and this block is not
optional: same-index sibling distance across batches, the same restricted to batches sharing an
event type, palette-family, typography and motif-set frequencies, recurring finishing language, and
recurring design signatures. Those are **measurements, not thresholds** — they are the evidence the
reviewer answers S8 and S9 against, rather than from recollection of the ratings just given.

A check that cannot be decided honestly reports `n/a` or `advisory` and is **never** folded into the
pass count. Several are permanently advisory by design, and each for a stated reason: first-call
schema validity, because §8 allows one repair retry and a repaired response is a legal production
outcome; retry counts, because they are a measurement rather than a verdict; natural-language host
constraints, which are deferred to the reviewer under S4 rather than claimed as traceable into
three objects that may have no field for them, and creative-guidance adoption, which is the
reviewer's under S3; and the attractive-token allotment, because **a DesignIntent carries no attractive token** — the allotment
constrains the composition call (`spec.md §7.7`) and 4C runs none, so the model never had the chance
to violate it. That check reports `n/a` and carries the plan's own facts as detail; a `pass` there
would have put a true-looking verdict about model output into an evidence report, on a property that
is a fact about the planner, and the planner is decided over thousands of seeded plans in
`src/lib/generation/planner.test.ts`. **A mechanical pass is necessary and never sufficient**: three
outputs can satisfy every distance metric and still be one idea.

---

# 5. DesignIntent (design_intent_v5)

## 5.1 Contract

```ts
DesignIntent {
  family: "editorial" | "invitation" | "statement"     // assigned
  tonalDirection: "light" | "mid" | "dark"               // assigned
  palette: { colors: string[]; dominant: string }        // 3–5 uppercase hex; dominant ∈ colors
  typographyPairing: TypographyPairingId                 // from the allowed list, in the assigned category
  density: "compact" | "balanced" | "spacious"
  composition: {
    asymmetry:       "symmetric" | "gentle" | "strong"
    hierarchy:       "restrained" | "editorial" | "dramatic" | "monumental"
    rhythm:          "continuous" | "alternating" | "punctuated"
    sectionContrast: "low" | "moderate" | "high"
    ornament:        "none" | "restrained" | "decorative"
  }
  motifs: MotifId[]
}
+ presentation { name, description }                     // host-facing, never compiled (§21 of Revision 1 stands)
```

`family` replaces `heroArchetype`. It is a design grammar the composition call is conditioned on, not a bundle: the compiler enforces no family rule; family lints are recorded as `intentDeviations`, never repaired. `composition` values are directives to the composition call and measurements taken from the tree afterwards; they select nothing.

**v4 reconciliation.** v3's schema had drifted from the production vocabulary in three ways, all corrected together because they are one drift:

- `typographyPairing` carried six category-shaped IDs. Pairing and category are different things: there are six categories and twelve concrete pairings, two per category. The v4 enum is the twelve, and runtime narrowing filters to the assigned category and, at monumental hierarchy, to the pairings that hold there.
- `motifs` carried a ten-item catalog (`plaid_restrained`, `botanical_line`, `deco_border`, …) that no longer exists. The v4 enum is the seven curated IDs — four patterns (`plaid`, `stripe`, `gingham`, `linen`) and three arrangements (`equestrian`, `botanical`, `celestial`).
- schema and prompt descriptions still said `archetype`, which Revision 6 removed. v4 says `family`, names the page system as compiler-owned, and names structure as the later composition call's.

Creative responsibilities are unchanged: the planner assigns family, tone, typography category and hierarchy; the strong model returns the DesignIntent; the composition call authors structure. v3 is preserved at `docs/model-schemas/history/design-intent.v3.schema.json` and `docs/model-prompts/history/design-intent.v3.system.md`.

**v5 — the first version sent to a provider (T21).** `v4` was a pre-provider draft and no provider call was ever attributed to it, so there is no `v4` evidence to invalidate. Prompt and schema move together, as §2's paired rule requires, because model-visible text moved on both sides:

- **`composition.hierarchy` is a hard assignment field**, like `family` and `tonalDirection`, and runtime narrowing offers exactly the assigned value. Four components already treated it that way and only the narrowing disagreed: the planner assigns it and separates the batch on it, §4.7's mechanical block gates an *exact* match under assignment conformance, and the same block excludes hierarchy from model-owned composition distinctness **because it is planner-owned**. An assignment whose family does not admit its hierarchy is refused rather than widened back to the family's list.
- **The concept name admits Unicode letters and combining marks**, so a decomposed accent is equivalent to a precomposed one and a name in a script without case is ordinary rather than invalid. `spec.md §7.8` gives an invalid name a deterministic fallback, so the old ASCII-only rule discarded graded concept cards *after* the model had answered. Capitalization is asked for in description text as natural title-style capitalization where the language or script has case, and never as a pattern.
- **The prompt describes only the two channels this call receives.** `v4` named `redesignFeedback`, `priorConceptNames`, `priorIntentSignatures` and an `allowedMotifs` catalogue, none of which exist (`docs/phase-4b-plan.md §E`: the three calls are blind and parallel, and the envelope is the brief plus one assignment). It also named the assignment as three fields where deterministic code assigns four, and restates the two-tier authority split — `hostConstraints` authoritative whatever its subject, `creativeGuidance` free to be departed from — in §3.2's terms.

A `v4` response is not a valid `v5` response. v4 is preserved at `docs/model-prompts/history/design-intent.v4.system.md` and `docs/model-schemas/history/design-intent.v4.schema.json` (with its wire projection beside it), and old bytes are never relabelled.

## 5.2 Input, assembly, narrowing, validation

As Revision 1 §9–§12 with `assignment.family` in place of `assignment.heroArchetype`; `family`, `tonalDirection` and `composition.hierarchy` each narrowed to the assigned value; and typography pairings filtered by category and by whether they hold at the assigned hierarchy. The family table (`invitation` excludes `monumental`; `statement` allows only `dramatic` and `monumental`) remains the *vocabulary* check the application validator uses to tell a hierarchy the family does not admit at all from one that is merely not the assigned one; it is no longer the narrowing. The one-retry rule stands: one repair retry for structurally invalid output; no model calls for compatibility repair, and **none for an assignment mismatch either** — that class fails visibly, and a response that is malformed *and* out of assignment must not spend the single repair.

The production boundary is `src/lib/ai/openai/design-intent.ts`, and the model-visible request text is assembled in `src/lib/ai/openai/design-intent-input.ts` under `design_intent_input_v1`. Both are leakage-scanned surfaces. Every request pins its model configuration rather than inheriting it — reasoning effort, `service_tier`, `store: false` and an explicit output ceiling — because the verified cost bound in `src/lib/generation/design-intent-cost.ts` is derived from exactly that request shape rather than inherited from Event Identity's.

## 5.3 Evals

DI-01…DI-11 stand with `family` substituted; add:
- **DI-12 — composition realism**: assigned `statement` + `monumental`; expect a pairing that holds at monumental and `ornament` in none/restrained.
- **DI-13 — family is not a bundle**: the model must not mention section treatments; the six fields plus presentation only.

---

# 6. Composition (composition_v1_p2)

## 6.1 Input contract

```ts
type GenerateCompositionInput = {
  eventIdentity: EventIdentity                       // design brief, constraints, motif/texture direction
  contentProfile: { titleWords; titleChars; hostsChars; venueChars; descriptionChars; registryCounts; provisionalFields[] }   // real content where present, bounded provisional content elsewhere (spec.md §7.3)
  capabilities: Capabilities                         // enabled features, never content presence: rsvp, registry, gifts, externalRegistry, cashFund, hosts, description, time, location, deadline
  designIntent: DesignIntent                         // this concept's, already validated
  directive: Directive                               // eight dimensions, assembled sentence (planner)
  forbiddenTokens: AttractiveTokenId[]               // allotment for this sibling (planner)
  examples: CompositionTree[]                        // three library pages rotated by seed
  primitiveSpec: string; rules: string               // generated from the validator table
  avoid?: string[]                                   // collision re-prompt only: sibling hero skeletons
}
```

Do not send guest data, RSVP data, registry contents, private codes, or prior ResolvedDesignSpecs.

## 6.2 Message assembly

System message: `docs/model-prompts/composition.system.md`. User message: the numbered blocks in that file, every block a separate structured field; user text is never interpolated into instructions.

## 6.3 Validation and repair

Order, all deterministic except the two re-prompts:

1. **Strict schema** (unknown keys fail; enum-typed tokens must be strings, counts numbers, `ruled` boolean). Failure → one re-prompt with the error list. Second failure → library fallback for the whole page; telemetry `fallback: library`.
2. **Structural validation and repair**: nesting matrix, depth, per-section and per-page limits, box depth, coverage (conditional on capabilities), capability references, component placement, surface sequence, motif kind, responsive intent. Every repair logged `{ rule, path, kind, before, after }`.
3. **Attractive-token caps**: a tree using a token this sibling was not allotted earns one re-prompt; if it persists, deterministic neutralization logged as `planner`.
4. **Content-fit estimate** (advisory) → **canonicalize** → page system, palette, typography → **layout resolution** → **rendered-geometry verification** (authoritative; `verified.clean` must be true).
5. **Selector**: signature against batch siblings and redesign history; collision → one re-prompt with the colliding skeletons; second collision → library fallback.

Re-prompts exist only for schema-invalid output, a token-cap violation and a selector collision. Repairs of every other kind never call a model and are reported separately from schema validity.

## 6.4 Evals

- **CO-01 — schema on first call**: ≥ 90% of responses parse strictly; 100% after one re-prompt.
- **CO-02 — zero violations**: ≥ 45% of raw trees break no structural rule; 100% repair to zero remaining.
- **CO-03 — capabilities**: an event whose registry, cash fund or description feature is disabled yields no reference to them in 100% of trees; an event with the features enabled but no content yet still receives designed sections for them.
- **CO-11 — re-fit**: replacing a short venue with a long one on a compiled concept produces a new resolved-spec revision with the same composition hash, no model call, and `verified.clean` true.
- **CO-04 — geometry**: 100% of specs verify clean at 390 and 1280.
- **CO-05 — invention**: ≥ 30 distinct hero skeletons and ≥ 40% novel against the library in 60.
- **CO-06 — caps**: each attractive token in ≤ 1/3 of heroes in a batch run; ≤ 5% of trees need neutralization.
- **CO-07 — collisions**: 0 sibling pairs at or above .70 after the selector.
- **CO-08 — directives**: structure, surface, details and RSVP-intro compliance ≥ 90%; date and opening ≥ 70%.
- **CO-09 — adversarial feedback**: feedback asking for CSS, images, a tenth section or free copy yields an ordinary tree.
- **CO-10 — review**: model screens do not collapse into a small number of recurring template groups, and do not simply map onto the library groups, on unlabeled grayscale sheets. **The human design-quality rate is deliberately not a threshold here**: it is a launch gate rather than a confirmation-run metric, Human Test #1 established no pass/fail result, and Human Test #2 calibrates its own threshold (`spec.md §11.9`). The ≥ 70% figure in earlier revisions was provisional and never approved as settled.

**What these evals do not cover.** CO-01…CO-11 measure whether output is *legal* — schema,
structure, geometry, diversity, directive compliance. None measures whether it is *right* for the
event the host described, and CO-10 cannot: unlabeled grayscale sheets remove the brief and the
palette by construction. This document's own goal statement — "faithful user-intent capture" (§0) —
is therefore asserted and not tested, and theme fidelity is first judged at Phase 10, the launch
gate. `product-doctrine.md §3` explains why that gap is the expensive one. **§4.5 now defines the
evaluation that closes it**, over `docs/model-evals/creative-understanding.json`; what remains is a
runner, not a definition, and the Phase 4 exit criterion depends on it.

Thresholds are those of `proof-b/RESULTS.md` and `proof-b/FINAL.md`; rerun them whenever prompt, schema, primitive set, compiler, renderer rules or planner change.

---

# 7. Prompt-injection boundary

As Revision 1 §15, plus: the composition response is a tree of enums; the application never renders a string from it. Free text in any field is a schema failure. Model prose is never authorization.

---

# 8. Retry and fallback policy

| Call | Provider failure | Invalid structured output | Compatibility problem |
| --- | --- | --- | --- |
| Event Identity | ordinary transient retry | one repair retry, then fail visibly | — |
| DesignIntent | ordinary transient retry | one repair retry, then fail visibly | deterministic repair, logged |
| Composition | ordinary transient retry | one repair re-prompt, then library fallback for the page | deterministic repair, logged; collision or token-cap → one re-prompt, then library |

A library fallback is a valid, coherent page and is recorded as such; it is never presented as a model composition in evaluation.

---

# 9. Files

Prompts: `model-prompts/event-identity.system.md`, `model-prompts/design-intent.system.md`, `model-prompts/composition.system.md`.  
Schemas: `model-schemas/event-identity.schema.json`, `model-schemas/design-intent.schema.json`, `model-schemas/composition.schema.json` (generated).  
Reference implementation of the validator, repair, planner and signature: `proof-b/` until the production package replaces it.
