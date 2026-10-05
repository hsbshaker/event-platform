import "server-only";

import { GenerationDisabledError } from "@/lib/ai/errors";
import { startGeneration } from "@/lib/ai/generations.server";
import { requireEventAccess } from "@/lib/auth/event-access";
import { CARD_LAYOUT_IDS, layoutSupportsShape } from "@/lib/card/layouts";
import type { CardLayoutId } from "@/lib/card/layouts";
import { CARD_SHAPES } from "@/lib/card/shapes";
import type { CardShape } from "@/lib/card/shapes";
import { createAdminClient } from "@/lib/supabase/admin";

import { readSwitchingDesign } from "./switching-design";

/**
 * The card's shape control, server side (`spec.md §7.14`, §8.1, §8.2, §10, §20.5;
 * `docs/card-system.md §2.1`, §2.3, §2.4, §5 and the step table of §7).
 *
 * A switch is for the event's active design, by its owner or a co-host (`use_design_controls`,
 * before and after publish), to a shape the design's layout supports (`layoutSupportsShape`):
 *
 * - **Instant** — an artwork of the design already fits the shape: `switch_card_shape` sets
 *   `events.active_card_shape`, with no model call and no limit consumed. Allowed after publish too
 *   (§8.1): it only ever shows an artwork that exists.
 * - **New artwork** — no artwork of the design fits it: before publish only (§8.2), a generation of
 *   kind `shape_switch` begins through `startGeneration` (the generation lock, the daily caps, the
 *   idempotency key), naming the design and the shape; the caller runs it after the response. The
 *   current card stays as it is until the new artwork is ready (`run.server.ts`, "Shape switch").
 *
 * Every write goes through a server-only function that checks the member and the active design
 * again under the event's lock. When the active design changed between the read here and that
 * lock (another collaborator chose a design), or the artwork appeared meanwhile, the decision is
 * made again from a fresh read, a bounded number of times.
 *
 * Changes the shape only: never the design, its artwork, event details, guests, RSVP, registry,
 * privacy or messages (`spec.md §20.6`). A host's card customization is not carried yet: the card
 * editor that creates customizations does not exist (`spec.md §20.6`).
 */

export type SwitchCardShapeOutcome =
  /** Applied instantly: an existing artwork of the design fits the shape. */
  | "switched"
  /**
   * A generation of new artwork for the shape began, or this key's, or the same switch, is running.
   */
  | "started"
  | "existing"
  | "in_flight"
  /** Another card for the event is being made (`spec.md §10`): one at a time. */
  | "busy"
  /** The shape needs new artwork and the event is published (§8.2). */
  | "published"
  | "event_cap"
  | "host_cap"
  /** Generation is switched off (`GENERATION_ENABLED`) and the shape needs new artwork. */
  | "disabled"
  /** The event has no card yet. */
  | "no_design"
  /**
   * The design's layout does not support the shape, or the shape needs new artwork and the design
   * predates what its painting needs; the shape control never offers either.
   */
  | "unsupported_shape";

export interface SwitchCardShapeResult {
  outcome: SwitchCardShapeOutcome;
  /** The new or existing generation, or the one in flight; null otherwise. */
  generationId: string | null;
  /** The signed-in owner or co-host, for running a generation this call `started`. */
  userId: string;
}

/** Reads and decisions before giving up on a card that keeps changing under the switch. */
export const SWITCH_ATTEMPTS = 3;

type AdminClient = ReturnType<typeof createAdminClient>;

interface ActiveDesign {
  id: string;
  shape: CardShape;
  layout: CardLayoutId;
  activeShape: CardShape | null;
  /**
   * Whether new artwork can be painted from the design's brief (`readSwitchingDesign`): false for a
   * design from before rendering families, which keeps only the shapes its artwork already fits.
   */
  paintable: boolean;
}

/** The event's active design and the layout its shape options come from; null with none. */
async function activeDesign(admin: AdminClient, eventId: string): Promise<ActiveDesign | null> {
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("active_card_design_id, active_card_shape")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event?.active_card_design_id) return null;
  const { data: design, error } = await admin
    .from("card_designs")
    .select("id, shape, layout, art_mode, typography, wording, art_brief")
    .eq("id", event.active_card_design_id)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!design || !CARD_LAYOUT_IDS.includes(design.layout) || !CARD_SHAPES.includes(design.shape)) {
    throw new Error("The event's active card design cannot be read.");
  }
  return {
    id: design.id,
    shape: design.shape,
    layout: design.layout,
    activeShape: event.active_card_shape,
    paintable: readSwitchingDesign(design) !== null,
  };
}

