"use client";

import { useEffect, useRef } from "react";

import type { GenerationFailure } from "./failure-copy";
import { LOST_ACCESS, nextPollDelay, pollStep, type WaitGeneration } from "./wait-view";

/**
 * Polls the event's latest generation while a card is made (`docs/screen-spec.md` `generation`,
 * `try-another-direction`; `spec.md §32 #46`): about every 2 s, paused while the tab is hidden
 * (resuming at once when it is shown again), backing off when the server cannot be reached, and
 * stopped on success, failure, or an answer that this visitor cannot see the event. Shared by the
 * first card's wait (`GenerationSurface`) and the new-direction wait (`DirectionSurface`).
 *
 * `expectedId` names the generation being waited for, so an earlier one still being the event's
 * latest is never read as its result. The handlers may change between renders; polling does not
 * restart for it.
 */
export interface GenerationPollHandlers {
  /** Every readable answer, before the terminal handlers (`null`: no generation yet). */
  onGeneration?: (generation: WaitGeneration | null) => void;
  /** Whether the server could not be reached (true after a failed poll, false after a good one). */
  onOffline?: (offline: boolean) => void;
  onSucceeded: (generation: WaitGeneration) => void;
  onFailed: (failure: GenerationFailure) => void;
}

export function useGenerationPoll({
  eventId,
  enabled,
  expectedId,
  handlers,
}: {
  eventId: string;
  enabled: boolean;
  expectedId?: string | null;
  handlers: GenerationPollHandlers;
}): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
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
        const query = expectedId ? `?generation=${encodeURIComponent(expectedId)}` : "";
        const res = await fetch(`/api/events/${eventId}/generation${query}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          body = undefined;
        }
        if (cancelled) return;
        const step = pollStep(res.status, body, expectedId);
        if (step.kind === "lost") {
          latest.current.onFailed(LOST_ACCESS);
          return;
        }
        if (step.kind === "retry") throw new Error(`status ${res.status}`);
        failures = 0;
        latest.current.onOffline?.(false);
        latest.current.onGeneration?.(step.generation);
        if (step.kind === "succeeded") {
          latest.current.onSucceeded(step.generation);
          return;
        }
        if (step.kind === "failed") {
          latest.current.onFailed(step.failure);
          return;
        }
      } catch {
        if (cancelled) return;
        failures += 1;
        latest.current.onOffline?.(true);
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
  }, [enabled, eventId, expectedId]);
}
