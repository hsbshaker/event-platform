import "server-only";

/**
 * The artwork lifecycle for one concept: reserve, brief, generate, validate, store, attach.
 *
 * This is production orchestration, not a smoke script. Everything downstream of a verified spec
 * happens here — a smoke harness supplies a provider, a budget and a store and then watches, and
 * so does an eventual route handler. The alternative, a lifecycle that lives only in the script
 * that first exercised it, is how a proven path turns out never to have shipped.
 *
 * # Where this sits, and what it may not do
 *
 * ```text
 * Composition decides WHERE artwork can exist   (the model, in the tree)
 * compiler resolves the trusted reservation     (@/lib/renderer/compile/artwork)
 * VisualArtIntent says WHAT belongs there       (@/lib/ai/visual-art/assemble)
 * the image provider produces the asset         (@/lib/ai/openai/artwork)
 * ── this module ── carries bytes between them
 * the renderer owns realization                 (@/components/event-renderer)
 * ```
 *
 * The spec is already compiled, geometry-verified and **frozen** when this runs. Nothing here may
 * change it: an asset attaches to a reserved box or it does not, and either way the page measures
 * the same. That is why there is no re-verification step below and why its absence is correct
 * rather than an omission.
 *
 * # Three independent bounds, and why spend is not enough on its own
 *
 * A batch ceiling bounds money. It does not bound *requests* — a provider that fails cheaply, or
 * reports no cost at all, can be asked many times inside one ceiling. So the caller also supplies
 * an attempt budget, and both are checked before a provider is reachable. The third bound is the
 * compiler's: a concept has as many slots as its direction's artwork budget admitted, and this
 * module never invents one.
 *
 * # Failure is ordinary
 *
 * A slot that cannot be filled is recorded as failed and the concept renders without it. One bad
 * image never fails a sibling, and never fails the batch — `spec.md §7.6a #1` makes imagery
 * optional, so a page with an empty reservation is a finished page, not a broken one.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`. Guardrails:
 * `spec.md §32 #24`, `#41`. Canon: `spec.md §7.6a`, `docs/product-doctrine.md §10`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { generateVisualArt } from "@/lib/ai/visual-art/generate";
import { measureArtwork, type ArtworkMetrics } from "@/lib/ai/visual-art/metrics";
import type { ArtworkProvider } from "@/lib/ai/visual-art/provider";
import type { ArtworkBatchBudget } from "@/lib/ai/visual-art/spend";
import type { ArtworkTelemetry } from "@/lib/ai/visual-art/telemetry";
import type { VisualArtIntent } from "@/lib/ai/visual-art/contract";
import { requiresTransparency } from "@/lib/ai/visual-art/compliance";
import type { ArtworkFailureKind as BoundaryFailureKind } from "@/lib/ai/visual-art/failure";
import type { Database } from "@/lib/supabase/database.types";
import {
  attachArtworkAsset,
  failArtworkSlot,
  requestArtworkSlot,
  type ArtworkFailureKind as RecordedFailureKind,
} from "./persist-artwork";
import type { ArtworkAssetStore } from "./artwork-store";

type Admin = SupabaseClient<Database>;

/**
 * Two failure vocabularies meet here, and this is the whole of the translation.
 *
 * The boundary classifies eight kinds because it needs to decide *retryability* — a timeout and a
 * content refusal are the same outcome for a page and opposite decisions for a caller. The database
 * records five because a stored row answers a different question: what should someone reading this
 * concept's history a month from now understand happened. Collapsing eight into five loses the
 * retry decision, which by then has already been made and is in the telemetry anyway.
 *
 * Exhaustive over the boundary's kinds, so adding one there fails to compile until somebody says
 * how it should be remembered.
 */
const RECORDED_AS: Record<BoundaryFailureKind, RecordedFailureKind> = {
  // Nothing was asked of a provider: the request was refused before one was reachable.
  invalid_request: "provider_unavailable",
  budget_refused: "provider_unavailable",
  // The provider was reached and did not answer, or answered with a fault.
  timeout: "timeout",
  rate_limited: "provider_error",
  provider_error: "provider_error",
  // The provider answered, declining on its own policy grounds. An answer, and a final one.
  content_refused: "provider_refused",
  // Something came back and we would not take it.
  malformed_output: "asset_rejected",
  intent_violation: "asset_rejected",
};

/** The widest and narrowest an accepted asset may be, on either axis. Sanity, not art direction. */
export const MIN_ARTWORK_EDGE_PX = 256;
export const MAX_ARTWORK_EDGE_PX = 4096;

/** A returned file this small is not a picture; this large is not one we asked for. */
export const MIN_ARTWORK_BYTES = 1_024;
export const MAX_ARTWORK_BYTES = 25 * 1_024 * 1_024;

