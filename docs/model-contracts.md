# Model Contracts
## Event Identity, DesignIntent and Composition prompts and structured-output schemas

**Status:** Revision 2 — composition-language baseline  
**Prompt versions:** `event_identity_v2`, `design_intent_v4`, `composition_v1_p2`  
**Schema versions:** `event_identity_schema_v2`, `design_intent_schema_v4`, `composition_schema_v1`  
**PRD:** `../spec.md` Revision 6  
**Renderer:** `event-renderer-system.md` Revision 2

This document defines the three strong-model creative contracts in the MVP. The goal is not merely valid JSON. The goal is **faithful user-intent capture, predictable diversity, low prompt-injection exposure, stable schema evolution, and deterministic handoff to application code**.

---

# 1. The three calls

```text
Host prompt + private inspiration
        ↓
generateEventIdentity(...)                 strong model
        ↓
EventIdentity
        ↓
deterministic sibling planner              three DesignIntent assignments, three directives, token allotments
        ↓
generateDesignIntent(...) × 3              strong model, parallel
        ↓
DesignIntent × 3
        ↓
generateComposition(...) × 3               strong model, parallel
        ↓
CompositionTree × 3
        ↓
deterministic compiler                     validate → repair → caps → canonicalize → page system + palette → layout → geometry verification
        ↓
ResolvedDesignSpec × 3
```

Strong models are used only for Event Identity, DesignIntent and Composition. The compiler is application code and calls no model.

---

# 2. Versioning requirements

Prompts and schemas are versioned production assets:

```ts
export const EVENT_IDENTITY_PROMPT_VERSION = "event_identity_v2"
export const EVENT_IDENTITY_SCHEMA_VERSION = "event_identity_schema_v2"
export const DESIGN_INTENT_PROMPT_VERSION  = "design_intent_v4"
export const DESIGN_INTENT_SCHEMA_VERSION  = "design_intent_schema_v4"
export const COMPOSITION_PROMPT_VERSION    = "composition_v1_p2"
export const COMPOSITION_SCHEMA_VERSION    = "composition_schema_v1"
export const PRIMITIVE_SET_VERSION         = "composition_v1"
export const COMPILER_VERSION              = "…"
```

Record every version with generation telemetry. Do not silently edit a production prompt while keeping the same version. The primitive set is versioned separately from the compiler because the renderer must support every set that has a live spec.

The composition prompt's primitive spec and rules blocks are **generated from the validator's spec table**; the JSON Schema is generated from the same table. Never hand-edit either.

---

# 3. Provider-neutral structured output

The JSON files in `model-schemas/` are the canonical validation schemas. Provider structured-output modes enforce JSON Schema unevenly; the application **always** runs the canonical schema validator plus the structural validator on every response. For the composition call the application validator is stricter than JSON Schema (unknown keys, node-count and section-count limits, nesting, coverage, capabilities) and is the one that decides.

The Phase B confirmation run used raw JSON output without provider-side schema enforcement, so schema validity is a measured property of the prompt, not of the provider. Provider enforcement, where available, is a free improvement on top.

---

# 4. Event Identity

**This call is the product's creative interpreter, not a preprocessing step.** Its question is
*what does this host mean, and what creative world should this event belong to?*, and the bar on its
output is that a strong human designer reading it would know what assignment they had been given.
It is also the only call that sees the raw host prompt (§1, §6.1): a raw prompt is never forwarded
into a generic website- or image-generation prompt, so whatever this call fails to understand is
lost for the rest of the pipeline. `product-doctrine.md §3`–`§5` state what that means for
interpretation, and in particular the boundary this call must hold: **aesthetic implication is
inferred; a date, a venue, a dress code or any other fact is quoted from the host or absent.**

Unchanged from Revision 1 except the catalogs: `availableHeroArchetypes` becomes `availableFamilies` (`editorial`, `invitation`, `statement`, each with an intent sentence) and `compatibleHeroArchetypes` becomes `compatibleFamilies`. Runtime narrowing, semantic invariants, the untrusted-input rules and evals EI-01…EI-10 stand with that substitution. `docs/model-prompts/event-identity.system.md` carries the family catalog.

## 4.5 Creative-understanding evaluation contract

