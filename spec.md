# AI-Native Event Website + RSVP + Registry Platform

**Document:** Product Requirements Document (PRD) / `spec.md`
**Status:** Revision 6.1 — MVP baseline for implementation (§0a, §0b; Revision 5 changes recorded in §0)
**Initial launch vertical:** Baby showers
**Platform architecture:** Event-generic, baby-shower-first
**Primary build principle:** **AI should remove decisions, not create more decisions.**

---

## 0b. Revision 6.1 — content lifecycle and generation sequencing

Clarifications only; nothing about CompositionTree reopens. (1) Three separate layers: `Capabilities` (enabled features), `ContentProfile` (present content), `FeaturePresentationState` (guest visibility/readiness, never sent to the model) — §11.4. (2) DesignIntent and CompositionTree are immutable; a content edit that affects fit appends a new immutable `ResolvedDesignSpec` revision for the same concept with no model call — §4.10, §7.9, §24. (3) Required details are publish requirements collected during generation, never a prerequisite for concepts; composition uses real content where present and bounded provisional content elsewhere, re-fit when real values arrive — §7.3, §7.10. (4) End time stays optional; the RSVP deadline default has an exact rule — §7.3. (5) Human design review runs twice: now for calibration, and on the frozen production stack as the launch gate — `docs/CHANGELOG-v6.md`.

## 0a. What changed in Revision 6

Revision 6 changes one thing, comprehensively: **the renderer architecture moves from versioned archetype bundles to the composition language.** The model now authors the page composition itself as a `CompositionTree` of trusted primitives; a deterministic compiler validates, repairs, fits against rendered geometry and freezes the result. Everything about product flow, roles, RSVP, registry, messaging, publishing and limits is unchanged from Revision 5.

| Area | Revision 5 | Revision 6 |
| --- | --- | --- |
| Model creative authority | Six-field `DesignIntent` selecting an archetype bundle | `DesignIntent` v3 (`family`, `composition` replace `heroArchetype`) plus a `CompositionTree`: nesting, grouping, hierarchy, relative size, section order and surfaces, alignment, structural motifs, mobile intent |
| Composition | Archetype bundle owns hero, sections, guest composition and treatments | The model composes from nine containers, five decorative leaves and thirteen semantic nodes, enum tokens only; capability-scoped |
| Compiler | Typography repair, motif slots, palette, treatments | Strict schema, structural repair by kind, attractive-token caps, canonicalization, palette, layout resolution, **rendered-geometry verification** |
| Re-prompts | One retry for structurally invalid intent | Only for schema-invalid output, a token-cap violation, or a selector collision; once each; all other defects repaired without a model call |
| Diversity | Distinct archetypes, tones, categories | Sibling planner: distinct intents and structural directives, token allotments, skeleton-signature collisions at .70 |
| Recipes/archetypes | The design vocabulary | A library: regression fixtures, few-shot examples, repair/fallback macros, calibration; not the creative ceiling |
| Persistence | `DesignIntent + archetypeVersion + ResolvedDesignSpec` | `DesignIntent + CompositionTree (raw, canonical) + ResolvedDesignSpec` with prompt, schema, primitive-set and compiler versions |
| Proof | Three archetypes, five swap tests | Unit, adversarial, expressiveness and confirmation-run gates with numeric thresholds (§11.9) |

Evidence: `proof/`, `proof-a1/`, `proof-b/` (`RESULTS.md`, `FINAL.md`). Companion docs: `docs/event-renderer-system.md` Revision 2, `docs/model-contracts.md` Revision 2, `docs/CHANGELOG-v6.md`.

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
| Model design output | Model returns a mostly orthogonal `DesignSpec` | Model returns a **six-field `DesignIntent`** plus a non-design `presentation` object (concept name and one-line description) that the compiler never reads. It does not emit treatment/card/button/border overrides. |
| Archetypes | Hero primitive among many independent dimensions | **Versioned archetype bundle owns composition and component defaults**: section treatments, guest-surface composition, cards, borders, buttons, ornamentation, and visual treatment. |
| Compilation | Model output rendered after schema validation | Deterministic compiler resolves archetype defaults, typography compatibility, motif placement, tone/palette semantics, contrast, and repairs into immutable `ResolvedDesignSpec`. |
| Persistence | Persist immutable `DesignSpec` | Persist **DesignIntent + archetype version + ResolvedDesignSpec** for every concept. Render concept base only from the resolved spec. |
| Immutability | Generated concepts immutable | **Generated design data is immutable; renderer code is not.** Bug/accessibility/responsive fixes may improve all events without recompiling historical concepts. |
| Motifs | Model chooses motif IDs; placement implicit | Motifs declare a kind (pattern or arrangement), supported roles (`field`, `frame`, `band`, `divider`, `accent`), and bounded opacity and scale steps. The tree places them in one of five structural slots; the ornament direction caps how many render. Suppressed motifs are logged, never silently omitted. |
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
- a compact six-field `DesignIntent` for each concept;
- a `CompositionTree` for each concept: the page's structure as a tree of trusted primitives with semantic leaves, every value an enum token.

It does **not** generate HTML, CSS, JSX, JavaScript, SVG, pixel positions, free text, colors, fonts, or any component outside the primitive allowlist. The model's authority is structural: nesting, grouping, hierarchy, relative emphasis, section composition and order, surface transitions, alignment, structural motif placement, and allowable responsive intent.

A deterministic renderer compiler:
1. validates the tree against the strict schema (one re-prompt on failure, then a library fallback);
2. validates structure and repairs deterministically: nesting, depth, limits, box depth, coverage conditional on the event's capabilities, capability references, component placement, motif kind, responsive intent;
3. applies the sibling planner's attractive-token caps;
4. canonicalizes; applies the page system; compiles raw palette + tonal direction into accessible semantic event tokens; resolves typography and density;
5. resolves every token to layout values per breakpoint;
6. verifies content fit against rendered geometry at 390 and 1280 and repairs until clean;
7. produces and persists an immutable, verified `ResolvedDesignSpec`.

The production renderer renders from the resolved spec, one fixed component per primitive.

### 4.3 The composition language is the creative surface; there are no templates

There is no archetype bundle and no recipe menu. The model composes each page from a bounded, versioned primitive set (`docs/event-renderer-system.md §2`). The compiler owns everything about execution: CSS/grid/flex, breakpoints, type scale, spacing, color, contrast, touch targets, overflow, nesting validity, RSVP/Registry semantics, and business logic.

The Phase A/A.1 recipes survive as a **library** with four jobs: regression fixtures, rotated few-shot examples, repair and fallback macros, and signature calibration. They are not the creative ceiling and the renderer carries no code per recipe.

The host never sees primitives, directives, tokens, caps, or the library. There is no template gallery.

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
- its `CompositionTree` (raw model output and canonical form) is immutable;
- every `ResolvedDesignSpec` revision, including its verification record and version set (prompt, schema, primitive set, compiler), is immutable.

A concept may carry more than one resolved-spec revision. A content edit that affects fit (a longer venue, an added description) deterministically produces a **new immutable revision for the same concept**: same DesignIntent, same CompositionTree, same `compositionHash`, no model call, no recomposition; only emphasis demotions and box relaxations from rendered-geometry verification differ. `DesignConcept.activeResolvedSpecId` points at the current revision; each revision records `contentVersion`, `supersedesSpecId`, `verified.clean` and `compilerVersion`. Superseded revisions are kept. Nothing inside a persisted revision is ever mutated.

