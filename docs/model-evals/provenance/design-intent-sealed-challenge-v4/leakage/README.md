# v4 Stage-2 frozen leakage scan — result

**Outcome: GATING. 28 collisions across the two halves. The protocol's stop condition is met, and
this session stopped here.** Nothing was repaired, nothing was relaxed, and Steps 2–4 (the three
reviewer packets) were not prepared.

This file is a record of what the frozen machinery returned. It contains **no judgement** about
whether any collision is a real leak — that is not a mechanical question, and this session is not
the one to answer it.

## What was run

The scan is the frozen machinery, not a new rule:

- `leakageProbes` and `MODEL_VISIBLE_SURFACES` were **imported** from `src/lib/ai/evals/corpus.ts`.
- `fold` and `spans` were copied out of `src/lib/ai/evals/prompt-leakage.test.ts` and asserted
  line-by-line against that file's source, so a drifted copy fails rather than scanning weaker.
- The three checks are the scanner's own three, in its order: `verbatim`, `span`, `claim`.

### Why it could not be the scanner file itself

`prompt-leakage.test.ts` iterates `CORPUS_FILES`, and `CORPUS_FILES.designIntentChallenge` names
`design-intent-sealed-challenge-v4.json`, which **does not exist**: assembly is a later protocol
step and was not authorised here. The scanner therefore passes vacuously for v4 today. The two
Stage-2 half artifacts were scanned directly instead, and the assembled corpus was **not** created,
not even transiently — creating it early would disturb the declared assembly order.

The consequence is that these 28 become 28 failing assertions in the real scanner the moment the
corpus is assembled. That is what "gating" means here.

### Machinery state at scan time

| | |
| --- | --- |
| gate | `8f5ca5abbbbbf4eb57082dd3ea15b4f428d07d00d7de1a51ad3862e52db20172` (unchanged) |
| `prompt-leakage.test.ts` | `b9a56a7ac0da5a24c1219d5ac6353a09a6b0234bfe6685a2433c867451276203`, byte-identical to `be016f8` |
| half A Stage-2 | `824706333d94ce70fc50edc685a4b5e92f4d8bb64cae506e1fb553964a7a94fa` |
| half B Stage-2 | `62cff57645b9ee65c0a444270c677a3a2bb794993e212da814b83504b2099c2e` |

Eight model-visible surfaces were scanned and **none was absent**: `prompt`, `wire schema`,
`provider boundary`, `input assembly`, `design intent prompt`, `design intent wire schema`,
`design intent provider boundary`, `design intent input assembly`.

## Result

| | half A | half B |
| --- | --- | --- |
| cases | 6 | 6 |
| verbatim probes | 149 | 134 |
| claim probes | 0 | 0 |
| **verbatim hits** | **17** | **11** |
| span hits | 0 | 0 |
| claim hits | 0 | 0 |

Sixteen distinct (case, value) pairs produce the 28 (case, value, surface) triples.

### Every collision, by field

    === HALF A ===
      DIC4-P01  "delicate"  ->  toneKeywords[3]   | surfaces: prompt
      DIC4-P01  "grounded"  ->  toneKeywords[0]   | surfaces: wire schema
      DIC4-P01  "reflective"  ->  toneKeywords[1]   | surfaces: prompt
      DIC4-P02  "chosen"  ->  toneKeywords[4]   | surfaces: prompt; design intent prompt
      DIC4-P02  "gentle"  ->  toneKeywords[2]   | surfaces: design intent wire schema
      DIC4-P03  "direct"  ->  toneKeywords[4]   | surfaces: prompt; wire schema; provider boundary; design intent prompt; design intent wire schema; design intent provider boundary; design intent input assembly
      DIC4-P04  "formal"  ->  toneKeywords[3]   | surfaces: prompt
      DIC4-P04  "rigorous"  ->  toneKeywords[1]   | surfaces: prompt
      DIC4-P05  "accessible"  ->  toneKeywords[2]   | surfaces: design intent prompt
      DIC4-P06  "focused"  ->  toneKeywords[5]   | surfaces: prompt
    === HALF B ===
      DIC4-Q01  "reserved"  ->  toneKeywords[1]   | surfaces: prompt; provider boundary; design intent prompt; design intent provider boundary
      DIC4-Q03  "neutral"  ->  toneKeywords[1]   | surfaces: prompt
      DIC4-Q04  "tactile"  ->  toneKeywords[2]   | surfaces: prompt; wire schema
      DIC4-Q05  "grounded"  ->  toneKeywords[1]   | surfaces: wire schema
      DIC4-Q06  "balanced"  ->  toneKeywords[2]   | surfaces: design intent prompt; design intent wire schema
      DIC4-Q06  "playful"  ->  toneKeywords[3]   | surfaces: prompt

