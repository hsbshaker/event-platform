# AI-Native Event Website + RSVP + Registry Platform

**Document:** Product Requirements Document (PRD) / `spec.md`
**Status:** Revision 5 — MVP baseline for implementation
**Initial launch vertical:** Baby showers
**Platform architecture:** Event-generic, baby-shower-first
**Primary build principle:** **AI should remove decisions, not create more decisions.**

---

## 0. What changed in Revision 5

Revision 5 reconciles the product with the approved creation UX and the first renderer architecture pressure test. Implementing agents must treat this document as authoritative; where it conflicts with Revision 4, older prototypes, or repository history, **Revision 5 wins**.

The core product scope remains baby-shower-first and the commercial hypothesis remains **$49 one-time to publish**. The important changes are architectural and experiential.

| Area | Revision 4 | Revision 5 |
| --- | --- | --- |
| Landing/auth | CTA → account → prompt | **Landing page is the prompt.** User writes the idea first; auth/save occurs before strong-model generation. Prompt and inspiration must survive OAuth intact. |
| Post-concept flow | Concept selection → setup/admin | **Concept selection → full-site reveal → “Make it yours” → Creation Mode.** The event itself is the setup workspace. |
| Setup UX | Setup/admin areas | **No pre-publish dashboard/wizard.** Contextual `Edit` / `Set up` / `Add` actions live on the actual event site. |
| Setup progress | General checklist | Checklist separates **Needed to publish** from **Recommended before sharing**. Optional Guests/Registry never make publish readiness look incomplete. |
| Redesign entry | Design/gallery flow | `Try another direction` appears on initial concepts, site reveal, and Design controls. It preserves all event content/data. |
| Preview | Mobile-first preview | Preview uses the production renderer; on larger screens it offers **Mobile / Desktop** width controls. |
| Model design output | Model returns a mostly orthogonal `DesignSpec` | Model returns a **six-field `DesignIntent` only**. It does not emit treatment/card/button/border overrides. |
| Archetypes | Hero primitive among many independent dimensions | **Versioned archetype bundle owns composition and component defaults**: section treatments, guest-surface composition, cards, borders, buttons, ornamentation, and visual treatment. |
| Compilation | Model output rendered after schema validation | Deterministic compiler resolves archetype defaults, typography compatibility, motif placement, tone/palette semantics, contrast, and repairs into immutable `ResolvedDesignSpec`. |
| Persistence | Persist immutable `DesignSpec` | Persist **DesignIntent + archetype version + ResolvedDesignSpec** for every concept. Render concept base only from the resolved spec. |
| Immutability | Generated concepts immutable | **Generated design data is immutable; renderer code is not.** Bug/accessibility/responsive fixes may improve all events without recompiling historical concepts. |
| Motifs | Model chooses motif IDs; placement implicit | Motifs declare supported roles (`field`, `frame`, `band`, `divider`, `accent`), semantic color channels, opacity bounds, and max placements. Archetypes expose matching slots. Dropped motifs are logged. |
| Palette | Palette roles could be consumed directly by archetypes | Raw creative palette + tonal direction go through a **semantic palette compiler**. Archetypes never interpret raw palette roles. Required contrast is valid by construction. |
| Diversity | Archetype/tone plus many treatment dimensions | Primary levers are **archetype/composition → tone when permitted → typography category → motifs → density → palette dominance**. |
| Guest design | Themed components implied | Renderer explicitly owns themed guest components and archetype-specific guest composition. **Mobile information architecture may converge**; differentiation at phone width comes mainly from framing, typography, motif, density, and component skin. |
| Renderer validation | Broad visual matrix | Before remaining archetypes are built, the first three must pass constrained-brief, palette-control, grayscale, guest-surface, swap, compiler, and incompatible-intent tests. |

The primary product principle remains:

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
- produces compact DesignIntent for three clearly different concepts;
- deterministic renderer code compiles each intent into a versioned, accessible ResolvedDesignSpec;
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

AI makes opinionated decisions on behalf of the host where it is safe to do so. Do not turn AI into a questionnaire generator. Do not ask the user to choose implementation primitives such as card styles, border radii, spacing, motifs, layout IDs, or button variants.

The host describes intent; the system translates intent into a cohesive event.

### 4.2 AI expresses intent; deterministic systems build and protect quality

The strong model creates:
- an `EventIdentity`;
- a compact six-field `DesignIntent` for each concept.

It does **not** generate arbitrary HTML, CSS, SVG, page layouts, section treatment overrides, card variants, border variants, or button variants.

A deterministic renderer compiler:
1. loads the selected versioned archetype bundle;
2. validates/repairs typography compatibility;
3. assigns requested motifs to compatible archetype slots;
4. compiles raw palette + tonal direction into accessible semantic event tokens;
5. applies archetype-owned section/component defaults;
6. produces and persists an immutable `ResolvedDesignSpec`.

The production renderer renders from the resolved spec.

### 4.3 Archetypes are internal design systems, not customer-facing templates

An archetype is a **versioned bundle** that owns:
- hero composition;
- desktop/mobile composition rules;
- Event Details treatment;
- RSVP treatment;
- Registry treatment;
- guest-surface composition;
- visual treatment;
- ornamentation;
- border treatment;
- card treatment;
- button treatment;
- motif slots;
- compatible typography pairings.

The host never sees “Template 4,” “Archetype,” or these implementation fields. There is no template gallery.

### 4.4 Prompt first, auth second, generation third

The user should invest in their creative idea before being asked to authenticate.

Canonical sequence:
1. user writes the event prompt and may add inspiration;
2. auth/save occurs;
3. prompt and inspiration are restored exactly;
4. strong-model generation begins.

Do not burn frontier-model generation on anonymous traffic.

### 4.5 Show the finished-looking outcome before setup

Concept selection leads directly to a full production-rendered site reveal.

The product should make the host feel:

> **This is already my event site. I only need to make it real.**

Do not interrupt that activation moment with a dashboard.

### 4.6 Creation Mode is the event itself

Before publish, the actual event site is the workspace. Owner/co-host-only contextual controls appear at stable collaborator anchors:
- `Edit`
- `Set up`
- `Add`

Focused sheets/panels may edit structured data, then return the collaborator to the same place.

Guest management is the major exception because household/CSV/phone operations need a dedicated workspace.

### 4.7 No setup wizard

Independent tasks do not require a linear Step 1 → Next → Step 2 workflow.

The floating setup control is navigation and readiness, not a wizard.

### 4.8 Mobile first; desktop is real desktop

Every core workflow works from approximately 390px outward.

Desktop must use desktop space intentionally. Creation Mode is not trapped inside a phone frame. Concept comparison may show mobile-shaped previews, but application chrome and the event canvas are responsive desktop UI.

### 4.9 Opinionated design quality

Users may refine within safe boundaries, but the system makes it difficult to create an incoherent site.

Manual design controls remain limited to curated palette and typography choices. Section content/order/visibility are content operations, not a page builder.

### 4.10 Generated design data is immutable; renderer code is maintainable

Once a concept is generated:
- its `DesignIntent` is immutable;
- its selected `archetypeVersion` is immutable;
- its `ResolvedDesignSpec` is immutable.

Do not silently recompile an old concept against newer archetype defaults.

However, renderer implementation code is normal product code. Accessibility fixes, browser fixes, responsive fixes, and visual bug fixes may improve every event that renders a compatible resolved spec. “Concept immutability” must never block ordinary renderer maintenance.

## 5. MVP Scope

### 5.1 In scope

