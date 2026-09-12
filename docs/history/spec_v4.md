# AI-Native Event Website + RSVP + Registry Platform

**Document:** Product Requirements Document (PRD) / `spec.md`
**Status:** Revision 4 — MVP baseline for implementation
**Initial launch vertical:** Baby showers
**Platform architecture:** Event-generic, baby-shower-first
**Primary build principle:** **AI should remove decisions, not create more decisions.**

---

## 0. What changed in Revision 4

This revision replaces Revision 3 after a third product/implementation pressure test. Implementing agents must treat this document as authoritative; where it conflicts with any prior PRD, conversation summary, prototype behavior, or repository history, **Revision 4 wins**.

| Area | Revision 3 | Revision 4 |
| --- | --- | --- |
| Native product images | `imageUrl?` existed but image handling was implicit | **Product thumbnails are an explicit content-image exception.** The backend safely fetches, validates, resizes/compresses, and stores its own normalized copy when possible. Never hotlink retailer images. Themed placeholder when unavailable. |
| Published event imagery | No host-uploaded site photos | Unchanged. **No decorative/event photos on the published site in MVP.** Product thumbnails are content, not event-design imagery. |
| Guest phone requirement | Every `GuestParty` required a phone and every RSVP required OTP | Phone remains the strong default, but import never fails the whole file. Missing-phone parties are flagged **Needs phone**. Host/co-host may explicitly mark `noPhoneAvailable` for a rare party, enabling name-lookup-only RSVP for that party. |
| OTP abuse protection | General rate limiting | Add **per-party OTP throttling** plus requester/IP/device limits so guessing a guest name cannot spam that guest's phone. |
| Guest session | Implicit after OTP/magic link | **Explicit lightweight guest-party session** scoped to `eventId + partyId`. OTP and magic links establish/refresh it; registry click logging can reuse it. No guest account. |
| Tone diversity | Always preassign `light`, `mid`, `dark` | Event Identity now records tonal constraints and compatible tones. **AI ranks compatibility; code assigns distinct compatible directions where possible.** Never force dark into an explicitly light/airy brief. |
| Timezone | Normalize/geocode venue/address, then resolve IANA timezone | **No maps/geocoding dependency in MVP.** Structured event extraction infers an IANA timezone from venue city/state/country text; validate the timezone ID and fall back to browser timezone when confidence is low. |
| Private event code | Verification hash + encrypted retrievable copy | **One encrypted-at-rest representation only.** Authorized collaborators may retrieve it; validation decrypts and compares in constant time. Attempt rate limiting is the primary control. |
| Email fallback | Could be used when SMS unavailable/opted out | Email may fall back on **delivery failure/no usable phone**, but **never automatically after STOP/opt-out**. In MVP an opt-out suppresses automated event messaging until opt-back-in. |
| Ready-to-publish | Broadly described as required data valid | Explicit minimum fields are now enumerated. Guests, registry items, cash fund, co-hosts, and inspiration are **not** required to publish. |
| Inspiration uploads | Private AI input, persistence unspecified | Private object storage with MIME/count/size limits and **short retention**. Persist the derived `inspirationSummary`; raw uploads become eligible for deletion after successful Event Identity processing plus a retry window. |
| Metadata URL safety | SSRF-safe HTML fetch | Expanded to cover product-image fetching/normalization as well as metadata. Remote image URLs are never rendered directly to guests. |

The core product principle remains unchanged:

> **AI should remove decisions, not create more decisions.**

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
- **No host-uploaded decorative/event imagery on the published site**

**Event website**

- Event title/name
- Host/parent names as applicable
- Date, time, venue, address
- IANA timezone inferred from venue city/state/country text, with browser timezone fallback
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
- Mobile phone is the **default required** primary-contact field for a `GuestParty`
- CSV import does not fail the whole file when a party lacks a phone; that party imports as **Needs phone**
- Owner/co-host may explicitly mark a rare party `noPhoneAvailable`, enabling name-lookup-only RSVP for that party
- Email optional
- RSVP deadline
- Attendance response, custom questions, meal choice, dietary restrictions, notes
- Guest identifies their party by name lookup
- SMS one-time-code verification when a phone is available
- Lightweight verified guest-party session established after OTP; no guest account
- Confirmation after RSVP; texted magic link for later updates when a phone is available
- Guest can update RSVP later
- Owner/co-host RSVP dashboard, including **Needs phone** parties

**Registry**

- External registry links (Amazon, Babylist, Target, etc.) presented as themed destinations
- Individually added native items by product URL, with one safe add-time metadata fetch and manual-entry fallback
- Native-item **product thumbnail** is an allowed content-image exception: safely fetched, normalized, stored by the platform, and never retailer-hotlinked; themed placeholder if absent
- Native-item public state is **Available / Purchased only**
- Clicking **Buy this gift** is logged privately but does **not** reserve or hide the item
- Guest may self-confirm purchase when returning; owner/co-host may override purchase state
- Purchased status never reveals purchaser identity publicly; owner/co-host may see known purchaser information
- Cash fund card (display only: handle, suggested amounts, blurb)

**Communication**

- SMS reminders to non-responders and SMS announcements, under the consent model in §13
- Email fallback only when there is no usable phone or SMS delivery fails; **never automatically after STOP/opt-out**
- Initial invitation delivery remains outside the platform; host distributes URL/QR code independently

**Roles**

- Owner
- Invited co-host(s) with near-parity event-management permissions

**Publishing**

- Free to create, generate, and preview
- $49 one-time fee to publish; payment gate mocked during initial build
- Explicit ready-to-publish validation (§23)
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
- **host-uploaded decorative/event site photos, hero-photo uploads, image crop/position/edit controls;**
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
- maps/geocoding integration solely for timezone resolution;
- cancel/unpublish toggle, refunds, ownership transfer;
- custom domains unless trivial/stubbed;
- native mobile apps;
- user-facing analytics dashboards.

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
- `Add inspiration link` — best-effort only. The system attempts one safe preview/metadata read when technically permitted. If it fails, the URL may remain as text context. Do not promise Pinterest-board ingestion; screenshots are the reliable Pinterest path.

Inspiration is never required.

**Private inspiration storage.** Uploaded inspiration uses a private object-storage bucket and is never world-readable. Enforce a small allowlist of image MIME types, per-file size cap, per-event count cap, and image dimension/sanity checks. Persist the compact `EventIdentity.inspirationSummary`; after successful Event Identity processing plus a short configurable retry window (for example 24 hours), raw inspiration files become eligible for deletion. Delete any remaining raw inspiration when the event/account is deleted. Routine redesign calls use the persisted Event Identity rather than repeatedly transmitting the raw files.

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

