import type { Ref } from "react";

import { AppButtonLink } from "./AppButtonLink";
import { appButtonClasses } from "./AppButton";

/**
 * Creation Mode's owner toolbar (`docs/design-system.md §10.10 OwnerToolbar`, "Owner toolbar";
 * `spec.md §19.1`): a restrained row of high-level controls above the card, for the owner and
 * co-hosts only (the page that renders it never renders for anyone else). It holds `Design`, which
 * opens the Design panel, and `Preview`, a link to the guest-experience preview. It is not a
 * page-builder toolbar: no layout, style or block controls. App tokens only.
 */
export function OwnerToolbar({
  onDesign,
  designRef,
  previewHref,
}: {
  onDesign: () => void;
  designRef?: Ref<HTMLButtonElement>;
  /** The event's preview page. */
  previewHref: string;
}) {
  return (
    <div
      role="group"
      aria-label="Invitation tools"
      className="flex w-full items-center justify-end gap-2"
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
    </div>
  );
}
