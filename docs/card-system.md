# Card System
## Revision 1 — the AI-designed invitation card

**Path:** `docs/card-system.md`
**Status:** Authoritative architecture for the generated invitation card, the envelope, and the
guest page that sits under them. Replaces the website renderer architecture of `spec.md`
Revision 6, which is retired (`docs/CHANGELOG-v7.md`).
**PRD:** `spec.md` Revision 7.2
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
   watermarks. Every word on the card is real text set by application code over the art. The one
   exception is the occasion's milestone number, drawn as an object in the scene when the design
   includes it, with digits code puts into the art prompt from the number the host stated (§2.7).
4. **Facts come only from the host.** Names, date, time, venue, location and RSVP deadline on the
   card are rendered from event data the host entered or confirmed. The model never writes them
   and never invents them.
5. **The model may write wording.** It drafts the card's title and invitation line (§2.5). The host
   can edit both. Model-drafted wording never introduces a fact the host did not supply.
6. **The generated card is a starting design; its artwork is preserved.** Ink colour, the starting
   text's position, font size and line breaks are chosen by code, never by a model, from the actual
   image: the text starts where the artwork has workable space, in the colour that reads best there
   (§4.2). Nothing is added to the artwork to correct for text — no panel, cream background or
   broad fade — and the artwork is never slid, cropped or split into a separate picture section
   (owner decisions, 2026-10-07). After that the text is the host's: in the card editor they may
   change any of it, unchecked, and give any box a text background (§7).
7. **Line breaks are always deterministic.** The generated card's text is laid out by one
   deterministic function that never lets it leave its zone (§4.3); an edited box is broken at its
   width by the same rules and the result stored. The browser never re-wraps card text, so host and
   guests see the same card.
8. **The raw host prompt never reaches the image model.** The image model receives an art brief
   derived from the persisted `EventIdentity` plus layout and shape rules (§3). Inspiration uploads are
   inputs to `EventIdentity` only and are never sent to the image model, nor are the host's words;
   the only images it ever receives are the event's own generated artwork, as a reference: the
   design's own earlier artwork on a shape switch (§7), and the artwork of the card being changed
   on a change to part of it (§3).
   Brand references follow `spec.md §7.6`: close homage allowed, never a logo, wordmark, brand or
   character name, or copied campaign artwork.
9. **Generated design data is immutable.** A `CardDesign` and its artwork never change once
   generated. Host edits live on the event and in a `CardCustomization` per design and shape (§5);
   "Try another direction" creates a new design — a requested change too, leaving the card it
   changes untouched; artwork
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
   outline, drawn exactly where it was painted (never slid, zoomed or cropped).
2. **Stored legibility panel** (designs generated before 2026-10-07 only) — the art-derived paper a
   design of `card_layouts_v2`/`v3` stored when its ink needed it, drawn exactly as stored, because
   that design's ink was chosen against it. New designs never get one (owner decisions,
   2026-10-07); a stored slide (`artOffset`, `card_compiler_v6`) is ignored.
3. **Text** — live text boxes in the design's typography pairing and the resolved ink colour, each
   with its optional host-chosen **text background** drawn behind that box's own lines (§7.6).

The card's text is real, selectable, screen-reader-readable text. The artwork is decorative
(`alt=""`); everything a guest needs is in the text and on the page below.

## 2.3 Layout set (`card_layouts_v7`)

A **layout** says where text starts and, in return, where the artwork should keep a quieter area for
the words — whatever suits the design: sky, a wall, brick, fabric, a gradient, a texture, a solid
colour or the paper itself, with low detail, never necessarily empty or flat. Each
layout declares the shapes it supports, and for each of them defines:

- its text zones, as rectangles in card units inside the shape's text-safe area, and which slots
  (§2.5) each zone holds, in order;
- alignment per zone;
- size range (maximum and minimum, in card units) and maximum lines per slot (since `card_layouts_v2`
  one slot-spec table serves every layout and shape: `src/lib/card/layouts.ts`);
- the character limit per slot that guarantees fit for every pairing **and every shape the layout
  supports** (§4.3), so switching shape can never make accepted text stop fitting;
- the composition instruction added to the art brief, per shape: where the subject may sit and
  which region should stay quieter for the words;
- the artwork's **presence**: how much of the card it should occupy outside the quiet regions (for
  example, substantial clusters in two corners, or a subject filling the upper half). Told only
  where to stay out, image models over-correct into a few token props on an empty field, which reads
  unfinished; the layout states the presence it wants as well as the space it reserves.

Since `card_layouts_v7` a layout has no legibility panel: the starting text is placed on the actual
image instead (§4.2).

The set validated in Phase 3 (`docs/model-evals/phase-3-validation.md`) was `card_layouts_v1`.
`card_layouts_v2` carries the owner's Phase 4 fit decisions (`CHANGELOG-v7.md`, "Phase 4 — fitting
every detail on every card"), proven by the layout fixtures (§9) with every slot at its limit; no
card was made from `card_layouts_v1`. `card_layouts_v3` changed only the panel (owner verdict on
CU-08, 2026-10-05: a box over the picture read as a hard edge); v2 panels render unchanged.
`card_layouts_v7` removes the panel and rewrites the composition text: a quieter area with low
detail in the design's own terms instead of an area kept "completely clear" for paper or a wash
(owner decisions, 2026-10-07). The geometry, bands, composition and presence rules are
product code in `src/lib/card/layouts.ts` and `src/lib/card/shapes.ts`:

