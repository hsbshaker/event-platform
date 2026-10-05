import { redirect } from "next/navigation";
import { z } from "zod";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { loadRevealedCard, type RevealedCard } from "@/lib/generation/reveal.server";
import { EventUnavailable } from "../EventUnavailable";
import { DirectionSurface } from "./DirectionSurface";

/**
 * `Try another direction` (`docs/screen-spec.md` `try-another-direction`; `spec.md §7.7`, §7.15):
 * the box for the card named by `?from=<designId>`, the wait for the new card and its reveal.
 * Owner and co-host only. Anyone else, an id that is not an event's, and a `from` that is not one
 * of this event's designs all see the same plain "isn't available" state as the other event pages,
 * so it never says whether an event or a design exists (`spec.md §27`).
 *
 * `startAnotherDirection` runs the generation after its response, within this page's `maxDuration`
 * (Server Actions take the timeout of the page that invokes them): 300 s is
 * `GENERATION_MAX_DURATION_SECONDS`, as on the create page; a literal, because route segment config
 * is read statically.
 */
export const maxDuration = 300;

export default async function DirectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const from = Array.isArray(query.from) ? query.from[0] : query.from;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(from).success) {
    return <EventUnavailable />;
  }

  let current: RevealedCard | null;
  try {
    current = await loadRevealedCard(id, { designId: from });
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return <EventUnavailable />;
    }
    throw error;
  }
  if (!current || !from) return <EventUnavailable />;
  // After publish there is no new design (`spec.md §8.2`): back to the invitation.
  if (current.published) redirect(`/events/${id}`);

  // Remounted for each card the host tries to change: a new `from` is a new box.
  return <DirectionSurface key={from} eventId={id} from={from} current={current.card} />;
}