**Prompt-first event creation**
- Landing page is the natural-language event composer.
- Optional private inspiration images/links may be added directly to the composer.
- Auth/save occurs after the prompt is written and before strong-model generation.
- Prompt text and successfully uploaded inspiration must survive auth/OAuth redirects exactly.
- No front-loaded profile/configuration flow.

**AI identity and design**
- Strong-model `EventIdentity`.
- Backend diversity planner assigns concept constraints.
- Strong-model six-field `DesignIntent` per concept.
- Deterministic compilation to immutable `ResolvedDesignSpec`.
- Three live concept previews using the production renderer.
- Initial `Try another direction` escape hatch under the three concepts.
- Concept selection followed by full-site reveal.
- Pre-publish redesign rounds from concept screen, reveal, or Design controls.
- All generated concepts remain browsable before publish.
- Current active design remains unchanged until a new concept is explicitly selected.
- No host-uploaded decorative/event imagery.

**Creation Mode**
- Selected concept becomes the actual event site.
- Full-site reveal: **“Your event looks great. Let’s make it real.”**
- `Make it yours` transitions the same site into Creation Mode.
- Contextual owner/co-host controls live on stable renderer collaborator slots.
- Floating readiness/setup control.
- Checklist separates publish blockers from recommended-but-optional work.
- Autosave routine edits.
- Guest management may open a dedicated full-screen workspace.
- `Preview` removes collaborator controls and shows the exact guest experience.

**Event website**
- Event title/name.
- Host/parent names as applicable.
- Date, time, venue, address.
- IANA timezone inferred from venue text, browser fallback.
- Description/welcome copy.
- Small number of simple optional information blocks inferred from prompt.
- Public/private.
- Private access code; finished hero visible before code, sensitive/event-operational content locked.
- Branded subdomain.
- QR code.
- Tasteful `Made with …` footer.

**RSVP and guests**
- Manual guest-party entry.
- CSV import.
- Invite-only RSVP.
- Household/party grouping, adults/children/plus-ones.
- Phone-first party contact.
- Missing-phone CSV rows import as **Needs phone**.
- Rare explicit `noPhoneAvailable` path.
- Optional email.
- RSVP deadline.
- Attendance, meal, dietary, custom questions, notes.
- Name lookup.
- SMS OTP for phone-backed parties.
- Scoped guest-party session; no guest account.
- Magic-link return/update.

**Registry**
- External registry destinations.
- Native gifts by product URL with one safe metadata/image convenience fetch and manual fallback.
- Platform-owned normalized native product thumbnail where possible.
- Native gift public state: Available/Purchased only.
- Private buy-click logging; no reservation state.
- Optional self-confirm purchase on return.
- Host/co-host purchase override.
- Display-only cash fund.

**Communication**
- SMS-first reminders/announcements.
- Email fallback only for no usable phone / SMS delivery failure, never as a STOP bypass.
- Initial invitation distribution remains outside platform.

**Roles**
- Owner.
- Co-host with near-parity for event work.
- Guest with no account.

**Publishing**
- Free to create/generate/redesign/preview within backend limits.
- $49 one-time publish hypothesis.
- Deterministic `READY_TO_PUBLISH`.
- Payment separate from readiness.
- Post-publish content/operations/curated direct-design edits allowed.
- Post-publish AI redesign/concept switching disabled.

**Post-event**
- Passed-event thank-you state.
- Registry remains accessible.

### 5.2 Explicit non-goals for MVP

Implementing agents must **not** add these unless explicitly requested later:

- drag-and-drop page builder, pixel editor, arbitrary CSS, free-form canvas;
- customer-facing template gallery;
- model-emitted section/card/button/border/treatment overrides;
- host controls for card treatment, border treatment, button treatment, spacing, density, motif placement, or archetype internals;
- seating charts, timeline/planning modules, vendors, venue marketplace;
- photo galleries, printed stationery, thank-you-note manager, invitation sending;
- host decorative site-photo uploads, hero-photo uploads, crop/position controls;
- AI-generated decorative site imagery;
- public/open RSVP;
- guest accounts;
- browser extensions/bookmarklets;
- retailer scraping/sync/proxies/anti-bot workarounds;
- Pinterest-board URL ingestion promise;
- persistent AI chat/copilot or token-level design editing;
- AI redesign after publish;
- user-facing AI credits/generation counters during alpha/beta;
- version-history/rollback system beyond immutable generated concept gallery;
- gift reservations/holds/timers/public claim state;
- purchase nudges/collision engine;
- maps/geocoding solely for timezone;
- cancel/unpublish/refund/ownership-transfer workflows;
- custom domains unless trivial/stubbed;
- native mobile apps;
- user-facing analytics dashboards;
- app dark mode in MVP.

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

A co-host invitation must preserve its invitation token through authentication. After acceptance, the user enters the existing event workspace; they do not repeat event creation.

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

### 7.1 Landing page is the prompt

The product should be usable immediately.

Primary message:

> **Describe your event. We create the whole experience.**

The natural-language composer is the hero of the landing page.

Primary controls:
- large event-description input;
- `+ Add inspiration`;
- `Create my event ✦`.

Reassurance may say:
> Free to create · No templates · Publish when ready

Do not require signup before the user writes.

### 7.2 Pre-auth draft and authentication

On `Create my event`:
1. persist a short-lived private draft containing the exact prompt;
2. retain references to successfully uploaded private inspiration assets;
3. retain lightweight client state needed to restore the composer;
4. authenticate via Google/Apple/email;
5. attach the draft to the authenticated owner/event;
6. restore the user's prompt and inspiration exactly.

**Strong-model generation does not begin until authentication succeeds.**

Losing the prompt or inspiration during OAuth is a critical product failure.

Temporary pre-auth assets remain private, expire automatically if abandoned, and never become public event imagery.

### 7.3 Generation begins; required details run in parallel

After auth:
- create/attach the event draft;
- begin Event Identity generation immediately;
- collect only genuinely missing required event fields while generation runs.

Potential missing details:
- event date;
- start time (end optional);
- venue/location/address;
- hosts/parent names;
- baby name if shown;
- RSVP deadline;
- public/private.

Skip values already supplied.

Do not normally ask timezone; infer it per §7.4.

### 7.4 Venue normalization and timezone inference

Do not introduce a maps/geocoder solely for timezone.

1. Normalize supplied venue/address text.
2. Infer candidate IANA timezone + confidence from city/state/region/country.
3. Validate against an application-side IANA set.
4. On low/invalid confidence, use owner/co-host browser timezone.
5. Re-run when venue changes materially.
6. Ask only when both sources are unavailable/obviously contradictory.

Lifecycle calculations always use the stored IANA timezone.

### 7.5 Event Identity

A strong multimodal model derives and persists the creative brief.

```ts
EventIdentity {
  creativeDirection
  toneKeywords[]

  colorsExplicitlyConstrained: boolean
  paletteIntent

  tonalIntent
  toneExplicitlyConstrained: boolean
  compatibleTonalDirections[]       // ranked subset: light | mid | dark

  compatibleHeroArchetypes[]        // ranked archetype IDs
  compatibleTypographyCategories[]  // ranked broad categories, not raw fonts

  visualMotifs[]
  textureDirection
  typographyDirection
  copyTone
  designConstraints[]
  inspirationSummary
}
```

The Event Identity describes compatibility and intent. It does not contain renderer treatment choices.

### 7.6 Brand/style references

Named references such as Ralph Lauren are interpreted into original attributes: heritage, equestrian, classic Americana, editorial serif, navy/ivory/forest/camel, restrained plaid, understated luxury.

