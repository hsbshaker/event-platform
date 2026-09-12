# AI-Native Event Website + RSVP + Registry Platform

**Document:** Product Requirements Document (PRD) / `spec.md`
**Status:** Revision 3 — MVP baseline for implementation
**Initial launch vertical:** Baby showers
**Platform architecture:** Event-generic, baby-shower-first
**Primary build principle:** **AI should remove decisions, not create more decisions.**

---

## 0. What changed in Revision 3

This revision replaces Revision 2 after a second product and architecture pressure-test. Implementing agents must treat this document as authoritative; where it conflicts with any prior PRD, conversation summary, prototype behavior, or repository history, **Revision 3 wins**.

| Area | Revision 2 | Revision 3 |
| --- | --- | --- |
| Native gift tracking | `AVAILABLE → RESERVED → PURCHASED`, 72h expiry | **Honor-system purchase confirmation. Public state is only available/purchased.** A Buy click is logged privately; no hold, timer, expiry, or public reservation state. |
| Native gift CTA | `Reserve & Buy` | **`Buy this gift`**. Clicking does not make the item unavailable. |
| Reservation entity | `GiftReservation` | Removed. Replaced by lightweight private `GiftBuyClick` / purchase-intent logging. |
| Site imagery | Optional host-uploaded photos on the published site | **Removed from MVP.** Published sites use typography, palette, motifs, textures, patterns, borders, and gradients only. |
| Inspiration imagery | Optional uploads used as AI context | **Kept.** Invitation/decor/venue/Pinterest screenshots may be uploaded with the prompt; they are private AI input and never appear on the guest site. |
| Image editing | Host/co-host could change site images | Removed. There are no site-photo upload, crop, placement, or editing controls in MVP. |
| Hero archetypes | With-photo and without-photo behavior | Every archetype has a single image-free production implementation using motif/texture/typographic treatments. |
| Concept diversity | Model chooses concepts; backend repairs collisions | Backend **preassigns distinct hero archetype + tonal direction** before each concept call. Diversity is guaranteed before generation; validation still enforces the contract. |
| Repeated redesign | Exclude prior hero + tone combinations until exhausted | Same, plus a defined exhaustion rule: once combinations are exhausted, reuse is allowed while varying motifs, typography, treatments, palette dominance, and ornamentation. |
| Concept switching | Gallery retained, interaction with manual edits unspecified | **Selecting a concept replaces design choices only; it never replaces event content.** Generated concepts are immutable. |
| Co-host permissions | Operational access only; no AI/design | **Near-parity collaborator.** Co-host can use AI/design, registry, communications, RSVP, guests, event content, privacy, and direct styling. Owner-only: billing/payment, co-host access management, deletion/ownership-level actions. |
| Guest phone | Optional | **Required at the `GuestParty` primary-contact level.** Email remains optional. |
| RSVP identity | Name lookup with optional SMS verification | Name lookup followed by **SMS verification** to the party phone; SMS magic link supports later updates. |
| Timezone | Stored but not explicitly sourced | Inferred from normalized venue/address; browser timezone is fallback only if venue resolution fails. |
| Product URL metadata | One host-initiated fetch | Same, with explicit SSRF/network safety requirements and clean manual-entry fallback. |
| Design schema | `imageTreatment` | Replaced with `visualTreatment`, describing motif/texture/gradient treatment rather than photography. |
| Visual tests | With-image / without-image matrix | Image dimension removed; test archetype × tonal direction × density × section treatment at mobile and desktop widths. |

The core product principle remains unchanged:

> **AI should remove decisions, not create more decisions.**

---

## 1. Executive Summary

We are building an **AI-native event platform** that lets a host create a beautiful, fully themed event website with **event details, RSVP management, and registry functionality** from a simple natural-language description of the event.

The initial launch is intentionally focused on **baby showers**, because baby showers sit at the intersection of:

- strong visual/event theming;
- a real need for RSVP management;
- a real need for gift registries;
- hosts who want the digital experience to match the invitation, venue, decor, and overall aesthetic;
- fragmented workflows today across website builders, invitation tools, RSVP products, and registry services.

The product should not feel like a website builder. The host should not need design skills, event-planning expertise, or knowledge of fonts, spacing, layout systems, design tokens, or page builders.

The core promise is:

> **Describe your event. We create the whole experience.**

A user should be able to say something like:

> "I am throwing a Ralph Lauren-inspired baby shower for my baby boy. I want it to feel classy, cozy, preppy, and elevated — dark navy, cream, forest green, some equestrian influence, maybe plaid, but not cheesy. It is at a lodge in December."

The platform understands the intent, translates the references into an original visual direction, renders **three distinct concept previews** using the real site renderer, lets the user choose one, and that choice *is* the site.

The host may optionally upload inspiration images. This is additive context, not a required part of onboarding.

The MVP includes:

1. **Event details**
2. **RSVP and guest management**
3. **Registry presentation, individually tracked gifts, and a cash fund card**
4. **Basic SMS-first reminders/announcements**
5. **AI-driven event design and lightweight manual editing**
6. **Mobile-first host/admin and guest experiences**

It does **not** include a full event-planning suite, a drag-and-drop website builder, seating charts, vendor management, photo galleries, thank-you-note management, printed stationery, public/open RSVP, retailer scraping or sync, or an AI chat copilot.

---

## 2. Product Thesis

### 2.1 The problem

Today a host may need several products to create a polished event experience:

- Canva or a designer for visual identity;
- Wix/Squarespace for a website;
- Partiful/Paperless Post for event communication and RSVP;
- Amazon/Babylist/Target for registries;
- spreadsheets or notes to manage guests and gift status.

The host has to make dozens of decisions and manually keep the experience visually consistent.

The underlying problem is:

> **People know the event they want to create, but most do not know how to turn that idea into a cohesive digital experience without doing design and software configuration work themselves.**

### 2.2 Product solution

The platform acts like an **AI creative director + event operating system**.

The host describes the event in natural language. AI:

- infers the event type;
- infers the intended mood and aesthetic;
- translates named references into original design attributes rather than copying protected brand assets;
- produces a structured creative brief (the Event Identity);
- configures three clearly different concepts from a constrained library of live design primitives;
- keeps subsequent editing simple and constrained.

The user never "builds a website."

### 2.3 Why people pay, why they stay

- **Design is the reason they come and pay.** The three-concept reveal is the acquisition and conversion moment.
- **Operations are the reason they stay through the event.** RSVP chasing and gift tracking are the host's real problem in the weeks before the shower.
- **The guest site is the growth channel.** A one-time event has no per-user retention; retention is referral. Roughly forty guests see the site, and one of them is hosting next. The guest-facing experience must be as polished as the concept preview, and it carries a tasteful "made with" footer line.

---

## 3. Positioning and Commercial Model

### 3.1 Initial positioning

Market the product around **baby showers**, not "all events."

> **The AI-powered baby shower website that designs itself.**

or

> **Describe your baby shower. We create the whole experience.**

### 3.2 Commercial model

- Free to create.
- Free to generate concepts and redesign (within backend limits, see §10).
- Free to preview.
- **$49 one-time fee to publish.** Single flat price, no tiers, no per-guest pricing, no subscription.

Context: the free alternatives (Withjoy, Zola, Partiful, Babylist) set the floor. Paid invitation tools set the ceiling for what a host spends on the digital side of one event. Below roughly $30 the product reads as Evite; above roughly $100 it needs a concierge story. $49 is a hypothesis to test, not a final price. Competitor prices should be re-verified before launch.

The mocked payment gate (§28) must display the real price from day one, including during beta with a bypass, so that gate-open → continue is a usable conversion signal before billing exists.

No refunds. No ownership transfer. These are policy, not product features.

### 3.3 Long-term platform direction

The architecture uses a generic `Event` concept so the same system can later support bridal showers, weddings, engagement parties, birthdays, gender reveals, graduations, housewarmings, religious celebrations, anniversaries, and other invite-only events.

Do **not** broaden the launch UX or marketing to every event type during MVP.

---

## 4. Product Principles

These principles are requirements, not suggestions.

### 4.1 AI should remove decisions, not create more decisions

AI makes opinionated decisions on behalf of the host where it is safe to do so. Do not turn AI into a questionnaire generator. Do not ask the user to choose from fonts, hex colors, card styles, border radii, spacing, motifs, layouts, button variants, or templates. The host describes intent; the system translates intent into design.

### 4.2 AI is the creative director; the component system is the builder

AI chooses and configures from a **constrained but expressive library of live design primitives**. It does not generate arbitrary page layouts or HTML. Concept previews use the production renderer itself. Selecting a concept persists its `DesignSpec`; there is no separate website-generation step. Concept diversity is enforced programmatically, not solely through model instructions.

