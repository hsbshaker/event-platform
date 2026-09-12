# Event Renderer System — Skeleton
## Step 2A: enum contract before visual proof

**Status:** Experimental renderer contract — do not treat as final until the gallery test passes.  
**Companion artifacts:** `event-renderer-gallery.html`, `renderer-test-specs.json`  
**Purpose:** Define the finite renderer vocabulary required to build the first real visual test. The gallery is the evidence. This document will be completed only after the visual system survives the stress test.

---

## 0. The test can fail

The renderer thesis is **not** assumed to be correct.

A concept pair is materially different only when at least **3 of these 5 structural axes** differ independently of palette:

1. **Hero composition**
2. **Typography hierarchy**
3. **Section rhythm**
4. **Motif behavior**
5. **Component treatment**

Hard failure conditions:

- **Palette-control failure:** if Concept B is not clearly more different from Concept A than `Control = Concept A + Concept B palette`, fail.
- **Grayscale failure:** if A/B/C collapse into essentially the same site with color removed, fail.
- **Guest-surface failure:** if the hero looks differentiated but RSVP / access / registry surfaces collapse into generic white app forms, fail.
- **Responsive failure:** if differentiation exists at 390px but disappears at 1280px, or vice versa, fail.

Do not rationalize a failed test. Change or delete weak primitives.

---

# 1. DesignSpec v0.1

Every field except `name`, `description`, and palette values is an enum defined in code.

```ts
type DesignSpec = {
  name: string
  description: string

  heroArchetype:
    | "editorial_split"
    | "centered_statement"
    | "full_bleed_visual"
    | "framed_invitation"
    | "typography_first"
    | "layered_editorial"

  eventDetailsTreatment:
    | "structured_cards"
    | "stacked_editorial"
    | "split_panel"

  rsvpTreatment:
    | "standalone_cta_panel"
    | "embedded_card"
    | "contrast_panel"

  registryTreatment:
    | "retailer_tiles"
    | "card_grid"
    | "featured_blocks"

  tonalDirection:
    | "light"
    | "mid"
    | "dark"

  palette: {
    primary: string
    secondary: string
    accent: string
    surface: string
    text?: string
  }

  typographyPairing:
    | "heritage_serif_clean_sans"
    | "high_contrast_editorial_sans"
    | "warm_oldstyle_humanist_sans"
    | "modern_grotesk_serif_accent"
    | "soft_serif_grotesk"
    | "refined_transitional_sans"

  density:
    | "compact"
    | "balanced"
    | "spacious"

  visualTreatment:
    | "motif_panel"
    | "border_frame"
    | "texture_field"
    | "pattern_band"
    | "typographic_field"
    | "layered_cards"

  motifs: Array<
    | "plaid_restrained"
    | "gingham"
    | "botanical_line"
    | "stripe_classic"
    | "deco_border"
    | "linen_texture"
    | "equestrian_line"
    | "scallop_subtle"
    | "star_celestial"
    | "ribbon_line"
  >

  ornamentation:
    | "none"
    | "restrained"
    | "decorative"

  borderTreatment:
    | "none"
    | "hairline"
    | "double_rule"
    | "inset_frame"
    | "accented_edge"

  cardTreatment:
    | "flat"
    | "flat_bordered"
    | "tinted"
    | "elevated"
    | "outline_only"

  buttonTreatment:
    | "solid_square"
    | "solid_rounded_sm"
    | "solid_pill"
    | "outline_square"
    | "outline_rounded_sm"
    | "text_link"
}
```

---

# 2. Hero archetypes — one-line intent only

These are intentionally skeletal until visual testing.

| ID | Intent |
| --- | --- |
| `editorial_split` | Asymmetric editorial hero with type/details on one side and motif/texture field on the other. |
| `centered_statement` | Formal centered composition driven by a strong title and a contained ornamental field. |
| `full_bleed_visual` | Full-surface pattern/texture/gradient field with event information floating over it. |
| `framed_invitation` | Page behaves like a refined physical invitation: framed, bordered, symmetrical, tactile. |
| `typography_first` | Minimal composition where scale, alignment, whitespace, and type hierarchy do most of the design work. |
| `layered_editorial` | Overlapping content planes, offset framing, and editorial layering create depth without photography. |

### First gallery implementation

Build only the three most structurally distinct candidates first:

- `editorial_split`
- `framed_invitation`
- `typography_first`

The remaining three are vocabulary reservations until the first stress test passes.

---

# 3. Section-treatment intent

## Event details

| ID | Intent |
| --- | --- |
| `structured_cards` | Time/place/details broken into repeated structured units. |
| `stacked_editorial` | Large type-led stacked details with minimal boxes. |
| `split_panel` | Details divided across contrasting columns/panels. |

## RSVP

| ID | Intent |
| --- | --- |
| `standalone_cta_panel` | RSVP is a distinct invitation-like section with a clear call to action. |
| `embedded_card` | RSVP form sits inside a contained card integrated into surrounding content. |
| `contrast_panel` | RSVP occupies a strong contrasting visual field. |