Never copy protected logos/graphics or reproduce a specific proprietary design.

### 7.7 Diversity planning before concept model calls

Once Event Identity is valid, deterministic code plans three concept assignments.

Priority:
1. distinct compatible **hero archetypes** whenever possible;
2. distinct compatible **tonal directions** when the brief allows;
3. distinct compatible **typography categories** across the three when possible;
4. density differentiation as a later lever when useful.

If tone is explicitly constrained (e.g. light/airy), do not force dark/mid. Diversity then relies more heavily on archetype, typography, motifs, density, and palette dominance.

The assigned archetype/tone/typography-category constraints are passed to each concept model call.

### 7.8 DesignIntent generation

The strong model returns exactly the creative intent surface below.

```ts
DesignIntent {
  heroArchetype
  tonalDirection

  palette: {
    colors: string[]        // 3–5 validated hex colors
    dominant: string        // one member of colors[]
  }

  typographyPairing         // curated ID
  density                   // compact | balanced | spacious
  motifs[]                  // curated motif IDs
}
```

**No model-emitted overrides exist in MVP.**

The model cannot emit:
- section treatment;
- guest composition;
- visual treatment;
- ornamentation;
- border treatment;
- card treatment;
- button treatment;
- motif placement;
- semantic background/text/button colors.

Those belong to the compiler/archetype bundle.

### 7.9 Renderer compilation

For each valid DesignIntent:

1. Load `ArchetypeDefinition` by ID and current selected version.
2. Validate typography pairing against that archetype's compatible pairings.
3. Deterministically repair incompatible pairing to an approved default/nearest allowed choice; record repair.
4. Match requested motif IDs to compatible archetype motif slots by declared role.
5. Enforce motif max placements (normally one or two).
6. Drop motifs with no compatible available slot; record `motifsDropped`.
7. Compile raw palette + tonal direction into semantic accessible event tokens.
8. Apply archetype-owned treatments/composition defaults.
9. Produce immutable `ResolvedDesignSpec`.
10. Persist `DesignIntent`, `archetypeVersion`, and `ResolvedDesignSpec`.

No model call is used for compiler validation/repair.

### 7.10 The wait

Generation must feel like progress:
1. required details run while identity is being created;
2. user-facing portions of Event Identity may stream;
3. three DesignIntent calls run in parallel after diversity assignments;
4. compilation is deterministic/local;
5. each concept renders as soon as its resolved spec exists.

Latency targets remain p75 goals:

| Milestone | Target |
| --- | --- |
| Event Identity visible | ≤ 5 s |
| First concept rendered | ≤ 15 s |
| All three concepts rendered | ≤ 45 s |

Measure reality; do not silently allow unbounded waits.

### 7.11 Three concept previews

Each concept preview uses the production renderer and its persisted `ResolvedDesignSpec`.

Use real event values already known. Temporary sample content fills only genuinely missing content.

Each concept displays:
- creative concept name;
- one-line description;
- live renderer preview;
- `Choose this direction`.

Under the initial set:

> **None of these feel right?**  
> `Try another direction ✦`

On mobile, later concept renderer trees may lazy-mount near the viewport to avoid unnecessary work.

### 7.12 Concept selection → full-site reveal

Selecting a concept sets `activeConceptId`.

There is no separate website-generation step.

Immediately reveal the full production-rendered guest site.

Preferred activation:

> **Your event looks great.**  
> **Let’s make it real.**

Actions:
- `Make it yours →`
- `Try another direction ✦`

Concept selection changes **design only**, never event content/data.

### 7.13 Creation Mode

`Make it yours` does not navigate to a dashboard. The same site becomes editable.

Collaborator-only controls attach to stable section-level collaborator slots:
- `Edit`
- `Set up`
- `Add`

Editors open in mobile sheets/full-screen flows or desktop panels/modals as appropriate, then return to the same place.

Routine edits autosave.

A floating readiness control shows truthful state such as:
- `Finish setup`
- `2 required items left`
- `Ready to publish`

Its sheet separates:

**Needed to publish**
- actual deterministic blockers from §23.1.

**Recommended before sharing**
- Guests;
- Registry;
- Co-host;
- other useful optional work.

Guests/Registry never make a publish-ready event look blocked.

### 7.14 Guest management exception

Guest management may leave the event canvas for a dedicated workspace because household grouping, CSV import, phone state, and response state need room.

Closing returns to Creation Mode.

### 7.15 Direct design controls

`Design` exposes only curated:
- palette choices/variants;
- typography pairings compatible with the selected archetype;
- reset to concept design;
- `Try another direction ✦` before publish.

Do not expose archetype internals, density, motifs, treatment, borders, cards, buttons, spacing, or CSS.

Host-side deterministic direct design overrides remain on `Event.designOverrides`; they do not mutate the immutable generated concept.

### 7.16 Redesign

Available before publish from:
- initial concept screen;
- site reveal;
- Design controls.

Flow:
1. optionally refine the creative brief;
2. optionally add new private inspiration;
3. reassure: **event content stays untouched**;
4. update/merge Event Identity when needed;
5. diversity planner assigns a fresh set of compatible directions;
6. strong model generates three fresh DesignIntents;
7. compiler resolves each;
8. current active concept remains active while reviewing;
9. collaborator selects one, keeps current, or refines again.

There is no chat-level micro-edit loop.

### 7.17 Preview

Preview uses the exact production renderer and actual current content.

Preview strips:
- collaborator actions;
- setup control;
- owner toolbar.

On larger screens:
- default preview width is **Mobile**;
- compact toggle may switch `Mobile / Desktop`.

This device-width control exists in Preview only; Creation Mode is not a breakpoint simulator.

### 7.18 Publish

Publish remains gated by the $49 one-time payment hypothesis.

Owner completes/manages payment.

Once payment is satisfied, owner or co-host may publish if deterministic readiness passes.

After publish:
- URL available;
- QR available;
- private event code surfaced separately;
- host distributes externally.

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
- curated palette override;
- curated compatible typography pairing override.

No other renderer treatment controls are exposed in MVP.

Changes update the live site directly. No draft/live dual-version workflow.

### 8.2 Not allowed after publish

- AI redesign
- new concept generation
- switching/selecting a different generated concept

The concept gallery becomes read-only after publish.

### 8.3 Cancellation

There is no cancel/unpublish workflow in MVP. Do not create a hidden workaround such as instructing the host to falsify the event date.

Cancellation handling is a deferred product/policy decision. No refunds or ownership transfer in MVP.

---

## 9. AI Architecture and Cost Controls

AI cost is a product constraint from day one, but creative quality materially affects conversion.

### 9.1 Strong-model usage

Use the strongest appropriate multimodal/reasoning model for:

1. `generateEventIdentity(...)`
2. `generateDesignIntent(...)` for each concept

These are the only frontier creative operations in MVP.

The model does **not** generate the final renderer schema. Application code compiles DesignIntent to ResolvedDesignSpec.

A thin provider capability layer is sufficient:

```ts
generateEventIdentity(...)
generateDesignIntent(...)
```

Do not build a large abstraction framework prematurely.

### 9.2 Cheaper-model usage

Use smaller/cheaper models only where ordinary code is insufficient and quality remains acceptable:
- structured event-detail extraction;
- missing-field detection;
- ambiguous date/time normalization;
- candidate IANA timezone inference + confidence.

Validate timezone in code.

Do not add models for renderer validation, motif placement, contrast, repair, or design compilation.

