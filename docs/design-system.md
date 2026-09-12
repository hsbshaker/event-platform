# Product Design System
## AI-Native Event Website + RSVP + Registry Platform

**Document:** `docs/design-system.md`  
**Status:** Revision 3 — implementation baseline  
**Initial launch vertical:** Baby showers  
**Applies to:** Host application, co-host application, guest experience shell, generated event renderer, responsive behavior, interaction patterns, motion, accessibility, and visual implementation governance  
**Companion source of truth:** `spec.md` / current PRD

### Revision 3 reconciliation

This revision keeps the approved application UX from Revision 2 and reconciles renderer terminology with PRD Revision 5.

Application behavior remains:
- prompt-first landing;
- auth/save before strong-model generation;
- full-site reveal after concept selection;
- Creation Mode = event itself;
- contextual editing;
- truthful publish-readiness checklist;
- mobile-first, real desktop rendering;
- strict shared application tokens/components;
- light-only app chrome MVP.

Renderer architecture changes:
- strong model emits six-field `DesignIntent`, not a fully orthogonal design schema;
- versioned archetype bundles own composition and component/treatment defaults;
- deterministic compiler creates immutable `ResolvedDesignSpec`;
- motifs are role/slot based and dropped motifs are logged;
- raw palettes compile into semantic accessible tokens before rendering;
- generated design data is immutable while renderer code remains maintainable;
- themed guest components and mobile-convergence rules are explicit.

The implementation-level renderer contract lives in `docs/event-renderer-system.md`.

---

## 0. Authority and relationship to the PRD

This document is the product's **UI/UX and visual implementation contract**.

The PRD remains authoritative for:
- product scope;
- business rules;
- data models;
- permissions;
- AI architecture;
- RSVP behavior;
- registry behavior;
- privacy/security requirements;
- publishing rules;
- payment rules;
- operational requirements.

This design-system document is authoritative for:
- interaction model;
- screen composition;
- creation-mode behavior;
- responsive behavior;
- component hierarchy;
- app visual tokens;
- motion;
- accessibility presentation;
- generated-site rendering primitives;
- implementation consistency.

### 0.1 Newer approved UX decisions

Where an older PRD flow conflicts specifically with the newer approved creation UX below, **this document wins for UX sequence and presentation**.

The current canonical creation flow is:

```text
LANDING / PROMPT
    ↓
USER DESCRIBES EVENT IMMEDIATELY
    ↓
AUTH / SAVE
(prompt + inspiration must survive OAuth intact)
    ↓
AI GENERATION BEGINS
    ↓
REQUIRED DETAILS COLLECTED WHILE GENERATION RUNS
    ↓
3 CONCEPT DIRECTIONS
    ├── choose one
    └── "Try another direction" → optional prompt refinement → 3 new directions
    ↓
FULL SITE REVEAL
"Your event looks great. Let's make it real."
    ├── Make it yours
    └── Try another direction
    ↓
CREATION MODE
The event itself is the workspace.
Inline edit/setup affordances.
Floating setup-progress control.
No wizard.
No Next buttons.
    ↓
PREVIEW
    ↓
$49 PUBLISH
    ↓
LIVE EVENT
    ↓
MANAGEMENT MODE
RSVPs · Guests · Registry · Messages · Edit Site
```

The user should never be required to understand the application's information architecture before seeing value.

---

# 1. Product design thesis

The product should feel:

- **quiet;**
- **premium;**
- **neutral;**
- **slightly warm;**
- **confident rather than decorative;**
- **simple without feeling sparse or unfinished.**

The product UI should not compete visually with the generated event.

The generated event carries the host's personality.

The application chrome provides a calm frame around it.

### 1.1 Core product-design principle

> **Get the user creating before asking them to configure anything.**

The product should expose its value through use, not explanation.

The landing page is not primarily a marketing page. The creation composer is the hero.

### 1.2 Core interaction principle

> **Keep the host inside the thing they are creating.**

Whenever possible:
- edit where the content lives;
- configure the feature where the guest will experience it;
- return the user to the exact location they came from;
- avoid routing through generic settings pages.

### 1.3 Core AI principle

> **AI should remove decisions, not create more decisions.**

Do not expose:
- archetype IDs;
- raw design tokens;
- arbitrary font pickers;
- hex-code editing;
- border-radius controls;
- free-form spacing;
- CSS;
- layout grids;
- template galleries.

AI makes the initial creative choices. Direct controls refine within bounded options.

### 1.4 Core activation principle

> **Show the finished-looking outcome before asking the host to do setup work.**

The user should see a convincing public-site experience as early as possible.

The emotional sequence is:

```text
"I described it."
      ↓
"It understood me."
      ↓
"These are real options."
      ↓
"That one feels like us."
      ↓
"Wow — this is already our site."
      ↓
"I only need to make the information real."
```

Do not interrupt that sequence with a dashboard.

---

# 2. Modes of the product

The application has three distinct presentation modes.

## 2.1 Creation mode

**Purpose:** turn an AI-created event into the real event.

The event site itself is the primary workspace.

Creation mode contains:
- the actual production event renderer;
- subtle owner/co-host-only controls;
- contextual incomplete states;
- a lightweight setup-progress control;
- preview access;
- constrained design controls.

Creation mode must **not** look like a conventional SaaS admin dashboard.

### Creation-mode rule

> The user is editing their event, not configuring software.

## 2.2 Guest preview mode

**Purpose:** show exactly what a guest will see.

Preview mode:
- removes all collaborator-only controls;
- removes setup-progress UI;
- removes edit buttons;
- uses the production renderer;
- preserves actual event content;
- may show a small product-level "Exit preview" affordance outside the event canvas.

Do not create a separate fake preview renderer.

## 2.3 Management mode

**Purpose:** run the event after meaningful setup and especially after publishing.

Management mode may surface:
- invited count;
- attending;
- declined;
- awaiting response;
- guest list;
- messages;
- registry status;
- RSVP responses;
- event sharing;
- edit-site entry point.

Management mode is appropriate when operational data matters.

It is not the default creation experience.

---

# 3. Canonical UX principles

These are requirements.

## 3.1 No wizard unless order is genuinely required

Do not use:

```text
Step 1 → Next → Step 2 → Next → Step 3
```

for independent event setup tasks.

Event details, guests, RSVP, and registry may be completed in any order unless a specific business rule requires otherwise.

The setup checklist is **navigation and progress**, not a wizard.

## 3.2 No unnecessary "Next" buttons