Everything else in this document measures whether output is **legal**. This measures whether it is
**right**, which is the capability Phase 4 exists to deliver (`product-doctrine.md §3`). Phase 4 is
not complete without it.

**Corpus:** `docs/model-evals/creative-understanding.json` (`creative_understanding_v1`), fourteen
cases. It is deliberately small and deliberately durable: vague and taste-heavy prompts, prompts
carrying a negative constraint, prompts already clear enough that the right number of questions is
zero, prompts carrying facts that must survive verbatim, one open delegation, and one genuinely
ambiguous case where a question should earn its place. Each case declares its class, the facts the
host actually supplied, whether clarification is expected, and what would count as an outright
failure. It is data; **no runner exists yet, and this pass does not build one.**

### The rubric

Seven dimensions apply to `EventIdentity` alone and are gradeable as soon as the call exists. Three
more become gradeable only when later stages do.

| # | Dimension | Question | Method |
| --- | --- | --- | --- |
| 1 | Intent understanding | Did it capture the actual vibe and subtext rather than keyword-match? | **Qualitative** |
| 2 | Creative vocabulary | Are the inferred associations coherent, specific, and useful to a designer? | **Qualitative** |
| 3 | Taste / cliché avoidance | Where the prompt asked for restraint, did it avoid the obvious, cheesy or over-literal reading? | **Mixed** — `mustAvoid` is deterministic; whether the rest reads as cliché is not |
| 4 | Fact discipline | Did it invent no venue, date, location, dress code or preference the host did not supply, while carrying supplied facts verbatim? | **Deterministic** — compare against the case's `facts` |
| 5 | Clarification judgment | Did it ask only when ambiguity materially affects the creative identity, ask nothing when the prompt was sufficient, ask no logistics, stay within the ceiling, and always offer a `You decide` option? | **Mixed** — count, ceiling, logistics-freedom and the `You decide` option are deterministic; whether a question was *worth asking* is not |
| 6 | Reference translation | Did a named reference become original visual language, with no logo, proprietary character or campaign artwork? | **Mixed** — `mustAvoid` terms are deterministic; genuine originality is not |
| 7 | Downstream usefulness | Would a strong human designer know what assignment they had been given? | **Qualitative** |
| 8 | Direction diversity | Are the three directions genuinely different creative expressions rather than palette or font swaps? | **Mixed** — the skeleton signature and planner distinctness (§5.3, `spec.md §11.9`) are deterministic and necessary; whether they *feel* like different ideas is not. Requires DesignIntent |
| 9 | Intent fidelity | Do all three remain faithful to the interpreted identity? | **Qualitative.** Requires DesignIntent |
| 10 | One-shot quality | Does the result need personalization, or rescue? | **Human gate.** Requires the full stack; judged at Human Test #2 |

**Do not pretend all ten automate.** Four of the seven identity dimensions are wholly or partly
deterministic — fact discipline fully, and cliché avoidance, clarification judgment and reference
translation in their negative half, which is the half that catches outright failures. Intent
understanding, creative vocabulary and downstream usefulness need a qualitative evaluator, and the
one-shot bar needs humans. A mechanical pass on 3–6 is necessary and never sufficient.

### What this does not become

A benchmark project. Fourteen cases, one rubric, run against a real model when Phase 4 has one. Do
not grow the corpus to chase coverage, do not build a scoring service, and do not gate ordinary
code changes on it — it measures the creative stack, not the compiler.

---

---

# 5. DesignIntent (design_intent_v4)

## 5.1 Contract

```ts
DesignIntent {
  family: "editorial" | "invitation" | "statement"     // assigned
  tonalDirection: "light" | "mid" | "dark"               // assigned
  palette: { colors: string[]; dominant: string }        // 3–5 uppercase hex; dominant ∈ colors
  typographyPairing: TypographyPairingId                 // from the allowed list, in the assigned category
  density: "compact" | "balanced" | "spacious"
  composition: {
    asymmetry:       "symmetric" | "gentle" | "strong"
    hierarchy:       "restrained" | "editorial" | "dramatic" | "monumental"
    rhythm:          "continuous" | "alternating" | "punctuated"
    sectionContrast: "low" | "moderate" | "high"
    ornament:        "none" | "restrained" | "decorative"
  }
  motifs: MotifId[]
}
+ presentation { name, description }                     // host-facing, never compiled (§21 of Revision 1 stands)
```

