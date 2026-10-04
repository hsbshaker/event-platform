# Card System
## Revision 1 — the AI-designed invitation card

**Path:** `docs/card-system.md`
**Status:** Authoritative architecture for the generated invitation card, the envelope, and the
guest page that sits under them. Replaces the website renderer architecture of `spec.md`
Revision 6, which is retired (`docs/CHANGELOG-v7.md`).
**PRD:** `spec.md` Revision 7
**Model contracts:** `docs/model-contracts.md`
**Application design system:** `docs/design-system.md`

---

# 0. What this document is

The product generates one thing creatively: a **digital invitation card**, in the spirit of a
Paperless Post card. Guests receive it in an envelope that opens; under the card is a standard
event page with details, RSVP and registry. This document defines how the card is designed,
generated, made legible, laid out, stored and rendered, and where the AI's authority ends.

> **The AI designs the card. Application code sets the words, guarantees they are legible, and
> renders the same card on every screen.**

The card is the only themed, generated surface. The event page under it uses one neutral house
style for every event (`spec.md §21`, `docs/design-system.md`).

---

# 1. Invariants

1. **One card face, in one of six shapes.** Front only. Rectangle, rounded rectangle, arch or oval
   at portrait 5:7; square or circle at 1:1 (§2.1). It is the same design on every screen; only its
   size changes.
2. **Every card has generated artwork.** The artwork may be a full illustration or as little as a
   border or a paper texture; the creative direction decides how much (§2.4).
3. **The artwork contains no text.** No letters, numbers, names, dates, logos, wordmarks or
   watermarks. Every word on the card is real text set by application code over the art.
4. **Facts come only from the host.** Names, date, time, venue, location and RSVP deadline on the
   card are rendered from event data the host entered or confirmed. The model never writes them
   and never invents them.
5. **The model may write wording.** It drafts the card's title and invitation line (§2.5). The host
   can edit both. Wording never introduces a fact the host did not supply.
6. **Legibility is guaranteed deterministically.** Ink colour, any legibility panel, font size and
   line breaks are chosen by code, never by a model, and every card text meets 4.5:1 contrast
   against the artwork behind it (§4.2).
7. **Text always fits.** Card text is laid out by one deterministic function that never lets text
   leave its zone; inputs that could not fit are bounded at entry (§4.3).
8. **The raw host prompt never reaches the image model.** The image model receives an art brief
   derived from the persisted `EventIdentity` plus layout and shape rules (§3). Inspiration uploads are
   inputs to `EventIdentity` only and are never sent to the image model; the only image it ever
   receives is the design's own earlier artwork, as a reference for a shape switch (§7).
   Brand references follow `spec.md §7.6`: close homage allowed, never a logo, wordmark, brand or
   character name, or copied campaign artwork.
9. **Generated design data is immutable.** A `CardDesign` and its artwork never change once
   generated. Host edits live on the event; "Try another direction" creates a new design; artwork
   generated when the host switches to a shape the existing artwork does not fit is an additional
   asset, never a change to the first (§5, §7).
10. **No templates of art, no stock, no uploads on the card.** Artwork is generated for this event's
    card. A small catalog of text layouts is allowed and expected (§2.3); it is where the words go,
    not what the card looks like.

---

# 2. The card

## 2.1 Canvas and shapes

- Front face only, in one of **two proportions**: **portrait 5:7** (1000 × 1400 card units) or
  **square 1:1** (1000 × 1000 card units). There is no landscape card.
- Geometry is defined in **card units**. Every zone, margin, outline and font size is expressed in
  card units.
- The card renders at any width by uniform scaling, so its proportions, outline, line breaks and
  layout are identical on a 390px phone and on desktop. Nothing reflows.
- Generated artwork is produced at (or resampled to) a fixed raster at the shape's proportion,
  sized for sharp display on high-density phones. GPT Image 2.5 Sunburst takes custom sizes in
  multiples of 16, so it paints each proportion natively: **1440 × 2016** for 5:7 and
  **1440 × 1440** for 1:1, PNG, opaque and full bleed (fixed in Phase 3 validation,
  `technology-decisions.md §8.1`).

