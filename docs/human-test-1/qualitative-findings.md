# Human Test #1 — qualitative findings and remediation roadmap

**This is the canonical record of Human Test #1 qualitative evidence.** Findings are recorded
here and nowhere else; other documents reference this one rather than restating it.

## Status of the test itself

Human Test #1 was **stopped early by decision**. It is qualitative calibration evidence, not a
pass/fail gate, and **no pass/fail claim is made or implied**. The frozen assets — both sheets,
`review.html`, `proof-b/human-test-key.txt`, `proof-b/human-test-form.md`,
`proof-b/score-human.js` and `scripts/human-test/score.mjs` — are unchanged and are not modified
by anything in this document.

**Human Test #2, on the frozen production stack, remains the launch design-quality gate.**

Reviewer feedback here is reported qualitatively. **No formal reviewer counts exist**, because
formal scoring was stopped; "reviewers" and "multiple reviewers" mean exactly that and should not
be read as a tally. Screen numbers refer to the frozen sheets. Naming a screen says nothing about
which source it came from; the classification stays in `proof-b/human-test-key.txt` and was not
consulted while writing this.

The findings below are the record of what reviewers observed. They are not edited by later work:
where a finding has since been answered, the response is recorded beside it as a clearly marked
section ("F1 — what shipped", "F2 — scope decision") and the observation itself is left as it was
written. This is a findings ledger and a sequence, not a status board.

---

## Prioritized findings

| Finding | User impact | Confidence | Priority | Owner phase | Proposed response | Status |
| --- | --- | --- | --- | --- | --- | --- |
| **F1** Typography composition | High — pages read as CSS bugs; reviewers began distrusting intentional asymmetry too | High | 1 | **3.1** | Deterministic typography hardening: real line-box measurement, minimum measures, metadata line budgets, treatment-aware line breaking | **Remediated in Phase 3.1** — see “F1 — what shipped” |
| **F2** Decorative hierarchy | Medium-high — pages read as unfinished or placeholder-like | Medium-high | 2 | **4** | A bounded hierarchy safeguard *if* it fits existing infrastructure; defer if it needs a visual-ranking engine | **Deferred to Phase 4** — see “F2 — scope decision” |
| **F3** Missing theme-specific visual language | Potentially high — pages feel like well-typeset flyers rather than an event | Medium-high | 3 | **4** | A coordinated visual language — anchor, supporting motifs, border/pattern, palette from the artwork — art-directed with the composition | Strong hypothesis, sharpened by reviewer reference designs; architecture planning required |
| **F4** Ambient / supporting artwork | Medium — some pages feel blank or flat | Medium | 4 | **4** | Low-emphasis layer of the *same* visual language as F3, not a separate feature | Supporting hypothesis |

The ordering is deliberate and reflects a distinction the roadmap keeps visible:

- **F1 and F2 are "stop looking broken."** They are defects in what we already ship.
- **F3 and F4 are "raise the creative ceiling."** They are capabilities we do not have.

These must not be merged into one remediation project.

---

## F1 — Typography composition / accidental-looking indentation

**ID** F1 · **Status** Confirmed; **remediated in Phase 3.1** · **Confidence** High ·
**Severity** High · **Class** Deterministic infrastructure · **Phase** 3.1

### Observation

Reviewers repeatedly and independently identified: strange headline indentation; arbitrary
staggered lines; connective fragments such as "is on" floating away from the rest of the title;
browser wrapping making an intended stagger look broken; narrow metadata columns; fragmented
dates; venue names breaking awkwardly; orphan words; and designs that are technically
geometry-clean but look like CSS bugs.

Several reviewers began reading *intentional* asymmetry as a rendering defect once they had seen
a few bad cases. That second-order effect is the expensive part: it taxes every screen, not only
the broken ones.

### Representative examples

| Screen | Reviewer reaction |
| --- | --- |
| 20 | "BABY SHAKER" starts left, "IS ON" jumps far right, "THE WAY" jumps back left |
| 27 | same desktop title: "Baby Shaker" / "the way" share an edge, "is on" floats far right |
| 06 | title wrapping creates an awkward offset middle line rather than a coherent composition |
| 01 | the centred "is on" line conflicts with an otherwise left-oriented title |
| 15 | continuation lines look arbitrarily indented rather than intentionally composed |
| 23 | date text collapses into an extremely narrow column and breaks into fragments |
| 40 | grid/layout constraints produce text positioning and wrapping that looks accidental |

Screen 25 is the useful counter-example: the same `cascade` treatment on a wide desktop measure
reads as deliberate. The treatment is not the problem; the break points are.

### Root cause

**M1 — the stagger line split is positional, not syntactic.**
`primitives/text.tsx` `titleLines()` splits on a fixed word index: words 0–1, 2–3, then the
remainder. "Baby Shaker is on the way" → `["Baby Shaker", "is on", "the way"]`. Content-blind, so
for most natural event titles the middle line is the grammatically weakest fragment.