### 7.5 Venue normalization and timezone inference

Do **not** introduce a maps/geocoding provider solely to determine timezone in MVP.

1. Normalize the venue/address text from the prompt/follow-ups into venue name, street/address text, city, state/region, postal code if supplied, and country when known.
2. As part of structured event-detail extraction, infer an **IANA timezone** from the city/state/region/country context (for example `America/New_York`) and return a confidence signal.
3. Validate the returned timezone against a known IANA timezone set before storing it.
4. If the timezone is missing/invalid/low-confidence, fall back to the owner/co-host browser/device timezone at the time the event details are saved.
5. If the venue/location changes materially, repeat the inference/fallback process.
6. Only ask the user to choose/confirm a timezone if both venue-text inference and browser fallback are unavailable or obviously contradictory.

This is intentionally approximate enough for the baby-shower MVP and avoids a maps dependency. Event lifecycle calculations use the stored IANA timezone, never server timezone.

### 7.6 Event Identity (creative brief)

A strong multimodal model derives a structured **Event Identity** from the natural-language prompt and optional inspiration input. It is the creative brief, stored persistently and reused for later redesign rounds instead of repeatedly sending the original prompt and inspiration assets.

```ts
EventIdentity {
  creativeDirection
  toneKeywords[]
  paletteIntent
  colorsExplicitlyConstrained: boolean
  tonalIntent
  toneExplicitlyConstrained: boolean
  compatibleTonalDirections[]   // subset of light | mid | dark, ranked/preferred
  compatibleHeroArchetypes[]    // ranked IDs from the internal archetype vocabulary
  visualMotifs[]
  textureDirection
  typographyDirection
  copyTone
  designConstraints[]
  inspirationSummary
}
```

`inspirationSummary` is a compact interpretation of any inspiration assets/links that influenced the identity. Inspiration assets are private inputs, not site content.

The model determines **compatibility and ranking**; application code makes the final diversity assignments (§11.5). This prevents a diversity rule from overriding an explicit brief such as “light, airy, soft.”

The Event Identity is streamed to the client as it is produced (§7.8).

### 7.7 Brand/style references

If a user references a brand or recognizable aesthetic (e.g. **Ralph Lauren**), interpret it into original design attributes: heritage, equestrian, classic Americana, editorial serif typography, navy/ivory/forest/camel palette, restrained plaid, leather/linen-like texture cues, understated luxury. Never copy logos, trademark graphics, or specific protected designs.

### 7.8 The wait

Concept generation must not feel like loading. In order of priority:

1. **Hide the wait behind follow-ups.** Questions from §7.4 are asked while the Event Identity is created.
2. **Identity first, then deterministic assignment.** Once the Event Identity is valid, the backend uses its compatible/ranked archetypes and tonal directions to assign three concept constraints (§11.5).
3. **Parallelize and stream concept calls.** Three concept calls then run in parallel. Each concept renders the moment its valid spec arrives.
4. **Show the brief being written.** Stream user-facing portions of the Event Identity: creative-direction name, tone keywords, palette swatches.
5. **Skeleton with copy** as fallback only.

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

1. Collaborator optionally enters feedback ("Less country club, more cozy winter estate.") and may add new private inspiration.
2. If new inspiration is provided, process it into an updated/merged Event Identity first; persist the updated `inspirationSummary` and apply the same short raw-file retention rules as initial creation.
3. Backend computes three eligible, intentionally distinct concept directions from the current Event Identity (§11.5).
4. Strong model uses the persisted Event Identity, current `DesignSpec`, prior combinations, assigned direction, and feedback.
5. Three new concepts generate in parallel.
6. Current active design remains unchanged while new concepts are reviewed.
7. Collaborator selects a new concept or **Keep Current Design**.

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
- normalizing ambiguous natural-language date/time expressions;
- **inferring a candidate IANA timezone + confidence from normalized venue city/state/region/country text.**

Timezone output must be validated against an application-side IANA timezone allowlist/set before it is persisted. Browser timezone is the fallback; do not add a maps/geocoding dependency solely for timezone.

Do **not** use a second model merely to summarize inspiration for validation; the strong Event Identity operation already consumes the inspiration context.

### 9.3 No-model operations

Never call a model for:

- changing date/time/venue after structured values exist;
- hiding/reordering sections;
- selecting curated color/typography adjustments;
- editing text;
- adding/removing guests, registry URLs, native items, or cash fund;
- validating model output;
- validating an IANA timezone ID;
- deriving accessible contrast;
- assigning concept diversity constraints from the Event Identity compatibility set;
- enforcing generation limits;
- gift purchase-state transitions;
- product-image resizing/compression.

### 9.4 Persistence

Persist the Event Identity and every `DesignSpec`. Do not re-send the original prompt, raw inspiration images, or complete event history for routine operations. Redesign calls receive the compact Event Identity, current spec, relevant exclusion/assignment data, and new feedback.

Raw inspiration uploads are temporary private processing assets (§7.3/§11.7), not durable design state.

### 9.5 Usage and cost metering

Every model call must record provider/model usage at the event and acting-user level. Store, where exposed by the provider:

- provider;
- provider request ID;
- model;
- operation (`event_identity` / `design_concept` / cheap structured extraction where metered);
- input tokens;
- cached-input tokens where applicable;
- output tokens;
- reasoning/thinking tokens where separately reported;
- estimated/actual USD cost based on a centrally maintained price table;
- latency;
- success/failure;
- generation round/concept index.

Provider billing/usage totals should be reconcilable against application-side `GenerationRun` totals.

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

**Every archetype must look finished with zero decorative/event imagery. Native-registry product thumbnails are a separate content exception and do not participate in hero/archetype design.**

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

### 11.5 Concept diversity — compatibility from AI, assignment in code

The **Event Identity** determines what is compatible with the user's brief. The **backend** owns the final diversity assignment.

For each batch of three concepts:

1. Wait for a valid Event Identity.
2. Read the ranked `compatibleHeroArchetypes[]` and `compatibleTonalDirections[]` returned in the identity.
3. Assign **three distinct eligible hero archetypes** whenever at least three compatible archetypes exist. The MVP archetype library must be broad enough that this is normally true.
4. Assign **distinct compatible tonal directions where the brief permits it**. Do not mechanically force `light`, `mid`, and `dark` if that would contradict the prompt.
5. If tone is explicitly constrained (for example “light, airy, soft”) and only one tonal family is appropriate, allow all three concepts to share that tonal direction and create distinction through hero archetype, palette dominance within the allowed family, typography, motifs, treatments, density, and ornamentation.
6. If the prompt leaves color open (`colorsExplicitlyConstrained == false`), require materially different palette families/dominance where compatible.
7. If the user explicitly constrains colors (for example navy/cream/forest), honor those colors and vary dominance/contrast rather than violating the request.
8. Prefer different typography categories, motifs, and section treatments where compatible with the Event Identity.

Principle:

> **AI ranks what fits. Code guarantees what differs. Explicit user intent beats diversity for diversity's sake.**

Example for an unconstrained heritage brief:

```text
Concept A → editorial_split + dark
Concept B → framed_invitation + light
Concept C → typography_first + mid
```

Example for a strongly light/airy brief:

```text
Concept A → editorial_split + light
Concept B → framed_invitation + light
Concept C → typography_first + light
```

The second trio is still required to be materially different through the other structured design dimensions.

Each concept model call receives its backend-assigned archetype + tone as **constraints**, not suggestions.

After generation, schema validation confirms the model honored its assignment. If a model returns an invalid enum, map to a safe compatible default in code. If it violates a preassigned constraint, repair deterministically where possible; do not spend another model call merely to make concepts different. One model retry is permitted only for structurally invalid/unusable output that cannot be safely repaired.

**Redesign exclusions.** Track previously shown `heroArchetype + tonalDirection` combinations. Prefer unseen **compatible** combinations for redesign rounds.

**Exhaustion rule.** Once compatible unseen base combinations are exhausted, reuse is allowed. On reuse, seek distinctness through different motif sets, typography category, section treatments, palette dominance/family where allowed, density, ornamentation, borders/cards/buttons, and overall composition within the archetype. Alpha redesign must never dead-end because a combination table is exhausted.

Weighted diversity scoring may be explored after observing real outputs. It is not MVP logic.

### 11.6 Validation, contrast, and design safety are code

- Use structured output against a strict enum schema.
- Model output validation is application code, never another model call.
- Map unknown/invalid IDs to known safe defaults.
- The model chooses palette hex values; the renderer derives accessible foregrounds, button states, focus states, and borders using a contrast algorithm.
- When proposed colors fail contrast, adjust derived foreground/surface values in code rather than rejecting the entire concept.
- Manual color changes rerun the same contrast derivation.

### 11.7 Imagery and inspiration

Three concepts must remain separate:

**1. Inspiration imagery — private AI input**

- Optional owner/co-host uploads supplied during event creation/redesign context.
- May include invitation screenshots, decor references, venue references, mood boards, Pinterest-board screenshots, etc.
- Used only to help AI form the Event Identity.
- Never automatically becomes guest-site content.
- Stored in a **private** bucket only; no public object URLs.
- Enforce MIME allowlist, file-size cap, per-event count cap, and basic image sanity/dimension limits.
- Persist the derived `EventIdentity.inspirationSummary` as durable context.
- After successful Event Identity processing plus a short configurable retry window, raw files become eligible for automatic deletion; delete any remaining copies when the event/account is deleted.
- No Pinterest-board URL promise; screenshots are the reliable path.

**2. Published event/design imagery — not supported in MVP**

- No hero/maternity/venue photo uploads.
- No gallery/site photos.
- No photo cropping, positioning, replacement, or image-editing workflow.
- No stock photography.
- No AI-generated decorative illustration/image assets.

Every archetype is therefore image-independent and uses typography, palette, motifs, borders, textures, patterns, gradients, and composition.

**3. Native-registry product thumbnails — explicit content exception**

Product thumbnails on native registry cards are **product content**, not event-design imagery. They are allowed under §15.2. They must be fetched/normalized by the backend and stored as a constrained platform asset when possible; the guest site must never depend on retailer image hotlinks. Missing images use a themed placeholder.

Why this boundary exists: eliminating decorative event imagery keeps the MVP renderer, design editing model, and visual QA substantially smaller while retaining visually useful product cards. The product must first prove that AI-directed archetypes + typography + palette + motifs deliver the paid design wow moment. Decorative site imagery is a high-leverage post-MVP experiment, not an MVP dependency.

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

MVP RSVP is **invite-only**. Supported host entry: manual guest-party entry and CSV import. A public event may be viewable publicly, but every RSVP submission must map to an invited party.

Mobile phone is the strong default for party identity and communication, but the system needs a narrow operational escape hatch rather than failing an entire event because one relative has no usable phone.

### 12.2 Guest data

