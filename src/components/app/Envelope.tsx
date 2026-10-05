"use client";

import { useCallback, useEffect, useReducer, useRef, type ReactNode, type RefObject } from "react";
import { AppButton } from "./AppButton";
import { InlineStatus } from "./InlineStatus";
import { cx } from "./cx";
import {
  INITIAL_ENVELOPE_STATE,
  cardIsMounted,
  envelopeReducer,
  type EnvelopePhase,
} from "./envelope-state";

/**
 * House envelope (docs/design-system.md §8.3, §10.20; docs/card-system.md §6.2).
 *
 * The same for every event: plain CSS built from app tokens, never themed, generated or
 * given card colours or fonts. It never opens by itself. The card is rendered by the caller
 * and mounted in the DOM only after the guest opens the envelope.
 *
 * Keeping the card out of the *response* is the caller's job, not this component's: anything a
 * Server Component passes as `children` is serialised into the page payload whether or not it is
 * mounted. So (spec.md §31 — Card rendering and envelope; design-system.md §15.7):
 * - a sealed envelope takes no card at all (`sealed: true` has no `children`);
 * - a personal-link page passes no server-rendered card either: it fetches the card in `onOpen`
 *   and renders it as `children` only after that resolves.
 *
 * The card is exactly as wide as the envelope, the width of its opening, so the card does not
 * change size as it settles. The proportion only chooses the card's aspect ratio and the
 * width that keeps portrait cards from outgrowing a desktop viewport.
 */

export type EnvelopeProportion = "portrait" | "square";

interface EnvelopeBaseProps {
  /** The event title shown on the front and used in the accessible name. */
  title: string;
  proportion: EnvelopeProportion;
  className?: string;
}

/** Private event reached by the shared link: only the title and `sealedContent` render. */
export interface SealedEnvelopeProps extends EnvelopeBaseProps {
  sealed: true;
  /** Where the access gate goes (a later phase supplies it). */
  sealedContent?: ReactNode;
  /** A sealed envelope is never given the card, so nothing of it reaches the response. */
  children?: never;
  onOpen?: never;
}

export interface OpenableEnvelopeProps extends EnvelopeBaseProps {
  sealed?: false;
  sealedContent?: never;
  /**
   * Runs on the guest's action, before the card appears. A personal-link page loads the card
   * here. While it is pending the envelope shows a calm in-progress line; if it rejects the
   * envelope stays closed with a plain-language retry.
   */
  onOpen?: () => void | Promise<void>;
  /** The card, rendered by the caller. Mounted only once the envelope is opening or open. */
  children: ReactNode;
}

export type EnvelopeProps = SealedEnvelopeProps | OpenableEnvelopeProps;

const ASPECT: Record<EnvelopeProportion, string> = { portrait: "5 / 7", square: "1 / 1" };
// Fractions of --width-narrow: a 5:7 card at 0.64 stays under ~500px tall; a square can be wider.
export const ENVELOPE_WIDTH: Record<EnvelopeProportion, string> = {
  portrait: "min(100%, calc(var(--width-narrow) * 0.64))",
  square: "min(100%, calc(var(--width-narrow) * 0.8))",
};

