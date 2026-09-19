"use server";

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  readConceptGeneration,
  startConceptGeneration,
} from "@/lib/generation/generation-orchestrator";
import { GENERATION_UNAVAILABLE, type GenerationView } from "@/lib/generation/generation-view";

/**
 * Phase 4F's server boundary: start, poll, and the first paint. Nothing else.
 *
 * Mirrors `event-identity.ts` deliberately, down to the shape of `guarded`. There is no
 * orchestration here: no cap is consulted, no batch is planned, no provider is constructed and no
 * projection is performed. Those all live one layer down, and a second place deciding whether a
 * batch may start is a second opinion about whether money may be spent.
 *
 * Every entry point authorizes. These are exported server actions, so "the page already checked"
 * is not a boundary — anyone signed in can call one with any event id.
 *
 * Acceptance criteria: `spec.md §31 — Prompt, auth, and generation` — "Each concept becomes
 * available as soon as its resolved spec exists; no concept waits on its siblings (§7.10)" and
 * "The generation surface shows only artifacts the pipeline produced — no model reasoning, no
 * fabricated progress or completion percentages (§7.10)". Guardrails: `spec.md §32 #41`.
 */

/**
 * The one place a server fault becomes something a host can read.
 *
 * `GENERATION_UNAVAILABLE` carries no reason, and its `concepts: []` means *unknown*, not *none* —
 * the surface keeps what it already had rather than replacing a page of real concepts because one
 * poll failed. The diagnosis stays server-side in `console.error`, where an operator can see it;
 * telling a host which control refused would expose exactly the backend counters `spec.md §32 #41`
 * forbids.
 *
 * `UnauthorizedError` and `ForbiddenError` are rethrown rather than flattened into this payload:
 * they are the framework's to handle, and turning a permission failure into "temporarily
 * unavailable" would invite a signed-out or non-member caller to keep retrying.
 */
async function guarded(run: () => Promise<GenerationView>): Promise<GenerationView> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) throw error;
    console.error("concept generation: unexpected failure", error);
    return GENERATION_UNAVAILABLE;
  }
}

/**
 * Start a batch for this event, or observe the one already running.
 *
 * Returns the state as it stands; the work is scheduled after the response and reports itself
 * through the rows it writes. Safe to call twice — the database refuses the second batch.
 */
export async function startConceptGenerationForEvent(eventId: string): Promise<GenerationView> {
  return guarded(() => startConceptGeneration(createAdminClient(), eventId));
}

/** The poll. Recovers a dead batch, never spends. */
export async function readGenerationForEvent(eventId: string): Promise<GenerationView> {
  return guarded(() => readConceptGeneration(createAdminClient(), eventId));
}

/**
 * Server-rendered first paint: the state as it stands, with no side effect beyond recovery.
 *
 * `null` rather than a payload when the caller may not see this event, so a page can render
 * nothing at all instead of an empty generation surface for an event that is not theirs.
 */
export async function loadGenerationView(eventId: string): Promise<GenerationView | null> {
  try {
    return await readConceptGeneration(createAdminClient(), eventId);
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) return null;
    console.error("concept generation: could not read initial state", error);
    return GENERATION_UNAVAILABLE;
  }
}
