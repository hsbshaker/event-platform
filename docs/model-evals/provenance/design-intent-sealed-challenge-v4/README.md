# v4 sealed challenge — authoring provenance

Empty on purpose. The protocol was frozen before any situation card or case existed, and this file
is the ledger that fills as artifacts arrive.

The protocol itself lives in `src/lib/ai/evals/design-intent-challenge-v4-protocol.ts` as checkable
values and in `docs/phase-4b-plan.md` Part IV as canon. v3's closure — why this version exists at
all — is `../design-intent-sealed-challenge-v3/CLOSURE.md`.

Nothing in this directory is a corpus. No eval set points here, the canonical sealed slot
`docs/model-evals/design-intent-sealed-challenge-v4.json` is absent, and these files are never run.

**Attribution is user-supplied provenance, not a cryptographic claim** — for the human author of
half A exactly as much as for the model family of half B. Nothing here can prove who wrote a file.
The record says who it is attributed to and on what basis, and never more.

## Author sources

| half | namespace | source class | chosen source |
| --- | --- | --- | --- |
| A | `DIC4-P01`…`DIC4-P06` | one fresh human author | *(recorded here before commissioning)* |
| B | `DIC4-Q01`…`DIC4-Q06` | one fresh model family, not OpenAI-, Anthropic- or Google-family, and no prior corpus in this programme | **Mistral** — see below |

The namespaces are neutral by design: `P` and `Q` say nothing about which half a human wrote. Case
ids never reach the blind qualitative reviewer, but they do reach the semantic and fairness
reviewers, and a reviewer who knows which half is human-authored is no longer reading the cases.

Half B's family is recorded **before** commissioning or half B is not commissioned, and that is
what happened: the slot was a declared `null` at the protocol freeze and was set to `Mistral` in a
later commit whose tree still contains **no `DIC4` situation card or case**. `git` carries the
ordering rather than a claim in prose.

### Half B, pinned

| | |
| --- | --- |
| family | `Mistral` |
| model | `Mistral Medium 3.5` |
| pinned model id | `mistral-medium-3-5` |
| authoring surface | Mistral Studio Playground |

**The pin is for provenance and reproducibility only.** It is not a quality claim, not a capability
claim, and not a statement that Mistral writes better cases than the families it replaces — the only
claim is eligibility: it authored no corpus in this programme and is none of the three excluded
families. A snapshot id rather than a moving alias, because an alias that advanced silently would
make "which model authored this corpus" unanswerable a month later, which is the same class of
defect as a digest that no longer matches its file.

The authoring session may not use: `mistral-medium-latest` or any moving alias in place of the
pinned id; Vibe automatic model routing; an agent; connectors; repository access; web search;
uploaded files; or prior conversation context. Every entry closes a route by which the session would
stop being what this record says it is — the first two make the authoring model unknowable, the
middle five could reach material the author must never see, and the last makes "fresh session"
false. **The seal is not only about what an author is told; it is also about what it can go and
find.**

## What gets recorded, per half

Stage 1 and Stage 2 are separate artifacts, and both are preserved:

| | |
| --- | --- |
| `<half>/01-situation-cards.json` | the six frozen situation cards, raw, before the EventIdentity contract was shown |
| `<half>/02-eventidentity-candidate.json` | the six cases mapped from those exact cards |
| further numbered files | any allowed syntax or contract correction, each preserved as its own round |

Plus, for each: source class and family or human attribution, date received, namespace, SHA256 and
byte count of every artifact, and every correction round with its leaf-level diff. **No case
selection is ever recorded, because none is ever made**: six cards are commissioned, those exact six
proceed to Stage 2, and the half is accepted whole or rejected whole.

## Review order

1. mechanical and schema validation;
2. the frozen leakage scan across every registered model-visible surface;
3. **verification that each final case is still faithful to its frozen situation card**;
4. independent semantic premise and device overlap review, against every readable corpus, both
   earlier invalidated sealed challenges, **all v3 artifacts**, and the other new half;
5. system-aware fairness review — still unspent — only if the semantic review passes;
6. freeze the canonical corpus only if every prior stage passes;
7. stop for explicit paid-run authorisation.

Step 4 includes the v3 artifacts deliberately: the reviewer may read all of them, and no v4 author
sees any of them. That asymmetry is how we find out whether a new source lands on the same ground
without ever telling it where that ground is.

## What no author is told

No subject, genre or device to avoid — not from v3, not from anywhere. A benchmark coached against
cases its authors must not know exist is a construction aimed at known answers, and a corpus that
avoids what we already found would be evidence that we edited the test rather than that the system
generalizes.
