# AI-Designed Event Invitation + RSVP + Registry Platform

**Document:** Product Requirements Document (PRD) / `spec.md`
**Status:** Revision 7 — MVP baseline for implementation (§0)
**Initial launch vertical:** Baby showers
**Platform architecture:** Event-generic, baby-shower-first
**Primary build principle:** **AI should remove decisions, not create more decisions.**

---

## 0. What changed in Revision 7

Revision 7 changes what the product makes. **The AI no longer generates a custom event website.
It designs a digital invitation card**, in the spirit of a Paperless Post card: generated artwork
with real text set over it, delivered in an envelope that opens. Under the card sits a standard
event page — details, RSVP, registry — in one neutral house style shared by every event.

Why: Human Test #1 reviewers judged the generated websites to be "well-typeset flyers", and the
references they supplied as what they wanted were *invitations*: an illustrated anchor, a border,
a palette drawn from the artwork, quiet typography. A single card is also a far more tractable
creative problem than a responsive multi-section page, and it is the object a host actually
screenshots and sends. The full record is `docs/CHANGELOG-v7.md`.

| Area | Revision 6.1 | Revision 7 |
| --- | --- | --- |
| Creative output | A full custom event website composed by the model (`CompositionTree`) | One AI-designed invitation card: generated artwork + real text in a layout (`docs/card-system.md`) |
| Event page | Themed per concept, composed by the model | One neutral house style for every event; the card is the only themed surface |
| Designs per round | Three concepts, diversity-planned | One at a time; `Try another direction` generates a genuinely different one |
| Model calls | Event Identity → DesignIntent ×3 → Composition ×3 | Event Identity → Card Design → Card Art (image model) |
| Model authority | Structure only, enum tokens, no free text | Card direction: layout from a catalog, art mode, font pairing, an art brief, and the card's wording (title, invitation line) |
| Imagery | Excluded, then approved as optional Phase 4 artwork | Every card has generated artwork; it may be as minimal as a border or texture |
| Verification | Headless-browser geometry verification at 390/1280 per concept | Fixed 5:7 canvas; deterministic text fit and ink contrast; browser checks at test time only |
| Guest arrival | Host shares a link/QR | Host shares a link/QR **and** the platform can text each invited party a personal invitation link |
| Guest identity | Name lookup + SMS code | Personal invitation link identifies the party; shared-link guests use name lookup + SMS code |
| Private events | Finished hero visible before the code | Sealed envelope with the event title until the code; personal links skip the code |
| Host design controls | Curated palette and typography | Edit the card's words; swap among the design's curated font pairings |

**Unchanged:** prompt first → auth → generation; Event Identity as the only interpreter of the raw
prompt and its fact-versus-interpretation boundary; adaptive creative clarification; Creation Mode
as the event itself with contextual controls and no wizard; readiness rules; RSVP, guests,
registry, native gift honor system, cash fund; roles; the $49 publish hypothesis; the locked stack
(minus headless Chromium, plus an image model).

**Retired:** the composition language, primitives, sibling planner, structural directives,
attractive-token caps, skeleton signatures, the recipe library and its boundary invariant, the
`ResolvedDesignSpec`, rendered-geometry verification as a production step, per-concept themed
pages, and the palette override control.

---

## 1. Executive Summary

We are building an **AI-native event invitation platform**: a host describes the event in their
own words and receives a beautiful, specific invitation card, plus the RSVP, guest list and
registry around it.

The initial launch is **baby showers**, because they combine strong visual theming, a real need
for RSVP management, a real need for gift registries, and hosts who want the digital invitation to
match the event's look.

The product should not feel like a design tool. The host never chooses fonts, layouts, colours or
clip art.

The core promise:

> **Describe your event. We create the whole experience.**

A host might write:

> "I'm throwing a Ralph Lauren-inspired baby shower for my baby boy. Classy, cozy, preppy,
> elevated — navy, cream, forest green, maybe a little equestrian, but not cheesy. It's at a lodge
> in December."

The platform understands the taste and the subtext, translates the reference into original visual
language, and designs one invitation card — artwork, wording, typography — that feels like it read
the host's mind. If it isn't right, `Try another direction` produces a genuinely different one.
The chosen card becomes the event's invitation: guests receive it in an envelope, open it, and
RSVP and browse the registry on the page beneath.

The host may optionally upload inspiration images. They are private inputs to the AI's
understanding, never shown to guests and never sent to the image model.

The MVP includes:

1. an AI-designed invitation card;
2. event details;
3. RSVP and guest management;
4. registry presentation, individually tracked gifts and a cash fund card;
5. invitations by text with personal links, plus SMS reminders and announcements;
6. mobile-first host and guest experiences.

It does **not** include a website builder, a custom-designed event website, a template gallery,
seating charts, vendor management, photo galleries, printed stationery, email invitations,
public/open RSVP, retailer scraping or sync, or an AI chat copilot.

---

## 2. Product Thesis

### 2.1 The problem

Today a host stitches together several products for one event: Canva or a designer for the look,
Paperless Post or Evite for invitations, Partiful or a website builder for RSVP, Amazon or Babylist
for the registry, and a spreadsheet for guests and gifts. Invitation tools ask the host to browse
hundreds of templates and still make every design decision.

> **People know the event they want, but turning that idea into a cohesive invitation without
> doing design work themselves is hard.**

### 2.2 Product solution

The platform acts like an **AI creative director + event operating system**.

The host describes the event in natural language. AI:

- understands the taste, vibe and subtext, including negative constraints;
- translates named references into original design language rather than copying protected assets;
- produces a structured creative brief (the Event Identity);
- designs an invitation card: a layout, an art direction, a font pairing and the card's wording;
- generates original artwork for that card.

Deterministic application code sets the host's facts on the card, guarantees the text fits and is
legible, and renders the same card on every screen. The host never "designs" anything.

### 2.3 Why people pay, why they stay

- **The card is why they come and pay.** The moment the envelope opens on a card that reads their
  mind is the acquisition and conversion moment.
- **Operations are why they stay through the event.** RSVP chasing and gift tracking are the host's
  real problem in the weeks before the shower.
- **The invitation is the growth channel.** Roughly forty guests open it, and one of them is hosting
  next. The guest experience must be as polished as the card, and carries a tasteful "Made with …"
  footer line.

---

## 3. Positioning and Commercial Model

### 3.1 Initial positioning

Market around **baby showers**, not "all events".

> **Describe your baby shower. We design the invitation.**

### 3.2 Commercial model

- Free to create.
- Free to generate designs and try other directions (within backend limits, §10).
- Free to preview.
- **$49 one-time fee to publish.** Single flat price, no tiers, no per-guest pricing, no
  subscription.

$49 was set when the product was a custom website + RSVP + registry. It remains **a hypothesis to
test**, and it must be re-checked against what invitation products charge (Paperless Post, Evite,
Partiful, Canva) before launch.

The mocked payment gate (§28) displays the real price from day one, including during beta with a
bypass, so gate-open → continue is a usable conversion signal before billing exists.

No refunds. No ownership transfer. These are policy, not product features.

### 3.3 Long-term platform direction

The architecture uses a generic `Event` concept so the same system can later support bridal
showers, weddings, birthdays, graduations and other invite-only events. Do **not** broaden the
launch UX or marketing during MVP.

---

## 4. Product Principles

These principles are requirements, not suggestions.

### 4.1 AI should remove decisions, not create more decisions

AI makes the design decisions on the host's behalf: layout, artwork, palette, typography, wording.
Do not turn AI into a questionnaire generator. Do not ask the host to choose fonts, layouts,
colours, borders, clip art or templates.

The host describes intent; the system turns intent into an invitation.

### 4.2 AI designs the card; code sets the facts and guarantees legibility

The strong model creates:
- an `EventIdentity` — what the host means and what creative world the event belongs to;
- a `CardDesign` — a layout from a small catalog, an art mode, a curated font pairing (with up to
  two alternates), the card's wording (title and invitation line), and an art brief.

An image model creates the card's **artwork**, from the art brief and the layout's composition
rule — never from the host's raw prompt.

Deterministic application code:
1. validates the design against a strict schema and catalogs;
2. checks the wording invents no fact;
3. validates the artwork;
4. chooses ink colours and any legibility panel so every card text clears 4.5:1;
5. sizes and breaks every line of card text so it fits;
6. renders the card identically at every size, inside the envelope, above the house-style page.

The model never emits HTML, CSS, JavaScript, SVG, colours for text, font sizes, positions or line
breaks, and never writes the host's facts. Architecture: `docs/card-system.md`.

### 4.3 The card is the creative surface; there are no templates

There is no template gallery and no library of artwork. Each card's artwork is generated for that
event. A small, versioned catalog of **text layouts** decides where words go and where the art must
stay quiet; the model picks one, the host never sees the catalog. Uniqueness lives in the artwork,
the wording and the typography, not in the layout.

### 4.4 Prompt first, auth second, generation third

The user invests in their idea before being asked to authenticate.

1. user writes the event prompt and may add inspiration;
2. auth/save occurs;
3. prompt and inspiration are restored exactly;
4. generation begins.

Do not spend strong-model or image-model generation on anonymous traffic.

### 4.5 Show the finished invitation before setup

The first thing the host sees after generation is their invitation card coming out of its
envelope, complete and send-ready-looking. The host should feel:

> **This is already my invitation. I only need to make it real.**

Do not interrupt that moment with a dashboard.

### 4.6 Creation Mode is the invitation itself

Before publish, the workspace is the guest experience: the card and the page beneath it.
Owner/co-host-only contextual controls appear at stable anchors on the card and on each page
section: `Edit`, `Set up`, `Add`. Focused sheets/panels edit structured data, then return the
collaborator to the same place.

Guest management is the major exception: household/CSV/phone operations get a dedicated workspace.

### 4.7 No setup wizard

Independent tasks do not require a linear Step 1 → Next → Step 2 workflow. The floating setup
control is navigation and readiness, not a wizard.

### 4.8 Mobile first; desktop is real desktop

Every core workflow works from approximately 390px outward. The card is the same design at every
size. The page and the host's workspace use desktop space intentionally on desktop; nothing is
trapped inside a phone frame.

### 4.9 Opinionated design quality

The host refines within safe boundaries — the card's words and a choice among curated font
pairings — and the system makes an illegible or incoherent card impossible.

### 4.10 Generated design data is immutable; renderer code is maintainable

Once generated:
- the `EventIdentity` revision is immutable;
- each `CardDesign`, its artwork and its resolved ink are immutable, with their version set (prompt,
  schema, layout set, compiler, image model).

Host edits — wording, font swap, every fact — are event data and never mutate a design. Do not
regenerate or "upgrade" the artwork or design of an existing card.

Renderer code is normal product code: accessibility, browser, responsive and visual fixes may
change how every existing card renders. "Design immutability" never blocks renderer maintenance.

---

## 5. MVP Scope

### 5.1 In scope

**Prompt-first event creation**
- Landing page is the natural-language event composer.
- Optional private inspiration images may be added directly to the composer.
- Auth/save after the prompt is written and before generation.
- Prompt text and uploaded inspiration survive auth/OAuth redirects exactly.
- No front-loaded profile/configuration flow.

**AI identity and card design**
- Strong-model `EventIdentity`, with optional adaptive creative clarification (§7.6b).
- Strong-model `CardDesign`, one per round.
- Image-model artwork for every card; artwork never contains text.
- Deterministic validation, wording fact check, ink/legibility resolution and text fit.
- The card revealed from its envelope as soon as it is ready.
- `Try another direction` with optional feedback, before publish, from the reveal and from Creation
  Mode.