| Layout | Text | Artwork | Shapes | Art modes |
| --- | --- | --- | --- | --- |
| `art-top` | lower part, centred | subject in the upper half, the bottom 45% quieter; on `square`, `oval` and `arch` the upper 40%, the bottom 60% quieter | all but `circle` | `illustration` |
| `art-bottom` | upper part, centred | subject grounded at the bottom, the top 45% quieter; on `square`, `oval` and `arch` the lower 40%, the top 60% quieter | all but `circle` | `illustration` |
| `framed` | centred | border, wreath, garland or frame — rich, built from the event's motifs — around a quiet centre | all six | `framed`, `minimal` |
| `corners` | centred | substantial motif clusters in two or more corners; centre quiet | `rectangle`, `rounded-rectangle`, `square` | `illustration`, `framed` |
| `atmosphere` | centred | full-bleed wash or texture with real depth, low contrast through the centre | all six | `atmosphere`, `minimal` |
| `cover-top` | upper part, centred, in a quieter stretch of the scene | one bold full-bleed scene, edge to edge: one or two big subjects grounded in the lower 55% (on `square` 40%), the top 45% (60%) a quieter stretch of the same scene — sky, a wall or a deep field of colour, low detail; no border, frame or paper margin | `rectangle`, `rounded-rectangle`, `square` | `illustration` |
| `cover-bottom` | lower part, centred, in a quieter stretch of the scene | one bold full-bleed scene: one or two big subjects fill the upper 55% (on `square` 40%), the bottom 45% (60%) a quieter stretch of the same scene — a floor, still water or a deep field of colour, low detail; no border, frame or paper margin | `rectangle`, `rounded-rectangle`, `square` | `illustration` |

**The cover layouts** (`card_layouts_v6`, owner decisions 2026-10-06) set the words in a quieter band
of one bold full-bleed scene, the way a record sleeve or a poster sets its type, for a brief no
other layout could express (a host who asked for "a ’90s hip-hop album cover"). Their bands and
zones are `art-bottom`'s and `art-top`'s, so no slot limit, fit check or stored host text changes;
what differs is the art: the band is the scene's own backdrop rather than paper, and the subjects are
big and close. The card design chooses a cover for bold, graphic or editorial identities and named
formats, never for restrained ones, and `cover-top` or `cover-bottom` by where the subject naturally
sits. No text that reaches the image model names the format, which would come back lettered.

**Every card shows every detail; the picture gives way** (owner decision). Where a picture sits
above or below the words on a `square`, `oval` or `arch` card, it takes roughly 40% of the card and
the words get the other 60%, with that shape's own composition and presence text ("the upper 40% …
let … the bottom 60% be a quieter area"). A circle keeps the words in the middle, so `art-top` and
`art-bottom` do not offer it. Text bands, in card units (top–bottom), are where the starting text is
laid out before it is placed on the actual image (§4.2); a picture layout's band lies at least 30
units inside the region its composition keeps quieter:

| Layout | `rectangle`, `rounded-rectangle` | `arch` | `oval` | `square` | `circle` |
| --- | --- | --- | --- | --- | --- |
| `art-top` | 800–1250 | 600–1260 | 600–1180 | 440–920 | — |
| `art-bottom` | 150–600 | 240–800 | 220–800 | 80–560 | — |
| `framed` | 400–1000 | 400–1000 | 400–1000 | 260–740 | 260–740 |
| `corners` | 420–980 | — | — | 260–740 | — |
| `atmosphere` | 400–1000 | 400–1000 | 400–1000 | 260–740 | 260–740 |
| `cover-top` | 150–600 | — | — | 80–560 | — |
| `cover-bottom` | 800–1250 | — | — | 440–920 | — |

Phase 3's two judged misses were both sparse (a frame around a large empty centre, a quiet wash),
so the presence rules of `framed` and `atmosphere` are the first thing to strengthen.

Not every layout suits every shape (text clustered toward a corner does not belong in an oval or
a circle); a layout's supported shapes are part of the set and are validated (§4.1).

Layouts are chosen by the card-design model call from this catalog by ID; the catalog given to the
model at runtime is built from `layouts.ts`, as the validator that checks its choice is. The
catalog — layouts, their per-shape zones, bands, art instructions and limits, and the six shapes'
outlines — is versioned together (`card_layouts_v7`; v4 and v5, the art giving way by crop and
plate, were withdrawn before release by owner decision 2026-10-07); adding or changing a layout or a shape is a
version bump and re-runs the layout fixtures (§9). Layouts are never shown to the host as a gallery
and the host does not pick one.

## 2.4 Art modes

The design declares one mode, which tells the art brief how much the artwork carries:

| Mode | What the artwork is | Typical layouts |
| --- | --- | --- |
| `illustration` | a recognizable subject anchors the card (teddy, lemon basket, hot-air balloon, florals) | `art-top`, `art-bottom`, `corners` |
| `framed` | artwork as border, wreath, corner treatment or frame around the text | `framed`, `corners` |
| `atmosphere` | no discrete subject; a soft thematic wash, scenery or texture | `atmosphere` |
| `minimal` | a refined border, pattern or surface texture only; the typography leads | `framed`, `atmosphere` |

Every card has artwork; `minimal` is how the system expresses a restrained, typography-led card.
Mode/layout compatibility is part of the layout set and is validated (§4.1).

**Rendering family and aesthetic.** Independently of the mode, the art brief names how the
artwork is made (`artBrief.rendering`) and, separately, an aesthetic mood in a word or two
(`artBrief.aesthetic`: modern, romantic, luxury, preppy, whimsical …), both `card_design_schema_v2`
(owner decisions, 2026-10-04). Code turns them into the art prompt's `Rendering:` line, just before
the brief's medium (`src/lib/card/renderings.ts`, since `card_art_v3`). Watercolour is one direction
among nine, never a reflex, and cards vary actively: the orchestration draws a suggested rendering
at random from those the event's earlier directions have not used (`suggestRendering`), and the
design follows it unless the identity carries an explicit style signal from the host pointing to
another treatment — never the design's own aesthetic. A `design-led` card takes the `framed` or
`atmosphere` art mode (or `minimal` when asked for a bare card), never `illustration`.

| Rendering | What the artwork is |
| --- | --- |
| `photographic` | photographic realism: natural materials, real environments, believable light; no people |
| `editorial` | cinematic editorial realism: art-directed like a luxury campaign or styled magazine shoot; no people |
| `rendered-3d` | 3D / CGI: dimensional forms with intentional materials, lighting, depth and shadows; no people |
| `vector` | modern vector graphic: crisp shapes, controlled geometry, clean edges; no brush texture |
| `flat-illustration` | flat contemporary illustration: expressive, characterful, playful but not childish |
| `painterly` | painterly / watercolour: organic hand-painted colour, soft edges, artistic texture |
| `line-art` | line art: fine-line, botanical or architectural sketching, etching, engraving, toile |
| `collage` | collage / mixed media: layered cutouts, paper textures, torn edges, overlapping elements; no people |
| `design-led` | pattern, border, geometry or colour blocking as the whole picture; never letters, initials or monograms — the card's own text is the typography |

