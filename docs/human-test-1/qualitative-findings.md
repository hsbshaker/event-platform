# Human Test #1 — qualitative findings

Reviewer commentary recorded while the frozen test is still collecting responses. **Nothing here
changes the experiment**: the sheets, `review.html`, the hidden key, `proof-b/score-human.js` and
`scripts/human-test/score.mjs` are untouched, and no remediation has been implemented. This is
evidence, filed so it is not lost between collection and scoring.

Screen numbers refer to `proof-b/human-test-1280-gray-unlabeled.png` and its 390 counterpart.
Naming a screen here says nothing about which source it came from; the classification stays in
`proof-b/human-test-key.txt` and was not consulted while writing this.

---

## F1 — Rendered typography lacks sufficient composition safeguards

> Valid layouts can produce accidental-looking headline stagger, inconsistent continuation-line
> alignment, pathological narrow-column wrapping, and other line-break behaviour that materially
> reduces perceived design quality and trust in the generator.

Multiple reviewers raised this independently, and several began reading *intentional* asymmetry as
a rendering defect once they had seen a few bad cases. That second-order effect is the expensive
part: it taxes every screen, not only the broken ones.

The underlying gap:

**The system cannot currently distinguish intentional editorial staggering from accidental
container-driven wrapping and indentation.** A design can pass rendered-geometry verification —
no overflow, no clipping, no collision — while still being typographically incoherent.

### Reviewer examples

| Screen | Reviewer reaction |
| --- | --- |
| 20 | "BABY SHAKER" starts left, "IS ON" jumps far right, "THE WAY" jumps back left |
| 27 | same desktop title composition: "Baby Shaker" / "the way" share an alignment edge, "is on" floats far right |
| 06 | title wrapping creates an awkward offset middle line rather than a coherent composition |
| 01 | the centred "is on" line conflicts with an otherwise left-oriented title |
| 15 | continuation lines look arbitrarily indented rather than intentionally composed |
| 23 | date text collapses into an extremely narrow column and breaks into fragments |
| 40 | grid/layout constraints produce text positioning and wrapping that looks accidental |

### Traced mechanisms

Read-only inspection of the Phase 3 renderer. Each is a mechanism, not yet a decision about what
to change.

**M1 — the stagger line split is positional, not syntactic.**
`src/components/event-renderer/primitives/text.tsx`, `titleLines()` splits the title on a fixed
word count: words 0–1, words 2–3, then the remainder. For "Baby Shaker is on the way" that is
exactly `["Baby Shaker", "is on", "the way"]`. The rule is content-blind, so for most natural
event titles the middle line is the grammatically weakest fragment — a connective.

**M2 — the stagger treatment then displaces precisely that fragment.**
`src/styles/event-tokens.css`: `h1.ev-text.ev-lay-stagger .ev-line:nth-child(even) { text-align:
right; }`. Lines 1 and 3 keep the left edge; line 2 is flung to the right margin. M1 and M2
compose into the exact artefact reviewers described on 20 and 27: the shortest, least meaningful
line is the one given the alternate alignment, so the composition reads as a mistake rather than
as a choice. `cascade` (12% / 24% left padding, 6% / 12% at mobile) is a fixed ramp applied to
lines of unrelated length, which is M1's problem in a gentler form — screen 15.

**M3 — a stagger line can itself wrap, producing more visual lines than logical ones.**
`h1.ev-text .ev-line { overflow-wrap: anywhere; }`. At 390 a long first line ("BABY SHAKER")
wraps to two, so three logical lines render as four visual ones and the right-aligned line lands
third. Screen 20 at mobile. The tight `line-height: 0.9` on staggered titles compounds it: the
displaced line sits almost in the previous line's descenders, so the eye cannot recover a reading
order.

**M4 — the zero-overflow floor converts would-be overflows into pathological wraps.**
`.ev-site, .ev-site * { min-width: 0 }`, `.ev-text { overflow-wrap: anywhere }`, and
`.ev-grid { grid-template-columns: repeat(var(--ev-cols), minmax(0, 1fr)) }`. Nothing sets a
minimum usable inline width anywhere in the event stylesheet. A Grid cell, Split column or Rail
track may therefore shrink arbitrarily, and the text inside it will always find a way to fit — by
breaking at any character if necessary. Screens 23 and 40.

This is the same mechanism as the guarantee that a guest's phone never scrolls sideways, seen from
the other side. The floor does not fail; it *succeeds*, by trading an overflow verification would
catch for a wrap verification does not measure.

**M5 — orphaned tail words in metadata.**
Consequence of M4 at ordinary widths: "Saturday, December 19, 2026" breaking to leave "2026"
alone, "The Lodge at Hanson Park" leaving "Park" alone. Screen 20 at mobile. No rule prevents a
one-word last line.

