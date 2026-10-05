"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./IconButton";

/**
 * Canonical contextual editor surface (`docs/design-system.md §10.6 Sheet`, §10.7 `SidePanel`):
 * one component, two presentations of the same thing. On a phone it fills the screen
 * (safe-area-aware); from the `lg` breakpoint it is a panel on the right edge that leaves the event
 * visible behind it. A title, optional supporting copy, a close affordance and a scrolling body.
 *
 * Built on the native `<dialog>` in modal mode, so the browser gives it the focus trap, `Escape`,
 * an inert page behind it and the return of focus to whatever opened it. The body is rendered only
 * while open: closing unmounts it, which is how an autosaving form flushes its waiting edits.
 * Not nested (§10.6). App tokens only; nothing from the card.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  /** Called for every way of closing: the close button, `Escape`, a tap on the backdrop. */
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="sheet-title"
      aria-describedby={description ? "sheet-description" : undefined}
      onClose={onClose}
      onClick={(event) => {
        // A tap on the backdrop lands on the dialog element itself, not on its content.
        if (event.target === ref.current) onClose();
      }}
      className={
        "fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none flex-col bg-app-surface p-0 text-app-text open:flex " +
        "backdrop:bg-app-overlay lg:left-auto lg:w-[30rem] lg:border-l lg:border-app-border lg:shadow-overlay"
      }
    >
      <header className="flex items-start gap-3 border-b border-app-border px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1 py-2">
          <h2 id="sheet-title" className="text-heading-md text-app-text">
            {title}
          </h2>
          {description && (
            <p id="sheet-description" className="text-body-sm text-app-text-secondary">
              {description}
            </p>
          )}
        </div>
        <IconButton label={`Close ${title.toLowerCase()}`} onClick={onClose}>
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          >
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </IconButton>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
        {open ? children : null}
      </div>
    </dialog>
  );
}