Do not silently recompile an old concept against a newer compiler or primitive set. The renderer must support every primitive-set version that has a live spec.

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
- No host-uploaded decorative/event imagery. Original AI-generated thematic artwork is in scope for Phase 4 and is optional, art-directed and compiler-placed — §7.6a.

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
- host controls for card treatment, border treatment, button treatment, spacing, density, motif placement, primitives, directives, or the library;
- seating charts, timeline/planning modules, vendors, venue marketplace;
- photo galleries, printed stationery, thank-you-note manager, invitation sending;
- host decorative site-photo uploads, hero-photo uploads, crop/position controls;
- host-supplied or stock site photography of any kind;
- **mandatory** imagery: artwork on every concept regardless of creative direction;
- model-placed imagery: any image positioned by pixel, by model-authored CSS, or by anything outside the composition language;
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

Required details are **publish requirements (§23.1), not generation blockers**. Event Identity starts immediately; DesignIntents start when identity is ready; the composition calls use whatever real details have arrived and a deterministic provisional content snapshot for the rest (§7.9). As a real value arrives, deterministic re-fit produces the next resolved-spec revision (§4.10); no field ever waits for the host to finish the form before concepts appear.

Provisional values are bounded and event-type specific so geometry is realistic: a title from the event type (`Baby shower for <family name>` when a name is known, else `A baby shower`), a date twelve weeks out on a Saturday, a start time of 1:00 PM, `Venue to be announced`, hosts omitted, deadline derived by the rule below. A provisional value is never published and never shown to guests; Creation Mode marks it as needing confirmation.

**RSVP deadline default.** If the host does not set one: the deadline is the event date minus 14 days, at 11:59 PM in the event timezone. If that instant is already past when the default is computed, use the day before the event at 11:59 PM; if the event is today or tomorrow, use the event start time. The default is recomputed only while the host has not edited the deadline; an edited deadline is never overwritten.

