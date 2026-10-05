import { ConfirmMarkers } from "@/components/app/ConfirmMarkers";
import { InvitationCard } from "@/components/card/InvitationCard";
import type { RevealedCard } from "@/lib/generation/reveal.server";

/**
 * The host's card with its "needs confirming" markers laid over it: `InvitationCard`, the one card
 * component, drawn exactly as it is for guests, and `ConfirmMarkers` (app chrome) in a sibling layer
 * of the same box. Host surfaces only — the reveal and Creation Mode; a guest surface renders the
 * card alone. Fills the box it is given, which carries the card's proportion; server-compatible.
 *
 * Type-only import of `RevealedCard`: the server module is never bundled for the browser.
 */
export function CardWithMarkers({
  card,
  unconfirmed,
}: {
  card: RevealedCard["card"];
  unconfirmed: readonly string[];
}) {
  return (
    <div className="relative h-full w-full">
      <InvitationCard
        shape={card.shape}
        artwork={card.artwork}
        panels={card.panels}
        boxes={card.boxes}
      />
      <ConfirmMarkers
        boxes={card.boxes}
        unconfirmed={unconfirmed}
        proportion={card.artwork.proportion}
      />
    </div>
  );
}
