/**
 * Semantic palette compiler: raw creative palette + tonal direction -> accessible event tokens.
 *
 * Acceptance criteria — `spec.md §31 — DesignIntent, composition and compiler`:
 *   - "Raw palette is never directly consumed as renderer background/text/button semantics."
 *   - "Semantic palette compiler produces all required event tokens."
 *   - "Required normal text/button contrast clears 4.5:1."
 *   - "Required non-text/focus contrast clears applicable 3:1 thresholds."
 *   - "Palette-control unit test proves navy-on-navy states are impossible."
 * Also `spec.md §31 — Responsive/accessibility`: the WCAG thresholds above are the same ones the
 * guest surfaces are judged against.
 * Guardrails: `spec.md §32` #25 (raw palette roles are never consumed as backgrounds/text/
 * buttons), #26 (semantic palette compiler + contrast validation), #27 (manual palette overrides
 * run through this same compiler).
 * Canon: `docs/design-system.md §15.6` fixes the role set; `spec.md §11.7` fixes the OKLCH
 * approach and keeps the palette-control regression a unit test; `docs/history/spec_v4.md §11.6`
 * fixes the failure policy — when proposed colours fail contrast, adjust derived values in code
 * rather than rejecting the concept.
 *
 * ---------------------------------------------------------------------------------------------
 * DERIVATION STRATEGY
 *
 * Every token is built by `emit()` from three numbers — lightness, chroma, hue — and nothing
 * else. An authored hex is read exactly once, at the top of `compileSemanticPalette`, and is
 * converted straight to OKLCH; the hex strings never reach derivation, so a raw colour cannot
 * become a role by being copied. It can only be *re-derived*, and only at a lightness the role's
 * contrast target admits.
 *
 * Hue is the creative signal, so hue is never moved. The dominant hue carries the page: surfaces
 * are dominant-hued tints, ink is dominant-hued at near-zero chroma, and the button is the
 * dominant hue at full allowed chroma, so the dominant still reads as dominant. A second hue,
 * picked deterministically as the authored colour furthest around the wheel from the dominant,
 * carries `accent`, `surfaceAccent` and `focus`.
 *
 * Reaching a contrast target therefore moves lightness first and chroma only as a last resort:
 * the search walks outward from the role's ideal lightness in 0.005 steps at full chroma before
 * it gives up any chroma at all, and it stops at the first candidate that satisfies every
 * constraint. A dulled colour still reads as the same colour; a re-hued one does not.
 * ---------------------------------------------------------------------------------------------
 */

import type { DesignIntent, Deviation } from "@/lib/renderer/design-intent";

/**
 * Exactly the two inputs `docs/design-system.md §15.6` names: "Raw palette + tonal direction
 * compile into ...". Narrowing the parameter makes that a type-level fact — family, hierarchy,
 * density and the composition object cannot reach the palette even by accident.
 */
export type PaletteInput = Pick<DesignIntent, "palette" | "tonalDirection">;
import type { Tone } from "@/lib/renderer/vocabulary";

import {
  contrastRatio,
  gamutMapOklch,
  hexToOklch,
  formatHex,
  type Oklch,
} from "@/lib/renderer/compile/color";

/* ============================================================================================
 * Role set — `docs/design-system.md §15.6`, exactly. Nothing speculative is added.
 * ========================================================================================== */

export interface SemanticPalette {
  /** Page ground. */
  readonly surfaceBase: string;
  /** Secondary page ground for alternating sections and cards. */
  readonly surfaceAlt: string;
  /** Inverted band. */
  readonly surfaceContrast: string;
  /** Accent-tinted band. */
  readonly surfaceAccent: string;

  /** Body/heading ink on `surfaceBase` and `surfaceAlt`. */
  readonly text: string;
  /** De-emphasised ink on `surfaceBase` and `surfaceAlt`; still normal-size text. */
  readonly textMuted: string;
  /** Ink on `surfaceContrast`. */
  readonly textOnContrast: string;
  /** Ink on `surfaceAccent`. */
  readonly textOnAccent: string;