```ts
GuestParty {
  id
  eventId
  displayName
  primaryContactName
  phone?                 // expected/default; may be absent only in needs-phone/no-phone flows
  email?                 // optional fallback
  noPhoneAvailable       // explicit collaborator override; default false
  contactConsentSource
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

CSV import must **not reject the entire file** because individual rows lack a phone. Import valid party data and flag missing-phone parties as **Needs phone**. Owner/co-host then either adds a phone number or explicitly marks **No phone available** for that party.

Manual party creation should require either a phone number or the explicit **No phone available** acknowledgement before the party is considered RSVP-ready.

Do not require phone-number uniqueness across parties; shared family numbers may exist. Party identity is not the phone number alone.

### 12.3 Household/party grouping

Support party invitations: family as one party; two named adults plus children; named guest plus optional plus-one. RSVP UX makes it obvious who is included.

### 12.4 RSVP configuration

Owner/co-host configures: deadline; plus-one per party; adults/children per party; custom questions; meal choices; dietary-restriction field; optional notes.

### 12.5 Guest identification: name lookup + conditional SMS verification

1. Guest opens RSVP and enters their name.
2. Fuzzy match against invited party members. On collisions, ask for enough additional name detail to identify the intended party.
3. After a match, show only the minimum first names needed to recognize the party. Never show phone/email.
4. If the matched party has a phone, **SMS OTP is required** before the guest can view/submit that party's RSVP.
5. If the party is explicitly `noPhoneAvailable == true`, allow name-lookup-only RSVP as the accepted MVP escape hatch.
6. If the party is **Needs phone**, do not expose the party RSVP. Show a neutral message directing the guest to contact the host; the collaborator must fix the phone or mark the no-phone override.
7. Guest submits attendance/questions after verification/allowed fallback.

**OTP abuse protection** is mandatory:

- cooldown/rate limit per `GuestParty` phone (for example a small number per hour);
- rate limit per requester IP/device/session;
- event-level/global burst protection;
- expiring, one-time-use codes;
- verification-attempt cap.

Typing another guest's name must not allow an attacker to repeatedly spam that guest's phone.

### 12.6 Lightweight guest-party session

Successful OTP verification establishes a lightweight guest session scoped to:

```text
eventId + partyId
```

The no-phone fallback may establish the same scoped session after successful name lookup.

Requirements:

- no guest account;
- secure/httpOnly cookie where appropriate or equivalent signed session mechanism;
- signed/scoped so it cannot be changed into another event/party;
- reasonable expiration through the event window;
- contains no unnecessary PII in client-trusted form;
- reused by RSVP updates and registry click/purchase-intent logging;
- SMS magic links establish/refresh the same party session rather than inventing a second identity system.

### 12.7 Confirmation and updates

After submission show a themed confirmation:

> **You're all set. We can't wait to celebrate with you.**

If a phone is available, text a signed magic link so the guest can return/update without repeating lookup + OTP. A guest can always repeat name lookup and the appropriate verification/fallback path.

### 12.8 Owner/co-host RSVP dashboard

Show:

- total invited;
- attending;
- declined;
- no response;
- adults/children/plus-ones;
- meal/dietary/custom-question responses;
- **Needs phone** parties;
- **No phone available** parties;
- communication/opt-out state where relevant.

Keep this operational, not analytical.

## 13. Guest Communication

### 13.1 Channels

- Phone is the preferred/default guest-party contact channel.
- **SMS is primary** when a usable phone is on file and the party has not opted out.
- Email is optional.
- Email may be used when a party is explicitly `noPhoneAvailable`, or as fallback when an SMS **delivery attempt fails** and an email exists.
- **Do not automatically fall back to email after the guest sends STOP or otherwise opts out.** In MVP, an opt-out suppresses automated platform event messaging to that party across channels until they opt back in.
- Parties in **Needs phone** state receive no automated messaging until corrected/overridden.
- Initial invitations remain outside the platform.

### 13.2 Consent

The main use of SMS is reminding invited guests who may not yet have interacted with the platform, so guest-confirmed consent cannot be the only precondition.

MVP consent model:

- **Host attestation:** before using platform messaging, owner/co-host confirms they have permission to contact guests about this event.
- **STOP/opt-out handling:** honor opt-outs immediately, persist the status, and show it to collaborators.
- **Per-event host-initiated message cap** (configurable and deliberately small) so the event cannot become a spam campaign.
- Messages are transactional and event-specific only.
- A guest who completes OTP/RSVP may upgrade the record to `guest_confirmed` where useful, but that does not erase the need to honor future opt-out.

### 13.3 Operational notes

- US A2P 10DLC registration/compliance may require lead time/business setup; start it before production messaging is needed.
- Keep messages short, event-specific, and link-light.
- International SMS remains out of scope unless trivial.
- Per-message cost is absorbed by the publish fee.
- Delivery failures should be recorded distinctly from opt-outs because only delivery failure may trigger email fallback.

### 13.4 Reminders and announcements

- **Reminders:** non-responders only. Example: `Reminder: please RSVP by December 1.`
- **Announcements:** invited guests according to the selected audience. Example: time changed, venue detail updated, event reminder.
- Suppress opted-out parties.
- Keep these basic. No marketing automation.

## 14. Event Privacy and Access

### 14.1 Visibility

Public or private.

### 14.2 Private event gate

A private event requires a short human-shareable event code. The guest-facing gate is fixed:

- **Visible before the code:** finished hero showing event name, hosts, and date.
- **Locked behind the code:** venue/address, event details, RSVP, registry, cash fund.

Private events carry `noindex`.

**Storage and verification**

- Store **one encrypted-at-rest event-code field** under an application-managed encryption secret/key.
- Do not keep a separate hash + encrypted duplicate in MVP.
- Authorized owner/co-host share UI may decrypt/reveal the code.
- Guest verification decrypts the stored value server-side and compares against the submitted code using a constant-time comparison.
- Never log plaintext event codes or send them to analytics.
- Rate-limit attempts by event + requester/IP/device and add broader abuse protection.
- Use a reasonably strong randomly generated human-shareable code rather than a trivial 4-digit PIN.

The short shared code is not intended to be high-security authentication; attempt throttling and minimal pre-code exposure are the primary controls.

### 14.3 Sharing

For a private event, publish/share UI must surface together:

- event URL;
- QR code pointing to the URL only;
- event code.

The QR code must **not** embed/bypass the event code.

### 14.4 RSVP remains invite-only

`public` never means `anyone may RSVP`. Event visibility and RSVP eligibility are separate concepts.

## 15. Registry Product Model

Three registry content types. No retailer synchronization.

### 15.1 External registry destination

Host/co-host adds a registry URL (Amazon, Babylist, Target, Pottery Barn Kids, etc.). The site presents it as a themed destination card with an action like **Shop Amazon Registry**. Clicking leaves to the retailer.

The retailer remains authoritative for item list, purchase status, quantities, returns, checkout, and registry benefits. The platform does not claim item-level synchronization and never polls/scrapes external registries for state.

### 15.2 Native item

For gifts that are not represented adequately by an external registry—or any specific product the owner/co-host wants surfaced directly—the collaborator pastes a product URL and the platform creates a native gift card.

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

**Product-image rule.** A native-item thumbnail is the one deliberate imagery exception in MVP because it is **product content**, not event design. The public event renderer still has no decorative/hero/site-photo system.

If no product image is available, render a polished themed placeholder using the event's registry/card treatment. The item must remain fully usable without an image.

#### Add-time metadata and product-image fetch

When a product URL is pasted, the backend may make **one host-initiated safe fetch flow** to prefill retailer/title/price-like display metadata and discover a candidate product image. The collaborator reviews/edits the result. **Manual entry is a first-class path**, especially for Amazon or any site that blocks server fetches.

Do **not** hotlink the retailer image on the guest site. If a candidate remote product image is available:

1. fetch it through the same centralized SSRF-safe network layer;
2. validate that the response is an allowed raster image MIME type;
3. enforce a strict byte-size and dimension/pixel cap before/while decoding;
4. strip unneeded metadata;
5. resize/compress to a normalized thumbnail asset (for example bounded around 512px and stored in a modern web format where supported);
6. store the platform-owned copy in controlled object storage/CDN;
7. render only the platform-owned asset URL.

If the host manually enters an image URL, apply the **same safe fetch + normalization path**. There is no direct host image upload for native items in MVP.

**SSRF/network safety requirements for all metadata/image URL fetches:**

- allow only `http` / `https`;
- reject credentials in URLs;
- reject localhost, loopback, private, link-local, multicast/special-use, and cloud-metadata address ranges for IPv4/IPv6;
- resolve DNS and validate the destination before connecting;
- validate **every redirect** destination before following;
- small redirect cap (for example 3);
- short timeout (for example 5–8 seconds);
- strict HTML response-size cap for metadata (for example 1–2 MB);
- strict image-byte and decoded-pixel caps for thumbnails;
- never forward host cookies, retailer credentials, authorization headers, or browser session data;
- never execute page JavaScript;
- parse only basic HTML/Open Graph metadata needed to prefill the form;
- treat every failure/block/bot page/non-HTML metadata response as **manual-entry fallback**, not as a scraping problem to solve.

This is a single user-triggered convenience read at add time, not a retailer sync system.

The platform owns the honor-system purchase state for native items (§16).

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

Native gift tracking intentionally uses an honor system for MVP. There is no reservation hold, expiration timer, public claim state, collision engine, or retailer verification.

### 16.1 Public state

For quantity-one items, guest-facing state is conceptually:

```text
AVAILABLE → PURCHASED
```

For quantity > 1, availability is derived from:

```text
remaining = requestedQuantity - purchasedQuantity
```

There is no `reservedQuantity` in MVP.

### 16.2 Buy this gift

1. Guest taps **Buy this gift**.
2. Backend writes a private `GiftBuyClick` before redirect when possible.
3. If the guest has an active verified guest-party session (§12.6), associate the click with that `GuestParty`; otherwise keep only a device/session association where available.
4. Redirect to retailer.
5. **Do not change public availability merely because of the click.**

This is intentionally honest: the platform does not know a purchase occurred yet.

### 16.3 Self-confirmation on return

If the same guest returns and the app can identify the prior click through the guest-party session and/or a lightweight device token, prompt:

> **Did you buy this gift?**
> `Yes, mark purchased` · `No`

- **Yes:** increment `purchasedQuantity` by the clicked quantity (bounded by reasonable host-controlled quantity rules), mark the click confirmed, and update the public derived state.
- **No:** record the response and leave public availability unchanged.
- **No return/no response:** no state change.

Do not assume a guest will return. The flow must remain valid when they do not.

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

Purpose:

- product/UX instrumentation;
- associate a self-confirmation when possible;
- optionally give owner/co-host minimal operational context;
- future input if evidence later justifies nudges/reservations.

Do not expose click intent publicly. Do not build a reservation UI around it.

### 16.5 Owner/co-host override

Owner/co-host can:

- adjust requested quantity;
- adjust purchased quantity;
- mark available/purchased as appropriate;
- correct mistakes.

This manual override is the MVP integrity backstop.

### 16.6 Known limitations (accepted)

- Two guests can buy the same available item before either confirms.
- A guest can purchase at the retailer and never return to confirm; the platform may continue showing the item available.
- A guest can buy directly from the retailer without first using **Buy this gift**; the platform will not know.
- External registry purchases are never tracked item-by-item by this platform.

These are accepted MVP limitations. Do not add reservation infrastructure to solve them unless real usage justifies it.

### 16.7 Purchaser identity

Never expose purchaser identity publicly.

When a purchase confirmation can be associated with a verified `GuestParty`, owner/co-host may see that party/person in admin. If identity is unknown, show the purchase as host-confirmed/unknown rather than fabricating purchaser information.

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
- **Ready to publish:** all minimum publish requirements below are valid; payment may still be unsatisfied.
- **Published:** live; operational/content/direct-design edits allowed; AI redesign/concept switching disabled.
- **Passed:** after the event date/time in the event's stored IANA timezone: show a simple **Thank you for celebrating with us** state while keeping registry accessible.

### 23.1 Minimum READY_TO_PUBLISH requirements

The application must define this state deterministically. Minimum:

- active selected `DesignSpec`;
- event title;
- event date;
- start time;
- venue/location display value;
- valid stored IANA timezone;
- RSVP deadline;
- visibility (`public` or `private`);
- encrypted event access code when private;
- valid event owner/account.

**Not required to publish:** guest rows, co-hosts, external registries, native items, cash fund, inspiration assets, announcements/reminders, or completed RSVP responses.

Payment is a separate gate:

```text
READY_TO_PUBLISH + payment satisfied → may PUBLISH
```

A host can approximate cancellation in MVP by changing the event date to the past. There is no cancellation workflow.

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
  timezone,               // validated IANA; inferred from venue text, browser fallback
  venueName, address,
  visibility /* public | private */,
  accessCodeEncrypted?,   // single encrypted-at-rest representation; no duplicate hash in MVP
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

InspirationAsset {
  id, eventId,
  storageKey,
  mimeType, sizeBytes,
  expiresAt?,             // raw file eligible for cleanup after identity processing/retry window
  createdAt
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
  phone?, email?, noPhoneAvailable,
  contactConsentSource,
  maxAdults, maxChildren, plusOneAllowed,
  rsvpStatus, submittedAt?, updatedAt
}

GuestPerson {
  id, partyId, name, type,
  attendanceStatus, mealChoice?, dietaryRestrictions?, notes?
}

// Guest-party session may be implemented as signed stateless/httpOnly session
// or as a minimal server-backed record. It is not a user account.
GuestPartySession? {
  id?, eventId, partyId,
  tokenHash?, expiresAt,
  createdAt?, updatedAt?
}

ExternalRegistry {
  id, eventId, retailerName, registryUrl,
  displayName, position, visible, createdAt
}

NativeRegistryItem {
  id, eventId, retailerName, productUrl,
  title, productImageAssetId?, priceDisplay?,
  requestedQuantity, purchasedQuantity,
  createdAt, updatedAt
}

ProductImageAsset {
  id, eventId, itemId,
  storageKey, mimeType,
  width?, height?, sizeBytes?,
  createdAt
}

GiftBuyClick {
  id, eventId, itemId,
  partyId?, deviceTokenHash?, quantity,
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
  operation /* event_identity | design_concept | structured_extraction */,
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

Derived `GuestParty` contact state should not require its own stored enum unless useful:

```text
phone exists                          → Ready
phone missing + !noPhoneAvailable     → Needs phone
phone missing + noPhoneAvailable      → No phone available
```

Do not let the exact schema become a reason to add MVP features. Prefer the smallest relational/session design that satisfies the requirements.

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
- **Private event code:** store one encrypted-at-rest representation only; never plaintext. Authorized reveal/validation happens server-side. Compare decrypted values in constant time. Never log/code-analytics plaintext. Rate-limit attempts.
- Never expose guest lists publicly; after name lookup show only the minimum names required to identify a party.
- Require SMS OTP before RSVP access when a phone exists; allow the explicit `noPhoneAvailable` name-lookup-only exception.
- Rate-limit OTP sending **per party/phone** as well as per requester/IP/device and event/global burst.
- A **Needs phone** party cannot expose RSVP details until fixed or explicitly marked no-phone.
- Limit guests to their own party's information.
- Guest-party sessions must be signed/scoped to event + party, expire reasonably, and contain no unnecessary client-trusted PII.
- Co-host access is explicit, invitation-based.
- SMS uses the MVP attestation/opt-out model in §13. A STOP/opt-out must not be circumvented by automatically switching the same party to email.
- No retailer scraping, bot evasion, proxy workarounds, or credential collection.
- Product metadata and remote product-image fetches must use the centralized SSRF-safe utility/restrictions in §15.2.
- Never render arbitrary retailer image URLs directly to guests; render only normalized platform-owned product thumbnails or a themed placeholder.
- Never collect retailer credentials or request an Amazon/retailer login.
- External checkout stays on retailer sites.
- Do not represent honor-system native purchases as retailer-verified.
- Inspiration uploads are private AI inputs, stored privately with strict limits and short raw-file retention; never automatically render them on the public event site.
- Private events are `noindex`.
- Use signed, scoped, expiring OTP/magic-link/session tokens; do not put sensitive guest data directly in client-trusted tokens.

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
inspiration_raw_cleanup
followup_question_answered
venue_timezone_inferred        { source: venue_text | browser_fallback, confidence }
identity_generated             { provider, model, latencyMs, costEstimateUsd }
concept_direction_assigned     { round, index, heroArchetype, tonalDirection, toneConstrained }
concept_rendered               { round, index, latencyMs }
concepts_generated             { round, latencyMs }
concept_selected               { round, index }
redesign_started               { round, hasFeedback }
kept_current_design
gallery_concept_selected
generation_limit_hit           { limitType }
preview_opened
publish_readiness_failed       { missingFields[] }
publish_gate_opened            { priceShown }
publish_gate_continued
event_published
guest_added
csv_import_completed           { parties, withPhone, needsPhone, noPhoneAvailable, withEmail }
guest_no_phone_override_set
rsvp_lookup_started
rsvp_lookup_collision
rsvp_otp_requested
rsvp_otp_throttled             { scope: party | requester | event }
rsvp_sms_verified
guest_party_session_created    { method: otp | no_phone_lookup | magic_link }
rsvp_completed
rsvp_updated                   { viaMagicLink }
external_registry_added
external_registry_clicked
native_item_added              { metadataFetched, manualEntry, productImageStored }
native_product_image_fetch     { success, failureReason? }
native_item_buy_clicked        { partyKnown }
native_item_purchase_confirmed { partyKnown }
native_item_purchase_declined
native_item_host_override      { action }
cash_fund_added
message_sent                   { kind, channel, recipients }
message_delivery_failed        { channel }
message_opt_out
```

