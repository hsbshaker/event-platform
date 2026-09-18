# Product doctrine

## What this document is

The product we are trying to build, and the creative bar it has to clear. It exists because the
architecture is now well documented and the *product* is not: an agent can read every contract in
this repository, satisfy all of them, and still ship the wrong product.

**Read this before making a creative or product decision. It decides nothing on its own.**
`spec.md` remains the authority for requirements and acceptance criteria, and every other document
keeps the authority it already has. Where this document and a lower one disagree about a
*requirement*, that is a real conflict to raise and resolve explicitly — §14 is the audit trail of
the ones found and resolved so far, and §14a the one still open — never something to resolve by
quietly editing either side.

Principles here are durable. Anecdotes, screenshots and reviewer quotes belong in
`human-test-1/qualitative-findings.md`, which stays the canonical record of what was observed.

---

## 1. The promise

This is not an AI website builder. The promise is:

> **Describe your event. We create the whole experience.**

The reaction we are designing for is:

> "Oh my god, it got exactly what I wanted. I basically one-shotted my event and it is already
> beautiful enough to send."

So the generated site has to be beautiful, specific to *this* event and this host's taste,
emotionally resonant, cohesive, responsive, operationally real, and send-ready — good enough that
the host is proud to share the URL, and good enough that making it is worth telling someone about.

The working test:

> **Would the host screenshot the result and send it to someone before they even publish it?**

If not, the creative experience is not yet at the intended bar. This is a bar on the *first*
result, not on what the host can reach after editing.

## 2. What "MVP" means here

MVP is permission to omit features. It is not permission for mediocre design or shallow
understanding.

> **Design quality and creative understanding are core functionality, not polish.**

The central path is:

```text
raw description → AI understands the event and the taste → compelling concepts → the host chooses
→ a functioning, send-ready site
```

Optimize for excellence on that path and pragmatism everywhere else. The distinction is
deliberate and it cuts both ways:

- **core creative experience** — an extremely high bar, and a weak result here is a *functional*
  failure, not a cosmetic one;
- **secondary features and edge cases** — ordinary MVP scope, and shipping them thin is fine.

This is not "everything must be perfect before launch." It is "the thing we promise must not be
underwhelming." `spec.md §34` is the right shape for accepted limitations: every item there is a
functional gap, and none is an aesthetic concession.

## 3. The make-or-break capability is understanding

The hardest and most valuable capability is not layout generation. It is:

> **Understanding what the host actually means — taste, vibe, subtext, creative intent — and
> translating that into a visual world that feels immediately right.**

Get this wrong and flawless downstream rendering produces a beautiful page for the wrong event.
Human Test #1 demonstrated the cheaper half of the same lesson: a page can be geometry-clean and
still read as amateurish. Technically valid is not the same as good.

Prompts we must eventually handle well are vague, colloquial and taste-heavy:

> "Ralph Lauren baby shower for a boy" · "lemons in Italy but classy" · "Winnie the Pooh but not
> corny" · "girly but not pink" · "modern Indian baby shower" · "old money garden party" · "luxury
> safari" · "cute but not childish" · "something unique, I don't know, surprise me"

The distinctions that matter are the ones a good designer hears immediately: sophisticated vs
playful, heirloom vs childish, editorial vs storybook, restrained vs maximal, literal theme vs
subtle interpretation, tasteful reference vs cliché, when imagery should carry the identity and
when restraint is stronger.

**This is not keyword → palette mapping.** "Girly but not pink" is not a lookup failure; it is a
taste instruction with a negative constraint, and treating it as a keyword match produces exactly
the thing the host asked to avoid.

## 4. Responsibility map

Each stage has one question to answer. Keeping them separate is what stops the system collapsing
into a single vague prompt.

