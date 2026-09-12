# Event Renderer System
## Revision 1 — architecture baseline after visual pressure test

**Path:** `docs/event-renderer-system.md`  
**Status:** Authoritative renderer architecture; visual library remains gated by the test plan below.  
**PRD:** `spec.md` Revision 5  
**Application design system:** `docs/design-system.md`

---

# 0. What this document is

This document defines the generated guest-site renderer: the contract between AI creative intent, versioned archetype bundles, deterministic compilation, persisted resolved design, and production components.

It deliberately does **not** treat the first renderer gallery as proof of the final architecture.

The first visual experiment proved:
- three bundled compositions could look unmistakably different at 390 and 1280;
- they remained different in grayscale;
- a palette-only control was materially less different than an archetype change;
- themed guest component skins carried visual identity.

It did **not** prove the original orthogonal fourteen-dimension model, because most dimensions were hard-coded inside archetype CSS.

Revision 1 therefore formalizes the architecture the evidence actually supports: **bundled archetypes + six-field intent + deterministic compiler**.

Do not implement the remaining three archetypes until the compiler refactor and Brief 2 tests pass.

---

# 1. Renderer invariants

1. Model output is creative intent, not executable layout.
2. `DesignIntent` has exactly six creative fields.
3. Model cannot emit renderer treatment overrides.
4. Archetype is a versioned bundle of composition and component defaults.
5. Motif placement is deterministic and role-based.
6. Raw palette values never directly become text/background/button semantics.
7. Accessibility contrast is created by compiler, not discovered in screenshots.
8. Persist DesignIntent + archetype version + ResolvedDesignSpec.
9. Render concept base from ResolvedDesignSpec only.
10. Generated design data is immutable; renderer code may be fixed.
11. Guest semantic flow remains stable even when visual composition changes.
12. Mobile guest layout convergence is acceptable.
13. Visual tests must be able to fail the system.

---

# 2. DesignIntent

Model contract:

```ts
type HeroArchetype =
  | "editorial_split"
  | "centered_statement"
  | "full_bleed_visual"
  | "framed_invitation"
  | "typography_first"
  | "layered_editorial"

type TonalDirection = "light" | "mid" | "dark"
type Density = "compact" | "balanced" | "spacious"

type DesignIntent = {
  heroArchetype: HeroArchetype
  tonalDirection: TonalDirection

  palette: {
    colors: string[]    // 3–5 valid #RRGGBB colors
    dominant: string    // must exactly match one member of colors[]
  }

  typographyPairing: TypographyPairingId
  density: Density
  motifs: MotifId[]
}
```

No `overrides` field exists in MVP.

Schema validation:
- reject structurally invalid JSON;
- validate enum IDs;
- validate 3–5 unique colors;
- validate hex format;
- require dominant member of `colors`;
- dedupe motif IDs while preserving order;
- cap motif request count to a small renderer-defined maximum.

Unknown/repairable enum values should use deterministic repair only where a safe default exists. Structurally unusable output may receive one model retry.

---

# 3. ArchetypeDefinition

An archetype is not a hero template. It is an internal design system bundle.

```ts
type ArchetypeDefinition = {
  id: HeroArchetype
  version: number

  defaults: {
    eventDetailsTreatment: EventDetailsTreatment
    rsvpTreatment: RsvpTreatment
    registryTreatment: RegistryTreatment
    guestSurfaceComposition: GuestSurfaceComposition

    visualTreatment: VisualTreatment
    ornamentation: Ornamentation
    borderTreatment: BorderTreatment
    cardTreatment: CardTreatment
    buttonTreatment: ButtonTreatment
  }

  compatibleTypographyPairings: TypographyPairingId[]

  motifSlots: Array<{
    id: string
    role: MotifRole
    maxUses: 1 | 2
    priority: number
  }>
}
```

MVP deliberately does **not** add compatibility lists for every treatment because treatments are not user/model overrides.

If a future feature allows treatment overrides, add only the compatibility data required by that feature.

---

# 4. Archetype vocabulary and implementation gates

Reserved IDs:

| ID | Intent | Current gate |
| --- | --- | --- |
| `editorial_split` | Asymmetric editorial composition, split/panel rhythm | First validation set |
| `framed_invitation` | Symmetrical physical-invitation framing | First validation set |
| `typography_first` | Type/scale/alignment/whitespace dominate | First validation set |
| `centered_statement` | Centered statement with ornamental field | Reserved; do not implement before gate |
| `full_bleed_visual` | Full pattern/texture/gradient field | Reserved; do not implement before gate |
| `layered_editorial` | Overlapping planes/cards, editorial depth | Reserved; do not implement before gate |

The first three earned further work because they passed the original visual-distinctness test.

