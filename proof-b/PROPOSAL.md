# Phase B proposal — a composition language for AI-authored pages

Status: proposal, not canonical. Nothing in `spec.md`, the renderer docs, the model contracts, or `CLAUDE.md` changes until the Phase B proof passes.

## The shape of the answer

The model authors a **CompositionTree**: an ordered list of sections, each a small tree of eleven layout/decorative primitives with semantic leaves bound to event content. Every value in the tree is an enum token. There are no numbers, no strings the model writes, no styles, no components outside the allowlist. The compiler validates, repairs, fits content, resolves tokens into a fixed set of renderer components, and freezes the result as an immutable `ResolvedDesignSpec`. The Phase A.1 recipes become 27 trees in a library used as few-shot examples, regression fixtures, repair macros and fallbacks.

What the model controls: nesting, grouping, hierarchy (emphasis tokens), relative size (ratio/width/extent tokens), section order and surfaces, alignment, structural motif placement, and a per-container mobile intent. What it never touches: CSS, breakpoints, type sizes, spacing values, colors, contrast, touch targets, overflow, form internals, registry semantics, copy.

Empirical constraints carried from Phase A and Gate 2:
- The structural parameters that mattered were binary or ternary (field side, rail side, band position, frame inset, numeral position). The language quantizes to three steps everywhere.
- Every silhouette that collided was one where the skeleton matched and only styling differed. The signature is computed on the skeleton alone.
- Coherence came from one page system per page, not from recipes. The page system survives intact and stays compiler-owned.
- Corner cases appear at sixty, not twelve. The proof runs sixty model trees before anything is canonical.
- The ticket taught that strong objects repeat fastest. Overlay and Frame get per-page caps.

---

## 1. `CompositionTree` (TypeScript)

