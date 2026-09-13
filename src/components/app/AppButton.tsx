import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * Canonical button (docs/design-system.md §10.1). Feature screens use this for every
 * button; no page-local button variant is allowed (§6, §23).
 */

export type AppButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type AppButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<AppButtonVariant, string> = {
  primary: "bg-app-action text-app-action-text hover:bg-app-action-hover",
  secondary:
    "border border-app-border-strong bg-app-surface text-app-text hover:bg-app-surface-subtle",
  ghost: "bg-transparent text-app-text hover:bg-app-surface-muted",
  destructive: "bg-app-danger text-app-action-text hover:opacity-90",
};

const SIZE_CLASSES: Record<AppButtonSize, string> = {
  sm: "px-4 py-2 text-body-sm",
  md: "px-5 py-3 text-body-md",
  lg: "px-6 py-4 text-body-lg",
};

export interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  /** Shows a quiet inline spinner and marks the button busy; callers also pass `disabled`. */
  pending?: boolean;
}

export function AppButton({
  variant = "primary",
  size = "md",
  pending = false,
  disabled,
  className,
  children,
  ...props
}: AppButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
    >
      {pending && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 rounded-pill border-2 border-current border-t-transparent motion-safe:animate-spin"
        />
      )}
      <span>{children}</span>
    </button>
  );
}
