"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { chooseDesign } from "@/app/actions/direction";
import { AppButton } from "@/components/app/AppButton";
import { InlineStatus } from "@/components/app/InlineStatus";
import { InvitationCard } from "@/components/card/InvitationCard";
import type { RevealedCard } from "@/lib/generation/reveal.server";

import { CHOOSE_ERROR, type ChooseOutcome } from "./direction/NewCardActions";

/**
 * Every design generated for the event, each as its card (`docs/design-system.md §10.21`;
 * `docs/screen-spec.md` `try-another-direction`, "Designs list"; `spec.md §7.14`, §8.2): the one
 * card component at a small size with no markers, its name and one-line description, the active
 * design marked "Current card", and `Choose this direction` on every other entry before publish.
 * After publish the list is read-only: no choose actions.
 *
 * The designs are peers: the order is the one given (the loader's: round ascending, so an entry
 * keeps its place when a new design arrives), and nothing ranks, scores or preselects beyond the
 * active design. Choosing changes design only, never event details.
 *
 * `choose` and `onChosen` default to the real action and a page refresh; the development fixture
 * injects stubs. Type-only import of `RevealedCard`: the server module is never bundled.
 */

const CARD_WIDTH = {
  "5:7": "min(100%, calc(var(--width-narrow) * 0.5))",
  "1:1": "min(100%, calc(var(--width-narrow) * 0.6))",
} as const;

export function DesignsList({
  eventId,
  designs,
  published,
  variant = "page",
  choose,
  onChosen,
}: {
  eventId: string;
  designs: readonly RevealedCard[];
  published: boolean;
  /**
   * `panel`: inside the Design panel (a sheet, so a narrower column and a heading one level down).
   */
  variant?: "page" | "panel";
  choose?: (designId: string) => Promise<ChooseOutcome>;
  onChosen?: (designId: string) => void;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<{ designId: string; message: string } | null>(null);

  async function onChoose(designId: string) {
    setPendingId(designId);
    setError(null);
    try {
      const result = await (choose ?? ((id) => chooseDesign({ eventId, designId: id })))(designId);
      if (result.ok) {
        (onChosen ?? (() => router.refresh()))(designId);
      } else {
        setError({ designId, message: CHOOSE_ERROR[result.reason] });
      }
    } catch {
      setError({ designId, message: CHOOSE_ERROR.failed });
    }
    setPendingId(null);
  }

  const panel = variant === "panel";
  const Heading = panel ? "h3" : "h2";
  return (
    <section aria-labelledby="designs-heading" className="flex w-full flex-col gap-6">
      <Heading
        id="designs-heading"
        className={panel ? "text-heading-md text-app-text" : "text-heading-lg text-app-text"}
      >
        Your designs
      </Heading>
      <ul
        data-designs-list=""
        className={
          panel
            ? "grid grid-cols-1 items-start gap-8 sm:max-lg:grid-cols-2"
            : "grid grid-cols-1 items-start gap-8 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {designs.map((design) => {
          const proportion = design.card.artwork.proportion;
          const nameId = `design-${design.designId}-name`;
          return (
            <li
              key={design.designId}
              aria-labelledby={nameId}
              data-design-entry=""
              data-design-active={design.active ? "" : undefined}
              className="flex min-w-0 flex-col items-center gap-3 text-center"
            >
              <div
                className="w-full"
                style={{
                  maxWidth: CARD_WIDTH[proportion],
                  aspectRatio: proportion === "5:7" ? "5 / 7" : "1 / 1",
                }}
              >
                <InvitationCard
                  shape={design.card.shape}
                  artwork={design.card.artwork}
                  panels={design.card.panels}
                  placement={design.card.placement}
                  boxes={design.card.boxes}
                />
              </div>
              <div className="flex flex-col gap-1">
                <h3 id={nameId} className="text-heading-md text-app-text">
                  {design.name}
                </h3>
                <p className="text-body-md text-app-text-secondary">{design.description}</p>
              </div>
              {design.active && (
                <p className="text-body-sm font-medium text-app-text">
                  <span aria-hidden="true">✓ </span>Current card
                </p>
              )}
              {!design.active && !published && (
                <AppButton
                  variant="secondary"
                  size="md"
                  aria-label={`Choose this direction: ${design.name}`}
                  pending={pendingId === design.designId}
                  disabled={pendingId !== null}
                  onClick={() => onChoose(design.designId)}
                >
                  Choose this direction
                </AppButton>
              )}
              {error?.designId === design.designId && (
                <InlineStatus variant="danger">{error.message}</InlineStatus>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