They have **not yet earned final approval under the new compiler**.

---

# 5. Renderer-owned treatment enums

These are resolved values, not model fields.

```ts
type EventDetailsTreatment =
  | "structured_cards"
  | "stacked_editorial"
  | "split_panel"

type RsvpTreatment =
  | "standalone_cta_panel"
  | "embedded_card"
  | "contrast_panel"

type RegistryTreatment =
  | "retailer_tiles"
  | "card_grid"
  | "featured_blocks"

type GuestSurfaceComposition =
  | "editorial_split_flow"
  | "framed_centered_flow"
  | "typographic_stack_flow"
  | "centered_flow"
  | "full_bleed_flow"
  | "layered_flow"

type VisualTreatment =
  | "motif_panel"
  | "border_frame"
  | "texture_field"
  | "pattern_band"
  | "typographic_field"
  | "layered_cards"

type Ornamentation =
  | "none"
  | "restrained"
  | "decorative"

type BorderTreatment =
  | "none"
  | "hairline"
  | "double_rule"
  | "inset_frame"
  | "accented_edge"

type CardTreatment =
  | "flat"
  | "flat_bordered"
  | "tinted"
  | "elevated"
  | "outline_only"

type ButtonTreatment =
  | "solid_square"
  | "solid_rounded_sm"
  | "solid_pill"
  | "outline_square"
  | "outline_rounded_sm"
  | "text_link"
```

Not every enum value must be used by every archetype.

Do not expose these in host UI.

---

# 6. Typography definitions

A typography pairing is a curated production asset/config entry:

```ts
type TypographyPairingDefinition = {
  id: TypographyPairingId
  category:
    | "heritage"
    | "high_contrast_editorial"
    | "oldstyle"
    | "grotesk_led"
    | "soft_serif"
    | "transitional"

  displayFamily
  bodyFamily
  fallbacks[]
  supportedWeights[]
  supportedCharacterSets[]
  displayTrackingRange
  bodyTrackingRange
  scaleAdjustments
}
```

Rules:
- pairing IDs only; never raw model font-family strings;
- licensing must be verified before production use;
- bundle declares compatible pairings;
- diversity planner prefers distinct categories across the three concepts when compatible;
- incompatible pairing is repaired deterministically and logged.

The first self-contained gallery used system-font approximations. Those are not the final licensed pairings.

---

# 7. Motif system

## 7.1 Roles

```ts
type MotifRole =
  | "field"
  | "frame"
  | "band"
  | "divider"
  | "accent"
```

## 7.2 Definition

```ts
type MotifDefinition = {
  id: MotifId

  assetType: "svg" | "css_pattern"
  supportedRoles: MotifRole[]

  colorChannels: Array<{
    channelId: string
    semanticToken:
      | "text"
      | "textMuted"
      | "accent"
      | "border"
      | "surfaceAlt"
    minOpacity: number
    maxOpacity: number
  }>

  maxPlacements: 1 | 2
}
```

Initial IDs:
- `plaid_restrained`
- `gingham`
- `botanical_line`
- `stripe_classic`
- `deco_border`
- `linen_texture`
- `equestrian_line`
- `scallop_subtle`
- `star_celestial`
- `ribbon_line`

## 7.3 Assignment

Compiler algorithm:
1. validate motif ID;
2. iterate requested motifs in stable order;
3. read motif supported roles;
4. find highest-priority unfilled compatible slot in archetype;
5. assign no more than motif/slot placement caps;
6. resolve motif channel colors from semantic event tokens and clamp opacity;
7. persist placement;
8. if no slot fits, drop motif and record telemetry.

No requested motif may disappear silently.

Example telemetry:

```json
{
  "motifsDropped": ["stripe_classic"],
  "compilerRepairs": []
}
```

---

# 8. Semantic palette compiler

## 8.1 Problem

Raw creative colors express aesthetic intent. They are not renderer semantics.

An archetype must never assume:
- `palette.dominant` = hero background;
- first color = text;
- second color = button foreground.

That approach produced invalid navy-on-navy states in the first control panel.

## 8.2 Inputs

```text
palette.colors
palette.dominant
tonalDirection
```

The compiler may derive tints/shades from supplied colors using a perceptual model such as OKLCH.

It should not invent unrelated theme hues.

## 8.3 Outputs

```ts
type SemanticEventTokens = {
  eventBg
  heroBg
  surface
  surfaceAlt

  text
  textMuted

  accent
  accentText

  buttonBg
  buttonText

  border
  focus

  error
  errorText
}
```

## 8.4 Tonal strategy

