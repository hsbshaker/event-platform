import "server-only";

/**
 * `generateVisualArt` — the artwork capability of the thin provider boundary.
 *
 * One logical request: validate the brief, pass the spend gate, call the provider at most
 * `MAX_ARTWORK_ATTEMPTS_PER_CALL` times, inspect whatever came back, judge it against the intent's
 * hard requirements, settle the ledger, and return an asset **or** a classified absence. It owns
 * the SDK-free half of what `src/lib/ai/openai/composition.ts` owns for the text model: the retry
 * policy, the classification, the accounting and the telemetry.
 *
 * # This function does not throw, and that is the load-bearing decision
 *
 * `generateComposition` throws a `CompositionError`, because a concept with no composition is not
 * a concept. Artwork is the opposite: `spec.md §7.6a #1` makes it *"optional, and chosen by the
 * creative direction"*, and the page is already verified and frozen before any image exists. So
 * **no asset is an ordinary outcome**, not an exceptional one, and a function that threw would
 * make every caller write a `try` around the normal case — which is how "artwork failed" ends up
 * logged as an error, alerted on, and eventually retried.
 *
 * `./fallback.ts` is the other half of that statement: it is what a caller receives when there is
 * no asset, and it is a state the renderer must already paint correctly.
 *
 * # The retry bound, and what it is not
 *
 * One retry. `docs/model-contracts.md §6.3`'s three re-prompts are the **Composition** stage's,
 * against the text model, for schema-invalid output, a token-cap violation and a selector
 * collision. None of them is in play here and none of them is spent here. An artwork retry is a
 * transport retry against an image model: it repeats a request that produced no answer, and
 * `./failure.ts` allows it only for the three kinds where that is true.
 *
 * Why one rather than the two the text boundaries permit: each artwork attempt spends per asset,
 * and the fallback is ordinary. A third paid attempt buys a marginal chance of an image the page
 * does not require, and `docs/development-plan.md` principle 4 exists because a proof run once hit
 * an organisation spend ceiling mid-run.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`.
 * Guardrails: `spec.md §32 #13`, `#21`, `#32`; `docs/development-plan.md` principle 4.
 */
import { VISUAL_ART_INTENT_VERSION, visualArtIntentSchema, type VisualArtIntent } from "./contract";
import { checkIntentCompliance, missingStandingProhibitions } from "./compliance";
import {
  artworkFailure,
  classifyProviderError,
  type ArtworkFailure,
  type ArtworkIntentViolation,
} from "./failure";
import type { ArtworkAsset, ArtworkProvider, ArtworkProviderResponse } from "./provider";
import {
  inspectRaster,
  transparencyOf,
  type ArtworkTransparency,
  type RasterFormat,
} from "./raster";
import type { ArtworkBatchBudget, ArtworkBudgetRefusal, ArtworkReservation } from "./spend";
import { VISUAL_ART_OPERATION, type ArtworkTelemetry } from "./telemetry";

/**
 * Retries after the first attempt, for the three no-answer failure kinds only.
 *
 * Exported because the spend estimate multiplies by the attempt count this produces: an estimate
 * derived for fewer attempts than the policy permits would be wrong in the direction of spending
 * money, which is `src/lib/ai/openai/composition.ts`'s argument for exporting its own.
 */
export const ARTWORK_MAX_RETRIES = 1;

/** The most provider requests one logical call can make. */
export const MAX_ARTWORK_ATTEMPTS_PER_CALL = ARTWORK_MAX_RETRIES + 1;

/** Backoff before the one retry. One entry, because there is one retry. */
export const ARTWORK_RETRY_BACKOFF_MS = [1_000];

/**
 * The deadline for a single attempt.
 *
 * Image generation is slower than a text completion and much slower than a schema call. Generous,
 * and still a bound: a hung request must not hold a reservation open and stall the two concepts
 * beside it. Not tuned to any model, because none is selected — it moves when one is.
 */
export const ARTWORK_REQUEST_TIMEOUT_MS = 120_000;

export type VisualArtOutcome =
  | { readonly ok: true; readonly asset: ArtworkAsset; readonly telemetry: ArtworkTelemetry }
  | { readonly ok: false; readonly failure: ArtworkFailure; readonly telemetry: ArtworkTelemetry };

