# E2E Workflow — AI-Native Baby Shower Event Platform

**Status:** Revision 5 UX workflow  
**Source of truth:** `spec.md` Revision 5  
**Design system:** `docs/design-system.md`  
**Renderer:** `docs/event-renderer-system.md`  
**Design target:** phone-first, responsive desktop  
**North star:** **AI should remove decisions, not create more decisions.**

---

# 1. Journey architecture

Two connected journeys:

1. **Owner/co-host:** describe → auth/save → AI creates → choose → reveal → make real → preview → publish → manage.
2. **Guest:** open → unlock if private → identify → verify → RSVP → registry → update later.

The event site is simultaneously:
- the AI-created output;
- the pre-publish workspace;
- the guest experience;
- the referral surface.

---

# 2. Owner/co-host creation journey

## H01 — Landing composer

**Goal:** get the user creating before configuring.

Hero:
> **Describe your event. We create the whole experience.**

Controls:
- large natural-language composer;
- `+ Add inspiration`;
- `Create my event ✦`.

Optional reassurance:
> Free to create · No templates · Publish when ready

Secondary:
- Sign in.

Do not show a template gallery.

## H02 — Auth/save

Triggered after the user submits a real event idea.

Before auth:
- persist exact prompt in short-lived private draft;
- retain references to successful private inspiration uploads.

Auth:
- Google / Apple / email;
- no profile wizard.

After auth:
- attach draft to owner/event;
- restore prompt exactly;
- restore inspiration;
- begin strong-model generation.

**Failure condition:** losing or truncating the creative prompt/inspiration through OAuth.

## H03 — Required details while AI works

Event Identity generation starts after auth.

Ask only missing:
- date;
- time;
- venue/address;
- hosts;
- baby name if shown;
- RSVP deadline;
- public/private.

Show lightweight AI progress:
- creative direction;
- tone;
- palette interpretation.

Timezone inferred from venue text; browser fallback.

## H04 — Diversity plan + concepts

The sibling planner assigns three concept constraints:
- family, tone when allowed, typography category and hierarchy (distinct across siblings);
- a structural directive per sibling;
- attractive-token allotments.

Strong model generates three six-field DesignIntents, then three CompositionTrees.

Deterministic compiler creates verified ResolvedDesignSpecs:
- strict schema (one re-prompt at most);
- structural repair by kind, capability scoping, token caps;
- typography repair; motif placement from the tree;
- semantic palette/contrast; layout resolution;
- rendered-geometry verification at 390 and 1280;
- repair/re-prompt telemetry kept separate.

Concepts stream into live production renderer.

## H05 — “Which feels like you?”

Three concept cards.

Each:
- live renderer preview;
- concept name;
- one-line description;
- `Choose this direction`.

Below all three:
> **None of these feel right?**  
> `Try another direction ✦`

Mobile may lazy-mount later renderer trees.

## H06 — Full-site reveal

After choose:
- set active concept;
- open the full guest site;
- do not show setup dashboard.

Activation:
> **Your event looks great.**  
> **Let’s make it real.**

Actions:
- `Make it yours →`
- `Try another direction ✦`

## H07 — Creation Mode

`Make it yours` turns the same site into the workspace.

App-level owner toolbar:
- Design
- Preview

Contextual event controls:
- Event Details → `Edit`
- RSVP → `Set up`
- Registry → `Add`

Renderer sections expose stable collaborator slots for these controls.

Routine edits autosave.

## H08 — Readiness checklist

Floating control:
- `Finish setup`
- `2 required items left`
- or `Ready to publish`

Sheet has two groups.

**Needed to publish**
- actual blockers from `READY_TO_PUBLISH`.

**Recommended before sharing**
- Guests;
- Registry;
- Co-host;
- optional work.

No rigid order.

## H09 — Event details editor

Open from event section.

Edit:
- title;
- hosts;
- date/time;
- venue/address;
- description;
- simple info blocks.

Closing returns to the same site context.

## H10 — Guests workspace

Dedicated full-screen workspace.

Actions:
- Add guest/household;
- Import CSV.

States:
- Ready;
- Needs phone;
- No phone available;
- Awaiting;
- Attending;
- Declined.

Close/back returns to Creation Mode.

## H11 — RSVP setup

