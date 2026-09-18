# CLAUDE.md
## Agent entry point for this repository

This file exists so every agent session starts from the same product, architecture, and quality baseline.

Do **not** begin implementation by guessing from the codebase alone. Read the authoritative docs in the order below, then make the smallest change that satisfies the current task and the cited acceptance criteria.

---

# 1. Read order before coding

Use this source-of-truth order:

0. **`docs/product-doctrine.md`** — what this product promises, the creative bar it has to clear, and the responsibilities of `EventIdentity` / `DesignIntent` / `CompositionTree` / compiler. **Read it first, before any creative or product decision.** It is intent, not requirements: it decides nothing on its own, it never overrides a document below it, and `spec.md` remains the authority for requirements and acceptance criteria. Where it and a lower document disagree about a *requirement*, that is a real conflict to raise — its §14 lists the ones known today — never one to resolve by quietly editing either side.
1. **`spec.md`** — product, business, data, architecture, permissions, lifecycle, acceptance criteria, and implementation guardrails.
2. **`docs/technology-decisions.md`** — locked MVP stack. Do not relitigate or substitute infrastructure by preference.
3. **`docs/design-system.md`** — application UX, interaction patterns, visual tokens, responsive behavior, motion, accessibility, and strict component governance.
4. **`docs/event-renderer-system.md`** — generated guest-site renderer architecture: `DesignIntent → CompositionTree (model-authored, trusted primitives) → deterministic compiler (validate, repair, caps, geometry verification) → ResolvedDesignSpec → renderer`.
5. **`docs/model-contracts.md`** — Event Identity, DesignIntent and Composition prompts, structured-output schemas, runtime narrowing, validation, re-prompt policy, and evals. Prompts live in `docs/model-prompts/`, schemas in `docs/model-schemas/` (the composition schema is generated from the validator table).
6. **`docs/e2e-workflow.md`** — canonical owner/co-host and guest journeys.
7. **`docs/screen-spec.md`** — screen/surface-level behavior.
8. **`docs/CHANGELOG-v6.md`** (and `CHANGELOG-v5.md`) — what changed in the current revision and why.
9. **`docs/prototypes/creation-flow.html`** — behavioral reference only; it does not override the docs above.
10. **`proof/`, `proof-a1/`, `proof-b/`** — the proof phases that decided the renderer architecture; `proof-b/` is the reference implementation of the composition language, validator, compiler pipeline, planner and regression suite until the production package exists. **`docs/renderer-tests/`** — older visual evidence; not product requirements.

If two documents conflict, follow the higher source in this list unless that higher source explicitly delegates an implementation detail to a lower one. Item 0 is the exception, and the only one: it is read first and ranks last, because it explains what we are trying to build rather than what is required.

Historical files such as `spec_v4.md`, old prototypes, and the first renderer gallery are evidence only. Do not make them current by patching them.

---

# 2. Non-negotiable product principles

Before proposing or implementing a solution, check it against these rules:

- **AI should remove decisions, not create more decisions.** It means the system makes the design decisions it was hired to make — never which font, which grid, which hex value. `docs/product-doctrine.md §7`.
- **Design quality and creative understanding are core functionality, not polish.** MVP is permission to omit features, never permission for a mediocre central path. `docs/product-doctrine.md §2`.
- **`EventIdentity` is this product's creative interpreter.** A raw host prompt is never forwarded into a generic website- or image-generation prompt; interpretation happens once, is persisted, and everything downstream reads it. `docs/product-doctrine.md §4`.
- The landing page is the prompt.
- Prompt first → auth/save second → strong-model generation third.
- Prompt and inspiration must survive auth/OAuth exactly.
- Concept selection leads to a full-site reveal, not a setup dashboard.
- **Creation Mode is the actual event site.** Use contextual `Edit` / `Set up` / `Add` controls.
- Setup/readiness is not a wizard.
- Guests and Registry are not publish blockers unless `spec.md §23.1` says otherwise.
- `Try another direction` changes design only and never event content/data.
- **One authoritative understanding, three worthwhile creative choices.** `EventIdentity` owns the understanding and all three siblings inherit it unchanged; one premise call per batch authors three creative propositions as a set, and a premise selects emphasis from the brief without ever reinterpreting the host (`spec.md §7.7a`, `docs/designintent-sibling-convergence.md`). Correctness outranks distinctness.
- The strong model emits a six-field `DesignIntent` (with `family` and `composition`, plus a non-design `presentation` object) and then a `CompositionTree` of trusted primitives with enum tokens. It never emits HTML, CSS, JSX, JavaScript, pixels, free text, colors, fonts, or components outside the allowlist.
- The model owns structure (nesting, grouping, hierarchy, relative size, section order and surfaces, alignment, structural motifs, mobile intent). The compiler owns execution (CSS, breakpoints, type scale, spacing, color, contrast, touch targets, overflow, nesting validity, RSVP/Registry semantics, business logic).
- Compiler work is deterministic: schema and structural validation, repair, attractive-token caps, canonicalization, palette compilation, layout resolution and rendered-geometry verification do not call a model. The model is re-prompted only for schema-invalid output, a token-cap violation or a selector collision, once each.
- A spec is final only when rendered-geometry verification is clean at 390 and 1280. The static fit estimate is advisory.
- Persist `DesignIntent + CompositionTree (raw and canonical) + every ResolvedDesignSpec revision` with prompt, schema, primitive-set and compiler versions per generated concept. A content edit re-fits into a new revision of the same concept without a model call; nothing persisted is mutated.
- Capabilities are enabled features, the content profile is present content, and guest visibility is `FeaturePresentationState`; none of them recomposes a page. Required details never block concepts from appearing; provisional content is bounded and re-fit when real values arrive.
- The Phase A/A.1 recipes are a library: regression fixtures, few-shot examples, repair/fallback macros, calibration. Not a menu, not the creative ceiling, no renderer code per recipe.
- Generated design data is immutable; renderer code may receive bug/accessibility/responsive fixes.
- App chrome and event renderer styling are separate systems.
- No host-uploaded, stock or model-placed site imagery. **Optional AI-generated thematic artwork is approved for Phase 4** (`spec.md §7.6a`): optional and chosen by the creative direction, art-directed to serve the composition, and placed by the compiler through the composition language — never mandatory, never by pixel or model-authored CSS. Not in the current build (`docs/product-doctrine.md §9`–`§10`).
- No guest accounts.
- No gift reservation/hold state.
- Mobile-first does not mean phone-framed desktop.
- Mobile guest-surface structural convergence is acceptable when usability requires it.

If a proposed implementation violates one of these, stop and re-check `spec.md` before coding.

---

# 3. Locked technology stack

Read `docs/technology-decisions.md` before changing infrastructure.

The MVP stack is already decided:

- **Next.js App Router + TypeScript**
- **Supabase Postgres**
- **Supabase Auth**
- **Supabase Storage**
- **Vercel** hosting and event-site subdomain routing
- **Twilio** for SMS/OTP/event messaging
- **Stripe-shaped payment boundary**, initially stubbed behind the mock `$49` publish gate
- thin AI provider interface:
  - `generateEventIdentity(...)`
  - `generateConceptPremiseSet(...)`
  - `generateDesignIntent(...)`
  - `generateComposition(...)`
- a headless Chromium pass for rendered-geometry verification (see `docs/technology-decisions.md`)

Do not introduce competing auth, database, storage, hosting, SMS, payment, backend-framework, microservice, Kubernetes, or generalized AI-orchestration infrastructure unless the task explicitly revisits the technology decision.

If you believe a stack change is genuinely required, do **not** silently make it. Document the blocker and proposed smallest change first.

---

# 4. Implementation guardrails

**`spec.md §32 — Implementation Guardrails for Coding Agents` is mandatory reading before implementation.**

