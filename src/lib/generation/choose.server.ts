import "server-only";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requireEventAccess } from "@/lib/auth/event-access";
import { can } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Choosing a design (`spec.md §7.11`, §7.14, §7.15 step 8, §8.2; `docs/card-system.md §5`): the
 * design becomes the event's active design, in its own shape. Before publish only, by the event's
 * owner or a co-host (`choose_design`). It changes the design only — never event details, guests,
 * RSVP, registry, privacy or messages. Choosing the design that is already active changes nothing.
 *
 * Authorizes the signed-in session's collaborator (`requireEventAccess`, `view_event`, then the
 * pre-publish capability), then writes through the server-only `choose_card_design`
 * (20261009000000_phase5d_another_direction.sql), which checks membership and publish again under
 * the event's lock, for this event's designs only. A non-member, a signed-out caller and an event
 * that does not exist all read as `not_found`, so this never says whether an event exists
 * (`spec.md §27`).
 *
 * A host's card customization is not carried to the chosen design yet: the card editor that
 * creates customizations does not exist (`spec.md §20.6`).
 */
export type ChooseCardDesignResult =
  { ok: true } | { ok: false; reason: "published" | "not_found" };

export async function chooseCardDesign(
  eventId: string,
  designId: string,
): Promise<ChooseCardDesignResult> {
  let access: Awaited<ReturnType<typeof requireEventAccess>>;
  try {
    access = await requireEventAccess(eventId, "view_event");
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return { ok: false, reason: "not_found" };
    }
    throw error;
  }
  if (!can(access.role, "choose_design", access.context)) return { ok: false, reason: "published" };

  // Authorized above for this event only; the function is service-role only.
  const { data, error } = await createAdminClient().rpc("choose_card_design", {
    p_event_id: eventId,
    p_user_id: access.user.id,
    p_design_id: designId,
  });
  if (error) throw error;
  if (data === "chosen") return { ok: true };
  if (data === "published" || data === "not_found") return { ok: false, reason: data };
  throw new Error("choose_card_design returned no outcome");
}
