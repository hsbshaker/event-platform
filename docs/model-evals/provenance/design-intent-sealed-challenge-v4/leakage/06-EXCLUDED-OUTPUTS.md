# The two preserved replacement outputs are EXCLUDED from the correction round

**The correction prompts were never sent.** The user has stated it plainly: neither author was
contacted, and neither of the replacement outputs preserved in this tree is a response to the frozen
correction procedure.

They are therefore **operator-supplied artifacts of unknown provenance with respect to this round**,
and they cannot satisfy it.

| artifact | sha256 |
| --- | --- |
| `half-a/05-leakage-correction-original-raw.txt` | `2c70dc974e7f121ff6a2f0b6561fbdd11f03ee102054a6e608ea44b6826fe4a2` |
| `half-b/04-leakage-correction-original-raw.json` | `4ca31b6d118fdac973bfe4ca868bd360c7efef8529afcbd682204bdd1eb2d379` |

## What follows from that

- **Not applied.** No value in either file is substituted into any case, now or later.
- **Not correction evidence.** Neither file demonstrates that any author replied to anything.
- **No inference of contact.** Nothing here establishes that either author saw a correction packet,
  because no correction packet was sent.
- **No influence on the new requests.** None of their proposed values may appear in, seed, bound,
  rank or steer either author request. A test asserts that none of the sixteen appears in either.
- **Not deleted, not rewritten.** They stay exactly as committed, at the digests above. Deleting the
  thing a correction cost is how a programme loses the ability to say what the correction cost.

## Why this is stricter than it may look

The obvious objection is that these values are perfectly ordinary and reusing them would harm
nothing. That objection is exactly the hazard.

A replacement that arrives from somewhere other than the author, and is then blessed because it
looks fine, makes the operator a co-author of the corpus — and it does so invisibly, because the
result is indistinguishable from an author's own answer. The whole v3 closure turned on refusing a
half that had *passed* review, on the ground that keeping what happened to look good is selection
after the fact. The same reasoning applies to sixteen adjectives.

So the exclusion is not a judgement that these values are bad. It is a refusal to let their quality
be the reason they survive.

## The chronology, for the record

1. `aa01382` — the frozen leakage scan gates on 28 hits from 16 single-word `toneKeywords`.
2. `6d5a5cf`, `7c368f9` — the two replacement outputs are committed. **Before any correction prompt
   was written, and before any author was contacted.**
3. `f52a2ca` — the correction procedure is frozen. Its title and body wrongly assert that no author
   had been contacted; at the time it was written the outputs already existed, though this session
   had not seen them.
4. `d88e6db` — `05-PROVENANCE-CORRECTION.md` records that error and the true timestamps.
5. **This file** — the user establishes that no author was ever contacted at all, which supersedes
   the reading in step 4. `05-PROVENANCE-CORRECTION.md` inferred from the timestamps that the
   authors had been contacted early. That inference was wrong in the other direction: they were
   never contacted. The outputs did not come from the authors under any procedure.
6. The controlled correction round begins **after** this record is committed, with the two requests
   in `07-` and `08-`.

## Status of the earlier packets

`03-half-a-correction-packet.md` and `04-half-b-correction-packet.md` were drafted by this session
and **never sent**. They are superseded by `07-half-a-correction-request.md` and
`08-half-b-correction-request.md`, whose wording the user specified exactly. The drafts are kept
because the record should show what was proposed as well as what was used.
