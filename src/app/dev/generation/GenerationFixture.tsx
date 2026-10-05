"use client";

import { useState } from "react";

import type { EventDraftView } from "@/app/actions/event-details";
import { DetailsForm } from "@/app/events/[id]/create/DetailsForm";
import {
  GenerationPanel,
  RevealLayout,
  WaitLayout,
  type PanelState,
} from "@/app/events/[id]/create/GenerationPanel";
import { FirstCardActions, RevealStage } from "@/app/events/[id]/create/RevealStage";
import { DirectionBox } from "@/app/events/[id]/direction/DirectionBox";
import { DirectionWait } from "@/app/events/[id]/direction/DirectionSurface";
import { NewCardActions, type ChooseOutcome } from "@/app/events/[id]/direction/NewCardActions";
import { provisionalContent } from "@/lib/events/provisional";
import { missingRequiredDetails } from "@/lib/events/required-details";
import { COPYRIGHT_STEP_BACK_NOTICE, generationFailure } from "@/lib/generation/failure-copy";
import type { RevealedCard } from "@/lib/generation/reveal.server";
import type { WaitGeneration } from "@/lib/generation/wait-view";

export type FixtureState =
  | "starting"
  | "identity"
  | "design"
  | "notice"
  | "failed"
  | "reveal"
  | "direction-box"
  | "direction-wait"
  | "direction-failed"
  | "direction-reveal";

const IDENTITY: NonNullable<WaitGeneration["identity"]> = {
  creativeDirection: "A slow, sunlit garden shower: lemons, linen and long tables.",
  toneKeywords: ["warm", "unhurried", "fresh"],
  palette: ["lemon yellow", "olive", "cream"],
  visualMotifs: ["lemon branches", "woven linen", "wildflowers"],
};

const DESIGN: NonNullable<WaitGeneration["design"]> = {
  name: "Lemons & Linen",
  description: "A lemon branch over soft linen.",
  artDirection: {
    subject: "A single lemon branch, leaves and fruit, laid across the page",
    medium: "Loose watercolour on textured paper",
    mood: "Calm, sunny and generous",
    palette: "Lemon yellow and olive green on warm cream",
    texture: "Visible linen weave and soft paper grain",
  },
};

function generation(partial: Partial<WaitGeneration>): WaitGeneration {
  return {
    id: "fixture-generation",
    status: "running",
    stage: null,
    identity: null,
    design: null,
    failure: null,
    notice: null,
    facts: null,
    cardDesignId: null,
    ...partial,
  };
}

function panelState(state: FixtureState, code: string): PanelState {
  switch (state) {
    case "identity":
      return {
        kind: "running",
        offline: false,
        generation: generation({ stage: "identity", identity: IDENTITY }),
      };
    case "design":
      return {
        kind: "running",
        offline: false,
        generation: generation({ stage: "design", identity: IDENTITY, design: DESIGN }),
      };
    case "notice":
      return {
        kind: "running",
        offline: false,
        generation: generation({ notice: COPYRIGHT_STEP_BACK_NOTICE }),
      };
    case "direction-wait":
      return {
        kind: "running",
        offline: false,
        generation: generation({ stage: "design", identity: IDENTITY, design: DESIGN }),
      };
    case "failed":
    case "direction-failed":
      return { kind: "failed", failure: generationFailure(code), retrying: false };
    default:
      return { kind: "starting" };
  }
}

const NOW = new Date("2026-10-05T12:00:00Z");

/** An event with nothing filled in yet, and a prompt that stated a few facts. */
function fixtureDraft(): EventDraftView {
  const fields = {
    title: null,
    eventDate: null,
    startTime: null,
    endTime: null,
    timezone: "America/Chicago",
    venueName: null,
    address: null,
    hosts: null,
    babyName: null,
    visibility: null,
    rsvpDeadline: null,
  };
  return {
    ...fields,
    id: "fixture-event",
    prompt: "A garden baby shower for Maya Lopez on December 19 at 2pm at Villa Rosa",
    rsvpDeadlineEdited: false,
    generationRequestedAt: null,
    rowVersion: 1,
    promptFacts: {
      hosts: "Ana & Leo",
      honoree: "Maya Lopez",
      date: "December 19",
      time: "2pm",
      venue: "Villa Rosa",
      location: null,
    },
    missing: missingRequiredDetails(fields),
    provisional: provisionalContent({ ...fields, venue: null }, NOW),
  };
}

const EVENT_ID = "00000000-0000-4000-8000-000000000000";

/** The box with a stub in place of the start: shows what would be sent. */
function DirectionBoxFixture({ card }: { card: RevealedCard }) {
  const [sent, setSent] = useState<string | null | undefined>(undefined);
  return (
    <>
      <DirectionBox
        card={card.card}
        pending={false}
        backHref={`/events/${EVENT_ID}`}
        onSubmit={(feedback) => setSent(feedback)}
      />
      {sent !== undefined && (
        <p data-fixture-submitted="" className="px-4 pb-6 text-center text-body-sm break-words">
          {sent === null ? "Sent: a new idea" : `Sent: ${sent}`}
        </p>
      )}
    </>
  );
}

/** The new card's reveal with stubs for choosing: `choose` is `ok`, `published` or `not_found`. */
function NewCardFixture({
  card,
  delayMs,
  choose,
}: {
  card: RevealedCard;
  delayMs: number;
  choose: string;
}) {
  const [chosen, setChosen] = useState(false);
  const outcome: ChooseOutcome =
    choose === "published" || choose === "not_found" ? { ok: false, reason: choose } : { ok: true };
  return (
    <RevealLayout heading="Your new card">
      <RevealStage
        title={card.title}
        proportion={card.card.artwork.proportion}
        loadCard={async () => {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return card;
        }}
        actions={(revealed) => (
          <NewCardActions
            eventId={EVENT_ID}
            designId={revealed.designId}
            choose={async () => outcome}
            onChosen={() => setChosen(true)}
          />
        )}
      />
      {chosen && (
        <p data-fixture-chosen="" className="text-body-sm">
          Chosen
        </p>
      )}
    </RevealLayout>
  );
}

export function GenerationFixture({
  state,
  code,
  card,
  delayMs,
  choose = "ok",
}: {
  state: FixtureState;
  code: string;
  card: RevealedCard | null;
  delayMs: number;
  choose?: string;
}) {
  if (state === "direction-box" && card) return <DirectionBoxFixture card={card} />;
  if (state === "direction-reveal" && card) {
    return <NewCardFixture card={card} delayMs={delayMs} choose={choose} />;
  }
  if (state === "direction-wait" || state === "direction-failed") {
    return <DirectionWait eventId={EVENT_ID} state={panelState(state, code)} onRetry={() => {}} />;
  }
  if (state === "reveal" && card) {
    return (
      <RevealLayout>
        <RevealStage
          title={card.title}
          proportion={card.card.artwork.proportion}
          loadCard={async () => {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            return card;
          }}
          actions={(revealed) => (
            <FirstCardActions eventId={EVENT_ID} designId={revealed.designId} />
          )}
        />
      </RevealLayout>
    );
  }
  return (
    <WaitLayout
      panel={<GenerationPanel state={panelState(state, code)} onRetry={() => {}} />}
      form={<DetailsForm event={fixtureDraft()} />}
    />
  );
}