**M2 — the treatment then displaces exactly that fragment.**
`event-tokens.css`: `h1.ev-text.ev-lay-stagger .ev-line:nth-child(even) { text-align: right; }`.
Lines 1 and 3 keep the left edge; line 2 is flung to the right margin. M1 and M2 compose into
screens 20 and 27: the shortest, least meaningful line gets the alternate alignment, so the
composition reads as a mistake rather than a choice. `cascade` (12% / 24% left padding, 6% / 12%
at mobile) is a fixed ramp applied to lines of unrelated length — the same problem, gentler.

**M3 — a stagger line can itself wrap.** `h1.ev-text .ev-line { overflow-wrap: anywhere; }`. At
390 a long first line wraps to two, so three logical lines render as four visual ones and the
right-aligned line lands third. The tight `line-height: 0.9` on staggered titles compounds it:
the displaced line sits in the previous line's descenders.

**M4 — the zero-overflow floor converts would-be overflows into arbitrary wraps.**
`.ev-site, .ev-site * { min-width: 0 }`, `.ev-text { overflow-wrap: anywhere }`,
`.ev-grid { grid-template-columns: repeat(var(--ev-cols), minmax(0, 1fr)) }`. Nothing sets a
minimum usable inline width anywhere. A Grid cell, Split column or Rail track may shrink
arbitrarily and the text will always find a way to fit — breaking at any character if necessary.

This is the same mechanism as the guarantee that a guest's phone never scrolls sideways, seen
from the other side. The floor does not fail; it *succeeds*, by trading an overflow that
verification would catch for a wrap that verification does not measure.

**M5 — orphaned tail words.** "…December 19," / "2026"; "The Lodge at Hanson" / "Park". No rule
prevents a one-word last line.

### Why verification passed all of it

`verify/verify.ts`:

```ts
s.measuredTexts > 0 && !s.pageOverflow && s.overflowingElements === 0 && s.textOverflow === 0
```

Every clause is a **containment** test, and every case above is contained. Three blind spots
follow:

1. **No line-box geometry.** `measure.ts` records one bounding box per text node and infers a
   line *count* from `height / lineHeight`. It never inspects individual line boxes, so a line
   starting far right of its siblings is invisible.
2. **No minimum usable width.** `minmax(0, 1fr)` plus `overflow-wrap: anywhere` makes "fits"
   always satisfiable.
3. **Line limits cover two emphases.** `lineLimit()` returns `null` for anything that is not
   `display` or `primary`. `Date`, `Venue`, `Location` and `Time` default to `secondary`, so the
   nodes most exposed to narrow columns have no line budget at all.

The remediation ladder — demote emphasis, then relax the box — is triggered *by* overflow, so
neither rung is ever reached.

### Product interpretation

> The renderer currently knows whether text physically fits, but not whether the resulting
> typography looks intentionally composed.

### What the canonical documents require

The gap is in the contract as much as the implementation.

- **§3.1 measures two things** (`event-renderer-system.md:158-160`): line count and bounds, with
  emphasis demotion then box relaxation as the only remedies. No document mentions line-box
  alignment, minimum measure, wrapping quality, widows, orphans or rag. The persisted `verified`
  record carries no typographic metric.
- **`EventTitle.layout` is an unexplained enum.** Its entire documented semantics is "layout
  stagger/cascade breaks it into staggered lines". No suitability rule, no documented split, no
  meaning for the offsets, and the difference between `stagger` and `cascade` is never stated.
  **The 2/2/rest split appears in no document** — it is invisible to the model, the schema and
  the validator contract simultaneously.
- **The model is told the word count but not what happens to it.** The composition prompt sends
  "title and word count" (`ContentProfile.titleWords`) and never explains that `stagger` triggers
  a word split or how. The relationship is undocumented on both sides.
- **Minimum usable width exists for components, not for text.** Components may not sit in a Split
  narrower than half, nor in a span-1 cell of a 3–4 column grid. Text leaves carry no such rule.
  The only acknowledgement of narrowness is a promise rather than a constraint: "the compiler
  then fits the text to the narrower column".
- **Mobile convergence is container-level only.** `EventTitle.layout` has no mobile intent and no
  override. Note the constraint on any remedy: `design-system.md §15.5` nominates typography as a
  *carrier* of distinction at phone width, so "simplify typography on mobile" is not free — it
  needs reconciling with a canonical doc.
- **No document contemplates a clean page that is a poor page.** Geometry is the correctness
  criterion; the only quality notion in the system is the human-review rate.

### Expected direction (not implementation)

- minimum usable text measures;
- line budgets for secondary metadata;
- removal of pathological mid-word heading breaks;
- actual rendered line-box measurement in geometry verification;
- coherent alignment-edge checks for normal multiline text;
- treatment-specific orphan protection;
- stagger/cascade line breaking that cooperates with the treatment, instead of fixed word slicing
  followed by browser wrapping;
