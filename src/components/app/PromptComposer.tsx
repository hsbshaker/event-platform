import type { ChangeEvent, ReactNode } from "react";
import { Textarea } from "./Textarea";

/**
 * Canonical large AI input (docs/design-system.md §10.4): a multiline text area, an optional
 * inspiration action, a primary generation action, and a loading/disabled state. This is a
 * reusable product primitive; the composer's autosave/restore behavior lives in the caller
 * (`src/components/app/LandingComposer.tsx`), not here, so this shape can be reused wherever
 * else the product needs the same large prompt input.
 */
export interface PromptComposerProps {
  id: string;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  /** Inspiration thumbnails, upload trigger, save indicator — rendered above the action row. */
  attachments?: ReactNode;
  /** The primary/secondary actions, e.g. "+ Add inspiration" and "Create my event ✦". */
  actions: ReactNode;
}

export function PromptComposer({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  rows = 6,
  attachments,
  actions,
}: PromptComposerProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-app-border bg-app-surface p-4 shadow-soft sm:p-6">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Textarea
        id={id}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className="min-h-40 resize-y border-none px-0 text-body-lg focus-visible:outline-none sm:min-h-48"
      />
      {attachments}
      <div className="flex flex-col-reverse gap-3 border-t border-app-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        {actions}
      </div>
    </div>
  );
}
