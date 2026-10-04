# Product Design System
## AI-Designed Event Invitation + RSVP + Registry Platform

**Document:** `docs/design-system.md`  
**Status:** Revision 4 — implementation baseline for PRD Revision 7  
**Initial launch vertical:** Baby showers  
**Applies to:** Host application, co-host application, guest experience shell (envelope and house-style event page), the boundary around the invitation card, responsive behavior, interaction patterns, motion, accessibility, and visual implementation governance  
**Companion sources of truth:** `spec.md` (Revision 7) and `docs/card-system.md` (Revision 1)

### Revision 4 reconciliation

PRD Revision 7 changes what the product makes: the AI no longer generates a custom event website. It designs **one invitation card** (generated artwork with real text set over it), revealed from an envelope, above a standard event page in **one neutral house style for every event**. This revision removes the website-era material and keeps the rest of the system.

Application behavior that remains:
- prompt-first landing;
- auth/save before strong-model generation;
- Creation Mode = the invitation itself, with contextual editing and no wizard;
- truthful publish-readiness checklist;
- mobile-first, real desktop rendering;
- strict shared application tokens/components;
- light-only app chrome MVP.

What changes:
- one design at a time, with `Try another direction`, replaces three concepts and the concept comparison;
- the reveal is the card coming out of an envelope, not a full-site reveal;
- the card is the only themed, generated surface; the page beneath it is house style for every event and takes nothing from the card;
- hosts edit the card's text layer in a free **card editor** (Revision 7.2, `spec.md §20`): every piece of text is a text box they can edit, move, resize, rotate, restyle (any Google Fonts family, any colour) and add to, by touch or mouse (§4.10a); they switch the card's shape among six (rectangle, rounded rectangle, arch, oval, square, circle) from the Design panel; the artwork, outline and envelope are never editable;
- after publish the platform can text each party a personal invitation link; the guest workspace shows invitation status.

The card's design, generation, legibility, fit and rendering architecture lives in `docs/card-system.md`.

---

## 0. Authority and relationship to the PRD

This document is the product's **UI/UX and visual implementation contract**.

The PRD (`spec.md`, Revision 7) remains authoritative for:
- product scope;
- business rules;
- data models;
- permissions;
- AI architecture;
- RSVP behavior;
- registry behavior;
- privacy/security requirements;
- publishing rules;
- payment rules;
- operational requirements.

`docs/card-system.md` is authoritative for the invitation card: how it is designed, generated, made legible, laid out, stored and rendered, and where the AI's authority ends.

This design-system document is authoritative for:
- interaction model;
- screen composition;
- creation-mode behavior;
- responsive behavior;
- component hierarchy;
- app visual tokens;
- motion;
- accessibility presentation;
- the house-style guest page and the boundary between app chrome, card styling and that page;
- implementation consistency.

### 0.1 Newer approved UX decisions

Where an older flow conflicts specifically with the creation UX below, **this document wins for UX sequence and presentation**, unless `spec.md` Revision 7 states otherwise.

The current canonical creation flow is:

```text
LANDING / PROMPT
    ↓
USER DESCRIBES EVENT IMMEDIATELY
    ↓
AUTH / SAVE
(prompt + inspiration must survive OAuth intact)
    ↓
AI GENERATION BEGINS
    ↓
OPTIONAL DETAILS OFFERED WHILE GENERATION RUNS
(real pipeline artifacts shown; no fake progress)
    ↓
CARD REVEAL FROM THE ENVELOPE
"Your invitation looks great. Let's make it real."
    ├── Make it yours
    └── Try another direction → one new card; the current one stays active until chosen
    ↓
CREATION MODE
The invitation (card + page) is the workspace.
Inline edit/setup affordances.
Floating setup-progress control.
No wizard.
No Next buttons.
    ↓
PREVIEW (envelope included)
    ↓
$49 PUBLISH
    ↓
SHARE
Send invitations by text · link · QR · private code
    ↓
LIVE EVENT
    ↓
MANAGEMENT MODE
RSVPs · Guests · Messages · Registry · Share · Edit invitation
```

The user should never be required to understand the application's information architecture before seeing value.

---

# 1. Product design thesis

The product should feel:

- **quiet;**
- **premium;**
- **neutral;**
- **slightly warm;**
- **confident rather than decorative;**
- **simple without feeling sparse or unfinished.**

The product UI should not compete visually with the invitation.

The card carries the host's personality.

The application chrome provides a calm frame around it, and the page beneath the card is a calm, standard house style that is the same for every event.

### 1.1 Core product-design principle

> **Get the user creating before asking them to configure anything.**

The product should expose its value through use, not explanation.

The landing page is not primarily a marketing page. The creation composer is the hero.

### 1.2 Core interaction principle

> **Keep the host inside the thing they are creating.**

Whenever possible:
- edit where the content lives;
- configure the feature where the guest will experience it;
- return the user to the exact location they came from;
- avoid routing through generic settings pages.

### 1.3 Core AI principle

> **AI should remove decisions, not create more decisions.**