- deterministic mobile convergence where necessary.

**Prefer no CompositionTree schema change. Do not expose arbitrary offsets or CSS to the model.**

### Non-goals for F1

Not removing stagger or cascade. Not banning asymmetry. Not adding a typography language or
per-node offsets. Not making the model responsible for line breaks by handing it pixels.

### F1 — what shipped

Phase 3.1. No schema change, no new primitive, prop or token, no model call, and nothing new
exposed to the model: it still chooses a treatment and never a break point, an offset or a pixel.

**The break points became syntactic** (`src/lib/renderer/compile/title-lines.ts`). The fixed
0–1 / 2–3 / rest slice is gone. Every way to cut the words into lines is enumerated and scored,
preferring even lines and penalising the three shapes that read as accidents: a line of nothing
but function words (M1), a break taken after a preposition or article, and an orphaned last word
(M5). A title short enough for one line keeps it — breaking "Maya & Tom" to satisfy a treatment is
the artifact the treatment exists to avoid. `"Baby Shaker is on the way"` now sets as
`["Baby Shaker", "is on the way"]`.

**The treatments became bounded offsets** (`src/styles/event-tokens.css`). `stagger` no longer
flips alternate lines to `text-align: right` (M2), which threw the weakest line to the far margin
and fought a centred or end-aligned section outright (screen 01). `stagger` now indents the odd
lines and `cascade` ramps from the second — different lines, so the two stay distinct on the
two-line titles that are the majority rather than collapsing into one rendering.

The offsets are **lengths, not percentages**, and that turned out to matter more than their size.
CSS resolves percentage padding to zero during intrinsic sizing, and a title leaf shrink-wraps to
its own content in a `start`-aligned Stack — so a percentage indent is computed out of a width
measured as though the indent were not there, and the longest line then loses exactly the indent
and breaks inside a word ("Quinceane" / "ra"). That is the old 12%/24% `cascade` ramp's real
defect, and it is the mid-word chop F1 records; reducing the ramp would not have fixed it. The
new checks caught it during development, on a title the fixtures did not contain.

Headings step from `overflow-wrap: anywhere` to `break-word` with `text-wrap: balance`, and body
and metadata get `text-wrap: pretty`, so residual wrapping is even and orphan-averse (M3, M5).

**Verification learned to see composition, not only containment** (`verify/measure.ts`,
`verify/verify.ts`; contract in `docs/event-renderer-system.md §3.1`). Rendered line boxes are
measured with `Range.getClientRects()`, and three defects join the clean criterion: text broken
inside a run that offers no break (the minimum usable measure, stated as `lines > unbreakable
segments` so it needs no threshold — M4); atomic metadata past a line budget that scales with its
own word count (blind spot 3); and line boxes that do not share their aligned edge, with the two
title treatments exempt (blind spot 1). The first feeds the existing ladder — demote, then relax
the innermost box; the second is relaxation-only, since its budget applies at and below the
demotion floor. No new repair kind was invented. The third has no repair and is reported.

Segments rather than words, because a hyphen and a slash are break opportunities too:
"Wells-next-the-Sea" on two lines is one word and four segments, and is not a defect. And the
line boxes come from a range over each text node rather than one range over the element, because
`Range.getClientRects()` also returns the border box of every element inside — which for a treated
title spans the whole measure and starts at its edge, making an indented line read as flush.

**Evidence.** Across the 72 frozen confirmation trees the new checks fire on exactly the
compositions the finding describes and nowhere else: frozen 32 sets "Saturday, December 19, 2026"
on six lines at 1280 and nine at 390 from four words, and frozen 51 sets "The Lodge at Hanson
Park" four lines deep in a 62px rail track. Both were **clean** on the old criterion — contained,
and therefore invisible — and both now take a structural relaxation and come out genuinely clean.
All 72 still verify clean. `src/lib/renderer/verify/typography.test.ts` pins both by name at 390
and 1280, together with an expressive `strong`/`monumental`/`cascade` page that must keep its
asymmetry.

**Not done, deliberately.** A minimum measure expressed in ems was tried and rejected: display
type gets few ems per line by nature, so no threshold separates a large well-set title (screen 25)
from one chopped across eight lines (frozen 32) — the word-fit rule separates them exactly. Mobile
convergence for `EventTitle.layout` was not added; the treatments now behave at 390 without it,
and `design-system.md §15.5` makes typography a carrier of distinction at phone width, so removing
it there needs a product decision rather than a fit rule.

---

## F2 — Decorative hierarchy / giant monograms

**ID** F2 · **Status** Confirmed qualitative signal; **scope decision made — deferred to
Phase 4** · **Confidence** Medium-high · **Severity** Medium-high · **Class** Deterministic
infrastructure · **Phase** 4

### Observation

