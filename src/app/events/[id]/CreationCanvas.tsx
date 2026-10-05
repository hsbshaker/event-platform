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
 * The editor always opens on the newest saved event (a save's answer can be newer than the page's
 * last refresh), and closing it waits for its last edits to save: if one failed or was refused, it
 * stays open with the message beside the field (a second close leaves anyway).
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
  const closing = useRef(false);
  // The last close was held open by a failed save: the next one leaves whatever happens.
  const held = useRef(false);
  // The newest saved event this page has seen: a save's answer, until the server data catches up.
  const [latest, setLatest] = useState<EventDraftView>(event);
  const current = latest.rowVersion > event.rowVersion ? latest : event;

  function saved(next: EventDraftView) {
    setLatest((prev) => (next.rowVersion > prev.rowVersion ? next : prev));
    if (onSaved) return onSaved(next);
    // Autosaves can come in bursts: refresh once they settle.
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 300);
  }

  function show(anchor: Anchor, ref: { current: HTMLButtonElement | null }) {
    // A failure from an earlier visit never holds this one open.
    saves.takeFailures();
    held.current = false;
    opener.current = ref.current;
    setOpen(anchor);
  }

  async function close() {
    if (closing.current) return;
    closing.current = true;
    try {
      // Saves any edit still waiting on its debounce, and waits for every save to answer.
      await saves.settle();
    } finally {
      closing.current = false;
    }
    // A save that failed or was refused: the form shows why; the host closes again to leave.
    if (saves.takeFailures() > 0 && !held.current) {
      held.current = true;
      return;
    }
    held.current = false;
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
          event={current}
          variant="all"
          save={save}
          saves={saves}
          onSaved={saved}
          // The field the host came for: the description, else the first field.
          focusId={open === "description" ? "description" : "title"}
        />
      </Sheet>
    </>
  );
}
