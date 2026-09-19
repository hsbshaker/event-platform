"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppButton } from "@/components/app/AppButton";
import { InlineStatus } from "@/components/app/InlineStatus";
import { readGenerationForEvent, startConceptGenerationForEvent } from "@/app/actions/generation";
import { typographyLabel, vocabularyLabel } from "@/lib/generation/concept-labels";
import {
  generationInFlight,
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
 * **Readiness is per concept, not per batch.** `spec.md §31 — Prompt, auth, and generation`:
 * *"Each concept becomes available as soon as its resolved spec exists; no concept waits on its
 * siblings (§7.10)."* A slot is rendered for every planned sibling at a stable position
 * (`docs/design-system.md §12.2`), and each slot independently decides, from its own
 * `ConceptView.previewable`, whether it is still forming or already a finished page.
 *
 * **A start this panel made is watched, on a deadline.** The one thing the panel knows that no
 * row does is that it asked for work. `startConceptGenerationForEvent` schedules the batch with
 * `after()`, so the view it returns is necessarily the pre-plan one and a panel that polled only
 * while `generationInFlight(view)` would stop the instant a start succeeded. So the panel keeps
 * polling — and bounds it, because `spec.md §32 #45` is *"measure latency; do not hide unbounded
 * waits"*. Nothing about that wait is fabricated: no stage, no percentage and no row is invented,
 * only a neutral *Starting…* that says what this browser did rather than what the pipeline is
 * doing.
 *
 * **What this component does not do.** No concept selection, no full-site reveal, no
 * `Try another direction`, no Creation Mode, no contextual edit controls — all out of scope for
 * this phase (`spec.md §32 #7`, `#8`). The only interaction a concept card offers is a link to its
 * own preview route.
 */

/** Polling cadence while something is genuinely in motion. Seconds, never sub-second. */
const POLL_MS = 3_000;

/**
 * How long the panel watches a start it successfully made before saying it did not take.
 *
 * **Thirty seconds, from the one live measurement there is.** In the Phase 4G end-to-end run
 * (`docs/model-evals/results/phase-4g-e2e-mediterranean-shower/README.md §6`) the read model moved
 * from `not_started` to `exploring` **755 ms** after the start — `plan_generation_batch` writes
 * the batch row in a single transaction before any model call is made, so a batch becomes visible
 * at database speed rather than at model speed. The 45.3s and 71.8s milestones in that same run
 * are `designing` and `ready`, and this deadline deliberately does not wait for either: it is
 * asking only whether a batch exists, not whether it has finished.
 *
 * Thirty seconds is ~40× that measured time and ten poll intervals, so a start that took is seen
 * roughly ten times over before the deadline can fire. It is also short enough to be useful: a
 * start that was silently refused — a spend cap, the ceiling, a missing `OPENAI_API_KEY` in
 * `openAiEnv()`, a `not_authoritative` race — writes no batch row at all, and this is what turns
 * that silence into a sentence the host can act on instead of a spinner that never resolves.
 *
 * The signal watched for is `generationInFlight`, not merely "some batch exists", because a retry
 * is aimed at an event that already has a settled batch. A new batch is `planned` (in flight) from
 * the moment it is admitted and its shortest possible life is one premise call — 35.5s in the 4G
 * run — so it cannot plausibly be planned, run and settled between two three-second polls.
 */
const START_VISIBLE_WITHIN_MS = 30_000;

/**
 * How long this browser waits, after a `start` call whose transport died, before one ordinary
 * resume.
 *
 * An ordinary resume, never a retry: concept-batch admission is idempotent and guarded by a
 * database uniqueness index (`docs/phase-4b-plan.md §H.2`), so a second *ordinary* call here can
 * never buy a second batch — it either observes the batch the lost call actually created, or
 * starts the one it never managed to. A host's own **Try again** is the only thing that sends
 * `explicitRetry`, because that is the one call that may plan a new round.
 *
 * The resume is owed exactly once, and it is also what bounds the lost-transport wait: whichever
 * way it settles, the panel either sees a batch, starts the `START_VISIBLE_WITHIN_MS` watch, or
 * says the start did not take. Polling never outlives it.
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

/**
 * The one neutral thing the panel may say about its own request.
 *
 * Not a pipeline stage. `BATCH_LABEL` above is read from rows; this is read from the fact that
 * this browser made a call and has not yet seen its consequence — so it claims nothing about
 * exploring, designing or three of anything (`spec.md §31`).
 */
const STARTING_LABEL = "Starting…";

export interface GenerationPanelProps {
  eventId: string;
  initial: GenerationView;
}

export function GenerationPanel({ eventId, initial }: GenerationPanelProps) {
  const [view, setView] = useState<GenerationView>(initial);
  const [busy, setBusy] = useState(false);
  /** True once a `start` call's transport has died and the real outcome is still unknown. */
  const [optimisticInFlight, setOptimisticInFlight] = useState(false);
  /** When a start call succeeded and no batch is visible yet. The deadline runs from here. */
  const [startedAt, setStartedAt] = useState<number | null>(null);
  /** The deadline passed and still no batch. The host is told, and offered the action again. */
  const [startLost, setStartLost] = useState(false);
  /**
   * When a start call's transport died. State rather than a ref, deliberately.
   *
   * The resume below is scheduled by an effect, and an effect cannot see a ref change: held in a
   * ref, the owed resume was only scheduled if some *other* dependency happened to change first —
   * so on the one path that needs it, a lost start whose polls also fail, it never ran at all and
   * the panel polled for the life of the tab.
   */
  const [lostAt, setLostAt] = useState<number | null>(null);
  const resumed = useRef(false);

  const apply = useCallback((next: GenerationView) => {
    setView(next);
    // A batch is in flight in the rows themselves, so nothing is owed: the start took, and from
    // here the ordinary stage-driven polling carries the surface.
    if (generationInFlight(next)) {
      setLostAt(null);
      setOptimisticInFlight(false);
      setStartedAt(null);
      setStartLost(false);
    }
  }, []);

  /* --------------------------------------------------------------- polling */

  const watchingStart = startedAt !== null;

  useEffect(() => {
    if (!generationInFlight(view) && !optimisticInFlight && !watchingStart) return;
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
  }, [eventId, view.stage, optimisticInFlight, watchingStart, apply]);

  /* ------------------------------------------- the bound on a start that may not have taken */

  useEffect(() => {
    if (startedAt === null) return;
    const id = setTimeout(
      () => {
        // Nothing is asserted about *why*: the panel only knows it asked and never saw a batch.
        setStartedAt(null);
        setStartLost(true);
      },
      Math.max(0, START_VISIBLE_WITHIN_MS - (Date.now() - startedAt)),
    );
    return () => clearTimeout(id);
  }, [startedAt]);

  /* ------------------------------------------- one ordinary resume after a lost start */

  useEffect(() => {
    if (lostAt === null || resumed.current) return;
    // An in-flight batch proves the real outcome has arrived: the owed resume is moot. Nothing is
    // cleared here — `apply` already did, on the read that reported it — because a `setState` in
    // an effect body is a cascading render this rule rightly refuses.
    if (generationInFlight(view)) return;
    const wait = Math.max(0, RESUME_AFTER_LOST_START_MS - (Date.now() - lostAt));
    const id = setTimeout(() => {
      resumed.current = true;
      setLostAt(null);
      // Ordinary, never a retry — see `RESUME_AFTER_LOST_START_MS`. Spelled out rather than
      // omitted, so the one call the host did not make says so at its own call site.
      void startConceptGenerationForEvent(eventId, { explicitRetry: false })
        .then((next) => {
          setOptimisticInFlight(false);
          apply(next);
          if (!generationInFlight(next)) setStartedAt(Date.now());
        })
        .catch(() => {
          // The resume was the one attempt owed, and it did not land either. Stop polling and say
          // so rather than keeping a silent interval alive for the life of the tab.
          setOptimisticInFlight(false);
          setStartLost(true);
        });
    }, wait);
    return () => clearTimeout(id);
  }, [eventId, lostAt, view, apply]);

  /* --------------------------------------------------------------- actions */

  const start = useCallback(
    async (explicitRetry: boolean) => {
      if (busy || !view.canStart) return;
      setBusy(true);
      setStartLost(false);
      try {
        const next = await startConceptGenerationForEvent(eventId, { explicitRetry });
        setLostAt(null);
        setOptimisticInFlight(false);
        apply(next);
        // The call succeeded, so work was asked for — but the batch is scheduled with `after()`,
        // so this view was read before it could exist. Keep watching, on the deadline.
        if (!generationInFlight(next)) setStartedAt(Date.now());
      } catch {
        // The transport died, not necessarily the request. Start polling immediately so the true
        // state can be discovered, and owe exactly one ordinary resume if polling never converges.
        setLostAt(Date.now());
        resumed.current = false;
        setStartedAt(null);
        setOptimisticInFlight(true);
      } finally {
        setBusy(false);
      }
    },
    [busy, eventId, view.canStart, apply],
  );

  const batchLabel = BATCH_LABEL[view.stage];
  /** A start this browser made is outstanding: neither seen in the rows nor given up on. */
  const starting = watchingStart || optimisticInFlight;

  /**
   * The one action offered, if any — and it means what the server can honour.
   *
   * `not_started` takes an ordinary start; `failed` takes a retry, which is the only call that
   * plans a new round against a settled batch. Nothing is offered while a start is outstanding,
   * so a host cannot stack two requests on one batch.
   */
  const offer =
    starting || !view.canStart
      ? null
      : view.stage === "not_started"
        ? { explicitRetry: false, testId: "generation-start", label: "Explore three directions" }
        : view.stage === "failed"
          ? { explicitRetry: true, testId: "generation-retry", label: "Try again" }
          : null;

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
        {starting
          ? STARTING_LABEL
          : startLost
            ? "That didn't start. You can try again."
            : (batchLabel ??
              (view.stage === "failed" ? "That didn't come together. You can try again." : ""))}
      </p>

      {starting && (
        <div data-testid="generation-starting">
          <InlineStatus>{STARTING_LABEL}</InlineStatus>
        </div>
      )}

      {!starting && batchLabel && (
        <div data-testid="generation-stage-label">
          <InlineStatus>{batchLabel}</InlineStatus>
        </div>
      )}

      {!starting && startLost && (
        <div data-testid="generation-start-lost">
          <InlineStatus variant="warning">
            That didn&apos;t start — nothing has run. You can try again.
          </InlineStatus>
        </div>
      )}

      {!starting && !startLost && view.stage === "failed" && (
        <InlineStatus variant="warning">
          That didn&apos;t come together. Nothing was lost — you can try again.
        </InlineStatus>
      )}

      {view.stage === "unavailable" && (
        <InlineStatus variant="danger">
          We can&apos;t start this right now. Trying again won&apos;t help — please check back
          later.
        </InlineStatus>
      )}

      {offer && (
        <AppButton
          type="button"
          pending={busy}
          disabled={busy}
          onClick={() => void start(offer.explicitRetry)}
          className="self-start"
          data-testid={offer.testId}
        >
          {offer.label}
        </AppButton>
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
  // (`spec.md §31 — Prompt, auth, and generation`).
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

  // Enum ids are the compiler's identifiers, not words for a host (`spec.md §26`). An id with no
  // label is dropped rather than shown raw — the surface already renders every creative field
  // only when it exists.
  const vocabulary = vocabularyLabel(concept.vocabulary);
  const typography = typographyLabel(concept.typography);

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
      {vocabulary && <p className="text-body-sm text-app-text-secondary">{vocabulary}</p>}
      {typography && <p className="text-label-sm text-app-text-tertiary">{typography}</p>}
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
