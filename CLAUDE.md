# CLAUDE.md
## Agent entry point for this repository

This file exists so every agent session starts from the same product, architecture, and quality baseline.

Do **not** begin implementation by guessing from the codebase alone. Read the authoritative docs in the order below, then make the smallest change that satisfies the current task and the cited acceptance criteria.

**The product (Revision 7):** a host describes their event; the AI designs **one invitation card** — generated artwork with real text set over it — that guests open from an envelope, above a standard event page with details, RSVP and registry in one house style. The earlier custom-website architecture (CompositionTree, primitives, renderer, geometry verification) is retired and deleted. Do not rebuild it. `docs/CHANGELOG-v7.md` records why.

---

# 1. Read order before coding

Use this source-of-truth order:

0. **`docs/product-doctrine.md`** — what this product promises, the creative bar it has to clear, and the responsibilities of `EventIdentity` / fact extraction / `CardDesign` / card artwork / card compiler. **Read it first, before any creative or product decision.** It is intent, not requirements: it decides nothing on its own, it never overrides a document below it, and `spec.md` remains the authority for requirements and acceptance criteria. Where it and a lower document disagree about a *requirement*, that is a real conflict to raise — its §14 lists the open questions — never one to resolve by quietly editing either side.
1. **`spec.md`** — product, business, data, architecture, permissions, lifecycle, acceptance criteria (§31), and implementation guardrails (§32).
2. **`docs/technology-decisions.md`** — locked MVP stack. Do not relitigate or substitute infrastructure by preference.
3. **`docs/design-system.md`** — application UX, interaction patterns, visual tokens, responsive behavior, motion, accessibility, strict component governance, the house-style guest page and the boundary around the card.
4. **`docs/card-system.md`** — the invitation card: `EventIdentity → CardDesign (layout, art mode, pairing, wording, art brief) → artwork (image model) → deterministic card compiler (validate, wording fact check, ink/legibility, layoutCard) → one card component`, plus the envelope.
5. **`docs/model-contracts.md`** — Event Identity, fact extraction, Card Design and Card Art contracts, validation, re-prompt policy, and evals. Prompts live in `docs/model-prompts/`, schemas in `docs/model-schemas/`, the creative-understanding corpus in `docs/model-evals/`.
6. **`docs/e2e-workflow.md`** — canonical owner/co-host and guest journeys.
7. **`docs/screen-spec.md`** — screen/surface-level behavior.
8. **`docs/CHANGELOG-v7.md`** — what changed in the current revision, why, and the owner's decisions.
9. **`docs/development-plan.md`** — the build sequence; orders the work, defines no requirements.

If two documents conflict, follow the higher source in this list unless that higher source explicitly delegates an implementation detail to a lower one. Item 0 is the exception, and the only one: it is read first and ranks last, because it explains what we are trying to build rather than what is required.

Superseded revisions live only in git history. Do not recreate them in the repository or treat them as current.

---

# 2. Non-negotiable product principles

Before proposing or implementing a solution, check it against these rules:

