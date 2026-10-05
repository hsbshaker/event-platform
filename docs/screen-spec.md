# Annotated Screen Spec — Responsive MVP

**Status:** Revision 7.2 (adds the `card-editor` surface)  
**PRD:** `spec.md` Revision 7.2  
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
- The card's text is edited in the `card-editor`, directly on the card; the editor's chrome is app-styled and never part of the card.
- Contextual actions use `Edit`, `Set up`, `Add`.
- Setup/readiness UI distinguishes publish blockers from optional recommendations.
- Preview and guest views use the production card, envelope and page.
- One card component renders the card on every screen; the card never reflows (§11.2).
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
- values extracted from the prompt are pre-filled for confirmation, and shown on the card marked as needing confirmation until confirmed (`spec.md §7.3`);
- never blocks and never gates the reveal.

**Optional taste clarification** (§7.6b): usually absent; at most three questions; each offers `You decide` / `Surprise me`; never fonts, layouts, colours or logistics.

**Failure state:** an honest failure with a retry action; no fallback design.

**Copyright step-back** (`spec.md §7.6`): when the image provider refuses a brand or character
homage, the surface keeps going and shows one short, plain note — "That first take came out too
close to a well-known character, so for copyright reasons we're trying a fresh take on its world."
— while the step-back design and artwork generate. Never a provider error, never blame on the host.
If that is refused too, the honest failure above, whose Try again takes the same step back.

**Shape switch failures** (`design-panel`): a shape switch paints from the existing design, so a
refusal is the honest failure at once — "We couldn't make that shape" / "The new artwork for that
shape came out too close to a well-known character, so for copyright reasons we couldn't use it.
Your card stays as it is — you can try again." A shape the design is not made for is never offered;
if asked for anyway: "That shape isn't available" / "This card is designed for a few shapes, and
that isn't one of them. Your card stays as it is — choose one of the shapes shown."

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

**Purpose:** change the card, or reimagine it, before publish (§7.7, §7.15). Replaces the redesign prompt and redesign results.

**Entry:** from `card-reveal` and Creation Mode; unavailable after publish.

**Input**

- Heading: **What should we change?**
- helper: *Say what to change, or leave it empty for a new idea.*
- feedback is optional: a change ("add a little dinosaur", "make it a starry night") keeps the card and changes that; empty, or asking for something new, makes a genuinely different card. One box; the host never picks a mode;
- `+ Add inspiration` is optional.

**Reassurance:**
> **Your event details stay exactly as they are.**

**Primary:** `Make a new card`

