import "server-only";

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
 * Callers pass the user id of the authenticated session (`requireUser`), never one taken from
 * the request.
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
  /** The authenticated owner or co-host. */
  userId: string;
  kind: GenerationKind;
  /** Chosen per user action by the client, so a retry or double tap finds the same generation. */
  idempotencyKey: string;
}

export interface StartGenerationResult {
  outcome: StartGenerationOutcome;
  /** The new or existing generation, or the one in flight; null when a cap refused. */
  generationId: string | null;
}

const keyHash = (key: string) => `\\x${hashRateLimitKey(key).toString("hex")}`;

export async function startGeneration(input: StartGenerationInput): Promise<StartGenerationResult> {
  const config = generationEnv();
  // Refused before anything is consumed: with the kill switch off no generation starts.
  if (!config.enabled) throw new GenerationDisabledError();
  const { data, error } = await createAdminClient().rpc("start_generation", {
    p_event_id: input.eventId,
    p_user_id: input.userId,
    p_kind: input.kind,
    p_idempotency_key: input.idempotencyKey,
    // The same HMAC keying as every other rate limit (`hashRateLimitKey`); the bucket names
    // (`generation:event`, `generation:host`) are set by the function.
    p_event_key_hash: keyHash(`event:${input.eventId}`),
    p_host_key_hash: keyHash(`user:${input.userId}`),
    p_event_cap: config.eventDailyCap,
    p_host_cap: config.hostDailyCap,
    p_stale_seconds: GENERATION_STALE_SECONDS,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("start_generation returned no outcome");
  return { outcome: row.outcome, generationId: row.generation_id };
}