Reviewers saw compositions where a huge decorative monogram — often a large "B" — visually
dominates the page while meaningful content (event title, date, venue, invitation copy) becomes
tiny, displaced or visually secondary. Some reviewers interpreted these pages as incomplete, or
as if only the letter had rendered.

Grayscale may make the problem more obvious. That does not make the feedback invalid: strong
hierarchy should not depend on color alone to explain which content is meaningful.

### Canonical finding

> Decorative motifs can dominate spatially without maintaining sufficient semantic hierarchy,
> causing designs to feel unfinished, placeholder-like, or visually confusing.

### Root cause

`Monogram { style: "ring" | "plain" | "watermark" }` carries **no size or scale prop** — the
model cannot ask for a giant monogram. Scale is entirely CSS:

- `ring` — fixed 84px circle, 2.2rem glyph;
- `plain` — fixed 3rem;
- `watermark` — `calc(var(--ev-display-size) * 5)` at `opacity: 0.1` (3.5× at mobile).

The watermark is designed as a faint background wash. In grayscale, on a dark ground, a
5×-display glyph at 10% opacity can still read as the largest solid object on the page. And a
`ring` monogram placed above a title makes the initial the first object a reader meets at mobile.

**The existing ornament budget does not cover this, by explicit decision.**
`primitives/decorative.tsx`: *"The initial is event content, not ornament, so it is never
suppressed by the ornament budget."* The `watermark` *attractive token* caps decoration-slot
monograms at one sibling in three, but a `ring` or `plain` Monogram placed as an ordinary child
is governed by nothing.

So the honest answer to "can existing motif/ornament budgeting enforce this?" is **no, not as it
stands**. The ornament budget counts motifs; this is a question about measured prominence of a
non-motif. A safeguard would be a new (small) hierarchy check, not an extension of an existing
budget.

### Expected direction (not implementation)

Evaluate a **bounded, measured** safeguard only:

- meaningful semantic content retains sufficient scale/prominence relative to decoration;
- decoration cannot reduce the event title to visual insignificance;
- decorative emphasis is reduced deterministically when hierarchy collapses — the same shape as
  the existing demotion ladder, applied to decoration rather than to text.

The geometry verifier already measures every text node's box; the raw material for "is the title
the dominant object?" largely exists. If a credible safeguard needs a generalized visual-ranking
engine, **defer it to Phase 4 or later rather than overbuild in 3.1.**

### Non-goals for F2

Monograms are not bad. Large decorative elements are not banned. Editorial whitespace is not bad.
Asymmetry is not removed. **A giant monogram can be excellent** — the problem is only when
decoration becomes the *only* visually meaningful object.

### F2 — scope decision

**Deferred to Phase 4. Nothing shipped in Phase 3.1.** The condition for a 3.1 safeguard was that
it be a small, obvious extension of the existing motif and ornament system. It is not, for three
reasons that are facts about the code rather than judgements about the design:

1. **The Monogram is exempt from the ornament budget by explicit decision**, not by oversight —
   `primitives/decorative.tsx`: *"The initial is event content, not ornament, so it is never
   suppressed by the ornament budget."* Bringing it under that budget reverses a stated
   architectural choice, which is a spec change, not a safeguard.
2. **There is no scale to bound.** `Monogram` carries `style` only; every size is CSS. A cap would
   have to be a new measured property of the *rendered* page, compared against a *different*
   node's prominence — a relative-visual-weight rule, which the system has nowhere to put.
3. **There is no repair for it.** The ladder demotes text emphasis and relaxes boxes. Reducing
   decoration is neither, so a credible safeguard needs a new override kind and a new repair rung
   — the "generalized visual-ranking engine" this finding already said should be deferred rather
   than overbuilt in 3.1.

The one-line alternative — shrinking `watermark` from `calc(var(--ev-display-size) * 5)` — was
considered and rejected: reviewers reported *relative dominance*, so an absolute multiplier picked
without evidence is a taste change applied to every concept, and it would not touch the `ring`
monogram above a title, which is the other half of the report.

What Phase 4 needs to decide: whether prominence is measured (rendered area or optical weight of
decoration against the title) or authored (the model declaring a decorative role the compiler
bounds), and what the repair is when hierarchy collapses. The geometry verifier now measures every
text node's line boxes as well as its bounds, so the *text* half of the comparison exists; the
decoration half does not.

---

## F3 — Missing theme-specific visual language / illustrative anchor

**ID** F3 · **Status** Strong product hypothesis, sharpened by reference evidence; architecture
planning required · **Confidence** Medium-high · **Severity** Potentially high · **Class** AI
creative behavior · **Phase** 4

### Observation

Multiple reviewers said the generated sites often feel like well-typeset flyers, abstract
editorial compositions, or layouts without a strong emotional or thematic anchor. They expected a
visual identity tied to the event's theme.

Reviewers then supplied concrete reference invitations showing what they felt was missing. **This
materially reframes the finding.** The references are not "pages with a hero photograph". They are
pages built around a *theme-specific visual language*.

### Reference evidence