### 9.3 No-model operations

Never call a model for:
- auth draft persistence;
- changing structured date/time/venue;
- hiding/reordering sections;
- applying host palette/typography overrides;
- editing text;
- guests/registry/cash-fund operations;
- validating Event Identity/DesignIntent structure;
- validating enum IDs;
- assigning concept diversity constraints;
- loading archetype defaults;
- typography compatibility repair;
- assigning motifs to slots;
- dropping/logging incompatible motifs;
- semantic palette compilation;
- contrast derivation;
- producing ResolvedDesignSpec;
- enforcing generation limits;
- gift state transitions;
- product-image processing.

### 9.4 Persistence and renderer reproducibility

Persist:
- Event Identity;
- every generated DesignIntent;
- selected archetype version for every concept;
- every immutable ResolvedDesignSpec;
- event-level manual design overrides separately.

Do not re-send original raw inspiration for routine redesign after its summary is available.

Do not recompile historical concepts merely because an archetype bundle changes.

Renderer code may evolve/fix bugs while continuing to consume the old resolved schema/version.

### 9.5 Compilation telemetry

Each concept compilation may emit deterministic telemetry:

```ts
compilerRepairs[]   // field/requested/resolved/reason
motifsDropped[]     // motif IDs that could not be placed
```

Typical repair reason:
- `incompatible_with_archetype`
- `unknown_enum`
- `invalid_palette_member`
- `slot_unavailable`

Compiler repair must not trigger a model retry unless the DesignIntent is structurally invalid/unusable and cannot be repaired safely.

### 9.6 Model usage and cost metering

Every model call records, where exposed:
- provider;
- request ID;
- model;
- operation (`event_identity`, `design_intent`, structured extraction where metered);
- input/cached/output/reasoning tokens;
- estimated/actual cost;
- latency;
- success/failure;
- generation round/concept index;
- diversity assignment.

Application usage should reconcile against provider usage where practical.

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

This is the core renderer contract. `docs/event-renderer-system.md` is the implementation-level companion and wins on renderer-detail questions that do not conflict with this PRD.

### 11.1 The rule

> **AI expresses creative intent. Versioned archetype bundles + deterministic compiler build the event.**

The model never emits arbitrary HTML/layout/CSS or treatment overrides.

The renderer must be expressive enough that concepts remain visibly distinct even when palette and tone are constrained.

### 11.2 DesignIntent — model contract

Exactly six creative dimensions:

```ts
DesignIntent {
  heroArchetype:
    | "editorial_split"
    | "centered_statement"
    | "full_bleed_visual"
    | "framed_invitation"
    | "typography_first"
    | "layered_editorial"

  tonalDirection:
    | "light"
    | "mid"
    | "dark"

  palette: {
    colors: string[]   // 3–5 valid hex colors
    dominant: string   // must be a member of colors[]
  }

  typographyPairing: string   // curated ID
  density: "compact" | "balanced" | "spacious"
  motifs: string[]            // curated IDs
}
```

There is **no model `overrides` block in MVP**.

### 11.3 ArchetypeDefinition — versioned bundle

Conceptual code/config shape:

```ts
ArchetypeDefinition {
  id
  version

  defaults {
    eventDetailsTreatment
    rsvpTreatment
    registryTreatment
    guestSurfaceComposition

    visualTreatment
    ornamentation
    borderTreatment
    cardTreatment
    buttonTreatment
  }

  compatibleTypographyPairings[]

  motifSlots[] {
    id
    role        // field | frame | band | divider | accent
    maxUses
    priority
  }
}
```

Treatment compatibility matrices are deliberately **not** required in MVP because the model/host cannot override those treatment defaults.

### 11.4 Archetypes

MVP vocabulary reserves six:

| ID | Core composition intent |
| --- | --- |
| `editorial_split` | Asymmetric editorial hero and split/panel rhythm. |
| `centered_statement` | Formal centered statement composition. |
| `full_bleed_visual` | Full-surface pattern/texture/gradient field. |
| `framed_invitation` | Refined physical-invitation framing and symmetry. |
| `typography_first` | Scale/alignment/whitespace/type carry the design. |
| `layered_editorial` | Overlapping planes/cards and editorial depth. |

**Implementation gate:** do not build archetypes 4–6 merely because the enum exists. The first three (`editorial_split`, `framed_invitation`, `typography_first`) must pass the renderer tests in §11.11 under the new compiler contract before the remaining three earn implementation.

### 11.5 MotifDefinition and role-based placement

Each motif asset declares:

```ts
MotifDefinition {
  id

  supportedRoles[]  // field | frame | band | divider | accent

  colorChannels[] {
    semanticToken
    minOpacity
    maxOpacity
  }

  maxPlacements     // normally 1 or 2
}
```

Initial vocabulary may include:
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

The compiler:
1. iterates requested motifs deterministically;
2. matches supported roles to available archetype slots;
3. respects slot and motif placement caps;
4. persists resolved placements;
5. drops any unplaceable motif;
6. records dropped IDs in compilation telemetry.

No motif silently disappears.

### 11.6 Typography

Typography pairings are curated IDs with:
- display family;
- body family;
- fallback;
- weights;
- category;
- character support;
- tracking/scale bounds.

Each archetype declares compatible pairings.

The diversity planner should prefer distinct typography **categories** across a concept batch when compatible, especially when tone is constrained.

If a generated pairing is incompatible with the assigned archetype, repair deterministically to the archetype's approved default/nearest same-category choice and record the repair.

Never allow the model to output raw font-family strings.

### 11.7 Semantic palette compiler

Archetypes never consume raw DesignIntent palette roles such as `dominant` directly as backgrounds/text/buttons.

Inputs:
- DesignIntent palette colors;
- dominant color;
- tonal direction.

Output semantic tokens such as:

```text
eventBg
heroBg
surface
surfaceAlt

text
textMuted

accent
accentText

buttonBg
buttonText

border
focus

error
errorText
```

Compiler requirements:
- tonal direction owns the background strategy;
- use perceptual color operations (e.g. OKLCH or equivalent) rather than naive RGB lightening;
- preserve supplied hue/chroma intent where practical;
- derive tints/shades from supplied palette rather than inventing unrelated theme colors;
- every normal text/background pair used by the renderer clears WCAG AA 4.5:1;
- large text may use the appropriate 3:1 threshold;
- non-text interactive/focus boundaries meet 3:1 where applicable;
- button text/background clears 4.5:1;
- muted normal-size text still clears 4.5:1;
- when a same-hue adjustment cannot yield a visually acceptable accessible result, compiler may choose the nearest derived neutral/on-color from the supplied palette family;
- validate all required pairs after compilation.

The palette-control regression from the first renderer experiment must become a unit test: navy-on-navy text/button states are impossible by construction.

### 11.8 ResolvedDesignSpec — renderer base input

The compiler persists a complete immutable resolved object. Conceptual shape:

```ts
ResolvedDesignSpec {
  schemaVersion

  archetypeId
  archetypeVersion

  tonalDirection
  typographyPairing
  typographyCategory
  density

  eventDetailsTreatment
  rsvpTreatment
  registryTreatment
  guestSurfaceComposition

  visualTreatment
  ornamentation
  borderTreatment
  cardTreatment
  buttonTreatment

  motifPlacements[] {
    motifId
    slotId
    role
    resolvedChannels
  }

  semanticTokens {
    eventBg
    heroBg
    surface
    surfaceAlt
    text
    textMuted
    accent
    accentText
    buttonBg
    buttonText
    border
    focus
    error
    errorText
  }
}
```

