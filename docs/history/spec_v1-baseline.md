# AI-Native Event Website + RSVP + Registry Platform

**Document:** Baseline Product Requirements Document (PRD) / `spec.md`  
**Status:** MVP baseline for implementation  
**Initial launch vertical:** Baby showers  
**Platform architecture:** Event-generic, baby-shower-first  
**Primary build principle:** **AI should remove decisions, not create more decisions.**

---

## 1. Executive Summary

We are building an **AI-native event platform** that lets a host create a beautiful, fully themed event website with **event details, RSVP management, and registry functionality** from a simple natural-language description of the event.

The initial launch is intentionally focused on **baby showers**, because baby showers sit at the intersection of:

- strong visual/event theming;
- a real need for RSVP management;
- a real need for gift registries;
- hosts who often want the digital experience to match the invitation, venue, decor, and overall event aesthetic;
- fragmented workflows today across products such as website builders, invitation tools, RSVP products, and registry services.

The product should not feel like a website builder. The host should not need design skills, event-planning expertise, or knowledge of fonts, spacing, layout systems, design tokens, or page builders.

The core promise is:

> **Describe your event. We create the whole experience.**

A user should be able to say something like:

> “I am throwing a Ralph Lauren-inspired baby shower for my baby boy. I want it to feel classy, cozy, preppy, and elevated — dark navy, cream, forest green, some equestrian influence, maybe plaid, but not cheesy. It is at a lodge in December.”

The platform should understand the intent, translate the user's references into an original visual direction, create **three distinct concept previews**, let the user choose one, and then generate the functioning event site.

The host may optionally upload inspiration images or paste inspiration links. This is additive context, not a required part of onboarding.

The MVP is intentionally narrow. It includes:

1. **Event details**
2. **RSVP and guest management**
3. **Registry presentation and individually tracked gifts**
4. **Basic email reminders/announcements**
5. **AI-driven event design and lightweight manual editing**
6. **Mobile-first host/admin and guest experiences**

It does **not** include a full event-planning suite, drag-and-drop website builder, seating charts, vendor management, photo galleries, thank-you-note management, printed stationery, public/open RSVP, automatic retailer scraping, or unlimited AI redesign.

---

# 2. Product Thesis

## 2.1 The problem

Today, a host may need several products to create a polished event experience:

- Canva or a designer for visual identity;
- Wix/Squarespace for a website;
- Partiful/Paperless Post/etc. for event communication and RSVP;
- Amazon/Babylist/Target/etc. for registries;
- spreadsheets or notes to manage guests and gift status.

The host has to make dozens of decisions and manually keep the experience visually consistent.

The underlying problem is not simply “people need an event website.”

It is:

> **People know the event they want to create, but most do not know how to turn that idea into a cohesive digital experience without doing design and software configuration work themselves.**

## 2.2 Product solution

The platform should act like an **AI creative director + event operating system**.

The host describes the event in natural language.

AI should:

- infer the event type;
- infer the intended mood and aesthetic;
- translate named references into original design attributes rather than copying protected brand assets;
- create a coherent event identity;
- suggest an appropriate visual system;
- produce three clearly different creative interpretations;
- generate the functioning event website based on the selected interpretation;
- populate the core event structure;
- keep subsequent editing simple and constrained.

The user should not need to “build a website.”

---

# 3. Positioning

## 3.1 Initial positioning

For launch, market the product around **baby showers**, not “all events.”

Suggested positioning direction:

> **The AI-powered baby shower website that designs itself.**

or

> **Describe your baby shower. We create the whole experience.**

## 3.2 Long-term platform direction

The underlying architecture should use a generic `Event` concept so the same system can later support:

- bridal showers;
- weddings;
- engagement parties;
- birthdays;
- gender reveals;
- graduations;
- housewarmings;
- religious celebrations;
- anniversaries;
- other invite-only events.

Do **not** broaden the launch UX or marketing to every event type during MVP.

---

# 4. Product Principles

These principles are requirements, not suggestions.

## 4.1 AI should remove decisions, not create more decisions

AI should make opinionated decisions on behalf of the host where it is safe to do so.

Do not turn AI into a questionnaire generator.

Do not ask the user to choose from endless:

- fonts;
- hex colors;
- card styles;
- border radii;
- spacing;
- visual motifs;
- layouts;
- button variants;
- templates.

The host should describe intent, and the system should translate intent into design.

## 4.2 AI-first, controls second

Initial creation is AI-led.

After generation, lightweight manual controls are available.

The product should **not** become Wix, Webflow, Canva, Elementor, or a free-form page builder.

## 4.3 No templates during initial creation

Do not show a template gallery before generation.

The first interaction should center on:

> **Tell us what you're planning.**

The system creates interpretations from the user's description.

## 4.4 Mobile first everywhere

The entire application must be designed **phone-first, desktop-second**.

This includes:

- landing page;
- signup/onboarding;
- AI prompt entry;
- concept selection;
- site preview;
- host/admin dashboard;
- guest management;
- registry management;
- RSVP management;
- announcements/reminders;
- guest event site;
- RSVP flow;
- registry flow.

A host must be able to build and manage the entire event from a phone.

## 4.5 Opinionated design quality

Users may customize within safe boundaries, but the system should make it difficult to create an ugly or incoherent site.

---

# 5. MVP Scope

## 5.1 In scope