Every metered model operation also writes a `GenerationRun` row with provider/model usage, cost estimate, latency, acting user, event, and operation/round/index metadata. These rows plus conversion behavior determine future model routing and commercial generation limits.

## 30. MVP Success Criteria

A non-technical owner/co-host team can:

1. Land and understand the product quickly.
2. Describe the baby shower in natural language.
3. Optionally upload private visual inspiration that improves AI understanding but never appears on the event site.
4. Answer only genuinely required follow-ups while generation runs.
5. Have an IANA timezone inferred from venue text without a maps/geocoding setup step, with browser fallback.
6. See three materially differentiated, compatible concepts within the latency targets.
7. Select one without design expertise, and that selection is the site.
8. Redesign freely before publish and return to earlier immutable concepts.
9. Make constrained design/content edits without a page builder.
10. Add guests manually or by CSV; missing-phone rows import as **Needs phone** instead of breaking the entire file.
11. Resolve rare no-phone parties with an explicit collaborator override.
12. Let a normal guest identify their party, verify by SMS, receive a scoped guest session, RSVP, and update later by magic link.
13. Add external registries, native items by URL, and a cash fund card.
14. Show native product thumbnails when safely available without retailer hotlinks; gracefully render placeholders when not.
15. Let guests click **Buy this gift** and optionally self-confirm purchase without a reservation state machine.
16. Send basic SMS reminders/announcements without bypassing guest opt-out through email fallback.
17. Collaborate with a co-host who can use design/AI, RSVP, registry, communication, and event controls.
18. Preview/manage everything from a phone.
19. Reach a deterministic **Ready to publish** state with the explicitly required fields.
20. Publish through the mocked $49 gate.
21. Share one URL/QR code (plus event code for private events).
22. Manage the event from a phone after publishing.