The generated concept renderer reads the `ResolvedDesignSpec`, not current archetype defaults and not DesignIntent.

Event-level host manual overrides are applied as a separate deterministic layer after selection:
- curated palette override;
- curated typography pairing override.

Those overrides never mutate the concept record.

### 11.9 Guest-surface component system

Themed guest components include at minimum:

```text
EventButton
EventField
EventTextarea
EventCard
EventNotice
EventSheet
EventOTPInput
EventChoiceGroup
EventPartyCard
EventRegistryCard
EventGiftCard
EventConfirmation
EventAccessGate
EventFooter
EventSectionFrame
```

They consume event semantic tokens and resolved treatments, never application UI tokens.

The semantic guest flow remains predictable:

```text
access gate when private
→ name lookup
→ optional collision resolution
→ SMS OTP when phone-backed
→ party attendance
→ questions
→ submit
→ confirmation
```

Archetype-owned `guestSurfaceComposition` determines desktop composition/framing around that fixed semantic flow.

**Mobile convergence is accepted.** At ~390px, many multi-column guest surfaces collapse into a semantic stack. Mobile distinction should come from typography, framing, component skin, motifs, section surfaces, density, and hierarchy—not forced alternative information architectures.

### 11.10 Concept diversity

For each batch:

1. honor Event Identity compatibility first;
2. assign distinct eligible archetypes whenever possible;
3. assign distinct compatible tonal directions when the brief permits;
4. when compatible, assign/prefer distinct typography categories;
5. use motifs and density as additional levers;
6. vary palette dominance only within the user's color constraints.

Principle:

> **AI defines what fits. Code guarantees meaningful separation. Explicit user intent beats diversity for diversity’s sake.**

Redesign should prefer unseen compatible intent combinations but never dead-end when combinations are exhausted.

### 11.11 Renderer proof gates

The renderer must be able to fail.

**Brief 1: constrained heritage**
- same navy/cream/forest-green constrained brief for all concepts;
- first three archetypes;
- same event content;
- full guest surfaces at 390 and 1280;
- grayscale toggle;
- palette/tone control.

Pass only if:
- A/B/C are clearly different at both widths;
- they remain recognizably different in grayscale;
- B is more different from A than palette/tone-only control is;
- guest surfaces feel themed rather than generic;
- at least 3 of 5 structural axes differ pairwise where expected:
  1. hero composition;
  2. typography hierarchy;
  3. section rhythm;
  4. motif behavior;
  5. component treatment.

**Brief 2: tone constrained**
- light/airy brief;
- all three `tonalDirection = light`;
- prove archetype + typography + motif + density can still separate concepts.

**Five focused swap/compiler tests**
1. same creative brief, archetype swapped → different site;
2. same archetype, typography swapped → same site, different voice;
3. same archetype, motifs swapped → same structure, different ornamental expression/slot usage;
4. same structure, tone/palette changed → accessible semantic compiler output; no invalid contrast;
5. incompatible intent → deterministic repair + log, no model retry.

Regression expectation after compiler refactor:
- A/B/C should remain within approved visual-diff tolerance;
- the original palette-control panel is expected to change because broken contrast must be fixed.

### 11.12 Imagery boundaries

**Private inspiration**
- AI input only;
- private storage;
- short-lived raw assets after successful processing/retry window;
- never auto-published.

**Published decorative imagery**
- not supported in MVP;
- no hero/event photos;
- no stock;
- no AI-generated decorative imagery.

**Native registry thumbnails**
- content exception;
- safely fetched/normalized/stored when possible;
- never retailer-hotlinked;
- themed placeholder when unavailable.

### 11.13 Visual regression

Once an archetype is implementation-approved:
- mobile ~390px;
- desktop ~1280px;
- supported tones;
- supported density values;
- representative motif placements;
- guest access/RSVP/error/confirmation/registry states;
- palette compiler regression cases.

Do not create a combinatorial screenshot matrix for impossible model combinations. Test the **actual bundled architecture** and allowed manual overrides.

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

### 12.8 Owner/co-host RSVP management view

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

The registry section renders from the active concept's `ResolvedDesignSpec` plus any allowed event-level palette/typography override.

It contains:
- themed external-registry destination cards;
- native item cards with `Buy this gift` and Available/Purchased state;
- cash fund card.

Registry components use the same event semantic tokens and archetype-owned component treatment as RSVP/access surfaces. They must not fall back to generic application cards/forms.

Native product thumbnails remain content imagery and use normalized platform assets or a themed placeholder.

Do not imitate retailer branding beyond permitted names/logos. Do not expose internal click logs or purchaser identity.

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

## 19. Creation Mode and Management Mode

### 19.1 Creation Mode — pre-publish default

Before publish, the primary workspace is the actual event site.

Creation Mode provides:
- production event renderer;
- owner/co-host toolbar (`Design`, `Preview`);
- contextual `Edit` / `Set up` / `Add` controls attached to stable collaborator anchors;
- floating readiness/setup control;
- focused sheets/panels for structured editing;
- dedicated Guest workspace when needed.

Do **not** route concept selection into a generic setup dashboard.

### 19.2 Readiness checklist

The setup sheet is navigation, not a wizard.

**Needed to publish**
- derives only from §23.1 blockers.

**Recommended before sharing**
- Guests;
- Registry;
- Co-host;
- other useful optional work.

An event can display `Ready to publish` while recommended items remain unfinished.

### 19.3 Management Mode — operational home

After setup/publish, an operational Event Home becomes useful.

Priority:
1. RSVP summary;
2. guest responses / awaiting / Needs phone;
3. Guests;
4. Messages;
5. Registry;
6. Event sharing;
7. Edit site.

Owner additionally sees billing/co-host management/delete controls as permitted.

Keep this operational rather than analytical. No vanity analytics.

## 20. Design Editing

### 20.1 Direct design editing

Owner/co-host may directly adjust only:
- curated palette variants;
- curated typography pairings compatible with the selected archetype;
- reset to generated concept design.

Content operations remain separate:
- copy;
- section order;
- section visibility.

There are no published-site image controls.

### 20.2 Event designOverrides

Manual design edits live on `Event.designOverrides`, conceptually:

```ts
designOverrides? {
  palette?
  typographyPairing?
}
```

These deterministic overrides do not mutate `DesignIntent`, archetype version, or `ResolvedDesignSpec`.

Applying a palette override runs the same semantic palette compiler/contrast validation.

Applying typography validates against the selected archetype's compatible typography list.

### 20.3 Selecting another concept

Before publish, selecting another generated concept:
- switches `activeConceptId`;
- replaces generated design;
- clears/resets event-level manual **design** overrides unless the product explicitly offers a compatible carry-forward path;
- never changes event content, guests, RSVP, registry, privacy, or messaging data.

### 20.4 No treatment-level editing

Do not expose:
- density;
- motifs;
- motif placement;
- ornamentation;
- section treatment;
- guest composition;
- borders;
- cards;
- buttons;
- spacing;
- archetype.

These are renderer-owned.

### 20.5 No persistent AI copilot

AI reimagination exists only at concept granularity through `Try another direction`.

No persistent chat assistant, token-level AI edit, or “make this button rounder” flow.

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

## 22. Mobile-First and Responsive Requirements

Design from approximately **390px outward**, but desktop is a first-class responsive layout.

