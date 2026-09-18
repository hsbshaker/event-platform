# v3 sealed challenge — external authoring provenance

The raw halves as they were supplied, preserved before normalization or assembly, and the
mechanical result each one got. The protocol these are received under was frozen at `9da8010`,
before either author wrote a case, and is recorded in `docs/phase-4b-plan.md` Part IV.

**Attribution here is user-supplied provenance, not a cryptographic claim.** Nothing in a JSON file
proves which model produced it. Source family is recorded because the record should say who the
corpus is attributed to and on what basis — never because the file can be shown to be that model's
work. The labels are provenance only: they must never reach the DesignIntent model or the blind
qualitative reviewer.

Nothing in this directory is a corpus. No eval set points here, the canonical sealed slot
`docs/model-evals/design-intent-sealed-challenge-v3.json` remains absent, and these files are never
run.

## Gemini half — `DIC3-M01`…`DIC3-M06`

Received 2026-09-18. Six cases, namespace exact.

| file | role | sha256 | bytes | commit |
| --- | --- | --- | --- | --- |
| `gemini/01-original.json` | original raw half | `7d7587069a20fc333bb813328a39acdf5ec02dd72dd639490c8c167f6ec3ead7` | 15,842 | `bf3afc1` |
| `gemini/02-contract-correction.json` | first narrow contract-correction round | `c3e400ac31f7e9786e5091ddde3b9de62f686ecbaaed46670cebf86c5923d8ba` | 15,926 | `2bba4e5` |
| `gemini/03-final-candidate.json` | **the candidate** | `56ad64b072900428603b0b4f545db8118549e3c4d81705573c86c630ed5373d2` | 15,739 | `d53a45a` |

`01` and `02` are correction history and nothing else. **No case is ever selected from them, and no
version is ever mixed**: the candidate is `03` whole, or it is not the candidate. They are kept
because a lineage that discards its earlier rounds cannot show what the corrections were.

### Mechanical result on `03`: clean but for two leakage collisions, both in `DIC3-M01`

Run as a half, so the gated whole-corpus contract (twelve batches, two same-type pairs) is **not**
applied here — that runs once at assembly, and only when both halves are present.

Clean:

- `validateDesignIntentCorpusShape(..., { gated: false })` — no problems. That is the real
  `eventIdentityResultSchema`, the legal `suppliedFacts` keys, and the required-vs-avoided colour
  satisfiability floor, not a convenient subset.
- The protocol's own composition check — six cases, exact namespace, unique ids, **exactly one**
  same-`eventType` pair (`anniversary party`) across five distinct types.
- No id collides with any corpus on disk.
- No supplied-fact value appears in its own case's identity prose. Token overlap does
  (`conservatory`, `craftsman`, `clay`, `studio`), and it is **not** a finding: the frozen check
  compares the whole literal value, so an ordinary word a brief and a venue name share creates no
  false invention check.
- Cross-corpus `toneKeywords` overlap: **zero** exact matches against any other corpus, including
  the two invalidated candidates. Three successive corpora collided here before this one.
- Supplied-fact value reuse across corpora: **zero**. No shared names, venues or localities.

Two collisions against `docs/model-prompts/event-identity.system.md`, found by the frozen span
scan. All eight registered model-visible surfaces were scanned; every DesignIntent surface is
clean.

1. **`DIC3-M01.identity.creativeGuidance[0]`** contains the span `botanical line art`. The
   EventIdentity prompt lists `"soft botanical line art"` as a worked `visualMotifs` example. This
   is the collision class the scan exists to catch — a sealed case landing on a phrase that is
   already model-visible text — and the author, who never saw the prompt, could not have known.
2. **`DIC3-M01.identity.hostConstraints[1]`** begins `Do not include any…`. The span
   `do not include` is exactly fourteen characters, the scan's floor, and appears twice in the
   prompt as ordinary instruction boilerplate. It carries no benchmark content.

Both block assembly, because `prompt-leakage.test.ts` asserts an empty list and that scan is frozen
machinery — it is not weakened to admit a corpus. Under the repair policy a narrow leakage-collision
rewrite is allowed, but both need authorial prose, so both go back to the same external author as
abstract findings through the user. **No replacement prose is written here.**

The second finding is recorded with a caveat rather than passed along as though it were the first
one's equal. A three-word ordinary-English prohibition tripping a leakage scan is a heuristic false
positive, and the author-facing contract actively asks for host-voice prohibitions — so the scan is,
on this one string, penalising the behaviour it asked for. That is this programme's recurring defect
class, and whether it is the corpus or the machinery that should move is an escalation, not a
custodian's call.

### Diagnostic, not a finding

Three cases share the span `clean high contrast` and two share `high contrast editorial`, in
`typographyDirection` and `tonalIntent`. That is mild authorial-template pressure, it is recorded
for the eventual semantic-overlap review to weigh with both halves in front of it, and it is **not**
grounds for an edit on its own. `No visual inspiration supplied.` recurring in two cases is the
canonical sentinel used exactly as specified, which is correct behaviour rather than a template.