### 4.3 Archetypes are implementation primitives, not customer-facing templates

The renderer has a small library of hero archetypes and section treatments (§11). The user never sees "Pick Hero Template #4." AI picks. There is no template gallery anywhere in the product.

### 4.4 AI-first, controls second

Initial creation is AI-led. After generation, lightweight manual controls are available. The product must not become Wix, Webflow, Canva, Elementor, or a free-form page builder.

### 4.5 Mobile first everywhere

The entire application is designed **phone-first, desktop-second**: landing, signup, prompt entry, concept selection, preview, host dashboard, guest management, registry management, RSVP management, announcements, guest site, RSVP flow, registry flow. A host must be able to build and manage the entire event from a phone.

### 4.6 Opinionated design quality

Users may customize within safe boundaries, but the system makes it difficult to create an ugly or incoherent site. Every archetype renders correctly with no photo. Contrast is derived in code so no concept can ship unreadable text.

---

## 5. MVP Scope

### 5.1 In scope

**Event creation and design**

- Natural-language event description
- Optional **inspiration image uploads** used only as private AI context
- Optional inspiration links (best-effort; Pinterest board URLs are not supported as a reliable ingestion path)
- Minimal required follow-up questions, asked while generation runs
- AI-generated Event Identity (creative brief)
- Three concept previews rendered live by the production renderer
- Selection of one concept, which persists its `DesignSpec`
- Redesign rounds (**Try a different direction**) with optional feedback, producing three new concepts each round
- Gallery of all previously generated concepts for the event, any of which can be selected before publish
- Ability to keep the current design instead of selecting a new concept
- Lightweight direct design editing
- **No host-uploaded imagery on the published site**

**Event website**

- Event title/name
- Host/parent names as applicable
- Date, time, venue, address
- Timezone inferred from venue/address
- Basic event description/copy
- AI may suggest a small number of optional informational content blocks inferred from the prompt; these remain simple content blocks, not feature modules
- Visibility: public or private
- Private access via event code; hero remains visible, everything else locked
- Branded subdomain
- QR code for host distribution
- Tasteful **Made with** footer line

**RSVP and guest management**

- Manual guest-party entry
- CSV guest import
- Invite-only guest list; no open/public RSVP
- Household/party grouping; adults and children; plus-ones
- **One required mobile phone number per `GuestParty` primary contact**
- Email optional
- RSVP deadline
- Attendance response, custom questions, meal choice, dietary restrictions, notes
- Guest identifies their party by name lookup
- SMS one-time-code verification to the party phone
- Confirmation after RSVP; texted magic link for later updates
- Guest can update RSVP later
- Host/co-host RSVP dashboard

**Registry**

- External registry links (Amazon, Babylist, Target, etc.) presented as themed destinations
- Individually added native items by product URL, with one safe add-time metadata fetch and manual-entry fallback
- Native-item public state is **Available / Purchased only**
- Clicking **Buy this gift** is logged privately but does **not** reserve or hide the item
- Guest may self-confirm purchase when returning; owner/co-host may override purchase state
- Purchased status never reveals purchaser identity publicly; host/co-host may see known purchaser information
- Cash fund card (display only: handle, suggested amounts, blurb)

**Communication**

- SMS reminders to non-responders and SMS announcements, under the consent model in §13
- Email optional fallback
- Initial invitation delivery remains outside the platform; host distributes URL/QR code independently

**Roles**

- Owner
- Invited co-host(s) with near-parity event-management permissions

**Publishing**

- Free to create, generate, and preview
- $49 one-time fee to publish; payment gate mocked during initial build
- Post-publish content/operational/direct-design edits allowed
- Post-publish AI redesign/concept switching not allowed

**Post-event**

- Simple event-passed state with a thank-you message
- Registry remains accessible

### 5.2 Explicit non-goals for MVP

Implementing agents must **not** add these unless explicitly requested later:

- drag-and-drop page builder, pixel-level layout editor, free-form design canvas;
- template gallery or template marketplace;
- seating charts, event timeline/planning tools, vendor management, venue marketplace;
- photo galleries, thank-you-note manager, printed stationery, invitation designer, initial invitation sending;
- **site-photo uploads, hero-photo uploads, image crop/position/edit controls;**
- WhatsApp messaging;
- ticketing, payments from guests, group gifting;
- public/open RSVP, guest self-registration outside the invite list;
- browser extensions, bookmarklets;
- retailer scraping as a product dependency, Amazon auto-sync, residential proxy integration, item-level synchronization of external registries;
- AI-generated site imagery or illustration (deliberately deferred; see §11.7);
- Pinterest board URL ingestion;
- persistent AI chat/copilot, token-level **Edit with AI**;
- AI design changes after publish;
- a version-history or rollback *system* (the concept gallery is not one);
- gift reservation holds, reservation expiry, public **someone may be buying this** state;
- purchase nudges, late-purchase reconciliation, collision resolution;
- cancel/unpublish toggle, refunds, ownership transfer;
- custom domains unless trivial/stubbed;
- native mobile apps;
- user-facing analytics dashboards.

---

## 6. Primary User Roles

There are no additional personas in MVP. The three roles below are complete.

### 6.1 Owner

The owner created the event. Owner can:

- create the event and enter the initial design prompt;
- upload private inspiration images/links;
- generate, redesign, browse, and select concepts before publish;
- use direct design controls;
- manage event details, privacy, guests, RSVP configuration and responses;
- manage external registries, native items, cash fund;
- send reminders/announcements;
- invite/remove co-hosts;
- publish and handle billing/payment;
- delete/archive the event.

### 6.2 Co-host

Invited by the owner. Co-host is a **true event collaborator** and has near-parity with the owner for event work.

Co-host can:

- edit event details and content;
- manage privacy/access settings;
- manage guest list and import CSV;
- manage RSVP settings/questions and view responses;
- manage external registries, native items, native item purchase state, and cash fund;
- send reminders/announcements;
- use direct design controls;
- enter redesign feedback and add private inspiration input for redesign;
- generate redesign rounds and browse/select concepts **before publish**;
- use the same pre-publish AI/design-generation functionality as the owner after joining the event;
- preview the site;
- publish **only if the event's payment requirement is already satisfied**.

Co-host cannot:

- initiate or manage payment/billing;
- invite/remove/manage other co-hosts;
- transfer ownership;
- delete the event.

Generation/spend/abuse limits apply at both the event and acting-account level, regardless of whether the caller is the owner or a co-host.

### 6.3 Guest

- receives the event link/QR code from the host outside the platform;
- opens the site; enters the event code if private;
- views event details;
- finds their party by name lookup and verifies by SMS code;
- submits and later updates RSVP;
- browses registry; leaves to shop external registries or native gift retailer links;
- may self-confirm a native gift purchase;
- never creates an account.

---

## 7. End-to-End Host Journey

### 7.1 Landing page

Communicates the product within seconds.

> **Describe your event. We create the whole experience.**

Supporting language makes clear the system creates a themed event site, RSVP experience, and registry experience. Primary CTA: **Create my event**. No template gallery.

### 7.2 Account creation

Lightweight. No front-loaded profile configuration. After signup, proceed directly to event creation.

### 7.3 Event creation prompt

Primary screen:

> **Tell us what you're planning.**

Large natural-language input. Example placeholder:

> "I'm throwing a baby shower for our baby boy in December. We want it to feel like an elevated heritage country-club/lodge event — navy, cream, green, warm, classy and not overly baby-ish."

Optional controls beneath the prompt:

- `Add inspiration images` — private AI input only: invitation screenshots, decor screenshots, venue references, Pinterest-board screenshots, mood boards, or other visual references. These assets **never appear on the published site**.
- `Add inspiration link` — best-effort only. The system attempts a single safe metadata/preview fetch. If it fails, the URL may be retained as text context. Do not promise Pinterest-board ingestion; screenshots are the reliable Pinterest path.

Inspiration is never required.

### 7.4 Generation starts immediately; follow-ups run in parallel

On prompt submit, generation begins **immediately**. While it runs, the system asks only the follow-up questions required to make a functioning event:

- event date;
- start time (end time optional);
- venue/location and address;
- host/parent names;
- baby name if the host wants it shown;
- RSVP deadline;
- public or private.

Skip any question the prompt already answered. Do not ask timezone as a normal onboarding question; infer it from the resolved venue/address (§7.5). Do not ask aesthetic questions AI can infer.

### 7.5 Venue normalization and timezone

Normalize/geocode the venue/address when enough location information is available.