End time remains optional.

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

  compatibleFamilies[]              // ranked family IDs: editorial | invitation | statement
  compatibleTypographyCategories[]  // ranked broad categories, not raw fonts

  visualMotifs[]
  textureDirection
  typographyDirection
  copyTone
  hostConstraints[]                 // authoritative: prohibitions, specific requirements, corrections
  creativeGuidance[]                // advisory: the model's own recommendations
  inspirationSummary
}
```

The Event Identity describes compatibility and intent. It does not contain renderer treatment choices.

**Event Identity is the only stage that interprets the raw host prompt.** It is not validation or
preprocessing: it is where "what does this host mean, and what creative world should this event
belong to?" is answered. No later stage receives the prompt text — the planner, the DesignIntent
call and the composition call all read this object — so an understanding this stage does not reach
is not recoverable downstream. A raw prompt is never forwarded into a generic website- or
image-generation prompt (`docs/product-doctrine.md §4`).

It must hold one boundary exactly:

- **Grounded facts are preserved, never invented.** Hosts and names, event type, date, time, venue,
  address and RSVP deadline come only from the host's input or trusted saved event data. Whatever
  the prompt supplies is carried forward; where the prompt is silent, the field is absent, and the
  host completes it later (§7.3, §23.1).

  **The mechanism was chosen in Phase 4A: a sibling, not a field.** The requirement was once
  unsatisfiable — the `EventIdentity` schema is a creative brief, declares
  `additionalProperties: false` and carries no operational field, so supplied facts would either
  vanish or fail validation. Of the two options this section named, Phase 4A took the second in
  schema terms and neither in call terms. One call returns an envelope of three siblings:
  `identity` (the creative brief, shape unchanged), `suppliedFacts` (ten `*Text` fields, each a
  verbatim quotation or `null`), and `clarification` (§7.6b). The brief therefore keeps its closed
  shape and its promise, and a schema-drift test fails if an operational-looking key ever appears
  inside it. Facts and identity share one round trip because a second call would roughly double
  latency (§7.10) to separate what the schema has already separated.

  **Normalization is the application's job, never the model's.** A supplied value is carried as the
  host wrote it, including a partial one — a bare month, a weekday without a date, a described
  place. What is never done is *expanding* a partial into something more specific. Rewriting `1pm`
  as `1:00 PM` is a paraphrase of the host and is a failure of this boundary, not a tidy-up.
  Contract: `src/lib/ai/event-identity/contract.ts`; `docs/model-contracts.md §4.1`.
- **Only the host can create a host constraint.** The creative brief carries two separate
  lists and they do not share authority. `hostConstraints` is **authoritative**: an entry
  belongs there only when it is grounded in an explicit phrase from the host's own words, kept
  verbatim or near-verbatim, and later stages must respect it unless the host changes it.
  `creativeGuidance` is **advisory**: the model's own recommendations, which later creative
  stages may reconsider, override or evolve when they find something better. If interpretation
  was needed to turn the host's words into an execution recommendation, it is guidance.

  **A host constraint is narrow: a prohibition, an explicit requirement of a specific thing, or
  a correction.** Positive style direction the host names — an aesthetic, a period, a tone they
  want — is not a constraint and does not go there. It shapes the creative brief itself
  (`creativeDirection`, `toneKeywords`, palette territory), which is the object every later
  stage reads the assignment from, so it loses no authority by being recorded there: it is the
  assignment rather than a rule imposed on it. Filing it as a constraint claims the host
  forbade something when they were saying what they wanted, and that over-correction is the
  mirror of the fabrication this boundary exists to stop.

  There is deliberately no "directly entailed" middle ground. Entailment is not mechanically
  decidable, and a standard that requires interpretation to apply is the standard model taste
  re-enters through. Inference is welcome — generous, even — everywhere else in the identity;
  it is barred from exactly one field.

  Platform rules (§7.6: no logos, no proprietary characters, no campaign artwork) belong in
  neither list. They are always true, they are not this host's instruction, and the platform
  enforces them regardless.

  **This was decided on evidence.** The first live run produced roughly 39 model-taste entries
  out of 55 constraints, including a brief that told downstream stages the client had
  prohibited baby blue when the host had said only "for a boy". Every later stage reads this
  object and cannot tell a fabricated prohibition from a real one, which makes it a correctness
  failure of the same kind as inventing a fact
  (`docs/model-evals/results/creative-understanding-v1/astra-qualitative-review.md`).

- **Host-supplied human context is preserved, and is never a design instruction.** How the
  host described who the event is for — a relationship, a role, a stage of life — is carried
  verbatim in `honoreeDescriptionText`, alongside `honoreeName` when they gave a name; both are
  populated when both are present. Recording it is not permission to design from it: who an
  event is for is never an instruction to reach for that group's conventional colours, and
  never an instruction to avoid them either.

- **Creative interpretation is expected and generous.** Tone, sophistication, visual vocabulary,
  palette territory, materials and textures, symbols, imagery opportunities and things to avoid are
  all fair inference. "Lemons in Italy but classy" may imply linen, ceramic detail and an
  ivory/olive palette.
- **Inference never becomes a fact.** The same prompt may not conclude that the event is in
  Positano, outdoors, or black-tie. An aesthetic implication is an implication; a date, a place or
  a dress code is a claim about the host's event and is quoted or absent.

### 7.6 Brand/style references

Named references such as Ralph Lauren are interpreted into original attributes: heritage, equestrian, classic Americana, editorial serif, navy/ivory/forest/camel, restrained plaid, understated luxury.

Never copy protected logos/graphics or reproduce a specific proprietary design.

### 7.6a Optional AI-generated thematic artwork (Phase 4)

**Approved decision.** Phase 4 may generate original, theme-specific visual artwork as part of an
event's creative direction.

> Imagery is **optional**, **art-directed**, and serves the composition. It is never mechanically
> added to every site.

The decision changed on evidence. Revision 6 treated AI imagery as decorative scope and excluded
it; Human Test #1 reviewers supplied reference invitations whose identity came from a coordinated
theme-specific visual language — an illustrative anchor, supporting motifs, a border treatment,
atmospheric artwork, a palette drawn from the artwork, and restrained typography — and read our
image-free output as abstract by comparison. Thematic visual language is therefore judged part of
core design quality, not decoration. Evidence: `docs/human-test-1/qualitative-findings.md` F3/F4;
intent: `docs/product-doctrine.md §9`–`§10`.

In scope for Phase 4, as capabilities to design rather than a settled schema:

- an illustrative visual anchor;
- transparent-background object, character or still-life art;
- subtle atmospheric or background artwork;
- framed/editorial illustration.

Binding constraints, which do not wait for the schema:

1. **Optional, and chosen by the creative direction.** "Every event site gets an image" is not a
   product rule. A sophisticated black-tie concept may be stronger with none.
2. **Art-directed to the composition.** The brief follows the layout — subject weighting, negative
   space, crop safety — never "generate a picture, then find somewhere to put it."
3. **The model never places the image.** No pixels, no model-authored CSS, no free positioning.
   Placement is a composition-language concern and the compiler realizes it, so any new decorative
   leaf is a primitive-set version bump and a `docs/event-renderer-system.md §9` gate re-run
   (§32 #15).
4. **Original language only.** §7.6 governs: named references are translated, never copied. No
   logos, proprietary characters or campaign artwork, whatever the host's prompt asks for.
5. **The deterministic renderer still owns safe realization** — contrast, legibility, responsive
   behaviour and geometry verification are unchanged, and text readability always wins over
   artwork.
6. **Host photography stays out.** This approves *generated original artwork*, not uploads,
   galleries or stock photography, which remain non-goals (§5.2).

Neither the image model nor the artwork schema is selected here. Transparent-background reliability
varies by model and is an input to that selection rather than something a prompt adds afterwards.

### 7.6b Adaptive creative clarification

**Approved decision.** Event Identity **may** ask the host a clarifying question before concepts
are generated, on one of exactly two routes, and only when that materially improves the brief.

**Route A — creative clarification.** A question of taste, when the creative call is genuinely
open. Non-blocking: every creative question carries a `You decide` option, so the host can always
hand the call back and concepts proceed.

**Route B — authority clarification.** A question about a decision the system does not have the
authority to make. Rare. It carries no `You decide` option, because offering to decide it would
contradict the reason for asking, and it may block concept generation until answered.

This is not the setup wizard §4.7 forbids, and the distinction is precise: a wizard is a fixed,
sequential, gating intake of information the product needs; this is at most a small number of
questions, generated from something actually present in this prompt — a creative ambiguity, or a
position the brief cannot take on a person's behalf.

Canonical rules:

1. **The preferred number of questions is zero.** Typically 0; sometimes 1–2; a hard working
   ceiling of 3 before concept generation. A **creative** question (Route A) is warranted only
   when **all five** hold: two or more materially different creative worlds are plausible; the
   host has not delegated the choice; choosing wrong would substantially alter the experience
   rather than an execution detail; the distinction is creative rather than logistical; and
   asking is more valuable than making a reasonable creative bet. Otherwise decide.

   **1a. Route B — authority clarification.** A **boundary** question is warranted only when
   **all four** hold: writing the brief would otherwise take a consequential position on behalf
   of a real person that the host never settled; that position is not a matter of taste; the
   brief cannot do its job while declining to take the position; and one focused question
   resolves it. Sensitivity, emotion, culture, family or personal history, missing logistics and
   missing aesthetic preference are never triggers on their own, and creative delegation does not
   reach it. The question asks the host to state or confirm the boundary they can legitimately
   affirm as settled; it never treats the host's preference as authority over another person.

   **1b. Exclusivity and per-response limit.** A clarification decision is valid only when it
   holds zero questions, or 1–3 questions that are all creative, or exactly one question that is
   a boundary question. A boundary question is asked alone. **There is no lifetime cap:** a later
   Event Identity call may return a new boundary question if all four conditions independently
   hold again, because a spent quota is not authority.

   **Explicit delegation is an answer.** "Surprise me", "you decide" or equivalent biases
   strongly toward committing, and what is owed then is a concrete organizing premise a
   designer could visualize — not adjectives about originality or surprise.
2. **Dynamically generated** from the actual ambiguity. There is no fixed question list.
3. **Every question must pass:** *would different answers produce meaningfully different creative
   identities?* If no, it is not asked.
4. **A creative question always offers `You decide` / `Surprise me`** or equivalent — exactly
   one such option. A host must never need design vocabulary to use this product, and one who has
   none must not get a worse result. **A boundary question offers none.** A conservative option
   the host selects — leaving the matter out, keeping it unspecified — is a real choice, not a
   defer.
5. **Never low-level design choices.** Not fonts, grids, hero side, heading treatment or hex
   values — §4.1 stands unchanged. Clarification establishes the creative identity; it never
   outsources the design.
6. **Never logistics.** Clarification may not ask for a missing date, time, venue, address, RSVP
   deadline or any other operational field, and may not make design generation wait on one. Those
   are publish requirements collected after the host chooses a concept (§7.3, §23.1). Concept
   creation is not an event-information intake form.

The flow is therefore: prompt → creative understanding → optional clarification → concepts →
choose → complete the operational details. A Route A question never interrupts it.

**Provisional identity.** When a returned clarification contains a question with
`kind: "boundary"`, the `identity` returned with it is **provisional**: Route B fires only when
the brief could not do its job without settling the position, so the brief beside the question is
a working interpretation and not an authoritative one. A provisional identity **must not be
consumed** by the sibling planner (§7.7), DesignIntent, composition generation or any downstream
creative stage, and concept generation is blocked until the host answers. The host answers,
**Event Identity runs again** with that answer as current host input, and only a result carrying
no boundary question becomes the authoritative creative identity. If the rerun returns another
boundary question, that result is provisional and blocked in turn. No output field marks this —
the presence of a boundary-kind question is the machine-readable signal.

Neither the question schema, the model contract change nor the surface that presents a question is
designed here; see `docs/model-contracts.md §4` and `docs/product-doctrine.md §6`.

### 7.7 Diversity planning before concept model calls

Once Event Identity is valid **and not provisional** — that is, its clarification carries no `kind: "boundary"` question (§7.6b) — the deterministic **sibling planner** plans three concept assignments. Each sibling receives:

1. a distinct compatible **family** whenever possible, then distinct **tonal direction** when the brief allows, then distinct **typography category** and **hierarchy**;
2. a distinct **structural directive**: one value per independent dimension (opening object, primary structure, date treatment, motif use, hero surface, details folded or own, RSVP intro placement, registry layout), assembled into one sentence; siblings differ at least on structure and opening;
3. an **allotment of attractive tokens** (staggered titles, hero numerals, watermark decorations): each token to at most one sibling in three.

Never the same intent with different seeds: Phase B showed that identical intents produce skeleton collisions the selector cannot resolve. If tone is explicitly constrained, do not force dark/mid; diversity then relies on family, directive, typography and hierarchy.

The assignment is passed to the DesignIntent call; the directive, allotment and DesignIntent are passed to the composition call.

### 7.8 DesignIntent and composition generation

The strong model returns the creative intent surface below, then, in a second call per concept, the composition.

```ts
DesignIntent {
  family                    // editorial | invitation | statement (assigned)
  tonalDirection            // assigned

  palette: {
    colors: string[]        // 3–5 validated hex colors
    dominant: string        // one member of colors[]
  }

  typographyPairing         // curated ID, in the assigned category
  density                   // compact | balanced | spacious
  composition: { asymmetry, hierarchy, rhythm, sectionContrast, ornament }
  motifs[]                  // curated motif IDs
}
```

```ts
CompositionTree { version: "composition_v1"; sections: Section[] }   // docs/event-renderer-system.md §2
```

The composition call is conditioned on the DesignIntent, the event's capabilities and content profile, the generated primitive spec and rules, the sibling's directive and token allotment, and three rotated library examples. It is re-prompted only for schema-invalid output, a token-cap violation, or a selector collision, once each.

**No model-emitted style overrides exist in MVP.** A tree carries no colors, fonts, sizes, pixels or free text.

The same response also carries a `presentation` object (`name`, `description`) for the concept card. It is host-facing metadata, validated separately, persisted on `DesignConcept`, and never read by the compiler. If it is missing, invalid, or duplicates another concept's name, a deterministic fallback name is derived (see `docs/model-contracts.md` §21).

The model cannot emit:
- HTML, CSS, JSX, JavaScript, SVG;
- pixel or absolute positioning; free ratios; custom breakpoints; animation;
- colors, fonts, sizes; semantic background/text/button colors;
- free text or copy;
- any node, prop or value outside the primitive allowlist;
- RSVP or Registry internals; business logic.

Those belong to the compiler. What the model does own is listed in §4.2.

### 7.9 Renderer compilation

For each concept:

1. Validate the composition response against the strict schema; on failure re-prompt once with the error list; on a second failure fall back to a library page and record it.
2. Validate structure and repair deterministically, logging every repair by kind (`structural`, `coverage`, `capability`, `responsive`, `planner`, `fit-estimate`, `fit-verified`).
3. Apply the sibling's attractive-token caps (one re-prompt, then deterministic neutralization).
4. Canonicalize (defaults, ids, hash).
5. Validate typography against family and hierarchy; repair deterministically and record.
6. Resolve motif placements from the tree within the ornament budget; swap a motif of the wrong kind for its slot and record it; never drop silently.
7. Compile raw palette + tonal direction into semantic accessible event tokens.
8. Resolve every token to layout values per breakpoint.
9. Verify content fit against rendered geometry at 390 and 1280; demote emphasis, then relax boxes, until clean.
10. Check the skeleton signature against siblings and redesign history; on a collision re-prompt once, then fall back.
11. Produce the immutable `ResolvedDesignSpec` revision with `verified.clean = true`.
12. Persist `DesignIntent`, `CompositionTree` (raw and canonical), and the `ResolvedDesignSpec` revision with the version set; set `activeResolvedSpecId`.

Steps 7–9 and 11–12 also run, alone, whenever a content edit changes the content profile (**re-fit**): same tree, new revision, no model call. The content profile used for a compilation is recorded on the revision (`contentVersion`), including which fields were provisional.

No model call is used for compiler validation, repair or re-fit.

### 7.10 The wait

Generation is a product surface, not a loading state to hide. It must feel like progress:

1. required details run while identity is being created and never block a concept from appearing;
2. user-facing portions of Event Identity may stream;
3. three DesignIntent calls, then three composition calls, run in parallel after the planner assigns siblings, using real details where present and provisional content elsewhere;
4. compilation is deterministic/local;
5. each concept renders as soon as its resolved spec exists — **concept-level readiness, not one monolithic "generation complete"**. The host may inspect a finished concept while the others are still compiling.

Two approved behaviours of this surface:

- **What is shown is real output, never theater.** Structured creative artifacts the pipeline actually produced — interpreted creative signals, palette territory, visual vocabulary, concept names, art direction, visual fragments, composition previews, concept readiness — surfaced as each genuinely resolves. **Never model reasoning or chain-of-thought, and never fabricated progress**: no invented percentages, no simulated "thoughts", no stage claiming work that has not happened.
- **Optional detail entry during generation.** The host may fill in missing facts only they know — honoree/event name, date, time, venue, address, RSVP deadline, host names — while generation runs. Watching and filling in are equally valid and the host may switch freely. This is not a second onboarding: it is the §7.3 form, offered rather than demanded. Missing logistics still never block generation, are never asked during creative clarification (§7.6b), and are never invented (§7.5).

The surface may reflect the event's resolving creative world, and remains subject to §4.1: it never becomes a mood-board picker, font or palette chooser, layout selector or questionnaire. Intent: `docs/product-doctrine.md §8a`.

Latency targets remain p75 goals:

| Milestone | Target |
| --- | --- |
| Event Identity visible | ≤ 5 s |
| First concept rendered | ≤ 15 s |
| All three concepts rendered | ≤ 45 s |

Measure reality; do not silently allow unbounded waits.

**These targets predate §7.6a and budget nothing for image generation.** They are unchanged here. If Phase 4 ships thematic artwork a heavy case will exceed them, and they are then re-set deliberately against a measured imagery path — never widened quietly to match whatever was built. The open mismatch is recorded in `docs/product-doctrine.md §14` conflict 9.

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
- typography pairings compatible with the concept's family and hierarchy;
- reset to concept design;
- `Try another direction ✦` before publish.

Do not expose primitives, directives, tokens, density, motifs, treatment, borders, cards, buttons, spacing, or CSS.

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
3. `generateComposition(...)` for each concept

These are the only frontier creative operations in MVP.

The model does **not** generate the final renderer schema. Application code compiles the DesignIntent and CompositionTree to a verified ResolvedDesignSpec.

A thin provider capability layer is sufficient:

```ts
generateEventIdentity(...)
generateDesignIntent(...)
generateComposition(...)
```

Do not build a large abstraction framework prematurely.

### 9.2 Cheaper-model usage

Use smaller/cheaper models only where ordinary code is insufficient and quality remains acceptable:
- structured event-detail extraction;
- missing-field detection;
- ambiguous date/time normalization;
- candidate IANA timezone inference + confidence.

Validate timezone in code.

Do not add models for renderer validation, structural repair, motif placement, contrast, content fit, or design compilation.

### 9.3 No-model operations

Never call a model for:
- auth draft persistence;
- changing structured date/time/venue;
- hiding/reordering sections;
- applying host palette/typography overrides;
- editing text;
- guests/registry/cash-fund operations;
- validating Event Identity/DesignIntent/CompositionTree structure;
- validating enum IDs;
- planning sibling assignments, directives and token allotments;
- structural repair, coverage repair, capability repair, responsive overrides, box-depth and motif-kind repair;
- attractive-token neutralization;
- typography compatibility repair;
- resolving motif placements from the tree;
- semantic palette compilation;
- contrast derivation;
- layout resolution and rendered-geometry verification;
- skeleton signatures and collision detection;
- producing ResolvedDesignSpec;
- enforcing generation limits;
- gift state transitions;
- product-image processing.

### 9.4 Persistence and renderer reproducibility

Persist:
- Event Identity;
- every generated DesignIntent;
- every generated CompositionTree, raw and canonical, with its prompt, schema, primitive-set and compiler versions;
- every immutable ResolvedDesignSpec revision, with `contentVersion` and `supersedesSpecId`, and the concept's `activeResolvedSpecId`;
- event-level manual design overrides separately.

Do not re-send original raw inspiration for routine redesign after its summary is available.

Do not recompile historical concepts merely because the compiler or the primitive set changes.

Renderer code may evolve/fix bugs while continuing to consume the old resolved schema/version.

### 9.5 Compilation telemetry

Each concept compilation may emit deterministic telemetry:

```ts
schemaValidFirstCall          // raw model output parsed strictly
reprompts[]                   // kind: schema | token-cap | collision (at most one each)
compilerRepairs[]             // { rule, path, kind, before, after }; kind: structural | coverage | capability | responsive | planner | fit-estimate | fit-verified
verified                      // { desktop, mobile, fitDemotions, clean, authoritative: "rendered-geometry" }
signature, nearestSibling     // skeleton signature and the worst sibling similarity at accept
fallback?                     // "library" when the model's tree was replaced
```

Schema validity, deterministic repairs, geometry verification and model re-prompts are separate measures; never fold one into another. Compiler repair must not trigger a model retry; only schema-invalid output, a token-cap violation and a selector collision may.

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

This is the core renderer contract. `docs/event-renderer-system.md` Revision 2 is the implementation-level companion and wins on renderer-detail questions that do not conflict with this PRD.

### 11.1 The rule

> **The model composes from trusted primitives. The compiler validates, repairs, fits against real geometry, and freezes. The renderer only consumes resolved, verified, persisted design data.**

The model never emits HTML, CSS, JSX, JavaScript, pixels, free text, colors, fonts, or components outside the allowlist. The renderer must be expressive enough that concepts remain visibly distinct even when palette and tone are constrained; the frozen Phase B confirmation run measured 58 distinct first-screen skeletons in 60 with 78% novel against the recipe library (88–90% in the exploratory runs).

### 11.2 DesignIntent — model contract (v3)

Six creative fields, plus motifs and the non-design `presentation` object:

```ts
DesignIntent {
  family: "editorial" | "invitation" | "statement"
  tonalDirection: "light" | "mid" | "dark"
  palette: { colors: string[]; dominant: string }     // 3–5 valid hex colors; dominant ∈ colors
  typographyPairing: string                            // curated ID
  density: "compact" | "balanced" | "spacious"
  composition: {
    asymmetry: "symmetric" | "gentle" | "strong"
    hierarchy: "restrained" | "editorial" | "dramatic" | "monumental"
    rhythm: "continuous" | "alternating" | "punctuated"
    sectionContrast: "low" | "moderate" | "high"
    ornament: "none" | "restrained" | "decorative"
  }
  motifs: string[]
}
```

`family` and `composition` select nothing. They condition the composition call and are measured afterwards. There is **no model `overrides` block**.

### 11.3 CompositionTree — model contract (composition_v1)

The model's second output per concept. Layout containers `Stack`, `Cluster`, `Split`, `Rail`, `Grid`/`Cell`, `Frame`, `Surface`, `Overlay`; decorative leaves `MotifField`, `MotifBand`, `Rule`, `Glyph`, `Monogram`; semantic leaves `Eyebrow`, `EventTitle`, `Hosts`, `Description`, `Deadline`, `Venue`, `Location`, `Time`, `Date`, `CTA`, `SectionHeading`; opaque components `RSVP`, `Registry`/`RegistryItem`, `CashFund`. Sections `hero | details | rsvp | registry | band` with a surface role and a root node. Every value is an enum token (ratio 38/50/62; widths, heights, insets, gaps in three steps; extents in four; emphasis in four).

Rules the compiler enforces and repairs: the nesting matrix; depth ≤ 5; box depth ≤ 2; per-section and per-page node and primitive caps; 3–6 sections with hero first; coverage conditional on the event's capabilities; component placement (never in a Cluster, a rail, a decoration, or a narrow cell; at least half of a Split); motif kind per slot; responsive-intent overrides. The full table is `docs/event-renderer-system.md §2.4`. Additions to the language require a proof run and a primitive-set version bump.

### 11.4 Capabilities

Three layers, deliberately separate:

1. **`Capabilities`** — what the event is allowed to contain: `{ rsvp, registry, gifts, externalRegistry, cashFund, hosts, description, time, location, deadline }`, derived from the event's enabled features, never from whether content has been entered. For a baby shower at first generation this is the full set, so every first composition has a designed place for RSVP and registry. The prompt names what is unavailable; the validator removes any reference to it as a `capability` repair; nothing unavailable is ever required. Features cannot be disabled before generation; disabling one later is render-time suppression (layer 3), never a recompile.
2. **`ContentProfile`** — what content currently exists and how large it is (title word count, presence and length of hosts, description, time, location, deadline, registry counts), plus which fields are provisional (§7.3). Sent to the composition call for fit; changes to it trigger deterministic re-fit revisions (§4.10), never recomposition.
3. **`FeaturePresentationState`** — deterministic guest-visibility/readiness per section and optional leaf, derived from operational data and **never sent to the model**:
   - `registry`: Creation Mode always shows the designed section in its setup state; guest-visible when at least one external registry, native gift or cash fund exists;
   - `rsvp`: Creation Mode always shows the designed section in its setup state; guest-visible when RSVP is configured to function and **at least one party has been invited**;
   - optional text leaves (`Hosts`, `Description`, `Time`, `Location`, `Deadline`): collapsed and hidden from guests when empty; the collaborator affordance (`Add description`) stays anchored to the designed location;
   - a provisional value is treated as empty for guests and as needing confirmation in Creation Mode.

Content and operational state change **visibility**, never composition. Suppressing a section is a render-time flag on the persisted revision's section id; the tree and the revision are untouched.

### 11.5 Compilation and repair

Pipeline: strict schema → structural validation and deterministic repair → attractive-token caps → content-fit estimate (advisory) → canonicalize → page system + semantic palette + typography → layout resolution → rendered-geometry verification (authoritative) → immutable `ResolvedDesignSpec`.

Every repair is logged `{ rule, path, kind, before, after }`. Repair kinds: `structural`, `coverage`, `capability`, `responsive`, `planner`, `fit-estimate`, `fit-verified`. No repair calls a model. Library macros (a hero, an rsvp section, a registry section) are the only non-rule repair inputs.

Model re-prompts happen for exactly three reasons, at most once each per candidate: schema-invalid output, an attractive-token violation, a selector collision. A second failure falls back to a library page and is recorded as such.

### 11.6 Rendered-geometry verification

A spec is final only when it has been rendered at 390 and 1280 and every text node is within its line limit and its container, and no element overflows horizontally. The verifier demotes emphasis, then relaxes the innermost box around a persistent overflow, and re-renders; the renderer stylesheet carries a floor (words can always break, glyph rows wrap, decorations clip, numerals in rails are rail-sized) so horizontal overflow is impossible by construction. The static estimate is a hint only. Zero residual overflow is a hard criterion of every confirmation run.

### 11.7 Semantic palette compiler, typography, motifs, density

Unchanged from Revision 5 §11.5–§11.7 in substance: raw palette never becomes text/background/button semantics; the OKLCH semantic compiler produces all required tokens with contrast by construction and the palette-control regression stays a unit test. Typography pairings are curated IDs with categories; compatibility is by family and hierarchy (a pairing must hold at monumental). Motifs declare a kind, the roles they support, and bounded opacity and scale steps; the tree places them in one of five structural slots; the ornament direction is a hard cap on how many render, with every suppression logged as a `motif.budget` deviation and kept in the resolved spec as evidence; a motif of the wrong kind for its slot is swapped and logged, never dropped silently. Density maps to gap, inset and section-spacing scales.

### 11.8 ResolvedDesignSpec — renderer base input (resolved_v2)

```ts
ResolvedDesignSpec {
  version
  designIntent; presentation
  composition            // canonical tree after repair, caps and fit
  compositionHash; capabilities
  pageSystem; tokens; layout /* per node, per breakpoint, numeric */; motifs
  compilerRepairs[]; intentDeviations[]; signature
  verified { desktop, mobile, fitDemotions, clean: true, authoritative: "rendered-geometry" }
  contentVersion; supersedesSpecId?   // re-fit revisions: same compositionHash, new content profile
  versions { primitiveSet, compiler, compositionPrompt, compositionSchema, designIntentPrompt, designIntentSchema }
}
```

The renderer reads only this object: one fixed component per primitive and semantic node, a static stylesheet keyed by classes and numeric custom properties. No CSS text is derived from model output. Event-level host overrides (curated palette, curated typography) are a separate deterministic layer applied after selection and never mutate the concept record.

### 11.9 Concept diversity and proof gates

The sibling planner (§7.7) provides distinct intents, directives and token allotments; the skeleton signature (structural tokens of the hero, surface sequence, RSVP and registry skeletons, alignment, typography category, tone; per breakpoint; threshold .70) rejects collisions with siblings and redesign history.

The proof harnesses in `proof-b/` are the regression suite. Any change to the language, validator, compiler, renderer rules or planner reruns: unit tests; the adversarial set (every fixture repairs to zero violations and renders with zero overflow; every schema-invalid payload is rejected); expressiveness (every library silhouette validates and renders); and a sibling-batch confirmation run with these thresholds: ≥ 90% schema-valid on the first call and 100% after one re-prompt; 100% repair-valid; 100% geometry-clean; ≥ 30 distinct hero skeletons and ≥ 40% novel in 60; 0 sibling collisions after the selector; each attractive token in ≤ 1/3 of heroes. Mobile convergence is expressed by the tree's mobile intents and is not a failure.

**The human design-quality bar is deliberately not in that list.** It is a launch gate, not a regression threshold: a code change cannot re-run it, and it measures the product rather than the compiler. Its status is exactly this — **Human Test #1 was stopped early, produced qualitative calibration evidence only, and established no pass/fail result; no score is claimed from it. Human Test #2, on the frozen production creative stack, is the launch-quality human gate, and its threshold is calibrated against the library's score in the same session rather than assumed.** Its protocol and pass threshold are **frozen and recorded before the production results are reviewed**: calibrating against the library happens in the same session, but the bar is never chosen or adjusted after the outcome is known. Moving the goalposts post-result voids the gate. The ≥ 70% figure recorded in earlier revisions was provisional and was never approved as a settled number; treat it as the working expectation to calibrate against, not as a decided threshold. See `docs/CHANGELOG-v6.md` and `docs/human-test-1/qualitative-findings.md`.

### 11.10 Guest-surface component system

Unchanged from Revision 5 §11.9: the themed guest components, the fixed semantic RSVP flow, and mobile convergence. The composition around them is now the tree's; `RSVP`, `Registry`, `RegistryItem` and `CashFund` are opaque nodes that take width from their container, surface from the nearest `Surface`, and card/button/border language from the page system.

### 11.11 Imagery boundaries and visual regression

The imagery boundary is stated here rather than by reference, because the Revision 5 sections this
previously cited (§11.12–§11.13) are not in this document.

- **Not permitted:** host-uploaded decorative or event photography, venue/maternity galleries,
  stock photography, crop/position tools, and any image placed by the model rather than by the
  composition language (§5.2, §32 #32).
- **Permitted as content, not decoration:** the native registry item thumbnail, which is product
  content and never retailer-hotlinked (§15.2).
- **Approved for Phase 4:** original AI-generated thematic artwork, optional, art-directed and
  compiler-placed, under §7.6a. Text readability and semantic hierarchy always win over artwork.
- **Inspiration uploads are private model inputs** and never become public site imagery (§7.2,
  §26, §27).

Visual regression is the confirmation-run renders at 390 and 1280 (gray and color) and the library
expressiveness sheets, replacing the Revision 5 screenshot matrix.

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

Registry components use the same event semantic tokens and page-system component treatment as RSVP/access surfaces. They must not fall back to generic application cards/forms.

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
- curated typography pairings compatible with the concept's family and hierarchy;
- reset to generated concept design.

Content operations remain separate:
- copy;
- section order;
- section visibility.

There are no published-site image controls. Should Phase 4 ship thematic artwork (§7.6a), art direction is a property of the concept, not a host-facing image editor.

### 20.2 Event designOverrides

Manual design edits live on `Event.designOverrides`, conceptually:

```ts
designOverrides? {
  palette?
  typographyPairing?
}
```

These deterministic overrides do not mutate `DesignIntent`, `CompositionTree`, or `ResolvedDesignSpec`.

Applying a palette override runs the same semantic palette compiler/contrast validation.

Applying typography validates against the concept's family and hierarchy compatibility.

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
- primitives, directives or the library.

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
At phone width, semantic RSVP order may converge across compositions. Do not force artificial layout differences that hurt usability. Visual differentiation must survive through type, framing, motifs, surfaces, component treatment, hierarchy, and density.

No critical product capability is desktop-only.

## 23. Event Lifecycle

```text
DRAFT → DESIGN_SELECTED → READY_TO_PUBLISH → PUBLISHED → PASSED
ARCHIVED (internal, optional)
```

- **DRAFT:** private event draft; identity/concepts/redesign allowed.
- **DESIGN_SELECTED:** `activeConceptId` points to a concept with immutable DesignIntent + CompositionTree + an active ResolvedDesignSpec revision.
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
  compatibleFamilies[],
  compatibleTypographyCategories[],
  visualMotifs[],
  textureDirection,
  typographyDirection,
  copyTone,
  hostConstraints[], creativeGuidance[],
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
  family,
  tonalDirection,
  palette /* { colors[], dominant } */,
  typographyPairing,
  density,
  composition /* { asymmetry, hierarchy, rhythm, sectionContrast, ornament } */,
  motifs[]
}

CompositionTree {
  version,               // primitive-set version, e.g. composition_v1
  sections[]             // { kind, surface, align?, fill?, root: Node } — trusted primitives, enum tokens
}

ResolvedDesignSpec {
  version,
  designIntent, presentation,
  composition,           // canonical tree after repair, caps and verified fit
  compositionHash, capabilities,
  pageSystem, tokens /* semantic palette, fonts, scale, spacing */,
  layout /* per node, per breakpoint, numeric */, motifs,
  compilerRepairs[], intentDeviations[], signature,
  verified /* { desktop, mobile, fitDemotions, clean, authoritative } */,
  versions /* primitiveSet, compiler, compositionPrompt, compositionSchema, designIntentPrompt, designIntentSchema */
}

DesignConcept {
  id, eventId,
  round,
  conceptIndex,

  name, description,     // from the model's presentation object, or deterministic fallback

  designIntent,          // immutable
  compositionRaw,        // immutable: the model's tree as returned
  composition,           // immutable: canonical tree
  resolvedDesignSpecs[], // immutable revisions r1, r2, …; same composition; re-fit on content change
  activeResolvedSpecId,  // the revision rendered
  directive, tokenAllotment, fallback?   // planner record

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

  promptVersion,         // e.g. event_identity_v1 | design_intent_v2
  schemaVersion,         // e.g. event_identity_schema_v1 | design_intent_schema_v3 | composition_schema_v1
  primitiveSetVersion?, compilerVersion?,

  diversityAssignment?,  // family, tone, category, hierarchy, directive, token allotment
  schemaValidFirstCall?, reprompts?,   // kind: schema | token-cap | collision
  compilerRepairs?,      // by kind
  verified?,             // geometry record
  signature?, nearestSibling?, fallback?,

  createdAt
}
```

