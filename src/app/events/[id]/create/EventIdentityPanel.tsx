"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AppButton } from "@/components/app/AppButton";
import { ChoiceGroup } from "@/components/app/ChoiceGroup";
import { InlineStatus } from "@/components/app/InlineStatus";
import { Textarea } from "@/components/app/Textarea";
import {
  readEventIdentityForEvent,
  startEventIdentityForEvent,
  submitClarificationAnswer,
} from "@/app/actions/event-identity";
import type { IdentityView, IdentityViewQuestion } from "@/lib/generation/identity-view";

/**
 * T11 — the minimal clarification and generation-control surface.
 *
 * It consumes T10's public contract and nothing else. There is no orchestration here: no cap, no
 * claim, no attempt key, no provider. Every button and every poll calls a server action that calls
 * a T10 entry point, and the safety boundary is the database, not this component.
 *
 * Three rules shape almost everything below.
 *
 * **Route A never gates.** A creative question renders beside whatever state the event is in,
 * including `ready`. It is not a modal, it traps nobody, and its only defer option is the one the
 * model returned — this surface adds no `Skip` of its own (`spec.md §7.6b #4`).
 *
 * **Route B is the one thing that blocks.** A boundary question is shown alone, with the options
 * the model returned and no invented default, because Route B fires exactly when the decision is
 * not ours to make.
 *
 * **Progress is not theatre.** No percentages, no invented stages, no simulated reasoning. The
 * rich generation experience belongs to a later phase that has real downstream artifacts to show;
 * until then a truthful sentence beats a convincing one (`spec.md §7.10`, `§32 #45`).
 *
 * Acceptance criteria: `spec.md §31 — Creation Mode`; `§31 — Responsive/accessibility`; `§7.6b`.
 */

/** Polling cadence while something is genuinely in motion. Seconds, never sub-second. */
const POLL_MS = 3_000;

/**
 * How long after a lost start this browser waits before one ordinary resume.
 *
 * Deliberately past the server's pre-invocation reclaim horizon. Resuming sooner would only
 * observe the claim we ourselves created; resuming after it means a claim that provably never
 * reached the provider has become reclaimable, so the resume can actually finish the job. A unit
 * test pins this above `IDENTITY_PREINVOKE_RECLAIM_MS`.
 *
 * Exactly one such attempt. Polling is the normal observation path, and a POST on every interval
 * would be a retry loop wearing a poll's clothes.
 */
export const RESUME_AFTER_LOST_TRANSPORT_MS = 33_000;

/** The states worth asking about again. Everything else is at rest until the host acts. */
const POLLED: ReadonlySet<IdentityView["state"]> = new Set(["running", "recovering"]);

export interface EventIdentityPanelProps {
  eventId: string;
  initial: IdentityView;
}