1. Store normalized address and coordinates when available.
2. Infer an **IANA timezone** from the venue location (e.g. `America/New_York`).
3. If the venue/address changes, recompute the timezone.
4. If venue resolution fails, use the host browser/device timezone as a fallback.
5. Only surface a timezone question if the system cannot infer a credible value through either path.

Event lifecycle calculations use the stored event timezone, never server timezone.

### 7.6 Event Identity (creative brief)

A strong multimodal model derives a structured **Event Identity** from the natural-language prompt and optional inspiration input. It is the creative brief, stored persistently and reused for later redesign rounds instead of repeatedly sending the original prompt and inspiration assets.

```ts
EventIdentity {
  creativeDirection
  toneKeywords[]
  paletteIntent
  colorsExplicitlyConstrained: boolean
  visualMotifs[]
  textureDirection
  typographyDirection
  copyTone
  designConstraints[]
  inspirationSummary
}
```

`inspirationSummary` is a compact interpretation of any inspiration assets/links that influenced the identity. Inspiration assets are inputs, not site content.

The Event Identity is streamed to the client as it is produced (§7.8).

### 7.7 Brand/style references

If a user references a brand or recognizable aesthetic (e.g. **Ralph Lauren**), interpret it into original design attributes: heritage, equestrian, classic Americana, editorial serif typography, navy/ivory/forest/camel palette, restrained plaid, leather/linen-like texture cues, understated luxury. Never copy logos, trademark graphics, or specific protected designs.

### 7.8 The wait

Concept generation must not feel like loading. In order of priority:

1. **Hide the wait behind follow-ups.** Questions from §7.4 are asked while concepts generate.
2. **Parallelize and stream.** One call produces the Event Identity; then three concept calls run in parallel using backend-preassigned distinct directions (§11.5). Each concept renders the moment its valid spec arrives.
3. **Show the brief being written.** Stream user-facing portions of the Event Identity: creative-direction name, tone keywords, palette swatches.
4. **Skeleton with copy** as fallback only.

**Latency targets** (measured at p75 in realistic conditions):

| Milestone | Target |
| --- | --- |
| Event Identity visible | ≤ 5 s |
| First concept rendered | ≤ 15 s |
| All three concepts rendered | ≤ 45 s |

If frontier-model reality makes a target consistently unattainable, instrument and revisit the target explicitly; do not silently ship an unbounded wait.

### 7.9 Three concept previews

Each concept is a `DesignSpec` (§11.2) rendered by the **production renderer** inside a scaled frame at mobile width. Previews are live components, not screenshots and not generated images.

Provisional content uses whatever the prompt and follow-ups already provided (names, date, venue). Placeholders fill only what is still missing, so the preview reads as *their* site.

Each concept has an AI-generated descriptive name and one-line description, e.g. **Heritage Editorial**, **Winter Estate**, **Modern Club**. Everything else is schema-constrained IDs/values.

The three concepts must be materially different (§11.5).

### 7.10 Concept selection is the site

Selecting a concept persists that concept's immutable `DesignSpec` as the event's active design. There is no separate **generate website** step.

Initial sections: Hero, Event Details, RSVP, Registry. AI may add a very small number of optional informational content blocks derived from the prompt; the host/co-host can hide, edit, or reorder them.

**Hard rule:** concept selection replaces **design choices**, never **event content**.

Selecting Concept B after Concept A may replace/reset:

- hero archetype;
- tonal direction;
- palette and manual palette override;
- typography pairing and manual typography override;
- motifs/textures;
- section visual treatments;
- density, ornamentation, borders/cards/buttons;
- other constrained design overrides.

It must never replace/reset:

- event title/description/names;
- date/time/timezone;
- venue/address;
- guest list;
- RSVP settings/questions/responses;
- registry links/native items/cash fund;
- privacy/access;
- actual section content.

Generated `DesignConcept` records are immutable. The active event design may have constrained manual overrides layered on top; selecting another concept clears/replaces those **design** overrides only.

### 7.11 Direct editing before publish

Allowed: text/copy; section order; section visibility; colors within curated controls; typography pairing from curated compatible pairings; event details; RSVP configuration; registry links/items/fund.

There are **no public-site image upload/edit controls** in MVP.

Not exposed: arbitrary CSS; spacing controls; font upload; freeform canvas; drag-anything-anywhere; pixel-level editing.

### 7.12 Redesign

Before publish, owner or co-host can choose **Try a different direction** as many times as backend limits allow (§10). The user never sees a credit count or remaining-generations counter.

Flow:

1. Collaborator optionally enters feedback ("Less country club, more cozy winter estate.").
2. Backend computes three eligible, intentionally distinct concept directions (§11.5).
3. Strong model uses the persisted Event Identity, current `DesignSpec`, prior combinations, assigned direction, and feedback.
4. Three new concepts generate in parallel.
5. Current active design remains unchanged while new concepts are reviewed.
6. Collaborator selects a new concept or **Keep Current Design**.

**Concept gallery.** Every concept ever generated for the event remains browsable and selectable before publish. Retaining immutable JSON specs is not a version-history/rollback system.

**Granularity.** Redesign is always concept-level: three new directions plus optional feedback. There is no chat-level or token-level loop such as **make the button rounder**.

### 7.13 Preview

Owner/co-host previews the guest-facing site before publish. Mobile preview is primary; desktop preview may be available.

### 7.14 Publish

Publish is gated by the $49 payment. During initial implementation the payment gate is mocked but displays the real price.

- Owner can complete/simulate payment.
- Once `paidAt`/payment-satisfied state exists, owner **or co-host** may publish.

Upon publish:

- event becomes accessible at its branded subdomain;
- collaborator can copy the URL;
- collaborator can view/copy/download the QR code;
- private events also surface the event access code beside the sharing tools;
- host/co-host distributes the link/code themselves.

---

## 8. Publishing and Editing Rules

### 8.1 Allowed after publish

Owner and co-host may change:

- date/time/location and ordinary event content;
- RSVP settings/questions;
- guest list and RSVP operations;
- external registries, native items, native item purchase state, cash fund;
- reminders/announcements;
- privacy settings/event code;
- section order and visibility;
- curated colors;
- curated typography pairing;
- other lightweight deterministic design controls that do not invoke AI or switch concepts.

Changes update the live site directly. No draft/live dual-version workflow.

### 8.2 Not allowed after publish

- AI redesign
- new concept generation
- switching/selecting a different generated concept

The concept gallery becomes read-only after publish.

### 8.3 Cancellation

There is no cancel/unpublish toggle in MVP. A host whose event is cancelled may edit the date to the past and the passed state (§23) takes over. No refunds. No ownership transfer.

---

## 9. AI Architecture and Cost Controls

AI cost is a product constraint from day one, but the product should use frontier models where creative quality materially affects conversion.

### 9.1 Strong-model usage

Use the strongest appropriate multimodal/reasoning model for:

1. Event Identity creation from natural-language prompt + optional inspiration inputs
2. Each concept `DesignSpec` in initial and redesign rounds

These are the only frontier/strong-model operations in MVP.

The backend may benchmark providers/models (for example OpenAI frontier models vs. Anthropic frontier models), but production code must call them through a thin capability interface such as:

```ts
generateEventIdentity(...)
generateDesignConcept(...)
```

Do not build a large provider abstraction framework before it is needed.

### 9.2 Cheaper-model usage

Use smaller/cheaper models only where ordinary code is insufficient and quality remains acceptable, for example:

- extracting structured event details from prose;
- determining whether a required field is missing;
- normalizing ambiguous natural-language date/time expressions.

Do **not** use a second model merely to summarize inspiration for validation; the strong Event Identity operation already consumes the inspiration context.

### 9.3 No-model operations

Never call a model for:

- changing date/time/venue;
- timezone lookup from a resolved location;
- hiding/reordering sections;
- selecting curated color/typography adjustments;
- editing text;
- adding/removing guests, registry URLs, native items, or cash fund;
- validating model output;
- deriving accessible contrast;
- assigning concept diversity constraints;
- enforcing generation limits;
- gift purchase-state transitions.

### 9.4 Persistence

Persist the Event Identity and every `DesignSpec`. Do not re-send the original prompt, inspiration images, or complete event history for routine operations. Redesign calls receive the compact Event Identity, current spec, relevant exclusion/assignment data, and new feedback.

### 9.5 Usage and cost metering

Every model call must record provider/model usage at the event and acting-user level. Store, where exposed by the provider:

- provider;
- provider request ID;
- model;
- operation (`event_identity` / `design_concept`);
- input tokens;
- cached-input tokens where applicable;
- output tokens;
- reasoning/thinking tokens where separately reported;
- estimated/actual USD cost based on a centrally maintained price table;
- latency;
- success/failure;
- generation round/concept index.

