# Phase 4A process notes

Things that happened during Phase 4A which affect how its evidence should be read. Kept beside
the baseline evidence because a reader evaluating the claims needs them, and because a record
that only contains the tidy parts is not a record.

## Evidence classes, named precisely

| Set | What it is | What it can support |
| --- | --- | --- |
| `creative-understanding.json` — the original 14 | **Regression suite.** Every output has been inspected and discussed in the qualitative review | Catching regressions. Never fresh evidence again |
| `creative-understanding-holdout.json` — 12 cases | **Pre-registered validation set.** Authored and frozen before the remediation, and independently reviewed for fairness — but authored by the same person who then wrote prompt v4, with knowledge of the cases | Validation against pre-registered invariants. **Not** the strongest evidence of generalization |
| *(pending)* sealed challenge corpus | **Sealed challenge.** Authored independently, not seen while prompt v4 was written | Generalization. The final check |

The middle row is the one most easily overstated. The file was frozen before implementation and
reviewed four times for leakage and decidability, which is real discipline — but the prompt author
had read every case, and the production prompt is deliberately scanned against the set. That makes
it a legitimate pre-registered validation set and nothing stronger. The sealed challenge exists
because of exactly this gap.

### One freshness caveat inside the validation set

**HO-11's "grown up, nothing babyish" is semantically close to the regression suite's "cute but
not childish".** The wrapper is genuinely new — a name, a relationship, the constraint in the
honoree's own voice, and the honoree-context assertions that ride on it — and the case remains
the sharpest test in the set for constraint authority and honoree coverage. But that specific
semantic axis is not novel evidence and must not be presented as such.

## An accidental model run occurred, and its output was discarded

During the remediation, a real fourteen-case run executed against the **regression suite** by
accident: the eval runner defaulted to that set, `--project eval` was invoked as part of checking
that the runner's new plumbing type-checked, and an API key was present in the environment.

- It ran against a **half-finished** `v4` implementation — after the contract and prompt changes
  but **before** the required proof tests and before any independent engineering review.
- **Its outputs were never inspected.** The directory was deleted without any file being opened.
- **Its evidence is discarded and is not used in any evaluation claim**, and it is not recreated
  or recovered.
- The immutable baseline under `creative-understanding-v1/` was not touched; it was verified
  byte-identical afterwards.

It used the already-known regression corpus rather than the validation set, so no
pre-registered case was spent.

Two changes followed so it cannot recur:

1. **`EVAL_SET` has no default.** A bare `vitest run --project eval` now refuses with an error
   naming the two scripts. Naming the set is how you say you meant it.
2. **The runner derives its output directory from the set and hard-refuses the baseline path**,
   so no run can overwrite immutable evidence in place — a hazard the validation-set review had
   flagged before this happened.

## Benchmark leakage was caught four times in the production prompt

Recorded because the pattern matters more than any individual instance: each was introduced
while working on something else, and twice while actively fixing a different leak.

1. **`v2`'s worked example was Ralph Lauren** — the same reference two regression cases test,
   with close to the answer they expect. Replaced with Bauhaus when `v3` was written.
2. **Writing `v3`'s new sections introduced five fresh leaks**: CU-11's `1pm` with its documented
   failure mode, CU-11's date, CU-12's venue, CU-10's grading sentence verbatim, CU-04's phrasing
   and CU-13's motif. Caught by independent review, not by the author.
3. **Writing `v4`'s new sections introduced three more** — CU-05's prompt, CU-08's prompt and
   HO-03's phrase — all inside worked examples added *while removing the previous leaks*. Caught
   by an automated scan added at that moment, which also found two leaks inherited from `v2`
   that predate the corpora.

4. **Writing `v4`'s honoree rule leaked HO-11's prompt *and* its gating answer** — "our
   daughter Noa" yielding `honoreeName: "Noa"` and `honoreeDescriptionText: "our daughter"` —
   into both the prompt and, through the field description, the wire schema. The model would
   have been shown the answer twice to the only mechanical assertion of that field's central
   behaviour. Caught by independent review. The same review found regression-case subject
   matter reused as worked examples in the new §7 and §9.

**A correction to this document.** An earlier version of this section stated that an automated
scan "now runs". That was false when written: the scan existed only as an ad-hoc shell command
run once, and no such file was in the repository — which is why leak 4 survived. A control
asserted in immutable evidence and absent from the tree is worse than no control, because it
stops anyone looking. The scan now exists as `src/lib/ai/evals/prompt-leakage.test.ts`, runs in
the ordinary unit suite, and checks the prompt **and the wire schema** against full prompts,
distinctive spans, probes, host phrases, expected answers and case notes.

Two further inherited leaks were found by *reading*, not by the scan, and both were invisible
to it by construction: `"for our son"` (11 characters, below the scan's distinctive-span floor)
illustrating CU-11's own honoree assertion, and `"minimal equestrian linework"` as a motif
example, which is close to CU-01's expected translation. Both are now replaced. They are the
clearest argument for the read-not-scan control.

It is necessary and not sufficient: it catches literal reuse and cannot catch a near-paraphrase
or a case-specific instruction dressed as a general principle — both of which have occurred —
which is why the independent engineering review is required to inspect benchmark integrity by
reading rather than by trusting the scanner.

## No model calls after the discarded run

From the deletion of the accidental run until the remediation is frozen and reviewed, no model
call is made — not the regression suite, not the validation set, nothing. The next run happens
only after the freeze SHA is recorded.
