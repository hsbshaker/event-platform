/**
 * One record per artwork request, in the vocabulary the four existing stages already use.
 *
 * `src/lib/ai/openai/composition-runner.ts` is the shape being matched: a flat object carrying
 * `operation`, `provider`, `model`, `latencyMs`, `providerRequestId`, the versions the artifact
 * was produced under, and the retry counters kept apart rather than summed. There is no logger and
 * no second logging system: telemetry is returned by value with the result, and the caller
 * persists it beside the run exactly as the composition stage does.
 *
 * # What is different, and why
 *
 * **No token counts.** An image request is not billed in tokens, and an `inputTokens: null` on
 * every row would invite a cost model that prices artwork at zero. Cost is carried directly, as
 * `reservedCostUsd` and `actualCostUsd`.
 *
 * **`artworkRetries`, never `reprompts`.** `docs/model-contracts.md §6.3`'s three re-prompts are
 * the Composition stage's, against the text model, one each for a schema-invalid response, a
 * token-cap violation and a selector collision. Nothing here is one of them. A dashboard that
 * summed an artwork retry into `reprompts` would report a canon violation that never happened —
 * the same reason `composition.ts` keeps `transientRetries` out of that counter.
 *
 * **`provider` and `model` are nullable.** No image model is selected (`spec.md §7.6a`,
 * `docs/technology-decisions.md`), so `null` is the honest value and not a missing field.
 */
import type { ArtworkFailureKind, ArtworkIntentViolation } from "./failure";
import type { ArtworkTransparency, RasterFormat } from "./raster";

/** Matches `ModelOperation` in `@/lib/ai/provider`. */
export const VISUAL_ART_OPERATION = "visual_art" as const;

export interface ArtworkTelemetry {
  readonly operation: typeof VISUAL_ART_OPERATION;
  /** Wall time across every attempt, including the ones that failed. */
  readonly latencyMs: number;
  readonly outcome: "asset" | "no_asset";
  /** `null` exactly when `outcome` is `asset`. */
  readonly failureKind: ArtworkFailureKind | null;
  readonly failureDetail: string | null;
  /** Non-empty only for an `intent_violation`. */
  readonly violations: readonly ArtworkIntentViolation[];
  /**
   * Retries **consumed**, not permitted: attempts beyond the first. Bounded by
   * `ARTWORK_MAX_RETRIES`. Not a re-prompt — see the module header.
   */
  readonly artworkRetries: number;
  /** Provider requests actually made, at most `MAX_ARTWORK_ATTEMPTS_PER_CALL`. */
  readonly providerAttempts: number;
  /** What the spend gate debited before the request was permitted. */
  readonly reservedCostUsd: number;
  /** What it was settled at. Equal to the reservation when the provider reported no cost. */
  readonly actualCostUsd: number;
  /** True when `actualCostUsd` is the reservation standing in for an unreported cost. */
  readonly costUnknown: boolean;
  readonly provider: string | null;
  readonly model: string | null;
  readonly providerRequestId: string | null;
  /** `VISUAL_ART_INTENT_VERSION` — which contract this request was assembled under. */
  readonly intentVersion: string;
  /** The artwork role requested, so failures can be read per role during Phase 4E review. */
  readonly role: string;
  /** What the brief demanded of the background, beside what arrived. */
  readonly backgroundRequested: string;
  /** Established from the bytes. `null` when nothing was returned to inspect. */
  readonly transparency: ArtworkTransparency | null;
  readonly format: RasterFormat | null;
  readonly width: number | null;
  readonly height: number | null;
}