  /** Primary action fill. */
  readonly button: string;
  /** Ink on `button`. */
  readonly buttonText: string;

  /** Filled emphasis mark (chip, badge, rule fill). */
  readonly accent: string;
  /** Ink on `accent`. */
  readonly accentText: string;

  /** Hairlines, field and card boundaries on the page surfaces. */
  readonly border: string;
  /** Focus indicator drawn on the page surfaces. */
  readonly focus: string;

  /** Error ink on the page surfaces, and error fill. */
  readonly error: string;
  /** Ink on `error`. */
  readonly errorText: string;
}

export type SemanticRole = keyof SemanticPalette;

export interface CompiledPalette {
  readonly palette: SemanticPalette;
  readonly deviations: readonly Deviation[];
}

/* ============================================================================================
 * Targets and tuning constants.
 * ========================================================================================== */

/** WCAG 2.2 SC 1.4.3 — normal-size text. */
export const CONTRAST_TEXT = 4.5;
/** WCAG 2.2 SC 1.4.11 / 2.4.11 — non-text contrast and focus indicators. */
export const CONTRAST_NON_TEXT = 3;

/**
 * The contract every emitted token is held to. Exported so the tests can enumerate the same
 * table the compiler enforces rather than a hand-copied one that could drift from it.
 */
export const ROLE_CONTRACT: ReadonlyArray<{
  readonly role: SemanticRole;
  readonly against: readonly SemanticRole[];
  readonly min: number;
  readonly why: string;
}> = [
  { role: "surfaceContrast", against: ["surfaceBase"], min: CONTRAST_NON_TEXT, why: "band reads" },
  { role: "text", against: ["surfaceBase", "surfaceAlt"], min: CONTRAST_TEXT, why: "body text" },
  {
    role: "textMuted",
    against: ["surfaceBase", "surfaceAlt"],
    min: CONTRAST_TEXT,
    why: "still normal-size text",
  },
  { role: "textOnContrast", against: ["surfaceContrast"], min: CONTRAST_TEXT, why: "body text" },
  { role: "textOnAccent", against: ["surfaceAccent"], min: CONTRAST_TEXT, why: "body text" },
  {
    role: "button",
    against: ["surfaceBase", "surfaceAlt"],
    min: CONTRAST_NON_TEXT,
    why: "interactive boundary",
  },
  { role: "buttonText", against: ["button"], min: CONTRAST_TEXT, why: "label on fill" },
  {
    role: "accent",
    against: ["surfaceBase", "surfaceAlt"],
    min: CONTRAST_NON_TEXT,
    why: "graphical object",
  },
  { role: "accentText", against: ["accent"], min: CONTRAST_TEXT, why: "label on fill" },
  {
    role: "border",
    against: ["surfaceBase", "surfaceAlt"],
    min: CONTRAST_NON_TEXT,
    why: "component boundary",
  },
  {
    role: "focus",
    against: ["surfaceBase", "surfaceAlt"],
    min: CONTRAST_NON_TEXT,
    why: "focus indicator",
  },
  {
    role: "error",
    against: ["surfaceBase", "surfaceAlt"],
    min: CONTRAST_TEXT,
    why: "error message text",
  },
  { role: "errorText", against: ["error"], min: CONTRAST_TEXT, why: "label on fill" },
];

/**
 * Ideal OKLCH lightness per role per tonal direction.
 *
 * `surfaceBase` is deliberately far apart across the three directions (0.97 / 0.82 / 0.18) —
 * `spec.md §31` requires the same brief to yield materially different concepts, and a tonal
 * direction that did not visibly change the ground would not be a tonal direction.
 *
 * The other values are chosen so that a well-behaved palette clears every target at its ideal
 * and the search never has to move: a recorded deviation then means something real happened,
 * rather than being the normal case.
 */
