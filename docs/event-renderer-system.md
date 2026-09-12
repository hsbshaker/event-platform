# Event Renderer System
## Revision 2 — CompositionTree: AI-authored composition over trusted primitives

**Path:** `docs/event-renderer-system.md`  
**Status:** Authoritative renderer architecture.  
**PRD:** `spec.md` Revision 6  
**Application design system:** `docs/design-system.md`  
**Model contracts:** `docs/model-contracts.md`  
**Evidence:** `proof/` (Phase A), `proof-a1/` (Phase A.1, Gate 2), `proof-b/` (Phase B: `PROPOSAL.md`, `RESULTS.md`, `FREEZE.md`, `FINAL.md`)

---

# 0. What this document is

This document defines the generated guest-site renderer: the contract between the model's creative authority, the deterministic compiler, the persisted resolved design, and production components.

Revision 1 formalized bundled archetypes. Three proof phases replaced them:

- **Phase A / A.1** proved that a family + recipe + page-system vocabulary produces coherent, distinct sites from one constrained brief, and that a seeded selector finds sixty of them without a human choosing (Gate 2).
- **Phase B** proved that the model can author the page composition itself from a bounded set of primitives, with deterministic safety at execution: 152 exploratory trees and a frozen confirmation run with no schema failure surviving one re-prompt, every structural violation repaired without a model call, every page verified against rendered geometry, and 78% of first screens novel against the recipe library in the frozen confirmation run (88–90% in the exploratory runs).

Revision 2 therefore replaces the archetype bundle with the **composition language**. The model owns structure; the compiler owns execution.

> **The model composes. The compiler builds. The renderer only consumes resolved, verified, persisted design data.**

---

# 1. Renderer invariants

1. Model output is a `CompositionTree`: trusted primitives with semantic leaves, enum tokens only. Never HTML, CSS, JSX, JavaScript, pixels, free text, colors, fonts, or components outside the allowlist.
2. The model owns nesting, grouping, hierarchy (emphasis), relative size (ratio, width, extent tokens), section order and surfaces, alignment, structural motif placement, and per-container mobile intent.
3. The compiler owns CSS/grid/flex, breakpoints, type scale, spacing, color, contrast, touch targets, overflow, valid nesting, RSVP/Registry semantics, and business logic.
4. The tree may reference only capabilities the event has (`Capabilities`). Nothing else is required or allowed.
5. Schema validation is strict. The only reasons the composition call is re-prompted are a schema-invalid response, an attractive-token-cap violation, and a selector collision, at most once each. Every other defect is repaired deterministically and logged by kind.
6. Content fit is verified against rendered geometry at 390 and 1280 before a spec is final. The static estimate is advisory.
7. Raw palette values never directly become text/background/button semantics; the semantic palette compiler and contrast rules of Revision 1 stand unchanged.
8. Persist `DesignIntent + CompositionTree (raw and canonical) + every ResolvedDesignSpec revision` per concept, with prompt, schema, primitive-set and compiler versions. A content edit that affects fit appends a new immutable revision (same tree, same `compositionHash`, no model call) and moves `activeResolvedSpecId`; no persisted revision is mutated.
9. Render the concept base from `ResolvedDesignSpec` only. Generated design data is immutable; renderer code may be fixed.
10. Guest semantic flow (gate → lookup → collision → OTP → party → questions → submit → confirmation) is fixed and lives inside the opaque `RSVP` component.
11. Mobile convergence is accepted, and is now expressed by the tree's mobile intents rather than by archetype rules.
12. The Phase A/A.1 recipes are a **library**: regression fixtures, rotated few-shot examples, repair and fallback macros, signature calibration. They are not the creative ceiling and the renderer has no code per recipe.
13. Visual and geometric tests must be able to fail the system; the proof harnesses are the regression suite.

---

# 2. The composition language

The exact TypeScript lives in `proof-b/src/composition.ts` and is the reference implementation until the production package exists; the JSON Schema is generated from the same table (`docs/model-schemas/composition.schema.json`).

## 2.1 Tokens

Every model-authored value is one of these enums. There are no numbers except `Grid.columns`, `Grid.mobile`, `Cell.span`, `Cell.rowSpan`, and no strings outside the enums.