- Every design generated for the event stays browsable before publish; the active card stays active
  until another is explicitly chosen.

**Creation Mode**
- The chosen card and the page beneath it are the workspace.
- `Make it yours` turns the revealed invitation into Creation Mode.
- Contextual owner/co-host controls on the card (wording, details) and on each page section.
- Font control limited to the design's curated pairings.
- Floating readiness/setup control; checklist separates publish blockers from recommended work.
- Autosave routine edits.
- Guest management may open a dedicated full-screen workspace.
- `Preview` shows the exact guest experience, envelope included.

**Invitation and event page**
- The invitation card: title, invitation line, baby name and hosts when present, date, time,
  venue, RSVP-by.
- Event page in the house style: event title, hosts, date, time, venue, address, description,
  a small number of simple optional information blocks inferred from the prompt, RSVP, registry.
- IANA timezone inferred from venue text, browser fallback.
- Public/private; private access code; sealed envelope before the code.
- Branded subdomain, QR code, link previews showing the card (public) or the envelope (private).
- Tasteful `Made with …` footer.

**Invitations and messaging**
- Host shares the event link/QR themselves, and/or
- the platform texts each invited party a personal invitation link (after publish, with host
  attestation).
- Host can copy any party's personal link to send another way.
- SMS reminders and announcements; email fallback only as §13 allows, never as a STOP bypass.

**RSVP and guests**
- Manual guest-party entry and CSV import; invite-only RSVP.
- Household/party grouping, adults/children/plus-ones.
- Phone-first party contact; missing-phone CSV rows import as **Needs phone**; rare explicit
  `noPhoneAvailable` path; optional email.
- RSVP deadline; attendance, meal, dietary, custom questions, notes.
- Personal invitation link identifies the party; shared-link guests use name lookup + SMS OTP.
- Scoped guest-party session; no guest account; return/update through the personal link.

**Registry**
- External registry destinations.
- Native gifts by product URL with one safe metadata/image convenience fetch and manual fallback.
- Platform-owned normalized native product thumbnail where possible.
- Native gift public state: Available/Purchased only; private buy-click logging; no reservations.
- Optional self-confirm purchase on return; host/co-host purchase override.
- Display-only cash fund.

**Roles**
- Owner; co-host with near-parity for event work; guest with no account.

**Publishing**
- Free to create/generate/try other directions/preview within backend limits.
- $49 one-time publish hypothesis; payment separate from readiness.
- Deterministic `READY_TO_PUBLISH`.
- Post-publish content, operations, wording and font edits allowed; post-publish AI generation and
  design switching disabled.

**Post-event**
- Passed-event thank-you state; registry remains accessible.

### 5.2 Explicit non-goals for MVP

Implementing agents must **not** add these unless explicitly requested later:

- a custom-designed or model-composed event website; per-event themed page styling;
- drag-and-drop builder, pixel editor, arbitrary CSS, free-form canvas, image editor;
- customer-facing template, layout or artwork gallery;
- host controls for layout, colour, palette, art mode, ink, borders, font sizes or text position;
- free font choice beyond the design's curated pairings;
- a card back, multi-page cards, animated cards;
- host-uploaded photos or images on the card or page; stock photography; retrieved web imagery;
- inspiration images sent to the image model or shown to guests;
- text rendered inside generated artwork;
- email invitations; printed stationery; envelope customization;
- seating charts, timeline/planning modules, vendors, venue marketplace;
- photo galleries, thank-you-note manager;
- public/open RSVP; guest accounts;
- browser extensions/bookmarklets;
- retailer scraping/sync/proxies/anti-bot workarounds;
- Pinterest-board URL ingestion promise;
- persistent AI chat/copilot or token-level AI editing;
- AI generation or design switching after publish;
- user-facing AI credits/generation counters during alpha/beta;
- version-history/rollback beyond the browsable designs generated before publish;
- gift reservations/holds/timers/public claim state; purchase nudges/collision engine;
- maps/geocoding solely for timezone;
- cancel/unpublish/refund/ownership-transfer workflows;
- custom domains unless trivial/stubbed;
- native mobile apps; user-facing analytics dashboards; app dark mode.

---

## 6. Primary User Roles

There are no additional personas in MVP.

### 6.1 Owner

The owner created the event. Owner can:

- create the event and enter the initial prompt;
- upload private inspiration;
- generate designs, try other directions, browse and choose designs before publish;
- edit the card's wording and swap its font among the design's pairings;
- manage event details, privacy, guests, RSVP configuration and responses;
- manage external registries, native items, cash fund;
- send invitations, reminders and announcements;
- invite/remove co-hosts;
- publish and handle billing/payment;
- delete/archive the event.

### 6.2 Co-host

Invited by the owner. A **true event collaborator** with near-parity for event work.

Co-host can:

- edit event details, content and the card's wording and font;
- manage privacy/access settings;
- manage the guest list and import CSV;
- manage RSVP settings/questions and view responses;
- manage external registries, native items, native item purchase state and cash fund;
- send invitations, reminders and announcements;
- enter redesign feedback and add private inspiration;
- try other directions and choose designs **before publish**;
- preview;
- publish **only if the event's payment requirement is already satisfied**.

A co-host invitation preserves its token through authentication; after acceptance the co-host
enters the existing event, not event creation.

Co-host cannot initiate or manage payment, manage co-hosts, transfer ownership or delete the event.

Generation/spend/abuse limits apply at both the event and acting-account level.

### 6.3 Guest

- receives a personal invitation link by text from the platform, or the event link/QR from the host;
- opens the envelope (entering the event code first if the event is private and they arrived by
  the shared link);
- reads the card and the event details;
- RSVPs for their party — identified by their personal link, or by name lookup + SMS code;
- updates the RSVP later through their personal link;
- browses the registry; leaves to shop external registries or retailer links;
- may self-confirm a native gift purchase;
- never creates an account.

---

## 7. End-to-End Host Journey

### 7.1 Landing page is the prompt

Primary message:

> **Describe your event. We create the whole experience.**

The natural-language composer is the hero of the landing page. Primary controls: a large
event-description input; `+ Add inspiration`; `Create my invitation ✦`.

Reassurance may say:
> Free to create · No templates · Publish when ready

Do not require signup before the user writes.

### 7.2 Pre-auth draft and authentication

On `Create my invitation`:
1. persist a short-lived private draft containing the exact prompt;
2. retain references to successfully uploaded private inspiration assets;
3. retain lightweight client state needed to restore the composer;
4. authenticate via Google/Apple/email;
5. attach the draft to the authenticated owner/event;
6. restore the prompt and inspiration exactly.

**Generation does not begin until authentication succeeds.** Losing the prompt or inspiration
during OAuth is a critical product failure. Temporary pre-auth assets remain private, expire
automatically if abandoned, and never become public imagery.

### 7.3 Generation begins; details are optional while it runs

After auth:
- create/attach the event draft;
- begin Event Identity generation immediately;
- in parallel, extract any facts the prompt states (§7.5) into the draft for the host to confirm;
- offer — never demand — the genuinely missing event details while generation runs.

Potential missing details: event date; start time (end optional); venue/location/address; hosts;
baby name if the host wants it shown; RSVP deadline; public/private. Skip values already supplied.

Required details are **publish requirements (§23.1), not generation blockers**. The card is
designed and revealed without them. On the card in Creation Mode, a missing required fact shows as
a bounded placeholder marked as needing confirmation — for example a date twelve weeks out on a
Saturday, 1:00 PM, `Venue to be announced`. A placeholder is never published and never shown to
guests. When the host enters the real value, the card updates deterministically (§7.9); no model
is called.

The card's **title** is wording (§7.7): if the host supplied a title it is used exactly; otherwise
the design drafts one. The event title is therefore never a blocker to seeing a card.

**RSVP deadline default.** If the host does not set one: the event date minus 14 days, at 11:59 PM
in the event timezone. If that instant is already past when the default is computed, use the day
before the event at 11:59 PM; if the event is today or tomorrow, use the event start time. The
default is recomputed only while the host has not edited the deadline; an edited deadline is never
overwritten.

End time remains optional. Do not normally ask timezone; infer it per §7.4.

### 7.4 Venue normalization and timezone inference

Do not introduce a maps/geocoder solely for timezone.

1. Normalize supplied venue/address text.
2. Infer candidate IANA timezone + confidence from city/state/region/country.
3. Validate against an application-side IANA set.
4. On low/invalid confidence, use the owner/co-host browser timezone.
5. Re-run when the venue changes materially.
6. Ask only when both sources are unavailable or obviously contradictory.

Lifecycle calculations always use the stored IANA timezone.

### 7.5 Event Identity

A strong multimodal model derives and persists the creative brief (`event_identity_schema_v3`,
`docs/model-contracts.md §4`):

```ts
EventIdentity {
  creativeDirection
  toneKeywords[]
  colorsExplicitlyConstrained: boolean
  paletteIntent { requiredColors[], preferredColors[], avoidColors[], dominanceNotes }
  tonalIntent
  toneExplicitlyConstrained: boolean
  compatibleTypographyCategories[]   // ranked broad categories, not fonts
  visualMotifs[]                     // subjects, objects, botanicals, patterns, in words
  textureDirection
  typographyDirection
  copyTone
  designConstraints[]                // including every negative constraint
  inspirationSummary
}
```

**Event Identity is the only stage that interprets the raw host prompt.** It is where "what does
this host mean, and what creative world should this event belong to?" is answered. No later stage
receives the prompt text — the card-design call reads this object, and the image model reads only
the art brief derived from the design — so an understanding this stage does not reach is not
recoverable downstream. A raw prompt is never forwarded into a generic website- or
image-generation prompt (`docs/product-doctrine.md §4`).

It holds one boundary exactly:

- **Grounded facts are preserved, never invented.** Hosts and names, event type, date, time, venue,
  address and RSVP deadline come only from the host's input or saved event data. **Facts travel on
  a separate channel:** a cheaper structured-extraction call (§9.2) reads the same raw prompt,
  extracts only what it literally states, and writes it into the event draft as values for the host
  to confirm. `EventIdentity` stays a creative brief and carries no operational field.
- **Creative interpretation is expected and generous.** Tone, sophistication, visual vocabulary,
  palette territory, materials and textures, subjects and symbols, and things to avoid are all fair
  inference. "Lemons in Italy but classy" may imply linen, ceramic detail, a refined lemon
  still-life and an ivory/olive palette.
- **Inference never becomes a fact.** The same prompt may not conclude that the event is in
  Positano, outdoors, or black-tie. An aesthetic implication is an implication; a date, a place or
  a dress code is a claim about the host's event and is quoted or absent.

### 7.6 Brand/style references

Named references such as Ralph Lauren are interpreted into original attributes: heritage,
equestrian, classic Americana, editorial serif, navy/ivory/forest/camel, restrained plaid,
understated luxury, heirloom teddy energy.

Never copy protected logos, characters, campaign artwork or a specific proprietary design — not in
the identity, not in the art brief, not in the artwork. A brief that names a brand has already
failed, whatever the image looks like.

### 7.6a Card artwork

**Every card has original generated artwork**, and the creative direction decides how much it
carries: a full illustration, a frame or border, an atmospheric wash, or — for a restrained,
typography-led card — as little as a refined border or paper texture (`docs/card-system.md §2.4`).

Binding rules:

1. **Art-directed to the layout.** The art brief follows the chosen layout: where the subject sits,
   which regions stay quiet for text, crop safety. Never "generate a picture, then find somewhere
   to put it."
