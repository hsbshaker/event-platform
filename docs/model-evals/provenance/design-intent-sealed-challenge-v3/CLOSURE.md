# v3 is closed and invalidated as an authoring programme

Closed **before any DesignIntent provider call**, after three sealed-challenge corpora in a row were
disqualified. Everything in this directory is preserved exactly as evidence: every authoring round,
every candidate, both semantic reviews, the invalidation record and the failed assembly. Nothing
here is deleted, amended, relabelled or reused.

## What is closed

| | |
| --- | --- |
| first Gemini half | invalidated whole — `gemini/INVALIDATION.md` |
| replacement Gemini half | invalidated — `review/02-semantic-premise-overlap-review-replacement.md` |
| surviving ChatGPT half | **passed both reviews, and is still not carried forward** |
| assembled twelve-case corpus | `assembly/01-assembled-pre-semantic-review.json`, failed semantic review |

**No v4 case may reuse any v3 case, in whole or in part.**

## Why the half that passed is not kept

This is the decision worth explaining, because it throws away work that survived review. The
ChatGPT half passed mechanical validation, the frozen leakage scan and two independent semantic
reviews, and both reviewers volunteered that it was the stronger half.

It is still discarded, because **retaining it while swapping only the failed author family would
make the corpus adaptive to observed review outcomes**. A benchmark whose surviving half is the one
that happened to pass review is a benchmark assembled after seeing its own results — selection after
the fact, wearing a thriftier hat. That is the same defect as keeping the best six from a larger
pool, and this programme has already refused that twice under the same reasoning.

## What the failure is evidence about, and what it is not

**It is evidence about benchmark authoring distributions.** Three corpora, four authoring sessions
and two model families produced the same class of defect: a source asked for six hard cases returns
the six mood boards it always returns. The decisive observation is that a fresh, fully isolated
Gemini session — shown no prior corpus, no v3 case, no review finding, and deliberately no list of
subjects to avoid — reproduced a discarded half of its own almost slot for slot, including a
`moss green`/`aged brass` phrase pairing, an `Oak ___ Neighborhood Association` on a street
`& 4th Ave`, and a structured `avoidColors` token verbatim. One case asked for "professional
academic respect" for a maritime craftsman: template residue from a professor it never saw.

**It is not evidence about DesignIntent quality.** Recorded explicitly, because a later reader
skimming a directory full of invalidations could easily conclude the opposite:

- v3 never reached the system-aware fairness review — that review remains **unspent**;
- v3 never reached a DesignIntent provider call;
- v3 generated **zero paid model evidence**;
- no prompt, schema, provider, seam, planner, validator, gate, band, threshold or criterion moved at
  any point in v3.

Nothing about the model under test was measured here, because nothing was ever run. What was
measured was our ability to source an independent corpus, and that is a fact about us.

## The one thing v3 bought

The method change in v4. The reviewer who ended the replacement half named what was missing rather
than what was duplicated — no host with a reason, no rule that costs the design something, no
structural oddity — and that diagnosis is what produced premise-first authoring: the human situation
frozen before the design vocabulary is shown at all. Three invalidated corpora is an expensive way
to learn it, and it is cheaper than a paid run on a corpus that measures genre recognition.

## Preserved, and what may still be done with it

Every artifact here stays readable **for reviewers**, and specifically as comparison material: the
v4 semantic review compares the new halves against all of it, which is how we find out whether a
new source lands on this same ground. No v4 author sees any of it — not the cases, not the reviews,
not the fact that a subject was ever used. That asymmetry is the point.