**Shapes.** Six, each a proportion plus an outline:

| Shape | Proportion | Outline | What it asks of the artwork |
| --- | --- | --- | --- |
| `rectangle` | portrait 5:7 | square corners | full bleed |
| `rounded-rectangle` | portrait 5:7 | softly rounded corners | full bleed; nothing important in the corners |
| `arch` | portrait 5:7 | flat bottom, semicircular top | top corners are cut away; a subject at the top sits under the curve |
| `oval` | portrait 5:7 | ellipse inscribed in the canvas | all four corners are cut away; subject and any border stay inside the ellipse |
| `square` | square 1:1 | square corners | full bleed |
| `circle` | square 1:1 | circle inscribed in the canvas | all four corners are cut away; everything important stays inside the circle |

- The outline is geometry defined in code and applied by the renderer as a mask over the artwork.
  Outside the outline is transparent: the page shows through. A model never draws, positions or
  sizes the outline, and the outline is never part of the artwork.
- Each shape defines a **text-safe area**: the region inside its outline, inset by a margin, where
  text zones may sit. Text never touches or crosses the outline.
- **The design picks the shape** (§3); the host may switch it (§7). Every artwork records the
  shapes it **fits** (§2.4). Switching to a shape the current artwork fits is instant and
  deterministic. Switching to any other shape — the other proportion, or another outline when the
  artwork follows its own outline — generates new artwork for that shape from the same brief, with
  the current artwork passed as a reference so the subject stays the same: the same bear, rearranged
  for the new outline, not a different bear. GPT Image 2.5 Sunburst accepts reference images, and
  whether it holds a subject this way over the API is a Phase 3 validation check; where it cannot,
  the brief alone is used.
- Rounded-corner radius and the exact outline geometry are part of the layout set (§2.3) and are
  fixed in Phase 3 validation.
- A decorative edge such as a scallop or wave can be painted as `framed` artwork inside a rectangle;
  that is artwork, not a shape. Die-cut scalloped cards remain deferred (§10).

## 2.2 Layers

Bottom to top:

1. **Artwork** — the generated image, full bleed at the shape's proportion, masked to the shape's
   outline.
2. **Legibility panel** (optional) — a soft paper panel, defined by the layout, placed behind a text
   zone only when the ink rules of §4.2 require it. Its colour is derived from the artwork.
3. **Text** — live text in the layout's zones, in the design's typography pairing and the resolved
   ink colour.

The card's text is real, selectable, screen-reader-readable text. The artwork is decorative
(`alt=""`); everything a guest needs is in the text and on the page below.

## 2.3 Layout set (`card_layouts_v1`)

A **layout** says where text goes and, in return, where the artwork must leave calm space. Each
layout declares the shapes it supports, and for each of them defines:

- its text zones, as rectangles in card units inside the shape's text-safe area, and which slots
  (§2.5) each zone holds, in order;
- alignment per zone;
- size range (maximum and minimum, in card units) and maximum lines per slot;
- the character limit per slot that guarantees fit for every pairing **and every shape the layout
  supports** (§4.3), so switching shape can never make accepted text stop fitting;
- the composition instruction added to the art brief: where the subject may sit and which regions
  must stay quiet;
- the artwork's **presence**: how much of the card it should occupy outside the quiet regions (for
  example, substantial clusters in two corners, or a subject filling the upper half). Told only
  where to stay out, image models over-correct into a few token props on an empty field, which reads
  unfinished; the layout states the presence it wants as well as the space it reserves;
- its legibility-panel shape, used only when §4.2 needs it.

The set validated in Phase 3 (`docs/model-evals/phase-3-validation.md`; the tested geometry,
composition and presence rules are in `scripts/phase-3/catalog.mjs` until Phase 4 makes them
versioned product code):

