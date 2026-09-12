# Annotated Screen Spec — Responsive MVP

**Status:** Revision 5  
**Companion prototype:** `docs/prototypes/creation-flow.html`  
**PRD:** `spec.md`  
**Design system:** `docs/design-system.md`

Screen labels describe product surfaces, not necessarily URL routes.

---

# Global interaction language

- Landing page is the prompt.
- Prompt first; auth/save second; generation third.
- Creation Mode keeps the collaborator inside the event.
- No generic pre-publish setup dashboard.
- No wizard for independent tasks.
- Autosave routine edits.
- Contextual actions use `Edit`, `Set up`, `Add`.
- Setup/readiness UI distinguishes publish blockers from optional recommendations.
- Guest preview uses the exact production renderer.
- Never expose EventIdentity, DesignIntent, ResolvedDesignSpec, archetype/version, motif slots, compiler repairs, model names, token counts, or spend limits.
- Application chrome stays visually stable; event renderer carries theme.
- Phone-first does not mean phone-framed desktop.

---

# Host / co-host surfaces

## `landing-composer`

**Purpose:** creation begins immediately.

**Primary:** `Create my event ✦`  
**Secondary:** Sign in  
**Input:** freeform event vision  
**Optional:** `+ Add inspiration`

**Rules**
- no template gallery;
- no auth required to type;
- no strong-model generation yet.

## `auth-save`

**Purpose:** associate a high-intent draft with an account.

**Must preserve**
- exact prompt;
- successful inspiration assets;
- composer state.

**Auth:** Google / Apple / email.

**Primary:** Continue/save.

**Failure state:** restore failure must not silently discard user input.

## `generation-details`

**Purpose:** gather missing required event data while Event Identity/concepts are being prepared.

**Questions:** only missing date/time/venue/hosts/baby name if shown/deadline/privacy.

**AI progress:** creative direction/tone/palette interpretation.

## `concepts`

**Heading:** `Which feels like you?`

**Content:** three live renderer concepts.

**Each:** name, short description, `Choose this direction`.

**Below set:**
> None of these feel right?  
> `Try another direction ✦`

**Desktop:** compare side-by-side where width allows.  
**Mobile:** stack; lazy-mount later render trees.

## `site-reveal`

**Purpose:** activation.

Show full event guest site.

Message:
> **Your event looks great. Let’s make it real.**

Actions:
- `Make it yours →`
- `Try another direction ✦`

No setup dashboard.

## `creation-mode`

**Purpose:** make the finished-looking event real.

Uses production event renderer plus owner-only overlays.

Toolbar:
- Design
- Preview

Context actions:
- Event Details → Edit
- RSVP → Set up
- Registry → Add

Floating:
- Finish setup / required items left / Ready to publish.

## `setup-checklist`

**Purpose:** readiness navigation, not wizard.

Group 1: **Needed to publish**
- exact current blockers.

Group 2: **Recommended before sharing**
- Guests
- Registry
- Co-host
- optional work

Publish-ready state is allowed with recommended items incomplete.

## `event-details-editor`

**Mobile:** sheet/full-screen editor.  
**Desktop:** side panel/modal as appropriate.

Fields:
- title;
- hosts;
- date/time;
- venue/address;
- description;
- simple info blocks.

Autosave.

## `guests-workspace`

**Purpose:** focused operational exception to inline editing.

Actions:
- Add household;
- Import CSV.

Rows/cards show:
- household;
- contact state;
- party size;
- RSVP state.

States:
- Ready;
- Needs phone;
- No phone available;
- Awaiting;
- Attending;
- Declined.

Close returns to Creation Mode.

## `rsvp-setup`

Fields:
- deadline;
- plus-one;
- meal;
- dietary;
- custom questions;
- notes.

No open/public signup.

## `registry-setup`

Sections:
- External registry
- Native gifts
- Cash fund

Native:
- URL;
- safe metadata attempt;
- editable/manual fallback;
- normalized thumbnail or themed placeholder.

## `communications`

Actions:
- Send RSVP reminder;
- Send announcement.

SMS first.

No campaigns/marketing automation.

## `design-panel`

Controls:
- curated palette;
- compatible typography;
- reset;
- `Try another direction ✦` before publish.

No:
- archetype;
- density;
- motifs;
- treatment;
- cards;
- buttons;
- CSS;
- site images.

## `redesign-prompt`

Heading:
> **What should we change?**

Prompt is optional.

May add inspiration.

Reassurance:
> **Your event content stays untouched.**

Primary:
`Create 3 fresh directions`

## `redesign-concepts`

Three fresh concepts.

Actions:
- Choose this direction;
- Keep current;
- Refine the prompt again.

No onboarding restart.

## `preview`

Exact guest renderer.

No owner controls.

On larger screens:
- Mobile default;
- Mobile / Desktop toggle.

Primary app action:
- Publish for $49 when appropriate.

## `publish-gate`

Show:
- one-time $49;
- readiness;
- no subscription;
- primary `Publish my event`.

Owner handles payment.

## `share`

Show:
- URL;
- QR;
- private code separately.

## `management-home`

Post-publish operational priority:
- RSVP summary;
- Guests;
- Messages;
- Registry;
- Share;
- Edit site.

Owner-only:
- billing;
- co-host management;
- delete/archive.

## `cohost-invite-accept`

Signed out:
- event/inviter;
- authenticate;
- preserve invitation token.

Signed in:
- role summary;
- `Join event`.

Expired/invalid:
- calm error;
- return/contact inviter.

---

# Guest renderer surfaces

These are themed event-renderer components, not application forms.

## `private-access-gate`

Visible before code:
- hero;
- event name;
- hosts;
- date.

Locked:
- venue;
- details;
- RSVP;
- registry;
- cash fund.

Input:
- event code.

## `guest-event`

Single-scroll event:
- Hero
- Event Details
- RSVP
- Registry
- Made with footer

## `guest-lookup`

Input:
- name.

No contact info in results.

## `guest-collision`

Show minimum names needed to disambiguate.

## `guest-otp`

Six-digit verification.

Resend/throttle states.

## `guest-rsvp`

Fixed semantic order:
- party/member attendance;
- plus-one;
- meal;
- dietary;
- custom questions;
- notes;
- submit.

Visual composition comes from archetype.

On mobile, composition may converge to stacked flow.

## `guest-validation`

Inline themed errors.

Errors must remain accessible within every event palette.

## `guest-confirmation`

Themed success.

Magic-link update sent when phone exists.

## `guest-registry`

External destination cards.

Native gifts:
- normalized thumbnail/placeholder;
- Available/Purchased;
- Buy this gift.

Cash fund:
- display-only.

## `gift-return-confirm`

Question:
> Did you buy this gift?

Actions:
- Yes, mark purchased
- No

## `guest-update`

Magic-link return/update.

## `passed`

Thank-you state.

Registry remains accessible.

---

# Renderer lab states

The renderer gallery/test harness must be able to show the same guest content under multiple concepts at:
- 390px;
- 1280px;
- color;
- grayscale.

Required visual states:
- hero;
- details;
- private gate;
- lookup;
- collision;
- OTP;
- RSVP;
- validation error;
- confirmation;
- registry;
- native placeholder;
- purchase return;
- footer;
- passed state.

The lab is a development artifact, not customer UI.