### Event creation and design

- Natural-language event description
- Optional image uploads
- Optional inspiration links
- Minimal required follow-up questions
- AI-generated Event Identity
- Three initial creative concept previews
- Selection of one concept
- Full site generation from selected concept
- One full redesign allowance before publish
- Three redesign concepts if redesign is used
- Ability to keep the current design instead of selecting a redesign
- Lightweight direct editing

### Event website

- Event title/name
- Host/parent names as applicable
- Date
- Time
- Venue
- Address
- Basic event description/copy
- Standard event-detail presentation
- AI may suggest a small number of optional informational blocks inferred from the prompt, but these remain simple content blocks and do not become separate feature modules
- Event site visibility: public or private
- Private site access via password/event code
- Branded subdomain
- QR code for host distribution

### RSVP and guest management

- Manual guest entry
- CSV guest import
- Invite-only guest list
- No open/public RSVP in MVP
- Household/party grouping
- Adults and children
- Plus-ones
- RSVP deadline
- Attendance response
- Custom RSVP questions
- Meal choice
- Dietary restrictions
- Notes
- Confirmation after RSVP
- Ability for guest to update RSVP later
- Host/admin view of RSVP status

### Registry

- Add links to complete external registries, e.g. Amazon, Babylist, Target, etc.
- Add individual product links from supported/any websites
- External registries remain external destinations
- Individual native items use our reservation/purchase-confirmation flow
- Purchased status does not publicly reveal purchaser identity
- Host can manually manage native item state

### Communication

- Basic email RSVP reminders
- Basic email announcements
- No requirement for initial invitation delivery from the platform during MVP
- Host distributes event URL/QR code independently

### Roles

- Owner
- Invited co-host(s)

### Publishing

- Free to create and preview
- Payment is conceptually required to publish, but payment should be mocked/stubbed during initial build and test
- Post-publish content/operational edits are allowed
- Post-publish AI redesign is not allowed in MVP

### Post-event

- Simple event-passed state
- Simple “Thank you for coming”/event has passed message
- Registry remains accessible
- No post-event photo, thank-you-note, or memory features in MVP

---

# 6. Explicit Non-Goals for MVP

Claude/Codex/implementing agents should **not add these unless explicitly requested later**:

- drag-and-drop page builder;
- pixel-level layout editor;
- free-form design canvas;
- template marketplace;
- seating charts;
- event timeline/planning tools;
- vendor management;
- venue marketplace;
- photo galleries;
- thank-you-note manager;
- printed stationery ordering;
- invitation designer;
- initial invitation sending;
- SMS messaging;
- WhatsApp messaging;
- ticketing;
- payments from guests;
- cash funds;
- group gifting unless later specified;
- public/open RSVP;
- guest self-registration outside the invite list;
- browser extensions;
- retailer scraping as a product dependency;
- Amazon auto-sync;
- residential proxy integration;
- automatic Amazon/Babylist/Target item-level synchronization;
- unlimited AI chat/copilot;
- unlimited AI redesigns;
- AI design changes after event publish;
- version history;
- site rollback/version manager;
- autosaved historical design snapshots beyond what is strictly required to support the one allowed redesign comparison;
- custom domains in initial implementation unless trivial/stubbed;
- native mobile apps.

---

# 7. Primary User Roles

## 7.1 Owner

The owner created the event.

Owner can:

- create the event;
- enter the initial AI design prompt;
- upload inspiration;
- use the initial AI generation;
- select a concept;
- use the one allowed redesign;
- publish the event;
- manage event details;
- manage guests;
- manage RSVP configuration;
- manage registry links/items;
- manage co-hosts;
- send reminders/announcements;
- change basic styling using direct controls;
- control privacy/access;
- delete/archive event;
- eventually handle billing.

## 7.2 Co-host

A co-host is invited by the owner.

Co-host can:

- edit event details;
- manage guest list;
- import guests;
- manage RSVP details/questions;
- view RSVP responses;
- manage registry links;
- manage individual native gift items;
- send reminders/announcements if permitted by final role implementation;
- make ordinary content edits as appropriate.

Co-host **cannot**:

- enter or change the primary AI design prompt;
- trigger initial AI generation;
- trigger AI redesign;
- select AI redesign concepts;
- use AI design-generation features;
- change ownership;
- manage billing;
- delete the event unless later explicitly allowed.

AI/design-generation controls should simply not appear for co-hosts.

## 7.3 Guest

A guest:

- receives the event link/QR code from the host outside the platform;
- accesses the event site;
- enters password/event code if required;
- views event details;
- identifies their invited party/record as needed by the RSVP implementation;
- submits RSVP;
- can later update RSVP;
- browses registry;
- may leave the platform to shop an external registry;
- may reserve and purchase individually tracked native items.

---

# 8. End-to-End Host Journey

## 8.1 Landing page

The landing page should communicate the product within seconds.

Primary promise:

> **Describe your event. We create the whole experience.**

For baby-shower launch, supporting language should make clear that the system creates:

- a themed event site;
- RSVP experience;
- registry experience;

Primary CTA:

> **Create my event**

Do not lead with a template gallery.

Do not require users to understand the product architecture.

## 8.2 Account creation

Keep signup lightweight.

Requirements can be decided during implementation, but onboarding should not front-load profile configuration.

After signup, proceed directly to event creation.

