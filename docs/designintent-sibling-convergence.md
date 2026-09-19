# DesignIntent sibling convergence — causal diagnosis and remediation

**Status:** implementation record for the T22 remediation. Diagnostic, then binding where it says so.
**Evidence:** `docs/model-evals/results/design-intent-sealed-challenge-v4/` — spent, immutable, never
rewritten by this work.

`docs/phase-4b-plan.md §E` reserved this decision in advance:

> **No convergence-triggered re-prompt exists in the first implementation.** Convergence and
> distinctness are first-class telemetry … if fresh evidence shows blind siblings converge despite
> planner separation, **that is a deliberate subsequent design and spec decision argued from data**,
> not a mechanism added on suspicion.

T22 is that data. This document is that argument. It is not a proposal to re-prompt on convergence —
§E's reservation is answered by adding a **missing stage**, not a critic.

---

## 1. What the evidence says, mechanically

Twelve batches, thirty-six DesignIntents, one provider call each, zero repair retries, zero transient
retries, `assignmentConformance` **pass** on all twelve.

| Check | Result |
| --- | --- |
| `paletteSeparation` | 12/12 fail |
| `compositionVectorDistinct` | 12/12 fail |
| `motifOverlap` | 11/12 fail |
| `typographyPairingDistinct` | 4/12 fail |
| `schemaValid`, `assignmentConformance`, `presentationPresent` | 12/12 pass |

The single most diagnostic number is not in the report's check list. Read off the thirty-six
responses directly:

- `composition.ornament` is **`restrained` in 36 of 36** outputs. Not once `none`, not once
  `decorative`.
- `composition.asymmetry` is `gentle` in 26 of 36.
- `linen` appears in 30 of 36 motif sets; `stripe` in 22 of 36.
- Within-batch duplicate concept names occur in **6 of 12** batches, including
  `Common Ground` returned by **all three** siblings of `DIC4-Q05` and by two siblings of `DIC4-P02`
  and `DIC4-P03`.

A dimension that takes one value in thirty-six independent draws is not a taste problem. It is a
stage that was never asked a question whose answer could differ.

The independent blind review agrees and adds the verbal half: 0/12 minimum-wowable, S1 (collapse
toward one house style), S2 (parameter variants, not creative worlds), S7 (brief restatement
replacing concept identity) and S8 (creative worlds recurring across events) all **PRESENT**, while
S3 (guidance promoted to host law) and S4 (host constraints eroded) are **ABSENT**. Faithfulness is
intact; distinctness is absent. That split is the whole diagnosis in one line, and it is why this
remediation must not buy distinctness with faithfulness.

---

## 2. What each sibling actually receives

`assembleDesignIntentUserMessage` (`src/lib/ai/openai/design-intent-input.ts`) builds exactly two
delimited blocks, and `generateDesignIntent` sends them under one system prompt:

| channel | per-sibling content |
| --- | --- |
| system prompt `design_intent_v5` | **identical** across all three siblings |
| `<<<CREATIVE_BRIEF` | all sixteen `EventIdentity` fields — **byte-identical** across all three siblings |
| `<<<ASSIGNMENT` | `family`, `tonalDirection`, `hierarchy`, `typographyCategory`, and the pairing list filtered to that category |

So the entire per-sibling input difference is **four enum values and a filtered list of two pairing
ids**, against a brief that runs to a few thousand characters of prose. And runtime narrowing
(`src/lib/ai/design-intent/narrowing.ts`) then removes three of those four from the model's control
entirely: the schema it answers against offers exactly one legal value for `family`,
`tonalDirection` and `composition.hierarchy`.

What the model actually *chooses* is: `palette` (3–5 colours plus a dominant), `typographyPairing`
(one of two), `density`, `composition.asymmetry`, `composition.rhythm`,
`composition.sectionContrast`, `composition.ornament`, `motifs` (0–3 of seven), and
`presentation.{name,description}`.

**None of those nine choices has any per-sibling input to condition on.** Each of the three calls is
asked the same question from the same brief and answers it independently. The observed convergence
is the arithmetically expected result, not a surprise.

---

## 3. What currently creates sibling differentiation — and what it cannot reach

