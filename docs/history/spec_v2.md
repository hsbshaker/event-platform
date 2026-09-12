# AI-Native Event Website + RSVP + Registry Platform

**Document:** Product Requirements Document (PRD) / `spec.md`
**Status:** Revision 2 — MVP baseline for implementation
**Initial launch vertical:** Baby showers
**Platform architecture:** Event-generic, baby-shower-first
**Primary build principle:** **AI should remove decisions, not create more decisions.**

---

## 0. What changed in Revision 2

This revision replaces the baseline PRD after a pressure-test review. Implementing agents should treat this document as authoritative; where it conflicts with the earlier baseline, this document wins.

| Area | Baseline | Revision 2 |
| --- | --- | --- |
| Concept previews | "Images/screenshot-like compositions" | Live components rendered by the production renderer in a scaled frame. No screenshots. |
| Site generation | Separate step after concept selection | Removed. Selecting a concept persists its `DesignSpec`. There is no generation step. |
| Layout | Unspecified | Explicit archetype library (6 hero archetypes, 2–3 treatments per section). AI returns IDs, not layout prose. |
| Concept diversity | Prompt instruction only | Enforced in code as hard constraints with deterministic repair. |
| Redesign allowance | Exactly one before publish | Effectively unlimited during alpha/beta; backend spend limits; commercial limits set from observed data. All generated concepts stay browsable. |
| Site imagery | Unspecified | Host-uploaded only. Every archetype must render without a photo. No generated imagery in MVP (deliberate deferral). |
| Inspiration input | Images and links | Image uploads (including screenshots of Pinterest boards). Links are best-effort only; Pinterest board URLs are not supported. |
| Waiting for generation | Unspecified | Generation starts on prompt submit; required follow-up questions are asked while it runs. Parallel concept calls, streamed reveal, explicit latency targets. |
| Guest identification | Deferred | Name lookup, with optional SMS one-time-code verification when a phone is on file, and a texted magic link for later updates. |
| Guest communication | Email only | Phone preferred, email optional fallback, both optional at import. SMS is the primary channel under host-attested consent. |
| Registry content types | External registry + native item | Adds a display-only cash fund card. |
| Native item metadata | "Can evolve separately" | One host-initiated fetch at add time, prefilled form, manual entry as the primary path for Amazon. |
| Reservation | Reserve → confirm → 24h expiry | Same shape, 72h fixed expiry. No nudges, click logs, or reconciliation in V1. |
| Private event gate | Unspecified | Hero visible (title, hosts, date); everything else locked. Fixed rule, `noindex`. |
| Pricing | Placeholder | $49 one-time, pay to publish. Real price shown on the mocked gate from day one. |
| Co-host permissions | Two "if allowed by final UX" punts | Near-parity with owner: content, guests, RSVP, registry, communications, direct design controls, redesign, and concept selection. Owner-only: publish, billing, co-host management, delete/ownership. |
| Post-event | Passed state | Unchanged. No cancel toggle; a host edits the date to the past. No refunds, no ownership transfer. |
| Growth | Unspecified | Guest site carries a tasteful "made with" footer line. The guest site is the referral surface. |

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
- Optional inspiration image uploads
- Optional inspiration links (best-effort)
- Minimal required follow-up questions, asked while generation runs
- AI-generated Event Identity (creative brief)
- Three concept previews rendered live by the production renderer
- Selection of one concept, which persists its `DesignSpec`
- Redesign rounds ("Try a different direction") with optional feedback, producing three new concepts each round
- Gallery of all previously generated concepts for the event, any of which can be selected
- Ability to keep the current design instead of selecting a new concept
- Lightweight direct editing

**Event website**

- Event title/name
- Host/parent names as applicable
- Date, time, venue, address
- Basic event description/copy
- AI may suggest a small number of optional informational content blocks inferred from the prompt; these remain simple content blocks, not feature modules
- Visibility: public or private
- Private access via event code; hero remains visible, everything else locked
- Branded subdomain
- QR code for host distribution
- "Made with" footer line

**RSVP and guest management**

- Manual guest entry
- CSV guest import
- Invite-only guest list; no open/public RSVP
- Household/party grouping; adults and children; plus-ones
- RSVP deadline
- Attendance response, custom questions, meal choice, dietary restrictions, notes
- Guest identifies their party by name lookup
- Optional SMS one-time-code verification when a phone is on file
- Confirmation after RSVP; texted magic link for later updates when a phone is on file
- Guest can update RSVP later
- Host/co-host RSVP dashboard

**Registry**

- External registry links (Amazon, Babylist, Target, etc.) presented as themed destinations
- Individually added native items by product URL, with add-time metadata fetch and manual entry
- Native items use the reserve → confirm → purchased flow with 72h expiry
- Purchased status never reveals purchaser identity publicly; host can see it
- Cash fund card (display only: handle, suggested amounts, blurb)
- Host can manually manage native item state

**Communication**

- SMS reminders to non-responders and SMS announcements, under host-attested consent
- Email as fallback when a guest has email but no phone
- Initial invitation delivery is outside the platform; host distributes URL/QR code independently

**Roles**

- Owner
- Invited co-host(s)

**Publishing**

- Free to create, generate, and preview
- $49 to publish; payment gate mocked during initial build
- Post-publish content/operational edits allowed
- Post-publish AI redesign not allowed

**Post-event**

- Simple event-passed state with a thank-you message
- Registry remains accessible

### 5.2 Explicit non-goals for MVP

Implementing agents must **not** add these unless explicitly requested later:

- drag-and-drop page builder, pixel-level layout editor, free-form design canvas;
- template gallery or template marketplace;
- seating charts, event timeline/planning tools, vendor management, venue marketplace;
- photo galleries, thank-you-note manager, printed stationery, invitation designer, initial invitation sending;
- WhatsApp messaging;
- ticketing, payments from guests, group gifting;
- public/open RSVP, guest self-registration outside the invite list;
- browser extensions, bookmarklets;
- retailer scraping as a product dependency, Amazon auto-sync, residential proxy integration, item-level synchronization of external registries;
- AI-generated imagery or illustration (deliberately deferred; see §11.7);
- Pinterest board URL ingestion;
- persistent AI chat/copilot, token-level "edit with AI";
- AI design changes after publish;
- a version-history or rollback *system* (the concept gallery in §8.11 is not one);
- reservation nudges, click logs, purchase reconciliation;
- cancel/unpublish toggle, refunds, ownership transfer;
- custom domains unless trivial/stubbed;
- native mobile apps;
- user-facing analytics dashboards.

---

## 6. Primary User Roles

There are no additional personas in MVP. The three roles below are complete.

Owner and co-host have **near-parity** on event management. Do not divide them into a "design host" and an "operations host." The only owner-only actions are account- and ownership-sensitive.

### 6.1 Owner

The owner created the event. Owner can do everything, including:

- create the event and enter the initial design prompt;
- upload inspiration;
- generate, redesign, and select concepts;
- publish (payment is tied to publish);
- manage event details, guests, RSVP configuration, registry, communications;
- change styling using direct controls;
- control privacy/access;
- manage co-hosts;
- delete/archive the event;
- handle billing and, if ever added, ownership transfer.

### 6.2 Co-host

Invited by the owner. Co-host can do **everything except the owner-only actions below**:

- edit event details, text, and images;
- manage guest list and import CSV;
- manage RSVP settings and questions; view and manage responses;
- manage external registries, native items, and the cash fund card;
- send reminders/announcements;
- use direct design controls (colors, typography pairing, section order and visibility);
- generate redesign concepts before publish;
- select concepts before publish, including from the gallery.

Co-host **cannot**:

- publish;
- manage billing/payment;
- manage co-host access;
- delete the event;
- transfer ownership, if that is ever added.

Co-hosts join after creation, so the initial prompt and initial generation are inherently the owner's. Everything after that is shared. Publishing is owner-only in MVP only because payment is tied to it; if co-hosts should be true operational equals, allow them to publish once the event has already passed the payment gate.

### 6.3 Guest

- receives the event link/QR code from the host outside the platform;
- opens the site; enters the event code if private;
- views event details;
- finds their party by name lookup; optionally verifies by SMS code;
- submits and later updates RSVP;
- browses registry; leaves to shop an external registry; reserves and confirms native items;
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

- `Add inspiration images` — uploads of any images: invitation inspiration, decor screenshots, venue photos, screenshots of Pinterest boards, other references.
- `Add inspiration link` — best-effort only. The system attempts a single metadata/preview fetch; if it fails, the link is stored as text context. Do not promise Pinterest board ingestion; most boards require login and block server fetches.

Inspiration is never required.

### 7.4 Generation starts immediately; follow-ups run in parallel

On prompt submit, generation begins **immediately**. While it runs, the system asks only the follow-up questions required to make a functioning event:

- event date;
- start time (end time optional);
- venue/location;
- host/parent names;
- baby name if the host wants it shown;
- RSVP deadline;
- public or private.

Skip any question the prompt already answered. These answers do not affect aesthetics, so they can be collected while concepts generate. Do not ask aesthetic questions that AI can infer.

### 7.5 Event Identity (creative brief)

A strong model derives a structured **Event Identity** from the prompt and inspiration. It is the creative brief, stored persistently and reused for every later generation instead of re-sending the original prompt and assets.

```ts
EventIdentity {
  creativeDirection      // one-paragraph summary
  toneKeywords[]
  paletteIntent          // named colors, constraints (e.g. "navy/cream/green only")
  colorsExplicitlyConstrained: boolean
  visualMotifs[]         // from the motif vocabulary (§11.4)
  imageryDirection
  typographyDirection
  copyTone
  designConstraints[]    // e.g. "not cheesy", "not overly baby-ish"
  inspirationSummary     // text summary of uploaded images
}
```

The Event Identity is streamed to the client as it is produced (§7.7).

### 7.6 Brand/style references

If a user references a brand or recognizable aesthetic (e.g. "Ralph Lauren"), interpret it into **design attributes**: heritage, equestrian, classic Americana, editorial serif typography, navy/ivory/forest/camel palette, restrained plaid, leather/linen textures, understated luxury. Never copy logos, trademark graphics, or specific protected designs.

### 7.7 The wait

Concept generation must not feel like loading. In order of priority:

1. **Hide the wait behind the follow-ups.** Questions from §7.4 are asked while concepts generate.
2. **Parallelize and stream.** One call produces the Event Identity; three parallel calls each produce one `DesignSpec`, seeded with a forced-distinct direction. Each concept renders the moment its spec arrives.
3. **Show the brief being written.** Stream the Event Identity: concept names, tone keywords, palette swatches fading in.
4. **Skeleton with copy** as the fallback only.

**Latency targets** (agents must meet these, not approximate them):

| Milestone | Target |
| --- | --- |
| Event Identity visible | ≤ 5 s |
| First concept rendered | ≤ 15 s |
| All three concepts rendered | ≤ 45 s |

### 7.8 Three concept previews

Each concept is a `DesignSpec` (§11.2) rendered by the **production renderer** inside a scaled frame at mobile width. Previews are live components, not screenshots and not images.

Provisional content uses whatever the prompt and follow-ups already provided (names, date, venue). Placeholders fill only what is still missing, so the preview reads as *their* site.

Each concept has an AI-generated descriptive name and one-line description, e.g. Heritage Editorial, Winter Estate, Modern Club. These names are the only free-text creative output the user sees; everything else in the spec is IDs and values.

The three concepts must be materially different (§11.5).

### 7.9 Concept selection is the site

