# E2E Workflow — AI-Designed Baby Shower Invitation Platform

**Status:** Revision 7 UX workflow  
**Source of truth:** `spec.md` Revision 7  
**Card system:** `docs/card-system.md`  
**Design system:** `docs/design-system.md`  
**Design target:** phone-first, responsive desktop  
**North star:** **AI should remove decisions, not create more decisions.**

This document sequences the journeys. Behaviour, limits and acceptance criteria live in `spec.md`; section references (§) below point to it unless a document is named.

---

# 1. Journey architecture

Two connected journeys:

1. **Owner/co-host:** describe → auth/save → AI designs one card → reveal from the envelope → make it yours → preview → publish → send invitations → manage.
2. **Guest:** receive a personal link (or open the shared link) → envelope opens → card → page → RSVP → registry → update later.

The invitation is simultaneously:

- the AI-designed output (one card);
- the pre-publish workspace (the card and the page beneath it, editable in place);
- the guest experience (envelope, card, then a standard page);
- the referral surface.

The card is the only themed surface. The page under it is one neutral house style for every event (§11.9, §21).

---

# 2. Owner/co-host creation journey

## H01 — Landing composer

**Goal:** get the user creating before configuring (§7.1).

Hero:
> **Describe your event. We create the whole experience.**

Controls:

- large natural-language composer;
- `+ Add inspiration`;
- `Create my invitation ✦`.

Optional reassurance:
> Free to create · No templates · Publish when ready

Secondary: Sign in.

Do not show a template or art gallery.

## H02 — Auth/save

Triggered after the user submits a real event idea (§7.2).

Before auth:

- persist the exact prompt in a short-lived private draft;
- retain references to successful private inspiration uploads.

Auth: Google / Apple / email; no profile wizard.

After auth:

- attach the draft to the owner/event;
- restore the prompt and inspiration exactly;
- begin generation.

No generation of any kind happens before auth succeeds.

**Failure condition:** losing or truncating the prompt or inspiration through OAuth.

## H03 — Generation

Runs after auth (§7.3, §7.5, §7.6b, §7.10). Event Identity starts immediately; in parallel a cheaper extraction pulls any facts the prompt states (names, date, time, venue) into the draft for the host to confirm. The card design and its artwork follow the identity.

The host sees only real artifacts as they resolve: interpreted creative signals, colour direction, visual vocabulary, then the design's name, description and art direction. Never model reasoning, never invented progress or percentages.

**Optional taste clarification.** Usually none; at most three questions; each offers `You decide` / `Surprise me`; never fonts, layouts, colours or logistics (§7.6b).

**Optional detail entry while waiting.** Genuinely missing details (date, time, venue, hosts, baby name if shown, RSVP deadline, public/private) are offered, never demanded; values extracted from the prompt are pre-filled for confirmation; watching and filling in are equally valid. Timezone is inferred from the venue text with browser fallback and is not asked normally (§7.4).

The card is revealed as soon as its artwork and ink resolution exist, whether or not details were entered.

**Failure:** a failed stage is shown honestly with a retry action; there is no template or stock fallback (§7.8, `docs/card-system.md §3`).

## H04 — Card reveal

The card comes out of the same envelope guests will see (§7.11). The first card generated for an event becomes the active design.

Shown:

- the card;
- its creative name and one-line description;
- `Make it yours →`;
- `Try another direction ✦`.

Copy:
> **Your invitation looks great.**  
> **Let's make it real.**

There is no setup dashboard and no choice among simultaneous options. Missing required facts appear on the card as bounded placeholders marked as needing confirmation (§7.3).

## H05 — Try another direction

Available before publish, from the reveal and from Creation Mode (§7.15).

1. Optionally say what to change; optionally add private inspiration.
2. Reassurance: **your event details stay exactly as they are.**
3. One new card, different from every earlier one, is generated; the current active card stays active.
4. The new card is revealed from its envelope. The collaborator chooses it, keeps the current one, or tries again.

