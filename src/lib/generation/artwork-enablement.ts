import "server-only";

import { createOpenAiArtworkProvider } from "@/lib/ai/openai/artwork";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArtworkBatchBudget } from "@/lib/ai/visual-art/spend";

import { ArtworkAttemptBudget, type ArtworkStageDeps } from "./artwork-stage";
import { supabaseArtworkStore } from "./artwork-store";

/**
 * Where a batch's artwork dependencies are assembled, on purpose and in the open.
 *
 * **This file is deliberately not under `src/lib/ai/visual-art/`.** That directory states four
 * structural guarantees in `enablement.ts` and proves them with scans in `boundary.test.ts`:
 * nothing under it reads `process.env`, nothing under it can reach a network transitively,
 * `generateVisualArt` takes its provider by injection, and `getArtworkProvider()` throws
 * unconditionally on every runtime. Putting a live provider construction there would break the
 * second and fourth at once and silently invalidate the scans. Every one of those guarantees is
 * untouched by this module: it *imports* that directory, is never imported back, and
 * `getArtworkProvider()` still cannot hand out anything but the offline stub.
 *
 * What this module is, then, is the explicit construction the guarantee always pointed at — "a
 * call site somebody wrote on purpose". It is the only place in production code that can produce
 * live `ArtworkStageDeps`, and it produces `null` unless the caller states, in an argument it had
 * to pass, that a live run is authorized.
 *
 * # The pinned model is not a provider selection
 *
 * `docs/technology-decisions.md §8` records the image-model decision as **open**, and
 * `docs/product-doctrine.md §10` explains why it waits for measurement rather than being settled
 * by a prompt. `ARTWORK_MODEL` below is an exact, dated id used by one authorized Phase 4
 * capability spike; it is an empirical implementation choice for that work and it selects nothing.
 * Changing it is an edit to this file, in a diff, with a review — never a deployment setting,
 * which is the same rule `visual-art/enablement.ts` applies to reaching a provider at all.
 *
 * An undated alias is refused by `createOpenAiArtworkProvider` and would be refused here anyway:
 * an alias moves, and an asset whose model cannot be named is not evidence about any model.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`. Guardrails:
 * `spec.md §32 #41`; `CLAUDE.md §3` (the stack is locked, and this changes none of it).
 */

/**
 * The exact, dated image model this build would call if a live run were authorized.
 *
 * Matches `ARTWORK_MODEL_RATES` in `@/lib/ai/openai/artwork-pricing`, which is what turns reported
 * usage into a cost estimate — a model with no recorded rate reports `null` cost, and a spend
 * record that cannot be priced is not a spend control.
 */
export const ARTWORK_MODEL = "gpt-image-2.5-sunburst-2026-09-08" as const;

export interface AuthorizedArtworkRequest {
  /**
   * Explicit authorization for this batch to reach an image provider.
   *
   * A discriminant rather than a boolean field beside optional budgets, so the two states are not
   * expressible together: an authorized request **must** carry its ceilings, and an unauthorized
   * one cannot carry them at all. Not a flag read from the environment and never defaulted —
   * `ARTWORK_ENABLED=1` in the wrong place is precisely the silent loss
   * `visual-art/enablement.ts` refuses, and this is the same refusal one level up.
   */
  readonly authorized: true;

  /** The batch whose spend this is. Attributable, so `ArtworkBatchBudget` requires a non-empty id. */
  readonly batchId: string;

  /**
   * The ceiling for this **whole batch**, in USD, and the worst case for one request.
   *
   * Both passed in by the caller and neither defaulted here, for `ArtworkBatchBudget.open`'s own
   * reason: a spend ceiling with a default is a ceiling nobody chose. A per-request estimate must
   * describe the worst case *including retries*, because it is what a reservation debits.
   */
  readonly batchCeilingUsd: number;
  readonly perRequestEstimateUsd: number;

  /**
   * A hard count of provider requests for this batch, independent of money.
   *
   * Separate from the ceiling because the two bound different failure modes: a provider that
   * errors for free, or reports no cost, passes a spend gate indefinitely.
   */
  readonly maxAttempts: number;

  /** How many slots of one concept may be in flight. Optional; the stage has its own bound. */
  readonly concurrency?: number;
}

/** What every caller in this repository passes today. It carries no budget because it buys nothing. */
export interface UnauthorizedArtworkRequest {
  readonly authorized: false;
}

export type ArtworkEnablementRequest = AuthorizedArtworkRequest | UnauthorizedArtworkRequest;

/**
 * The artwork dependencies for one batch, or `null` — which is every caller today.
 *
 * `null` is a complete, correct answer and not a degraded one: `spec.md §7.6a #1` makes imagery
 * optional, the compiler reserves its slots from already-verified geometry, and a concept whose
 * reservations are never filled renders from the same frozen spec. Nothing about a page's
 * readiness depends on this returning anything.
 *
 * The store is Supabase Storage, which `docs/technology-decisions.md` already fixes — no new
 * infrastructure is introduced here.
 */
export function artworkStageDepsForBatch(
  admin: SupabaseClient<Database>,
  request: ArtworkEnablementRequest,
): ArtworkStageDeps | null {
  if (request.authorized !== true) return null;

  return {
    provider: createOpenAiArtworkProvider({ model: ARTWORK_MODEL }),
    budget: ArtworkBatchBudget.open({
      id: request.batchId,
      batchCeilingUsd: request.batchCeilingUsd,
      perRequestEstimateUsd: request.perRequestEstimateUsd,
    }),
    attempts: new ArtworkAttemptBudget(request.maxAttempts),
    store: supabaseArtworkStore(admin),
    ...(request.concurrency !== undefined ? { concurrency: request.concurrency } : {}),
  };
}
