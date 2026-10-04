# Product doctrine

## What this document is

The product we are trying to build, and the creative bar it has to clear. It exists because an
agent can read every contract in this repository, satisfy all of them, and still ship the wrong
product.

**Read this before making a creative or product decision. It decides nothing on its own.**
`spec.md` remains the authority for requirements and acceptance criteria, and every other document
keeps the authority it already has. Where this document and a lower one disagree about a
*requirement*, that is a real conflict to raise and resolve explicitly (§14), never something to
resolve by quietly editing either side.

---

## 1. The promise

This is not a design tool and not a template catalog. The promise is:

> **Describe your event. We create the whole experience.**

The creative heart of that experience is **one invitation card**, delivered in an envelope that
opens. The reaction we are designing for is:

> "Oh my god, it read my mind. That's exactly what I wanted, and it's already beautiful enough to
> send."

So the card has to be beautiful, specific to *this* event and this host's taste, emotionally
resonant, cohesive, legible, and send-ready — good enough that the host is proud to text it to
forty people, and good enough that making it is worth telling someone about.

The working test:

> **Would the host screenshot the card and send it to someone before they even publish?**

If not, the creative experience is not yet at the intended bar. This is a bar on the *first* card,
not on what the host can reach after edits.

## 2. What "MVP" means here

MVP is permission to omit features. It is not permission for a mediocre card or shallow
understanding.

> **Design quality and creative understanding are core functionality, not polish.**

The central path is:

```text
raw description → AI understands the event and the taste → one compelling card
→ the host makes it theirs → invitations go out → RSVPs come back
```

Optimize for excellence on the card and pragmatism everywhere else:

- **the card** — an extremely high bar; a weak card is a *functional* failure, not a cosmetic one;
- **the house-style page, operations, edge cases** — ordinary MVP scope; clean and dependable is
  enough.

`spec.md §34` is the right shape for accepted limitations: every item there is a functional gap or
an operational risk with a stated remedy, and none lowers the bar the first card has to clear.

## 3. The make-or-break capability is understanding

The hardest and most valuable capability is not image generation. It is:

> **Understanding what the host actually means — taste, vibe, subtext, creative intent — and
> translating that into a visual world that feels immediately right.**

Get this wrong and a flawless illustration is a beautiful card for the wrong event.

Prompts we must handle well are vague, colloquial and taste-heavy:

> "Ralph Lauren baby shower for a boy" · "lemons in Italy but classy" · "Winnie the Pooh but not
> corny" · "girly but not pink" · "modern Indian baby shower" · "old money garden party" · "luxury
> safari" · "cute but not childish" · "something unique, I don't know, surprise me"

The distinctions that matter are the ones a good designer hears immediately: sophisticated vs
playful, heirloom vs childish, editorial vs storybook, restrained vs maximal, literal theme vs
subtle interpretation, tasteful reference vs cliché, when an illustration should carry the card and
when a quiet border is stronger.

**This is not keyword → palette mapping.** "Girly but not pink" is a taste instruction with a
negative constraint; treating it as a keyword match produces exactly the thing the host asked to
avoid.

## 4. Responsibility map

Each stage has one question to answer. Keeping them separate is what stops the system collapsing
into a single vague prompt.

| Stage | Its question | Owns |
| --- | --- | --- |
| **`EventIdentity`** | *What does this host mean, and what creative world should this event belong to?* | Interpretation: tone, aesthetic character, sophistication, subjects and symbols, materials and textures, palette territory, typography character, copy voice, what to avoid, and named references captured as the look the host means (homage allowed, marks never, §11). |
| **fact extraction** (cheaper model) | *What did the host literally state?* | Names, date, time, venue — quoted, never inferred — into the draft for confirmation. |
| **`CardDesign`** | *What is one excellent card for this identity?* | Layout from the catalog, art mode, font pairing, the card's wording, and the art brief. |
| **card artwork** (image model) | *What artwork serves this brief and this layout?* | The image, with no text, leaving the layout's quiet regions quiet. |
| **card compiler + renderer** (code) | *Is it legible, does it fit, is it the same everywhere?* | Facts on the card, ink and contrast, legibility panels, text size and line breaks, the envelope, the page, RSVP/registry, business logic. |