- **AI should remove decisions, not create more decisions.** The system makes the design decisions it was hired to make — never which font, which layout, which hex value. `docs/product-doctrine.md §7`.
- **Design quality and creative understanding are core functionality, not polish.** MVP is permission to omit features, never permission for a mediocre card. `docs/product-doctrine.md §2`.
- **`EventIdentity` is this product's creative interpreter.** A raw host prompt is never forwarded into a generic website- or image-generation prompt; interpretation happens once, is persisted, and everything downstream reads it. The image model sees only the art brief and the layout and shape rules. `docs/product-doctrine.md §4`.
- The landing page is the prompt.
- Prompt first → auth/save second → generation third. No model call of any kind for anonymous users.
- Prompt and inspiration must survive auth/OAuth exactly.
- **The product makes one invitation card at a time.** `Try another direction` makes one new, genuinely different card and changes design only, never event content/data.
- The card reveal (out of the envelope) leads to `Make it yours` → Creation Mode, not a setup dashboard.
- **Creation Mode is the invitation itself** — the card and the page beneath it — with contextual `Edit` / `Set up` / `Add` controls.
- Setup/readiness is not a wizard. Adaptive creative clarification is the one permitted pre-design question: taste only, never logistics, at most three.
- Guests, Registry and invitations are not publish blockers (`spec.md §23.1`).
- The models return an `EventIdentity`, a `CardDesign` (shape, layout ID, art mode, pairing IDs, bounded wording, art brief, presentation) and artwork — nothing else. They never emit HTML, CSS, JSX, JavaScript, SVG, text colours, font sizes, positions or line breaks.
- **Facts come only from the host.** Names, dates, times, venues on the card render from event data; AI wording never states or invents one.
- **Artwork contains no text.** Every card has generated artwork (it may be as minimal as a border or texture); no host-uploaded, stock or retrieved imagery; the native registry thumbnail is the only content-image exception.
- **Code owns legibility and fit.** Ink and legibility panels are chosen deterministically so every card text clears 4.5:1; `layoutCard` alone decides card text size and line breaks; the browser never re-wraps card text.
- Persist `EventIdentity`, every `CardDesign` (raw and validated), its artwork, resolved ink and version set. Generated design data is immutable; host edits (wording, font, facts) live on the event; renderer code may receive bug/accessibility/responsive fixes.
- **The page under the card is one house style for every event.** Card styling, the house-style page and app chrome are separate systems.
- Personal invitation links identify the party and skip the private code; the platform texts invitations only after publish, after host attestation, within caps. Shared-link RSVP uses name lookup + SMS OTP.
- No guest accounts. No gift reservation/hold state. No template, layout or artwork gallery.
- Mobile-first does not mean phone-framed desktop. The card is the same design at every size, in one of six shapes (rectangle, rounded rectangle, arch, oval at 5:7; square, circle at 1:1); the design picks it and the host may switch.

If a proposed implementation violates one of these, stop and re-check `spec.md` before coding.

---

# 3. Locked technology stack

Read `docs/technology-decisions.md` before changing infrastructure.

The MVP stack is already decided:

- **Next.js App Router + TypeScript**
- **Supabase Postgres**
- **Supabase Auth**
- **Supabase Storage** (including generated card artwork)
- **Vercel** hosting and event subdomain routing
- **Twilio** for SMS invitations, OTP and event messaging
- **Stripe-shaped payment boundary**, initially stubbed behind the mock `$49` publish gate
- thin AI provider interface:
  - `generateEventIdentity(...)`
  - `generateCardDesign(...)`
  - `generateCardArt(...)` — the image model is **not yet selected**; the Phase 3 bake-off decides it and records it in `docs/technology-decisions.md §8.1`

Production runs no headless browser; a real browser is used at test time only (layout fixtures, e2e).

Do not introduce competing auth, database, storage, hosting, SMS, payment, backend-framework, microservice, Kubernetes, or generalized AI-orchestration infrastructure unless the task explicitly revisits the technology decision.

If you believe a stack change is genuinely required, do **not** silently make it. Document the blocker and proposed smallest change first.

---

# 4. Implementation guardrails

**`spec.md §32 — Implementation Guardrails for Coding Agents` is mandatory reading before implementation.**

Treat all 47 guardrails as constraints, not suggestions.

The most commonly violated ones are likely to be:

- do not rebuild any part of the retired website architecture (#1);
- do not reinsert signup before the prompt; do not begin generation anonymously (#3, #4);
- do not add a template, layout or artwork gallery, or a template/stock fallback (#6, #21);
- do not send the card reveal to a pre-publish dashboard; do not create a setup wizard (#7, #9);
- do not let a model emit HTML/CSS/JS/SVG, text colours, sizes, positions or line breaks (#13);
- do not let AI wording state a fact; facts come only from host data (#15);
- do not ask the image model to render text, and reject artwork that contains it (#16);
- do not send the raw prompt or inspiration images to the image model (#17);
- do not call a model for legibility, fit or compatibility (#20);
- do not let the browser re-wrap card text or truncate it silently (#23);
- do not add a layout, art mode, shape or slot limit without a layout-set version bump and fixtures (#24);
- do not regenerate or "upgrade" historical designs (#27);
- do not theme the page under the card per event (#29);
- do not add host-uploaded, stock or retrieved imagery (#31);
- do not add retailer scraping/sync/proxies (#33);
- do not create guest accounts; do not build gift reservations (#34, #38);
- do not bypass STOP via email; invitations go by text only, after publish and attestation (#39, #40);
- do not add maps/geocoding solely for timezone (#41);
- do not invent extra `READY_TO_PUBLISH` requirements (#45).

When in doubt, cite the relevant guardrail number in the PR.

---

# 5. Card-specific stop conditions

Before editing card architecture, read `docs/card-system.md` completely.

Current card contract:

```text
host prompt + inspiration
→ EventIdentity (the only reader of the raw prompt; optional taste clarification)
   ∥ fact extraction (cheaper model) → draft details for the host to confirm
→ CardDesign (shape of six, layout from catalog, art mode, pairing + alternates, wording, art brief)
→ strict schema + catalog validation · wording fact check · direction distinctness   (one re-prompt each)
→ art prompt assembled by code (brief + layout and shape rules + global rules) → image model → artwork
→ artwork validation: type, proportion (5:7 or 1:1), resolution, no embedded text, safety   (one regeneration)
→ ink + legibility panels resolved deterministically per shape the artwork fits (every card text ≥ 4.5:1)
→ persisted, immutable CardDesign + artwork + ink + versions
→ layoutCard (sizes, line breaks) at save and render → one card component → envelope → house-style page
```

Do not:
- let a model choose a text colour, a size, a position or a line break, or write a fact;
- put text in artwork, or send the raw prompt or inspiration images to the image model;
- add a layout, art mode, shape or slot limit without a layout-set version bump and a fixture run;
- let a model draw or position the card's outline, or offer the host a shape the design's layout does not support;
- let the browser re-wrap card text, or truncate any card text silently;
- derive CSS from model output;
- regenerate, recompile or re-resolve the ink of a historical design;
- add a template, art library, stock set or template fallback;
- take colours or fonts from the card into the page or app chrome.

## 5.1 The No-Template Invariant

Each card's artwork is generated for that event's card, from that event's `EventIdentity`. There is no library of pre-made cards, artwork or stock images, and no path — selection, nearest match, fallback — by which a host receives a card that was not designed for their event. The layout catalog decides only where words go and which regions the artwork leaves quiet; it is never shown to hosts, never chosen by them, and never the reason two events' cards look alike. A generation that fails is shown honestly with a retry, never replaced with something pre-made.

Regression gate for any change to the card design prompt or schema, layout set, compiler, ink resolution, `layoutCard`, art-prompt assembly or envelope: the unit tests under `src/lib/card/`, the layout fixtures (every layout × pairing in a real browser), and — when a prompt or schema changes — the creative-understanding corpus (`docs/model-contracts.md §6`).

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

Feature UI and the house-style guest page must use semantic app tokens/shared components.

The invitation card uses its own card system (`docs/card-system.md`, `src/lib/card/`, `src/styles/card-fonts.css`). Do not leak card styling into application chrome or the house-style page, or application styling into the card.

---

# 7. PR acceptance-criteria contract

Every product/code PR must cite the exact applicable acceptance criteria from **`spec.md §31`** in the PR description.

Do not write only “meets acceptance criteria.” Cite the **§31 subsection and the specific bullet(s)** the PR implements or preserves.

Recommended format:

```md
## Spec / acceptance criteria

- `spec.md §31 — Card design, artwork and compiler`
  - “Every card text clears 4.5:1 against the conservatively measured background of its zone …”
  - “`layoutCard` decides every slot's size and line breaks; no text leaves its zone …”
- `spec.md §32 guardrails #20, #22, #23`

## Verification

- [x] unit test: ink resolution including the panel path
- [x] layout fixtures: every layout × pairing renders worst-case content in its zones
- [x] existing card test suite passes
```

## 7.1 Required §31 group by PR area

A PR touching one of these areas must cite **at least one exact bullet from every required group listed below**, plus any other §31 bullets materially affected.

| PR area | Required `spec.md §31` group(s) |
| --- | --- |
| Landing composer, pre-auth draft, OAuth/auth restoration, generation start, required details, timezone, generation surface | **Prompt, auth, and generation** |
| Event Identity, clarification, fact extraction, card direction, direction distinctness | **Event Identity and card direction** |
| Card Design schema and prompt, artwork generation and validation, wording fact check, ink/legibility, `layoutCard`, persistence and versioning | **Card design, artwork and compiler** |
| Card reveal, `Make it yours`, designs list, choosing a design | **Card experience** |
| Inline/contextual editing, collaborator anchors, autosave, readiness checklist, guest workspace, Design panel | **Creation Mode** |
| Try-another-direction flow, feedback, keep-current behavior, post-publish lockout | **Try another direction** |
| Card component, envelope, private sealed state, link previews, layout fixtures, house-style page | **Card rendering and envelope** **and** **Card design, artwork and compiler** |
| Guest list, CSV, personal invitation links, party lookup, OTP, guest session, RSVP/update | **RSVP** |
| External registries, native gifts, thumbnails, Buy flow, purchase confirmation, cash fund | **Registry** |
| Invitations by text, reminders, announcements, STOP, email fallback, private event code/gate, QR privacy | **Invitations, messaging and privacy** |
| Owner/co-host permissions, readiness, payment/publish, post-publish capability | **Roles/publishing** |
| Responsive layout, mobile/desktop behavior, focus/contrast/WCAG, preview width | **Responsive/accessibility** plus the functional group for the feature being changed |

### Cross-cutting PRs

If a PR crosses areas, cite all affected groups.

Examples:

- **Prompt → auth → generation PR:** cite `Prompt, auth, and generation`; if it also creates Event Identity persistence, cite `Event Identity and card direction` too.
- **Card compiler PR:** cite `Card design, artwork and compiler` + `Card rendering and envelope` + `Responsive/accessibility` when rendered output changes.
- **Personal-link RSVP PR:** cite `RSVP` + `Invitations, messaging and privacy` + `Responsive/accessibility`.
- **Publish-readiness UI PR:** cite `Creation Mode` + `Roles/publishing`.
- **Send-invitations PR:** cite `Invitations, messaging and privacy` + `RSVP` + `Roles/publishing`.

## 7.2 Exact-bullet rule

The PR must quote or paraphrase tightly enough that reviewers can identify the exact checkbox in §31.

Good:
> `spec.md §31 — Creation Mode: “Ready to publish can appear even if guests/registry/invitations are incomplete.”`

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

In addition to §31 acceptance criteria, cite `spec.md §32` guardrail numbers when the PR touches a guarded boundary.

Examples:
- AI/card contract → #12–30 as applicable.
- Imagery, registry image/network handling → #31–33 and relevant registry requirements.
- Guest identity and personal links → #34–37.
- Gift state → #38.
- Messaging and invitations → #39–40.
- Timezone → #41.
- Publish readiness → #45.

A PR that deliberately changes a guardrail requires an explicit spec change; code must not quietly diverge.

---

# 9. Before opening a PR

At minimum:

1. Re-read the relevant source-of-truth sections.
2. Confirm no higher-priority doc contradicts the implementation.
3. Run the smallest relevant test set plus regressions for touched shared systems.
4. For UI changes, check approximately 390px and desktop behavior.
5. For accessibility-sensitive UI, verify keyboard/focus/contrast as applicable.
6. For card work, run the card unit tests and the layout fixtures; for prompt/schema changes, the creative-understanding corpus.
7. For auth/data/security behavior, test failure/edge states, not only happy path.
8. Confirm nothing from the retired website architecture was reintroduced.
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
- do not “complete” deferred MVP features (`spec.md §33`).

If you discover a real adjacent problem, document it separately unless it blocks the current acceptance criteria.

---

# 11. Agent orchestration and model routing

Four project agents live in `.claude/agents/`. Use the least expensive agent that can reliably complete the task without materially increasing rework, integration risk, or review burden. Route on reasoning complexity, ambiguity, architectural impact, security or data-integrity risk, blast radius, debugging difficulty, and the cost of being wrong. Never route upward merely because a task is long or touches many files.

| Tier | Agent | Use for |
| --- | --- | --- |
| Haiku | `repo-explorer` (read-only) | locating files, symbols, call sites and tests; targeted search; summarizing logs. Never edits, architecture, or product decisions. |
| Sonnet | `implementation-worker` | the default for well-defined work: ordinary features, UI, route handlers, routine data changes, localized refactors, ordinary tests, understood bug fixes. Stops and escalates on ambiguity instead of inventing. |
| Opus | `senior-implementer` | hard engineering with settled architecture: root-cause debugging, complex migrations and RLS, auth and security code, concurrency and idempotency, card compiler internals (ink resolution, `layoutCard`), AI and image pipeline integration and spend controls, performance, cross-cutting changes, anything Sonnet could not resolve cleanly. The preferred senior implementation model. |
| Fable | lead session and `senior-reviewer` (read-only) | decomposition, ambiguous requirements, architecture and product interpretation, canonical-contract changes, decisions with several materially different valid implementations, high-risk design/security/data decisions, and the final review of meaningful integrated changes. Not the default pair of hands. |

**Delegation.** Do the work directly when it is trivial and sequential; delegation has its own context cost. Delegate when a subtask is independently scoped, parallelizable, context-heavy, or benefits from specialization. Give a worker a small task packet, never the whole project context: objective; the exact `spec.md §31` bullets and `§32` guardrails; files or subsystem; explicit non-goals; expected output; verification required. Workers return concise summaries, not source dumps. The lead owns integration and final correctness. Workers that run in an isolated worktree start from the last commit: commit (or hand over) any uncommitted canonical change they depend on before delegating, and bring their output back into the branch yourself.

**Escalation.** A worker stops and reports (decision needed, why it blocks, options found, existing canonical text, recommendation if obvious) when: several reasonable interpretations exist; a product or architecture decision is required; there is meaningful security or data-integrity risk; root cause is not found after a reasonable attempt; the change crosses an important architectural boundary; the fix would change canonical behavior; or the requested implementation would violate the locked stack. Ambiguity is never silently turned into a product decision.

**Review.** Meaningful product or code changes get one independent senior review after integration and after deterministic tests pass, against the cited §31 criteria, §32 guardrails, source-of-truth compliance, architecture drift, correctness and edge cases, security/data/access, tests and failure states, and scope expansion. Workers do not self-approve meaningful work. Prefer one integrated review over inspecting every worker edit; re-review only when the first review found material blockers or the fixes materially changed the solution.

**Economics.** Spend senior-model tokens at decision points and quality gates, not on every keystroke: lead decomposes → Haiku discovers, Sonnet implements, Opus takes the hard parts → integrated change → deterministic tests → Fable review. Avoid both failure modes: Fable implementing and reviewing its own work, and Haiku attempting a high-risk problem that Opus then salvages and Fable finally redesigns. Route correctly up front.

---

# 12. Source-of-truth changes

Changing `spec.md`, `docs/design-system.md`, `docs/card-system.md`, or `docs/technology-decisions.md` is an architectural/product change, not ordinary cleanup.

When such a change is explicitly approved:
- update all directly conflicting canonical docs in the same PR;
- update acceptance criteria/guardrails when behavior changes;
- record a material decision in the current `docs/CHANGELOG-vN.md`, or start the next one for a new revision;
- do not keep superseded copies in the repository; git history is the archive (owner decision, Revision 7).

---

# 13. Final decision rule

Before shipping, ask:

> **Does this implementation satisfy the cited acceptance criteria while preserving the guardrails and making the smallest necessary change?**

If not, do not merge it.