| Layout | Text | Artwork | Shapes | Art modes |
| --- | --- | --- | --- | --- |
| `art-top` | lower part, centred | subject in the upper half; the bottom 45% stays clear | all six | `illustration` |
| `art-bottom` | upper part, centred | subject grounded at the bottom; the top 45% stays clear | all six | `illustration` |
| `framed` | centred panel | border, wreath, garland or frame — rich, built from the event's motifs — around a quiet centre | all six | `framed`, `minimal` |
| `corners` | centred | substantial motif clusters in two or more corners; centre quiet | `rectangle`, `rounded-rectangle`, `square` | `illustration`, `framed` |
| `atmosphere` | centred | full-bleed wash or texture with real depth, low contrast through the centre | all six | `atmosphere`, `minimal` |

Phase 3's two judged misses were both sparse (a frame around a large empty centre, a quiet wash),
so the presence rules of `framed` and `atmosphere` are the first thing to strengthen.

Not every layout suits every shape (text clustered toward a corner does not belong in an oval or
a circle); a layout's supported shapes are part of the set and are validated (§4.1).

Layouts are chosen by the card-design model call from this catalog by ID. The catalog — layouts,
their per-shape zones and limits, and the six shapes' outlines — is versioned together
(`card_layouts_v1`); adding or changing a layout or a shape is a version bump and re-runs the layout
fixtures (§9). Layouts are never shown to the host as a gallery and the host does not pick one.

## 2.4 Art modes

The design declares one mode, which tells the art brief how much the artwork carries:

| Mode | What the artwork is | Typical layouts |
| --- | --- | --- |
| `illustration` | a recognizable subject anchors the card (teddy, lemon basket, hot-air balloon, florals) | `art-top`, `art-bottom`, `corners` |
| `framed` | artwork as border, wreath, corner treatment or frame around the text | `framed`, `corners` |
| `atmosphere` | no discrete subject; a soft thematic wash, scenery or texture | `atmosphere` |
| `minimal` | a refined border or paper texture only; the typography leads | `framed`, `atmosphere` |

Every card has artwork; `minimal` is how the system expresses a restrained, typography-led card.
Mode/layout compatibility is part of the layout set and is validated (§4.1).

**Which shapes an artwork fits** depends on its mode:

| Mode | Fits | Why |
| --- | --- | --- |
| `illustration`, `atmosphere` | every shape of its proportion that the layout supports | The art prompt carries the crop-safety rule of the tightest of those outlines (everything important inside it; corners hold only background that can be lost), so any of them can trim it |
| `framed`, `minimal` | only the shape it was generated for | Borders, frames and wreaths follow the outline; a rectangular border cut into an oval looks wrong |

Switching to a shape outside the fit set generates artwork for it (§7). Earlier artwork is kept, so
switching back is instant.

## 2.5 Text slots

| Slot | Source | Notes |
| --- | --- | --- |
| `title` | AI-drafted wording, host-editable | The card's headline and the event's effective title everywhere (`spec.md §20.2`). If the host supplied a title, it is used as given. |
| `invitationLine` | AI-drafted wording, host-editable | One short line such as "Please join us for a baby shower". |
| `babyName` | host fact | Shown when present. |
| `hosts` | host fact | e.g. "Hosted by Maya & Tom". |
| `date` | host fact | Formatted by code from the stored date. |
| `time` | host fact | Start time; end time when present. |
| `venue` | host fact | Venue name, else the address; the full address is on the page. |
| `rsvpBy` | host fact | Formatted from the stored RSVP deadline. |

Rules:

- **Model-drafted wording** (`title`, `invitationLine`) may use a name only exactly as the host
  supplied it, and never contains a date, time, place, dress code or any other fact. Code checks
  this deterministically where it can (digits, month and weekday names, time expressions, the
  event's known facts) and the evaluation corpus checks the rest (`docs/model-contracts.md §6`).
- **Host wording** — a title the host supplied, or any wording the host edits — is host content:
  bounded only by slot limits, never fact-checked and never re-prompted.
- **Facts** render from event data. A fact the host has not supplied is absent from the published
  card. In Creation Mode a missing required fact shows as a placeholder marked as needing
  confirmation; placeholders are never published (`spec.md §7.3`).
- **Slot limits** are part of the layout set and are enforced at entry, so fitting can never fail.
- A slot with no value takes no space.

## 2.6 Typography

Card typography uses the curated pairings in `src/lib/card/typography.ts` (display face for the
title, body face for everything else; fonts self-hosted in `public/fonts/card/`). The design names
one primary pairing and up to two alternates it judges compatible with the artwork. The host's
font control offers exactly those (`spec.md §20`). There is no free font choice and no per-slot
font choice.

---

# 3. Generation pipeline

```text
host prompt + optional inspiration
  → generateEventIdentity            GPT 6.1 Sol; the only stage that reads the raw prompt
  → (optional) creative clarification, at most three taste questions, usually none
  → generateCardDesign               GPT 6.1 Sol; shape, layout, art mode, typography, wording, art brief
  → validate CardDesign              deterministic (§4.1)
  → assemble the art prompt          deterministic: brief + layout and shape composition rules + global rules
  → generateCardArt                  GPT Image 2.5 Sunburst; at the shape's proportion, no text
  → validate artwork                 deterministic checks, plus the text/safety check fixed in Phase 3
  → resolve ink and panels           deterministic, for every shape the artwork fits (§4.2)
  → persist CardDesign + artwork + resolved ink    immutable
  → reveal the card
```

In parallel with identity, a cheaper structured-extraction call pulls any facts the prompt states
(names, date, time, venue) into the event draft as values for the host to confirm (`spec.md §7.3`,
`§9.2`). Facts never come from `EventIdentity` and are never inferred.

**One design at a time.** Each round generates one card. "Try another direction" runs
`generateCardDesign` again with the host's optional feedback and a summary of every earlier
direction for this event, and must produce a different direction (§4.1).

**Re-prompts and failure.** Each trigger earns at most one re-prompt (or, for artwork, one
regeneration); if the second attempt fails too:

| Step | Trigger | After the one retry fails |
| --- | --- | --- |
| `generateEventIdentity` | invalid structured output | fail visibly with a retry action |
| `generateCardDesign` | schema-invalid output | fail visibly with a retry action |
| `generateCardDesign` | repeats an earlier direction (§4.1) | accept, logged |
| `generateCardDesign` | wording fails the fact check | standard wording for the failing slot (§4.1), logged |
| `generateCardArt` | artwork fails validation | fail visibly with a retry action |
| `generateCardArt` | the provider refuses a brand or character homage | the regeneration comes from a `generateCardDesign` re-prompt (`provider-refusal`) that evokes the character's world rather than its signature look, with a short plain copyright note to the host (`spec.md §7.6`); a second refusal fails visibly, and its retry takes the same step back |

There is no library or template fallback. A failure is shown honestly and the host can retry; it
is never disguised as a finished design.

---

# 4. The deterministic card compiler

No step here calls a model or regenerates artwork.

## 4.1 Validation

- `CardDesign` against its strict schema (`card_design_schema_v1`): enum IDs (shape, layout, art
  mode, pairings), string length bounds, no extra fields.
- Layout ↔ art-mode compatibility; the layout supports the chosen shape; alternates distinct from
  the primary pairing.
- Wording fact check (§2.5), on model-drafted wording only. A failing design earns one re-prompt
  naming the failing slot; if it fails again, that slot is replaced by standard wording (`title`:
  "A Baby Shower"; `invitationLine`: "Please join us for a baby shower"), logged, and visible to the
  host as ordinary editable text. A host-supplied title is never checked or replaced.
- Direction distinctness: a design that repeats an earlier direction's layout, art mode and primary
  pairing together earns its one re-prompt naming the earlier directions.
- Artwork: file type, the requested proportion (5:7 or 1:1) within tolerance, minimum resolution,
  decodable. Detecting embedded text (which covers logos and wordmarks) and unsafe content is
  required; the mechanism is chosen in Phase 3 validation.

## 4.2 Ink and legibility

For each text zone, computed once per artwork, layout and shape — for every shape the artwork fits
(§2.4), so a switch the artwork already fits never waits:

1. Measure the artwork's background in the zone **conservatively**: a high percentile of pixel
   luminance in the direction that lowers contrast, never the mean.
2. Candidate inks: colours drawn from the artwork's own palette first, then a near-black and a
   near-white tuned toward the artwork's hue.
3. Choose the most harmonious candidate (art-derived first) that reaches **4.5:1** against the
   measured background (`src/lib/card/color.ts`, WCAG 2.x luminance).
4. If none does, apply the layout's legibility panel in an art-derived paper colour and choose the
   ink against the panel.

The result (per shape: ink per zone, panel on or off, panel colour) is persisted with the artwork.
A font swap does not change it.

## 4.3 Text fit

One pure, versioned function, `layoutCard(layout, shape, pairing, content)`, decides every slot's
font size and line breaks:

- start each slot at the layout's maximum size and step down to its minimum;
- break lines deterministically and evenly, never leaving a one-word last line where another break
  exists, never breaking inside a word;
- measure from the curated fonts' metrics, with a safety margin that absorbs browser rendering
  differences;
- slot character limits (§2.5) guarantee that every value accepted at entry fits at the minimum size
  in every layout, supported shape and pairing. A test renders every layout × supported shape ×
  pairing with worst-case content in a real browser to prove it (§9).

The renderer sets exactly the lines and sizes this function returns; the browser does not re-wrap
card text. The same function runs when content is saved, when a font or shape is switched and when
the card is rendered, so what the host saw is what guests see.

## 4.4 What the compiler never does

Call a model; regenerate or edit artwork; move, crop or recolour artwork beyond the uniform scaling
and outline mask of §2.1; let a model choose a colour, a size, a position, an outline or a line
break; truncate text silently.

---

# 5. Persistence and immutability

Persist per event:

- `EventIdentity`, with its prompt and schema versions;
- every `CardDesign`: the raw model response, the validated design (including its shape), its
  presentation name and description, and the version set (§8);
- every artwork asset in Supabase Storage, with its proportion, the shapes it fits, image model,
  art-prompt version, and resolved ink and panels per fitted shape. A design has its original
  artwork plus one more for each shape the host switched to that no existing artwork fits (§7);
- `Event.activeCardDesignId` and the host's card edits on the event (`spec.md §20.2`).

A `CardDesign` and its artwork are immutable. Host wording edits, font swaps and shape switches are
event data that never mutate the design. Choosing another design switches `activeCardDesignId`,
resets card-level host edits to the new design's wording, typography and shape, and never changes
event content, guests, RSVP, registry, privacy or messages.

All designs generated for an event stay browsable before publish. After publish, generation and
switching are disabled (`spec.md §8.2`).

Renderer code is normal product code: bug, accessibility and responsive fixes may change how any
existing card renders, without regenerating its design or artwork.

---

# 6. Rendering

## 6.1 The card component

One component renders a card from: the persisted `CardDesign`, the effective shape (the design's,
or the host's switch), the artwork for that shape's proportion with its resolved ink and panels,
and the event's current content passed through `layoutCard`. It applies the shape's outline as a
mask. It is the same component in
generation reveal, Creation Mode, Preview, the guest page and link-preview images.

## 6.2 The envelope

A house-designed envelope component, the same for every event (not themed, not generated, and not
an imitation of any competitor's envelope), sized to the card's proportion (portrait or square). It
shows the event title on the front.

- **Opening:** the guest taps — an explicit action; the envelope never opens by itself — and the
  card slides out, settling at the top of the event page.
- **Private event, shared link:** the envelope stays sealed until the event code is entered.
  Nothing on the card is visible before then (`spec.md §14.2`).
- **Personal invitation link:** no event code (`spec.md §12.5`). A bare request still returns only
  the closed envelope with the title; the card, the page and the party session load when the guest
  opens it, so link scanners and preview crawlers never receive private content or create a
  session. Before the event is published, a personal link shows a neutral "not available yet"
  state.
- **Reduced motion:** the card appears without the opening animation.
- The host sees the same reveal when a newly generated card is ready.

## 6.3 The guest page under the card

A standard single-scroll page in the house style (`docs/design-system.md`): details, description,
RSVP, registry, footer. It is the same layout and styling for every event; it does not take colours
or fonts from the card. RSVP and registry behaviour are defined in `spec.md §12`–`§17`.

## 6.4 Link previews

When an invitation link is shared (including the platform's invitation texts), the preview image is
the rendered card (in its shape, on the house background) for a public event and the sealed
envelope with the title for a private one. The
preview image is produced from the same card component and layout function, so it cannot disagree
with the live card. The rendering mechanism is chosen when the card renderer is built.

---

# 7. Host editing

| Host action | Model call | Changes |
| --- | --- | --- |
| Edit title or invitation line | none | event data; re-runs `layoutCard` |
| Edit a fact (date, venue, …) | none | event data; card and page update |
| Swap font (primary or alternates) | none | event data; re-runs `layoutCard` |
| Switch to a shape an existing artwork fits | none | event data; the shape's zones and pre-resolved ink; re-runs `layoutCard` |
| Switch to a shape no existing artwork fits (the other proportion, or another outline for `framed`/`minimal` art) | card art | new artwork for that shape from the same brief, with the current artwork as a reference so the subject stays the same, attached to the same design; validated and ink-resolved as in §3–§4; counts as a generation (`spec.md §10`); before publish only. The current card stays as it is until the new artwork is ready. Switching back is instant: earlier artwork is kept. |
| Try another direction (optional feedback) | card design + art | a new `CardDesign`; current card stays active until the host chooses |
| Choose an earlier design | none | `activeCardDesignId`; card-level edits reset |

The host never chooses a layout, a colour, an art mode, a font outside the design's set, a shape
the design's layout does not support, or the position of anything. There is no image editor and no
upload onto the card.

---

# 8. Versioning

Recorded on every `CardDesign` and generation run (`src/lib/ai/versions.ts`):

```ts
EVENT_IDENTITY_PROMPT_VERSION, EVENT_IDENTITY_SCHEMA_VERSION
CARD_DESIGN_PROMPT_VERSION,    CARD_DESIGN_SCHEMA_VERSION
CARD_ART_PROMPT_VERSION        // the deterministic art-prompt assembly
CARD_LAYOUT_SET_VERSION        // card_layouts_v1: layouts, per-shape zones and limits, shape outlines
CARD_COMPILER_VERSION          // validation, ink resolution, layoutCard
imageModel                     // provider + model id, recorded per artwork
```

Never edit a prompt, schema or layout set while keeping its version. A card renders with the layout
set it was generated against; the renderer supports every layout-set version that has a live card.

---

# 9. Tests and gates

- **Unit:** schema validation; wording fact checks; layout/mode compatibility; ink resolution
  against synthetic backgrounds (including the panel path); `layoutCard` sizing and line breaking;
  slot limits; every zone inside its shape's text-safe area.
- **Layout fixtures:** every layout × supported shape × pairing with worst-case and typical content
  renders in a real browser at card scale with no text outside its zone or its shape's outline. This is a test-time check; production does
  not run a browser to verify cards.
- **Creative evaluation:** the corpus in `docs/model-evals/creative-understanding.json` against the
  real identity and card-design calls (`docs/model-contracts.md §6`).
- **Human gate:** Human Test #2 judges real generated cards from real prompts, in colour, as the
  launch quality gate (`spec.md §30`). Its protocol and threshold are frozen before results are
  seen.

---

# 10. Deliberately not in this system

Page composition by the model; per-event themed page styling; model-chosen colours, sizes,
positions or line breaks; text inside artwork; host-uploaded, stock or retrieved imagery on the
card; inspiration images sent to the image model; a template or art gallery; a card back; free
font choice; an image editor; landscape cards and other die-cut shapes (scalloped, ticket,
pill/capsule, custom) — deferred (`spec.md §33`).

> **One card, designed for this event. The words are always the host's to change, always legible,
> and always where the design put them.**
