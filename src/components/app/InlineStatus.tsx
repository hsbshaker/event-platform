import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Canonical quiet status line (docs/design-system.md §10.9): saving/saved, recoverable
 * failure, import state, generation status. Never a blocking spinner or a toast.
 *
 * Color never carries the message alone (§14.6): each variant also has a text/shape symbol.
 */
export type InlineStatusVariant = "info" | "success" | "warning" | "danger";

const COLOR_CLASSES: Record<InlineStatusVariant, string> = {
  info: "text-app-text-secondary",
  success: "text-app-success",
  warning: "text-app-warning",
  danger: "text-app-danger",
};

const SYMBOL: Record<InlineStatusVariant, string> = {
  info: "●",
  success: "✓",
  warning: "!",
  danger: "!",
};

export interface InlineStatusProps {
  variant?: InlineStatusVariant;
  children: ReactNode;
  /** Announces updates to assistive tech as they happen (used sparingly, per §14.4). */
  live?: boolean;
  className?: string;
}

export function InlineStatus({ variant = "info", children, live, className }: InlineStatusProps) {
  return (
    <p
      role={variant === "danger" ? "alert" : undefined}
      aria-live={live && variant !== "danger" ? "polite" : undefined}
      className={cx("flex items-start gap-1.5 text-body-sm", COLOR_CLASSES[variant], className)}
    >
      <span aria-hidden="true">{SYMBOL[variant]}</span>
      <span>{children}</span>
    </p>
  );
}
