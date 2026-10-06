import { redirect } from "next/navigation";
import { z } from "zod";

import { loadEventDraft } from "@/app/actions/event-details";
import { InvitationCard } from "@/components/card/InvitationCard";
import { EventPage } from "@/components/event-page/EventPage";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { eventPageContent } from "@/lib/events/page-content";
import { hasDetailsHiddenFromGuests, PREVIEW_HIDDEN_LINE } from "@/lib/events/preview";
import { loadRevealedCard } from "@/lib/generation/reveal.server";

import { EventUnavailable } from "../EventUnavailable";
import { PreviewShell } from "./PreviewShell";
import { PreviewStage } from "./PreviewStage";

/**
 * Preview (`docs/screen-spec.md` `preview`; `spec.md §7.16`, §19.1, §21): the guest experience —
 * the production envelope, then the card, then the house-style page — with the event's current
 * content, for the event's owner and co-hosts. It is the guest's view, so it carries the guest's
 * content: the card and the page show the host's saved facts only, never a placeholder or a value
 * only the prompt stated (`spec.md §7.3`), and none of Creation Mode's markers, anchors, toolbar or
 * readiness control. When a fact is missing, one plain line says it is not shown.
 *
 * Anyone else, and an id that is not an event's, sees the same plain "isn't available" state as
 * Creation Mode (`spec.md §27`). An event with no card yet goes to the wait that makes it.
 * Publishing is not here (Phase 9).
 */

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return <EventUnavailable />;

  const moment = new Date();
  let guestCard: Awaited<ReturnType<typeof loadRevealedCard>>;
  let draft: Awaited<ReturnType<typeof loadEventDraft>> = null;
  try {
    guestCard = await loadRevealedCard(id, { now: () => moment.getTime(), audience: "guest" });
    draft = guestCard ? await loadEventDraft(id) : null;
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return <EventUnavailable />;
    }
    throw error;
  }
  if (!guestCard || !draft) redirect(`/events/${id}/create`);

  const { card } = guestCard;
  const content = eventPageContent(
    {
      title: guestCard.title,
      hosts: draft.hosts,
      babyName: draft.babyName,
      eventDate: draft.eventDate,
      startTime: draft.startTime,
      endTime: draft.endTime,
      venueName: draft.venueName,
      address: draft.address,
      rsvpDeadline: draft.rsvpDeadline,
      timezone: draft.timezone,
      description: draft.description,
      stated: {},
    },
    "guest",
    moment,
  );

  return (
    <PreviewShell
      backHref={`/events/${id}`}
      hiddenLine={hasDetailsHiddenFromGuests(draft.missing) ? PREVIEW_HIDDEN_LINE : null}
    >
      <PreviewStage title={guestCard.title} proportion={card.artwork.proportion}>
        <InvitationCard
          shape={card.shape}
          artwork={card.artwork}
          panels={card.panels}
          placement={card.placement}
          boxes={card.boxes}
        />
      </PreviewStage>
      <EventPage content={content} />
    </PreviewShell>
  );
}
