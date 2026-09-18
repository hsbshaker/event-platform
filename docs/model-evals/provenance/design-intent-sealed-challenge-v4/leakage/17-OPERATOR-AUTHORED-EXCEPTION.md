# One tone keyword in v4 was authored by the operator, not by an author

**`DIC4-Q01.toneKeywords[1]` is `quietly understated`, and the operator supplied it.**

Not the human who wrote half A. Not Mistral, which wrote half B. Not the lead session, which has
authored no case content at any point and did not author this either. It must never be represented
as Mistral-authored.

| | |
| --- | --- |
| case | `DIC4-Q01` |
| field | `toneKeywords`, index 1 |
| author's value | `restrained` (Mistral, controlled correction round 1) |
| adopted value | `quietly understated` |
| authored by | **operator** |
| purpose | terminate the residual leakage-collision loop |

Recorded in code as `V4_OPERATOR_AUTHORED_VALUES` in
`src/lib/ai/evals/design-intent-challenge-v4-operator-exception.ts`, so the exception is greppable
and a second entry would be a visible change rather than a quiet one.

## Why the loop needed terminating

The original gate was sixteen single-word `toneKeywords` matching as substrings inside unrelated
words — `reserved` in "preserved", `direct` in "direction". Both authors supplied replacements
under the frozen procedure. Fifteen cleared.

Mistral's sixteenth, `restrained`, collided again, and not in the same way. `restrained` is a
**literal enum token** in the DesignIntent wire schema — `composition.hierarchy`
(`restrained | editorial | dramatic | monumental`) and `composition.ornament`
(`none | restrained | decorative`) — and appears three times in the EventIdentity prompt as worked
example prose.

A further round to the same author could have collided a third time, on a value no one could
predict in advance, against surfaces the author is not allowed to see. The operator ended it
directly.

## What this costs

Stated rather than argued away: **`DIC4-Q01`'s tone vocabulary is no longer wholly Mistral's.** Any
claim about this corpus that rests on every word being externally authored now carries exactly one
exception, and this is it.

The scope is narrow, and the narrowness is a fact rather than a defence:

- one array element, in one case, in one half;
- a tone *keyword* — not a premise, a complication, a host constraint, a creative direction, a
  palette, a motif or any Stage-1 material;
- every other string in both halves, including the other fifteen leakage replacements, retains its
  recorded authorship.

A reviewer weighing half B's authorship should know this without having to find it, which is why it
is a named file and a named constant rather than a line in a commit message.

## What was not done

- No author was contacted again.
- The scanner was not modified; `prompt-leakage.test.ts` is still byte-identical to `be016f8`.
- No other value was changed. The final half B differs from correction candidate r1 in exactly one
  leaf, proved mechanically.
