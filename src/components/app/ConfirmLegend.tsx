import type { TextBox } from "@/lib/card/text-box";
import { confirmLegend } from "./confirm-legend";

/**
 * The one line under the card naming the details not confirmed yet, or nothing when there are none
 * (`spec.md §7.3`, §31 — Creation Mode; `docs/screen-spec.md` `card-reveal`). App chrome beside the
 * card: the card itself carries no mark, so the host sees it exactly as guests will.
 */
export function ConfirmLegend({
  boxes,
  unconfirmed,
  className,
}: {
  boxes: readonly TextBox[];
  /** Ids of the unconfirmed boxes (`RevealedCard.unconfirmed`). */
  unconfirmed: readonly string[];
  className?: string;
}) {
  const text = confirmLegend(boxes, unconfirmed);
  if (!text) return null;
  return (
    <p
      role="note"
      data-confirm-legend=""
      className={`text-center text-body-sm text-app-text-secondary ${className ?? ""}`}
    >
      {text}
    </p>
  );
}