2. **No text in the artwork.** No letters, numbers, logos or watermarks. Every word is real text set
   by code. Embedded text is detected and rejected (§7.8).
3. **The image model never sees the raw prompt or the inspiration images.** It receives the art
   brief and the layout's composition rule only.
4. **Original language only** (§7.6).
5. **Readability always wins.** Code guarantees text contrast over the artwork (§7.9); the artwork
   is never the reason a guest cannot read the card.
6. **No host photography, stock or retrieved imagery.** The artwork is generated for this event.

The image model is selected by the Phase 3 bake-off and recorded in `docs/technology-decisions.md`.

### 7.6b Adaptive creative clarification

Event Identity **may** ask the host a creative clarifying question before the card is designed,
only when that materially improves understanding of the requested creative identity.

This is not the setup wizard §4.7 forbids: a wizard is a fixed, sequential, gating intake of
information the product needs; this is at most a small number of questions, generated from an
ambiguity actually present in this prompt, about *taste only*.

Canonical rules:

1. **The preferred number of questions is zero.** Typically 0; sometimes 1–2; a hard ceiling of 3.
2. **Dynamically generated** from the actual ambiguity. There is no fixed question list.
3. **Every question must pass:** *would different answers produce meaningfully different creative
   identities?* If no, it is not asked.
4. **Always offer `You decide` / `Surprise me`.** A host must never need design vocabulary, and one
   who has none must not get a worse result.
5. **Never low-level design choices.** Not fonts, layouts or colours (§4.1).
6. **Never logistics.** Never a missing date, time, venue, address, RSVP deadline or other
   operational field, and never a reason for design to wait on one.

The question schema and its surface are designed in the generation phase
(`docs/model-contracts.md §4`, `docs/development-plan.md`).

### 7.7 Card design

Once Event Identity is valid, the strong model designs one card (`card_design_schema_v1`,
`docs/model-contracts.md §5`):

```ts
CardDesign {
  presentation { name, description }        // host-facing; e.g. "Heirloom Teddy"
  layout          // ID from the layout catalog (card_layouts_v1)
  artMode         // illustration | framed | atmosphere | minimal
  typography { primary, alternates[0..2] }  // curated pairing IDs
  wording { title, invitationLine }         // bounded free text; no invented facts
  artBrief { subject, medium, mood, palette, texture, avoid[] }
}
```