Use:
- direct actions;
- auto-save;
- `Done` to close a focused editor;
- contextual navigation.

Use `Continue` only where there is a genuine sequential boundary, such as authentication or a transactional confirmation.

## 3.3 Preserve context

When an editor is opened from:
- Event Details;
- RSVP;
- Registry;
- Design;

closing it returns to the same event context.

Do not route:

```text
Event → Settings → RSVP → Save → Dashboard → Event
```

when the user could simply open RSVP setup from the RSVP section.

## 3.4 Show value before work

Do not front-load:
- guest import;
- registry setup;
- RSVP configuration;
- billing;
- account profile setup.

The user should first experience AI understanding and design output.

## 3.5 Use real data as soon as it exists

Concept previews and site reveal should use:
- real event title;
- real hosts;
- real date;
- real venue;
- real event copy;

whenever those values are known.

Use sample content only for information the user has not supplied.

Never fabricate realistic fake guests.

## 3.6 Sample content must feel temporary, not deceptive

Appropriate sample content:
- example registry destination cards;
- provisional welcome copy;
- sample RSVP treatment;
- visual placeholders demonstrating a section.

Avoid content that implies actual user data exists when it does not.

## 3.7 Auto-save by default

Routine creation-mode edits should save without a primary Save button.

Recommended behavior:
- text: debounce after brief idle and save on blur;
- toggles/selects: persist immediately;
- reorder: persist immediately after drop/action;
- structured editor: persist incrementally where safe;
- `Done`: closes the editor; it is not the persistence mechanism.

Display subtle state:
- `Saving…`
- `Saved`
- `Couldn't save — retry`

Do not show a success toast after every auto-save.

---

# 4. Canonical host journey

## 4.1 Landing / prompt

The landing page should make creation obvious within seconds.

Primary composition:

```text
brand / sign in

large outcome-oriented headline
short supporting line

┌──────────────────────────────────────┐
│ Describe the event you imagine...   │
│                                      │
│                                      │
│ + Add inspiration   Create my event │
└──────────────────────────────────────┘

Free to create · No templates · Publish when ready
```

### Requirements

- The composer is the visual and interaction focal point.
- Do not require account creation before the user writes their idea.
- Do not lead with a template carousel.
- Do not place a large feature matrix above the composer.
- Do not make the user choose an event theme before writing.
- Optional inspiration belongs directly with the prompt.
- The page may include supporting content below the fold, but it must not delay creation.

### Desktop

The desktop landing page is a real desktop layout:
- centered content;
- generous whitespace;
- composer approximately `640–800px` wide;
- no phone-frame simulation.

### Mobile

The composer should dominate the first viewport without feeling cramped.

---

## 4.2 Auth / save

Authentication occurs **after** the user has entered a creative idea but **before any strong-model generation begins**.

This is an intentional product and cost-control boundary:

> Anonymous users may compose an event idea and attach inspiration.  
> Strong-model generation begins only after the event draft is associated with an authenticated account.

Preferred framing:

> **Your idea is ready.**  
> Save it and we'll start creating.

### Draft persistence across auth

Losing the user's prompt or inspiration during authentication is a critical failure.

Before redirecting to OAuth/email auth, persist a short-lived event draft containing:
- the complete prompt text;
- any already-parsed lightweight event details;
- references to temporary private inspiration uploads;
- client state needed to restore the composer;
- a securely scoped draft token/identifier.

After auth:
- attach the draft to the authenticated user/event;
- restore the prompt exactly;
- restore all successfully uploaded inspiration;
- resume at generation without asking the user to re-enter anything.

Temporary pre-auth inspiration assets must remain private, have short expiry/cleanup rules, and must not become public site assets.

Authentication should be lightweight:
- Google;
- Apple;
- email.

Do not ask for profile setup here.

---

## 4.3 Generation + required details

Generation begins as early as practical.

The screen should communicate that AI is already working while the host supplies missing required information.

Preferred framing:

> **A few details while we create…**

Ask only genuinely missing functional details.

Show Event Identity output progressively where useful:
- creative direction;
- tone keywords;
- palette;
- concise interpretation.

Do not present AI reasoning or implementation details.

### Loading principle

> Generation should feel like visible progress, not a blocking spinner.

Avoid a blank progress screen.

---

## 4.4 Concept choice

Canonical heading:

> **Which feels like you?**

Show exactly three strong concept directions per round.

Each concept includes:
- live production-renderer preview;
- concept name;
- one-line description;
- clear `Choose this direction` action.

### Initial concept screen

Under all three concepts, provide:

> **None of these feel right?**  
> Tell us what to change and we'll create three fresh directions.

Action:

`Try another direction ✦`

Do not put the redesign action redundantly on every concept card.

### Desktop

Use a responsive three-column comparison when sufficient width exists.

The user should be able to compare the three directions without excessive scrolling.

### Mobile

Stack concepts vertically.

Preserve enough preview height for meaningful evaluation.


### Concept-render performance

On mobile, do not eagerly mount three full renderer trees if doing so creates measurable performance risk.

Required strategy:
- Concept 1 may mount immediately.
- Concepts 2 and 3 should lazy-mount as they approach the viewport (for example via `IntersectionObserver` or equivalent).
- Preserve card dimensions with lightweight placeholders to avoid layout shift.
- Once mounted, keep a concept stable while the user is evaluating it unless memory pressure requires otherwise.
- Desktop may mount all three simultaneously when performance measurements support it.

The product still uses the real production renderer; lazy mounting is an implementation optimization, not a screenshot fallback.


---

## 4.5 Site reveal

After a concept is chosen, transition into the full event site.

This is a deliberate activation moment.

Preferred copy:

> **Your event looks great.**  
> **Let's make it real.**

Then show the actual event site using:
- real content already known;
- clearly provisional content for missing sections.

Primary action:

`Make it yours →`

Secondary action:

`Try another direction ✦`

### Important

The user must be allowed to reconsider the creative direction **from the reveal itself**.

Do not force them into setup just because they selected a concept once.

---

## 4.6 Creation mode

After `Make it yours`, the same site becomes editable.

The collaborator sees subtle controls such as:

- `Edit`
- `Set up`
- `Add`

located near the content they affect.

Example:

```text
EVENT DETAILS                             Edit
December 19 · 1:00 PM
The Lodge at Hanson Park

RSVP                                      Set up
Kindly respond by December 1

REGISTRY                                  Add
Add your registries and gifts here
```

These controls never appear to guests.

### Owner toolbar

A restrained collaborator toolbar may contain:
- editing state;
- `Design`;
- `Preview`.