The owner (or a co-host, after creation) selects one concept. Selection **persists that concept's `DesignSpec`** as the event's active design and the renderer populates it with actual event data. There is no separate "generate the website" step. Sections 8.8 and 8.9 of the baseline are collapsed into this one action.

Initial sections: Hero, Event Details, RSVP, Registry. AI may add a very small number of optional informational content blocks derived from the prompt; the host can hide, edit, or reorder them.

### 7.10 Direct editing before publish

Allowed: text; images; section order; section visibility; colors within curated controls; typography pairing from curated compatible pairings; event details; RSVP configuration; registry links/items/fund.

Not exposed: arbitrary CSS; spacing controls; font upload; freeform canvas; drag-anything-anywhere; pixel-level editing.

### 7.11 Redesign

Before publish, the owner or a co-host can choose **Try a different direction** as many times as backend limits allow (§10). The user never sees a credit count or a remaining-generations counter.

Flow:

1. Owner or co-host optionally enters feedback ("Less country club, more cozy winter estate.").
2. Strong model uses the Event Identity, the current `DesignSpec`, the list of previously shown concept combinations, and the feedback.
3. Three new concepts are generated. Previously shown hero-archetype + tonal-direction combinations are excluded by the backend, not just by the prompt, so repeated rounds do not cycle the same looks.
4. The current design remains unchanged while the new concepts are reviewed.
5. Owner or co-host selects a new concept or **Keep Current Design**.

**Concept gallery.** Every concept ever generated for the event remains browsable and selectable. Concepts are small JSON specs rendered client-side, so retaining them is free. This gives the host "go back to round two's concept" without building a versioning system. Do not delete old concepts to honor the "no version history" non-goal; that non-goal refers to a history/rollback *system*, not to retained specs.

**Granularity.** Redesign is always concept-level: three new directions plus optional feedback. There is no token-level or chat-level "make the button rounder" loop. Agents will drift toward building a chat; do not.

### 7.12 Preview

Owner or co-host previews the guest-facing site before publish. Mobile preview is primary; desktop preview may be available.

### 7.13 Publish

Publish is gated by the $49 payment. During MVP build the gate is mocked, but it displays the real price and behaves as if payment exists (§28).

Upon publish:

- event becomes accessible at its branded subdomain;
- owner can copy the URL;
- owner can view/copy/download the QR code;
- owner distributes the link themselves.

---

## 8. Publishing and Editing Rules

### 8.1 Allowed after publish

Date/time/location edits; copy edits; image changes; curated color changes; typography pairing changes; section order and visibility; guest additions/removals; RSVP settings/questions; registry additions/removals; cash fund edits; announcements/reminders; privacy settings.

Changes update the live site directly. No draft/live dual-version workflow.

### 8.2 Not allowed after publish

AI redesign and concept selection are disabled after publish. The concept gallery becomes read-only.

### 8.3 Cancellation

There is no cancel or unpublish toggle in MVP. A host whose event is cancelled edits the date to the past and the passed state (§22) takes over. No refunds. No ownership transfer.

---

## 9. AI Architecture and Cost Controls

AI cost is a product constraint from day one.

### 9.1 Strong-model usage

Use the strongest appropriate multimodal/reasoning model for:

1. Event Identity creation from prompt and inspiration
2. Each concept `DesignSpec` (initial and redesign rounds)

These are the only strong-model calls.

### 9.2 Cheaper-model usage

Use smaller/cheaper models where quality is sufficient for:

- extracting structured event details from prose;
- determining whether a required field is missing;
- normalizing dates/times;
- summarizing uploaded inspiration images into text.

### 9.3 No-model operations

Never call a model for: changing date/time/venue; hiding or reordering sections; selecting a curated color or typography adjustment; editing text; adding/removing guests, registry URLs, or native items; **validating model output** (that is a schema, §11.6); deriving contrast (that is code, §11.6); enforcing concept diversity (code, §11.5).

### 9.4 Persistence

Persist the Event Identity and every `DesignSpec`. Do not re-send the original prompt, inspiration images, or event history for routine operations. Redesign calls receive the Event Identity, the current spec, the exclusion list, and the new feedback only.

---

## 10. Generation Limits

During alpha/beta, creative redesigns are effectively unlimited from the user's perspective. Do not expose credits or remaining-generation counters.

Enforce **configurable backend** limits:

- per-account concurrency (one generation in flight at a time);
- per-event and per-account daily generation caps;
- global spend ceiling with alerting;
- anti-abuse (rate limits, signup throttling).

Instrument every generation (§29). Use observed generation behavior, conversion, and actual AI cost of goods to set commercial launch limits. Do not impose an arbitrary user-facing cap before testing.

The guiding experience:

> **AI creates. Simple controls refine. AI can reimagine before publish.**

---

## 11. Design System and Rendering Architecture

This section is the core architectural contract.

### 11.1 The rule

> AI chooses and configures from a constrained but expressive library of live design primitives. It does not generate arbitrary page layouts. Concept previews use the production renderer itself. Selecting a concept persists its `DesignSpec`; there is no separate website-generation step. Concept diversity is enforced programmatically, not solely through model instructions. Every archetype renders without a photo.

### 11.2 DesignSpec

The model returns **IDs and values**, never layout prose.

```json
{
  "name": "Heritage Editorial",
  "description": "Dark navy dominant, split hero, traditional serif, structured spacing.",
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
  "imageTreatment": "editorial",
  "motifs": ["plaid_restrained", "equestrian_line"],
  "ornamentation": "restrained",
  "borderTreatment": "hairline",
  "cardTreatment": "flat_bordered",
  "buttonTreatment": "solid_rounded_sm"
}
```

Every field except `name`, `description`, and palette hex values is an enum defined in code. Exact enum names may change during implementation; the shape does not.

### 11.3 Hero archetypes (MVP library)

Six archetypes. Not dozens.

