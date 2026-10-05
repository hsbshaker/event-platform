import type { Ref } from "react";

import { appButtonClasses } from "./AppButton";
import { cx } from "./cx";

/**
 * Creation Mode's floating setup control (`docs/design-system.md §10.12 SetupProgressPill`;
 * `spec.md §19.2`, §23.1): `Finish setup · N left` while a publish blocker remains, `Ready to
 * publish` when none does. `N` counts only the blockers (§23.1), never optional work. Fixed near
 * the bottom, clear of the home-indicator safe area, centred so it covers the least; the page
 * leaves room beneath its content for it. Opens the setup checklist. App tokens only.
 */
export function SetupProgressPill({
  left,
  onOpen,
  pillRef,
}: {
  /** Publish blockers left. */
  left: number;
  onOpen: () => void;
  pillRef?: Ref<HTMLButtonElement>;
}) {
  const ready = left === 0;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        ref={pillRef}
        type="button"
        aria-haspopup="dialog"
        data-setup-pill={ready ? "ready" : "left"}
        onClick={onOpen}
        className={cx(
          appButtonClasses(ready ? "secondary" : "primary", "md", "rounded-pill shadow-float"),
          "pointer-events-auto",
          ready && "text-app-success",
        )}
      >
        {ready ? (
          <>
            <span aria-hidden="true">✓</span> Ready to publish
          </>
        ) : (
          `Finish setup · ${left} left`
        )}
      </button>
    </div>
  );
}
