/**
 * The state transitions of the text background control (`docs/design-system.md §4.10a`, "Text
 * background"): pure, so they are tested without a browser. The control's value is a box's
 * `TextBackground`, or `undefined` for None (`spec.md §20.1`). Only the background's own fill is
 * ever touched: never the text's colour or opacity.
 */

import {
  automaticBackgroundColor,
  defaultTextBackground,
  TEXT_BACKGROUND_LIMITS,
  textBackgroundIssue,
  type TextBackground,
  type TextBackgroundStyle,
} from "@/lib/card/text-background";

/** The control's choices, in order: None, then the three styles. */
export type TextBackgroundChoice = "none" | TextBackgroundStyle;

/** The text the starting values are derived from (`defaultTextBackground`). */
export interface TextBackgroundText {
  color: string;
  size: number;
}

/** The opacity slider's range, in whole percent (the stored opacity is a fraction). */
export const OPACITY_PERCENT = { min: 5, max: 100 } as const;

/** The choice a value shows as selected. */
export function choiceOf(value: TextBackground | undefined): TextBackgroundChoice {
  return value ? value.style : "none";
}

/**
 * Choosing `choice`: None removes the background; a style from None starts from
 * `defaultTextBackground` (an automatic colour); a style from another style keeps the colour —
 * chosen or automatic — and takes the new style's default opacity and padding; choosing the style
 * already chosen changes nothing.
 */
export function chooseStyle(
  current: TextBackground | undefined,
  choice: TextBackgroundChoice,
  text: TextBackgroundText,
): TextBackground | undefined {
  if (choice === "none") return undefined;
  if (current && current.style === choice) return current;
  const starting = defaultTextBackground(choice, text);
  if (!current) return starting;
  const { style, opacity, padding } = starting;
  return {
    style,
    color: current.autoColor ? automaticBackgroundColor(text.color) : current.color,
    ...(current.autoColor ? { autoColor: true as const } : {}),
    opacity,
    padding,
  };
}

/** Choosing Automatic: the colour follows the box's text colour (`automaticBackgroundColor`). */
export function setAutomaticColor(
  current: TextBackground,
  text: Pick<TextBackgroundText, "color">,
): TextBackground {
  return { ...current, color: automaticBackgroundColor(text.color), autoColor: true };
}

/** Choosing a colour (a swatch, or typed): the host's from now on, kept as chosen. */
export function chooseColor(current: TextBackground, color: string): TextBackground {
  return { style: current.style, color, opacity: current.opacity, padding: current.padding };
}

/** `#RRGGBB` from what the host typed (with or without `#`, any case), or null. */
export function normalizeHex(input: string): string | null {
  const match = /^\s*#?([0-9a-fA-F]{6})\s*$/.exec(input);
  return match ? `#${match[1].toUpperCase()}` : null;
}

export type SetColorResult = { ok: true; value: TextBackground } | { ok: false; error: string };

export const COLOR_ERROR = "Enter a colour as six hex digits, like #FFFFFF.";

/**
 * A typed colour: accepted when it is a hex colour `textBackgroundIssue` takes (and then the host's,
 * no longer automatic), else an error.
 */
export function setColor(current: TextBackground, input: string): SetColorResult {
  const color = normalizeHex(input);
  if (!color) return { ok: false, error: COLOR_ERROR };
  const value = chooseColor(current, color);
  return textBackgroundIssue(value) ? { ok: false, error: COLOR_ERROR } : { ok: true, value };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** The opacity, from whole percent (clamped to 5–100 and rounded); the fill's alpha only. */
export function setOpacity(current: TextBackground, percent: number): TextBackground {
  if (!Number.isFinite(percent)) return current;
  const whole = clamp(Math.round(percent), OPACITY_PERCENT.min, OPACITY_PERCENT.max);
  return { ...current, opacity: whole / 100 };
}

/** The padding, in whole card units (clamped to the limits). */
export function setPadding(current: TextBackground, padding: number): TextBackground {
  if (!Number.isFinite(padding)) return current;
  const { min, max } = TEXT_BACKGROUND_LIMITS.padding;
  return { ...current, padding: clamp(Math.round(padding), min, max) };
}

/** A background's opacity as whole percent, for the slider. */
export function opacityPercent(value: TextBackground): number {
  return Math.round(value.opacity * 100);
}
