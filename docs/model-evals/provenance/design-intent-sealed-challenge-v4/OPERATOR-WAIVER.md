# OPERATOR WAIVER — v4 semantic-overlap findings carried forward

**Status: binding. This document governs how v4 evidence may be described.**

The operator has, explicitly and on the record, declined to repair, replace, recommission or
re-premise the four cases the independent semantic premise/device-overlap review returned as
`ACTION REQUIRED`, and has waived semantic overlap as a blocking gate for this corpus.

This is a deliberate loosening of evidence integrity in exchange for moving forward. It is recorded
here rather than absorbed, because the thing a waiver costs is the thing a later reader most needs
to know.

---

## 1. The evidence class, in the operator's own words

v4 **must not** be described as pristine sealed generalization evidence, nor as having passed every
preregistered corpus-integrity gate. Its class is:

> `DIAGNOSTIC / STRESS-TEST CHALLENGE — authored after implementation freeze, mechanically`
> `validated, leakage-clean and Stage-2-faithfulness-clean, but carried forward with four known`
> `semantic-overlap findings under explicit operator waiver.`

Any report, changelog, commit message, gate summary or downstream claim that describes a v4 run as
sealed generalization evidence is wrong, and this document is the reason.

---

## 2. The findings being carried forward

Four cases are no longer clean independent challenge evidence. They are carried anyway.

| case | overlap | comparison |
| --- | --- | --- |
| `DIC4-Q02` | functionally the same design problem as `DIC4-Q05`, under the same `eventType` label, with the same device bundle and near-identical guidance and palette phrasing | `DIC4-Q05` (intra-corpus) |
| `DIC4-Q05` | the other half of that pair | `DIC4-Q02` (intra-corpus) |
| `DIC4-P03` | same solved creative problem across nine coinciding elements, including multilingual column parity and designed comment cards | `DIV2-08`, `docs/model-evals/design-intent-validation-v2.json`; compounded by `SC2-09` |
| `DIC4-P01` | materially the same premise and the same unusual human conflict — heirs divided over an inherited farm, design forbidden to take a side | `DSC-08`, `docs/model-evals/design-intent-sealed-challenge.json`; second precedent in `DIV2-07` |

Seven further comparisons are recorded as `DIAGNOSTIC` in the review.

**These findings are not to be hidden, downgraded, rewritten or relabelled.**

---

## 3. What this costs the §3.7 composition requirement

This is the consequence a reader is most likely to miss, so it is stated plainly.

The gated corpus must carry at least `SAME_EVENT_TYPE_PAIR_MINIMUM` (2) pairs of batches sharing an
event type — the check that the system does not template by event type. v4 carries **exactly two**,
the bare minimum:

- `DIC4-P01` / `DIC4-P02` — `"family reunion"`
- `DIC4-Q02` / `DIC4-Q05` — `"community potluck"`

The second pair is one of the `ACTION REQUIRED` findings. So one of the two pairs that satisfy the
composition requirement is a pair the semantic review found to be the same design problem twice.

That pair still measures something — whether three siblings differ, and whether two near-identical
briefs produce near-identical output — but it is **not** the discrimination test the requirement was
written to provide, which is whether the system distinguishes two *genuinely different* problems that
share a label. With one of the two pairs degraded, v4's same-type evidence rests substantially on
`DIC4-P01` / `DIC4-P02` alone.

Removing either case would drop the corpus below both the twelve-batch size and the two-pair
minimum, so the waiver and the assembly are the same decision: there is no version of this corpus
that keeps twelve batches, satisfies the gate, and drops the overlapping pair.

---

## 4. What was authorized, and what was not done

Authorized and performed:

1. This waiver, recorded in v4 provenance.
2. The semantic-overlap review preserved unchanged.
3. Assembly of the canonical twelve-case corpus from the two final Stage-2 artifacts.
4. Mechanical validation against the frozen corpus contract.
5. Freeze of digest, byte count, ordered ids and provenance.
6. Evidence-class marking.

Explicitly **not** done, by instruction:

- no case was repaired, replaced, recommissioned or re-premised;
- no Stage-1 situation card or Stage-2 case content was modified;
- neither author was contacted again;
- no system-aware fairness review was performed — it is waived as a prerequisite to running this
  diagnostic challenge, and its absence is part of why the class above is not "sealed";
