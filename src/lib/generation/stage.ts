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
  /**
   * What the failure telemetry records beside the code (`generations.telemetry.failure`): for the
   * artwork, each image's validation failure. Reasons and check output only — never host content.
   */
  readonly details: Record<string, unknown> | undefined;

  constructor(
    readonly stage: GenerationStage,
    readonly code: StageFailureCode,
    message: string,
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(message, options);
    this.name = "GenerationStageError";
    this.details = options?.details;
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
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super("artwork", "provider_refusal", "The image provider refused the artwork.", options);
    this.name = "ArtworkProviderRefusalError";
  }
}

const FAILURE_DETAILS = Symbol("generation.failureDetails");

/**
 * Attach failure details to an error a stage passes through unchanged (a meter refusal), so the
 * failure telemetry keeps what the stage already learned — for the artwork, an earlier image's
 * validation failure. The error keeps its class and identity.
 */
export function attachFailureDetails(error: unknown, details: Record<string, unknown>): void {
  if (error && typeof error === "object") {
    const merged = { ...attachedDetails(error), ...details };
    Object.defineProperty(error, FAILURE_DETAILS, { value: merged, configurable: true });
  }
}

function attachedDetails(error: object): Record<string, unknown> | undefined {
  const attached = (error as { [FAILURE_DETAILS]?: unknown })[FAILURE_DETAILS];
  return attached && typeof attached === "object"
    ? (attached as Record<string, unknown>)
    : undefined;
}

/**
 * The details recorded on an error: those attached as it passed through the orchestration and
 * the stages, with a stage error's own details taking precedence.
 */
export function failureDetailsOf(error: unknown): Record<string, unknown> | undefined {
  if (!error || typeof error !== "object") return undefined;
  const attached = attachedDetails(error);
  const own = error instanceof GenerationStageError ? error.details : undefined;
  return attached || own ? { ...attached, ...own } : undefined;
}