const TONE_BANDS: Record<Tone, Record<SemanticRole, number>> = {
  light: {
    surfaceBase: 0.97,
    surfaceAlt: 0.93,
    surfaceContrast: 0.24,
    surfaceAccent: 0.91,
    text: 0.24,
    textMuted: 0.46,
    textOnContrast: 0.95,
    textOnAccent: 0.24,
    button: 0.46,
    buttonText: 0.97,
    accent: 0.46,
    accentText: 0.97,
    border: 0.6,
    focus: 0.56,
    error: 0.46,
    errorText: 0.97,
  },
  mid: {
    surfaceBase: 0.82,
    surfaceAlt: 0.75,
    surfaceContrast: 0.26,
    surfaceAccent: 0.77,
    text: 0.22,
    textMuted: 0.34,
    textOnContrast: 0.94,
    textOnAccent: 0.22,
    button: 0.38,
    buttonText: 0.96,
    accent: 0.38,
    accentText: 0.96,
    border: 0.44,
    focus: 0.42,
    error: 0.36,
    errorText: 0.96,
  },
  dark: {
    surfaceBase: 0.18,
    surfaceAlt: 0.24,
    surfaceContrast: 0.93,
    surfaceAccent: 0.27,
    text: 0.94,
    textMuted: 0.7,
    textOnContrast: 0.22,
    textOnAccent: 0.94,
    button: 0.72,
    buttonText: 0.18,
    accent: 0.72,
    accentText: 0.18,
    border: 0.54,
    focus: 0.62,
    error: 0.7,
    errorText: 0.2,
  },
};

/**
 * Maximum chroma a role may carry, regardless of how saturated the authored colour is.
 *
 * These are a design decision, not a contrast one: a page ground at the chroma of a saturated
 * navy is a navy page, not a navy-tinted page. Capping here (rather than in the search) also
 * keeps deviations meaningful — giving up chroma the role was never allowed to have is not a
 * deviation, giving up chroma it was allowed to have is.
 */
export const CHROMA_CAPS: Record<SemanticRole, number> = {
  surfaceBase: 0.018,
  surfaceAlt: 0.028,
  surfaceContrast: 0.045,
  surfaceAccent: 0.05,
  text: 0.02,
  textMuted: 0.022,
  textOnContrast: 0.02,
  textOnAccent: 0.02,
  button: 0.16,
  buttonText: 0.018,
  accent: 0.16,
  accentText: 0.018,
  border: 0.035,
  focus: 0.12,
  error: 0.16,
  errorText: 0.018,
};

/** Which authored hue each role rides. */
const ROLE_HUE: Record<SemanticRole, "dominant" | "accent" | "error"> = {
  surfaceBase: "dominant",
  surfaceAlt: "dominant",
  surfaceContrast: "dominant",
  surfaceAccent: "accent",
  text: "dominant",
  textMuted: "dominant",
  textOnContrast: "dominant",
  textOnAccent: "accent",
  button: "dominant",
  buttonText: "dominant",
  accent: "accent",
  accentText: "accent",
  border: "dominant",
  focus: "accent",
  error: "error",
  errorText: "error",
};

/**
 * Error stays red. It is a status colour before it is a design colour, and a brief whose palette
 * happens to be green must not produce a green error state.
 */
const ERROR_HUE = 25;
const ERROR_CHROMA = 0.16;

/** Search ladder: full chroma at every lightness first, chroma given up only afterwards. */
const CHROMA_SCALES = [1, 0.75, 0.5, 0.3, 0.15, 0] as const;
const LIGHTNESS_STEP = 0.005;
const MAX_LIGHTNESS_STEPS = 200;
/** Chroma given up to the sRGB gamut beyond this is worth recording. */
const GAMUT_LOSS_THRESHOLD = 0.005;

/* ============================================================================================
 * Derivation.
 * ========================================================================================== */

