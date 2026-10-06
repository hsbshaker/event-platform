"use client";

import { useState, type FormEvent } from "react";

import { AppButton } from "@/components/app/AppButton";
import { AppButtonLink } from "@/components/app/AppButtonLink";
import { Field } from "@/components/app/Field";
import { Textarea } from "@/components/app/Textarea";
import { InvitationCard } from "@/components/card/InvitationCard";
import { DIRECTION_FEEDBACK_MAX, directionFeedback } from "@/lib/generation/direction-feedback";
import type { RevealedCard } from "@/lib/generation/reveal.server";

/**
 * The `Try another direction` box (`docs/screen-spec.md` `try-another-direction`; `spec.md §7.7`,
 * §7.15): the card being changed, small, above one optional box — a change keeps the card and
 * changes that; empty is a new idea; the host never picks a mode. No character counter and no
 * credits (`spec.md §10`); a message too long is refused plainly on submit. The reassurance that
 * event details do not change is always on screen.
 *
 * Optional inspiration (`spec.md §7.15`) is deferred: there is no upload here yet.
 *
 * Presentational: `DirectionSurface` starts the generation; the development fixture renders the
 * same component with fixture data.
 */

/** The card being changed, small: fractions of the app's narrow width token, as the other card sizes. */
const PREVIEW_WIDTH = {
  "5:7": "min(100%, calc(var(--width-narrow) * 0.27))",
  "1:1": "min(100%, calc(var(--width-narrow) * 0.31))",
} as const;

export function DirectionBox({
  card,
  initialFeedback = "",
  pending,
  backHref,
  onSubmit,
}: {
  /** The card being changed. */
  card: RevealedCard["card"];
  initialFeedback?: string;
  pending: boolean;
  /** Back to the card, without making a new one. */
  backHref: string;
  /** The host's words, trimmed (null for an empty box: a new idea). */
  onSubmit: (feedback: string | null) => void;
}) {
  const [value, setValue] = useState(initialFeedback);
  const [error, setError] = useState<string | null>(null);
  const proportion = card.artwork.proportion;

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = directionFeedback(value);
    if (!parsed.ok) {
      setError(
        `That's a little long. Please keep it to ${DIRECTION_FEEDBACK_MAX} characters or fewer.`,
      );
      return;
    }
    setError(null);
    onSubmit(parsed.feedback);
  }

  return (
    <main className="mx-auto flex w-full max-w-(--width-narrow) flex-1 flex-col items-center gap-8 px-4 py-10 lg:py-14">
      <div
        data-direction-current=""
        className="w-full"
        style={{
          maxWidth: PREVIEW_WIDTH[proportion],
          aspectRatio: proportion === "5:7" ? "5 / 7" : "1 / 1",
        }}
      >
        <InvitationCard
          shape={card.shape}
          artwork={card.artwork}
          panels={card.panels}
          placement={card.placement}
          boxes={card.boxes}
        />
      </div>
      <form onSubmit={submit} noValidate className="flex w-full flex-col gap-6">
        <h1 className="text-center text-heading-xl text-app-text">What should we change?</h1>
        <Field
          id="direction-feedback"
          label="Your change (optional)"
          hint="Say what to change, or leave it empty for a new idea."
          error={error ?? undefined}
        >
          {(control) => (
            <Textarea
              {...control}
              name="feedback"
              rows={4}
              value={value}
              disabled={pending}
              onChange={(event) => {
                setValue(event.target.value);
                if (error) setError(null);
              }}
            />
          )}
        </Field>
        <p className="text-body-md text-app-text-secondary">
          <strong className="font-medium text-app-text">
            Your event details stay exactly as they are.
          </strong>
        </p>
        <div className="flex flex-col items-center gap-3">
          <AppButton type="submit" variant="primary" size="lg" pending={pending} disabled={pending}>
            Make a new card
          </AppButton>
          <AppButtonLink href={backHref} variant="ghost" size="md">
            Back to your card
          </AppButtonLink>
        </div>
      </form>
    </main>
  );
}