export interface VisualArtCallInput {
  /** The brief. Validated here, not trusted. */
  readonly intent: VisualArtIntent;
  /** The spend gate's permission for this one request, and the budget that minted it. */
  readonly budget: ArtworkBatchBudget;
  readonly reservation: ArtworkReservation;
  /**
   * The image provider.
   *
   * Injected rather than resolved, so this module imports no SDK and no transport. The only
   * implementation in this repository is the offline stub; `./enablement.ts` explains why
   * `getArtworkProvider()` throws instead of returning one.
   */
  readonly provider: ArtworkProvider;
  /** Injectable for deterministic tests. Defaults to the real clock and a real timer. */
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly timeoutMs?: number;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A deadline the provider is told about **and** that this boundary enforces itself.
 *
 * Both halves are needed. The signal is how a well-behaved provider cancels its own transport and
 * stops being billed. The race is what stops a provider that ignores the signal from holding a
 * reservation open forever and stalling the concepts beside it — a hung call is a `timeout`
 * whether or not the provider agrees.
 */
async function attemptWithDeadline(
  provider: ArtworkProvider,
  intent: VisualArtIntent,
  timeoutMs: number,
): Promise<ArtworkProviderResponse> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        Object.assign(new Error(`the artwork request passed ${timeoutMs}ms`), {
          name: "TimeoutError",
        }),
      );
    }, timeoutMs);
  });
  const call = provider.generateArtwork({ intent, signal: controller.signal });
  // The loser of the race must not surface later as an unhandled rejection: this call is over.
  call.catch(() => {});
  try {
    return await Promise.race([call, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

interface Observed {
  transparency: ArtworkTransparency;
  format: RasterFormat | null;
  width: number | null;
  height: number | null;
  textDetected: boolean | null;
}

/**
 * What this boundary could establish about a payload.
 *
 * Bytes are inspected. A URL is not fetched — see `./provider.ts` — so it is `unverified`, and
 * `checkIntentCompliance` refuses it for a role that requires alpha. A provider's `declaredAlpha`
 * is deliberately not consulted: a claim is the assumption `docs/product-doctrine.md §10` says
 * transparency must not be.
 */
function observe(
  response: ArtworkProviderResponse,
): { ok: true; observed: Observed } | ArtworkFailure {
  if (response.payload.kind === "url") {
    return {
      ok: true,
      observed: {
        transparency: "unverified",
        format: null,
        width: response.payload.declaredWidth ?? null,
        height: response.payload.declaredHeight ?? null,
        textDetected: null,
      },
    };
  }

  const inspection = inspectRaster(response.payload.bytes);
  if (!inspection.ok) {
    return artworkFailure("malformed_output", inspection.detail);
  }
  return {
    ok: true,
    observed: {
      transparency: transparencyOf(inspection.inspection),
      format: inspection.inspection.format,
      width: inspection.inspection.width,
      height: inspection.inspection.height,
      textDetected: inspection.inspection.textDetected,
    },
  };
}

export async function generateVisualArt(input: VisualArtCallInput): Promise<VisualArtOutcome> {
  const now = input.now ?? Date.now;
  const sleep = input.sleep ?? realSleep;
  const timeoutMs = input.timeoutMs ?? ARTWORK_REQUEST_TIMEOUT_MS;
  const startedAt = now();

  let providerAttempts = 0;
  let artworkRetries = 0;
  let providerId: string | null = null;
  let model: string | null = null;
  let providerRequestId: string | null = null;
  let observed: Observed | null = null;
  let costUsd: number | null = null;

  const finish = (
    result: { ok: true; asset: ArtworkAsset } | { ok: false; failure: ArtworkFailure },
    settled: { reserved: number; actual: number; unknown: boolean },
  ): VisualArtOutcome => {
    const telemetry: ArtworkTelemetry = {
      operation: VISUAL_ART_OPERATION,
      latencyMs: now() - startedAt,
      outcome: result.ok ? "asset" : "no_asset",
      failureKind: result.ok ? null : result.failure.kind,
      failureDetail: result.ok ? null : result.failure.detail,
      violations: result.ok ? [] : (result.failure.violations ?? []),
      artworkRetries,
      providerAttempts,
      reservedCostUsd: settled.reserved,
      actualCostUsd: settled.actual,
      costUnknown: settled.unknown,
      provider: providerId,
      model,
      providerRequestId,
      intentVersion: VISUAL_ART_INTENT_VERSION,
      // Read defensively: an intent that failed validation reaches here without these fields,
      // and a telemetry row for a refused request is still a row that has to say what it was for.
      role: typeof input.intent?.role === "string" ? input.intent.role : "unknown",
      backgroundRequested:
        typeof input.intent?.background === "string" ? input.intent.background : "unknown",
      transparency: observed?.transparency ?? null,
      format: observed?.format ?? null,
      width: observed?.width ?? null,
      height: observed?.height ?? null,
    };
    return result.ok
      ? { ok: true, asset: result.asset, telemetry }
      : { ok: false, failure: result.failure, telemetry };
  };

  /**
   * A refusal that never reached a provider: nothing was spent, and nothing is settled.
   *
   * The reservation stays **outstanding** on the caller's budget rather than being released. That
   * is deliberate and it is the fail-closed direction: a caller that keeps minting reservations
   * for requests it then gets refused runs its own batch ceiling down and stops, instead of
   * looping forever against a ledger that keeps forgiving it. Releasing it is the caller's own
   * `settle()` to make, because only the caller knows whether it means to try again.
   */
  const refuseBeforeSpending = (failure: ArtworkFailure): VisualArtOutcome =>
    finish({ ok: false, failure }, { reserved: 0, actual: 0, unknown: false });

  /* ---- 1. the brief, before the money ------------------------------------------------- */

  const parsed = visualArtIntentSchema.safeParse(input.intent);
  if (!parsed.success) {
    return refuseBeforeSpending(
      artworkFailure(
        "invalid_request",
        `the VisualArtIntent is invalid: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "<root>"} ${issue.message}`)
          .join("; ")}`,
      ),
    );
  }
  const intent = parsed.data;

  const missing = missingStandingProhibitions(intent);
  if (missing.length > 0) {
    // `contract.ts` says the prohibitions are seeded rather than left to the caller; the schema
    // only requires the list to be non-empty, so this is where that sentence is enforced.
    return refuseBeforeSpending(
      artworkFailure(
        "invalid_request",
        `the brief is missing ${missing.length} standing prohibition(s); spec.md §7.6a #4 makes ` +
          "them unconditional, so this request is not made",
      ),
    );
  }

  /* ---- 2. the spend gate --------------------------------------------------------------- */

  if (!input.budget.consume(input.reservation)) {
    // Not this budget's reservation, or already spent. Either way the gate has not been passed,
    // and a request made on a replayed reservation is a request outside the ceiling.
    return refuseBeforeSpending(
      artworkFailure(
        "invalid_request",
        `artwork reservation ${input.reservation.id} is not outstanding on budget ` +
          `${input.budget.id}; no request was made`,
      ),
    );
  }

  const reserved = input.reservation.estimateUsd;
  const settleAndFinish = (
    result: { ok: true; asset: ArtworkAsset } | { ok: false; failure: ArtworkFailure },
  ): VisualArtOutcome => {
    input.budget.settle(input.reservation, costUsd);
    return finish(result, {
      reserved,
      actual: costUsd === null ? reserved : costUsd,
      unknown: costUsd === null,
    });
  };

  /* ---- 3. the attempts ----------------------------------------------------------------- */

  let failure: ArtworkFailure = artworkFailure(
    "provider_error",
    "the artwork request made no attempt",
  );

  for (let attempt = 0; attempt < MAX_ARTWORK_ATTEMPTS_PER_CALL; attempt += 1) {
    let response: ArtworkProviderResponse;
    providerAttempts += 1;
    try {
      response = await attemptWithDeadline(input.provider, intent, timeoutMs);
    } catch (error) {
      failure = classifyProviderError(error);
      if (failure.retryable && attempt + 1 < MAX_ARTWORK_ATTEMPTS_PER_CALL) {
        artworkRetries += 1;
        await sleep(
          ARTWORK_RETRY_BACKOFF_MS[Math.min(attempt, ARTWORK_RETRY_BACKOFF_MS.length - 1)],
        );
        continue;
      }
      return settleAndFinish({ ok: false, failure });
    }

    providerId = response.providerId;
    model = response.model;
    providerRequestId = response.providerRequestId ?? null;
    // An attempt that returned was paid for whatever it reported; an attempt that threw reported
    // nothing and leaves `costUsd` null, which settles at the full reservation rather than zero.
    if (typeof response.costUsd === "number" && Number.isFinite(response.costUsd)) {
      costUsd = (costUsd ?? 0) + response.costUsd;
    }

    /* ---- 4. what actually came back ---------------------------------------------------- */

    const looked = observe(response);
    if (!("ok" in looked)) {
      // Undecodable. An answer, so it is not retried: see `./failure.ts`.
      return settleAndFinish({ ok: false, failure: looked });
    }
    observed = looked.observed;

    const violations: readonly ArtworkIntentViolation[] = checkIntentCompliance(intent, {
      transparency: observed.transparency,
      textDetected: observed.textDetected,
    });
    if (violations.length > 0) {
      return settleAndFinish({
        ok: false,
        failure: artworkFailure(
          "intent_violation",
          `the returned image does not satisfy the brief: ${violations.join(", ")}`,
          { violations },
        ),
      });
    }

    const asset: ArtworkAsset = {
      payload: response.payload,
      role: intent.role,
      transparency: observed.transparency,
      format: observed.format,
      width: observed.width,
      height: observed.height,
      providerId: response.providerId,
      model: response.model,
      providerRequestId: response.providerRequestId ?? null,
      intentVersion: VISUAL_ART_INTENT_VERSION,
    };
    return settleAndFinish({ ok: true, asset });
  }

  return settleAndFinish({ ok: false, failure });
}

/**
 * The refusal the spend gate produces, as a failure the same callers can read.
 *
 * `ArtworkBatchBudget.reserve()` returns a refusal rather than throwing, and a caller that could
 * not reserve never calls `generateVisualArt` at all — so this is how a refused request becomes an
 * ordinary `no asset` in the same vocabulary as every other one.
 */
export function budgetRefusalFailure(refusal: ArtworkBudgetRefusal): ArtworkFailure {
  return artworkFailure("budget_refused", refusal.detail);
}