/**
 * The one and only place a token hex is produced. It takes numbers, never a colour string, which
 * is what makes "a raw authored colour cannot become a role" structural rather than a convention:
 * there is no code path from an input hex to an output token that does not pass through OKLCH.
 */
function emit(l: number, c: number, h: number): { hex: string; chromaLoss: number } {
  const mapped = gamutMapOklch({ l, c, h });
  return { hex: formatHex(mapped.rgb), chromaLoss: mapped.chromaLoss };
}

/** One "must be legible against / distinguishable from" requirement. */
export interface ContrastConstraint {
  /** Name of the adjacent colour, used in deviation detail. */
  readonly label: string;
  readonly hex: string;
  /** WCAG ratio the pair must reach. */
  readonly min: number;
}

export interface DerivationRequest {
  /** Dotted path of the token being derived, for deviation reporting. */
  readonly path: string;
  /** OKLCH lightness the design wants. */
  readonly idealL: number;
  /** OKLCH chroma the design wants; already capped by the caller. */
  readonly chroma: number;
  /** OKLCH hue, in degrees. Never moved. */
  readonly hue: number;
  readonly constraints: readonly ContrastConstraint[];
}

export interface DerivationResult {
  readonly hex: string;
  readonly deviations: readonly Deviation[];
}

function satisfies(hex: string, constraints: readonly ContrastConstraint[]): boolean {
  return constraints.every((con) => contrastRatio(hex, con.hex) >= con.min);
}

function worstRatio(hex: string, constraints: readonly ContrastConstraint[]): number {
  return constraints.reduce(
    (worst, con) => Math.min(worst, contrastRatio(hex, con.hex)),
    Number.POSITIVE_INFINITY,
  );
}

function describe(constraints: readonly ContrastConstraint[]): string {
  return constraints.map((con) => `${con.label}>=${con.min}:1`).join(", ");
}

/**
 * The single derivation primitive: walk outward from `idealL` at a fixed hue until every
 * constraint is met, and report what that cost.
 *
 * Every semantic role goes through here, and `spec.md §32` #27 ("palette/manual palette
 * overrides run through the same compiler") means a host override path must go through here too
 * rather than growing a second contrast implementation — which is why it is exported rather than
 * private to `compileSemanticPalette`.
 *
 * Order is load-bearing and fixed: chroma scale outermost (so lightness is exhausted before any
 * chroma is surrendered), then step size ascending (so the result is the *closest* satisfying
 * lightness to the ideal), then the away-from-background direction before the toward-background
 * one. Nothing here consults a random source, a clock, or object iteration order.
 *
 * With the tone bands in this module the search never actually has to move — that is what
 * "contrast by construction" means, and the regression suite sweeps the whole sRGB hue/chroma/
 * lightness space to confirm it. The walk is the safety net that keeps the guarantee true if the
 * bands are ever retuned or an override introduces a surface these bands did not anticipate.
 */