Open from RSVP section.

Configure:
- deadline;
- party member attendance;
- plus-one behavior;
- meals;
- dietary;
- custom questions;
- notes.

No open RSVP.

## H12 — Registry setup

Open from Registry section.

External registry:
- URL;
- destination card;
- retailer remains authoritative.

Native gift:
- product URL;
- one safe metadata/image attempt;
- manual fallback;
- platform-owned normalized thumbnail;
- no reservation state.

Cash fund:
- display-only handles/suggested amounts/blurb.

## H13 — Design controls

Curated only:
- palette;
- compatible typography;
- reset;
- `Try another direction ✦`.

No motif/density/primitive/directive/treatment/card/button controls.

## H14 — Redesign

Optional feedback/inspiration.

Explicit reassurance:
> **Your event content stays untouched.**

System:
- updates Event Identity if needed;
- plans three fresh directions;
- generates DesignIntent and CompositionTree;
- compiles;
- shows three fresh concepts.

User:
- choose;
- keep current;
- refine again.

Never repeat onboarding.

## H15 — Preview

Exact production guest renderer.

Removes:
- collaborator controls;
- readiness pill;
- owner toolbar.

On desktop/tablet:
- defaults Mobile;
- toggle Mobile / Desktop.

Primary publish action may remain app-level.

## H16 — Publish gate

Requirements:
- deterministic readiness passes;
- $49 one-time shown;
- owner handles payment.

No tiers/subscription upsell.

Once paid:
- owner or co-host may publish.

## H17 — Share

Show:
- URL;
- QR;
- private event code when applicable.

QR points to URL only and does not bypass code.

---

# 3. Post-publish management journey

After publish, operational Event Home becomes primary.

Priority:
1. RSVP summary;
2. awaiting/attending/declined/Needs phone;
3. Guests;
4. Messages;
5. Registry;
6. Share;
7. Edit site.

Owner additionally:
- billing;
- co-host access;
- deletion/archive.

No vanity analytics.

AI redesign/concept switching is disabled.

---

# 4. Guest journey

## G01 — Open event

Public:
- full event.

Private:
- finished hero remains visible;
- venue/details/RSVP/registry locked;
- enter event code.

## G02 — Event details

Themed production renderer.

Single-scroll by default.

## G03 — Find invitation

Input name.

Fuzzy-match invite list.

Show minimum first-name information needed for recognition.

Never show contact info.

## G04 — Collision resolution

When multiple possible parties:
- ask enough additional name detail;
- do not leak phone/email.

## G05 — Verify

Phone-backed party:
- SMS OTP;
- abuse throttling.

`noPhoneAvailable`:
- accepted name-only fallback.

Needs phone:
- neutral contact-host state; no RSVP exposure.

## G06 — RSVP

Fixed semantic flow:
- party members;
- attendance;
- plus-one;
- meal;
- dietary;
- custom questions;
- notes.

The tree controls composition and the page system controls visual treatment; neither touches the security order.

At phone width, layouts may converge to a stack.

## G07 — Confirmation

Themed confirmation.

If phone-backed:
- SMS magic link for return/update.

## G08 — Registry

External:
- Shop [Retailer] Registry.

Native:
- Buy this gift;
- private click;
- retailer;
- click alone does not change availability.

Cash:
- display only.

## G09 — Native purchase return

If prior click can be associated:
> Did you buy this gift?

Actions:
- Yes, mark purchased;
- No;
- dismiss/no response.

## G10 — RSVP update

Magic link refreshes same scoped party session.

Prepopulate current response.

## G11 — Passed event

> Thank you for celebrating with us.

Registry remains accessible.

---

# 5. Renderer validation journey

Regression gate for any change to the composition language, validator, compiler, renderer rules or planner (`docs/event-renderer-system.md §9`):

1. `proof-b/test.js` (unit: library validity, every repair rule, schema rejection, token detectors, planner distinctness, signature calibration);
2. `proof-b/adv-run.js` (every adversarial fixture repairs and renders with zero overflow);
3. library expressiveness render (all 27 silhouettes, 13 section recipes);
4. a sibling-batch confirmation run evaluated against the numeric thresholds, reported as separate schema, repair, geometry, invention, token, collision and review metrics.
