"use client";

import { useEffect, useState } from "react";

/**
 * Honest, non-fake generation status (spec.md §7.10, docs/design-system.md §12.1/§12.3, §26).
 * Phase 2 has no real generation signal to poll — `getAiProvider()` is intentionally
 * unimplemented until Phase 4 — so this never claims anything is currently running, never
 * shows a percentage or step count, and never invents activity from a client timer. It states
 * only what is true (the event was created and its design has not been generated yet) and,
 * once `generationRequestedAt` is older than `STALE_AFTER_MS`, says plainly that the design
 * has not started rather than continuing to imply progress — satisfying §7.10's requirement to
 * measure reality and its ban on unbounded waits (§32 guardrail #45).
 */

const STALE_AFTER_MS = 10 * 60 * 1000;

export function GenerationProgress({
  generationRequestedAt,
}: {
  generationRequestedAt: string | null;
}) {
  const [isStale, setIsStale] = useState(() => isOlderThan(generationRequestedAt, STALE_AFTER_MS));

  useEffect(() => {
    if (!generationRequestedAt) return;
    const requestedAtMs = new Date(generationRequestedAt).getTime();
    function check() {
      setIsStale(Date.now() - requestedAtMs >= STALE_AFTER_MS);
    }
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [generationRequestedAt]);

  return (
    <section
      aria-labelledby="generation-progress-heading"
      className="flex flex-col gap-2 rounded-2xl border border-app-border bg-app-surface p-5 shadow-soft"
    >
      <h2 id="generation-progress-heading" className="text-heading-md text-app-text">
        Your event has been created
      </h2>
      <p className="text-body-md text-app-text-secondary">
        Its design hasn&apos;t been generated yet.
      </p>
      <p className="text-body-sm text-app-text-tertiary">
        {isStale
          ? "Design generation hasn't started for this event."
          : "In the meantime, filling in the details below helps us get it right."}
      </p>
    </section>
  );
}

function isOlderThan(iso: string | null, ms: number): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time >= ms;
}