The brief's `medium` is the specific making within its rendering. Photographic, editorial, 3D and
collage artwork shows places, objects, food and materials — never a person, face, hands or body;
the artwork inspection rejects one that does (§4.1). The rendering does not change which shapes an
artwork fits. A photograph made by the image model is generated artwork, not stock (invariant 10).

**Which shapes an artwork fits** depends on its mode:

| Mode | Fits | Why |
| --- | --- | --- |
| `illustration`, `atmosphere` | every shape of its proportion that the layout supports with the same composition and presence (§2.3) | The art prompt carries the crop-safety rule of the tightest of those outlines (everything important inside it; corners hold only background that can be lost), so any of them can trim it |
| `framed`, `minimal` | only the shape it was generated for | Borders, frames and wreaths follow the outline; a rectangular border cut into an oval looks wrong |

An artwork painted to keep one region quiet never fits a shape whose words need another. So in
`card_layouts_v2` to `v5` the fit sets of `illustration` and `atmosphere` art are:

| Layout | 5:7 | 1:1 |
| --- | --- | --- |
| `art-top`, `art-bottom` | `rectangle` + `rounded-rectangle` (half-card picture); `arch` + `oval` (40% picture) | `square` |
| `cover-top`, `cover-bottom` | `rectangle` + `rounded-rectangle` | `square` |
| `corners` | `rectangle` + `rounded-rectangle` | `square` |
| `atmosphere` | all four | `square` + `circle` |

A 40% picture does not fit the half-card shapes either: on a rectangle its picture would end well
above the words, leaving an empty band the layout does not intend. The art prompt for every shape
in a fit set is identical, so any of them could have been the one generated
(`src/lib/card/art-prompt.ts`).

Switching to a shape outside the fit set generates artwork for it (§7). Earlier artwork is kept, so
switching back is instant.

## 2.5 Text slots

| Slot | Source | Notes |
| --- | --- | --- |
| `title` | AI-drafted wording, host-editable | The card's headline and the event's effective title everywhere (`spec.md §20.2`). If the host supplied a title, it is used as given. |
| `invitationLine` | AI-drafted wording, host-editable | One short line such as "Please join us for a baby shower". |
| `babyName` | host fact | Shown when present. |
| `hosts` | host fact | e.g. "Hosted by Maya & Tom". |
| `date` | host fact | Formatted by code from the stored date: weekday, month and day, no year ("Saturday, June 6"); the page carries the full date. |
| `time` | host fact | Formatted by code: "1:00 pm", or "1:00 pm – 4:00 pm" when an end time is stored. |
| `venue` | host fact | Venue name, else the address's first line (the street); the full address is on the page. |
| `rsvpBy` | host fact | Formatted by code from the stored RSVP deadline, in the event's timezone: "RSVP by May 30". |

Rules:

- **Model-drafted wording** (`title`, `invitationLine`) may use a name only exactly as the host
  supplied it, and never contains a date, time, place, dress code or any other fact. Code checks
  this deterministically where it can (digits, month and weekday names, time expressions, the
  event's known facts) and the evaluation corpus checks the rest (`docs/model-contracts.md §6`).
- **Host wording** — a title the host supplied, or any wording the host edits — is host content:
  never fact-checked and never re-prompted. The title and invitation line stay within their slot
  limits even when edited, so they always fit a fresh layout (§7); an added text box has its own
  per-box length limit (`spec.md §20.2`).
- **Facts** render from event data. A fact the host has not supplied is absent from the published
  card. In Creation Mode a missing required fact shows as a placeholder marked as needing
  confirmation; placeholders are never published (`spec.md §7.3`). A fact the prompt states
  (`Event.promptFacts`) stands in for a missing one from the reveal, as written, marked the same
  way, once it passes the entry and fit checks below; until the host confirms it, it is never
  published and never given to the card design (except the occasion the prompt names, which the
  design reads to word the invitation; it is never a slot).
- **Slot limits** are part of the layout set and are enforced at entry, so real content always fits
  (§4.3 states the one exception: deliberately wide text within the limits).
  Since `card_layouts_v2`: title 40 characters, invitation line 72, baby name 40, hosts 60, venue 60.
  The date, time and RSVP-by are formatted by code (`src/lib/card/facts.ts`) and are at most 23
  ("Wednesday, September 30"), 19 ("10:00 pm – 11:00 pm") and 20 ("RSVP by September 30")
  characters.
- **The entry check** (`validateCardText`, `src/lib/card/entry.ts`) runs on everything the host
  types that the card shows as typed — a host-supplied title, the baby name, the hosts, the venue
  name, and the address's first line (up to its first comma or line break) when there is no venue
  name, since only then does the card show it — in the details form and, authoritatively, in its
  server action. Clearing the venue name is refused when the card could not show the address's
  first line in its place. It refuses, with a plain
  message beside the field: text over the slot limit; a word (or the part of a hyphenated word
  between hyphens) too wide for one line of the layout set's narrowest zone at the slot's minimum
  size in any curated pairing; and characters a curated face for the slot cannot draw ("The card
  can't show 🎈 — please remove it"). The curated faces cover Latin-1, so emoji, other alphabets
  and scripts written without spaces are refused at entry (owner decision; emoji on the card may
  come later).
- **The fit check** (`cardTextFitsEveryDesign`, `src/lib/card/entry-fit.server.ts`) then runs in
  the server action on what the entry check accepted: the value in its slot, laid out by
  `layoutCard`'s own search (`layoutCardFits`, with the curated fonts' real shaping) in every
  distinct text zone of the layout set (14) and every curated pairing, beside the worst-case
  content for every other slot, so each field has the same room whatever else the event says (no
  realistic pair of values that each fit was found to overflow together, and checking beside the
  event's own values would blame the field being edited for one stored earlier). Text that some
  design cannot fit is refused: "This takes more
  room than the card has here — please shorten it." This catches what the entry check cannot see,
  such as a 40-character title of capitals ("WELCOME WILHELMINA MONTGOMERY-WHITWORTH!" fits 253
  of 300 layout × shape × pairing combinations and is refused). It runs on the server only,
  because the browser has no font shaper until the card editor (§7). The formatted date, time and
  RSVP-by always take one line (`layout-card.test.ts`), so the worst case is exact for them; the
  invitation line is the model's wording, measured as the worst-case 72-character sentence until a
  design exists — from Phase 5 the check measures beside the active design's own wording.
- A prompt-stated fact takes the same checks before the card shows it (`revealCardContent`,
  `src/lib/card/facts.ts`): the entry check for the hosts, baby name and venue (or the address's
  first line), the same checks for the date and time as the host wrote them
  (`validateDetailText`: drawable characters, every word on one line, and at most 23 and 19
  characters, the formatted maxima), and the fit check above; a value that fails any of them leaves the placeholder. So anything the card shows can be
  confirmed unchanged.
- A slot with no value takes no space.

## 2.6 Typography

The generated card uses the curated pairings in `src/lib/card/typography.ts` (display face for
the title, body face for everything else; fonts self-hosted in `public/fonts/card/`). The design
names one primary pairing and up to two alternates it judges compatible with the artwork; the card
editor's font picker shows those first.

In the card editor (§7) the host may set any text box in any family of the Google Fonts library,
per box. A family is added to the platform's font store on first use — its files copied into
platform storage and its metrics extracted for line breaking — and served from there to the editor,
guests and link previews (`docs/technology-decisions.md §8.3`). Guests' browsers never fetch a font
from a third party.

## 2.7 The milestone number

(Owner decisions, 2026-10-08; `spec.md §7.6c`.) A card may show one number the occasion celebrates,
drawn into the artwork: a count from 1 to 110 (an age, years together or since, days) or a year
as four digits (a class year, the year a New Year's Eve party welcomes, a founding year). It is the
one exception to invariant 3.

- **Source.** Only a number the host states plainly: in the prompt, through fact extraction, kept
  in `Event.promptFacts` for the host to confirm, or in the details form (`Event.milestoneNumber`).
  Never inferred; a New Year's year is never computed from the date.
- **Design.** The design receives the number and its kind as host content and decides whether the
  number belongs in its idea. When it draws it, `CardDesign.milestoneNumber.treatment` says how, in
  words ("a bunch of gold foil balloons", "candles on the cake"); the digits never appear in the
  design or its brief.
- **Art prompt.** Code adds one line with the digits and the treatment, and the global rules allow
  that number, exactly once, as an object in the scene, and nothing else: no ordinal or word, no
  short year, no Roman numerals, nothing on a sign, banner or label (§3).
- **Check and budget.** The artwork passes only if the inspection reads exactly that number, once,
  and no other text (§4.1). Such an artwork may use up to three extra images in all. A wrong or
  missing number is never itself a visible failure: it earns one regeneration with the number, then
  one image painted without it, and the card ships with no number, never a typeset one. Any other
  validation failure keeps its one regeneration, and an image without the number that fails
  validation is the visible failure with a retry. The space repaint (§4.2) comes last, keeps the
  number line while the number is drawn, is checked the same way, and is skipped when no image is
  left.
- **Publish.** The number shows in the artwork from the reveal, confirmed or not; whether such a
  card may publish while the number is unconfirmed, and what a change after publish does (no new
  artwork is made then, `spec.md §8.2`), are open (`CHANGELOG-v7.md`, 2026-10-08).
- **Shape switches and changes.** New artwork for another shape carries the same line and the same
  check. A request to add or remove the number is a change to part of the card (an edit of its
  artwork, §3). When the host changes the number in the details while the active card shows it,
  Creation Mode offers `Update the number on the card`, which is that change; nothing happens until
  the host chooses it.
- **Not text.** The number is part of the artwork. It is no text box, the card editor cannot move or
  restyle it (§7), and model-drafted wording never states it (§2.5).

---

# 3. Generation pipeline

```text
host prompt + optional inspiration
  → generateEventIdentity            GPT 6.1 Sol; the only stage that reads the raw prompt
  → (optional) creative clarification, at most three taste questions, usually none
  → generateCardDesign               GPT 6.1 Sol; shape, layout, art mode, typography, wording, art brief
                                     (with a randomly suggested rendering it follows unless the identity points elsewhere;
                                     on Try another direction, the change asked for or a new idea, and which it made)
  → validate CardDesign              deterministic (§4.1)
  → assemble the art prompt          deterministic: brief (with its rendering line, §2.4) + layout and shape composition rules + global rules
                                     (+ the milestone number's digits and treatment when the design draws it, §2.7)
  → generateCardArt                  GPT Image 2.5 Sunburst; at the shape's proportion, no text
                                     (a change to part of a card: an edit of that card's artwork, framed as a revision)
  → validate artwork                 deterministic checks, plus the text/safety check fixed in Phase 3
                                     (a design that draws the milestone number: exactly that number, once, and no other text)
  → place the starting text and ink  deterministic, on the actual image, for every shape the artwork fits (§4.2); nothing drawn over the artwork
  → (only if the space scores below the workable bar) one repaint: same art prompt + a quieter part for the words; validate; place again; keep the better — two extra images at most (three when the design draws the milestone number)
  → persist CardDesign + artwork + ink and starting position    immutable
  → reveal the card
```

In parallel with identity, a cheaper structured-extraction call pulls any facts the prompt states
(names, date, time, venue, a plainly stated milestone number) and keeps them on the event (`Event.promptFacts`) as values for the
host to confirm (`spec.md §7.3`, `§9.2`). Facts never come from `EventIdentity` and are never inferred.

**One design at a time.** Each round generates one card. "Try another direction" runs
`generateCardDesign` again with the host's optional feedback, a summary of every earlier direction
for this event and, when the host says what to change, the card being changed (`spec.md §7.7`,
owner decisions 2026-10-05). The design says which it made:

- **a change to part of the card** keeps the card — idea, subject, rendering, layout, shape, art
  mode, pairing, title and invitation line, unless the request names one — and rewrites the brief
  with the change. Its artwork is an **edit** of the changed card's artwork: the image model's
  edits endpoint with that artwork as the reference, the assembled art prompt framed as a revision
  ("keep its composition, subject placement, rendering, lighting and palette wherever this
  description does not change them"). Repaints stay edits of the same reference.
- **a change to the whole look** (light, time of day, overall colour) keeps the idea and paints the
  revised brief fresh: an edit holds the original's tones, so a night sky came back mid-blue and
  "warmer light" came back unchanged (Phase 5 refine experiment, CHANGELOG).
- **a new idea** — the box empty, or asking for something new — must be a different direction
  (§4.1).

The host's words never reach the image model: the design writes the change into the brief.

**Re-prompts and failure.** Each trigger earns at most one re-prompt (or, for artwork, one
regeneration); if the second attempt fails too:

| Step | Trigger | After the one retry fails |
| --- | --- | --- |
| `generateEventIdentity` | invalid structured output | fail visibly with a retry action |
| `generateCardDesign` | schema-invalid output | fail visibly with a retry action |
| `generateCardDesign` | repeats an earlier direction (§4.1) | accept, logged |
| `generateCardDesign` | wording fails the fact check | standard wording for the failing slot (§4.1), logged |
| `generateCardArt` | artwork fails validation | fail visibly with a retry action |
| `generateCardArt` | the design draws the milestone number and the artwork shows a wrong number, no number, or the number with other text (§2.7) — never itself a visible failure | one last image painted without the number; the card ships with none (a typeset number is never substituted); if that image fails validation, fail visibly with a retry; up to three extra images per such artwork in all, the space repaint last and skipped when none is left (owner decisions, 2026-10-08) |
| `generateCardArt` | the artwork passes validation but the shape it was painted for (a new design's, or a shape switch's) scores **below the workable bar** for the starting text (§4.2; a provisional heuristic, not proof that there is no workable space) — never merely text over an object, a missed percentage boundary or a failed contrast check | repainted once from the same art prompt plus one line asking for a quieter part of the picture for the words (`card_art_v7`), a switch or a change to part of a card keeping its reference; the image whose space reads better is kept; within two extra images per artwork in all, a validation regeneration included; a repaint that fails validation is dropped (owner decisions, 2026-10-07; `spec.md §7.8`) |
| `generateCardArt` | the provider refuses a brand or character homage | the regeneration comes from a `generateCardDesign` re-prompt (`provider-refusal`) that evokes the character's world rather than its signature look, with a short plain copyright note to the host (`spec.md §7.6`); a second refusal fails visibly, and its retry takes the same step back. A shape switch's refusal fails visibly at once (`shape_refusal`), with no re-prompt: the design is immutable, and the card stays as it is |

There is no library or template fallback. A failure is shown honestly and the host can retry; it
is never disguised as a finished design.

---

# 4. The deterministic card compiler

No step here calls a model or regenerates artwork.

## 4.1 Validation

- `CardDesign` against its strict schema (`card_design_schema_v3`): enum IDs (shape, layout, art
  mode, rendering, pairings), string length bounds (the aesthetic included), no extra fields. Designs persisted under an
  earlier schema are never re-validated (§5).
- Layout ↔ art-mode compatibility; the layout supports the chosen shape; alternates distinct from
  the primary pairing.
- Wording fact check (§2.5), on model-drafted wording only. Model-drafted wording must also clear
  what a host's own text has to (§2.5): characters the curated faces can draw, and a fit in every
  design beside the worst-case content, so a generated card never overflows. A failing design earns
  one re-prompt naming the failing slot; if it fails again, that slot is replaced by standard
  wording built from the event type (for a baby shower, `title`: "A Baby Shower";
  `invitationLine`: "Please join us for a baby shower"; from the default type when a stated type's
  wording would not itself clear those checks), logged, and visible to the host as ordinary
  editable text. A host-supplied title is never checked or replaced.
- Direction distinctness, for a new idea: a design that repeats an earlier direction's layout, art
  mode and primary pairing together earns its one re-prompt naming the earlier directions. A change
  the host asked for is exempt: keeping the card is the point.
- Artwork: file type, the requested proportion (5:7 or 1:1) within tolerance, minimum resolution,
  decodable. Detecting embedded text (which covers logos and wordmarks) and unsafe content is
  required; the mechanism is chosen in Phase 3 validation. For a design that draws the milestone
  number, the check reads every text-like mark and passes only exactly that number, once, with no
  other text (§2.7). For a `photographic`, `editorial`,
  `rendered-3d` or `collage` rendering, a person, face, hands or body fails the artwork too (§2.4),
  with the same one regeneration.

## 4.2 The starting text: placement and ink

A generated card is an editable starting design (owner decisions, 2026-10-07). The artwork is
preserved exactly as painted; this step only decides where the starting text sits and in what
colour, so the host begins from something that reads well and customises from there. For each
shape the artwork fits (§2.4), computed once per artwork (`src/lib/card/text-space.ts`,
`card_compiler_v7`):

1. **Lay out the starting text** in the layout's zone for the shape (§2.3) at its starting sizes
   and line breaks (`layoutCard`, §4.3), in the primary pairing, for the words the card shows right
   after generation (the design's wording, the host's stored facts — re-read just before the
   artwork is painted — then any fact the prompt states, as written, then placeholders; one
   producer, `revealCardContent`). Each line's area is its measured width placed by its alignment,
   its line height, and a small margin (`textLineAreas`). The lines form two groups: the
   **heading** (title and invitation line) and the **details** (the facts).
2. **Candidate colours**: the artwork's own palette by share, then a near-black and a near-white
   tuned toward the artwork's hue.
3. **Readable share.** For a colour and a position, the share of the artwork's pixels behind the
   text's lines (inside the outline) against which that colour reaches **4.5:1** (WCAG 2.x,
   `src/lib/card/color.ts`). It is measured on the actual image, so sky, brick, walls, gradients,
   textures, solid colours and paper all count, and text crossing an illustrated object only lowers
   the share by what it covers.
4. **Position.** If some colour reads behind at least 95% of the lines where the layout puts them,
   the text stays there. Otherwise it moves vertically, in 10-unit steps, inside the shape's
   text-safe area — as one block, or with the heading and the details apart (the details never move
   above the heading's position relative to it) — to wherever the readable share is highest; ties go
   to keeping the block together and to the smallest move, and a split is taken only when it reads
   at least three points better. Sizes and line breaks never change, so fit (§4.3) is untouched.
5. **Colour.** At that position, the first candidate in order whose readable share is within one
   point of the best.
6. **Workable space.** The space is scored workable when the chosen readable share is at least
   85%. A tiny empty patch does not qualify, because the whole starting text must sit in it at
   readable sizes. An artwork scored below that on a shape it was painted for is reconsidered once,
   with one repaint (§3); the image whose share is higher is kept, and the card ships with it.
   Nothing here calls a model.

The 95% and 85% bars and the three-point split margin are **provisional, tunable heuristics**
(owner decision, 2026-10-07), not rules about the picture. A score below 85%, and text crossing an
illustrated object, are never failures; they never bring back a panel, a fade, moved artwork or an
overlap restriction. The score cannot tell "below the threshold" — workable space the measurement
or the vertical-only search missed — from "genuinely no workable space"; people judge that on the
raw artwork and the final card side by side (`model-contracts.md §7.4`, CA-03), and an artwork with
genuinely no workable space is recorded as an **unresolved generation case**, never counted as
meeting the bar because the host could fix it in the editor.

Nothing is ever drawn over the artwork to correct for text, and the artwork is never moved: no
legibility panel, cream background, broad fade or wash; no slide, zoom, crop or separate picture
section. The result per shape — the ink and, when the text moved, its vertical shift for the
heading and the details (`shift`, in card units; `card_art_assets.ink[shape].text` is
`{ ink, shift? }`) — is persisted with the artwork. It is the generated card's starting text and
the starting colour of text carried to a fresh layout; the host's choices in the card editor never
change it.

The shift was chosen for the words the card showed at generation. Whenever the generated layer is
drawn again — with the host's later facts, or for words carried to a fresh layout (§7) — the stored
shift is applied only while every line, so moved, still lies inside the shape's text-safe area;
otherwise the words sit where the layout puts them. The host's view (with placeholders) and a
guest's (saved facts only) are laid out separately, so the one can keep the shift while the other
falls back; each is drawn the same way every time, and Preview shows the guest's. A carried layout that overflows its zone, or
stacks added text below it, is not moved. This rule is for the automatic starting placement only:
a box the host has placed is drawn exactly where they put it, inside the text-safe area or not, and
nothing moves it (owner decision, 2026-10-07). Telemetry records, per fitted shape, the readable share,
whether it was workable and the shift (`textSpace`), and `no-text-space` when the one repaint was
made (`spec.md §9.5`).

**Designs generated before 2026-10-07** keep what they stored: an ink judged by the earlier
nearest-tail rule (`card_compiler_v3`/`v4`) and, where that ink needed it, the art-derived
legibility panel of `card_layouts_v2`/`v3`, drawn exactly as stored because their ink was chosen
against it. A stored slide (`artOffset`, `card_compiler_v6`) is ignored, so their artwork is drawn
where it was painted.

## 4.3 Text fit

One pure, versioned function, `layoutCard(layout, shape, pairing, content)`, decides every slot's
font size and line breaks:

- start each slot at the layout's maximum size and step down to its minimum;
- break lines deterministically and evenly, never stranding a short word (a line that is one word
  of three characters or fewer, such as "A", "The" or "Our": "A Wild / Beginning", never
  "A / Wild Beginning"; `card_compiler_v3`, owner decision 2026-10-05) and then never leaving a
  one-word last line where another break exists, never breaking inside a word except just after a
  hyphen between letters
  ("Montgomery-" / "Whitworth"), the hyphen kept on the first line. A space always ranks above a
  hyphen: the sizes are searched first with no hyphen breaks, and only if nothing fits are they
  searched again with them;
- measure from the fonts' own metrics — the curated fonts, or the font store's for a host font
  carried to a fresh layout (§2.6) — with a safety margin that absorbs browser rendering
  differences;
- slot character limits, the entry check and the fit check (§2.5) make every value accepted at
  entry fit at the minimum size in every layout, supported shape and pairing: a test renders every
  layout × supported shape × pairing with worst-case content in a real browser to prove the
  server's measurement is the browser's (§9), with no exceptions, and the fit check runs
  `layoutCard`'s own search on what the host typed. Text saved before the fit check existed (or
  after a layout-set or font change), or an unobserved combination of values that each fit, can
  still overflow; `layoutCard` reports it, and the generated card fails visibly with a retry rather
  than rendering.

The renderer sets exactly the lines and sizes this function returns; the browser does not re-wrap
card text. The same function runs when the design is compiled, when a new design or shape is seeded
with the host's words (§7), and when a fact changes on a card with no customization; boxes the host
has edited keep their stored lines (§7). What the host saw is what guests see.

## 4.4 What the compiler never does

Call a model; regenerate or edit artwork; move, slide, zoom, crop, cover or recolour artwork beyond
the uniform scaling and outline mask of §2.1 — no legibility panel, cream background or fade over
it; add a text background (that is only ever the host's choice, §7); let a model choose a colour,
a size, a position, an outline or a line break; truncate text silently.

---

# 5. Persistence and immutability

Persist per event:

- `EventIdentity`, with its prompt and schema versions;
- every `CardDesign`: the raw model response, the validated design (including its shape), its
  presentation name and description, the version set (§8), what it is (`refinement`: a new idea,
  or a change to part of a card or to its whole look) and, for a change, the design it was made
  from (`changedFrom`);
- every artwork asset in Supabase Storage, with its proportion, the shapes it fits, image model,
  art-prompt version, whether it shows the milestone number (§2.7), and per fitted shape its
  resolved ink and the starting text's vertical shift (an older design: its ink and any stored
  legibility panel). A design has its original
  artwork plus one more for each shape the host switched to that no existing artwork fits (§7);
- `Event.activeCardDesignId`, `Event.activeCardShape` and `Event.title` (`spec.md §20.2`, §20.5);
- one `CardCustomization` per design and shape the host has edited, or switched to carrying their
  words (§7): the full text layer — every
  box's source, text, position, width, rotation, font, size, colour, alignment, spacing, case,
  stacking order, stored line breaks and optional text background — with a revision for
  collaborator conflicts
  (`spec.md §20.5`).

A `CardDesign` and its artwork are immutable. Card-editor edits and shape switches never mutate the
design. Choosing another design switches `activeCardDesignId`; a new design or shape starts from
its generated layout carrying the host's words, added text and fonts (§7), keeps every earlier
customization to return to, and never changes event content, guests, RSVP, registry, privacy or
messages.

All designs generated for an event stay browsable before publish. After publish, generation and
switching designs are disabled (`spec.md §8.2`); switching to a shape an existing artwork of the
active design already fits stays available, since it only shows artwork that exists (§8.1).

Renderer code is normal product code: bug, accessibility and responsive fixes may change how any
existing card renders, without regenerating its design or artwork.

---

# 6. Rendering

## 6.1 The card component

One component renders a card from: the persisted `CardDesign`, the effective shape (the design's,
or the host's switch), the artwork for that shape's proportion, and the text layer — the host's
`CardCustomization` for that design and shape when one exists, otherwise the generated layout
(the resolved ink, the event's current content passed through `layoutCard` and placed by its
stored shift, and an older design's stored panel). Every text box renders its stored lines at its
position, width, rotation and style, with its text background behind them; the browser never
re-wraps them. The artwork is drawn exactly as painted. It applies the shape's outline as a mask, clipping anything outside it. It is the same
component in the generation reveal, Creation Mode, the card editor, Preview and the guest page. A
link-preview image is the one other drawing of a card: from the same stored data, under this
component's validation, held to it by a fixture (§6.4).

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
card preview is drawn from the same stored data the card component renders, under the component's
own validation, so it cannot disagree with the live card. Mechanism (`docs/technology-decisions.md §8.2`): the card is drawn as an SVG
from exactly the data the card component renders — the stored text boxes (the customization's, or
the generated layer from `layoutCard`), their text backgrounds, the outline, any stored panel, the artwork and the ink — under the
component's own validation, with every stored line drawn as glyph outlines at the font instance it
was measured with, and rasterized on the server by Next.js's `ImageResponse`; no browser runs in
production. A layout fixture compares it with the card component in a real browser at the same
scale, line by line. A private event's preview is a static drawing of the house envelope with the
title, made from the title alone, so nothing of the card can reach it.

---

# 7. Host editing — the card editor

The generated card is the starting point. In the card editor (`spec.md §20`) the owner or co-host
edits the card's **text layer**; the artwork, outline and envelope are never edited.

| Host action | Model call | Changes |
| --- | --- | --- |
| First edit of a card | none | creates a `CardCustomization` for this design and shape (unless a switch that carried words already did, §7 below), seeded from the generated layout, with a box for every fact slot the layout defines (an empty fact box renders nothing until its fact exists) |
| Edit, move, resize, rotate, restyle, duplicate, reorder or delete a text box; add one | none | the customization; the edited box's lines re-broken and stored; the artwork never changes |
| Give a text box a text background, change its style, colour, opacity or padding, or remove it | none | that box's `background` only; nothing else on the card or in the artwork |
| Choose a font (any Google Fonts family) | none | the box's font; the family added to the font store on first use; lines re-broken |
| Edit the title box | none | `Event.title`, used everywhere; the title's boxes re-broken in every customization of the event |
| Edit a fact (in its box or the details editor) | none | event data; that fact's boxes re-broken in every customization of the event; page updates |
| `Reset card` | none | a new revision of this design and shape's customization with the seed re-applied — never a delete, so stale saves are still refused; `Event.title` and event details are not reverted |
| Switch to a shape an existing artwork fits | none | `activeCardShape`; that shape's customization if one exists, otherwise its generated layout carrying the host's words, added text and fonts |
| Switch to a shape no existing artwork fits (the other proportion, or another outline for `framed`/`minimal` art) | card art | new artwork for that shape from the same brief, with the current artwork as a reference so the subject stays the same, attached to the same design; validated and ink-resolved as in §3–§4; counts as a generation (`spec.md §10`); before publish only. The current card stays as it is until the new artwork is ready; then as the row above. Switching back is instant |
| Try another direction (optional feedback) | card design + art | a new `CardDesign` — the card changed as asked (its artwork an edit of the changed card's for a change to part of it) or a new idea (§3); counts as a generation; current card stays active until the host chooses |
| Choose another design | none | `activeCardDesignId`; that design's customization if one exists, otherwise its generated layout carrying the host's words, added text and fonts |

**Carrying words to a fresh layout** (a new design or shape with no customization of its own):
the words and fonts come from the customization of the card being switched from — the active
design and shape. A card with no customization carries nothing: the host has not edited it, so the
new card shows its own generated layout and wording (a new direction's own title and invitation
line, not the previous design's). The carried layout is saved as the new card's customization, so
what the host sees is stored and carries on at the next switch. The title, invitation line and
added text boxes keep their text and fonts; `layoutCard` places
them in the new layout's text zone — the generated slots first, then added boxes in their order,
as extra body lines — and sizes and breaks them as usual; positions, rotation and colours come
from the new card (its resolved ink, and its stored starting shift under the rule of §4.2). A text
background on a carried title, invitation line or added box keeps its style, colour, opacity and
padding exactly as chosen; only a colour left automatic (`autoColor`) is derived again from the new
text colour, as it is whenever its box's text colour changes (owner decision, 2026-10-07: a colour
the host chose is theirs, even where it no longer contrasts); fact boxes carry none. In the pairing's own faces the title and invitation line
always fit, because they keep their slot limits; a carried host font wide enough not to fit at
minimum size is set at minimum size and runs below the zone, and when the added boxes cannot all
fit the zone at minimum size, the overflowing added boxes are stacked below the zone — host
content either way, for the host to arrange. A customization holds the whole text layer, including
the generated wording it was seeded with, so once the host has edited a card its title and
invitation line travel with it to the next design — deliberately: the host has made that card
theirs. The title box is linked to the effective title (`spec.md §20.2`), so the title travels only
once the host has set `Event.title`; while it is unset, the new card's title box shows the new
design's own drafted title, in the host's carried font, because a switch never changes event
content (`spec.md §20.6`).

**Text backgrounds** (owner decisions, 2026-10-07; `spec.md §20.1`). Any text box may carry one
optional background, which the host adds and removes; every box starts with none, and nothing adds
one automatically — not generation, not opening the editor, and not the editor when a box is moved
or resized. Styles: **None** (the default: the
field is absent), **Highlight** (a band behind each line), **Rounded box** (one rectangle around
the text block) and **Soft backdrop** (that rectangle, feathered locally); organic shapes may follow
later. Each has a colour (`#RRGGBB`, marked automatic or the host's — below), an opacity (above 0,
at most 1) and a padding (0–120 card units). The background is derived when the card is drawn from the box's own geometry and stored
lines — never stored as pixels — so it moves, rotates and resizes with its box and follows its
lines when the text is resized or re-broken. Its opacity is the fill's alpha only; the text keeps
its own colour and opacity. It is drawn inside the box, behind that box's lines, within the card's
outline, and never touches the artwork. Geometry, in the box's frame (L = size × line height; each
line's set width wᵢ placed by its alignment at oᵢ; p = padding): a highlight is, per line,
[oᵢ − p, oᵢ + wᵢ + p] across and the line's content area ± p down; a rounded box spans
[minᵢ oᵢ − p, maxᵢ (oᵢ + wᵢ) + p] by [−p, n·L + p] with corner radius min(0.5·p + 0.12·size, half its
smaller side); a soft backdrop is that rectangle unrounded, blurred with a Gaussian of standard
deviation max(4, 0.6·p). The card component and the link-preview SVG draw the same geometry, held
together by a fixture. When the host first picks a style its colour is **automatic**
(`autoColor: true`): white behind text of relative luminance below 0.4, near-black behind lighter
text, derived again by the save whenever the box's text colour changes and when the words carry to
another design or shape. Choosing a swatch or typing a colour makes it the host's (`autoColor`
absent), kept exactly as chosen through every edit and carry; choosing Automatic again hands it back.
It starts at opacity 0.85 (highlight), 0.8 (box) or 0.65 (backdrop), with padding scaled to the text
size.

**What the host's edits are not checked for** (owner decision, `spec.md §20.1`): contrast, a box
crossing the outline (clipped as guests will see it), overlap with the artwork's subject. The
editor shows the card exactly as guests will see it.

**Line breaking for edited boxes.** One deterministic function breaks a box's text at its width
from the font's own metrics (the font store's extracted metrics, so the server and every browser
agree), with the same rules as §4.3: even lines, no stranded short word and then no one-word last
line where another break exists,
never inside a word except just after a hyphen between letters (a space preferred: a hyphen break
is used only when it saves a line), a hard break where the host typed one. The result is stored as the box's
`lines` and rendered exactly; a later change to the text, width, font, size, spacing or case
re-breaks it. A fact edit — in the editor or outside it — re-breaks that fact's boxes in every
customization of the event on save, so a card restored later never shows stale lines.

**Title and fact boxes store lines from saved words only.** A fact with no saved value stores no
lines, and a placeholder or a prompt-stated value (shown in Creation Mode, marked to confirm) is
broken at its box's width when the card is drawn and never stored: the placeholder date moves with
the day, and neither ever reaches guests. Every reader re-breaks a title or fact box whose stored
lines no longer spell its current words, so a fact or title change shows correctly even when the
re-break at save failed. Stored boxes are untrusted (the save function is reachable over RPC):
every read parses them through the `TextBox` schema, and a customization that does not parse is
drawn as the generated layout, with a notice to collaborators.

The editing surface is the card component (§6.1) with selection, handles and guides drawn above
it in app chrome; nothing of the editor's chrome is part of the card. Gestures, toolbar and
accessibility: `docs/design-system.md`, `docs/screen-spec.md`.

---

# 8. Versioning

Recorded on every `CardDesign` and generation run (`src/lib/ai/versions.ts`):

```ts
EVENT_IDENTITY_PROMPT_VERSION, EVENT_IDENTITY_SCHEMA_VERSION
CARD_DESIGN_PROMPT_VERSION,    CARD_DESIGN_SCHEMA_VERSION
CARD_ART_PROMPT_VERSION        // the deterministic art-prompt assembly
CARD_LAYOUT_SET_VERSION        // card_layouts_v7: layouts (the covers since v6), per-shape zones and art instructions, slot specs and limits, shape outlines
CARD_COMPILER_VERSION          // card_compiler_v7: validation, starting text placement and ink on the actual image, layoutCard's sizing steps, line breaking
imageModel                     // provider + model id, recorded per artwork
```

Never edit a prompt, schema or layout set while keeping its version. A card renders with the layout
set it was generated against; the renderer supports every layout-set version that has a live card.

---

# 9. Tests and gates

- **Unit:** schema validation; wording fact checks; layout/mode compatibility; starting text
  placement and ink against synthetic backgrounds (staying put, moving, splitting, workable or
  not, never leaving the text-safe area); `layoutCard` sizing and line breaking; slot limits;
  text backgrounds (validation, saving, drawing in both renderers);
  every zone inside its shape's text-safe area; edited-box line breaking from stored metrics;
  carrying words to a fresh layout; customization revisions and stale-save refusal.
- **Editor:** end-to-end at 390px and desktop — select, drag, pinch, rotate, type, restyle, add,
  delete, undo/redo, reset — with the stored card re-rendered for a guest showing the same lines,
  positions and styles as the editor at the same size in the same browser.
- **Layout fixtures:** every layout × supported shape × pairing with worst-case and typical content
  renders in a real browser at card scale with no text outside its zone or its shape's outline, with
  no exceptions (`npm run test:fixtures`). This is a test-time check; production does
  not run a browser to verify cards.
- **Creative evaluation:** the corpus in `docs/model-evals/creative-understanding.json` against the
  real identity and card-design calls (`docs/model-contracts.md §6`).
- **Human gate:** Human Test #2 judges real generated cards from real prompts, in colour, as the
  launch quality gate (`spec.md §30`). Its protocol and threshold are frozen before results are
  seen.

---

# 10. Deliberately not in this system

Page composition by the model; per-event themed page styling; model-chosen colours, sizes,
positions or line breaks; text inside artwork (other than the milestone number, §2.7); host-uploaded, stock or retrieved imagery on the
card; inspiration images sent to the image model; a template or art gallery; a card back; an
image editor or any artwork editing; adding images, stickers or graphics to the card; landscape
cards and other die-cut shapes (scalloped, ticket, pill/capsule, custom) — deferred
(`spec.md §33`).

> **One card, designed for this event. The artwork is the design's; the words are the host's to
> change, style and place — and guests see exactly what the host saw.**
