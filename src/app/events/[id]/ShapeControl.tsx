"use client";

import { useRef, useState } from "react";

import { AppButton } from "@/components/app/AppButton";
import { cx } from "@/components/app/cx";
import { InlineStatus } from "@/components/app/InlineStatus";
import type { CardShape } from "@/lib/card/shapes";
import type { CardShapeOptions } from "@/lib/generation/shape.server";
import {
  SHAPE_LABEL,
  shapeNotice,
  shapeSwatchLabel,
  shapeWaitLine,
} from "@/lib/generation/shape-wait";

import type { ShapeSwitchState } from "./use-shape-switch";

/**
 * The card's shape in the Design panel (`docs/screen-spec.md` `design-panel`; `spec.md §7.14`,
 * §8.1, §8.2, §31 — Creation Mode; `docs/design-system.md §4.10`): small outline swatches for the
 * shapes the design's layout supports, the current one marked. A shape an existing artwork fits
 * applies at once. Any other first says, in one line, that new artwork of the same subject will be
 * made and the current card stays until it is ready, then `Make it` or `Cancel`; the wait is shown
 * here, with the card on screen unchanged. A shape that is not offered (`available: false`, which
 * is every shape needing new artwork once the event is published) is not drawn at all.
 *
 * App chrome in app tokens; the outlines are plain strokes, not the card.
 */

/** One outline, drawn in a 40 × 56 box so the six sit on one baseline. */
function Outline({ shape }: { shape: CardShape }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;
  return (
    <svg aria-hidden="true" width="30" height="42" viewBox="0 0 40 56" focusable="false">
      {shape === "rectangle" && <rect x="4" y="4" width="32" height="48" {...common} />}
      {shape === "rounded-rectangle" && (
        <rect x="4" y="4" width="32" height="48" rx="9" {...common} />
      )}
      {shape === "arch" && <path d="M5 52V20a15 15 0 0 1 30 0v32Z" {...common} />}
      {shape === "oval" && <ellipse cx="20" cy="28" rx="16" ry="24" {...common} />}
      {shape === "square" && <rect x="5" y="13" width="30" height="30" {...common} />}
      {shape === "circle" && <circle cx="20" cy="28" r="15.5" {...common} />}
    </svg>
  );
}

export function ShapeControl({
  options,
  switching,
  onChoose,
  onRetry,
  onDismiss,
  announcement = "",
}: {
  options: CardShapeOptions;
  switching: ShapeSwitchState;
  /** Said once a shape is on the card (`shapeAppliedLine`), for screen readers. */
  announcement?: string;
  /** Applies the shape now, or begins its new artwork. */
  onChoose: (shape: CardShape) => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  // A shape that needs new artwork, waiting for the host's `Make it`.
  const [asking, setAsking] = useState<CardShape | null>(null);
  const wait = useRef<HTMLDivElement>(null);
  const offered = options.options.filter((o) => o.available);
  const busy = switching.kind === "starting" || switching.kind === "running";
  const confirming = !busy && switching.kind !== "failed" ? asking : null;

  return (
    <div className="flex flex-col gap-4" data-shape-control="">
      <div role="group" aria-label="Card shape" className="grid grid-cols-3 gap-3">
        {offered.map((option) => {
          const current = option.shape === options.current;
          const target = confirming === option.shape || (busy && switching.shape === option.shape);
          return (
            <button
              key={option.shape}
              type="button"
              data-shape={option.shape}
              aria-label={shapeSwatchLabel(option.shape, option.instant)}
              aria-pressed={current}
              // Not \`disabled\`: a swatch keeps focus while a switch runs (it does nothing then).
              aria-disabled={busy || undefined}
              onClick={() => {
                if (current || busy) return;
                // Another shape after a failure: the failure gives way to the new choice.
                if (switching.kind === "failed") onDismiss();
                if (option.instant) {
                  setAsking(null);
                  onChoose(option.shape);
                } else {
                  setAsking(option.shape);
                }
              }}
              className={cx(
                "app-press flex min-h-11 flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3",
                "aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
                current
                  ? "border-app-text bg-app-lit text-app-text ring-1 ring-app-text"
                  : target
                    ? "border-app-border-strong bg-app-surface-subtle text-app-text"
                    : "border-app-border bg-app-surface text-app-text hover:bg-app-surface-subtle",
              )}
            >
              <Outline shape={option.shape} />
              <span aria-hidden="true" className="text-label-md">
                {SHAPE_LABEL[option.shape]}
              </span>
              <span aria-hidden="true" className="text-body-sm text-app-text-secondary">
                {current ? "Current" : option.instant ? "" : "New artwork"}
              </span>
            </button>
          );
        })}
      </div>

      {confirming && (
        <div
          data-shape-notice=""
          className="flex flex-col gap-3 rounded-lg border border-app-border bg-app-surface-subtle p-4"
        >
          <p className="text-body-md text-app-text">{shapeNotice(confirming)}</p>
          <div className="flex flex-wrap gap-3">
            <AppButton
              variant="primary"
              size="md"
              onClick={() => {
                setAsking(null);
                onChoose(confirming);
                // The button goes away with the notice: focus moves to the wait that replaces it.
                setTimeout(() => wait.current?.focus(), 0);
              }}
            >
              Make it
            </AppButton>
            <AppButton variant="ghost" size="md" onClick={() => setAsking(null)}>
              Cancel
            </AppButton>
          </div>
        </div>
      )}

      {busy && (
        <div
          ref={wait}
          tabIndex={-1}
          data-shape-wait=""
          className="flex flex-col gap-1 outline-none"
        >
          <InlineStatus live>{shapeWaitLine(switching.shape)}</InlineStatus>
          <p className="text-body-sm text-app-text-secondary">
            {switching.kind === "running" && switching.offline
              ? "We can't reach the server just now. We'll keep trying. Your card stays as it is."
              : "Your card stays as it is until the new artwork is ready. You can close this."}
          </p>
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {switching.kind === "failed" && (
        <div data-shape-failure="" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-label-md text-app-text">{switching.failure.title}</p>
            <InlineStatus variant="danger">{switching.failure.body}</InlineStatus>
          </div>
          <div className="flex flex-wrap gap-3">
            {switching.failure.retry && (
              <AppButton variant="secondary" size="md" onClick={onRetry}>
                Try again
              </AppButton>
            )}
            <AppButton variant="ghost" size="md" onClick={onDismiss}>
              Dismiss
            </AppButton>
          </div>
        </div>
      )}
    </div>
  );
}