```ts
Ratio       = "38" | "50" | "62"               // first child's share of a Split
RailWidth   = "thin" | "medium" | "wide"       // 48 / 96 / 192 px at desktop
BandHeight  = "thin" | "medium" | "tall"
Inset       = "tight" | "normal" | "deep"
Gap         = "tight" | "normal" | "loose"
Align       = "start" | "center" | "end"
Justify     = "start" | "center" | "end" | "between"
Emphasis    = "display" | "primary" | "secondary" | "caption"
SurfaceRole = "base" | "alt" | "contrast" | "accent"
RuleWeight  = "hairline" | "strong" | "double"
Anchor      = "top-start" | "top-end" | "bottom-start" | "bottom-end" | "center"
Extent      = "quarter" | "third" | "half" | "full"
MotifId     = "plaid" | "stripe" | "gingham" | "linen" | "equestrian" | "botanical" | "celestial"
MotifRole   = "field" | "band" | "frame" | "divider" | "accent"
```

## 2.2 Primitives (allowlist)

Layout containers:

| Primitive | Props | Meaning |
| --- | --- | --- |
| `Stack` | `gap?`, `align?`, `children[1..8]` | vertical column |
| `Cluster` | `gap?`, `justify?`, `children[2..6]` (text, Date, CTA, Glyph, vertical Rule only) | inline row that wraps |
| `Split` | `ratio`, `align?`, `divider?` (none/hairline/strong/dashed), `mobile` (stack/stack-reverse/keep), exactly two children | two columns |
| `Rail` | `side`, `width`, `rail` (MotifField or Stack of ≤4 small leaves), `mobile` (top/bottom/hide), `child` | fixed-width column beside the main child |
| `Grid` | `columns` 2–4, `ruled?`, `gap?`, `mobile` 1–2, `children[2..8]` of `Cell` | equal columns |
| `Cell` | `span?`, `rowSpan?`, `child` | one grid cell |
| `Frame` | `rule` (none/hairline/strong/double), `inset`, `motif?`, `child` | ruled box with an inset margin; rule none is a plain inset |
| `Surface` | `role`, `inset?`, `child` | switches the surface role for its subtree (panel, plate, card) |
| `Overlay` | `content` (text-bearing Stack/Frame/Split), `decoration` (MotifField, Monogram, Glyph, Date numeral), `anchor`, `extent`, `mobile` (stack/keep) | text over one decorative object |

Decorative leaves: `MotifField` (`motif`, `extent?`), `MotifBand` (`motif?`, `height`, `fill?`), `Rule` (`weight`, `orientation?`, `glyphs?`), `Glyph` (`motif`, `scale?`), `Monogram` (`style` ring/plain/watermark).

Semantic leaves, bound to event content (the model chooses form and emphasis only): `Eyebrow`, `EventTitle` (plus `layout` block/stagger/cascade), `Hosts`, `Description`, `Deadline`, `Venue`, `Location`, `Time` (each `emphasis?`, `case?`); `Date` (`form` full/numeral/month-year/weekday, `emphasis?`); `CTA` (`target` rsvp/registry, `style?`); `SectionHeading` (`for` details/rsvp/registry; copy comes from a compiler table).

Semantic components, opaque internals: `RSVP`; `Registry` (`layout`: a Grid, Stack or Split whose leaves are `RegistryItem`); `RegistryItem` (`kind` gift/external/cashfund, `emphasis?` featured/standard); `CashFund` (standalone).

Page:

```ts
Section         { kind: hero | details | rsvp | registry | band; surface: SurfaceRole; align?: Align; fill?: auto | screen (hero only); root: Node }
CompositionTree { version: "composition_v1"; sections: Section[] }
```

Considered and rejected, permanently unless a new proof says otherwise: absolute or pixel positioning; free ratios; per-node color, font or size; z-index beyond one Overlay level; custom breakpoints; animation; free text; custom section kinds.

## 2.3 Capabilities, content profile, presentation state

```ts
Capabilities            { rsvp, registry, gifts, externalRegistry, cashFund, hosts, description, time, location, deadline }   // enabled features; sent to the model
ContentProfile          { titleWords, titleChars, hostsChars, venueChars, descriptionChars, registryCounts, provisionalFields[] }  // present content; sent to the model for fit
FeaturePresentationState{ sections: { rsvp, registry }: "setup" | "visible"; leaves: { hosts, description, time, location, deadline }: "empty" | "present" }   // guest visibility; never sent to the model
```