The host should feel:

> **I described what I wanted and it basically built the event for me.**

## 31. Acceptance Criteria

**AI creation and rendering**

- [ ] Natural-language description accepted; inspiration uploads/links optional and private.
- [ ] Inspiration uploads are stored privately, constrained by MIME/size/count limits, never used as public site imagery, and become eligible for short-retention cleanup after successful identity processing.
- [ ] Generation begins on prompt submit; required follow-ups are asked while Event Identity generation runs.
- [ ] Event-detail extraction produces/infers a candidate IANA timezone from venue text with confidence; ID is application-validated; browser timezone is fallback. No maps/geocoding dependency is required solely for timezone.
- [ ] Event Identity includes tonal constraint/compatibility and ranked compatible archetype/tone information.
- [ ] Event Identity stored structurally and streamed to client.
- [ ] Backend assigns three distinct compatible hero archetypes and compatible tonal directions **after** Event Identity exists.
- [ ] Explicit tonal constraints are honored; system does not force dark/mid/light merely for diversity.
- [ ] Three concept calls run in parallel after assignment; each renders as soon as its valid spec arrives.
- [ ] Latency targets in §7.8 measured at p75.
- [ ] Previews are live production-renderer components in a scaled frame; no screenshots/generated images.
- [ ] Provisional preview content uses known event data.
- [ ] Every `DesignSpec` validates against enum schema; unknown IDs map to safe defaults.
- [ ] Explicit color constraints are honored across concepts.
- [ ] Every hero archetype renders correctly with no decorative/event image.
- [ ] Contrast is derived in code; no concept renders unreadable primary text/button states.
- [ ] Selecting a concept persists its `DesignSpec`; no separate site generation step exists.
- [ ] Selecting a concept replaces design/overrides only and never event content.

