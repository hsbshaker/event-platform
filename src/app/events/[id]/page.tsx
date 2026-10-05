import { redirect } from "next/navigation";
import { z } from "zod";

import { loadCardShapeOptionsAction } from "@/app/actions/shape";
import { loadEventDraft, type EventDraftView } from "@/app/actions/event-details";
import { AppButtonLink } from "@/components/app/AppButtonLink";
import { ConfirmLegend } from "@/components/app/ConfirmMarkers";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { accessCodeIsSet } from "@/lib/events/access-code.server";
import { runningShapeSwitch } from "@/lib/generation/shape.server";
import { eventPageContent } from "@/lib/events/page-content";
import {
  loadEventDesigns,
  loadRevealedCard,
  type RevealedCard,
} from "@/lib/generation/reveal.server";
import { CreationCanvas } from "./CreationCanvas";
import { EventUnavailable } from "./EventUnavailable";
import { SteadyCard } from "./SteadyCard";

/**
 * Creation Mode (`docs/screen-spec.md` `creation-mode`; `spec.md §7.11`, §7.12): the same
 * invitation the reveal showed, with no envelope, for the event's owner and co-hosts — the card at
 * a comfortable size with its "needs confirming" markers, then the house-style page beneath it
 * (`EventPage`), with the `Edit` / `Add` anchors that open the event-details editor
 * (`CreationCanvas`). There is no dashboard here. The owner toolbar's `Design` panel holds the shape
 * control, `Try another direction` and the designs list; the readiness control and its checklist
 * float over the page. Preview comes in a later slice.
 *
 * Anyone else, and an id that is not an event's, sees the same plain "isn't available" state as
 * the create page, so it never says whether an event exists (`spec.md §27`). An event with no card
 * yet goes to the wait that makes it.
 */

/**
 * The Design panel's shape control starts a generation (`switchCardShape`) that runs after its
 * response, within this page's `maxDuration` (Server Actions take the timeout of the page that
 * invokes them): 300 s is `GENERATION_MAX_DURATION_SECONDS`, as on the create and direction pages;
 * a literal, because route segment config is read statically.
 */
export const maxDuration = 300;

const CARD_WIDTH = {
  "5:7": "min(100%, calc(var(--width-narrow) * 0.86))",
  "1:1": "min(100%, calc(var(--width-narrow) * 1.05))",
} as const;

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return <EventUnavailable />;

  // One moment for the card and the page beneath it, so their placeholders agree.
  const moment = new Date();
  const now = moment.getTime();
  let revealed: RevealedCard | null;
  let draft: EventDraftView | null;
  try {
    revealed = await loadRevealedCard(id, { now: () => now });
    draft = revealed ? await loadEventDraft(id) : null;
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return <EventUnavailable />;
    }
    throw error;
  }
  if (!revealed || !draft) redirect(`/events/${id}/create`);
  // Every design of the event, browsable before publish (`spec.md §31` — Card experience).
  const designs = await loadEventDesigns(id);
  const shapes = await loadCardShapeOptionsAction(id);
  // A shape switch still painting (the page loaded mid-wait): its quiet status shows again.
  const shapeWait = await runningShapeSwitch(id);
  const accessCodeSet = draft.visibility === "private" ? await accessCodeIsSet(id) : false;

  const { card } = revealed;
  const proportion = card.artwork.proportion;
  const content = eventPageContent(
    {
      title: revealed.title,
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
      stated: revealed.stated,
    },
    "creation",
    moment,
  );
  return (
    <main className="mx-auto flex w-full max-w-(--width-wide) flex-1 flex-col items-center gap-6 px-4 py-10 lg:py-14">
      <CreationCanvas
        event={draft}
        content={content}
        accessCodeSet={accessCodeSet}
        shapeWait={shapeWait}
        design={{
          designId: revealed.designId,
          published: revealed.published,
          title: revealed.title,
          shapes,
          designs,
        }}
        card={
          <>
            <div
              className="w-full"
              style={{
                maxWidth: CARD_WIDTH[proportion],
                aspectRatio: proportion === "5:7" ? "5 / 7" : "1 / 1",
              }}
            >
              <SteadyCard card={card} unconfirmed={revealed.unconfirmed} />
            </div>
            <ConfirmLegend
              boxes={card.boxes}
              unconfirmed={revealed.unconfirmed}
              className="max-w-prose"
            />
            {/* Before publish only (`spec.md §8.2`). */}
            {!revealed.published && (
              <AppButtonLink
                href={`/events/${id}/direction?from=${revealed.designId}`}
                variant="secondary"
                size="md"
              >
                Try another direction ✦
              </AppButtonLink>
            )}
          </>
        }
      />
    </main>
  );
}