| Stage | Its question | Owns |
| --- | --- | --- |
| **`EventIdentity`** | *What does this host mean, and what creative world should this event belong to?* | Interpretation: category and context, emotional tone, aesthetic character, sophistication level, thematic vocabulary, objects and symbols, material and texture associations, palette territory, what to avoid, and the translation of named references into original language. |
| **sibling planner** (deterministic) | *What style coordinates keep three concepts from colliding?* | Distinct family, tone, typography category, hierarchy, structural directive and attractive-token allotment per sibling (`spec.md §7.7`). |
| **`ConceptPremise` ×3, as one set** | *What are three worthwhile creative choices, from one understanding?* | Which supported facet each concept foregrounds, its organizing idea, the experience it creates, why it is a real alternative to the other two, and the register that follows (`spec.md §7.7a`). Never a new fact, motive, tension or constraint. |
| **`DesignIntent` ×3** | *What is the most convincing design for **this** premise?* | Family, tone, palette, typography pairing, density, composition. |
| **`CompositionTree` ×3** | *How is this concept actually composed?* | Structure, nesting, grouping, hierarchy, relative size, section order and surfaces, alignment, structural motifs, mobile intent. |
| **`VisualArtIntent`** (Phase 4, approved — §9) | *What artwork would serve this composition?* | Art direction for a generated asset, as a sibling of the tree, never inside it. |
| **compiler + renderer** | *Is this safe, legible, fitting and responsive?* | CSS, breakpoints, type scale, spacing, color, contrast, touch targets, overflow, nesting validity, geometry verification, business logic. |

**`EventIdentity` is this product's creative interpreter**, and it is the reason a raw prompt never
reaches a generic generator. The intended flow is:

```text
raw prompt + optional inspiration
  → EventIdentity
  → optional adaptive clarification, creative or boundary (§6)
  → refined EventIdentity
     (a boundary question makes the identity provisional and holds the rest)
  → ConceptPremise ×3, planned as one set
  → DesignIntent ×3
  → CompositionTree ×3  (+ optional VisualArtIntent, §9)
  → deterministic compiler → ResolvedDesignSpec → renderer
```

It is **not**:

```text
raw prompt → generic "make me a website" prompt → website
```

That shortcut fails for four separate reasons, each sufficient on its own: a generic generator has
no notion of an *event* — no host, no date, no RSVP, no registry, no guest — so it optimises for a
plausible page rather than this event's meaning; it bypasses every constraint recorded here, since
the originality rule, the safety constraints and the visual direction are all properties of the
*brief*; it leaves nothing to re-derive from, because `EventIdentity` is persisted and a raw prompt
piped downstream is not; and it hands the host back the art direction this product exists to take
off them.

The bar for `EventIdentity`'s output: **a strong human designer reading it should know what
assignment they have been given.** The current schema
(`model-schemas/event-identity.schema.json`, `spec.md §7.5`) already carries most of this shape —
`creativeDirection`, `toneKeywords`, `paletteIntent`, `visualMotifs`, `textureDirection`,
`typographyDirection`, `copyTone`, `hostConstraints`, `creativeGuidance`,
`inspirationSummary`. Whether it is
*sufficient* is a Phase 4 question. This document proposes no schema change.

## 5. Grounded facts vs creative interpretation

The single most important boundary in the interpreter, and the easiest one to get wrong in a way
that embarrasses the host in front of their guests.

**Grounded facts** come only from the host's input, trusted saved event data, or later setup:
hosts and names, event type, date, time, venue, address, RSVP deadline. If supplied in the prompt,
extract and carry them forward exactly. **If not supplied, do not invent them.**

**Creative interpretation** is where the model should be generous. "Lemons in Italy but classy" may
legitimately imply Mediterranean warmth, citrus leaves, linen, ceramic detail, refined still-life
artwork, an ivory / muted lemon / olive palette, and an instruction to avoid cartoon citrus.

The same prompt must **not** yield the claim that the event is in Positano, or outdoors, or
black-tie, or any other statement of fact the host did not make. Aesthetic implication is
inference. A date, a place or a dress code is a fact, and facts are quoted, never inferred.

## 6. Adaptive clarification

