"use server";

import { z } from "zod";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { loadRevealedCard, type RevealedCard } from "@/lib/generation/reveal.server";

/**
 * The event's revealed card for the envelope's tap (`docs/screen-spec.md` `card-reveal`): read
 * when the host opens the envelope, so the artwork's short-lived signed URL is fresh when the card
 * is shown. `loadRevealedCard` authorizes `view_event` itself; anyone who is not the event's owner
 * or a co-host, an id that is not an event's, and an event with no card yet all read as null, so
 * this never says whether an event exists (`spec.md §27`).
 */
export async function loadRevealedCardAction(eventId: string): Promise<RevealedCard | null> {
  if (!z.uuid().safeParse(eventId).success) return null;
  try {
    return await loadRevealedCard(eventId);
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) return null;
    throw error;
  }
}
