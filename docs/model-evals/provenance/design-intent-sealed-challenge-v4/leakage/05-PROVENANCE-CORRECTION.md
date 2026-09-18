# Provenance correction — the correction-round freeze was not pre-contact

> **Superseded in one direction.** This file infers from the timestamps that both authors had
> already been contacted and had answered. That inference is wrong: the user has since established
> that **no author was ever contacted**, and the two preserved outputs are not responses to
> anything. `06-EXCLUDED-OUTPUTS.md` records that and excludes them. What stands below is the
> timestamp record and the fact that `f52a2ca`'s title is false; what does not stand is the reading
> that the authors had replied. The text is kept as written rather than edited.

`f52a2ca` is titled **"Freeze the v4 leakage-correction procedure before either author is
contacted"**, and its body states: *"Neither author has been contacted and no replacement wording
exists."*

**That claim is false**, and this file records it rather than hiding it. `f52a2ca` is not amended,
rebased or relabelled — the same treatment the `DIC3-` overstatement in `9da8010` received, and for
the same reason: a provenance record that edits away its own errors is not a provenance record.

## The actual ordering

All three commits branch from `aa01382`. They were written concurrently, by two parties who could
not see each other.

| commit | author | committed (UTC) | what |
| --- | --- | --- | --- |
| `6d5a5cf` | hsbshaker | 2026-09-18T19:00:02Z | preserves the half A correction response |
| `7c368f9` | hsbshaker | 2026-09-18T19:00:05Z | preserves the half B correction response |
| `f52a2ca` | Claude | 2026-09-18T19:00:14Z | freezes the correction procedure |

The two responses were committed **9 and 12 seconds before** the freeze. Both authors had therefore
already been contacted, and both had already answered, when the freeze commit was written.

## What is still true, and verifiable

The freeze was **not adaptive to the responses**. `f52a2ca`'s parent is `aa01382`; this session
never fetched between `aa01382` and that commit; neither response file was on disk, in the working
tree, or in this session's context when the module, the packets and the procedure were authored.
The targets were derived from the frozen scan result alone.

So the module and the packets are not reverse-engineered from what the authors happened to say. The
ordinary hazard of a post-hoc freeze — writing the rule to fit the answer — did not occur.

## What is not established, and is the material gap

**The two frozen packets are not evidence of what the authors actually received.**

`02-correction-procedure.md` item 2 says each author receives only its own affected case ids, the
exact affected keywords, the replacement instruction and the no-other-change instruction.
`03-half-a-correction-packet.md` and `04-half-b-correction-packet.md` implement that. But the
authors were contacted before those packets existed, so the packets are a **specification**, not a
record of what was sent.

Nothing in this repository establishes:

- what text either author was actually shown;
- whether either was told what the flagged values matched, or why;
- whether either saw the other half's material;
- whether either was given replacement wording, examples or suggestions.

Only the user can answer those. Until they do, the round's disclosure discipline is asserted and not
demonstrated, and this file is the place that says so.

## Status of the responses

Both are preserved verbatim and **neither has been applied**. Steps 6–9 (mechanical substitution,
the non-target identity proof, the re-scan) were not authorised by the ruling that produced
`f52a2ca`, which ended "record this correction procedure/provenance and return the commit SHA, then
STOP."

They were validated read-only against the frozen `checkCorrectionResponse`, which is a check, not an
application:

| half | entries | targets | problems |
| --- | --- | --- | --- |
| A | 10 | 10 | none |
| B | 6 | 6 | none |

Both cover exactly their own targets, once each, with values that differ from the originals and sit
inside the bound the production contract already sets. Whether any replacement still collides is
step 8's question and remains unanswered.
