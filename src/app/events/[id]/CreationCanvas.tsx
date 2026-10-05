"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

import { updateEventDetails, type EventDraftView } from "@/app/actions/event-details";
import { CollaboratorActionSlot } from "@/components/app/CollaboratorActionSlot";
import { Sheet } from "@/components/app/Sheet";
import { EventPage } from "@/components/event-page/EventPage";
import type { EventPageContent } from "@/lib/events/page-content";

import { createSaveTracker } from "@/lib/events/save-tracker";

import { DetailsForm } from "./create/DetailsForm";

/**
 * Creation Mode's canvas (`docs/design-system.md §10.15 CreationCanvas`; `spec.md §7.12`, `§31` —
 * Creation Mode): the invitation itself — the card, then the house-style page beneath it — with the
 * collaborator anchors attached (`CollaboratorActionSlot`, §10.19): `Edit` on the event details,
 * `Edit` on the description or `Add` when it has none. Opening one shows the event-details editor
 * in a `Sheet` (a full-screen sheet on a phone, a side panel on desktop), the same autosaving form
 * the details step uses with every field. Closing returns focus to the anchor that opened it.
 *
 * The card and the page update after saves by refreshing the server data; no model call is made.
 * Only the owner's and co-hosts' page renders this, so the anchors never reach a guest.
 */

type Anchor = "details" | "description";

export function CreationCanvas({
  card,
  below,
  event,
  content,
  save = updateEventDetails,
  onSaved,
}: {
  /** Everything above the page: the card with its markers and legend, and its actions. */
  card: ReactNode;
  /** After the page: the designs list. */
  below?: ReactNode;
  event: EventDraftView;
  content: EventPageContent;
  /** The save action; the development fixture injects a stub. */
  save?: typeof updateEventDetails;
  /** What to do with a saved event; by default the server data is refreshed. */
  onSaved?: (event: EventDraftView) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Anchor | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const detailsAnchor = useRef<HTMLButtonElement | null>(null);
  const descriptionAnchor = useRef<HTMLButtonElement | null>(null);
  const [saves] = useState(createSaveTracker);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function saved(next: EventDraftView) {
    if (onSaved) return onSaved(next);
    // Autosaves can come in bursts: refresh once they settle.
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 300);
  }

  function show(anchor: Anchor, ref: { current: HTMLButtonElement | null }) {
    opener.current = ref.current;
    setOpen(anchor);
  }

  function close() {
    // Sends any edit still waiting on its debounce before the form goes away.
    void saves.settle();
    setOpen(null);
    // The browser returns focus to the opener; this makes it certain when the opener re-rendered.
    queueMicrotask(() => opener.current?.focus());
  }

  return (
    <>
      <div className="flex w-full flex-col items-center gap-6">
        {card}
        <EventPage
          content={content}
          collaborator={{
            details: (
              <CollaboratorActionSlot
                ref={detailsAnchor}
                anchor="details"
                action="Edit"
                label="Edit event details"
                onClick={() => show("details", detailsAnchor)}
              />
            ),
            description: (
              <CollaboratorActionSlot
                ref={descriptionAnchor}
                anchor="description"
                action={content.description === null ? "Add" : "Edit"}
                label={content.description === null ? "Add a description" : "Edit description"}
                onClick={() => show("description", descriptionAnchor)}
              />
            ),
          }}
        />
        {below}
      </div>
      <Sheet
        open={open !== null}
        onClose={close}
        title="Event details"
        description="Changes save as you go. The card and the page update with them."
      >
        <DetailsForm
          event={event}
          variant="all"
          save={save}
          saves={saves}
          onSaved={saved}
          focusId={open === "description" ? "description" : undefined}
        />
      </Sheet>
    </>
  );
}