**Owner/co-host from phone**
- prompt;
- auth/save;
- inspiration;
- required details during generation;
- concept review/selection;
- redesign;
- full-site reveal;
- Creation Mode contextual editing;
- readiness checklist;
- guests/CSV where browser/OS permits;
- RSVP;
- registry;
- communication;
- privacy;
- preview;
- publish;
- share;
- post-publish management.

**Guest from phone**
- private gate;
- event details;
- name lookup;
- OTP;
- RSVP/update;
- registry;
- purchase return confirmation.

**Desktop**
- uses available space intentionally;
- concept comparison may use three columns;
- Creation Mode renders the actual responsive desktop event, not a 390px phone canvas;
- contextual editors may become side panels;
- guest management may use tables/detail panes;
- Preview offers Mobile/Desktop width toggle and defaults to Mobile.

**Guest surface convergence**
At phone width, semantic RSVP order may converge across archetypes. Do not force artificial layout differences that hurt usability. Visual differentiation must survive through type, framing, motifs, surfaces, component treatment, hierarchy, and density.

No critical product capability is desktop-only.

## 23. Event Lifecycle

```text
DRAFT → DESIGN_SELECTED → READY_TO_PUBLISH → PUBLISHED → PASSED
ARCHIVED (internal, optional)
```

- **DRAFT:** private event draft; identity/concepts/redesign allowed.
- **DESIGN_SELECTED:** `activeConceptId` points to a concept with immutable DesignIntent + archetypeVersion + ResolvedDesignSpec.
- **READY_TO_PUBLISH:** deterministic requirements below are valid; payment may remain unsatisfied.
- **PUBLISHED:** live; operations/content/allowed direct design overrides continue; AI redesign/concept switching disabled.
- **PASSED:** event time has passed in stored IANA timezone; show thank-you state; registry remains accessible.

### 23.1 Minimum READY_TO_PUBLISH requirements

Minimum:
- selected active concept with valid `ResolvedDesignSpec`;
- event title;
- event date;
- start time;
- venue/location display value;
- valid stored IANA timezone;
- RSVP deadline;
- visibility;
- encrypted access code when private;
- valid event owner/account.

Not required:
- guest rows;
- registry;
- cash fund;
- co-host;
- inspiration;
- announcements;
- completed RSVP responses.

Payment is separate:

```text
READY_TO_PUBLISH + payment satisfied → may PUBLISH
```

The Creation Mode readiness UI must reflect exactly this distinction. Optional work must not masquerade as a publish blocker.

There is no cancellation workflow in MVP.

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
  timezone,
  venueName, address,

  visibility /* public | private */,
  accessCodeEncrypted?,

  rsvpDeadline,
  status,
  slug,

  activeConceptId?,

  designOverrides? {
    palette?,
    typographyPairing?
  },

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
  id,
  draftTokenHash,
  prompt,
  inspirationAssetIds[],
  expiresAt,
  createdAt
}

EventIdentity {
  eventId,
  creativeDirection,
  toneKeywords[],
  colorsExplicitlyConstrained,
  paletteIntent,
  tonalIntent,
  toneExplicitlyConstrained,
  compatibleTonalDirections[],
  compatibleHeroArchetypes[],
  compatibleTypographyCategories[],
  visualMotifs[],
  textureDirection,
  typographyDirection,
  copyTone,
  designConstraints[],
  inspirationSummary,
  createdAt, updatedAt
}

InspirationAsset {
  id, eventId?,
  preAuthDraftId?,
  storageKey,
  mimeType, sizeBytes,
  expiresAt?,
  createdAt
}

DesignIntent {
  heroArchetype,
  tonalDirection,
  palette /* { colors[], dominant } */,
  typographyPairing,
  density,
  motifs[]
}

ResolvedDesignSpec {
  schemaVersion,
  archetypeId,
  archetypeVersion,

  tonalDirection,
  typographyPairing,
  typographyCategory,
  density,

  eventDetailsTreatment,
  rsvpTreatment,
  registryTreatment,
  guestSurfaceComposition,

  visualTreatment,
  ornamentation,
  borderTreatment,
  cardTreatment,
  buttonTreatment,

  motifPlacements[],
  semanticTokens
}