Provider billing/usage totals should be reconcilable against application-side `GenerationRun` totals.

---

## 10. Generation Limits

During alpha/beta, creative redesign is **effectively unlimited from the user's perspective**. Do not expose credits or remaining-generation counters.

Enforce configurable backend safety limits:

- one generation batch in flight per event at a time;
- per-event daily generation cap;
- per-account daily generation cap for the acting owner/co-host;
- global/project spend ceiling and alerts;
- anti-abuse rate limits and signup throttling;
- idempotency so retries/double taps do not duplicate expensive calls.

A co-host does not receive an independent unlimited pool for the same event; event-level limits span all collaborators.

Instrument every generation (§29). Use observed rounds per event, conversion, latency, model quality, and actual AI COGS to set commercial launch limits. Do not impose an arbitrary user-facing cap before testing.

The guiding experience:

> **AI creates. Simple controls refine. AI can reimagine before publish.**

---

## 11. Design System and Rendering Architecture

This section is the core architectural contract.

### 11.1 The rule

> **AI chooses and configures from a constrained but expressive library of live design primitives. It does not generate arbitrary page layouts. Concept previews use the production renderer itself. Selecting a concept persists its `DesignSpec`; there is no separate website-generation step. Published-site visuals are image-free in MVP and are built from typography, palette, motifs, patterns, textures, gradients, borders, and layout.**

### 11.2 DesignSpec

The model returns **IDs and values**, never layout prose.

```json
{
  "name": "Heritage Editorial",
  "description": "Dark navy dominant, split composition, traditional serif, structured spacing.",
  "heroArchetype": "editorial_split",
  "eventDetailsTreatment": "stacked_editorial",
  "rsvpTreatment": "contrast_panel",
  "registryTreatment": "retailer_tiles",
  "tonalDirection": "dark",
  "palette": {
    "primary": "#1B2A41",
    "secondary": "#F3EDE3",
    "accent": "#2F4F3E",
    "surface": "#FAF7F2"
  },
  "typographyPairing": "heritage_serif_clean_sans",
  "density": "spacious",
  "visualTreatment": "motif_panel",
  "motifs": ["plaid_restrained", "equestrian_line"],
  "ornamentation": "restrained",
  "borderTreatment": "hairline",
  "cardTreatment": "flat_bordered",
  "buttonTreatment": "solid_rounded_sm"
}
```

Every field except `name`, `description`, and palette hex values is an enum defined in code. Exact enum names may evolve during implementation; the conceptual shape does not.

### 11.3 Hero archetypes (MVP library)

Six archetypes. No archetype depends on photography.

| ID | Description / image-free implementation |
| --- | --- |
| `editorial_split` | Typography/details paired with a motif, texture, pattern, or color panel. |
| `centered_statement` | Large centered title, decorative motif/texture field, CTA below. |
| `full_bleed_visual` | Full hero surface built from gradient/texture/pattern/motif with overlaid event information. |
| `framed_invitation` | Hero composed like a physical invitation/card using borders, ornament, type, and motif. |
| `typography_first` | Expressive typography, whitespace, restrained motifs, little visual ornament. |
| `layered_editorial` | Layered motif/texture surface with overlapping content card(s). |

**Every archetype must look finished with zero site imagery because site imagery does not exist in MVP.**

### 11.4 Section treatments and motif vocabulary

Each MVP section has 2–3 treatments:

- **Event Details:** `structured_cards`, `stacked_editorial`, `split_panel`
- **RSVP:** `standalone_cta_panel`, `embedded_card`, `contrast_panel`
- **Registry:** `retailer_tiles`, `card_grid`, `featured_blocks`

**Motifs** are an enumerated, curated vocabulary of vector assets and CSS/SVG-friendly textures maintained in code, e.g.:

- `plaid_restrained`
- `gingham`
- `botanical_line`
- `stripe_classic`
- `deco_border`
- `linen_texture`
- `equestrian_line`
- `scallop_subtle`
- `star_celestial`
- `ribbon_line`

The motif library is a core design deliverable. AI picks from this vocabulary; it does not invent arbitrary SVG/HTML/CSS assets.

**Typography pairings** are an enumerated list of curated compatible pairs using licensed/self-hosted or web-safe hosted fonts appropriate for production use.

### 11.5 Concept diversity — assigned before generation, validated after

The backend, not the model, owns diversity.

For each batch of three concepts:

1. Determine three eligible **hero archetypes**.
2. Assign a distinct hero archetype to each concept call.
3. Assign distinct **tonal directions** (`light`, `mid`, `dark`) to the three calls.
4. If the prompt leaves color open (`colorsExplicitlyConstrained == false`), require materially different palette families/dominance across the three concepts.
5. If the user explicitly constrains colors (e.g. navy/cream/forest), honor those colors and vary dominance/contrast rather than violating the request.
6. Prefer different typography categories, motifs, and section treatments where compatible with the Event Identity.

Example backend assignments before calls begin:

```text
Concept A → editorial_split + dark
Concept B → framed_invitation + light
Concept C → typography_first + mid
```

Each concept model call receives its assigned archetype + tone as **constraints**, not suggestions.

After generation, schema validation confirms the model honored its assignment. If a model returns an invalid enum, map to a safe compatible default in code. If it violates its preassigned diversity constraint, repair deterministically where possible; do not spend another model call merely to make concepts different. One model retry is permitted only for structurally invalid/unusable output that cannot be safely repaired.

**Redesign exclusions.** Track previously shown `heroArchetype + tonalDirection` combinations. Prefer unseen combinations for redesign rounds.

**Exhaustion rule.** Six archetypes × three tonal directions yields 18 base combinations. Once eligible combinations are exhausted, reuse combinations is allowed. On reuse, the backend/model must seek distinctness through different motif sets, typography category, section treatments, palette dominance/family where allowed, density, ornamentation, borders/cards/buttons, and overall composition within the archetype. Unlimited-ish alpha redesign must never dead-end because a combination table is exhausted.

Weighted diversity scoring may be explored after observing real outputs. It is not MVP logic.

### 11.6 Validation, contrast, and design safety are code

- Use structured output against a strict enum schema.
- Model output validation is application code, never another model call.
- Map unknown/invalid IDs to known safe defaults.
- The model chooses palette hex values; the renderer derives accessible foregrounds, button states, focus states, and borders using a contrast algorithm.
- When proposed colors fail contrast, adjust derived foreground/surface values in code rather than rejecting the entire concept.
- Manual color changes rerun the same contrast derivation.

### 11.7 Imagery and inspiration

Two concepts must remain separate:

**Inspiration imagery**

- Optional host/co-host uploads supplied during event creation/redesign context.
- May include invitation screenshots, decor references, venue references, mood boards, Pinterest-board screenshots, etc.
- Used only to help AI form the Event Identity.
- Never automatically becomes guest-site content.
- No Pinterest-board URL promise; screenshots are the reliable path.

**Published-site imagery**

- **Not supported in MVP.**
- No hero photo uploads.
- No gallery/site photos.
- No photo cropping, positioning, replacement, or moderation workflow.
- No stock photography.
- No AI-generated illustration/image assets.

Why: eliminating site imagery keeps the MVP renderer, storage/moderation surface, editing model, and visual QA substantially smaller. The product must prove that AI-directed archetypes + typography + palette + motifs can deliver the paid visual wow moment. AI-generated or host-provided site imagery is a high-leverage post-MVP experiment, not an MVP dependency.

### 11.8 Testing

Because archetypes/treatments are enumerable, visual regression testing is systematic.

Required visual matrix:

- every hero archetype × `light` / `mid` / `dark`;
- every supported density;
- each event-details treatment;
- each RSVP treatment;
- each registry treatment;
- representative motif combinations;
- mobile (~390px) and desktop widths.

Render the matrix in CI and diff against approved baselines. The mobile matrix is the primary regression gate.

---

## 12. Guest List and RSVP

### 12.1 Philosophy

MVP RSVP is **invite-only**. Supported entry: manual and CSV. A public site may be viewable publicly, but RSVP submission must map to an invited party.

### 12.2 Guest data

```ts
GuestParty {
  id
  eventId
  displayName            // "The Ahmed Family"
  primaryContactName
  phone                  // required mobile number for primary party contact
  email?                 // optional fallback
  contactConsentSource   // host_attested | guest_confirmed | opted_out
  maxAdults
  maxChildren
  plusOneAllowed
  rsvpStatus
  submittedAt?
  updatedAt
}

GuestPerson {
  id
  partyId
  name
  type                   // adult | child | plus_one
  attendanceStatus
  mealChoice?
  dietaryRestrictions?
  notes?
}
```

