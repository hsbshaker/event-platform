"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { chooseDesign, startAnotherDirection } from "@/app/actions/direction";
import { loadRevealedCardAction } from "@/app/actions/reveal";
import { AppButtonLink } from "@/components/app/AppButtonLink";
import {
  GenerationPanel,
  RevealLayout,
  type PanelState,
} from "@/app/events/[id]/create/GenerationPanel";
import { RevealStage } from "@/app/events/[id]/create/RevealStage";
import { generationFailure, type GenerationFailure } from "@/lib/generation/failure-copy";
import { forgetIdempotencyKey, idempotencyKey } from "@/lib/generation/idempotency-key";
import type { RevealedCard } from "@/lib/generation/reveal.server";
import { useGenerationPoll } from "@/lib/generation/use-generation-poll";
import { afterStart, type WaitGeneration } from "@/lib/generation/wait-view";

import { DirectionBox } from "./DirectionBox";
import { NewCardActions } from "./NewCardActions";

/**
 * `Try another direction` (`docs/screen-spec.md` `try-another-direction`; `spec.md §7.7`, §7.15,
 * §8.2): the box, the same honest wait as the first card, and the new card's reveal from its
 * envelope, with the current card active throughout until the host chooses the new one.
 *
 * - Starts one generation per submit, with a fresh key per action kept in `sessionStorage` so a
 *   reload during the call finds the same generation; never retries by itself — a failure is
 *   shown, and `Try again` starts a new one (new key) with the same words and the same card
 *   (`spec.md §32 #21`, #46).
 * - Polls like the first card (`useGenerationPoll`), for this generation only.
 * - `key={from}` on the page remounts this for each card the host tries to change.
 */

const COULD_NOT_OPEN: GenerationFailure = {
  code: "internal",
  title: "We couldn't open your new card",
  body: "Your new card is ready, but we couldn't load it just now. Try again in a moment.",
  retry: true,
};

type Phase =
  | { kind: "box"; starting: boolean }
  | { kind: "running"; generationId: string; generation: WaitGeneration | null; offline: boolean }
  | { kind: "failed"; failure: GenerationFailure; retrying: boolean; open: string | null }
  | { kind: "opening" }
  | {
      kind: "reveal";
      designId: string;
      title: string;
      proportion: RevealedCard["card"]["artwork"]["proportion"];
      preloaded: RevealedCard;
    };

const keyScope = (eventId: string, from: string) => `direction-key:${eventId}:${from}`;

function BackToCard({ eventId }: { eventId: string }) {
  return (
    <AppButtonLink href={`/events/${eventId}`} variant="ghost" size="md">
      Back to your card
    </AppButtonLink>
  );
}

/** The new card's wait: the first card's honest panel, and a way back that leaves it running. */
export function DirectionWait({
  eventId,
  state,
  onRetry,
}: {
  eventId: string;
  state: PanelState;
  onRetry: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-(--width-standard) flex-1 flex-col gap-8 px-4 py-10 lg:py-14">
      <header className="flex flex-col gap-2">
        <h1 className="text-heading-xl text-app-text">Making your new card…</h1>
        <p className="text-body-md text-app-text-secondary">
          Your current card stays as it is until you choose the new one.
        </p>
      </header>
      <GenerationPanel state={state} onRetry={onRetry} title="Creating your new card" />
      <div className="flex justify-center">
        <BackToCard eventId={eventId} />
      </div>
    </main>
  );
}

export function DirectionSurface({
  eventId,
  from,
  current,
}: {
  eventId: string;
  /** The design the host is changing: the card on screen when they opened the box. */
  from: string;
  current: RevealedCard["card"];
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "box", starting: false });
  const feedback = useRef<string | null>(null);
  const [typed, setTyped] = useState("");

  const openReveal = useCallback(
    async (designId: string) => {
      setPhase({ kind: "opening" });
      let card: RevealedCard | null = null;
      try {
        card = await loadRevealedCardAction(eventId, designId);
      } catch {
        card = null;
      }
      if (!card) {
        setPhase({ kind: "failed", failure: COULD_NOT_OPEN, retrying: false, open: designId });
        return;
      }
      setPhase({
        kind: "reveal",
        designId,
        title: card.title,
        proportion: card.card.artwork.proportion,
        preloaded: card,
      });
    },
    [eventId],
  );

  const begin = useCallback(
    async (words: string | null, fresh: boolean) => {
      feedback.current = words;
      const scope = keyScope(eventId, from);
      const key = idempotencyKey(scope, fresh);
      try {
        const result = await startAnotherDirection({
          eventId,
          fromDesignId: from,
          feedback: words,
          idempotencyKey: key,
        });
        forgetIdempotencyKey(scope);
        const next = afterStart(result.outcome);
        if (next.kind === "failed") {
          setPhase({ kind: "failed", failure: next.failure, retrying: false, open: null });
        } else if (next.kind === "poll" && result.generationId) {
          setPhase({
            kind: "running",
            generationId: result.generationId,
            generation: null,
            offline: false,
          });
        } else {
          setPhase({
            kind: "failed",
            failure: generationFailure(null),
            retrying: false,
            open: null,
          });
        }
      } catch {
        // The start may or may not have gone through; Try again uses a new key and finds it.
        setPhase({ kind: "failed", failure: generationFailure(null), retrying: false, open: null });
      }
    },
    [eventId, from],
  );

  useGenerationPoll({
    eventId,
    enabled: phase.kind === "running",
    expectedId: phase.kind === "running" ? phase.generationId : null,
    handlers: {
      onGeneration: (generation) =>
        setPhase((now) =>
          now.kind === "running"
            ? {
                kind: "running",
                generationId: now.generationId,
                generation: generation ?? now.generation,
                offline: false,
              }
            : now,
        ),
      onOffline: (offline) => {
        if (!offline) return;
        setPhase((now) => (now.kind === "running" ? { ...now, offline: true } : now));
      },
      onSucceeded: (generation) => {
        if (generation.cardDesignId) void openReveal(generation.cardDesignId);
        else setPhase({ kind: "failed", failure: COULD_NOT_OPEN, retrying: false, open: null });
      },
      onFailed: (failure) => setPhase({ kind: "failed", failure, retrying: false, open: null }),
    },
  });

  function retry() {
    if (phase.kind !== "failed") return;
    const { open } = phase;
    setPhase({ ...phase, retrying: true });
    if (open) void openReveal(open);
    else void begin(feedback.current, true);
  }

  if (phase.kind === "box") {
    return (
      <DirectionBox
        card={current}
        initialFeedback={typed}
        pending={phase.starting}
        backHref={`/events/${eventId}`}
        onSubmit={(words) => {
          setTyped(words ?? "");
          setPhase({ kind: "box", starting: true });
          void begin(words, false);
        }}
      />
    );
  }

  if (phase.kind === "reveal") {
    return (
      <RevealLayout heading="Your new card">
        <RevealStage
          title={phase.title}
          proportion={phase.proportion}
          loadCard={() => loadRevealedCardAction(eventId, phase.designId)}
          preloaded={phase.preloaded}
          actions={(card) => (
            <NewCardActions
              eventId={eventId}
              designId={card.designId}
              choose={() => chooseDesign({ eventId, designId: card.designId })}
              onChosen={() => router.push(`/events/${eventId}`)}
            />
          )}
        />
      </RevealLayout>
    );
  }

  const state: PanelState =
    phase.kind === "failed"
      ? { kind: "failed", failure: phase.failure, retrying: phase.retrying }
      : phase.kind === "running"
        ? phase
        : { kind: "ready" };
  return <DirectionWait eventId={eventId} state={state} onRetry={retry} />;
}