| ID | Description | Without a photo |
| --- | --- | --- |
| `editorial_split` | Image on one side, typography/details on the other | Image slot becomes a motif/pattern panel |
| `centered_statement` | Large centered title, decorative motif background, CTA below | Native (no image needed) |
| `full_bleed_image` | Large visual background with overlaid event information | Background becomes texture/gradient with motif |
| `framed_invitation` | Hero composed like a physical invitation card | Native |
| `typography_first` | Minimal imagery, large expressive typography, whitespace | Native |
| `layered_editorial` | Image with overlapping content card | Image slot becomes a motif/pattern panel |

**Every archetype must render as a finished design with no host-uploaded photo.** Most hosts will not upload one. A host who uploads a photo later does not change archetype; the slot fills.

### 11.4 Section treatments and motif vocabulary

Each MVP section has 2–3 treatments:

- **Event Details:** `structured_cards`, `stacked_editorial`, `split_panel`
- **RSVP:** `standalone_cta_panel`, `embedded_card`, `contrast_panel`
- **Registry:** `retailer_tiles`, `card_grid`, `featured_blocks`

**Motifs** are an enumerated vocabulary of vector assets and textures maintained in code (e.g. `plaid_restrained`, `gingham`, `botanical_line`, `stripe_classic`, `deco_border`, `linen_texture`, `equestrian_line`). Because site imagery is host-uploaded only, motifs, typography, palette, and archetype carry all of the visual distinctness. The motif library is a design deliverable, not an afterthought. The model picks motifs from the vocabulary; it does not invent them.

**Typography pairings** are an enumerated list of curated compatible pairs using self-hosted or Google Fonts.

### 11.5 Concept diversity, enforced in code

Three concepts must be materially different. Enforce after the model responds, as **hard constraints**:

1. Distinct `heroArchetype` across all three.
2. Distinct `tonalDirection` (light / dark / mid) across all three.
3. Different palette family **only when the prompt leaves color open** (`colorsExplicitlyConstrained == false`). When colors are explicitly constrained ("navy, cream, and forest green only"), honor them and vary **dominance and contrast** within those colors instead. Never violate the user's explicit color direction to satisfy diversity.
4. Preferably distinct typography pairing category, unless it conflicts with the prompt.

Worked example for a Ralph Lauren-style prompt, all honoring navy/cream/green:

- **Heritage Editorial** — navy dominant, `editorial_split`, traditional serif, structured spacing.
- **Winter Estate** — cream dominant, `framed_invitation`, softer serif, botanical/equestrian accents.
- **Modern Club** — white/cream dominant with navy accents, `typography_first`, oversized type, restrained ornament.

**Repair is deterministic and free.** If constraints fail, the backend swaps the colliding concept's archetype (or tonal direction) to the next eligible value rather than calling the model again. At most one model retry. Never show three near-identical concepts.

**Redesign exclusions.** Each redesign round receives the list of previously shown `heroArchetype + tonalDirection` combinations and the backend excludes them unless the eligible set is exhausted.

A weighted diversity score (hero heavily weighted, tonal direction heavily, typography medium, section treatments medium, palette distance contextual) may replace the hard rules once real outputs have been observed. Start with the hard rules.

### 11.6 Validation and contrast are code, not models

- Validate every `DesignSpec` with structured output against the enum schema. Map any unknown ID to a default in code.
- The model picks palette hex values; the renderer **derives** text-on-primary, text-on-surface, button states, and borders with a contrast check that adjusts rather than rejects. No concept can render unreadable text.

### 11.7 Imagery

- **Site imagery is host-uploaded only.** No stock, no AI-generated imagery in MVP.
- **Why generated imagery is excluded:** it is deferred, not forbidden. A single generated hero illustration per concept would be the largest quality lever available and costs cents; it is excluded from MVP to keep scope and brand-safety review small. Revisit after launch.
- **Inspiration imagery** (uploads) feeds the Event Identity only and never appears on the site.

### 11.8 Testing