A **primary mobile number is required for every `GuestParty`** in MVP. Individual children/plus-ones do not need their own number. Email is optional.

CSV/manual entry must surface a validation error for a party missing a phone rather than silently creating an unreachable party.

### 12.3 Household/party grouping

Support party invitations: a family as one party; two named adults plus children; a named guest plus optional plus-one. The RSVP UX makes it obvious who is included.

Do not require phone-number uniqueness across parties; shared family numbers may exist. Party identity is not the phone number alone.

### 12.4 RSVP configuration

Host/co-host configures: deadline; plus-one per party; adults/children per party; custom questions; meal choices; dietary-restriction field; optional notes.

### 12.5 Guest identification: name lookup + SMS verification

1. Guest opens the RSVP section and types their name.
2. Fuzzy match against invited party members. On collision, ask for additional last-name detail.
3. After a match, show **first names only** of the candidate party members. Never show phone/email.
4. Send a one-time verification code to the `GuestParty.phone` on file.
5. Guest verifies the code.
6. Guest responds attending/not attending per member, completes questions, submits.

Rate-limit name lookup, OTP send, and OTP verification attempts. OTPs must expire and cannot be replayed.

### 12.6 Confirmation and updates

After submission show a themed confirmation:

> **You're all set. We can't wait to celebrate with you.**

Text a signed, expiring/rotatable **magic link** that allows the party to view/update its RSVP without repeating name lookup. The guest can always repeat name lookup + OTP if the link is lost.

Guests never create an account and never need to contact the host simply to update an RSVP.

### 12.7 Host/co-host RSVP dashboard

Show:

- total invited parties/people;
- attending;
- not attending;
- no response;
- adults / children / plus-one counts;
- meal choices;
- dietary restrictions;
- custom-question responses;
- SMS opt-outs/delivery issues when available from the messaging provider.

Keep it operational; no analytics dashboard beyond event-management counts.

---

## 13. Guest Communication

### 13.1 Channels

- `GuestParty.phone` is required and is the primary communication destination.
- SMS is the primary MVP channel.
- Email is optional and may be used as fallback when appropriate (for example SMS opt-out/delivery failure) if an email exists.
- Initial invitations remain outside the platform.

### 13.2 Consent

The host may need to remind invited guests before those guests have interacted with the platform. MVP uses the existing host-attestation model:

- **Host attestation:** before using platform messaging, owner/co-host confirms they have permission to contact the guests about this event.
- Record attestation for the event/import workflow as required by implementation.
- Include required opt-out handling such as `STOP`; honor opt-outs promptly and expose their status to collaborators.
- Keep messages transactional and event-specific only.
- Apply a configurable, small per-event host-initiated send cap (e.g. five campaigns) to prevent misuse.
- A guest who verifies/RSVPs may be recorded as `guest_confirmed` where useful for compliance/state.

Do not build a generalized consent-management product in MVP.

### 13.3 Operational notes

- Plan for U.S. application-to-person SMS registration/compliance before production launch.
- Keep messages short and transactional; avoid unnecessary link density.
- International SMS is out of scope unless trivial.
- Per-message cost is absorbed by the publish fee during MVP pricing tests.

### 13.4 Reminders and announcements

- **Reminders:** primarily to non-responders. Example: "Reminder: please RSVP by December 1."
- **Announcements:** to invited guests. Example: time/venue detail changed or event reminder.

Keep communication basic. No marketing automation, sequences, campaigns, segmentation builder, or rich message editor.

---

## 14. Event Privacy and Access

### 14.1 Visibility

Public or private.

### 14.2 Private event gate

A private event requires an event code. The gate is a fixed rule with nothing for the host to design:

- **Visible before the code:** the finished hero showing event name, hosts, and date.
- **Locked behind the code:** venue address, event details, RSVP, registry, cash fund.

Private events carry `noindex`.

Rate-limit event-code attempts. Store only a secure hash of the access code, never plaintext.

On the publish/share screen for a private event, show the host/co-host the **URL/QR code and event code together** so they can distribute both. The QR code itself should not bypass the access-code gate.

### 14.3 RSVP remains invite-only

`public` never means `anyone may RSVP`. In either visibility mode, successful RSVP requires an invited-party match and SMS verification.

---

## 15. Registry Product Model

Three registry content types. No retailer synchronization.

### 15.1 External registry destination

Host/co-host adds a registry URL (Amazon, Babylist, Target, Pottery Barn Kids, etc.). The site presents it as a themed destination card with an action like **Shop Amazon Registry**. Clicking leaves to the retailer.

The retailer remains authoritative for item list, purchase status, quantities, returns, checkout, and registry benefits. The platform does not claim item-level synchronization and never polls/scrapes external registries for state.

### 15.2 Native item

For individual gifts the host/co-host wants represented directly on the event site, they paste a product URL and the platform creates a native gift card. This is useful for boutique products, Etsy, local shops, products not represented on an external registry, or any specific item the host wants surfaced directly.

```ts
NativeRegistryItem {
  id
  eventId
  retailerName
  productUrl
  title
  imageUrl?              // product-card image from metadata/manual URL; not event-site hero imagery
  priceDisplay?
  requestedQuantity
  purchasedQuantity
  createdAt
  updatedAt
}
```

Public availability is derived:

```text
availableQuantity = max(requestedQuantity - purchasedQuantity, 0)
```

There is no `reservedQuantity` in MVP.

#### Add-time metadata fetch

When a product URL is pasted, the backend may make **one host-initiated metadata fetch** to prefill retailer/title/product image/price-like display metadata where available. The collaborator must be able to review/edit the result. **Manual entry is a first-class path**, especially for Amazon or any site that blocks server fetches.

This fetch is not a crawler and must follow these safety constraints:

- accept only `http` / `https` URLs;
- reject localhost, loopback, private, link-local, and cloud-metadata address ranges (IPv4 and IPv6);
- resolve DNS before connecting and validate resolved IP(s);
- validate every redirect target before following it;
- cap redirects (e.g. 3);
- short network timeout (e.g. 5–8 seconds);
- strict response-size cap (e.g. 1–2 MB for metadata HTML);
- do not execute page JavaScript;
- do not send user cookies, retailer credentials, authorization headers, or host browser/session state;
- parse only basic HTML/Open Graph metadata needed to prefill the form;
- on any block/error/unsupported response, fail cleanly to manual entry.

Implementation should centralize this logic in a safe URL-fetch utility rather than allowing arbitrary server fetches from feature code.

### 15.3 Cash fund card

Display-only card: payment handle(s) (Venmo, Zelle, etc.), suggested amounts, short blurb. No guest payment processing and no cash-gift tracking in MVP.

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

External-registry purchases remain authoritative only at the retailer. Native item purchased state is an MVP honor system (§16).

---

## 16. Native Item Honor-System Purchase Flow

The MVP deliberately does **not** implement reservations. Public item state is simple and truthful about what the platform knows.

### 16.1 Public state

For each quantity unit, the public registry concept is:

```text
AVAILABLE → PURCHASED
```

For `requestedQuantity > 1`, show/derive remaining quantity from `requestedQuantity - purchasedQuantity`.

A click does **not** temporarily reduce availability.

### 16.2 Buy this gift

1. Guest taps **Buy this gift** on a native item.
2. Backend writes a **private `GiftBuyClick`** record before redirect when possible.
3. Click record may associate the known `GuestParty` if the guest has an active verified party session; otherwise it may remain device/session-associated only.
4. Guest is redirected to the retailer/product URL.
5. Public item state remains unchanged until a purchase is confirmed or the host/co-host overrides it.

There is no public **Reserved** or **Someone may be buying this** state.

### 16.3 Self-confirmation on return

When practical, set a short-lived device-side marker when **Buy this gift** is clicked. If that guest later loads the event site again and the marker is present, prompt:

> **Did you buy this gift?**
>
> `Yes, mark purchased` · `No`

- `Yes` increments `purchasedQuantity` (bounded by product rules) and records confirmation on the click/intent record.
- `No` records/clears the local prompt state; public availability remains unchanged.
- If the guest never returns, nothing happens. There is **no timer and no expiry job**.

The system must not imply that it verified checkout with the retailer.

### 16.4 Private click log

A minimal private record is sufficient:

```ts
GiftBuyClick {
  id
  eventId
  itemId
  partyId?
  deviceTokenHash?
  clickedAt
  response?              // purchased | not_purchased | null
  confirmedPurchasedAt?
}
```

This exists for:

- product telemetry;
- preserving purchase intent context;
- optionally identifying a confirmed purchaser when party identity is known.

