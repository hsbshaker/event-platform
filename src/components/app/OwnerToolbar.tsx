import type { Ref } from "react";

import { AppButtonLink } from "./AppButtonLink";
import { appButtonClasses } from "./AppButton";

/**
 * Creation Mode's owner toolbar (`docs/design-system.md §10.10 OwnerToolbar`, "Owner toolbar";
 * `spec.md §19.1`): a restrained row of high-level controls above the card, for the owner and
 * co-hosts only (the page that renders it never renders for anyone else). It holds `Design`, which
 * opens the Design panel, and `Preview`, a link to the guest-experience preview. For the owner only
 * — the page passes `onCohosts` only when the signed-in member may manage co-hosts (`spec.md §25`)
 * — it also holds `Co-hosts`, which opens the Co-hosts sheet before and after publish. It is not a
 * page-builder toolbar: no layout, style or block controls. App tokens only.
 */
export function OwnerToolbar({
  onDesign,
  designRef,
  previewHref,
  onCohosts,
  cohostsRef,
}: {
  onDesign: () => void;
  designRef?: Ref<HTMLButtonElement>;
  /** The event's preview page. */
  previewHref: string;
  /** Opens the Co-hosts sheet; given for the owner only. */
  onCohosts?: () => void;
  cohostsRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div
      role="group"
      aria-label="Invitation tools"
      className="flex w-full flex-wrap items-center justify-end gap-2"
    >
      <button
        ref={designRef}
        type="button"
        aria-haspopup="dialog"
        data-toolbar="design"
        onClick={onDesign}
        className={appButtonClasses("secondary", "sm")}
      >
        Design
      </button>
      <AppButtonLink href={previewHref} data-toolbar="preview" variant="secondary" size="sm">
        Preview
      </AppButtonLink>
      {onCohosts && (
        <button
          ref={cohostsRef}
          type="button"
          aria-haspopup="dialog"
          data-toolbar="cohosts"
          onClick={onCohosts}
          className={appButtonClasses("secondary", "sm")}
        >
          Co-hosts
        </button>
      )}
    </div>
  );
}
