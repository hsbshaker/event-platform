/**
 * What every generation stage is given, and how a stage fails (`spec.md §7.3`–§7.10, §9;
 * `docs/card-system.md §3`; `docs/model-contracts.md §9`).
 *
 * The stages (`identity.server.ts`, `design.server.ts`, `artwork.server.ts`) are server functions
 * with the provider injected: they make model calls only through `ctx.provider`, each with
 * `ctx.meter`, so every call is metered against the running generation (`src/lib/ai/meter.server.ts`
 * refuses a context that names none). They persist nothing; the orchestration that runs them
 * writes their results.
 *
 * Errors a stage can end with:
 * - `GenerationStageError` (and `ArtworkProviderRefusalError`): the stage failed after its
 *   allowed retries. Shown to the host honestly, with a retry action; never replaced with
 *   something pre-made (`CLAUDE.md §5.1`).
 * - `ModelCallRefusedError` (`src/lib/ai/errors.ts`), unchanged: the meter refused a call before it
 *   was made — generation switched off, the spend ceiling reached, the generation no longer
 *   running. No retry is attempted against a refusal.
 * - `MeterRecordError`, unchanged: a call's telemetry could not be written.
 * Anything else is a bug.
 */
import type { AiProvider, MeterContext } from "@/lib/ai/provider";

export interface StageContext {
  /** The provider, injected (`getAiProvider()` in production, a scripted fake in tests). */
  provider: AiProvider;
  /** The running generation every call is metered against: event, acting member, generation, round. */
  meter: MeterContext;
}

export type GenerationStage = "identity" | "design" | "artwork";

/**
 * Why a stage failed, as recorded in `generations.error_code`:
 * - `invalid_output`: the model's output stayed invalid after the stage's one retry;
 * - `provider_error`: the provider call failed (after the provider's own transient retry);
 * - `artwork_invalid`: the artwork failed validation, and so did its one regeneration;
 * - `provider_refusal`: the image provider refused the artwork (`ArtworkProviderRefusalError`).
 */
export type StageFailureCode =
  "invalid_output" | "provider_error" | "artwork_invalid" | "provider_refusal";

export class GenerationStageError extends Error {
  constructor(
    readonly stage: GenerationStage,
    readonly code: StageFailureCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "GenerationStageError";
  }
}

/**
 * The image provider refused to paint the artwork (`ProviderRefusalError`), typically a brand or
 * character homage that came out too close to a protected character (`spec.md §7.6`). The
 * artwork stage does not answer it: the answer is a new design, re-prompted with kind
 * `provider-refusal`, whose artwork is painted afresh; a second refusal is a visible failure
 * (`docs/card-system.md §3`). `imagesRequested` counts this artwork's image requests, the refused
 * one included.
 */
export class ArtworkProviderRefusalError extends GenerationStageError {
  constructor(
    readonly imagesRequested: number,
    options?: { cause?: unknown },
  ) {
    super("artwork", "provider_refusal", "The image provider refused the artwork.", options);
    this.name = "ArtworkProviderRefusalError";
  }
}