## ChatGPT half — `DIC3-G01`…`DIC3-G06`

Received 2026-09-18. Six cases, namespace exact.

| file | role | sha256 | bytes | commit |
| --- | --- | --- | --- | --- |
| `chatgpt/01-original-raw.txt` | original raw response | `e49d340ba0f67bcb86f2ac5a913140405996c027ff75bd1315132c1ae4e6c554` | 16,705 | `dbbdaac` |
| `chatgpt/02-normalized-candidate.json` | **the candidate** | `38963c46189013e8e969ef5d706a9a5ea67089bfefb904e166d948d452f05fd5` | 15,353 | `7d3d535` |

The raw response is not parseable JSON: its structural quotes are `U+201C`/`U+201D`. The candidate
is the normalized form, and the normalization was **verified rather than trusted**: replacing only
those two characters in the raw file yields an object deep-equal to the committed candidate. In-prose
apostrophes (`U+2019`) and `é` survive unchanged. That is a JSON/syntax correction, which the repair
policy allows, and it alters no content — which is a fact this record can show rather than assert.

### Mechanical result on `02`: clean but for six leakage collisions, none carrying benchmark content

Clean on the same battery as the Gemini half: structural contract with `gated: false`, the
protocol's composition check (exact namespace, unique ids, **exactly one** same-`eventType` pair —
`birthday party` — across five distinct types), no id collision, no supplied-fact value in its own
identity prose.

Six collisions, four distinct strings:

1. `DIC3-G03.toneKeywords[2]` = `reflective` — a bare adjective, matched against the EventIdentity
   prompt's "reflective surfaces".
2. `DIC3-G04.inspirationSummary` and `DIC3-G05.inspirationSummary` — the span `the host supplied`,
   against the prompt's "unless the host supplied exact colors".
3. `DIC3-G06.toneKeywords[1]` = `generous` — a bare adjective, matched on three surfaces, in three
   unrelated senses.

**None of these is benchmark content.** They are ordinary English words that a brief and a prompt
both happen to use, which is the overlap class the protocol classes as diagnostic. They block all
the same, because the scan asserts an empty list.

One of the six is worth separating, because it says something about the scan rather than the
corpus. `generous` matched `src/lib/ai/openai/design-intent.ts` inside a **code comment** about byte
budgets — text that never ships to any model. The scan reads whole source files as model-visible
surfaces when only their string literals are, so a comment can convict a corpus of leaking into a
prompt it never touched.

### Diagnostic, not a finding

`unhurried` (`DIC3-G04`) appears in the regression corpus, the validation corpus and the invalidated
second candidate; `companionable` (`DIC3-G04`) appears in that candidate. Both are ordinary English,
both were written by an author who saw none of those files, and under the protocol ordinary
vocabulary overlap is **diagnostic, never a gate**. Recorded for the semantic review to weigh, not
acted on.

`memorial gathering` occurs in both halves. Cross-half event-type matches are legal by protocol and
are explicitly not grounds for editing anything. Cross-half `toneKeywords` overlap is zero, and
cross-half supplied-fact value overlap is zero.

Two of the three inspiration-bearing cases open `inspirationSummary` with "The host supplied…",
which is mild authorial-template pressure for the semantic review to weigh with both halves in
front of it.

## Where this stands

Both halves are mechanically clean except for leakage collisions, and **eight collisions across the
two halves resolve into one substantive finding and seven ordinary-English false positives**:

| | substantive | ordinary vocabulary |
| --- | --- | --- |
| Gemini | `botanical line art` (`DIC3-M01`) | `do not include` (`DIC3-M01`) |
| ChatGPT | — | `reflective`, `generous` ×3, `the host supplied` ×2 |

Seven of the eight are against **EventIdentity** surfaces, which the DesignIntent stage is never
shown at all.

Assembly is blocked either way, and the scan is not weakened to unblock it. What the seven should
count as is an escalation rather than a custodian's call, because the honest options differ in what
they cost:

- **Treat them as corpus findings.** Allowed — a narrow leakage-collision rewrite is a permitted
  repair — but both need authorial prose, so they return as abstract findings through the user. The
  cost is that it teaches two authors to avoid ordinary English near text they have never seen,
  which is the lexical gaming the protocol says the corpus rules exist to avoid.
- **Treat them as a scan-design defect.** `leakageProbes` makes every identity prose string of six
  or more characters a verbatim probe, which turns a one-word `toneKeyword` into a leak claim; and a
  surface is a whole source file rather than the strings that ship from it. Neither is hash-pinned,
  so both are changeable. The objection is decisive and is recorded rather than argued past: the
  cases already exist and have been read, so any change now is a change made **with the collisions
  in view** — the exact ordering this programme refuses everywhere else.

No prose is written here for either author, and neither corpus is repaired, assembled or frozen.