Do not add a large website-builder toolbar.

### Setup progress

A persistent lightweight control appears near the bottom.

The control must reflect **publish readiness**, not a fake count of all optional setup tasks.

Examples:

- `Finish setup`
- `2 required items left`
- `Ready to publish`

Do **not** show `2/4` if some of those four items are optional for publishing.

On mobile, it may float above the safe area.

On desktop, it may float at the bottom center or lower right as long as it does not obscure event content.

---

## 4.7 Setup checklist

The setup-progress control opens a lightweight checklist.

Split the checklist into two semantic groups.

### Needed to publish

Only show requirements that actually block `READY_TO_PUBLISH`, for example:

```text
✓ Event details
○ RSVP deadline
○ Visibility / access
```

The exact rows should be derived from the PRD's deterministic publish-readiness rules.

### Recommended before sharing

Show valuable but non-blocking setup:

```text
○ Guests
○ Registry
○ Co-host
```

Rules:
- no required order;
- each item opens its relevant surface directly;
- clearly distinguish blocking vs. optional;
- do not expose every optional setting;
- keep copy operational and short;
- once all blocking items are valid, the progress control may say `Ready to publish` even when recommended items remain incomplete.

The checklist may also surface:
- Preview;
- Publish.

The checklist is not a separate setup dashboard.

---

## 4.8 Contextual editors

### Mobile

Simple editors use bottom sheets or focused full-screen sheets depending on complexity.

Examples:
- event details → sheet/full-screen editor;
- RSVP settings → sheet/full-screen editor;
- registry add → sheet;
- design controls → sheet/full-screen panel.

### Desktop

Use:
- anchored panel;
- side sheet;
- modal;
- inline popover;

based on complexity.

Do not mechanically render a mobile bottom sheet at desktop width.

### Close behavior

Closing returns to the event site at the same approximate scroll position.

---

## 4.9 Guest management exception

Guest management is the primary creation task allowed to leave the event surface because:
- CSV import;
- household grouping;
- phone state;
- RSVP state;
- guest editing;

need more space.

It may use a dedicated full-screen workspace.

Requirements:
- a clear close/back action returns to creation mode;
- the event is not lost in navigation;
- on desktop, use the available width intelligently;
- on mobile, rows become stacked touch-friendly list items.

Do not attempt to embed a guest spreadsheet inside the public event page.

---

## 4.10 Design controls

The Design control opens **constrained direct editing**.

Allowed:
- curated palette variants;
- curated typography pairings;
- reset to concept defaults;
- `Try another direction ✦` before publish.

Do not expose:
- raw hex values;
- arbitrary font libraries;
- layout IDs;
- free-form motif editing;
- CSS;
- arbitrary spacing;
- arbitrary radius controls.

### Try another direction

From Design:

```text
Try another direction
       ↓
Optional creative-brief refinement
       ↓
3 fresh "Which feels like you?" concepts
       ↓
Choose one or keep current
```

---

## 4.11 Redesign prompt

Preferred framing:

> **What should we change?**

The prompt is optional.

The user may:
- add to the original vision;
- remove something;
- change direction substantially;
- add inspiration;
- leave feedback blank and request another exploration.

Explicit reassurance:

> **Your event content stays untouched.**

Design regeneration must not imply that guests, dates, RSVP data, registry data, or event copy will be lost.

---

## 4.12 Redesign concepts

Show three new concepts using the same canonical concept-choice pattern.

When a current design exists, offer:
- `Choose this direction`;
- `Keep current`.

If none feel right:
- `Refine the prompt again`.

Do not send the user back through initial onboarding.

---

## 4.13 Preview

Preview removes:
- edit affordances;
- setup progress;
- collaborator toolbar;
- incomplete-state management controls.

The underlying event renderer remains identical.

The only app-level controls should be:
- an obvious way to exit preview;
- on desktop/tablet, a compact device-width control for `Mobile` / `Desktop`.

Preview defaults to **Mobile** because the guest experience is primarily phone-consumed.

The device-width control belongs to Preview Mode only. It must not turn Creation Mode into a breakpoint simulator or website-builder toolbar.

---

## 4.14 Publish

Publishing is a meaningful transactional boundary.

Before publish:
- show readiness clearly;
- show the real `$49` price;
- avoid upsell clutter;
- explain that it is one-time.

Primary action:

`Publish my event`

Do not create pricing tiers in the MVP design.

---

## 4.15 Post-publish management home

After publishing, the center of gravity changes from **building** to **running**.

Management mode may prioritize:

```text
RSVP summary
Guest responses
Messages
Registry
Event sharing
Edit site
```

The visual style remains calm and consistent with the application.

Do not turn management mode into a generic analytics dashboard.

## 4.16 Co-host invitation acceptance

A co-host invitation is a small but complete application flow and uses app chrome, not the event theme.

If signed out:
1. show event name + inviter name;
2. explain that the user has been invited to collaborate;
3. authenticate;
4. preserve the invitation token across auth;
5. accept/join the event.

If already signed in:
- show event name;
- inviter;
- collaborator role summary;
- `Join event` primary action.

After acceptance:
- enter the appropriate event workspace;
- do not route through event creation;
- do not expose billing/ownership actions the co-host cannot use.

Expired/invalid invitations require a calm inline error state with a path to contact the inviter or return home.

---

# 5. Application visual language

## 5.1 Visual character

The host application should feel:
- premium but not luxury-brand theatrical;
- warm but not beige-on-beige;
- contemporary;
- calm;
- editorially restrained;
- polished enough that the generated event remains the most expressive object on screen.

Avoid:
- saturated SaaS gradients as default chrome;
- neon AI branding;
- excessive glassmorphism;
- strong shadows everywhere;
- decorative illustration in operational UI;
- playful blobs unrelated to event content;
- visual noise.

## 5.2 Brand tokens are provisional

The exact product name, logo, accent hue, and final brand typeface may change.

Therefore:
- behavior is stable;
- component hierarchy is stable;
- spacing/radius/motion systems are stable;
- semantic token names are stable;
- specific brand values may be swapped centrally.

Never encode brand colors directly in feature components.

## 5.3 Application appearance mode

The application chrome is **light-only for MVP**.

Do not implement:
- app dark mode;
- automatic system dark-mode theming;
- partial dark-mode variants.

Generated event sites may use `light`, `mid`, or `dark` tonal directions independently. A dark event design does not imply dark application chrome.

If application dark mode is added later, it requires a deliberate design-system revision rather than opportunistic per-component support.

