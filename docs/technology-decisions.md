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
| Primary AI capabilities | `generateEventIdentity(...)` and `generateCardDesign(...)` (text model), `generateCardArt(...)` (image model) |
| Text model | **OpenAI GPT 6.1 Sol** — Event Identity and Card Design (§8.1) |
| Image model | **OpenAI GPT Image 2.5 Sunburst** — card artwork (§8.1) |

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
generateEventIdentity(...)   // GPT 6.1 Sol (reads the prompt and inspiration images)
generateCardDesign(...)      // GPT 6.1 Sol
generateCardArt(...)         // GPT Image 2.5 Sunburst
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

## 8.1 The models

**Decided by the owner, 2026-10-04.** There is no bake-off between candidate models.

| Capability | Model | Provider |
| --- | --- | --- |
| `generateEventIdentity`, `generateCardDesign` | **GPT 6.1 Sol** | OpenAI API |
| `generateCardArt` | **GPT Image 2.5 Sunburst** | OpenAI API |
| Fact extraction (`spec.md §7.5`) and the other cheaper-model uses (`spec.md §9.2`) | a smaller, faster model; the same provider by default | chosen in Phase 3 validation |

**Basis.** The owner's hands-on test in ChatGPT (`CHANGELOG-v7.md`, "the owner's first image-model
test"): every output honoured "no words", taste and feedback were understood, and reserved text
space was kept when it was stated. Sunburst is the quality tier of GPT Image 2.5. Its published
capabilities fit the card system: custom output sizes in multiples of 16 (so both 5:7 and 1:1 can
be painted natively — for example 1440 × 2016 and 1440 × 1440), transparent backgrounds, and
reference images with better preservation of the referenced subject, which the same-subject shape
switch relies on (`spec.md §7.14`).

**Phase 3 validation** (`docs/development-plan.md`) confirms the choice through the API before the
product is built around it, and records the results here:

- the pinned API model IDs (OpenAI names, not marketing names) and how each is called behind the
  thin interface;
- that API output matches what the owner saw in ChatGPT for the same briefs;
- output size and format for 5:7 and 1:1 cards; whether a transparent-background workflow is used;
- how embedded text and unsafe content are detected (`spec.md §7.8`);
- same-subject regeneration from a `reference` artwork (eval CA-07);
- how often brand-homage briefs are refused, and how a refusal is surfaced (`spec.md §7.6`);
- measured latency (p50/p75) and cost per card, which re-set `spec.md §7.10`.

If Sunburst misses the latency or cost target, **GPT Image 2.5 Flare** (the same model family's
speed tier) is the first fallback; switching is a recorded decision here, not a code rewrite. A
different provider is a new decision for the owner.

No provider SDK is added to the codebase until Phase 3 validation needs it; the product provider
arrives in Phase 5. Model names and SDK calls stay behind `src/lib/ai/provider.ts`.

**What Phase 3 validation established** (2026-10-04; evidence in
`docs/model-evals/phase-3-validation.md`). Phase 3 called the API with plain `fetch`; no SDK was
needed.

| Item | Result |
| --- | --- |
| API model IDs | `gpt-6.1-sol` (Event Identity, Card Design, artwork inspection); `gpt-6-luna` (fact extraction); `gpt-image-2.5-sunburst-2026-09-08` (artwork, pinned snapshot); `omni-moderation-latest` (image safety) |
| Raster | 1440 × 2016 (5:7) and 1440 × 1440 (1:1), PNG, opaque full bleed. No transparent-background workflow: the outline is a code mask and the art is painted to every edge |
| Text and safety detection | The provider's own output moderation, then `omni-moderation-latest`, then a structured GPT 6.1 Sol inspection for text, logos or brand marks, and mockups (≈ 4 s, ≈ $0.005 per artwork) |
| Latency (p50) | Event Identity 11 s, Card Design 11 s, artwork 31 s at `high`, inspection 4 s; ≈ 57 s prompt to card (`low` text effort and Sunburst `medium` would give ≈ 38 s; not adopted) |
| Cost per card | ≈ $0.08 at `high` (artwork $0.06); ≈ $0.03 at `medium` (artwork $0.017) |
| Flare | Not faster than Sunburst `medium` in the probe, and less faithful to the composition rules; not adopted |
| **Quality setting** | **Sunburst `high`** — owner decision, 2026-10-04. All 15 corpus designs were painted at `high` and `medium` and compared as finished cards and at full resolution: no loss of detail at `medium`, but the owner found `high` brighter and more vibrant, and `medium`'s first attempts failed the artwork checks more often (2 of 15 against 1 of 33). `medium` would halve the artwork wait (17 s against 31 s) and cut its cost to $0.017; revisiting that is a deliberate decision recorded here |
| Rate limits | The account's current image rate limit (a few images per minute) throttled even this test run. Production needs a higher OpenAI usage tier, sized against the per-account and global generation caps of `spec.md §10`, before launch |