**Approved**, and canonical as `spec.md §7.6b`. `EventIdentity` may decide it needs one thing
clarified. This must never become a setup wizard — a wizard is a fixed, sequential, gating intake
of information the product needs; this is a small number of questions, generated from something
actually present in this prompt.

Two things can be unresolved, and they are not the same kind of thing. **A creative choice is
ours** — the host came here to be relieved of it. **A human boundary is not**: a decision that
belongs to the host because it affects a real person. Capability is not authority.

> **Understand aggressively. Infer creatively. Ask selectively.**

### Creative clarification

**The preferred number of questions is zero.** Ask only when several plausible creative readings
exist *and* choosing wrong would materially change whether the host likes the result. Usually none;
sometimes one or two; a working ceiling of three before concepts are generated.

Questions are generated from the actual ambiguity, never from a fixed list. The test:

> **Would different answers produce meaningfully different creative identities?**

If no, do not ask. For "Ralph Lauren baby shower for a boy", a question that passes is *"What side
of that look are you drawn to?"* — heritage/equestrian, heirloom teddy, country-club prep — or
*"How playful should it feel?"* — mostly sophisticated, sophisticated with a little whimsy, more
playful/storybook.

Every **creative** question always offers **"You decide"** or **"Surprise me"**. A host should never
need design vocabulary to use a design product, and a host who has none must not get a worse result
than one who does. That escape is also why a creative question never holds anything up: the host can
always hand the call back, so concepts are never waiting on taste.

### Boundary clarification

Rare, and a different thing entirely. Sometimes the brief cannot be written without taking a
position on behalf of a real person that the host never settled — what may be said about them, what
may be shown of them, who is spoken for, what someone has agreed to. We may be perfectly capable of
choosing. We are not the one who gets to choose.

Asked only when all of it holds: the position is genuinely consequential and unsettled; it is not a
matter of taste; the brief cannot do its job while declining to take it; and one focused question
resolves it. Never triggered by a subject merely being sensitive, emotional, cultural, familial,
personal or medical — that is ordinary material and we handle it. Never for missing logistics, never
for missing aesthetic preference, and creative delegation does not reach it, because nobody can hand
over permission that was never theirs to give.

It asks the host to state the boundary they can **legitimately affirm as settled** — never treating
their preference as authority over someone else. It offers **no** "You decide": offering to make the
decision would contradict the only reason for asking. Exactly one such question per response, asked
alone.

**It is the one thing that may hold concepts.** The identity returned beside it is *provisional* and
does not flow downstream; the host answers, `EventIdentity` runs again, and only a result with no
boundary question becomes the real brief. This is not a wizard: it is one question, asked because
the alternative is deciding something that was never ours.

## 7. What must never be asked before concepts

Two categories, for two different reasons.

Neither is relaxed by §6's boundary route. That route is a narrow, separately defined exception for
an authority question — never a way to ask for a fact or a design decision.

**Logistics — never a gate on design.** The creative stage must not demand date, time, venue,
address, RSVP deadline or any other operational field before generating concepts. Extract them if
the prompt contains them; otherwise collect them after the host has chosen a design. The path is
*describe → see compelling designs → choose → complete the details*, and `spec.md` already requires
this: required details are publish requirements, not generation blockers, and "no field ever waits
for the host to finish the form before concepts appear" (`§7.3`, `§23.1`, `§0b`). Concept creation
is not an intake form.

**Design decisions — never asked at all.** This is the existing principle, unchanged:

> **AI should remove decisions, not create more decisions.**

Do not ask which font, whether the hero sits left or right, what grid, which heading treatment,
which hex values. Those are the decisions the product is hired to make. Adaptive clarification
exists to understand the desired *identity*, never to outsource the design.

## 8. Three directions, not three variations

The three concepts must feel like three genuinely different creative directions that a good
designer could defend from the same brief — not one layout in three palettes, one design in three
fonts, or three minor variations.