**Wait:** the same honest surface as `generation`: real artifacts only (the design's name, description and art direction), no percentages.

**Result:** the new card is revealed from its envelope while the current active card stays active. Actions: `Choose this direction` · `Keep current` · `Try another direction ✦`.

**Rules**

- no onboarding restart;
- no credits or counters (§10);
- one card at a time per event (§10): while another card for the event is being made, a different request is not started — the host is told *Another card is being made* and `Try again` keeps their words; only the same request (the same card and words, e.g. a retry after a lost answer) waits on the one in flight, so nobody is shown another collaborator's card as theirs;
- event details never change.

### Designs list

Every design generated for the event, each as its card with name and description; the active one is marked. Reached from the result and from `design-panel`.

- Choosing a design makes it active and keeps the host's words, added text and fonts, laid out fresh in the new design; earlier customizations are kept, so choosing the previous design restores them (§20.6). Event details never change.
- Read-only after publish (§8.2).

## `creation-mode`

**Purpose:** make the finished-looking invitation real (§19.1).

Uses the production card and page plus owner-only overlays.

Toolbar:

- Design
- Preview

Anchors (stable, absent for guests):

- card: tap it to open `card-editor`, where every text on the card is edited in place (§20.1);
- Event Details → Edit (also the source of the card's fact boxes);
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

Each §23.1 requirement is its own row. The RSVP deadline row usually clears when the date is saved
(its default is stored with the date); the time zone row opens the venue field (it is inferred from
the venue, §7.4).

## `event-details-editor`

**Mobile:** sheet/full-screen editor.  
**Desktop:** side panel/modal as appropriate.

Fields:

- title;
- hosts;
- baby name;
- date/time;
- venue/address;
- description (up to 2,000 characters; empty clears it);
- who can see it: Public / Private (§14), before and after publish. Private shows the event code
  (`XXXX-XXXX`) with `Copy` and `New code`, and says that guests on the shared link enter it while
  personal invitation links skip it; after publish, that a new code replaces the old one at once.
  Choosing Private always stores a code; going Public keeps it for a later switch back;
- simple info blocks (a later Creation Mode slice).

Every Edit/Add anchor on the event details and the description opens this one editor, focused on the field it was opened from.

Autosave. Card and page update with no model call. Entry limits for card-bound fields come from the layout's slot limits (`docs/card-system.md §2.5`).

## `guests-workspace`

**Purpose:** focused operational exception to inline editing (§7.13).

Route: `/events/[id]/guests`, for the owner and co-hosts, before and after publish; `Close` returns
to the invitation. A summary line counts parties and guests, and how many need a phone; a
`Needs phone` filter appears when any do.

Actions:

- `Add party`: the party editor (shared `Sheet`): the guests in the party, each named and Adult or
  Child, the first being the main contact (an adult); `Allow a plus-one`; a US or Canadian mobile
  number, or `No phone available` (one is required to save); an optional email ("Only used if a
  reminder can't reach them by text."); an optional name on the invitation (derived from the guests
  when blank). `Save`, and `Delete` with an inline confirmation;
- `Import CSV`: pick a file (up to 1,000,000 bytes and 2,000 rows), see a preview (parties, guests,
  how many need a phone, and each row that was skipped or whose phone or email was not
  recognised), then `Import` in one step. Columns are matched by name: Name (or First name and Last
  name), Household, Phone, Email, Child, Plus one; rows sharing a Household make one party. A row
  without a usable phone imports as Needs phone. `Download a sample CSV` gives the headers.

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

Controls, in order (§7.14, §20):

- `Edit card` — opens `card-editor`;
- shape: outline swatches for the shapes the design's layout supports (of rectangle, rounded rectangle, arch, oval, square, circle). A shape the current artwork fits applies instantly; any other (tall ↔ square, or a new outline for a bordered design) states that new artwork of the same subject will be made, keeps the current card visible while it generates, before publish only (§7.14);
  A shape switch keeps the host's words, added text and fonts with a fresh layout; the edited card for each shape is kept, so switching back restores it (§20.6);
- `Reset card` — back to the design's generated layout, fonts, colours and invitation line for the current shape (the title and event details are not reverted), after a confirmation (see `card-editor`);
- `Try another direction ✦` before publish;
- designs list before publish (read-only afterwards).

A shape that needs new artwork keeps waiting when the panel is closed: a quiet status by the card
("Painting your card as a square…") says so, and a failure shows there with `Try again`.

After publish, `Edit card`, `Reset card` and shapes an existing artwork fits remain, and the designs list is read-only; `Try another direction`, shapes that need new artwork and choosing a design do not (§8.1, §8.2).

Text is edited on the card in `card-editor`, not here.

No:

- layout, art mode, ink or panel controls;
- artwork editing;
- page styling;
- uploads onto the card.

## `card-editor`

**Purpose:** let the host make the card's text their own (§20; `docs/design-system.md §4.10a`). Every text on the card is a text box. The artwork, outline and envelope are not editable.

**Entry**

- tap the card in `creation-mode`;
- `Edit card` in `design-panel`.

Owner and co-host only. Available before and after publish; after publish every change updates the live card (§8.1).

**Surface:** the production card component with editor chrome drawn above it. The card is shown exactly as guests will see it, including text clipped at the outline. The chrome (selection frame, handles, guides, toolbar, pickers, status) is app-styled and never part of the card.

**Layout at 390px**

- header: `Done`, `Undo`, `Redo`, saved state, overflow (`Reset card`);
- the card at the viewport width, 5:7 or 1:1, with its outline;
- bottom toolbar (a bottom sheet) holding one row of icon buttons; panels open as a half-height sheet that leaves the selected box visible;
- with the keyboard open, the edited box stays visible above the keyboard and the toolbar;
- the app's setup pill and owner toolbar are hidden while editing.

**Layout on desktop**

- the card centred at a comfortable size in the canvas, never reflowed; the page beneath stays where it was;
- side panel on the right for the toolbar and its panels; header across the top with the same controls;
- selection handles on the frame: width and rotation.

**States**

- **Idle:** no box selected. Toolbar shows `Add text`, `Boxes`, `Undo`, `Redo`.
- **Box selected:** frame and handles; toolbar header names the box; the row of controls (font, size, colour, align, spacing, layer, duplicate, delete, add text, undo, redo, boxes). Drag moves; pinch scales and twist rotates (phone); handles resize width and rotate (desktop); snapping guides show during a gesture.
- **Typing:** double-tap (phone) or double-click / `Enter` (desktop) types in place. A compact style row stays above the keyboard. A fact box opens that detail's own field instead (date picker, venue field), and the card and page update together (§20.2). The title box edits the event's title everywhere.
- **Toolbar panels:** `Font`, `Size`, `Colour`, `Align`, `Spacing` (with case), `Layer`, `Arrange` (exact position, width and rotation). One panel at a time; `Back` returns to the row.
- **Font picker:** "From this card" first (the design's pairings), search, categories, the full Google Fonts library. A family loading shows a progress indicator and the box keeps its font until it is ready.
- **Colour picker:** "From this card" artwork swatches, recent colours, a full picker and a hex input. Any colour is accepted. No contrast numbers, warnings or blocks (§20.1).
- **Box list:** every box in layer order with its role and text; select, bring forward, send back, duplicate, delete.
- **Saving / Saved:** `Saving…` then `Saved` in the header; autosave, no save button.
- **Save failed:** "Couldn't save. Your changes are kept here." with `Retry`; `Saved` is not shown.
- **Stale-save conflict:** a co-host saved first; the save is refused and the editor reloads the latest with a short notice ("<Name> just made changes. Showing the latest."). No modal (§20.5).
- **Reset confirmation:** `Reset card` opens a dialog that says the card goes back to its generated layout, fonts, colours and invitation line for this shape, without added text, and that the title and event details stay as they are; `Reset card` / `Cancel`. Other shapes' and designs' customizations are kept. `Undo` is offered after.
- **Font failed to load:** inline "Couldn't load this font." with `Try again`; the box keeps its previous font and nothing is saved for it.
- **Delete:** removes the box and offers `Undo`. Deleting a fact box says it is removed from the card only and is still on the page.
- **After publish:** the same surface, with the live card updating on each autosave; `Try another direction` and shape switches that need new artwork are not offered.

**Rules**

- no readability checks or warnings on host choices (§20.1);
- no image, sticker or graphic can be added; no artwork, outline or envelope controls;
- no model call from any editor action (§20.5);
- line breaks come from the deterministic layout function; the browser never re-wraps card text (§20.4);
- every box reachable from the box list and every property settable by exact value, by keyboard and screen reader (§20.3);
- `Done` returns to `creation-mode` at the same scroll position.

## `preview`

Production card, envelope and page with current content, including the host's edited card text.

No owner controls, readiness control or toolbar.

On larger screens:

- Mobile default;
- Mobile / Desktop toggle (Preview only).

Primary app action:

- Publish for $49 when appropriate (with the publish gate, Phase 9; until then Preview has no
  publish control).

The card and page show only what guests will see: saved, confirmed facts — never a placeholder or
an unconfirmed prompt-stated value (§7.3). When a required fact is missing, one plain line says so:
"Details you haven't confirmed aren't shown to guests."

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

Already a member (the owner, or an existing co-host): says so and opens the event; the link is not
used up.

Delivery: the owner creates an invite link in `Co-hosts` and shares it themselves — the platform
sends nothing. A link works once, expires after 7 days, and can be revoked; the owner can remove a
co-host.

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
