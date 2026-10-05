"use server";

import { z } from "zod";

import { GenerationDisabledError } from "@/lib/ai/errors";
import { startGeneration } from "@/lib/ai/generations.server";
import { scheduleGeneration } from "@/lib/generation/schedule.server";
import type { StartGenerationOutcome } from "@/lib/supabase/database.types";

/**
 * Starts the event's first card (`spec.md §7.3`, §7.10; `docs/technology-decisions.md §8.1`,
 * "Generation execution").
 *
 * `startGeneration` authorizes the signed-in owner or co-host itself (`requireEventAccess`) and
 * takes the generation lock, the daily caps and the idempotency key (`start_generation`). Only a
 * generation this request `started` is run, after the response, with `after()`: a repeat of the
 * same key (`existing`), a generation already in flight, a cap, a published event, or an event
 * that already has its first card (`designed`: another card is another direction) runs nothing.
 * The work runs within the invoking page's `maxDuration` (300 s, set on
 * `src/app/events/[id]/create/page.tsx`, the page that calls this action), and the generation's
 * deadline counts from this request's start.
 *
 * Returns the outcome and the generation's id and nothing else; the wait surface reads progress
 * with `getGenerationView` (Phase 5c).
 */

const inputSchema = z.strictObject({
  eventId: z.uuid(),
  /** Chosen by the client per user action, so a retry or double tap finds the same generation. */
  idempotencyKey: z.uuid(),
});

export type StartCardGenerationInput = z.input<typeof inputSchema>;

export interface StartCardGenerationResult {
  /** `start_generation`'s outcome, or `disabled` while generation is switched off. */
  outcome: StartGenerationOutcome | "disabled";
  generationId: string | null;
}

// A "use server" module exports async functions only, so the refusal is a plain error.
export async function startCardGeneration(
  input: StartCardGenerationInput,
): Promise<StartCardGenerationResult> {
  const startedAt = Date.now();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid generation request.");
  const { eventId, idempotencyKey } = parsed.data;

  let started: Awaited<ReturnType<typeof startGeneration>>;
  try {
    started = await startGeneration({ eventId, kind: "initial", idempotencyKey });
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