A dedicated click-log dashboard is **not required** in MVP. If simple click count/time is surfaced during implementation, keep it subordinate to normal registry management. Do not build click-based nudges, collision workflows, expiration, or reconciliation in MVP.

### 16.5 Host/co-host override

Owner/co-host can:

- mark purchased;
- mark available / decrement purchased quantity when correcting an error;
- edit requested quantity;
- edit purchased quantity within valid bounds.

This is the integrity backstop for MVP.

### 16.6 Known limitations (accepted)

- Two guests can click/buy the same still-available native item before either confirms.
- A guest can purchase at the retailer and never return to confirm; the platform may continue showing the item available.
- A guest can buy directly from the retailer without first using **Buy this gift**; the platform will not know.
- External registry purchases are never tracked item-by-item by this platform.

These are accepted MVP limitations. Do not add reservation infrastructure to solve them unless real usage justifies it.

### 16.7 Purchaser identity

Never expose purchaser identity publicly.

When a purchase confirmation can be associated with a verified `GuestParty`, owner/co-host may see that party/person in admin. If identity is unknown, show the purchase as host-confirmed/unknown rather than fabricating purchaser information.

---

## 17. Registry Guest Experience

The registry section inherits the active Event Identity/DesignSpec: palette, typography, card treatment, visual treatment, density, motifs, and buttons.

It contains:

- themed external-registry destination cards;
- native item cards with **Buy this gift** and Available/Purchased state;
- cash fund card.

Do not imitate retailer branding beyond permitted retailer names/logos. Do not expose internal click logs or purchaser identity.

---

## 18. Event Details

Core content:

- event name;
- date;
- start/end time;
- venue;
- normalized address;
- hosts/parents;
- description/welcome text.

Timezone is inferred and stored as infrastructure data; it is not a normal guest-facing field.

AI may infer a small number of optional informational blocks from the prompt. **Do not** create separate FAQ, parking, dress-code, travel, or itinerary feature modules. Host/co-host can edit, hide, and reorder simple content blocks. Keep this as content, not module expansion.

---

## 19. Admin Dashboard

Optimized for **running the event**, not building a website. Mobile-first priorities:

1. RSVP summary (invited / attending / declined / awaiting)
2. Guest responses and no-response list
3. Event details
4. Registry (external registries, native items, confirmed purchases, cash fund)
5. Announcements/reminders
6. Site/design controls
7. Concept gallery/redesign controls before publish only

Owner and co-host see the operational/design areas they are permitted to use. Owner additionally sees billing/co-host-management/delete controls.

No analytics beyond operational event counts.

---

## 20. Design Editing

### 20.1 Direct editing

Owner/co-host may directly edit:

- copy/text;
- section order;
- section visibility;
- curated colors;
- curated typography pairings.

There are **no published-site image controls**.

### 20.2 Color controls

Constrained adjustments derived from the Event Identity:

- AI-selected palette as default;
- primary/accent variants from curated/derived values;
- reset to concept palette.

Contrast is re-derived in code after any change.

### 20.3 Typography

Curated compatible pairings only.

### 20.4 Selecting another concept

Before publish, selecting a different concept replaces the active design and clears/replaces manual **design** overrides. It never changes event content (§7.10).

### 20.5 No persistent AI copilot

No permanently visible AI chat assistant. Reasons: cost, endless-redesign behavior, UX complexity, and conflict with the core principle. AI reimagination occurs only at concept granularity through **Try a different direction**.

---

## 21. Site Structure

```text
Hero / Event Introduction
Event Details
RSVP
Registry (external · native · cash fund)
Footer ("Made with …")
```

Single-scroll mobile-first by default. Avoid page fragmentation. Optional simple information blocks may appear within the scroll but do not create separate pages/modules.

---

## 22. Mobile-First Requirements

Design from approximately **390px outward**.

**Owner/co-host from a phone:** create/join event; describe event; upload private inspiration input; answer follow-ups while concepts generate; review/select concepts; redesign; browse concept gallery; preview; edit event content and direct design controls; manage guests; import CSV where the OS/browser permits; view RSVP status; manage registries/native items/cash fund; send reminders/announcements; manage privacy; publish when payment is satisfied; copy URL; access QR/event code.

**Owner-only phone functionality:** billing/payment, co-host access management, delete/archive.

**Guest from a phone:** access public/private site; enter event code if required; read details; RSVP by name lookup + SMS verification; update RSVP via magic link; browse external registries/native items/cash fund; click **Buy this gift**; optionally confirm purchase on return.

Desktop enhances space; it never unlocks core functionality unavailable on phone.

---

## 23. Event Lifecycle

```text
DRAFT → DESIGN_SELECTED → READY_TO_PUBLISH → PUBLISHED → PASSED
ARCHIVED (internal, optional)
```

- **Draft:** not public; generation/redesign/concept switching allowed within backend limits.
- **Design selected:** an active `DesignSpec` exists.
- **Ready to publish:** required event/RSVP/share data is valid; payment may still be unsatisfied.
- **Published:** live; operational/content/direct-design edits allowed; AI redesign/concept switching disabled.
- **Passed:** after the event date/time in the event's stored IANA timezone: show a simple **Thank you for celebrating with us** state while keeping registry accessible.

A host can approximate cancellation in MVP by changing the event date to the past. There is no cancellation workflow.

---

## 24. Domain Model

Conceptual baseline, not an exact database schema.

```ts
User {
  id, email, name, createdAt, updatedAt
}

Event {
  id, ownerId,
  type /* baby_shower */,
  title, description,
  date, startTime, endTime?,
  timezone,               // IANA, inferred from venue/address
  venueName, address,
  latitude?, longitude?,
  visibility /* public | private */,
  accessCodeHash?,
  accessCodeEncrypted?,    // retrievable for authorized sharing UI; verification uses hash
  rsvpDeadline,
  status,
  slug,
  activeConceptId?,
  designOverrides?,       // constrained deterministic overrides only
  messageSendsUsed,
  publishedAt?, paidAt?,
  createdAt, updatedAt
}

EventMember {
  eventId, userId,
  role /* owner | cohost */,
  createdAt
}

EventIdentity {
  eventId,
  ...fields from §7.6,
  createdAt, updatedAt
}

DesignConcept {
  id, eventId,
  round,                 // 0 = initial, 1..n redesign rounds
  conceptIndex,          // 0..2 within a round
  name, description,
  designSpec,            // immutable §11.2 JSON
  selectedAt?,
  createdAt
}

EventSection {
  id, eventId,
  type /* hero | event_details | rsvp | registry | simple_info */,
  position, visible, content
}

GuestParty {
  id, eventId, displayName, primaryContactName,
  phone, email?, contactConsentSource,
  maxAdults, maxChildren, plusOneAllowed,
  rsvpStatus, submittedAt?, updatedAt
}

GuestPerson {
  id, partyId, name, type,
  attendanceStatus, mealChoice?, dietaryRestrictions?, notes?
}

ExternalRegistry {
  id, eventId, retailerName, registryUrl,
  displayName, position, visible, createdAt
}

NativeRegistryItem {
  id, eventId, retailerName, productUrl,
  title, imageUrl?, priceDisplay?,
  requestedQuantity, purchasedQuantity,
  createdAt, updatedAt
}

GiftBuyClick {
  id, eventId, itemId,
  partyId?, deviceTokenHash?,
  clickedAt,
  response? /* purchased | not_purchased | null */,
  confirmedPurchasedAt?
}

CashFund {
  id, eventId, title, blurb,
  handles[], suggestedAmounts[], visible
}

Message {
  id, eventId,
  kind /* reminder | announcement */,
  channel /* sms | email */,
  subject?, body, audience,
  sentAt, createdBy
}

GenerationRun {
  id, eventId, userId,
  provider, providerRequestId?,
  operation /* event_identity | design_concept */,
  round?, conceptIndex?,
  model,
  inputTokens?, cachedInputTokens?, outputTokens?, reasoningTokens?,
  costEstimateUsd?,
  latencyMs,
  success,
  diversityAssignment?,
  createdAt
}
```

Do not let the exact schema become a reason to add MVP features. Prefer the smallest relational design that satisfies the requirements.

---

## 25. Permissions Matrix