**`EventIdentity` is this product's creative interpreter**, and it is the reason a raw prompt never
reaches a generic generator:

```text
raw prompt + optional inspiration
  → EventIdentity  (+ optional adaptive clarification, §6)
  → CardDesign  →  art brief + layout and shape rules  →  image model
  → deterministic card compiler → the card
```

It is **not**:

```text
raw prompt → "make me a baby shower invitation" → image model
```

That shortcut fails for four separate reasons, each sufficient on its own: an image model has no
notion of *this* event — no host, no facts, no guests — so it optimises for a plausible picture
rather than this event's meaning; it bypasses every constraint recorded here, since the originality
rule, the negative constraints and the visual direction are properties of the *brief*; it leaves
nothing to re-derive from when the host asks for another direction, because `EventIdentity` is
persisted and a raw prompt is not; and it invites the image model to render words, which it does
badly and which would put unverified "facts" on an invitation.

The bar for `EventIdentity`'s output: **a strong human designer reading it should know what
assignment they have been given.**

## 5. Grounded facts vs creative interpretation

The single most important boundary in the system, and the easiest one to get wrong in a way that
embarrasses the host in front of forty guests.

**Grounded facts** come only from the host's input, trusted saved event data, or later setup:
hosts and names, event type, date, time, venue, address, RSVP deadline. If supplied in the prompt,
extract them exactly for the host to confirm. **If not supplied, do not invent them.**

**Creative interpretation** is where the model should be generous. "Lemons in Italy but classy" may
legitimately imply Mediterranean warmth, citrus leaves, linen, ceramic detail, a refined lemon
still life, an ivory / muted lemon / olive palette, and an instruction to avoid cartoon citrus.

The same prompt must **not** yield a card that says Positano, or an outdoor party, or black tie.
Aesthetic implication is inference. A date, a place or a dress code is a fact, and facts are quoted,
never inferred.

On a card this is concrete: the wording the AI writes may be warm and witty, but every name, date,
time and place printed on it comes from the host.

## 6. Adaptive creative clarification

Canonical as `spec.md §7.6b`. `EventIdentity` may decide it needs one thing clarified. This must
never become a setup wizard: it is a small number of questions, generated from an ambiguity
actually present in this prompt, about taste only.

> **Understand aggressively. Infer creatively. Ask selectively.**

**The preferred number of questions is zero.** Ask only when several plausible creative readings
exist *and* choosing wrong would materially change whether the host likes the card. Usually none;
sometimes one or two; a ceiling of three.

The test:

> **Would different answers produce meaningfully different creative identities?**

For "Ralph Lauren baby shower for a boy", a question that passes is *"What side of that look are
you drawn to?"* — heritage/equestrian, heirloom teddy, country-club prep. Every question offers
**"You decide"** / **"Surprise me"**; a host who has no design vocabulary must not get a worse card.

## 7. What must never be asked before the card

**Logistics — never a gate on design.** The creative stage never demands a date, time, venue,
address, RSVP deadline or other operational field. Extract what the prompt contains; offer the rest
while the card is being made; require it only to publish (`spec.md §7.3`, `§23.1`).

**Design decisions — never asked at all.**

> **AI should remove decisions, not create more decisions.**

Do not ask which font, which layout, which colours, how big the bear should be. Those are the
decisions the product is hired to make. Clarification exists to understand the *identity*, never
to outsource the design.

## 8. One card, and another direction that is really another direction

The host sees **one card at a time**. That puts the whole creative burden on the first card being
right — which is the point: the product promises to read the host's mind, not to hand them a
shortlist to sort through.

When the host asks for another direction, the next card must be **a different idea a good designer
could defend from the same brief**, not the same card in a new palette or a new font. For a
heritage/preppy baby shower, *Heirloom Teddy*, *Equestrian Nursery* and *Heritage Storybook* are
three directions; one illustration in navy, then in green, then in tan is one direction three
times. Code rejects exact repeats; the evaluation corpus judges whether directions *feel* different.

