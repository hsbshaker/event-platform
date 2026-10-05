import "server-only";

import { requireEventAccess } from "@/lib/auth/event-access";
import { hashRateLimitKey } from "@/lib/auth/rate-limit";
import { generationEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GenerationKind, StartGenerationOutcome } from "@/lib/supabase/database.types";

import { GenerationDisabledError } from "./errors";

/**
 * The generation lock and the daily caps (`spec.md §10`), in front of every generation.
 *
 * `startGeneration` is the only way a generation begins, and a model call is metered only for a
 * running generation (`meter.server.ts`), so every model call sits behind: one generation in flight
 * per event, idempotency per user action, the event's daily cap shared by its collaborators, and
 * the acting host's own daily cap. The work is done atomically by `public.start_generation`
 * (supabase/migrations/20261005000000_phase5_spend_controls.sql), which also refuses a user who is
 * not the event's owner or a co-host.
 *
 * The acting user is the signed-in session's, resolved here (`requireEventAccess`), never an id
 * a caller passes: a caller cannot attribute a generation, or spend a host's daily cap, as anyone
 * else.
 */

/**
 * The generation work runs after the response, in `after()`, within the route's `maxDuration`
 * (`docs/technology-decisions.md §8.1`, "Generation execution"). No worker outlives it.
 */
export const GENERATION_MAX_DURATION_SECONDS = 300;

/**
 * A running generation whose heartbeat (bumped by every metered call) is older than this is dead:
 * its function has been stopped, since no invocation lives past `maxDuration`. The margin covers
 * clock skew between the function and the database.
 */
export const GENERATION_STALE_SECONDS = GENERATION_MAX_DURATION_SECONDS + 30;

export interface StartGenerationInput {
  eventId: string;
  kind: GenerationKind;
  /** Chosen per user action by the client, so a retry or double tap finds the same generation. */
  idempotencyKey: string;
  /**
   * Another direction only: the host's words, already trimmed and bounded by the caller (the
   * function trims again and refuses more than 500 characters). Absent for an empty box.
   */
  feedback?: string;
  /** Another direction only, and required there: the design the host was looking at. */
  fromDesignId?: string;
}

export interface StartGenerationResult {
  outcome: StartGenerationOutcome;
  /** The signed-in owner or co-host who started it (for the meter context). */
  userId: string;
  /**
   * The new or existing generation, or the one in flight; null when refused (`published`,
   * `designed`, `no_design`, a cap).
   */
  generationId: string | null;
}

const keyHash = (key: string) => `\\x${hashRateLimitKey(key).toString("hex")}`;

export async function startGeneration(input: StartGenerationInput): Promise<StartGenerationResult> {
  const config = generationEnv();
  // Refused before anything is consumed: with the kill switch off no generation starts.
  if (!config.enabled) throw new GenerationDisabledError();
  // The session's own collaborator on this event, before the published check in SQL as well.
  const { user } = await requireEventAccess(input.eventId, "try_another_direction");
  const userId = user.id;
  const { data, error } = await createAdminClient().rpc("start_generation", {
    p_event_id: input.eventId,
    p_user_id: userId,
    p_kind: input.kind,
    p_idempotency_key: input.idempotencyKey,
    // The same HMAC keying as every other rate limit (`hashRateLimitKey`); the bucket names
    // (`generation:event`, `generation:host`) are set by the function.
    p_event_key_hash: keyHash(`event:${input.eventId}`),
    p_host_key_hash: keyHash(`user:${userId}`),
    p_event_cap: config.eventDailyCap,
    p_host_cap: config.hostDailyCap,
    p_stale_seconds: GENERATION_STALE_SECONDS,
    ...(input.feedback !== undefined ? { p_feedback: input.feedback } : {}),
    ...(input.fromDesignId !== undefined ? { p_from_design_id: input.fromDesignId } : {}),
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("start_generation returned no outcome");
  return { outcome: row.outcome, generationId: row.generation_id, userId };
}