| Capability | Owner | Co-host | Guest |
| --- | ---: | ---: | ---: |
| View event | Yes | Yes | Yes |
| Edit event details/content | Yes | Yes | No |
| Manage privacy/access code | Yes | Yes | No |
| Manage guests / import CSV | Yes | Yes | No |
| Manage RSVP questions | Yes | Yes | No |
| View/manage RSVP responses | Yes | Yes | Own party only |
| Manage external registries/native items/cash fund | Yes | Yes | No |
| Manage native item purchase state | Yes | Yes | No |
| Send reminders/announcements | Yes | Yes | No |
| Use direct design controls | Yes | Yes | No |
| Add private inspiration for redesign | Yes | Yes | No |
| Enter redesign feedback | Yes | Yes | No |
| Generate redesign concepts before publish | Yes | Yes | No |
| Browse/select concepts before publish | Yes | Yes | No |
| Preview | Yes | Yes | Public/authorized view |
| Publish after payment is satisfied | Yes | Yes | No |
| Initiate/manage billing/payment | Yes | No | No |
| Manage co-host access | Yes | No | No |
| Delete/archive event | Yes | No | No |
| Transfer ownership | Not in MVP | Not in MVP | No |

Owner/co-host design generation consumes the same event-level generation pool/limits. After publish, AI generation and concept switching are disabled for both.

---

## 26. Important UX Rules

- **Never expose implementation complexity:** Event Identity, DesignSpec, archetype IDs, renderer internals, provider/model tiers, backend limits, sync limitations, data model.
- **No configuration fatigue:** describe → infer → ask only required missing details while generating → show concepts → select.
- **AI should remove decisions, not create more decisions.**
- **Concept selection replaces design, never event content.**
- **Inspiration images are not site images.** Never accidentally display an inspiration upload publicly.
- **Don't overbuild empty states.**
- **Guests never need accounts.** Name lookup + SMS verification + magic link.
- **No generation counters/credits** during alpha/beta.
- **No public reservation language** for native gifts. The platform does not claim an item is held merely because someone clicked Buy.
- Preserve mobile-first usability before optimizing desktop.

---

## 27. Safety / Integrity / Privacy

- Never expose purchaser identity publicly.
- Never store private-event access codes as plaintext. Store a verification hash; if the code must be re-displayed to authorized owner/co-host users, also store an encrypted-at-rest representation under an application-managed secret. Verification uses the hash, not decrypted plaintext.
- Rate-limit private event-code attempts.
- Never expose guest lists publicly; after name lookup show only the minimum names required to identify a party.
- Require SMS OTP before RSVP access to the matched party.
- Limit guests to their own party's information.
- Co-host access is explicit, invitation-based.
- SMS uses the MVP attestation/opt-out model in §13; honor provider opt-out status.
- No retailer scraping, bot evasion, proxy workarounds, or credential collection.
- Product metadata fetches must use the SSRF-safe utility and restrictions in §15.2.
- Never collect retailer credentials or request an Amazon/retailer login.
- External checkout stays on retailer sites.
- Do not represent honor-system native purchases as retailer-verified.
- Inspiration uploads are private AI inputs and must never be automatically rendered on the public event site.
- Private events are `noindex`.
- Use signed, scoped, expiring OTP/magic-link/session tokens; do not put sensitive guest data directly in client-trusted tokens.

---

## 28. Payment

- Free to create, generate, redesign, and preview within backend safety limits.
- **$49 one-time to publish.**
- Initial implementation: mock/stub the gate; display the real price; allow internal/test users to simulate success; record `paidAt` or equivalent payment-satisfied state.
- **Owner** initiates/manages payment.
- Once payment is satisfied, owner or co-host may execute publish.
- No refunds, transfers, subscriptions, or pricing tiers in MVP.
- Do not spend MVP effort on billing architecture beyond the stub.

---

## 29. Analytics (Instrumentation, Not Dashboards)

```text
landing_cta_clicked
signup_completed
event_creation_started
initial_prompt_submitted
inspiration_uploaded
inspiration_link_added
followup_question_answered
venue_timezone_inferred        { source: venue | browser_fallback }
identity_generated             { provider, model, latencyMs, costEstimateUsd }
concept_direction_assigned     { round, index, heroArchetype, tonalDirection }
concept_rendered               { round, index, latencyMs }
concepts_generated             { round, latencyMs }
concept_selected               { round, index }
redesign_started               { round, hasFeedback }
kept_current_design
gallery_concept_selected
generation_limit_hit           { limitType }
preview_opened
publish_gate_opened            { priceShown }
publish_gate_continued
event_published
guest_added
csv_import_completed           { parties, withEmail }
rsvp_lookup_started
rsvp_lookup_collision
rsvp_sms_verified
rsvp_completed
rsvp_updated                   { viaMagicLink }
external_registry_added
external_registry_clicked
native_item_added              { metadataFetched, manualEntry }
native_item_buy_clicked        { partyKnown }
native_item_purchase_confirmed { partyKnown }
native_item_purchase_declined
native_item_host_override      { action }
cash_fund_added
message_sent                   { kind, channel, recipients }
message_opt_out
```

Every strong-model operation also writes a `GenerationRun` row with provider/model usage, cost estimate, latency, acting user, event, and round/index metadata. These rows plus conversion behavior determine future model routing and commercial generation limits.

---

## 30. MVP Success Criteria

A non-technical host/co-host team can:

1. Land and understand the product quickly.
2. Describe a baby shower in natural language.
3. Optionally upload private visual inspiration that improves AI understanding but never appears on the site.
4. Answer only required follow-ups while concepts generate.
5. Have venue timezone inferred without unnecessary configuration.
6. See three clearly differentiated, high-quality concepts within latency targets.
7. Select one without design expertise, and that selection is the site.
8. Redesign freely before publish and return to any earlier concept.
9. Make simple design/content edits without a page builder or image-editing workflow.
10. Add guest parties manually or via CSV with a primary mobile number.
11. Configure and receive RSVP responses through name lookup + SMS verification.
12. Add external registries, native items by URL, and a cash fund card.
13. Let guests click **Buy this gift** and self-confirm purchases using the honor system.
14. Manually correct native gift purchase state when needed.
15. Send basic SMS reminders and announcements.
16. Collaborate with a co-host who can use design/AI, RSVP, registry, communication, and event controls.
17. Preview/manage everything from a phone.
18. Publish through the mocked $49 gate.
19. Share one URL/QR code (plus event code for private events).
20. Manage the event from a phone after publishing.

The host should feel:

> **I described what I wanted and it basically built the event for me.**

---

## 31. Acceptance Criteria

**AI creation and rendering**

- [ ] Natural-language description accepted; inspiration uploads/links optional and private.
- [ ] Inspiration uploads are never used as public site imagery.
- [ ] Generation begins on prompt submit; required follow-ups are asked while it runs.
- [ ] Venue/address normalization infers/stores an IANA timezone; browser timezone is fallback.
- [ ] Event Identity stored structurally and streamed to client.
- [ ] Backend assigns three distinct hero archetypes and three distinct tonal directions before concept calls start.
- [ ] Three concept calls run in parallel; each renders as soon as its valid spec arrives.
- [ ] Latency targets in §7.8 measured at p75.
- [ ] Previews are live production-renderer components in a scaled frame; no screenshots/generated images.
- [ ] Provisional preview content uses known event data.
- [ ] Every `DesignSpec` validates against enum schema; unknown IDs map to safe defaults.
- [ ] Explicit color constraints are honored across concepts.
- [ ] Every hero archetype renders correctly with no site image.
- [ ] Contrast is derived in code; no concept renders unreadable primary text/button states.
- [ ] Selecting a concept persists its `DesignSpec`; no separate site generation step exists.
- [ ] Selecting a concept replaces design/overrides only and never event content.

**Redesign**

- [ ] Owner and co-host can redesign repeatedly before publish, with optional feedback.
- [ ] Backend prefers unseen hero-archetype + tonal combinations.
- [ ] Exhausted combinations can be reused without dead-ending generation, with other design dimensions varied.
- [ ] Current design unchanged while new concepts are reviewed; collaborator may keep current design.
- [ ] All generated concepts remain browsable/selectable before publish.
- [ ] Generated concepts are immutable.
- [ ] No user-facing generation counters/credits.
- [ ] Backend concurrency, per-event, per-account, idempotency, and spend limits configurable/enforced.
- [ ] Every strong-model call logged with provider/model usage, cost, and latency.
- [ ] AI redesign/concept switching disabled after publish for both owner/co-host.

**Manual design editing**

- [ ] Text, section order/visibility, curated colors, and curated typography editable.
- [ ] No site-photo upload/crop/position/image editor exists.
- [ ] No free-form page builder exists.

**RSVP**

- [ ] Manual add and CSV import require one primary mobile number per GuestParty; email optional.
- [ ] Party grouping, plus-ones, adults/children work.
- [ ] Deadline, meal choice, dietary field, custom questions configurable.
- [ ] Name lookup supports fuzzy match and disambiguation; contact info never revealed.
- [ ] SMS OTP required before accessing/submitting matched party RSVP.
- [ ] OTP send/verification and lookup attempts are rate-limited.
- [ ] Themed confirmation shown; magic link texted for later updates.
- [ ] Guest can update RSVP via magic link or repeat lookup + OTP.
- [ ] Dashboard shows attending/declined/no-response and RSVP operational counts.
- [ ] Open/public RSVP is not available.

