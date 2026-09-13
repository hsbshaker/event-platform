/**
 * Typography resolution: pairing → concrete fonts and a numeric, per-breakpoint type scale.
 *
 * `docs/design-system.md §15.2`: "the page system (borders, cards, buttons, type scale, spacing)
 * is compiler-owned". `docs/event-renderer-system.md §6` forbids CSS text derived from model
 * output — the renderer reads only classes and numeric custom properties — so this module emits
 * pixel numbers, never `clamp()` strings.
 *
 * # Source of the numeric scale
 *
 * `proof-b/renderer.js`'s `HIER` table encodes the display (`d`) and heading-2 (`h2`) sizes per
 * `Hierarchy` as CSS `clamp(min, preferred-vw, max)` strings; `harness.html` fixes the other two
 * emphasis steps (`em-secondary` at `1rem`, `em-caption`/`.kicker` at `.68rem`) independent of
 * hierarchy. `HIER_CLAMP` below ports the four clamp triples verbatim; `clampPx` evaluates the
 * real CSS `clamp()` semantics — `min(max(preferred, min), max)` — at the two verification
 * viewport widths (`docs/event-renderer-system.md`: rendered-geometry verification at 390 and
 * 1280), rather than assuming the preferred branch never wins. It does, for some rows: e.g.
 * `restrained.h2` evaluates to 30.72px at 1280, short of its 33.6px ceiling, and `dramatic.d` and
 * `monumental.d` fall short of their ceilings too. Assuming desktop == the max bound would have
 * been wrong for those rows.
 *
 * Weight and line-height per step are ported the same way, from `proof-b/harness.html`'s base
 * `.site` rules and its `em-display` / `em-primary` / `em-secondary` / `em-caption` rules:
 * `em-display`/`em-primary` share `var(--display-weight)` (600, or 800 for `grotesk_led` —
 * `renderer.js`'s `vars()`), at line-heights 1.02 and 1.08; `em-secondary` inherits the `.site`
 * base line-height (1.5) at the browser default weight (400); `.kicker`/`em-caption` is explicit
 * weight 700 at the inherited 1.5 line-height (no override in the reference).
 *
 * Deliberately not on `TypeStep`: letter-spacing. The reference applies one `--tracking` custom
 * property to both display and primary steps, and that value is `PageSystem.displayTracking`
 * (`compile/page-system.ts`) — a page-level compiler choice, not a property of the pairing. Only
 * this module's own numbers (size, line-height, weight) are always positive; tracking can be zero
 * or negative (`monumental`'s `[-0.05, -0.02]`), so keeping it off this type is also what keeps
 * every number `resolveTypography` emits positive.
 *
 * # Which typography-pairing set is canonical
 *
 * `../design-intent.ts` already resolves this in its module doc: the twelve concrete pairings in
 * `../vocabulary`, not the six-category enum in `docs/model-schemas/design-intent.schema.json`
 * (a stale artifact predating the family/composition revision). `DesignIntent.typographyPairing`
 * is typed to the twelve, so that is what this module narrows.
 */

import type { Emphasis } from "../composition/tokens";
import type { Deviation, DesignIntent } from "../design-intent";
import {
  TYPOGRAPHY,
  TYPOGRAPHY_KEYS,
  type Hierarchy,
  type TypographyCategory,
  type TypographyPairingId,
} from "../vocabulary";

export interface TypeStep {
  readonly sizePx: number;
  readonly lineHeight: number;
  readonly weight: number;
}

export type TypeSteps = Record<Emphasis, TypeStep>;

export interface TypeScale {
  readonly desktop: TypeSteps;
  readonly mobile: TypeSteps;
}

export interface ResolvedTypography {
  readonly pairing: TypographyPairingId;
  readonly category: TypographyCategory;
  readonly display: string;
  readonly body: string;
  readonly scale: TypeScale;
}

const REM_PX = 16;

/** `proof-b/renderer.js` `HIER`: [min-rem, preferred-vw, max-rem] per hierarchy, per step. */
const HIER_CLAMP: Record<
  Hierarchy,
  { display: readonly [number, number, number]; primary: readonly [number, number, number] }
> = {
  restrained: { display: [2, 4.6, 3.4], primary: [1.5, 2.4, 2.1] },
  editorial: { display: [2.6, 6.6, 5.2], primary: [1.8, 3.2, 2.8] },
  dramatic: { display: [3.2, 8.6, 7], primary: [2, 4, 3.4] },
  monumental: { display: [3.8, 11, 9.5], primary: [2.2, 4.8, 4.2] },
};

