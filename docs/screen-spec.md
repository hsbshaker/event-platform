# Annotated Screen Spec — Responsive MVP

**Status:** Revision 7  
**PRD:** `spec.md` Revision 7  
**Card system:** `docs/card-system.md`  
**Design system:** `docs/design-system.md`

Screen labels describe product surfaces, not necessarily URL routes. Section references (§) point to `spec.md` unless a document is named.

---

# Global interaction language

- Landing page is the prompt.
- Prompt first; auth/save second; generation third.
- Creation Mode keeps the collaborator inside the invitation: the card and the page beneath it.
- No generic pre-publish setup dashboard.
- No wizard for independent tasks.
- Autosave routine edits.
- Contextual actions use `Edit`, `Set up`, `Add`.
- Setup/readiness UI distinguishes publish blockers from optional recommendations.
- Preview and guest views use the production card, envelope and page.
- One card component renders everywhere; the card never reflows (§11.2).
- The card is the only themed surface. The page under it is one house style for every event (§11.9).
- Never expose Event Identity, card design internals, layouts, art modes, art briefs, ink or legibility panels, compiler steps, model or provider names, token counts, or spend limits (§26).
- Application chrome stays visually stable; it never takes the card's styling.
- Phone-first does not mean phone-framed desktop.

---

# Host / co-host surfaces

## `landing-composer`

**Purpose:** creation begins immediately (§7.1).

**Primary:** `Create my invitation ✦`  
**Secondary:** Sign in  
**Input:** freeform event vision  
**Optional:** `+ Add inspiration`

**Rules**

- no template or art gallery;
- no auth required to type;
- no model or image generation yet.

## `auth-save`

**Purpose:** associate a high-intent draft with an account (§7.2).

**Must preserve**

- exact prompt;
- successful inspiration assets;
- composer state.

**Auth:** Google / Apple / email.

**Primary:** Continue/save.

**Failure state:** restore failure must not silently discard user input.

## `generation`

**Purpose:** the wait is a product surface (§7.3, §7.10). Replaces any separate details step.

**Shows, as each genuinely resolves:** interpreted creative signals, colour direction, visual vocabulary, then the design's name, description and art direction.

**Never shows:** model reasoning, invented progress or percentages, simulated stages.

**Optional details panel**

- only missing fields (date, time, venue, hosts, baby name if shown, RSVP deadline, public/private);
- values extracted from the prompt are pre-filled for confirmation;
- never blocks and never gates the reveal.

**Optional taste clarification** (§7.6b): usually absent; at most three questions; each offers `You decide` / `Surprise me`; never fonts, layouts, colours or logistics.

**Failure state:** an honest failure with a retry action; no fallback design.

**Copyright step-back** (`spec.md §7.6`): when the image provider refuses a brand or character
homage, the surface keeps going and shows one short, plain note — "That first take came out too
close to a well-known character, so for copyright reasons we're trying a fresh take on its world."
— while the step-back design and artwork generate. Never a provider error, never blame on the host.
If that is refused too, the honest failure above, whose Try again takes the same step back.

## `card-reveal`

**Purpose:** activation (§7.11).

Shows the card coming out of the envelope the guests will see, with:

- the design's name and one-line description;
- `Make it yours →`
- `Try another direction ✦`

Message:
> **Your invitation looks great. Let's make it real.**

**Rules**

- one card at a time; the first becomes the active design, later ones only when chosen;
- missing required facts render as placeholders marked as needing confirmation;
- no setup dashboard.

## `try-another-direction`

**Purpose:** reimagine the card before publish (§7.15). Replaces the redesign prompt and redesign results.

**Entry:** from `card-reveal` and Creation Mode; unavailable after publish.

**Input**

- Heading: **What should we change?**
- feedback is optional;
- `+ Add inspiration` is optional.

**Reassurance:**
> **Your event details stay exactly as they are.**

**Primary:** `Create a new direction`

**Result:** the new card is revealed from its envelope while the current active card stays active. Actions: `Choose this direction` · `Keep current` · `Try another direction ✦`.

**Rules**

- no onboarding restart;
- no credits or counters (§10);
- event details never change.

### Designs list

Every design generated for the event, each as its card with name and description; the active one is marked. Reached from the result and from `design-panel`.

- Choosing a design makes it active, resets card wording, font and shape to that design, keeps a host-supplied title (§20.3).
- Read-only after publish (§8.2).

## `creation-mode`

**Purpose:** make the finished-looking invitation real (§19.1).

Uses the production card and page plus owner-only overlays.

Toolbar:

- Design
- Preview

Anchors (stable, absent for guests):