| Tonal direction | Background strategy | Text strategy | Accent strategy |
| --- | --- | --- | --- |
| `light` | Prefer lightest appropriate palette-derived neutral/tint for event and surfaces | Derive dark on-colors from palette family | Use stronger chromatic palette color for accent |
| `mid` | Prefer middle-luminance palette-derived surface; ensure sections have usable contrast separation | Choose on-color per actual semantic surface | Accent may be lighter or darker depending on contrast |
| `dark` | Prefer darkest appropriate palette-derived color/tone for event/hero; surfaces may use nearby darker/lighter derived values | Derive light on-colors from palette family | Accent must remain distinguishable and accessible |

Archetypes choose **where semantic tokens are used**, not how raw colors map to those tokens.

## 8.5 Contrast rules

- normal text on every semantic surface where used: ≥ 4.5:1;
- large text: ≥ 3:1 when WCAG large-text definition applies;
- muted normal-size text: ≥ 4.5:1;
- button text/background: ≥ 4.5:1;
- focus/non-text interactive boundary: ≥ 3:1 where applicable;
- error text/background: ≥ 4.5:1.

Algorithm preference:
1. preserve hue and chroma intent where practical;
2. adjust lightness in OKLCH or equivalent;
3. if same-hue output remains visually poor/incompatible, choose nearest accessible derived neutral/on-color from the same supplied palette family;
4. validate every required pair after derivation;
5. compilation fails only if safe fallback cannot be created, which should be extremely rare.

## 8.6 Required unit tests

At minimum:
- all-light palette;
- all-dark palette;
- low-contrast adjacent colors;
- constrained navy/cream/forest palette;
- inverted control palette that previously created navy-on-navy;
- dominant color not suitable as background for requested tone;
- manual palette override through same compiler.

Accessibility failure should be impossible by construction, not caught only by screenshot review.

---

# 9. Density

```text
compact
balanced
spacious
```

Density maps centrally to bounded section/component spacing.

It may influence:
- section vertical spacing;
- card internal spacing;
- inter-control rhythm;
- max text measure within allowed bounds.

It does not let the model emit arbitrary pixel values.

Density is a secondary diversity lever, not a substitute for composition.

---

# 10. Compilation

Conceptual API:

```ts
type CompilationResult = {
  resolvedSpec: ResolvedDesignSpec
  compilerRepairs: CompilerRepair[]
  motifsDropped: MotifId[]
}

compileDesignIntent(
  intent: DesignIntent,
  archetypeDefinition: ArchetypeDefinition,
  typographyDefinitions,
  motifDefinitions
): CompilationResult
```

Pipeline:

```text
validate intent
→ load exact archetype version
→ validate typography
→ repair if needed
→ assign motifs to slots
→ compile semantic palette
→ apply archetype defaults
→ resolve typography + density
→ create ResolvedDesignSpec
→ validate resolved spec
→ persist
```

No AI call occurs during compilation.

---

# 11. ResolvedDesignSpec

```ts
type ResolvedDesignSpec = {
  schemaVersion: number

  archetypeId: HeroArchetype
  archetypeVersion: number

  tonalDirection: TonalDirection

  typographyPairing: TypographyPairingId
  typographyCategory: TypographyCategory
  density: Density

  eventDetailsTreatment: EventDetailsTreatment
  rsvpTreatment: RsvpTreatment
  registryTreatment: RegistryTreatment
  guestSurfaceComposition: GuestSurfaceComposition

  visualTreatment: VisualTreatment
  ornamentation: Ornamentation
  borderTreatment: BorderTreatment
  cardTreatment: CardTreatment
  buttonTreatment: ButtonTreatment

  motifPlacements: Array<{
    motifId: MotifId
    slotId: string
    role: MotifRole
    resolvedChannels: Record<string, string | number>
  }>

  semanticTokens: SemanticEventTokens
}
```

The base renderer reads this object.

It does not query the latest archetype defaults during normal rendering.

---

# 12. Persistence and immutability

Persist per concept:

```text
DesignIntent
archetypeVersion
ResolvedDesignSpec
```

Why all three:
- DesignIntent preserves what the model expressed and supports diversity/redesign analysis.
- Archetype version proves which bundle generated the concept.
- ResolvedDesignSpec makes rendering stable when defaults evolve.

Immutability covers **generated design data**.

It does not freeze:
- renderer CSS/React implementation;
- accessibility fixes;
- browser fixes;
- responsive bugs;
- component implementation defects.

A component bug fix may improve all events that consume compatible resolved data.

---

# 13. Event-level manual design overrides

MVP host controls remain separate from generated concept data:

```ts
Event.designOverrides {
  palette?
  typographyPairing?
}
```