`Capabilities` derive from enabled features, never from whether content exists; for a baby shower at first generation they are the full set, so every first composition has a designed place for RSVP and registry. The prompt lists what is not available; the validator drops any reference to a disabled capability as a `capability` repair; the coverage rules require only what is enabled. `ContentProfile` may contain bounded provisional values for fields the host has not entered yet (`spec.md §7.3`); when a real value arrives the compiler re-fits into a new resolved-spec revision. `FeaturePresentationState` decides what guests see: registry is visible once it has an external registry, native gift or cash fund; RSVP once it is configured and at least one party is invited; empty optional leaves collapse for guests while their collaborator affordance stays anchored. Content and operational state change visibility, never composition.

## 2.4 Nesting, depth, limits

| Parent | Allowed children | Forbidden |
| --- | --- | --- |
| section root | any container, `Overlay`; `MotifBand` for a band section | bare leaves |
| `Cluster` | inline leaves | containers, components |
| `Split` | exactly two | — |
| `Rail.rail` | `MotifField`, or a `Stack` of ≤4 leaves | components |
| `Grid` | `Cell` only; a `Cell` may not hold `Grid` or `Overlay` | components in a span-1 cell of a 3–4 column grid |
| `Frame` | any | a `Frame` anywhere below (no frame within a frame) |
| `Surface` | any | a `Surface` of the same effective role |
| `Overlay.content` | text-bearing `Stack`, `Frame`, `Split` | text-free content |
| `Overlay.decoration` | `MotifField`, `Monogram`, `Glyph`, `Date` numeral | anything with body text |
| `Registry.layout` | `Grid`, `Stack`, `Split` with `RegistryItem` leaves | any other leaf |

Depth ≤ 5 containers; `Split` in `Split` at most once; `Rail` in `Rail`, `Grid` in `Grid`, `Overlay` in `Overlay` forbidden. **Boxes:** at most two nested `Frame`/`Surface` on any path (a third border is unwrapped). Per section: ≤ 40 nodes, ≤ 1 `Overlay`, 1 `Rail`, 1 `Grid`, 1 `Frame`, 2 `MotifField`. Per page: ≤ 160 nodes, ≤ 2 `Overlay`, ≤ 2 `Frame`; 3–6 sections, hero first, one each of hero/rsvp/registry (rsvp and registry only when enabled), at most one details and one band; no more than two consecutive contrast sections. Components may be children only of a section root, `Stack`, `Surface`, `Frame`, `Split` (with at least half the width), or a wide `Cell`; `RSVP` lives in the rsvp section and `Registry` in the registry section. Pattern motifs go in `MotifField`, `MotifBand` and `Frame.motif`; arrangement motifs go in `Glyph` and `Rule.glyphs`. Response body ≤ 12 KB.

Coverage: `EventTitle` exactly once; `Venue` and `Date` at least once; `RSVP` and `Registry` exactly once when enabled; `Description` and `Monogram` at most once per page; within a section each text node at most once (Date at most twice with different forms) and one CTA.

## 2.5 Responsive intent

The model states one enum per container; the compiler owns breakpoints and every override. `Split.mobile keep` is honoured only when neither side holds a component or the Description; `Rail.mobile hide` only for a `MotifField` rail; `Grid.mobile` 1 or 2 columns; `Overlay.mobile stack` turns the decoration into a band. Overridden intent is logged as a `responsive` repair.

---

# 3. Compilation

```text
model response (JSON)
→ strict schema validation                      fail → one re-prompt with the error list → still failing → library fallback
→ structural validation + deterministic repair   nesting, depth, limits, coverage, capabilities, boxes, motif kind, responsive
→ planner caps (attractive tokens)               after the one re-prompt, deterministic neutralization
→ content-fit estimate (advisory)
→ canonicalize (defaults, ids, hash)
→ page system + semantic palette + typography    unchanged from Revision 1
→ layout resolution (tokens → values per breakpoint)
→ rendered-geometry verification (authoritative) 390 and 1280: line limits, text overflow, container overflow; demote emphasis, then remove the innermost box; the CSS floor (a word can always break) guarantees zero horizontal overflow
→ immutable ResolvedDesignSpec revision (verified: true); activeResolvedSpecId
```