---

# 6. Product UI tokens

These tokens apply to the **application UI**, not generated event themes.

All values below are Revision-1 defaults and must be represented as semantic variables.

## 6.1 Color tokens

```css
:root {
  --app-bg: #F6F5F1;
  --app-surface: #FFFFFF;
  --app-surface-subtle: #FBFAF7;
  --app-surface-muted: #EFEEE9;

  --app-text: #1D211E;
  --app-text-secondary: #666D68;
  --app-text-tertiary: #6B726D;

  --app-border: #E2E0D8;
  --app-border-strong: #CFCCC2;

  --app-action: #263A31;
  --app-action-hover: #1E3028;
  --app-action-text: #FFFFFF;

  --app-focus: #557765;

  --app-success: #35664E;
  --app-warning: #8A672C;
  --app-danger: #A0443C;

  --app-overlay: rgba(18, 22, 20, 0.36);
}
```

### Rules

- Feature code references semantic tokens, never raw hex.
- Do not create page-specific accent colors.
- Event-theme colors never replace app chrome colors.
- Status colors supplement text/icons; color alone never communicates state.

## 6.2 Typography

Default application family:

```text
Inter Variable / approved product sans / system sans fallback
```

If the implementation uses non-variable/static Inter files, use only available standard weights (for example 400/500/600/700) and map the type scale accordingly. Do not request synthetic `650` weight from a static font file.

Recommended stack:

```css
--font-app:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

The app should not use generated-event typography in navigation, editors, or admin controls.

### Application type scale

```text
display-lg   48 / 52   700   -0.04em
display-md   40 / 44   700   -0.035em
heading-xl   32 / 38   700   -0.03em
heading-lg   24 / 30   700   -0.025em
heading-md   20 / 26   650   -0.02em
body-lg      17 / 26   400
body-md      15 / 23   400
body-sm      13 / 19   400
label-md     13 / 17   600
label-sm     11 / 15   650
micro        10 / 14   650
```

Use responsive `clamp()` for large marketing headings.

Do not invent type sizes per screen.

## 6.3 Spacing

Canonical spacing scale:

```text
0
4
8
12
16
20
24
32
40
48
64
80
96
```

Semantic aliases:

```text
space-1  = 4
space-2  = 8
space-3  = 12
space-4  = 16
space-5  = 20
space-6  = 24
space-8  = 32
space-10 = 40
space-12 = 48
space-16 = 64
space-20 = 80
space-24 = 96
```

No arbitrary feature spacing such as `13px`, `27px`, or `61px`.

## 6.4 Radius

Canonical radii:

```text
radius-sm   8px
radius-md   12px
radius-lg   16px
radius-xl   20px
radius-2xl  24px
radius-pill 999px
```

Use:
- fields/buttons: `radius-md` or `radius-lg`;
- cards: `radius-lg`;
- large composer/sheets: `radius-xl` or `radius-2xl`;
- chips/pills: `radius-pill`.

Do not create per-screen custom radii.

## 6.5 Shadows

Use shadows sparingly.

```text
shadow-none
shadow-soft      subtle card lift
shadow-float     floating setup control / popover
shadow-overlay   modal / sheet
```

Recommended defaults:

```css
--shadow-soft: 0 8px 24px rgba(20, 28, 24, 0.06);
--shadow-float: 0 10px 32px rgba(20, 28, 24, 0.14);
--shadow-overlay: 0 24px 70px rgba(20, 28, 24, 0.18);
```

A card does not receive a shadow merely because it is a card.

Borders and whitespace should do most of the work.

## 6.6 Z-index

Use named layers:

```text
base          0
sticky        20
toolbar       30
popover       40
sheet         50
modal         60
toast         70
```

Do not use arbitrary `z-[9999]`.

---

# 7. Responsive system

## 7.1 Principle

> **Mobile-first does not mean phone-shaped desktop.**

Desktop is a first-class responsive rendering.

Core functionality is identical across form factors.

## 7.2 Breakpoints

Use the application's existing breakpoint system if already established. Otherwise:

```text
mobile:   < 640px
tablet:   640–1023px
desktop:  ≥ 1024px
wide:     ≥ 1440px
```

Breakpoints are for layout changes, not arbitrary style variation.

## 7.3 Mobile baseline

Design from approximately `390px`.

Also verify:
- `320px` minimum reasonable width;
- `360px`;
- `390px`;
- `430px`.

## 7.4 Desktop shell

Do not render the host application inside a decorative phone frame.

Desktop should:
- use available horizontal space;
- keep readable max-widths;
- preserve the same interaction hierarchy;
- use side panels where mobile uses sheets;
- use comparison grids where mobile stacks.

## 7.5 Content widths

Recommended app content widths:

```text
narrow form          560px
standard flow        720px
wide workspace       1120px
full operational     1280–1440px
```

Do not stretch text forms across the full viewport.

## 7.6 Touch and pointer parity

Anything available only through hover is incomplete.

On desktop:
- hover may reveal additional affordance emphasis;
- the action must remain discoverable via focus/click.

On mobile:
- touch targets must be at least `44 × 44px` where practical.

---

# 8. Motion system

Motion is part of the product quality bar.

It should feel:
- soft;
- fast;
- deliberate;
- calm;
- physically coherent.

Avoid:
- bouncy spring animation as the default;
- excessive parallax;
- continuous decorative motion;
- transitions that delay the user.

## 8.1 Motion tokens

```text
motion-instant  80ms
motion-fast     120ms
motion-base     180ms
motion-sheet    240ms
motion-reveal   420ms
motion-emphasis 600ms max
```

Preferred easing:

```css
--ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
--ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
--ease-exit: cubic-bezier(0.4, 0, 1, 1);
```

## 8.2 Standard transitions

Buttons/hover/focus:
- `120–180ms`.

Popover:
- fade + `4px` translate;
- `180ms`.

Mobile sheet:
- slide from bottom + overlay fade;
- `240ms`.

Desktop side panel:
- slide `12–20px` + fade;
- `240ms`.

Modal:
- fade + subtle `0.98 → 1` scale;
- `180–240ms`.

## 8.3 Concept → site reveal

This is the most important transition.

Recommended sequence:
1. selected concept subtly confirms;
2. surrounding concept UI fades;
3. production site expands/crossfades into full reveal;
4. reveal message appears shortly after the site becomes visually stable.

Total perceived transition should generally remain under `600ms`.

Do not show a long artificial "building your site" animation when the ResolvedDesignSpec already exists.

A brief transitional state is acceptable to create continuity, not to fake work.

## 8.4 "Let's make it real" transition

`Make it yours` should not navigate to a visually unrelated screen.

Preferred:
- owner toolbar fades/slides in;
- contextual edit controls appear;
- setup-progress control rises into place;
- underlying event site remains visually stationary.

This creates the feeling that the finished site has simply become editable.

## 8.5 Reduced motion

Honor `prefers-reduced-motion`.

With reduced motion:
- remove large translation/scale;
- retain short opacity changes where useful;
- no essential information may depend on animation.

---

# 9. Action hierarchy

## 9.1 Primary action

Use for the single strongest forward action.

Examples:
- `Create my event ✦`
- `Choose this direction`
- `Make it yours`
- `Publish my event`

Visual:
- solid dark action background;
- high contrast;
- full-width on narrow mobile flows where appropriate.

Only one dominant primary action should appear in a local decision area.

## 9.2 Secondary action

Examples:
- `Try another direction ✦`
- `Preview guest site`
- `Keep current`

Visual:
- outlined or quiet surface;
- equal clarity but less visual weight.

## 9.3 Contextual action

Examples:
- `Edit`
- `Set up`
- `Add`

Visual:
- compact;
- pill or text-button treatment;
- located adjacent to relevant content.

## 9.4 Utility action

Examples:
- `Preview`
- `Design`
- `Done`
- `Close`

Utility actions are understated.

## 9.5 Destructive action

Destructive styling is reserved for genuinely destructive actions:
- delete event;
- remove collaborator;
- irreversible data deletion.

Do not use red for routine cancel/close.

---

# 10. Core application components

Feature screens must use shared components.

## 10.1 `AppButton`

Allowed variants:

```text
primary
secondary
ghost
destructive
```

Allowed sizes:

```text
sm
md
lg
```

Do not add page-specific button variants.

## 10.2 `IconButton`

For:
- close;
- back;
- overflow;
- small utilities.

Requirements:
- accessible label;
- minimum interactive area;
- consistent icon size.

## 10.3 `Chip`

Use for:
- compact status;
- selected option;
- lightweight action;
- filters where truly needed.

Do not use chips as a replacement for every button.

## 10.4 `PromptComposer`

Canonical large AI input.

Contains:
- multiline text area;
- optional inspiration action;
- primary generation action;
- loading/disabled state;
- optional attachment summary.

It is a reusable product primitive, not a one-off landing-page implementation.

## 10.5 `Field`

Supports:
- text;
- textarea;
- select;
- date/time;
- structured control wrapper.

Rules:
- persistent visible label;
- optional helper;
- inline error;
- no floating-label pattern;
- minimum comfortable touch height.

## 10.6 `Sheet`

Mobile contextual editor.

Includes:
- title;
- optional supporting copy;
- close affordance;
- scrollable body;
- safe-area-aware bottom padding.

Do not nest multiple sheets unless unavoidable.

## 10.7 `SidePanel`

Desktop equivalent for medium-complexity contextual editing.

Preserves the event behind it.

## 10.8 `Dialog`

Use only when:
- attention must be blocked;
- confirmation is genuinely required;
- the action is narrow.

Do not use modal dialogs for routine editing.

## 10.9 `InlineStatus`

For:
- `Saving…`
- `Saved`
- recoverable save failure;
- import state;
- generation status.

## 10.10 `OwnerToolbar`

Creation-mode product chrome.

Contains only high-level controls:
- editing state;
- Design;
- Preview;
- possibly event menu.

It is not a page-builder toolbar.

## 10.11 `ContextEditAction`

Standardized collaborator-only affordance:
- `Edit`;
- `Set up`;
- `Add`.

It must work with:
- touch;
- keyboard;
- screen readers.

## 10.12 `SetupProgressPill`

Canonical floating creation-mode progress control.

Examples:

- `Finish setup`
- `2 required items left`
- `Ready to publish`

Never show a fraction that counts optional tasks as if they block publishing.

Requirements:
- persists while editing the event;
- avoids covering important content;
- safe-area aware;
- opens `SetupChecklist`.

## 10.13 `SetupChecklist`

Contains only the meaningful top-level setup tasks.

Each item has:
- state;
- label;
- concise supporting description;
- direct navigation.

No percent-complete gamification.

## 10.14 `ConceptCard`

Contains:
- live renderer preview;
- concept name;
- one-line interpretation;
- choose action;
- selected/current state when relevant.

Do not add star ratings or comparison scores.

## 10.15 `CreationCanvas`

Wraps the production event renderer with collaborator-only layers:
- toolbar;
- contextual edit affordances;
- setup progress.

Guest-facing markup and owner controls should remain cleanly separated.

## 10.16 `EmptyInlineState`

Used inside the event where unfinished content belongs.

Examples:

```text
Add your registry
Link registries, individual gifts, or a cash fund.
[ Add registry ]
```

This is preferred over redirecting the user to a generic settings page.

## 10.17 `OperationalList`

For mobile guest/message/registry management.

Supports:
- label;
- metadata;
- status;
- contextual action.

Desktop may enhance to a table when useful.

## 10.18 `PublishGate`

Canonical transaction surface:
- readiness;
- one-time price;
- included value;
- primary publish action.

Avoid marketing-card clutter.

## 10.19 `CollaboratorActionSlot`

Every renderable event section must expose a stable, theme-agnostic collaborator-action anchor for Creation Mode.

The renderer owns the section geometry. The application owns collaborator controls.

Contract:

```text
EventSection
  ├── guest-facing section content
  └── collaboratorActionAnchor
