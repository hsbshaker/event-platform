# v4 leakage correction — the procedure, frozen before either author was contacted

**Neither author has been contacted. No replacement wording exists. Claude authored none of it and
will author none of it** (`CLAUDE_AUTHORED_REPLACEMENT_QUOTA = 0`).

This file and `design-intent-challenge-v4-leakage-correction.ts` are the record made *before* the
thing arrives, which is the only point at which a procedure claim is worth anything.

## What is being corrected, and what is not

The frozen scan gated on 28 raw substring collisions arising from exactly **16 single-word
`toneKeywords` values** — `README.md` in this directory has the full result and the surface context
for every one.

Not corrected, and not in scope for anyone in this round:

| | |
| --- | --- |
| the scanner | untouched; not relaxed, not rescoped, not re-thresholded |
| any case premise | no case is invalidated, re-premised, or questioned |
| every other field | zero collisions in `creativeDirection`, palette prose, `tonalIntent`, motifs, texture, typography direction, copy tone, `hostConstraints`, `creativeGuidance`, `inspirationSummary` |
| span and claim checks | zero hits in both |

## Why correction and not a scanner fix

`docs/model-evals/eval-incidents.md` **Debt 1** recorded this exact class prospectively, during v3,
down to the word: the frozen scanner convicted the one-word tone keywords `reflective` and
`generous`, one of them against a code comment about byte budgets. `reflective` is a v4 target here
too.

Debt 1 also recorded the remedy and the reason for it. The remedy is narrow corpus-side wording
correction through the original authors. The reason is the ordering this programme refuses
everywhere else: changing the referee with a specific game's collisions in view is the move someone
would make if the hits were real, so the fact that these are nonsense buys no exception. That
reasoning is unchanged and it still binds.

## The frozen procedure

1. **The same source that authored each half supplies its own replacements.** No cross-half
   coordination; the two authors never see each other's material. This matters concretely: the
   value `grounded` is a target in `DIC4-P01` and again in `DIC4-Q05`, and the two authors will
   answer it independently, without knowing the other exists.
2. **Each author receives only** its own affected case ids; the exact affected keyword(s); the
   instruction to replace each with one semantically equivalent short tone keyword or short tone
   phrase; and the instruction that no other field or value may change. The two packets are frozen
   at `03-half-a-correction-packet.md` and `04-half-b-correction-packet.md`, pinned by digest, and
   their contract below the flagged-value table is byte-identical.
3. **Withheld:** model-visible prompt text, the matching surface text, which surface matched, why
   any particular word collided, prior corpora, the other half's material, semantic findings, and
   every qualitative diagnostic. `V4_LEAKAGE_CORRECTION_WITHHELD_FROM_AUTHORS` is the full list, and
   a test asserts the packets match none of it.

   The packets say plainly that the reason is withheld rather than offering a story in its place.
   They also say that no inference is available from the list — which is true, and worth saying,
   because an author who tried to reverse-engineer a rule would choose replacements to dodge an
   imagined constraint instead of to mean the right thing.
4. **Claude supplies zero replacement wording** — no suggestion, no synonym, no example, no ranking,
   no "if you're stuck". A test asserts the packets contain no such thing.
5. **Each correction response is preserved verbatim before it is applied**, in this directory,
   exactly as the Stage-1 and Stage-2 responses were.
6. **Substitutions are applied mechanically and only inside the affected `toneKeywords` arrays**, at
   pinned `(caseId, keyword, index)` coordinates. Index as well as value, deliberately: substituting
   by `indexOf` would drift if a value ever appeared twice, and substituting by value across the
   file would rewrite the *other* half's `grounded`.
7. **Every non-target value is proved identical**, by `checkSubstitutionApplied`, which reconstructs
   the corrected artifact from the frozen one plus exactly the pinned substitutions and requires
   deep equality. Not a list of fields someone remembered to check — that passes precisely when a
   field nobody listed was edited, which is the failure a correction round actually produces.
8. **The same frozen scanner is re-run.** Same machinery, same eight surfaces, same three checks.
9. **If any replacement still collides, STOP.** Claude does not invent another replacement and the
   scanner is not loosened. What happens next is the user's call, not this round's.
10. **Only after a clean scan** does the protocol continue to Stage-2 faithfulness review — which
    remains a judgement for a session that does not know the P/Q source mapping, exactly as before.

## What the frozen module checks, and what it refuses to

`checkCorrectionResponse` verifies a response covers exactly its own targets, once each, with a
value that differs from the original and that the **existing production contract** already admits
(`toneKeywords` entries, 2–48 characters — quoted from `contract.ts`, probed at the boundary by a
test, not restated as a number).

It deliberately does **not** check that a replacement is good, short, or semantically equivalent.
Those are judgements and they belong to the faithfulness reviewer. Nor does it pre-check whether a
replacement will clear the scanner: step 8 decides that, and a checker that guessed first would be
a mechanical proxy standing in for the thing it cannot measure — the defect this programme has now
caught itself building eight times.

No length cap, banned-word list or style rule was invented for this round. A bound the author was
never told about is a metric that punishes correct behaviour.

## Status

Frozen. Nothing sent. The next action is the user's decision to contact the two authors.
