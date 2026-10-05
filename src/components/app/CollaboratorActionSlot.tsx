import type { Ref } from "react";
import { appButtonClasses } from "./AppButton";

/**
 * The collaborator-only control attached to a stable anchor on the card or a page section
 * (`docs/design-system.md §10.19 CollaboratorActionSlot`, §10.11): `Edit`, `Set up` or `Add`.
 * App-styled; it inherits nothing from the card or the page's content. Creation Mode passes it to
 * the page's `collaborator` slot; guest rendering passes nothing, so no anchor output exists for a
 * guest (`spec.md §31` — Creation Mode). A real button: keyboard-reachable, with a label that
 * starts with its visible word ("Edit event details") and the 44px target.
 */
export type CollaboratorAction = "Edit" | "Set up" | "Add";

export function CollaboratorActionSlot({
  anchor,
  action,
  label,
  onClick,
  ref,
}: {
  /** The stable anchor this control belongs to, e.g. `details`, `description`. */
  anchor: string;
  action: CollaboratorAction;
  /** The accessible name: the action and what it acts on, e.g. "Edit event details". */
  label: string;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      data-collaborator-anchor={anchor}
      aria-label={label}
      onClick={onClick}
      className={appButtonClasses("ghost", "sm", "-mr-2 text-label-md")}
    >
      {action}
    </button>
  );
}