`planConceptBatch` (`src/lib/generation/planner.ts`) is the only differentiating mechanism in the
system. It is a good one for what it does: seeded from the identity revision alone, it draws
`family`, `hierarchy`, `typographyCategory` and `tonalDirection` with `preferFree` so no sibling
takes a value another already holds, reports honest `SeparationFallback` telemetry when a pool is
exhausted or the brief locks tone, and additionally draws a `Directive` plus an attractive-token
allotment.

Two facts about it matter here.

1. **The directive and the allotment never reach this call.** `spec.md §7.7` sends them to the
   composition call, and `src/lib/ai/design-intent/input.ts` excludes them by type. So the eight
   directive dimensions the planner separates on — structure, opening, date treatment and the rest —
   do nothing at all for DesignIntent distinctness.
2. **Everything it assigns is a style coordinate, not a creative idea.** Its own header says so:
   *"The planner works over families, tones, typography categories, hierarchies and directive
   dimensions only."* `PlannedConcept` carries no semantic field, and it is a pure function with no
   model call, so it could not author one.

`CLAUDE.md §2` already names this exact insufficiency in its closing line — *"do not treat assigned
family/tone/hierarchy differences as sufficient creative diversity"* — and
`docs/product-doctrine.md §8` names the standard the assignment cannot meet: *"Mechanical
distinctness is necessary and not sufficient: three trees can differ structurally and still feel
like the same idea."*

The architecture was built believing four enum draws were enough. They are not, and the system had
no second mechanism.

---

## 4. Does any stage establish a distinct creative proposition before styling?

**No. There is no such stage anywhere in the pipeline.**

- `EventIdentity` answers *what does this host mean* — one authoritative interpretation, correctly
  shared by all three siblings.
- the deterministic planner answers *which style coordinates keep three concepts apart* — four enums.
- `DesignIntent ×3` answers *what is the best design for this brief in this family* — and there is
  one best answer to that question per `(brief, family)` pair.

Nothing asks *what is this concept **about**, and why is it a worthwhile alternative to the other
two?* `docs/product-doctrine.md §4` assigns the DesignIntent stage the question *"What are three
excellent and genuinely different ways a designer could express that identity?"* — a question about
a **set**, asked three times of three callers each of which can see only one member of it.

`presentation.description` looks like the missing field and is not. It is produced *after* the seven
design fields, is described in the contract as *"how the concept feels, in host-facing language"*,
and is never read by anything. It is a caption for a decision, not the decision. With no concept-level
premise to caption, the only material available to it is the brief's own thesis — so restating the
brief is the **correct** response to the instruction as written. Blind-review pattern S7 is a missing
input, not weak wording.

---

## 5. Why palette, composition, motif and card convergence is predicted, not merely possible

Five mechanisms, each sufficient on its own, and they compound.

**5.1 The prompt instructs independent optimization.** `design_intent_v5 §1`:

> Two other concepts are being produced from the same brief at the same moment, each blind to the
> others. Do not guess at them, do not compensate for them, and do not hold an idea back for them.
> **Make this one as good as it can be.**

Three independent argmax over one objective is one answer three times. This sentence is not the root
cause — the missing stage is — but it closes the model's last remaining route to self-diversifying,
and it must go.

**5.2 The prompt asserts that the assignment is sufficient.** `design_intent_v5 §4`: *"These four are
how three concepts for one event are held genuinely apart."* The stage was told the diversity problem
was already solved upstream.

**5.3 Every free dimension has a single safest answer, and nothing distinguishes the three asks.**
`§10` tells the model to prefer one or two motifs, never to choose one merely because it is available,
and that zero is a considered answer; `§9` calls density "a real creative lever, not a tie-breaker".
Under a brief with no concept-level premise, `ornament: restrained`, `asymmetry: gentle` and
`motifs: [linen, …]` are the defensible middle of the distribution every time. 36/36 on `ornament` is
what that looks like.

**5.4 No stage ever sees two siblings at once.** `validate.ts` validates one response against one
assignment. `settleBatch` counts successes. `generateDesignIntent` is the only caller-visible unit,
and it takes one sibling. **Production has no set-level stage at all** — the three DesignIntent calls
are today made only by the eval harness, which fans out per sibling. There is no code path where
three concept cards could have been compared.