**Re-fit.** When a content edit changes the content profile, steps from page-system resolution through geometry verification run again on the same canonical tree and produce a new immutable revision (`contentVersion`, `supersedesSpecId`, same `compositionHash`). No validation, repair, planner, selector or model step runs. Re-fit is the only path by which a concept gains a new revision.

Every repair is logged as `{ rule, path, kind, before, after }` with `kind ∈ structural | coverage | capability | responsive | planner | fit-estimate | fit-verified`. No repair calls a model. Telemetry keeps schema validity, repair counts by kind, geometry verification, and model re-prompts as separate measures.

Library macros (a hero, an rsvp section, a registry section) are the only repair inputs that are not rules; they come from the A.1 library, chosen by seed.

## 3.1 Geometry verification

Runs in a headless browser against the production renderer (see `docs/technology-decisions.md`). Each text node's line count and bounds are measured at both breakpoints; nodes over their limit (display and primary: three lines at desktop, four at mobile) or overflowing their container are demoted one emphasis step and the page is re-rendered, up to three rounds; if any overflow remains, the innermost `Frame`/`Surface`/`Rail` around the node is relaxed (Frame → Stack, Surface inset → tight, Rail widened), logged as `fit.verified.structural`. The renderer's stylesheet also carries a floor (`overflow-wrap: anywhere`, wrapping glyph rows, clipped decorations, rail-sized numerals) so a page cannot overflow horizontally even before verification. A spec is final only with `verified.clean === true`.

## 3.2 Page system

Unchanged in role: borders, cards, buttons, type scale, spacing chosen by the compiler from family, composition and seed, applied to every section so a page reads as one system. Two fields changed: `axis` is a default alignment that a section or Stack may override; the surface plan is the model-authored section surface sequence, validated by the sequence rules.

---

# 4. DesignIntent and the composition call

`DesignIntent` (model contract, `design_intent_v3`) keeps six fields and replaces `heroArchetype` with `family` and adds `composition`:

```ts
DesignIntent {
  family: "editorial" | "invitation" | "statement"
  tonalDirection: "light" | "mid" | "dark"
  palette: { colors: string[]; dominant: string }
  typographyPairing: string
  density: "compact" | "balanced" | "spacious"
  composition: { asymmetry; hierarchy; rhythm; sectionContrast; ornament }
  motifs: string[]
}
```

The composition call is a separate strong-model call conditioned on the DesignIntent, the capabilities, the content profile, the primitive spec and rules (generated from the same table as the validator), the sibling's structural directive and token allowances, and three rotated library examples. `presentation {name, description}` stays on the DesignIntent response and is never compiled.

---

# 5. Diversity: planner, directives, signature, caps

**Sibling planner.** A batch of three candidates receives three different DesignIntents (distinct family, tone, typography category and hierarchy where the brief allows) and three different structural directives. Never the same intent with different seeds.

**Directives** are nudges assembled from eight independent dimensions (opening object, primary structure, date treatment, motif use, hero surface, details folded or own, RSVP intro placement, registry layout in primitive terms); 34,560 combinations; one sentence per candidate. Compliance is measured per dimension. They are not a layout library: one directive value produced seven to thirteen distinct hero skeletons in the proof.

**Signature.** The hero skeleton (primitive types with structural tokens only, plain text dropped), the surface sequence, the RSVP and registry skeletons, alignment, typography category and tone; hero similarity by normalized token-sequence edit distance with a floor on partial overlap; computed separately for desktop and the mobile-resolved skeleton; threshold .70, calibrated on the library. A collision with a batch sibling or the host's redesign history earns one re-prompt naming the colliding skeleton, then a library fallback.

**Attractive-token caps.** Devices the model over-selects (staggered titles, hero numerals, watermark decorations) are allotted per batch: at most one sibling in three may use each. Allotments are prompt text; a violation earns the one re-prompt, then deterministic neutralization logged as a `planner` repair. Generic mechanism: `{ id, detect(tree), neutralize(tree) }` per token; the list is data.

---

