import "server-only";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requireEventAccess } from "@/lib/auth/event-access";
import { can } from "@/lib/auth/permissions";
import { CARD_SHAPES } from "@/lib/card/shapes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  activeCard,
  carriedWords,
  storeCarriedWords,
  type CarriedWords,
} from "./customization.server";

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
 * The host's words travel with the choice (`spec.md §20.6`; `docs/card-system.md §7`): when the
 * chosen design has no customization in its own shape and the card being switched from (the active
 * design in its active shape) has one, its title, invitation line and added text — with their
 * fonts — are laid out fresh in the chosen design's layout and saved as its customization
 * (`carriedWords`). They are laid out before the switch, so a failure leaves the active design as it
 * was, and stored after it; every earlier customization is kept for switching back.
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
  const admin = createAdminClient();
  const carried = await wordsToCarry(admin, eventId, designId, access.user.id);
  const { data, error } = await admin.rpc("choose_card_design", {
    p_event_id: eventId,
    p_user_id: access.user.id,
    p_design_id: designId,
  });
  if (error) throw error;
  if (data === "chosen") {
    if (carried) await storeCarriedWords(await createClient(), carried);
    return { ok: true };
  }
  if (data === "published" || data === "not_found") return { ok: false, reason: data };
  throw new Error("choose_card_design returned no outcome");
}

/** The words to carry to `designId` in its own shape, from the active card; null for none. */
async function wordsToCarry(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  designId: string,
  userId: string,
): Promise<CarriedWords | null> {
  const from = await activeCard(admin, eventId);
  if (!from || from.designId === designId) return null;
  const { data: design, error } = await admin
    .from("card_designs")
    .select("shape")
    .eq("id", designId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!design || !CARD_SHAPES.includes(design.shape)) return null;
  return carriedWords(admin, {
    eventId,
    userId,
    from,
    to: { designId, shape: design.shape },
    now: new Date(),
  });
}