DesignConcept {
  id, eventId,
  round,
  conceptIndex,

  name, description,

  designIntent,          // immutable
  archetypeVersion,      // immutable
  resolvedDesignSpec,    // immutable

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
  operation /* event_identity | design_intent | structured_extraction */,
  round?, conceptIndex?,

  model,
  inputTokens?, cachedInputTokens?, outputTokens?, reasoningTokens?,
  costEstimateUsd?,
  latencyMs,
  success,

  diversityAssignment?,
  archetypeVersion?,
  compilerRepairs?,
  motifsDropped?,

  createdAt
}
```

`ArchetypeDefinition`, `MotifDefinition`, typography definitions, and compiler rules are versioned application code/config rather than required database tables in MVP.

### Generated-data immutability

For a DesignConcept:
- `designIntent` is immutable;
- `archetypeVersion` is immutable;
- `resolvedDesignSpec` is immutable.

Renderer source code may still receive bug, accessibility, and responsive fixes.

### Effective render state

Base guest design comes from the selected concept's `resolvedDesignSpec`.

Allowed `Event.designOverrides` are applied deterministically on top for palette/typography. They must use the same compatibility and semantic color compiler as generated concepts.

Do not recompile the concept against current archetype defaults during normal rendering.

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

- Landing page is the prompt.
- Prompt/auth state must survive OAuth exactly.
- Do not begin strong-model generation before authentication.
- **Never expose implementation complexity:** Event Identity, DesignIntent, ResolvedDesignSpec, archetype IDs/versions, compiler repairs, motif slots, provider/model tiers, backend limits.
- AI should remove decisions, not create more decisions.
- Show concepts, then show the full site, then make that same site editable.
- Do not send a newly activated host to a generic setup dashboard.
- Creation Mode uses contextual editing on the event.
- Setup progress distinguishes publish blockers from optional recommended work.
- `Try another direction` is available from initial concepts, reveal, and Design before publish.
- Redesign changes design only; event content/data remain untouched.
- Concept generated data is immutable; renderer code may be fixed.
- Inspiration images are never public site images.
- Guests never need accounts.
- No generation counters/credits during alpha/beta.
- No public gift-reservation language/state.
- Preserve mobile-first usability; use real desktop layouts on desktop.
- Accept guest-layout convergence on mobile when required for usability.
- Do not expose renderer-owned card/button/border/motif/treatment controls to hosts.

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
inspiration_link_added
inspiration_raw_cleanup
followup_question_answered

venue_timezone_inferred
identity_generated

concept_direction_assigned {
  round,
  index,
  heroArchetype,
  tonalDirection,
  typographyCategory,
  toneConstrained
}

design_intent_generated {
  round,
  index,
  heroArchetype,
  tonalDirection,
  typographyPairing,
  density
}

design_intent_compiled {
  round,
  index,
  archetypeVersion,
  repairCount,
  motifsDroppedCount
}

concept_rendered
concepts_generated
concept_selected
site_reveal_viewed
make_it_yours_clicked

creation_context_edit_opened { section, action }
setup_checklist_opened
publish_readiness_changed
guest_workspace_opened

redesign_started
redesign_prompt_refined
redesign_concepts_generated
kept_current_design
gallery_concept_selected
generation_limit_hit

preview_opened { width: mobile | desktop }

publish_readiness_failed
publish_gate_opened
publish_gate_continued
event_published

guest_added
csv_import_completed
guest_no_phone_override_set

rsvp_lookup_started
rsvp_lookup_collision
rsvp_otp_requested
rsvp_otp_throttled
rsvp_sms_verified
guest_party_session_created
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

Every metered model call also writes a `GenerationRun`.

Compiler repairs/dropped motifs belong on the associated concept-generation instrumentation and must never be silently discarded.

## 30. MVP Success Criteria

A non-technical owner/co-host can:

1. Understand the product immediately from the landing composer.
2. Describe the shower before creating an account.
3. Authenticate without losing prompt or inspiration.
4. Answer only genuinely missing required details while generation runs.
5. Receive a persisted Event Identity.
6. See three materially distinct concepts from live production rendering.
7. Reject all three and request another direction without starting over.
8. Select one and immediately see a convincing full-site reveal.
9. Enter Creation Mode by making that same site editable.
10. Complete required event setup without a wizard.
11. Understand which items block publish and which are only recommended.
12. Use contextual editing for details/RSVP/registry and dedicated workspace for guests.
13. Redesign before publish without changing event content/data.
14. Preview exact guest experience at mobile and desktop widths.
15. Manage guests/RSVP/registry/comms from phone.
16. Publish through the mocked/real-shaped $49 gate.
17. Share URL/QR/code.
18. Operate the event after publish.
19. Let guests unlock, identify, verify, RSVP, update, and browse registry without accounts.
20. Render a coherent themed guest experience across access, forms, errors, confirmation, registry, and passed state.

Renderer architecture succeeds when:
21. The model emits only six-field DesignIntent.
22. Compilation deterministically produces accessible immutable ResolvedDesignSpec.
23. Incompatible typography/motif inputs are repaired/dropped and logged without a model retry.
24. The same constrained palette can still produce three unmistakably different sites.
25. The same tonal direction can still produce three meaningfully different sites through archetype/type/motif/density.
26. Palette/tone changes cannot produce invalid text/button contrast.
27. Historical concepts do not change merely because archetype defaults later evolve.

The host should feel:

> **I described what I wanted and it basically built the event for me.**

## 31. Acceptance Criteria

### Prompt, auth, and generation
- [ ] Landing page contains the primary event composer.
- [ ] User may write prompt/add inspiration before authentication.
- [ ] Strong-model generation does not begin before auth succeeds.
- [ ] Prompt and successful inspiration uploads restore exactly after OAuth/email auth.
- [ ] Abandoned pre-auth draft/assets expire and remain private.
- [ ] Required details are collected only when missing and while generation runs.
- [ ] Venue-text timezone inference + validation + browser fallback works.

### Event Identity and diversity
- [ ] Event Identity persists tone/color constraints and compatible archetype/tone/typography-category guidance.
- [ ] Diversity planner assigns three distinct compatible archetypes whenever possible.
- [ ] Tone diversity is used only when compatible with the brief.
- [ ] Distinct typography categories are preferred across concepts when compatible, especially when tone is constrained.
- [ ] Density/motif/palette dominance may provide additional diversity without violating explicit intent.

### DesignIntent and compiler
- [ ] Strong model returns only `heroArchetype`, `tonalDirection`, `palette`, `typographyPairing`, `density`, `motifs`.
- [ ] Model cannot emit section/card/button/border/ornament/treatment overrides.
- [ ] DesignIntent validates against schema.
- [ ] Archetype bundle is loaded by explicit version.
- [ ] Incompatible typography repairs deterministically and logs a compiler repair.
- [ ] Motifs match only compatible declared slot roles.
- [ ] Motif placement caps are enforced.
- [ ] Unplaceable motifs are dropped and logged.
- [ ] No compiler repair requires a model call.
- [ ] Raw palette is never directly consumed as renderer background/text/button semantics.
- [ ] Semantic palette compiler produces all required event tokens.
- [ ] Required normal text/button contrast clears 4.5:1.
- [ ] Required non-text/focus contrast clears applicable 3:1 thresholds.
- [ ] Palette-control unit test proves navy-on-navy states are impossible.
- [ ] Compiler persists immutable ResolvedDesignSpec.
- [ ] DesignIntent + archetypeVersion + ResolvedDesignSpec all persist per concept.
- [ ] Routine rendering never recompiles old concepts from current archetype defaults.

### Concept experience
- [ ] Three concepts use live production renderer.
- [ ] Mobile later concept trees may lazy-mount without layout shift.
- [ ] Initial concept screen includes one `Try another direction` action beneath the set.
- [ ] Concept selection changes design only.
- [ ] Concept selection leads directly to full-site reveal.
- [ ] Reveal offers `Make it yours` and `Try another direction`.
- [ ] `Make it yours` converts same site into Creation Mode rather than dashboard navigation.

### Creation Mode
- [ ] Renderer sections expose stable collaborator-action anchors.
- [ ] Contextual Edit/Set up/Add controls are app-styled and absent for guests.
- [ ] Routine edits autosave.
- [ ] Guest workspace returns to prior Creation Mode context.
- [ ] Setup checklist separates publish blockers from recommended work.
- [ ] `Ready to publish` can appear even if guests/registry are incomplete.
- [ ] Design controls expose only curated palette/typography + reset/redesign.

### Redesign
- [ ] Redesign available from concepts/reveal/Design before publish.
- [ ] Feedback/inspiration optional.
- [ ] UI explicitly reassures that event content remains untouched.
- [ ] Current concept remains active while new concepts are reviewed.
- [ ] User can choose new, keep current, or refine again.
- [ ] No user-facing credits/counters.
- [ ] Post-publish AI redesign/concept switching disabled.

### Renderer proof
- [ ] First three archetypes pass constrained heritage test at 390 and 1280.
- [ ] First three remain distinguishable in grayscale.
- [ ] Archetype swap is clearly more visually significant than palette/tone-only control.
- [ ] Guest surfaces are themed and coherent beyond hero.
- [ ] Same-archetype typography swap reads as same site/different voice.
- [ ] Motif swap changes slot usage/expression without changing structure.
- [ ] Tone/palette control remains accessible after compiler.
- [ ] Incompatible intent repairs deterministically and logs.
- [ ] Light-only brief passes before remaining three archetypes are implemented.
- [ ] Mobile guest flow may converge structurally without being considered a failure.

### RSVP
- [ ] Manual add requires phone or explicit no-phone acknowledgement.
- [ ] CSV with missing phone rows imports and flags Needs phone.
- [ ] Guest lookup does not expose contact info.
- [ ] Phone-backed party requires OTP.
- [ ] OTP throttling includes party/phone and requester/event limits.
- [ ] No-phone override path works.
- [ ] Needs-phone party cannot expose RSVP.
- [ ] Guest-party session scopes event + party.
- [ ] RSVP confirmation + magic-link update path works.
- [ ] RSVP remains invite-only.

### Registry
- [ ] External registry is destination-only; no item sync claim.
- [ ] Native item safe metadata/image attempt + manual fallback.
- [ ] Product images normalized/stored, no retailer hotlinks.
- [ ] Placeholder is themed.
- [ ] Buy click does not reserve/change public availability.
- [ ] Optional return confirmation can mark purchased.
- [ ] Host/co-host may correct purchase quantity/state.
- [ ] Purchaser identity is never public.
- [ ] Cash fund processes no payment.

### Messaging/privacy
- [ ] Host attestation before platform messaging.
- [ ] STOP/opt-out honored.
- [ ] No email bypass after opt-out.
- [ ] Private code stored encrypted once.
- [ ] Private code attempts rate-limited.
- [ ] Private hero visible before code; protected content remains locked.
- [ ] QR does not bypass code.

### Roles/publishing
- [ ] Co-host has near-parity event permissions.
- [ ] Owner-only billing/co-host management/delete.
- [ ] Co-host may publish after payment satisfied.
- [ ] READY_TO_PUBLISH uses exactly §23.1.
- [ ] Guests/registry/co-host/inspiration are not publish prerequisites.
- [ ] Publish gate displays $49 one-time.
- [ ] Post-publish allowed operations work; AI redesign does not.

### Responsive/accessibility
- [ ] Complete owner/co-host and guest flows work around 390px.
- [ ] Desktop is real responsive desktop, not phone-frame UI.
- [ ] Preview on larger screens has Mobile/Desktop width toggle.
- [ ] App chrome is light-only MVP.
- [ ] Renderer and app meet WCAG 2.2 AA targets described in design docs.

## 32. Implementation Guardrails for Coding Agents

1. Revision 5 and its companion docs are authoritative over older prototypes/specs.
2. Do not add features because they are conventional for event apps.
3. Landing page is the prompt; do not reinsert signup before the user can describe the event.
4. Do not begin strong-model generation for anonymous users.
5. Preserve prompt/inspiration through auth exactly.
6. Do not add a template gallery.
7. Do not send concept selection to a generic pre-publish dashboard.
8. Creation Mode is the actual event with contextual collaborator controls.
9. Do not turn readiness into a wizard.
10. Do not count optional Guests/Registry as publish blockers.
11. Do not build token/chat-level AI editing.
12. Strong model returns six-field DesignIntent only.
13. Do not add a model `overrides` block.
14. Do not let the model choose section/card/button/border/ornamentation treatments.
15. Do not generate arbitrary HTML/layout/CSS/SVG.
16. Archetype bundle owns composition and renderer defaults.
17. Archetype definitions are versioned.
18. Persist DesignIntent + archetypeVersion + ResolvedDesignSpec.
19. Render generated concept base from resolved spec, not current archetype defaults.
20. Generated design data is immutable; renderer code bug/accessibility/responsive fixes are allowed.
21. Use deterministic compiler repair, not model retries, for compatible repair cases.
22. Motifs must declare roles/channels/opacity bounds/max placements.
23. Archetypes expose motif slots.
24. Dropped motifs must be logged; never silently ignore them.
25. Archetypes must not consume raw palette roles as backgrounds/text/buttons.
26. Use semantic palette compiler + contrast validation.
27. Palette/manual palette overrides run through the same compiler.
28. Typography must use curated pairing IDs and archetype compatibility.
29. Prefer distinct typography categories in concept diversity when compatible.
30. Accept mobile guest-surface structural convergence; do not damage usability to force layout novelty.
31. Do not implement remaining archetypes until renderer proof gates pass.
32. Do not add decorative/event site images in MVP.
33. Native product thumbnail is content exception; never hotlink retailer image.
34. Do not add retailer scraping/sync/proxies/anti-bot workarounds.
35. Do not require guest accounts.
36. Missing-phone CSV rows import as Needs phone.
37. Rare no-phone RSVP requires explicit collaborator override.
38. Do not build gift reservations/timers/public claim state.
39. Do not bypass STOP with email.
40. Do not add maps/geocoding solely for timezone.
41. Do not expose backend generation/spend counters.
42. Do not add cancel/unpublish/refund/ownership-transfer workflows.
43. Co-host remains near-parity except billing/access-management/deletion ownership controls.
44. Implement READY_TO_PUBLISH exactly from §23.1.
45. Measure latency; do not hide unbounded waits.
46. Make the smallest implementation that satisfies the product.

If a decision conflicts with this principle, stop:

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

- Native gift tracking is honor-system and can still duplicate.
- External registries are not item-synchronized.
- Rare no-phone RSVP path is intentionally weaker than OTP.
- Missing-phone imported parties cannot RSVP until fixed/overridden.
- Name lookup reveals minimal party-name existence to someone who can guess.
- SMS can fail; STOP is not bypassed through email.
- Published event visuals have no host photos/generated decorative imagery.
- Native product thumbnail may be unavailable and must fall back gracefully.
- Inspiration links may fail; uploaded screenshots are the reliable visual input.
- Raw inspiration requires temporary private storage.
- Amazon/native metadata may require manual entry.
- Venue-text timezone inference may fall back to browser timezone.
- Private event code is a convenience/privacy gate, not high-security auth.
- AI latency/cost varies and must be measured.
- No refunds/cancellation/ownership transfer.

Renderer-specific accepted constraints:
- Mobile guest information architecture may converge across archetypes.
- The model has intentionally limited creative control; archetype bundles carry substantial design authorship.
- Direct host design controls do not expose motifs/density/treatments.
- Only the first three archetypes should be considered implementation-approved until the compiler refactor + constrained/light-tone tests pass.
- Renderer bug fixes may alter pixels on historical events while preserving their immutable design data/intent.

## 35. Canonical MVP Flow

```text
LANDING = PROMPT
    ↓