Treat all 46 guardrails as constraints, not suggestions.

The most commonly violated ones are:

- do not reinsert signup before the prompt;
- do not begin strong-model generation anonymously;
- do not add a template gallery;
- do not send concept selection to a pre-publish dashboard;
- do not create a setup wizard;
- do not let the model emit HTML/CSS/JSX/JavaScript/pixels/free text/colors/fonts or any node outside the primitive allowlist;
- do not add a primitive, token or prop to the composition language without a proof run (`spec.md §32 #15`);
- do not re-prompt the model for structural, coverage, capability, responsive, box, motif-kind or fit defects; repair deterministically and log;
- do not finalize or persist a spec that has not passed rendered-geometry verification;
- do not render from anything but the persisted resolved spec;
- do not silently drop motifs;
- do not use raw creative palette colors directly as semantic text/background/button roles;
- do not turn directives, caps or the library into a template menu;
- do not add site-photo/decorative imagery;
- do not add retailer scraping/sync/proxies;
- do not create guest accounts;
- do not build gift reservations;
- do not bypass STOP via email;
- do not add maps/geocoding solely for timezone;
- do not invent extra `READY_TO_PUBLISH` requirements.

When in doubt, cite the relevant guardrail number in the PR.

---

# 5. Renderer-specific stop conditions

Before editing renderer architecture, read `docs/event-renderer-system.md` completely.

Current renderer contract:

```text
DesignIntent (family, tone, palette, typography, density, composition)
→ sibling planner: three intents, three directives, attractive-token allotments
→ CompositionTree from the model (trusted primitives, enum tokens, capabilities-scoped)
→ strict schema (one re-prompt) → structural validation + deterministic repair → planner caps
→ canonicalize → page system + semantic palette + typography → layout resolution
→ rendered-geometry verification at 390 and 1280 (authoritative)
→ immutable ResolvedDesignSpec (verified) → production renderer (one component per primitive)
```

Do not:
- add a primitive, prop or token without a proof run and a version bump of the primitive set;
- let the renderer derive CSS text from model output; classes and numeric custom properties only;
- weaken the zero-overflow criterion or make the static fit estimate authoritative;
- give the model a per-node color, font, size, pixel or free-text field;
- silently recompile historical concepts against a newer compiler or primitive set.

## 5.1 The Library Boundary Invariant

`docs/event-renderer-system.md §7.1` is binding. The legacy library is **26 hero silhouettes and 13 section recipes** kept as fixtures; it is not the creative space.

Production generation accepts and compiles any valid model-authored `CompositionTree`. It never selects, matches, ranks, schedules or maps a composition onto a legacy silhouette or recipe. A tree is legal because the rules admit it, never because it resembles a fixture, and a novel composition with no counterpart in the library is first-class on exactly the same path.

The library may be used **only** for: regression and expressiveness fixtures; rotated few-shot examples; deterministic repair macros where the renderer doc specifies them; the terminal fallback after the documented retry is exhausted; and signature calibration.

Never introduce: template or catalogue selection; normal candidate generation from the library; a recipe or silhouette identifier as a creative decision variable; nearest-library mapping; structural scheduling driven by the library; or renderer code that branches by recipe.

This is the architecture Revision 2 chose when it replaced bundled archetypes. Rebuilding a template system underneath it, by any of the routes above, is the specific regression the invariant exists to prevent — so it is enforced by tests and lint, and a change that needs those relaxed is a stop condition, not a refactor.

Regression gate for any change to the language, validator, compiler, renderer rules or planner: `proof-b/test.js`, `proof-b/adv-run.js`, the library expressiveness render, and a sibling-batch confirmation run evaluated with `proof-b/evaluate.js` against the thresholds in `docs/event-renderer-system.md §9`.

---

# 6. Design-system discipline

Before creating a new UI primitive, read `docs/design-system.md` and search the shared component system.