## 8.3 Event creation prompt

Primary screen:

> **Tell us what you're planning.**

Large natural-language input.

Example placeholder:

> “I’m throwing a baby shower for our baby boy in December. We want it to feel like an elevated heritage country-club/lodge event — navy, cream, green, warm, classy and not overly baby-ish.”

Optional controls beneath prompt:

- `Add inspiration images`
- `Add inspiration link`

Optional uploads/links may include:

- invitation inspiration;
- decor screenshots;
- venue photos;
- Pinterest screenshots/links;
- other visual references;
- images uploaded directly by the user.

Do not make inspiration uploads required.

## 8.4 AI interpretation

Use a strong model for the initial interpretation.

The system should derive a structured **Event Identity** from the user's prompt and optional inspiration.

The AI should infer aggressively rather than immediately ask questions.

Only ask follow-up questions when information is required to create a functioning event or when ambiguity materially affects the experience.

Examples of legitimate follow-ups:

- event date;
- start/end time if required;
- venue/location;
- host/parent names;
- baby name if the host wants it shown;
- RSVP deadline;
- whether the site should be public/private.

Do not ask aesthetic questions that AI can reasonably infer.

## 8.5 Event Identity

The Event Identity is the structured design representation that powers the entire experience.

It should be stored persistently and become the reusable source for rendering rather than repeatedly sending the full original prompt/assets to a model.

Suggested conceptual fields:

```ts
EventIdentity {
  creativeDirection
  designSummary
  palette
  typographyPairing
  toneKeywords
  visualMotifs
  imageryDirection
  surfaceTreatment
  layoutPersonality
  copyTone
  motionStyle
  density
  borderTreatment
  cardTreatment
  buttonTreatment
  designConstraints
  inspirationSummary
}
```

Exact schema may change during implementation.

The important architectural rule is:

> AI outputs structured design intent; the product renderer produces the website.

Do not generate a static fake website image and try to reverse-engineer it afterward.

## 8.6 Brand/style references

If a user references a brand or recognizable aesthetic (e.g. “Ralph Lauren”), interpret it into **design attributes**, not copied proprietary assets.

Example interpretation:

- heritage;
- equestrian;
- classic Americana;
- editorial serif typography;
- navy/ivory/forest/camel palette;
- restrained plaid;
- leather/linen textures;
- understated luxury.

Do not copy logos, trademark graphics, or specific protected designs.

## 8.7 Three initial concept previews

The initial generation should produce **three genuinely different creative interpretations** of the same event.

These are not templates.

Each concept should be represented as a rendered visual preview produced from structured design data using the real component/design system.

The previews should be **images/screenshot-like mobile compositions**, not complete interactive websites.

Each preview should show enough of the design system to make the choice meaningful, such as:

- hero treatment;
- typography;
- palette;
- event-details card/treatment;
- RSVP component treatment;
- registry card treatment;
- imagery/motif direction.

Each concept should have an AI-generated descriptive name, e.g.:

- Heritage Equestrian
- Winter Estate
- Modern Country Club

The names are descriptive; they are not reusable templates.

The three options must be visually and conceptually distinct, not superficial color variants.

## 8.8 Concept selection

The owner selects one concept.

Only after selection should the system create the full event site configuration based on that Event Identity.

## 8.9 Initial site generation

Generate the functioning site with MVP sections:

1. Hero/event introduction
2. Event details
3. RSVP
4. Registry

Do not add feature-heavy sections not in MVP.

AI may create/recommend a very small number of optional informational content blocks based on the user's prompt, but keep them within standard event details and do not create standalone feature systems.

The host can hide, edit, or reorder these blocks.

## 8.10 Direct editing before publish

Allowed manual edits:

- text;
- images;
- section order;
- section visibility;
- colors within curated controls;
- typography pairing selection from curated compatible pairings;
- event details;
- RSVP configuration;
- registry links/items.

Do not expose:

- arbitrary CSS;
- spacing controls everywhere;
- arbitrary font upload;
- freeform canvas;
- drag-anything-anywhere behavior;
- pixel-level editing.

## 8.11 AI redesign allowance

Before publish, the owner gets **one full redesign allowance**.

The redesign flow:

1. Owner chooses `Try a different direction` / equivalent.
2. Owner may enter optional feedback, e.g.:
   - “Less country club, more cozy winter estate.”
   - “More modern and minimal.”
3. Strong model uses:
   - existing Event Identity;
   - original event prompt;
   - inspiration summary/assets as needed;
   - redesign feedback.
4. System generates **three new concept previews**.
5. The current selected design remains unchanged while these are reviewed.
6. User can:
   - choose one of the three new concepts; or
   - choose `Keep Current Design`.
7. Only if a new concept is explicitly selected does it replace the current design.

Because the current design remains untouched during review, there is no need for a general version-history or rollback system.

After this redesign attempt has been used, do not allow another full redesign in MVP.

## 8.12 Preview

Allow the owner to preview the guest-facing site before publish.

Prioritize mobile preview.

Desktop preview may also be available, but phone rendering is the primary design target.

## 8.13 Publish

Commercial model:

- free to create;
- free to preview;
- pay to publish.

During MVP build/test, payment is mocked/stubbed.

The publish interaction should behave as if a payment gate exists, without requiring a completed billing implementation.

Upon publish:

