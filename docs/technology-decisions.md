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
| Spend limits (test period) | Owner decision, 2026-10-04: a $20/day ceiling across all generation (about 250 cards at ≈ $0.08), at most 30 generations per event per day and 60 per acting host per day (`spec.md §10`). Held as server configuration with these defaults, never in model-facing code; built first in Phase 5. A monthly budget on the OpenAI account is the owner's backstop |

The reveal-latency target was re-set with the owner from these measurements (`spec.md §7.10`), and
the handling of provider refusals of famous characters was decided with them (`spec.md §7.6`).

**How spend is enforced** (Phase 5a; `supabase/migrations/20261005000000_phase5_spend_controls.sql`,
`src/lib/ai/`). No new service: Postgres functions behind the service role, and plain `fetch`.

- **Configuration** (`generationEnv()` in `src/lib/env.ts`): `GENERATION_ENABLED` is the kill
  switch, off unless exactly `"true"`; `OPENAI_API_KEY` is required when it is on;
  `GENERATION_DAILY_CEILING_USD` (20), `GENERATION_EVENT_DAILY_CAP` (30) and
  `GENERATION_HOST_DAILY_CAP` (60) default to the owner's limits, and an invalid value is an error,
  never a fallback.
- **The generation lock** (`start_generation`, called by `startGeneration`): one row per
  generation request in `generations`, keyed by a client idempotency key per user action (a repeat
  returns the same generation). Under the event row's lock it fails a running generation whose
  heartbeat is older than 330 s as `stale`, answers `in_flight` while another is running (a partial
  unique index is the backstop), and otherwise consumes the event's and the acting host's daily
  caps (`consume_rate_limit`, UTC-day windows, HMAC-keyed like every other limit) inside a
  subtransaction that is rolled back if either refuses — a refused start consumes nothing. It
  refuses a user who is not the event's owner or a co-host, and starts nothing once the event is
  published (`spec.md §8.2`).
- **The meter** (`metered` in `src/lib/ai/meter.server.ts`): every provider request runs inside
  it, and the provider's request functions are not exported. Before a call it refuses — with no
  request made — when generation is off, when the generation is no longer running
  (`heartbeat_generation`, which also refreshes the heartbeat), or when the call's conservative
  reservation (`src/lib/ai/pricing.ts`) would take today's spent plus reserved past the ceiling
  (`reserve_model_spend`, atomic under the day's row lock, UTC day). After it, success or failure,
  the reservation is settled to the cost computed from the reported usage (`settle_model_spend`;
  zero for a request the provider rejected, the full reservation when the outcome is unknown) and
  one `generation_runs` row is written. Any ledger error before the call stops it; a failed run
  row is thrown. Each structured call sends `max_output_tokens`, so its reservation bounds its
  cost. A transient failure (429, 408, 5xx, timeout, dropped connection) gets one retry as a
  separately metered attempt. Refusals at the ceiling are logged as errors (the alert, for now).

**Generation execution** (assumed for Phase 5b). A Route Handler or Server Action authorizes the
host, calls `startGeneration`, answers at once, and runs the pipeline on the server after the
response with `after()` within the route's `maxDuration` of 300 s (Vercel Pro with Fluid compute
allows up to 800 s). Stage results are written to `generations` (`stage`, `artifacts`) as they
resolve, for the wait surface to read. No queue service. A worker can live at most 300 s and every
metered call refreshes its heartbeat, so a generation whose heartbeat is older than 330 s is dead
and the next start takes it over.

## 8.2 Card rendering without a production browser

The card is a fixed canvas (5:7 or 1:1, six shapes) laid out by a deterministic function, so production does **not**
run a headless browser to verify cards. Revision 6's serverless-Chromium geometry verification
(and the `@sparticuz/chromium` dependency) is retired. A real browser is used at **test time** to
prove every layout × pairing fits (`docs/card-system.md §9`); `playwright-core` stays a dev
dependency for that and for the end-to-end suite.

Three capabilities the card system needs, decided when it is built and recorded here:

- **image decoding** for artwork validation and ink sampling (an image library on the server);
- **font metrics** for `layoutCard` and the card editor's line breaking, from the curated fonts in
  `public/fonts/card/` and the font store's fonts (§8.3) — **decided (Phase 4): `harfbuzzjs` with
  `wawoff2`** (both MIT, WebAssembly; `src/lib/card/text/metrics.ts`). Stored line breaks are only
  trustworthy if the server measures text exactly as browsers set it. `harfbuzzjs` is the HarfBuzz
  project's own build of the shaper Chromium and Firefox use: kerning, ligatures and variable-font
  instances (`wght`, and `opsz` at the card-unit size) come out the same as in the browser — within
  0.03% of Chromium for every curated face at 18–104 units, with and without letter spacing and
  uppercase. HarfBuzz reads TrueType/OpenType only, so `wawoff2` (Google's WOFF2 decoder compiled to
  WebAssembly) decodes the WOFF2 files first. `fontkit`, the expected choice, was rejected: every
  curated file is a variable font, and fontkit cannot set a variable WOFF2 face to a weight
  (`getVariation` fails), while measuring the default instance is wrong (Archivo's default is 600,
  Fraunces's 900, Manrope's 200); on decoded TrueType its widths still differ from Chromium by up to
  0.6%, because it misses kerning variations. Both libraries run in a Next.js 16 **Route Handler**
  without configuration, in `next dev` and in `next build`/`next start`, and the build traces the
  WASM and the font files into the function. They do **not** load in a **Server Component page**
  without configuration: there Turbopack emits HarfBuzz's WASM as a client static asset
  (`/_next/static/media/harfbuzz.*.wasm`) and the server's read of that path fails with `ENOENT` —
  `next dev` answers 500 and `next build` fails at "Collecting page data". Adding
  `serverExternalPackages: ["harfbuzzjs", "wawoff2"]` to `next.config.ts` makes the page work in
  both, with Route Handlers unaffected (verified in Phase 4c). It **is set** since the details
  form's Server Action measures card text (the entry fit check, `docs/card-system.md §2.5`):
  without it `next build` fails for the page that carries the action, and with it the action loads
  the fonts and measures under `next build`/`next start` (verified at Phase 4 close-out; a cold
  process's first check takes about 190 ms with the font load, a warm check about 25–30 ms, a
  refusal about 5 ms). `npm run check:traced-fonts` (CI) holds every font file and the HarfBuzz
  WASM in each such function's trace, which is what Vercel bundles. Both libraries also run in the
  browser, for the card editor (Phase 6b). The renderer must pin `opsz` to the card-unit size
  whatever the on-screen scale, or line widths would change with screen size;
