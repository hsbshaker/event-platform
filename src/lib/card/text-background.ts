/**
 * A box's text background (`TextBox.background`): the host's choice in the card editor of a fill
 * behind one box's lines — its type, limits, validation and starting values. Re-exported by
 * `text-box.ts`; kept apart, with no dependency beyond the colour maths, so the card component and
 * the editor's controls can use it without the line breaker and its fonts.
 *
 * Both renderers draw it from `card-data.ts` `textBackgroundGeometry`.
 */

import { isCanonicalHex, parseHex, relativeLuminance } from "./color";

/**
 * How a text background is drawn behind its box's lines (`card-data.ts` `textBackgroundGeometry`):
 * - `highlight`: a rectangle behind each line, hugging its set width;
 * - `box`: one rounded rectangle around the whole block of lines;
 * - `backdrop`: the same rectangle, square-cornered and blurred, so it feathers out locally.
 */
export type TextBackgroundStyle = "highlight" | "box" | "backdrop";

export const TEXT_BACKGROUND_STYLES = [
  "highlight",
  "box",
  "backdrop",
] as const satisfies readonly TextBackgroundStyle[];

/** The most padding, in card units, a text background may have around its text. */
export const TEXT_BACKGROUND_PADDING_MAX = 120;

/** A text background's ranges: padding in card units, opacity the fill's alpha (> 0, ≤ 1). */
export const TEXT_BACKGROUND_LIMITS = {
  padding: { min: 0, max: TEXT_BACKGROUND_PADDING_MAX },
  /** Exclusive of `min`: a background at opacity 0 is no background; remove it instead. */
  opacity: { min: 0, max: 1 },
} as const;

/**
 * A text background the host chose for a box in the card editor (`spec.md §20`). Only ever the
 * host's choice: no generated box has one, and an absent field is "None". It belongs to its box —
 * drawn behind that box's own lines, inside the box's positioned and rotated element — and its
 * geometry is derived when the card is drawn from the stored lines and the box (`card-data.ts`
 * `textBackgroundGeometry`), never stored. It never changes the artwork, the text's colour or
 * opacity, or anything else on the card.
 *
 * Its colour is either the host's (kept as chosen, through every edit and every carry to another
 * design or shape) or, when `autoColor` is set, automatic: `automaticBackgroundColor` of the box's
 * text colour, followed whenever that colour changes (`followTextColor`). A background starts
 * automatic; choosing a colour makes it the host's, and choosing Automatic makes it automatic again.
 */
export interface TextBackground {
  style: TextBackgroundStyle;
  /** `#RRGGBB`: the colour drawn, automatic or not. */
  color: string;
  /**
   * Present (and `true`) only when the colour is automatic: derived from the box's text colour, not
   * chosen. Absent: the host chose `color`, and nothing recolours it.
   */
  autoColor?: true;
  /** The fill's alpha only, in (0, 1]: the text is drawn at full opacity whatever it is. */
  opacity: number;
  /** Card units around the text, in [0, `TEXT_BACKGROUND_PADDING_MAX`]. */
  padding: number;
}

/**
 * Why `value` is not a well-formed `TextBackground` (its four fields, each in range, and
 * `autoColor` only as `true`).
 */
export function textBackgroundIssue(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "is not an object";
  }
  const v = value as Record<string, unknown>;
  const extra = Object.keys(v).filter(
    (k) => !["style", "color", "opacity", "padding", "autoColor"].includes(k),
  );
  if (extra.length > 0) return `has an unknown field ${extra[0]}`;
  if ("autoColor" in v && v.autoColor !== true) return "autoColor may only be true";
  if (!(TEXT_BACKGROUND_STYLES as readonly unknown[]).includes(v.style))
    return "has no valid style";
  if (typeof v.color !== "string" || !isCanonicalHex(v.color)) return "colour is not #RRGGBB";
  const { opacity, padding } = v;
  if (!(
    typeof opacity === "number" &&
    Number.isFinite(opacity) &&
    opacity > TEXT_BACKGROUND_LIMITS.opacity.min &&
    opacity <= TEXT_BACKGROUND_LIMITS.opacity.max
  )) {
    return "opacity must be above 0 and at most 1";
  }
  if (!(
    typeof padding === "number" &&
    Number.isFinite(padding) &&
    padding >= TEXT_BACKGROUND_LIMITS.padding.min &&
    padding <= TEXT_BACKGROUND_LIMITS.padding.max
  )) {
    return `padding must be between 0 and ${TEXT_BACKGROUND_PADDING_MAX}`;
  }
  return null;
}

/** A text background's starting opacity and padding (em of the box's size), by style. */
const TEXT_BACKGROUND_DEFAULTS: Record<
  TextBackgroundStyle,
  { opacity: number; paddingEm: number }
> = {
  highlight: { opacity: 0.85, paddingEm: 0.18 },
  box: { opacity: 0.8, paddingEm: 0.45 },
  backdrop: { opacity: 0.65, paddingEm: 0.6 },
};

/** The default fills: light behind dark text, dark behind light text. */
export const TEXT_BACKGROUND_LIGHT = "#FFFFFF";
export const TEXT_BACKGROUND_DARK = "#1B1B1F";

/**
 * The automatic colour of a text background behind text of `textColor`: `TEXT_BACKGROUND_LIGHT`
 * behind text of relative luminance below 0.4, else `TEXT_BACKGROUND_DARK`. Throws for a colour
 * that is not `#RRGGBB`.
 */
export function automaticBackgroundColor(textColor: string): string {
  return relativeLuminance(parseHex(textColor)) < 0.4
    ? TEXT_BACKGROUND_LIGHT
    : TEXT_BACKGROUND_DARK;
}

/**
 * The values a text background starts with when the host picks `style` for `box`: an automatic
 * colour (`automaticBackgroundColor` of the box's text colour, `autoColor` set), the style's
 * opacity (highlight 0.85, box 0.8, backdrop 0.65), and padding in proportion to the box's size
 * (0.18, 0.45 and 0.6 of it, rounded), within the limits. Pure; the host may change any of it.
 * Throws for a colour that is not `#RRGGBB`.
 */
export function defaultTextBackground(
  style: TextBackgroundStyle,
  box: { color: string; size: number },
): TextBackground {
  const { opacity, paddingEm } = TEXT_BACKGROUND_DEFAULTS[style];
  const padding = Number.isFinite(box.size) ? Math.round(paddingEm * box.size) : 0;
  return {
    style,
    color: automaticBackgroundColor(box.color),
    autoColor: true,
    opacity,
    padding: Math.min(TEXT_BACKGROUND_LIMITS.padding.max, Math.max(0, padding)),
  };
}

/**
 * `background` behind text of `textColor`: an automatic colour follows the text (re-derived by
 * `automaticBackgroundColor`); a colour the host chose is kept exactly as chosen, whatever the text
 * colour becomes. Everything else is kept. Returns a copy.
 */
export function followTextColor(background: TextBackground, textColor: string): TextBackground {
  return background.autoColor
    ? { ...background, color: automaticBackgroundColor(textColor) }
    : { ...background };
}
