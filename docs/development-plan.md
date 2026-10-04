# Development plan — Revision 7 build sequence

**Status:** re-sequenced for Revision 7 (the invitation-card pivot, `CHANGELOG-v7.md`).
**Authority:** this document orders the work. It does not define product behaviour or architecture.
Requirements are `spec.md` (§31 acceptance criteria, §32 guardrails), the locked stack is
`technology-decisions.md`, card and model contracts are `card-system.md` and `model-contracts.md`.
When this plan and those documents disagree, they win and this plan is corrected.
**How work is routed:** `CLAUDE.md §11`.

## Principles behind the order

1. **Prove the card before building around it.** The product lives or dies on whether a generated
   card is good enough to screenshot and send. A time-boxed bake-off answers that with real models
   and real prompts before the compiler, data model or UI are built for a particular image model.
2. **Deterministic card code can be built against bake-off fixtures.** The compiler, the card
   component and the envelope need a `CardDesign` and an artwork, not a live model. Bake-off outputs
   become their fixtures, so Phase 4 can run while generation is wired.
3. **Spend controls ship with the first production model call**, not in hardening: one generation
   in flight per event, per-event and per-account daily caps, global ceiling and alerts, rate limits,
   idempotency, usage telemetry (`spec.md §10`). Bake-off scripts run under a fixed, small budget
   outside the product.
4. **Incremental physical schema, complete conceptual model.** Migrations arrive with their domain
   phase; the whole domain model (`spec.md §24`) is understood first.
5. **Stable anchors are contractual.** The card component and every page section expose stable
   identifiers from their first version so Creation Mode controls attach to anchors, never to
   inferred DOM shape.
6. **Required details are captured early, during generation**, as publish requirements with
   placeholders on the card and deterministic updates (`spec.md §7.3`).
7. **Human Test #2 is the launch gate**, run on real generated cards, with protocol and threshold
   frozen before results are reviewed (`spec.md §11.12`).

## Sequence

