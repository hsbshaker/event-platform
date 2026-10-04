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

## Still open

Tracked in `docs/product-doctrine.md §14`: the image-model workflow (transparency, text and safety
detection); the layout catalog and slot limits; the reveal latency target; the $49 re-check; the
clarification question schema; an email provider for the reminder fallback; legal review of the
brand line.