- card: title and invitation line edited in place;
- Event Details → Edit (also the source of the card's facts);
- description and information blocks → Edit / Add;
- RSVP → Set up;
- Registry → Add.

Placeholders for missing required facts are marked as needing confirmation and never published.

Floating:

- Finish setup / required items left / Ready to publish.

## `setup-checklist`

**Purpose:** readiness navigation, not wizard (§19.2).

Group 1: **Needed to publish**

- exact current blockers (§23.1).

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
- baby name;
- date/time;
- venue/address;
- description;
- simple info blocks.

Autosave. Card and page update with no model call. Entry limits for card-bound fields come from the layout's slot limits (`docs/card-system.md §2.5`).

## `guests-workspace`

**Purpose:** focused operational exception to inline editing (§7.13).

Actions:

- Add household;
- Import CSV.

Rows/cards show:

- household;
- contact state;
- party size;
- RSVP state;
- invitation status.

States:

- contact: Ready · Needs phone · No phone available;
- response: Awaiting · Attending · Declined;
- invitation: Not sent · Sent · Delivery failed · Opted out.

Per party:

- fix phone / mark No phone available;
- after publish: `Copy personal link`; `Rotate link` (invalidates the old link; confirm before rotating) (`spec.md §7.17`, `§12.5`).

Invitations are sent from `communications`. Close returns to the prior Creation Mode context.

## `rsvp-setup`

Fields:

- deadline;
- plus-one;
- adults/children per party;
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
- normalized thumbnail or house-style placeholder.

## `communications`

**Purpose:** send messages to guests (§7.18, §13).

**Send invitations** (after publish only)

- recipients: all not-yet-invited parties, or a selection;
- one-time-per-event attestation that the host has permission to text these guests about this event;
- each selected party with a usable phone that has not opted out receives one text carrying its personal link;
- parties without a usable phone are listed with `Copy personal link`;
- per-party invitation cap shown when reached.

**Send RSVP reminder** — non-responders only.  
**Send announcement** — invited guests by selected audience.

Suppress opted-out parties. Host-initiated reminders and announcements share the per-event cap. Invitations go by text only.

No campaigns or marketing automation.

## `design-panel`

Controls (§7.14, §20):

- font: the design's primary pairing and its alternates;
- shape: outline swatches for the shapes the design's layout supports (of rectangle, rounded rectangle, arch, oval, square, circle). A shape the current artwork fits applies instantly; any other (tall ↔ square, or a new outline for a bordered design) states that new artwork of the same subject will be made, keeps the current card visible while it generates, before publish only (§7.14);
- reset card wording, font and shape to the design;
- `Try another direction ✦` before publish;
- designs list before publish (read-only afterwards).

Wording is edited directly on the card, not here.

No:

- colour controls;
- layout, art mode, ink or panel controls;
- sizes or positions;
- artwork editing;
- page styling;
- uploads onto the card.

## `preview`

Production card, envelope and page with current content.

No owner controls, readiness control or toolbar.

On larger screens:

- Mobile default;
- Mobile / Desktop toggle (Preview only).

Primary app action:

- Publish for $49 when appropriate.

## `publish-gate`

Show:

- one-time $49;
- readiness;
- no subscription;
- primary `Publish my invitation`.

Owner handles payment; a co-host may publish only once payment is satisfied.

## `share`

Show (§14.3):

- event URL;
- QR (URL only);
- private code separately;
- `Send invitations` (to `communications`);
- `Copy personal link` per party, in `guests-workspace`, never as one shared bypass.

## `management-home`

Post-publish operational priority (§19.3):

- RSVPs summary;
- Guests;
- Messages (invitations, reminders, announcements);
- Registry;
- Share;
- Edit invitation.

Owner-only:

- billing;
- co-host management;
- delete/archive.

`Try another direction` and design switching are not offered.

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

# Guest surfaces

The envelope and card are the event's themed surface; everything else is house-style page and app-level components, not themed forms.

## `envelope`

The house-designed envelope, identical for every event, showing the event title (§11.8).

**Opening:** the guest taps (an explicit action; it never opens by itself); the card slides out and settles at the top of the page.

**Entry paths**

- personal invitation link: no code; the closed envelope opens on the guest's tap, and only then do the card, page and party session load (§12.5); before publish the link shows a neutral "not available yet" state;
- shared link, public event: opens;
- shared link, private event: **sealed** with the title only; an event-code field is shown; nothing on the card or page is visible until the code is accepted (§14.2).

**States**

- sealed (private, shared link): title, code input, attempt-limit and error messages that reveal nothing about the event;
- opening;
- reduced motion: the card appears without the animation.

## `guest-event`

Single-scroll (§21):

- Card
- Event details
- Description and information blocks
- RSVP
- Registry
- Made with footer

House style for every event. The card is live, selectable, screen-reader-readable text over decorative artwork.

## `guest-lookup`

Shared-link path only. Input: name.

No contact info in results. Minimum first names needed to recognise the party.

## `guest-collision`

Show minimum names needed to disambiguate; ask for more name detail.

## `guest-otp`

Six-digit verification, for phone-backed parties.

Resend/throttle states. For a `No phone available` party the step is skipped (name lookup only). For a Needs-phone party: neutral "please contact the host" message and no RSVP.

## `guest-rsvp`

Fixed semantic order:

- party/member attendance;
- plus-one;
- meal;
- dietary;
- custom questions;
- notes;
- submit.

Reached directly from a personal link, or after lookup and verification. Prefilled with the current response on update.

Inline validation errors meet WCAG AA.

## `guest-confirmation`

> **You're all set. We can't wait to celebrate with you.**

When the guest arrived by the shared link and the party has a phone, a text with their personal link is sent for return/update.

## `guest-registry`

External destination cards.

Native gifts:

- normalized thumbnail or house-style placeholder;
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

Personal-link return: same scoped party session, current response pre-populated.

## `passed`

> Thank you for celebrating with us.

Registry remains accessible.