```

`CreationCanvas` attaches `Edit`, `Set up`, or `Add` controls to this anchor without requiring archetype-specific positioning logic.

Requirements:
- every section treatment implements the same semantic anchor;
- the anchor exists at mobile and desktop breakpoints;
- its placement may adapt with layout, but the application-facing contract does not change;
- collaborator controls remain app-styled and do not inherit event-theme typography or colors;
- guest rendering omits the anchor output entirely;
- the application must not inspect `heroArchetype` or section-treatment IDs to decide where to place edit controls.

This preserves the app/event boundary and prevents six archetypes from creating six editor implementations.

---

# 11. Forms and input behavior

## 11.1 Labels

Labels remain visible.

Placeholder text never replaces a label for important structured fields.

## 11.2 Validation

Show errors:
- next to the affected field;
- in plain language;
- after interaction or submit;
- without clearing user input.

## 11.3 Auto-save errors

If background save fails:
- keep the user's local value;
- mark the affected editor;
- offer retry;
- do not falsely display `Saved`.

## 11.4 Destructive confirmation

Require explicit confirmation when the user could lose meaningful data.

Routine navigation away from auto-saved forms should not trigger confirmation.

---

# 12. Loading and generation states

## 12.1 Never use blank loading screens for AI generation

Prefer:
- progressive Event Identity;
- follow-up questions;
- concept skeletons with useful copy;
- individual concepts appearing as soon as ready.

## 12.2 Concept streaming

Concept cards may appear independently.

Do not wait for all three if one is ready.

Maintain stable positions so the page does not jump.

## 12.3 Generation language

Use human product language:
- `Creating your event`
- `Exploring three directions`
- `Bringing your vision together`

Avoid technical language:
- `Calling model`
- `Parsing JSON`
- `Generating ResolvedDesignSpec`
- `Running inference`

---

# 13. Feedback and notifications

## 13.1 Toasts

Use sparingly.

Appropriate:
- copied event link;
- invitation code copied;
- background operation completed when no inline location exists.

Inappropriate:
- every auto-save;
- every toggle;
- every field edit.

## 13.2 Error feedback

Errors should be local whenever possible.

Global banners are reserved for:
- service-wide issue;
- generation failure affecting the whole flow;
- disconnected state;
- significant publish/payment failure.

---

# 14. Accessibility

Minimum standard: **WCAG 2.2 AA** for application UI and rendered guest experiences where technically applicable.

## 14.1 Contrast

Application:
- normal text: target `≥ 4.5:1`;
- large text: target `≥ 3:1`;
- interactive boundaries/focus indicators: target `≥ 3:1` against adjacent surface.

Generated event palettes use application-side contrast derivation.

## 14.2 Focus

Every interactive element must have a visible keyboard focus treatment.

Do not remove outlines without a replacement.

## 14.3 Keyboard

Required:
- tab through all app controls;
- activate concept cards/actions;
- operate sheets/dialogs;
- close overlays via Escape where appropriate;
- return focus to the originating control after closing;
- reorder functionality must have non-drag fallback if reorder is exposed.

## 14.4 Screen readers

Use semantic:
- headings;
- landmarks;
- buttons;
- form labels;
- status announcements.

AI generation progress should use restrained live-region updates, not constant noisy announcements.

## 14.5 Touch

Aim for at least `44 × 44px` interactive targets.

Compact visual controls may use larger invisible hit areas.

## 14.6 Color

Never rely on color alone for:
- completed/incomplete;
- RSVP state;
- error;
- selected concept;
- purchase state.

Use text/icon/shape reinforcement.

---

# 15. Generated event renderer system

The event renderer is expressive. The application shell is stable.

`docs/event-renderer-system.md` is the detailed renderer authority. This section defines the product-design boundary agents must preserve.

## 15.1 Hard boundary

**Application UI**
- stable;
- neutral/warm;
- light-only MVP;
- application typography/tokens;
- never recolored by event theme.

**Event renderer**
- dynamic;
- driven by persisted generated design data;
- uses event semantic tokens;
- supports light/mid/dark event designs independently of app appearance.

Event theme must never recolor:
- account/auth UI;
- collaborator toolbar;
- sheets/panels;
- billing;
- management UI.

## 15.2 Model/compiler/render contract

The strong model emits only:

```text
DesignIntent
  heroArchetype
  tonalDirection
  palette
  typographyPairing
  density
  motifs
```

The model does **not** emit:
- section treatments;
- guest-surface composition;
- visual treatment;
- ornamentation;
- borders;
- cards;
- buttons;
- motif placement;
- semantic text/background/button colors.

A versioned archetype bundle + deterministic compiler resolves those details into immutable `ResolvedDesignSpec`.

The event renderer consumes the resolved spec, not current archetype defaults.

Allowed event-level direct design overrides (palette/typography) apply deterministically on top and use the same compiler/compatibility rules.

## 15.3 Archetype bundle

Every archetype definition owns:
- hero/mobile/desktop composition;
- Event Details treatment;
- RSVP treatment;
- Registry treatment;
- guest-surface composition;
- visual treatment;
- ornamentation;
- border/card/button treatment;
- compatible typography pairings;
- motif slots.

The archetype is therefore a small internal design system, not merely a hero template.

## 15.4 Guest component system

Guest-facing components must be themed event components, not app components.

Required primitives include:
- EventButton;
- EventField;
- EventTextarea;
- EventCard;
- EventNotice;
- EventOTPInput;
- EventChoiceGroup;
- EventPartyCard;
- EventRegistryCard;
- EventGiftCard;
- EventConfirmation;
- EventAccessGate;
- EventFooter.

They consume semantic event tokens and resolved component treatments.

A beautiful hero followed by generic SaaS forms is a design-system failure.

## 15.5 Mobile convergence is allowed

At phone width, RSVP semantics should remain predictable:

```text
lookup
→ verification
→ party
→ questions
→ submit
→ confirmation
```

Archetypes may differ more substantially on desktop composition.

On mobile, visual distinction may come primarily from:
- typography;
- framing;
- borders/cards/buttons;
- section surfaces;
- motifs;
- density;
- hierarchy.

Do not force alternate information architecture simply to make screenshots look different.

## 15.6 Semantic color requirement

Renderer components never consume raw creative palette roles directly.

Raw palette + tonal direction compile into:
- event/hero/surface backgrounds;
- text/textMuted;
- accent/accentText;
- button/buttonText;
- border/focus;
- error/errorText.

Required contrast must be valid by construction.

## 15.7 Motif requirement

Motifs declare supported roles and color/opacity behavior.

Archetypes expose semantic slots such as:
- field;
- frame;
- band;
- divider;
- accent.

Code assigns motif→slot deterministically. Unplaceable motifs are logged, not silently ignored.

## 15.8 Generated design immutability

Persist per concept:
- DesignIntent;
- archetype version;
- ResolvedDesignSpec.

Do not silently recompile a historical concept against newer defaults.

Renderer code may receive bug/accessibility/responsive fixes.

## 15.9 Registry product thumbnails

Product thumbnails are content imagery, not decorative event imagery.

Use normalized platform assets or themed placeholders. Never retailer-hotlink.

## 15.10 Event footer

Every published/previewed guest site includes the tasteful `Made with …` attribution required by the PRD.

It inherits event styling but remains low-emphasis and non-editable in MVP.

## 15.11 No decorative site imagery in MVP

No:
- hero/event photo uploads;
- venue/maternity galleries;
- stock photography;
- AI-generated decorative imagery;
- crop/position tools.

Design power comes from composition, type, palette, motif, texture, pattern, border, and spacing.

---

# 16. Concept diversity presentation

The UI presents three concepts as peers.

Do not:
- label one best;
- preselect one;
- show AI confidence;
- rank 1–3.

The backend diversity order is:
1. archetype/composition;
2. tone when the brief permits;
3. typography category;
4. motif behavior;
5. density;
6. palette dominance within constraints.

If the brief constrains all concepts to one tone, that is not a failure. The remaining levers must carry separation.

The visual renderer tests—not prose—determine whether this architecture is expressive enough.

---
# 17. Incomplete states inside creation mode

Incomplete content should often appear **where the final content will live**.

## RSVP example

Before setup:

```text
RSVP

