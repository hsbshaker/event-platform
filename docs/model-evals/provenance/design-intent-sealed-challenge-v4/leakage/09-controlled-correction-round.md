# The controlled correction round — requests frozen, nothing sent

**No author has been contacted.** This file and the two request artifacts are the record made before
contact, which is the only moment at which that claim is worth recording.

## The two requests

| half | artifact | sha256 |
| --- | --- | --- |
| A | `07-half-a-correction-request.txt` | `d5c2e0c20543fb6c02aa5b20b0854ea51a09046239a474316fd8890d3a97d756` |
| B | `08-half-b-correction-request.txt` | `42ea94dfc9893655d3faf27702a731fa8aa5cafead26c02ccf6f8df55a9a0bec` |

Both files contain **only** the text to send. No header, no footer, no operator note — so there is
nothing in them that could be pasted to an author by accident.

**The wording is the user's, verbatim.** This session authored none of it and changed nothing except
one mechanical normalization, recorded here rather than left to be discovered: the JSON skeleton in
the half B request was supplied with typographic quotation marks (`“replacements”`), which are a
formatting artifact and are not valid JSON. They are straight quotes in the artifact. The `→` and
`…` characters are kept as supplied, because those are intended.

## Half B run provenance

Half B is recommissioned to the same source family and model provenance as the Stage-1 and Stage-2
authoring runs:

| | |
| --- | --- |
| family | Mistral |
| Studio model | shown as Mistral Medium |
| alias | `mistral-medium-latest` |
| temperature | 0.7 |
| top_p | 1 |
| capabilities | none |
| conversation | fresh |
| files / connectors / repository / web | none |
| prior conversation context | none |

The alias is a moving identifier, which `SEALED_CHALLENGE_V4_HALF_B_MODEL.identifierIsMoving`
already records. It is recorded, not relied upon as a snapshot.

## Withheld from both authors

Neither request discloses what any word matched, any prompt or schema text, any leakage-scan
surface, any prior corpus, any v3 finding, any other-half content, any suggested replacement, or any
previously proposed replacement value.

The last of those is the one with a live hazard attached, because sixteen such values exist in this
repository right now — see `06-EXCLUDED-OUTPUTS.md`. A test asserts that none of them appears in
either request, so the claim is checked rather than asserted.

## What this round does not settle

The requests do not tell either author *why* a value was flagged, and they do not need to. What they
also cannot do is make the correction round a controlled one on their own: that depends on the
requests being sent as written, to the same author and the same model provenance, with nothing
added. Only the operator can establish that, and the record will say so when the responses land.

## Next

1. The operator sends `07-` to the half A author and `08-` to Mistral, under the settings above.
2. Each response is preserved verbatim before anything is applied.
3. `checkCorrectionResponse` validates each half.
4. Substitutions are applied mechanically at the pinned coordinates; `checkSubstitutionApplied`
   proves every non-target value identical.
5. The unchanged frozen scanner re-runs.
6. If anything still collides: STOP. No invented replacement, no loosened scanner.

Steps 2–6 are not authorised yet.