Inputs: the persisted `EventIdentity`; the event facts present so far (so wording can use the
host's own names exactly); on `Try another direction`, the host's optional feedback and a summary
of every earlier direction for this event.

**One design per round.** `Try another direction` produces a design that is genuinely different
from every earlier one for this event — a different idea, not a palette or font swap. Code rejects
an exact repeat (same layout, art mode and primary pairing as an earlier direction) with one
re-prompt; the evaluation corpus judges whether directions *feel* different.

**Wording rules.** The title and invitation line may use a name only exactly as the host supplied
it, and never contain a date, time, place, dress code or other fact. If the host supplied a title,
the design uses it verbatim. Code checks wording deterministically where it can; a slot that fails
twice falls back to standard wording (§7.9), visible and editable like any other text.

The model cannot emit HTML, CSS, JavaScript, SVG, text colours, sizes, positions, line breaks, the
host's facts, or any ID outside its catalogs.

### 7.8 Card artwork generation

Application code assembles the art prompt deterministically from the art brief, the layout's
composition rule and the global rules (no text, no logos or brands, original style, 5:7 portrait).
The image model returns the artwork.

Validation (deterministic, plus the bake-off's chosen checks): file type, 5:7 within tolerance,
minimum resolution, decodable, **no embedded text**, and content safety. A failure earns one
regeneration; a second failure is shown honestly to the host with a retry action. There is no
template or stock fallback.

### 7.9 Card compilation

For each card, deterministic code with no model call (`docs/card-system.md §4`):

1. validates the `CardDesign` against its strict schema and catalogs (one re-prompt on schema
   failure, then a visible failure with retry);
2. checks wording against facts (one re-prompt, then standard wording for the failing slot, logged);
3. checks direction distinctness against earlier designs (one re-prompt);
4. validates the artwork (one regeneration);
5. resolves ink per text zone from the artwork's own palette, measuring the background
   conservatively, so every card text clears **4.5:1**; applies the layout's legibility panel when
   no ink can;
6. persists the `CardDesign` (raw and validated), artwork and resolved ink with the version set.

Card text layout — font size and line breaks for every slot — is one pure versioned function
(`layoutCard`) run when content is saved, when a font is swapped and when the card renders. Slot
character limits are enforced at entry so it can always fit. The browser never re-wraps card text.

### 7.10 The wait

Generation is a product surface, not a loading state to hide.

1. Event Identity starts immediately; user-facing parts of it may stream.
2. Fact extraction runs in parallel; the host may confirm or fill in details while waiting —
   watching and filling in are equally valid. This is the §7.3 form, offered, never demanded.
3. The card design and its artwork follow the identity.
4. The card is revealed from its envelope **as soon as its artwork and ink resolution exist**.

**What is shown is real output, never theater:** structured creative artifacts the pipeline
actually produced — interpreted creative signals, palette territory, visual vocabulary, the
design's name and description, the art direction — surfaced as each genuinely resolves. **Never
model reasoning or chain-of-thought, and never fabricated progress**: no invented percentages, no
simulated "thoughts", no stage claiming work that has not happened.

The surface never becomes a mood-board picker, font or palette chooser, layout selector or
questionnaire (§4.1).

Latency goals, p75:

| Milestone | Target |
| --- | --- |
| Event Identity visible | ≤ 5 s |
| Card revealed | ≤ 30 s — working target |

The card target is provisional: it is re-set deliberately from the Phase 3 bake-off's measured
image-model latency, never widened quietly to match whatever was built. Measure reality; do not
silently allow unbounded waits.

### 7.11 Card reveal

The card comes out of its envelope (the same envelope guests will see). The reveal shows:
- the card;
- its creative name and one-line description;
- `Make it yours →`;
- `Try another direction ✦`.

The first card generated for an event becomes its active design. A later card becomes active only
when the host chooses it.

Preferred copy:

> **Your invitation looks great.**
> **Let's make it real.**

There is no separate website-generation step.

### 7.12 Make it yours → Creation Mode

`Make it yours` does not navigate to a dashboard. The invitation — card and page beneath — becomes
editable in place.

Collaborator-only controls attach to stable anchors on the card and on each page section:
`Edit`, `Set up`, `Add`. Editors open as mobile sheets/full-screen flows or desktop panels, then
return to the same place. Routine edits autosave.

A floating readiness control shows truthful state such as `Finish setup`, `2 required items left`,
`Ready to publish`. Its sheet separates:

**Needed to publish** — the deterministic blockers of §23.1.

**Recommended before sharing** — Guests; Registry; Co-host; other useful optional work.

Guests/Registry never make a publish-ready event look blocked.

### 7.13 Guest management exception

Guest management may leave the invitation for a dedicated workspace because household grouping,
CSV import, phone state, invitation state and response state need room. Closing returns to
Creation Mode.

### 7.14 Direct design controls

`Design` exposes only:
- the card's font: the design's primary pairing and its alternates;
- reset the card's wording and font to the design;
- `Try another direction ✦` before publish;
- the designs generated so far, to choose another before publish.

Wording is edited directly on the card. Do not expose layouts, colours, art modes, ink, panels,
sizes, positions or anything else.

### 7.15 Try another direction

Available before publish from the reveal and from Creation Mode.

Flow:
1. optionally say what to change ("more playful", "less preppy");
2. optionally add new private inspiration;
3. reassure: **your event details stay exactly as they are**;
4. update/merge Event Identity when the feedback changes the creative brief;
5. design one new card that is different from every earlier one;
6. generate its artwork and compile it;
7. the current active card stays active while the new one is revealed;
8. the collaborator chooses the new one, keeps the current one, or tries again.

There is no chat-level micro-edit loop.

### 7.16 Preview

Preview uses the production card and page with actual current content, envelope included, and
strips collaborator actions, the setup control and the owner toolbar.

On larger screens the default preview width is **Mobile**, with a compact `Mobile / Desktop`
toggle. The toggle exists in Preview only.

### 7.17 Publish

Publish is gated by the $49 one-time payment hypothesis. The owner completes/manages payment. Once
payment is satisfied, owner or co-host may publish if deterministic readiness passes.

After publish: event URL; QR code; private event code surfaced separately when private; `Send
invitations` (§7.18); copy any party's personal link.

### 7.18 Send invitations

After publish, the host may have the platform text invitations:

1. choose recipients: all invited parties not yet invited, or a selection;
2. attest once per event that they have permission to text these guests about this event (§13.2);
3. the platform sends each selected party with a usable phone, that has not opted out, one short
   text with **their personal invitation link** (§12.5);
4. parties without a usable phone are listed with their personal link to copy and send another way.

Invitation state per party (not sent / sent / delivery failed / opted out) appears in the guest
workspace. Invitations go by text only. Resends and later invitations to newly added parties are
allowed within the per-party cap (§13.2).

Hosts may also simply share the event link/QR themselves; both paths coexist.

---

## 8. Publishing and Editing Rules

### 8.1 Allowed after publish

Owner and co-host may change:

- date/time/location and ordinary event content, including the card's wording;
- the card's font, among the active design's pairings;
- RSVP settings/questions;
- guest list, invitations and RSVP operations;
- external registries, native items, native item purchase state, cash fund;
- reminders/announcements;
- privacy settings/event code;
- section order and visibility of simple information blocks.

Changes update the live invitation directly. There is no draft/live dual-version workflow. Hosts
should announce material changes (date, venue) to guests (§13.4).

### 8.2 Not allowed after publish

- generating a new design (`Try another direction`);
- switching to a different design.

The designs list becomes read-only after publish.

### 8.3 Cancellation

There is no cancel/unpublish workflow in MVP. Do not create a hidden workaround such as instructing
the host to falsify the event date. Cancellation is a deferred product/policy decision. No refunds
or ownership transfer in MVP.

---

## 9. AI Architecture and Cost Controls

AI cost is a product constraint from day one, but creative quality is the product.

### 9.1 Creative model operations

```ts
generateEventIdentity(...)   // strong multimodal model
generateCardDesign(...)      // strong model
generateCardArt(...)         // image model
```

These are the only frontier creative operations in MVP. A thin provider capability layer is
sufficient (`src/lib/ai/provider.ts`); do not build a large abstraction framework.

The models do not set the card's facts, colours, sizes, positions or line breaks. Application code
validates the design and artwork and resolves legibility and layout (§7.9).

### 9.2 Cheaper-model usage

Use smaller/cheaper models only where ordinary code is insufficient and quality remains acceptable:
- structured fact extraction from the prompt (§7.5);
- missing-field detection;
- ambiguous date/time normalization;
- candidate IANA timezone inference + confidence;
- artwork validation that code cannot do alone (embedded-text and safety checks), if the bake-off
  chooses a model for it.

Validate timezone in code. Do not add models for ink, contrast, text fit, layout or compatibility.

### 9.3 No-model operations

Never call a model for:
- auth draft persistence;
- changing structured date/time/venue or any fact;
- editing the card's wording;
- swapping the card's font;
- hiding/reordering simple information blocks;
- guests/registry/cash-fund operations;
- sending invitations, reminders or announcements (message text is templated);
- validating Event Identity/CardDesign structure and enum IDs;
- the wording fact check and direction-distinctness check;
- assembling the art prompt;
- ink resolution, legibility panels and contrast;
- card text layout (`layoutCard`);
- choosing or switching the active design;
- enforcing generation limits;
- gift state transitions;
- product-image processing.

### 9.4 Persistence and reproducibility

Persist:
- Event Identity (each revision);
- every `CardDesign`, raw and validated, with its prompt, schema, layout-set and compiler versions;
- every artwork asset, with its image model and art-prompt version;
- each design's resolved ink and panels;
- the event's active design and the host's card edits, separately from the designs.

Do not re-send original raw inspiration after its summary is available. Do not regenerate or
recompile historical designs because a prompt, layout set, compiler or image model changes.
Renderer code may evolve and fix bugs while continuing to render existing cards.

### 9.5 Generation telemetry

Each card generation records:

```ts
schemaValidFirstCall
reprompts[]            // kind: schema | wording | repeat-direction (at most one each)
artRegenerated         // boolean, with the failed validation reason
standardWording[]      // slots that fell back to standard wording
inkPanels[]            // zones that needed a legibility panel
versions               // prompt, schema, layout set, compiler, image model
latency                // identity, design, art, total
```

Schema validity, wording fallbacks, art regeneration and legibility panels are separate measures;
never fold one into another.

### 9.6 Model usage and cost metering

Every model call records, where exposed: provider; request ID; model; operation (`event_identity`,
`card_design`, `card_art`, `structured_extraction`, …); input/cached/output/reasoning tokens or
image units; estimated/actual cost; latency; success/failure; generation round. Application usage
should reconcile against provider usage where practical.

## 10. Generation Limits

During alpha/beta, trying other directions is **effectively unlimited from the user's
perspective**. Do not expose credits or remaining-generation counters.

Enforce configurable backend safety limits:

- one generation in flight per event at a time;
- per-event daily generation cap;
- per-account daily generation cap for the acting owner/co-host;
- global/project spend ceiling and alerts;
- anti-abuse rate limits and signup throttling;
- idempotency so retries/double taps do not duplicate expensive calls.

A co-host does not receive an independent pool for the same event; event-level limits span all
collaborators. Each round generates exactly one design and one artwork.

Instrument every generation (§29). Use observed rounds per event, conversion, latency, quality and
actual AI cost to set commercial limits. Do not impose an arbitrary user-facing cap before testing.

The guiding experience:

> **AI designs. Simple controls refine. AI can reimagine before publish.**

---

## 11. Card and Rendering Architecture

`docs/card-system.md` is the implementation-level companion and wins on card-detail questions
that do not conflict with this PRD.

### 11.1 The rule

> **The AI designs the card. Application code sets the words, guarantees they are legible, and
> renders the same card on every screen.**

### 11.2 Canvas and layers

Portrait 5:7, front only, defined in card units and rendered by uniform scaling, so the card is
identical on a phone and on desktop. Layers: generated artwork (full bleed); an optional
art-derived legibility panel; live text.

### 11.3 Layout catalog

A small versioned catalog of text layouts (`card_layouts_v1`, proposed members in
`docs/card-system.md §2.3`, fixed by the Phase 3 bake-off). Each layout defines its text zones,
slot order, alignment, size range and maximum lines per slot, slot character limits, the
composition rule given to the art brief, and its legibility-panel shape. The model picks a layout
by ID; the host never sees the catalog. Changing the catalog is a layout-set version bump.

### 11.4 Art modes

`illustration` · `framed` · `atmosphere` · `minimal`. Every card has artwork; `minimal` is a border
or paper texture with typography leading. Mode/layout compatibility is validated.

### 11.5 Text slots, facts and wording

Wording slots (`title`, `invitationLine`) are drafted by the model and editable. Fact slots
(`babyName`, `hosts`, `date`, `time`, `venue`, `rsvpBy`) render from event data only. A slot with no
value takes no space. Placeholders appear only in Creation Mode and are never published.

### 11.6 Ink, legibility and fit

Ink per text zone comes from the artwork's palette, measured conservatively, reaching **4.5:1** for
every card text; otherwise the layout's art-derived legibility panel is applied. `layoutCard`
decides every size and line break deterministically; slot limits make fit always possible; the
browser never re-wraps card text. A test renders every layout × pairing with worst-case content
in a real browser; production never needs a browser to verify a card.

### 11.7 Typography

Curated pairings only (`src/lib/card/typography.ts`; fonts self-hosted). A design names one primary
pairing and up to two alternates; the host's font control offers exactly those.

### 11.8 The envelope

A house-designed envelope, the same for every event, never themed per event and never an imitation
of a competitor's envelope. It shows the event title, opens to reveal the card, stays sealed for a
private event reached by the shared link until the code is entered, opens directly from a personal
invitation link, and respects reduced motion.

### 11.9 The house-style event page

The page beneath the card — details, description, simple information blocks, RSVP, registry,
footer — uses one neutral house style for every event (`docs/design-system.md`). It never takes
colours or fonts from the card. Card styling and application chrome are separate systems.

### 11.10 Link previews

Shared links (including invitation texts) preview as the rendered card for a public event and as
the sealed envelope with the title for a private one, produced from the same card component and
layout function.

### 11.11 Imagery boundaries

- **Permitted:** generated card artwork under §7.6a; the native registry product thumbnail, which is
  product content and never retailer-hotlinked (§15.2).
- **Not permitted:** host-uploaded photos or images on the card or page, stock photography,
  retrieved web imagery, text inside artwork, imagery placed by anything other than the card
  layout.
- **Inspiration uploads are private model inputs** to Event Identity only; never shown to guests
  and never sent to the image model (§7.2, §27).

### 11.12 Quality gates

- unit tests: schema validation, wording fact check, distinctness check, ink resolution (including
  the panel path), `layoutCard`, slot limits;
- layout fixtures: every layout × pairing renders with no text outside its zone;
- creative evaluation: the corpus in `docs/model-evals/creative-understanding.json` against the real
  identity and card-design calls (`docs/model-contracts.md §6`);
- **Human Test #2**, on real generated cards from real prompts, in colour, is the launch quality
  gate. Its protocol and pass threshold are **frozen and recorded before results are reviewed**;
  the bar is never chosen or moved after the outcome is known.

---

## 12. Guest List and RSVP

### 12.1 Philosophy

MVP RSVP is **invite-only**. Supported host entry: manual guest-party entry and CSV import. A public
event may be viewable publicly, but every RSVP maps to an invited party.

Mobile phone is the strong default for party identity and communication, with a narrow escape hatch
so one relative without a usable phone does not break the event.

### 12.2 Guest data

```ts
GuestParty {
  id
  eventId
  displayName
  primaryContactName
  phone?                 // expected/default; may be absent only in needs-phone/no-phone flows
  email?                 // optional; used only as §13 allows
  noPhoneAvailable       // explicit collaborator override; default false
  contactConsentSource
  maxAdults
  maxChildren
  plusOneAllowed
  invitationStatus       // not_sent | sent | delivery_failed | opted_out
  rsvpStatus
  submittedAt?
  updatedAt
}

GuestPerson {
  id
  partyId
  name
  type                    // adult | child | plus_one
  attendanceStatus
  mealChoice?
  dietaryRestrictions?
  notes?
}
```

Derived contact state:

- **Ready:** `phone` exists.
- **Needs phone:** `phone` missing and `noPhoneAvailable == false`.
- **No phone available:** `phone` missing and `noPhoneAvailable == true`.

CSV import must **not reject the entire file** because individual rows lack a phone. Import valid
party data and flag missing-phone parties as **Needs phone**. Owner/co-host then adds a phone or
explicitly marks **No phone available**.

Manual party creation requires either a phone number or the explicit **No phone available**
acknowledgement before the party is considered ready.

Do not require phone-number uniqueness across parties; shared family numbers exist.

### 12.3 Household/party grouping

Support party invitations: a family as one party; two named adults plus children; a named guest
plus optional plus-one. RSVP UX makes it obvious who is included.

### 12.4 RSVP configuration

Owner/co-host configures: deadline; plus-one per party; adults/children per party; custom
questions; meal choices; dietary-restriction field; optional notes.

### 12.5 Guest identification

There are two ways a guest is identified.

**Personal invitation link.** Every party has one personal invitation link: a signed, unguessable
token scoped to this event and this party. It is what the platform texts (§7.18) and what the host
can copy for any party. Opening it:
- identifies the party and establishes the guest-party session (§12.6) with no name lookup and no
  SMS code;
- opens the envelope directly, skipping the private event code;
- is also the guest's way back to view or update their RSVP.

The host can rotate a party's link (for example if it was forwarded), which invalidates the old
one. A personal link never reveals any other party.

**Shared link (event URL/QR).** A guest who arrives by the shared link and wants to RSVP:

1. enters their name;
2. fuzzy match against invited party members; on collisions, ask for enough additional name detail
   to identify the intended party;
3. after a match, show only the minimum first names needed to recognize the party; never show
   phone/email;
4. if the matched party has a phone, **SMS OTP is required** before viewing/submitting that party's
   RSVP;
5. if the party is explicitly `noPhoneAvailable == true`, allow name-lookup-only RSVP as the
   accepted escape hatch;
6. if the party is **Needs phone**, do not expose the party RSVP on this path; show a neutral
   message directing the guest to contact the host (the host can fix the phone, mark the no-phone
   override, or send the party its personal link);
7. the guest submits attendance/questions.

**OTP abuse protection** is mandatory:

- cooldown/rate limit per `GuestParty` phone;
- rate limit per requester IP/device/session;
- event-level/global burst protection;
- expiring, one-time-use codes;
- verification-attempt cap.

Typing another guest's name must not allow an attacker to repeatedly text that guest's phone.

### 12.6 Lightweight guest-party session

A personal invitation link, successful OTP verification, or the no-phone fallback establishes a
lightweight guest session scoped to:

```text
eventId + partyId
```

Requirements:

- no guest account;
- secure/httpOnly cookie or equivalent signed session mechanism;
- signed/scoped so it cannot be changed into another event/party;
- reasonable expiration through the event window;
- no unnecessary PII in client-trusted form;
- reused by RSVP updates and registry click/purchase-intent logging.

### 12.7 Confirmation and updates

After submission show a confirmation in the house style:

> **You're all set. We can't wait to celebrate with you.**

If a phone is available and the party arrived by the shared link, text them their personal link so
they can return/update without repeating lookup + OTP. A guest can always repeat name lookup and
the appropriate verification/fallback path.

### 12.8 Owner/co-host RSVP management view

Show: total invited; invitation status (not sent / sent / delivery failed / opted out); attending;
declined; no response; adults/children/plus-ones; meal/dietary/custom-question responses; **Needs
phone** parties; **No phone available** parties.

Keep this operational, not analytical.

## 13. Guest Communication

### 13.1 Channels

- **Invitations go by text only** (SMS), to parties with a usable phone that have not opted out.
  Parties without one get their personal link from the host, sent however the host chooses.
- **Reminders and announcements:** SMS is primary when a usable phone is on file and the party has
  not opted out. Email may be used only when a party is explicitly `noPhoneAvailable`, or as
  fallback when an SMS **delivery attempt fails** and an email exists.
- **Do not fall back to email after the guest sends STOP or otherwise opts out.** An opt-out
  suppresses automated platform event messaging to that party across channels until they opt back
  in.
- Parties in **Needs phone** state receive no automated messaging until corrected/overridden.

### 13.2 Consent

Platform invitations and reminders reach guests who have not yet interacted with the platform, so
guest-confirmed consent cannot be the only precondition.

MVP consent model:

- **Host attestation:** before the platform sends any invitation, reminder or announcement for an
  event, owner/co-host confirms they have permission to contact these guests about this event.
- **STOP/opt-out handling:** honor opt-outs immediately, persist the status, show it to
  collaborators.
- **Caps:** a small per-party invitation cap (an initial invitation and a bounded number of
  resends) and a small per-event cap on host-initiated reminders/announcements, both configurable,
  so an event cannot become a spam campaign.
- Messages are transactional and event-specific only.
- A guest who completes RSVP may upgrade the record to `guest_confirmed` where useful; that never
  erases the need to honor a future opt-out.

### 13.3 Operational notes

- US A2P 10DLC registration/compliance may require lead time/business setup; start it before
  production messaging is needed. Invitation texts are part of the registered use case.
- Keep messages short, event-specific and link-light: an invitation is one line plus the personal
  link and opt-out language.
- International SMS remains out of scope unless trivial.
- Per-message cost is absorbed by the publish fee.
- Record delivery failures distinctly from opt-outs; only a delivery failure may trigger email
  fallback for reminders/announcements.

### 13.4 Invitations, reminders and announcements

- **Invitations:** after publish; to selected parties; one text with the party's personal link.
- **Reminders:** non-responders only. Example: `Reminder: please RSVP by December 1.`
- **Announcements:** invited guests by selected audience. Example: time changed, venue updated.
- Suppress opted-out parties. Keep these basic. No marketing automation.

## 14. Event Privacy and Access

### 14.1 Visibility

Public or private.

### 14.2 Private event gate

A private event requires a short human-shareable event code.

- **A guest arriving by the shared link** sees only the **sealed envelope with the event title**.
  Entering the code opens it. Nothing on the card or page is visible before then.
- **A guest arriving by their personal invitation link** skips the code: the link already proves
  they were invited (§12.5).

Private events carry `noindex`, and their link previews show only the sealed envelope (§11.10).

**Storage and verification**

- Store **one encrypted-at-rest event-code field** under an application-managed encryption key.
- Do not keep a separate hash + encrypted duplicate in MVP.
- Authorized owner/co-host share UI may decrypt/reveal the code.
- Guest verification decrypts the stored value server-side and compares in constant time.
- Never log plaintext event codes or send them to analytics.
- Rate-limit attempts by event + requester/IP/device, with broader abuse protection.
- Use a reasonably strong random human-shareable code, not a trivial 4-digit PIN.

The shared code is not high-security authentication; attempt throttling and the sealed envelope are
the primary controls.

### 14.3 Sharing

For a private event, the publish/share UI surfaces together: event URL; QR code pointing to the
URL only; event code. The QR code must **not** embed/bypass the event code. Personal invitation
links are surfaced per party in the guest workspace, never as one shareable bypass.

### 14.4 RSVP remains invite-only

`public` never means `anyone may RSVP`. Event visibility and RSVP eligibility are separate.

## 15. Registry Product Model

Three registry content types. No retailer synchronization.

### 15.1 External registry destination

Host/co-host adds a registry URL (Amazon, Babylist, Target, Pottery Barn Kids, etc.). The page
presents it as a destination card with an action like **Shop Amazon Registry**. Clicking leaves to
the retailer.

The retailer remains authoritative for item list, purchase status, quantities, returns, checkout
and registry benefits. The platform does not claim item-level synchronization and never
polls/scrapes external registries for state.

### 15.2 Native item

For gifts not adequately represented by an external registry — or any specific product the
owner/co-host wants surfaced directly — the collaborator pastes a product URL and the platform
creates a native gift card.

```ts
NativeRegistryItem {
  id
  eventId
  retailerName
  productUrl
  title
  productImageAssetId?   // normalized platform-owned thumbnail asset
  priceDisplay?
  requestedQuantity
  purchasedQuantity
  createdAt
  updatedAt
}
```

**Product-image rule.** A native-item thumbnail is product content, not event design. If no product
image is available, render a polished house-style placeholder. The item remains fully usable
without an image.

#### Add-time metadata and product-image fetch

When a product URL is pasted, the backend may make **one host-initiated safe fetch flow** to
prefill retailer/title/price-like display metadata and discover a candidate product image. The
collaborator reviews/edits the result. **Manual entry is a first-class path**, especially for
Amazon or any site that blocks server fetches.

Do **not** hotlink the retailer image on the guest page. If a candidate remote product image is
available:

1. fetch it through the same centralized SSRF-safe network layer;
2. validate that the response is an allowed raster image MIME type;
3. enforce a strict byte-size and dimension/pixel cap before/while decoding;
4. strip unneeded metadata;
5. resize/compress to a normalized thumbnail asset;
6. store the platform-owned copy in controlled object storage/CDN;
7. render only the platform-owned asset URL.

If the host manually enters an image URL, apply the **same safe fetch + normalization path**. There
is no direct host image upload for native items in MVP.

**SSRF/network safety requirements for all metadata/image URL fetches:**

- allow only `http` / `https`;
- reject credentials in URLs;
- reject localhost, loopback, private, link-local, multicast/special-use and cloud-metadata address
  ranges for IPv4/IPv6;
- resolve DNS and validate the destination before connecting;
- validate **every redirect** destination before following;
- small redirect cap (for example 3);
- short timeout (for example 5–8 seconds);
- strict HTML response-size cap for metadata (for example 1–2 MB);
- strict image-byte and decoded-pixel caps for thumbnails;
- never forward host cookies, retailer credentials, authorization headers or browser session data;
- never execute page JavaScript;
- parse only basic HTML/Open Graph metadata needed to prefill the form;
- treat every failure/block/bot page/non-HTML response as **manual-entry fallback**, not as a
  scraping problem to solve.

This is a single user-triggered convenience read at add time, not a retailer sync system.

The platform owns the honor-system purchase state for native items (§16).

### 15.3 Cash fund card

Display-only card: payment handle(s) (Venmo, Zelle, etc.), suggested amounts, short blurb. No
guest payment processing and no cash-gift tracking in MVP.

```ts
CashFund {
  id
  eventId
  title
  blurb
  handles[]              // { service, handle }
  suggestedAmounts[]
  visible
}
```

### 15.4 Do not over-explain tracking differences

No **Tracked by us / Tracked by Amazon** labels. Actions carry the meaning:

- external registry → **Shop Amazon Registry** / retailer-specific equivalent;
- native item → **Buy this gift**;
- cash fund → **Send a gift** / service-specific equivalent.

---

## 16. Native Item Honor-System Purchase Flow

Native gift tracking intentionally uses an honor system for MVP. There is no reservation hold,
expiration timer, public claim state, collision engine or retailer verification.

### 16.1 Public state

For quantity-one items, guest-facing state is `AVAILABLE → PURCHASED`. For quantity > 1,
availability is derived from `remaining = requestedQuantity - purchasedQuantity`. There is no
`reservedQuantity` in MVP.

### 16.2 Buy this gift

1. Guest taps **Buy this gift**.
2. Backend writes a private `GiftBuyClick` before redirect when possible.
3. If the guest has an active guest-party session (§12.6), associate the click with that
   `GuestParty`; otherwise keep only a device/session association where available.
4. Redirect to retailer.
5. **Do not change public availability merely because of the click.**

### 16.3 Self-confirmation on return

If the same guest returns and the app can identify the prior click through the guest-party session
and/or a lightweight device token, prompt:

> **Did you buy this gift?**
> `Yes, mark purchased` · `No`

- **Yes:** increment `purchasedQuantity` by the clicked quantity (bounded by host-controlled
  quantity rules), mark the click confirmed, update the public derived state.
- **No:** record the response; leave availability unchanged.
- **No return/no response:** no state change.

### 16.4 Private click log

```ts
GiftBuyClick {
  id
  eventId
  itemId
  partyId?
  deviceTokenHash?
  quantity
  clickedAt
  response?              // purchased | not_purchased | null
  confirmedPurchasedAt?
}
```

Purpose: instrumentation; associating a self-confirmation; minimal host context; future evidence.
Do not expose click intent publicly. Do not build a reservation UI around it.

### 16.5 Owner/co-host override

Owner/co-host can adjust requested quantity, adjust purchased quantity, mark available/purchased,
and correct mistakes. This manual override is the MVP integrity backstop.

### 16.6 Known limitations (accepted)

- Two guests can buy the same available item before either confirms.
- A guest can purchase and never return to confirm.
- A guest can buy directly from the retailer without using **Buy this gift**.
- External registry purchases are never tracked item-by-item.

Do not add reservation infrastructure to solve these unless real usage justifies it.

### 16.7 Purchaser identity

Never expose purchaser identity publicly. When a confirmation is associated with a verified
`GuestParty`, owner/co-host may see that party in admin; otherwise show host-confirmed/unknown.

## 17. Registry Guest Experience

The registry section is part of the house-style page. It contains external-registry destination
cards, native item cards with `Buy this gift` and Available/Purchased state, and the cash fund
card. Native product thumbnails use normalized platform assets or the house-style placeholder.

Do not imitate retailer branding beyond permitted names/logos. Do not expose internal click logs or
purchaser identity.

## 18. Event Details

Core content:

- event title;
- date;
- start/end time;
- venue;
- normalized address;
- hosts/parents;
- baby name (optional);
- description/welcome text.

The card shows title, invitation line, baby name and hosts when present, date, time, venue name
(else address) and RSVP-by. The page shows everything, including the full address and the
description.

Timezone is inferred and stored as infrastructure data; it is not a normal guest-facing field.

AI may infer a small number of optional informational blocks from the prompt. **Do not** create
separate FAQ, parking, dress-code, travel or itinerary feature modules. Host/co-host can edit, hide
and reorder simple content blocks. Keep this as content, not module expansion.

---

## 19. Creation Mode and Management Mode

### 19.1 Creation Mode — pre-publish default

Before publish, the primary workspace is the invitation itself: the active card and the page
beneath it.

Creation Mode provides:
- the production card and page;
- owner/co-host toolbar (`Design`, `Preview`);
- contextual `Edit` / `Set up` / `Add` controls on stable anchors — the card's wording, the card's
  details, and each page section (details, description, information blocks, RSVP, registry);
- placeholders, marked as needing confirmation, for required facts not yet supplied;
- floating readiness/setup control;
- focused sheets/panels for structured editing;
- dedicated Guest workspace when needed.

Do **not** route the card reveal into a generic setup dashboard.

### 19.2 Readiness checklist

The setup sheet is navigation, not a wizard.

**Needed to publish** — derives only from §23.1 blockers.

**Recommended before sharing** — Guests; Registry; Co-host; other useful optional work.

An event can display `Ready to publish` while recommended items remain unfinished.

### 19.3 Management Mode — operational home

After publish, an operational Event Home becomes useful.

Priority:
1. RSVP summary;
2. guest responses / awaiting / Needs phone / invitations not sent;
3. Guests;
4. Messages (invitations, reminders, announcements);
5. Registry;
6. Sharing (link, QR, code);
7. Edit invitation.

Owner additionally sees billing/co-host management/delete controls as permitted. Keep this
operational rather than analytical. No vanity analytics.

## 20. Design Editing

### 20.1 Direct design editing

Owner/co-host may directly:
- edit the card's title and invitation line;
- swap the card's font among the active design's primary and alternate pairings;
- reset the card's wording and font to the design.

Facts are edited as event details and appear on the card and page automatically. Content
operations on the page (description, information blocks, their order and visibility) are separate
from the card.

### 20.2 Card edits live on the event

Host card edits are event data, conceptually:

```ts
Event.title                         // when the host supplied or edited the title
Event.cardEdits? {
  invitationLine?
  typographyPairing?                // must be the active design's primary or an alternate
}
```

The effective card title is `Event.title` when present, else the active design's drafted title.
These edits never mutate a `CardDesign`, its artwork or its ink. Every edit re-runs `layoutCard`
with no model call.

### 20.3 Choosing another design

Before publish, choosing another generated design:
- switches `activeCardDesignId`;
- resets `Event.cardEdits` to the new design's wording and typography;
- keeps `Event.title` if the host supplied or edited it (it is content);
- never changes event details, guests, RSVP, registry, privacy or messaging data.

### 20.4 No treatment-level editing

Do not expose: layouts; colours, palettes, ink or panels; art modes; artwork editing, cropping,
positioning or regeneration of parts; font sizes; text positions; envelope styling; page styling.
These are design- or system-owned.

### 20.5 No persistent AI copilot

AI reimagination exists only at design granularity through `Try another direction`. No persistent
chat assistant, token-level AI edit, or "make the bear bigger" flow.

## 21. Guest Experience Structure

```text
Envelope (sealed until the code for a private event reached by the shared link)
  ↓ opens
Invitation card
  ↓ scroll
Event details (title, hosts, date, time, venue, address)
Description and simple information blocks
RSVP
Registry (external · native · cash fund)
Footer ("Made with …")
```

Single-scroll and mobile-first. The page beneath the card is the house style for every event. Avoid
page fragmentation; optional information blocks stay within the scroll.

---

## 22. Mobile-First and Responsive Requirements

Design from approximately **390px outward**; desktop is a first-class responsive layout.

**Owner/co-host from phone:** prompt; auth/save; inspiration; details during generation; card
reveal; try another direction; Creation Mode editing; readiness checklist; guests/CSV where
browser/OS permits; RSVP; registry; invitations and messages; privacy; preview; publish; share;
post-publish management.

**Guest from phone:** envelope and private gate; card; event details; personal-link RSVP; name
lookup; OTP; RSVP/update; registry; purchase return confirmation.

**Desktop**
- the card is the same design at a comfortable size; it never reflows;
- the house-style page and Creation Mode use real desktop layouts, not a 390px phone canvas;
- contextual editors may become side panels;
- guest management may use tables/detail panes;
- Preview offers a Mobile/Desktop width toggle and defaults to Mobile.

No critical product capability is desktop-only.

## 23. Event Lifecycle

```text
DRAFT → DESIGN_SELECTED → READY_TO_PUBLISH → PUBLISHED → PASSED
ARCHIVED (internal, optional)
```

- **DRAFT:** private event draft; identity, designs and trying other directions allowed.
- **DESIGN_SELECTED:** `activeCardDesignId` points to a design with validated artwork and resolved
  ink.
- **READY_TO_PUBLISH:** deterministic requirements below are valid; payment may remain unsatisfied.
- **PUBLISHED:** live; operations, content, wording and font edits continue; generation and design
  switching disabled; invitations may be sent.
- **PASSED:** event time has passed in the stored IANA timezone; show thank-you state; registry
  remains accessible.

### 23.1 Minimum READY_TO_PUBLISH requirements

Minimum:
- an active card design with validated artwork and resolved ink;
- an effective event title (§20.2);
- event date;
- start time;
- venue/location display value;
- valid stored IANA timezone;
- RSVP deadline;
- visibility;
- encrypted access code when private;
- valid event owner/account.

Not required: guest rows; invitations sent; registry; cash fund; co-host; inspiration;
announcements; completed RSVP responses.

Payment is separate:

```text
READY_TO_PUBLISH + payment satisfied → may PUBLISH
```

The Creation Mode readiness UI reflects exactly this distinction. Optional work never masquerades
as a publish blocker. There is no cancellation workflow in MVP.

## 24. Domain Model

Conceptual baseline, not an exact database schema. The current database still carries the
Revision 6 website tables (`design_concepts`, `resolved_design_specs`, `events.active_concept_id`,
`events.design_overrides`, the website columns of `generation_runs`, and `human_test_1_responses`);
the card-data phase replaces them in one forward-only migration (`docs/development-plan.md`).

```ts
User {
  id, email, name, createdAt, updatedAt
}

Event {
  id, ownerId,
  type /* baby_shower */,
  prompt,

  title?, description?,
  date, startTime, endTime?,
  timezone,
  venueName, address,
  hosts?, babyName?,

  visibility /* public | private */,
  accessCodeEncrypted?,

  rsvpDeadline, rsvpDeadlineEdited,
  status,
  slug,

  activeCardDesignId?,
  cardEdits? { invitationLine?, typographyPairing? },

  invitationAttestedAt?,
  messageSendsUsed,
  publishedAt?, paidAt?,
  createdAt, updatedAt
}

EventMember {
  eventId, userId,
  role /* owner | cohost */,
  createdAt
}

PreAuthEventDraft {
  id, draftTokenHash, prompt, inspirationAssetIds[], expiresAt, createdAt
}

InspirationAsset {
  id, eventId?, preAuthDraftId?, storageKey, mimeType, sizeBytes, expiresAt?, createdAt
}

EventIdentity {
  eventId, revision,
  creativeDirection, toneKeywords[],
  colorsExplicitlyConstrained, paletteIntent,
  tonalIntent, toneExplicitlyConstrained,
  compatibleTypographyCategories[],
  visualMotifs[], textureDirection, typographyDirection, copyTone,
  designConstraints[], inspirationSummary,
  promptVersion, schemaVersion,
  createdAt
}

CardDesign {
  id, eventId,
  round,
  name, description,             // presentation, or deterministic fallback
  layout, artMode,
  typography /* { primary, alternates[] } */,
  wording /* { title, invitationLine } — after the fact check */,
  artBrief,
  raw,                           // the model response as returned
  artAssetId,
  ink /* per zone: { ink, panel?, panelColor? } */,
  standardWordingSlots[],
  versions /* designPrompt, designSchema, layoutSet, compiler, artPrompt, imageModel */,
  selectedAt?,
  createdAt
}

CardArtAsset {
  id, eventId, cardDesignId,
  storageKey, mimeType, width, height, sizeBytes,
  imageModel, artPromptVersion,
  createdAt
}

EventSection {
  id, eventId,
  type /* event_details | description | simple_info | rsvp | registry */,
  position, visible, content
}

GuestParty {
  id, eventId, displayName, primaryContactName,
  phone?, email?, noPhoneAvailable,
  contactConsentSource,
  maxAdults, maxChildren, plusOneAllowed,
  invitationStatus, invitationsSent,
  rsvpStatus, submittedAt?, updatedAt
}

PartyInviteLink {
  id, eventId, partyId,
  tokenHash,
  createdAt, revokedAt?
}

GuestPerson {
  id, partyId, name, type,
  attendanceStatus, mealChoice?, dietaryRestrictions?, notes?
}

GuestPartySession? {
  id?, eventId, partyId, tokenHash?, expiresAt, createdAt?, updatedAt?
}

ExternalRegistry {
  id, eventId, retailerName, registryUrl, displayName, position, visible, createdAt
}

NativeRegistryItem {
  id, eventId, retailerName, productUrl,
  title, productImageAssetId?, priceDisplay?,
  requestedQuantity, purchasedQuantity,
  createdAt, updatedAt
}

ProductImageAsset {
  id, eventId, itemId, storageKey, mimeType, width?, height?, sizeBytes?, createdAt
}

GiftBuyClick {
  id, eventId, itemId, partyId?, deviceTokenHash?, quantity,
  clickedAt, response? /* purchased | not_purchased | null */, confirmedPurchasedAt?
}

CashFund {
  id, eventId, title, blurb, handles[], suggestedAmounts[], visible
}

Message {
  id, eventId,
  kind /* invitation | reminder | announcement */,
  channel /* sms | email */,
  subject?, body, audience,
  sentAt, createdBy
}

GenerationRun {
  id, eventId, userId,
  provider, providerRequestId?,
  operation /* event_identity | card_design | card_art | structured_extraction | … */,
  round?,
  model,
  inputTokens?, cachedInputTokens?, outputTokens?, reasoningTokens?, imageUnits?,
  costEstimateUsd?,
  latencyMs,
  success,
  promptVersion, schemaVersion?, layoutSetVersion?, compilerVersion?,
  schemaValidFirstCall?, reprompts?, artRegenerated?, standardWordingSlots?, inkPanels?,
  createdAt
}
```

The layout catalog, art modes, typography pairings and compiler rules are versioned application
code/config, not database tables.

### Generated-data immutability

`EventIdentity` revisions, `CardDesign` records, artwork assets and resolved ink are immutable.
Host edits live on `Event`. Renderer source code may still receive bug, accessibility and
responsive fixes.

### Effective render state

The card renders from the active `CardDesign`, its artwork and ink, `Event.cardEdits`, the
effective title and the event's current facts, through `layoutCard`. The page renders from event
content in the house style. Guest visibility of RSVP and registry follows operational state:
registry is shown once it has an external registry, native gift or cash fund; RSVP once it is
configured and at least one party is invited.

## 25. Permissions Matrix

| Capability | Owner | Co-host | Guest |
| --- | ---: | ---: | ---: |
| View event | Yes | Yes | Yes |
| Edit event details/content and card wording | Yes | Yes | No |
| Swap card font | Yes | Yes | No |
| Manage privacy/access code | Yes | Yes | No |
| Manage guests / import CSV | Yes | Yes | No |
| Copy/rotate a party's personal link | Yes | Yes | No |
| Send invitations | Yes | Yes | No |
| Manage RSVP questions | Yes | Yes | No |
| View/manage RSVP responses | Yes | Yes | Own party only |
| Manage external registries/native items/cash fund | Yes | Yes | No |
| Manage native item purchase state | Yes | Yes | No |
| Send reminders/announcements | Yes | Yes | No |
| Add private inspiration / enter feedback | Yes | Yes | No |
| Try another direction before publish | Yes | Yes | No |
| Browse/choose designs before publish | Yes | Yes | No |
| Preview | Yes | Yes | Public/authorized view |
| Publish after payment is satisfied | Yes | Yes | No |
| Initiate/manage billing/payment | Yes | No | No |
| Manage co-host access | Yes | No | No |
| Delete/archive event | Yes | No | No |
| Transfer ownership | Not in MVP | Not in MVP | No |

Owner/co-host generation consumes the same event-level limits. After publish, generation and design
switching are disabled for both.

---

## 26. Important UX Rules

- Landing page is the prompt.
- Prompt/auth state survives OAuth exactly.
- No generation before authentication.
- **Never expose implementation complexity:** Event Identity, CardDesign, layouts, art modes, art
  briefs, ink resolution, provider/model names, backend limits.
- AI should remove decisions, not create more decisions.
- Show the card, then make that same invitation editable.
- Do not send a newly activated host to a generic setup dashboard.
- Creation Mode uses contextual editing on the invitation.
- Setup progress distinguishes publish blockers from optional recommended work.
- `Try another direction` is available from the reveal and Creation Mode before publish.
- Trying another direction changes design only; event details and data remain untouched.
- Generated designs are immutable; renderer code may be fixed.
- Inspiration images are never shown to guests and never sent to the image model.
- Guests never need accounts.
- No generation counters/credits during alpha/beta.
- No public gift-reservation language/state.
- Preserve mobile-first usability; use real desktop layouts on desktop.
- Do not expose layout, colour, art or size controls to hosts.

## 27. Safety / Integrity / Privacy

- Never expose purchaser identity publicly.
- **Private event code:** one encrypted-at-rest representation only; server-side reveal and
  validation; constant-time comparison; never logged or sent to analytics; attempts rate-limited.
- **Personal invitation links:** signed, unguessable, scoped to event + party, revocable by
  rotation; never reveal another party; never placed in analytics or logs in plaintext.
- Never expose guest lists publicly; after name lookup show only the minimum names required to
  identify a party.
- On the shared-link path, require SMS OTP before RSVP access when a phone exists; allow the
  explicit `noPhoneAvailable` name-lookup-only exception.
- Rate-limit OTP sending **per party/phone** as well as per requester/IP/device and event/global
  burst.
- A **Needs phone** party cannot RSVP through the shared-link path until fixed, overridden or sent
  its personal link.
- Limit guests to their own party's information.
- Guest-party sessions are signed/scoped to event + party, expire reasonably, and carry no
  unnecessary client-trusted PII.
- Co-host access is explicit and invitation-based.
- SMS uses the attestation/opt-out/cap model in §13. A STOP/opt-out is never circumvented by
  switching the same party to email.
- Generated artwork never contains text, logos, brand characters or watermarks; named references
  are translated into original language.
- No retailer scraping, bot evasion, proxy workarounds or credential collection.
- Product metadata and remote product-image fetches use the centralized SSRF-safe utility (§15.2).
- Never render arbitrary retailer image URLs to guests; render only normalized platform-owned
  thumbnails or the house-style placeholder.
- Never collect retailer credentials. External checkout stays on retailer sites.
- Do not represent honor-system native purchases as retailer-verified.
- Inspiration uploads are private AI inputs, stored privately with strict limits and short raw-file
  retention; never rendered for guests and never sent to the image model.
- Private events are `noindex` and preview only as the sealed envelope.
- Use signed, scoped, expiring OTP/session tokens; do not put sensitive guest data in
  client-trusted tokens.

## 28. Payment

- Free to create, generate, try other directions and preview within backend safety limits.
- **$49 one-time to publish** — a hypothesis, to be re-checked against invitation products (§3.2).
- Initial implementation: mock/stub the gate; display the real price; allow internal/test users to
  simulate success; record `paidAt`.
- **Owner** initiates/manages payment. Once payment is satisfied, owner or co-host may publish.
- No refunds, transfers, subscriptions or pricing tiers in MVP.
- Do not spend MVP effort on billing architecture beyond the stub.

---

## 29. Analytics (Instrumentation, Not Dashboards)

Suggested MVP instrumentation:

```text
landing_prompt_started
preauth_inspiration_uploaded
create_event_clicked
auth_started
auth_completed
preauth_draft_restored
preauth_draft_restore_failed

event_creation_started
initial_prompt_submitted
inspiration_uploaded
facts_extracted { fieldsFound }
clarification_asked { count }
clarification_answered { youDecide }
venue_timezone_inferred
identity_generated

card_design_generated { round, layout, artMode, schemaValidFirstCall, reprompts, standardWordingSlots }
card_art_generated { round, imageModel, regenerated, latencyMs }
card_compiled { round, inkPanels, compilerVersion }
card_revealed { round, totalLatencyMs }
make_it_yours_clicked
try_another_direction_started { round, feedbackGiven }
design_chosen { round, previousRound }
kept_current_design
generation_limit_hit
generation_failed { stage }

card_wording_edited { slot }
card_font_swapped
creation_context_edit_opened { anchor, action }
setup_checklist_opened
publish_readiness_changed
guest_workspace_opened

preview_opened { width: mobile | desktop }

publish_readiness_failed
publish_gate_opened
publish_gate_continued
event_published

guest_added
csv_import_completed
guest_no_phone_override_set
invitations_sent { parties }
invitation_delivery_failed
personal_link_copied
personal_link_rotated

envelope_opened { via: personal_link | shared_link }
private_code_attempted
rsvp_lookup_started
rsvp_lookup_collision
rsvp_otp_requested
rsvp_otp_throttled
rsvp_sms_verified
guest_party_session_created { via: personal_link | otp | no_phone }
rsvp_completed
rsvp_updated

external_registry_added
external_registry_clicked
native_item_added
native_product_image_fetch
native_item_buy_clicked
native_item_purchase_confirmed
native_item_purchase_declined
native_item_host_override
cash_fund_added

message_sent
message_delivery_failed
message_opt_out
```

Every metered model call also writes a `GenerationRun`. Wording fallbacks, art regenerations and
legibility panels are recorded on the generation and never silently discarded.

## 30. MVP Success Criteria

A non-technical owner/co-host can:

1. understand the product immediately from the landing composer;
2. describe the shower before creating an account;
3. authenticate without losing prompt or inspiration;
4. optionally fill in details while the card is designed, never required to see it;
5. receive a persisted Event Identity;
6. see a card that feels like it read their mind, revealed from its envelope;
7. try another direction and get a genuinely different card without starting over;
8. make the invitation theirs by editing wording and details in place;
9. complete required setup without a wizard;
10. understand which items block publish and which are only recommended;
11. manage guests in a dedicated workspace;
12. preview the exact guest experience at mobile and desktop widths;
13. manage guests/RSVP/registry/messages from a phone;
14. publish through the mocked/real-shaped $49 gate;
15. text invitations with personal links, or share the URL/QR/code;
16. operate the event after publish.

Guests can open the envelope, RSVP without an account (by personal link or lookup + code), update
their RSVP, and browse the registry, in a coherent house-style experience across access, forms,
errors, confirmation, registry and passed state.

The creative system succeeds when:

17. Event Identity understands vague and taste-heavy prompts (`docs/model-contracts.md §6`);
18. no card ever states a fact the host did not supply;
19. no artwork contains text, logos or brand characters;
20. every card text clears 4.5:1 and fits its zone at every size;
21. `Try another direction` yields a different idea, not a palette or font swap;
22. historical designs never change because prompts, layouts, the compiler or the image model
    evolve;
23. Human Test #2 passes its frozen threshold on real generated cards.

The host should feel:

> **I described what I wanted and it read my mind.**

## 31. Acceptance Criteria

### Prompt, auth, and generation
- [ ] Landing page contains the primary event composer.
- [ ] User may write prompt/add inspiration before authentication.
- [ ] No strong-model or image-model generation begins before auth succeeds.
- [ ] Prompt and successful inspiration uploads restore exactly after OAuth/email auth.
- [ ] Abandoned pre-auth draft/assets expire and remain private.
- [ ] Missing details are offered only when missing, while generation runs, and never block the card
  from appearing.
- [ ] Venue-text timezone inference + validation + browser fallback works.
- [ ] Adaptive creative clarification asks nothing in the common case, at most three questions
  ever, never a logistics field, and never waits on a logistics field (§7.6b).
- [ ] Every clarification offered is one whose answers would produce materially different creative
  identities, and every one offers a `You decide` option.
- [ ] The card is revealed as soon as its artwork and ink resolution exist (§7.10).
- [ ] The generation surface shows only artifacts the pipeline produced — no model reasoning, no
  fabricated progress or completion percentages (§7.10).

### Event Identity and card direction
- [ ] Event Identity persists tone/colour constraints, negative constraints and compatible
  typography-category guidance.
- [ ] Event Identity is the only stage that receives the raw host prompt; the card-design call reads
  the persisted identity and the image model reads only the art brief and layout rule (§7.5,
  §7.6a).
- [ ] Supplied event facts are extracted exactly onto the draft for confirmation, none is invented,
  and Event Identity carries no operational field (§7.5).
- [ ] Named aesthetic references become original visual language; no logo, proprietary character or
  campaign artwork appears in the identity, the art brief or the artwork (§7.6).
- [ ] Each round generates exactly one design.
- [ ] `Try another direction` passes the host's optional feedback and a summary of every earlier
  direction; an exact repeat (layout, art mode and primary pairing) earns one re-prompt and is
  recorded (§7.7).
- [ ] Explicit tone and colour constraints are respected by every design.

### Card design, artwork and compiler
- [ ] The card-design response validates against the strict schema; unknown keys, IDs outside the
  layout, art-mode or pairing catalogs, and out-of-bounds strings are rejected; a schema failure is
  re-prompted once, then shown as a visible failure with retry.
- [ ] Layout/art-mode compatibility is validated and alternates differ from the primary pairing.
- [ ] Wording never contains a date, time, place or dress code, and uses names only exactly as the
  host supplied them; a failing slot is re-prompted once, then replaced by standard wording that is
  logged and editable.
- [ ] A host-supplied title is used verbatim.
- [ ] The art prompt is assembled by code from the art brief, the layout's composition rule and the
  global rules; it never contains the raw prompt.
- [ ] Artwork is 5:7, decodable, at minimum resolution, contains no embedded text, and passes
  content safety; a failure is regenerated once, then shown as a visible failure with retry; no
  template or stock fallback exists.
- [ ] Every card text clears 4.5:1 against the conservatively measured background of its zone;
  otherwise the layout's art-derived legibility panel is applied and the ink re-chosen against it.
- [ ] `layoutCard` decides every slot's size and line breaks; no text leaves its zone; no word is
  broken; text is never silently truncated; slot limits are enforced at entry.
- [ ] No legibility, fit, compatibility or wording-fallback step calls a model.
- [ ] `CardDesign` (raw and validated), artwork, resolved ink and the version set persist per design
  and are never mutated.
- [ ] Host wording edits, font swaps and fact edits never mutate a design and never call a model.
- [ ] Routine rendering never regenerates or recompiles a historical design.

### Card experience
- [ ] The card is revealed from the same envelope guests see, with its name and description,
  `Make it yours` and `Try another direction`.
- [ ] The first design becomes active; later designs become active only when chosen.
- [ ] Every design generated for the event is browsable before publish.
- [ ] Choosing a design changes design only, never event details or data.
- [ ] `Make it yours` turns the same invitation into Creation Mode rather than navigating to a
  dashboard.

### Creation Mode
- [ ] The card and every page section expose stable collaborator-action anchors.
- [ ] Contextual Edit/Set up/Add controls are app-styled and absent for guests.
- [ ] Card wording is editable in place; missing required facts show as placeholders marked as
  needing confirmation and are never published.
- [ ] Routine edits autosave.
- [ ] Guest workspace returns to prior Creation Mode context.
- [ ] Setup checklist separates publish blockers from recommended work.
- [ ] `Ready to publish` can appear even if guests/registry/invitations are incomplete.
- [ ] Design controls expose only the design's font pairings, reset, `Try another direction` and the
  designs list.

### Try another direction
- [ ] Available from the reveal and Creation Mode before publish.
- [ ] Feedback and new inspiration are optional.
- [ ] UI explicitly reassures that event details remain untouched.
- [ ] The current design remains active while a new one is revealed.
- [ ] The user can choose the new one, keep the current one, or try again.
- [ ] No user-facing credits/counters.
- [ ] Generation and design switching are disabled after publish.

### Card rendering and envelope
- [ ] One card component renders the card everywhere: reveal, Creation Mode, Preview, guest page and
  link previews.
- [ ] The card is identical in proportion, line breaks and layout at 390px and 1280px.
- [ ] Every layout × pairing renders worst-case content in a real browser with no text outside its
  zone (test-time fixture).
- [ ] Card text is live, selectable and screen-reader readable; artwork is decorative.
- [ ] The envelope opens to the card; reduced motion shows the card without the animation.
- [ ] A private event reached by the shared link shows only the sealed envelope with the title until
  the code is entered; a personal link opens it directly.
- [ ] Link previews show the card for a public event and the sealed envelope for a private one.
- [ ] The page beneath the card uses the house style for every event and takes no styling from the
  card.

### RSVP
- [ ] Manual add requires phone or explicit no-phone acknowledgement.
- [ ] CSV with missing phone rows imports and flags Needs phone.
- [ ] Every party has a personal invitation link that identifies it without OTP, skips the private
  code, and can be rotated by the host.
- [ ] Shared-link guest lookup does not expose contact info.
- [ ] On the shared-link path, a phone-backed party requires OTP.
- [ ] OTP throttling includes party/phone and requester/event limits.
- [ ] No-phone override path works.
- [ ] A Needs-phone party cannot RSVP through the shared-link path.
- [ ] Guest-party session scopes event + party.
- [ ] RSVP confirmation and personal-link update path work.
- [ ] RSVP remains invite-only.

### Registry
- [ ] External registry is destination-only; no item sync claim.
- [ ] Native item safe metadata/image attempt + manual fallback.
- [ ] Product images normalized/stored, no retailer hotlinks.
- [ ] Placeholder uses the house style.
- [ ] Buy click does not reserve/change public availability.
- [ ] Optional return confirmation can mark purchased.
- [ ] Host/co-host may correct purchase quantity/state.
- [ ] Purchaser identity is never public.
- [ ] Cash fund processes no payment.

### Invitations, messaging and privacy
- [ ] Invitations can be sent only after publish and only after host attestation.
- [ ] Each invitation is one text carrying that party's personal link; parties without a usable phone
  are listed with a copyable link instead.
- [ ] Invitations go by text only; per-party invitation caps hold.
- [ ] Invitation status (not sent / sent / delivery failed / opted out) is visible per party.
- [ ] STOP/opt-out honored across invitations, reminders and announcements.
- [ ] No email bypass after opt-out.
- [ ] Private code stored encrypted once.
- [ ] Private code attempts rate-limited.
- [ ] Nothing on the card or page is visible before the code on the shared-link path.
- [ ] QR does not bypass code.

### Roles/publishing
- [ ] Co-host has near-parity event permissions.
- [ ] Owner-only billing/co-host management/delete.
- [ ] Co-host may publish after payment satisfied.
- [ ] READY_TO_PUBLISH uses exactly §23.1.
- [ ] Guests/registry/invitations/co-host/inspiration are not publish prerequisites.
- [ ] Publish gate displays $49 one-time.
- [ ] Post-publish allowed operations work; generation and design switching do not.

### Responsive/accessibility
- [ ] Complete owner/co-host and guest flows work around 390px.
- [ ] Desktop is real responsive desktop, not phone-frame UI.
- [ ] Preview on larger screens has Mobile/Desktop width toggle.
- [ ] App chrome is light-only MVP.
- [ ] App, card and guest page meet WCAG 2.2 AA targets described in the design docs.

## 32. Implementation Guardrails for Coding Agents

1. Revision 7 and its companion docs are authoritative. The Revision 6 website architecture is
   retired; do not rebuild any part of it.
2. Do not add features because they are conventional for event apps.
3. Landing page is the prompt; do not reinsert signup before the user can describe the event.
4. Do not begin strong-model or image-model generation for anonymous users.
5. Preserve prompt/inspiration through auth exactly.
6. Do not add a template, layout or artwork gallery.
7. Do not send the card reveal to a generic pre-publish dashboard.
8. Creation Mode is the invitation itself with contextual collaborator controls.
9. Do not turn readiness into a wizard. Adaptive creative clarification (§7.6b) is the one
   permitted pre-design question: taste only, never logistics, at most three.
10. Do not count optional Guests/Registry/invitations as publish blockers.
11. Do not build token/chat-level AI editing.
12. The models return exactly: an `EventIdentity`; a `CardDesign` (layout ID, art mode, pairing IDs,
    bounded wording, art brief, presentation); and artwork. Nothing else.
13. No model emits HTML, CSS, JavaScript, SVG, text colours, sizes, positions or line breaks.
14. The model owns interpretation, the creative direction, the layout and art-mode choice, the
    pairing choice, the wording and the art brief. Code owns facts, text placement, fit, ink,
    contrast, panels, the envelope, the page, RSVP/registry semantics and business logic.
15. Facts come only from host-supplied or host-confirmed event data. Never invent them, never let
    wording state them, never infer them.
16. Artwork contains no text. Never ask the image model to render words, and reject artwork that
    contains them.
17. The raw host prompt never reaches the image model, and inspiration images are never sent to it.
18. Named references become original language; no logos, proprietary characters or campaign
    artwork in a brief or an image.
19. Validate every card-design response against the strict schema and catalogs, whatever the
    provider claims to enforce.
20. Re-prompt only for a schema-invalid design, a wording fact-check failure or an exact repeat of
    an earlier direction, once each; regenerate artwork once only for failed validation. Never call
    a model for legibility, fit or compatibility.
21. No library, template or stock fallback. A failed generation is shown honestly with a retry.
22. Choose ink and panels deterministically; every card text clears 4.5:1 against a conservatively
    measured background.
23. `layoutCard` is the only thing that sizes or breaks card text; the renderer never lets the
    browser re-wrap card text; never truncate silently; enforce slot limits at entry.
24. Adding or changing a layout, art mode or slot limit is a layout-set version bump and re-runs
    the layout fixtures.
25. Persist Event Identity, every `CardDesign` (raw and validated), artwork, resolved ink and the
    version set; never mutate them; host edits live on the event.
26. Render the card only through the one card component, from persisted design data and current
    event content.
27. Never regenerate, recompile or "upgrade" a historical design; renderer bug, accessibility and
    responsive fixes are allowed.
28. Typography uses curated pairing IDs only; the host's font control offers exactly the design's
    primary and alternates.
29. The page beneath the card is one house style for every event. Card styling never leaks into app
    chrome or the page, and app chrome never leaks into the card.
30. Each round generates one design and one artwork; never generate in bulk to pick from.
31. No host-uploaded, stock or retrieved imagery on the card or page; the native product thumbnail
    is the only content-image exception.
32. Native product thumbnail is content; never hotlink a retailer image.
33. Do not add retailer scraping/sync/proxies/anti-bot workarounds.
34. Do not require guest accounts.
35. Missing-phone CSV rows import as Needs phone.
36. Rare no-phone RSVP requires explicit collaborator override.
37. Personal invitation links are signed, scoped to event + party, rotatable, and never reveal
    another party.
38. Do not build gift reservations/timers/public claim state.
39. Do not bypass STOP with email. Invitations go by text only.
40. Platform invitations only after publish, only after host attestation, only to parties with a
    usable phone that have not opted out, within per-party caps.
41. Do not add maps/geocoding solely for timezone.
42. Do not expose backend generation/spend counters.
43. Do not add cancel/unpublish/refund/ownership-transfer workflows.
44. Co-host remains near-parity except billing/access-management/deletion ownership controls.
45. Implement READY_TO_PUBLISH exactly from §23.1.
46. Measure latency; do not hide unbounded waits.
47. Make the smallest implementation that satisfies the product.

If a decision conflicts with this principle, stop:

> **AI should remove decisions, not create more decisions.**

## 33. Deferred Product Opportunities

Intentionally deferred; may become roadmap items:

- email invitations;
- envelopes addressed to each party, envelope liners or themed envelopes;
- a card back, downloadable/printable card, matching print assets;
- host photos on the card or page;
- a themed event page that takes styling from the card;
- broader event types; custom domains;
- native gift reservation/hold behavior if real duplicate-purchase data justifies it;
- SMS purchase nudges, richer click-log workflows;
- photo galleries and post-event thank-you workflows;
- deeper registry integrations, retailer partnerships, supported auto-sync;
- group gifting, guest payments;
- pricing tiers, advanced generation limits/credits, concierge design tier;
- WhatsApp/international SMS;
- event planning/operations beyond details, RSVP and registry.

---

## 34. Known Limitations (Accepted for MVP)

- A forwarded personal invitation link lets its holder view the event and RSVP for that party; the
  host can rotate the link.
- Invitations go by text only; guests without a usable phone receive their link however the host
  sends it.
- Native gift tracking is honor-system and can still duplicate.
- External registries are not item-synchronized.
- The rare no-phone RSVP path is intentionally weaker than OTP.
- Missing-phone imported parties cannot RSVP through the shared link until fixed, overridden or
  sent their personal link.
- Name lookup reveals minimal party-name existence to someone who can guess.
- SMS can fail; STOP is not bypassed through email.
- Generated artwork can miss the brief; `Try another direction` is the remedy, not an image editor.
- Image-generation latency and cost vary and must be measured.
- Native product thumbnail may be unavailable and must fall back gracefully.
- Inspiration links may fail; uploaded screenshots are the reliable visual input.
- Raw inspiration requires temporary private storage.
- Amazon/native metadata may require manual entry.
- Venue-text timezone inference may fall back to browser timezone.
- Private event code is a convenience/privacy gate, not high-security auth.
- No refunds/cancellation/ownership transfer.
- Renderer bug fixes may alter pixels on existing cards while preserving their immutable design
  data.

## 35. Canonical MVP Flow

```text
LANDING = PROMPT
    ↓
Describe event (+ optional private inspiration)
    ↓
Create my invitation
    ↓
Persist pre-auth draft → AUTH / SAVE (prompt + inspiration restored exactly)
    ↓
Generation begins
    ├── Event Identity (+ optional taste clarification, usually none)
    ├── fact extraction → draft details for the host to confirm
    └── optional detail entry while waiting
    ↓
Card design (layout, art mode, font pairing, wording, art brief)
    ↓
Card artwork (image model; brief + layout rule only; no text)
    ↓
Deterministic compiler: validate · wording fact check · artwork checks · ink 4.5:1 · persist
    ↓
CARD REVEAL — out of its envelope
"Your invitation looks great. Let's make it real."
    ├── Make it yours
    └── Try another direction (optional feedback → one new, different card)
    ↓
CREATION MODE — the invitation is the workspace
    ├── card wording (edit in place) · font (curated)
    ├── details · description · info blocks
    ├── RSVP setup · Registry add/setup
    ├── Guests → focused workspace
    ├── Preview (envelope included; mobile default, desktop toggle)
    └── readiness pill: Needed to publish / Recommended before sharing
    ↓
READY_TO_PUBLISH → $49 one-time gate → owner pays → owner/co-host publishes
    ↓
SHARE
    ├── Send invitations by text (personal links; attestation; caps)
    ├── copy a party's personal link
    └── event URL + QR (+ separate code if private)
    ↓
GUEST
    ├── personal link → envelope opens → card → page → RSVP (party already identified)
    └── shared link → (private? sealed envelope → code) → card → page
                       → name lookup → OTP / no-phone fallback / Needs phone → RSVP
    ↓
Confirmation → personal link for updates
    ↓
Registry: external destination · native gift (private click → retailer → optional confirmation)
          · cash fund (display only)
    ↓
POST-PUBLISH MANAGEMENT
RSVPs · Guests · Messages · Registry · Share · Edit invitation
    ↓
Event passes → thank-you state; registry remains accessible
```

## 36. North Star

The product is successful when someone with **zero design skill** can describe the event they are
imagining and, in under a minute, open an invitation so specific to them that they want to send it
to everyone — and then run the event's RSVPs and registry from their phone.

> **AI should remove decisions, not create more decisions.**
