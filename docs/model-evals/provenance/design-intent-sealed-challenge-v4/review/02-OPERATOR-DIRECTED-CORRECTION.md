# Operator-directed Stage-2 faithfulness correction

One leaf, in one case, changed by operator direction in response to the independent Stage-2
faithfulness review. Nothing else in either half was touched.

## What changed

| | |
| --- | --- |
| Case | `DIC4-Q04` (half B, `birthday celebration`) |
| Path | `identity.hostConstraints` |
| From | `["no loud music"]` |
| To | `[]` |
| Authored by | **operator**, not the half's author |
| Reason | the independent Stage-2 faithfulness finding recorded in `review/01-stage-2-faithfulness-review.md` |

No other field, value, case, or half was altered. No prose was invented, rewritten or reworded
anywhere in either artifact — the correction removes a value, it does not replace one.

## Why

The frozen situation card `DIC4-Q04` states, in its `complication`:

> "The honoree has a strong dislike for loud music, which the nursing home staff typically use to
> liven up such events."

The shared Stage-2 semantic contract restricts `hostConstraints` to "an explicit **requirement,
prohibition or correction** already stated in the frozen card," kept verbatim or near-verbatim, and
says directly: "Do **not** convert a tension, a preference, an implication, an inferred need or a
creative recommendation into host authority."

A strong dislike is a preference. No one in the card issues a requirement or a prohibition about
music, and the card presents the dislike as one half of a live tension — the honoree's preference
against the staff's customary practice. The entry therefore created binding host authority the card
did not supply, which is the failure the contract names: "a downstream stage treats
`hostConstraints` as binding and `creativeGuidance` as advisory. A recommendation promoted into a
constraint becomes a rule nobody actually made."

The production contract states the same concern as the reason the field exists at all: it records
that in an earlier baseline run "about 39 of the 55 constraints it produced were the model's own
taste wearing host authority", and that `hostConstraints` is "AUTHORITATIVE, and narrow" while
`creativeGuidance` is where "your taste belongs — never in hostConstraints".

The contrast with the corpus's four other `hostConstraints` entries is what makes the line exact.
Each of those rests on a speech act in the card that creates a rule — `DIC4-Q01` "has **requested**
that no gifts be given", `DIC4-Q03` "a will that **specifies** no religious elements", `DIC4-P01` a
complication that itself says "**requiring** step-free access", `DIC4-P06` a session leader who
"**institutes** a strict no-device policy". "Has a strong dislike" is none of these. All four remain
untouched.

## Why it is a removal and not a rewrite

The contract states that `[]` "is common and correct", and five of the twelve cases already carry an
empty `hostConstraints`. The honoree's dislike remains fully present in the case as creative
material — `creativeDirection` already reads "prioritize lip-reading and intimacy over volume" and
`creativeGuidance` already carries the close-range and visual-noise direction — so removing the
binding entry restores the tension to the design conversation without removing the information. No
replacement value was authored, suggested or implied by the operator or by Claude.

This mirrors how the same case already handles the parallel judgment correctly: the honoree's
reliance on lip-reading is a stated *need* rather than a stated requirement, and it was never in
`hostConstraints`.

## Provenance and authorship

This correction is **operator-directed**. It is not authored, proposed, ranked or repaired by the
half's author, and it is not a model-authored value. No author was contacted for it and no
correction round was opened. It is recorded here rather than folded silently into the artifact
precisely because a corpus that cannot say who changed what has lost the property the sealed
challenge exists to protect.

The independent faithfulness review that produced the finding was conducted without inspecting
source, author or model provenance, prior diagnostic ledgers, leakage-correction history, excluded
correction outputs, or prior review findings, and was committed before this correction was
authorized.

## Artifact chain

| Role | Path | SHA-256 |
| --- | --- | --- |
| Pre-faithfulness-correction half B, preserved unchanged | `half-b/05-stage-2-eventidentity-cases-corrected.json` | `ee5a9b8040d90d1f5ac8ee94e20ceb0c8dc94817c2055f799a75176e2f8f8b51` |
| **Faithfulness-corrected half B (current)** | `half-b/06-stage-2-eventidentity-cases-faithfulness-corrected.json` | `3d05d1ccc03e953eb3dafb704ad93a56bed8a56e87b45737d8d6e4a6c56c523c` |
| Half A, unchanged | `half-a/06-stage-2-eventidentity-cases-corrected.json` | `9da421a9cde036b79f09f975a5957b48c7f18a24568810b5c20b4b56b5d0630d` |

The earlier half-B artifact is preserved rather than replaced in place, for the same reason every
prior round in this programme preserved what it superseded: an artifact that a gate acted on is
evidence, and the way a programme loses the ability to say what a correction cost is by overwriting
the thing it corrected. Both digests above for the pre-correction artifacts still match the pins
already frozen in `src/lib/ai/evals/design-intent-challenge-v4-leakage-correction.test.ts`, so that
suite is unaffected.

## Evidence

| Evidence | Path |
| --- | --- |
| Independent faithfulness review | `review/01-stage-2-faithfulness-review.md` |
| One-leaf-difference proof | `review/03-one-leaf-difference-proof.json` |
| Production-schema validation | `review/04-production-schema-validation.json` |
| Frozen leakage scan, post-correction | `review/05-post-correction-leakage-scan.json` |

**One-leaf proof.** Recursive deep comparison over every key, index, value and key order of the two
parsed documents, plus an independent flattened path-set cross-check and a per-case
canonical-serialization comparison. Exactly one difference:
`$.cases[3].identity.hostConstraints`, `["no loud music"] → []`. The other five half-B cases are
canonically identical, the `version` key is unchanged, and the case count is unchanged.

**Production schema.** All twelve cases in both halves validate against `eventIdentitySchema`
(`src/lib/ai/event-identity/contract.ts`) with zero issues. In that contract `hostConstraints` is
`z.array(z.string().trim().min(3).max(180)).max(10)` — bounded above, with no minimum length — so the
empty array is admitted by the existing production rule and no schema change was required or made.
Five of the twelve cases already carried `[]` before this correction and validate identically.

**Frozen leakage scan.** Run with the scanner unchanged: `leakageProbes` and
`MODEL_VISIBLE_SURFACES` imported from `src/lib/ai/evals/corpus.ts`, and the `fold` and `spans`
helpers and the three checks (verbatim / distinctive span / claim) copied verbatim from
`src/lib/ai/evals/prompt-leakage.test.ts`. No scanner rule, threshold, surface or probe definition
was added, removed, relaxed or edited for this round. Eight declared surfaces scanned, none absent,
**zero hits** on either half.

The probe counts corroborate the one-leaf claim independently of the diff. Half A is unchanged from
the previous clean scan (`leakage/18-final-clean-leakage-scan.json`): 26, 24, 24, 25, 24, 26. Half B
is unchanged at every case except `DIC4-Q04`, which falls from 21 to 20 — exactly one probe fewer,
the removed thirteen-character `hostConstraints` string, which cleared the scanner's six-character
floor and so had been a scanned value. Removing a probe can only reduce the scanned surface, never
enlarge it, so the scan could not have been made to pass by this change.

## Scope

Not done, and not authorized by this correction: no semantic-overlap review, no system-aware
fairness review, no canonical v4 corpus assembly, no DesignIntent run, no provider or eval call, no
change to any other case in either half, and no change to the scanner, the schema, or any frozen
test pin.

Acceptance criteria: N/A — no product behavior change. Evidence and corpus provenance only; touches
no runtime code, prompt, schema, compiler or renderer path.
