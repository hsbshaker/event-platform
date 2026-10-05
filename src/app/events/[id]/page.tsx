import { redirect } from "next/navigation";
import { z } from "zod";

import { ConfirmLegend } from "@/components/app/ConfirmMarkers";
import { CardWithMarkers } from "@/components/reveal/CardWithMarkers";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { loadRevealedCard, type RevealedCard } from "@/lib/generation/reveal.server";
import { EventUnavailable } from "./EventUnavailable";

/**
 * The entry to Creation Mode (`docs/screen-spec.md` `creation-mode`; `spec.md §7.11`): the same
 * invitation the reveal showed, with no envelope, for the event's owner and co-hosts. This is the
 * minimal entry: the card at a comfortable size with its "needs confirming" markers. The page's
 * sections, the `Edit` / `Set up` / `Add` anchors and readiness arrive with Creation Mode proper;
 * there is no dashboard here.
 *
 * Anyone else, and an id that is not an event's, sees the same plain "isn't available" state as
 * the create page, so it never says whether an event exists (`spec.md §27`). An event with no card
 * yet goes to the wait that makes it.
 */

const CARD_WIDTH = {
  "5:7": "min(100%, calc(var(--width-narrow) * 0.86))",
  "1:1": "min(100%, calc(var(--width-narrow) * 1.05))",
} as const;

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return <EventUnavailable />;

  let revealed: RevealedCard | null;
  try {
    revealed = await loadRevealedCard(id);
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return <EventUnavailable />;
    }
    throw error;
  }
  if (!revealed) redirect(`/events/${id}/create`);

  const { card } = revealed;
  const proportion = card.artwork.proportion;
  return (
    <main className="mx-auto flex w-full max-w-(--width-wide) flex-1 flex-col items-center gap-6 px-4 py-10 lg:py-14">
      <h1 className="sr-only">{revealed.title}</h1>
      <div
        className="w-full"
        style={{
          maxWidth: CARD_WIDTH[proportion],
          aspectRatio: proportion === "5:7" ? "5 / 7" : "1 / 1",
        }}
      >
        <CardWithMarkers card={card} unconfirmed={revealed.unconfirmed} />
      </div>
      <ConfirmLegend
        boxes={card.boxes}
        unconfirmed={revealed.unconfirmed}
        className="max-w-prose"
      />
    </main>
  );
}