**Communication**

- [ ] Host-attestation flow exists before platform messaging.
- [ ] STOP/provider opt-out handling honored and visible to collaborators.
- [ ] Reminders target non-responders; announcements target invited guests as specified.
- [ ] SMS is primary; optional email fallback can be used where appropriate.
- [ ] Per-event send cap enforced.

**Registry**

- [ ] External registry URL displayed as themed destination; click leaves to retailer.
- [ ] No item-level external sync claimed or implemented.
- [ ] Native item added by URL with one add-time metadata attempt and manual-entry fallback.
- [ ] Metadata fetch uses SSRF-safe URL validation, redirect validation, timeout, and response cap.
- [ ] Native item has no reservation/expiry state; public state is Available/Purchased only.
- [ ] `Buy this gift` privately logs click when possible and redirects without changing public availability.
- [ ] On return, guest may self-confirm purchase; no return means no state change.
- [ ] Owner/co-host can correct requested/purchased quantities manually.
- [ ] Purchaser identity hidden publicly; known purchaser may be visible to owner/co-host.
- [ ] Cash fund displays handles/suggested amounts/blurb; no payments processed/tracked.

**Privacy and access**

- [ ] Public/private supported; private requires event code.
- [ ] Private gate shows hero (name, hosts, date) only; everything else locked; `noindex` set.
- [ ] Event-code attempts rate-limited.
- [ ] Private publish/share screen surfaces URL/QR + event code; QR does not bypass code.
- [ ] RSVP invite-only in either visibility mode.

**Roles**

- [ ] Owner invites/removes co-host.
- [ ] Co-host can use design/AI, registry, comms, RSVP, guests, content, privacy, and direct styling.
- [ ] Co-host cannot manage billing/payment, co-host access, ownership, or deletion.
- [ ] Co-host may publish only after payment is already satisfied.

**Publishing**

- [ ] Preview before publish; mocked gate displays $49.
- [ ] Owner simulates/completes payment; paid state gates publish.
- [ ] Branded subdomain, copyable URL, QR code; private event also exposes event code to host/co-host.
- [ ] Operational/content/direct-design edits allowed after publish; AI redesign/concept switching disabled.
- [ ] **Made with** footer present on guest site.

**Mobile**

- [ ] Entire owner/co-host flow, dashboard, guest RSVP, and registry usable at ~390px.
- [ ] No critical feature is desktop-only.
- [ ] Visual regression matrix (§11.8) runs in CI.

---

## 32. Implementation Guardrails for Coding Agents

1. Do not add features because they are conventional for event apps.
2. Do not add a template gallery. Archetypes are internal.
3. Do not build token-level/chat-level AI editing. Redesign is concept-level.
4. Do not build a version-history/rollback system. Retain immutable concept specs in a gallery instead.
5. Do not add browser extensions or bookmarklets.
6. Do not add retailer scraping/sync/proxies/anti-bot workarounds. One safe host-initiated metadata fetch at add time is allowed.
7. Do not add published-site photo uploads or image editing.
8. Do not automatically publish inspiration uploads on the site.
9. Do not generate site imagery in MVP.
10. Do not require guest accounts.
11. Do not optimize desktop before mobile.
12. Do not expose low-level website-builder controls.
13. Do not expose generation counters/credits/backend spend limits to users during alpha/beta.
14. Do not use a model for validation, contrast, diversity assignment, timezone lookup, or ordinary edits.
15. Do not generate arbitrary HTML/layouts. Model returns schema-constrained IDs/values.
16. Do not build gift reservation holds, reservation timers/expiry, public reserved state, nudges, or collision reconciliation.
17. Do privately log native-item Buy clicks and support honor-system purchase confirmation.
18. Do not build cancel/unpublish, refunds, or ownership transfer.
19. Do keep the domain model generic enough for future event types.
20. Do store structured AI output and render from it.
21. Do preassign concept hero archetype + tonal direction before model calls.
22. Do honor explicit color constraints.
23. Do define graceful redesign behavior after hero+tone combinations are exhausted.
24. Do infer event timezone from venue/address rather than adding routine configuration.
25. Do use a centralized SSRF-safe product metadata fetcher.
26. Do treat co-host as a near-parity event collaborator; keep only ownership/account-sensitive actions owner-only.
27. Do meet/measure latency targets.
28. Do make the smallest implementation that satisfies MVP requirements.

If an implementation decision conflicts with the principle below, stop and reconsider:

> **AI should remove decisions, not create more decisions.**

---

## 33. Deferred Product Opportunities

Intentionally deferred; may become roadmap items:

- host-uploaded public-site imagery (hero/maternity/venue photos) with crop/position/edit controls;
- AI-generated hero illustration/motif image per concept;
- broader event types;
- custom domains;
- invitations generated from Event Identity and invitation sending;
- matching print assets, welcome signs, menus, thank-you cards;
- native gift reservation/hold behavior if real duplicate-purchase data justifies it;
- SMS purchase nudges, richer click-log workflows, late confirmation/collision view;
- photo galleries and post-event thank-you workflows;
- deeper registry integrations, retailer partnerships, supported auto-sync;
- group gifting, guest payments;
- weighted diversity scoring after real-output data exists;
- pricing tiers, advanced AI generation limits/credits, concierge design tier;
- WhatsApp/international SMS;
- event planning/operations beyond details, RSVP, and registry.

---

## 34. Known Limitations (Accepted for MVP)

- Native gift purchase tracking is an honor system; a product can still be bought twice if guests do not confirm.
- Native purchases made directly at the retailer without **Buy this gift** are not tracked.
- External registries have no item-level sync in this platform.
- Every guest party requires a mobile number; events where a host cannot provide primary-contact phones are not supported cleanly in MVP.
- Name lookup leaks the existence of minimal first-name party data to someone who can guess a guest name, though SMS OTP is still required to access/submit RSVP details.
- Published-site visuals have no host photos or generated imagery; the paid design experience relies on typography, palette, archetype, texture, and curated motifs.
- Inspiration links may fail to fetch; screenshots/uploads are the reliable visual-inspiration input.
- Amazon native items may require manual title/product-image/price entry because add-time metadata can be blocked.
- AI concept generation latency/cost varies by frontier-model provider and must be measured in beta.
- No refunds, cancellation workflow, or ownership transfer.

---

## 35. Canonical MVP Flow

```text
LANDING PAGE
    ↓
CREATE ACCOUNT
    ↓
"Tell us what you're planning"
    ↓
Natural-language description
+ optional PRIVATE inspiration screenshots/images/links
    ↓
Generation starts immediately ──────────────┐
    ↓                                       │ in parallel
Required event follow-ups                   │
Venue/address → timezone inferred           │
    ↓                                       │
Event Identity streamed ◄───────────────────┘
    ↓
Backend assigns 3 distinct hero + tonal directions
    ↓
3 parallel DesignSpec calls
    ↓
3 concept previews
(live production renderer; no site imagery)
    ↓
Owner/co-host chooses 1
    ↓
DesignSpec persisted → this IS the site
    ↓
Collaborators add/edit:
Event details · Guests/CSV · RSVP · Registries · Native items · Cash fund · Comms
    ↓
Lightweight direct design/content edits
    ↓
OPTIONAL: "Try a different direction"
(repeatable pre-publish; gallery retains concepts)
    ↓
Mobile-first preview
    ↓
$49 gate (mocked; real price shown)
    ↓
Owner satisfies payment
    ↓
Owner/co-host PUBLISH
    ↓
Branded URL + QR code (+ event code if private)
    ↓
Host distributes externally
    ↓
GUEST
private? → hero visible → enter code
    ↓
Event details
    ↓
RSVP: name lookup → SMS OTP → response → SMS magic link
    ↓
Registry:
External registry → retailer
Native item → "Buy this gift" → private click log → retailer
    ↓
Optional return confirmation:
"Did you buy this gift?" → Yes = Purchased / No = no state change
    ↓
Owner/co-host manages RSVPs, registry, design controls, and SMS from mobile admin
    ↓
Event passes in venue timezone
    ↓
Simple thank-you state; registry remains accessible
```

---

## 36. North Star

The product is successful when someone with **zero design skill and zero event-software knowledge** can describe the event they are imagining and receive a beautiful, functioning, cohesive event experience in minutes.

The user should spend their time thinking about **their event**, not configuring software.

> **AI should remove decisions, not create more decisions.**
