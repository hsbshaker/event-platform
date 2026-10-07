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
 * A text background the host chose for a box in the card editor (`spec.md §20`). Never automatic:
 * no generated box has one, and an absent field is "None". It belongs to its box — drawn behind
 * that box's own lines, inside the box's positioned and rotated element — and its geometry is
 * derived when the card is drawn from the stored lines and the box (`card-data.ts`
 * `textBackgroundGeometry`), never stored. It never changes the artwork, the text's colour or
 * opacity, or anything else on the card.
 */
export interface TextBackground {
  style: TextBackgroundStyle;
  /** `#RRGGBB`. */
  color: string;
  /** The fill's alpha only, in (0, 1]: the text is drawn at full opacity whatever it is. */
  opacity: number;
  /** Card units around the text, in [0, `TEXT_BACKGROUND_PADDING_MAX`]. */
  padding: number;
}

/** Why `value` is not a well-formed `TextBackground` (exactly its four fields, each in range). */
export function textBackgroundIssue(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "is not an object";
  }
  const v = value as Record<string, unknown>;
  const extra = Object.keys(v).filter((k) => !["style", "color", "opacity", "padding"].includes(k));
  if (extra.length > 0) return `has an unknown field ${extra[0]}`;
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
 * The values a text background starts with when the host picks `style` for `box`: a fill that
 * contrasts with the box's text colour (`TEXT_BACKGROUND_LIGHT` behind text of relative luminance
 * below 0.4, else `TEXT_BACKGROUND_DARK`), the style's opacity (highlight 0.85, box 0.8, backdrop
 * 0.65), and padding in proportion to the box's size (0.18, 0.45 and 0.6 of it, rounded), within
 * the limits. Pure; the host may change any of it. Throws for a colour that is not `#RRGGBB`.
 */
export function defaultTextBackground(
  style: TextBackgroundStyle,
  box: { color: string; size: number },
): TextBackground {
  const { opacity, paddingEm } = TEXT_BACKGROUND_DEFAULTS[style];
  const dark = relativeLuminance(parseHex(box.color)) < 0.4;
  const padding = Number.isFinite(box.size) ? Math.round(paddingEm * box.size) : 0;
  return {
    style,
    color: dark ? TEXT_BACKGROUND_LIGHT : TEXT_BACKGROUND_DARK,
    opacity,
    padding: Math.min(TEXT_BACKGROUND_LIMITS.padding.max, Math.max(0, padding)),
  };
}
