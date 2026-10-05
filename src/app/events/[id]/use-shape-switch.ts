"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { SwitchCardShapeInput, SwitchCardShapeResult } from "@/app/actions/shape";
import type { CardShape } from "@/lib/card/shapes";
import { generationFailure, type GenerationFailure } from "@/lib/generation/failure-copy";
import { forgetIdempotencyKey, idempotencyKey } from "@/lib/generation/idempotency-key";
import { afterShapeSwitch } from "@/lib/generation/shape-wait";
import { useGenerationPoll } from "@/lib/generation/use-generation-poll";

/**
 * The card's shape switch as Creation Mode drives it (`docs/screen-spec.md` `design-panel`; `spec.md
 * §7.14`, §10, §32 #21, #46): one switch at a time, from the click to the card showing the new
 * shape. It lives in the canvas, above the Design panel, so closing the panel mid-wait leaves the
 * wait running and the quiet status by the card still telling the truth.
 *
 * - One key per user action, kept in `sessionStorage` so a reload during the call finds the same
 *   generation; `Try again` takes a fresh key. Nothing retries by itself.
 * - An answer that applies the shape, or a generation that succeeds, calls `onApplied` (the page
 *   refreshes its server data); the card on screen is never touched before that.
 * - A refusal or a failed generation stays as `failed` with the host's copy until the host tries
 *   again, dismisses it, or picks another shape.
 * - While one switch is starting or painting, another is not started (`spec.md §10`); a page loaded
 *   mid-wait starts in that wait, and one loaded after a recent failure shows it (`initial`).
 */

export type ShapeSwitchState =
  | { kind: "idle" }
  | { kind: "starting"; shape: CardShape }
  | { kind: "running"; shape: CardShape; generationId: string; offline: boolean }
  | { kind: "failed"; shape: CardShape; failure: GenerationFailure };

export function useShapeSwitch({
  eventId,
  designId,
  switchShape,
  onApplied,
  initial = null,
}: {
  eventId: string;
  /** The active design: part of the key's scope, so another design never reuses a key. */
  designId: string;
  switchShape: (input: SwitchCardShapeInput) => Promise<SwitchCardShapeResult>;
  /** The shape is on the card now (instantly, or once its artwork is ready). */
  onApplied: (shape: CardShape) => void;
  /** The design's switch painting, or recently failed, when the page loaded. */
  initial?:
    | { kind: "running"; shape: CardShape; generationId: string }
    | { kind: "failed"; shape: CardShape; failure: GenerationFailure }
    | null;
}) {
  const [state, setState] = useState<ShapeSwitchState>(() =>
    initial?.kind === "running"
      ? {
          kind: "running",
          shape: initial.shape,
          generationId: initial.generationId,
          offline: false,
        }
      : initial?.kind === "failed"
        ? { kind: "failed", shape: initial.shape, failure: initial.failure }
        : { kind: "idle" },
  );
  const busy = useRef(false);
  const current = useRef(state);
  useEffect(() => {
    current.current = state;
  });

  const start = useCallback(
    async (shape: CardShape, fresh = false) => {
      // One switch at a time: never over one starting or painting.
      if (busy.current) return;
      const now = current.current.kind;
      if (now === "starting" || now === "running") return;
      busy.current = true;
      setState({ kind: "starting", shape });
      const scope = `shape-key:${eventId}:${designId}:${shape}`;
      try {
        const result = await switchShape({
          eventId,
          shape,
          idempotencyKey: idempotencyKey(scope, fresh),
        });
        forgetIdempotencyKey(scope);
        const next = afterShapeSwitch(result.outcome, result.generationId);
        if (next.kind === "applied") {
          setState({ kind: "idle" });
          onApplied(shape);
        } else if (next.kind === "poll" && result.generationId) {
          setState({ kind: "running", shape, generationId: result.generationId, offline: false });
        } else if (next.kind === "failed") {
          setState({ kind: "failed", shape, failure: next.failure });
        }
      } catch {
        // The start may or may not have gone through; Try again uses a new key and finds it.
        setState({ kind: "failed", shape, failure: generationFailure(null) });
      } finally {
        busy.current = false;
      }
    },
    [eventId, designId, switchShape, onApplied],
  );

  useGenerationPoll({
    eventId,
    enabled: state.kind === "running",
    expectedId: state.kind === "running" ? state.generationId : null,
    handlers: {
      onOffline: (offline) =>
        setState((now) => (now.kind === "running" ? { ...now, offline } : now)),
      onSucceeded: () => {
        if (state.kind !== "running") return;
        setState({ kind: "idle" });
        onApplied(state.shape);
      },
      onFailed: (failure) =>
        setState((now) =>
          now.kind === "running" ? { kind: "failed", shape: now.shape, failure } : now,
        ),
    },
  });

  const retry = useCallback(() => {
    if (state.kind === "failed") void start(state.shape, true);
  }, [state, start]);

  const dismiss = useCallback(() => {
    setState((now) => (now.kind === "failed" ? { kind: "idle" } : now));
  }, []);

  return { state, start, retry, dismiss };
}
