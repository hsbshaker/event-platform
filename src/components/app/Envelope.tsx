"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useReducer,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { AppButton } from "./AppButton";
import { BrandSeal } from "./BrandSeal";
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
 * Look (Revision 5, Lantern): lit paper on the dusk stage (§5.3), the brand seal at the flap's
 * point (`BrandSeal`, the placeholder mark of §5.2), the title in the app typeface, and a light
 * pool under the envelope, then under the card once it has risen (§6.5). The stage is
 * `EnvelopeStage`: callers that reserve the card's box wrap that box in it, so the dusk field
 * surrounds the whole reservation; an envelope mounted outside a stage brings its own.
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
 * width that keeps portrait cards from outgrowing a desktop viewport. An openable envelope
 * occupies the card's box from the first paint, the closed envelope centred in it, so nothing
 * moves when the card replaces it.
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
  /** Where the access gate goes (a later phase supplies it). Set on lit paper, never on dusk. */
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
/**
 * The card's rise (globals.css `envelope-card-rise`), as shares of the card's height `H`. The
 * envelope is as wide as the card (`W`), 10:7, and centred in the card's box, so its bottom edge
 * is `(H - 0.7W) / 2` above the box's. The card starts with its top 10% of the envelope's height
 * below the envelope's top edge (`from`), clipped at the envelope's bottom edge (`clipFrom`, then
 * `clipTo` once it has risen). Portrait (`H` = 1.4W): from (0.35 + 0.07) / 1.4, clipTo 0.35 / 1.4;
 * square (`H` = W): from 0.15 + 0.07, clipTo 0.15. `clipFrom` = `clipTo` + `from`.
 */
const CARD_RISE: Record<EnvelopeProportion, CSSProperties> = {
  portrait: {
    "--envelope-card-from": "30%",
    "--envelope-clip-from": "55%",
    "--envelope-clip-to": "25%",
  } as CSSProperties,
  square: {
    "--envelope-card-from": "22%",
    "--envelope-clip-from": "37%",
    "--envelope-clip-to": "15%",
  } as CSSProperties,
};

// Longer than the longest opening animation (globals.css "Envelope opening": the card's ends at
// --motion-press + --motion-reveal + --motion-base = 940ms, the light's at --motion-press +
// --motion-base + --motion-light = 1040ms), so a missed `animationend` can never strand the card.
const OPENING_FALLBACK_MS = 1200;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** True inside an `EnvelopeStage`. */
const OnStage = createContext(false);

/**
 * The dusk stage the envelope opens on (docs/design-system.md §5.3, §8.3): the field the card
 * rises from, sized by what it holds. A caller that reserves the card's box wraps the box in it;
 * the page beneath stays light. Text and focus on it use the dusk tokens (`.surface-dusk`). Once
 * the card is out, the dusk lifts and the card sits on the page itself (`globals.css`), so
 * nothing behind it reads as part of it.
 */
export function EnvelopeStage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <OnStage.Provider value={true}>
      <div
        data-envelope-stage=""
        className={cx(
          "surface-dusk flex w-full flex-col items-center overflow-hidden rounded-2xl px-4 py-12 sm:px-8 sm:py-16",
          className,
        )}
      >
        {children}
      </div>
    </OnStage.Provider>
  );
}

/** Mounts `children` on a stage unless one is already around them. */
function OwnStage({ children }: { children: ReactNode }) {
  return useContext(OnStage) ? children : <EnvelopeStage>{children}</EnvelopeStage>;
}

/**
 * The paper envelope: decorative geometry. `whole` is the closed envelope; while opening it is
 * drawn as two layers either side of the rising card: the `back` (the lit inside and the light
 * pool) behind it, the `front` (the pocket, flap, seal and title) in front.
 */