**5.5 The one set-level control canon already requires is unimplemented.** `spec.md §7.8` and
`docs/model-contracts.md §21`: *"If it is missing, invalid, or **duplicates another concept's name**,
a deterministic fallback name is derived."* `validate.ts` reports what was wrong with a single
`presentation` and its header says deriving the fallback "is the compiler's" — and no module derives
it. That is exactly why `Common Ground` could be returned three times in one batch and reach a blind
reviewer as three concept cards.

S8 (worlds recurring across events) has the same root: with no concept-level premise, the model falls
back on its own event-type priors, which is how `Field Ready` and `Common Ground` recur across
unrelated cases.

---

## 6. What this diagnosis does **not** claim

- **It is not a model-capability finding.** Nothing in the evidence shows the model cannot author
  distinct creative worlds; it shows it was never asked to author a set of them. Migrating models is
  not indicated.
- **It is not an EventIdentity finding.** S3 and S4 are ABSENT and the Stage-2 faithfulness review
  was clean. The identities were faithful. The failure is downstream.
- **It is not a vocabulary finding.** `linen` and `stripe` recurring is a symptom of undifferentiated
  asks, not proof that seven motifs are too few. The bounded vocabularies stay as they are until a
  remediated stage demonstrably cannot express a valid premise within them — recorded then, with
  evidence, as a separate limitation.
- **It is not a mechanical-threshold finding.** ΔE floors and composition-vector counts are the
  instruments that detected the problem. They are not the objective. A set can clear every floor and
  still be three costumes on one idea, which is why the remediation is judged on premise distinctness
  and card honesty, and the floors are read afterwards as corroboration.

---

## 7. The smallest coherent intervention

Add the stage that does not exist, and the set-level control canon already asked for.

```text
EventIdentity  (one authoritative understanding, unchanged, shared by all three)
  → deterministic sibling planner        unchanged: four style coordinates + directive + allotment
  → ConceptPremise ×3, authored AS A SET  NEW: one model call per batch
      → deterministic premise validation: grounded, distinct, inventing nothing   NEW
      → at most one bounded repair of the set                                     NEW
  → bind premise[k] to planned sibling k                                          NEW, deterministic
  → DesignIntent ×3, in parallel, each blind to the other two outputs
      each receives: the same brief + its own assignment + its own premise         CHANGED: third channel
  → deterministic set review over the three returned concepts                      NEW
      duplicate/near-duplicate cards → spec.md §7.8's deterministic fallback
      identical design vectors, motif collapse → logged deviations + telemetry
      never a convergence re-prompt (spec.md §32)
```

**Why the premise set needs a model call, and why a deterministic premise planner was rejected.** A
deterministic planner can only select from a fixed catalogue of lenses. Two consequences are
disqualifying. It cannot know whether a lens is *supported by this identity* — forcing "foreground the
place" onto an identity that says nothing about place manufactures meaning, which is the one failure
mode this remediation may not introduce (`§9` below). And a catalogue of creative lenses selected by
identifier is the template system `CLAUDE.md §5.1` exists to prevent, one stage earlier. Selecting
emphasis *from the identity's own content* requires reading the identity's prose, which is model work.

**Why one call and not three.** A premise authored blind to its siblings converges for precisely the
reason the design fields converge — the failure this document diagnoses. Authored as a set, the
planner knows what the other two choices are and can make them complementary on purpose. One call per
batch is the minimum that buys set-awareness.

**Why not fold the premise into the DesignIntent call.** Same reason: three blind calls each stating
an organizing idea gives three organizing ideas chosen independently, and nothing can compare them
before the design is paid for.

**Why no second added model call, and no critic loop.** The bounded repair sits at the premise stage,
where the output is short and the decision belongs. The DesignIntent stage keeps exactly the repair
policy canon gives it — one pass for schema-invalid output — and gains **no** convergence re-prompt:
`spec.md §32` requires structural, coverage and diversity defects to be repaired deterministically
and logged, and `§E`'s reservation is answered by the new stage rather than by a critic. One new
bounded repair layer in total.