export function EventIdentityPanel({ eventId, initial }: EventIdentityPanelProps) {
  const [view, setView] = useState<IdentityView>(initial);
  const [busy, setBusy] = useState(false);
  const [answerError, setAnswerError] = useState<string | undefined>(undefined);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** Set when a start we sent never came back. One ordinary resume is owed, and only one. */
  const lostAt = useRef<number | null>(null);
  const resumed = useRef(false);
  const autoStarted = useRef(false);
  const moveFocus = useRef(false);

  const apply = useCallback((next: IdentityView) => {
    setView(next);
  }, []);

  /* --------------------------------------------------------------- polling */

  useEffect(() => {
    if (!POLLED.has(view.state)) return;
    let cancelled = false;
    const id = setInterval(() => {
      void readEventIdentityForEvent(eventId)
        .then((next) => {
          if (!cancelled) apply(next);
        })
        // A failed poll is not an event: the next one will ask again. Showing an error for a
        // dropped request would turn an ordinary reconnect into something the host must read.
        .catch(() => {});
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [eventId, view.state, apply]);

  /* ------------------------------------------- one ordinary resume after a lost start */

  useEffect(() => {
    if (lostAt.current === null || resumed.current) return;
    const wait = Math.max(0, RESUME_AFTER_LOST_TRANSPORT_MS - (Date.now() - lostAt.current));
    const id = setTimeout(() => {
      resumed.current = true;
      // **Ordinary**, not a retry: it observes a live call, completes a captured response or
      // reclaims a claim that provably never reached the provider. In none of those does it buy a
      // second call. Only the host's own Retry sends `explicitRetry`.
      void startEventIdentityForEvent(eventId, { explicitRetry: false })
        .then(apply)
        .catch(() => {});
    }, wait);
    return () => clearTimeout(id);
  }, [eventId, view.state, apply]);

  /* --------------------------------------------------------------- actions */

  const start = useCallback(
    async (explicitRetry: boolean) => {
      if (busy) return;
      setBusy(true);
      setAnswerError(undefined);
      try {
        apply(await startEventIdentityForEvent(eventId, { explicitRetry }));
        lostAt.current = null;
      } catch {
        // The transport died, not the generation. Keep polling, and owe exactly one resume.
        lostAt.current = Date.now();
        resumed.current = false;
        apply({ state: "running", hasAuthoritativeIdentity: view.hasAuthoritativeIdentity });
      } finally {
        setBusy(false);
      }
    },
    [busy, eventId, apply, view.hasAuthoritativeIdentity],
  );

  const answer = useCallback(
    async (question: IdentityViewQuestion, selected: string | null, freeText: string | null) => {
      if (busy) return;
      setBusy(true);
      setAnswerError(undefined);
      moveFocus.current = true;
      try {
        apply(
          await submitClarificationAnswer({
            eventId,
            revision: view.revision ?? 0,
            questionIndex: question.index,
            selectedOptionLabel: selected,
            freeText,
          }),
        );
      } catch {
        setAnswerError("We couldn't save that just now. Try once more.");
      } finally {
        setBusy(false);
      }
    },
    [busy, eventId, view.revision, apply],
  );

  /* ------------------------------------------------ the first run, once, on arrival */

  useEffect(() => {
    if (autoStarted.current || initial.state !== "retry_available") return;
    autoStarted.current = true;
    // `spec.md §7.2`: generation begins once the host is authenticated, not on a button. An
    // **ordinary** start, so this is safe to do unconditionally: if a terminal attempt already
    // blocks this event it returns `retry_available` and spends nothing, and if a call is in
    // flight it observes it. Only the host's own Retry sends `explicitRetry`.
    void start(false);
    // On mount only. Re-running it whenever the state changed would turn one start into a loop.
  }, [initial.state, start]);

  /* ---------------------------------------- focus after the question is replaced */

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    // The control the host was using has just been removed from the document. Without this, focus
    // falls to the body and a keyboard or screen-reader user is dropped at the top of the page
    // with no announcement of what replaced it.
    headingRef.current?.focus();
  }, [view]);

  // A start or retry of ours is in flight. Answering is separate: the question form owns its own
  // pending state, and the panel must not claim to be "starting" while an answer is saving.
  const sending = busy && view.questions === undefined;
  const boundary = view.questions?.find((q) => q.kind === "boundary");
  const creative = view.questions?.filter((q) => q.kind === "creative") ?? [];

  return (
    <section
      aria-labelledby="identity-panel-heading"
      className="flex flex-col gap-4 rounded-2xl border border-app-border bg-app-surface p-5 shadow-soft"
    >
      <h2
        id="identity-panel-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-heading-md text-app-text outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
      >
        {sending ? "Starting" : HEADING[view.state]}
      </h2>

      {/* While a request of ours is in flight, the true thing to say is that we have sent it —
          not the resting state it has not answered with yet. */}
      {sending ? (
        <InlineStatus live>We&apos;re starting on your event.</InlineStatus>
      ) : (
        <StateCopy view={view} />
      )}

      {/* Route B: alone, blocking, and only the options the model returned. */}
      {boundary && (
        <QuestionForm
          question={boundary}
          busy={busy}
          error={answerError}
          onSubmit={(selected, freeText) => void answer(boundary, selected, freeText)}
        />
      )}

      {/* Route A: beside everything else, never instead of it. */}
      {!boundary &&
        creative.map((question) => (
          <QuestionForm
            key={question.index}
            question={question}
            busy={busy}
            error={answerError}
            onSubmit={(selected, freeText) => void answer(question, selected, freeText)}
          />
        ))}

      {view.state === "retry_available" && (
        <AppButton
          type="button"
          pending={busy}
          disabled={busy}
          onClick={() => void start(true)}
          className="self-start"
        >
          Try again
        </AppButton>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ copy, and only true copy */

const HEADING: Record<IdentityView["state"], string> = {
  running: "Reading your description",
  recovering: "Finishing up",
  clarification_required: "One question before we start",
  ready: "Your creative direction is ready",
  retry_available: "We couldn't finish that",
  temporarily_unavailable: "Not available right now",
  service_error: "Something went wrong on our side",
};

function StateCopy({ view }: { view: IdentityView }) {
  switch (view.state) {
    case "running":
      // No percentage, no stage list, no invented activity. One true sentence.
      return (
        <InlineStatus live>
          We&apos;re working out the creative direction for your event.
        </InlineStatus>
      );
    case "recovering":
      // Not an endless spinner, and not an error either: the host has nothing to do. No mention of
      // leases, claims, providers or recovery internals.
      return <InlineStatus live>We&apos;re safely finishing your event.</InlineStatus>;
    case "clarification_required":
      return (
        <p className="text-body-md text-app-text-secondary">
          There&apos;s one thing we shouldn&apos;t decide for you.
        </p>
      );
    case "ready":
      return (
        <p className="text-body-md text-app-text-secondary">
          We&apos;ve read your description and worked out the direction. Design concepts come next.
        </p>
      );
    case "retry_available":
      return (
        <InlineStatus variant="warning">
          Your event is safe. Nothing was lost — you can start it again.
        </InlineStatus>
      );
    case "temporarily_unavailable":
      // The frozen sentence, and nothing that would let a caller tell one limit from another.
      return <InlineStatus variant="warning">{view.message}</InlineStatus>;
    case "service_error":
      // Deliberately not an invitation to keep trying: this will not fix itself by retrying.
      return (
        <InlineStatus variant="danger">
          We can&apos;t start this right now. Our team has been alerted — please check back later.
        </InlineStatus>
      );
  }
}

/* ------------------------------------------------------------------ one question */

function QuestionForm({
  question,
  busy,
  error,
  onSubmit,
}: {
  question: IdentityViewQuestion;
  busy: boolean;
  error?: string;
  onSubmit: (selected: string | null, freeText: string | null) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");
  const [missing, setMissing] = useState(false);
  const name = `clarification-${question.index}`;
  const creative = question.kind === "creative";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const typed = freeText.trim().length > 0 ? freeText : null;
        // An answer that says nothing is not an answer — the same rule the table's check
        // constraint enforces, applied here so the host is told rather than refused.
        if (selected === null && typed === null) {
          setMissing(true);
          return;
        }
        setMissing(false);
        onSubmit(selected, typed);
      }}
    >
      <ChoiceGroup
        name={name}
        legend={question.question}
        options={question.options.map((option) => ({
          value: option.label,
          label: option.label,
          // The model's own defer option, named as what it is. This surface never adds one: a
          // boundary question has none because that decision is the host's.
          note: option.isDefer ? "We'll make this call for you." : undefined,
        }))}
        value={selected}
        onChange={(value) => {
          setSelected(value);
          setMissing(false);
        }}
        disabled={busy}
        error={missing ? "Choose an option to continue." : error}
      />

      {creative && (
        <label className="flex flex-col gap-1.5">
          <span className="text-label-md text-app-text">Or tell us in your own words</span>
          <Textarea
            value={freeText}
            onChange={(event) => {
              setFreeText(event.target.value);
              setMissing(false);
            }}
            disabled={busy}
            rows={2}
          />
        </label>
      )}

      <AppButton type="submit" pending={busy} disabled={busy} className="self-start">
        {creative ? "Send this" : "Continue"}
      </AppButton>
    </form>
  );
}
