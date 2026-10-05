"use client";

import type { ReactNode } from "react";

import { AppButtonLink } from "@/components/app/AppButtonLink";
import type { CardShape } from "@/lib/card/shapes";
import type { RevealedCard } from "@/lib/generation/reveal.server";
import type { CardShapeOptions } from "@/lib/generation/shape.server";

import { DesignsList } from "./DesignsList";
import type { ChooseOutcome } from "./direction/NewCardActions";
import { ShapeControl } from "./ShapeControl";
import type { ShapeSwitchState } from "./use-shape-switch";

/**
 * What the `Design` panel holds (`docs/screen-spec.md` `design-panel`; `spec.md §7.14`, §8.1, §8.2,
 * §31 — Creation Mode "Design controls expose only …"; `docs/design-system.md §4.10`), in the
 * screen spec's order and limited to what exists:
 *
 * - the card's shape (`ShapeControl`);
 * - `Try another direction ✦`, before publish only;
 * - the designs list — choosing before publish, read-only after.
 *
 * `Edit card` and `Reset card` belong to the card editor (Phase 6b), which does not exist yet, so
 * they are not here. No layout, art mode, ink or panel control, no artwork editing, no page styling,
 * no uploads. The panel's body is drawn inside a `Sheet`; the switch's state lives in the canvas, so
 * a wait carries on when the panel is closed.
 */

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-heading-md text-app-text">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DesignPanel({
  eventId,
  designId,
  published,
  shapes,
  switching,
  onChooseShape,
  onRetryShape,
  onDismissShape,
  shapeAnnouncement,
  designs,
  choose,
  onChosen,
}: {
  eventId: string;
  /** The active design: `Try another direction` starts from it. */
  designId: string;
  published: boolean;
  shapes: CardShapeOptions | null;
  switching: ShapeSwitchState;
  onChooseShape: (shape: CardShape) => void;
  onRetryShape: () => void;
  onDismissShape: () => void;
  /** Said once a shape is on the card, for screen readers. */
  shapeAnnouncement?: string;
  designs: readonly RevealedCard[];
  choose?: (designId: string) => Promise<ChooseOutcome>;
  onChosen?: (designId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-8" data-design-panel="">
      {shapes && (
        <Section id="design-shape" title="Shape">
          <ShapeControl
            options={shapes}
            switching={switching}
            onChoose={onChooseShape}
            onRetry={onRetryShape}
            onDismiss={onDismissShape}
            announcement={shapeAnnouncement}
          />
        </Section>
      )}
      {/* Before publish only (`spec.md §8.2`). */}
      {!published && (
        <div>
          <AppButtonLink
            href={`/events/${eventId}/direction?from=${designId}`}
            variant="secondary"
            size="md"
          >
            Try another direction ✦
          </AppButtonLink>
        </div>
      )}
      {designs.length > 1 && (
        <DesignsList
          eventId={eventId}
          designs={designs}
          published={published}
          variant="panel"
          choose={choose}
          onChosen={onChosen}
        />
      )}
    </div>
  );
}