/** The two rendered-geometry verification viewport widths, `docs/event-renderer-system.md §6`. */
const VIEWPORT_PX = { mobile: 390, desktop: 1280 } as const;

/** `clamp(minRem, prefVw, maxRem)`, evaluated (not assumed) at `widthPx`. */
function clampPx(
  [minRem, prefVw, maxRem]: readonly [number, number, number],
  widthPx: number,
): number {
  const minPx = minRem * REM_PX;
  const maxPx = maxRem * REM_PX;
  const preferredPx = (prefVw / 100) * widthPx;
  return Math.min(Math.max(preferredPx, minPx), maxPx);
}

/** Fixed regardless of hierarchy — `proof-b/harness.html`'s `.em-secondary` rule. */
const SECONDARY_SIZE_PX = 1 * REM_PX;
/** Fixed regardless of hierarchy — `proof-b/harness.html`'s `.em-caption` / `.kicker` rule. */
const CAPTION_SIZE_PX = 0.68 * REM_PX;

/** `proof-b/renderer.js` `vars()`: `--display-weight`. Shared by the display and primary steps. */
function headingWeight(category: TypographyCategory): number {
  return category === "grotesk_led" ? 800 : 600;
}

function stepsAt(category: TypographyCategory, hierarchy: Hierarchy, widthPx: number): TypeSteps {
  const clamp = HIER_CLAMP[hierarchy];
  const weight = headingWeight(category);
  return {
    display: { sizePx: clampPx(clamp.display, widthPx), lineHeight: 1.02, weight },
    primary: { sizePx: clampPx(clamp.primary, widthPx), lineHeight: 1.08, weight },
    secondary: { sizePx: SECONDARY_SIZE_PX, lineHeight: 1.5, weight: 400 },
    caption: { sizePx: CAPTION_SIZE_PX, lineHeight: 1.5, weight: 700 },
  };
}

/** First pairing in catalog order that holds at monumental scale. Throws only if the catalog
 * itself carries no such pairing at all — a data-integrity fault, not a runtime input problem. */
function firstHoldingPairing(): TypographyPairingId {
  const found = TYPOGRAPHY_KEYS.find((id) => TYPOGRAPHY[id].holdsAtMonumental);
  if (!found) {
    throw new Error("typography catalog has no pairing that holds at monumental scale");
  }
  return found;
}

/** Nearest pairing in `category` that holds at monumental, in catalog order; `null` if none does. */
function nearestHoldingInCategory(category: TypographyCategory): TypographyPairingId | null {
  return (
    TYPOGRAPHY_KEYS.find(
      (id) => TYPOGRAPHY[id].category === category && TYPOGRAPHY[id].holdsAtMonumental,
    ) ?? null
  );
}

/**
 * Resolve `intent.typographyPairing` to concrete fonts and a numeric type scale.
 *
 * Deterministic in `intent` alone. At `hierarchy === "monumental"`, a pairing that does not
 * `holdsAtMonumental` is substituted — nearest pairing in the same category that holds, else the
 * first holding pairing in catalog order — and the substitution is recorded as a `Deviation`
 * (`docs/event-renderer-system.md §6`; never thrown, never silently kept).
 */
export function resolveTypography(intent: DesignIntent): {
  typography: ResolvedTypography;
  deviations: Deviation[];
} {
  const deviations: Deviation[] = [];
  let pairingId = intent.typographyPairing;
  let pairing = TYPOGRAPHY[pairingId];

  if (intent.composition.hierarchy === "monumental" && !pairing.holdsAtMonumental) {
    const sameCategory = nearestHoldingInCategory(pairing.category);
    const replacement = sameCategory ?? firstHoldingPairing();
    deviations.push({
      rule: "typography.monumental",
      detail: sameCategory
        ? `${pairingId} does not hold at monumental scale; substituted the nearest holding pairing in ${pairing.category}`
        : `${pairingId} does not hold at monumental scale and no pairing in ${pairing.category} does; substituted the first holding pairing in catalog order`,
      before: pairingId,
      after: replacement,
    });
    pairingId = replacement;
    pairing = TYPOGRAPHY[pairingId];
  }

  const typography: ResolvedTypography = {
    pairing: pairingId,
    category: pairing.category,
    display: pairing.display,
    body: pairing.body,
    scale: {
      desktop: stepsAt(pairing.category, intent.composition.hierarchy, VIEWPORT_PX.desktop),
      mobile: stepsAt(pairing.category, intent.composition.hierarchy, VIEWPORT_PX.mobile),
    },
  };

  return { typography, deviations };
}