- event becomes accessible at its branded subdomain;
- owner receives/can copy the URL;
- owner can generate/copy/download/use a QR code;
- owner distributes invitation/link themselves.

---

# 9. Publishing and Editing Rules

## 9.1 Allowed after publish

Operational/content editing remains available after publish.

Allowed examples:

- date/time/location edits;
- event copy edits;
- image changes;
- basic color changes;
- curated typography pairing changes;
- section order;
- section visibility;
- guest additions/removals;
- RSVP settings/questions;
- registry additions/removals;
- announcements/reminders;
- privacy settings.

Changes may update the live site directly.

Do not create a complex draft/live dual-version workflow in MVP.

## 9.2 Not allowed after publish

AI full redesign is disabled after publish in MVP.

The goal is to avoid:

- design-version management;
- AI rollback complexity;
- draft/live branching;
- site-history systems;
- unnecessary inference costs.

---

# 10. AI Architecture and Cost Controls

AI cost must be treated as a product constraint from day one.

## 10.1 Strong-model usage

Use the strongest appropriate multimodal/reasoning model for:

1. Initial event/theme interpretation
2. Initial Event Identity creation
3. Three initial creative directions
4. The one allowed full redesign
5. Three redesign directions

These are the high-value creative moments.

## 10.2 Cheaper-model usage

Use smaller/cheaper models where quality is sufficient for:

- extracting structured event details from prose;
- determining whether a required field is missing;
- normalizing dates/times;
- light copy assistance if later added;
- classifying uploaded inspiration;
- converting simple user feedback into structured token changes;
- validating structured model output.

## 10.3 No-model operations

Do not call a model for ordinary editing such as:

- changing date from 1 PM to 2 PM;
- changing venue;
- hiding a section;
- reordering sections;
- selecting a predefined color adjustment;
- changing text manually;
- selecting another curated typography pairing;
- adding/removing a guest;
- adding/removing a registry URL.

## 10.4 Persistence/caching

Persist the structured Event Identity.

Do not repeatedly resend:

- the full original prompt;
- all inspiration images;
- all uploaded assets;
- the entire event history

for routine operations.

Build subsequent behavior around compact structured state.

## 10.5 AI budget model

Per event, MVP should have a predictable maximum creative-generation budget:

- 3 initial concepts
- 1 full redesign opportunity
- 3 redesign concepts if used

No unlimited `Edit with AI` loop.

No persistent AI copilot in MVP.

The guiding experience is:

> **AI creates. Simple controls refine. AI can reimagine once before publish.**

---

# 11. Guest List and RSVP

## 11.1 Guest-list philosophy

MVP RSVP is **invite-only**.

Supported host entry methods:

- manual guest entry;
- CSV import.

Do not support open/public RSVP.

A public event site may be viewable publicly, but RSVP submission must still map to an invited guest/party in the host's guest list.

## 11.2 Guest data

Suggested conceptual guest model:

```ts
GuestParty {
  id
  eventId
  displayName
  primaryContactName
  primaryEmail
  accessIdentifier
  maxAdults
  maxChildren
  plusOneAllowed
  rsvpStatus
  submittedAt
  updatedAt
}

GuestPerson {
  id
  partyId
  name
  type // adult | child | plus_one
  attendanceStatus
  mealChoice
  dietaryRestrictions
  notes
}
```

Exact implementation may differ.

## 11.3 Household/party grouping

Support household/party invitations.

Examples:

- “The Ahmed Family” invited as one party
- two named adults + two children
- named guest + optional plus-one

The RSVP UX should make it obvious who is included in the invitation.

## 11.4 RSVP configuration

Host can configure:

- RSVP deadline;
- whether plus-one is allowed per party;
- adults/children in party;
- custom questions;
- meal choices;
- dietary-restriction field;
- optional notes.

## 11.5 Guest RSVP flow

Guest journey:

1. Open event URL.
2. Enter event password/code if private.
3. View event site.
4. Select RSVP action.
5. Identify/access their invited party using the chosen invite-list mechanism.
6. See who is included in the invitation.
7. Respond attending/not attending.
8. Complete relevant party/member responses.
9. Complete custom questions, meal choices, dietary restrictions, etc.
10. Submit.
11. Receive clear confirmation.

## 11.6 RSVP confirmation

After submission show confirmation such as:

> **You're all set. We can't wait to celebrate with you.**

Confirmation should reflect the theme visually.

## 11.7 Updating RSVP

Guests must be able to return later and update their RSVP.

Do not require them to contact the host.

The implementation may use a unique link/token, guest lookup, or another low-friction secure mechanism.

## 11.8 Host RSVP dashboard

Host/co-host should be able to quickly see:

- total invited;
- attending;
- not attending;
- no response;
- adult count;
- child count;
- plus-one count;
- meal choices if enabled;
- dietary restrictions;
- responses to custom questions.

The admin dashboard is operational, not a “website editor dashboard.”

---

# 12. Event Privacy and Access

## 12.1 Visibility options

Support:

- public event site;
- private event site.

## 12.2 Private event

Private event requires an event password/code.

The goal is simple access control, not enterprise authentication.

## 12.3 RSVP remains invite-only

Even if an event site is public, MVP RSVP must remain restricted to the host-created guest list.

Do not interpret `public` as `anyone may RSVP`.

---

# 13. Registry Product Model

