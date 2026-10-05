import { z } from "zod";
import { loadEventDraft } from "@/app/actions/event-details";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { loadRevealedCard, type RevealedCard } from "@/lib/generation/reveal.server";
import { getGenerationView } from "@/lib/generation/status.server";
import { initialWait, readWaitGeneration, withHostCopy } from "@/lib/generation/wait-view";
import { EventUnavailable } from "../EventUnavailable";
import { GenerationSurface } from "./GenerationSurface";

/**
 * Generation + required details (spec.md §7.3/§7.10, docs/design-system.md §4.3,
 * docs/screen-spec.md `generation`, e2e H03).
 *
 * No wizard, no stepper, no percent-complete gate: a flat autosaving form next to the real
 * artifacts of the generation (`GenerationSurface`), which ends in the card's reveal. The server
 * reads the draft, whether the event has a card and its latest generation, so the client starts a
 * generation only when none has begun. A missing or inaccessible event renders a plain,
 * non-leaking state rather than distinguishing "does not exist" from "not yours" (spec.md §27).
 */

/**
 * The card generation runs after `startCardGeneration`'s response, with `after()`, within this
 * page's `maxDuration`: Server Actions take the timeout of the page that invokes them (Next.js
 * `maxDuration` docs). 300 s is `GENERATION_MAX_DURATION_SECONDS`; the generation's deadline
 * (`GENERATION_DEADLINE_MS`, 285 s) sits below it (`docs/technology-decisions.md §8.1`). A literal,
 * because route segment config is read statically; a unit test holds the two equal.
 */
export const maxDuration = 300;

export default async function CreateEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // An id that is not a UUID is not an event's: the same plain state, never a lookup.
  if (!z.uuid().safeParse(id).success) return <EventUnavailable />;

  let draft;
  try {
    draft = await loadEventDraft(id);
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      draft = null;
    } else {
      throw error;
    }
  }

  if (!draft) return <EventUnavailable />;

  // Only the card's title and proportion go to the client: the card itself is read when the
  // envelope is opened, so its artwork's signed URL is fresh then.
  // A stored card the loader cannot draw is not a reason to lose the details form: the surface
  // goes to the reveal, whose read fails into its retryable "couldn't open" state.
  let revealed: RevealedCard | null = null;
  let unreadable = false;
  try {
    revealed = await loadRevealedCard(id);
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return <EventUnavailable />;
    }
    console.error("[reveal] the event's card could not be read", {
      eventId: id,
      error: error instanceof Error ? error.name : typeof error,
    });
    unreadable = true;
  }
  const view = revealed || unreadable ? null : await getGenerationView(id);
  const initial = initialWait(
    revealed !== null || unreadable,
    readWaitGeneration(view ? withHostCopy(view) : null),
  );

  return (
    <GenerationSurface
      eventId={id}
      draft={draft}
      initial={initial}
      head={
        revealed ? { title: revealed.title, proportion: revealed.card.artwork.proportion } : null
      }
    />
  );
}