/**
 * A hard ceiling on provider requests for one batch, independent of money.
 *
 * Separate from `ArtworkBatchBudget` because the two bound different failure modes: a ceiling
 * stops an expensive run, a request count stops a cheap runaway. A provider that errors for free,
 * or reports no cost, passes a spend gate indefinitely.
 */
export class ArtworkAttemptBudget {
  private used = 0;

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new TypeError("an artwork attempt limit must be a non-negative integer");
    }
  }

  get spent(): number {
    return this.used;
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.used);
  }

  /** Claim one attempt. `false` means the batch has spent its allowance and must stop asking. */
  claim(): boolean {
    if (this.used >= this.limit) return false;
    this.used += 1;
    return true;
  }
}

/** One reserved slot, as this stage needs it: the persisted brief and where it belongs. */
export interface ArtworkStageSlot {
  readonly slotId: string;
  readonly intent: VisualArtIntent;
}

export interface ArtworkStageDeps {
  readonly provider: ArtworkProvider;
  readonly budget: ArtworkBatchBudget;
  readonly attempts: ArtworkAttemptBudget;
  readonly store: ArtworkAssetStore;
  /** How many slots of one concept may be in flight. Bounded so a batch cannot fan out freely. */
  readonly concurrency?: number;
}

export interface ArtworkSlotResult {
  readonly slotId: string;
  readonly status: "delivered" | "failed" | "refused";
  /** The boundary's classification, which is the one that says why. */
  readonly failureKind: BoundaryFailureKind | null;
  readonly detail: string | null;
  readonly telemetry: ArtworkTelemetry | null;
  /** Measured from the returned bytes, never from provider metadata. Null when nothing arrived. */
  readonly metrics: ArtworkMetrics | null;
  readonly storage: { bucket: string; path: string } | null;
  readonly bytes: Uint8Array | null;
}

export interface ArtworkStageOutcome {
  readonly resolvedSpecId: string;
  readonly slots: readonly ArtworkSlotResult[];
  readonly delivered: number;
  readonly failed: number;
  readonly refused: number;
}

/**
 * Everything §9 asks of an asset that provider-side inspection does not already answer.
 *
 * `generateVisualArt` has already refused an undecodable payload, established transparency from
 * the pixels and checked the intent's hard requirements. What it does not do is ask whether the
 * image is a *plausible artifact at all* — the right order of magnitude, a shape we asked for, and
 * for a transparency-required role, actually not a rectangle. That last check is the important
 * one: a provider can return a well-formed RGBA PNG that is opaque in every pixel.
 */
function rejectAsset(
  metrics: ArtworkMetrics,
  intent: VisualArtIntent,
): { kind: BoundaryFailureKind; detail: string } | null {
  const edge = (n: number) => n >= MIN_ARTWORK_EDGE_PX && n <= MAX_ARTWORK_EDGE_PX;
  if (!edge(metrics.width) || !edge(metrics.height)) {
    return {
      kind: "malformed_output",
      detail: `implausible dimensions ${metrics.width}x${metrics.height}`,
    };
  }
  if (metrics.byteLength < MIN_ARTWORK_BYTES || metrics.byteLength > MAX_ARTWORK_BYTES) {
    return { kind: "malformed_output", detail: `implausible size ${metrics.byteLength} bytes` };
  }
  if (requiresTransparency(intent.background) && metrics.alpha.looksLikeOpaqueCanvas) {
    return {
      kind: "intent_violation",
      detail: "transparency was required and every pixel is opaque: this is a rectangle",
    };
  }
  return null;
}