function EnvelopeFace({
  title,
  layer = "whole",
  opening,
}: {
  title?: ReactNode;
  layer?: "whole" | "back" | "front";
  opening?: boolean;
}) {
  const back = layer !== "front";
  const front = layer !== "back";
  return (
    <span className="relative block w-full">
      {back && <span aria-hidden="true" className="envelope-pool dusk-pool" />}
      <span
        className={cx("relative block w-full overflow-hidden rounded-sm", back && "bg-app-lit")}
        style={{ aspectRatio: "10 / 7" }}
      >
        {front && (
          <>
            {/* The pocket, notched where the flap closes over it. */}
            <span
              aria-hidden="true"
              className="surface-lit absolute inset-0"
              style={{ clipPath: "polygon(0 0, 50% 38%, 100% 0, 100% 100%, 0 100%)" }}
            />
            {/* The flap's shadow line, then the flap, opening together. */}
            <span
              aria-hidden="true"
              className={cx("absolute inset-0", opening && "envelope-flap-opening")}
            >
              <span
                className="absolute inset-x-0 top-0 bg-app-lit"
                style={{ height: "42%", clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
              />
              <span
                className="surface-lit absolute inset-x-0 top-0"
                style={{ height: "40%", clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
              />
            </span>
            {/* The seal at the flap's point. */}
            <span
              aria-hidden="true"
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ top: "40%" }}
            >
              <BrandSeal size="lg" className={cx(opening && "envelope-seal-giving")} />
            </span>
            {title && (
              <span
                className="absolute inset-x-0 flex items-center justify-center px-4 text-center"
                style={{ top: "calc(40% + var(--space-8))", bottom: "var(--space-4)" }}
              >
                {title}
              </span>
            )}
          </>
        )}
      </span>
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
  const captionId = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { phase } = state;

  // After opening, focus moves to the revealed card, so assistive tech lands on it. It is a focus
  // target, not a tab stop or a control, so it draws no ring: a frame around the card would read as
  // part of it.
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
      <OwnStage>
        <section
          aria-label={title}
          className={cx("mx-auto flex w-full flex-col items-center gap-8", className)}
          style={{ maxWidth: width }}
        >
          <EnvelopeFace title={<h2 className={TITLE_CLASSES}>{title}</h2>} />
          {sealedContent && (
            <div className="surface-lit w-full rounded-xl p-4 sm:p-6">{sealedContent}</div>
          )}
        </section>
      </OwnStage>
    );
  }

  const pending = phase === "pending";
  const cardMounted = cardIsMounted(phase);

  return (
    <OwnStage>
      <div
        data-envelope-phase={phase}
        className={cx("mx-auto flex w-full flex-col items-center gap-6", className)}
        style={{ maxWidth: width }}
      >
        {/* The card's box, held from the first paint: the closed envelope sits in its middle. */}
        <div className="relative w-full" style={{ aspectRatio: ASPECT[proportion] }}>
          {cardMounted ? (
            <CardStage
              phase={phase}
              proportion={proportion}
              title={title}
              cardRef={cardRef}
              onAnimationDone={() => dispatch({ type: "animationDone" })}
            >
              {children}
            </CardStage>
          ) : (
            <div className="absolute inset-0 flex items-center">
              <div className="relative w-full">
                <button
                  type="button"
                  onClick={() => void open()}
                  aria-busy={pending || undefined}
                  aria-describedby={captionId}
                  className={cx("app-press block w-full rounded-sm", pending && "cursor-progress")}
                >
                  <EnvelopeFace title={<span className={TITLE_CLASSES}>{title}</span>} />
                </button>
                {/* Under the envelope, out of the flow so the envelope stays centred. */}
                <p
                  id={captionId}
                  aria-live="polite"
                  className="absolute inset-x-0 top-full mt-4 text-center text-label-md text-dusk-text-secondary"
                >
                  {pending ? "Opening your invitation…" : "Tap to open"}
                </p>
              </div>
            </div>
          )}
        </div>
        {state.failed && !cardMounted && (
          <div className="surface-lit flex w-full flex-col items-center gap-3 rounded-xl p-4 text-center">
            <InlineStatus variant="danger">
              We couldn&rsquo;t open the invitation just now. Please try again.
            </InlineStatus>
            <AppButton variant="secondary" size="sm" onClick={() => void open()}>
              Try again
            </AppButton>
          </div>
        )}
      </div>
    </OwnStage>
  );
}

function CardStage({
  phase,
  proportion,
  title,
  cardRef,
  onAnimationDone,
  children,
}: {
  phase: EnvelopePhase;
  proportion: EnvelopeProportion;
  title: string;
  cardRef: RefObject<HTMLDivElement | null>;
  onAnimationDone: () => void;
  children: ReactNode;
}) {
  const opening = phase === "opening";
  return (
    <>
      {/* The light coming up under the card (an animation of its own, never the card's). */}
      <span aria-hidden="true" className="envelope-pool dusk-pool envelope-light-up" />
      {opening && (
        <div
          aria-hidden="true"
          className="envelope-shell-opening pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2"
        >
          <EnvelopeFace layer="back" />
        </div>
      )}
      <div
        ref={cardRef}
        tabIndex={-1}
        role="group"
        aria-label="Your invitation"
        data-envelope-card=""
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) onAnimationDone();
        }}
        className={cx("relative h-full w-full outline-none", opening && "envelope-card-opening")}
        style={CARD_RISE[proportion]}
      >
        {children}
      </div>
      {opening && (
        <div
          aria-hidden="true"
          className="envelope-shell-opening pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2"
        >
          <EnvelopeFace
            layer="front"
            opening
            title={<span className={TITLE_CLASSES}>{title}</span>}
          />
        </div>
      )}
    </>
  );
}