```ts
// ---------- tokens: every model-authored value is one of these ----------
export type Ratio       = "38" | "50" | "62";            // first child's share of a Split
export type RailWidth   = "thin" | "medium" | "wide";    // compiler: 48 / 96 / 192 px at desktop
export type BandHeight  = "thin" | "medium" | "tall";
export type Inset       = "tight" | "normal" | "deep";
export type Gap         = "tight" | "normal" | "loose";
export type Align       = "start" | "center" | "end";
export type Justify     = "start" | "center" | "end" | "between";
export type Emphasis    = "display" | "primary" | "secondary" | "caption";
export type SurfaceRole = "base" | "alt" | "contrast" | "accent";
export type RuleWeight  = "hairline" | "strong" | "double";
export type Anchor      = "top-start" | "top-end" | "bottom-start" | "bottom-end" | "center";
export type Extent      = "quarter" | "third" | "half" | "full";
export type MotifId     = "plaid" | "stripe" | "gingham" | "linen" | "equestrian" | "botanical" | "celestial";
export type MotifRole   = "field" | "band" | "frame" | "divider" | "accent";
export interface MotifRef { id: MotifId; role: MotifRole }

// ---------- layout containers (7) ----------
export interface Stack   { t: "Stack";   gap?: Gap; align?: Align; children: Node[] }                 // 1..8 children
export interface Cluster { t: "Cluster"; gap?: Gap; justify?: Justify; children: InlineLeaf[] }       // 2..6, inline row, wraps
export interface Split   { t: "Split";   ratio: Ratio; align?: "start" | "center" | "stretch";
                           mobile: "stack" | "stack-reverse" | "keep"; children: [Node, Node] }
export interface Rail    { t: "Rail";    side: "start" | "end"; width: RailWidth;
                           rail: MotifField | Stack; mobile: "top" | "bottom" | "hide"; child: Node }
export interface Grid    { t: "Grid";    columns: 2 | 3 | 4; ruled?: boolean; gap?: Gap; mobile: 1 | 2; children: Cell[] } // 2..8 cells
export interface Cell    { t: "Cell";    span?: 1 | 2 | 3 | 4; rowSpan?: 1 | 2; child: Node }
export interface Frame   { t: "Frame";   rule: RuleWeight | "none"; inset: Inset; motif?: MotifRef; child: Node }
export interface Surface { t: "Surface"; role: SurfaceRole; inset?: Inset; child: Node }
export interface Overlay { t: "Overlay"; content: Stack | Frame | Split; decoration: Decoration;
                           anchor: Anchor; extent: Extent; mobile: "stack" | "keep" }

// ---------- decorative leaves (4) ----------
export interface MotifField { t: "MotifField"; motif: MotifRef; extent?: Extent }
export interface MotifBand  { t: "MotifBand";  motif?: MotifRef; height: BandHeight; fill?: "pattern" | "accent" }
export interface Rule       { t: "Rule"; weight: RuleWeight; orientation?: "h" | "v"; glyphs?: MotifId }
export interface Glyph      { t: "Glyph"; motif: MotifId; scale?: "s" | "m" | "l" }
export interface Monogram   { t: "Monogram"; style: "ring" | "plain" | "watermark" }
export type Decoration = MotifField | Monogram | Glyph | DateNode;          // DateNode only with form "numeral"

// ---------- semantic leaves: bound to content, the model chooses form and emphasis only ----------
export type TextKind = "Eyebrow" | "EventTitle" | "Hosts" | "Description" | "Deadline" | "Venue" | "Location" | "Time";
export interface TextNode { t: TextKind; emphasis?: Emphasis; case?: "upper" | "none" }
export interface DateNode { t: "Date"; form: "full" | "numeral" | "month-year" | "weekday"; emphasis?: Emphasis }
export interface CTA      { t: "CTA"; target: "rsvp" | "registry"; style?: "button" | "link" }
export interface Heading  { t: "SectionHeading"; for: "details" | "rsvp" | "registry"; emphasis?: "primary" | "display" } // copy from compiler table

// ---------- semantic components: internals are opaque ----------
export interface RSVP         { t: "RSVP" }
export interface Registry     { t: "Registry"; layout: Grid | Stack | Split }                       // leaves must be RegistryItem
export interface RegistryItem { t: "RegistryItem"; kind: "gift" | "external" | "cashfund"; emphasis?: "featured" | "standard" }
export interface CashFund     { t: "CashFund" }                                                     // standalone cash fund block

export type InlineLeaf = TextNode | DateNode | CTA | Glyph | Rule;
export type Node = Stack | Cluster | Split | Rail | Grid | Frame | Surface | Overlay
                 | MotifField | MotifBand | Rule | Glyph | Monogram
                 | TextNode | DateNode | CTA | Heading | RSVP | Registry | CashFund;

// ---------- page ----------
export interface Section {
  kind: "hero" | "details" | "rsvp" | "registry" | "band";   // band: root must be MotifBand
  surface: SurfaceRole;
  align?: Align;                 // default alignment for Stacks in this section
  fill?: "auto" | "screen";      // hero only: fill the first screen
  root: Node;                    // a container or Overlay, never a bare leaf
}
export interface CompositionTree {
  version: "composition_v1";
  sections: Section[];           // 3..6; sections[0].kind === "hero"
}
```

The model emits exactly this JSON. There is no `id`, `style`, `class`, `css`, `width`, `px`, `color`, `font`, or free-text field anywhere. Unknown keys fail validation.

## 2. Primitive allowlist

Eleven layout/decorative primitives: `Stack`, `Cluster`, `Split`, `Rail`, `Grid` (+`Cell`), `Frame`, `Surface`, `Overlay`, `MotifField`, `MotifBand`, `Rule`, plus `Glyph` and `Monogram` as decorative leaves. Thirteen semantic nodes: eight text kinds, `Date`, `CTA`, `SectionHeading`, `RSVP`, `Registry`/`RegistryItem`/`CashFund`.

From your list I merged `Inset` into `Frame` (a `Frame` with `rule: "none"` is an inset; two primitives for one silhouette invites drift) and `Band` into `MotifBand` (a band is a band whether it carries pattern or accent). Everything else survives.