## 8a. The generation experience

Generation takes time because the work is real. That time is a **product surface**, not a loading
state to hide.

> The host should feel **"I'm watching my invitation come to life"**, not "I'm waiting for AI to
> finish."

This is never an argument for slowing anything down. **The moment the card is genuinely ready, the
envelope opens.**

### Show real artifacts, never theater

The wait surfaces **structured creative artifacts the pipeline actually produced**, as they become
available: interpreted creative signals, palette territory, visual vocabulary, the design's name,
the art direction. After *"Ralph Lauren baby shower for a boy, classy not cheesy"* that might be
*heritage · heirloom · polished · understated · restrained whimsy*, then a palette, then
*Heirloom Teddy — a hand-painted bear in a tartan bow*, then the envelope.

- **No chain-of-thought and no hidden reasoning**, ever. What is shown is a stage's *output*.
- **No fabricated progress.** No invented percentages, no simulated "thoughts", no stage that claims
  work which has not happened.

### Two equally good ways to spend the wait

While the card is made, the host may **optionally** confirm or fill in facts only they know —
names, date, time, venue, RSVP deadline. *"We're designing your invitation. Watch, or add the
details while we work."* Both paths are first-class. Missing logistics never block the card, are
never asked during clarification, and are never invented.

### A detail change is a content edit, not a new idea

Changing a venue or a date updates the card's text deterministically. It never re-runs
`EventIdentity`, the design or the artwork. *"Make it more romantic and less preppy"* is a creative
request: that is `Try another direction`.

### Latency, as a north star

Canonical targets are `spec.md §7.10`: identity visible in ~5 s, the card revealed in a working
target of ~30 s, re-set from measurement once a real image model is chosen.

> **30 seconds for something exceptional beats 8 seconds for something mediocre.**

Quality sets the ceiling first; then latency is optimised aggressively.

### The wait is not a design surface

It never becomes a mood-board picker, font or palette chooser, layout selector or questionnaire.
**The host supplies facts only they know; the AI keeps making the design decisions.**

## 9. The artwork carries the identity

Human Test #1 recorded the finding that reshaped this product: strong event designs derive their
identity from a coordinated **theme-specific visual language** — a recognizable illustrative
anchor, supporting motifs, a border or corner treatment, atmospheric artwork, a palette drawn from
that artwork — and, consistently, **restrained typography that does not have to carry the whole
design**. Reviewers' references were teddies, bunnies, bees, balloons, prams, florals, toile,
rocking horses, safari subjects, tea services, bows and heirloom objects. They were invitations.

A system with no illustration has to manufacture distinction out of oversized type, stagger,
monograms and grids, and reads as an abstract flyer. So:

```text
giant monogram + aggressive stagger + grid + tiny metadata
    →  thematic artwork + one excellent restrained headline + quiet details
```

Every card has artwork. "Minimal" is a real choice — a fine border, a paper texture — when the
creative direction calls for restraint, as a black-tie or modern-minimal brief often does.

## 10. Artwork is art-directed, never pasted in

**Art-directed to the layout.** The artwork is generated *for this card's layout*. If the layout
puts the words in the lower half, the brief asks for a subject in the upper half and a quiet lower
half. Never "generate a square picture, then find somewhere to put it." The card should read as the
work of one art director.

**The image model paints; it never writes.** No text, numbers, logos or watermarks in the artwork.
Every word is real text, which is why it can be edited, read by a screen reader, kept exactly
correct, and kept legible.

**Integrated, not boxed.** The strongest references integrate their subject with the page — a bear
above the words, a wreath around them, a floral cluster in a corner — rather than a rectangle with
text beneath. Layouts and briefs are designed for that.

## 11. Named references: capture the look, never the marks

A host who writes "Ralph Lauren bear baby shower" means something specific, and the card should
deliver it: heritage American prep, tartan, navy and cream, leather and brass — and, when they
clearly want it, a teddy in preppy knitwear that unmistakably nods to the brand's bear. **Close
homage is allowed** (owner decision, `CHANGELOG-v7.md`).