Because archetypes and treatments are enumerable, the visual test suite is a matrix: every hero archetype × with/without photo × each tonal direction × each density, plus every section treatment. Render the matrix at mobile and desktop widths and diff it in CI. This is the primary defense against a redesign breaking mobile.

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
  phone?                 // preferred contact field
  email?                 // optional fallback
  contactConsentSource   // host_attested | guest_confirmed | none
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
  type                   // adult | child | plus_one
  attendanceStatus
  mealChoice
  dietaryRestrictions
  notes
}
```

Both phone and email are optional. Hosts may import guests with neither.

### 12.3 Household/party grouping

Support party invitations: a family as one party; two named adults plus children; a named guest plus optional plus-one. The RSVP UX makes it obvious who is included.

### 12.4 RSVP configuration

Host configures: deadline; plus-one per party; adults/children per party; custom questions; meal choices; dietary-restriction field; optional notes.

### 12.5 Guest identification: name lookup

This is the wedding-website convention and the MVP mechanism.

1. Guest opens the RSVP section and types their name.
2. Fuzzy match against party members. On collision, ask for a last name.
3. After a match, show **first names only** of the party members. Never show contact info.
4. **Optional SMS verification.** If the party has a phone on file, offer "Verify it's you" with a one-time code to that number. The host can require this for private events. A party without a phone falls back to plain name lookup. Because the guest initiates the code, this does not depend on consent status.
5. Guest responds attending/not attending per member, completes questions, submits.

### 12.6 Confirmation and updates

After submission show a themed confirmation:

> **You're all set. We can't wait to celebrate with you.**

If a phone is on file, text a **magic link** to the guest so they can update their RSVP later without repeating lookup. Guests without a phone update via name lookup again. Guests never need to contact the host to change a response.

### 12.7 Host RSVP dashboard

Host/co-host sees: total invited; attending; not attending; no response; adult, child, and plus-one counts; meal choices; dietary restrictions; custom-question responses; and **guests with no contact info**, so the host knows who they must chase by hand.

---

## 13. Guest Communication

### 13.1 Channels

- Phone and email are both **optional** guest contact fields; **phone is the preferred/default**.
- **SMS is the primary channel** when the guest has a phone on file and consent is satisfied (§13.2).
- **Email is the fallback** for guests with email but no phone.
- Guests with neither receive nothing; the dashboard surfaces them (§12.7).
- Initial invitations remain outside the platform.

### 13.2 Consent

The main use of SMS is reminding guests who have not responded, and those guests have never interacted with the platform. Guest-confirmed consent therefore cannot be a precondition for reminders.

MVP consent model:

- **Host attestation at import:** "I have permission to contact these guests about this event." Recorded per import.
- **STOP handling** on every message; opt-outs are honored immediately and shown to the host.
- **Per-event message cap** (configurable, small; e.g. five host-initiated sends per event) so no event becomes a spam campaign.
- Messages are transactional and event-specific only.
- A guest who RSVPs or requests a verification code upgrades their record to `guest_confirmed`.

### 13.3 Operational notes

- US A2P 10DLC registration takes days to weeks and requires a business entity. Start it before it is needed.
- Carriers filter link-heavy messages from new senders; keep messages short with one link.
- International numbers are out of scope unless trivial.
- Per-message cost is absorbed by the publish fee.

### 13.4 Reminders and announcements

- **Reminders:** to non-responders only. "Reminder: please RSVP by December 1."
- **Announcements:** to all invited guests. Time changed, venue detail updated, event reminder.

Keep these basic. No marketing automation.

---

## 14. Event Privacy and Access

### 14.1 Visibility

Public or private.

### 14.2 Private event gate

A private event requires an event code. The gate is a **fixed rule with nothing for the host to configure**:

- **Visible before the code:** the hero, showing event name, hosts, and date.
- **Locked behind the code:** venue address, event details, RSVP, registry, cash fund.

The locked hero is the referral surface and must look finished. Private events carry `noindex`.

### 14.3 RSVP remains invite-only

`public` never means `anyone may RSVP`.

---

## 15. Registry Product Model

Three registry content types. No scraping, no sync.

### 15.1 External registry destination

Host adds a registry URL (Amazon, Babylist, Target, Pottery Barn Kids, etc.). The site presents it as a themed card with an action like **Shop Amazon Registry**. Clicking leaves to the retailer.

The retailer remains authoritative for item list, purchase status, quantities, returns, checkout, and benefits. The platform does not claim item-level synchronization and never polls or scrapes to sync.

### 15.2 Native item

For gifts that are not on a registry (an Etsy blanket, a boutique crib, a local shop item, anything not on Amazon), the host pastes a product URL and the platform creates a native gift card.

```ts
NativeRegistryItem {
  id
  eventId
  retailerName
  productUrl
  title
  imageUrl?
  priceDisplay?
  requestedQuantity
  reservedQuantity
  purchasedQuantity
  status
  createdAt
  updatedAt
}
```

**Metadata at add time.** One host-initiated fetch of the URL's Open Graph / basic metadata when pasted, prefilling a form the host confirms or edits. This is explicitly allowed and is not "retailer scraping": it is a single fetch, at add time, initiated by the host. **Manual entry of title, image, and price is the primary path** for Amazon and any site that blocks server fetches, not an edge case.

The platform owns purchase-intent state for native items (§16).

### 15.3 Cash fund card

Display-only card: payment handle(s) (Venmo, Zelle, etc.), suggested amounts, short blurb. No payment processing, no guest payments through the platform, no tracking of cash gifts in MVP.

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

No "Tracked by us" / "Tracked by Amazon" labels. The actions carry the meaning: `Shop Amazon Registry`, `Reserve & Buy`, `Send a gift`.

---

## 16. Native Item Reservation Flow

Reservation plus self-confirmation is already an honor system. Do not build a fraud or reconciliation engine around it.

### 16.1 States

```text
AVAILABLE → RESERVED → PURCHASED
```

### 16.2 Reserve & Buy

1. Guest taps **Reserve & Buy**.
2. Platform creates a reservation immediately and reduces available quantity.
3. Other guests see the item/quantity as unavailable ("Someone may be buying this").
4. Guest is sent to the retailer page.

### 16.3 Confirmation

When the guest returns to the site, prompt:

> **Did you buy this gift?**
> `Yes, mark purchased` · `No, release it`

Yes converts the reservation to purchased. No releases it.

**Mechanism.** Guests have no account, so "on return" means a device-side token set at reserve time and checked when the site loads again. If the token is gone, the reservation simply expires on schedule.

### 16.4 Expiry

Unconfirmed reservations expire after a **fixed 72 hours** and the quantity becomes available again. Configurable server-side; not exposed to hosts in MVP.

### 16.5 Quantities

Support requested quantities greater than one. Guest-facing UI may simplify counts.

### 16.6 Host override

Owner/co-host can mark purchased, mark available, adjust quantity, and release a reservation. This is the integrity backstop.

### 16.7 Known limitations (accepted)

- A guest who buys and never confirms sees the item return to available after 72 hours; a duplicate gift is possible.
- A guest who buys directly from the retailer without tapping Reserve & Buy is not tracked.
- No SMS nudges, click logs, late confirmation, or reconciliation in V1.

### 16.8 Purchaser identity

Never exposed publicly. The **host can see** who reserved/purchased each native item; that is the thank-you list.

---

## 17. Registry Guest Experience

The registry section inherits the Event Identity: palette, typography, card treatment, image treatment, density, buttons. It contains themed external registry cards, native item cards, and the cash fund card. Do not imitate retailer branding beyond permitted name/logo usage.

---

## 18. Event Details

Core: event name; date; time; venue; address; hosts/parents; description/welcome text.

AI may infer a small number of optional informational blocks from the prompt. **Do not** create separate FAQ, parking, dress-code, travel, or itinerary modules. Host can edit, hide, and reorder blocks. Keep this as content, not module expansion.

---

## 19. Admin Dashboard

Optimized for **running the event**, not building a website. Mobile-first priorities:

1. RSVP summary (invited / attending / declined / awaiting / no contact info)
2. Guest responses and no-response list
3. Event details
4. Registry (including reservations awaiting confirmation)
5. Announcements/reminders (with remaining sends against the cap)
6. Site/design controls

No analytics beyond these counts.

---

## 20. Design Editing

### 20.1 Direct editing

Copy; imagery; section order; visibility; colors; curated typography pairings.

### 20.2 Color controls

Constrained adjustments derived from the Event Identity: AI-proposed alternate palette variants; primary/accent from curated values; reset to AI-selected palette. Contrast is re-derived in code after any change.

### 20.3 Typography

Curated compatible pairings only.

### 20.4 No persistent AI copilot

No permanently visible AI chat assistant. Reasons: cost, endless-redesign behavior, UX complexity, and conflict with the core principle.

---

## 21. Site Structure

```text
Hero / Event Introduction
Event Details
RSVP
Registry (external · native · cash fund)
Footer ("Made with …")
```

Single-scroll mobile-first by default. Avoid page fragmentation.

---

## 22. Mobile-First Requirements

Design from ~390px outward.

**Host from a phone:** create account; describe event; upload inspiration; answer follow-ups while concepts generate; review and select concepts; redesign; preview; edit details, text, images; manage guests; import CSV where the OS permits; view RSVP status; manage registries, native items, cash fund; send reminders/announcements; add co-host; publish; copy URL; access QR code.

**Guest from a phone:** access public/private site; read details; RSVP by name lookup; verify by SMS code; update RSVP via magic link; browse registry; reserve a native gift; leave for retailer; return and confirm.

Desktop enhances space; it never has functionality unavailable on phone.

---

## 23. Event Lifecycle

```text
DRAFT → DESIGN_SELECTED → READY_TO_PUBLISH → PUBLISHED → PASSED
ARCHIVED (internal, optional)
```

- **Draft:** not public; generation and redesign allowed within backend limits.
- **Published:** live; operational edits allowed; redesign disabled.
- **Passed:** after the event date/time in the event's timezone: show "Thank you for celebrating with us," keep registry accessible. A host cancels by editing the date to the past.

---

## 24. Domain Model

Conceptual baseline, not an exact schema.

```ts
User { id, email, name, createdAt, updatedAt }