`family` replaces `heroArchetype`. It is a design grammar the composition call is conditioned on, not a bundle: the compiler enforces no family rule; family lints are recorded as `intentDeviations`, never repaired. `composition` values are directives to the composition call and measurements taken from the tree afterwards; they select nothing.

**v4 reconciliation.** v3's schema had drifted from the production vocabulary in three ways, all corrected together because they are one drift:

- `typographyPairing` carried six category-shaped IDs. Pairing and category are different things: there are six categories and twelve concrete pairings, two per category. The v4 enum is the twelve, and runtime narrowing filters to the assigned category and, at monumental hierarchy, to the pairings that hold there.
- `motifs` carried a ten-item catalog (`plaid_restrained`, `botanical_line`, `deco_border`, …) that no longer exists. The v4 enum is the seven curated IDs — four patterns (`plaid`, `stripe`, `gingham`, `linen`) and three arrangements (`equestrian`, `botanical`, `celestial`).
- schema and prompt descriptions still said `archetype`, which Revision 6 removed. v4 says `family`, names the page system as compiler-owned, and names structure as the later composition call's.

Creative responsibilities are unchanged: the planner assigns family, tone, typography category and hierarchy; the strong model returns the DesignIntent; the composition call authors structure. v3 is preserved at `docs/model-schemas/history/design-intent.v3.schema.json` and `docs/model-prompts/history/design-intent.v3.system.md`.

## 5.2 Input, assembly, narrowing, validation

As Revision 1 §9–§12 with `assignment.family` in place of `assignment.heroArchetype`, `family` narrowed to the assigned value, the compatible hierarchies narrowed by family (`invitation` excludes `monumental`; `statement` allows only `dramatic` and `monumental`), and typography pairings filtered by category and by whether they hold at the assigned hierarchy. The one-retry rule stands: one repair retry for structurally invalid output; no model calls for compatibility repair.

## 5.3 Evals

DI-01…DI-11 stand with `family` substituted; add:
- **DI-12 — composition realism**: assigned `statement` + `monumental`; expect a pairing that holds at monumental and `ornament` in none/restrained.
- **DI-13 — family is not a bundle**: the model must not mention section treatments; the six fields plus presentation only.

---

# 6. Composition (composition_v1_p2)

## 6.1 Input contract

```ts
type GenerateCompositionInput = {
  eventIdentity: EventIdentity                       // design brief, constraints, motif/texture direction
  contentProfile: { titleWords; titleChars; hostsChars; venueChars; descriptionChars; registryCounts; provisionalFields[] }   // real content where present, bounded provisional content elsewhere (spec.md §7.3)
  capabilities: Capabilities                         // enabled features, never content presence: rsvp, registry, gifts, externalRegistry, cashFund, hosts, description, time, location, deadline
  designIntent: DesignIntent                         // this concept's, already validated
  directive: Directive                               // eight dimensions, assembled sentence (planner)
  forbiddenTokens: AttractiveTokenId[]               // allotment for this sibling (planner)
  examples: CompositionTree[]                        // three library pages rotated by seed
  primitiveSpec: string; rules: string               // generated from the validator table
  avoid?: string[]                                   // collision re-prompt only: sibling hero skeletons
}
```

Do not send guest data, RSVP data, registry contents, private codes, or prior ResolvedDesignSpecs.

## 6.2 Message assembly

System message: `docs/model-prompts/composition.system.md`. User message: the numbered blocks in that file, every block a separate structured field; user text is never interpolated into instructions.

## 6.3 Validation and repair

Order, all deterministic except the two re-prompts:

1. **Strict schema** (unknown keys fail; enum-typed tokens must be strings, counts numbers, `ruled` boolean). Failure → one re-prompt with the error list. Second failure → library fallback for the whole page; telemetry `fallback: library`.
2. **Structural validation and repair**: nesting matrix, depth, per-section and per-page limits, box depth, coverage (conditional on capabilities), capability references, component placement, surface sequence, motif kind, responsive intent. Every repair logged `{ rule, path, kind, before, after }`.
3. **Attractive-token caps**: a tree using a token this sibling was not allotted earns one re-prompt; if it persists, deterministic neutralization logged as `planner`.
4. **Content-fit estimate** (advisory) → **canonicalize** → page system, palette, typography → **layout resolution** → **rendered-geometry verification** (authoritative; `verified.clean` must be true).
5. **Selector**: signature against batch siblings and redesign history; collision → one re-prompt with the colliding skeletons; second collision → library fallback.

