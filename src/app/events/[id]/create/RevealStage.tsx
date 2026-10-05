"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { AppButtonLink } from "@/components/app/AppButtonLink";
import { Envelope } from "@/components/app/Envelope";
import { CardWithMarkers } from "@/components/reveal/CardWithMarkers";
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
 * `Try another direction` is not here yet: it arrives with its flow (Phase 5d).
 */

/** A card read this recently is shown as it is; an older one is read again on the tap. */
const FRESH_FOR_MS = 60_000;

function isFresh(card: RevealedCard, now: number): boolean {
  const expires = Date.parse(card.artworkExpiresAt);
  return Number.isFinite(expires) && expires - now > FRESH_FOR_MS;
}

/** The width the envelope gives its card (`Envelope.tsx`): the reserved box matches it. */
const BOX_WIDTH: Record<CardProportion, string> = {
  "5:7": "min(100%, calc(var(--width-narrow) * 0.64))",
  "1:1": "min(100%, calc(var(--width-narrow) * 0.8))",
};
const BOX_HEIGHT: Record<CardProportion, string> = { "5:7": "140cqw", "1:1": "100cqw" };

export function RevealStage({
  eventId,
  title,
  proportion,
  loadCard,
  preloaded = null,
}: {
  eventId: string;
  /** The card's effective title: the envelope's front. */
  title: string;
  proportion: CardProportion;
  /** Reads the card, with a fresh artwork URL; null when it cannot be shown. */
  loadCard: () => Promise<RevealedCard | null>;
  /** A card read just before, used on the tap while its artwork URL is still fresh. */
  preloaded?: RevealedCard | null;
}) {
  const [card, setCard] = useState<RevealedCard | null>(null);
  const [settled, setSettled] = useState(false);

  async function onOpen() {
    const next = preloaded && isFresh(preloaded, Date.now()) ? preloaded : await loadCard();
    if (!next) throw new Error("The card could not be loaded.");
    setCard(next);
  }

  return (
    <div className="mx-auto flex w-full max-w-(--width-standard) flex-col items-center gap-8">
      {/* The card's box, reserved: the closed envelope sits in it and the card replaces it. */}
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
                <CardWithMarkers card={card.card} unconfirmed={card.unconfirmed} />
              </Settled>
            )}
          </Envelope>
        </div>
      </div>

      {card && settled && (
        <div className="flex flex-col items-center gap-6 text-center" data-reveal-actions="">
          <div className="flex flex-col gap-1">
            <h2 className="text-heading-lg text-app-text">{card.name}</h2>
            <p className="max-w-prose text-body-md text-app-text-secondary">{card.description}</p>
          </div>
          <p className="text-heading-md text-app-text">
            Your invitation looks great.
            <br />
            Let&rsquo;s make it real.
          </p>
          {/* `Try another direction` joins this row with its flow (Phase 5d). */}
          <AppButtonLink href={`/events/${eventId}`} size="lg">
            Make it yours →
          </AppButtonLink>
        </div>
      )}
    </div>
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