For a heritage/preppy baby shower, three legitimate directions might be *Heirloom Teddy*,
*Equestrian Nursery* and *Heritage Storybook*: all faithful to one `EventIdentity`, none a cosmetic
restatement of another. `spec.md §7.7` and `§11.9` already enforce the mechanical half of this
(distinct families, tones, directives, token allotments, skeleton-signature collisions below .70).
Mechanical distinctness is necessary and not sufficient: three trees can differ structurally and
still feel like the same idea.

**This was measured, and the mechanical half really was not enough.** The T22 evidence run produced
three concepts per event from a byte-identical brief separated only on those coordinates, and the
independent blind review found no set that cleared the bar: the three names above are what this
section asks for, and what came back was closer to one name three times. So `spec.md §7.7a` adds the
stage that was missing — three creative propositions, authored as a set, before any styling —
because the examples above are *premises*, not parameter values, and nothing in the pipeline had
been asked to author one. `docs/designintent-sibling-convergence.md` is the record.

The correctness half of this section is unchanged and outranks it: three directions must be three
readings of one truth, never three competing claims about what the event means.

## 8a. The generation experience

Generation takes time because the work is real. That time is a **product surface**, not a loading
state to hide.

> The host should feel **"I'm watching my event come to life"**, not "I'm waiting for AI to finish."

This is never an argument for slowing anything down. **The moment useful output is genuinely ready,
reveal it.**

### Show real artifacts, never theater

The waiting experience surfaces **structured creative artifacts the pipeline actually produced**, as
they become available: interpreted creative signals, palette territory, visual vocabulary, concept
names, art direction, visual fragments, composition previews, concept readiness.

After *"Ralph Lauren baby shower for a boy, classy not cheesy"*, that might surface — in order, as
each is genuinely resolved — *heritage · heirloom · polished · understated · restrained whimsy*,
then a palette, then visual-language cues, then the three directions.

Two hard limits:

- **No chain-of-thought and no hidden reasoning**, ever. What is shown is the *output* of a stage,
  not how the model got there.
- **No fabricated progress.** No invented percentages, no simulated model "thoughts", no stage that
  claims work which has not happened. A spinner that lies is worse than a spinner.

> Surface real structured creative artifacts produced by the pipeline, never simulated reasoning.

The shell itself may gradually take on the event's creative world as `EventIdentity` and
`DesignIntent` resolve — a citrus identity warming, a black-tie one staying restrained and minimal.
That is a direction to explore, not a requirement that every generation screen be themed, and the
shell stays usable and legible whatever it picks up.

### Concepts arrive one at a time

Concept 1 is not held hostage until Concept 3 is finished. Identity resolves, three directions
begin, and **each concept becomes available the moment it is genuinely ready** — the host can start
inspecting a finished one while the others are still compiling. The product wants concept-level
readiness, not a single monolithic "generation complete". `spec.md §7.10` already requires each
concept to render as soon as its resolved spec exists; this states the intent behind it.

### Two equally good ways to spend the wait

While generation runs, the host may **optionally** fill in facts only they know — honoree or event
name, date, time, venue, address, RSVP deadline, host names. Conceptually: *"We're creating your
event. Keep watching, or add the details while we work."*

- **The magic path** — watch the identity and the concepts emerge.
- **The productive path** — fill in the logistics while the AI does the creative work.

Both are first-class and the host may switch freely. This is **not** a second onboarding wizard, and
the distinction from §6 and §7 holds exactly: **missing logistics never block creative generation,
are never asked during clarification on either route, and are never invented.** Facts present in the prompt
are extracted, preserved and pre-filled; facts absent from it are simply absent until the host
supplies them, during generation or after choosing a concept.

This is also why the wait can be offered as useful rather than merely tolerable: the work being
asked of the host is work only the host can do.

### A detail change is a content edit, not a new idea

Changing a venue, adding a date, moving a start time, setting an RSVP deadline: these update the
rendered content deterministically. They do **not** re-run `EventIdentity`, `DesignIntent` or the
composition. That is the existing re-fit contract (`spec.md §7.9`, `§4.10`, `§32 #20`) and it is the
right boundary — the host changed a fact, not their mind about the event.

