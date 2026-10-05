"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { EventDraftView } from "@/app/actions/event-details";
import { startCardGeneration } from "@/app/actions/generation";
import { loadRevealedCardAction } from "@/app/actions/reveal";
import type { CardProportion } from "@/lib/card/shapes";
import { generationFailure, type GenerationFailure } from "@/lib/generation/failure-copy";
import type { RevealedCard } from "@/lib/generation/reveal.server";
import {
  afterStart,
  nextPollDelay,
  readGenerationBody,
  type AfterStart,
  type InitialWait,
  type WaitGeneration,
} from "@/lib/generation/wait-view";

import { DetailsForm } from "./DetailsForm";
import { createSaveTracker } from "@/lib/events/save-tracker";
import { GenerationPanel, RevealLayout, WaitLayout } from "./GenerationPanel";
import { RevealStage } from "./RevealStage";

/**
 * The wait surface (`docs/screen-spec.md` `generation`; `spec.md §7.3`, §7.10; design-system §4.3)
 * and the reveal it ends in.
 *
 * - Starts the event's first card once when none has begun (a fresh key per user action, kept in
 *   `sessionStorage` per event so a reload during the call finds the same generation), never
 *   retries by itself: a failed generation is shown, and `Try again` starts a new one with a new
 *   key (`spec.md §32 #21`, #46).
 * - Polls the generation about every 2 s while it runs, pausing while the tab is hidden, backing
 *   off when the server cannot be reached; stops on success or failure.
 * - Shows only what the pipeline produced (`GenerationPanel`), beside the details form, which is
 *   offered and never blocks (`spec.md §31`; §32 #45).
 * - On success moves to the reveal in place, with no reload.
 */

export interface RevealHead {
  title: string;
  proportion: CardProportion;
}

type Phase =
  | { kind: "starting" }
  | { kind: "running"; generation: WaitGeneration | null; offline: boolean }
  | { kind: "failed"; failure: GenerationFailure; retrying: boolean; mode: "generate" | "open" }
  | { kind: "opening" }
  | { kind: "reveal"; head: RevealHead; preloaded: RevealedCard | null };

const COULD_NOT_OPEN: GenerationFailure = {
  code: "internal",
  title: "We couldn't open your card",
  body: "Your card is ready, but we couldn't load it just now. Try again in a moment.",
  retry: true,
};

const KEY_PREFIX = "generation-key:";