Set up how guests will respond.

[ Set up RSVP ]
```

After setup:

```text
RSVP

Kindly respond by December 1.

[ Find your invitation ]
```

## Registry example

Before setup:

```text
Registry

Add your registries and gifts here.

[ Add registry ]
[ Add individual gift ]
[ Add cash fund ]
```

After setup:

```text
Registry

Amazon Baby Registry
[ Shop registry ]

Babylist
[ Shop registry ]
```

This transformation is part of the product's sense of progress.

---

# 18. Creation-mode control styling

Collaborator controls must be visible enough to discover but quiet enough that the site still looks finished.

Use:
- small neutral pills;
- subtle surface;
- app typography;
- app colors;
- light border;
- modest elevation only if needed.

Do not style collaborator controls using the event theme.

This distinction helps the host understand:
- "this is an editor control";
- "this is part of my event."

---

# 19. Desktop-specific guidance

Desktop must feel intentional.

## 19.1 Landing

- centered prompt composer;
- wider supporting copy;
- no mobile device frame.

## 19.2 Concepts

Prefer three concepts side-by-side at wide desktop widths.

Each preview may retain a mobile-preview aspect inside the card because the guest experience is strongly mobile-first, but the **surrounding application** is desktop native.

## 19.3 Creation mode

The event renderer fills an appropriate responsive canvas.

Collaborator controls may:
- hover at section edges;
- use a slim top toolbar;
- open right-side panels.

Do not constrain the entire event to `390px` on desktop.

## 19.4 Guest management

Use desktop workspace efficiently:
- table/list hybrid;
- columns when useful;
- responsive detail pane if implementation remains simple.

Do not render a giant stretched mobile list if desktop could materially improve usability.

---

# 20. Mobile-specific guidance

Mobile is the baseline and must support the entire product.

## 20.1 Sticky controls

Use safe-area-aware sticky/floating controls.

The setup pill must not cover:
- primary event CTA;
- focused fields;
- browser UI.

## 20.2 Sheets

Mobile editors should feel continuous with the source content.

Sheet titles are concise.

Avoid multi-level nested settings navigation.

## 20.3 Keyboard behavior

When the software keyboard appears:
- focused field remains visible;
- fixed controls should not overlap input;
- sheets resize/scroll appropriately.

---

# 21. Copy system

Product copy should be:
- clear;
- concise;
- warm;
- confident;
- non-technical.

Avoid overly cute baby-specific language in product chrome.

The event design/copy may be more thematic.

## 21.1 Preferred wording

Use:

- `Create my event`
- `Which feels like you?`
- `Choose this direction`
- `Try another direction`
- `Your event looks great. Let's make it real.`
- `Make it yours`
- `Finish setup`
- `Preview`
- `Publish my event`

Avoid:

- `Initialize project`
- `Configure`
- `Proceed`
- `Next step`
- `Design configuration`
- `Theme schema`
- `Generate website`

---

# 22. State naming in the UI

Internal lifecycle terms do not need to appear verbatim.

Examples:

Internal:
`READY_TO_PUBLISH`

User-facing:
`Ready to publish`

Internal:
`DESIGN_SELECTED`

User-facing:
no label required unless useful.

Internal:
`GenerationRun`

User-facing:
never expose.

---

# 23. Strict implementation governance

This section is mandatory for coding agents.

## 23.1 Shared components first

Before creating a new visual primitive, the implementing agent must:

1. search the existing shared UI components;
2. search this design-system spec;
3. reuse or extend an existing canonical component when possible.

Do not create local duplicate variants.

## 23.2 No raw visual values in feature UI

Feature-level product UI must not contain:
- raw hex colors;
- arbitrary shadows;
- arbitrary border radii;
- arbitrary spacing;
- arbitrary font sizes;
- arbitrary z-index values.

Use tokens.

Exceptions:
- generated renderer dynamic values emitted through its compiler/token layer;
- one-off mathematical/positioning values that are not design choices and are documented.

## 23.3 Tailwind rule

If Tailwind is used:

Avoid arbitrary visual classes such as:

```text
text-[#24382e]
rounded-[17px]
shadow-[...]
mt-[13px]
text-[15px]
z-[9999]
```

Use design-system utilities/tokens.

Dynamic event-theme colors should flow through CSS custom properties, not arbitrary Tailwind color classes.

## 23.4 Primitive library rule

If shadcn/Radix or another primitive library is used:

- primitives are implementation dependencies;
- canonical product components wrap them;
- feature screens import the canonical product component;
- feature screens do not fork primitive styling independently.

Example:

```text
Radix Dialog
   ↓
AppDialog
   ↓
Feature screen
```

Not:

```text
Feature A custom Radix styling
Feature B different Radix styling
Feature C third styling
```

## 23.5 New component rule

A new reusable design-system component requires:

- documented purpose;
- supported variants;
- accessibility states;
- mobile behavior;
- desktop behavior;
- loading/error/disabled states where relevant;
- visual regression coverage.

Do not add variants "just in case."

## 23.6 New token rule

A new visual token requires a reason that cannot be represented by an existing semantic token.

Do not grow the scale because one screen "looks slightly better" with a new number.

## 23.7 App/event boundary lint

The implementation should make it difficult to accidentally import event-theme styling into app chrome.

Recommended separation:

```text
components/app/*
components/event-renderer/*
styles/app-tokens.css
styles/event-tokens.css
```

Equivalent structure is acceptable.

The architectural boundary is not optional.

---

# 24. Quality gates

## 24.1 Required viewport checks

For major flows:

```text
390px mobile
768px tablet
1280px desktop
1440px+ desktop spot check
```

Also spot-check narrow `320–360px` for overflow.

## 24.2 Visual regression

