"use client";

import { useRef, useState, type ReactNode } from "react";

import type { EventDetailsPatch, EventDraftView, UpdateResult } from "@/app/actions/event-details";
import { CreationCanvas } from "@/app/events/[id]/CreationCanvas";
import { EventPage } from "@/components/event-page/EventPage";
import { promptFactCandidates } from "@/lib/card/facts";
import { eventPageContent, type EventPageVariant } from "@/lib/events/page-content";

/**
 * Creation Mode's canvas from fixture data: the real `CreationCanvas`, `EventPage` and details
 * editor, with a stubbed save that applies the patch to local state (what the page's refresh does
 * after the real action). The `guest` variant draws the same `EventPage` with no collaborator slot
 * and no placeholders, as the guest page will.
 *
 * Test switches: `lag` applies a save to the page's data only after `LAG_MS`, as a slow refresh
 * would; `refuse` makes the save refuse any title containing "Refuse", as the server's fit check
 * refuses a title the card cannot show.
 */

const LAG_MS = 3000;
export const REFUSED_TITLE_MESSAGE = "This title is too long for the card.";

const NOW = new Date("2026-10-05T12:00:00Z");
const DESIGN_TITLE = "Lemons & Linen";

const COLUMN: Record<string, keyof EventDraftView> = {
  title: "title",
  description: "description",
  eventDate: "eventDate",
  startTime: "startTime",
  endTime: "endTime",
  venueName: "venueName",
  address: "address",
  hosts: "hosts",
  babyName: "babyName",
  visibility: "visibility",
  rsvpDeadline: "rsvpDeadline",
};

export function CreationFixture({
  card,
  initial,
  variant,
  lag = false,
  refuse = false,
}: {
  card: ReactNode;
  initial: EventDraftView;
  variant: EventPageVariant;
  lag?: boolean;
  refuse?: boolean;
}) {
  const [event, setEvent] = useState(initial);
  const latest = useRef(initial);

  async function save(_eventId: string, patch: EventDetailsPatch): Promise<UpdateResult> {
    await new Promise((resolve) => setTimeout(resolve, 60));
    if (refuse && typeof patch.title === "string" && patch.title.includes("Refuse")) {
      return {
        ok: false,
        error: "Check the highlighted fields.",
        fieldErrors: { title: REFUSED_TITLE_MESSAGE },
      };
    }
    const next = { ...latest.current, rowVersion: latest.current.rowVersion + 1 } as Record<
      string,
      unknown
    >;
    for (const [key, value] of Object.entries(patch)) {
      const column = COLUMN[key];
      if (column) next[column] = value === "" ? null : value;
    }
    latest.current = next as unknown as EventDraftView;
    return { ok: true, event: latest.current };
  }

  const content = eventPageContent(
    {
      title: event.title?.trim() || DESIGN_TITLE,
      hosts: event.hosts,
      babyName: event.babyName,
      eventDate: event.eventDate,
      startTime: event.startTime,
      endTime: event.endTime,
      venueName: event.venueName,
      address: event.address,
      rsvpDeadline: event.rsvpDeadline,
      timezone: event.timezone,
      description: event.description,
      // The fixture has no server fit check: the stated values that pass the entry check.
      stated: promptFactCandidates({ event, promptFacts: event.promptFacts }),
    },
    variant,
    NOW,
  );

  return (
    <main className="mx-auto flex w-full max-w-(--width-wide) flex-1 flex-col items-center gap-6 px-4 py-10 lg:py-14">
      {variant === "creation" ? (
        <CreationCanvas
          card={card}
          event={event}
          content={content}
          save={save}
          onSaved={(next) => (lag ? setTimeout(() => setEvent(next), LAG_MS) : setEvent(next))}
        />
      ) : (
        <>
          {card}
          <EventPage content={content} />
        </>
      )}
    </main>
  );
}
