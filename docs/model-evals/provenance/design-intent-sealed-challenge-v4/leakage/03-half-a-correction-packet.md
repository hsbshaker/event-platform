# Wording correction request

A narrow wording correction to cases you authored. Nothing else about them is changing.

## Flagged values

| case | flagged `toneKeywords` value(s) |
| --- | --- |
| `DIC4-P01` | `grounded`, `reflective`, `delicate` |
| `DIC4-P02` | `gentle`, `chosen` |
| `DIC4-P03` | `direct` |
| `DIC4-P04` | `rigorous`, `formal` |
| `DIC4-P05` | `accessible` |
| `DIC4-P06` | `focused` |

10 values across 6 cases.

## What is being asked

An automated mechanical check flagged a small number of `toneKeywords` values in the cases you
authored. For each flagged value below, supply **one** replacement: a semantically equivalent short
tone keyword, or a short tone phrase.

That is the whole task.

## Rules

1. **Replace only the values listed below.** Every other value in every case you wrote stays exactly
   as you wrote it — every other `toneKeywords` entry, and every other field: `creativeDirection`,
   `paletteIntent`, `tonalIntent`, `visualMotifs`, `textureDirection`, `typographyDirection`,
   `copyTone`, `hostConstraints`, `creativeGuidance`, `inspirationSummary`, and all the rest.
2. **Keep the meaning.** A replacement should say what the flagged word said about the tone of that
   event. This is a wording change, not a change of mind about the case.
3. **One replacement per flagged value.** Not a list, not alternatives to choose from.
4. **Do not revise the premise.** No case is being questioned. Nothing you wrote has been judged
   wrong, weak, or in need of improvement.

## What you are not being told, and why

You are not being told what the check matched, which text it matched against, or why any particular
word was flagged.

That is deliberate and it is not a courtesy. The text a value matched against is material this
corpus is specifically built to be independent of, and handing it over — with the operator's
authority attached — would damage the thing the correction is meant to protect far more than the
flagged words ever could. So the reason is withheld, and you are being told plainly that it is
withheld rather than being given a story instead.

For the same reason you are not being shown any other author's material, any earlier corpus, any
review finding, or any note recorded about your own cases.

**No inference is available here.** The flagged values are ordinary English words. Nothing about
which ones were flagged tells you anything about the subject matter, the target text, or what a
"better" answer would look like. Do not try to reverse-engineer a pattern from the list; there
isn't one to find, and a replacement chosen to dodge an imagined rule is worse than one chosen to
mean the right thing.

## Return format

A flat list, one line per flagged value:

```
<case id>  <flagged value>  ->  <your replacement>
```

Nothing else. No commentary on the cases, no revised JSON, no explanation of your choices.
