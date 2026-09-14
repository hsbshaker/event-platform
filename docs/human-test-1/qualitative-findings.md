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

Nothing in this document is implemented. It is a findings ledger and a sequence.

---

## Prioritized findings

| Finding | User impact | Confidence | Priority | Owner phase | Proposed response | Status |
| --- | --- | --- | --- | --- | --- | --- |
| **F1** Typography composition | High — pages read as CSS bugs; reviewers began distrusting intentional asymmetry too | High | 1 | **3.1** | Deterministic typography hardening: real line-box measurement, minimum measures, metadata line budgets, treatment-aware line breaking | Confirmed; remediation planned |
| **F2** Decorative hierarchy | Medium-high — pages read as unfinished or placeholder-like | Medium-high | 2 | **3.1 (narrow) or defer** | A bounded hierarchy safeguard *if* it fits existing infrastructure; defer if it needs a visual-ranking engine | Confirmed signal; scope decision pending |
| **F3** Missing thematic hero visual | Potentially high — pages feel like well-typeset flyers rather than an event | Medium-high | 3 | **4** | Generated visual anchor, art-directed with the composition | Strong product hypothesis; architecture planning required |
| **F4** Ambient thematic imagery | Medium — some pages feel blank or flat | Medium | 4 | **4** | Low-emphasis thematic layer, same system as F3 | Supporting hypothesis |

The ordering is deliberate and reflects a distinction the roadmap keeps visible:

- **F1 and F2 are "stop looking broken."** They are defects in what we already ship.
- **F3 and F4 are "raise the creative ceiling."** They are capabilities we do not have.

These must not be merged into one remediation project.

---

## F1 — Typography composition / accidental-looking indentation

**ID** F1 · **Status** Confirmed · **Confidence** High · **Severity** High · **Class**
Deterministic infrastructure · **Phase** 3.1

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

---

## F2 — Decorative hierarchy / giant monograms

**ID** F2 · **Status** Confirmed qualitative signal; scope decision pending · **Confidence**
Medium-high · **Severity** Medium-high · **Class** Deterministic infrastructure · **Phase** 3.1
candidate, narrow safeguard only

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

---

## F3 — Missing theme-specific hero imagery

**ID** F3 · **Status** Strong product hypothesis; architecture planning required · **Confidence**
Medium-high · **Severity** Potentially high · **Class** AI creative behavior · **Phase** 4

### Observation

Multiple reviewers said the generated sites often feel like well-typeset flyers, abstract
editorial compositions, or layouts without a strong emotional or thematic anchor. They expected a
visual hero tied to the event's theme.

Examples of what they expected: a lemon theme producing an elegant basket, still-life or
illustration of lemons, lemonade or citrus branches; a garden theme producing botanical or floral
artwork; a nautical theme producing an original maritime still-life; a heritage/preppy aesthetic
reference translated into an original visual language — heritage American prep, equestrian cues,
tartan, navy and cream, leather and brass, vintage teddy-bear energy, refined still-life styling.

### Canonical finding

> Typography, layout and decorative motifs alone often do not provide enough thematic
> specificity. A bespoke visual anchor tied to the user's event concept may materially improve
> emotional richness, perceived craftsmanship and uniqueness.

### Root cause

Not a defect. A missing capability: the renderer has no imagery system, by an MVP decision that
predates this evidence (see "MVP non-goal under revision" below).

### Non-goals for F3

Never copy logos, branded characters, campaign artwork or recognizable proprietary design assets.
Named aesthetic references must continue to become **original design language, not clones**. F3
does not belong in Phase 3.1 under any circumstances.

---

## F4 — Subtle atmospheric background imagery

**ID** F4 · **Status** Supporting hypothesis · **Confidence** Medium · **Severity** Medium ·
**Class** AI creative behavior · **Phase** 4

### Observation

Some sites feel too blank or flat, depending entirely on solid backgrounds, plain white, lines,
grids, typography and monograms. A very subtle theme-specific image or illustration behind the
composition — often with a soft white wash or low opacity — could add atmosphere without becoming
the focal point: washed citrus branches behind a lemon shower, an extremely soft botanical
illustration, a muted equestrian or textile atmosphere for a heritage-prep concept, a tonal
still-life, a subtle illustrated texture.

### Canonical finding

> Some designs may benefit from a low-emphasis thematic visual layer that adds atmosphere and
> specificity without competing with semantic content.

### Constraints

Not every site should get one. Readability always wins. It must not look like generic stock
photography, must not become a 2010s invitation-template effect, must keep controlled opacity and
contrast, must remain subordinate to text and content, and must work coherently with the palette
and composition.

### Non-goals for F4

Not a standalone product feature. F4 is part of the same visual system as F3 and is planned with
it.

---

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

**This is a hypothesis to test in Human Test #2, not a proven fact.** It does not reduce the case
for F1: a page that looks like a CSS bug is a defect whether or not it also has an image.

---

## Remediation roadmap

### Phase 3.1 — deterministic visual-quality hardening

*"Stop looking broken."*

Scope: F1 in full; F2 only as a narrow safeguard, and only if it fits the existing motif and
hierarchy infrastructure cleanly.

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

Added under consideration on this evidence: optional visual-anchor selection, art-brief
generation, an image-generation pipeline, composition-aware image placement, latency and cost
strategy, and fallback behavior when image generation fails or is slow. **F3 and F4 belong here
and only here.**

### Human Test #2 — the launch gate

Run on the actual production stack: hardened typography, production model and prompt, real
CompositionTree generation, optional thematic imagery, final responsive behavior.

It should test design quality, diversity, theme fidelity, typography credibility, visual
hierarchy, whether imagery feels bespoke rather than generic, whether image-free concepts still
feel intentional, and whether visual anchors improve perceived craftsmanship.

---

## Conceptual: one visual system for F3 + F4

**Conceptual naming only. No schema change is proposed or made.**

Working concept: `VisualAnchorIntent`, with modes along the lines of `none`,
`ambient_background`, `hero_art`, and possibly `hero_art_with_ambient_echo`.

The important idea is the decision, not the vocabulary: **the AI should choose whether imagery
materially improves a concept.** "Every event website gets an AI image" must not become a rule.
Some concepts should remain intentionally typography-led, and Human Test #2 should check that
those still feel deliberate.

### Division of responsibility for image generation

The creative model should generate an **art direction / structured art brief**, never raw
HTML/CSS and never arbitrary image placement. Conceptually, fields along the lines of: role;
subject; medium/style; mood; relationship to the visual palette; composition and subject
placement; desired negative space; background treatment; prohibited content.

Illustrative only — **the implementation is not locked to this shape**:

```
role:            hero visual anchor
subject:         woven basket of lemons with olive branches
medium:          editorial gouache / refined still-life illustration
mood:            warm, elegant, Mediterranean
composition:     subject weighted toward lower-right
negative space:  quiet left field reserved for title
avoid:           text, logos, brands, watermarks, people
```

The critical architectural idea:

> Image generation and page composition should be art-directed together.

Do not generate an arbitrary square image and then try to fit it into a page afterward. The
composition may tell the art brief where the subject should sit, where negative space must
remain, and whether it needs portrait/landscape/crop flexibility.

---

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
accessible text contrast when used as a background; and be crop-safe for responsive layouts.

No filters or policies are implemented in this pass.

---

## What this pass explicitly did not do

No renderer, compiler, CompositionTree, typography-rule or schema change. No image generation, no
image model selected, no storage tables, no model-prompt change, no hero-image API. No change to
the frozen Human Test #1 assets or scorer. No Phase 3.1 implementation PR. Phase 4 not started.
