import type { CSSProperties } from "react";

import { CARD_CANVAS, type CardProportion } from "@/lib/card/shapes";
import type { TextBox } from "@/lib/card/text-box";
import { markerLabel, markerRect } from "./confirm-markers";

/**
 * "Needs confirming" markers over a card (`spec.md §31` — Creation Mode; `docs/screen-spec.md`
 * `card-reveal`; `docs/design-system.md §4.4`): a dashed outline and a small `Confirm` tag over each
 * box whose words are a prompt-stated value or a placeholder.
 *
 * App chrome, drawn beside the card, never in it: it is positioned from the boxes' stored geometry
 * and takes only app tokens, so it cannot change the card's text, fonts or colours, and it never
 * renders on guest surfaces (guests get the card alone). It ignores pointer input so card text
 * stays selectable. Place it inside a wrapper that is exactly the card's box (`relative`, the
 * card's proportion): it fills that wrapper.
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
  const marked = new Set(unconfirmed);
  const canvas = CARD_CANVAS[proportion];
  const targets = boxes.filter((box) => marked.has(box.id) && box.lines.length > 0);
  if (targets.length === 0) return null;
  return (
    <ul
      aria-label="Details to confirm"
      className="pointer-events-none absolute inset-0 m-0 list-none p-0"
    >
      {targets.map((box) => {
        const rect = markerRect(box, canvas);
        const style: CSSProperties = {
          left: `${rect.left}%`,
          top: `${rect.top}%`,
          width: `${rect.width}%`,
          height: `${rect.height}%`,
          transform: rect.rotation === 0 ? undefined : `rotate(${rect.rotation}deg)`,
        };
        return (
          <li
            key={box.id}
            role="note"
            aria-label={markerLabel(box)}
            data-confirm-marker={box.id}
            style={style}
            className="absolute rounded-sm border border-dashed border-app-action ring-1 ring-app-surface"
          >
            <span
              aria-hidden="true"
              className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded-pill border border-app-border-strong bg-app-surface px-1.5 text-micro leading-tight text-app-text"
            >
              Confirm
            </span>
          </li>
        );
      })}
    </ul>
  );
}