export function deriveAccessibleColor(request: DerivationRequest): DerivationResult {
  const { path, idealL, chroma, hue, constraints } = request;
  const ideal = emit(idealL, chroma, hue);
  const deviations: Deviation[] = [];

  const noteGamut = (hex: string, chromaLoss: number): void => {
    if (chromaLoss > GAMUT_LOSS_THRESHOLD) {
      deviations.push({
        kind: "gamut",
        rule: "srgb-gamut-clamp",
        path,
        before: `oklch(${idealL.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(1)})`,
        after: hex,
        detail: `chroma reduced by ${chromaLoss.toFixed(3)} to stay inside sRGB`,
      });
    }
  };

  if (constraints.length === 0 || satisfies(ideal.hex, constraints)) {
    noteGamut(ideal.hex, ideal.chromaLoss);
    return { hex: ideal.hex, deviations };
  }

  // Head away from the backgrounds we must separate from, not into them.
  const backgroundL =
    constraints.reduce((sum, con) => sum + hexToOklch(con.hex).l, 0) / constraints.length;
  const primary = idealL <= backgroundL ? -1 : 1;

  for (const scale of CHROMA_SCALES) {
    const c = chroma * scale;
    for (let step = 1; step <= MAX_LIGHTNESS_STEPS; step += 1) {
      for (const sign of [primary, -primary]) {
        const l = idealL + sign * step * LIGHTNESS_STEP;
        if (l < 0 || l > 1) continue;
        const candidate = emit(l, c, hue);
        if (!satisfies(candidate.hex, constraints)) continue;
        deviations.push({
          kind: "contrast",
          rule: "wcag-contrast-derivation",
          path,
          before: ideal.hex,
          after: candidate.hex,
          detail:
            `ideal lightness ${idealL.toFixed(3)} could not hold ${describe(constraints)}; ` +
            `derived at lightness ${l.toFixed(3)}` +
            (scale < 1 ? ` with chroma reduced to ${(scale * 100).toFixed(0)}%` : ""),
        });
        noteGamut(candidate.hex, candidate.chromaLoss);
        return { hex: candidate.hex, deviations };
      }
    }
  }

  // Unreachable for any palette in the regression corpus, and kept rather than thrown because
  // `docs/history/spec_v4.md §11.6` forbids rejecting a concept over colour. Black and white are
  // the extremes of sRGB, so one of them is the best achromatic answer that exists.
  const fallback = ["#000000", "#FFFFFF"].reduce((best, candidate) =>
    worstRatio(candidate, constraints) > worstRatio(best, constraints) ? candidate : best,
  );
  deviations.push({
    kind: "unsatisfiable",
    rule: "wcag-contrast-derivation",
    path,
    before: ideal.hex,
    after: fallback,
    detail:
      `no lightness at hue ${hue.toFixed(1)} satisfies ${describe(constraints)}; ` +
      `fell back to the best sRGB extreme (worst ratio ${worstRatio(fallback, constraints).toFixed(2)}:1)`,
  });
  return { hex: fallback, deviations };
}

/* ============================================================================================
 * Hue selection.
 * ========================================================================================== */

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * The accent hue is the authored colour furthest around the wheel from the dominant, so the
 * accent reads as a *second* colour rather than a shade of the first. Ties break on higher
 * chroma then lower index in `colors`, which makes the choice a pure function of the authored
 * list — no sorting of an object, no locale, no clock.
 */
function pickAccent(colors: readonly Oklch[], dominant: Oklch): Oklch {
  let best: Oklch | null = null;
  let bestDistance = -1;
  for (const color of colors) {
    if (color === dominant) continue;
    const distance = hueDistance(color.h, dominant.h);
    if (
      distance > bestDistance ||
      (distance === bestDistance && best !== null && color.c > best.c)
    ) {
      best = color;
      bestDistance = distance;
    }
  }
  return best ?? dominant;
}

/* ============================================================================================
 * Compiler.
 * ========================================================================================== */

/**
 * Compile a raw creative palette and a tonal direction into the semantic event tokens of
 * `docs/design-system.md §15.6`, with every contrast target met by construction.
 *
 * Pure and total: the same `DesignIntent` always yields a byte-identical palette, and no input
 * rejects a concept — a colour that cannot serve a role is re-derived and the adjustment is
 * returned in `deviations`.
 */