Registry architecture is intentionally designed to avoid dependence on scraping or unsupported retailer integrations.

There are **two separate registry content types**.

## 13.1 External registry destination

Examples:

- Amazon Baby Registry
- Babylist
- Target
- Pottery Barn Kids
- other registry URLs

Host adds the registry URL.

The event site presents the external registry in a themed, cohesive way.

The guest action is something like:

> **Shop Amazon Registry**

or

> **View Babylist Registry**

Clicking takes the guest to the external registry.

### External registry truth

The external retailer/service remains authoritative for:

- item list;
- purchase status;
- requested quantities;
- purchased quantities;
- returns;
- checkout;
- registry-specific benefits.

Our platform does **not** claim item-level synchronization for external registries in MVP.

Do not scrape/poll Amazon or other registries to keep them in sync.

Do not build retailer sync as a core dependency.

## 13.2 Individually added native item

Host can paste a direct product URL from a retailer/site.

The platform creates a native gift item card.

Possible data:

```ts
NativeRegistryItem {
  id
  eventId
  retailerName
  productUrl
  canonicalUrl
  title
  imageUrl
  priceDisplay
  requestedQuantity
  reservedQuantity
  purchasedQuantity
  status
  createdAt
  updatedAt
}
```

Product metadata extraction implementation can evolve separately.

The key distinction is that **our platform owns purchase-intent state for native items**.

## 13.3 Do not over-explain tracking differences in guest UI

Do not add heavy labels such as:

- “Tracked by us”
- “Tracked by Amazon”
- registry synchronization legends

unless user testing proves they are needed.

The interaction itself should make the difference understandable:

- external registry: `Shop Amazon Registry`
- native item: `Reserve & Buy`

Avoid unnecessary cognitive load.

---

# 14. Native Item Reservation / Honor-System Purchase Flow

Because checkout occurs on third-party sites, native item tracking is based on **reservation + guest confirmation**.

## 14.1 Item states

Conceptual states:

```text
AVAILABLE
   ↓
RESERVED
   ↓
PURCHASED
```

Other internal states may exist, but keep guest-facing language simple.

## 14.2 Reserve & Buy

Guest sees an available native gift.

Primary action:

> **Reserve & Buy**

When tapped:

1. Immediately create a reservation in our database.
2. Reduce available quantity appropriately.
3. Show other guests that the item/quantity is currently reserved/unavailable.
4. Send the guest to the external retailer product page.

Do not wait until after retailer checkout to reserve because another guest could purchase simultaneously.

## 14.3 Public reservation language

Avoid revealing the guest's identity.

Possible public states:

- `Available`
- `Someone may be buying this`
- `Purchased`

Final copy can be refined during UX work.

## 14.4 Purchase confirmation

When the guest returns to the event site, prompt:

> **Did you purchase this gift?**

Options:

- `Yes, I bought it`
- `No, release it`

If yes:

- reservation converts to purchased;
- purchased quantity increments;
- public state becomes purchased/unavailable as appropriate.

If no:

- reservation is released;
- inventory/availability returns.

## 14.5 Abandoned reservations

If the guest never confirms, reservation must expire automatically.

Recommended MVP starting point:

- reservation expiry around 24 hours.

This should be configurable later if needed.

Upon expiry:

- reservation clears;
- quantity becomes available again.

## 14.6 Quantity support

Support requested quantities greater than one.

Example:

```text
Requested: 4
Purchased: 2
Reserved: 1
Available: 1
```

Guest-facing UI does not need to expose every internal count if a simpler representation is better.

## 14.7 Host override

Owner/co-host can manually:

- mark native item purchased;
- mark native item available;
- adjust quantity;
- release reservation where appropriate.

This is the final integrity fallback.

## 14.8 Known limitation

If a guest sees a native item but later buys it directly from the retailer without using `Reserve & Buy`, our platform will not know automatically.

This is acceptable in MVP.

Do not build unsupported retailer scraping to close this gap.

The product should encourage hosts to distribute our event URL as the canonical event/registry destination.

---

# 15. Registry Guest Experience

The registry section should feel like part of the event's design system, not embedded retailer ads.

It may contain:

1. Themed external registry cards
2. Native individual item cards

The visual styling should inherit:

- Event Identity palette;
- typography;
- card treatment;
- image treatment;
- spacing/density;
- button styling.

Do not imitate retailer visual branding beyond necessary name/logo usage where legally/appropriately permitted.

---

# 16. Event Details

MVP should stay restrained.

Core event details:

- event name/title;
- date;
- time;
- venue;
- address/location;
- hosts/parents as applicable;
- event description/welcome text.

AI may infer/recommend a small number of optional information blocks from the prompt.

Examples might include a short note relevant to the event context, but **do not create a separate FAQ, parking system, dress-code system, travel module, itinerary module, etc. in MVP**.

Host can:

- edit text;
- hide optional content;
- reorder blocks.

Keep this as content, not product-module expansion.

---

# 17. Email Communication

## 17.1 Initial invitation

Not owned by the platform in MVP.

Host receives:

- event URL;
- QR code.

Host distributes via whatever invitation method they already use.

## 17.2 RSVP reminders

Host/co-host can send basic email reminders to guests who have not responded.

Example use case:

> “Reminder: please RSVP by December 1.”

## 17.3 Announcements

Host/co-host can send basic event announcements to invited guests.