The primitive set, `MotifDefinition`, typography definitions, the library, directive dimensions, attractive-token list and compiler rules are versioned application code/config rather than required database tables in MVP.

### Generated-data immutability

For a DesignConcept:
- `designIntent` is immutable;
- `compositionRaw` and `composition` are immutable;
- every `resolvedDesignSpecs[]` revision and its version set are immutable; a content edit appends a revision (`contentVersion`, `supersedesSpecId`) and moves `activeResolvedSpecId`.

Renderer source code may still receive bug, accessibility, and responsive fixes.

### Effective render state

Base guest design comes from the selected concept's active resolved-spec revision, filtered by `FeaturePresentationState` (§11.4).

Allowed `Event.designOverrides` are applied deterministically on top for palette/typography. They must use the same compatibility and semantic color compiler as generated concepts.

Do not recompile the concept against a newer compiler or primitive set during normal rendering.

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
- **Never expose implementation complexity:** Event Identity, DesignIntent, CompositionTree, ResolvedDesignSpec, primitives, directives, allotments, the library, compiler repairs, provider/model tiers, backend limits.
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
  family,
  tonalDirection,
  typographyCategory,
  hierarchy,
  directive,
  tokenAllotment,
  toneConstrained
}

design_intent_generated {
  round,
  index,
  family,
  tonalDirection,
  typographyPairing,
  density,
  composition
}