**Every one is a `toneKeywords[i]` entry, and every one is a single word.** No `creativeDirection`,
`paletteIntent`, `tonalIntent`, `visualMotifs`, `textureDirection`, `typographyDirection`,
`copyTone`, `hostConstraints`, `creativeGuidance` or `inspirationSummary` string collided with
anything, on any surface. `spans` never fires because a single word yields no three-word span, so
the entire result comes from the `verbatim` check and its six-character floor.

### Where each colliding word occurs in the surface

Recorded because the frozen check is a raw substring test, and the record should show what was
matched rather than only that something was.

    ### "accessible"
      [design intent prompt] ...s: a later deterministic stage derives every semantic role, and every accessible contrast, from what you return. do not add black or white as contrast...
    ### "balanced"
      [design intent prompt] ...ng identifier and never name a font. ## 9. density one of `compact`, `balanced` or `spacious`, chosen from the brief, the character of the assigned...
      [design intent wire schema] ...are offered." }, "density": { "type": "string", "enum": [ "compact", "balanced", "spacious" ] }, "composition": { "type": "object", "properties": {...
    ### "chosen"
      [prompt] ...ject genuinely calls for it** — and then it should be real restraint, chosen, not a default. what to avoid is thoughtlessness, in either direction...
      [design intent prompt] ...lds. four are yours to choose freely, two are fixed above, and one is chosen inside the assigned category: 1. `family` — assigned; 2. `tonaldirect...
    ### "delicate"
      [prompt] ...sitive, emotional, cultural, familial, personal, medical or otherwise delicate. that is ordinary material and you handle it like any other. a missin...
    ### "direct"
      [prompt] ...he host's own words. everything downstream — concept planning, design direction, page composition — reads what you return and never the original d...
      [wire schema] ...operties": { "identity": { "type": "object", "properties": { "creativedirection": { "type": "string", "description": "concise 1-3 sentence creativ...
      [provider boundary] ...the per-attempt maximum rather than zero, which is the * only honest direction when the provider's billing is unobservable to us. */ unknownusage...
      [design intent prompt] ...receive the host's own words, the facts they supplied, the structural direction, the ornament budget, the site's enabled features, any other conce...
      [design intent wire schema] ...uction applied to the sibling's narrowed contract, where family, tonaldirection and composition.hierarchy are single-value enums and typographypai...
      [design intent provider boundary] ...ed for fewer attempts than the policy * permits would be wrong in the direction of spending money. */ export const max_transient_retries = 2; expo...
      [design intent input assembly] ...words, * not `suppliedfacts`, not `clarification`, not the structural direction or the attractive-token * allotment, not capabilities or the conte...
    ### "focused"
      [prompt] ...instead — silence is usually available and usually correct. 4. **one focused question resolves it.** **none of these is a trigger on its own:** th...
    ### "formal"
      [prompt] ...ttributes. translate it into original, abstract attributes such as: - formality; - heritage vs. contemporary; - editorial vs. playful; - palette f...
    ### "gentle"
      [design intent wire schema] ...operties": { "asymmetry": { "type": "string", "enum": [ "symmetric", "gentle", "strong" ] }, "hierarchy": { "type": "string", "enum": [ "restraine...
    ### "grounded"
      [wire schema] ...icit requirement of a specific thing, or a correction the host made — grounded in an explicit phrase from their own words and kept verbatim or near-...
    ### "neutral"
      [prompt] ...ette through language such as: - "sage, bone, and rust"; - "only warm neutrals"; - "black and white"; - "no yellow"; - a supplied exact hex palette...
    ### "playful"
      [prompt] ...es such as: - formality; - heritage vs. contemporary; - editorial vs. playful; - palette family; - typography character; - texture; - motif familie...
    ### "reflective"
      [prompt] ...gic" | "no candles" | warmth can come from lamplight, amber glass and reflective surfaces instead | | "expensive-feeling but not flashy" | "not flashy...
    ### "reserved"
      [prompt] ...ng. before returning, internally verify: - explicit constraints were preserved, and exclusions are absolute; - negative constraints were preserved;...
      [provider boundary] ...ll that ends up costing six attempts must not exceed a ceiling that * reserved for one. */ export const max_provider_attempts_per_call = event_ident...
      [design intent prompt] ...code actually makes, and offered catalogues that do not exist. v4 is preserved at `history/design-intent.v4.system.md`; its schema is preserved besi...
      [design intent provider boundary] ...g beyond the response * already paid for. * * everything paid for is preserved on every path, success and failure alike: the raw text of every * res...
    ### "rigorous"
      [prompt] ...the move: "bauhaus-inspired" may become geometric primary structure, rigorous grid discipline, flat unmodulated color fields, functional sans hiera...
    ### "tactile"
      [prompt] ...d winter-lodge elegance with classic americana restraint: deep, warm, tactile, and polished without feeling themed or juvenile." bad: "use editoria...
      [wire schema] ...otif ids." }, "texturedirection": { "type": "string", "description": "tactile/visual texture character. never an image asset." }, "typographydirect...

## Relationship to the recorded scanner debt

`docs/model-evals/eval-incidents.md` already records, as **Debt 1**, that this scan matches raw
substrings over whole source files and that v3 produced eight collisions of which seven were
ordinary English. That debt was deliberately **not** paid during v3, on the stated ground that
changing the referee with a specific game's collisions in view is the ordering this programme
refuses. The same ordering applies now: this result is reported, not resolved.

Two facts are recorded here because they are mechanical, and both are for the user to weigh:

1. The existing 4C corpora (`design-intent-regression.json`, `design-intent-validation-v2.json`)
   return **zero** collisions against the same eight surfaces, and the frozen scanner is green on
   them today (172 passing assertions). Their `toneKeywords` are idiosyncratic phrases
   — `gele-bright`, `chapel-quiet`, `folding tables and a cooler`. The v4 halves' are generic
   single adjectives.
2. Both v4 authors produced generic single-word tone keywords, independently, under a Stage-2
   packet that neither of the earlier corpora's authors received.

Whether that is a leakage finding, a corpus-quality finding, a scanner finding, or an artifact of
the Stage-2 packet's wording is a judgement, and it is left open.

## Raw

`01-frozen-scan-result.json` holds the machine-readable result: surfaces scanned, surfaces absent,
per-case probe counts, and every hit as `{check, surface, id, value}`.

## What happened next

The user ruled: do not change or relax the scanner, do not invalidate or re-premise any case, and
apply Debt 1's recorded remedy — narrow corpus-side wording correction through the original authors.

`02-correction-procedure.md` records that procedure, frozen before either author was contacted, and
`src/lib/ai/evals/design-intent-challenge-v4-leakage-correction.ts` pins its coordinates, its
disclosure denylist and its two proofs while no replacement exists. The two author packets are
`03-half-a-correction-packet.md` and `04-half-b-correction-packet.md`, pinned by digest.

The open question this file left — whose problem the 28 are — was answered: they are a scanner
false-positive class, already documented, and the corpus is corrected around it without the referee
moving.

## Correction round, as it actually stands

The two replacement outputs committed at `6d5a5cf` and `7c368f9` are **not** responses to the frozen
correction procedure — no correction prompt had been written when they landed, and none was sent.
They are preserved and excluded (`06-EXCLUDED-OUTPUTS.md`).

The controlled round is frozen in `09-controlled-correction-round.md`, with the two exact requests
at `07-` and `08-`. Nothing has been sent, nothing applied, and the scanner has not been re-run.
