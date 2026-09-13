"use client";

import { useEffect, useState } from "react";

/**
 * Honest, non-fake generation progress (spec.md §7.10, docs/design-system.md §12.1/§12.3,
 * §26). Phase 2 has no real generation signal to poll yet, so this shows only what is true —
 * that generation was requested and roughly how long ago — and never a percentage, a step
 * count, or invented activity. Phases 4-5 replace this with real Event Identity/concept
 * progress.
 */

const PHASE_ONE = "Reading your idea";
const PHASE_TWO = "Creating your event's direction";
const PHASE_TWO_AFTER_SECONDS = 8;

export function GenerationProgress({
  generationRequestedAt,
}: {
  generationRequestedAt: string | null;
}) {
  const [label, setLabel] = useState(PHASE_ONE);

  useEffect(() => {
    if (!generationRequestedAt) return;
    const startedAt = new Date(generationRequestedAt).getTime();
    function tick() {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      setLabel(elapsedSeconds >= PHASE_TWO_AFTER_SECONDS ? PHASE_TWO : PHASE_ONE);
    }
    tick();
    const interval = setInterval(tick, 2000);
    return () => clearInterval(interval);
  }, [generationRequestedAt]);

  return (
    <section
      aria-labelledby="generation-progress-heading"
      className="flex flex-col gap-4 rounded-2xl border border-app-border bg-app-surface p-5 shadow-soft"
    >
      <h2 id="generation-progress-heading" className="text-heading-md text-app-text">
        We&apos;re already working on it
      </h2>
      <p aria-live="polite" className="text-body-md text-app-text-secondary">
        {label}
      </p>
      <div className="flex flex-col gap-2" aria-hidden="true">
        <div className="h-3 w-4/5 rounded-pill bg-app-surface-muted motion-safe:animate-pulse" />
        <div className="h-3 w-3/5 rounded-pill bg-app-surface-muted motion-safe:animate-pulse" />
        <div className="h-3 w-2/3 rounded-pill bg-app-surface-muted motion-safe:animate-pulse" />
      </div>
      <p className="text-body-sm text-app-text-tertiary">
        Your first design directions will appear here as soon as they&apos;re ready.
      </p>
    </section>
  );
}