The reveal-latency target was re-set with the owner from these measurements (`spec.md §7.10`), and
the handling of provider refusals of famous characters was decided with them (`spec.md §7.6`).

## 8.2 Card rendering without a production browser

The card is a fixed canvas (5:7 or 1:1, six shapes) laid out by a deterministic function, so production does **not**
run a headless browser to verify cards. Revision 6's serverless-Chromium geometry verification
(and the `@sparticuz/chromium` dependency) is retired. A real browser is used at **test time** to
prove every layout × pairing fits (`docs/card-system.md §9`); `playwright-core` stays a dev
dependency for that and for the end-to-end suite.

Three capabilities the card system needs, decided when it is built and recorded here:

- **image decoding** for artwork validation and ink sampling (an image library on the server);
- **font metrics** for `layoutCard` and the card editor's line breaking, from the curated fonts in
  `public/fonts/card/` and the font store's fonts (§8.3);
- **link-preview rendering** of the card and envelope (`spec.md §11.10`), preferring what Next.js
  already provides over a new dependency.

Each is justified by a product requirement in `spec.md`; record the choice and why here before
adding a dependency.

## 8.3 Card editor and the font store

**Owner decisions (Revision 7.2):** a free text editor on the card, smooth on a phone, with any font
from the **Google Fonts** library (`spec.md §20`).

- **Fonts come from Google Fonts, served by us.** Google Fonts families are open-licensed (SIL OFL,
  Apache 2.0, Ubuntu Font Licence), which permits redistribution. When a host first picks a family,
  the server copies its files into Supabase Storage and extracts its metrics; the editor, guests and
  link previews load it from our own storage, never from Google. Reasons: guests' browsers do not
  contact a third party (privacy), a published card does not depend on another service staying up,
  and line breaking needs the same metrics on the server and in every browser. The family list is a
  snapshot of the Google Fonts catalog kept by the platform and refreshed deliberately; how it is
  fetched and refreshed is decided when the editor is built and recorded here.
- **The font picker shows pre-rendered specimens.** When the catalog snapshot is refreshed, the
  platform renders a small specimen image of each family's name and stores it with the snapshot,
  so the picker never loads 1,500 fonts and never fetches from Google in the host's browser.
- **The fetch has a narrow trust boundary.** The host supplies only a family name, validated
  against the catalog snapshot. The server fetches only from fixed Google Fonts hosts, by URLs
  resolved from the snapshot — never a URL the client supplies — and only the variants a card
  uses (some families, such as large CJK families, run to tens of megabytes). Fetched files are
  type- and size-checked before they are stored.
- **Licences travel with the files.** Each stored family keeps its licence name and full licence
  text (`CardFont.licenseName`, `licenseText`, `spec.md §24`), as the SIL Open Font License
  requires when the fonts are redistributed.
- **The editor is built on the card component, in the DOM.** The card's text is real, selectable,
  screen-reader-readable text (`docs/card-system.md §2.2`), and the editor must show exactly what
  guests see, so the editing surface is the same card component with selection, handles and guides
  drawn over it as app chrome — not a `<canvas>` drawing library, whose text is pixels. Gesture
  handling (drag, pinch, rotate) uses pointer events; a small gesture helper library may be added if
  the editor phase shows pointer events alone are not enough, recorded here with the reason.
- **Line breaking** for edited boxes uses one deterministic function over the font store's metrics
  (`docs/card-system.md §7`); the metrics extraction library is chosen with `layoutCard`'s in
  Phase 4 and recorded in §8.2.

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
- a generalized multi-provider AI orchestration platform;
- a hosted design-editor SDK or a `<canvas>` drawing library for the card editor (§8.3);
- third-party font hosting for guests (fonts are served from platform storage, §8.3).

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