The loop repeats without restarting onboarding. All designs generated so far remain browsable before publish (H14). No credits or counters are shown (§10).

## H06 — Creation Mode

`Make it yours` turns the same invitation into the workspace (§7.12, §19.1). It does not navigate to a dashboard.

App-level owner toolbar: Design · Preview.

Contextual controls attach to stable anchors:

- the card: wording (title, invitation line) edited in place; card facts via Event Details;
- Event Details → `Edit`;
- description and information blocks → `Edit` / `Add`;
- RSVP → `Set up`;
- Registry → `Add`.

Placeholders for missing required facts stay marked as needing confirmation and are never published. Routine edits autosave and update the card deterministically with no model call (§9.3).

## H07 — Readiness checklist

Floating control: `Finish setup` · `2 required items left` · `Ready to publish` (§19.2).

The sheet is navigation, not a wizard, with two groups:

**Needed to publish**

- actual blockers from §23.1 only.

**Recommended before sharing**

- Guests;
- Registry;
- Co-host;
- other optional work.

No rigid order. `Ready to publish` can show while recommended items remain.

## H08 — Event details editor

Opened from the card or the details section.

Edit: title; hosts; baby name; date/time; venue/address; description; simple information blocks.

Closing returns to the same place in the invitation. Facts appear on the card and page automatically.

## H09 — Guests workspace

Dedicated full-screen workspace (§7.13, §12).

Actions:

- add a guest/household;
- import CSV (rows without a phone import and are flagged Needs phone).

States shown:

- contact: Ready · Needs phone · No phone available;
- response: Awaiting · Attending · Declined;
- invitation: Not sent · Sent · Delivery failed · Opted out.

After publish, per party: copy its personal invitation link; rotate it (invalidates the old link) (§7.17, §12.5). Invitations are sent from Share after publish (§7.18).

Close/back returns to the prior Creation Mode context.

## H10 — RSVP setup

Opened from the RSVP section.

Configure: deadline (defaulted per §7.3); plus-one behaviour; adults/children per party; meals; dietary field; custom questions; notes.

No open RSVP; RSVP remains invite-only (§12.1, §14.4).

## H11 — Registry setup

Opened from the Registry section (§15).

External registry: URL; destination card; the retailer remains authoritative.

Native gift: product URL; one safe metadata/image attempt; manual fallback; platform-owned normalized thumbnail or house-style placeholder; no reservation state.

Cash fund: display-only handles, suggested amounts, blurb.

## H12 — Design controls

`Design` exposes only (§7.14, §20):

- the card's font among the active design's primary and alternate pairings;
- the card's shape among those the design's layout supports: a shape the current artwork fits applies instantly; any other shape makes new artwork from the same brief (before publish only);
- reset the card's wording, font and shape to the design;
- `Try another direction ✦` (before publish);
- the designs list (H14).

No layout, colour, art mode, size, position or page-styling controls.

## H13 — Preview

The production card and page with current content, envelope included (§7.16).

Removes collaborator controls, the readiness control and the owner toolbar.

On desktop/tablet: defaults to Mobile; a `Mobile / Desktop` toggle exists in Preview only.

The primary publish action may remain app-level.

## H14 — Designs list

Opened from Design (§20.3). Shows every design generated for the event, each as its card with name and description; the active one is marked.

- Choosing a design makes it active, resets card wording, font and shape to that design, and keeps a title the host supplied or edited. Event details, guests, RSVP, registry, privacy and messages never change.
- Read-only after publish (§8.2).

## H15 — Publish gate

Requirements (§7.17, §23.1, §28):

- deterministic readiness passes (§23.1);
- $49 one-time shown;
- owner handles payment.

No tiers or subscription upsell. Once paid, owner or co-host may publish.

## H16 — Share and send invitations

After publish (§7.17, §7.18, §14.3):