Do not introduce page-local variants of:
- buttons;
- cards;
- dialogs/sheets;
- fields;
- spacing scales;
- radius values;
- shadows;
- app colors;
- typography sizes.

Feature UI must use semantic app tokens/shared components.

Event renderer components must use event semantic tokens and renderer-owned components.

Do not leak event-theme styling into application chrome or application styling into themed guest surfaces.

---

# 7. PR acceptance-criteria contract

Every product/code PR must cite the exact applicable acceptance criteria from **`spec.md §31`** in the PR description.

Do not write only “meets acceptance criteria.” Cite the **§31 subsection and the specific bullet(s)** the PR implements or preserves.

Recommended format:

```md
## Spec / acceptance criteria

- `spec.md §31 — DesignIntent, composition and compiler`
  - “Every structural rule … is validated and repaired deterministically, with every repair logged by kind.”
  - “Content fit is verified against rendered geometry at 390 and 1280 …”
- `spec.md §32 guardrails #22–24`

## Verification

- [x] unit test: repair rule with fixture
- [x] adversarial set repairs and renders clean
- [x] existing renderer regression suite passes
```

## 7.1 Required §31 group by PR area

A PR touching one of these areas must cite **at least one exact bullet from every required group listed below**, plus any other §31 bullets materially affected.

| PR area | Required `spec.md §31` group(s) |
| --- | --- |
| Landing composer, pre-auth draft, OAuth/auth restoration, generation start, required details, timezone | **Prompt, auth, and generation** |
| Event Identity, concept constraint assignment, diversity planning | **Event Identity and diversity** |
| AI concept output, DesignIntent and composition schemas, primitive-set versioning, compiler, geometry verification, palette/contrast, typography repair, motifs, persistence | **DesignIntent, composition and compiler** |
| Concept cards, initial `Try another direction`, concept selection, full-site reveal, `Make it yours` | **Concept experience** |
| Inline/contextual editing, collaborator anchors, autosave, readiness checklist, guest workspace, Design panel | **Creation Mode** |
| Redesign prompt/rounds/keep-current behavior/post-publish lockout | **Redesign** |
| Renderer architecture, composition language, planner, guest theming, regression gates, confirmation runs | **Renderer proof** **and** **DesignIntent, composition and compiler** |
| Guest list, CSV, party lookup, OTP, guest session, RSVP/update | **RSVP** |
| External registries, native gifts, thumbnails, Buy flow, purchase confirmation, cash fund | **Registry** |
| SMS, STOP, email fallback, private event code/gate, QR privacy | **Messaging/privacy** |
| Owner/co-host permissions, readiness, payment/publish, post-publish capability | **Roles/publishing** |
| Responsive layout, mobile/desktop behavior, focus/contrast/WCAG, preview width | **Responsive/accessibility** plus the functional group for the feature being changed |

### Cross-cutting PRs

If a PR crosses areas, cite all affected groups.

Examples:

- **Prompt → auth → generation PR:** cite `Prompt, auth, and generation`; if it also creates Event Identity persistence, cite `Event Identity and diversity` too.
- **Renderer compiler PR:** cite `DesignIntent, composition and compiler` + `Renderer proof` + `Responsive/accessibility` when rendering/UI output changes.
- **RSVP themed-component PR:** cite `RSVP` + `Renderer proof` + `Responsive/accessibility`.
- **Publish-readiness UI PR:** cite `Creation Mode` + `Roles/publishing`.
- **Private RSVP gate PR:** cite `RSVP` + `Messaging/privacy` + `Responsive/accessibility`.

## 7.2 Exact-bullet rule

The PR must quote or paraphrase tightly enough that reviewers can identify the exact checkbox in §31.

Good:
> `spec.md §31 — Creation Mode: “Ready to publish can appear even if guests/registry are incomplete.”`

Not sufficient:
> “Creation Mode acceptance criteria.”

## 7.3 If no acceptance criterion fits

For a product-behavior PR, this is a warning sign.

Do one of the following **before merge**:
1. show that the change is purely internal and does not alter product behavior; or
2. update the authoritative spec/acceptance criteria in the same PR after explicit product approval.

Do not silently ship new product behavior that has no acceptance criterion.

For a truly docs-only, test-only, refactor-only, or dependency-maintenance PR with no behavior change, the PR may state:

```md
Acceptance criteria: N/A — no product behavior change.
```

It must still cite any relevant `spec.md §32` guardrails or `docs/technology-decisions.md` constraints that the change preserves.

---

# 8. PR guardrail citations

In addition to §31 acceptance criteria, cite `spec.md §32` guardrail numbers when the PR touches a guarded architectural boundary.

Examples:
- AI/renderer contract → #12–31 as applicable.
- Registry image/network handling → #32–34 and relevant registry requirements.
- Guest identity → #35–37.
- Gift state → #38.
- Messaging opt-out → #39.
- Timezone → #40.
- Publish readiness → #44.

A PR that deliberately changes a guardrail requires an explicit spec change; code must not quietly diverge.

---

# 9. Before opening a PR

At minimum:

1. Re-read the relevant source-of-truth sections.
2. Confirm no higher-priority doc contradicts the implementation.
3. Run the smallest relevant test set plus regressions for touched shared systems.
4. For UI changes, check approximately 390px and desktop behavior.
5. For accessibility-sensitive UI, verify keyboard/focus/contrast as applicable.
6. For renderer work, run the applicable renderer proof/compiler tests.
7. For auth/data/security behavior, test failure/edge states, not only happy path.
8. Confirm no historical revision/prototype was accidentally made authoritative.
9. Fill in the PR acceptance-criteria block with exact §31 citations.
10. Cite relevant §32 guardrail numbers.

Do not claim an acceptance criterion is met without evidence appropriate to the change.

---

# 10. Scope discipline

Do not opportunistically add adjacent features.

If the requested task is narrow:
- keep the PR narrow;
- do not refactor unrelated architecture;
- do not add future-proof abstractions without a present requirement;
- do not change the stack by preference;
- do not “complete” deferred MVP features.

If you discover a real adjacent problem, document it separately unless it blocks the current acceptance criteria.

---

# 11. Agent orchestration and model routing

Four project agents live in `.claude/agents/`. Use the least expensive agent that can reliably complete the task without materially increasing rework, integration risk, or review burden. Route on reasoning complexity, ambiguity, architectural impact, security or data-integrity risk, blast radius, debugging difficulty, and the cost of being wrong. Never route upward merely because a task is long or touches many files.

| Tier | Agent | Use for |
| --- | --- | --- |
| Haiku | `repo-explorer` (read-only) | locating files, symbols, call sites and tests; targeted search; summarizing logs. Never edits, architecture, or product decisions. |
| Sonnet | `implementation-worker` | the default for well-defined work: ordinary features, UI, route handlers, routine data changes, localized refactors, ordinary tests, understood bug fixes. Stops and escalates on ambiguity instead of inventing. |
| Opus | `senior-implementer` | hard engineering with settled architecture: root-cause debugging, complex migrations and RLS, auth and security code, concurrency and idempotency, compiler/renderer internals, AI-pipeline integration, performance, cross-cutting changes, anything Sonnet could not resolve cleanly. The preferred senior implementation model. |
| Fable | lead session and `senior-reviewer` (read-only) | decomposition, ambiguous requirements, architecture and product interpretation, canonical-contract changes, decisions with several materially different valid implementations, high-risk design/security/data decisions, and the final review of meaningful integrated changes. Not the default pair of hands. |

**Delegation.** Do the work directly when it is trivial and sequential; delegation has its own context cost. Delegate when a subtask is independently scoped, parallelizable, context-heavy, or benefits from specialization. Give a worker a small task packet, never the whole project context: objective; the exact `spec.md §31` bullets and `§32` guardrails; files or subsystem; explicit non-goals; expected output; verification required. Workers return concise summaries, not source dumps. The lead owns integration and final correctness.

**Escalation.** A worker stops and reports (decision needed, why it blocks, options found, existing canonical text, recommendation if obvious) when: several reasonable interpretations exist; a product or architecture decision is required; there is meaningful security or data-integrity risk; root cause is not found after a reasonable attempt; the change crosses an important architectural boundary; the fix would change canonical behavior; or the requested implementation would violate the locked stack. Ambiguity is never silently turned into a product decision.

**Review.** Meaningful product or code changes get one independent senior review after integration and after deterministic tests pass, against the cited §31 criteria, §32 guardrails, source-of-truth compliance, architecture drift, correctness and edge cases, security/data/access, tests and failure states, and scope expansion. Workers do not self-approve meaningful work. Prefer one integrated review over inspecting every worker edit; re-review only when the first review found material blockers or the fixes materially changed the solution.

**Economics.** Spend senior-model tokens at decision points and quality gates, not on every keystroke: lead decomposes → Haiku discovers, Sonnet implements, Opus takes the hard parts → integrated change → deterministic tests → Fable review. Avoid both failure modes: Fable implementing and reviewing its own work, and Haiku attempting a high-risk problem that Opus then salvages and Fable finally redesigns. Route correctly up front.

---

# 12. Source-of-truth changes

Changing `spec.md`, `docs/design-system.md`, `docs/event-renderer-system.md`, or `docs/technology-decisions.md` is an architectural/product change, not ordinary cleanup.

When such a change is explicitly approved:
- update all directly conflicting canonical docs in the same PR;
- update acceptance criteria/guardrails when behavior changes;
- add/update the changelog when the decision is material;
- preserve historical revision files rather than rewriting history.

---

# 13. Live infrastructure

This project now has **real, running infrastructure**, and a session may hold credentials that
reach it. A hosted Supabase project carries the schema and live rows; a Vercel project serves the
app. Both are reachable from an agent session over HTTPS. Treat every rule below as binding.

## 13.0 What exists, and which is which

None of these are secrets — they are in the browser bundle, the deployment URL and the git remote.
They are written down because a session that has to rediscover them wastes a turn, and because
confusing the two Supabase projects is the expensive mistake.

| | |
| --- | --- |
| Repository | `hsbshaker/event-platform` |
| Vercel project | `prj_wGMRvLWWgCPkNIDlxv1lBSjaUqY5`, one project, two targets |
| Production URL | `https://event-platform-two-rho.vercel.app` |
| Supabase **production** | ref `oirndvezdrvdnudjicdk`, us-east-2 — built entirely from `supabase/migrations`, ledger complete |
| Supabase **preview** | ref `ihdaifbyvlvivuctkrwn`, us-east-2 — schema applied by hand before the migrations were trusted, **no `supabase_migrations.schema_migrations` ledger**, so `supabase db push` there would try to replay Phase 1 |