- **link-preview rendering** of the card and envelope (`spec.md §11.10`) — **decided (Phase 4c):
  `next/og`'s `ImageResponse`, no new dependency** (`src/lib/link-preview/`,
  `src/lib/card/preview-svg.server.ts`). The card is drawn as an SVG in card units from exactly the
  data `InvitationCard` renders, under the same validation (`src/lib/card/card-data.ts`): the
  artwork as an `<image>`, the outline from `outline.ts` as a `clipPath`, the opaque panels with
  their CSS soft edge, and every stored line as HarfBuzz glyph outlines (`Font.drawGlyph`) at the
  instance the measurement uses (`wght`, and `opsz` = the card-unit size), with the line's drawn
  width checked against `measure` before it is used; letter spacing, alignment (a line wider than
  its box start-aligned, as Chromium does), rotation about the box's centre, `textCase`, colour and
  `z` order follow the component. `ImageResponse` then rasterizes that SVG as one `<img>` over the
  house background (satori lays it out; its bundled resvg draws it) into a 1200 × 630 PNG. Why
  outlines: satori sets text only from TTF, OTF or WOFF at a font's default instance — no WOFF2, no
  variable instance — so it could not set card text as it was measured; as outlines, the preview's
  text geometry is the measured lines themselves. The fixture `tests/fixtures/link-preview.test.ts`
  compares the preview with Chromium's `InvitationCard` at the same scale (0.4–0.56 px per card
  unit), line by line, typical and entry-limit content: each line's ink centroid must agree within
  0.75 px and its ends within 1.25 px (measured: 0.61 px and 1 px, the difference being FreeType's
  hinting and Skia's text gamma against resvg's unhinted outlines), once each line is moved by the
  distance between Chromium's baseline, measured from the DOM, and the exact one the preview draws
  (Chromium snaps a baseline to the pixel grid, up to about 2 px; the test models nothing about
  Blink's rounding). Because that correction would absorb an error in the vertical model the
  preview and the exact baseline share (ascent, descent, half-leading, the `opsz` instance), the
  model is checked on its own: with the card laid out at 4 px per card unit, where snapping is
  half a unit, every Chromium baseline must sit within 0.6 units of the exact one (measured: 0.39).
  Negative controls (a line moved 2 px along, the card moved 2 px down, a vertical model 2 px off on
  both sides) are caught. The private event's sealed envelope is a static SVG drawing of the house
  envelope in app-token colours, its title also as outlines in the app's own font: Inter, from the
  Google Fonts variable WOFF2 file `next/font/google` self-hosts for the one subset the app loads
  (latin), copied into `src/lib/link-preview/fonts/` for the server because `ImageResponse` cannot
  load it (WOFF2, variable, weight 650); a test holds the preview's subsets equal to the app's. The
  copy is a snapshot (Inter v20): if Google Fonts later serves a newer Inter to `next/font`, the
  preview's title can differ from the app's by that revision's changes until the copy is refreshed,
  which is cosmetic and never touches the card. A title character outside the loaded subset (Greek,
  an emoji) the live envelope sets in a system fallback face, so the preview refuses it rather than
  substituting; no stored title reaches that path, since the entry check (`docs/card-system.md
  §2.5`) refuses every title character the card's fonts cannot draw and Inter's latin subset draws
  all the rest (a unit test holds this), so any later path that writes a title — fact extraction's
  drafts included — must run the same check. Artwork should be stored as untagged sRGB (no `gAMA`,
  `cHRM` or `iCCP` chunk) when generation stores it (Phase 5): Chromium applies those and resvg does
  not, so a tagged file would differ in tone between the live card and its preview. Local cost:
  about 75–100 ms per preview warm (about 270 ms for the first in a process), and about 650 ms with
  a 4.4 MB incompressible 1024 × 1434 artwork, most of it decoding the artwork. Real event routes (a
  later phase) should cache each preview keyed by what it is drawn from — the design, its effective
  shape, the customization's version and the event's title and facts for a card; the title alone
  for an envelope — so an edit produces a new image and nothing is redrawn per request. Rejected: a
  headless browser (none in production, above); satori's own text (above); calling resvg or
  `sharp` directly (a new dependency for what `next/og` already ships).

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
  requires when the fonts are redistributed. The bundled files do the same on disk: each curated
  family's `<Family>-OFL.txt` sits beside its files in `public/fonts/card/`, and Inter's beside the
  link preview's copy in `src/lib/link-preview/fonts/` (`font-files.test.ts`).
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
