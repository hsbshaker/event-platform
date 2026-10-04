# Technology Decisions
## MVP Stack — Do Not Relitigate

**Path:** `docs/technology-decisions.md`  
**Status:** Locked MVP implementation decisions  
**Applies to:** all coding agents and implementation work  
**Companion docs:** `spec.md` (Revision 7), `docs/design-system.md`, `docs/card-system.md`

---

# 1. Purpose

This file exists to prevent repeated stack debates during implementation.

These choices are **already decided for MVP** because they are familiar, production-proven for this project/team, and sufficient for the product as currently specified.

Do not replace, abstract away, or introduce competing infrastructure unless a concrete implementation blocker is demonstrated and the decision is explicitly revisited.

---

# 2. Locked stack

| Concern | Decision |
| --- | --- |
| Web application | **Next.js — App Router** |
| Language | **TypeScript** |
| Database | **Supabase Postgres** |
| Authentication | **Supabase Auth** |
| File/object storage | **Supabase Storage** |
| Hosting / deployment | **Vercel** |
| Event-site subdomains | **Vercel-managed routing/subdomains** |
| SMS / OTP / event messaging | **Twilio** |
| Payments | **Stripe**, initially **stubbed behind the MVP mock publish gate** |
| AI/model provider | Providers kept behind a **thin capability interface** |
| Primary AI capabilities | `generateEventIdentity(...)` and `generateCardDesign(...)` (strong text model), `generateCardArt(...)` (image model) |
| Image model | **Not yet selected** — chosen by the Phase 3 bake-off and recorded in §8.1 |

---

# 3. Application architecture

Use **Next.js App Router** for the product.

Prefer normal Next.js application primitives:
- Server Components where they simplify data loading/rendering;
- Client Components only where interaction requires them;
- Route Handlers / server-side application code for privileged operations;
- server-only access to secrets and provider credentials.

Do not introduce a second web framework, separate frontend app, or microservice architecture for MVP.

---

# 4. Supabase

Supabase is the backend system of record for MVP.

Use it for:

### Postgres
Persist:
- users/account-linked product state;
- events;
- collaborators;
- Event Identity;
- card designs (raw and validated), resolved ink, version sets;
- guests/parties;
- RSVP data;
- registry data;
- messaging state;
- generation/compilation telemetry;
- payment-satisfied state.

### Auth
Use **Supabase Auth** for owner/co-host authentication.

The product requirement remains:
> prompt first → auth/save → generation.

Pre-auth draft restoration must work cleanly across the Supabase auth redirect/session flow.

Guests do **not** receive Supabase user accounts. Guest-party identity uses the scoped OTP/session flow defined in `spec.md`.

### Storage
Use **Supabase Storage** for:
- temporary private inspiration uploads;
- generated card artwork;
- normalized native-registry product thumbnails;
- other explicitly approved application assets.

Do not create a second object-storage provider for MVP.

---

# 5. Vercel

Use **Vercel** for:
- application hosting;
- preview deployments;
- production deployment;
- event-site subdomain routing.

Do not introduce a second hosting platform or container/orchestration layer for MVP.

The public invitation (envelope, card, house-style page) and the host application remain part of the same Next.js product unless a demonstrated technical constraint requires otherwise.

---

# 6. Twilio

Use **Twilio** for:
- invitation texts carrying each party's personal link;
- SMS OTP delivery;
- RSVP return-link SMS;
- host-triggered reminders;
- host-triggered event announcements.

Twilio integration must follow the consent, STOP/opt-out, rate-limit, and delivery-fallback rules in `spec.md`.

Do not add an additional SMS provider abstraction unless real reliability/vendor requirements justify it.

A thin internal messaging wrapper is fine; a generalized multi-provider messaging framework is not an MVP requirement.

---

# 7. Stripe and the publish gate

The product architecture should assume **Stripe** for eventual payment processing.

For the initial MVP implementation:
- keep the `$49` publish gate;
- show the real one-time price;
- use the existing/mock payment-success path;
- persist a payment-satisfied state such as `paidAt`;
- keep the payment boundary shaped so real Stripe Checkout/payment handling can replace the stub cleanly.