# 6. ResolvedDesignSpec

```ts
ResolvedDesignSpec {
  version: "resolved_v2"
  designIntent                                  // as returned, validated
  presentation: { name, description }           // never compiled
  composition: CanonicalCompositionTree         // after repair, caps, fit
  compositionHash
  capabilities
  pageSystem: { border, card, button, typeScale, spacing, defaultAlign }
  tokens: { palette (semantic, OKLCH), fonts, scale, spacing }
  layout: Record<NodeId, ResolvedLayout>        // token values per breakpoint; no CSS text
  motifs: Record<NodeId, ResolvedMotif>
  compilerRepairs: Repair[]
  intentDeviations: Deviation[]
  signature
  verified: { desktop, mobile, fitDemotions, clean: true, authoritative: "rendered-geometry" }
  contentVersion; supersedesSpecId?         // re-fit revisions of the same concept
  versions: { primitiveSet, compiler, compositionPrompt, compositionSchema, designIntentPrompt, designIntentSchema }
}
```

The renderer has one fixed component per primitive and per semantic node and a static stylesheet keyed by classes and numeric custom properties from `layout`. No CSS text is ever derived from model output. The primitive set is versioned separately from the compiler because the renderer must support every set that has a live spec. Persist the raw model tree alongside the canonical one for evaluation and redesign history.

---

# 7. The library

The 27 Phase A.1 hero silhouettes and 13 section recipes, rewritten as `CompositionTree` fixtures (`proof-b/library.js`). Jobs: expressiveness regression (every silhouette must validate and render through the primitive renderer), rotated few-shot examples, repair macros, the fallback generator (the Gate 2 seeded selector), and signature calibration (mirror pairs collide, distinct recipes do not). The library is not a menu and the renderer has no code per recipe.

---

# 8. Typography, motifs, palette, density, guest components, imagery

Sections 6–9, 14 and 19 of Revision 1 stand, with these deltas:
- typography compatibility is by family and hierarchy (a pairing must hold at monumental scale), not by archetype;
- motifs are placed by the tree (`MotifField`, `MotifBand`, `Frame.motif`, `Glyph`, `Rule.glyphs`) within the ornament budget from `composition.ornament`; roles, channels, opacity bounds and caps are unchanged; a motif of the wrong kind for its slot is swapped and logged (`motif.kind`), never dropped silently;
- density maps to gap, inset and section spacing scales that the tokens resolve against;
- guest components are the opaque `RSVP`, `Registry`, `RegistryItem`, `CashFund` and the compiler-owned gate, footer and confirmation surfaces; they take width from their container, surface from the nearest `Surface`, and card/button/border language from the page system.

---

# 9. Proof and regression gates

The proof harnesses are the regression suite. A change to the language, validator, compiler, renderer rules or planner reruns:

1. **Unit tests** (`proof-b/test.js`): library validity and canonicalization, every repair rule with a fixture, schema-invalid rejection, attractive-token detectors, planner distinctness, signature calibration.
2. **Adversarial set** (`proof-b/adv-run.js`): every structural fixture repairs to zero remaining violations and renders with zero overflow at both widths; every schema-invalid payload is rejected with a rule and path.
3. **Expressiveness**: all 27 silhouettes and 13 section recipes validate and render (`library-heroes-*.png`).
4. **Model confirmation run** (`proof-b/run-model.js --batches`, `render-set.js`, `evaluate.js`): sixty trees in sibling batches plus a reduced-capabilities batch, no curation, reported separately as schema validity, deterministic repairs, geometry, novelty and distinct skeletons, attractive-token distribution, collision rate, and design-quality review. Thresholds: ≥ 90% schema-valid on the first call and 100% after one re-prompt; 100% repair-valid; 100% geometry-clean; ≥ 30 distinct hero skeletons and ≥ 40% novel in 60; 0 sibling collisions after the selector; each attractive token in ≤ 1/3 of heroes; reviewers rate ≥ 70% of model screens designed.

Palette-compiler unit tests, contrast rules and the imagery boundaries of Revision 1 remain in force.

---

# 10. One-line renderer rule

> **The model composes from trusted primitives. The compiler validates, repairs, fits against real geometry, and freezes. The renderer only consumes resolved, verified, persisted design data.**