*"Make it more romantic and less preppy"* is a different thing entirely: a creative request, and
redesign behaviour. The editing system is not designed here.

### Latency, as a north star rather than an SLA

The canonical p75 targets are `spec.md §7.10` and this document does not move them. Stated as
product intent:

| | |
| --- | --- |
| `EventIdentity` visible | near-immediate, ~≤ 5 s |
| First useful concept | as soon as it is ready, ~≤ 15–20 s |
| All three concepts | ~≤ 45 s |
| Heavy cases once imagery exists | may initially reach 60–90 s |
| Selection → send-ready realization | ~≤ 30 s |

> **45 seconds for something exceptional beats 12 seconds for something mediocre.**

Quality sets the ceiling first; then latency is optimised aggressively, because a minute is a long
time to hold someone's attention even when the result is worth it. Two of these numbers do not yet
reconcile with `spec.md §7.10` — see §14 conflict 9.

### The wait is not a design surface

Everything in §7 still applies. The generation experience may not become a mood-board picker, a
font or palette chooser, a layout selector or a questionnaire. **The host supplies facts only they
know; the AI keeps making the design decisions.** Reducing *perceived* latency is the goal; hiding
*real* latency is not.

## 9. Theme-specific visual language — a Phase 4 direction, not an approved feature

Human Test #1 recorded a finding this document treats as important:

> Strong event designs often derive identity from a coordinated **theme-specific visual language**,
> not from typography and geometric decoration alone.

The current system can produce a technically sophisticated layout that still reads as an abstract
editorial flyer. Reviewer reference invitations were built around a recognizable illustrative
anchor, supporting motifs, a border or corner treatment, atmospheric artwork, a palette drawn from
that artwork — and, consistently, **restrained typography that did not have to carry the whole
design**. Anchors they cited: teddy, bunny, bee, balloon, pram, florals, toile, rocking horse,
safari subjects, tea service, scenery, food and object motifs, bows and heirloom objects.

A **hypothesis**, not established fact: because the system has no illustrative capability, it has
had to manufacture distinction out of oversized type, stagger, monograms, grids, rules and
asymmetry — which may partly explain both F1 (typography overreach) and F2 (decorative dominance).
A strong thematic anchor may let type and layout become simpler and more confident:

```text
giant monogram + aggressive stagger + grid + tiny metadata
    →  thematic artwork + one excellent restrained headline + a subtle supporting motif
```

**Status: approved for Phase 4**, and canonical as `spec.md §7.6a`. Imagery is optional,
art-directed and compiler-placed; it is never mandatory, never model-positioned, and never reopens
host photography, galleries or stock imagery. Neither the image model nor the artwork schema is
selected. What changed the decision: reviewer reference invitations showed thematic visual language
behaving as part of core design quality rather than as decoration.

## 10. If imagery happens, it is art-directed and optional

Two rules that would bind any future visual-art capability.

**Art-directed, not pasted in.** Artwork is generated *to serve a composition*. If the composition
puts the title left and art right, the brief asks for a subject weighted right, negative space
left, and a crop-safe frame. Never "generate a square picture, then find somewhere to put it." The
page and the artwork should read as decisions by one art director. Architecturally this keeps
`VisualArtIntent` a *sibling* of the `CompositionTree`, never a field inside it: an art brief is
irreducibly descriptive, and free text inside the tree is exactly what `spec.md §32 #19` forbids.

**Optional, and chosen by the creative direction.** "Every event site gets an AI image" must not
become a product rule. A sophisticated black-tie concept is often stronger with none; a lemon,
teddy, botanical, safari or storybook concept may need one. Four modes are useful for planning —
typography-led, illustration-led, atmosphere-led, framed/editorial — as planning concepts only, not
schema.

Two consequences worth deciding early rather than discovering late:

- **Transparency may be a requirement, not a nicety.** The compelling references integrate their
  subject into the page rather than showing it inside a rectangle. For illustration-led and framed
  modes, transparent-background artwork is likely a hard requirement — and alpha reliability varies
  by image model, so this is an input to model *selection*, not something a prompt adds afterwards.
- **Ambient artwork is the same visual language, not a second feature.** Very faint background art
  — softly faded, cream-washed, barely noticeable — is another expression of one identity. A lemon
  identity: anchor a refined lemon basket, ambient faint citrus branches, motif a small citrus
  ornament, palette cream/lemon/olive. An heirloom teddy identity: anchor an original teddy
  illustration, ambient a faint textile atmosphere, motif a small bow or stitch, palette
  cream/powder blue/warm brown. Text readability and semantic hierarchy always win.

## 11. Named references become original language

"Ralph Lauren baby shower" must never produce a Polo Bear, a Ralph Lauren logo, copied campaign
artwork or proprietary graphics. It should produce heritage American prep, equestrian detail,
tartan, navy and cream, leather and brass, heirloom teddy energy, classic editorial typography,
restrained luxury.

**Understand the taste signal; never reproduce the protected asset.** This already exists as
`spec.md §7.6` and in the Event Identity prompt; it is repeated here because it is a property of
interpretation, and because a brief that names a brand has already failed whatever the output looks
like. It applies to every named aesthetic reference, not only fashion houses.

## 12. The deterministic architecture is the enabler, not the product

None of this abandons what we built. The product depends on structured model output, trusted
primitives, a deterministic compiler and validator, geometry verification, accessibility
constraints, safe responsive rendering, immutable resolved specs and explicit versioning.

The creative model decides **identity, structure, hierarchy and art direction**. The trusted system
decides **execution laws, safe rendering, validation, fit and responsive realization**.

> **AI invents the composition. The renderer owns the laws of physics.**

The deterministic system exists to make creative freedom *safe*. It must never become the product.

**Architectural success is not product success.** Hosts and guests do not care about
CompositionTrees, compiler versions, resolved specs, geometry gates, proof harnesses or model
contracts; those matter exactly as much as the result they produce. Human Test #1 is the standing
proof of the distinction: every screen reviewers called broken passed every gate we had. Do not let
"technically valid" stand in for "good design."

## 13. What success looks like

The first experience should feel less like *"an AI generated a website"* and more like:

> **"A great event creative director understood me and built this for me."**

Concretely: immediate thematic specificity, cohesive art direction, excellent typography,
intentional hierarchy, strong mobile behaviour, tasteful originality, and very little corrective
work left for the host.

Editing should mostly be *"make this more mine"*, not *"help me fix what the AI got wrong."*
**One-shot success is a real product goal**, not an aspiration.

Two consequences:

- **The guest site is probably the primary organic acquisition surface.** The host sends it to
  every guest. If it is unusually beautiful and obviously custom, guests ask what made it. That
  raises the stakes on visual quality, originality, polish, credibility and the mobile experience —
  the guest site is not merely an event utility. `spec.md §2.3` already says the guest experience
  "must be as polished as the concept preview."
- **Priority order for Phase 4**, which cost and latency work must not invert: understand the host
  correctly → establish a strong `EventIdentity` → ask only genuinely necessary clarification,
  creative or boundary →
  generate genuinely compelling directions → compose them intentionally → create or integrate
  theme-specific art where appropriate → render safely and responsively → make setup and publishing
  easy. Establish the quality ceiling first; optimise cost and latency aggressively afterwards.

**Keep the architecture bounded anyway.** A high creative bar is not licence for agent swarms,
unnecessary model hops, generic AI orchestration, a persistent copilot, model-authored CSS,
unrestricted image placement, enormous style taxonomies or questionnaire-heavy onboarding. A stage
can be highly specialized through its system prompt, context, examples, structured contract and
validation without needing its own model or its own agent.