At minimum, screenshot-test:

Application:
- landing composer;
- concept choice;
- reveal;
- creation mode;
- setup checklist;
- design panel;
- guest management;
- preview;
- publish.

Renderer:
- all hero archetypes × supported tones;
- every section treatment;
- representative motif combinations;
- density variants;
- mobile and desktop.

Mobile renderer remains the primary regression gate, but desktop regressions are also blocking when they materially break layout.

## 24.3 Interaction regression

Automated E2E should cover:

```text
prompt
→ auth/save
→ generation details
→ concepts
→ choose
→ reveal
→ make it yours
→ contextual setup
→ preview
→ publish gate
```

And redesign:

```text
concept screen / reveal / design
→ try another direction
→ optional prompt edit
→ 3 fresh concepts
→ choose or keep current
```

## 24.4 Accessibility regression

CI should include automated accessibility checks where practical.

Critical flows must also receive keyboard/manual review.

---

# 25. Canonical reference screens

These are the reference patterns agents should compare new work against.

## 25.1 Landing composer
Defines:
- low barrier to entry;
- prompt-first hierarchy;
- AI composer treatment.

## 25.2 "Which feels like you?"
Defines:
- concept comparison;
- three-choice hierarchy;
- redesign escape hatch.

## 25.3 Site reveal
Defines:
- activation moment;
- full product value before setup;
- Make it yours / Try another direction hierarchy.

## 25.4 Creation mode
Defines:
- event-as-workspace;
- contextual editing;
- product-vs-event visual boundary.

## 25.5 Finish setup
Defines:
- non-wizard progress;
- lightweight navigation;
- completion states.

## 25.6 Design
Defines:
- constrained manual design controls;
- pre-publish redesign entry.

## 25.7 Redesign prompt
Defines:
- AI refinement;
- optional feedback;
- content-preservation reassurance.

## 25.8 Guest management
Defines:
- justified full-screen operational workspace.

## 25.9 Guest preview
Defines:
- exact guest rendering;
- removal of collaborator chrome.

## 25.10 Publish
Defines:
- clear transactional gate;
- one-time price;
- no tier clutter.

## 25.11 Co-host invitation acceptance
Defines:
- invitation preservation across auth;
- role framing;
- join-event behavior;
- invalid/expired invitation handling.

The latest approved clickable prototype is a **behavioral reference**, not a pixel-perfect visual specification.

Canonical repository path:

`docs/prototypes/creation-flow.html`

Agents must not depend on a chat attachment or local temporary filename. The approved prototype should be checked into the repository at that path.

This design-system document supersedes prototype-specific CSS values.

---

# 26. Anti-patterns

Do not ship these.

## 26.1 Wizard setup

```text
Event details → Next
Guests → Next
RSVP → Next
Registry → Next
```

Wrong unless a future workflow genuinely requires strict sequence.

## 26.2 Dashboard immediately after concept selection

Wrong:

```text
choose concept
→ generic admin dashboard
→ configure site
```

Correct:

```text
choose concept
→ full site reveal
→ edit the site itself
```

## 26.3 Builder chrome

Do not add:
- left component palette;
- drag handles everywhere;
- layers panel;
- canvas zoom;
- breakpoint toolbar;
- arbitrary block insertion;
- CSS controls.

## 26.4 Theme settings explosion

Do not expose separate controls for:
- button radius;
- card radius;
- shadow amount;
- heading scale;
- motif position;
- line-height;
- padding.

These are renderer decisions.

## 26.5 Page-specific visual invention

Do not create:
- a new button treatment for registry;
- a new card system for RSVP;
- a new modal look for guests;
- a special border radius for billing.

Use the system.

## 26.6 Fake activity

Do not add artificial multi-second loading to make AI feel sophisticated.

## 26.7 Event-theme leakage

Do not recolor app chrome based on the event.

---

# 27. Design-system maintenance

## 27.1 When to update this document

Update when the team deliberately changes:
- canonical interaction pattern;
- token scale;
- component variant;
- responsive rule;
- renderer archetype/treatment;
- motion rule;
- accessibility rule.

Do not update it to rationalize an accidental one-off implementation.

## 27.2 Version discipline

Meaningful behavior changes should note:
- old behavior;
- new behavior;
- rationale;
- affected components/screens.

## 27.3 Product-review rule

If a proposed UI requires violating a principle in this document, stop and ask whether:
1. the UI is wrong, or
2. the design-system rule truly needs to change.

Do not silently make an exception.

---

# 28. Implementation checklist for every new screen

Before merge, verify:

### Product behavior
- [ ] Does the screen keep the user close to the object/task they care about?
- [ ] If authentication redirects occur, is all high-intent draft state preserved exactly?
- [ ] Did we avoid unnecessary configuration?
- [ ] Did we avoid a wizard if task order is independent?
- [ ] Is AI reducing choices rather than exposing more controls?
- [ ] Are real event values used wherever known?

### Components
- [ ] Shared components reused.
- [ ] No duplicate button/card/dialog patterns.
- [ ] No undocumented variant added.

### Tokens
- [ ] No raw product-UI colors.
- [ ] No arbitrary spacing/radius/shadow/font-size.
- [ ] Named z-index layer used.

### Responsive
- [ ] Works at ~390px.
- [ ] Works as a real desktop layout.
- [ ] Desktop is not a phone canvas.
- [ ] Preview supports Mobile/Desktop width selection on larger screens.
- [ ] No hover-only functionality.

### Motion
- [ ] Transition uses motion tokens.
- [ ] Motion is brief and purposeful.
- [ ] Reduced-motion behavior works.

### Accessibility
- [ ] Visible focus.
- [ ] Keyboard flow works.
- [ ] Labels are explicit.
- [ ] Contrast passes.
- [ ] Touch targets are adequate.
- [ ] Color is not the sole state cue.

### Event renderer
- [ ] App chrome does not inherit event styling.
- [ ] Production renderer reused for preview.
- [ ] No arbitrary AI HTML/CSS.
- [ ] No decorative event-photo feature introduced.

---

# 29. North-star design test

When evaluating any screen, ask:

> **Does this feel like the product already did most of the work for me?**

A successful creation experience makes the host feel:

> **"It already made my event. I'm just making it real."**

A successful interface keeps attention on:
- the event;
- the guests;
- the celebration;

not on software configuration.

The application should disappear behind the outcome.

---

# 30. One-line implementation rule

> **Stable, quiet application chrome. Expressive generated events. Contextual editing. No setup wizard. Strict shared components and tokens.**
