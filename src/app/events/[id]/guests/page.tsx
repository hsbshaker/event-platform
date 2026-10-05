import { z } from "zod";

import { loadGuestList } from "@/lib/guests/guests.server";

import { EventUnavailable } from "../EventUnavailable";
import { GuestsWorkspace } from "./GuestsWorkspace";

/**
 * The guest workspace (`docs/screen-spec.md` `guests-workspace`; `spec.md §7.13`, §12, §25
 * "Manage guests / import CSV": owner and co-host, before and after publish, §8.1). Full screen;
 * `Close` returns to Creation Mode.
 *
 * Anyone who may not manage the event's guests, a signed-out visitor and an id that is not an
 * event's see the same plain "isn't available" state as the event page, so it never says whether
 * an event exists (`spec.md §27`). Nothing here is public: RSVP stays invite-only (`spec.md
 * §14.4`).
 */
export default async function GuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return <EventUnavailable />;
  const result = await loadGuestList(id);
  if (!result.ok) return <EventUnavailable />;
  return <GuestsWorkspace eventId={id} initial={result.list} closeHref={`/events/${id}`} />;
}
