"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

import { updateEventDetails, type EventDraftView } from "@/app/actions/event-details";
import { switchCardShape } from "@/app/actions/shape";
import { AppButton } from "@/components/app/AppButton";
import { CollaboratorActionSlot } from "@/components/app/CollaboratorActionSlot";
import { InlineStatus } from "@/components/app/InlineStatus";
import { OwnerToolbar } from "@/components/app/OwnerToolbar";
import { SetupChecklist } from "@/components/app/SetupChecklist";
import { SetupProgressPill } from "@/components/app/SetupProgressPill";
import { Sheet } from "@/components/app/Sheet";
import { EventPage } from "@/components/event-page/EventPage";
import type { CardShape } from "@/lib/card/shapes";
import type { EventPageContent } from "@/lib/events/page-content";
import { publishReadiness } from "@/lib/events/publish-readiness";
import { createSaveTracker } from "@/lib/events/save-tracker";
import type { RevealedCard } from "@/lib/generation/reveal.server";
import type { CardShapeOptions, LatestShapeSwitch } from "@/lib/generation/shape.server";
import { shapeAppliedLine, shapeWaitLine } from "@/lib/generation/shape-wait";

import { CohostsPanel, cohostCount, type CohostActions } from "./CohostsPanel";
import { DesignPanel } from "./DesignPanel";
import { DetailsForm } from "./create/DetailsForm";
import type { PrivacyActions } from "./create/PrivacyControl";
import type { ChooseOutcome } from "./direction/NewCardActions";
import { useShapeSwitch } from "./use-shape-switch";

/**
 * Creation Mode's canvas (`docs/design-system.md §10.15 CreationCanvas`; `spec.md §7.12`, `§31` —
 * Creation Mode): the invitation itself — the card, then the house-style page beneath it — with the
 * collaborator anchors attached (`CollaboratorActionSlot`, §10.19): `Edit` on the event details,
 * `Edit` on the description or `Add` when it has none. Opening one shows the event-details editor
 * in a `Sheet` (a full-screen sheet on a phone, a side panel on desktop), the same autosaving form
 * the details step uses with every field. Closing returns focus to the anchor that opened it.
 *
 * Around them: the owner toolbar's `Design` (the Design panel in a `Sheet`: the card's shape, `Try
 * another direction`, the designs list), and the floating readiness control, which opens the setup
 * checklist (`publishReadiness`, `spec.md §23.1`) whose rows open the details editor on the right
 * field. The shape switch lives here, above the panel, so its wait carries on when the panel is
 * closed and a quiet status by the card says so. Only one sheet is open at a time.
 *
 * The card and the page update after saves by refreshing the server data; no model call is made.
 * The editor always opens on the newest saved event (a save's answer can be newer than the page's
 * last refresh), and closing it waits for its last edits to save: if one failed or was refused, it
 * stays open with the message beside the field (a second close leaves anyway).
 * Only the owner's and co-hosts' page renders this, so the anchors never reach a guest.
 *
 * For the owner only (`cohosts.manage`, from `manage_cohosts`; `spec.md §25`): the Co-hosts sheet
 * (`CohostsPanel`), reached from the setup checklist's **Recommended before sharing** Co-host row
 * before publish, and from the toolbar's `Co-hosts` before and after publish (readiness is hidden
 * once published). A co-host sees neither, and the server refuses them either way.
 *
 * For the owner and co-hosts (`guests.manage`, from `manage_guests`; `spec.md §7.13`, §19.2): the
 * guest workspace, a page of its own, reached from the toolbar's `Guests` before and after publish
 * and from the checklist's **Recommended before sharing** Guests row before publish. Guests never
 * count toward readiness (`spec.md §23.1`, §32 #10, #45).
 */

type Panel =
  | { kind: "details"; focusId?: string }
  | { kind: "design" }
  | { kind: "checklist" }
  | { kind: "cohosts" }
  | null;