**Model calls per batch: 3 → 4.** Latency: one short serial call ahead of three parallel ones. Both are
stated, priced and bounded in `src/lib/generation/concept-premise-cost.ts`; neither is hidden.

---

## 8. Binding: one authoritative understanding, three worthwhile choices

These are requirements on the remediated stage, not observations.

1. All three siblings receive the **same** `AuthoritativeIdentity`, byte-identical, as they do today.
   The premise stage reads it and never rewrites it; no sibling receives a modified brief.
2. A `ConceptPremise` may **select emphasis** from content already in the identity, and may **infer
   creative expression** from it.
3. A `ConceptPremise` may **not** introduce a host fact, a relationship, a conflict, a motive, a
   constraint or an emotional stake that the identity does not carry, and may not resolve a tension
   the identity leaves open. Each premise carries its own `grounding`, and the deterministic validator
   refuses a premise that does not.
4. `hostConstraints` remain authoritative for all three siblings, unchanged and uncontradicted.
   `creativeGuidance` remains advisory for all three.
5. `family`, `tonalDirection` and `composition.hierarchy` remain **planner-owned**. The premise does
   not choose them, does not see them, and cannot override them.
6. Typography stays inside the assigned category's curated pairings; motifs stay inside the seven
   curated ids. The premise directs; the DesignIntent call still chooses within the bounded
   vocabulary, and narrowing still makes an out-of-assignment answer impossible.
7. Diversity never outranks correctness. One correct concept plus two imaginative unsupported ones is
   a worse system than the one this replaces.

---

## 9. What the premise varies, so that varying it invents nothing

The premise carries prose — what it foregrounds, its organizing idea, the experience it should
create, why it is a meaningful alternative, and the design consequences that follow — plus three
**register** axes:

| axis | values | what it is |
| --- | --- | --- |
| `pace` | `unhurried` · `measured` · `propulsive` | how quickly the page moves through the event |
| `presence` | `quiet` · `poised` · `commanding` | how much room the concept takes up |
| `surfaceRichness` | `bare` · `considered` · `layered` | how much the surfaces themselves carry |

They are deliberately **not** the DesignIntent enums, and the DesignIntent call still chooses
`density`, `asymmetry`, `rhythm`, `sectionContrast`, `ornament` and `motifs` itself. Their job is to
make "these three are experientially different" a checkable claim rather than an aspiration, which is
what `ornament: restrained` 36/36 shows the system needs.

They are safe to require variation on because **they describe the design's register, not the event's
facts**. A memorial may legitimately be rendered `bare` or `considered`; neither is a claim about the
host's situation, so requiring the set to separate on one axis cannot manufacture meaning. This is the
distinction that lets set-level separation be gating without putting faithfulness at risk — and it is
why the gating rule is stated over the register axes and never over palette distance.

The gating rule is: **at least one axis takes three distinct values across the set**, and any axis the
set declares constrained carries its own grounding. That is one honest requirement, with the
constrained-axis escape recorded in telemetry exactly as the planner already records `tone-locked`.

---

## 10. What this costs

| | before | after |
| --- | --- | --- |
| provider calls per concept batch | 3 | **4** (one premise call, then three in parallel) |
| where the premise stage is reachable | the eval seam only | **the production path** (`concept-batch.ts`) |
| batch latency | ≈ one DesignIntent call | ≈ one premise call **then** one DesignIntent call |
| worst-case batch spend, `gpt-5.6-sol` | $36.00 | **$48.00** (`conceptBatchMaxUsd`) |
| repair passes available per batch | 3 (one per sibling, schema only) | 3 + **1** (the premise set, once, all classes) |
| DesignIntent instruction file | ~12 KB (`design_intent_v5`) | ~16 KB (`design_intent_v6`) |
| DesignIntent worst request input bound | 83,500 tokens | 97,500 tokens |

The premise call is serial ahead of the three, so it is a real addition to the host's wait rather
than a hidden one. Its output is short — three premises of bounded prose — and the reasoning effort
is pinned `high` because this is the stage that decides what three worthwhile choices are.

