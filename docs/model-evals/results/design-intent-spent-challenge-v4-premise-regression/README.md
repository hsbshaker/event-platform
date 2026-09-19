# Spent-challenge re-run — DesignIntent sibling convergence

**Evidence class: KNOWN / SPENT CHALLENGE RE-RUN. Not fresh generalization evidence.**

The twelve DIC4 cases were run once before, at T22, against `design_intent_v5`. That run and
all thirty-six of its failures were known while the concept-premise remediation was designed
and written. This directory therefore answers exactly one question — *did the known
convergence failure improve?* — and answers nothing about whether the remediated stage
generalizes to an event it has not seen. Reading it as fresh evidence is the mistake this
paragraph exists to prevent.

The first run's evidence at `docs/model-evals/results/design-intent-sealed-challenge-v4` is
immutable and was not touched; it was verified byte-identical before and after this run.

## What ran

- Command: `npm run eval:design-intent-spent-challenge` (`EVAL_SET=designIntentSpentChallenge`)
- Commit: `6825b3ffcd3d70d559bbfc90979aa23056f01a9d`, clean tree
- Started `2026-09-19T00:47:27Z`, ended `2026-09-19T01:04:50Z`
- Stages: `concept_premise_v1` (one call per batch) then `design_intent_v6` (three per batch)

## Files

| File | What it is |
| --- | --- |
| `mechanical-report.md` | the harness's own per-batch check results |
| `raw-responses.jsonl` | 36 DesignIntent responses with their transmitted input and telemetry |
| `concept-premise-telemetry.jsonl` | 12 premise-call telemetry records, one per batch |
| `review/reviewer-packet.md` | instructions for an independent blind reviewer |
| `review/blind-review.md` | the blinded artifact a reviewer would read |

`concept-premise-telemetry.jsonl` is captured from the run's stdout rather than written by the
harness. The eval harness is hash-frozen and predates the premise stage, so it records only the
DesignIntent calls; without this file the premise call's usage, retries and set measurements
would not survive the run.

**No blind review has been performed on this run.** `review/` holds the packet and the
artifact, which are inputs to a review, not its result. The qualitative half of the T22
comparison is therefore still open.
