import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * Canonical icon-only control (docs/design-system.md §10.2): close, back, overflow, small
 * utilities. Always carries an accessible label since there is no visible text.
 */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; required because the control has no visible text. */
  label: string;
}

export function IconButton({ label, className, children, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      aria-label={label}
      className={cx(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-app-text-secondary transition-colors",
        "hover:bg-app-surface-muted hover:text-app-text",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}