export function CreationCanvas({
  card,
  event,
  content,
  design,
  shapeWait = null,
  save = updateEventDetails,
  privacy,
  onSaved,
  switchShape = switchCardShape,
  onShapeApplied,
  choose,
  onChosen,
  previewHref,
  cohosts,
  cohostActions,
  guests,
  guestsHref,
}: {
  /** Everything above the page: the card with its markers and legend, and its actions. */
  card: ReactNode;
  event: EventDraftView;
  content: EventPageContent;
  /** The save action; the development fixture injects a stub. */
  save?: typeof updateEventDetails;
  /** The privacy actions (visibility and the event code); the development fixture injects stubs. */
  privacy?: PrivacyActions;
  /** What to do with a saved event; by default the server data is refreshed. */
  onSaved?: (event: EventDraftView) => void;
  /** The active design, for the Design panel and readiness. */
  design: {
    designId: string;
    published: boolean;
    /** The design's drafted title: the effective title when the host has not set one (§20.2). */
    title: string;
    shapes: CardShapeOptions | null;
    designs: readonly RevealedCard[];
  };
  /** The design's shape switch painting or recently failed when the page loaded: shown again. */
  shapeWait?: LatestShapeSwitch | null;
  /** The shape action; the development fixture injects a stub. */
  switchShape?: typeof switchCardShape;
  /** What to do once a shape is on the card; by default the server data is refreshed. */
  onShapeApplied?: (shape: CardShape) => void;
  /** The designs list's choose action and what follows it; the fixture injects stubs. */
  choose?: (designId: string) => Promise<ChooseOutcome>;
  onChosen?: (designId: string) => void;
  /** Where the toolbar's `Preview` goes; the event's preview page by default (the fixture's own). */
  previewHref?: string;
  /**
   * Whether the signed-in member may manage co-hosts (the owner only) and, if so, how many there
   * are.
   */
  cohosts: { manage: false } | { manage: true; count: number };
  /** The Co-hosts sheet's actions; the development fixture injects stubs. */
  cohostActions?: CohostActions;
  /**
   * Whether the signed-in member may manage guests (the owner and co-hosts) and, if so, how many
   * parties there are.
   */
  guests: { manage: false } | { manage: true; parties: number };
  /** Where the guest workspace is: the event's own by default (the fixture's own). */
  guestsHref?: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const panelRef = useRef<Panel>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const detailsAnchor = useRef<HTMLButtonElement | null>(null);
  const descriptionAnchor = useRef<HTMLButtonElement | null>(null);
  const designButton = useRef<HTMLButtonElement | null>(null);
  const cohostsButton = useRef<HTMLButtonElement | null>(null);
  const [cohostTotal, setCohostTotal] = useState(cohosts.manage ? cohosts.count : 0);
  const pill = useRef<HTMLButtonElement | null>(null);
  const [saves] = useState(createSaveTracker);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closing = useRef(false);
  // The last close of the editor was held open by a failed save: the next one leaves.
  const held = useRef(false);
  // The newest event we know of: a save's answer, until the refreshed server data catches up.
  const [latest, setLatest] = useState(event);
  const current = latest.rowVersion > event.rowVersion ? latest : event;

  function saved(next: EventDraftView) {
    setLatest((prev) => (next.rowVersion > prev.rowVersion ? next : prev));
    if (onSaved) return onSaved(next);
    // Autosaves can come in bursts: refresh once they settle.
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 300);
  }

  function showPanel(next: Panel, from: HTMLButtonElement | null) {
    if (next?.kind === "details") {
      // A failure from an earlier visit never holds this one open.
      saves.takeFailures();
      held.current = false;
    }
    if (from) opener.current = from;
    panelRef.current = next;
    setPanel(next);
  }

  /** Closes `kind` if it is the sheet that is open (a sheet closing after another opened is not). */
  async function closePanel(kind: NonNullable<Panel>["kind"]) {
    if (kind === "details") {
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
    }
    if (panelRef.current?.kind !== kind) return;
    panelRef.current = null;
    setPanel(null);
    // The browser returns focus to the opener; this makes it certain when the opener re-rendered.
    queueMicrotask(() => opener.current?.focus());
  }

  // Said once a shape is on the card (screen readers); the wait's own line says it is under way.
  const [announcement, setAnnouncement] = useState("");
  const shapeSwitch = useShapeSwitch({
    eventId: event.id,
    designId: design.designId,
    switchShape,
    onApplied: (shape) => {
      setAnnouncement(shapeAppliedLine(shape));
      if (onShapeApplied) onShapeApplied(shape);
      else router.refresh();
    },
    initial: shapeWait,
  });
  const switching = shapeSwitch.state;

  const guestsLink = guests.manage ? (guestsHref ?? `/events/${event.id}/guests`) : undefined;

  const readiness = publishReadiness({
    details: current,
    designTitle: design.title,
    hasCard: true,
    // From the newest event we know of, so making a code clears its blocker at once.
    accessCodeSet: current.accessCodeSet,
  });

  return (
    <>
      <div className="flex w-full flex-col items-center gap-6 pb-20">
        <OwnerToolbar
          previewHref={previewHref ?? `/events/${event.id}/preview`}
          designRef={designButton}
          onDesign={() => showPanel({ kind: "design" }, designButton.current)}
          cohostsRef={cohostsButton}
          onCohosts={
            cohosts.manage ? () => showPanel({ kind: "cohosts" }, cohostsButton.current) : undefined
          }
          guestsHref={guestsLink}
        />
        {(switching.kind === "starting" || switching.kind === "running") && (
          <InlineStatus
            // Live only while the Design panel is closed: the open panel says it (read once).
            live={panel?.kind !== "design"}
            className="-mb-2"
          >
            <span data-shape-status="">{shapeWaitLine(switching.shape)}</span>
          </InlineStatus>
        )}
        {switching.kind === "failed" && (
          <div data-shape-status="" className="-mb-2 flex flex-wrap items-center gap-3">
            <InlineStatus variant="danger">{switching.failure.title}</InlineStatus>
            {switching.failure.retry && (
              <AppButton variant="secondary" size="sm" onClick={shapeSwitch.retry}>
                Try again
              </AppButton>
            )}
            <AppButton variant="ghost" size="sm" onClick={shapeSwitch.dismiss}>
              Dismiss
            </AppButton>
          </div>
        )}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
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
                onClick={() => showPanel({ kind: "details" }, detailsAnchor.current)}
              />
            ),
            description: (
              <CollaboratorActionSlot
                ref={descriptionAnchor}
                anchor="description"
                action={content.description === null ? "Add" : "Edit"}
                label={content.description === null ? "Add a description" : "Edit description"}
                onClick={() =>
                  showPanel({ kind: "details", focusId: "description" }, descriptionAnchor.current)
                }
              />
            ),
          }}
        />
      </div>
      {/* Readiness is for publishing: once published there is nothing left to set up for it. */}
      {!design.published && (
        <SetupProgressPill
          left={readiness.blockers.length}
          pillRef={pill}
          onOpen={() => showPanel({ kind: "checklist" }, pill.current)}
        />
      )}
      <Sheet
        open={panel?.kind === "design"}
        onClose={() => void closePanel("design")}
        title="Design"
        description="Change the card's shape or choose another design. Your event details stay as they are."
      >
        <DesignPanel
          eventId={event.id}
          designId={design.designId}
          published={design.published}
          shapes={design.shapes}
          switching={switching}
          onChooseShape={(shape) => void shapeSwitch.start(shape)}
          onRetryShape={shapeSwitch.retry}
          onDismissShape={shapeSwitch.dismiss}
          shapeAnnouncement={announcement}
          designs={design.designs}
          choose={choose}
          onChosen={onChosen}
        />
      </Sheet>
      <Sheet
        open={!design.published && panel?.kind === "checklist"}
        onClose={() => void closePanel("checklist")}
        title="Setup"
        description="Only what's needed to publish is listed here."
      >
        <SetupChecklist
          blockers={readiness.blockers}
          // The checklist hands over to the editor; closing the editor returns focus to the pill.
          onOpen={(focusId) => showPanel({ kind: "details", focusId }, null)}
          recommended={[
            ...(guestsLink && guests.manage
              ? [
                  {
                    key: "guests",
                    label: "Guests",
                    description:
                      guests.parties === 0
                        ? "Add the people you're inviting."
                        : guests.parties === 1
                          ? "1 party added."
                          : `${guests.parties} parties added.`,
                    done: guests.parties > 0,
                    onOpen: () => router.push(guestsLink),
                  },
                ]
              : []),
            ...(cohosts.manage
              ? [
                  {
                    key: "cohost",
                    label: "Co-host",
                    description:
                      cohostTotal === 0
                        ? "Invite someone to help you plan and host."
                        : cohostTotal === 1
                          ? "1 co-host is helping you."
                          : `${cohostTotal} co-hosts are helping you.`,
                    done: cohostTotal > 0,
                    // As for the editor: closing the sheet returns focus to the pill.
                    onOpen: () => showPanel({ kind: "cohosts" }, null),
                  },
                ]
              : []),
          ]}
        />
      </Sheet>
      {cohosts.manage && (
        <Sheet
          open={panel?.kind === "cohosts"}
          onClose={() => void closePanel("cohosts")}
          title="Co-hosts"
          description="Co-hosts can edit the invitation, manage guests and the registry, and publish once it's paid for. Only you can pay, manage co-hosts or delete the event."
        >
          <CohostsPanel
            eventId={event.id}
            actions={cohostActions}
            onRoster={(roster) => setCohostTotal(cohostCount(roster))}
          />
        </Sheet>
      )}
      <Sheet
        open={panel?.kind === "details"}
        onClose={() => void closePanel("details")}
        title="Event details"
        description="Changes save as you go. The card and the page update with them."
      >
        <DetailsForm
          event={current}
          variant="all"
          save={save}
          privacy={privacy}
          saves={saves}
          onSaved={saved}
          // The field the host came for, else the first field.
          focusId={panel?.kind === "details" ? (panel.focusId ?? "title") : undefined}
        />
      </Sheet>
    </>
  );
}
