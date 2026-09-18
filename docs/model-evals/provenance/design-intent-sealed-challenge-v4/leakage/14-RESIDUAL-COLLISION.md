# Round 1 correction: GATED on one residual collision

**The corrected halves are NOT adopted.** `12-half-a-corrected-candidate-r1.json` and
`13-half-b-corrected-candidate-r1.json` are candidates that failed the frozen scan. The canonical
Stage-2 artifacts remain `half-a/04-stage-2-eventidentity-cases.json` (`82470633…`) and
`half-b/03-stage-2-eventidentity-cases.json` (`62cff576…`), unmodified.

## The residual finding

| case | replacement value | model-visible surface | check |
| --- | --- | --- | --- |
| `DIC4-Q01` | `restrained` | `prompt` (`docs/model-prompts/event-identity.system.md`) | verbatim |
| `DIC4-Q01` | `restrained` | `design intent wire schema` (`docs/model-schemas/design-intent.wire.schema.json`) | verbatim |

Two hits, one value, one case. Everything else cleared: half A went 17 → 0, half B 11 → 2.

## This one is not the same class as the sixteen

Worth stating precisely, because the whole correction round rests on the sixteen having been
mechanical false positives.

The original sixteen were substring accidents — `reserved` inside "p**reserved**", `direct` inside
"**direct**ion", `formal` inside "**formal**ity". No model would ever see those as the corpus's
words.

`restrained` is different on both surfaces:

- In the DesignIntent wire schema it is a **literal enum token**, twice: `composition.hierarchy`
  (`restrained | editorial | dramatic | monumental`) and `composition.ornament`
  (`none | restrained | decorative`). It is a whole value of the design vocabulary, not a fragment
  of an unrelated word.
- In the EventIdentity prompt it appears three times as worked-example prose: `"restrained
  windowpane plaid"`, `"minimal grotesk-led hierarchy with restrained serif accent"`, and "not the
  most restrained version of it".

Whether that makes it a real leak is a judgement and is **not made here**. What is recorded is that
the mechanical facts differ from the sixteen, so the Debt 1 reasoning that justified corpus-side
correction does not transfer to it automatically.

## What was not done

Per the ruling, on any residual collision: **STOP**.

- No new wording invented. `restrained` is the author's own word and stays the author's problem.
- No author contacted.
- Neither candidate adopted, and **half A was not adopted either** — although half A is clean.
  Adopting the half that passed while the other is still gated is the move v3's closure refused
  when it declined a half that had passed review; it makes the corpus adaptive to observed
  outcomes.
- No faithfulness, semantic-overlap or fairness review begun. No v4 corpus assembled.
- The scanner, the correction module, the prompts, the schemas and every other piece of benchmark
  machinery are unchanged.

## Two observations recorded without adjudication

Both are facts about the responses. Neither is a finding, and neither was acted on.

1. **Six of the sixteen official replacements are identical to values in the excluded outputs** —
   `contemplative`, `official`, `exacting`, `approachable` (half A); `muted`, `haptic` (half B).
   The excluded outputs were not consulted, shown, or used: the substitutions were parsed from
   `10-` and `11-` alone, and `06-EXCLUDED-OUTPUTS.md` bars them. Independent convergence on an
   ordinary synonym is the obvious explanation, and it is the operator, not this session, who can
   confirm the two authors were given only the frozen requests.
2. **Both halves replaced `grounded` with `anchored`.** `DIC4-P01[0]` and `DIC4-Q05[1]` now carry
   the same value, produced by two authors who did not see each other's material. The original
   `grounded` was likewise shared, so this preserves a duplication that already existed rather than
   creating one.

## Evidence in this directory

| file | what |
| --- | --- |
| `10-`, `11-` | the two official responses, verbatim |
| `12-`, `13-` | the gated candidates — **not canonical** |
| `15-post-correction-scan-result.json` | the frozen scan over the candidates |
| `16-application-proof-r1.txt` | validation, substitution and non-target-equality output |