Do not expose:
- layout, art mode, art brief, ink or panel names, IDs or concepts;
- raw design tokens;
- app-chrome font, palette or colour pickers (the card editor's font and colour pickers act on card text only, §4.10a);
- border-radius controls;
- free-form spacing;
- CSS;
- layout grids;
- template or artwork galleries.

AI makes the initial creative choices, and the host's first card is already finished. The host may then refine the card's text layer freely in the card editor (§4.10a) and switch the card's shape. The host never chooses layouts, art modes or artwork, and nothing about the artwork, outline, envelope or page is editable.

### 1.4 Core activation principle

> **Show the finished-looking outcome before asking the host to do setup work.**

The user should see their finished-looking invitation as early as possible.

The emotional sequence is:

```text
"I described it."
      ↓
"It understood me."
      ↓
"Wow — this is already my invitation."
      ↓
"I only need to make the information real."
```

Do not interrupt that sequence with a dashboard.

---

# 2. Modes of the product

The application has three distinct presentation modes.

## 2.1 Creation mode

**Purpose:** turn an AI-designed invitation into the real event.

The invitation itself — the card and the house-style page beneath it — is the primary workspace.

Creation mode contains:
- the actual production card and page;
- subtle owner/co-host-only controls;
- contextual incomplete states;
- a lightweight setup-progress control;
- preview access;
- constrained design controls.

Creation mode must **not** look like a conventional SaaS admin dashboard.

### Creation-mode rule

> The user is editing their invitation, not configuring software.

## 2.2 Guest preview mode

**Purpose:** show exactly what a guest will see.

Preview mode:
- removes all collaborator-only controls;
- removes setup-progress UI;
- removes edit buttons;
- uses the production envelope, card and page;
- preserves actual event content;
- may show a small product-level "Exit preview" affordance outside the invitation canvas.

Do not create a separate fake preview renderer.

## 2.3 Management mode

**Purpose:** run the event after meaningful setup and especially after publishing.

Management mode may surface:
- invited count;
- attending;
- declined;
- awaiting response;
- guest list and invitation status;
- messages;
- registry status;
- RSVP responses;
- sharing (link, QR, code);
- edit-invitation entry point.

Management mode is appropriate when operational data matters.

It is not the default creation experience.

---

# 3. Canonical UX principles

These are requirements.

## 3.1 No wizard unless order is genuinely required

Do not use:

```text
Step 1 → Next → Step 2 → Next → Step 3
```

for independent event setup tasks.

Event details, guests, RSVP, and registry may be completed in any order unless a specific business rule requires otherwise.

The setup checklist is **navigation and progress**, not a wizard.

## 3.2 No unnecessary "Next" buttons

Use:
- direct actions;
- auto-save;
- `Done` to close a focused editor;
- contextual navigation.

Use `Continue` only where there is a genuine sequential boundary, such as authentication or a transactional confirmation.

## 3.3 Preserve context

When an editor is opened from:
- Event Details;
- RSVP;
- Registry;
- Design;

closing it returns to the same event context.

Do not route:

```text
Event → Settings → RSVP → Save → Dashboard → Event
```

when the user could simply open RSVP setup from the RSVP section.

## 3.4 Show value before work

Do not front-load:
- guest import;
- registry setup;
- RSVP configuration;
- billing;
- account profile setup.

The user should first experience AI understanding and design output.

## 3.5 Use real data as soon as it exists

The card reveal and Creation Mode should use:
- real event title;
- real hosts;
- real date;
- real venue;
- real event copy;

whenever those values are known.

Use sample content only for information the user has not supplied.

Never fabricate realistic fake guests.

## 3.6 Sample content must feel temporary, not deceptive

Appropriate sample content:
- example registry destination cards;
- bounded placeholders for required facts, marked as needing confirmation and never published;
- sample RSVP treatment;
- visual placeholders demonstrating a section.

Avoid content that implies actual user data exists when it does not.

## 3.7 Auto-save by default

Routine creation-mode edits should save without a primary Save button.

Recommended behavior:
- text: debounce after brief idle and save on blur;
- toggles/selects: persist immediately;
- reorder: persist immediately after drop/action;
- structured editor: persist incrementally where safe;
- `Done`: closes the editor; it is not the persistence mechanism.

Display subtle state:
- `Saving…`
- `Saved`
- `Couldn't save — retry`

Do not show a success toast after every auto-save.

---

# 4. Canonical host journey

## 4.1 Landing / prompt

The landing page should make creation obvious within seconds.

Primary composition:

```text
brand / sign in

large outcome-oriented headline
short supporting line

┌─────────────────────────────────────────┐
│ Describe the event you imagine...      │
│                                         │
│                                         │
│ + Add inspiration     Create my invitation ✦ │
└─────────────────────────────────────────┘

Free to create · No templates · Publish when ready
```

Primary message: **Describe your event. We create the whole experience.**

### Requirements

- The composer is the visual and interaction focal point.
- Do not require account creation before the user writes their idea.
- Do not lead with a template carousel.
- Do not place a large feature matrix above the composer.
- Do not make the user choose a theme, palette or style before writing.
- Optional inspiration belongs directly with the prompt.
- The page may include supporting content below the fold, but it must not delay creation.

### Desktop

The desktop landing page is a real desktop layout:
- centered content;
- generous whitespace;
- composer approximately `640–800px` wide;
- no phone-frame simulation.

### Mobile

The composer should dominate the first viewport without feeling cramped.

---

## 4.2 Auth / save

Authentication occurs **after** the user has entered a creative idea but **before any strong-model or image-model generation begins**.

This is an intentional product and cost-control boundary:

> Anonymous users may compose an event idea and attach inspiration.  
> Generation begins only after the event draft is associated with an authenticated account.

Preferred framing:

> **Your idea is ready.**  
> Save it and we'll start creating.

### Draft persistence across auth

Losing the user's prompt or inspiration during authentication is a critical failure.

Before redirecting to OAuth/email auth, persist a short-lived event draft containing:
- the complete prompt text;
- any already-parsed lightweight event details;
- references to temporary private inspiration uploads;
- client state needed to restore the composer;
- a securely scoped draft token/identifier.

After auth:
- attach the draft to the authenticated user/event;
- restore the prompt exactly;
- restore all successfully uploaded inspiration;
- resume at generation without asking the user to re-enter anything.

Temporary pre-auth inspiration assets must remain private, have short expiry/cleanup rules, and must never become public imagery.

Authentication should be lightweight:
- Google;
- Apple;
- email.

Do not ask for profile setup here.

---

## 4.3 Generation + optional details

Generation begins as early as practical.

The screen should communicate that the invitation is already being made while the host may supply missing event details.

Preferred framing:

> **A few details while we create…**

Details are **offered, never demanded**. Required details are publish requirements, not generation blockers (`spec.md §7.3`); the card is designed and revealed without them. Skip values already supplied or extracted from the prompt; extracted values are shown for the host to confirm. Watching and filling in are equally valid.

Ask only genuinely missing functional details: date, start time (end optional), venue/location, hosts, baby name if the host wants it shown, RSVP deadline, public/private. Do not normally ask for timezone.

If Event Identity asks a creative clarifying question (`spec.md §7.6b`), it is a small number of taste questions at most, always with `You decide` / `Surprise me`, never about fonts, layouts, colours or logistics.

Show real pipeline output progressively (see §12):
- interpreted creative signals;
- palette territory and visual vocabulary;
- the design's name and description;
- the art direction.

Do not present AI reasoning, chain-of-thought or implementation details.

### Loading principle

> Generation should feel like visible progress made of real artifacts, not a blocking spinner and not theater.

Avoid a blank progress screen.

---

## 4.4 Card reveal

The first thing the host sees after generation is their invitation card coming out of its envelope — the same envelope guests will see (§8.3, §10.20).

The card is revealed as soon as its artwork and ink resolution exist. There is one card per round, not a set to compare.

Show:
- the card;
- the design's creative name and one-line description;
- `Make it yours →`;
- `Try another direction ✦`.

Preferred copy:

> **Your invitation looks great.**  
> **Let's make it real.**

The first card generated for an event becomes its active design. A later card becomes active only when the host chooses it (§4.12).

Use real event content wherever it is known. Missing required facts appear on the card as bounded placeholders marked as needing confirmation; they are never published (§3.6).

### Desktop

The card is the same design at a comfortable size, centered; it never reflows. The surrounding application layout is desktop-native.

### Mobile

The card fits the viewport width with its proportion (5:7 or 1:1) and outline preserved. Reserve its box before the artwork loads so the layout does not shift.

---

## 4.5 Reveal actions

The user must be allowed to reconsider the creative direction **from the reveal itself**.

Primary action:

`Make it yours →`

Secondary action:

`Try another direction ✦`

Do not force them into setup just because the first card exists, and do not interrupt the reveal with a dashboard.

---

## 4.6 Creation mode

After `Make it yours`, the same invitation becomes editable. The card and page stay visually stationary (§8.4).

The collaborator sees subtle controls such as:

- `Edit`
- `Set up`
- `Add`

attached to stable anchors: the card's wording, the card's details, and each page section (details, description, information blocks, RSVP, registry).

Example (page sections):

```text
EVENT DETAILS                             Edit
December 19 · 1:00 PM
The Lodge at Hanson Park

RSVP                                      Set up
Kindly respond by December 1

REGISTRY                                  Add
Add your registries and gifts here
```

These controls never appear to guests.

Tapping the card (or `Edit card` in Design) opens the card editor (§4.10a), where every text on the card is a text box edited in place. Tapping a fact box's text opens that detail's own field (`spec.md §20.2`), so the card and the page update together.

### Owner toolbar

A restrained collaborator toolbar may contain:
- editing state;
- `Design`;
- `Preview`.

Do not add a large builder toolbar.

### Setup progress

A persistent lightweight control appears near the bottom.

The control must reflect **publish readiness**, not a fake count of all optional setup tasks.

Examples:

- `Finish setup`
- `2 required items left`
- `Ready to publish`

Do **not** show `2/4` if some of those four items are optional for publishing.

On mobile, it may float above the safe area.

On desktop, it may float at the bottom center or lower right as long as it does not obscure the invitation.

---

## 4.7 Setup checklist

The setup-progress control opens a lightweight checklist.

Split the checklist into two semantic groups.

### Needed to publish

Only show requirements that actually block `READY_TO_PUBLISH`, for example:

```text
✓ Event details
○ RSVP deadline
○ Visibility / access
```

The exact rows should be derived from the PRD's deterministic publish-readiness rules (`spec.md §23.1`).

### Recommended before sharing

Show valuable but non-blocking setup:

```text
○ Guests
○ Registry
○ Co-host
```

Rules:
- no required order;
- each item opens its relevant surface directly;
- clearly distinguish blocking vs. optional;
- do not expose every optional setting;
- keep copy operational and short;
- once all blocking items are valid, the progress control may say `Ready to publish` even when recommended items (guests, registry, invitations, co-host) remain incomplete.

The checklist may also surface:
- Preview;
- Publish.

The checklist is not a separate setup dashboard.

---

## 4.8 Contextual editors

### Mobile

Simple editors use bottom sheets or focused full-screen sheets depending on complexity.

Examples:
- card text → the card editor, edited in place on the card (§4.10a);
- event details → sheet/full-screen editor;
- RSVP settings → sheet/full-screen editor;
- registry add → sheet;
- design controls → sheet/full-screen panel.

### Desktop

Use:
- anchored panel;
- side sheet;
- modal;
- inline popover;

based on complexity.

Do not mechanically render a mobile bottom sheet at desktop width.

### Card editing

Edits to the card's text, facts, fonts or styles re-run the card's deterministic line breaking for the affected boxes; no model is called and nothing is regenerated (`docs/card-system.md §7`). The card editor is specified in §4.10a. A per-box length limit applies to the invitation line and added text (`spec.md §20.2`); show limit feedback as ordinary field validation (§11.2) and never silently truncate.

### Close behavior

Closing returns to the invitation at the same approximate scroll position.

---

## 4.9 Guest management exception

Guest management is the primary creation task allowed to leave the invitation because:
- CSV import;
- household grouping;
- phone state;
- invitation state;
- RSVP state;
- guest editing;

need more space.

It may use a dedicated full-screen workspace.

Each party shows, beyond its guests and RSVP state:
- contact state (Ready / Needs phone / No phone available);
- **invitation status**: not sent / sent / delivery failed / opted out;
- its **personal invitation link**, which the host can copy and rotate (rotating invalidates the old link).

Personal links are surfaced per party here, never as a single shareable link that bypasses a private event's code.

Requirements:
- a clear close/back action returns to creation mode;
- the invitation is not lost in navigation;
- on desktop, use the available width intelligently;
- on mobile, rows become stacked touch-friendly list items.

Do not attempt to embed a guest spreadsheet inside the public event page.

---

## 4.10 Design controls

The Design control opens a short panel (`spec.md §7.14`). It does not hold text controls; text is edited on the card itself in the card editor (§4.10a).

Contents, in order:
- `Edit card` — opens the card editor;
- the card's shape: the shapes the design's layout supports, shown as small outline swatches (rectangle, rounded rectangle, arch, oval, square, circle); unsupported shapes are not offered;
- `Reset card` — back to the design's generated text, fonts, colours and layout for the current shape, with confirmation (§4.10a);
- `Try another direction ✦` before publish;
- the designs generated so far, to choose another before publish (§10.21).

Do not expose:
- layouts or art modes;
- artwork editing, cropping, positioning or regeneration of parts;
- ink or panel controls (the generated card's ink is system-owned; a host's colour choices are made per text box in the card editor);
- envelope or page styling;
- CSS.

Switching shape keeps the host's words, added text and fonts and lays them out fresh for the new shape; the edited card for each shape is kept, so switching back restores it (`spec.md §20.6`). Every event fact is unchanged.

Switching to a shape the current artwork fits applies instantly. Illustration and atmosphere artwork fits every supported shape of its proportion; border- and frame-led artwork fits only the shape it was made for (`card-system.md §2.4`). Any other switch — tall ↔ square, or a new outline for a bordered design — needs new artwork of the same subject (the same bear, rearranged): say so before it starts ("This makes new artwork for a square card — about as long as a new design"), keep the current card visible while it generates, and show the result in place; switching back is instant. Switches that need new artwork are not offered after publish.

After publish, `Edit card`, `Reset card` and switching to shapes an existing artwork fits remain available and update the live card; `Try another direction`, switches that need new artwork and the designs list do not (§4.12, `spec.md §8.1`).

---

## 4.10a The card editor

The card editor (`spec.md §20`, `docs/card-system.md §7`) is where the host edits the card's text layer. It should feel like Paperless Post or Canva: direct, forgiving, and easy with one thumb. Editing is free; there is no model call, no credit and no cap on edits.

The editing surface is the production `InvitationCard` (§10.14), so the host sees exactly what guests will see, including text clipped at the outline. Everything the editor adds on top of it (selection frames, handles, guides, toolbar, panels, status) is **app chrome** drawn above the card in app tokens (§10.22). Nothing of that chrome is part of the card, and no card styling reaches the chrome (§15.1, §23.7).

### What can and cannot be edited

- Every text on the card is a text box. A box can be edited in place, moved, resized in width, rotated, duplicated, deleted, brought forward or sent back, and restyled: font, size, colour, alignment, letter spacing, line height, case, and weight or italic where the family has them. The host can add a new text box.
- The artwork, the outline and the envelope are not editable. There is no control to add an image, sticker or graphic, and none to crop, move or replace the artwork. The shape is switched from Design (§4.10).
- **Title box.** Editing it edits the event's effective title everywhere (envelope, page, link previews).
- **Fact boxes** (date, time, venue, hosts, baby name, RSVP-by) stay linked to event details. Tapping a fact box's text to change it opens that detail's own field (the date picker, the venue field) in the contextual editor of §4.8, and the card and page update together. A fact box can still be restyled and moved. Deleting one removes it from the card only; the detail stays on the page, and the delete toast says so ("Removed from the card. It's still on the page."). A host who wants their own wording for a fact deletes the box and adds a text box (`spec.md §20.2`).
- The invitation line and added text are ordinary host text with a per-box length limit; show the limit as field validation (§11.2) and never truncate silently.
- **No readability checks.** The editor never warns, blocks or nudges about contrast, size, overlap with the artwork, or text moved past the outline (`spec.md §20.1`). Do not add warning chips, contrast meters or "hard to read" hints.

### Entry and exit

- Entry: tap the card in Creation Mode, or `Edit card` in Design (§4.10). It opens on the current card with no box selected.
- On a phone the editor takes the screen below the app bar: the card above, the toolbar below. On desktop it opens in place in the canvas with the side panel on the right.
- Exit: `Done` returns to Creation Mode at the same scroll position (§4.8). Leaving is never blocked, because every change is already saved (§3.7).
- Preview (§4.13) shows the edited card in the envelope, as guests will see it.

### Selection, handles and touch targets

- A selected box shows a frame with handles, drawn above the card in app tokens. The frame must stay visible over any artwork (3:1 against what it sits on, §14.1); use a two-tone line (light inside, dark outside) rather than a colour that depends on the artwork.
- Handles are small to look at and large to hit: every handle, toolbar control and list row has a hit target of at least `44 × 44px` (§14.5), even when the visible handle is smaller. When boxes overlap, a second tap on the same spot selects the box beneath, and the box list (below) always works.
- Handles: width (left and right edges) and rotation (a handle on the frame). Pinch scales the text.
- The toolbar header names the selected box ("Title", "Date", "Added text") so the host always knows which box is active.
- Tapping empty space deselects.

### Gestures

Phone (touch):

| Gesture | Result |
| --- | --- |
| Tap | select the box |
| Drag | move the selected box |
| Pinch | scale the text of the selected box |
| Twist | rotate the selected box |
| Double-tap | type in the box (a fact box opens that detail's own field) |
| Tap empty space | deselect |

Desktop (pointer and keyboard):

| Input | Result |
| --- | --- |
| Click | select |
| Drag | move |
| Width handles | resize width |
| Rotation handle | rotate |
| Double-click or `Enter` | type in the box (a fact box opens that detail's own field) |
| Arrow keys | nudge; `Shift` = a larger step |
| Undo, redo, duplicate, delete shortcuts | the platform's standard ones |
| `Escape` | leave typing, then deselect |

Rules:
- While the editor is open, touch on the card edits the card and does not scroll the page under it. The host leaves with `Done`.
- A gesture is one undo step, however many frames it produced.
- Where the device supports haptics, give one light tap when a drag snaps to a guide. Haptics never carry information on their own.
- Drag thresholds, nudge distances (normal and `Shift`) and the snapping distance are set during the editor phase and recorded here; they are defined once in the editor and not repeated in feature code.

### Snapping guides

While a box is dragged, resized or rotated, show thin guide lines when it aligns with:
- the card's centre lines (horizontal and vertical);
- the shape's edges;
- other boxes' edges and centres.

Rotation snaps to right angles. Guides are app chrome, appear only during the gesture and disappear when it ends. A modifier key on desktop (set during the editor phase) turns snapping off for a free move; exact values are always available in the toolbar (below).

### Typing

- Double-tap, double-click or `Enter` puts the box into typing mode in place: a real caret, with the card's own text in the box's font and size, so typing matches the result. Lines re-break as the host types with the same deterministic function as the saved result (`docs/card-system.md §7`), so nothing jumps when typing ends.
- On a phone the card stays visible above the software keyboard (this document's §20.3): the edited box is kept fully in view above the keyboard and the toolbar, never behind them.
- A compact style row (bold and italic where the family has them, alignment, size, colour) stays above the keyboard while typing, so the host need not dismiss the keyboard to restyle. Larger panels open when the keyboard is closed.
- Pasted text is plain text. Line breaks the host types are kept.

### Toolbar

The toolbar is a **bottom sheet on a phone** and a **side panel on desktop** (`Sheet` §10.6 and `SidePanel` §10.7, wrapped by the editor, not forked). It has two levels.

**Level 1, with a box selected:** a single row of icon buttons, reachable with one thumb at the bottom edge of the phone. It holds `Font`, `Size`, `Colour`, `Align`, `Spacing`, `Layer`, `Arrange`, `Duplicate`, `Delete`, `Add text`, `Undo`, `Redo` and `Boxes` (the box list). The exact order is set during the editor phase. When the row does not fit on a phone it scrolls horizontally with the start and end visibly cut off to show there is more.

**Level 2, one panel at a time:** tapping a control opens its panel in the same sheet (a half-height sheet on a phone that leaves the selected box visible above it) or in the side panel (desktop). Sheets are not nested (§10.6). `Back` returns to the row and keeps the selection.

Panels:
- **Font** — the font picker (below), plus weight and italic where the family has them.
- **Size** — a slider with a numeric field.
- **Colour** — the colour picker (below).
- **Align** — left, centre, right.
- **Spacing** — letter spacing and line height, each a slider with a numeric field; and case (as typed, uppercase, lowercase, capitalised), in this panel or its own (set during the editor phase).
- **Layer** — bring forward, send back.
- **Arrange** — exact position, width and rotation as numeric fields (see accessibility).

Every slider has a paired numeric field (`Field`, §10.5), so any property can be set by exact value.

With no box selected the toolbar shows `Add text`, `Boxes`, `Undo`, `Redo` and the saved state. `Reset card` is in Design (§4.10) and in the editor's overflow menu.

### Font picker

- Any Google Fonts family can be chosen (`spec.md §20.1`).
- **The design's own pairings are shown first**, in a "From this card" group: its primary pairing's fonts, then its alternates', so the first thing the host sees is what the card was designed with. Then the full library.
- **Search** by family name sits at the top of the panel, always visible, as a `Field`.
- **Categories** (serif, sans serif, display, handwriting, monospace) as `Chip`s (§10.3) filter the library. They do not hide "From this card".
- Each row shows the family's name as a **pre-rendered specimen image** of that family, so the host chooses by look without the editor loading 1,500 fonts. Specimens are made by the platform when it refreshes its catalog snapshot and served from platform storage (`docs/technology-decisions.md §8.3`); app chrome never loads or applies a card font, and all other picker text stays in app typography (§6.2). Weights and italic appear after the family is chosen, not as separate rows.
- The list is paged and virtualised so it scrolls smoothly on a phone.
- **Loading state.** Fonts are served from the platform's own storage (`spec.md §20.4`); the first use of a family not yet in the font store adds it (`docs/card-system.md §7`). While a family loads, its row shows a small loading indicator and the box keeps its current font. The box changes only when the font is ready, so lines are never broken with the wrong metrics. Never show a fallback font on the card as if it were the choice.
- **Failure state.** If a font fails to load, the box keeps its previous font and nothing is saved for the attempt. The row shows an inline "Couldn't load this font." with `Try again` (§13.2), and the rest of the picker keeps working.
- Choosing a font applies to the selected box.

### Colour picker

- **Artwork swatches first**, in a "From this card" group: colours taken from this card's artwork, as large swatches. Then **recent colours**. Then a **full picker** (a saturation and brightness field with a hue slider) and a **hex input** (`Field`; accepts upper or lower case, with or without `#`).
- Any colour is allowed. The picker never shows contrast ratios, warnings or "hard to read" notes (`spec.md §20.1`).
- The colour in use is marked with a check as well as a ring (§14.6).
- Colour acts on the selected card text only. The picker is app chrome; it changes no app, page or envelope colour.

### Undo, redo and saved state

- `Undo` and `Redo` are always visible in the toolbar, with the standard shortcuts on desktop. Each step is a gesture, a typed run of text up to a pause or blur, a style change, an add, a delete, a duplicate or a layer change.
- Autosave (§3.7): every change saves in the background. A status in the editor header (`InlineStatus`, §10.9) shows one of:
  - `Saving…`;
  - `Saved`;
  - a recoverable failure ("Couldn't save. Your changes are kept here.") with `Retry`; the local value is kept and `Saved` is never shown falsely (§11.3);
  - the conflict notice (below).
- Each state is text plus an icon, never colour alone (§14.6).
- A change made in a detail's own field (a fact) saves through that field, as in §4.8.

### Conflict (stale save)

If a co-host saved a newer version while this host was editing, the stale save is refused (`spec.md §20.5`). The editor reloads the latest version and shows a short notice (`InlineStatus` or a toast, §13.1): "<Name> just made changes. Showing the latest." Selection stays on the same box if it still exists. No merge screen and no modal. Whether the host's refused change is offered back is set during the editor phase.

### Box list

`Boxes` opens a list of every text box on the card in layer order. Each row shows a text preview and the box's role ("Title", "Date", "Added text"). Selecting a row selects the box on the card and opens its toolbar. Rows offer `Bring forward`, `Send back`, `Duplicate` and `Delete`, so reordering has a non-drag path (§14.3). The list is how a host reaches a box that sits under another, runs past the outline or is too small to tap, and is a first-class keyboard and screen-reader entry point (below).

### Reset card

`Reset card` opens a `Dialog` (§10.8): "This puts the card back to how it was designed for this shape: its layout, fonts, colours and invitation line, without your added text. Your title and event details stay as they are." It resets only the current design and shape; customizations for other shapes and designs are kept (`spec.md §20.6`). Actions: `Reset card` (destructive, §9.5) and `Cancel`. After a reset, `Undo` is offered in a toast. Reset is available after publish and updates the live card.

### Add and delete

- `Add text` adds a text box near the middle of the visible card with placeholder text, in the design's primary font, selected and in typing mode. It is host text and is never fact-checked (`spec.md §20.2`).
- `Delete` removes the box at once and offers `Undo` in a toast, without a confirmation dialog, because undo is available (§11.4). Reset is the confirmed action.

### Motion and reduced motion

- Selection frames, guides and handles appear with `motion-instant` / `motion-fast` fades (§8.1) and follow the finger or pointer directly, with no easing lag.
- The sheet and side panel use the existing transitions (§8.2); switching panels inside them is a fast cross-fade.
- The card does not animate beyond a short scroll to keep the edited box clear of the keyboard and sheet. No bounce.
- Reduced motion (§8.5): no slide or scale on sheets, panels or selection; opacity changes only; the scroll that clears the keyboard is immediate.

### Accessibility

The editor is fully operable by keyboard and screen reader (`spec.md §20.3`), not only by gesture.

- **Every box is reachable from a list.** The box list is a labelled list; each row is a button. On the card, boxes are also focusable in layer order and announced with role and text ("Title, Baby Shower for Amelia, 1 of 4").
- **Every property is settable by exact value.** The `Arrange` panel has numeric fields for position (X, Y), width and rotation; size, letter spacing and line height have numeric fields; font, colour (hex), alignment, case, weight and italic have labelled controls. Dragging, pinching and twisting are shortcuts to values the host can also type.
- **Keyboard map** (desktop):
  - `Tab` and `Shift+Tab` move between regions: card, toolbar, panel;
  - with the card focused, arrow keys move focus between boxes; with a box selected, arrow keys nudge it (`Shift` for a larger step);
  - `Enter` types in the selected box; `Escape` leaves typing, and a second `Escape` deselects;
  - `Delete` deletes the box; the platform's undo, redo and duplicate shortcuts work;
  - layer order has a shortcut or the Layer panel (set during the editor phase);
  - the toolbar is a single tab stop; arrow keys move within it.
- **Focus order:** header (`Done`, saved state) → card → toolbar row → open panel → box list. Opening a panel moves focus into it; closing returns focus to the control that opened it (§14.3). When a box is deleted, focus moves to the next box, or to `Add text`.
- **Focus indicators** follow §14.2: visible on every control and on the focused box's frame, 3:1 against what they sit on, not by colour alone.
- **Announcements** use a restrained live region (§14.4): selection ("Date selected"), undo and redo ("Undid move"), saved state changes, a conflict reload, a font loaded or failed, "Removed from the card. It's still on the page." Do not announce every nudge or drag frame; announce the final position when a gesture or key repeat ends.
- Card text stays live, selectable text (§10.14). Targets and contrast follow §14.1 and §14.5.

### Phone and desktop summary

- **390px:** the card at the viewport width with its outline and proportion preserved; the bottom sheet toolbar; the edited box visible above the sheet and above the keyboard; a header with `Done`, the saved state and an overflow menu.
- **Desktop:** the card centred at a comfortable size, never reflowed (§19.3); the side panel on the right; pointer handles and keyboard shortcuts.

Per-state screens: `docs/screen-spec.md`, `card-editor`.

---

## 4.11 Try another direction

Available before publish from the reveal and from Creation Mode (via Design).

```text
Try another direction
       ↓
Optional feedback ("more playful", "less preppy") and optional new inspiration
       ↓
One new card, genuinely different from every earlier one
       ↓
Choose it, keep the current one, or try again
```

Preferred framing:

> **What should we change?**

Feedback and inspiration are optional; the host may leave both blank and ask for another exploration.

Explicit reassurance, shown in the flow:

> **Your event details stay exactly as they are.**

Design regeneration must not imply that guests, dates, RSVP data, registry data, or event wording will be lost. There is no chat-level micro-edit loop and no persistent assistant. No user-facing credits or counters.

---

## 4.12 Choosing among designs

The current card stays active while a new one is revealed. For the new card, offer:
- `Choose this direction`;
- `Keep current`;
- `Try another direction ✦` again.

Every design generated for the event stays browsable before publish in the designs list (§10.21). Choosing a design changes design only: it switches the active card, keeps the host's words, added text and fonts with a fresh layout in the new design, and keeps earlier customizations so choosing the previous design restores them (`spec.md §20.6`); it never changes event details, guests, RSVP, registry, privacy or messages.

Do not send the user back through initial onboarding. After publish, generation and design switching are disabled and the designs list is read-only (`spec.md §8.2`).

---

## 4.13 Preview

Preview removes:
- edit affordances;
- setup progress;
- collaborator toolbar;
- incomplete-state management controls.

The underlying card, envelope and page remain identical to production, with actual current content; the envelope is included.

The only app-level controls should be:
- an obvious way to exit preview;
- on desktop/tablet, a compact device-width control for `Mobile` / `Desktop`.

Preview defaults to **Mobile** because the guest experience is primarily phone-consumed.

The device-width control belongs to Preview Mode only. It must not turn Creation Mode into a breakpoint simulator or builder toolbar. The card is the same design in both widths; only its size and the page layout change.

---

## 4.14 Publish

Publishing is a meaningful transactional boundary.

Before publish:
- show readiness clearly;
- show the real `$49` price;
- avoid upsell clutter;
- explain that it is one-time.

Primary action:

`Publish my invitation`

Do not create pricing tiers in the MVP design.

## 4.14a Share and send invitations

After publish, the host lands on sharing with:
- the event URL;
- a QR code that points to the URL only (it never embeds or bypasses a private event's code);
- for a private event, the event code, surfaced together with the URL and QR;
- `Send invitations`.

`Send invitations` (`spec.md §7.18`):
1. choose recipients: all invited parties not yet invited, or a selection;
2. attest once per event that the host has permission to text these guests about this event;
3. the platform texts each selected party with a usable phone (and no opt-out) one short message carrying that party's personal link;
4. parties without a usable phone are listed with their personal link to copy and send another way.

Invitations go by text only. Resends and later invitations to newly added parties are allowed within the per-party cap. Invitation status per party appears in the guest workspace (§4.9). Sharing the link/QR directly remains available; both paths coexist.

---

## 4.15 Post-publish management home

After publishing, the center of gravity changes from **building** to **running**.

Management mode prioritizes:

```text
RSVP summary
Guests (responses · awaiting · Needs phone · invitations not sent)
Messages (invitations · reminders · announcements)
Registry
Share (link · QR · code)
Edit invitation
```

The visual style remains calm and consistent with the application.

Do not turn management mode into a generic analytics dashboard.

## 4.16 Co-host invitation acceptance

A co-host invitation is a small but complete application flow and uses app chrome, not card styling.

If signed out:
1. show event name + inviter name;
2. explain that the user has been invited to collaborate;
3. authenticate;
4. preserve the invitation token across auth;
5. accept/join the event.

If already signed in:
- show event name;
- inviter;
- collaborator role summary;
- `Join event` primary action.

After acceptance:
- enter the appropriate event workspace;
- do not route through event creation;
- do not expose billing/ownership actions the co-host cannot use.

Expired/invalid invitations require a calm inline error state with a path to contact the inviter or return home.

---

# 5. Application visual language

## 5.1 Visual character

The host application should feel:
- premium but not luxury-brand theatrical;
- warm but not beige-on-beige;
- contemporary;
- calm;
- editorially restrained;
- polished enough that the invitation card remains the most expressive object on screen.

Avoid:
- saturated SaaS gradients as default chrome;
- neon AI branding;
- excessive glassmorphism;
- strong shadows everywhere;
- decorative illustration in operational UI;
- playful blobs unrelated to event content;
- visual noise.

## 5.2 Brand tokens are provisional

The exact product name, logo, accent hue, and final brand typeface may change.

Therefore:
- behavior is stable;
- component hierarchy is stable;
- spacing/radius/motion systems are stable;
- semantic token names are stable;
- specific brand values may be swapped centrally.

Never encode brand colors directly in feature components.

## 5.3 Application appearance mode

The application chrome is **light-only for MVP**.

Do not implement:
- app dark mode;
- automatic system dark-mode theming;
- partial dark-mode variants.

The invitation card is its own surface and may be any colour. A dark card does not imply dark application chrome, and the house-style page does not follow the card.

If application dark mode is added later, it requires a deliberate design-system revision rather than opportunistic per-component support.

---

# 6. Product UI tokens

These tokens apply to the **application UI**, not the invitation card.

All values below are Revision-1 defaults and must be represented as semantic variables.

## 6.1 Color tokens

```css
:root {
  --app-bg: #F6F5F1;
  --app-surface: #FFFFFF;
  --app-surface-subtle: #FBFAF7;
  --app-surface-muted: #EFEEE9;

  --app-text: #1D211E;
  --app-text-secondary: #666D68;
  --app-text-tertiary: #6B726D;

  --app-border: #E2E0D8;
  --app-border-strong: #CFCCC2;

  --app-action: #263A31;
  --app-action-hover: #1E3028;
  --app-action-text: #FFFFFF;

  --app-focus: #557765;

  --app-success: #35664E;
  --app-warning: #8A672C;
  --app-danger: #A0443C;

  --app-overlay: rgba(18, 22, 20, 0.36);
}
```

### Rules

- Feature code references semantic tokens, never raw hex.
- Do not create page-specific accent colors.
- Card colours (artwork, ink, panels) never replace app chrome colors.
- Status colors supplement text/icons; color alone never communicates state.

## 6.2 Typography

Default application family:

```text
Inter Variable / approved product sans / system sans fallback
```

If the implementation uses non-variable/static Inter files, use only available standard weights (for example 400/500/600/700) and map the type scale accordingly. Do not request synthetic `650` weight from a static font file.

Recommended stack:

```css
--font-app:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

The app should not use card typography (the design's font pairings) in navigation, editors, or admin controls.

### Application type scale

```text
display-lg   48 / 52   700   -0.04em
display-md   40 / 44   700   -0.035em
heading-xl   32 / 38   700   -0.03em
heading-lg   24 / 30   700   -0.025em
heading-md   20 / 26   650   -0.02em
body-lg      17 / 26   400
body-md      15 / 23   400
body-sm      13 / 19   400
label-md     13 / 17   600
label-sm     11 / 15   650
micro        10 / 14   650
```

Use responsive `clamp()` for large marketing headings.

Do not invent type sizes per screen.

## 6.3 Spacing

Canonical spacing scale:

```text
0
4
8
12
16
20
24
32
40
48
64
80
96
```

Semantic aliases:

```text
space-1  = 4
space-2  = 8
space-3  = 12
space-4  = 16
space-5  = 20
space-6  = 24
space-8  = 32
space-10 = 40
space-12 = 48
space-16 = 64
space-20 = 80
space-24 = 96
```

No arbitrary feature spacing such as `13px`, `27px`, or `61px`.

## 6.4 Radius

Canonical radii:

```text
radius-sm   8px
radius-md   12px
radius-lg   16px
radius-xl   20px
radius-2xl  24px
radius-pill 999px
```

Use:
- fields/buttons: `radius-md` or `radius-lg`;
- cards: `radius-lg`;
- large composer/sheets: `radius-xl` or `radius-2xl`;
- chips/pills: `radius-pill`.

Do not create per-screen custom radii.

## 6.5 Shadows

Use shadows sparingly.

```text
shadow-none
shadow-soft      subtle card lift
shadow-float     floating setup control / popover
shadow-overlay   modal / sheet
```

Recommended defaults:

```css
--shadow-soft: 0 8px 24px rgba(20, 28, 24, 0.06);
--shadow-float: 0 10px 32px rgba(20, 28, 24, 0.14);
--shadow-overlay: 0 24px 70px rgba(20, 28, 24, 0.18);
```

A card does not receive a shadow merely because it is a card.

Borders and whitespace should do most of the work.

## 6.6 Z-index

Use named layers:

```text
base          0
sticky        20
toolbar       30
popover       40
sheet         50
modal         60
toast         70
```

Do not use arbitrary `z-[9999]`.

---

# 7. Responsive system

## 7.1 Principle

> **Mobile-first does not mean phone-shaped desktop.**

Desktop is a first-class responsive rendering.

Core functionality is identical across form factors.

## 7.2 Breakpoints

Use the application's existing breakpoint system if already established. Otherwise:

```text
mobile:   < 640px
tablet:   640–1023px
desktop:  ≥ 1024px
wide:     ≥ 1440px
```

Breakpoints are for layout changes, not arbitrary style variation.

## 7.3 Mobile baseline

Design from approximately `390px`.

Also verify:
- `320px` minimum reasonable width;
- `360px`;
- `390px`;
- `430px`.

## 7.4 Desktop shell

Do not render the host application inside a decorative phone frame.

Desktop should:
- use available horizontal space;
- keep readable max-widths;
- preserve the same interaction hierarchy;
- use side panels where mobile uses sheets;
- use comparison grids where mobile stacks.

## 7.5 Content widths

Recommended app content widths:

```text
narrow form          560px
standard flow        720px
wide workspace       1120px
full operational     1280–1440px
```

Do not stretch text forms across the full viewport.

## 7.6 Touch and pointer parity

Anything available only through hover is incomplete.

On desktop:
- hover may reveal additional affordance emphasis;
- the action must remain discoverable via focus/click.

On mobile:
- touch targets must be at least `44 × 44px` where practical.

---

# 8. Motion system

Motion is part of the product quality bar.

It should feel:
- soft;
- fast;
- deliberate;
- calm;
- physically coherent.

Avoid:
- bouncy spring animation as the default;
- excessive parallax;
- continuous decorative motion;
- transitions that delay the user.

## 8.1 Motion tokens

```text
motion-instant  80ms
motion-fast     120ms
motion-base     180ms
motion-sheet    240ms
motion-reveal   420ms
motion-emphasis 600ms max
```

Preferred easing:

```css
--ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
--ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
--ease-exit: cubic-bezier(0.4, 0, 1, 1);
```

## 8.2 Standard transitions

Buttons/hover/focus:
- `120–180ms`.

Popover:
- fade + `4px` translate;
- `180ms`.

Mobile sheet:
- slide from bottom + overlay fade;
- `240ms`.

Desktop side panel:
- slide `12–20px` + fade;
- `240ms`.

Modal:
- fade + subtle `0.98 → 1` scale;
- `180–240ms`.

## 8.3 Envelope opening and card reveal

This is the most important transition.

The envelope is a house component, the same for every event (§10.20). Recommended sequence:
1. the sealed envelope shows the event title;
2. it opens on the guest's tap — an explicit action, never automatically (`spec.md §12.5`);
3. the card slides out and settles at the top of the page;
4. for the host, the reveal message and actions appear shortly after the card is visually stable.

The host sees the same reveal when a newly generated card is ready. Total perceived transition should stay within the motion tokens (`motion-reveal`, never beyond `motion-emphasis`).

The card is revealed as soon as its artwork and ink resolution exist. A brief transitional state is acceptable to create continuity, not to fake work (§12.2).

Reduced motion: the card appears without the opening animation (§8.5).

## 8.4 "Let's make it real" transition

`Make it yours` should not navigate to a visually unrelated screen.

Preferred:
- owner toolbar fades/slides in;
- contextual edit controls appear;
- setup-progress control rises into place;
- the underlying card and page remain visually stationary.

This creates the feeling that the finished invitation has simply become editable.

## 8.5 Reduced motion

Honor `prefers-reduced-motion`. The card editor's motion rules are in §4.10a.

With reduced motion:
- remove large translation/scale;
- retain short opacity changes where useful;
- no essential information may depend on animation.

---

# 9. Action hierarchy

## 9.1 Primary action

Use for the single strongest forward action.

Examples:
- `Create my invitation ✦`
- `Choose this direction`
- `Make it yours`
- `Publish my invitation`

Visual:
- solid dark action background;
- high contrast;
- full-width on narrow mobile flows where appropriate.

Only one dominant primary action should appear in a local decision area.

## 9.2 Secondary action

Examples:
- `Try another direction ✦`
- `Preview invitation`
- `Keep current`

Visual:
- outlined or quiet surface;
- equal clarity but less visual weight.

## 9.3 Contextual action

Examples:
- `Edit`
- `Set up`
- `Add`

Visual:
- compact;
- pill or text-button treatment;
- located adjacent to relevant content.

## 9.4 Utility action

Examples:
- `Preview`
- `Design`
- `Done`
- `Close`

Utility actions are understated.

## 9.5 Destructive action

Destructive styling is reserved for genuinely destructive actions:
- delete event;
- remove collaborator;
- irreversible data deletion.

Do not use red for routine cancel/close.

---

# 10. Core application components

Feature screens must use shared components.

## 10.1 `AppButton`

Allowed variants:

```text
primary
secondary
ghost
destructive
```

Allowed sizes:

```text
sm
md
lg
```

Do not add page-specific button variants.

## 10.2 `IconButton`

For:
- close;
- back;
- overflow;
- small utilities.

Requirements:
- accessible label;
- minimum interactive area;
- consistent icon size.

## 10.3 `Chip`

Use for:
- compact status;
- selected option;
- lightweight action;
- filters where truly needed.

Do not use chips as a replacement for every button.

## 10.4 `PromptComposer`

Canonical large AI input.

Contains:
- multiline text area;
- optional inspiration action;
- primary generation action;
- loading/disabled state;
- optional attachment summary.

It is a reusable product primitive, not a one-off landing-page implementation.

## 10.5 `Field`

Supports:
- text;
- textarea;
- select;
- date/time;
- structured control wrapper.

Rules:
- persistent visible label;
- optional helper;
- inline error;
- no floating-label pattern;
- minimum comfortable touch height.

## 10.6 `Sheet`

Mobile contextual editor.

Includes:
- title;
- optional supporting copy;
- close affordance;
- scrollable body;
- safe-area-aware bottom padding.

Do not nest multiple sheets unless unavoidable.

## 10.7 `SidePanel`

Desktop equivalent for medium-complexity contextual editing.

Preserves the event behind it.

## 10.8 `Dialog`

Use only when:
- attention must be blocked;
- confirmation is genuinely required;
- the action is narrow.

Do not use modal dialogs for routine editing.

## 10.9 `InlineStatus`

For:
- `Saving…`
- `Saved`
- recoverable save failure;
- import state;
- generation status.

## 10.10 `OwnerToolbar`

Creation-mode product chrome.

Contains only high-level controls:
- editing state;
- Design;
- Preview;
- possibly event menu.

It is not a page-builder toolbar.

## 10.11 `ContextEditAction`

Standardized collaborator-only affordance:
- `Edit`;
- `Set up`;
- `Add`.

It must work with:
- touch;
- keyboard;
- screen readers.

## 10.12 `SetupProgressPill`

Canonical floating creation-mode progress control.

Examples:

- `Finish setup`
- `2 required items left`
- `Ready to publish`

Never show a fraction that counts optional tasks as if they block publishing.

Requirements:
- persists while editing the event;
- avoids covering important content;
- safe-area aware;
- opens `SetupChecklist`.

## 10.13 `SetupChecklist`

Contains only the meaningful top-level setup tasks.

Each item has:
- state;
- label;
- concise supporting description;
- direct navigation.

No percent-complete gamification.

## 10.14 `InvitationCard`

Renders the invitation card from the persisted design, its artwork, its resolved ink and panels, and the event's current content passed through the card's deterministic text layout (`docs/card-system.md §6.1`).

It is **owned by the card system, not by app chrome**: its styling, fonts and ink never come from app tokens, and no app component styles its internals.

Contract:
- one component renders the card everywhere: the reveal, Creation Mode, Preview, the guest page, the designs list and link-preview images;
- one of six shapes (rectangle, rounded rectangle, arch, oval at 5:7; square, circle at 1:1); the outline is a code-defined mask; renders at any width by uniform scaling, so outline, line breaks and layout are identical at 390px and 1280px;
- text is live, selectable and screen-reader readable; the artwork is decorative (`alt=""`);
- the application passes data (design, artwork, event content, the host's saved text boxes) and a size; it passes no CSS, and it never computes colours, fonts, layouts, positions or line breaks itself (the host's saved boxes carry them, validated and laid out by the card system);
- it contains no collaborator controls; Creation Mode attaches them through `CollaboratorActionSlot` (§10.19), and the card editor draws its chrome above it (§10.22);
- selected/current state for the designs list is drawn by `DesignsList`, outside the card.

Do not add star ratings, comparison scores or per-card variants.

## 10.15 `CreationCanvas`

Wraps the production card and house-style page with collaborator-only layers:
- toolbar;
- contextual edit affordances;
- setup progress.

Guest-facing markup and owner controls should remain cleanly separated.

## 10.16 `EmptyInlineState`

Used inside the event where unfinished content belongs.

Examples:

```text
Add your registry
Link registries, individual gifts, or a cash fund.
[ Add registry ]
```

This is preferred over redirecting the user to a generic settings page.

## 10.17 `OperationalList`

For mobile guest/message/registry management.

Supports:
- label;
- metadata;
- status;
- contextual action.

Desktop may enhance to a table when useful.

## 10.18 `PublishGate`

Canonical transaction surface:
- readiness;
- one-time price;
- included value;
- primary publish action.

Avoid marketing-card clutter.

## 10.19 `CollaboratorActionSlot`

The card and every page section must expose a stable collaborator-action anchor for Creation Mode.

The card renderer owns the card's box and text layout and the page owns section layout. The application owns collaborator controls.

Contract:

```text
Invitation card
  ├── guest-facing card
  └── collaboratorActionAnchor (wording · details)

Page section
  ├── guest-facing section content
  └── collaboratorActionAnchor
```

`CreationCanvas` attaches `Edit`, `Set up`, or `Add` controls to these anchors without requiring layout-specific positioning logic.

Requirements:
- every page section implements the same semantic anchor, and the card exposes anchors for its wording and its details;
- the anchors exist at mobile and desktop breakpoints;
- placement may adapt with viewport, but the application-facing contract does not change;
- collaborator controls remain app-styled and do not inherit card typography or colours;
- guest rendering omits the anchor output entirely;
- the application must not inspect the design's layout, art mode or ink, or the card's text zones, to decide where to place edit controls.

This preserves the app/card boundary and means every card layout needs no editor implementation of its own.

## 10.20 `Envelope`

A house-designed envelope, the same for every event: not themed, not generated, and not an imitation of any competitor's envelope. It is sized to the card's proportion (portrait or square) and shows the event title on the front.

States and behavior:
- **sealed**: shown for a private event reached by the shared link until the code is entered; shows only the event title, nothing from the card or page (§15.7);
- **closed → opening → open**: the guest taps (an explicit action; it never opens by itself) and the card slides out and settles at the top of the page (§8.3);
- **personal invitation link**: no code; the envelope still opens on the guest's action (`spec.md §12.5`);
- the host sees the same reveal when a newly generated card is ready.

Requirements:
- the closed envelope is a real button, keyboard-activatable, with an accessible name that includes the event title;
- opening never traps focus; focus lands on the card or the first meaningful control after opening;
- reduced motion: the card appears without the opening animation, with no loss of information;
- code entry on the sealed envelope uses the house-style access gate (`EventAccessGate`, §15.4).

## 10.21 `DesignsList`

Lists every design generated for the event, so the collaborator can choose another before publish. It appears in the Design panel and after `Try another direction`.

Each entry shows:
- the design rendered with `InvitationCard` at a small size;
- its creative name and one-line description;
- current/active state;
- a choose action for non-active entries.

Requirements:
- designs are peers: no ranking, "best" label, preselection beyond the active design, confidence or scores (§16);
- a stable order, so entries do not jump when a new design arrives;
- choosing a design follows §4.12 and never touches event details;
- read-only after publish (`spec.md §8.2`).

## 10.22 `CardEditor`

The card editor's chrome (§4.10a), drawn **above** `InvitationCard` (§10.14) and attached to it as `CollaboratorActionSlot` does (§10.19). It is app chrome, in app tokens.

Includes:
- the selection frame, width and rotation handles, and snapping guides;
- the toolbar: a bottom `Sheet` on a phone, a `SidePanel` on desktop;
- the font picker, colour picker, `Arrange` fields and box list;
- the header: `Done`, `Undo`, `Redo`, the saved state (`InlineStatus`) and the overflow menu;
- the `Reset card` `Dialog`.

Requirements:
- it composes existing components (`Sheet`, `SidePanel`, `Dialog`, `IconButton`, `Chip`, `Field`, `InlineStatus`) and adds no new button, field or dialog variant (§23.1);
- it reads and writes the host's text boxes through the card system's data interface; it never edits card markup or styles directly;
- nothing it draws is part of the card: guests never receive it, and Preview (§4.13) removes it;
- states: idle, box selected, typing, panel open, box list, saving, saved, save failed, stale-save conflict, font loading, font failed (`docs/screen-spec.md`, `card-editor`).

---

# 11. Forms and input behavior

## 11.1 Labels

Labels remain visible.

Placeholder text never replaces a label for important structured fields.

## 11.2 Validation

Show errors:
- next to the affected field;
- in plain language;
- after interaction or submit;
- without clearing user input.

## 11.3 Auto-save errors

If background save fails:
- keep the user's local value;
- mark the affected editor;
- offer retry;
- do not falsely display `Saved`.

## 11.4 Destructive confirmation

Require explicit confirmation when the user could lose meaningful data.

Routine navigation away from auto-saved forms should not trigger confirmation.

---

# 12. Loading and generation states

## 12.1 Never use blank loading screens for AI generation

Prefer:
- progressive Event Identity;
- optional details and, at most, a few taste questions;
- a stable placeholder in the card's proportion (5:7 or 1:1) with useful copy;
- the card appearing as soon as it is ready.

## 12.2 Real artifacts only, one card

What is shown is structured output the pipeline actually produced — interpreted creative signals, palette territory, visual vocabulary, the design's name and description, the art direction — surfaced as each genuinely resolves.

Never show:
- model reasoning or chain-of-thought;
- invented percentages or simulated "thoughts";
- a stage claiming work that has not happened;
- artificial multi-second delays.

One card is generated per round. It is revealed from its envelope as soon as its artwork and ink resolution exist.

If generation fails after its single retry, say so honestly with a retry action; never disguise a failure as a finished design. There is no template or stock fallback.

## 12.3 Generation language

Use human product language:
- `Creating your invitation`
- `Designing your card`
- `Bringing your vision together`

Avoid technical language:
- `Calling model`
- `Parsing JSON`
- `Generating CardDesign`
- `Running inference`
- provider or model names

---

# 13. Feedback and notifications

## 13.1 Toasts

Use sparingly.

Appropriate:
- copied event link;
- invitation code copied;
- background operation completed when no inline location exists.

Inappropriate:
- every auto-save;
- every toggle;
- every field edit.

## 13.2 Error feedback

Errors should be local whenever possible.

Global banners are reserved for:
- service-wide issue;
- generation failure affecting the whole flow;
- disconnected state;
- significant publish/payment failure.

---

# 14. Accessibility

Minimum standard: **WCAG 2.2 AA** for application UI and rendered guest experiences where technically applicable.

## 14.1 Contrast

Application:
- normal text: target `≥ 4.5:1`;
- large text: target `≥ 3:1`;
- interactive boundaries/focus indicators: target `≥ 3:1` against adjacent surface.

Card text contrast is guaranteed by the card compiler for the generated card (≥ 4.5:1, §15.6); a host's own colour choices in the card editor are not checked (`spec.md §20.1`). The house-style page uses app tokens and meets the same targets, and carries every detail the card shows. The card editor's own chrome (frames, handles, toolbar) meets the targets above.

## 14.2 Focus

Every interactive element must have a visible keyboard focus treatment.

Do not remove outlines without a replacement.

## 14.3 Keyboard

Required:
- tab through all app controls;
- choose designs and activate card actions;
- operate sheets/dialogs;
- close overlays via Escape where appropriate;
- return focus to the originating control after closing;
- reorder functionality must have non-drag fallback if reorder is exposed;
- the card editor must be operable without gestures: every text box reachable from a list and every property settable by exact value (§4.10a).

## 14.4 Screen readers

Use semantic:
- headings;
- landmarks;
- buttons;
- form labels;
- status announcements.

AI generation progress should use restrained live-region updates, not constant noisy announcements.

## 14.5 Touch

Aim for at least `44 × 44px` interactive targets.

Compact visual controls may use larger invisible hit areas.

## 14.6 Color

Never rely on color alone for:
- completed/incomplete;
- RSVP state;
- error;
- selected design;
- purchase state.

Use text/icon/shape reinforcement.

---

# 15. Invitation card and house-style guest page

The card is expressive. The application shell and the page beneath the card are stable.

`docs/card-system.md` is the detailed authority for the card. This section defines the product-design boundary agents must preserve.

## 15.1 Hard boundary

Three systems, kept separate:

**Application UI**
- stable;
- neutral/warm;
- light-only MVP;
- application typography/tokens;
- never styled by the card.

**Invitation card**
- the only generated, themed surface;
- driven by the persisted design (its artwork, resolved ink and panels, and typography pairing) and, where the host has edited it, the host's saved text boxes (`spec.md §20.5`);
- styling and card fonts (`src/styles/card-fonts.css`) live in the card renderer and nowhere else.

**House-style guest page**
- the page beneath the card: details, description, information blocks, RSVP, registry, footer;
- the application's semantic tokens in a guest-facing variant, identical for every event;
- takes no colours or fonts from the card.

The card must never recolour or restyle:
- account/auth UI;
- collaborator toolbar;
- sheets/panels;
- the card editor's selection frames, handles, guides, toolbar and pickers;
- billing;
- management UI;
- the house-style page or the envelope.

App and guest-page components must not import card styling (§23.7).

## 15.2 Model/compiler/render contract

Per `docs/card-system.md`:

- The strong model emits an `EventIdentity` and a `CardDesign`: layout (an ID from a small catalog), art mode, a curated typography pairing with up to two alternates, the card's wording (title and invitation line), an art brief, and a host-facing name and description. An image model generates the artwork from the art brief and the layout's and shape's composition rules, never from the raw host prompt.
- The model does **not** emit HTML, CSS, JSX, JavaScript or SVG; text colours, font sizes, positions or line breaks; the host's facts; or any ID outside its catalogs.
- Deterministic code (no model call) validates the design and artwork, checks that wording invents no fact, resolves ink and any legibility panel, and sizes and breaks every line of text with one pure layout function. The design, artwork and resolved ink are persisted and immutable.
- One card component renders from the persisted data only.

Facts on the card (names, date, time, venue, RSVP-by) come only from event data the host entered or confirmed.

## 15.3 Layouts are invisible to hosts

The card's text layouts exist so the art can leave calm space for words. They are not a gallery and not a host choice.

- The host never sees, picks or switches layouts or art modes; the app never reads them to make UI decisions (§10.19). The card's shape is the one property of the generated card the host can switch (§4.10). The host's own text boxes (their positions, sizes and styles) are the host's content in the card editor (§4.10a), not the layout catalog.
- The card is defined in fixed card units and scaled uniformly: identical proportions and line breaks on a 390px phone and on desktop. Nothing reflows and there are no responsive card variants.
- Hosts change a card by editing its text layer in the card editor, switching its shape, or trying another direction. They never change the artwork, the outline or the envelope.

## 15.4 Guest component system (house style)

Guest-facing components are the **guest-facing variant of the application's shared components**. They keep their `Event*` names, consume the app's semantic tokens, and look the same for every event.

Required components include:
- EventButton;
- EventField;
- EventTextarea;
- EventCard;
- EventNotice;
- EventOTPInput;
- EventChoiceGroup;
- EventPartyCard;
- EventRegistryCard;
- EventGiftCard;
- EventConfirmation;
- EventAccessGate;
- EventFooter.

The page covers: event details, description and simple information blocks, the RSVP flow, registry (external destinations, native items, cash fund), the confirmation, error states, and the passed state (thank-you, registry still accessible).

Requirements:
- no per-event theming, no per-event variants;
- the guest variant is defined once, centrally, from existing tokens; adding tokens follows §23.6;
- the page reads as a considered, warm, quiet continuation of the invitation without borrowing the card's colours or fonts;
- real desktop layout on desktop (§7), not a stretched phone column.

## 15.5 RSVP flow on every screen size

RSVP semantics are predictable and identical on every screen.

Shared-link path:

```text
lookup
→ verification (where required)
→ party
→ questions
→ submit
→ confirmation
```

Personal-link path: the link identifies the party, so lookup and verification are skipped:

```text
party
→ questions
→ submit
→ confirmation
```

Rules:
- when a party needs a phone, show the neutral message directing the guest to contact the host; never expose that party's RSVP on that path;
- never show phone or email; show only the minimum first names needed to recognize a party;
- confirmation copy: **You're all set. We can't wait to celebrate with you.**

Behavior is defined by `spec.md §12`; this section governs only presentation.

## 15.6 Legibility and contrast

- Every text of the generated card clears **4.5:1** against the artwork behind it. Code chooses ink colours (drawn from the artwork first) and, when no ink can clear it, applies an art-derived legibility panel. A model never chooses a colour, size or line break.
- Card text is live, selectable and screen-reader readable; artwork is decorative. Everything a guest needs is in the text and on the page.
- Changing a font or shape does not change the generated card's ink or panels. A colour the host picks in the card editor applies to that box only and is not checked (`spec.md §20.1`).
- The house-style page and app chrome meet the contrast targets of §14.1 with app tokens. Card ink and artwork colours are never reused as page or chrome colours.

## 15.6a Focus indicator contract (guest-facing controls)

Binding on the house-style page's controls and on the envelope.

Because the page uses the app's semantic tokens on one appearance for every event, guest-facing controls use the same focus treatment as application chrome (§14.2):

- keyboard focus is always visible; `:focus-visible` never resolves to `outline: none` with nothing in its place;
- the indicator is offset outside the control boundary (`outline` plus a positive `outline-offset`, or an equivalent outset ring);
- it clears **3:1 against the adjacent surface** it is drawn on;
- focus is never signalled by color alone — the ring is a shape change.

The card itself has no interactive controls.

## 15.7 Envelope and private sealed state

The envelope is a house component (§10.20) that fronts every invitation.

- **Public event, shared link:** the envelope shows the event title and opens to the card.
- **Private event, shared link:** the envelope stays **sealed** with the event title until the event code is entered. Nothing on the card or page is visible before then.
- **Personal invitation link:** no code. A bare request returns only the closed envelope; the card, page and party session load when the guest opens it (`spec.md §12.5`).
- **Link previews:** the rendered card for a public event; the sealed envelope with the title for a private one. Produced from the same card component and layout function, so they cannot disagree with the live card.

The envelope is not themed per event, not generated and not an imitation of any competitor's envelope.

## 15.8 Generated design immutability

Persist per generated design: the raw and validated `CardDesign`, its artwork, its resolved ink and panels, and the version set (prompt, schema, layout set, compiler, image model).

A design and its artwork never change once generated. Host edits (wording, fonts, text boxes, every fact) live on the event, as its card customization, and never mutate a design (`spec.md §20.5`). Do not regenerate or silently "upgrade" an existing card.

Renderer code may receive bug, accessibility, responsive and browser fixes that change how every existing card renders; design immutability never blocks renderer maintenance.

## 15.9 Registry product thumbnails

Product thumbnails are content imagery, not decorative imagery.

Use normalized platform assets or the house-style placeholder. Never retailer-hotlink.

## 15.10 Event footer

Every published/previewed guest page includes the tasteful `Made with …` attribution required by the PRD.

It uses the house style, remains low-emphasis, and is non-editable in MVP.

## 15.11 Imagery rule

Permitted:
- the card's generated artwork (every card has some, from a full illustration to a refined border or paper texture; it contains no text);
- the native registry product thumbnail, which is product content (§15.9).

Not permitted:
- host-uploaded photos or images on the card or page;
- stock photography;
- retrieved web imagery;
- text inside artwork;
- images, stickers or graphics added in the card editor;
- crop/position tools, galleries, or imagery placed by anything other than the card layout.

Inspiration uploads are private model inputs to Event Identity only: never shown to guests and never sent to the image model.

---

# 16. Design presentation

The UI presents one design at a time, and the designs list presents earlier designs as peers.

Do not:
- label one best;
- show AI confidence or scores;
- rank designs.

Presentation is the design's creative name and one-line description beside the real card.

---

# 17. Incomplete states inside creation mode

Incomplete content should often appear **where the final content will live**.

## RSVP example

Before setup:

```text
RSVP

Set up how guests will respond.

[ Set up RSVP ]
```

After setup:

```text
RSVP

Kindly respond by December 1.

[ Find your invitation ]
```

## Registry example

Before setup:

```text
Registry

Add your registries and gifts here.

[ Add registry ]
[ Add individual gift ]
[ Add cash fund ]
```

After setup:

```text
Registry

Amazon Baby Registry
[ Shop registry ]

Babylist
[ Shop registry ]
```

This transformation is part of the product's sense of progress.

---

# 18. Creation-mode control styling

Collaborator controls must be visible enough to discover but quiet enough that the invitation still looks finished.

Use:
- small neutral pills;
- subtle surface;
- app typography;
- app colors;
- light border;
- modest elevation only if needed.

Do not style collaborator controls using the card's colours or fonts.

This distinction helps the host understand:
- "this is an editor control";
- "this is part of my invitation."

---

# 19. Desktop-specific guidance

Desktop must feel intentional.

## 19.1 Landing

- centered prompt composer;
- wider supporting copy;
- no mobile device frame.

## 19.2 Card reveal and designs

Show the card centered at a comfortable size; it is the same design as on mobile and never reflows.

The designs list may sit beside the card on wide screens. The **surrounding application** is desktop native.

## 19.3 Creation mode

The card and house-style page fill an appropriate responsive canvas; the card is the same design at a comfortable size.

Collaborator controls may:
- hover at section edges;
- use a slim top toolbar;
- open right-side panels.

Do not constrain the whole invitation to `390px` on desktop.

## 19.4 Guest management

Use desktop workspace efficiently:
- table/list hybrid;
- columns when useful;
- responsive detail pane if implementation remains simple.

Do not render a giant stretched mobile list if desktop could materially improve usability.

---

# 20. Mobile-specific guidance

Mobile is the baseline and must support the entire product.

## 20.1 Sticky controls

Use safe-area-aware sticky/floating controls.

The setup pill must not cover:
- primary event CTA;
- focused fields;
- browser UI.

## 20.2 Sheets

Mobile editors should feel continuous with the source content.

Sheet titles are concise.

Avoid multi-level nested settings navigation.

## 20.3 Keyboard behavior

When the software keyboard appears:
- focused field remains visible;
- fixed controls should not overlap input;
- sheets resize/scroll appropriately;
- in the card editor, the box being typed in stays fully visible above the keyboard and the toolbar (§4.10a).

---

# 21. Copy system

Product copy should be:
- clear;
- concise;
- warm;
- confident;
- non-technical.

Avoid overly cute baby-specific language in product chrome.

The card's wording may be more thematic.

## 21.1 Preferred wording

Use:

- `Create my invitation`
- `Choose this direction`
- `Keep current`
- `Try another direction`
- `Your invitation looks great. Let's make it real.`
- `Make it yours`
- `Finish setup`
- `Preview`
- `Publish my invitation`
- `Send invitations`

Avoid:

- `Initialize project`
- `Configure`
- `Proceed`
- `Next step`
- `Design configuration`
- `Theme schema`
- `Generate website`
- `Which feels like you?`

---

# 22. State naming in the UI

Internal lifecycle terms do not need to appear verbatim.

Examples:

Internal:
`READY_TO_PUBLISH`

User-facing:
`Ready to publish`

Internal:
`DESIGN_SELECTED`

User-facing:
no label required unless useful.

Internal:
`GenerationRun`

User-facing:
never expose.

---

# 23. Strict implementation governance

This section is mandatory for coding agents.

## 23.1 Shared components first

Before creating a new visual primitive, the implementing agent must:

1. search the existing shared UI components;
2. search this design-system spec;
3. reuse or extend an existing canonical component when possible.

Do not create local duplicate variants.

## 23.2 No raw visual values in feature UI

Feature-level product UI must not contain:
- raw hex colors;
- arbitrary shadows;
- arbitrary border radii;
- arbitrary spacing;
- arbitrary font sizes;
- arbitrary z-index values.

Use tokens.

Exceptions:
- card renderer values (resolved ink and panel colours, the host's chosen text colours, fonts and sizes, card-unit sizes, positions and line breaks) emitted by the card system and confined to the card component;
- one-off mathematical/positioning values that are not design choices and are documented.

## 23.3 Tailwind rule

If Tailwind is used:

Avoid arbitrary visual classes such as:

```text
text-[#24382e]
rounded-[17px]
shadow-[...]
mt-[13px]
text-[15px]
z-[9999]
```

Use design-system utilities/tokens.

Card ink, panel and host-chosen text colours are set only by the card renderer, through CSS custom properties or its own resolved values, never through arbitrary Tailwind color classes. No other component sets them. The card editor's colour picker (app chrome) passes the chosen value as data; it does not apply it.

## 23.4 Primitive library rule

If shadcn/Radix or another primitive library is used:

- primitives are implementation dependencies;
- canonical product components wrap them;
- feature screens import the canonical product component;
- feature screens do not fork primitive styling independently.

Example:

```text
Radix Dialog
   ↓
AppDialog
   ↓
Feature screen
```

Not:

```text
Feature A custom Radix styling
Feature B different Radix styling
Feature C third styling
```

## 23.5 New component rule

A new reusable design-system component requires:

- documented purpose;
- supported variants;
- accessibility states;
- mobile behavior;
- desktop behavior;
- loading/error/disabled states where relevant;
- visual regression coverage.

Do not add variants "just in case."

## 23.6 New token rule

A new visual token requires a reason that cannot be represented by an existing semantic token.

Do not grow the scale because one screen "looks slightly better" with a new number.

## 23.7 App / card / page boundary lint

The implementation should make it difficult to accidentally mix the three styling systems of §15.1: app chrome, card styling, and the house-style guest page.

Recommended separation (equivalent structure is acceptable):

```text
styles/app-tokens.css          app chrome and house-style page tokens
components/app/*               app chrome + guest-facing (Event*) components
src/styles/card-fonts.css      card fonts
card renderer                  the InvitationCard and its styling
```

Rules — enforced by review today, and by lint and tests from the card-renderer phase (`docs/development-plan.md` Phase 4), when the card renderer exists to import:
- app and guest-page components must not import card styling (`card-fonts.css` or the card renderer's internal styles); they may render `InvitationCard` only through its data-in props;
- card fonts apply only inside the card; they are never used for app or page text. The card editor's font picker (§4.10a) shows each family as a pre-rendered specimen image, so no card font is loaded or applied in app chrome;
- the card renderer does not consume app component styling;
- changing the active design changes nothing about the app chrome or the page's computed styles;
- no raw colour values in app or guest-page components (§23.2).

The architectural boundary is not optional.

---

# 24. Quality gates

## 24.1 Required viewport checks

For major flows:

```text
390px mobile
768px tablet
1280px desktop
1440px+ desktop spot check
```

Also spot-check narrow `320–360px` for overflow.

## 24.2 Visual regression

At minimum, screenshot-test:

Application:
- landing composer;
- generation (waiting) state;
- card reveal;
- creation mode;
- setup checklist;
- design panel and designs list;
- card editor: idle, box selected, typing, font picker, colour picker, box list, saved/saving/failed, conflict notice, reset confirmation (390px and desktop);
- try another direction;
- guest management, including invitation status;
- send invitations and share;
- preview;
- publish.

Guest experience:
- envelope: closed, opening, and sealed (private);
- the card in the envelope's opened state;
- the house-style page: details, description, information blocks, the RSVP flow, registry, confirmation, errors and the passed state;
- mobile and desktop.

Card:
- every card layout × typography pairing with typical and worst-case content, at card scale (the test-time fixture of `docs/card-system.md §9`); the card must be identical in proportion and line breaks at 390px and 1280px.

Mobile remains the primary regression gate, but desktop regressions are also blocking when they materially break layout.

## 24.3 Interaction regression

Automated E2E should cover:

```text
prompt
→ auth/save
→ optional details
→ card reveal
→ make it yours
→ contextual setup
→ preview
→ publish gate
→ send invitations
```

And the card editor:

```text
creation mode / design
→ edit card
→ edit, move, resize, rotate and restyle a box; add and delete a box
→ autosave (saved state visible)
→ undo / redo
→ reset card (confirmed)
→ preview shows the edited card
```

with the phone gestures at 390px, the desktop handles and keyboard, a stale-save conflict, and a new direction or shape switch that keeps the host's words and fonts.

And trying another direction:

```text
card reveal / creation mode / design
→ try another direction
→ optional feedback
→ one new card
→ choose or keep current
```

And guest arrival:

```text
public shared link → envelope → card → RSVP via name lookup
private shared link → sealed envelope → code → card
personal invitation link → no code → guest opens the envelope → RSVP
```

## 24.4 Accessibility regression

CI should include automated accessibility checks where practical.

Critical flows must also receive keyboard/manual review, including the envelope, the code gate and the reduced-motion reveal.

---

# 25. Canonical reference screens

These are the reference patterns agents should compare new work against.

## 25.1 Landing composer
Defines:
- low barrier to entry;
- prompt-first hierarchy;
- AI composer treatment.

## 25.2 Card reveal
Defines:
- the card coming out of its envelope;
- name and description beside a single card;
- Make it yours / Try another direction hierarchy.

## 25.3 Guest arrival and envelope
Defines:
- public, sealed (private) and personal-link envelope states;
- the activation moment for guests;
- reduced-motion behavior.

## 25.4 Creation mode
Defines:
- invitation-as-workspace;
- contextual editing on the card and page;
- product-vs-card visual boundary.

## 25.5 Finish setup
Defines:
- non-wizard progress;
- lightweight navigation;
- completion states.

## 25.6 Design
Defines:
- the short Design panel: `Edit card`, shape, `Reset card`;
- the designs list;
- pre-publish try-another-direction entry.

## 25.6a Card editor
Defines:
- gestures, handles, snapping and the toolbar on a phone and on desktop;
- font and colour pickers (the design's own choices first);
- saved, saving, failed and conflict states;
- the app-chrome-over-card boundary (§4.10a).

## 25.7 Try another direction
Defines:
- AI refinement;
- optional feedback;
- content-preservation reassurance.

## 25.8 Guest management
Defines:
- justified full-screen operational workspace;
- invitation status and personal links per party.

## 25.9 Guest preview
Defines:
- exact guest rendering, envelope included;
- removal of collaborator chrome.

## 25.10 Publish and share
Defines:
- clear transactional gate;
- one-time price;
- no tier clutter;
- send invitations, link, QR and code.

## 25.11 Co-host invitation acceptance
Defines:
- invitation preservation across auth;
- role framing;
- join-event behavior;
- invalid/expired invitation handling.

There is no current clickable prototype. The website-era prototype was retired with Revision 7; the screens above are specified by this document, `docs/screen-spec.md` and `docs/e2e-workflow.md`. A future prototype is a behavioral reference only, lives in the repository rather than in a chat attachment, and never overrides this document's values.

---

# 26. Anti-patterns

Do not ship these.

## 26.1 Wizard setup

```text
Event details → Next
Guests → Next
RSVP → Next
Registry → Next
```

Wrong unless a future workflow genuinely requires strict sequence.

## 26.2 Dashboard immediately after the card reveal

Wrong:

```text
card reveal
→ generic admin dashboard
→ configure event
```

Correct:

```text
card reveal
→ edit the invitation itself
```

## 26.3 Builder chrome

Do not add:
- left component palette;
- drag handles everywhere;
- layers panel;
- canvas zoom;
- breakpoint toolbar;
- arbitrary block insertion;
- an image editor, crop or reposition tools for artwork;
- layout, art-mode or artwork pickers;
- CSS controls.

The card editor (§4.10a) is the one deliberate exception for the card's text layer: handles on text boxes, a box list, and font and colour pickers for card text. It adds no left palette, no canvas zoom, no image or sticker insertion, and no controls over the artwork, outline or page.

## 26.4 Theme settings explosion

Do not expose controls for:
- the generated card's ink or panel colours, or any app-chrome palette (card text colours are chosen per box in the card editor, §4.10a);
- layout or art mode;
- envelope styling;
- page styling (button radius, card radius, shadow amount, heading scale, line-height, padding).

These are design- or system-owned.

## 26.5 Page-specific visual invention

Do not create:
- a new button treatment for registry;
- a new card system for RSVP;
- a new modal look for guests;
- a special border radius for billing.

Use the system.

## 26.6 Fake activity

Do not add artificial multi-second loading, invented progress or simulated reasoning to make AI feel sophisticated.

## 26.7 Card and app leakage

Do not recolor app chrome based on the card or the event.

Do not theme the house-style page from the card, and do not let card fonts or card styling escape the card renderer. Do not let app styling leak into the card.

---

# 27. Design-system maintenance

## 27.1 When to update this document

Update when the team deliberately changes:
- canonical interaction pattern;
- token scale;
- component variant;
- responsive rule;
- card/page boundary or house-style treatment;
- motion rule;
- accessibility rule.

Do not update it to rationalize an accidental one-off implementation.

## 27.2 Version discipline

Meaningful behavior changes should note:
- old behavior;
- new behavior;
- rationale;
- affected components/screens.

## 27.3 Product-review rule

If a proposed UI requires violating a principle in this document, stop and ask whether:
1. the UI is wrong, or
2. the design-system rule truly needs to change.

Do not silently make an exception.

---

# 28. Implementation checklist for every new screen

Before merge, verify:

### Product behavior
- [ ] Does the screen keep the user close to the object/task they care about?
- [ ] If authentication redirects occur, is all high-intent draft state preserved exactly?
- [ ] Did we avoid unnecessary configuration?
- [ ] Did we avoid a wizard if task order is independent?
- [ ] Is AI reducing choices rather than exposing more controls?
- [ ] Are real event values used wherever known?

### Components
- [ ] Shared components reused.
- [ ] No duplicate button/card/dialog patterns.
- [ ] No undocumented variant added.

### Tokens
- [ ] No raw product-UI colors.
- [ ] No arbitrary spacing/radius/shadow/font-size.
- [ ] Named z-index layer used.

### Responsive
- [ ] Works at ~390px.
- [ ] Works as a real desktop layout.
- [ ] Desktop is not a phone canvas.
- [ ] Preview supports Mobile/Desktop width selection on larger screens.
- [ ] No hover-only functionality.

### Motion
- [ ] Transition uses motion tokens.
- [ ] Motion is brief and purposeful.
- [ ] Reduced-motion behavior works.

### Accessibility
- [ ] Visible focus.
- [ ] Keyboard flow works.
- [ ] Labels are explicit.
- [ ] Contrast passes.
- [ ] Touch targets are adequate.
- [ ] Color is not the sole state cue.

### Card and house-style page
- [ ] App chrome does not inherit card styling; card styling does not leak out of the card renderer.
- [ ] The page beneath the card takes no colours or fonts from the card.
- [ ] Production card, envelope and page reused for preview.
- [ ] No host controls for layout, art mode or artwork introduced; text-layer controls exist only in the card editor (§4.10a), whose chrome is app-styled and never part of the card.
- [ ] Card-editor changes: touch targets ≥ 44px, keyboard and exact-value access, no readability warnings, reduced-motion behaviour.
- [ ] No HTML/CSS authored by a model; no host, stock or retrieved imagery introduced.

---

# 29. North-star design test

When evaluating any screen, ask:

> **Does this feel like the product already did most of the work for me?**

A successful creation experience makes the host feel:

> **"It already made my invitation. I'm just making it real."**

A successful interface keeps attention on:
- the event;
- the guests;
- the celebration;

not on software configuration.

The application should disappear behind the outcome.

---

# 30. One-line implementation rule

> **Stable, quiet application chrome. One AI-designed card. A neutral house-style page. Contextual editing. No setup wizard. Strict shared components and tokens.**