- event URL; QR (URL only, never the code); private event code shown separately when private;
- `Send invitations`: choose all not-yet-invited parties or a selection; attest once per event that you have permission to text these guests; the platform texts each selected party with a usable phone one short message with its personal link; parties without a usable phone are listed with their personal link to copy and send another way;
- invitation status per party updates in the guest workspace; resends and later additions are allowed within the per-party cap (§13.2);
- hosts may instead share the link/QR themselves; both paths coexist;
- a copyable personal link per party.

---

# 3. Post-publish management journey

After publish, an operational Event Home becomes primary (§19.3).

Priority:

1. RSVPs — summary; awaiting, attending, declined;
2. Guests — Needs phone, invitations not sent, delivery failed;
3. Messages — invitations, reminders (non-responders), announcements (§13.4);
4. Registry;
5. Share — link, QR, code;
6. Edit invitation — details, card wording, font and shape (shapes the existing artwork fits).

Owner additionally: billing, co-host access, delete/archive.

No vanity analytics.

Disabled after publish: `Try another direction` and design switching; the designs list is read-only (§8.2). Material changes (date, venue) update the live invitation directly; hosts should announce them (§8.1).

---

# 4. Guest journey

## G01 — Arrive by personal invitation link

The guest opens the link from the platform's text (§12.5).

- The party is identified and the guest-party session established, with no name lookup and no SMS code.
- No private event code is asked; the closed envelope opens on the guest's action, and only then do the card, page and party session load (§12.5).
- The guest can RSVP immediately, and uses the same link later to view or update the RSVP (G12).

## G02 — Arrive by shared link

The guest opens the event URL or scans the QR.

- **Public event:** the envelope opens.
- **Private event:** only the sealed envelope with the event title is visible; nothing on the card or page shows. Entering the event code opens it (§14.2).

The guest is not yet identified. They may read the card and page, and must identify themselves (G04) to RSVP.

## G03 — Card to page

The envelope opens; the card settles at the top of the page; scrolling reveals details, description, information blocks, RSVP, registry, footer in the house style (§21). Reduced motion shows the card without the opening animation.

## G04 — Find invitation (shared link)

Input name. Fuzzy-match the invite list. Show only the minimum first-name information needed to recognise the party. Never show phone or email (§12.5).

## G05 — Collision resolution

When multiple parties match, ask for enough additional name detail to identify the intended party; do not leak phone or email.

## G06 — Verify

- **Phone-backed party:** SMS OTP, with abuse throttling.
- **`noPhoneAvailable`:** accepted name-lookup-only fallback.
- **Needs phone:** neutral state directing the guest to contact the host; no RSVP exposure. The host can fix the phone, mark the no-phone override, or send the party its personal link.

## G07 — RSVP

Fixed semantic flow in the house style:

- party members;
- attendance;
- plus-one;
- meal;
- dietary;
- custom questions;
- notes.

Reached directly from a personal link, or after G04–G06 from the shared link.

## G08 — Confirmation

> **You're all set. We can't wait to celebrate with you.**

When the guest arrived by the shared link and the party has a phone, the platform texts them their personal link so they can return and update without repeating lookup and OTP (§12.7).

## G09 — Registry

- External: `Shop [Retailer] Registry`.
- Native: `Buy this gift`; private click; retailer; the click alone does not change availability.
- Cash fund: display only.

## G10 — Native purchase return

If a prior click can be associated:
> Did you buy this gift?

Actions: `Yes, mark purchased` · `No` · dismiss/no response (§16.3).

## G11 — Passed event

> Thank you for celebrating with us.

Registry remains accessible.

## G12 — RSVP update

The personal link re-establishes the same scoped party session and pre-populates the current response. A guest without it can repeat name lookup and the appropriate verification path.

---

# 5. Card generation checks

Regression gate for any change to the card design prompt or schema, layout set, compiler, ink resolution, `layoutCard`, artwork prompt assembly or envelope: the tests and gates in `docs/card-system.md §9`, and the acceptance criteria in `spec.md §31 — Card design, artwork and compiler` and `§31 — Card rendering and envelope`.