**Scope stays consumer.** The initial wedge is consumer events and Phase 4 belongs entirely to
making that experience exceptional. The underlying concept may later extend to company and
enterprise events, branded experiences, team collaboration, organizational brand controls and
richer operational workflows; the architecture should not gratuitously foreclose that. Do not add
enterprise functionality now.

## 14. Conflicts with the canonical set, and how they were resolved

The Phase 4 readiness pass resolved every conflict this document originally recorded. Kept here as
the audit trail for decisions that changed.

| # | What it was | Resolution |
| --- | --- | --- |
| 1 | AI-generated decorative site imagery was an explicit MVP non-goal (`spec.md §5.2`, `§32 #32`, `design-system.md §15.11`) while this document argued for thematic artwork | **Resolved by decision.** Optional AI-generated thematic artwork is approved for Phase 4 as `spec.md §7.6a`. `§5.2` now excludes host, stock, mandatory and model-placed imagery instead of generated artwork; `§32 #32` and `design-system.md §15.11` restate it; `§11.11` states the boundary directly; `§33` no longer defers it. Host photography remains excluded |
| 2 | No clarification loop existed anywhere, and `spec.md` forbids questionnaires and wizards | **Resolved by decision, then expanded by a second.** *Original (v4):* adaptive creative clarification approved as `spec.md §7.6b`, bounded to taste, capped at three, never logistics, never a gate; `§32 #9` names it the one permitted pre-concept question. *Expanded (v5, approved after the first sealed challenge):* clarification runs on **two** routes. Route A is that creative gate, unchanged. Route B is a rare authority question about a decision the system may not make — no `You decide` option, asked alone, and the **one** thing permitted to hold concepts, behind which the identity is provisional. So "bounded to taste" and "never a gate" now describe Route A, not all clarification. §6 carries both |
| 3 | `model-contracts.md §0` promised "faithful user-intent capture" and nothing tested it | **Resolved, and since exercised.** *Original:* `model-contracts.md §4.5` defined the creative-understanding evaluation contract over `docs/model-evals/creative-understanding.json`, each dimension labelled deterministic, mixed or qualitative; no runner existed yet. *Since:* the runner exists, four evidence classes are defined and kept apart — known regression, pre-registered validation, a spent sealed challenge used only diagnostically, and a fresh sealed challenge — and all four have now been run at `v5`, the fresh one exactly once. The promise is tested, and what the testing said is §15 |
| 4 | Phase 4's exit condition was operational only | **Resolved.** The Phase 4 row now carries a creative exit criterion requiring evidence against §4.5 — understanding, fact discipline, selective clarification, distinct directions, intent fidelity, and *personalization rather than rescue*. Thresholds are calibrated on first real run, not invented |
| 5 | `spec.md §11.9` stated the ≥ 70% bar flatly; `CHANGELOG-v6.md` called it provisional | **Resolved by removing the number from both regression-threshold lists.** It is a launch gate, not a regression threshold: a code change cannot re-run it. Human Test #1 was stopped early, produced calibration evidence only, and established no pass/fail result; Human Test #2 is the launch gate and calibrates its own threshold. `spec.md §11.9` and `event-renderer-system.md §9` now say so |
| 6 | Three sections cited Revisions absent from the repository | **Resolved where the requirement was recoverable.** `spec.md §11.11` now states the imagery boundary directly; `event-renderer-system.md §8`/`§9` cite it instead of the absent Revision 1. `model-contracts.md §4`/`§5.2` still defer to a Revision 1 for the EventIdentity field list and the DesignIntent input contract — see §14a |
| 7 | `spec.md` header read "Revision 5" while `§0a`/`§0b` describe 6 and 6.1 | **Resolved.** The header reads Revision 6.1 |
| 8 | `spec.md §32 #46`, "smallest implementation that satisfies the product" | **Wording only, unchanged.** It is a scope instruction; §2 names the misreading to avoid |

