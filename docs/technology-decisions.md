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
| Primary AI capabilities | `generateEventIdentity(...)`, `generateConceptPremiseSet(...)`, `generateDesignIntent(...)`, `generateComposition(...)` and `generateVisualArtwork(...)` (§8 — approved capability, model not yet selected) |

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
generateConceptPremiseSet(...)
generateDesignIntent(...)
generateComposition(...)
generateVisualArtwork(...)
```

`generateConceptPremiseSet` is the fourth, added by the T22 remediation
(`spec.md §7.7a`, `docs/designintent-sibling-convergence.md`). It is one call per concept batch and
does not widen the boundary in kind: same thin shape, same provider-specific concerns below, no
orchestration framework. The stack decision is unchanged — this is a fourth creative operation, not
a fifth kind of infrastructure.

**Artwork is a fifth capability, and its model is deliberately not chosen.** `spec.md §7.6a`
approves optional AI-generated thematic artwork for Phase 4, so the boundary gains
`generateVisualArtwork(...)` in the same thin shape as the four above: a `VisualArtIntent` in, an
asset or a classified failure out, with SDK calls, model names and usage parsing behind it. That is
a fifth creative operation, not a fifth kind of infrastructure, and it adds no hosting, database,
auth or messaging dependency — generated assets live in Supabase Storage, which the locked stack
already carries, rather than being hotlinked from a provider URL.

**No image model is selected, and none has been called.** This is an open decision, recorded here
so it is not made by accident in a pull request. `docs/product-doctrine.md §10` is explicit that
transparency is "an input to model *selection*, not something a prompt adds afterwards", and the
same is true of the other criteria below. Until it is decided on measured evidence — the way the
Phase 0 geometry-verification runtime was decided, not by preference — the artwork path must be
unreachable from a network by default, and is proved with deterministic local stub assets.

What a selection has to measure, per candidate model, rather than accept from its marketing:

- **Alpha reliability.** The `object` and `framed` roles integrate a subject into the page instead
  of showing it inside a rectangle. A model that returns an opaque rectangle where alpha was
  required has failed the request, and that must be detected per asset rather than assumed from
  the role.
- **Prohibition adherence.** `STANDING_PROHIBITIONS` forbids text, lettering and numerals anywhere
  in the image, and forbids logos, proprietary characters and reproduction of a named artist's
  work (`spec.md §7.6` and `§7.6a #4`). Text-in-image is the well-known failure mode; measure it.
- **Art-direction adherence.** The brief carries subject weighting, negative space and crop safety
  because the compiler has already reserved a box and verified the page around it. A model that
  ignores them does not merely produce weaker art — it makes that reserved box a false promise.
- **Cost per asset and latency.** Artwork is the first thing in this pipeline that spends per
  *asset* rather than per concept, against a run whose four text stages cost roughly $0.39 in the
  Phase 4D smoke.
- **Commercial licensing and provenance terms** for generated output.

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

**Geometry verification runtime.** Content fit is verified against rendered DOM geometry before a spec is persisted. This requires a headless Chromium pass per concept at both widths (about one second per concept in the proof). It runs in a Node runtime function with a serverless Chromium build on Vercel; it renders the production renderer's own stylesheet against the spec and returns measurements. This is an addition to the locked stack, not a substitution; it introduces no new hosting, database, auth, or messaging dependency.

**Phase 0 spike verdict (2026-09-12): GO — Vercel serverless Chromium.** Decided on measured evidence from `docs/spike/` (harness, procedure and result files), not preference. The Phase 0 spike ran the real proof-b renderer, harness stylesheet and self-hosted fonts through `@sparticuz/chromium` 153 + `playwright-core` 1.63 in a Vercel Node 22 function (Fluid compute, Standard memory class, `iad1`) on the preview deployment of the scaffold, and locally on a Linux container. Measured:

- Correctness: every invocation returned geometry identical across three repeats at 390 and 1280, identical across invocations, and identical between Vercel and the local container (hero 609.16 px @390, 712.03 px @1280); both font families loaded every time; zero page, element or text-node overflow. Verification stays authoritative (`spec.md §32 #24`) and server-side (`docs/development-plan.md`, principle 2); the customer browser is never involved.
- Reliability: 17/17 deployed invocations succeeded (1 first-instance, 10 back-to-back, 3 separated by idle gaps, 3 on the memory-instrumented build), of which 5 were cold starts, plus 13/13 on the local container; no failures, no retries.
- Cold start on Vercel: 6.8–9.7 s wall for a first request on a fresh instance (five observed: 6.82, 6.83, 7.05, 8.90, 9.70 s), of which 0.8–1.1 s module import, 2.2–3.1 s browser archive inflate into `/tmp`, 49–101 ms browser launch, 0.8–1.3 s for the six renders and 0.2–1.7 s to close the browser; the remaining 0.8–3.3 s is Vercel's own function cold start. Instances stay warm across back-to-back requests; an idle gap of several minutes produced a cold start each time. `browser.close()` is bimodal, about 0.2 s or about 1.5–1.8 s, and that split is what separates the warm wall times into 1.4 s and 2.7 s clusters; Phase 3 will meet the same behaviour.
- Warm invocation on Vercel: 9 warm invocations in the ten-run series (run 1 was that instance's cold start at 6.8 s); 1.4–3.0 s wall and 1.1–2.7 s inside the function for six renders (wall median 2.7 s); browser launch 39 ms median; render + measure 148 ms median at 390 and 138 ms at 1280 (about twice the local container, consistent with the Standard vCPU class). One concept (two widths) verifies in well under one second of render time on a warm instance.
- Package: the function traces to 93 MB per the Vercel build output (67 MB compressed browser archives), under Vercel's 250 MB limit; the archives inflate to ~200 MB in the instance's `/tmp` once per instance. Both packages must be traced whole (`outputFileTracingIncludes`) because they read files by path at runtime; static tracing alone omitted `playwright-core/browsers.json` and failed the first deployed invocation.
- Memory: Node process RSS ≤ 228 MB on a cold instance and ≤ 175 MB warm; Chromium processes 197–202 MB, read from `/proc` just before close on the three instrumented invocations, whose Node RSS was 172–174 MB, so a verification holds roughly 370–380 MB in total. The Standard memory class (2 GB, from the project settings) is ample and the function needs no larger class.
- Cost (estimate, not measured): Vercel Fluid compute bills active CPU, provisioned memory and invocations. Estimated from Vercel's published Pro rates as of 2026-09-13, assuming the measured in-function time as active CPU (1.1–2.7 s warm, 4.6–7.3 s cold for six renders, so roughly a third of that per concept at both widths) at the 2 GB Standard class, a warm verification of one concept is on the order of $0.0001 or less and a cold one a few times that: negligible next to the model calls it protects. The Hobby plan used for the spike bills nothing within its included allowance.

Consequences for Phase 3: the production verifier keeps this runtime; it serializes the first-request browser extraction per instance (the package's `existsSync` gate is not atomic under concurrent cold requests), reuses one browser context and page per invocation as the spike does (single-process Chromium tears down when its only page closes; cross-invocation browser reuse was not measured), sets `maxDuration` and `serverExternalPackages` as the spike does, and never treats a per-instance cold flag as per-request. A dedicated render worker is not adopted; it would be revisited only on a measured regression of these numbers in production.

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