Examples:

- time changed;
- venue detail updated;
- event reminder.

Keep email features basic in MVP.

Do not expand into full marketing automation.

---

# 18. Admin Dashboard

The dashboard should optimize for **running the event**, not building a website.

Mobile-first dashboard priorities:

1. RSVP summary
2. Guest responses / no-response list
3. Event details
4. Registry
5. Announcements/reminders
6. Site/design controls

Potential high-level cards:

- invited
- attending
- declined
- awaiting response

Do not overload the dashboard with analytics during MVP.

---

# 19. Design Editing

## 19.1 Direct editing

Support simple controls for:

- copy;
- imagery;
- section order;
- visibility;
- colors;
- curated typography pairings.

## 19.2 Color controls

Prefer constrained palette adjustments based on the Event Identity rather than unrestricted design-system editing.

Potential interactions:

- choose from AI-proposed alternate palette variants;
- adjust primary/accent from curated values;
- reset to AI-selected palette.

Exact UX can be decided later.

## 19.3 Typography

Do not show hundreds of fonts.

Offer curated compatible pairings.

## 19.4 No persistent AI copilot

Do not add a permanently visible AI chat assistant in MVP.

Reasons:

- inference cost;
- encourages endless redesign;
- adds UX complexity;
- conflicts with the goal that AI should remove decisions.

---

# 20. Site Structure

Recommended initial guest-site information architecture:

```text
Hero / Event Introduction
Event Details
RSVP
Registry
```

This may be presented as a single-scroll mobile-first experience, section navigation, or hybrid depending on final UX.

Avoid excessive page fragmentation.

---

# 21. Mobile-First Requirements

Design viewport priority should begin around modern mobile widths (e.g. ~390px) and expand outward.

## Host-side requirements

From a phone, owner must be able to:

- create account;
- describe event;
- upload inspiration;
- answer follow-ups;
- review three concepts;
- select a concept;
- preview site;
- edit event details;
- edit text/images;
- manage guest list;
- import CSV where mobile OS permits file selection;
- view RSVP status;
- manage registries;
- add individual product URLs;
- send reminders/announcements;
- add co-host;
- publish;
- copy URL;
- access QR code.

## Guest-side requirements

From a phone, guest must be able to:

- access public/private site;
- read event details;
- RSVP quickly;
- update RSVP;
- browse registry;
- reserve native gift;
- leave for retailer checkout;
- return and confirm purchase.

Desktop should enhance space and visibility, not introduce functionality unavailable on phone.

---

# 22. Event Lifecycle

Suggested event states:

```text
DRAFT
DESIGN_SELECTED
READY_TO_PUBLISH
PUBLISHED
PASSED
ARCHIVED (future/internal if useful)
```

Exact naming may differ.

## Draft

- event is being created;
- not publicly available;
- AI design/redesign allowed according to entitlement.

## Published

- guest site live;
- manual operational edits allowed;
- AI redesign unavailable.

## Passed

When event date/time has passed:

- show a simple post-event message, such as:
  > Thank you for celebrating with us.
- keep registry accessible.

Do not build additional post-event workflow.

---

# 23. Domain Model / Suggested Core Entities

This is conceptual baseline guidance, not a required exact schema.

## User

```ts
User {
  id
  email
  name
  createdAt
  updatedAt
}
```

## Event

```ts
Event {
  id
  ownerId
  type // baby_shower initially
  title
  description
  date
  startTime
  endTime
  venueName
  address
  timezone
  visibility // public | private
  accessCodeHash
  rsvpDeadline
  status
  slug
  publishedAt
  createdAt
  updatedAt
}
```

## EventMember

```ts
EventMember {
  eventId
  userId
  role // owner | cohost
  createdAt
}
```

## EventIdentity

Stores structured AI design intent and chosen concept.

## DesignConcept

```ts
DesignConcept {
  id
  eventId
  generationRound // initial | redesign
  conceptIndex
  name
  designSpec
  previewAsset
  selected
  createdAt
}
```

## EventSection

```ts
EventSection {
  id
  eventId
  type // hero | event_details | rsvp | registry | simple_info
  position
  visible
  content
  styleOverrides
}
```

Style overrides should stay constrained.

## GuestParty / GuestPerson

As described in RSVP section.

## RsvpResponse

May be embedded into guest entities or normalized separately.

## ExternalRegistry

```ts
ExternalRegistry {
  id
  eventId
  retailerName
  registryUrl
  displayName
  position
  visible
  createdAt
}
```

## NativeRegistryItem

As described earlier.

## GiftReservation

```ts
GiftReservation {
  id
  eventId
  itemId
  guestIdentifier
  quantity
  status // active | purchased | released | expired
  expiresAt
  purchasedAt
  createdAt
  updatedAt
}
```

Do not publicly expose purchaser identity.

## Announcement

```ts
Announcement {
  id
  eventId
  subject
  body
  audience
  sentAt
  createdBy
}
```

---

# 24. Permissions Matrix