Considered and rejected, with the reason: absolute or pixel positioning (Overlay with five anchors and four extents covers every offset and watermark the A.1 heroes used); free ratios (Phase A showed .45/.55 are content-fit steps, not design steps); per-node color, font or size (contrast and type bounds are compiler authority); z-index and stacking beyond one Overlay level; custom breakpoints; animation; free text (no injection surface, no copy drift, no need); arbitrary section kinds (a "custom" section is the door to arbitrary sites).

## 3. Nesting and depth

| Parent | Allowed children | Forbidden |
| --- | --- | --- |
| `Section.root` | any container, `Overlay` | bare leaves |
| `Stack` | any node | more than 8 children |
| `Cluster` | `InlineLeaf` only (text, Date, CTA, Glyph, vertical Rule) | containers, components |
| `Split` | exactly two of any node | a third child |
| `Rail.rail` | `MotifField`, or a `Stack` of ≤4 leaves | components, containers other than that Stack |
| `Grid > Cell` | any node | `Grid`, `Overlay`; components in a span-1 cell of a 3- or 4-column grid |
| `Frame` | any node | `Frame` (no frame within a frame, the Phase A rule) |
| `Surface` | any node | `Surface` with the same effective role |
| `Overlay.content` | `Stack`, `Frame`, `Split` | anything text-free |
| `Overlay.decoration` | `MotifField`, `Monogram`, `Glyph`, `Date` (numeral) | anything with body text; text never sits under text |
| `Registry.layout` | `Grid`, `Stack`, `Split` whose leaves are `RegistryItem` | any other leaf |

Depth: at most five containers between a section root and a leaf. `Split` may nest inside `Split` once. `Rail` in `Rail`, `Grid` in `Grid`, `Overlay` in `Overlay` are forbidden. Per section: at most one `Overlay`, one `Rail`, one `Grid`, one `Frame`, two `MotifField`. Per page: at most two `Overlay`, two `Frame`.

Components: `RSVP` and `Registry` may be children only of `Stack`, `Surface`, `Frame`, `Split`, or a wide `Cell`. In a `Split`, the component's side must hold at least half the width (`"50"`, or `"62"` on its side). This is how the five A.1 RSVP shells are all expressible while a form can never be squeezed into a rail.

## 4. Sizing, alignment, span

Every dimension is a three- or four-step token: `Ratio` 38/50/62, `RailWidth`, `BandHeight`, `Inset`, `Gap`, `Extent`, `Emphasis`. Alignment is `start | center | end` on `Stack` and per section; `Justify` on `Cluster`. Grid cells span 1 to `columns` and 1 to 2 rows. The compiler owns the scales those tokens resolve to, per density and per breakpoint. `Emphasis` maps to the type scale chosen from `DesignIntent.composition.hierarchy`; the model chooses which node is display-sized, the compiler chooses what display-sized means.

## 5. Responsive intent

