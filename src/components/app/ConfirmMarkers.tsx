import { CARD_CANVAS, type CardProportion } from "@/lib/card/shapes";
import type { TextBox } from "@/lib/card/text-box";
import { confirmLegend, markerGroups } from "./confirm-markers";

/**
 * "Needs confirming" outlines over a card, and the legend under it (`spec.md §31` — Creation Mode;
 * `docs/screen-spec.md` `card-reveal`; `docs/design-system.md §4.4`): one dashed outline around each
 * run of adjacent boxes whose words are a prompt-stated value or a placeholder.
 *
 * App chrome, drawn beside the card, never in it: positioned from the boxes' stored geometry and
 * using only app tokens, so it cannot change the card's text, fonts or colours, and it never
 * renders on guest surfaces. Purely visual (`aria-hidden`, ignores pointer input so card text stays
 * selectable); the legend carries the meaning. Place it inside a wrapper that is exactly the
 * card's box (`relative`, the card's proportion): it fills that wrapper.
 */
export function ConfirmMarkers({
  boxes,
  unconfirmed,
  proportion,
}: {
  boxes: readonly TextBox[];
  /** Ids of the boxes to mark (`RevealedCard.unconfirmed`). */
  unconfirmed: readonly string[];
  proportion: CardProportion;
}) {
  const groups = markerGroups(boxes, unconfirmed, CARD_CANVAS[proportion]);
  if (groups.length === 0) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {groups.map(({ rect, ids }) => (
        <div
          key={ids.join(",")}
          data-confirm-marker={ids.join(" ")}
          style={{
            left: `${rect.left}%`,
            top: `${rect.top}%`,
            width: `${rect.width}%`,
            height: `${rect.height}%`,
            transform: rect.rotation === 0 ? undefined : `rotate(${rect.rotation}deg)`,
          }}
          className="absolute rounded-md border border-dashed border-app-action ring-1 ring-app-surface"
        />
      ))}
    </div>
  );
}

/** The one line under the card naming what the dashed outlines mean; nothing when none. */
export function ConfirmLegend({
  boxes,
  unconfirmed,
  className,
}: {
  boxes: readonly TextBox[];
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