## Registry

| ID | Intent |
| --- | --- |
| `retailer_tiles` | External destinations read as a clean tiled set. |
| `card_grid` | Native gifts and destinations share a consistent grid language. |
| `featured_blocks` | Registry destinations/gifts are presented as larger editorial feature blocks. |

---

# 4. Typography pairings — candidate IDs for visual test

These are **candidate** pairings for the renderer test. Final production fonts/licensing are Step 3 work.

| ID | Visual role |
| --- | --- |
| `heritage_serif_clean_sans` | Old-world serif display + quiet modern sans body. |
| `high_contrast_editorial_sans` | High-contrast fashion/editorial serif + neutral sans. |
| `warm_oldstyle_humanist_sans` | Warm bookish serif + humanist sans. |
| `modern_grotesk_serif_accent` | Grotesk-led hierarchy with restrained serif accents. |
| `soft_serif_grotesk` | Softer serif display with contemporary grotesk body. |
| `refined_transitional_sans` | Transitional serif with restrained utility sans. |

The gallery uses local/system-safe approximations so the artifact is self-contained. Final font files are not embedded in the artifact.

---

# 5. Motif vocabulary — IDs only for Step 2A

| ID | Initial behavior hypothesis |
| --- | --- |
| `plaid_restrained` | Repeating two-channel line tile; semantic palette recoloring. |
| `gingham` | Soft repeated check; primarily field/background use. |
| `botanical_line` | Single-color line-art repeat/edge ornament. |
| `stripe_classic` | Repeating stripe field/band. |
| `deco_border` | Edge/frame ornament, not a full field. |
| `linen_texture` | Low-contrast procedural texture field. |
| `equestrian_line` | Sparse line iconography/ornament; accent use only. |
| `scallop_subtle` | Repeating edge shape/border. |
| `star_celestial` | Sparse repeated celestial marks. |
| `ribbon_line` | Flowing linear ornament for framing/dividers. |

**Step 3 will define actual SVG/CSS assets, semantic color channels, tile sizes, opacity bounds, and compatibility after the gallery proves which behaviors are useful.**

---

# 6. Event-side themed component contract

These components consume **event renderer tokens**, never application tokens.

```text
EventButton
EventField
EventTextarea
EventCard
EventNotice
EventSheet
EventOTPInput
EventChoiceGroup
EventPartyCard
EventRegistryCard
EventGiftCard
EventConfirmation
EventAccessGate
EventFooter
EventSectionFrame
```

Minimum contract:

- all support light/mid/dark derived contrast;
- no generic white form surface unless the DesignSpec intentionally produces one;
- typography comes from the active event pairing;
- borders/cards/buttons come from the active DesignSpec treatments;
- focus states are derived from event tokens and remain WCAG-visible;
- error states remain event-themed but use semantically safe error contrast;
- components render coherently in all section treatments;
- no component imports app-chrome styling.

---

# 7. Required guest surfaces for visual proof

The gallery must render the following under each DesignSpec:

```text
Hero
Event Details
Private-event access gate
Name lookup
Name-collision / disambiguation state
OTP entry
Party-member attendance selection
Custom question
RSVP validation error
RSVP confirmation
External registry destination
Native gift card with placeholder thumbnail
"Did you buy this gift?" return prompt
Made-with footer
Passed-event state
```

The gallery may show these as one long test scroll. It is a renderer lab, not a literal guest journey.

---

# 8. Stress-test brief #1 — constrained heritage

All concepts must respect the same brief:

> Ralph Lauren-inspired baby shower for a baby boy. Elevated, warm, preppy, refined, lodge-like. Navy, cream, and forest green are explicit constraints. Subtle equestrian influence. Plaid is allowed but should not feel cheesy or costume-like.

Purpose:
- color cannot do the differentiation work;
- structure, type, motif behavior, section rhythm, and component treatment must carry distinctness.

Required panels:

```text
A — editorial_split
B — framed_invitation
C — typography_first
CONTROL — A's entire spec with only B's palette
```

---

# 9. Stress-test brief #2 — tone constrained

After the heritage test passes, run:

> Light, airy, soft, elegant baby shower. Refined but gentle. Warm whites, pale neutrals, soft botanical influence. No dark concept.

All three concepts use:

```text
tonalDirection = light
```

Purpose:
- prove the system can remain distinct even when tonal direction also cannot vary.

Not implemented in the first gallery build unless Step 2B heritage test passes.

---

# 10. Step 2B output criteria

The first gallery is successful only if:

- [ ] A/B/C are recognizably different at 390px.
- [ ] A/B/C are recognizably different at 1280px.
- [ ] A/B/C remain recognizably different in grayscale.
- [ ] B is clearly more different from A than the palette-control panel is.
- [ ] RSVP/access/registry surfaces inherit the concept rather than collapsing into generic app UI.
- [ ] the renderer consumes actual DesignSpec JSON.
- [ ] the same content data is used for every panel.
- [ ] no screenshot or generated-image shortcut is used.

If these fail, change the primitives before writing the final renderer specification.
