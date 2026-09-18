# The first Gemini v3 half is invalidated whole

**What this is:** an invalidated **half** of the v3 sealed challenge. It is not a corpus, not a
failed final corpus, and not model evidence. No DesignIntent provider call was ever made against
it; no eval was ever run; it never reached the system-aware fairness review.

**What is invalidated:** the whole six-case half, `DIC3-M01`–`DIC3-M06`, in every round it passed
through.

| file | role | sha256 | bytes |
| --- | --- | --- | --- |
| `01-original.json` | original raw half | `7d7587069a20fc333bb813328a39acdf5ec02dd72dd639490c8c167f6ec3ead7` | 15,842 |
| `02-contract-correction.json` | contract-correction round | `c3e400ac31f7e9786e5091ddde3b9de62f686ecbaaed46670cebf86c5923d8ba` | 15,926 |
| `03-final-candidate.json` | candidate before leakage correction | `56ad64b072900428603b0b4f545db8118549e3c4d81705573c86c630ed5373d2` | 15,739 |
| `04-leakage-correction.json` | **the invalidated candidate** | `89fc79fba1afe4471f977d750eead96fcc57961c0e3d807766d63211be2b88c2` | 15,743 |

Preserved exactly as authored. Not deleted, not amended, not relabelled, and never reused as
evidence of anything.

## Why

The independent semantic premise-overlap review — `review/01-semantic-premise-overlap-review.md`,
sha256 `650713803d9d12edc5544fabf1e4d07caa41a9e0ba3592670652b05119abca9a` — returned ACTION
REQUIRED on the assembled twelve, with three findings classed substantive. On the reviewer's own
reading, **three of this half's six cases** require substantive action: two re-pose a device or
premise a readable prior corpus already teaches, and one duplicates a brief the other half
independently wrote.

The precommitted repair policy decides the rest, and it is applied exactly as frozen: one isolated
case with a severable problem is reported and stopped on; **multiple cases in one half requiring
re-premising invalidates that half whole.** So no case here was repaired individually, nothing was
cherry-picked, and the author was not coached case by case into a bespoke benchmark. That rule
exists because the alternative — keeping the cases that happened to survive and patching the rest —
is how a corpus stops being a sample and starts being a construction.

**The review found no copying.** No reused venue names, no distinctive phrase reuse, and two
visibly distinct prose hands. What it found was convergence on the same unusual devices. That is a
harder problem than misconduct and it is nobody's fault here, which is worth stating plainly in a
record that will outlive the context.

## The replacement

A **new fresh Gemini session**, as preregistered. The half is accepted whole or rejected whole;
old and new Gemini cases are never mixed.

**The namespace does not move.** `DIC3-M01`–`DIC3-M06` identify the six preregistered Gemini
*slots*, not the prose that previously occupied them. The mixed-author protocol is not amended to
mint a new namespace merely because a preregistered half was recommissioned — the protocol module
stays byte-identical to its freeze.

The replacement author receives **only the same frozen external-author packet** used for the first
Gemini commission. It receives none of: the old Gemini half, the ChatGPT half, the failed assembly,
the semantic-review report, any case-specific overlap finding, any prior or invalidated corpus, any
prompt, provider, schema or implementation, any known failure, or any statement of a desired
outcome.

**The packet is not amended with an avoid-list, and this is the part most likely to be got wrong by
someone acting in good faith.** No "avoid conservatories", no "avoid bookbinding", no "avoid
ceramics", no "avoid botanical events", no "avoid archival devices", and nothing equivalent however
it is phrased. Every one of those would coach the benchmark against cases the author must not know
exist, which converts a sealed challenge into a construction aimed at known answers — the precise
failure the whole protocol is built to prevent. A corpus that avoids what we already found is not
evidence that the system generalizes; it is evidence that we edited the test.

## What the replacement must satisfy

Unchanged from the freeze: exactly six cases; the exact `DIC3-M` namespace; exactly one within-half
same-`eventType` pair across five distinct types; the same structural and expressive-surface
contract.

Then, in order: mechanical and leakage checks; independent semantic review comparing the
replacement six against the surviving ChatGPT half, the earlier programme corpora, both earlier
invalidated sealed challenges, **and this invalidated half** — the reviewer may see all of those,
the author none of them. Including this half in that comparison is the point: it is how we find out
whether a fresh Gemini session simply regenerates substantially the same premises and devices, which
is the question the second candidate's invalidation left open.

Ordinary vocabulary overlap remains diagnostic only. If semantic review again finds multiple
substantive cases requiring re-premising, that is a stop-and-escalate, not the start of iterative
case-by-case coaching.