Credentials arrive through the environment and nowhere else (§13.3). What a session may hold:
`SUPABASE_ACCESS_TOKEN` (Management API, org-wide) and `VERCEL_TOKEN`. `OPENAI_API_KEY` is
deliberately absent unless a live run is authorised, because it is the only credential that spends
money.

**Which Supabase key to use, and why it matters.** A project issues two generations of keys. The
newer `sb_secret_…` key is **rejected by PostgREST with 401**, so `SUPABASE_SERVICE_ROLE_KEY` must
be the legacy `service_role` JWT; the newer publishable key is fine for the anon role. A wrong
service key does not announce itself — sign-in returns a 500 that looks like a redirect-URL
problem, because the signup throttle and draft binding both use the service-role client and run
*before* `signInWithOtp`, whose own errors are caught and returned as a message rather than thrown.

**Writing Vercel environment variables** is blocked by the auto-mode classifier as a secret-store
write. `scripts/ops/vercel-env-split.mjs` exists for this: it is dry-run by default, its plan file
holds no secrets (each entry says how to *source* its value), and a scoped rule in
`.claude/settings.local.json` permits that one script. Use it rather than raw `curl`, and keep the
grant narrow.

**Production and preview must not share a secret.** `APP_ENCRYPTION_KEY` is the HMAC key for draft
tokens and rate-limit keys, so one value across both targets means a token minted in preview
validates in production. They are split today; keep them split.

