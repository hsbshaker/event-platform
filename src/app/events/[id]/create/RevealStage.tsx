"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { AppButtonLink } from "@/components/app/AppButtonLink";
import { ConfirmLegend } from "@/components/app/ConfirmLegend";
import { Envelope, ENVELOPE_WIDTH, EnvelopeStage } from "@/components/app/Envelope";
import { InvitationCard } from "@/components/card/InvitationCard";
import type { CardProportion } from "@/lib/card/shapes";
import type { RevealedCard } from "@/lib/generation/reveal.server";

/**
 * The card reveal (`docs/screen-spec.md` `card-reveal`; `docs/design-system.md §4.4`, §4.5, §8.3):
 * the card comes out of the house envelope guests see, on the host's tap. The card is read when the
 * envelope opens (`loadCard`), so its artwork's short-lived URL is fresh when it is shown; the box
 * it will fill is reserved from the first paint, so nothing shifts when it appears. Once the card
 * has settled: its name and one-line description, the invitation's message, and `Make it yours →`
 * into Creation Mode (the same invitation, not a dashboard).
 *
 * `Try another direction ✦` beside it opens the box for this card (Phase 5d).
 */

/** A card read this recently is shown as it is; an older one is read again on the tap. */
const FRESH_FOR_MS = 60_000;

function isFresh(card: RevealedCard, now: number): boolean {
  const expires = Date.parse(card.artworkExpiresAt);
  return Number.isFinite(expires) && expires - now > FRESH_FOR_MS;
}

/** The width the envelope gives its card: the reserved box matches it. */
const BOX_WIDTH: Record<CardProportion, string> = {
  "5:7": ENVELOPE_WIDTH.portrait,
  "1:1": ENVELOPE_WIDTH.square,
};
const BOX_HEIGHT: Record<CardProportion, string> = { "5:7": "140cqw", "1:1": "100cqw" };

export function RevealStage({
  title,
  proportion,
  loadCard,
  actions,
  preloaded = null,
  beforeLoad,
}: {
  /** The card's effective title: the envelope's front. */
  title: string;
  proportion: CardProportion;
  /** Reads the card, with a fresh artwork URL; null when it cannot be shown. */
  loadCard: () => Promise<RevealedCard | null>;
  /** What follows the card once it has settled, under its name and description. */
  actions: (card: RevealedCard) => ReactNode;
  /** A card read just before, used on the tap while its artwork URL is still fresh. */
  preloaded?: RevealedCard | null;
  /** Resolves once the details form's last edit has been saved, before the card is read. */
  beforeLoad?: () => Promise<void>;
}) {
  const [card, setCard] = useState<RevealedCard | null>(null);
  const [settled, setSettled] = useState(false);

  async function onOpen() {
    await beforeLoad?.();
    const next = preloaded && isFresh(preloaded, Date.now()) ? preloaded : await loadCard();
    if (!next) throw new Error("The card could not be loaded.");
    setCard(next);
  }

  return (
    <div className="mx-auto flex w-full max-w-(--width-standard) flex-col items-center gap-8">
      {/* The card's box, reserved on the dusk stage (design-system §5.3): the closed envelope
          sits in it and the card replaces it; the name, description and actions follow on the
          light page. */}
      <EnvelopeStage>
        <div
          className="mx-auto w-full"
          style={{ maxWidth: BOX_WIDTH[proportion], containerType: "inline-size" }}
        >
          <div
            data-reveal-box=""
            className="flex items-center"
            style={{ minHeight: BOX_HEIGHT[proportion] }}
          >
            <Envelope
              title={title}
              proportion={proportion === "5:7" ? "portrait" : "square"}
              onOpen={onOpen}
            >
              {card && (
                <Settled onSettled={() => setSettled(true)}>
                  <InvitationCard
                    shape={card.card.shape}
                    artwork={card.card.artwork}
                    panels={card.card.panels}
                    boxes={card.card.boxes}
                  />
                </Settled>
              )}
            </Envelope>
          </div>
        </div>
      </EnvelopeStage>

      {card && settled && <ConfirmLegend boxes={card.card.boxes} unconfirmed={card.unconfirmed} />}
      {card && settled && (
        <div className="flex flex-col items-center gap-6 text-center" data-reveal-actions="">
          <div className="flex flex-col gap-1">
            <h2 className="text-heading-lg text-app-text">{card.name}</h2>
            <p className="max-w-prose text-body-md text-app-text-secondary">{card.description}</p>
          </div>
          {actions(card)}
        </div>
      )}
    </div>
  );
}

/** The first card's actions: into Creation Mode, or a new direction for the card on screen. */
export function FirstCardActions({ eventId, designId }: { eventId: string; designId: string }) {
  return (
    <>
      <p className="text-heading-md text-app-text">
        Your invitation looks great.
        <br />
        Let&rsquo;s make it real.
      </p>
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <AppButtonLink href={`/events/${eventId}`} size="lg">
          Make it yours →
        </AppButtonLink>
        <AppButtonLink
          href={`/events/${eventId}/direction?from=${designId}`}
          variant="secondary"
          size="lg"
        >
          Try another direction ✦
        </AppButtonLink>
      </div>
    </>
  );
}

/**
 * Calls `onSettled` once the envelope's opening animation on the card has finished (at once when
 * there is none, as under reduced motion), so the actions appear after the card has settled.
 */
function Settled({ onSettled, children }: { onSettled: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(onSettled);
  useEffect(() => {
    done.current = onSettled;
  });
  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (!cancelled) done.current();
    };
    const stage = ref.current?.closest("[data-envelope-card]");
    const animations = stage?.getAnimations?.() ?? [];
    if (animations.length === 0) {
      finish();
    } else {
      Promise.allSettled(animations.map((a) => a.finished)).then(finish);
    }
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div ref={ref} className="h-full w-full">
      {children}
    </div>
  );
}
