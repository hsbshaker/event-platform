import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * Canonical chip (docs/design-system.md §10.3): a selected option, a filter, a lightweight toggle.
 * At least 44px tall wherever it can be tapped. Selected is the lit fill plus an ink outline, never
 * the fill alone (§6.1, §14.6), and the state is exposed through `aria-pressed` (or `aria-checked`
 * when the chip is one option of a `role="radiogroup"`, e.g. the card editor's text background).
 */
export function chipClasses(selected: boolean, className?: string): string {
  return cx(
    "app-press inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border px-4 text-label-md",
    "disabled:cursor-not-allowed disabled:opacity-50",
    selected
      ? "border-app-text bg-app-lit text-app-text ring-1 ring-app-text"
      : "border-app-border-strong bg-app-surface text-app-text hover:bg-app-surface-subtle",
    className,
  );
}

export interface ChipProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-pressed" | "aria-checked"
> {
  selected: boolean;
}

export function Chip({ selected, className, type = "button", ...props }: ChipProps) {
  // A chip in a radio group (`role="radio"`) is checked, not pressed: one state, the right attribute.
  const state =
    props.role === "radio" ? { "aria-checked": selected } : { "aria-pressed": selected };
  return <button {...props} {...state} type={type} className={chipClasses(selected, className)} />;
}