/**
 * Switches the active design to `shape`, instantly or by beginning a generation (see above).
 * Throws `UnauthorizedError` / `ForbiddenError` for a caller who is not the event's owner or a
 * co-host, before reading anything.
 */
export async function switchActiveCardShape(input: {
  eventId: string;
  shape: CardShape;
  /** Chosen by the client per user action, so a retry or double tap finds the same generation. */
  idempotencyKey: string;
}): Promise<SwitchCardShapeResult> {
  const { eventId, shape, idempotencyKey } = input;
  const access = await requireEventAccess(eventId, "use_design_controls");
  const userId = access.user.id;
  const result = (outcome: SwitchCardShapeOutcome, generationId: string | null = null) => ({
    outcome,
    generationId,
    userId,
  });
  // Authorized above for this event only; the functions are service-role only.
  const admin = createAdminClient();

  for (let attempt = 0; attempt < SWITCH_ATTEMPTS; attempt += 1) {
    const design = await activeDesign(admin, eventId);
    if (!design) return result("no_design");
    if (!layoutSupportsShape(design.layout, shape)) return result("unsupported_shape");

    const { data: switched, error } = await admin.rpc("switch_card_shape", {
      p_event_id: eventId,
      p_user_id: userId,
      p_design_id: design.id,
      p_shape: shape,
    });
    if (error) throw error;
    if (switched === "switched") return result("switched");
    if (switched === "no_design") return result("no_design");
    if (switched === "not_active") continue;
    if (switched !== "needs_artwork") {
      throw new Error(`switch_card_shape answered ${String(switched)}`);
    }

    // New artwork: before publish only, and only from a brief it can be painted from (the shape
    // control never offers it otherwise). start_generation decides again under the event's lock.
    if (access.context.published) return result("published");
    if (!design.paintable) return result("unsupported_shape");
    let started: Awaited<ReturnType<typeof startGeneration>>;
    try {
      started = await startGeneration({
        eventId,
        kind: "shape_switch",
        idempotencyKey,
        fromDesignId: design.id,
        shape,
      });
    } catch (startError) {
      // The kill switch is off: a plain "paused" state, not a retryable error.
      if (startError instanceof GenerationDisabledError) return result("disabled");
      throw startError;
    }
    const outcome = started.outcome;
    switch (outcome) {
      case "not_active":
      case "fitted":
        // Chosen or painted meanwhile: decide again from a fresh read.
        continue;
      case "started":
      case "existing":
      case "in_flight":
      case "busy":
      case "published":
      case "event_cap":
      case "host_cap":
      case "no_design":
        return result(outcome, started.generationId);
      case "designed":
        throw new Error("start_generation answered designed for a shape switch");
    }
  }
  throw new Error("The card kept changing while its shape was being switched.");
}

export interface CardShapeOption {
  shape: CardShape;
  /** An existing artwork of the design fits it: switching is instant, with no model call. */
  instant: boolean;
  /**
   * Offered now: instant, or new artwork before publish (`spec.md §8.1`, §8.2) from a brief it can
   * be painted from.
   */
  available: boolean;
}

export interface CardShapeOptions {
  designId: string;
  /** The shape the card is shown in now. */
  current: CardShape;
  /** The shapes the design's layout supports, in the catalog's order (`CARD_SHAPES`). */
  options: CardShapeOption[];
}

/**
 * The shape control's options (`spec.md §7.14`, §31 Creation Mode "Design controls expose only …
 * the shapes the design's layout supports"): for the event's active design, each shape its layout
 * supports, whether an existing artwork fits it, and whether it is offered now. For the event's
 * owner or a co-host (`use_design_controls`); throws `UnauthorizedError` / `ForbiddenError`
 * otherwise, before reading anything. Null when the event has no card yet.
 */
export async function loadCardShapeOptions(eventId: string): Promise<CardShapeOptions | null> {
  const access = await requireEventAccess(eventId, "use_design_controls");
  // Read after the access check above, for this event only.
  const admin = createAdminClient();
  const design = await activeDesign(admin, eventId);
  if (!design) return null;
  const { data: art, error } = await admin
    .from("card_art_assets")
    .select("fits_shapes")
    .eq("card_design_id", design.id)
    .eq("event_id", eventId);
  if (error) throw error;
  const fitted = new Set<string>((art ?? []).flatMap((a) => a.fits_shapes));
  return {
    designId: design.id,
    current: design.activeShape ?? design.shape,
    options: CARD_SHAPES.filter((shape) => layoutSupportsShape(design.layout, shape)).map(
      (shape) => {
        const instant = fitted.has(shape);
        const paintable = design.paintable && !access.context.published;
        return { shape, instant, available: instant || paintable };
      },
    ),
  };
}
