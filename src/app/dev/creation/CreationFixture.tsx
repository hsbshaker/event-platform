"use client";

import { useRef, useState, type ReactNode } from "react";

import type { SwitchCardShapeInput, SwitchCardShapeResult } from "@/app/actions/shape";

import type { EventDetailsPatch, EventDraftView, UpdateResult } from "@/app/actions/event-details";
import type { SetEventPrivacyInput } from "@/app/actions/privacy";
import { CreationCanvas } from "@/app/events/[id]/CreationCanvas";
import type { PrivacyActions } from "@/app/events/[id]/create/PrivacyControl";
import { EventPage } from "@/components/event-page/EventPage";
import { promptFactCandidates } from "@/lib/card/facts";
import type { CardShape } from "@/lib/card/shapes";
import type { RevealedCard } from "@/lib/generation/reveal.server";
import type { CardShapeOptions, LatestShapeSwitch } from "@/lib/generation/shape.server";
import { eventPageContent, type EventPageVariant } from "@/lib/events/page-content";

import { fixtureCohostActions } from "./cohost-stubs";

/**
 * Creation Mode's canvas from fixture data: the real `CreationCanvas`, `EventPage` and details
 * editor, with a stubbed save that applies the patch to local state (what the page's refresh does
 * after the real action). The `guest` variant draws the same `EventPage` with no collaborator slot
 * and no placeholders, as the guest page will.
 *
 * Test switches: `lag` applies a save to the page's data only after `LAG_MS`, as a slow refresh
 * would; `refuse` makes the save refuse any title containing "Refuse", as the server's fit check
 * refuses a title the card cannot show.
 *
 * The privacy stubs behave as the privacy action does: going private with no code stored makes
 * the next code of `FIXTURE_CODES` and stores it; a stored code is kept both ways; `New code` takes
 * the next one.
 */

const LAG_MS = 3000;
/** The codes the privacy stubs hand out, in order. */
export const FIXTURE_CODES = ["K7MP-4QRT", "W9XH-3NVC", "B2DF-6GJS", "Q8RT-5YZA"] as const;
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
  rsvpDeadline: "rsvpDeadline",
};

export function CreationFixture({
  cards,
  initial,
  variant,
  lag = false,
  refuse = false,
  shape,
  supported,
  published,
  designs: initialDesigns,
  shapeWait = null,
  previewHref,
  storedCode = false,
  role = "owner",
  cohosts = 0,
  pendingInvites = 0,
}: {
  /** The active design's card in each shape its layout supports. */
  cards: Record<CardShape, ReactNode>;
  initial: EventDraftView;
  variant: EventPageVariant;
  lag?: boolean;
  refuse?: boolean;
  shape: CardShape;
  supported: readonly CardShape[];
  published: boolean;
  designs: RevealedCard[];
  /** The design's shape switch painting or recently failed when the page loaded. */
  shapeWait?: LatestShapeSwitch | null;
  /** Where the toolbar's `Preview` goes: the development preview fixture. */
  previewHref: string;
  /** The event starts with a code stored (the first of `FIXTURE_CODES`). */
  storedCode?: boolean;
  /** Who is signed in: the owner (who manages co-hosts) or a co-host (who does not). */
  role?: "owner" | "cohost";
  /** Co-hosts and pending invite links the event starts with. */
  cohosts?: number;
  pendingInvites?: number;
}) {
  const [event, setEvent] = useState(initial);
  const [cohostActions] = useState(() =>
    fixtureCohostActions({ cohosts, pending: pendingInvites }),
  );
  const [current, setCurrent] = useState(shape);
  // The 5:7 shapes are fitted by the artwork the design was made with; a square needs new artwork
  // until one is painted (the stub's poll succeeds).
  const [painted, setPainted] = useState<readonly CardShape[]>(
    supported.filter((s) => s !== "square" && s !== "circle"),
  );
  const [designs, setDesigns] = useState(initialDesigns);

  const shapes: CardShapeOptions = {
    designId: "fixture-design-1",
    current,
    options: supported.map((s) => {
      const instant = painted.includes(s);
      return { shape: s, instant, available: instant || !published };
    }),
  };

  async function switchShape(input: SwitchCardShapeInput): Promise<SwitchCardShapeResult> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (painted.includes(input.shape)) return { outcome: "switched", generationId: null };
    if (published) return { outcome: "published", generationId: null };
    return { outcome: "started", generationId: "fixture-generation-1" };
  }

  function applied(next: CardShape) {
    setPainted((all) => (all.includes(next) ? all : [...all, next]));
    setCurrent(next);
  }

  const latest = useRef(initial);
  const code = useRef<{ stored: string | null; issued: number }>({
    stored: storedCode ? FIXTURE_CODES[0] : null,
    issued: storedCode ? 1 : 0,
  });

  // Stable for the life of the page, as the real actions are.
  const [privacy] = useState<PrivacyActions>(() => {
    const issue = () => {
      const next = FIXTURE_CODES[code.current.issued % FIXTURE_CODES.length];
      code.current = { stored: next, issued: code.current.issued + 1 };
      return next;
    };
    return {
      async setPrivacy(input: SetEventPrivacyInput) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        if (input.visibility === "private" && code.current.stored === null) issue();
        latest.current = {
          ...latest.current,
          visibility: input.visibility,
          accessCodeSet: code.current.stored !== null,
          rowVersion: latest.current.rowVersion + 1,
        };
        return {
          ok: true as const,
          event: latest.current,
          code: input.visibility === "private" ? code.current.stored : null,
        };
      },
      async newCode() {
        await new Promise((resolve) => setTimeout(resolve, 60));
        if (latest.current.visibility !== "private") {
          return {
            ok: false as const,
            reason: "not_private" as const,
            error: "Make the invitation private to give it an event code.",
          };
        }
        return { ok: true as const, code: issue() };
      },
      async reveal() {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return {
          ok: true as const,
          code: latest.current.visibility === "private" ? code.current.stored : null,
        };
      },
    };
  });

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
          card={cards[current]}
          event={event}
          shapeWait={shapeWait}
          privacy={privacy}
          design={{
            designId: "fixture-design-1",
            published,
            title: DESIGN_TITLE,
            shapes,
            designs,
          }}
          switchShape={switchShape}
          onShapeApplied={applied}
          choose={async () => {
            await new Promise((resolve) => setTimeout(resolve, 80));
            return { ok: true };
          }}
          previewHref={previewHref}
          cohosts={role === "owner" ? { manage: true, count: cohosts } : { manage: false }}
          cohostActions={cohostActions}
          onChosen={(designId) =>
            setDesigns((all) => all.map((d) => ({ ...d, active: d.designId === designId })))
          }
          content={content}
          save={save}
          onSaved={(next) => (lag ? setTimeout(() => setEvent(next), LAG_MS) : setEvent(next))}
        />
      ) : (
        <>
          {cards[current]}
          <EventPage content={content} />
        </>
      )}
    </main>
  );
}