// Slightly longer than --motion-emphasis, so a missed `animationend` can never strand the card.
const OPENING_FALLBACK_MS = 700;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** The paper envelope itself: body, folded front, flap and the title. Decorative geometry. */
function EnvelopeFace({
  children,
  hint,
  opening,
}: {
  children: ReactNode;
  hint?: ReactNode;
  opening?: boolean;
}) {
  return (
    <span
      className={cx(
        "relative block w-full overflow-hidden rounded-lg border border-app-border-strong bg-app-surface-muted shadow-soft",
        opening && "envelope-shell-opening",
      )}
      style={{ aspectRatio: "10 / 7" }}
    >
      {/* Front fold. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-app-surface-subtle"
        style={{ clipPath: "polygon(0 0, 50% 54%, 100% 0, 100% 100%, 0 100%)" }}
      />
      {/* Flap outline, then the flap. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 bg-app-border-strong"
        style={{ height: "58%", clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
      />
      <span
        aria-hidden="true"
        className={cx(
          "absolute inset-x-0 top-0 bg-app-surface-muted",
          opening && "envelope-flap-opening",
        )}
        style={{ height: "56%", clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
      />
      <span
        className="absolute inset-x-0 flex items-center justify-center px-4 text-center"
        style={{ top: "58%", bottom: "var(--space-6)" }}
      >
        {children}
      </span>
      {hint && (
        <span className="absolute inset-x-0 bottom-2 text-center text-label-sm text-app-text-secondary">
          {hint}
        </span>
      )}
    </span>
  );
}

const TITLE_CLASSES = "line-clamp-3 break-words text-heading-md text-app-text";

export function Envelope(props: EnvelopeProps) {
  const { title, proportion, className } = props;
  const sealed = props.sealed === true;
  const sealedContent = props.sealed ? props.sealedContent : undefined;
  const onOpen = props.sealed ? undefined : props.onOpen;
  const children = props.sealed ? null : props.children;
  const [state, dispatch] = useReducer(envelopeReducer, INITIAL_ENVELOPE_STATE);
  const cardRef = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { phase } = state;

  // After opening, focus moves to the revealed card (never trapped: it is a plain tab stop).
  useEffect(() => {
    if (cardIsMounted(phase) && !focused.current) {
      focused.current = true;
      cardRef.current?.focus({ preventScroll: true });
    }
    if (phase === "closed") focused.current = false;
  }, [phase]);

  // The animation normally ends the opening phase; the timer is only a safety net.
  useEffect(() => {
    if (phase !== "opening") return;
    const timer = window.setTimeout(() => dispatch({ type: "animationDone" }), OPENING_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const open = useCallback(async () => {
    if (inFlight.current) return;
    const reducedMotion = prefersReducedMotion();
    if (!onOpen) {
      dispatch({ type: "press", async: false, reducedMotion });
      return;
    }
    inFlight.current = true;
    dispatch({ type: "press", async: true, reducedMotion });
    try {
      await onOpen();
      if (mounted.current) dispatch({ type: "loaded", reducedMotion: prefersReducedMotion() });
    } catch {
      if (mounted.current) dispatch({ type: "failed" });
    } finally {
      inFlight.current = false;
    }
  }, [onOpen]);

  const width = ENVELOPE_WIDTH[proportion];

  if (sealed) {
    return (
      <section
        aria-label={title}
        className={cx("mx-auto flex w-full flex-col items-center gap-6", className)}
        style={{ maxWidth: width }}
      >
        <EnvelopeFace>
          <h2 className={TITLE_CLASSES}>{title}</h2>
        </EnvelopeFace>
        {sealedContent && <div className="w-full">{sealedContent}</div>}
      </section>
    );
  }

  const pending = phase === "pending";

  if (!cardIsMounted(phase)) {
    return (
      <div
        className={cx("mx-auto flex w-full flex-col items-center gap-4", className)}
        style={{ maxWidth: width }}
      >
        <button
          type="button"
          onClick={() => void open()}
          aria-busy={pending || undefined}
          className={cx(
            "block w-full rounded-lg transition-transform motion-safe:hover:-translate-y-0.5",
            pending && "cursor-progress",
          )}
        >
          <EnvelopeFace hint={pending ? "Opening…" : "Tap to open"}>
            <span className={TITLE_CLASSES}>{title}</span>
          </EnvelopeFace>
        </button>
        <div aria-live="polite" className="w-full">
          {pending && <InlineStatus>Opening your invitation…</InlineStatus>}
        </div>
        {state.failed && (
          <div className="flex w-full flex-col items-center gap-3 text-center">
            <InlineStatus variant="danger">
              We couldn&rsquo;t open the invitation just now. Please try again.
            </InlineStatus>
            <AppButton variant="secondary" size="sm" onClick={() => void open()}>
              Try again
            </AppButton>
          </div>
        )}
      </div>
    );
  }

  return (
    <CardStage
      phase={phase}
      proportion={proportion}
      width={width}
      className={className}
      cardRef={cardRef}
      onAnimationDone={() => dispatch({ type: "animationDone" })}
    >
      {children}
    </CardStage>
  );
}

function CardStage({
  phase,
  proportion,
  width,
  className,
  cardRef,
  onAnimationDone,
  children,
}: {
  phase: EnvelopePhase;
  proportion: EnvelopeProportion;
  width: string;
  className?: string;
  cardRef: RefObject<HTMLDivElement | null>;
  onAnimationDone: () => void;
  children: ReactNode;
}) {
  const opening = phase === "opening";
  return (
    <div className={cx("relative mx-auto w-full", className)} style={{ maxWidth: width }}>
      <div
        ref={cardRef}
        tabIndex={-1}
        role="group"
        aria-label="Your invitation"
        data-envelope-card=""
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) onAnimationDone();
        }}
        className={cx("w-full outline-offset-4", opening && "envelope-card-opening")}
        style={{ aspectRatio: ASPECT[proportion] }}
      >
        {children}
      </div>
      {opening && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0">
          <EnvelopeFace opening>{null}</EnvelopeFace>
        </div>
      )}
    </div>
  );
}