Every number above is derived in `src/lib/generation/concept-premise-cost.ts` from the request's own
shape, not estimated: the instruction file is measured on disk, the user message is rebuilt from the
identity contract's maxima, and the attempt count is read from the boundary's constants.
`conceptBatchMaxUsd` exists so the end-to-end figure is a value something can read rather than a
claim in a document.

## 11. Known limitations

1. **The premise call's telemetry is not in the eval evidence.** The 4C harness is hashed byte for
   byte and its `DesignIntentTelemetry` has no field for a second call's usage. The adapter writes
   one parseable line per batch to stdout (`PREMISE_TELEMETRY_PREFIX`), so a run captured with `tee`
   has the call count, latency, token use and retries — but the mechanical report will not. This is
   a limitation, not a solution.
2. **A refused premise set costs a host a batch.** `policy.ts` argues why that is better than a
   silent reversion to premise-free calls, and the thresholds are set to catch collapse rather than
   adjacency, but the cost is real. `spec.md §7.9`'s `Try another direction` is the route out.
3. **Fidelity checking is bounded by what prose makes decidable.** `assertedSpecifics` catches a
   number or a mid-sentence proper noun the brief does not carry; it does not catch an invented
   common-noun detail ("the orchard") or a specific spelled out in words. The excluded-colour check
   matches an exclusion literally and cannot decide near neighbours. The reviewer keeps the
   judgement on unsupported narrative, exactly as `docs/phase-4b-plan.md §3.3` places it.
4. **"Premise visibly expressed" is advisory and stays advisory.** The register names a character and
   the DesignIntent owns the translation, so there is no single correct mapping to check. The set
   review reports only the case that is never expression — an extreme register answered with the
   middle of every dimension it bears on.
5. **Two axis words were chosen around the frozen corpora.** `unhurried` and `quiet` were the first
   drafts of the low end of `pace` and `presence`; both appear as author-written tone keywords in a
   frozen corpus, so both would have put benchmark input into the prompt. `§3.5` resolves a collision
   at the corpus, which was impossible here, so the vocabulary moved to `lingering` and
   `understated`. Recorded in `concept-premise/contract.ts` so a later reader does not "improve" one
   straight back into a leak.
6. ~~**No production batch orchestrator exists yet.**~~ **Closed.** This was the gap that made the
   remediation a capability rather than a product change, and `src/lib/generation/concept-batch.ts`
   closes it: a batch now runs end to end on the production path — identity, plan, one premise call,
   bind by index, three parallel DesignIntent calls, the set review, immutable artifacts with the
   premise that produced them, settle. What remains unwritten is downstream of 4C and always was:
   the composition call and the `design_concepts` row it produces are Phase 4D, so the artifact is
   still the end of this path, and no UI surface calls the orchestrator yet.
7. **The bounded vocabularies were not expanded, deliberately.** `linen` and `stripe` recurring is a
   symptom of undifferentiated asks. If a remediated stage demonstrably cannot express a valid
   premise within seven motifs and twelve pairings, that is a separate limitation to record with
   evidence — not a reason to widen a catalogue first.

## 12. The rerun, and what it may and may not be called

The spent T22 cases are wired as their own eval set, pointing at a **new** output directory. The
first run's evidence is immutable and is refused as an output by `isProtectedOutput`.

```
npm run eval:design-intent-spent-challenge
```

It costs 12 premise calls plus 36 DesignIntent calls against a live provider, and it requires
`OPENAI_API_KEY`, which is deliberately absent from agent sessions. **It must not be run without
explicit authorization.**

What it can establish: whether the known convergence failure improved — the mechanical checks, the
repeated names and descriptions, and the premise telemetry, compared against
`docs/model-evals/results/design-intent-sealed-challenge-v4/`.

What it can never establish: that the remediated stage generalizes. These twelve cases and all
thirty-six of their failures were known while this was designed and written. Fresh evidence needs a
corpus authored by an independent process that has seen neither the cases nor this implementation,
and a fresh blind review that receives only the reviewer packet and the blind artifact — no
implementation details, no T22 results, no prior judgements, no expected outcome. The final question
is unchanged: **are these three worthwhile creative choices grounded in one correct understanding of
the event?**
