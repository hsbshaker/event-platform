import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * Canonical chip (docs/design-system.md §10.3): a selected option, a filter, a lightweight toggle.
 * At least 44px tall wherever it can be tapped. Selected is the lit fill plus an ink outline, never
 * the fill alone (§6.1, §14.6), and the state is exposed through `aria-pressed`.
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

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  selected: boolean;
}

export function Chip({ selected, className, type = "button", ...props }: ChipProps) {
  return (
    <button
      {...props}
      type={type}
      aria-pressed={selected}
      className={chipClasses(selected, className)}
    />
  );
}
