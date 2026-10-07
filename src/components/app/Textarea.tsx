import type { TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

/** Canonical multiline text control (docs/design-system.md §10.5). */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "w-full rounded-md border border-app-border-strong bg-app-surface px-4 py-3 text-body-md text-app-text",
        "placeholder:text-app-text-tertiary",
        className,
      )}
    />
  );
}