- no DesignIntent provider call and no eval run were made.

Unchanged, by instruction: the DesignIntent prompt, wire schema, provider boundary, input assembly,
planner, validator, leakage scanner and gate implementation.

---

## 5. The frozen corpus

| | |
| --- | --- |
| path | `docs/model-evals/design-intent-sealed-challenge-v4.json` |
| version | `design_intent_sealed_challenge_v4` |
| sha256 | `7f0e90b6b4d8e4b6e1fb8e0771c85543648c6dec7cce27cb095a66d6e3cd7cd5` |
| bytes | `29526` |
| cases | 12 |

Ordered ids, in the one legal assembly order (half A, then half B):

```
DIC4-P01  DIC4-P02  DIC4-P03  DIC4-P04  DIC4-P05  DIC4-P06
DIC4-Q01  DIC4-Q02  DIC4-Q03  DIC4-Q04  DIC4-Q05  DIC4-Q06
```

Assembled from, and only from:

- `provenance/design-intent-sealed-challenge-v4/half-a/06-stage-2-eventidentity-cases-corrected.json`
- `provenance/design-intent-sealed-challenge-v4/half-b/06-stage-2-eventidentity-cases-faithfulness-corrected.json`

Each assembled case is byte-identical to its source object under `JSON.stringify`, asserted during
assembly rather than claimed; only `id`, `eventType` and `identity` are present, which is what the
sources carry. The `version` and the id order are read from
`src/lib/ai/evals/design-intent-challenge-v4-protocol.ts` rather than retyped, so the assembly
cannot drift from the frozen protocol.

The freeze is pinned by `src/lib/ai/evals/design-intent-challenge-v4-freeze.test.ts`, so "frozen"
is checkable rather than asserted. If it fails, do not update the constants — find out what changed
the corpus.

---

## 6. Validation result

`validateDesignIntentCorpusShape(corpus, { gated: true })` returns no problems. The full unit
project passes with one exception, recorded here rather than fixed:

`src/lib/ai/evals/design-intent-challenge-protocol.test.ts` — the **v3** authoring-protocol check —
still runs `checkAssembledSealedChallengeV3` against `corpusPath("designIntentChallenge")`, the slot
v4 now owns. It expects `DIC3-G*`/`DIC3-M*` ids and therefore fails against any v4 corpus. The v4
equivalent in `design-intent-challenge-v4-protocol.test.ts` passes in full.

This is a pre-existing latent defect, not a consequence of the assembly: both protocol tests point
at the same slot with mutually exclusive expectations, so the pair could never both pass once any
corpus landed. It was dormant only while the slot was empty. v3 is closed and invalidated
(`provenance/design-intent-sealed-challenge-v3/CLOSURE.md`), so the v3 check is the stale one.

**It has not been touched**, because the operator's instruction excludes changes to the gate
implementation, and repointing a protocol check is exactly that. It requires a separate decision.

---

## 7. Before this corpus is run

Two things are still false or unresolved, and both are blocking:

1. **`EVAL_SETS.designIntentChallenge.label` still claims sealed generalization evidence.** It reads
   *"SEALED CHALLENGE (4C DesignIntent) … It is the generalization evidence the §3.7 gate is applied
   to. One run, then spent"*, and the runner writes that label into the report. Running before it is
   corrected stamps the forbidden claim onto the evidence itself. Correcting it also requires the
   two assertions in `design-intent.test.ts` that pin its opening and its closing phrase.
2. **The stale v3 protocol check** in §6 leaves the unit project red.

Neither is authorized by this waiver.

---

## 8. Preserved unchanged

`review/07-semantic-premise-device-overlap-review.md` is the authoritative semantic-overlap record
and is preserved byte-for-byte as committed at `290576c`. It was produced without inspecting v4
source mapping, prompt, provider, input assembly, prior v4 diagnostics or any known model output,
and nothing in this waiver revises it. A waiver changes what the programme does about a finding; it
does not change the finding.

Acceptance criteria: N/A — no product behavior change. Benchmark integrity and evidence provenance.
`spec.md §32` guardrails on eval provenance; `docs/model-contracts.md §4.7`.