Rules:
- never mutate the concept;
- palette override uses the same semantic palette compiler;
- typography override must be archetype-compatible;
- reset removes the event override and returns to base resolved concept;
- switching concepts clears design overrides unless a future explicit compatible-carry-forward feature exists.

No host controls for:
- density;
- motif;
- treatment;
- composition;
- border/card/button style.

---

# 14. Guest component system

Required primitives:

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

Every component:
- consumes semantic event tokens;
- consumes resolved treatment data;
- supports focus/disabled/error/loading where applicable;
- passes required contrast;
- works at 390 and 1280;
- never imports application chrome styling.

The private gate, RSVP forms, validation error, OTP, confirmation, registry cards, purchase-return prompt, and passed state are renderer surfaces, not generic product UI inserted into a pretty site.

---

# 15. Guest flow and composition

Semantic flow is fixed for usability/security:

```text
private gate if required
→ name lookup
→ collision resolution if needed
→ OTP if phone-backed
→ party attendance
→ questions
→ submit
→ confirmation
```

Archetype-owned guest composition controls:
- framing;
- column arrangement;
- section surfaces;
- heading placement;
- card use;
- motif slots;
- component treatments.

It must not reorder security/semantic steps.

### Mobile convergence

At ~390px, multiple desktop compositions may collapse into a stack.

This is accepted.

Do not invent awkward mobile information architectures merely to maximize visual difference.

Mobile identity should survive through:
- typography;
- border/frame language;
- motif presence;
- section surface;
- component treatment;
- density;
- hierarchy.

---

# 16. Diversity planner integration

For a concept batch:

1. read Event Identity compatible archetypes/tones/typography categories;
2. assign distinct compatible archetypes whenever possible;
3. assign different compatible tones when allowed;
4. assign/prefer different typography categories when possible;
5. allow model to choose actual pairing within the assigned category and archetype compatibility;
6. motifs/density/palette dominance provide further difference.

For a tone-constrained brief:
- all three may be light;
- typography becomes the next strongest controlled lever after archetype;
- density follows;
- explicit color constraints remain honored.

Track prior DesignIntents during redesign so unseen compatible combinations are preferred without creating a hard dead-end.

---

# 17. Renderer proof plan

## 17.1 Structural axes

A pair of concepts is materially distinct when at least 3/5 differ meaningfully independent of palette:

1. hero composition;
2. typography hierarchy;
3. section rhythm;
4. motif behavior;
5. component treatment.

## 17.2 Brief 1 — constrained heritage

Same prompt/data:
- elevated heritage baby shower;
- navy, cream, forest green required;
- restrained equestrian;
- subtle plaid permitted.

Panels:
- A: editorial split;
- B: framed invitation;
- C: typography first;
- control: same base structure with tone/palette changed.

Required:
- 390;
- 1280;
- color;
- grayscale;
- full guest surface lab.

## 17.3 Brief 2 — light constrained

All three:
```text
tonalDirection = light
```

This proves composition/type/motif/density can carry distinctness without tonal variation.

## 17.4 Five focused tests

1. **Archetype swap**  
   Same brief/constraints, different archetype → different site.

2. **Typography swap**  
   Same archetype, different compatible typography category/pairing → same site, different voice.

3. **Motif swap**  
   Same archetype, different motifs → same structure; slot usage and ornament expression change.

4. **Tone/palette change**  
   Same structure, changed tone/palette → compiler returns accessible semantic tokens. This is a compiler test more than a distinctness test.

5. **Incompatible intent**  
   Incompatible typography/motif → deterministic repair/drop + telemetry; never a model retry.

## 17.5 Regression expectation

After moving the first gallery to this architecture:
- A/B/C should remain within approved visual-diff tolerance;
- the original control should change because inaccessible contrast is intentionally corrected.

Do not classify that control difference as a regression.

---

# 18. Visual approval gate for remaining archetypes

Do not implement:
- `centered_statement`;
- `full_bleed_visual`;
- `layered_editorial`;

until:
1. first three reproduce successfully through the new compiler;
2. contrast unit tests pass;
3. five swap tests pass;
4. Brief 2 passes;
5. guest surfaces remain coherent.

Then each new archetype must independently define:
- bundle defaults;
- typography compatibility;
- motif slots;
- desktop composition;
- mobile composition;
- guest composition;
- visual regression cases.

---

# 19. Imagery boundaries

Private inspiration is model input only.

Published decorative images remain out of MVP.

Native registry thumbnails are the only public content-image exception:
- safe fetch/normalization;
- platform-owned asset;
- themed placeholder fallback;
- no retailer hotlink.

---

# 20. One-line renderer rule

> **The model chooses a small creative intent. The archetype and compiler do the design work. The renderer only consumes resolved, accessible, persisted design data.**