Event {
  id, ownerId, type /* baby_shower */, title, description,
  date, startTime, endTime?, timezone,
  venueName, address,
  visibility /* public | private */, accessCodeHash?,
  rsvpDeadline, status, slug,
  activeConceptId,
  messageSendsUsed,
  publishedAt?, paidAt?, createdAt, updatedAt
}

EventMember { eventId, userId, role /* owner | cohost */, createdAt }

EventIdentity { eventId, ...fields from §7.5, createdAt, updatedAt }

DesignConcept {
  id, eventId,
  round,                 // 0 = initial, 1..n = redesign rounds
  conceptIndex,          // 0..2 within a round
  name, description,
  designSpec,            // §11.2
  selectedAt?,
  createdAt
}

EventSection {
  id, eventId,
  type /* hero | event_details | rsvp | registry | simple_info */,
  position, visible, content, styleOverrides /* constrained */
}

GuestParty, GuestPerson   // §12.2

ExternalRegistry { id, eventId, retailerName, registryUrl, displayName, position, visible, createdAt }

NativeRegistryItem        // §15.2

CashFund                  // §15.3

GiftReservation {
  id, eventId, itemId,
  guestDeviceToken,
  partyId?,               // when the guest has RSVP'd on this device
  quantity,
  status /* active | purchased | released | expired */,
  expiresAt, purchasedAt?, createdAt, updatedAt
}

Message {
  id, eventId,
  kind /* reminder | announcement */,
  channel /* sms | email */,
  subject?, body, audience,
  sentAt, createdBy
}