The references repeatedly use a recognizable theme-specific visual subject or art system:

teddy bear · bunny · bee · hot-air balloon · baby pram · florals and botanicals · toile scenes ·
rocking horse · safari animals · tea service · city illustration · food and object motifs ·
decorative bows and heirloom objects.

The strongest references combine five things:

1. a recognizable visual anchor;
2. supporting illustration or motifs;
3. borders, corner treatments, patterns or background artwork;
4. a palette derived from the illustration;
5. **relatively restrained typography.**

Point 5 is the one that most directly indicts our current output. In the references the type is
usually modest in scale, quietly set, and often centred — it is not doing the creative work,
because the illustration is. Our system does the opposite.

Note also how the anchors are *integrated*: the bear sits above the text, the balloon floats in
the field, a floral cluster occupies a corner, a wreath encircles the copy. Very few are
rectangular pictures with text beneath. This has a direct technical consequence, recorded under
"Transparent artwork" below.

### Canonical finding

> The design identity comes from the entire visual language, not merely from putting a
> rectangular hero image into the page. Typography, layout and decorative motifs alone often do
> not provide enough thematic specificity; a coordinated theme-specific visual language — anchor,
> supporting motifs, border/pattern treatment and a palette derived from the artwork — may
> materially improve emotional richness, perceived craftsmanship and uniqueness.

### Product interpretation

> The current renderer has relatively few ways to create thematic specificity, so typography,
> grids, rules, monograms, motifs, whitespace and asymmetric layout are being asked to carry
> nearly all of the creative burden. This may contribute to both the typography overreach seen in
> F1 and the decorative dominance seen in F2. Reference designs suggest that a theme-specific
> visual language can carry much of that emotional/design identity, allowing typography and layout
> to become more restrained and confident.

### Root cause

Not a defect. A missing capability: the renderer has no imagery system, by an MVP decision that
predates this evidence (see "MVP non-goal under revision" below).

### Non-goals for F3

Never copy logos, branded characters, campaign artwork or recognizable proprietary design assets.
Named aesthetic references must continue to become **original design language, not clones** — see
"Originality" below. Not every concept needs artwork. F3 does not belong in Phase 3.1 under any
circumstances.

---

## F4 — Ambient / supporting thematic artwork

**ID** F4 · **Status** Supporting hypothesis; now understood as part of F3's visual language ·
**Confidence** Medium · **Severity** Medium · **Class** AI creative behavior · **Phase** 4

### Observation

Some sites feel too blank or flat, depending entirely on solid backgrounds, plain white, lines,
grids, typography and monograms. A very subtle theme-specific image or illustration behind the
composition — often with a soft white wash or low opacity — could add atmosphere without becoming
the focal point.

### Canonical finding

> Some designs may benefit from a low-emphasis thematic visual layer that adds atmosphere and
> specificity without competing with semantic content.

**Reframed by the reference evidence:** this is a *secondary expression of the same visual
language* as F3, not an unrelated background-image feature. Planning them apart would produce two
systems where one belongs.

### What one coherent visual identity looks like

Illustrative, not a specification:

**Lemon theme** — primary anchor: illustrated lemon basket or citrus still-life; ambient layer:
very soft citrus branches or lemon-blossom wash; supporting motif: small citrus ornament; palette:
cream / lemon / leaf green.

**Heirloom teddy theme** — primary anchor: original illustrated teddy; ambient layer: faint
plaid or woven texture; supporting motif: bow, stitch or star; palette: cream / powder blue /
warm brown.

The point is that anchor, ambient layer, motif and palette should read as **one art direction**,
not as separate features that happen to be switched on together.

### Constraints

Not every site should get one. Readability always wins. It must not look like generic stock
photography, must not become a 2010s invitation-template effect, must keep controlled opacity and
contrast, must remain subordinate to text and content, and must work coherently with the palette
and composition.

### Non-goals for F4

Not a standalone product feature. **Do not conclude that every site needs multiple generated
images.**

## Synthesis — why F1, F2 and F3/F4 may be one story

A hypothesis worth stating plainly, and worth testing rather than assuming.

Because the renderer has no photographic or illustrative imagery, it must create visual interest
using only oversized typography, monograms, grids, lines, motifs, whitespace and asymmetric
positioning. That may partly explain both F1 and F2: **the system is making typography and
decoration carry more emotional weight than they should.**

A strong thematic visual anchor may let future designs become simpler, more confident, less
dependent on layout novelty, and more emotionally specific. Instead of

> giant B + aggressive stagger + grid + tiny metadata

we may get

> theme-specific artwork + a restrained headline + a subtle motif system.

The reviewer reference designs strengthen this considerably. In those references the typography is
consistently *restrained* — modest in scale, quietly set — because the illustration carries the
identity. Our output does the reverse: oversized type, aggressive stagger, dominant monograms. That
is what a system with no other means of thematic expression looks like.

