"use client";

import { useState, type ReactNode } from "react";

import { AppButtonLink } from "@/components/app/AppButtonLink";
import { appButtonClasses } from "@/components/app/AppButton";
import { cx } from "@/components/app/cx";

/**
 * Preview's frame (`docs/design-system.md §4.13`; `docs/screen-spec.md` `preview`; `spec.md §7.16`):
 * a small app-chrome header — what this is, `Back to editing`, and on wide screens the compact
 * `Mobile / Desktop` width control — above the guest experience it frames. It draws no owner
 * controls, readiness control or toolbar, and never touches the card or the page it holds.
 *
 * `Mobile` (the default) shows the same page at the width of a 390px phone, in the middle of a wide
 * screen: not a phone frame, only the width. `Desktop` gives it the page's wide layout. The choice
 * is local state, never stored, so each visit starts on Mobile; the control exists on wide screens
 * only (on a phone the page is already at its width). Changing it keeps the envelope as it is.
 */

type PreviewWidth = "mobile" | "desktop";

export function PreviewShell({
  backHref,
  hiddenLine,
  children,
}: {
  /** Creation Mode, where `Back to editing` goes. */
  backHref: string;
  /** The one plain line shown when some details are not shown to guests; null otherwise. */
  hiddenLine: string | null;
  /** The envelope with its card, then the page. */
  children: ReactNode;
}) {
  const [width, setWidth] = useState<PreviewWidth>("mobile");

  return (
    <div className="flex flex-1 flex-col" data-preview="" data-preview-width={width}>
      <header className="border-b border-app-border bg-app-surface">
        <div className="mx-auto flex w-full max-w-(--width-wide) flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <p className="text-body-sm text-app-text" data-preview-banner="">
            Preview — this is what your guests will see
          </p>
          <div className="flex items-center gap-3">
            <div
              role="group"
              aria-label="Preview width"
              className="hidden items-center gap-1 lg:flex"
              data-preview-toggle=""
            >
              {(["mobile", "desktop"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={width === option}
                  onClick={() => setWidth(option)}
                  className={appButtonClasses(width === option ? "primary" : "secondary", "sm")}
                >
                  {option === "mobile" ? "Mobile" : "Desktop"}
                </button>
              ))}
            </div>
            <AppButtonLink href={backHref} variant="secondary" size="sm">
              Back to editing
            </AppButtonLink>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full flex-1 flex-col items-center gap-6 px-4 py-10 lg:py-14">
        {hiddenLine && (
          <p
            className="max-w-prose text-center text-body-sm text-app-text-secondary"
            data-preview-hidden=""
          >
            {hiddenLine}
          </p>
        )}
        <div
          data-preview-frame=""
          className={cx(
            "flex w-full flex-col items-center gap-6",
            width === "mobile" ? "max-w-[calc(390px-2rem)]" : "max-w-(--width-wide)",
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