Do **not** spend MVP effort on:
- subscription architecture;
- pricing tiers;
- refunds;
- invoices;
- complex billing portal flows;
- multi-provider payments.

The mock gate is temporary. The product/payment boundary should not be.

---

# 8. Model provider interface

Do not couple product code broadly to one model vendor.

Keep the creative-model boundary deliberately thin (`src/lib/ai/provider.ts`):

```ts
generateEventIdentity(...)   // strong multimodal text model
generateCardDesign(...)      // strong text model
generateCardArt(...)         // image model
```

Provider-specific SDK calls, model names, request formatting, usage parsing and provider request
IDs belong behind these capability functions. The text and image providers may differ; each sits
behind the same thin boundary. Do not build a large generalized AI-provider framework.

The card compiler is **not** part of the model-provider layer. It is deterministic application
code (`docs/card-system.md §4`):

```text
CardDesign → strict schema + catalog validation → wording fact check
→ art prompt assembly → (image model) → artwork validation
→ ink and legibility resolution (WCAG 4.5:1) → persisted design
→ layoutCard (text size and line breaks) at save and render time
```

No model provider owns those steps.

## 8.1 Image model

**Not yet selected.** The Phase 3 bake-off (`docs/development-plan.md`) compares candidate image
models on real briefs from the creative-understanding corpus and records the decision here, with:

- the model and provider, and how it is called behind `generateCardArt`;
- output size and format for 5:7 and 1:1 cards; whether a transparent-background workflow is used;
- how embedded text and unsafe content are detected (`spec.md §7.8`);
- measured latency (p50/p75) and cost per card;
- the evidence: the briefs, the outputs, and the human judgement that chose it.

Until then no image provider is added to the codebase.

## 8.2 Card rendering without a production browser

The card is a fixed canvas (5:7 or 1:1, six shapes) laid out by a deterministic function, so production does **not**
run a headless browser to verify cards. Revision 6's serverless-Chromium geometry verification
(and the `@sparticuz/chromium` dependency) is retired. A real browser is used at **test time** to
prove every layout × pairing fits (`docs/card-system.md §9`); `playwright-core` stays a dev
dependency for that and for the end-to-end suite.

Three capabilities the card system needs, decided when it is built and recorded here:

- **image decoding** for artwork validation and ink sampling (an image library on the server);
- **font metrics** for `layoutCard` measurement from the curated fonts in `public/fonts/card/`;
- **link-preview rendering** of the card and envelope (`spec.md §11.10`), preferring what Next.js
  already provides over a new dependency.

Each is justified by a product requirement in `spec.md`; record the choice and why here before
adding a dependency.

---

# 9. What agents must not introduce by default

Do not add or substitute:

- Pages Router;
- a second frontend framework;
- a separate backend framework solely for architectural purity;
- Firebase/Auth0/Clerk alongside Supabase Auth;
- Neon/RDS/another primary Postgres alongside Supabase;
- S3/R2/a second object store without a concrete blocker;
- Netlify/Fly/AWS hosting alongside Vercel;
- a second SMS vendor;
- a second payment vendor;
- Kubernetes;
- microservices;
- an event bus;
- a generalized repository/data-access framework;
- a generalized multi-provider AI orchestration platform.

A new dependency is justified by a product requirement or concrete technical blocker—not by preference.

---

# 10. Decision rule

If an implementation task can be solved cleanly within:

> **Next.js App Router + Supabase + Vercel + Twilio + Stripe boundary + thin AI provider interface (text + image)**

solve it there.

If an agent believes the stack must change, stop and document:
1. the specific requirement that cannot be met;
2. why the current stack cannot meet it;
3. the smallest proposed change;
4. migration/operational cost.

Do not silently introduce an alternative.

---

# 11. One-line rule

> **Use the stack we already know and have run: Next.js App Router, Supabase, Vercel, Twilio, Stripe-shaped payment boundary, and a thin model-provider interface for text and image models. Build the product, not a new platform.**