What is never on the card: a logo, crest, monogram or wordmark; a brand or character name; copied
campaign photography or artwork. The art brief describes the homage in plain words and never names
the brand, so the image model never receives one.

This is a deliberate commercial risk, not an oversight: it must be reviewed by counsel before launch
(§14). It applies to every named reference, not only fashion houses.

## 12. The deterministic system is the enabler, not the product

The product depends on structured model output, catalog-bounded design choices, a deterministic
compiler for legibility and fit, immutable designs and explicit versioning.

The creative models decide **identity, direction, wording and artwork**. Code decides **facts,
legibility, fit, and the same card on every screen**.

> **AI designs the card. Code keeps the promise that it reads, fits and tells the truth.**

**Architectural success is not product success.** Hosts and guests do not care about briefs,
layout IDs, ink resolution or versions. Human Test #1 is the standing proof: every screen reviewers
called broken passed every gate the old system had. Do not let "technically valid" stand in for
"good design."

## 13. What success looks like

The first experience should feel less like *"an AI generated an invitation"* and more like:

> **"A great stationery designer understood me and made this for me."**

Concretely: immediate thematic specificity, cohesive art direction, excellent restrained
typography, wording with the right voice, a card that reads perfectly on a phone, tasteful
originality, and very little left for the host to fix. Editing should mostly be *"make this mine"*
— a name, a turn of phrase — not *"fix what the AI got wrong."* **One-shot success is a real
product goal.**

Consequences:

- **The invitation is the primary organic acquisition surface.** Every guest opens it. If it is
  unusually beautiful and obviously custom, guests ask what made it.
- **Priority order**, which cost and latency work must not invert: understand the host correctly →
  establish a strong `EventIdentity` → ask only genuinely necessary clarification → design one
  compelling card → generate art that serves it → render it legibly and identically everywhere →
  make setup, invitations and RSVPs easy. Establish the quality ceiling first; optimise cost and
  latency aggressively afterwards.

**Keep the architecture bounded anyway.** A high creative bar is not licence for agent swarms,
unnecessary model hops, generic AI orchestration, a persistent copilot, model-authored CSS, an image
editor, enormous style taxonomies or questionnaire-heavy onboarding.

**Scope stays consumer.** The wedge is consumer events. Do not add enterprise functionality now.

## 14. Conflicts with the canonical set

None known at Revision 7. Open questions that are deliberately unresolved, each owned by a named
phase of `docs/development-plan.md`:

| # | Open question | Where it gets decided |
| --- | --- | --- |
| 1 | ~~Which image model~~ — **decided**: GPT 6.1 Sol for text, GPT Image 2.5 Sunburst for artwork (`technology-decisions.md §8.1`). Still open: transparent-background or full-bleed workflow; how embedded text and unsafe content are detected | Phase 3 validation |
| 2 | The final layout catalog, which shapes each layout supports, slot limits and the shapes' outline geometry | Phase 3 validation |
| 3 | The card-reveal latency target (`spec.md §7.10`, ~30 s working target) | Phase 3 validation measurement |
| 4 | Whether $49 survives comparison with invitation products (`spec.md §3.2`) | Before launch |
| 5 | The clarification question schema and surface (`spec.md §7.6b`) | Phase 5 |
| 6 | An email provider for the reminder/announcement fallback in `spec.md §13.1` (no email provider is in the locked stack) | Phase 10 |
| 7 | Legal review of the close-homage brand line (`spec.md §7.6`): trademark and copyright exposure for a platform that charges to publish, and image-provider policies that may refuse some requests | Before launch |

## 15. Where the work starts

The first slice is the one that answers the only question that matters before building anything
else: **can the system make a card a host would screenshot and send?**

That is Phase 3 validation: the real `generateEventIdentity` against the creative-understanding
corpus, a first `generateCardDesign`, and GPT Image 2.5 Sunburst on real briefs through the API,
judged by people, in colour. The models are already chosen; the phase proves the API reproduces
what the owner saw, fixes the layout catalog and measures latency. Everything else — the compiler,
Creation Mode, invitations — is built on what it proves.
