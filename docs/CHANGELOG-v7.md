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
- **One repaint before a panel: yes.** An artwork that passes validation but would need the
  legibility panel on the design's own shape is repainted once from the same art prompt, and the
  panel is used only if the repaint needs it too. Code decides from ink resolution; at most one
  extra image per artwork (a validation regeneration or the repaint, never both); about 6¢ and
  30 s on the cards that need it. Small overlaps that leave the text legible without a panel do
  not trigger it. Updated: `spec.md §7.8`, §7.9, §9.5, §10, a §31 criterion and guardrail #20;
  `card-system.md §3`; `model-contracts.md §7.3` and §9.
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

## Still open

Tracked in `docs/product-doctrine.md §14`: the layout catalog as versioned code (Phase 4); the $49
re-check; the clarification question schema; an email provider for the reminder fallback; legal
review of the brand line.
