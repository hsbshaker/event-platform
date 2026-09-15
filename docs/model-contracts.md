# Model Contracts
## Event Identity, DesignIntent and Composition prompts and structured-output schemas

**Status:** Revision 2 — composition-language baseline  
**Prompt versions:** `event_identity_v2`, `design_intent_v4`, `composition_v1_p2`  
**Schema versions:** `event_identity_schema_v2`, `design_intent_schema_v4`, `composition_schema_v1`  
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
export const EVENT_IDENTITY_PROMPT_VERSION = "event_identity_v2"
export const EVENT_IDENTITY_SCHEMA_VERSION = "event_identity_schema_v2"
export const DESIGN_INTENT_PROMPT_VERSION  = "design_intent_v4"
export const DESIGN_INTENT_SCHEMA_VERSION  = "design_intent_schema_v4"
export const COMPOSITION_PROMPT_VERSION    = "composition_v1_p2"
export const COMPOSITION_SCHEMA_VERSION    = "composition_schema_v1"
export const PRIMITIVE_SET_VERSION         = "composition_v1"
export const COMPILER_VERSION              = "…"
```

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

### 4.1 The result envelope (`event_identity_schema_v4`, Phase 4A)

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
field marks this — the presence of a boundary-kind question is the signal. Phase 4A implements none
of this orchestration, which does not exist yet; it is a binding Phase 4B obligation recorded in
`development-plan.md`, along with the requirement that a clarification answer be carried as
first-class host input rather than concatenated into the original prompt.

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
| *(pending)* a new independently authored corpus | **sealed challenge** for `v5` — unseen while `v5` was written | generalization |

**A limit the go/no-go record must carry, not just the blind reviewer.** The clarification
check gates only against *over*-asking: `expectClarification: "no"` fails a question that
should not have been asked, and the other labels are advisory because whether a question
earned its place is a judgement. The baseline failure was *under*-asking — zero questions on
all fourteen cases. So a remediation that fixes authority correctly and still asks nothing
anywhere passes both sets mechanically, and only a human reading the briefs can see it. Do not
read a clean mechanical run as evidence on clarification.

The middle row is the one most easily overstated, and `results/creative-understanding-v1/process-notes.md`
records why, along with the one semantic axis inside it that is not novel.

**Where evidence and incidents live.** Every `results/*/` directory is immutable in full — the
machine evidence and the narrative files beside it. `process-notes.md` under
`creative-understanding-v1/` is a **frozen historical record**, not a current append target.
Operational incidents from here on are recorded only in `docs/model-evals/eval-incidents.md`,
which sits outside every protected directory and carries the rule those incidents produced:
**never execute the eval runner to verify the harness** — its paths, guards, schemas, reports and
refusals are verified by pure, unit and static checks, and a live eval command runs only after
explicit authorization for that exact evidence run.

**Runner:** `tests/eval/creative-understanding.eval.ts`, added in Phase 4A. The sets and their
evidence classes are defined once in `src/lib/ai/evals/corpus.ts`, which both this runner and the
leakage scan read, so they cannot disagree about which file a set means:

| script | `EVAL_SET` | corpus | output | evidence class |
| --- | --- | --- | --- | --- |
| `eval:regression` | `regression` | the original 14 | `…-v1-regression` | known cases; catches regressions only |
| `eval:holdout` | `holdout` | the 12 pre-registered | `…-holdout-v1` | validation against pre-registered invariants |
| `eval:spent-challenge` | `spentChallenge` | `sealed_challenge_v1` | `…-sealed-challenge-v1-v5-regression` | diagnostic rerun of known cases; **not** fresh |
| `eval:challenge2` | `challenge2` | `sealed_challenge_v2` *(not yet authored)* | `…-sealed-challenge-v2` | fresh generalization evidence for `v5` |
| ~~`eval:challenge`~~ | `challenge` | `sealed_challenge_v1` | *(refused)* | historical; its first run is the immutable evidence |

`eval:challenge` is kept and always refuses, naming the two paths that replace it, because the
command is still printed in this document's history and in operators' shells; deleting it would
turn a targeted refusal into a generic "unknown set".

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

**The sealed challenge path is wired before its cases exist, and stays that way.**
`EVAL_SET=challenge` names a corpus and an output directory fixed once and never since; when
`sealed_challenge_v1` was written the corpus file was deliberately absent, authored independently
after the implementation froze, and dropped in unchanged. The same arrangement is already in place for the
corpus a `v5` GO requires: `EVAL_SET=challenge2` names
`creative-understanding-sealed-challenge-v2.json` and its own output directory, wired before its
cases are known, so that corpus is added and nothing else moves. `EVAL_SET=spentChallenge` reruns
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

# 5. DesignIntent (design_intent_v4)

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

## 5.2 Input, assembly, narrowing, validation

As Revision 1 §9–§12 with `assignment.family` in place of `assignment.heroArchetype`, `family` narrowed to the assigned value, the compatible hierarchies narrowed by family (`invitation` excludes `monumental`; `statement` allows only `dramatic` and `monumental`), and typography pairings filtered by category and by whether they hold at the assigned hierarchy. The one-retry rule stands: one repair retry for structurally invalid output; no model calls for compatibility repair.

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