### Why rendered-geometry verification did not catch any of this

`src/lib/renderer/verify/verify.ts`:

```ts
s.measuredTexts > 0 && !s.pageOverflow && s.overflowingElements === 0 && s.textOverflow === 0
```

Every one of those is a **containment** test. A staggered title whose middle line is right-aligned
is fully inside its container. A date wrapped into four fragments in a 60px column is fully inside
its column. Both are clean, correctly, under the criteria as written.

Three specific blind spots follow:

1. **No line-box geometry.** `measure.ts` records each text node's bounding box and infers a line
   *count* from `height / lineHeight`. It never inspects the individual line boxes, so it cannot
   see that line 2 starts 180px right of lines 1 and 3. Horizontal origin divergence between
   continuation lines is invisible to it.
2. **No minimum usable width.** Nothing compares a text container's inline width against what the
   content needs. `minmax(0, 1fr)` plus `overflow-wrap: anywhere` means "fits" is always
   satisfiable.
3. **Line limits apply to two emphases only.** `lineLimit()` returns `null` for anything that is
   not `display` or `primary`. `Date`, `Venue`, `Location` and `Time` default to `secondary`, so
   the nodes most exposed to narrow columns have no line budget at all.

And the remediation ladder — demote emphasis, then relax structure — is aimed at overflow. Neither
rung is reached here, because there is no overflow to trigger it.

### What the language can and cannot express

`EventTitle.layout: "block" | "stagger" | "cascade"` (`composition/nodes.ts`) already *is* an
explicit editorial-treatment semantic, and the planner treats it as an attractive token capped at
one sibling in three (`composition/attractive-tokens.ts`). So intentional stagger is expressible
and rationed. What is missing is not the intent but everything downstream of it: where the lines
break, which line is displaced, by how much, and whether the result still reads as composed.

The model says "stagger this title" and the renderer decides, on a fixed word count and a fixed
alignment rule, what that means. Reviewers are reacting to the renderer's decision, not the
model's.

### What the canonical documents actually require

Read alongside the code, because the gap is in the contract as much as in the implementation.

- **§3.1 measures two things.** `event-renderer-system.md:158-160`: each text node's *line count*
  and *bounds*, with emphasis demotion then box relaxation as the only remedies. No doc anywhere
  mentions line-box alignment, minimum measure, wrapping quality, widows, orphans or rag. The
  persisted `verified` record carries no typographic metric at all.
- **`EventTitle.layout` is an unexplained enum.** Its entire documented semantics is "layout
  stagger/cascade breaks it into staggered lines" (`composition.system.md:40`, and identically in
  `composition.schema.json`). There is no rule about when stagger is appropriate — the only
  governance is the one-in-three diversity quota — no documented line split, no meaning for the
  offsets, and the difference between `stagger` and `cascade` is never stated. **The 2/2/rest
  split appears in no document**: it is invisible to the model, to the schema and to the validator
  contract.
- **The model is told the word count but not what will be done with it.** Block 1 of the
  composition prompt sends "title and word count" (`ContentProfile.titleWords`). Nothing tells the
  model that choosing `stagger` triggers a word split, how many lines result, or that the outcome
  depends on the number it was just given. The relationship is undocumented on both sides.
- **Minimum usable width exists for components, not for text.** Components may not sit in a Split
  narrower than half, nor in a span-1 cell of a 3–4 column grid. Text leaves carry no such rule, so
  an `EventTitle` in a span-1 cell of a four-column grid is a legal tree. The only acknowledgement
  of narrowness is a promise rather than a constraint: "the compiler then fits the text to the
  narrower column".
- **Mobile convergence is container-level only.** Every rule in §2.5 is about `Split`, `Rail`,
  `Grid` and `Overlay`. `EventTitle.layout` has no mobile intent and no override. Note the
  constraint this puts on any remedy: `design-system.md §15.5` nominates typography as a *carrier*
  of distinction at phone width, so "simplify typography on mobile" is not a free move — it would
  need reconciling with a canonical doc.
- **No document contemplates a clean page that is a poor page.** Geometry is the correctness
  criterion ("a spec is final only with `verified.clean === true`"), and the only quality notion in
  the system is the ≥ 70% human-review rate. The single aesthetic instruction anywhere is the
  prompt's one "Quality line", advisory prose with no validator counterpart. The 30% of screens
  reviewers may rate not-designed is where these failures currently live, uncharacterised.

## Status

Recorded only. No production code, renderer behaviour, compiler behaviour, CompositionTree,
typography rule or frozen test asset has been changed. Remediation is deferred until the frozen
test is complete and scored, so that the quantitative result and this qualitative evidence can be
weighed together.