composition_generated {
  round,
  index,
  schemaValidFirstCall,
  reprompts,             // schema | token-cap | collision
  violationsBefore,
  fallback?
}

composition_compiled {
  round,
  index,
  primitiveSetVersion,
  compilerVersion,
  repairsByKind,
  verifiedClean,
  fitDemotions,
  nearestSibling
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
21. The model emits only the six-field DesignIntent plus non-design presentation metadata; the compiler consumes the six fields only.
22. Compilation deterministically produces accessible immutable ResolvedDesignSpec.
23. Incompatible typography/motif inputs are repaired/dropped and logged without a model retry.
24. The same constrained palette can still produce three unmistakably different sites.
25. The same tonal direction can still produce three meaningfully different sites through family, directive, composition, type, motif and density.
26. Palette/tone changes cannot produce invalid text/button contrast.
27. Historical concepts do not change merely because the compiler or primitive set later evolves.

The host should feel:

> **I described what I wanted and it basically built the event for me.**

## 31. Acceptance Criteria

### Prompt, auth, and generation
- [ ] Landing page contains the primary event composer.
- [ ] User may write prompt/add inspiration before authentication.
- [ ] Strong-model generation does not begin before auth succeeds.
- [ ] Prompt and successful inspiration uploads restore exactly after OAuth/email auth.
- [ ] Abandoned pre-auth draft/assets expire and remain private.
- [ ] Required details are collected only when missing and while generation runs, and never block concepts from appearing.
- [ ] Venue-text timezone inference + validation + browser fallback works.
- [ ] Adaptive clarification asks nothing in the common case, never a logistics field, and declares a `kind` on every question (§7.6b).
- [ ] Creative clarification (Route A) stays within the ceiling of three, offers exactly one `You decide` option per question, and never gates concepts from appearing (§7.6b).
- [ ] Authority clarification (Route B) is asked alone and at most once per response, offers no `You decide` option, and may block concept generation until answered; the identity returned beside it is provisional and is not consumed by the sibling planner or any downstream creative stage (§7.6b, §7.7).
- [ ] Every clarification offered is one whose answers would produce materially different creative identities, and every one offers a `You decide` option.
- [ ] Each concept becomes available as soon as its resolved spec exists; no concept waits on its siblings (§7.10).
- [ ] The generation surface shows only artifacts the pipeline produced — no model reasoning, no fabricated progress or completion percentages (§7.10).
- [ ] Missing event facts may optionally be entered during generation, and doing so is never required to reach concepts (§7.10).

### Event Identity and diversity
- [ ] Event Identity persists tone/color constraints and compatible family/tone/typography-category guidance.
- [ ] Event Identity is the only stage that receives the raw host prompt; the planner, DesignIntent and composition calls read the persisted identity (§7.5).
- [ ] Event Identity preserves supplied event facts exactly and invents none that the host did not supply, while inferring aesthetic implications freely (§7.5).
- [ ] Named aesthetic references become original visual language; no logo, proprietary character or campaign artwork is reproduced (§7.6).
- [ ] The sibling planner assigns three distinct compatible families whenever possible, then distinct tones, typography categories and hierarchies when the brief allows.
- [ ] Siblings receive distinct structural directives (at least structure and opening differ) and attractive-token allotments (each token to at most one sibling in three).
- [ ] Siblings never share an identical DesignIntent.
- [ ] Tone diversity is used only when compatible with the brief.
- [ ] Skeleton-signature collisions with siblings or redesign history at or above .70 are re-prompted once, then fall back to the library, and are recorded.

### DesignIntent, composition and compiler
- [ ] Strong model returns `family`, `tonalDirection`, `palette`, `typographyPairing`, `density`, `composition`, `motifs`, plus a `presentation` object (`name`, `description`) that the compiler never reads.
- [ ] Duplicate or invalid concept names fall back deterministically and are logged as compiler repairs.
- [ ] The composition response validates against the strict schema; unknown keys, non-enum values, free text and unknown node types are rejected.
- [ ] A schema-invalid composition is re-prompted exactly once with the validator's errors; a second failure falls back to a library page and is recorded.
- [ ] The tree references only capabilities the event has; references to disabled capabilities are removed and logged as `capability` repairs; no disabled capability is required.
- [ ] Every structural rule (nesting matrix, depth, box depth, limits, coverage, component placement, surface sequence, motif kind, responsive intent) is validated and repaired deterministically, with every repair logged by kind.
- [ ] Attractive-token allotments are enforced: one re-prompt, then deterministic neutralization logged as a `planner` repair.
- [ ] No structural, coverage, capability, responsive, box, motif-kind or fit repair calls a model.
- [ ] Incompatible typography repairs deterministically and logs a compiler repair.
- [ ] Motifs are placed only in slots of the matching kind; a wrong-kind motif is swapped and logged; nothing is dropped silently.
- [ ] Content fit is verified against rendered geometry at 390 and 1280; a spec revision is final only with `verified.clean = true`; residual horizontal or text overflow is zero.
- [ ] A content edit that affects fit produces a new immutable resolved-spec revision for the same concept (same composition hash, no model call) and moves `activeResolvedSpecId`; no persisted revision is mutated.
- [ ] Capabilities derive from enabled features, the content profile from present content, and guest visibility from `FeaturePresentationState`; none of the three causes recomposition.
- [ ] Concepts appear without waiting for the required-details form; provisional content is bounded, never published, and re-fit when real values arrive.
- [ ] The static fit estimate never finalizes a spec on its own.
- [ ] Raw palette is never directly consumed as renderer background/text/button semantics.
- [ ] Semantic palette compiler produces all required event tokens.
- [ ] Required normal text/button contrast clears 4.5:1.
- [ ] Required non-text/focus contrast clears applicable 3:1 thresholds.
- [ ] Palette-control unit test proves navy-on-navy states are impossible.
- [ ] Compiler persists immutable, verified ResolvedDesignSpec.
- [ ] DesignIntent + CompositionTree (raw and canonical) + ResolvedDesignSpec persist per concept with prompt, schema, primitive-set and compiler versions.
- [ ] Routine rendering never recompiles old concepts against a newer compiler or primitive set.
- [ ] The renderer has one fixed component per primitive and derives no CSS text from model output.

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
- [ ] Unit tests cover the library's validity and canonicalization, every repair rule with a fixture, schema-invalid rejection, attractive-token detectors, planner distinctness and signature calibration.
- [ ] Every adversarial fixture repairs to zero remaining violations and renders with zero overflow at 390 and 1280; every schema-invalid payload is rejected with a rule and path.
- [ ] Every library silhouette and section recipe validates and renders through the primitive renderer.
- [ ] A sibling-batch confirmation run meets the thresholds of §11.9 and is reported as separate schema, repair, geometry, invention, token-distribution, collision and review metrics.
- [ ] Guest surfaces are themed and coherent beyond the hero.
- [ ] Tone/palette control remains accessible after the compiler.
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

1. Revision 6 and its companion docs are authoritative over older prototypes/specs.
2. Do not add features because they are conventional for event apps.
3. Landing page is the prompt; do not reinsert signup before the user can describe the event.
4. Do not begin strong-model generation for anonymous users.
5. Preserve prompt/inspiration through auth exactly.
6. Do not add a template gallery.
7. Do not send concept selection to a generic pre-publish dashboard.
8. Creation Mode is the actual event with contextual collaborator controls.
9. Do not turn readiness into a wizard. Adaptive clarification (§7.6b) is the one permitted pre-concept question and is bounded on both of its routes. Route A: taste only, never logistics, always a `You decide` option, never a gate on concepts appearing. Route B: only a decision the system has no authority to make, never triggered by sensitivity/emotion/culture/family/logistics/missing taste alone, asked alone and at most once per response, no `You decide` option, and the only route permitted to block concepts — behind which the identity is provisional and must not flow downstream (§7.7).
10. Do not count optional Guests/Registry as publish blockers.
11. Do not build token/chat-level AI editing.
12. Strong model returns a six-field DesignIntent (`family`, `composition`, no `heroArchetype`) plus non-design presentation metadata, and a `CompositionTree` of trusted primitives; nothing else.
13. Do not add a model `overrides` block or any per-node color, font, size, pixel or free-text field.
14. The model owns structure (nesting, grouping, hierarchy, relative size, section order and surfaces, alignment, structural motifs, mobile intent); the compiler owns execution (CSS, breakpoints, type scale, spacing, color, contrast, touch targets, overflow, nesting validity, RSVP/Registry semantics, business logic).
15. Do not add a primitive, prop or token to the composition language without a proof run and a primitive-set version bump; never generate arbitrary HTML/layout/CSS/SVG.
16. Scope every tree to the event's capabilities (enabled features, never content presence); never require or allow a reference to a disabled capability; guest visibility of sections and empty leaves is `FeaturePresentationState`, a render-time flag, never a recomposition.
17. Validate the composition against the strict schema and the structural rules on every response, whatever the provider claims to enforce.
18. Persist DesignIntent + CompositionTree (raw and canonical) + every ResolvedDesignSpec revision with prompt, schema, primitive-set and compiler versions; content edits append revisions, never mutate one.
19. Render generated concept base from the resolved spec, one fixed component per primitive; derive no CSS text from model output.
20. Generated design data is immutable; a content edit re-fits into a new revision of the same concept without a model call; renderer code bug/accessibility/responsive fixes are allowed.
21. Repair structural, coverage, capability, responsive, box-depth, motif-kind and fit defects deterministically and log them by kind; re-prompt the model only for schema-invalid output, a token-cap violation or a selector collision, once each.
22. Motifs must declare kind, roles and bounded opacity/scale steps; the tree places them in one of five structural slots, and the ornament direction is a hard cap on how many render. Suppression is explicit, logged and kept in the resolved spec.
23. A motif of the wrong kind for its slot is swapped and logged; never dropped silently.
24. Rendered-geometry verification at 390 and 1280 is authoritative; the static fit estimate never finalizes a spec; residual overflow must be zero.
25. Raw palette roles are never consumed as backgrounds/text/buttons.
26. Use semantic palette compiler + contrast validation.
27. Palette/manual palette overrides run through the same compiler.
28. Typography must use curated pairing IDs; compatibility is by family and hierarchy.
29. The sibling planner gives each batch distinct intents, distinct directives and attractive-token allotments; never the same intent with different seeds.
30. Accept mobile guest-surface structural convergence; do not damage usability to force layout novelty.
31. The Phase A/A.1 recipes are a library (regression, examples, macros, calibration); do not turn them, directives or caps into a template menu.
32. Do not add host-uploaded, stock or model-placed site imagery. Original AI-generated thematic artwork is approved for Phase 4 under §7.6a and is optional, art-directed and compiler-placed; it never arrives by pixel, by model-authored CSS, or on every concept by default.
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
- Published event visuals have no host photos or stock photography. Original AI-generated thematic artwork is approved for Phase 4 (§7.6a) and is not in the current build.
- Native product thumbnail may be unavailable and must fall back gracefully.
- Inspiration links may fail; uploaded screenshots are the reliable visual input.
- Raw inspiration requires temporary private storage.
- Amazon/native metadata may require manual entry.
- Venue-text timezone inference may fall back to browser timezone.
- Private event code is a convenience/privacy gate, not high-security auth.
- AI latency/cost varies and must be measured.
- No refunds/cancellation/ownership transfer.

Renderer-specific accepted constraints:
- Mobile guest information architecture may converge across compositions.
- The model's creative control is structural and bounded by the primitive language; the compiler owns execution.
- Direct host design controls do not expose motifs/density/treatments/primitives.
- Any change to the composition language, validator, compiler, renderer rules or planner must pass the regression gates of §11.9 before it ships.
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
Sibling planner assigns:
  family, tone, typography category, hierarchy
  structural directive
  attractive-token allotment
    ↓
3 DesignIntent calls in parallel
    ↓
3 composition calls in parallel
    ↓
Deterministic compiler per concept:
  strict schema (one re-prompt at most)
  structural repair by kind, capability scoping, token caps
  typography compatibility, motif placement
  semantic palette + contrast, layout resolution
  rendered-geometry verification at 390 and 1280
  signature check against siblings
    ↓
Persist:
  DesignIntent
  CompositionTree (raw, canonical)
  ResolvedDesignSpec (verified) + versions
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
