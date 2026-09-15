# Eval incident ledger

**Append-only. This is the only place future eval-process incidents are recorded.**

An incident here is anything that went wrong in *operating* the evaluation harness: a run that
should not have happened, evidence written where it should not have been, a control that turned
out not to control anything. It is not a place for findings about the model — those live in the
evidence directories and in the qualitative reviews.

## Where things live now

| | |
| --- | --- |
| `results/*/` — `run.json`, `mechanical-report.md`, `blind-review.md`, and `raw-responses.jsonl` for runs made after the journal existed; the v1 baseline predates it and has none | **Immutable in full**, narrative files included. The two directories holding completed runs — the Phase 4A baseline and the sealed-challenge v1 evidence — are refused as an output path by `PROTECTED_RESULT_DIRS` in `src/lib/ai/evals/corpus.ts`. The other result directories are not yet written; they are protected by the runner's write-once check, which `EVAL_OVERWRITE=1` can deliberately override |
| `results/creative-understanding-v1/process-notes.md` | **Frozen historical record.** It holds the Phase 4A evidence-class notes, the leakage history and the first three incidents as they were written at the time. It is no longer appended to and is not a current target for anything |
| `results/creative-understanding-v1/astra-qualitative-review.md` | Historical. The independent qualitative review of the Phase 4A baseline |
| **this file** | Every incident from here on |

The old `process-notes.md` was appended three times, and **corrected once in place** — the
correction is recorded in the file itself, where an earlier claim that a leakage scan "now runs"
turned out to have been false when written. Every account in it is accurate as it now stands. But
a file being edited inside a directory the code declares immutable is the repository stating one
rule and practising another, so the practice moved out rather than the rule bending. Facts
recorded there remain citable; the file is simply closed.

## The operational rule these incidents produced

> **Never execute the eval runner to verify the harness.** Not its paths, not its guards, not its
> schemas, not its reports, not its refusals. Every one of those properties is verified by pure,
> unit or static checks instead. A live eval command runs only after explicit authorization for
> that exact evidence run.

**Protecting a finished run is part of finishing it.** The moment an evidence run completes, its
directory joins `PROTECTED_RESULT_DIRS` — in the same change, not as a follow-up. Until it does,
that directory is guarded only by the write-once check, which `EVAL_OVERWRITE=1` overrides on
purpose, and the claim that a completed run's evidence is immutable outruns the code by exactly
that margin.

The runner is the one module in this repository that cannot be run to find anything out: importing
it with an API key present starts paying a provider. `src/lib/ai/evals/corpus.ts` and
`src/lib/ai/evals/harness-provenance.test.ts` exist to make the rule followable — the first holds
the rules as pure functions, the second asserts the runner's structure from its source text.

---

## Incident 1 — accidental regression run during the v4 remediation

*Originally recorded in `results/creative-understanding-v1/process-notes.md`.*

A real fourteen-case run executed against the **regression suite**. The runner defaulted to that
set, `--project eval` was invoked as part of checking that new plumbing type-checked, and an API
key was present in the environment.

- It ran against a **half-finished `v4`** — after the contract and prompt changes, before the
  required proof tests and before any independent review.
- **Outputs never inspected.** The directory was deleted without a file being opened.
- Discarded, used in no evaluation claim, not recreated.
- The immutable baseline was verified byte-identical afterwards.
- The already-known regression corpus, so no pre-registered case was spent.

**Fixes:** `EVAL_SET` lost its default, so a bare `vitest run --project eval` refuses; the runner
derives its output directory from the set and refuses the baseline path.

Neither fix prevented incident 2, because neither addressed its cause: both guard against running
the *wrong* set, and that run named the set it meant.

## Incident 2 — accidental regression run while verifying a corpus guard

During the harness pass that wired the sealed-challenge path, under an explicit instruction not to
run any evaluation.

The cause was a verification command, not the runner. A newly added corpus shape check lived
*inside* the eval runner, and the only apparent way to confirm it accepted the two real corpora was
to invoke the runner. `npm run eval:regression` was run expecting it to stop at the API-key check.
A key was present, so it did not stop.

- Killed roughly two minutes in, part-way through the corpus.
- **Outputs never inspected**; directory deleted unopened; discarded.
- Immutable baseline verified byte-identical.
- Again the regression suite, so again no pre-registered case was spent and the sealed challenge
  was untouched.

**Fix:** `validateCorpusShape` moved out of the runner into `src/lib/ai/evals/corpus.ts` as a pure
function with unit tests that run it against the real corpora. A guard on a hazard must be
checkable without triggering the hazard.

## Incident 3 — accidental spent-challenge run while verifying the new slots

During the pre-eval hardening pass that wired the fresh `challenge2` slot and the safe
`spentChallenge` rerun slot, `npm run eval:spent-challenge` was invoked to confirm the new guards
behaved — under an explicit instruction not to run that set. The guards passed correctly, and then
the run began calling the provider.

- Killed at about sixty seconds; partial output directory deleted without a file being opened.
- All protected evidence verified byte-identical.
- The already-spent `sealed_challenge_v1` cases, so no unseen case was consumed, and the fresh
  `challenge2` corpus — which does not exist — was untouched.

This was the same mistake as incident 2, one level out, and the second time it was made *while
verifying the very guard meant to prevent it*. Incident 2's fix moved a **rule** out of the runner.
The question this time was **wiring** — which corpus a set reads, where it writes, what it may
claim — which is equally checkable offline.

**Fix:** `src/lib/ai/evals/harness-provenance.test.ts` asserts every path, label and refusal from
the set definitions and the runner's source text, never by invoking it, including that the
corpus-existence guard precedes the API-key check. The generalisation is the operational rule at
the top of this file: nothing about the eval runner may be verified by running it.

**Deliberately not done:** no arming token, confirmation secret or two-key execution was added.
Three incidents were procedural failures, and the discipline stays procedural — the remedy is that
there is no longer any reason to run the thing to check it.