export function compileSemanticPalette(intent: PaletteInput): CompiledPalette {
  const deviations: Deviation[] = [];

  // The single crossing from authored strings into the numeric pipeline. Past this line the
  // compiler holds OKLCH triples only, so no later step can copy an input colour into a token.
  const authoredColors = intent.palette.colors.map((hex) => hexToOklch(hex));
  const dominantIndex = intent.palette.colors.indexOf(intent.palette.dominant);
  const dominant =
    dominantIndex >= 0 ? authoredColors[dominantIndex] : hexToOklch(intent.palette.dominant);

  if (dominantIndex < 0) {
    // Upstream semantic validation should have caught this (`design-intent.schema.json`:
    // "dominant ... Must exactly equal one member of colors"). Honour the dominant hue anyway and
    // record it rather than silently picking a different colour to lead the page.
    deviations.push({
      kind: "intent",
      rule: "dominant-in-colors",
      path: "designIntent.palette.dominant",
      before: intent.palette.dominant,
      after: intent.palette.dominant,
      detail: "dominant is not a member of palette.colors; used as the dominant hue regardless",
    });
  }

  const accent = pickAccent(authoredColors, dominant);

  const hueFor = (role: SemanticRole): { hue: number; chroma: number } => {
    switch (ROLE_HUE[role]) {
      case "dominant":
        return { hue: dominant.h, chroma: Math.min(dominant.c, CHROMA_CAPS[role]) };
      case "accent":
        return { hue: accent.h, chroma: Math.min(accent.c, CHROMA_CAPS[role]) };
      case "error":
        return { hue: ERROR_HUE, chroma: Math.min(ERROR_CHROMA, CHROMA_CAPS[role]) };
    }
  };

  const bands = TONE_BANDS[intent.tonalDirection];
  const tokens: Partial<Record<SemanticRole, string>> = {};

  const build = (role: SemanticRole, against: readonly SemanticRole[], min: number): void => {
    const { hue, chroma } = hueFor(role);
    const constraints: ContrastConstraint[] = against.map((token) => {
      const hex = tokens[token];
      if (hex === undefined) {
        throw new Error(`Role ${role} constrained against ${token}, which is not derived yet`);
      }
      return { label: token, hex, min };
    });
    const result = deriveAccessibleColor({
      path: `tokens.palette.${role}`,
      idealL: bands[role],
      chroma,
      hue,
      constraints,
    });
    tokens[role] = result.hex;
    deviations.push(...result.deviations);
  };

  const free = (role: SemanticRole): void => build(role, [], 0);

  // Order is a dependency order: a role is only ever constrained against a role already built.
  free("surfaceBase");
  free("surfaceAlt");
  build("surfaceContrast", ["surfaceBase"], CONTRAST_NON_TEXT);
  free("surfaceAccent");

  build("text", ["surfaceBase", "surfaceAlt"], CONTRAST_TEXT);
  build("textMuted", ["surfaceBase", "surfaceAlt"], CONTRAST_TEXT);
  build("textOnContrast", ["surfaceContrast"], CONTRAST_TEXT);
  build("textOnAccent", ["surfaceAccent"], CONTRAST_TEXT);

  build("button", ["surfaceBase", "surfaceAlt"], CONTRAST_NON_TEXT);
  build("buttonText", ["button"], CONTRAST_TEXT);

  build("accent", ["surfaceBase", "surfaceAlt"], CONTRAST_NON_TEXT);
  build("accentText", ["accent"], CONTRAST_TEXT);

  build("border", ["surfaceBase", "surfaceAlt"], CONTRAST_NON_TEXT);
  build("focus", ["surfaceBase", "surfaceAlt"], CONTRAST_NON_TEXT);

  build("error", ["surfaceBase", "surfaceAlt"], CONTRAST_TEXT);
  build("errorText", ["error"], CONTRAST_TEXT);

  const palette: SemanticPalette = {
    surfaceBase: tokens.surfaceBase!,
    surfaceAlt: tokens.surfaceAlt!,
    surfaceContrast: tokens.surfaceContrast!,
    surfaceAccent: tokens.surfaceAccent!,
    text: tokens.text!,
    textMuted: tokens.textMuted!,
    textOnContrast: tokens.textOnContrast!,
    textOnAccent: tokens.textOnAccent!,
    button: tokens.button!,
    buttonText: tokens.buttonText!,
    accent: tokens.accent!,
    accentText: tokens.accentText!,
    border: tokens.border!,
    focus: tokens.focus!,
    error: tokens.error!,
    errorText: tokens.errorText!,
  };

  return { palette, deviations };
}