| Capability | Owner | Co-host | Guest |
|---|---:|---:|---:|
| View event | Yes | Yes | Yes |
| Edit event details | Yes | Yes | No |
| Manage guests | Yes | Yes | No |
| Import CSV | Yes | Yes | No |
| Manage RSVP questions | Yes | Yes | No |
| View RSVP responses | Yes | Yes | Own party only |
| Add external registry | Yes | Yes | No |
| Add native items | Yes | Yes | No |
| Manage native item status | Yes | Yes | No |
| Send reminders/announcements | Yes | Yes* | No |
| Change basic text/images | Yes | Yes, if allowed by final UX | No |
| Trigger initial AI generation | Yes | No | No |
| Trigger AI redesign | Yes | No | No |
| Select redesign | Yes | No | No |
| Publish | Yes | No by default | No |
| Manage co-hosts | Yes | No | No |
| Billing | Yes | No | No |

`*` Co-host announcement permission may be implemented as allowed by default for MVP unless a reason emerges to restrict it.

---

# 25. Important UX Rules

## 25.1 Never expose implementation complexity

Do not tell users about:

- structured Event Identity;
- renderer architecture;
- model tiers;
- inference budgets;
- registry synchronization limitations in technical terms;
- scraping;
- background data model.

Use natural product language.

## 25.2 Don't create configuration fatigue

Avoid setup wizards with dozens of mandatory steps.

Prefer:

1. user describes event;
2. AI infers;
3. ask only what is missing;
4. show concepts;
5. generate.

## 25.3 Don't overbuild empty states

Keep operational UI clean and direct.

## 25.4 Guests should not need accounts

MVP guest RSVP and gift flows should not require creating a platform account unless later proven necessary.

Use secure event/party tokens, codes, or lightweight guest identification instead.

---

# 26. Safety / Integrity / Privacy Expectations

- Do not expose purchaser identity publicly.
- Secure private-event passwords/codes appropriately.
- Do not store plaintext passwords if avoidable.
- Do not expose guest lists publicly.
- Limit guest access to their own RSVP/party information.
- Co-host access must be explicit invitation-based.
- Do not rely on retailer scraping or bot-evasion systems.
- Do not collect retailer credentials.
- Never request an Amazon password or retailer login.
- External checkout remains on retailer sites.

---

# 27. Payment / Monetization Placeholder

Business model direction:

- free to create;
- free to generate concepts;
- free to preview;
- payment required to publish.

For initial implementation:

- mock/stub the payment gate;
- allow internal/test users to simulate a successful purchase;
- do not spend significant MVP effort on final pricing/billing architecture yet.

Future pricing ideas are out of scope for this baseline build unless separately specified.

---

# 28. Analytics Worth Instrumenting From Day One

Keep instrumentation lightweight but useful.

Suggested events:

```text
landing_cta_clicked
signup_completed
event_creation_started
initial_prompt_submitted
inspiration_uploaded
followup_question_answered
concepts_generated
concept_selected
redesign_started
redesign_concepts_generated
redesign_selected
kept_current_design
preview_opened
publish_gate_opened
event_published
guest_added
csv_import_completed
rsvp_started
rsvp_completed
rsvp_updated
external_registry_added
external_registry_clicked
native_item_added
native_item_reserved
native_item_purchase_confirmed
native_item_reservation_released
native_item_reservation_expired
announcement_sent
reminder_sent
```

Do not build an analytics dashboard for users in MVP.

---

# 29. MVP Success Criteria

The MVP succeeds if a non-technical host can:

1. Land on the product and understand what it does quickly.
2. Describe the baby shower in natural language.
3. Optionally upload inspiration without being required to.
4. Answer only a few required follow-up questions.
5. Receive three clearly differentiated, high-quality concepts.
6. Select one without needing design expertise.
7. Receive a complete functioning event site.
8. Make simple edits without entering a page builder.
9. Add guests manually or via CSV.
10. Configure and receive RSVP responses.
11. Add external registry links.
12. Add individual products by URL.
13. Let guests reserve/confirm native gift purchases.
14. Preview the entire experience on a phone.
15. Publish via mocked payment flow.
16. Share one event URL/QR code.
17. Manage the event from a phone after publishing.

A successful first-time host should feel:

> “I described what I wanted and it basically built the event for me.”

Not:

> “I learned how to use another website builder.”

---

# 30. Acceptance Criteria by Major Feature

## AI creation

- [ ] User can submit natural-language event description.
- [ ] Inspiration image upload is optional.
- [ ] Inspiration links are optional.
- [ ] System asks only required follow-up questions.
- [ ] Event Identity is stored structurally.
- [ ] Three initial concept previews are generated.
- [ ] Concepts are materially different.
- [ ] Concept previews use actual design-system rendering, not fake static website mockups generated as images.
- [ ] Owner can select one.
- [ ] Full site is created from selected concept.

## Redesign

- [ ] Owner has exactly one full redesign allowance in MVP.
- [ ] Optional redesign feedback can be entered.
- [ ] Three new concept previews are generated.
- [ ] Current design remains unchanged during review.
- [ ] Owner may choose a new concept or keep current design.
- [ ] No additional full redesign can be triggered afterward.
- [ ] Co-host cannot access redesign controls.
- [ ] AI redesign unavailable after publish.

## Manual editing

- [ ] Text editable.
- [ ] Images editable.
- [ ] Section order editable.
- [ ] Section visibility editable.
- [ ] Color adjustments available within constrained controls.
- [ ] Curated typography pairing adjustments available.
- [ ] No free-form page builder exists.

## RSVP

