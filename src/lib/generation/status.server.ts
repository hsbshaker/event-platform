import "server-only";

import { GENERATION_STALE_SECONDS } from "@/lib/ai/generations.server";
import { requireEventAccess } from "@/lib/auth/event-access";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GenerationKind, GenerationStatus, Json } from "@/lib/supabase/database.types";

/**
 * What the wait surface reads about an event's generation (`spec.md §7.10`; Phase 5c draws it).
 *
 * The latest generation of the event, for a signed-in owner or co-host (`view_event`). Only what
 * the host may see: its kind and status, the last stage that resolved, the stage results it
 * recorded (`artifacts`: the identity's creative signals, the extracted facts to confirm, the
 * design's name, description and art direction, a refusal notice), the failure code and the
 * design it produced. Never raw model output, telemetry or cost (`spec.md §32 #42`).
 *
 * **A stopped worker reads as failed, not as a long wait** (`docs/technology-decisions.md §8.1`,
 * "Generation execution"; `spec.md §32 #46`): no worker outlives the function's `maxDuration`,
 * so a generation still `running` more than `GENERATION_STALE_SECONDS` after it started is dead.
 * It reads as `failed` with `errorCode` `stopped`, and the host is offered the retry; the next
 * start takes it over as stale.
 */

export interface GenerationView {
  id: string;
  kind: GenerationKind;
  status: GenerationStatus;
  /** The last stage that resolved (`identity`, `design`, `done`), or null before the first. */
  stage: string | null;
  artifacts: GenerationArtifacts;
  errorCode: string | null;
  cardDesignId: string | null;
  startedAt: string;
}

/** The stage results the host may see, by the keys the orchestration records. */
export interface GenerationArtifacts {
  identity?: Json;
  facts?: Json;
  design?: Json;
  notice?: Json;
}

const VISIBLE_ARTIFACTS = ["identity", "facts", "design", "notice"] as const;

function visibleArtifacts(artifacts: Json): GenerationArtifacts {
  if (!artifacts || typeof artifacts !== "object" || Array.isArray(artifacts)) return {};
  const out: GenerationArtifacts = {};
  for (const key of VISIBLE_ARTIFACTS) {
    const value = artifacts[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export async function getGenerationView(
  eventId: string,
  options: { now?: () => number } = {},
): Promise<GenerationView | null> {
  await requireEventAccess(eventId, "view_event");
  // `generations` is server-only (no end-user grant); read after the access check above.
  const { data, error } = await createAdminClient()
    .from("generations")
    .select("id, kind, status, stage, artifacts, error_code, card_design_id, started_at")
    .eq("event_id", eventId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const now = options.now?.() ?? Date.now();
  const startedAt = Date.parse(data.started_at);
  const dead =
    data.status === "running" &&
    (!Number.isFinite(startedAt) || now - startedAt > GENERATION_STALE_SECONDS * 1000);

  return {
    id: data.id,
    kind: data.kind,
    status: dead ? "failed" : data.status,
    stage: data.stage,
    artifacts: visibleArtifacts(data.artifacts),
    errorCode: dead ? "stopped" : data.error_code,
    cardDesignId: data.card_design_id,
    startedAt: data.started_at,
  };
}