GenerationRun {
  id, eventId, userId, round, model, inputTokens, outputTokens,
  costEstimate, latencyMs, diversityRepaired: boolean, createdAt
}
```

---

## 25. Permissions Matrix

| Capability | Owner | Co-host | Guest |
| --- | ---: | ---: | ---: |
| View event | Yes | Yes | Yes |
| Edit event details | Yes | Yes | No |
| Edit text/images | Yes | Yes | No |
| Manage guests / import CSV | Yes | Yes | No |
| Manage RSVP questions | Yes | Yes | No |
| View RSVP responses | Yes | Yes | Own party only |
| Manage external registries, native items, cash fund | Yes | Yes | No |
| Manage native item status | Yes | Yes | No |
| Send reminders/announcements | Yes | Yes | No |
| Direct design controls (colors, typography, sections) | Yes | Yes | No |
| Enter initial design prompt / initial generation | Yes | No (joins after creation) | No |
| Generate redesign concepts (before publish) | Yes | Yes | No |
| Select concepts, including from gallery (before publish) | Yes | Yes | No |
| Publish | Yes | No | No |
| Manage co-hosts | Yes | No | No |
| Billing / payment | Yes | No | No |
| Delete event / ownership transfer | Yes | No | No |

Summary: **Owner** everything. **Co-host** everything except billing, co-host management, and delete/ownership-level actions (and publish in MVP, because payment is tied to it). **Guest** event, RSVP, and registry only.

---

## 26. Important UX Rules

- **Never expose implementation complexity:** Event Identity, DesignSpec, archetype IDs, renderer, model tiers, backend limits, sync limitations, data model.
- **No configuration fatigue:** describe → infer → ask only what's missing (while generating) → show concepts → select.
- **Don't overbuild empty states.**
- **Guests never need accounts.** Name lookup, optional SMS code, device tokens, magic links.
- **No counters.** Never show remaining generations, credits, or message quotas to the owner beyond the announcement cap in the dashboard.

---

## 27. Safety / Integrity / Privacy

- Never expose purchaser identity publicly.
- Hash event access codes; no plaintext.
- Never expose guest lists publicly; after name lookup show first names only.
- Limit guests to their own party's information.
- Co-host access is explicit, invitation-based.
- SMS only under host attestation with STOP handling and per-event caps; honor opt-outs immediately.
- No retailer scraping, bot evasion, or proxies. One host-initiated metadata fetch at add time is the only outbound fetch to retailers.
- Never collect retailer credentials or request an Amazon/retailer login.
- External checkout stays on retailer sites.
- Private events are `noindex`.

---

## 28. Payment

- Free to create, generate, preview.
- **$49 one-time to publish.**
- Initial implementation: mock/stub the gate; display the real price; allow internal/test users to simulate success; record `paidAt`.
- No refunds, no transfers, no tiers. Do not spend MVP effort on billing architecture beyond the stub.

---

## 29. Analytics (Instrumentation, Not Dashboards)

```text
landing_cta_clicked
signup_completed
event_creation_started
initial_prompt_submitted
inspiration_uploaded
followup_question_answered
identity_generated            { latencyMs }
concept_rendered              { round, index, latencyMs }
concepts_generated            { round, latencyMs, diversityRepaired }
concept_selected              { round, index }
redesign_started              { round, hasFeedback }
kept_current_design
gallery_concept_selected
generation_limit_hit          { limitType }
preview_opened
publish_gate_opened           { priceShown }
publish_gate_continued
event_published
guest_added
csv_import_completed          { withPhone, withEmail, withNeither }
rsvp_lookup_started
rsvp_lookup_collision
rsvp_sms_verified
rsvp_completed
rsvp_updated                  { viaMagicLink }
external_registry_added
external_registry_clicked
native_item_added             { metadataFetched, manualEntry }
native_item_reserved
native_item_purchase_confirmed
native_item_reservation_released
native_item_reservation_expired
cash_fund_added
message_sent                  { kind, channel, recipients }
message_opt_out
```

Every generation also writes a `GenerationRun` row with cost and latency. These rows, plus conversion, set commercial generation limits after beta.

---

## 30. MVP Success Criteria

A non-technical host can:

1. Land and understand the product quickly.
2. Describe the baby shower in natural language.
3. Optionally upload inspiration.
4. Answer only required follow-ups, while concepts generate.
5. See three clearly differentiated, high-quality concepts within the latency targets.
6. Select one without design expertise, and that selection is the site.
7. Redesign freely before publish and return to any earlier concept.
8. Make simple edits without a page builder.
9. Add guests manually or via CSV, with or without contact info.
10. Configure and receive RSVP responses via name lookup.
11. Add external registries, native items by URL, and a cash fund card.
12. Let guests reserve and confirm native gifts.
13. Send SMS reminders and announcements.
14. Preview on a phone.
15. Publish through the mocked $49 gate.
16. Share one URL/QR code.
17. Manage the event from a phone after publishing.

The host should feel: "I described what I wanted and it basically built the event for me."

---

## 31. Acceptance Criteria

**AI creation and rendering**

- [ ] Natural-language description accepted; inspiration uploads and links optional.
- [ ] Generation begins on prompt submit; required follow-ups are asked while it runs.
- [ ] Event Identity stored structurally and streamed to the client.
- [ ] Three concepts generated in parallel; each renders as soon as its spec arrives.
- [ ] Latency targets in §7.7 met at p75.
- [ ] Previews are live production-renderer components in a scaled frame; no screenshots or images.
- [ ] Provisional preview content uses known event data.
- [ ] Every `DesignSpec` validates against the enum schema; unknown IDs map to defaults.
- [ ] Hard diversity constraints (§11.5) enforced in code with deterministic repair; at most one model retry.
- [ ] Explicit color constraints in the prompt are honored across all three concepts.
- [ ] Every hero archetype renders correctly with no photo.
- [ ] Contrast is derived in code; no concept renders failing text contrast.
- [ ] Selecting a concept persists its `DesignSpec`; no separate generation step exists.

**Redesign**

- [ ] Owner or co-host can redesign repeatedly before publish, with optional feedback.
- [ ] Previously shown archetype + tonal combinations are excluded by the backend.
- [ ] Current design unchanged during review; owner may keep current design.
- [ ] All generated concepts remain browsable and selectable in a gallery.
- [ ] No user-facing generation counters or credits.
- [ ] Backend concurrency, per-event, per-account, and spend limits are configurable and enforced.
- [ ] Every generation logged with cost and latency.
- [ ] Publish, billing, co-host management, and delete are not available to co-hosts.
- [ ] Redesign and selection disabled after publish.

**Manual editing**

- [ ] Text, images, section order, visibility, curated colors, and curated typography pairings editable.
- [ ] No free-form page builder exists.

**RSVP**

- [ ] Manual add and CSV import work with phone, email, both, or neither.
- [ ] Party grouping, plus-ones, adults/children work.
- [ ] Deadline, meal choice, dietary field, custom questions configurable.
- [ ] Name lookup with fuzzy match and last-name disambiguation; first names only after match.
- [ ] Optional SMS one-time-code verification when a phone is on file; host can require it for private events.
- [ ] Themed confirmation shown; magic link texted when a phone is on file.
- [ ] Guest can update RSVP via magic link or repeat lookup.
- [ ] Dashboard shows attending/declined/no-response/no-contact-info counts.
- [ ] Open/public RSVP is not available.

**Communication**

- [ ] Host attestation captured at import; STOP handled; opt-outs honored and visible.
- [ ] Reminders go to non-responders only; announcements to all invited.
- [ ] SMS used when phone present; email fallback when only email present.
- [ ] Per-event send cap enforced.

**Registry**

- [ ] External registry URL displayed as themed destination; click leaves to retailer.
- [ ] No item-level sync claimed or implemented.
- [ ] Native item added by URL with one add-time metadata fetch and manual entry fallback.
- [ ] Reserve creates reservation before redirect; confirm on return via device token; 72h expiry; host override.
- [ ] Purchaser identity hidden publicly, visible to host.
- [ ] Cash fund card displays handles, suggested amounts, blurb; no payments processed.

**Privacy and access**

- [ ] Public/private supported; private requires event code.
- [ ] Private gate shows hero (name, hosts, date) only; everything else locked; `noindex` set.
- [ ] RSVP invite-only in either visibility mode; guest list never exposed.

**Roles**

- [ ] Owner invites co-host; co-host has every capability except publish, billing, co-host management, and delete/ownership, with no conditional cases.

**Publishing**

- [ ] Preview before publish; mocked gate displays $49; publish after simulated success.
- [ ] Branded subdomain, copyable URL, QR code.
- [ ] Operational edits allowed after publish; redesign disabled.
- [ ] "Made with" footer present on guest site.

**Mobile**

- [ ] Entire host flow, dashboard, guest RSVP, and registry usable at ~390px.
- [ ] No critical feature is desktop-only.
- [ ] Visual test matrix (§11.8) runs in CI.

---

## 32. Implementation Guardrails for Coding Agents

1. Do not add features because they are conventional for event apps.
2. Do not add a template gallery. Archetypes are internal.
3. Do not build a token-level or chat-level AI editing loop. Redesign is concept-level.
4. Do not build a version-history or rollback system. Retain concept specs in a gallery instead.
5. Do not add browser extensions or bookmarklets.
6. Do not add retailer scraping, sync, proxies, or anti-bot workarounds. One host-initiated metadata fetch at add time is allowed.
7. Do not generate imagery. Site images are host uploads only.
8. Do not require guest accounts.
9. Do not optimize desktop before mobile.
10. Do not expose low-level website-builder controls.
11. Do not expose generation counters, credits, or backend limits to users.
12. Do not use a model for validation, contrast, diversity enforcement, or ordinary edits.
13. Do not generate arbitrary HTML or layouts. The model returns IDs and values against the enum schema.
14. Do not build reservation nudges, click logs, or reconciliation.
15. Do not build cancel/unpublish, refunds, or ownership transfer.
16. Do keep the domain model generic enough for future event types.
17. Do store structured AI output and render from it.
18. Do enforce diversity in code with deterministic repair.
19. Do make every archetype render without a photo.
20. Do meet the latency targets.
21. Do make the smallest implementation that satisfies the MVP requirements.

If an implementation decision conflicts with the principle below, stop and reconsider:

> **AI should remove decisions, not create more decisions.**

---

## 33. Deferred Product Opportunities

Intentionally deferred; may become roadmap items:

- AI-generated hero illustration/motif per concept (highest expected quality lever);
- broader event types; custom domains;
- invitations generated from the Event Identity, and invitation sending;
- matching print assets, welcome signs, menus, thank-you cards;
- reservation SMS nudges, click logs, late confirmation, host collision view;
- photo galleries; post-event thank-you workflows;
- deeper registry integrations, retailer partnerships, supported auto-sync;
- group gifting, guest payments;
- weighted diversity scoring;
- pricing tiers, advanced AI credits, concierge design tier;
- WhatsApp; international SMS;
- event planning/operations beyond details, RSVP, and registry.

---

## 34. Known Limitations (Accepted for MVP)

- Duplicate native gifts are possible when a guest buys and never confirms within 72 hours.
- Native purchases made without tapping Reserve & Buy are not tracked.
- Guests with no phone or email receive no reminders; the host chases them manually.
- Name lookup on a public event lets anyone who knows a guest's name RSVP for them unless SMS verification is required.
- Most hosts upload no photo; concepts rely on typography, palette, archetype, and motifs for distinctness.
- Inspiration links may fail to fetch; images are the reliable inspiration input.
- Amazon native items will usually require manual title/image/price entry.
- No refunds, cancellation toggle, or ownership transfer.

---

## 35. Canonical MVP Flow

```text
LANDING PAGE
    ↓