/** The idempotency key of this user action: a stored one on a reload, else a fresh UUID. */
function idempotencyKey(eventId: string, fresh: boolean): string {
  const storageKey = `${KEY_PREFIX}${eventId}`;
  try {
    if (!fresh) {
      const stored = window.sessionStorage.getItem(storageKey);
      if (stored) return stored;
    }
    const key = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, key);
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

function forgetKey(eventId: string): void {
  try {
    window.sessionStorage.removeItem(`${KEY_PREFIX}${eventId}`);
  } catch {
    // Best effort only.
  }
}

function initialPhase(initial: InitialWait, head: RevealHead | null): Phase {
  switch (initial.kind) {
    case "start":
      return { kind: "starting" };
    case "poll":
      return { kind: "running", generation: initial.generation, offline: false };
    case "failed":
      return { kind: "failed", failure: initial.failure, retrying: false, mode: "generate" };
    case "reveal":
      return head ? { kind: "reveal", head, preloaded: null } : { kind: "opening" };
  }
}

export function GenerationSurface({
  eventId,
  draft,
  initial,
  head,
}: {
  eventId: string;
  draft: EventDraftView;
  initial: InitialWait;
  /** The card's title and proportion when the event already has a card. */
  head: RevealHead | null;
}) {
  const [phase, setPhase] = useState<Phase>(() => initialPhase(initial, head));
  const began = useRef(false);
  // The details form's saves: the card is read only after the host's last edit has landed.
  const [saves] = useState(() => createSaveTracker());

  const openReveal = useCallback(async () => {
    setPhase({ kind: "opening" });
    let card: RevealedCard | null = null;
    try {
      await saves.settle();
      card = await loadRevealedCardAction(eventId);
    } catch {
      card = null;
    }
    if (!card) {
      setPhase({ kind: "failed", failure: COULD_NOT_OPEN, retrying: false, mode: "open" });
      return;
    }
    setPhase({
      kind: "reveal",
      head: { title: card.title, proportion: card.card.artwork.proportion },
      preloaded: card,
    });
  }, [eventId, saves]);

  const apply = useCallback(
    (next: AfterStart) => {
      if (next.kind === "poll") setPhase({ kind: "running", generation: null, offline: false });
      else if (next.kind === "reveal") void openReveal();
      else setPhase({ kind: "failed", failure: next.failure, retrying: false, mode: "generate" });
    },
    [openReveal],
  );

  const begin = useCallback(
    async (fresh: boolean) => {
      const key = idempotencyKey(eventId, fresh);
      try {
        const result = await startCardGeneration({ eventId, idempotencyKey: key });
        forgetKey(eventId);
        apply(afterStart(result.outcome));
      } catch {
        // The start may or may not have gone through; Try again uses a new key and finds it.
        setPhase({
          kind: "failed",
          failure: generationFailure(null),
          retrying: false,
          mode: "generate",
        });
      }
    },
    [eventId, apply],
  );

  // Once on arrival: start the first generation, or load a reveal the server could not name.
  useEffect(() => {
    if (began.current) return;
    began.current = true;
    // These start an external request; the state they set is the request's result, set after it.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (initial.kind === "start") void begin(false);
    else if (initial.kind === "reveal" && !head) void openReveal();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initial, head, begin, openReveal]);

  // Poll while running.
  const running = phase.kind === "running";
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let busy = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(() => void tick(), nextPollDelay(failures));
    };

    async function tick() {
      if (cancelled || busy) return;
      // Paused while hidden; the visibility handler resumes with an immediate poll.
      if (document.hidden) return;
      busy = true;
      try {
        const res = await fetch(`/api/events/${eventId}/generation`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = readGenerationBody(await res.json());
        if (!body) throw new Error("unreadable response");
        if (cancelled) return;
        failures = 0;
        const generation = body.generation;
        if (generation?.status === "succeeded") {
          void openReveal();
          return;
        }
        if (generation?.status === "failed") {
          setPhase({
            kind: "failed",
            failure: generation.failure ?? generationFailure(null),
            retrying: false,
            mode: "generate",
          });
          return;
        }
        setPhase((current) =>
          current.kind === "running"
            ? { kind: "running", generation: generation ?? current.generation, offline: false }
            : current,
        );
      } catch {
        if (cancelled) return;
        failures += 1;
        setPhase((current) =>
          current.kind === "running" ? { ...current, offline: true } : current,
        );
      } finally {
        busy = false;
      }
      schedule();
    }

    const onVisible = () => {
      if (document.hidden || busy) return;
      clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [running, eventId, openReveal]);

  function retry() {
    if (phase.kind !== "failed") return;
    const { failure, mode } = phase;
    setPhase({ kind: "failed", failure, retrying: true, mode });
    if (mode === "open") void openReveal();
    else void begin(true);
  }

  if (phase.kind === "reveal") {
    return (
      <RevealLayout>
        <RevealStage
          eventId={eventId}
          title={phase.head.title}
          proportion={phase.head.proportion}
          loadCard={() => loadRevealedCardAction(eventId)}
          preloaded={phase.preloaded}
          beforeLoad={() => saves.settle()}
        />
      </RevealLayout>
    );
  }

  return (
    <WaitLayout
      panel={
        <GenerationPanel
          state={
            phase.kind === "opening"
              ? { kind: "ready" }
              : phase.kind === "failed"
                ? { kind: "failed", failure: phase.failure, retrying: phase.retrying }
                : phase.kind === "running"
                  ? phase
                  : { kind: "starting" }
          }
          onRetry={retry}
        />
      }
      form={<DetailsForm event={draft} saves={saves} />}
    />
  );
}