- [ ] Guest can be manually added.
- [ ] Guests can be imported via CSV.
- [ ] Household/party grouping works.
- [ ] Plus-one support works.
- [ ] Adult/child support works.
- [ ] RSVP deadline configurable.
- [ ] Meal choice configurable.
- [ ] Dietary restriction input configurable.
- [ ] Custom questions configurable.
- [ ] Guest receives RSVP confirmation.
- [ ] Guest can update RSVP later.
- [ ] Host sees attending/declined/no-response counts.
- [ ] Open/public RSVP is not available.

## Registry

- [ ] Host can add complete external registry URL.
- [ ] External registry is displayed as themed destination.
- [ ] Clicking external registry opens retailer/service.
- [ ] Platform does not claim item-level sync for external registry.
- [ ] Host can add individual product URL.
- [ ] Native item can be reserved before retailer redirect.
- [ ] Reservation prevents/conflicts with simultaneous purchase intent appropriately.
- [ ] Guest can confirm purchase.
- [ ] Guest can release reservation.
- [ ] Reservation expires automatically.
- [ ] Purchased state hides purchaser identity.
- [ ] Host/co-host can manually override native status.

## Privacy

- [ ] Event can be public or private.
- [ ] Private event supports password/code.
- [ ] RSVP remains invite-only in either visibility mode.
- [ ] Guest list is not publicly exposed.

## Roles

- [ ] Owner can invite co-host.
- [ ] Co-host can manage operational event data.
- [ ] Co-host cannot access AI generation/redesign.
- [ ] Co-host cannot manage billing/ownership.

## Publishing

- [ ] User can preview before publish.
- [ ] Payment gate is mocked.
- [ ] Event can be published after simulated successful payment.
- [ ] Published event receives branded subdomain.
- [ ] URL can be copied.
- [ ] QR code available.
- [ ] Content/operational edits allowed after publish.
- [ ] AI redesign disabled after publish.

## Mobile

- [ ] Entire host creation flow usable at mobile width.
- [ ] Admin dashboard usable at mobile width.
- [ ] Guest RSVP usable at mobile width.
- [ ] Registry usable at mobile width.
- [ ] No critical feature is desktop-only.

---

# 31. Implementation Guardrails for Coding Agents

When using this specification with Claude, Codex, or other agents:

1. **Do not add features simply because they are conventional for event apps.**
2. **Do not add a template gallery.**
3. **Do not add unlimited AI editing.**
4. **Do not add version history or rollback architecture.**
5. **Do not add browser extensions.**
6. **Do not add retailer scraping or anti-bot workarounds.**
7. **Do not turn external registries into synchronized item-level replicas.**
8. **Do not require guests to create accounts.**
9. **Do not optimize desktop before mobile.**
10. **Do not expose low-level website-builder controls.**
11. **Do not broaden the launch to all event categories in the UI/marketing.**
12. **Do keep the underlying domain model generic enough to support future event types.**
13. **Do store structured AI output and render from it.**
14. **Do use strong models only where high-value creative reasoning is needed.**
15. **Do use cheaper/no-model solutions for deterministic tasks.**
16. **Do keep the admin dashboard operational rather than design-centric.**
17. **Do make the smallest implementation that satisfies the MVP requirements.**

If an implementation decision conflicts with the principle below, stop and reconsider it:

> **AI should remove decisions, not create more decisions.**

---

# 32. Deferred Product Opportunities

These are intentionally deferred but may become future roadmap items:

- broader event types;
- custom domains;
- SMS;
- invitations generated from Event Identity;
- invitation sending;
- matching print assets;
- welcome signs;
- menus;
- thank-you cards;
- photo galleries;
- post-event thank-you workflows;
- universal registry deeper integrations;
- retailer partnerships;
- supported retailer auto-sync;
- gift funds/group gifting;
- advanced AI edits/credits;
- concierge design tier;
- custom event identity collateral;
- event planning/operations beyond details, RSVP and registry.

These should not leak into MVP implementation unless separately approved.

---

# 33. Canonical MVP Flow Summary

```text
LANDING PAGE
    ↓
CREATE ACCOUNT
    ↓
“Tell us what you're planning”
    ↓
Natural-language description
+ optional inspiration images/links
    ↓
AI infers event + creative direction
    ↓
Minimal required follow-up questions
    ↓
Structured Event Identity
    ↓
3 distinct visual concept previews
    ↓
Owner chooses 1
    ↓
Full site generated
    ↓
Host adds/edits:
  • event details
  • guest list / CSV
  • RSVP settings
  • external registries
  • individual gift links
    ↓
Lightweight direct design/content edits
    ↓
OPTIONAL: one full redesign request
    ↓
3 new concept previews
    ↓
Choose one OR keep current design
    ↓
Mobile-first preview
    ↓
Mock payment gate
    ↓
PUBLISH
    ↓
Branded URL + QR code
    ↓
Host distributes invitation/link externally
    ↓
Guests visit site
    ↓
Event details + RSVP + registry
    ↓
Host manages RSVPs/registry/reminders from mobile admin
    ↓
Event passes
    ↓
Simple thank-you/event-passed state
Registry remains accessible
```

---

# 34. North Star

The product is successful when someone with **zero design skill and zero event-software knowledge** can describe the event they are imagining and receive a beautiful, functioning, cohesive event experience in minutes.

The user should spend their time thinking about **their event**, not configuring software.

> **AI should remove decisions, not create more decisions.**

