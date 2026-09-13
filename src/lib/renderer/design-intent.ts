/**
 * `DesignIntent` — the strong model's creative surface, as validated.
 *
 * `spec.md §7.8` and `docs/model-contracts.md §5`. The sibling planner assigns `family`,
 * `tonalDirection`, the typography category and the hierarchy (`spec.md §7.7`); the model returns
 * this object narrowed to that assignment. Nothing downstream of here calls a model.
 *
 * # What is deliberately NOT on this type
 *
 * `pageSystem` is **not** part of `DesignIntent`. `docs/event-renderer-system.md §6` puts it on
 * `ResolvedDesignSpec`, and `docs/design-system.md §15.2` says in as many words that "the page
 * system (borders, cards, buttons, type scale, spacing) is compiler-owned". The model never
 * proposes a border language, and the planner never assigns one.
 *
 * # Typography pairings
 *
 * `typographyPairing` is one of the twelve concrete curated pairings in `./vocabulary`, not one of
 * the six typography *categories*. `docs/model-contracts.md §5.1` keeps them distinct — a pairing
 * is "from the allowed list, in the assigned category" — and `docs/event-renderer-system.md §8`
 * needs a per-pairing `holdsAtMonumental`, which only the twelve carry.
 *
 * `docs/model-schemas/design-intent.schema.json` was reconciled to the twelve as
 * `design_intent_schema_v4`; v3's six category-shaped ids are preserved under
 * `docs/model-schemas/history/`. `tests/unit/model-contract.test.ts` now fails if the schema and
 * this vocabulary drift again.
 *
 * `proof-b/planner.js`'s `intentFor()` returned a `pageSystem` inside a fake DesignIntent, and
 * `proof-b/compile.js` passed it straight through to the spec. That is a harness stand-in: the
 * proof had no `generateDesignIntent` call and no page-system resolver, so it bundled model
 * simulation and compiler work into one object. Production separates them —
 * `compile/page-system.ts` resolves the page system from this type — and
 * `docs/phase-3-reference-defects.md` records the split.
 */

import type {
  Family,
  Hierarchy,
  Tone,
  TypographyCategory,
  TypographyPairingId,
} from "./vocabulary";

export type Density = "compact" | "balanced" | "spacious";
export type Asymmetry = "symmetric" | "gentle" | "strong";
export type Rhythm = "continuous" | "alternating" | "punctuated";
export type SectionContrast = "low" | "moderate" | "high";
export type Ornament = "none" | "restrained" | "decorative";

/** The seven curated motif ids. Pattern motifs fill areas; arrangement motifs are drawn marks. */
export type MotifId =
  "plaid" | "stripe" | "gingham" | "linen" | "equestrian" | "botanical" | "celestial";

export interface CompositionIntent {
  readonly asymmetry: Asymmetry;
  readonly hierarchy: Hierarchy;
  readonly rhythm: Rhythm;
  readonly sectionContrast: SectionContrast;
  readonly ornament: Ornament;
}

/**
 * The model's creative palette. **Raw creative input, never a rendering role.**
 *
 * `spec.md §32` #26 and `docs/design-system.md §15.6`: these values never directly become text,
 * background or button semantics. `compile/palette.ts` is the only module that reads them, and it
 * emits the semantic token set the renderer consumes.
 */
export interface RawPalette {
  /** 3–5 validated uppercase hex colors. */
  readonly colors: readonly string[];
  /** One member of `colors`. */
  readonly dominant: string;
}

export interface DesignIntent {
  readonly family: Family;
  readonly tonalDirection: Tone;
  readonly palette: RawPalette;
  readonly typographyPairing: TypographyPairingId;
  readonly density: Density;
  readonly composition: CompositionIntent;
  readonly motifs: readonly MotifId[];
}

/** Host-facing concept card metadata. Validated separately and never compiled (`spec.md §7.8`). */
export interface Presentation {
  readonly name: string;
  readonly description: string;
}

/**
 * A compatibility choice the compiler had to make because the model's output could not be
 * honoured as returned. Recorded, never repaired away silently (`docs/event-renderer-system.md
 * §6`; family lints are deviations, not repairs).
 */
export interface Deviation {
  /** What was deviated from, e.g. `typography.monumental` or `motif.role`. */
  readonly rule: string;
  readonly detail: string;
  readonly before?: string;
  readonly after?: string;
  /**
   * Why the compiler had to move, when the rule alone does not say. `gamut`: the authored value
   * left the sRGB gamut once derived. `contrast`: it could not clear its role's ratio as given.
   * `unsatisfiable`: no value clears it, and the safest available was used. `intent`: the model's
   * output was internally inconsistent (a `dominant` outside `colors`, say) and was honoured as
   * far as it could be. `budget`: a cap was already spent.
   */
  readonly kind?: "contrast" | "gamut" | "unsatisfiable" | "intent" | "budget";
  /** Dotted path of the affected token or node, where one exists. */
  readonly path?: string;
}

/** The typography category the pairing belongs to, for the planner's distinctness check. */
export type { Family, Hierarchy, Tone, TypographyCategory, TypographyPairingId };
