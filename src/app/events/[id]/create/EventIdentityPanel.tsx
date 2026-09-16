"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AppButton } from "@/components/app/AppButton";
import { ChoiceGroup } from "@/components/app/ChoiceGroup";
import { InlineStatus } from "@/components/app/InlineStatus";
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
 * model returned — this surface adds no `Skip` of its own (`spec.md §7.6b #4`: exactly one defer
 * option, and a boundary question has none).
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

/**
 * How many consecutive polls may fail before the surface says so.
 *
 * One dropped read is not a broken service, and treating it as one stops the polling that would
 * have recovered from it.
 */
const TOLERATED_POLL_FAULTS = 3;

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
  /** Consecutive polls that came back as a server fault. */
  const faults = useRef(0);
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
          if (cancelled) return;
          // A dropped connection inside one read comes back as `service_error`, and applying it
          // would stop the polling, withdraw the Retry affordance and tell the host the service
          // is broken — while their paid call finishes unseen. A blip is absorbed; a fault that
          // persists across several polls is reported.
          if (next.state === "service_error") {
            faults.current += 1;
            if (faults.current < TOLERATED_POLL_FAULTS) return;
          } else {
            faults.current = 0;
          }
          apply(next);
        })
        // A rejected poll is not an event either: the next one will ask again.
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
    // A poll got there first and the event is at rest. The resume would be free — `already_succeeded`
    // or `needs_explicit_retry` — but a POST nobody needs is still a POST.
    if (!POLLED.has(view.state)) {
      lostAt.current = null;
      return;
    }
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
        // Keep the round and its open questions: dropping them would unmount a form the host may
        // be part-way through, over a transport failure that says nothing about it.
        apply({ ...view, state: "running" });
      } finally {
        setBusy(false);
      }
    },
    [busy, eventId, apply, view],
  );

  const answer = useCallback(
    async (answers: { questionIndex: number; selectedOptionLabel: string | null }[]) => {
      if (busy) return;
      setBusy(true);
      setAnswerError(undefined);
      moveFocus.current = true;
      try {
        // One submission for the whole round. A rerun is keyed to the answer set, so sending them
        // one at a time would buy a paid call per answer and replace the questions still unanswered.
        apply(
          await submitClarificationAnswer({
            eventId,
            revision: view.revision ?? 0,
            answers,
          }),
        );
      } catch {
        // The answer may well be durable and a call already running, so this arms the poll rather
        // than leaving the surface still: the canonical state is what settles it.
        setAnswerError("We couldn't confirm that just now. We're checking.");
        apply({ ...view, state: "running" });
      } finally {
        setBusy(false);
      }
    },
    [busy, eventId, view, apply],
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
  // A boundary question is asked alone; when one is present nothing else is shown beside it.
  const boundary = view.questions?.find((q) => q.kind === "boundary");
  const open = boundary ? [boundary] : (view.questions ?? []);

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

      {/* One live region, always mounted.
          A region inserted along with its text announces nothing — the platform reports *changes*
          to a region that was already there — so per-state `aria-live` elements are silent for
          exactly the transition that matters: a poll turning `running` into a question, while the
          host is typing in the details form beside this and looking elsewhere. Kept off-screen
          because the visible copy below already says it; this exists so it is also heard, once.
          `docs/design-system.md §14.4`: restrained live-region updates, not a running commentary. */}
      <p aria-live="polite" className="sr-only">
        {sending ? "Starting" : HEADING[view.state]}
      </p>

      {/* While a request of ours is in flight, the true thing to say is that we have sent it —
          not the resting state it has not answered with yet. */}
      {sending ? (
        <InlineStatus>We&apos;re starting on your event.</InlineStatus>
      ) : (
        <StateCopy view={view} />
      )}

      {/* One form for the round. Route B is alone by construction (`spec.md §7.6b #1b`); Route A
          may be up to three, and they are answered together so one rerun serves them all.

          Keyed by the round as well as by what it asks: a rerun commonly returns the next
          question at the same index, and without the round in the key React keeps the same
          instance — so the previous round's selection would survive into a question it was never
          an answer to. */}
      {open.length > 0 && (
        <RoundForm
          key={`${view.revision ?? 0}-${open.map((q) => q.index).join(",")}`}
          questions={open}
          busy={busy}
          error={answerError}
          onSubmit={(answers) => void answer(answers)}
        />
      )}

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
  clarification_required: "One thing we shouldn't decide for you",
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
        <InlineStatus>We&apos;re working out the creative direction for your event.</InlineStatus>
      );
    case "recovering":
      // Not an endless spinner, and not an error either: the host has nothing to do. No mention of
      // leases, claims, providers or recovery internals.
      return <InlineStatus>We&apos;re safely finishing your event.</InlineStatus>;
    case "clarification_required":
      return (
        <p className="text-body-md text-app-text-secondary">
          Your answer goes straight back into how we read your event.
        </p>
      );
    case "ready":
      return (
        <p className="text-body-md text-app-text-secondary">
          We&apos;ve read your description and worked out the creative direction for your event.
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
        // Says what is true and no more. An earlier draft promised the team had been alerted,
        // which holds for a configuration refusal and not for an unexpected fault — a promise the
        // surface cannot keep is the same failure as a fabricated progress bar.
        <InlineStatus variant="danger">
          We can&apos;t start this right now. Trying again won&apos;t help — please check back
          later.
        </InlineStatus>
      );
  }
}

/* ------------------------------------------------------------------ one round's questions */

function RoundForm({
  questions,
  busy,
  error,
  onSubmit,
}: {
  questions: IdentityViewQuestion[];
  busy: boolean;
  error?: string;
  onSubmit: (answers: { questionIndex: number; selectedOptionLabel: string | null }[]) => void;
}) {
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [missing, setMissing] = useState(false);
  const boundary = questions.some((q) => q.kind === "boundary");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        // Every question in the round, or none: a partial set would buy a paid rerun and leave the
        // rest unanswered behind it.
        if (questions.some((question) => selected[question.index] === undefined)) {
          setMissing(true);
          return;
        }
        setMissing(false);
        onSubmit(
          questions.map((question) => ({
            questionIndex: question.index,
            selectedOptionLabel: selected[question.index],
          })),
        );
      }}
    >
      {questions.map((question) => (
        <ChoiceGroup
          key={question.index}
          name={`clarification-${question.index}`}
          legend={question.question}
          options={question.options.map((option) => ({
            value: option.label,
            label: option.label,
            // The model's own defer option, named as what it is. This surface never adds one: a
            // boundary question has none, because that decision is the host's.
            note: option.isDefer ? "We'll make this call for you." : undefined,
          }))}
          value={selected[question.index] ?? null}
          onChange={(value) => {
            setSelected((current) => ({ ...current, [question.index]: value }));
            setMissing(false);
          }}
          disabled={busy}
          error={
            missing && selected[question.index] === undefined
              ? "Choose an option to continue."
              : undefined
          }
        />
      ))}

      {error && (
        <p role="alert" className="text-body-sm text-app-danger">
          {error}
        </p>
      )}

      <AppButton type="submit" pending={busy} disabled={busy} className="self-start">
        {boundary ? "Continue" : "Send this"}
      </AppButton>
    </form>
  );
}