**This is still a hypothesis to test in Human Test #2, not a proven fact.** And it does not reduce
the case for F1: a page that looks like a CSS bug is a defect whether or not it also has an image.
F1 must be fixed on its own terms, in Phase 3.1, before any of this is testable.

---

## Remediation roadmap

### Phase 3.1 — deterministic visual-quality hardening

*"Stop looking broken."*

Scope: F1 in full; F2 only as a narrow safeguard, and only if it fits the existing motif and
hierarchy infrastructure cleanly.

**Outcome.** F1 shipped in full — see "F1 — what shipped". F2 did not meet its condition and is
deferred to Phase 4 — see "F2 — scope decision". F3 and F4 were not touched.

Constraints: **no generated imagery; no model calls; prefer no schema changes; no new
CompositionTree primitives, props or tokens.** Any change re-runs the `event-renderer-system.md
§9` regression gates — unit tests, the adversarial set, the library expressiveness render, and a
fresh sibling-batch confirmation run.

One consequence to decide deliberately rather than discover at gate time: the §9 confirmation
thresholds include a human design-quality rate. Hardening changes rendered geometry, so Human
Test #1's evidence becomes a *before* measurement and Human Test #2 carries the gate.

### Phase 4 — creative AI generation

*"Raise the creative ceiling."*

Existing scope unchanged: production DesignIntent and CompositionTree generation, thematic
creative interpretation, spend controls, telemetry, idempotency, fallbacks.

Added under consideration on this evidence: optional **visual-direction** selection across the
four modes, art-brief generation, an image-generation pipeline, composition-aware placement,
latency and cost strategy, and fallback when generation fails or is slow. Scoped to the smallest
useful capability — **one primary art-directed asset per concept, when imagery is appropriate** —
with transparency evaluated as a requirement for the illustration-led and framed modes *before* an
image model is chosen. **F3 and F4 belong here and only here**, and are planned as one visual
system rather than two features.

### Human Test #2 — the launch gate

Run on the actual production stack: hardened typography, production model and prompt, real
CompositionTree generation, optional thematic imagery, final responsive behavior.

It should test design quality, diversity, theme fidelity, typography credibility and visual
hierarchy, and specifically:

- does the site feel specifically designed for the requested theme?
- is there a memorable visual anchor when one is appropriate?
- does imagery feel integrated rather than pasted into a template?
- do image-free concepts still feel deliberately complete?
- does the visual language remain coherent across artwork, typography, palette and motifs?
- do supporting/ambient images enrich the site without hurting readability?
- does generated artwork look original rather than like generic AI or stock imagery?

The last two also test the F1/F2 hypothesis from the other side: if a thematic anchor lets
typography and decoration relax, Human Test #2 should see fewer of the composition complaints that
dominated Human Test #1.

---

## Conceptual: one visual system for F3 + F4

**Conceptual naming and planning categories only. No schema change is proposed or made.**

### Four visual-direction modes

Planning categories, not enum values:

1. **typography-led** — no generated artwork; the concept is deliberately type-and-motif driven;
2. **illustration-led** — a recognizable subject anchors the page (teddy, balloon, pram, lemon
   basket, floral cluster);
3. **atmosphere-led** — no discrete subject; a soft thematic wash or texture behind the
   composition;
4. **framed/editorial illustration** — artwork as border, corner treatment, wreath or frame
   around the content rather than beside it.

Mode 4 comes directly from the references and would be easy to miss if we planned only for
"hero image or background image". Several of the strongest references are frames, not heroes.

**Imagery stays optional.** The creative system decides whether a visual anchor improves the
concept; "every event website gets an AI image" must not become a rule. Human Test #2 should
check that typography-led concepts still feel deliberate rather than unfinished.

### The smallest useful capability

For initial Phase 4 planning, evaluate this and resist more:

- **one primary generated visual asset** per selected visual direction, when imagery is
  appropriate;
- **art-directed** so the renderer can integrate it flexibly rather than slot it into a fixed box;
- potentially usable as anchor, crop, frame element, or subdued atmospheric treatment **from the
  same asset**;
- deterministic motifs remain available and unchanged alongside it.

One asset with flexible integration is a much smaller capability than an artwork *set*, and it
covers most of what the references achieve. Whether one asset can genuinely serve both anchor and
ambient use, or whether ambient needs its own lower-cost generation, is an open Phase 4 question.

### Transparent artwork — evaluate as a first-class requirement

The references integrate their subjects into the layout: the bear sits above the copy, the balloon
floats in the field, the floral cluster occupies a corner, the wreath encircles the text. A
rectangular image with hard edges cannot do this. It produces the "pasted into a template" look
reviewers were reacting against in the first place.

So **transparent-background artwork (alpha) is likely a requirement for illustration-led and
framed/editorial modes**, not a nice-to-have. Atmosphere-led probably does not need it.

This must be decided **before** image-model selection, not after: alpha support, and its
reliability, varies sharply between models and is not something a prompt can add later. Recorded
here as an input to that decision.

