# Technology Decisions
## MVP Stack — Do Not Relitigate

**Path:** `docs/technology-decisions.md`  
**Status:** Locked MVP implementation decisions  
**Applies to:** all coding agents and implementation work  
**Companion docs:** `spec.md`, `docs/design-system.md`, `docs/event-renderer-system.md`

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
| AI/model provider | Provider kept behind a **thin capability interface** |
| Primary AI capabilities | `generateEventIdentity(...)`, `generateDesignIntent(...)` and `generateComposition(...)` |

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
- DesignIntent;
- ResolvedDesignSpec;
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

The public event renderer and host application remain part of the same Next.js product unless a demonstrated technical constraint requires otherwise.

---

# 6. Twilio

Use **Twilio** for:
- SMS OTP delivery;
- RSVP magic-link SMS;
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

Keep the creative-model boundary deliberately thin:

```ts
generateEventIdentity(...)
generateDesignIntent(...)
generateComposition(...)
```

Provider-specific:
- SDK calls;
- model names;
- request formatting;
- usage parsing;
- provider request IDs;

belong behind these capability functions.

Do not build a large generalized AI-provider framework.

The renderer/compiler is **not** part of the model-provider layer. It remains deterministic application code:

```text
DesignIntent + CompositionTree
→ strict schema + structural validation + deterministic repair
→ attractive-token caps (sibling planner)
→ canonicalize → page system → semantic palette compiler → layout resolution
→ rendered-geometry verification (headless Chromium, 390 and 1280)
→ ResolvedDesignSpec (verified)
```

**Geometry verification runtime.** Content fit is verified against rendered DOM geometry before a spec is persisted. This requires a headless Chromium pass per concept at both widths (about one second per concept in the proof). Run it in a Node runtime function with a serverless Chromium build (for example `@sparticuz/chromium` with Playwright core) on Vercel, or in a small render worker; it renders the production renderer's own stylesheet against the spec and returns measurements. This is an addition to the locked stack, not a substitution; it introduces no new hosting, database, auth, or messaging dependency.

No model provider should own those steps.

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

> **Next.js App Router + Supabase + Vercel + Twilio + Stripe boundary + thin AI provider interface**

solve it there.

If an agent believes the stack must change, stop and document:
1. the specific requirement that cannot be met;
2. why the current stack cannot meet it;
3. the smallest proposed change;
4. migration/operational cost.

Do not silently introduce an alternative.

---

# 11. One-line rule

> **Use the stack we already know and have run: Next.js App Router, Supabase, Vercel, Twilio, Stripe-shaped payment boundary, and a thin model-provider interface. Build the product, not a new platform.**