| Phase | Scope | Exit condition |
| --- | --- | --- |
| **0. Scaffolding and deployment** | Next.js App Router + TypeScript structure, Supabase config, environment handling, shared UI tokens, lint/typecheck/test, CI, Vercel preview deployment, route shells. | **Complete.** Vercel project `event-platform` deploys `main` and every PR. The Phase 0 serverless-Chromium spike served the retired website verifier and is retired with it (Revision 7). |
| **1. Core data, auth and security foundation** | Account/auth linkage, Event, ownership and collaborators, event draft state, generation persistence, RLS foundations, stable identifiers, signup abuse throttling. | **Complete** (PR #4). The website-era tables it created (`design_concepts`, `resolved_design_specs` and related columns) are replaced in Phase 4. |
| **2. Prompt → auth/save → details** | Landing prompt, optional inspiration upload, pre-auth draft surviving the auth redirect, OAuth, exact restoration, minimal required-details capture with the RSVP-deadline default and timezone inference. | **Complete** (PRs #6, #7). Revision 7 alignment is listed below. |
| **R7. The pivot** | Retire the website architecture; rewrite the canonical documents for the invitation card; remove the website code, proofs and Human Test #1 survey; keep the colour maths, the font pairings and their fonts for the card. | **This change.** `CHANGELOG-v7.md`. No database change. |
| **3. Creative bake-off** | Time-boxed, outside the product UI, under a fixed budget. (a) Build the creative-understanding runner (`model-contracts.md §6`) and run the real `generateEventIdentity` (`event_identity_v3`) and fact extraction against the fourteen-case corpus; deterministic half checked mechanically, qualitative half read by a person. (b) Write `card_design_v1` (prompt and schema) and a draft layout catalog, including the six shapes' outlines and per-shape text-safe areas. (c) Generate cards for the corpus with two or three candidate image models, at both proportions (5:7 and 1:1) and across the six shapes, set real text over them in a throwaway mock, and compare in colour. (d) Decide: the image model and workflow (including transparency), embedded-text and safety detection, the layout catalog with each layout's supported shapes and slot limits, the shapes' outline geometry, measured latency and cost per card. | Recorded in `technology-decisions.md §8.1`, `card-system.md §2.3`, `model-contracts.md §5`/`§7` and `spec.md §7.10` (latency target re-set from measurement). A person judges whether most corpus cards clear "would the host screenshot and send it?", against a bar written down **before** the outputs are viewed. If the bar is not met, iterate here — do not build Phase 4 on a card that does not work. |
| **4. Card data, compiler and renderer** | One forward-only migration replacing the website tables with card tables (`spec.md §24`: `CardDesign`, `CardArtAsset`, `Event.activeCardDesignId`, `Event.cardEdits`) and artwork storage. The layout set (layouts, per-shape zones and limits, the six shapes' outlines) and art modes as versioned code; `CardDesign` validation; the wording fact check; ink and legibility-panel resolution; `layoutCard`; the card component with outline masks; the envelope component for portrait and square cards; link-preview rendering; layout fixtures (every layout × supported shape × pairing in a real browser at test time). Built against bake-off fixtures; no live model call. | `spec.md §31 — Card design, artwork and compiler` (all non-model bullets) and `§31 — Card rendering and envelope` met with tests. |
| **5. Generation system and the reveal** | Production `generateEventIdentity`, fact extraction, `generateCardDesign`, `generateCardArt` behind the thin provider; spend controls first (principle 3); idempotency; retries and visible failures; telemetry and metering (`spec.md §9.5`, `§9.6`); the generation surface showing only real artifacts; optional detail entry while waiting; the card reveal from the envelope; `Try another direction` with feedback and distinctness; cross-proportion shape switching (new artwork from the same brief); the designs list; adaptive clarification (question schema and surface designed here). | **Operational:** uncontrolled model calls impossible; failures visible with retry. **Creative:** the §6 corpus re-run on the production stack meets the thresholds calibrated in Phase 3 — understanding, fact discipline (hard), reference translation (hard), selective clarification, distinct directions, card fidelity, *personalization rather than rescue*. |
| **6. Creation Mode, details, readiness, privacy, collaboration** | `Make it yours`; the invitation as the workspace; card wording edited in place; font control; same-proportion shape switching; placeholders for missing facts; the house-style page sections with contextual Edit/Set up/Add; full details editor; readiness (`spec.md §19.2`, `§23.1`); preview with envelope and Mobile/Desktop toggle; public/private and access code; owner/co-host permissions and invitations. | Host can go from prompt to an edited, previewable invitation with no wizard. |
| **7. Guests and RSVP** | Guest workspace, manual entry and CSV, parties/households, Needs phone / no-phone, personal invitation links (create, copy, rotate), personal-link sessions, shared-link name lookup + Twilio OTP, guest sessions without accounts, RSVP questions, confirmation, update via personal link. RSVP tables arrive here. | `spec.md §31 — RSVP` met at event and account limits. |
| **8. Registry** | External registries, native gifts with safe metadata/image fetch and normalized thumbnails, display-only cash fund, Available/Purchased, click logging, return self-confirmation, host correction. Registry tables arrive here. | `spec.md §31 — Registry` met. |
| **9. Publish, invitations and the live invitation** | $49 Stripe-shaped mock gate; READY_TO_PUBLISH enforcement; publish; subdomain routing; the guest experience (envelope, sealed private gate, card, house-style page); link previews; Share (URL, QR, code); **sending invitations by text** with host attestation, per-party caps, STOP handling and invitation status; Management Mode home. Payment state and message tables arrive here. | A published invitation is reachable, invitations reach guests by text, and the event is manageable; `spec.md §31 — Invitations, messaging and privacy` and `Roles/publishing` met. |
| **10. Reminders, hardening, launch** | Reminders and announcements, delivery-failure email fallback (an email provider is not yet in the stack — decide and record it in `technology-decisions.md`), rate limits, observability, accessibility, security review, E2E coverage, performance, failure-state QA, A2P 10DLC readiness, the $49 re-check (`spec.md §3.2`). **Human Test #2** on real generated cards from real prompts, in colour, with protocol and threshold frozen before results are reviewed. | Launch checklist and Human Test #2 pass. |

## Revision 7 alignment of existing Phase 2 code

Phase 2 shipped before the pivot. These are known gaps, owned by the phase named, not regressions:

- **Title.** `src/lib/events/required-details.ts` treats the event title as a required detail to
  collect. Under Revision 7 the card drafts a title when the host has not supplied one, so the
  details flow should offer the title as optional and readiness should use the effective title
  (`spec.md §20.2`, `§23.1`). Owner: Phase 6.
- **Generation surface.** `src/app/events/[id]/create/GenerationProgress.tsx` truthfully says no
  design has been generated, because none can be yet. It becomes the real generation surface in
  Phase 5.
- **Fact extraction.** The prompt is not yet parsed for facts; the details form starts empty.
  Owner: Phase 5 (`spec.md §7.5`).
- **Provisional title.** `src/lib/events/provisional.ts` still synthesizes a placeholder title from
  the event type. Under Revision 7 the title is wording (host's verbatim, else design-drafted), so
  the title placeholder is retired when generation lands. Owner: Phase 5.
- **Website-era names.** `src/lib/auth/permissions.ts` still names capabilities
  `generate_redesign_concepts` and `browse_select_concepts`; rename to the Revision 7 vocabulary
  (`try_another_direction`, `choose_design`). Owner: Phase 6.
- **Card styling boundary lint.** Add a lint rule that app and guest-page components cannot import
  `card-fonts.css` or card-renderer styling (`design-system.md §23.7`) when the card renderer
  lands. Owner: Phase 4.
- **Database.** The website-era tables and `human_test_1_responses` remain until the Phase 4
  migration. Export the Human Test #1 responses first if they are wanted.

## Recorded deviations

- **`spec.md §31 — Prompt, auth, and generation`: "Missing details are offered only when missing,
  while generation runs, and never block the card from appearing."** Phase 2 collects details
  without generation running, because generation does not exist yet, and the surface says so
  plainly rather than narrating work that is not happening. Checkable once Phase 5 lands.

## Decisions that must not be reopened by this plan

- Revision 7: the product is an AI-designed invitation card over a house-style page; the website
  architecture is retired.
- The bake-off precedes the compiler and the generation system.
- The locked stack in `technology-decisions.md`.

## Maintaining this document

Update the exit-condition column with dates and evidence links as phases close. Record stack
decisions in `technology-decisions.md` and cite them here. Do not add product requirements here;
propose them against `spec.md`.