Consequences to weigh: alpha allows artwork to overlap text, which makes contrast a placement
problem rather than a background problem; and crop-safety changes shape, because what is cropped
is the canvas, not the subject.

### Division of responsibility for image generation

The creative model should generate an **art direction / structured art brief**, never raw HTML/CSS
and never arbitrary image placement. Conceptually, fields along the lines of: role; subject;
medium/style; mood; relationship to the visual palette; composition and subject placement; desired
negative space; background treatment (including whether alpha is required); prohibited content.

Illustrative only — **the implementation is not locked to this shape**:

```
role:            hero visual anchor
subject:         woven basket of lemons with olive branches
medium:          editorial gouache / refined still-life illustration
mood:            warm, elegant, Mediterranean
composition:     subject weighted toward lower-right
negative space:  quiet left field reserved for title
background:      transparent
avoid:           text, logos, brands, watermarks, people
```

The critical architectural idea:

> Image generation and page composition should be art-directed together.

Do not generate an arbitrary square image and then try to fit it into a page afterward. The
composition may tell the art brief where the subject should sit, where negative space must remain,
and whether it needs portrait/landscape/crop flexibility.

### The broader hypothesis: the creative unit may be larger than a CompositionTree

> The eventual creative unit may need to be more than a CompositionTree. The AI is effectively
> art-directing an event identity: composition, typography, palette, motif system and optional
> generated artwork should feel like coordinated outputs from one creative direction.

**Assessment: this can remain a sibling output, and should.** The target shape

```
DesignIntent → CompositionTree + optional VisualArtIntent → compiler → ResolvedDesignSpec
```

holds, for a specific reason worth stating so it is not lost. `spec.md §32` forbids the model
emitting free text, colors, pixels or anything outside the primitive allowlist **in the
CompositionTree**. An art brief is irreducibly descriptive — "woven basket of lemons with olive
branches" is free text and cannot be an enum. Keeping the brief *outside* the tree, as a sibling
of `DesignIntent`, preserves that guardrail intact. Folding art direction into the tree would
break it.

What the tree would still need is a **placement**: somewhere for the compiler to put the resolved
asset. That is at most one new decorative leaf referencing an asset by id, with enum tokens for
role and treatment — the same shape as every existing primitive, no pixels and no free text. It is
a primitive-set version bump and a §9 gate re-run, but it is not an expansion of what the language
can express.

So the honest summary is: **no architectural conflict, one small addition, and one real sequencing
problem.** The sequencing problem is geometry verification — see below.

### The creative interpreter is `EventIdentity`, and the raw prompt never reaches the generator

Recorded as a Phase 4 conclusion, because it is the question the whole imagery discussion turns
on: *what stands between what a host types and what a model draws?*

The answer is **`EventIdentity`**. It is this product's creative interpreter — the step that reads
a host's prompt and any inspiration and settles what kind of event this is, what it is called, who
it is for, what register it wants and what visual references it carries. Everything downstream —
`DesignIntent`, the composition, and any future art brief — is an interpretation of that, not of
the raw prompt.

**A host's prompt must not be forwarded, verbatim or lightly wrapped, into a generic
"generate a website" or "generate an image" prompt.** That is not a stylistic preference:

- A generic generator has no notion of an *event* — no host, no date, no RSVP, no registry, no
  guest — so it optimises for a plausible page rather than for this event's meaning, which is the
  "well-typeset flyer" F3 describes from the other direction.
- It bypasses every constraint this document records. The originality rule ("Ralph Lauren" becomes
  heritage prep, tartan, navy and cream — never Polo Bear), the safety constraints, the four
  visual-direction modes and the transparency requirement are all properties of the *brief*. A raw
  prompt handed to a generic generator has already skipped them.
- It makes the output unattributable and unrepeatable. `EventIdentity` is persisted; a concept can
  be re-fitted, redesigned or explained against it. A raw prompt piped downstream leaves nothing
  to re-derive from.
- It reintroduces the decision-making this product exists to remove. The landing page is the
  prompt precisely so the host does not have to art-direct; an unmediated prompt puts that burden
  straight back on them.

