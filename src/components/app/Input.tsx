import type { InputHTMLAttributes } from "react";
import { cx } from "./cx";

/** Canonical single-line control for text/date/time/datetime-local (docs/design-system.md §10.5). */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "min-h-11 w-full rounded-lg border border-app-border bg-app-surface px-4 text-body-md text-app-text",
        "placeholder:text-app-text-tertiary",
        className,
      )}
    />
  );
}
