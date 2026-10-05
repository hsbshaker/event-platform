"use server";

import { z } from "zod";

import { GenerationDisabledError } from "@/lib/ai/errors";
import { startGeneration } from "@/lib/ai/generations.server";
import { requireEventAccess } from "@/lib/auth/event-access";
import { can } from "@/lib/auth/permissions";
import { chooseCardDesign, type ChooseCardDesignResult } from "@/lib/generation/choose.server";
import { directionFeedback } from "@/lib/generation/direction-feedback";
import { scheduleGeneration } from "@/lib/generation/schedule.server";
import type { StartGenerationOutcome } from "@/lib/supabase/database.types";

/**
 * `Try another direction` and choosing a design (`spec.md §7.7`, §7.11, §7.15, §8.2, §10;
 * `docs/screen-spec.md` `try-another-direction`; `docs/technology-decisions.md §8.1`).
 *
 * The page that invokes `startAnotherDirection` must declare `export const maxDuration = 300`
 * (`GENERATION_MAX_DURATION_SECONDS`), as `src/app/events/[id]/create/page.tsx` does: Server
 * Actions take the timeout of the page that invokes them, and the generation runs after the
 * response within it.
 */

const startSchema = z.strictObject({
  eventId: z.uuid(),
  /** The design the host was looking at when they opened the box. */
  fromDesignId: z.uuid(),
  /** What the host typed; trimmed, and empty is no feedback (a new idea). */
  feedback: z.string().nullish(),
  /** Chosen by the client per user action, so a retry or double tap finds the same generation. */
  idempotencyKey: z.uuid(),
});

export type StartAnotherDirectionInput = z.input<typeof startSchema>;

export interface StartAnotherDirectionResult {
  /**
   * `start_generation`'s outcome (`no_design`: the event has no card yet), `published` when the
   * event is published, or `disabled` while generation is switched off.
   */
  outcome: StartGenerationOutcome | "disabled";
  /** The new or existing generation, or the one in flight; null when refused. */
  generationId: string | null;
}

/**
 * Starts one round of `Try another direction`: the change the host asks for, or a new idea
 * (`spec.md §7.7`). Authorizes the signed-in owner or co-host (`try_another_direction`, before
 * publish only), then begins the generation through `startGeneration` — the generation lock, the
 * daily caps and the idempotency key — and runs it after the response only when this request
 * started it. The feedback is trimmed; an empty box is a new idea; more than
 * `DIRECTION_FEEDBACK_MAX` characters (`direction-feedback.ts`) is refused as invalid input. Event
 * details never change.
 *
 * Throws for invalid input and for a caller who is not the event's owner or a co-host (as
 * `startCardGeneration` does); a design that is not the event's is refused by the database.
 */
export async function startAnotherDirection(
  input: StartAnotherDirectionInput,
): Promise<StartAnotherDirectionResult> {
  const startedAt = Date.now();
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid generation request.");
  const { eventId, fromDesignId, idempotencyKey } = parsed.data;
  const box = directionFeedback(parsed.data.feedback);
  if (!box.ok) throw new Error("Invalid generation request.");

  // A member's request on a published event is answered plainly rather than refused as forbidden
  // (spec.md §8.2); `start_generation` decides again under the event's lock.
  const access = await requireEventAccess(eventId, "view_event");
  if (!can(access.role, "try_another_direction", access.context)) {
    return { outcome: "published", generationId: null };
  }

  let started: Awaited<ReturnType<typeof startGeneration>>;
  try {
    started = await startGeneration({
      eventId,
      kind: "another_direction",
      idempotencyKey,
      fromDesignId,
      ...(box.feedback !== null ? { feedback: box.feedback } : {}),
    });
  } catch (error) {
    // The kill switch is off (`GENERATION_ENABLED`): a plain "paused" state, not a retryable error.
    if (error instanceof GenerationDisabledError)
      return { outcome: "disabled", generationId: null };
    throw error;
  }
  if (started.outcome === "started" && started.generationId) {
    scheduleGeneration({
      generationId: started.generationId,
      eventId,
      userId: started.userId,
      startedAt,
    });
  }
  return { outcome: started.outcome, generationId: started.generationId };
}

const chooseSchema = z.strictObject({ eventId: z.uuid(), designId: z.uuid() });

export type ChooseDesignInput = z.input<typeof chooseSchema>;

/**
 * `{ ok: true }`, or why not: `published` — switching designs ends at publish (§8.2); `not_found` —
 * no such design of this event (or no such event, or not one the caller collaborates on — never
 * distinguished).
 */
export type ChooseDesignResult = ChooseCardDesignResult;

/**
 * Makes a design of the event its active design, in the design's own shape (`spec.md §7.11`,
 * §7.15 step 8): before publish, by the event's owner or a co-host (`choose_design`), changing the
 * design only (`chooseCardDesign`). Choosing the design that is already active changes nothing.
 * Malformed input reads as `not_found`.
 */
export async function chooseDesign(input: ChooseDesignInput): Promise<ChooseDesignResult> {
  const parsed = chooseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "not_found" };
  return chooseCardDesign(parsed.data.eventId, parsed.data.designId);
}
