import type { PublishBlocker } from "@/lib/events/publish-readiness";

import { cx } from "./cx";

/**
 * The setup checklist's body (`docs/design-system.md §10.13 SetupChecklist`; `docs/screen-spec.md`
 * `setup-checklist`; `spec.md §19.2`, §23.1): navigation, not a wizard. It is drawn in a `Sheet`.
 *
 * **Needed to publish** — exactly the current blockers (`publishReadiness`), each a row with its
 * label, one line on what is needed and a way straight to the field (the private event code's row
 * opens the editor on `Make a code`). A blocker no surface answers (the card, which generation
 * makes) is listed but is not a control. No percentages, no count of optional work.
 *
 * The **Recommended before sharing** group (Guests, Registry, Co-host) comes with those surfaces;
 * until they exist there is nothing to link to, so the group is not drawn.
 */
export function SetupChecklist({
  blockers,
  onOpen,
}: {
  blockers: readonly PublishBlocker[];
  /** Opens the details editor focused on the field. */
  onOpen: (focusId: string) => void;
}) {
  return (
    <section aria-labelledby="needed-heading" className="flex flex-col gap-3">
      <h3 id="needed-heading" className="text-heading-md text-app-text">
        Needed to publish
      </h3>
      {blockers.length === 0 ? (
        <p data-setup-ready="" className="text-body-md text-app-text">
          <span aria-hidden="true" className="text-app-success">
            ✓{" "}
          </span>
          Everything needed to publish is in place.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {blockers.map((blocker) => {
            const body = (
              <>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                  <span className="text-label-md text-app-text">{blocker.label}</span>
                  <span className="text-body-sm text-app-text-secondary">
                    {blocker.description}
                  </span>
                </span>
                {blocker.focusId && (
                  <span aria-hidden="true" className="text-app-text-secondary">
                    ›
                  </span>
                )}
              </>
            );
            const row = "flex min-h-11 w-full items-center gap-3 rounded-lg border px-4 py-3";
            return (
              <li key={blocker.key}>
                {blocker.focusId ? (
                  <button
                    type="button"
                    data-blocker={blocker.key}
                    onClick={() => onOpen(blocker.focusId!)}
                    className={cx(
                      row,
                      "border-app-border bg-app-surface transition-colors hover:bg-app-surface-subtle",
                    )}
                  >
                    {body}
                  </button>
                ) : (
                  <div
                    data-blocker={blocker.key}
                    className={cx(row, "border-app-border bg-app-surface-subtle")}
                  >
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
