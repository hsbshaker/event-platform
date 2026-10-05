import type { PublishBlocker } from "@/lib/events/publish-readiness";

import { cx } from "./cx";

/**
 * A row of the **Recommended before sharing** group (`spec.md §19.2`): optional work, never a
 * publish blocker, that opens its own surface.
 */
export interface RecommendedItem {
  key: string;
  label: string;
  description: string;
  /** Done at least once (a co-host has joined); shown with a check, still a way in. */
  done: boolean;
  onOpen: () => void;
}

const ROW = "flex min-h-11 w-full items-center gap-3 rounded-lg border px-4 py-3";

/**
 * The setup checklist's body (`docs/design-system.md §10.13 SetupChecklist`; `docs/screen-spec.md`
 * `setup-checklist`; `spec.md §19.2`, §23.1): navigation, not a wizard. It is drawn in a `Sheet`.
 *
 * **Needed to publish** — exactly the current blockers (`publishReadiness`), each a row with its
 * label, one line on what is needed and a way straight to the field (the private event code's row
 * opens the editor on `Make a code`). A blocker no surface answers (the card, which generation
 * makes) is listed but is not a control. No percentages, no count of optional work.
 *
 * **Recommended before sharing** — the optional surfaces that exist and that this member may use,
 * each opening its surface: today the owner's Co-host row (`spec.md §6.1`, §25). Guests and
 * Registry join it when their surfaces exist. None of it ever counts toward readiness, and the group
 * is not drawn when it has no rows (a co-host sees none).
 */
export function SetupChecklist({
  blockers,
  onOpen,
  recommended = [],
}: {
  blockers: readonly PublishBlocker[];
  /** Opens the details editor focused on the field. */
  onOpen: (focusId: string) => void;
  recommended?: readonly RecommendedItem[];
}) {
  return (
    <div className="flex flex-col gap-8">
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
              return (
                <li key={blocker.key}>
                  {blocker.focusId ? (
                    <button
                      type="button"
                      data-blocker={blocker.key}
                      onClick={() => onOpen(blocker.focusId!)}
                      className={cx(
                        ROW,
                        "border-app-border bg-app-surface transition-colors hover:bg-app-surface-subtle",
                      )}
                    >
                      {body}
                    </button>
                  ) : (
                    <div
                      data-blocker={blocker.key}
                      className={cx(ROW, "border-app-border bg-app-surface-subtle")}
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

      {recommended.length > 0 && (
        <section aria-labelledby="recommended-heading" className="flex flex-col gap-3">
          <h3 id="recommended-heading" className="text-heading-md text-app-text">
            Recommended before sharing
          </h3>
          <ul className="flex flex-col gap-2">
            {recommended.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  data-recommended={item.key}
                  data-done={item.done ? "" : undefined}
                  onClick={item.onOpen}
                  className={cx(
                    ROW,
                    "border-app-border bg-app-surface transition-colors hover:bg-app-surface-subtle",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                    <span className="text-label-md text-app-text">
                      {item.done && (
                        <span aria-hidden="true" className="text-app-success">
                          ✓{" "}
                        </span>
                      )}
                      {item.label}
                    </span>
                    <span className="text-body-sm text-app-text-secondary">{item.description}</span>
                  </span>
                  <span aria-hidden="true" className="text-app-text-secondary">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
