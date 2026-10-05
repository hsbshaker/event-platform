"use client";

import type { EventDraftView } from "@/app/actions/event-details";
import { DetailsForm } from "@/app/events/[id]/create/DetailsForm";
import {
  GenerationPanel,
  RevealLayout,
  WaitLayout,
  type PanelState,
} from "@/app/events/[id]/create/GenerationPanel";
import { RevealStage } from "@/app/events/[id]/create/RevealStage";
import { provisionalContent } from "@/lib/events/provisional";
import { missingRequiredDetails } from "@/lib/events/required-details";
import { COPYRIGHT_STEP_BACK_NOTICE, generationFailure } from "@/lib/generation/failure-copy";
import type { RevealedCard } from "@/lib/generation/reveal.server";
import type { WaitGeneration } from "@/lib/generation/wait-view";

export type FixtureState = "starting" | "identity" | "design" | "notice" | "failed" | "reveal";

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
    case "failed":
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

export function GenerationFixture({
  state,
  code,
  card,
  delayMs,
}: {
  state: FixtureState;
  code: string;
  card: RevealedCard | null;
  delayMs: number;
}) {
  if (state === "reveal" && card) {
    return (
      <RevealLayout>
        <RevealStage
          eventId="00000000-0000-4000-8000-000000000000"
          title={card.title}
          proportion={card.card.artwork.proportion}
          loadCard={async () => {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            return card;
          }}
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