**Redesign**

- [ ] Owner and co-host can redesign repeatedly before publish, with optional feedback.
- [ ] Backend prefers unseen **compatible** hero-archetype + tonal combinations.
- [ ] Exhausted compatible combinations can be reused without dead-ending generation, with other design dimensions varied.
- [ ] Current design unchanged while new concepts are reviewed; collaborator may keep current design.
- [ ] All generated concepts remain browsable/selectable before publish.
- [ ] Generated concepts are immutable.
- [ ] No user-facing generation counters/credits.
- [ ] Backend concurrency, per-event, per-account, idempotency, and spend limits configurable/enforced.
- [ ] Every metered model call logged with provider/model usage, cost, and latency.
- [ ] AI redesign/concept switching disabled after publish for both owner/co-host.

**Manual design editing**

- [ ] Text, section order/visibility, curated colors, and curated typography editable.
- [ ] No decorative/event site-photo upload/crop/position/image editor exists.
- [ ] Native registry product thumbnails are not exposed as event-design controls.
- [ ] No free-form page builder exists.

**RSVP**

- [ ] Manual add expects a phone or explicit **No phone available** acknowledgement.
- [ ] CSV import succeeds when some parties lack phone; those rows are flagged **Needs phone**.
- [ ] Owner/co-host can add a phone later or explicitly set `noPhoneAvailable` for a party.
- [ ] Party grouping, plus-ones, adults/children work.
- [ ] Deadline, meal choice, dietary field, custom questions configurable.
- [ ] Name lookup supports fuzzy match and disambiguation; contact info never revealed.
- [ ] Party with phone requires SMS OTP before RSVP access/submission.
- [ ] `noPhoneAvailable` party can use name-lookup-only fallback.
- [ ] **Needs phone** party cannot expose RSVP details until corrected/overridden.
- [ ] OTP send is rate-limited per party/phone plus requester/event abuse limits; verification attempts capped.
- [ ] Successful OTP/fallback establishes a scoped guest-party session reused by RSVP and registry flows.
- [ ] Themed confirmation shown; magic link texted when phone is available.
- [ ] Magic link establishes/refreshes the same guest-party session model.
- [ ] Guest can update RSVP via magic link or repeat lookup/verification flow.
- [ ] Dashboard shows attending/declined/no-response, Needs phone, and No phone available operational counts.
- [ ] Open/public RSVP is not available.

**Communication**

- [ ] Host-attestation flow exists before platform messaging.
- [ ] STOP/provider opt-out handling honored and visible to collaborators.
- [ ] Opt-out suppresses automated event messaging and does **not** trigger automatic email fallback.
- [ ] Email fallback may occur only for no usable phone or SMS delivery failure when email exists.
- [ ] Reminders target non-responders; announcements target invited guests as specified.
- [ ] Per-event send cap enforced.

**Registry**

- [ ] External registry URL displayed as themed destination; click leaves to retailer.
- [ ] No item-level external sync claimed or implemented.
- [ ] Native item added by URL with one add-time metadata attempt and manual-entry fallback.
- [ ] Metadata/product-image fetch uses centralized SSRF-safe URL validation, redirect validation, timeouts, response/image byte and pixel caps.
- [ ] Remote product images are validated, resized/compressed, and stored as platform-owned thumbnails; guest site never hotlinks retailer images.
- [ ] Manual product-image URL uses the same safe fetch/normalization path; no direct product image upload in MVP.
- [ ] Missing product image renders a themed placeholder.
- [ ] Native item has no reservation/expiry state; public state is Available/Purchased only.
- [ ] **Buy this gift** privately logs click when possible and redirects without changing public availability.
- [ ] On return, guest may self-confirm purchase; no return means no state change.
- [ ] Owner/co-host can correct requested/purchased quantities manually.
- [ ] Purchaser identity hidden publicly; known purchaser may be visible to owner/co-host.
- [ ] Cash fund displays handles/suggested amounts/blurb; no payments processed/tracked.

**Privacy and access**

- [ ] Public/private supported; private requires event code.
- [ ] Private gate shows hero (name, hosts, date) only; everything else locked; `noindex` set.
- [ ] Exactly one encrypted-at-rest event-code representation is stored in MVP; no duplicate verification hash.
- [ ] Event-code verification occurs server-side with constant-time comparison after decrypt; plaintext never logged/analytics'd.
- [ ] Event-code attempts rate-limited.
- [ ] Private publish/share screen surfaces URL/QR + event code; QR does not bypass code.
- [ ] RSVP invite-only in either visibility mode.

**Roles**

- [ ] Owner invites/removes co-host.
- [ ] Co-host can use design/AI, registry, comms, RSVP, guests, content, privacy, and direct styling.
- [ ] Co-host cannot manage billing/payment, co-host access, ownership, or deletion.
- [ ] Co-host may publish only after payment is already satisfied.

**Publishing**

- [ ] `READY_TO_PUBLISH` validation requires exactly the minimum fields in §23.1.
- [ ] Guests/registries/cash fund/co-host/inspiration are not required for publish readiness.
- [ ] Preview before publish; mocked gate displays $49.
- [ ] Owner simulates/completes payment; paid state gates publish.
- [ ] Branded subdomain, copyable URL, QR code; private event also exposes event code to owner/co-host.
- [ ] Operational/content/direct-design edits allowed after publish; AI redesign/concept switching disabled.
- [ ] **Made with** footer present on guest site.

**Mobile**

- [ ] Entire owner/co-host flow, dashboard, guest RSVP, and registry usable at ~390px.
- [ ] No critical feature is desktop-only.
- [ ] Visual regression matrix (§11.8) runs in CI.

## 32. Implementation Guardrails for Coding Agents