One enum per container, nothing else:
- `Split.mobile`: `stack` | `stack-reverse` | `keep`. The compiler demotes `keep` to `stack` if either side holds a component, a `Description`, or more than three text leaves. (The A.1 numeral hero's side-by-side phone layout is `keep`; the split heroes are `stack` and `stack-reverse`.)
- `Rail.mobile`: `top` | `bottom` | `hide`. `hide` is honoured only for a pure `MotifField` rail.
- `Grid.mobile`: `1` | `2` columns.
- `Overlay.mobile`: `keep` | `stack` (decoration becomes a `MotifBand` beside the content).
- `Stack` and `Cluster` have no intent; Stacks are columns and Clusters wrap.

The model states intent; the compiler owns breakpoints, the actual grid/flex, and every override above. Intent that was overridden is logged as a repair.

## 6. Semantic components in arbitrary compositions

`RSVP` is a leaf. Its heading, deadline and description are ordinary semantic nodes the model composes around it (that is exactly what the five RSVP shells were: intro beside, intro above, intro in a band). Its internals (name lookup, collision handling, OTP, party attendance, meal, custom questions, validation, submit) are one component with one DOM, which chooses its own one- or two-column form grid from the width it is given. It exposes nothing else.

`Registry` is a container with one job: arrange three atomic items (`gift`, `external`, `cashfund`) with a `Grid`, `Stack` or `Split`. The item cards are opaque, the return prompt is appended by the compiler, purchase state and reservation logic never appear in the tree. `CashFund` may also stand alone (a cash fund in its own band is a real design); if it does, the registry drops it.

Both components take their width from the container, their surface from the nearest `Surface`, and their card/button/border language from the page system. That is the whole interface.

## 7. Validation and repair (deterministic, ordered)

1. **Parse.** Strict schema (zod, `unknown keys → fail`). A failure returns the error list to the model for one re-prompt. A second failure falls back to the seeded recipe generator (Gate 2 selector) for the whole page. Nothing else is retried.
2. **Structural repairs**, each logged as `{ path, rule, before, after }` in `compilerRepairs[]`:
   - forbidden nesting: `Frame` in `Frame` → inner becomes `Stack`; `Overlay` in `Overlay` → inner replaced by its content; `Grid` in `Grid`, `Rail` in `Rail` likewise;
   - `Cluster` with a container child → the container's leaves are inlined, capped at six;
   - `Split` with one child → `Stack`; with more than two → first two kept, remainder appended in a `Stack`;
   - depth over five → the deepest `Stack` is merged into its parent;
   - section over 40 nodes → decorative leaves dropped first (Glyph, Rule, MotifBand), then trailing optional text;
   - per-page caps exceeded → later `Overlay`/`Frame` demoted to `Stack`;
   - once-only semantics duplicated → first kept; `Date` may appear twice only with distinct forms;
   - missing required semantics: `EventTitle` missing → hero root replaced by a library hero macro chosen by seed; `RSVP` or `Registry` section missing → library section macro appended; `Date` or `Venue` missing → appended to a details `Cluster`, creating a details section if none exists;
   - component in a forbidden parent → hoisted to the nearest allowed ancestor; component side under half a `Split` → ratio set to `"50"`;
   - `Overlay.decoration` bearing body text → replaced by a linen `MotifField`;
   - `Surface` with the same role as its effective parent → unwrapped;
   - surface sequence: no more than two consecutive `contrast` sections; the third is demoted to `alt`. Hero on `contrast` with a `Surface: contrast` object inside → object becomes `alt` (the card/ticket rule).
3. **Content fit.** For every text node, the compiler computes the width share from the ancestors (Split ratios, Rail widths, Grid spans, Frame insets) and the line count at the requested emphasis for the actual content, at both breakpoints. Over three lines at desktop or four on mobile → emphasis demoted one step, repeated until it fits. This replaces per-recipe `contentFit` with one rule that works for any tree. Overflow becomes impossible by construction rather than by inspection.
4. **Accessibility and contrast** are not in the tree at all: surfaces are roles, colors come from the OKLCH palette compiler with contrast by construction, touch targets and focus come from the component library.
5. **Canonicalize.** Defaults filled, node ids assigned from path, children order preserved, then hashed. Two trees that differ only in defaults hash the same.

Family rules from A.1 (invitation is centered and symmetric, statement has one dominant object) become **advisory lints**: recorded as `intentDeviations[]`, never repaired. Family is a brief the model was given, not a cage; the proof measures how often it is honoured.

## 8. Limits against pathological output

Response body ≤ 12 KB. Sections 3–6, hero first, exactly one each of hero, rsvp, registry sections (details may be folded into the hero; band sections at most one). Nodes ≤ 40 per section, ≤ 160 per page. Depth ≤ 5. Cluster ≤ 6, Stack ≤ 8, Grid ≤ 8 cells. Per-page caps on Overlay and Frame. Enum-only values, so the largest possible tree is bounded and the renderer's work is bounded with it. One re-prompt, then fallback. Composition call output budget ~2.5k tokens.

## 9. What happens to `DesignIntent` and `PageSystem`

`DesignIntent` survives as the first, small model call, unchanged in shape: `family`, `tonalDirection`, `palette`, `typographyPairing`, `density`, `composition {asymmetry, hierarchy, rhythm, sectionContrast, ornament}`. The composition tree is a **second call** with its own prompt and schema version, conditioned on the DesignIntent, the content profile, the primitive spec, seeded structural directives (see 12) and, in one proof condition, three rotated library examples. Splitting the calls keeps the intent contract tiny and lets the tree be re-prompted without re-rolling the palette.

`composition.*` fields change role: they stop selecting recipes and become (a) directives in the composition prompt and (b) measurements taken from the tree afterwards (asymmetry from Split ratios and Rail use, hierarchy from the emphasis spread, rhythm and contrast from the surface sequence). "Did the tree realize the intent" is a metric, not a validator.

`PageSystem` survives almost whole and stays compiler-owned: `borderLanguage`, `cardLanguage`, `buttonLanguage`, `typeScale`, `spacing` chosen from family, composition and seed exactly as now. Two fields change: `axis` becomes the default section alignment that a section or Stack may override, and `surfacePlan` is replaced by the section surface sequence the model authored, validated by the sequence rules above. The six surface plans remain as fallback sequences and as the library's examples.

## 10. What the recipes still do

The 27 hero silhouettes and 13 section recipes are rewritten as trees and kept as a **library**, with five jobs:
1. **Expressiveness fixtures.** If the language cannot express what the recipes did, it is too small. Gate: 25 of 27 silhouettes reproduce to a visual match against the A.1 shots.
2. **Few-shot examples**, rotated by seed so the model does not converge on a fixed three.
3. **Repair macros** for missing sections and broken heroes.
4. **Fallback generator**: Gate 2's seeded selector, unchanged, when the model fails twice.
5. **Signature calibration**: the 27 must be pairwise below threshold and the pre-A.1 poster/masthead pairs above it.

They are not a menu the model chooses from, and the harness recipe functions are retired once the primitive renderer reproduces them.

## 11. Compilation to `ResolvedDesignSpec`

```ts
export interface ResolvedDesignSpec {
  version: "resolved_v2";
  designIntent: DesignIntent;                 // as returned, validated
  presentation: { name: string; description: string };   // still outside design, never compiled
  composition: CanonicalCompositionTree;       // after repair and content fit
  compositionHash: string;
  pageSystem: PageSystem;                      // borders, cards, buttons, typeScale, spacing, defaultAlign
  tokens: { palette: SemanticPalette; fonts: FontPair; scale: TypeScale; spacing: SpacingScale };
  layout: Record<NodeId, ResolvedLayout>;      // per node: resolved token values per breakpoint, e.g. Split → {desktop: {first: 62}, mobile: {order: "reverse"}}
  motifs: Record<NodeId, ResolvedMotif>;       // seeded arrangements and pattern parameters
  compilerRepairs: Repair[];
  intentDeviations: Deviation[];
  signature: StructuralSignature;
  versions: { primitiveSet: string; compiler: string; compositionPrompt: string; compositionSchema: string; designIntentPrompt: string; designIntentSchema: string };
}
```

The renderer has one fixed component per primitive and per semantic node, a static stylesheet keyed by data attributes, and reads only `ResolvedLayout` token values. No CSS text is ever derived from model output. The spec is immutable; a redesign compiles a new one; `GenerationRun` records both version sets. Rendering an old spec with a newer compiler is not allowed; the renderer must support every `primitiveSet` version that has a live spec, which is why the primitive set is versioned separately from the compiler.

## 12. Seeds and diversity planning with novel trees

Seeds keep every job they have now (page system choice, motif arrangements, cosmetic parameters, palette resolution) and gain two:
- **Structural directives.** The planner draws, per candidate, from a small directive vocabulary (about twelve: "hero is an Overlay with a decorative Date numeral", "the date is a Rail", "the hero is framed", "title in a ruled Grid", "registry is a Split with the gift featured", …) and rotates the few-shot examples. For a batch of three candidates, directives, families and tones are all distinct. Directives are prompt text, not constraints; whether the model follows them is measured.
- **Signature rejection.** The skeleton signature (below) is computed for each returned tree against its batch siblings, the host's redesign history, and, optionally, a sample of the platform's recent specs. At or above threshold, the model is re-prompted once with the colliding skeleton described ("your hero is a Split 62 with a field on the right; make it structurally different"); a second collision falls back to the seeded library.

**Signature.** Serialize the hero section's skeleton (primitive types with structural tokens only: `Split:62`, `Rail:start:wide`, `Grid:3:ruled`, `Overlay:bottom-start:half`, `Frame:deep`, `MotifField:field`, the position of `EventTitle` and `Date:numeral`), plus the section surface sequence, the RSVP and Registry container skeletons, and the default alignment. Similarity is a weighted mix of normalized tree edit distance on the hero skeleton (trees are ≤40 nodes, so this is cheap) and exact matches on the other terms, with weights and threshold calibrated on the library as in 10.5. Mobile is computed separately using the mobile-resolved skeleton (after `stack`/`keep` resolution), exactly as Gate 2 did.

## 13. Is the model inventing, or converging?

Measured on the Phase B run of 60 trees from one brief, all uncurated:
1. **Novelty rate**: fraction of hero skeletons whose nearest library silhouette is below the similarity threshold. Target ≥ 40%.
2. **Distinct skeletons in 60**: after canonicalization. Target ≥ 30 (Gate 2 produced 26 silhouettes from a 27-silhouette vocabulary; the language must beat its own library).
3. **Rarefaction**: distinct skeletons versus N. If it plateaus by 30, the model has a repertoire, not a language.
4. **Primitive and pair usage entropy** compared with the library's. Convergence looks like three primitives doing all the work.
5. **Mode-collapse test**: same brief, same directive, 20 seeds that differ only in example rotation. Target ≥ 12 distinct skeletons.
6. **Directive compliance**: how often the directive is realized. Low compliance means directives cannot carry batch diversity and the selector has to.
7. **Human test**: 20 model heroes and 20 library heroes, unlabeled, grayscale, both widths. Reviewers group by template and rate each "designed" versus "accidental". Pass: model heroes do not all fall into library groups, and ≥ 70% are rated designed.
8. **Repair load**: repairs per tree and their kinds. A language that needs three repairs per tree is either too loose or badly explained to the model.

Two prompt conditions run side by side: zero-shot from the primitive spec, and few-shot with three rotated library examples. If few-shot wins on quality but loses badly on novelty, the examples are shaping the output and the library should be shown as *counter*-examples ("do not produce these skeletons") instead.

## 14. Minimum proof harness (Phase B), before anything is canonical

1. **`composition.ts`** in the proof folder: the types above, zod schema, validator and repair pipeline, canonicalizer, signature. Pure functions with unit tests, including every repair rule with a before/after fixture.
2. **Primitive renderer**: the A.1 harness CSS refactored into one render function per primitive and semantic node, reading a canonical tree. Throwaway, config-driven, same fonts, tokens and motif generators. Retire the recipe functions.
3. **Library as trees**: the 27 hero silhouettes and 13 section recipes rewritten as `CompositionTree` fixtures. Render and compare against the A.1 shots side by side. Gate: ≥ 25 of 27 silhouettes reproduce; every section recipe reproduces.
4. **Adversarial fixtures**: 30 hand-written pathological trees (max depth, forms in rails, text under text, six overlays, empty sections, duplicated titles, twelve-word title at display). Gate: 100% repaired to valid; 0 horizontal overflow at 390 and 1280 (measured as `scrollWidth > clientWidth` in headless Chromium); 0 contrast failures.
5. **Model run**: 60 trees from Claude, one brief, seeded directives, no curation, under both prompt conditions; validate, repair, render, sheet, compute the metrics in 13, run the human test.
6. **Pass criteria**, fixed now: ≥ 90% of trees valid after at most one repair pass and no re-prompt; 0 overflow; ≥ 30 distinct hero skeletons in 60; ≥ 40% novel; 0 pairs at or above threshold after the selector; ≥ 70% rated designed. Any miss is reported with the same honesty as Gate 2 and the language is adjusted (usually: a rule tightened or a primitive dropped, with Overlay first in line) before re-running.

Estimated size: `composition.ts` and its tests around 800 lines; the primitive renderer roughly the size of the A.1 harness; the fixtures are data. Same throwaway discipline as Phases A and A.1: proof branch, evidence committed, canonical docs updated only after the gate passes.