## 13.1 The test database is never a real database

Every test under `tests/db/` begins by dropping `public`, `auth` and `extensions`. Against a real
project that destroys every table, every row and every auth user, and there is no undo.

- **Never** point `TEST_DATABASE_URL` at anything but a scratch database on localhost.
- **Never** run `npm run test:db`, import `tests/db/harness.ts`, call `resetDatabase()`, or apply
  `tests/db/auth-stub.sql` against a hosted database. *Every* test in `tests/db/` resets, including
  `schema-drift.test.ts` — there is no read-only one.
- `databaseUrl()` and `resetDatabase()` both refuse a non-loopback host, and
  `tests/unit/db-harness-guard.test.ts` holds them to it. Those guards are load-bearing safety
  equipment, not ceremony. Do not relax, bypass or add an override to them; a change that needs
  them weakened is a stop condition, not a refactor.

This is written from an incident. A session put a live Supabase URL into `TEST_DATABASE_URL` and
reached for the harness; the only thing that stopped it was an unrelated network policy blocking
the connection. That policy is not protection and must not be relied on.

## 13.2 Schema changes reach a real database only through migrations

The schema is whatever `supabase/migrations/` builds, applied in filename order. To change a hosted
database, add a migration and apply it — never hand-edit a table through a dashboard or a client,
and never apply a migration id that is already recorded.

