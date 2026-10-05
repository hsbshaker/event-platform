"use client";

import type { ReactNode } from "react";

import { Envelope, ENVELOPE_WIDTH } from "@/components/app/Envelope";
import type { CardProportion } from "@/lib/card/shapes";

/**
 * The production envelope for Preview (`docs/card-system.md §6.2`; `docs/design-system.md §8.3`):
 * the same one guests open, closed until the host taps it, reduced motion respected (the
 * envelope's own behaviour). The card — drawn by the page from the guest's content — is mounted
 * inside it on opening. The box it opens into is reserved from the first paint, as the reveal
 * does, so the page beneath does not jump when the card appears.
 */

const BOX_WIDTH: Record<CardProportion, string> = {
  "5:7": ENVELOPE_WIDTH.portrait,
  "1:1": ENVELOPE_WIDTH.square,
};
const BOX_HEIGHT: Record<CardProportion, string> = { "5:7": "140cqw", "1:1": "100cqw" };

export function PreviewStage({
  title,
  proportion,
  children,
}: {
  /** The card's effective title: the envelope's front. */
  title: string;
  proportion: CardProportion;
  /** The card, as guests see it. */
  children: ReactNode;
}) {
  return (
    <div
      className="mx-auto w-full"
      style={{ maxWidth: BOX_WIDTH[proportion], containerType: "inline-size" }}
      data-preview-stage=""
    >
      <div className="flex items-center" style={{ minHeight: BOX_HEIGHT[proportion] }}>
        <Envelope title={title} proportion={proportion === "5:7" ? "portrait" : "square"}>
          <div className="h-full w-full" data-preview-card="">
            {children}
          </div>
        </Envelope>
      </div>
    </div>
  );
}