1. Do not add features because they are conventional for event apps.
2. Do not add a template gallery. Archetypes are internal.
3. Do not build token-level/chat-level AI editing. Redesign is concept-level.
4. Do not build a version-history/rollback system. Retain immutable concept specs in a gallery instead.
5. Do not add browser extensions or bookmarklets.
6. Do not add retailer scraping/sync/proxies/anti-bot workarounds. One safe host-initiated metadata/product-image convenience fetch at add time is allowed.
7. Do not add decorative/event site-photo uploads or image editing.
8. Do not automatically publish inspiration uploads on the site.
9. Do not generate decorative site imagery in MVP.
10. **Do** allow normalized native-product thumbnails as content; never hotlink retailer images.
11. Do not require guest accounts. Use the scoped guest-party session model.
12. Do not make an entire CSV import fail because individual parties lack phone numbers; flag them **Needs phone**.
13. Do not make no-phone RSVP a normal branch; require an explicit collaborator `noPhoneAvailable` override for the rare exception.
14. Do not optimize desktop before mobile.
15. Do not expose low-level website-builder controls.
16. Do not expose generation counters/credits/backend spend limits to users during alpha/beta.
17. Do not use a model for validation, contrast, final diversity assignment, ordinary edits, or product-image processing.
18. Do not add a maps/geocoding provider solely for timezone resolution. Venue-text inference + validated IANA ID + browser fallback is the MVP rule.
19. Do not generate arbitrary HTML/layouts. Model returns schema-constrained IDs/values.
20. Do not force tonal diversity that contradicts the Event Identity. AI defines compatibility; code assigns within it.
21. Do not build gift reservation holds, reservation timers/expiry, public reserved state, nudges, or collision reconciliation.
22. Do privately log native-item Buy clicks and support honor-system purchase confirmation.
23. Do not build cancel/unpublish, refunds, or ownership transfer.
24. Do keep the domain model generic enough for future event types.
25. Do store structured AI output and render from it.
26. Do assign concept hero archetype + compatible tone **after Event Identity** and before concept model calls.
27. Do honor explicit color and tone constraints.
28. Do define graceful redesign behavior after compatible hero+tone combinations are exhausted.
29. Do use a centralized SSRF-safe metadata/product-image fetcher, with redirect/IP/size/pixel protections and graceful manual fallback.
30. Do treat co-host as a near-parity event collaborator; keep only ownership/account-sensitive actions owner-only.
31. Do store private-event access code once, encrypted at rest; do not add a redundant hash copy in MVP.
32. Do rate-limit event-code and OTP abuse, including per-party OTP throttling.
33. Do not bypass STOP/opt-out by silently switching the same party to email.
34. Do keep raw inspiration private and short-lived after Event Identity processing.
35. Do implement `READY_TO_PUBLISH` exactly from §23.1 rather than inventing extra prerequisites.
36. Do meet/measure latency targets.
37. Do make the smallest implementation that satisfies MVP requirements.

If an implementation decision conflicts with the principle below, stop and reconsider:

> **AI should remove decisions, not create more decisions.**

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
- Phone is the normal RSVP identity path, but rare `noPhoneAvailable` parties fall back to name lookup without OTP; that path is intentionally weaker.
- A CSV can contain missing-phone parties; those parties cannot RSVP until a collaborator supplies a phone or explicitly marks the no-phone override.
- Name lookup leaks the existence of minimal party-name information to someone who can guess a guest name; OTP still protects normal phone-backed parties.
- SMS/carrier delivery can fail; email fallback is intentionally **not** used after STOP/opt-out.
- Published event visuals have no host photos or generated decorative imagery; the paid design experience relies on typography, palette, archetype, texture, and curated motifs.
- Native registry product thumbnails are an explicit content exception and may be unavailable when retailer metadata/images block safe fetching; placeholders must look intentional.
- Inspiration links may fail to fetch; screenshots/uploads are the reliable visual-inspiration input.
- Raw inspiration uploads require temporary private storage even though they never appear publicly.
- Amazon native items may require manual title/product-image URL/price entry because add-time metadata can be blocked.
- Venue-text timezone inference is intentionally lighter-weight than a full geocoder and may fall back to browser timezone.
- Short private-event codes are convenience/privacy gates, not high-security authentication; rate limiting is essential.
- AI concept generation latency/cost varies by frontier-model provider and must be measured in beta.
- No refunds, cancellation workflow, or ownership transfer.

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
Generation starts immediately ───────────────┐
    ↓                                         │
Required follow-up questions                 │
(date/time/venue/names/deadline/privacy)      │
    ↓                                         │
Event Identity streamed ◄─────────────────────┘
    ↓
Venue text → candidate IANA timezone inferred/validated
(low confidence → browser timezone fallback)
    ↓
Event Identity ranks compatible hero archetypes + tones
    ↓
Backend assigns 3 distinct compatible hero directions
+ compatible tonal directions (never violate explicit tone intent)
    ↓
3 DesignSpec calls in parallel
    ↓
3 LIVE concept previews
(production renderer; no decorative/event site imagery)
    ↓
Owner/co-host chooses 1
    ↓
DesignSpec persisted → this IS the site
    ↓
Host setup/admin
    ├── Event details
    ├── Guests / CSV
    │     ├── phone present → Ready
    │     ├── phone missing → Needs phone
    │     └── explicit rare override → No phone available
    ├── RSVP settings
    ├── External registries
    ├── Native items
    │     └── safe metadata/product-thumbnail normalization or placeholder
    ├── Cash fund
    └── Communications
    ↓
Lightweight direct edits
    ↓
OPTIONAL: "Try a different direction"
(repeatable pre-publish; gallery retains immutable concepts)
    ↓
Mobile-first preview
    ↓
READY_TO_PUBLISH validation (§23.1)
    ↓
$49 gate (mocked, real price shown)
    ↓
Owner satisfies payment
    ↓
Owner/co-host PUBLISH
    ↓
Branded URL + QR
(private: code shown separately; QR does not bypass code)
    ↓
Host distributes externally
    ↓
GUEST
    ↓
Private? hero visible → enter event code
    ↓
Event details
    ↓
RSVP name lookup
    ├── phone-backed party → SMS OTP → scoped guest-party session
    ├── noPhoneAvailable → name-only fallback → scoped party session
    └── Needs phone → contact host / cannot RSVP yet
    ↓
RSVP response → confirmation → SMS magic link when phone exists
    ↓
Registry
    ├── external registry → retailer
    ├── native item → Buy this gift → private click log → retailer
    │      └── optional return confirmation → Purchased
    └── cash fund → display only
    ↓
Owner/co-host manages RSVPs, registry, design controls, and communications from mobile admin
    ↓
Event passes in stored timezone
    ↓
Thank-you/passed state; registry stays accessible
```

## 36. North Star

The product is successful when someone with **zero design skill and zero event-software knowledge** can describe the event they are imagining and receive a beautiful, functioning, cohesive event experience in minutes.

The user should spend their time thinking about **their event**, not configuring software.

> **AI should remove decisions, not create more decisions.**
