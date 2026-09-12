# CLAUDE.md
## Agent entry point for this repository

This file exists so every agent session starts from the same product, architecture, and quality baseline.

Do **not** begin implementation by guessing from the codebase alone. Read the authoritative docs in the order below, then make the smallest change that satisfies the current task and the cited acceptance criteria.

---

# 1. Read order before coding

Use this source-of-truth order:

1. **`spec.md`** — product, business, data, architecture, permissions, lifecycle, acceptance criteria, and implementation guardrails.
2. **`docs/technology-decisions.md`** — locked MVP stack. Do not relitigate or substitute infrastructure by preference.
3. **`docs/design-system.md`** — application UX, interaction patterns, visual tokens, responsive behavior, motion, accessibility, and strict component governance.
4. **`docs/event-renderer-system.md`** — generated guest-site renderer architecture: `DesignIntent → versioned archetype bundle → deterministic compiler → ResolvedDesignSpec → renderer`.
5. **`docs/model-contracts.md`** — Event Identity and DesignIntent prompts, structured-output schemas, runtime narrowing, validation, and evals. Prompts live in `docs/model-prompts/`, schemas in `docs/model-schemas/`.
6. **`docs/e2e-workflow.md`** — canonical owner/co-host and guest journeys.
7. **`docs/screen-spec.md`** — screen/surface-level behavior.
8. **`docs/CHANGELOG-v5.md`** — what changed in the current revision and why.
9. **`docs/prototypes/creation-flow.html`** — behavioral reference only; it does not override the docs above.
10. **`docs/renderer-tests/`** — visual/test evidence and fixtures; not product requirements.

If two documents conflict, follow the higher source in this list unless that higher source explicitly delegates an implementation detail to a lower one.

Historical files such as `spec_v4.md`, old prototypes, and the first renderer gallery are evidence only. Do not make them current by patching them.

---

# 2. Non-negotiable product principles

Before proposing or implementing a solution, check it against these rules:

- **AI should remove decisions, not create more decisions.**
- The landing page is the prompt.
- Prompt first → auth/save second → strong-model generation third.
- Prompt and inspiration must survive auth/OAuth exactly.
- Concept selection leads to a full-site reveal, not a setup dashboard.
- **Creation Mode is the actual event site.** Use contextual `Edit` / `Set up` / `Add` controls.
- Setup/readiness is not a wizard.
- Guests and Registry are not publish blockers unless `spec.md §23.1` says otherwise.
- `Try another direction` changes design only and never event content/data.
- The strong model emits the six-field `DesignIntent` plus a non-design `presentation` object (concept name and description). The compiler reads only the six fields.
- Versioned archetype bundles own composition and renderer defaults.
- Compiler work is deterministic: typography repair, motif placement, semantic palette compilation, contrast, and `ResolvedDesignSpec` creation do not call a model.
- Persist `DesignIntent + archetypeVersion + ResolvedDesignSpec` per generated concept.
- Generated design data is immutable; renderer code may receive bug/accessibility/responsive fixes.
- App chrome and event renderer styling are separate systems.
- No decorative event-site imagery in MVP.
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
  - `generateDesignIntent(...)`

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
- do not add model-emitted renderer overrides;
- do not generate arbitrary HTML/layout/CSS/SVG from the model;
- do not render from current archetype defaults instead of persisted resolved specs;
- do not silently drop motifs;
- do not use raw creative palette colors directly as semantic text/background/button roles;
- do not build the remaining archetypes before renderer proof gates pass;
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
DesignIntent
→ exact versioned ArchetypeDefinition
→ typography compatibility / deterministic repair
→ motif role/slot assignment
→ semantic palette + contrast compiler
→ immutable ResolvedDesignSpec
→ production renderer
```

Do not:
- add a model `overrides` field;
- let archetypes consume raw palette roles as text/background/button values;
- silently recompile historical concepts against newer archetype defaults;
- implement `centered_statement`, `full_bleed_visual`, or `layered_editorial` before the current proof gates pass.

Current validation gate before the remaining archetypes:
1. compiler-backed refactor of the first three;
2. contrast/unit tests;
3. constrained Brief 1 regression;
4. five swap/repair tests;
5. light-only Brief 2.

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

- `spec.md §31 — DesignIntent and compiler`
  - “Motifs match only compatible declared slot roles.”
  - “Unplaceable motifs are dropped and logged.”
- `spec.md §32 guardrails #22–24`

## Verification

- [x] unit test: motif role matching
- [x] unit test: dropped motif telemetry
- [x] existing renderer regression suite passes
```

## 7.1 Required §31 group by PR area

A PR touching one of these areas must cite **at least one exact bullet from every required group listed below**, plus any other §31 bullets materially affected.

| PR area | Required `spec.md §31` group(s) |
| --- | --- |
| Landing composer, pre-auth draft, OAuth/auth restoration, generation start, required details, timezone | **Prompt, auth, and generation** |
| Event Identity, concept constraint assignment, diversity planning | **Event Identity and diversity** |
| AI concept output, DesignIntent schema, archetype versioning, compiler, palette/contrast, typography repair, motifs, persistence | **DesignIntent and compiler** |
| Concept cards, initial `Try another direction`, concept selection, full-site reveal, `Make it yours` | **Concept experience** |
| Inline/contextual editing, collaborator anchors, autosave, readiness checklist, guest workspace, Design panel | **Creation Mode** |
| Redesign prompt/rounds/keep-current behavior/post-publish lockout | **Redesign** |
| Renderer architecture, archetypes, guest theming, grayscale/control tests, compiler visual regressions, light-only brief | **Renderer proof** **and** **DesignIntent and compiler** |
| Guest list, CSV, party lookup, OTP, guest session, RSVP/update | **RSVP** |
| External registries, native gifts, thumbnails, Buy flow, purchase confirmation, cash fund | **Registry** |
| SMS, STOP, email fallback, private event code/gate, QR privacy | **Messaging/privacy** |
| Owner/co-host permissions, readiness, payment/publish, post-publish capability | **Roles/publishing** |
| Responsive layout, mobile/desktop behavior, focus/contrast/WCAG, preview width | **Responsive/accessibility** plus the functional group for the feature being changed |

### Cross-cutting PRs

If a PR crosses areas, cite all affected groups.

Examples:

- **Prompt → auth → generation PR:** cite `Prompt, auth, and generation`; if it also creates Event Identity persistence, cite `Event Identity and diversity` too.
- **Renderer compiler PR:** cite `DesignIntent and compiler` + `Renderer proof` + `Responsive/accessibility` when rendering/UI output changes.
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
- AI/renderer contract → #12–30 as applicable.
- Remaining archetype implementation → #31.
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

# 11. Source-of-truth changes

Changing `spec.md`, `docs/design-system.md`, `docs/event-renderer-system.md`, or `docs/technology-decisions.md` is an architectural/product change, not ordinary cleanup.

When such a change is explicitly approved:
- update all directly conflicting canonical docs in the same PR;
- update acceptance criteria/guardrails when behavior changes;
- add/update the changelog when the decision is material;
- preserve historical revision files rather than rewriting history.

---

# 12. Final decision rule

Before shipping, ask:

> **Does this implementation satisfy the cited acceptance criteria while preserving the guardrails and making the smallest necessary change?**

If not, do not merge it.
