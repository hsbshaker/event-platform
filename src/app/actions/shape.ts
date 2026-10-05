"use server";

import { z } from "zod";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { CARD_SHAPES } from "@/lib/card/shapes";
import { scheduleGeneration } from "@/lib/generation/schedule.server";
import {
  loadCardShapeOptions,
  switchActiveCardShape,
  type CardShapeOptions,
  type SwitchCardShapeOutcome,
} from "@/lib/generation/shape.server";

/**
 * The card's shape control (`spec.md §7.14`, §8.1, §8.2, §10; `docs/screen-spec.md` Design panel;
 * `docs/card-system.md §7`).
 *
 * The page that invokes `switchCardShape` must declare `export const maxDuration = 300`
 * (`GENERATION_MAX_DURATION_SECONDS`), as `src/app/events/[id]/create/page.tsx` does: Server
 * Actions take the timeout of the page that invokes them, and a shape switch that needs new
 * artwork runs its generation after the response within it.
 */

const switchSchema = z.strictObject({
  eventId: z.uuid(),
  shape: z.enum(CARD_SHAPES),
  /** Chosen by the client per user action, so a retry or double tap finds the same generation. */
  idempotencyKey: z.uuid(),
});

export type SwitchCardShapeInput = z.input<typeof switchSchema>;

export interface SwitchCardShapeResult {
  /**
   * `switched` — applied now (an existing artwork fits); `started` / `existing` / `in_flight` —
   * new artwork is being made (the current card stays as it is until it is ready), follow
   * `generationId`; `busy` — another card for the event is being made; `published` — the shape needs new artwork and the event is published;
   * `event_cap` / `host_cap` — the daily limits; `disabled` — generation is paused; `no_design` —
   * the event has no card yet; `unsupported_shape` — not a shape the design's layout supports.
   * Every refusal has host copy in `generationFailure` (`src/lib/generation/failure-copy.ts`).
   */
  outcome: SwitchCardShapeOutcome;
  /** The new or existing generation, or the one in flight; null otherwise. */
  generationId: string | null;
}

/**
 * Switches the event's card to `shape` (`switchActiveCardShape`): instantly with no model call when
 * an existing artwork of the active design fits it, before or after publish; otherwise, before
 * publish only, by beginning a `shape_switch` generation, run after the response only when this
 * request started it. Event details never change.
 *
 * Throws for invalid input and for a caller who is not the event's owner or a co-host (as
 * `startAnotherDirection` does).
 */
export async function switchCardShape(input: SwitchCardShapeInput): Promise<SwitchCardShapeResult> {
  const startedAt = Date.now();
  const parsed = switchSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid shape switch request.");
  const { eventId } = parsed.data;

  const result = await switchActiveCardShape(parsed.data);
  if (result.outcome === "started" && result.generationId) {
    scheduleGeneration({
      generationId: result.generationId,
      eventId,
      userId: result.userId,
      startedAt,
    });
  }
  return { outcome: result.outcome, generationId: result.generationId };
}

/**
 * The shape control's options for the event's active design (`loadCardShapeOptions`): the shapes
 * its layout supports, which apply instantly, and which are offered now. Anyone who is not the
 * event's owner or a co-host, an id that is not an event's, and an event with no card yet all read
 * as null, so this never says whether an event exists (`spec.md §27`).
 */
export async function loadCardShapeOptionsAction(
  eventId: string,
): Promise<CardShapeOptions | null> {
  if (!z.uuid().safeParse(eventId).success) return null;
  try {
    return await loadCardShapeOptions(eventId);
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) return null;
    throw error;
  }
}