| 9 | `spec.md §7.10`'s p75 targets — Event Identity ≤ 5 s, first concept ≤ 15 s, all three ≤ 45 s — predate the artwork decision (`§7.6a`) and budget nothing for image generation | **Open, and deliberately not overwritten.** Two mismatches: §8a's product intent says the first concept lands in ~15–20 s where §7.10 says ≤ 15 s, and §8a expects heavy imagery cases to reach 60–90 s where §7.10 says all three in ≤ 45 s. The canonical numbers stand unchanged; §7.10 now records that imagery is unbudgeted there. Re-set them deliberately when Phase 4 has measured a real imagery path — never by quietly widening a target to match what was built |

### 14a. Still unresolved

**`model-contracts.md §4` and `§5.2` defer to a "Revision 1" that is not in this repository**, for
the EventIdentity field list and the DesignIntent input contract. Not invented here, because the
intended target is not recoverable with confidence: `docs/history/` holds only `design-system_v1/v2`
and `spec_v1`–`v4`. The requirement survives in artifacts that *are* present — the field list in
`docs/model-schemas/event-identity.schema.json` and `spec.md §7.5`, the DesignIntent contract in
`docs/model-schemas/design-intent.schema.json` — so nothing is lost, but the citation is a dead
pointer. Inline both at their citing sections when Phase 4 touches those contracts.

## 15. Where Phase 4 stands

The measurement gap is closed and the rubric has been run. `generateEventIdentity` exists and is
the real creative interpreter; `model-contracts.md §4.5` defines how its output is judged.

Six evidence runs have happened, and the first two are why the other four were needed. **`v3`** was
evaluated against the fourteen-case regression suite — 13/14 mechanical, the one failure since
established as an evaluator false positive — and failed its independent qualitative gate. Its
remediation **`v4`** was then evaluated against an independently authored sealed challenge: 11/12
mechanical, and it failed that gate too.

The sealed challenge was the sharper result. It asked **zero** questions on all twelve cases, and
one of those could not be answered without the system settling a matter it had no authority to
settle — which the mechanical rubric cannot see, and a human reviewer did. Its one mechanical
failure was a second defect: a term the host had called a nickname, stored as the person's name.

`v5` is the remediation. Clarification runs on two routes — the unchanged creative gate, and a rare
authority question the system may not answer for the host (§6) — and `suppliedFacts` distinguishes a
name someone goes by from a label attached to them.

**Phase 4A passed.** The eight-step sequence this section used to set out as future work was carried
out in order, and those steps are the remaining four runs: the known regression suite; the
pre-registered validation set; the spent challenge, re-run into its own directory as a diagnostic;
then an **independently authored sealed challenge v2**, with adding that corpus file, and nothing
else, as the whole change; one shot at it; a blind qualitative review; and an explicit **GO / NO-GO**
that returned **GO** on 2026-09-15. The six
SHAs and the numbers are in `model-contracts.md §4.6`. The decisive evidence: 11/12 mechanical on
the fresh corpus, both clarification routes firing where the frozen labels expected them and
nowhere else, and a blind review of 7 Excellent, 5 Good, 0 Borderline, 0 Fail.

**What the GO does not settle, in this document's terms.** §2 says design quality is core
functionality, not polish, and §7 says the product exists to remove decisions rather than to be
merely competent. Against that bar, 7 of 12 Excellent is a pass and not an arrival. Four habits
recurred in the blind review — unsupported anti-sentimental and anti-theatrical restriction,
reusable finishing language, a verbal identity thinner than the visual idea, and a standing
preference for polish and emotional moderation. They are watched through DesignIntent, Composition
and rendered concepts rather than fixed in the interpreter now, because where the leverage lies is
not yet known. Every eval set is spent, and the rule that follows from this whole episode is the
one worth carrying: a benchmark score is only evidence while nobody has tuned against it.

Everything else in Phase 4 — sibling planning against a real identity, DesignIntent, composition,
spend controls, and any artwork at all — came after that answer, because it is the answer that
decided whether the rest was worth building on the identity we have. It was, and
`development-plan.md` and `phase-4b-plan.md` carry what happens next.