CREATE ACCOUNT
    ↓
"Tell us what you're planning"
    ↓
Natural-language description + optional inspiration images/links
    ↓
Generation starts immediately  ──┐
    ↓                            │ (in parallel)
Required follow-up questions  ◄──┘
    ↓
Event Identity streamed
    ↓
3 concept previews (live renderer, scaled frame; diversity enforced in code)
    ↓
Owner chooses 1  →  DesignSpec persisted  →  this IS the site
    ↓
Host adds/edits: details · guests/CSV · RSVP settings · registries · native items · cash fund
    ↓
Lightweight direct edits
    ↓
OPTIONAL: "Try a different direction" (repeatable; gallery keeps every concept)
    ↓
Mobile-first preview
    ↓
$49 gate (mocked, real price shown)
    ↓
PUBLISH → branded URL + QR code
    ↓
Host distributes link externally
    ↓
Guests: (private? hero visible, code for the rest) → details → RSVP by name lookup (+ SMS verify) → registry
    ↓
Host manages RSVPs, registry, SMS reminders/announcements from mobile admin
    ↓
Event passes → thank-you state; registry stays accessible
```

---

## 36. North Star

The product is successful when someone with **zero design skill and zero event-software knowledge** can describe the event they are imagining and receive a beautiful, functioning, cohesive event experience in minutes.

The user should spend their time thinking about **their event**, not configuring software.

> **AI should remove decisions, not create more decisions.**