Re-prompts exist only for schema-invalid output, a token-cap violation and a selector collision. Repairs of every other kind never call a model and are reported separately from schema validity.

## 6.4 Evals

- **CO-01 — schema on first call**: ≥ 90% of responses parse strictly; 100% after one re-prompt.
- **CO-02 — zero violations**: ≥ 45% of raw trees break no structural rule; 100% repair to zero remaining.
- **CO-03 — capabilities**: an event whose registry, cash fund or description feature is disabled yields no reference to them in 100% of trees; an event with the features enabled but no content yet still receives designed sections for them.
- **CO-11 — re-fit**: replacing a short venue with a long one on a compiled concept produces a new resolved-spec revision with the same composition hash, no model call, and `verified.clean` true.
- **CO-04 — geometry**: 100% of specs verify clean at 390 and 1280.
- **CO-05 — invention**: ≥ 30 distinct hero skeletons and ≥ 40% novel against the library in 60.
- **CO-06 — caps**: each attractive token in ≤ 1/3 of heroes in a batch run; ≤ 5% of trees need neutralization.
- **CO-07 — collisions**: 0 sibling pairs at or above .70 after the selector.
- **CO-08 — directives**: structure, surface, details and RSVP-intro compliance ≥ 90%; date and opening ≥ 70%.
- **CO-09 — adversarial feedback**: feedback asking for CSS, images, a tenth section or free copy yields an ordinary tree.
- **CO-10 — review**: model screens do not collapse into a small number of recurring template groups, and do not simply map onto the library groups, on unlabeled grayscale sheets. **The human design-quality rate is deliberately not a threshold here**: it is a launch gate rather than a confirmation-run metric, Human Test #1 established no pass/fail result, and Human Test #2 calibrates its own threshold (`spec.md §11.9`). The ≥ 70% figure in earlier revisions was provisional and never approved as settled.

**What these evals do not cover.** CO-01…CO-11 measure whether output is *legal* — schema,
structure, geometry, diversity, directive compliance. None measures whether it is *right* for the
event the host described, and CO-10 cannot: unlabeled grayscale sheets remove the brief and the
palette by construction. This document's own goal statement — "faithful user-intent capture" (§0) —
is therefore asserted and not tested, and theme fidelity is first judged at Phase 10, the launch
gate. `product-doctrine.md §3` explains why that gap is the expensive one, and its §14 conflict 3
and §15 record the recommendation to close it with understanding evals before Phase 4 generation
code is written. No such eval is defined yet.

Thresholds are those of `proof-b/RESULTS.md` and `proof-b/FINAL.md`; rerun them whenever prompt, schema, primitive set, compiler, renderer rules or planner change.

---

# 7. Prompt-injection boundary

As Revision 1 §15, plus: the composition response is a tree of enums; the application never renders a string from it. Free text in any field is a schema failure. Model prose is never authorization.

---

# 8. Retry and fallback policy

| Call | Provider failure | Invalid structured output | Compatibility problem |
| --- | --- | --- | --- |
| Event Identity | ordinary transient retry | one repair retry, then fail visibly | — |
| DesignIntent | ordinary transient retry | one repair retry, then fail visibly | deterministic repair, logged |
| Composition | ordinary transient retry | one repair re-prompt, then library fallback for the page | deterministic repair, logged; collision or token-cap → one re-prompt, then library |

A library fallback is a valid, coherent page and is recorded as such; it is never presented as a model composition in evaluation.

---

# 9. Files

Prompts: `model-prompts/event-identity.system.md`, `model-prompts/design-intent.system.md`, `model-prompts/composition.system.md`.  
Schemas: `model-schemas/event-identity.schema.json`, `model-schemas/design-intent.schema.json`, `model-schemas/composition.schema.json` (generated).  
Reference implementation of the validator, repair, planner and signature: `proof-b/` until the production package replaces it.
