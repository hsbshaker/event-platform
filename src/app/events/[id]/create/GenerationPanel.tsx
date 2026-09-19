"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppButton } from "@/components/app/AppButton";
import { InlineStatus } from "@/components/app/InlineStatus";
import { readGenerationForEvent, startConceptGenerationForEvent } from "@/app/actions/generation";
import {
  generationInFlight,
  previewableConcepts,
  type ConceptStage,
  type ConceptView,
  type GenerationStage,
  type GenerationView,
} from "@/lib/generation/generation-view";

/**
 * T-4F — the surface where a host watches their event's three concepts come to life.
 *
 * The sibling of `EventIdentityPanel`, built on the same contract `generation-view.ts` states in
 * its own header: the projection already happened on the server, so nothing this component reads
 * can be turned into a percentage, a step counter or model reasoning — the shape it was handed has
 * nowhere to put one. `spec.md §31 — Prompt, auth, and generation`: *"The generation surface shows
 * only artifacts the pipeline produced — no model reasoning, no fabricated progress or completion
 * percentages (§7.10)."*
 *
 * **Readiness is per concept, not per batch.** `spec.md §31 — Concept experience`: *"Each concept
 * becomes available as soon as its resolved spec exists; no concept waits on its siblings
 * (§7.10)."* A slot is rendered for every planned sibling at a stable position
 * (`docs/design-system.md §12.2`), and each slot independently decides, from its own
 * `ConceptView.previewable`, whether it is still forming or already a finished page.
 *
 * **What this component does not do.** No concept selection, no full-site reveal, no
 * `Try another direction`, no Creation Mode, no contextual edit controls — all out of scope for
 * this phase (`spec.md §32 #7`, `#8`). The only interaction a concept card offers is a link to its
 * own preview route.
 */

/** Polling cadence while something is genuinely in motion. Seconds, never sub-second. */
const POLL_MS = 3_000;

/**
 * How long this browser waits, after a `start` call whose transport died, before one ordinary
 * resume.
 *
 * There is no `explicitRetry` flag on `startConceptGenerationForEvent` the way there is on the
 * identity panel's start action — concept-batch admission is idempotent and guarded by a database
 * uniqueness index (`docs/phase-4b-plan.md §H.2`), not by a claim a stale caller could reclaim
 * early. So a second ordinary call here can never buy a second batch: it either observes the batch
 * the lost call actually created, or starts the one it never managed to.
 */
const RESUME_AFTER_LOST_START_MS = 33_000;

/** Batch-level progress language. Deliberately partial — `ready`/`partial` render no label at all. */
const BATCH_LABEL: Partial<Record<GenerationStage, string>> = {
  exploring: "Exploring three directions",
  designing: "Designing your concepts",
};

/** Per-concept progress language. `ready` is absent on purpose: a ready concept shows its card. */
const CONCEPT_LABEL: Partial<Record<ConceptStage, string>> = {
  planned: "Planning",
  designing: "Designing",
  composing: "Composing",
  failed: "This direction didn't work out",
};

export interface GenerationPanelProps {
  eventId: string;
  initial: GenerationView;
}

