import type { Ref } from "react";

import { appButtonClasses } from "./AppButton";

/**
 * Creation Mode's owner toolbar (`docs/design-system.md §10.10 OwnerToolbar`, "Owner toolbar";
 * `spec.md §19.1`): a restrained row of high-level controls above the card, for the owner and
 * co-hosts only (the page that renders it never renders for anyone else). It holds `Design` now;
 * `Preview` joins it in a later slice. It is not a page-builder toolbar: no layout, style or
 * block controls. App tokens only.
 */
export function OwnerToolbar({
  onDesign,
  designRef,
}: {
  onDesign: () => void;
  designRef?: Ref<HTMLButtonElement>;
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
    </div>
  );
}
