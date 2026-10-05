"use client";

import { useState } from "react";

import { AppButton } from "@/components/app/AppButton";
import { AppButtonLink } from "@/components/app/AppButtonLink";
import { InlineStatus } from "@/components/app/InlineStatus";

/**
 * The new card's three choices once it has been revealed (`docs/screen-spec.md`
 * `try-another-direction`, "Result"; `spec.md §31` — Try another direction): `Choose this
 * direction` (makes it the active design, design only), `Keep current` (the current card stays
 * active; nothing changes) and `Try another direction ✦` (the box again, for this new card).
 * Until the host chooses, the current card stays active.
 *
 * `choose` and `onChosen` are injected: `DirectionSurface` calls `chooseDesign` and goes to
 * Creation Mode; the development fixture stubs both.
 */

export type ChooseOutcome = { ok: true } | { ok: false; reason: "published" | "not_found" };

export const CHOOSE_ERROR: Record<"published" | "not_found" | "failed", string> = {
  published:
    "Your invitation is published, so its card stays as it is. You can't switch designs now.",
  not_found: "We couldn't find that card. Go back and try again.",
  failed: "We couldn't switch to this card just now. Try again in a moment.",
};

export function NewCardActions({
  eventId,
  designId,
  choose,
  onChosen,
}: {
  eventId: string;
  designId: string;
  choose: () => Promise<ChooseOutcome>;
  onChosen: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChoose() {
    setPending(true);
    setError(null);
    try {
      const result = await choose();
      if (result.ok) {
        // Stay pending: the page is about to change.
        onChosen();
        return;
      }
      setError(CHOOSE_ERROR[result.reason]);
    } catch {
      setError(CHOOSE_ERROR.failed);
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col items-center gap-4" data-direction-actions="">
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <AppButton variant="primary" size="lg" onClick={onChoose} pending={pending}>
          Choose this direction
        </AppButton>
        <AppButtonLink href={`/events/${eventId}`} variant="secondary" size="lg">
          Keep current
        </AppButtonLink>
        <AppButtonLink
          href={`/events/${eventId}/direction?from=${designId}`}
          variant="secondary"
          size="lg"
        >
          Try another direction ✦
        </AppButtonLink>
      </div>
      {error && <InlineStatus variant="danger">{error}</InlineStatus>}
    </div>
  );
}