Applied migrations are frozen. A correction ships as a **new, later** migration that
`create or replace`s what it fixes; editing a file whose id an environment has already recorded
changes nothing there and silently desynchronises the repository from the database.
`tests/unit/migration-history.test.ts` pins the files this rule has already been applied to.

Raw TCP to Postgres (5432, 6543) is blocked from agent containers, so `psql`, `node-pg`, the direct
`db.*.supabase.co` host and both poolers all fail. The working route is the Supabase **Management
API** over HTTPS:

```
POST https://api.supabase.com/v1/projects/<ref>/database/query
Authorization: Bearer $SUPABASE_ACCESS_TOKEN
{"query": "<SQL>"}
```

Build that JSON body with a real encoder — the migrations contain dollar-quoted plpgsql bodies that
shell interpolation corrupts.

## 13.3 Credentials

- Read every credential from the environment. **Never** accept one pasted into conversation text,
  never print one, never commit one, never write one into a file the repository tracks, and never
  expose one through a `NEXT_PUBLIC_*` variable.
- `SUPABASE_ACCESS_TOKEN` is **account-wide**: it can run arbitrary SQL on, and delete, every
  project in the account. There is no project-scoped variant. Use it only for work that genuinely
  needs DDL.
- The app itself reads none of the operator credentials. Nothing in `src/` should ever read
  `SUPABASE_ACCESS_TOKEN` or a Vercel token; if one appears in the app's environment, that is a
  misconfiguration to report, not to use.

## 13.4 Before an irreversible action

Applying a migration, changing environment variables, redeploying, and anything that writes to a
hosted database are outward-facing and hard to undo. Before one:

1. Read the current state first and report it, rather than assuming it.
2. Say what you are about to change and confirm, unless the user has already authorised that exact
   action.
3. Prefer the additive form; never `drop`, `truncate` or `delete` on a hosted database without an
   explicit instruction naming that object.
4. Verify afterwards with **read-only** queries, and report row counts before and after.

---

# 14. Final decision rule

Before shipping, ask:

> **Does this implementation satisfy the cited acceptance criteria while preserving the guardrails and making the smallest necessary change?**

If not, do not merge it.