Describe event
+ optional private inspiration
    ↓
Create my event
    ↓
Persist pre-auth draft
    ↓
AUTH / SAVE
(prompt + inspiration restored exactly)
    ↓
Strong-model generation begins
    ├── Event Identity
    └── missing required details collected in parallel
    ↓
Timezone inferred/validated
    ↓
Diversity planner assigns:
  archetype
  tone
  typography category
    ↓
3 DesignIntent calls in parallel
    ↓
Deterministic compiler per concept:
  versioned archetype defaults
  typography compatibility
  motif slot assignment
  semantic palette + contrast
  compiler repairs/logging
    ↓
Persist:
  DesignIntent
  archetypeVersion
  ResolvedDesignSpec
    ↓
3 live production-rendered concepts
    ├── choose one
    └── Try another direction
    ↓
FULL SITE REVEAL
"Your event looks great. Let's make it real."
    ├── Make it yours
    └── Try another direction
    ↓
CREATION MODE
actual event site is the workspace
    ├── contextual Event Details edit
    ├── RSVP setup
    ├── Registry add/setup
    ├── Guests → focused workspace
    ├── Design → curated palette/type
    ├── Preview
    └── readiness pill
          ├── Needed to publish
          └── Recommended before sharing
    ↓
Optional redesign before publish
(prompt refinement → 3 new intents → compile → choose/keep/refine)
    ↓
PREVIEW
exact guest renderer
mobile default / desktop toggle on larger screens
    ↓
READY_TO_PUBLISH validation
    ↓
$49 one-time gate
    ↓
Owner satisfies payment
    ↓
Owner/co-host publishes
    ↓
URL + QR (+ separate code if private)
    ↓
Host distributes externally
    ↓
GUEST
    ↓
Private? finished hero → access code
    ↓
Details
    ↓
Name lookup
    ├── phone-backed → SMS OTP → scoped session
    ├── noPhoneAvailable → name fallback → scoped session
    └── Needs phone → cannot expose RSVP
    ↓
Party RSVP → confirmation → magic link
    ↓
Registry
    ├── external destination → retailer
    ├── native gift → private click → retailer
    │      └── optional return confirmation
    └── cash fund → display only
    ↓
POST-PUBLISH MANAGEMENT MODE
RSVPs · Guests · Messages · Registry · Share · Edit site
    ↓
Event passes
    ↓
Thank-you state; registry remains accessible
```

## 36. North Star

The product is successful when someone with **zero design skill and zero event-software knowledge** can describe the event they are imagining and receive a beautiful, functioning, cohesive event experience in minutes.

The user should spend their time thinking about **their event**, not configuring software.

> **AI should remove decisions, not create more decisions.**