async function runSlot(
  admin: Admin,
  resolvedSpecId: string,
  slot: ArtworkStageSlot,
  deps: ArtworkStageDeps,
): Promise<ArtworkSlotResult> {
  const ref = { resolvedSpecId, slotId: slot.slotId };
  const lineage = {
    provider: deps.provider.id,
    model: deps.provider.model ?? undefined,
    artworkContractVersion: slot.intent.version,
  };
  const empty = { telemetry: null, metrics: null, storage: null, bytes: null } as const;

  // Both bounds before anything reachable. The attempt is claimed first because it is the cheaper
  // refusal to explain and because a spend reservation that is then abandoned stays outstanding.
  if (!deps.attempts.claim()) {
    const detail = `the batch's ${deps.attempts.limit} artwork attempts are spent`;
    await failArtworkSlot(admin, ref, { kind: RECORDED_AS.budget_refused, detail }, lineage);
    return {
      slotId: slot.slotId,
      status: "refused",
      failureKind: "budget_refused",
      detail,
      ...empty,
    };
  }

  const grant = deps.budget.reserve();
  if (!grant.ok) {
    await failArtworkSlot(
      admin,
      ref,
      { kind: RECORDED_AS.budget_refused, detail: grant.detail },
      lineage,
    );
    return {
      slotId: slot.slotId,
      status: "refused",
      failureKind: "budget_refused",
      detail: grant.detail,
      ...empty,
    };
  }

  // The request is recorded before it is made, so a crash mid-flight leaves a slot that says it was
  // asked for rather than one that looks untouched.
  await requestArtworkSlot(admin, ref, lineage);

  const outcome = await generateVisualArt({
    intent: slot.intent,
    budget: deps.budget,
    reservation: grant.reservation,
    provider: deps.provider,
  });

  // What the call cost and how long it took exist only once it has returned, so every record made
  // from here on carries them and the one made before it cannot. `actualCostUsd` is the settled
  // figure — the reservation standing in when the provider reported nothing, which `costUnknown`
  // marks — because a slot recorded at zero would understate a batch that really spent.
  const settled = {
    ...lineage,
    latencyMs: outcome.telemetry.latencyMs,
    costEstimateUsd: outcome.telemetry.actualCostUsd,
  };

  if (!outcome.ok) {
    await failArtworkSlot(
      admin,
      ref,
      { kind: RECORDED_AS[outcome.failure.kind], detail: outcome.failure.detail },
      settled,
    );
    return {
      slotId: slot.slotId,
      status: "failed",
      failureKind: outcome.failure.kind,
      detail: outcome.failure.detail,
      telemetry: outcome.telemetry,
      metrics: null,
      storage: null,
      bytes: null,
    };
  }

  const payload = outcome.asset.payload;
  if (payload.kind !== "bytes") {
    const detail = "the provider returned a reference rather than bytes, which cannot be stored";
    await failArtworkSlot(admin, ref, { kind: RECORDED_AS.malformed_output, detail }, settled);
    return {
      slotId: slot.slotId,
      status: "failed",
      failureKind: "malformed_output",
      detail,
      telemetry: outcome.telemetry,
      metrics: null,
      storage: null,
      bytes: null,
    };
  }

  // Measured from the decoded raster. Provider metadata is recorded elsewhere and believed nowhere.
  const metrics = measureArtwork(payload.bytes, slot.intent.paletteHexes);
  const rejection = rejectAsset(metrics, slot.intent);
  if (rejection) {
    await failArtworkSlot(
      admin,
      ref,
      { kind: RECORDED_AS[rejection.kind], detail: rejection.detail },
      settled,
    );
    return {
      slotId: slot.slotId,
      status: "failed",
      failureKind: rejection.kind,
      detail: rejection.detail,
      telemetry: outcome.telemetry,
      metrics,
      storage: null,
      bytes: null,
    };
  }

  const stored = await deps.store.put({
    key: ref,
    bytes: payload.bytes,
    contentType: payload.mediaType,
  });

  await attachArtworkAsset(
    admin,
    ref,
    {
      storageBucket: stored.bucket,
      storagePath: stored.path,
      widthPx: metrics.width,
      heightPx: metrics.height,
      byteSize: stored.byteSize,
      contentType: "image/png",
      // From the pixels. `docs/product-doctrine.md §10` makes alpha empirical, and `unverified`
      // is the absence of a measurement rather than a soft yes.
      hasAlpha: outcome.asset.transparency === "verified_present",
    },
    settled,
  );

  return {
    slotId: slot.slotId,
    status: "delivered",
    failureKind: null,
    detail: null,
    telemetry: outcome.telemetry,
    metrics,
    storage: { bucket: stored.bucket, path: stored.path },
    bytes: payload.bytes,
  };
}

/**
 * Run every reserved slot of one concept.
 *
 * Concept-scoped on purpose: `spec.md §7.10 #5` makes readiness concept-level, so a caller runs
 * this per sibling and a sibling settles when its own slots do. Nothing here waits for another
 * concept, and the two shared bounds are the only coupling between them — which is why both are
 * objects with their own internal counters rather than numbers passed around.
 *
 * Slots within a concept run with bounded concurrency. The default of one is deliberate: a concept
 * has at most two slots, they share a budget whose refusals must be deterministic, and two image
 * requests in flight buy a second or two at the cost of an ordering nobody can reproduce.
 */
export async function runArtworkStage(
  admin: Admin,
  input: { readonly resolvedSpecId: string; readonly slots: readonly ArtworkStageSlot[] },
  deps: ArtworkStageDeps,
): Promise<ArtworkStageOutcome> {
  const results: ArtworkSlotResult[] = [];
  const width = Math.max(1, deps.concurrency ?? 1);

  for (let i = 0; i < input.slots.length; i += width) {
    const wave = input.slots.slice(i, i + width);
    results.push(
      ...(await Promise.all(wave.map((slot) => runSlot(admin, input.resolvedSpecId, slot, deps)))),
    );
  }

  return {
    resolvedSpecId: input.resolvedSpecId,
    slots: results,
    delivered: results.filter((r) => r.status === "delivered").length,
    failed: results.filter((r) => r.status === "failed").length,
    refused: results.filter((r) => r.status === "refused").length,
  };
}
