# Revision 7 — the invitation-card pivot

Revision 7 changes what the product makes. The AI no longer generates a custom event website; it
designs **one digital invitation card** — generated artwork with real text set over it — delivered
in an envelope that opens, above a standard event page in one neutral house style. RSVP, guests,
registry, roles, publishing and the prompt-first flow carry over.

This file is the record of the decision. Revision 6 documents, proofs and evidence were deleted
with the pivot by owner decision; git history is their archive (the last commit carrying them is
`e86e7e9`).

## Why

- **The website did not clear the creative bar.** Human Test #1 reviewers read the generated sites
  as "well-typeset flyers": typography overreach, decorative monograms dominating, no thematic
  anchor. An AI review of the same sheets rated the hand-authored library — the best the
  composition language could express when a person wrote it — no better than the model, which put
  the ceiling in the language itself.
- **What reviewers wanted was an invitation.** Their reference designs were invitations: an
  illustrated anchor, supporting motifs, a border, a palette drawn from the artwork, restrained
  typography.
- **A card is a tractable creative problem.** One fixed canvas instead of a responsive multi-section
  page removes responsive layout, per-concept geometry verification and the diversity machinery, and
  concentrates the "it read my mind" moment in the object the host actually sends.

## Decisions made with the owner

| Question | Decision |
| --- | --- |
| What is generated? | One invitation card (Paperless-Post-style), revealed from an envelope; event details stay standard |
| Existing website code, proofs, Human Test #1 survey | Deleted now; reusable pieces kept for the card |
| How guests receive it | Both: host shares a link/QR, and the platform can send personal invitations |
| Channels for platform invitations | Text only |
| Personal invitation link | Identifies the party (no SMS code) and skips the private event code |
| AI-written wording | Yes — a title and invitation line, editable; facts only from the host |
| Artwork | Every card has generated artwork; it may be minimal (a border or texture) |
| Card shape | Portrait (about 5×7), front only — extended to six shapes in Revision 7.1 (below) |
| Designs per round | One at a time, with `Try another direction` |
| Host edits without AI | Words and font (among the design's curated pairings) |
| Page under the card | One neutral house style for every event |
| Private event, shared link | Sealed envelope with the event title until the code is entered |
| Image model | Decided by a bake-off — replaced in Revision 7.1: the owner chose the models (below) |
| Database | No migration in this pass; the card-data phase replaces the website tables |
| Superseded docs | Deleted; git history only |
| Price | Keep $49 one-time as the hypothesis |

## Defaults chosen in writing Revision 7

Smaller choices made to keep the documents consistent. Each is canonical in the place cited and can
be changed there:

- the first card generated for an event becomes active automatically; later cards only when chosen
  (`spec.md §7.11`);
- the card's title is the event's title: a host-supplied title is used verbatim, otherwise the
  design drafts one (`spec.md §7.3`, `§20.2`);
- the font control offers the design's primary pairing plus up to two alternates the design names
  (`spec.md §7.14`, `card-system.md §2.6`);
- facts reach the draft through a separate cheaper extraction call, not the Event Identity
  (`spec.md §7.5`) — this resolves an open question Revision 6.1 left unresolved;
- invitations can be sent only after publish, after a one-time host attestation, within a small
  per-party cap (`spec.md §7.18`, `§13.2`);
- the host can copy and rotate any party's personal link after publish (`spec.md §12.5`);
- all card text must clear 4.5:1 contrast; an art-derived legibility panel is applied when no ink
  can (`card-system.md §4.2`);
- inspiration images go to Event Identity only, never to the image model (`spec.md §7.6a`);
- a failed generation is shown honestly with a retry; there is no template or stock fallback
  (`card-system.md §3`);
- when model-drafted wording fails the fact check twice, standard wording is used ("A Baby Shower",
  "Please join us for a baby shower") and becomes the event's effective title until edited;
  host-supplied or host-edited wording is never fact-checked (`card-system.md §4.1`);
- a personal invitation link resolves only after publish, and a bare request returns only the closed
  envelope, so link scanners never receive private content or create a session (`spec.md §12.5`);
- a party that has opted out of texts is treated like Needs phone on the shared-link path
  (`spec.md §12.5`);
- the card-reveal latency target is a working ~30 s at p75 until Phase 3 validation measures the
  real image model (`spec.md §7.10`).

## What changed in the documents

| Document | Change |
| --- | --- |
| `spec.md` | Revision 7 rewrite. New §7 journey (card design, artwork, compilation, reveal, try another direction, send invitations), §11 card architecture, §12.5 personal links, §13 invitations, §14.2 sealed envelope, §20 card editing, §24 domain model, §31 acceptance criteria regrouped, §32 guardrails rewritten (47) |
| `docs/card-system.md` | **New.** The card architecture; replaces `event-renderer-system.md` |
| `docs/product-doctrine.md` | Rewritten for the card; same principles (understanding, facts vs interpretation, clarification, no decisions for the host) |
| `docs/model-contracts.md` | Revision 3: Event Identity v3, fact extraction, Card Design, Card Art, the creative-understanding evaluation |
| `docs/model-prompts/event-identity.system.md`, `docs/model-schemas/event-identity.schema.json` | v3: removed `compatibleTonalDirections` and `compatibleFamilies`; `visualMotifs` names subjects for the artwork |
| `docs/technology-decisions.md` | Headless Chromium retired; image model added, undecided (§8.1) |
| `docs/design-system.md`, `docs/e2e-workflow.md`, `docs/screen-spec.md` | Rewritten for the card, envelope, house-style page and invitations |
| `docs/development-plan.md` | Re-sequenced: bake-off (now model validation, 7.1) → card compiler/renderer → generation → Creation Mode → guests/RSVP → registry → publish and invitations → launch |
| `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/README.md`, `.claude/agents/*` | Re-pointed at the card architecture |

## Deleted

Documents: `docs/event-renderer-system.md`, `docs/CHANGELOG-v5.md`, `docs/CHANGELOG-v6.md`,
`docs/reconciliation-audit.md`, `docs/renderer-invariant-obligations.md`,
`docs/phase-3-reference-defects.md`, `docs/phase-3/`, `docs/human-test-1/`, `docs/renderer-tests/`,
`docs/spike/`, `docs/prototypes/`, `docs/history/`, the DesignIntent and Composition prompts and
schemas and their histories.

Code: the composition language, compiler, planner, legacy library, geometry verifier and primitive
renderer; `proof-a1/`, `proof-b/`; the Human Test #1 survey; the geometry spike; their scripts,
tests and fixtures; the `renderer-proof` CI job; `@sparticuz/chromium`.

Kept for the card: `src/lib/card/color.ts` (WCAG/OKLCH colour maths), `src/lib/card/typography.ts`
(twelve curated pairings), `public/fonts/card/` and `src/styles/card-fonts.css`.

## Revision 7.1 — card shapes

Asked after the pivot merged: Revision 7 had assumed a plain portrait rectangle without asking about
the card's outline. Decisions made with the owner:

| Question | Decision |
| --- | --- |
| Which shapes for MVP | Six: rectangle, rounded rectangle, arch and oval (portrait 5:7); square and circle (1:1) |
| Landscape | Not in MVP; portrait and square only |
| Who picks | The design picks the shape; the host can switch |
| Switching across proportions (tall ↔ square) | Generates new artwork for that proportion from the same brief; same-proportion switches are instant |
| Further shapes | Deferred: landscape, scalloped, ticket, pill/capsule, custom die-cuts (shield, cloud, heart, tag) |

Consequences written into the documents: the outline is code-defined geometry applied as a mask,
never drawn by a model or into the artwork; each shape has a text-safe area; each layout declares
the shapes it supports, with slot limits that fit every one of them; ink is resolved per supported
shape; a cross-proportion switch is a generation (before publish only) that adds an artwork to the
design and keeps the original for an instant switch back. Documents changed: `spec.md` (Revision
7.1: §0.1, §4.2, §7.7–§7.9, §7.14, §8, §9.3, §10, §11.2–§11.3, §20, §24, §25, §29, §31, §32 #24
and #28, §33, §35), `card-system.md` (§1, §2.1–§2.3, §3–§9), `model-contracts.md` (§5.1, §5.3,
§7), `design-system.md`, `screen-spec.md`, `e2e-workflow.md`, `development-plan.md`,
`technology-decisions.md`, `product-doctrine.md §14`, `CLAUDE.md`, and the `generateCardArt` input
type.

### 7.1 review fix — which shapes an artwork fits

Codex review of the 7.1 change (after it merged) found that artwork composed for one outline can
lose its subject or look wrong when trimmed to another of the same proportion — a rectangular
border cut into an oval. Owner decision: **regenerate when needed.** Illustration and atmosphere
artwork is composed safe for every supported shape of its proportion, so those switches stay
instant; border- and frame-led artwork (`framed`, `minimal`) fits only the shape it was made for,
so switching its outline generates new artwork, like a tall ↔ square switch. Every shape stays
available. The same review aligned `spec.md §7.6a` and §31 with the shape composition rule, and
the `generateCardArt` input now derives the raster's proportion from the shape
(`src/lib/card/shapes.ts`), so an invalid shape/aspect pair cannot be requested.

### 7.1 — the owner's first image-model test, and the brand line

The owner tried a frontier image model (reported as OpenAI GPT 6.1 Sol Max) with two briefs: a spring
engagement brunch ("romantic and fresh … not rustic farmhouse … not generic wedding-template") and
a "Ralph Lauren bear" baby shower in navy and brown. Findings, written into the documents:

- **No text, every time.** All six outputs honoured "no words", supporting the core split: the model
  paints, code sets the words.
- **Taste was understood**, and feedback steered it ("materially different" changed the structure;
  "more modern" changed the medium).
- **Reserved space works when stated.** Told to keep a vertical oval clear for text, it did — the
  same mechanism as the layout set's quiet regions.
- **Presence.** Told only where to stay out, it shrank the artwork to token props on an empty field.
  Layouts now state the presence they want (`card-system.md §2.3`; eval CA-06).
- **Subject continuity.** Asked to rearrange, it kept the same bear. Shape switches that need new
  artwork now pass the current artwork as a reference so the subject stays the same
  (`spec.md §7.14`, `§7.6a`; eval CA-07); Phase 3 validation confirms the chosen model can do it.
- **Shapes behaved as 7.1 assumes.** Corner-cluster art would be cut by an oval or arch; framed art
  only fits its own outline. A scalloped edge can be painted as framed art inside a rectangle.
- **Brand references.** Asked for a "Ralph Lauren bear", it produced a near-replica of the brand's
  bear. **Owner decision: close homage allowed** — a card may clearly evoke a brand's character or
  look, but never carries a logo, wordmark, brand or character name, or copied campaign art, and
  briefs never name the brand (`spec.md §7.6`, §27, §31, §32 #18; `product-doctrine.md §11`;
  Event Identity prompt and schema v4; corpus cases CU-01, CU-02, CU-04). This carries trademark
  and copyright risk for a platform that charges to publish; legal review before launch is an open
  item (`product-doctrine.md §14` #7).

### 7.1 — the models chosen; no bake-off

Owner decision, 2026-10-04: rather than compare candidate models, the product uses **GPT 6.1 Sol**
(OpenAI) for `generateEventIdentity` and `generateCardDesign` and **GPT Image 2.5 Sunburst**
(OpenAI, the quality tier) for `generateCardArt`. The basis is the owner's own test above, and
Sunburst's published capabilities match what the card system needs: custom sizes in multiples of
16 for both proportions, transparent backgrounds, and reference images for same-subject shape
switches. Both stay behind the thin provider interface.

Phase 3 becomes a short **model validation** instead of a bake-off: it runs the chosen models
through the API on the corpus and the owner's briefs, confirms API output matches what ChatGPT
produced, checks presence, subject continuity and brand refusals, and fixes the pinned model IDs,
raster size, text and safety detection, the layout catalog and measured latency and cost. If
Sunburst misses latency or cost, GPT Image 2.5 Flare is the first fallback. The fact-extraction
model is picked there too. Documents changed: `technology-decisions.md` (§2, §8, §8.1),
`development-plan.md` (principles, Phase 3), `spec.md` (§7.6a, §7.8, §7.10, §9.1, §9.2, §11.3),
`card-system.md`, `model-contracts.md`, `product-doctrine.md §14`–`§15`, `CLAUDE.md`, `README.md`.

### 7.1 — Phase 3 validation: the card clears the bar

The chosen models were run through the API on the fourteen-case corpus and the owner's two briefs
(`docs/model-evals/phase-3-validation.md`). Before any output existed the owner set the bar —
10 of 14 cards they would send as they are — and judged round 2 at **11 of 14**. Spend: $3.61 of a
$25 cap. Decisions taken on the results:

| Question | Decision |
| --- | --- |
| Image quality setting | Sunburst `high`: on a full-corpus comparison `medium` lost no detail and would halve the wait, but the owner found `high` brighter and more vibrant |
| Reveal latency | Re-set from measurement: identity ≤ 15 s, card ≤ 70 s at p75; the details form fills the wait (`spec.md §7.10`) |
| A famous character the provider refuses | First attempt keeps the close homage; the regeneration steps back to the character's world with a short, plain copyright note (`spec.md §7.6`, §31; `card-design.system.md §10`; re-prompt kind `provider-refusal`) |

Also written in from the run: the validated layout set with each layout's shapes and art modes
(`card-system.md §2.3`), the 1440-pixel rasters, the text and safety detection chain and pinned model
IDs (`technology-decisions.md §8.1`), the Card Design string bounds (`model-contracts.md §5.1`),
the `card_design_v1` and `fact_extraction_v1` prompts and the generated `card-design.schema.json`.
The corpus's CU-11 `eventType` is corrected to the host's literal "Baby shower", as its own rule
requires. Carried forward: presence for sparse cards (Phase 5), a unit test for the ink rule's
tail selection (Phase 4), a higher OpenAI usage tier before launch (Phase 10).

## Revision 7.2 — the card editor

Asked after Phase 3: should hosts be able to add and edit text boxes on their card — drag and drop,
change fonts and colours — once it is generated? Revision 7 had allowed only the card's words and a
font among the design's pairings. The owner chose the full option — "go big or go home" — with a
seamless editing experience on a phone, in the spirit of Paperless Post and Canva.

| Question | Decision |
| --- | --- |
| How much control | A free text editor: every text is a box the host can edit, move, resize, rotate, duplicate, delete, reorder and restyle, and new boxes can be added |
| Readability of host colours | No checks — the host's choices are theirs; the generated card still clears 4.5:1, and the page under the card carries every detail accessibly |
| Artwork | Text only; the painting stays as generated; no images or graphics added |
| A new direction or shape after editing | Keep the words, added text and fonts; lay them out fresh; keep the edited card to return to |
| Fonts | The full Google Fonts library |

Defaults chosen in writing it, canonical where cited: fact boxes stay linked to event details
(`spec.md §20.2`); text past the outline is clipped as guests see it (§20.1); undo/redo, autosave
and stale-save refusal between collaborators (§20.3, §20.5); edits allowed after publish (§8.1);
fonts copied into platform storage on first use and served by us, never fetched by guests from
Google (`technology-decisions.md §8.3`); the editor built on the card component in the DOM, not a
canvas library (§8.3); line breaks for every box computed deterministically and stored, so guests
see exactly what the host saw (`card-system.md §7`).

Documents changed: `spec.md` (Revision 7.2: §0, §0.2, §4.2, §4.10, §5.1, §5.2, §7.7, §7.9, §7.14,
§8.1, §11.6, §11.7, §20 rewritten as Card Editing, §24 `CardCustomization` and `CardFont` replacing
`Event.cardEdits`, render state, §30, §31 new "Card editor" group, §32 #22, #23, #25, #26, #28),
`card-system.md` (§1, §2.6, §4.2, §4.3, §5, §6.1, §7 rewritten, §9, §10), `technology-decisions.md`
§8.2, §8.3, §9, `product-doctrine.md §7`, `§13`, `development-plan.md` (Phase 4 text layer, new
Phase 6b), `design-system.md`, `screen-spec.md`, `e2e-workflow.md`, `CLAUDE.md`, `AGENTS.md`.

### 7.2 review fixes

An independent senior review approved 7.2 with fixes and no blockers. Settled in the documents:
the title and invitation line keep their slot limits, so carried words always fit a fresh layout,
while added text has a per-box limit (`spec.md §20.2`); carried words come from the card being
switched from (§20.6); every customization holds a box for every fact slot, and a fact change
re-breaks those boxes in every customization of the event (§20.2, `card-system.md §7`);
`Reset card` is a new revision, never a delete, and never reverts the title (§20.5); the font
picker shows pre-rendered specimen images, and the server's font fetch is limited to catalog
families from fixed Google Fonts hosts, type- and size-checked, with licence text stored
(`technology-decisions.md §8.3`); host-chosen colours are recorded as an accepted limitation
(`spec.md §34`).

### Phase 4 — the card data migration

`20261004000000_phase4_card_data.sql` replaced the website-era tables with the card tables
(`spec.md §24`). It also dropped `human_test_1_responses`: by owner decision (2026-10-04), the
Human Test #1 responses were dropped without an export.

### 7.2 — carried words come only from a customization

Building `carryWords` showed that carrying from a card's generated layout would put one design's
model-drafted wording onto another: a new direction would arrive wearing the previous design's
title and invitation line. Carrying now happens only from a customization — words the host has
edited — and the carried layout is saved as the new card's customization, so it is stored and
carries on at the next switch (`spec.md §20.6`, `card-system.md §7`). A card the host never edited
switches to the new card's own generated layout and wording.

### Phase 4 — fitting every detail on every card (owner decisions)

The layout fixtures (`tests/fixtures/card-layouts.test.ts`) set every layout × shape × pairing in
Chromium. Typical content fits everywhere. With every slot at its limit, the cards whose picture
sits above or below the words on a square, oval or arch, and every such circle, cannot hold all the
details at a readable size; the cramped text shows even with typical content on squares and
circles. Two decisions by the owner (2026-10-04):

1. **Every card shows every detail; the picture gives way.** On square, oval and arch cards with
   the picture above or below the words, the picture shrinks to roughly 40% of the card, so the
   text area grows. The art instructions change with it, so image quality is re-checked on the
   corpus. Circles keep the words in the middle: picture-above and picture-below layouts do not
   offer the circle. Rejected: showing only the essentials on those cards (hosts, baby name and
   RSVP date on the page alone), and dropping those shapes from the picture layouts.
2. **Characters the card cannot draw are refused at entry**, with a plain message beside the field
   (for example an emoji, or an alphabet the card fonts do not cover). Emoji on the card may come
   later.

### Phase 4 — how the fit decisions were built

- **`card_layouts_v2`, `card_art_v2`, `card_compiler_v2`.** No card had been made from the v1
  versions; they are bumped rather than edited, as `card-system.md §8` requires. Composition and
  presence now come from the shape, so the art prompt depends on it.
- **Fit sets.** An artwork fits only the shapes of its proportion whose composition is the same: a
  40%-picture artwork (square, oval, arch) is not reused on a rectangle, where it would leave an
  empty band between picture and words; switching between those groups paints new artwork from
  the same brief, as any switch to a shape no artwork fits already does.
- **Line breaks after a hyphen.** Allowed between letters as a last resort: `layoutCard` first
  searches every size without them, so a name stays whole where a slightly smaller size keeps it
  whole.
- **Formatted facts.** Date "Saturday, June 6", time "1:00 pm – 4:00 pm", RSVP-by "RSVP by May 30"
  (no year on the card; the page carries the full date), built by one producer, `cardContent`,
  which Phase 5 uses to turn event fields into card text. When there is no venue name the card
  shows the address's first line (up to its first comma or line break); the full address is on
  the page.
- **Entry checks** (`validateCardText`): characters the slot's curated faces cannot draw, length,
  and words too wide for the narrowest zone are refused with a plain message beside the field, in
  the details form and its server action (title, hosts, baby's name, venue name, the address's
  first line). The curated font files cover Latin-1 only, so names such as "Łucja" or "Nguyễn"
  are refused today; wider subsets are a launch item.
- **Re-checked on six cards** (2026-10-04, $0.80): two new designs from approved briefs (a square
  and an arch) and four shape switches to the 40% compositions, set with the real renderer and
  every detail. Painted from the earlier artwork as a reference, the switches first kept the
  subject at its old size (three of four needed the backing panel); the switch prompt now tells
  the image model to make the subject smaller where the composition gives it less of the card,
  and one of four needed it. The owner judged all six sendable (below).
- **Square frames and corners** keep their text in a 260–740 band; their composition now names
  the middle 50% of the height to match.
- **Card text rendering.** `text-rendering: geometricPrecision` on card text: Chromium hints small
  text on Linux and in the headless shell, which rounded glyph advances and moved lines by up to
  5% at phone size. Card fonts load with `font-display: block` and are preloaded, so a stored line
  is never drawn in a fallback face.

### Phase 4 — link previews

- **Mechanism.** `next/og`'s `ImageResponse`, no new dependency and no production browser
  (`technology-decisions.md §8.2`). The card preview is an SVG drawn from the data the card
  component renders, under its validation, with every stored line as glyph outlines at the
  measured font instance; the private event's preview is a drawing of the house envelope with the
  title alone.
- **Owner decision: two drawings, one data contract, fixture-guarded** (2026-10-04). The spec said
  one card component renders the card everywhere, link previews included. The component needs a
  browser and production runs none (`technology-decisions.md §8.2`), and `next/og` cannot set
  card text as it was measured, so the preview is a second drawing: from the same stored data and
  line breaks, under the component's validation, with a real-browser fixture comparing the two
  line by line on every change. The owner chose this over a production browser and over a capture
  in the host's browser. The guarantee is a test, not structure: the drawing code exists twice
  (DOM/CSS and SVG) and could drift, and the fixture is what catches it. Updated: `spec.md §11.10`,
  §20 "One component", the §31 "One card component" criterion and §32 guardrail #26;
  `card-system.md §6.1` and §6.4; `design-system.md §10.14` and §15.7; `screen-spec.md`.

### Phase 4 close-out — owner decisions (2026-10-04)

- **The six re-checked cards: sendable.** The owner would send each. A few small overlaps of text
  and picture are acceptable because the host can nudge a text box in the card editor (Phase 6b).
  `card_art_v2` is still re-checked on the full corpus before the first real card (Phase 5).
- **Repaints before a panel: yes.** An artwork that passes validation but would need the legibility
  panel on the shape it was painted for is repainted from the same art prompt; the first artwork
  that needs no panel is kept, and if none does, the original (first valid) artwork is kept with
  the panel. The owner then lifted the one-repaint cap ("we don't have to cap the repaints at 1 if
  they're cheap") and applied the rule to shape switches too. Each repaint costs about 6¢ but adds
  about 30 s to the reveal, so the cap is **two extra images per artwork in all** (a validation
  regeneration included): at most about 12¢ and a minute on the cards that need it; Phase 5
  measures the rate and the cap can rise. Code decides from ink resolution; repaints are made one
  at a time and stop at the first that clears, so it is a retry, never a pick from a batch
  (guardrail #30). Small overlaps that leave the text legible without a panel do not trigger it. A
  repaint that fails validation is dropped; only the artwork the card shows is persisted. Updated:
  `spec.md §7.8`, §9.5, §10, a §31 criterion and guardrails #20 and #30; `card-system.md §3`;
  `model-contracts.md §7.3` and §9; the `CLAUDE.md` pipeline sketch.
- **Wider font coverage: Latin Extended and Vietnamese, in Phase 10.** Greek, Cyrillic and other
  scripts later.
- **Spend limits for the test period:** a $20/day ceiling across all generation, at most 30
  generations per event per day and 60 per acting host per day (`spec.md §10`; built first in
  Phase 5). The owner has set a monthly budget on the OpenAI account as a backstop.
- **The dev-fixture routes on Vercel previews:** approved, to confirm on a real deployment that the
  fonts are bundled. `ENABLE_DEV_FIXTURES=1` is set for the Preview environment only; a preview
  drew a card and an envelope from the bundled fonts, and CI now checks the build's traces.
- **Free clean-up, approved:** the fonts' licence texts ship beside the files; and text within the
  limits that some design cannot fit is refused at entry by an exact fit check on the server
  (`card-system.md §2.5`). Building it showed the gap was wider than "MMMM …": a 40-character
  title in capitals, such as "WELCOME WILHELMINA MONTGOMERY-WHITWORTH!", overflows 47 of the 300
  layout × shape × pairing combinations, and is now asked to be shortened. A browser-side estimate
  was tried and dropped: an upper bound on glyph widths is 1–3% loose over a line and refused the
  worst-case title the fixtures prove fits.
- **Phase 5:** waits for the owner's go-ahead.

### Phase 5b — the generation pipeline: decisions made while building it

- **The PNG reader is our own.** The image model returns PNG only, so artwork validation and ink
  sampling use an in-house reader on `node:zlib` (8-bit RGB/RGBA, non-interlaced; CRC and size
  checked; no more than 40 million pixels) rather than an image library; it also strips the colour
  and text chunks so artwork is stored untagged. Node 22.2 or later (`technology-decisions.md
  §8.2`).
- **A failed re-prompt keeps the earlier valid design.** When a card-design re-prompt's own call
  fails, the design already in hand is kept and the check that asked for the re-prompt takes its
  fallback (standard wording, or the repeat accepted); only a stage that never produced a valid
  design fails visibly (`model-contracts.md §9`).
- **A provider refusal's regeneration shares the image budget.** The re-prompted design's artwork
  continues the refused artwork's two extra images; its own failure is visible
  (`model-contracts.md §9`).
- **Generated wording clears the host's checks.** Model-drafted wording must use characters the
  card's fonts draw and fit every design, as a host's own text must; otherwise it is re-prompted,
  then replaced by standard wording (`card-system.md §4.1`, `model-contracts.md §5.3`).
- **The event type is the host's words.** The design is told the event type the prompt states
  (verbatim), not the launch default, so "60th birthday" is not designed as a baby shower
  (`model-contracts.md §5.2`).
- **Facts the prompt states are on the card from the reveal (owner decision).** They are kept with
  the generation (`generations.artifacts.facts`), shown on the card as the host wrote them and
  marked as needing confirmation like a placeholder, and offered in the details form to confirm or
  correct. An unconfirmed value is never published and never given to the design as a fact
  (`spec.md §7.3`, a §31 criterion, `model-contracts.md §4.3`, `screen-spec.md`). Built in 5c.
- **HEIC inspiration photos are converted in the browser (owner decision).** The model takes only
  PNG, JPEG and WebP, and the common image library will not decode HEIC (its codec, HEVC, is
  patent-encumbered; the Node alternatives are LGPL builds of the same decoder). So the upload page
  turns a HEIC photo into a JPEG with the device's own decoder before sending it (Apple devices
  read HEIC natively, and iPhones already convert on upload); a browser that cannot read it gets a
  plain message asking for a JPEG or PNG. No server decoder and no new dependency. Built with the
  inspiration work in Phase 5; until then HEIC uploads are stored but not sent to the model.

### Phase 5 — rendering families (owner decisions)

- **The corpus verdict.** The owner judged the Phase 5 corpus on the production stack: 13 of 14
  cards sendable. CU-10 ("something unique, idk surprise me") was not: "ugly, doesn't mean
  anything". CU-02 (the Ralph Lauren baby shower) was sendable, with a note: "consider minimizing
  white space and adding an image".
- **Nearly every card looked watercolour or hand-drawn, and our prompts caused it.** The only
  example media were handmade ("loose watercolour with gouache details", "soft gouache on cream
  laid paper"); the art prompt said "painted" and "paint the background"; and its rule "not a
  photograph or mockup", meant to forbid a photo of a printed card, read as "never photographic".
- **The owner's direction.** Nine rendering directions, not one house look: photographic,
  cinematic editorial, 3D/CGI, modern vector, flat/playful illustration, painterly/watercolour,
  line art, collage/mixed media, and pattern/design-led. A separate aesthetic mood (modern,
  romantic, luxury, preppy, whimsical …) combined with the rendering on purpose. No watercolour
  reflex: elegant, romantic, floral, garden or beach language is not a request for it. And
  "actively vary the visual language across generations unless the user's description strongly
  points toward a particular treatment."
- **Decision 1: each design names one of nine rendering families and an aesthetic.** The art
  brief's required `rendering` is one of `photographic`, `editorial`, `rendered-3d`, `vector`,
  `flat-illustration`, `painterly`, `line-art`, `collage` or `design-led`, and its required
  `aesthetic` is a mood in a word or two, separate from `mood`. Code turns them into a precise
  `Rendering: … Aesthetic: …` line in the art prompt (`src/lib/card/renderings.ts`); the mix is
  measurable from `card_designs.art_brief`; another direction sees each earlier direction's
  rendering and aesthetic so it can switch them. The repeat rule is unchanged (layout, art mode and
  primary pairing). The identity prompt carries a host's signal about how the artwork should look,
  no longer defaults to painted, and does not turn elegant or garden language into watercolour;
  the art prompt drops "painted" and "paint", and its mockup rule now forbids a photograph of a
  printed card, not a photograph.
- **Active variation.** Each generation draws a suggested rendering uniformly at random from the
  families this event's earlier directions have not used (all nine for a first card), and the
  design follows it unless the host's words strongly point to a treatment: an explicit style word
  the identity carries (the design's own aesthetic is never a reason to set the suggestion aside,
  and "elegant", "garden" or "beach" is not a style word). A design-led card takes the framed or
  atmosphere art mode, never one that needs a central subject; 3D characters are animals or
  objects, never people. `generations.telemetry` records the suggestion and whether it was
  followed — and, on a failure, the suggestion and any design's rendering — so the mix and the
  follow rate are measurable.
- **Design-led cards and lettering.** The owner listed monograms and typography under the
  pattern/design-led direction. The hard rule stands: artwork contains no letters, initials or
  monograms (`spec.md §7.6a` rule 2, §32 #16). In a design-led card the pattern carries the
  artwork and the card's own code-set text is the typography.
- **Decision 2: no people in photographic, editorial, 3D or collage artwork.** No person, face,
  hands or body. The art prompt and the design catalog say so for those four families, and the
  artwork inspection gains `hasPerson` (and a narrower `isMockup`, so a photograph filling the
  canvas is not a mockup); a person in such artwork fails it like text does, with the one
  regeneration. The finding's detail is never stored in failure telemetry.
- **Versions:** `card_design_v2` and `card_design_schema_v2`, `event_identity_v5` and
  `event_identity_schema_v5` (only the `textureDirection` description changes: it led with
  "soft gouache", and schema descriptions reach the model), `card_art_v3`,
  `card_art_inspection_v2` and `card_art_inspection_schema_v2`.
  Designs persisted under v1 have no rendering or aesthetic; they are immutable and never
  re-validated. Updated: `spec.md §7.6`, §7.6a, §7.7, §7.8, §24 and a §31 criterion;
  `card-system.md §2.4`, §3 and §4.1; `model-contracts.md §4`, §5, §7 and §9; the card-design and
  event-identity prompts and both schemas; `technology-decisions.md §8.1` (the inspection's people
  check).

### Phase 5 — round two, and two compiler fixes (owner decisions, 2026-10-05)

- **Round two.** The same sixteen prompts on the production stack with rendering families: sixteen
  cards, one after a "Try again" (CU-01's first attempt, editorial, had text in both images).
  Seven of the nine directions came up in the random draw, and every design followed its
  suggestion, as it should when no prompt names a medium. Median 66 s, p75 69 s; $1.98 in all.
- **Decision 1: never strand a short word.** Two titles broke "A / Wild Beginning" and
  "A / Well-Played Journey": the rule against a one-word last line pushed the article onto a line
  of its own. Line breaking now first avoids any line that is one word of three characters or
  fewer ("A", "The", "Our") where another break exists, then a one-word last line, then balances
  ("A Wild / Beginning"). It applies to all card text, the editor's boxes included; a hyphen break
  still ranks worse than a stranded word, and fewer lines rank first.
- **Decision 2: artwork reaching into the words is repainted, then given the panel.** On CU-10 a
  sculpture's base sat behind the first line of the title and still passed: the background is
  measured between its 8th and 92nd percentiles, and the intrusion was under 8% of the zone. The
  zone is now also measured in half-overlapping strips about a line tall (60 card units, one every
  30), and the ink is judged against the widest of the zone's and the strips' ranges. Artwork that
  fails only in a strip takes the existing path: repaint within the two-extra-image cap, then the
  panel. Calibrated on the 33 artworks of both rounds before shipping: twelve of 52 shape checks
  changed, all real intrusions at a zone's edge (leaves, ribbons, a teddy, the sculpture), none
  from paper texture; seven only took a darker ink, and three artworks would now be repainted.
- **Version:** `card_compiler_v3` (line breaking and ink resolution). Ink already resolved for a
  persisted artwork is never re-resolved; line breaks of the generated text layer are computed when
  a card is drawn, so every card drawn from now on uses the new rule, and a card editor box's
  stored lines change only when the box is next re-broken. Updated: `spec.md §7.9`, §11.6 and two
  §31 criteria; `card-system.md §4.2`, §4.3 and §7.
- **Open before launch.** The generated text layer is laid out when a card is drawn, and only
  the layout set pins how a card renders (`card-system.md §8`), so a later change to line breaking
  would alter cards already generated — published ones too, once there are any. Before launch,
  decide whether a design's recorded compiler version pins its line breaking or the canon says
  plainly that it does not (senior review, PR 27).

### Phase 5 — round two verdict: one central idea (owner decisions, 2026-10-05)

- **The verdict.** Round two cleared the bar again: 13 of 14 corpus cards sendable, and both of the
  owner's briefs. CU-10 ("something unique, idk surprise me") failed for the second time: "Too
  random — when told surprise me, need to pick a direction". CU-13 ("60th birthday for my dad, he
  likes jazz and old maps") was the owner's favourite: "AMAZING I LOVE THIS ONE — try to follow
  whatever you did for this for others".
- **What CU-13 did.** One image fused both of the father's passions: a saxophone drawn from an
  antique map, in flat editorial illustration, titled "A Well-Played Journey" — the picture and the
  words tell one story. CU-10's identity did the opposite: it read "surprise me" as "abstract
  sculptural forms" and "an unexpected twist", and the card had no subject a guest could name.
- **Decision 1: one central idea** (the idea, not the look; the rendering mix is unchanged). Every
  card is built on one idea; where the identity carries two or more of the host's own specifics,
  the design fuses them into one image rather than separate motifs — drawn or staged, so any
  rendering can carry it, and never a forced pun — and a drafted title plays on the idea's
  subject, never a place. With one specific, that specific is the idea. `card_design_v3`; the
  prompt's examples are deliberately not from the corpus.
- **Decision 2: "surprise me" commits to one clear theme.** With no creative cue beyond the
  occasion, the identity commits to one concrete theme that suits the event — something a guest
  could name in a few words — never the stock reading of the occasion, and never abstract forms or
  arbitrary objects. `event_identity_v6`. The identity call has no randomness input, so whether its
  choice varies across events is measured by running the case several times.
- **Versions:** `event_identity_v6` and `card_design_v3`; both schemas unchanged. Updated:
  `spec.md §7.5`, §7.7 and a §31 criterion; `model-contracts.md §4`, §5 and §6; the corpus,
  `creative_understanding_v2`, records both verdicts. A draft of these prompts ran briefly on the
  preview database before the senior review tightened them; it was stopped, and its generations
  are not evidence.

### Phase 5 — round three: three fixes before the owner's next look (owner decisions, 2026-10-05)

- **What round three showed** (the reviewed prompts, `card_compiler_v3`; 16 cases plus CU-10 three
  more times). Fourteen of sixteen cards were made; CU-02 and CU-13 failed honestly with lettering
  in both images (CU-13's photographed antique map carried place names). Told "surprise me", CU-10
  committed to a clear theme — and chose the same one, a lemon conservatory, four times out of
  four. And five of seventeen cards took two repaints and still ended with the legibility panel,
  about 70 s slower each; on O-02 the panel hid most of the bear.
- **Decision 1: check the ink behind the actual lines** (`card_compiler_v4`). The owner had chosen
  "the area right behind each line of text"; v3 measured strips across the whole zone, where
  foliage and sky at the edges of empty space failed it. v4 lays out the generated text for the
  words shown right after generation and judges the ink against the widest of the whole zone's
  range and each line's area, padded by a quarter of the line height and clamped to the zone
  (`src/lib/card/text-areas.ts`). Calibrated on the 56 preview artworks: the shape each card was
  painted for needed the panel 2 times under v2, 8 under v3 and 5 under v4 — CU-10's sculpture
  under the title, a ribbon under a title, roses under a detail line, and two artworks that needed
  it on the whole-zone measure already. The ink is judged for that one layout of the words; a
  later edit that moves lines keeps only the whole-zone floor, and persisted ink is never
  re-resolved. One producer, `revealCardContent` (`cardContentWithPlaceholders` is its words
  without the marks), gives the artwork stage, the reveal and the corpus the same words, so what
  is measured is what the card shows.
- **Decision 2: a random theme seed for "surprise me"** (`event_identity_v6`). The identity call
  has no source of variety, so code draws one of 97 everyday worlds per new identity
  (`src/lib/generation/theme-seeds.ts`; none naturally carries writing) and the identity builds the
  theme from it only when the host left the look to us, ignoring it otherwise — like the suggested
  rendering. Telemetry records `themeSeed`.
- **Lettered subjects are briefed blank** (`card_design_v3`, within guardrail #16). Maps, books,
  labels, signs and the like come back lettered and fail the card; the design describes them as
  blank ("an antique map of imagined coastlines with no place names or lettering") or picks
  another subject.
- **Round three again, then two refinements.** With all three fixes, fifteen of seventeen cards
  were made, one ended with the panel (CU-06, roses under a detail line), and "surprise me" gave
  four different themes (a woodland border, a fox, a butterfly garden, an origami crane). CU-13
  and O-02 failed on lettering twice each: briefs that named "an antique map", "a chart" or "a
  record label" — however firmly they said "no lettering" — and a 3D Ralph Lauren-style bear in a
  sweater, to which the image model adds the brand's mark. The design prompt now describes only
  the look of a lettered object ("flowing coastline contours", never "a map"), and a brand homage's
  clothing — and any manufactured thing that carries a maker's mark, such as an instrument — as
  plain and unbranded (CU-13's photographed saxophone came back with a maker's logo on its bell). Seven seeds image models letter (lanterns, boats, balloons, a
  carousel, a snow globe) were swapped for others. Telemetry records `lineAreasFallback`, the
  shapes judged on the whole zone alone.
- **Versions:** `card_compiler_v4`; `event_identity_v6` and `card_design_v3` gain the seed and the
  lettered-subject rule before they merge. Round three's cards are not evidence for the final
  prompts; round three is run again. Updated: `spec.md §7.5`, §7.9, §9.5, §11.6 and two §31
  criteria; `card-system.md §4.2`; `model-contracts.md §2` and §4.1.

### Phase 5 — round three verdict (owner, 2026-10-05)

- **13 of 14 corpus cards sendable, both of the owner's briefs, and both extra "surprise me"
  runs.** CU-10 cleared the bar for the first time, after failing rounds one and two; its three
  runs gave three different themes (origami birds, a dragonfly on a pond, a snowy wood). CU-13's
  card is the run after the maker's-mark rule, marked as such on the sheet.
- **CU-08 was not sendable:** "Close — but the giraffe's head is cut off. Would've been better if
  the sky just blended to become white as opposed to doing like a hard gradient." The artwork's
  subject reached under the title, both repaints did too, and the legibility panel — a cream
  rounded box with a soft shadow edge — covered the giraffe's head. Taken up next: the panel as a
  soft fade into the artwork rather than a box (a layout-set change, with fixtures).

### Phase 5c — order of the remaining work (owner decision, 2026-10-05)

- **Creation Mode now.** `Make it yours` leads from the reveal into Creation Mode, which needs
  Phase 6. Offered an interim page, holding the button, or building Creation Mode now, the owner
  chose to build it now: Phase 6 follows the reveal directly, before another direction and
  shape switches (5d) and taste clarification (5e). The reveal ships with it.

### Phase 5 — the panel fades into the picture; a repaint says what to keep clear (owner decisions, 2026-10-05)

- **Why.** CU-08's giraffe was "close — but the giraffe's head is cut off. Would've been better if
  the sky just blended to become white as opposed to doing like a hard gradient." The legibility
  panel was a cream rounded box with a soft shadow edge over the picture; and the giraffe's head
  sat under the title in the first image and both repaints, which repeated the identical prompt.
- **Decision 1: the panel fades into the artwork** (`card_layouts_v3`). Opaque paper over the
  whole text zone, then an eased fade in one colour. Words at one end of the card (`art-top`,
  `art-bottom`): the full width from that edge, fading over 180 card units toward the picture, so
  the sky reads as turning to paper. Words in the middle (`framed`, `corners`, `atmosphere`): the
  padded zone with a feather the owner chose from 140, 100 and 70 rendered on round-three cards —
  70, because a wider feather read as fog over the dark knit frame of O-02 while 70 kept it crisp
  and still read as soft light on the lemon frames. The fixtures check, for every layout × shape,
  that every line sits on opaque paper and that the component and the link preview draw the same
  fade. Artwork persisted with `card_layouts_v2` keeps its box panel.
- **Decision 2: a repaint says what to keep clear** (`card_art_v4`). When a picture runs into the
  words' area, its repaint is the same art prompt plus one line: keep the whole subject — anything
  tall such as a neck, a branch or a tower included — outside the calm area kept for the words.
  Same budget (two extra images per artwork). This revises the 2026-10-04 rule that repaints repeat
  the identical prompt; validation regenerations still repeat it, and so does the repaint of an
  `atmosphere` or `minimal` wash, which has no subject (its panel comes from the tone under the
  words). The line never refers to an earlier image, because on a shape switch the only image the
  model sees is the reference it must keep (senior review).
- **Updated:** `spec.md §7.7`, §7.8, §11.3 and a §31 criterion; `card-system.md §2.2`, §2.3, §3,
  §8; `model-contracts.md §2`, §5, §7; `CLAUDE.md` pipeline sketch.

### Phase 5c — the RSVP-by line on the first card (owner decision, 2026-10-05)

- **Decision.** Before the host saves a date, the card shows "RSVP by …" two weeks before the
  placeholder date, marked to confirm like the date, so the card's words do not move when the real
  date arrives and the ink is judged behind the line the host will see. Once a date is saved, its
  default deadline (`spec.md §7.3`) is the event's own and shows unmarked. When the date shown is
  the prompt's own words ("December 19"), which code does not read as a date, there is no RSVP-by
  line until the host saves a date, so the two never disagree.
- **Also built (5c server side).** The facts the prompt states are kept on the event
  (`events.prompt_facts`, written once with the first identity, by the server only) and shown as
  written when they pass the details form's own checks; `start_generation` answers `designed`
  once the first card exists, so opening the generation page again never makes a second first card.
- **Updated:** `spec.md §7.3`, §7.5, §24 and the architecture sketch; `card-system.md §2.5`, §3,
  §4.2; `model-contracts.md §4.3`; `technology-decisions.md` (the generation lock);
  `development-plan.md` Phase 5.

### Phase 5d — one box: the change the host asks for, or a new idea (owner decisions, 2026-10-05)

- **Why.** The owner made a Toy Story baby-shower card on the preview and loved it, then looked for
  a way to "give it more detail or ask to change things here and there". The spec only had
  `Try another direction`, always a genuinely different card, and no chat-level micro-edit loop.
- **Decision 1: one box does both.** `Try another direction` keeps one optional box. A request to
  change the card ("add a little dinosaur", "make it a starry night") keeps the card and changes
  what was asked; an empty box or a request for something new makes a genuinely different card.
  The design step reads the request; the host never picks a mode. Still one request and one card
  per round, every card kept in the designs list, the current card active until the host chooses.
- **Decision 2: build it next,** ahead of Creation Mode's remaining slices.
- **Decision 3: how the picture changes, by request** — chosen from a side-by-side experiment.
  Eight requests on four preview cards, each design revised once by the production design call,
  then painted two ways through the production validation, ink and card component:
  - *edit* (the image model's edits endpoint with the current artwork as the reference): "my card
    with that change" in 6 of 8 — the dinosaur added pixel for pixel, the same meadow recoloured
    pink, small Amalfi tiles tucked into an unchanged lemon border; every first image passed
    validation; but it holds the original's tones, so "starry night" came back mid-blue and needed
    the panel and "warmer, golden light" came back unchanged;
  - *repaint* (fresh from the revised brief): honoured the two whole-look changes, but rebuilt
    everything else (a different box, a new arrangement), and on the map-collage card 6 of 8
    images were rejected for lettering;
  - about 31–33 s an image either way; $0.076 an edit, $0.063 a repaint; $2.07 in all.
  So: a change to part of the card edits that card's artwork; a change to the whole look (light,
  time of day, overall colour) repaints the same idea; a new idea paints fresh. The design reports
  which it made (`refinement`: `part`, `whole`, `none`).
- **Consequence for a guardrail.** The image model may now receive the event's own generated
  artwork in two cases — a shape switch (as before) and a change to part of a card — and still
  never a host upload, an inspiration image or the host's words (`spec.md §7.6a`, §32 #17).
- **Watch:** edits of edits over many rounds may lose quality; the organisation's image limit (5 a
  minute) produced 429s under four parallel jobs, which the single transient retry would not ride
  out under load.
- **Updated:** `spec.md` §0, §1, §5, §7.6a, §7.7, §7.15, §30, §31 (Event Identity and card
  direction; Try another direction), §32 #17, §34, §35; `CLAUDE.md`;
  `product-doctrine.md §8`; `design-system.md §4.11`; `screen-spec.md` `try-another-direction`;
  `e2e-workflow.md` H05; `card-system.md` §1, §3, §4.1, §7; `model-contracts.md` §5.1–§5.5, §7.2;
  `development-plan.md`.

### Phase 5d — shape switches and one card at a time (build decisions, 2026-10-05; for the owner to confirm)

Made while building, overnight, each the one reading consistent with rules already decided; listed
here so the owner can overturn any of them.

- **A shape switch's provider refusal fails visibly, with no re-prompt.** A shape switch paints new
  artwork for the existing design from its own brief. The design is immutable (§32 #27), and a
  re-prompt would make a new design, while a switch changes the shape only. So the copyright step-back
  of a new card does not apply: the host sees "We couldn't make that shape …" with Try again, and
  the card stays as it is.
- **One card at a time, honestly.** `spec.md §10` allows one generation in flight per event. A
  `Try another direction` or a shape switch that meets a *different* generation in flight is told
  "Another card is being made" with Try again. It is never shown the other card as its own result;
  only the same request (a retry after a lost answer) waits on the one in flight.
- **A design from before rendering families keeps only the shapes its artwork already fits.** Its
  brief lacks what painting now needs, so new artwork is never offered for it. It can still be
  changed through `Try another direction`.
- **A shape switch's telemetry** records only the artwork's part, plus the shape asked for, the
  reference artwork's shape and the shapes the new artwork fits (`spec.md §9.5`).
- **When the new shape's artwork lands, the card moves to that shape** if its design is still the
  active one and the event is unpublished, even if the host switched to another instant shape
  meanwhile.
- **Updated:** `spec.md` §7.6, §9.5, §31 (Card design, artwork and compiler); `card-system.md` §3,
  §5; `screen-spec.md` `generation`, `try-another-direction`; `development-plan.md`.
- **Creation Mode's sheet and side panel are one component** (`Sheet`): full screen on a phone, a
  panel on the right from desktop width, the event visible and dimmed beside it
  (`design-system.md §10.6`, §10.7).

### Phase 6 — Creation Mode slices 1–3 (build decisions, 2026-10-05; for the owner to confirm)

Made while building, overnight, each the reading most consistent with the spec; listed so the
owner can overturn any of them.

- **The event code:** 8 characters from an alphabet without 0/O/1/I/L, shown as `XXXX-XXXX`
  (about 40 bits); typing ignores case, spaces and dashes. `New code` is limited to 20 an hour per
  event. After publish it replaces the old code at once, with a warning line and no confirmation
  dialog.
- **Going Public keeps the stored code,** so switching back to Private reuses it rather than
  changing what guests were told.
- **Privacy is one action,** before and after publish; `events.visibility` is server-managed.
- **Preview shows only saved facts.** A placeholder or an unconfirmed prompt-stated value never
  appears; when a required fact is missing, one line says that unconfirmed details aren't shown to
  guests. Its Desktop view keeps the card at the envelope's size; only the page widens.
- **`Try another direction ✦` appears twice** in Creation Mode, under the card and in the Design
  panel, so it is easy to find (the owner could not find a way to change the card at first).
- **A recent shape-switch failure** (within 30 minutes) shows again on a page loaded after it.
- **Co-hosts are invited by link.** No email provider exists yet, so the owner creates an invite
  link and shares it themselves; it works once, expires after 7 days and can be revoked. The
  owner's `Co-hosts` control sits in the owner toolbar until an event menu exists.

### Phase 6b part 1 — the card editor's server side (build decisions, 2026-10-05; for the owner to confirm)

- **Editor limits** (`CARD_EDITOR_LIMITS`, `src/lib/card/text-box-schema.ts`): up to 40 boxes on a
  card; an added text box holds up to 200 characters (the title and invitation line keep their slot
  limits); size 8–400, width 20–2000 and position −1000 to 2400 card units; rotation ±360°;
  letter spacing −0.5 to 2 em; line height 0.5–4.
- **A hyphen break is used only when it saves a line;** at the same line count a space always wins
  (the rule `layoutCard` already follows, so edited and generated boxes break alike).
- **Any curated face is accepted in a box,** not only the design's pairing, because words carried
  from another design bring that design's fonts. Google Fonts families arrive with the font store
  (6b part 3).
- **Deleting the title or a fact box hides it on that card only.** A new design or shape lays them
  out again; a deleted invitation line stays deleted. Duplicated title or fact boxes are allowed,
  and a carry takes the first title box.
- **The title travels to a new design only once the host has set it.** Until then the new card
  shows its own drafted title, in the host's carried font (`card-system.md §7`).

### Phase 7a — the guest list (build decisions, 2026-10-05; for the owner to confirm)

- **Guests are named.** A party is a list of named guests, each an adult or a child; the first is
  the main contact and must be an adult. `Allow a plus-one` is a separate switch; the host does not
  name the plus-one.
- **Phone numbers are US and Canadian only** (international texting is out of scope, `spec.md
  §13.3`). Saving a party by hand needs a number or `No phone available`; a CSV row without a
  usable number imports as Needs phone and is listed in the import's report. Numbers are not
  unique across parties (families share them).
- **The name on the invitation** is optional; when blank it is made from the guests: one name, "Ana
  & Luis Garcia" for two sharing a last name, "The Garcia family" when every adult shares the main
  contact's, otherwise "Ana Garcia & guests".
- **Limits per event:** 1,000 parties and 2,000 guests; an import that would pass either is refused
  whole. A CSV file may hold up to 1,000,000 bytes and 2,000 rows. A party's link can be rotated up
  to 60 times an hour per event.
- **CSV columns are matched by name** (Name or First name and Last name, Household, Phone, Email,
  Child, Plus one); rows sharing a Household make one party; nothing is de-duplicated against
  parties already added.
- **Personal links** are made with every party and shown only after publish (`Copy personal link`,
  `Rotate link` with a confirmation). The guest's side of the link is the next slice.

### Design-system Revision 5 — the Lantern visual language (owner decisions, 2026-10-06)

- **The product is named Revelnote.** There is no logo yet. Until one exists, the app uses an amber
  seal with an "R" as a marked placeholder, swapped centrally when the real mark arrives
  (`docs/design-system.md §5.2`).
- **Lantern is the visual language,** chosen from three concept directions (Studio, Lantern, Post)
  built around real generated cards at phone and desktop sizes: *paper lit for the evening*. It
  changes tokens, typeface, the landing composition, the envelope's look and two dusk surfaces. No
  behaviour, component hierarchy or boundary changes.
- **Dusk appears on two surfaces only:** the landing page and the envelope opening (guests', and
  the host's card reveal). Everything a host operates in, and the page beneath the card, stays
  light. There is no app dark mode (`docs/design-system.md §5.3`; `spec.md §31` updated).
- **Showcase cards on the landing are kept, never clickable.** They are a few real cards generated
  for sample events, captioned with their prompts, hung from a string of lights as illustration:
  never focusable, never selectable, never a starting point or a gallery. A phone shows at most one,
  and only if the composer still starts in the first viewport (`docs/design-system.md §4.1`;
  `spec.md §7.1`, the non-goals and guardrail #6 clarified; a §31 bullet added).
- **The landing headline is "Describe your event. Watch it light up."** The product promise in
  `spec.md §1` and `docs/product-doctrine.md §1` is unchanged.
- **Alegreya Sans replaces Inter** for app chrome, the house-style page and the envelope, served
  through `next/font` like Inter was. The type scale moves one step larger for its smaller x-height.
  The private-event link preview's title font follows, and the switch ships only if the title
  coverage test passes against it (`docs/technology-decisions.md §8.2`).
- **Amber is the primary action and the selected state, always with ink text.** Selection never
  relies on the amber fill alone. Field and control borders darken to `#7A81A6` so every boundary
  clears 3:1 (`docs/design-system.md §6.1`, §14.1).
- **Build order:** tokens, typeface and shared components; then the landing; then the envelope and
  house-style page; then Creation Mode and the card editor's chrome. Each step is its own PR with
  390px and desktop screenshots. The card itself does not change.

### Sign-in by token hash; sign-in email through Resend (2026-10-06)

- **`/auth/confirm` signs a person in by verifying an email token hash** (`verifyOtp`), then
  attaches the draft bound to that address (shared `completeSignIn`). Unlike the callback's code
  exchange, it needs nothing stored in the browser beforehand, so it is the route that makes a link
  opened in another browser or device work (`spec.md §7.2`). Only email sign-in types are
  accepted.
- **It never claims a draft by the browser's draft cookie.** A token hash proves control of an
  address, not of the browser that opens it: claiming by cookie would let someone's own link,
  opened in another person's browser, move that person's prompt into the sender's account (login
  CSRF). A draft follows only the address it was bound to; with none, the person lands on the
  composer signed in, and Create turns the idea into an event directly.
- **Signed in, the landing names the account Create uses** (owner decision, 2026-10-06;
  `spec.md §7.1`): `Creating as <address>. Not you? Sign out` just above the composer, the address
  in full, in place of the header's `Sign in`, so it is on screen whenever Create is. Someone's own link can still sign another browser in
  as them (any link that works in every browser can); this line is where the person sees it
  before their idea goes into that account. A dev fixture (`/dev/landing`) draws the signed-in
  states for the browser tests.
- **Emailed links return to `/auth/confirm`** (owner decision, 2026-10-06, preview first).
  `signInWithEmail` sends people back to `/auth/confirm?type=email` (plus `next` for an invite),
  and the email template appends the token hash to that address as given:
  `{{ .RedirectTo }}&token_hash={{ .TokenHash }}`, so a link works in any browser or mail app.
  The preview project's "Magic link" and "Confirm signup" templates use it now; production's
  switch after this ships. Until a project switches, its template still sends people through
  Supabase's own verify page, which returns a PKCE code to `/auth/confirm`; the route hands that
  to the callback unchanged, so that link completes only in the browser that asked, as before. A
  `RedirectTo` Supabase refuses (an origin outside the allow list) falls back to the site URL and
  makes an unusable link, so every deployment that sends sign-in email must be on the list.
- **Sign-in email goes through Resend** on the preview project (owner decision, 2026-10-06):
  Supabase Auth's custom SMTP (`smtp.resend.com`), 100 emails an hour instead of the built-in
  two. Until a sending domain is verified in Resend, mail comes from Resend's shared test sender
  and reaches only the Resend account's own address. Production stays on the built-in mailer
  until a domain is verified. This is a Supabase Auth setting, not app code; the email provider
  for the reminder fallback is still Phase 10's decision (`docs/development-plan.md`).
- **Test links without email:** `scripts/auth/test-sign-in-link.mjs <deployment-url> [email]` makes
  a single-use, one-hour sign-in link for the preview project and `@example.com` test addresses
  only (a test host account by default), for tests that should not depend on a mailbox.

### The card alone, as guests see it (owner decisions, 2026-10-06)

- **Nothing is drawn on the card for details not confirmed yet.** The dashed outlines around
  placeholder and prompt-stated details are gone from the reveal, Creation Mode and every other
  host surface. "Marked as needing confirmation" (`spec.md §7.3`) now means one line under the card
  ("Not confirmed yet: date, time, venue.") and the flags in the details form and on the page's
  detail rows; a new §31 Creation Mode bullet says so. The host sees the card exactly as guests will.
- **The dusk lifts once the card is out.** On the envelope opening (host reveal and guest), after
  the card has risen and its light has come up, the stage and the light fade to the page and the
  card sits on the light page alone (`docs/design-system.md §5.3`, §8.3). The card no longer draws a
  focus ring when focus moves to it after opening. Together the dusk box and that amber ring read as
  a mat and frame that belonged to the card. A sealed envelope keeps its dusk.

### The host's title and their own concept (owner decisions, 2026-10-06)

From the stored record of a real card that missed. The host wrote: "The whole idea is “The
Notorious ONE”—a little legend turning one … a beautifully designed ’90s hip-hop album cover …
chunky gold Cuban-link chains, a gold crown, Brooklyn brownstones …". Fact extraction returned the
title (curly quotation marks included), but prompt facts never reached the design, so the card
was titled "Little Legend, Big Beats". The new identity was given the random theme seed "peonies"
and grew flowering vines; the design followed the random `vector` suggestion because "album cover"
was not read as a style cue; the identity dropped the gold chains and kept gold only as crown
accents.

- **A name the host gives the event is the card's title, verbatim** (`spec.md §7.3`, §7.7, a new
  §31 bullet). In quotation marks (straight, curly or guillemets) or right after "called", "named"
  or "titled". Not a title: a quoted vibe word, words meant for something in the scene, a saying or
  lyric, or the bare name of a brand, show or character the party is themed on ("a “Bluey” party":
  the design writes a title evoking it, without the name); when unsure, none. `fact_extraction_v2`
  states the rule with examples (schema unchanged). Code keeps the title (`statedTitle`) only if it
  appears verbatim in the prompt in quotation marks or after one of those words, without its
  quotation marks, and passes the entry and fit checks a typed title gets; otherwise it is dropped
  and logged (`titleDropped`). It is kept in `events.prompt_facts.title`, never written to
  `events.title`; the design's `eventFacts.title` is the event's own title, else this one, so the
  host-title path uses it verbatim and never checks it, and every later direction reads it from
  the prompt facts until the host types a title or edits the title box.
- **The title never enters the art brief or art prompt**, and neither does a brand's or a real
  person's name or likeness (`spec.md §7.6`; `card_design_v5`). A test holds the art request to the
  brief alone.
- **Randomness is for vague prompts only** (`spec.md §7.5`, §7.6a, a new §31 bullet). The identity
  is the only reader of the prompt, so it decides: `event_identity_v7` and schema
  `event_identity_schema_v6` add a required `hostConcept`, decided first — `open` (nothing beyond
  the occasion), `cues` (cues but no concept or style of their own) or `own` (a named format such
  as an album cover, poster, magazine or storybook page; an explicit list of motifs; a decade or
  era; a named aesthetic; or how the artwork should look). The theme seed is still drawn before the
  call, since only the identity can tell, and used only when it records `open`; code draws and
  sends no rendering suggestion when it records `own`. Three values rather than two because the
  two existing rules have different thresholds: the seed was already ignored on any creative cue,
  while the rendering suggestion still varies cards whose hosts gave cues but no style. Identities
  persisted under schema v5 have no `hostConcept` and get a suggestion, as they did. Telemetry
  records `hostConcept`, and `suggestedRendering` and `followedSuggestion` are null when none was
  drawn.
- **A named format is a style signal; such formats carry writing** (`card_design_v5`). An album or
  magazine cover points to photographic, editorial or collage; album covers, record sleeves,
  posters, magazine and book covers join the things the brief describes by their look and never
  names, or the image model letters them.
- **Listed motifs are kept** (`event_identity_v7`). Every motif the host explicitly lists stays in
  `visualMotifs`; one left out for a product rule is named in `designConstraints`, never dropped
  silently. The prompt's restraint rules ("do not turn every word into a motif", "do not read
  elevated as generic gold") read as covering the host's own list; they now apply to inferred
  motifs only, and gold chains and crowns on an album-cover homage are named as ordinary props.
  Colours the host's motifs carry belong in the preferred palette.
- **Corpus** `creative_understanding_v3`: CU-01 is now the "Notorious ONE" case (title, event type,
  the chains and crown kept, no seed and no rendering applied; must avoid another title, the
  artist's name or likeness in the brief, lettering in the art, and a soft pastel kids' card), in
  place of "Ralph Lauren but baby", whose reference CU-02 and O-02 still carry. A separate
  six-prompt probe (`docs/model-evals/stated-title-probe.json`) checks the title rule does not
  over-trigger. Neither has been run; each paid run waits for the owner's approval.

### The cover layouts (owner decisions, 2026-10-06)

- **Two cover layouts, `cover-top` and `cover-bottom`** (`card_layouts_v5`, `card_art_v6`,
  `card_design_schema_v4`, `card_design_v6`; `docs/card-system.md §2.3`): one bold full-bleed
  scene with the words set in a calm band of it — the scene's own sky, wall, ground or field of
  colour — the way a record sleeve or a poster sets its type. A host who asked for "a beautifully
  designed ’90s hip-hop album cover" got a picture in the top 40% of a square card, because no
  layout could express a cover.
- **The design chooses between them** (owner: "let the design choose top or bottom"): `cover-top`
  for a grounded subject, the words in the calm space above it; `cover-bottom` for a subject that
  hangs, rises or fills the sky, the words in the calm ground below. A cover is chosen for bold,
  graphic or editorial identities and named formats, never for restrained ones.
- **Rectangle, rounded rectangle and square only**: a cover is a rectangular format, and curved
  outlines eat the bleed. Their bands and zones are `art-bottom`'s and `art-top`'s, so no slot
  limit, fit check or stored host text changes; the art is `illustration` with any rendering it
  allows, and when no ink clears after the repaints their legibility panels are `art-bottom`'s and
  `art-top`'s, fading from the words' edge toward the picture.
- **No format word reaches the image model** (album, cover, poster, sleeve, magazine): those
  formats come back lettered. A test holds the composition and presence text to that.
- The database enum `card_layout` gains both values (migration `20261015000000_cover_layouts.sql`).
- **Checked in code, not only asked of the model** (senior review): a design whose art brief repeats
  the host's title, or names a printed format outside its `avoid` list, fails validation and is
  re-prompted once (`docs/model-contracts.md §5.3` step 2).

### The fade stays clear of the subject (owner decisions, 2026-10-07)

- **Walked back:** the art giving way of 2026-10-06 (`card_layouts_v4`/`v5`, `card_compiler_v5`):
  the crop, the plate that shrank the picture and cut it straight on a flat fill, "nothing behind
  the words" for centred layouts and the host's low-contrast hint. On the owner's own card it read
  as a small picture pasted onto the card, and the owner had asked to fix only the fade that cut a
  picture off, not to remove fading. Those versions never reached production; their labels are not
  reused. The `card_layouts_v3` panels are back: the edge fade for words above or below a picture,
  the small soft glow for words in the middle, and every text of a generated card clears 4.5:1.
- **The slide** (`card_compiler_v6`; `docs/card-system.md §4.2` step 5): when the fade would lie
  over the subject, the whole picture is first drawn moved away from the words — up when it is
  above them, down when it is below — by the smallest of 5%, 10% or 15% of the card's height that
  puts even background under the fade, keeping its full width and size. The strip at its far edge
  leaves the card, whatever is there (on the owner's Notorious card, the top of the crown); the
  strip it uncovers lies under the panel's opaque paper. When
  no slide clears the subject, the one leaving the least of it under the fade is kept. The fade
  itself is unchanged.
- **Kept** (owner): the cover layouts (with the picture layouts' panels), the host's title from
  the prompt, no random theme or rendering for a prompt with its own concept, and the brief checks.
- `card_layouts_v6` carries the covers with the restored panels; `card_compiler_v6` the slide.

### Generated cards are starting designs: the artwork is preserved (owner decisions, 2026-10-07)

The owner clarified what a generated card is: an editable starting design. Hosts move, resize,
restyle and add text in the card editor and decide for themselves how much text may overlap the
artwork. The core rule: **preserve the generated artwork whenever it has workable space for the
invitation's words, give a sensible starting text treatment, and let the host customise it.**

- **Stopped — automatic corrections.** No legibility panel (no opaque paper or cream background, no
  broad fade, no wash behind centred words) is added because the starting text has a contrast or
  overlap problem. The artwork is never slid, zoomed, cropped or repositioned to make room for text
  (the slide of `card_compiler_v6` is removed), never forced into a separate picture section with a
  hard boundary, and never altered when the host moves or resizes text. Text over an illustrated
  object is not a failure. An otherwise usable image is not repainted because it misses an exact
  percentage boundary or because the starting text fails a contrast check. Workable space need not
  be flat, empty, white or texture-free: sky, brick, walls, gradients, textures, solid colours and
  intentionally designed paper all work.
- **Not stopped — design.** Fades, borders, textures and other treatments that belong to the
  requested artistic design are part of the artwork and stay valid. Paper backgrounds are fine when
  they suit the style; nothing forces every card into one continuous illustrated scene.
- **Workable space, judged on the actual image** (`card_compiler_v7`; `docs/card-system.md §4.2`).
  Code measures, for the starting text at its starting sizes, how much of the background behind its
  lines lets the chosen colour read at 4.5:1. The space may be one area or two (the heading — title
  and invitation line — and the details may sit apart), need not match the layout's coordinates
  exactly, and a tiny empty patch does not count because the whole starting text must sit in it at
  readable sizes. The text stays where the layout put it when that already reads well; otherwise
  it moves to the best place on the card, vertically, without changing its sizes or line breaks.
  There is no complex positioning system and no zero-overlap guarantee.
- **Reconsider the artwork only when there is genuinely no workable composition**: one repaint,
  asking for a quieter part of the picture for the words, within the existing two-extra-image
  budget; the better of the two images is kept, and the card is never replaced by anything
  pre-made.
- **The image prompt** (`card_art_v7`, `card_layouts_v7`) asks for a quieter area with low detail
  where the words will sit — whatever suits the design (sky, a wall, brick, fabric, a gradient, a
  texture, a solid colour or the paper itself) — instead of an empty "paper or wash" area kept
  "completely clear". Changing the prompt alone was not enough; the compiler changed with it.
- **Existing cards keep their stored look** (owner): a card generated with a panel keeps it, because
  its text colour was chosen against that panel; only new generations follow these rules. A stored
  slide (`artOffset`) is ignored, so such a card's artwork is drawn where it was painted.
- **Text background, chosen by the host** (`spec.md §20.1`). Every text box gets an optional text
  background: None (the default), Highlight (following each line), Rounded box (around the text
  block) or Soft backdrop (feathered locally behind the text), with colour, opacity and padding.
  Background opacity never lowers the text's. The background belongs to its box: it moves, rotates
  and reflows with it, is removable on its own, and never changes the artwork. Organic shapes may
  follow later. It is part of the Phase 6b card editor's requirements; this change delivers the
  data, validation, saving, rendering on the card and in link previews, reusable controls and a
  developer page that exercises them. The customer-facing editor is still Phase 6b.
- **Thresholds — owner decision (2026-10-07): provisional, tunable heuristics.** 4.5:1 per pixel as
  "readable"; the text keeps its layout position when at least 95% of the background behind its
  lines reads at 4.5:1, and the space is scored workable from 85%; the heading and details are
  split only when that reads at least three points better. A score below 85% and minor overlap are
  never failures, and none of these numbers may bring back a panel, a fade, moved artwork or an
  overlap restriction. Whether a card genuinely has no workable space is judged by people on the
  raw artwork and the final card; such a card is recorded as an unresolved generation case. On the
  owner's two cards the text keeps the layout's position: near-white on the Notorious brick
  (95.7%), navy on the Boy Story sky (95.6%).
- **Confirmed by the owner (2026-10-07)**: workable space is judged on the best available colour,
  so a preference for an art colour that falls just short never costs a repaint; the automatic
  starting placement keeps its moves inside the text-safe area (else the words sit at the layout's
  position), and that rule never moves a box the host has placed; the opacity slider runs 5–100%,
  with None the default and the way to remove a background. `docs/product-doctrine.md §4`'s
  compiler row now names the starting text's placement in place of legibility panels.
- **Carried text backgrounds keep the host's colour** (owner decision, 2026-10-07, replacing the
  build's first rule of re-picking it): a text background carried with its words to another design
  or shape keeps its style, colour, opacity and padding exactly as chosen. A colour is recoloured
  only when it is designated automatic: a background starts with its colour on **Automatic**
  (`autoColor: true` — white behind dark text, near-black behind light), which follows the text's
  colour, at a carry and whenever the box's text colour changes (derived again by the save).
  Choosing a swatch or typing a colour makes it the host's; choosing Automatic hands it back. A
  chosen colour is kept even where the new card's text colour no longer contrasts with it.
  Confirmed by the owner (2026-10-07): every text box starts with None, and generating a card or
  opening the editor adds no background; once the host chooses Highlight, Rounded box or Soft
  backdrop, its colour may start on Automatic; a swatch or a typed hex makes it explicit, carried
  unchanged across designs and shapes. A background stored before
  this change has no `autoColor` and so counts as chosen; only developer-page data existed, so
  nothing was migrated. The editor screen (Phase 6b part 2) must apply `followTextColor` on screen
  when the host changes a box's text colour; today the save derives it.
- `card_art_v7`, `card_layouts_v7` (the legibility-panel shapes are removed from the catalog; stored
  panels still render), `card_compiler_v7`.
- **Creative check** (2026-10-07, preview, $2.54; the owner's verdict pending): the corpus and the
  Boy Story brief, 17 cards. 16 generated; one (CU-13, "jazz and old maps") failed because both of
  its images carried lettering, the existing no-text rule. No card has a panel, a fade or moved
  artwork. 15 of 16 scored workable with no repaint for it, 14 of them at the layout's position;
  CU-06 moved its words up onto the sky. Minor overlap on two: the Boy Story venue line crosses the
  rocket's handle, and the CU-06 venue line the top of the topiary.
- **CU-01 (the Notorious brief): below the threshold, not without workable space.** It scored 78%
  (73.5% at the layout's position), was repainted once and kept the better image; the first image
  is not stored. The shaded brick wall across the top third is a real quiet area — near-white reads
  on it and on the dark shoes, and fails on the sunlit brick at the right, the bright step edge and
  the gold crown and chain — and the title sits on it clearly. The starting text at its starting
  sizes is taller than that area, so the invitation line crosses the step edge and the crown and the
  details sit on the shoes: legible, not a good composition. A wider search than the generator's
  vertical-only one (each group moved sideways too) scores 86%, off-centre to the left. The image
  model put the subject higher than the cover layout's quieter area asks (the crown reaches about
  31% down; the layout asks for the top 45%), and the repaint did the same. Documented as a
  **placement-tuning case** (owner, 2026-10-07), not counted as meeting the bar; no stronger
  quiet-area restriction or wider positioning system is part of this change.

### The milestone number in the artwork (owner decisions, 2026-10-08)

Hosts asked for the number of a first or fifth birthday on the card, and the card left it out: the
artwork may contain no text, the inspection rejects any number, and model wording never states one.
The owner decided a number drawn as part of the picture belongs on such a card (`spec.md §7.6c`).
Specified here; not built yet.

- **One milestone number, drawn into the artwork.** A count from 1 to 110 (an age, years together or
  since, days) or a year as four digits (a class year, the year a New Year's Eve party welcomes, a
  founding year), as an object in the scene: balloons, candles, a topiary, glitter. Digits only,
  exactly once; no ordinal or word, no short year ("'26": full four digits, owner), no Roman
  numerals, nothing on a sign or banner. The one exception to "no text in the artwork".
- **Only what the host stated.** A number stated plainly in the prompt, extracted and kept for the
  host to confirm, or entered in the details form. Never inferred; a New Year's Eve year is never
  computed from the date (owner). Code puts the digits into the art prompt; the design decides only
  whether to draw it and how.
- **Eligible, not mandatory** (owner: "not everybody's gonna want the number on their card even if
  they say it"). The design decides whether the number belongs in its idea; the host can add or
  remove it with `Try another direction`.
- **Never wrong.** The artwork passes only showing exactly that number, once, with no other text.
  A miss earns one regeneration with the number, then one image without it, and the card ships with
  no number — never a typeset one (owner). Such an artwork may use three extra images instead of two
  (owner).
- **When the number changes**, Creation Mode offers `Update the number on the card`, a change to
  part of the card; the card never changes by itself (owner).
- Documents: `spec.md` §7.3, §7.6a, new §7.6c, §7.7, §7.8, §7.15, §9.5, §11.11, §18, §24, §31 and
  guardrails #15, #16 and #20; `CLAUDE.md`; `card-system.md` invariant 3, new §2.7, §3, §4.1, §5 and
  §10; `model-contracts.md` §4.3, §5.1, §5.2, §5.4, §6, §7.1, §7.3, §7.4 (CA-01, new CA-08) and §9;
  `product-doctrine.md` §4 and §14 (row 8); `design-system.md`; `screen-spec.md`;
  `development-plan.md` (5e); guardrails #12 and #30 too. Also
  corrected in `model-contracts.md §7.3`: a repaint follows a score below the workable bar, not "no
  workable space" (the owner's 2026-10-07 decision; one sentence the earlier sweep missed).
- **The owner's answers on the PR** (2026-10-08): a card may publish showing a number the host has
  not confirmed; after publish the number can still be changed in the details, with a note that
  the card keeps the number its artwork shows (no new artwork after publish, §8.2); the artwork
  stays decorative to screen readers, so the number is not announced; and new artwork for a shape
  switch never falls back to no number — a second miss fails the switch with a retry.
- **No repaint after publish** (owner, 2026-10-08): `Update the number on the card` is a repaint, so
  it stays before publish only; the rule that no new artwork is made after publish (§8.2) keeps no
  exception, and a number changed after publish leaves the artwork as it is, with the note.

## Still open

Tracked in `docs/product-doctrine.md §14`: the layout catalog as versioned code (Phase 4); the $49
re-check; the clarification question schema; an email provider for the reminder fallback; legal
review of the brand line. Also open: a real Revelnote logo to replace the placeholder seal.