export function GenerationPanel({ eventId, initial }: GenerationPanelProps) {
  const [view, setView] = useState<GenerationView>(initial);
  const [busy, setBusy] = useState(false);
  /** True once a `start` call's transport has died and the real outcome is still unknown. */
  const [optimisticInFlight, setOptimisticInFlight] = useState(false);
  const lostAt = useRef<number | null>(null);
  const resumed = useRef(false);

  const apply = useCallback((next: GenerationView) => {
    setView(next);
  }, []);

  /* --------------------------------------------------------------- polling */

  useEffect(() => {
    if (!generationInFlight(view) && !optimisticInFlight) return;
    let cancelled = false;
    const id = setInterval(() => {
      void readGenerationForEvent(eventId)
        .then((next) => {
          if (cancelled) return;
          // `unavailable` means the read itself failed, not that the batch failed
          // (`generation-view.ts`). Applying it would erase real concepts already on screen over a
          // single dropped poll, so this one is absorbed rather than shown; the next poll tries
          // again.
          if (next.stage === "unavailable") return;
          lostAt.current = null;
          setOptimisticInFlight(false);
          apply(next);
        })
        // A rejected poll is not an event either: the next one asks again, and the previous,
        // real view stays on screen in the meantime.
        .catch(() => {});
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // `view.stage` rather than `view`: the effect only needs to know whether to keep polling, and
    // re-keying it on every applied view would restart the interval on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, view.stage, optimisticInFlight, apply]);

  /* ------------------------------------------- one ordinary resume after a lost start */

  useEffect(() => {
    if (lostAt.current === null || resumed.current) return;
    // Any of these proves the real outcome has arrived, whatever it was: the owed resume is moot.
    if (
      generationInFlight(view) ||
      view.stage === "failed" ||
      previewableConcepts(view).length > 0
    ) {
      lostAt.current = null;
      return;
    }
    const wait = Math.max(0, RESUME_AFTER_LOST_START_MS - (Date.now() - lostAt.current));
    const id = setTimeout(() => {
      resumed.current = true;
      void startConceptGenerationForEvent(eventId)
        .then((next) => {
          setOptimisticInFlight(false);
          apply(next);
        })
        .catch(() => {});
    }, wait);
    return () => clearTimeout(id);
  }, [eventId, view, apply]);

  /* --------------------------------------------------------------- actions */

  const start = useCallback(async () => {
    if (busy || !view.canStart) return;
    setBusy(true);
    try {
      const next = await startConceptGenerationForEvent(eventId);
      lostAt.current = null;
      setOptimisticInFlight(false);
      apply(next);
    } catch {
      // The transport died, not necessarily the request. Start polling immediately so the true
      // state can be discovered, and owe exactly one ordinary resume if polling never converges.
      lostAt.current = Date.now();
      resumed.current = false;
      setOptimisticInFlight(true);
    } finally {
      setBusy(false);
    }
  }, [busy, eventId, view.canStart, apply]);

  const batchLabel = BATCH_LABEL[view.stage];

  return (
    <section
      aria-labelledby="generation-panel-heading"
      className="flex flex-col gap-6 rounded-2xl border border-app-border bg-app-surface p-5 shadow-soft"
    >
      <div className="flex flex-col gap-2">
        <h2 id="generation-panel-heading" className="text-heading-md text-app-text">
          Your concepts
        </h2>
        {view.vibe && view.vibe.length > 0 && (
          <ul
            data-testid="generation-vibe-list"
            aria-label="The interpreted tone of your event"
            className="flex flex-wrap gap-x-1 gap-y-1 text-body-sm text-app-text-secondary"
          >
            {view.vibe.map((word, index) => (
              <li key={word}>
                {word}
                {index < view.vibe!.length - 1 ? " ·" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* One live region, always mounted, so a poll turning `exploring` into `ready` while the
          host is filling in the details form beside this is announced once
          (`docs/design-system.md §14.4`). */}
      <p aria-live="polite" className="sr-only">
        {batchLabel ??
          (view.stage === "failed" ? "That didn't come together. You can try again." : "")}
      </p>

      {batchLabel && (
        <div data-testid="generation-stage-label">
          <InlineStatus>{batchLabel}</InlineStatus>
        </div>
      )}

      {view.stage === "not_started" && view.canStart && (
        <AppButton
          type="button"
          pending={busy}
          disabled={busy}
          onClick={() => void start()}
          className="self-start"
          data-testid="generation-start"
        >
          Explore three directions
        </AppButton>
      )}

      {view.stage === "failed" && (
        <>
          <InlineStatus variant="warning">
            That didn&apos;t come together. Nothing was lost — you can try again.
          </InlineStatus>
          {view.canStart && (
            <AppButton
              type="button"
              pending={busy}
              disabled={busy}
              onClick={() => void start()}
              className="self-start"
              data-testid="generation-retry"
            >
              Try again
            </AppButton>
          )}
        </>
      )}

      {view.stage === "unavailable" && (
        <InlineStatus variant="danger">
          We can&apos;t start this right now. Trying again won&apos;t help — please check back
          later.
        </InlineStatus>
      )}

      {view.concepts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {view.concepts.map((concept) => (
            <ConceptSlot key={concept.index} eventId={eventId} concept={concept} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ one concept, independently */

function ConceptSlot({ eventId, concept }: { eventId: string; concept: ConceptView }) {
  // Readiness is `previewable`, never `stage === "ready"` — a concept whose spec verified is a
  // finished page the moment it exists, whatever its siblings are still doing
  // (`spec.md §31 — Concept experience`).
  if (!concept.previewable) {
    const label = CONCEPT_LABEL[concept.stage];
    return (
      <div
        data-testid={`concept-card-${concept.index}`}
        className="flex min-h-32 flex-col items-start justify-center gap-2 rounded-xl border border-app-border bg-app-surface-subtle p-4"
      >
        {label && (
          <div data-testid={`concept-stage-${concept.index}`}>
            <InlineStatus>{label}</InlineStatus>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid={`concept-card-${concept.index}`}
      className="flex flex-col gap-3 rounded-xl border border-app-border bg-app-surface-subtle p-4"
    >
      {/* Every field below renders only when the artifact carrying it is actually persisted —
          never a placeholder, never a skeleton (`generation-view.ts`'s header). */}
      {concept.name && <h3 className="text-heading-md text-app-text">{concept.name}</h3>}
      {concept.description && (
        <p className="text-body-sm text-app-text-secondary">{concept.description}</p>
      )}
      {concept.palette && concept.palette.length > 0 && (
        <div
          className="flex items-center gap-1.5"
          role="img"
          aria-label={`Palette: ${concept.palette.join(", ")}`}
        >
          {concept.palette.map((hex, index) => (
            // Raw creative-palette hex values, shown as data about the concept — never used as an
            // app-chrome token and never fed into a semantic role here (`CLAUDE.md §6`).
            <span
              key={`${hex}-${index}`}
              aria-hidden="true"
              className="h-5 w-5 rounded-pill border border-app-border"
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      )}
      {concept.vocabulary && concept.vocabulary.length > 0 && (
        <p className="text-body-sm text-app-text-secondary">{concept.vocabulary.join(" · ")}</p>
      )}
      {concept.typography && (
        <p className="text-label-sm text-app-text-tertiary">{concept.typography}</p>
      )}
      {/* Previewable but not settled: a finished, viewable page whose artwork is still arriving.
          A quiet note, never a pending treatment — the card above it is already real
          (`spec.md §31 — Concept experience`). */}
      {!concept.settled && (
        <InlineStatus variant="info">Artwork is still being made for this one.</InlineStatus>
      )}
      <Link
        href={`/events/${eventId}/concepts/${concept.index}`}
        data-testid={`concept-preview-link-${concept.index}`}
        className="text-body-sm font-medium text-app-action underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
      >
        View this direction
      </Link>
    </div>
  );
}