So Phase 4's imagery pipeline, if it is built, is `EventIdentity → art brief (constrained,
reviewable, persisted) → image generation`, never `host prompt → image generation`. The brief is
where the constraints live, and the brief is derived, not quoted.

## MVP non-goal under revision — AI-generated imagery

**Not removed here.** Recorded as a product decision requiring intentional revision.

**Original assumption.** AI-generated decorative site imagery is out of MVP scope. Stated in
`spec.md` MVP non-goals ("AI-generated decorative site imagery"), `spec.md §11.11` imagery
boundaries, `design-system.md §15.11` ("Design power comes from composition, type, palette,
motif, texture, pattern, border, and spacing"), and `CLAUDE.md` ("No decorative event-site
imagery in MVP"; guardrail "do not add site-photo/decorative imagery"). The one deliberate
exception is the native registry product thumbnail, which is *content*, not event design.

**New evidence.** Human calibration suggests generated thematic imagery may be central to
perceived design quality and differentiation rather than optional decorative scope. Reviewers did
not describe imagery as a nice-to-have; several described its absence as the reason a page felt
like a flyer.

**Proposed revised decision (for approval, not applied).** Permit *generated, art-directed,
composition-aware* thematic imagery in Phase 4, as an AI-chosen option rather than a default —
while keeping the existing prohibitions on host photo uploads, stock photography, galleries and
crop/position tools, which this evidence does not challenge.

**Architectural implications.** A visual anchor is a new decorative leaf in the composition
language plus a new asset lifecycle. It touches: the primitive set and its version; the schema
and prompt; storage and RLS for generated assets; geometry verification, which renders the real
page and would need the image present and loaded; the immutability rule for generated design
data; and re-fit, which must not silently regenerate or drop an image.

**Cost and latency implications.** Three concepts per generation. Image generation is slower and
more expensive than text generation by a wide margin, and it sits in the most latency-sensitive
part of the product.

**Product upside.** Thematic specificity, emotional richness, differentiation from template
tools, and — per the synthesis above — possibly simpler, more confident typography.

**Risks.** Generic stock-photo appearance; brand and character imitation; embedded text and
watermarks; contrast and readability regressions when used behind content; latency; cost;
partial-failure states; and the temptation to make imagery mandatory because it is impressive.

### Canonical documents that would need amendment if approved

- `spec.md` — MVP non-goals list ("AI-generated decorative site imagery"); §11.11 imagery
  boundaries; the §32 guardrail "do not add site-photo/decorative imagery"; §31 acceptance
  criteria would need a bullet for the new capability.
- `docs/design-system.md` — §15.11 "No decorative site imagery in MVP".
- `docs/event-renderer-system.md` — §2 the primitive set and its version; §3.1 geometry
  verification (image loading and contrast when used behind text); §8 imagery; §9 regression
  gates.
- `docs/model-contracts.md` — a fourth model call or an extension of the composition call;
  schemas; re-prompt policy; the CO-* conformance list.
- `docs/technology-decisions.md` — the image model and the asset pipeline are stack decisions.
- `CLAUDE.md` — the non-negotiable principle and the guardrail list.
- `docs/development-plan.md` — Phase 4 scope.

This document does **not** amend any of them.

---

## Open Phase 4 questions — cost, latency, lifecycle

Recorded, not solved. These are Phase 4 architecture and product decisions and must not be pulled
into Phase 3.1.

**The sequencing problem, first.** Geometry verification renders the *real* page in a headless
browser and is the authority for whether a spec is final. If a concept carries artwork, the
artwork must exist and be loaded when that runs, or the spec is verified against a page guests
will never see. That inverts today's order — generate, then verify — and it is the one genuine
architectural consequence of imagery, distinct from cost and lifecycle. It needs a deliberate
answer, not a default.

- Generate imagery for all three concepts, or only the selected one?
- Lower-cost draft imagery per concept, refined only after selection?
- Generate only when imagery is essential to understanding the concept?
- Cache or reuse art briefs across concepts or events?
- What happens when image generation is slow, fails, or is rate-limited?
- How does redesign interact with already-generated images?
- When does an image become immutable, and what supersedes it?
- How are assets stored, versioned, and garbage-collected?

## Safety and originality constraints for future imagery

Recorded now, implemented later. Generated imagery should avoid logos and trademarks as visual
assets; avoid copying named-brand characters; translate named aesthetic references into original
visual language; avoid embedded text unless explicitly supported; avoid watermarks; avoid a
generic stock-photo appearance where possible; be generated to serve the composition; maintain
accessible text contrast when used as a background or where alpha artwork overlaps text; and be
crop-safe for responsive layouts.

### Originality — named references become original language

The rule, stated concretely because the failure mode is concrete. A user reference such as "Ralph
Lauren" must **not** produce Polo Bear, Ralph Lauren logos, copied campaign imagery, or
proprietary characters and design assets.

It should translate the reference into an original aesthetic language: heritage American prep;
equestrian details; tartan; navy and cream; leather and brass; vintage teddy-bear energy; heirloom
illustration; restrained luxury.

This is a constraint on the art brief and on generation, not only on review — a brief that names a
brand has already failed, whatever the image comes back looking like.

No filters or policies are implemented in this pass.

---

## What this pass explicitly did not do

No image generation, no image model selected, no storage tables, no model-prompt change, no
hero-image API. No change to the frozen Human Test #1 assets or scorer. Phase 4 not started.

Phase 3.1 has since been implemented against this ledger: F1 in full, F2 deferred with its
reasons, F3 and F4 untouched. The findings above are the record of what was observed and are not
edited by that work; "F1 — what shipped" and "F2 — scope decision" record the response.
