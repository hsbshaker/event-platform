import "server-only";

import { generationEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  GenerationDisabledError,
  MeterRecordError,
  ModelCallRefusedError,
  ProviderCallError,
  SpendCeilingError,
} from "./errors";
import { costOf } from "./pricing";
import type { TokenUsage } from "./pricing";
import type { MeterContext, ModelOperation, ModelResult } from "./provider";

/**
 * The meter: the one gate every model call passes (`spec.md §9.6`, §10; docs/development-plan.md
 * principle 3). The provider's request functions run only as the `call` of `metered`.
 *
 * In order, fail-closed at every step before the call:
 *
 * 1. the context must name an event, an acting user and a generation (no anonymous call, §32 #4);
 * 2. generation must be switched on (`GENERATION_ENABLED`, the kill switch);
 * 3. the generation must still be running (`heartbeat_generation`, which also proves the worker is
 *    alive): a worker whose generation finished, failed or was taken over as stale cannot spend;
 * 4. the call's conservative estimate must fit under today's ceiling (`reserve_model_spend`);
 *    the reservation is held while the call runs, so concurrent calls cannot pass it together.
 *
 * Any error in steps 1–4 (including the database being unreachable) means the call is not made.
 *
 * After the call, success or failure: its cost is computed from the provider's reported usage
 * (`costOf`), or, for a failure that reported none, taken as zero when the provider rejected the
 * request outright and as the full reservation when the outcome is unknown (timeout, dropped
 * connection, content refusal). The reservation is settled to that cost (`settle_model_spend`)
 * and one `generation_runs` row is written. A failed settlement is logged and not thrown: the
 * reservation then stays held, which only errs towards spending less. A failed run row is thrown
 * (`MeterRecordError`), with the call's own error attached when it had one.
 */

/** The model asked for and the version set the call runs under (spec.md §9.5, §24 GenerationRun). */
export interface RunInfo {
  model: string;
  promptVersion: string;
  schemaVersion?: string | null;
  layoutSetVersion?: string | null;
  compilerVersion?: string | null;
}

/** What a metered call returns: its validated value, the raw text and the provider's usage. */
export interface MeteredCallResult<T> {
  value: T;
  raw: string;
  usage: TokenUsage;
  providerRequestId?: string;
}

export const PROVIDER = "openai";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertContext(ctx: MeterContext): void {
  const ids = [ctx?.eventId, ctx?.userId, ctx?.generationId];
  if (!ids.every((id) => typeof id === "string" && UUID.test(id))) {
    throw new ModelCallRefusedError(
      "invalid_context",
      "A model call needs an event, an acting member and a running generation.",
    );
  }
}

/** USD with the ledger's precision (numeric(12, 6)), never below zero. */
function usd(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1e6) / 1e6 : 0;
}

function failureCost(error: unknown, estimateUsd: number): number {
  if (error instanceof ProviderCallError) {
    if (error.usage) return safeCost(error.usage, estimateUsd);
    if (error.billing === "none") return 0;
  }
  return estimateUsd;
}

function safeCost(usage: TokenUsage, estimateUsd: number): number {
  try {
    return costOf(usage);
  } catch (error) {
    // A model without a price: book the reservation rather than nothing.
    console.error("[meter] cannot price usage; booking the reservation", { usage, error });
    return estimateUsd;
  }
}

export async function metered<T>(
  ctx: MeterContext,
  operation: ModelOperation,
  estimateUsd: number,
  info: RunInfo,
  call: () => Promise<MeteredCallResult<T>>,
): Promise<ModelResult<T>> {
  assertContext(ctx);
  if (!(Number.isFinite(estimateUsd) && estimateUsd >= 0)) {
    throw new Error(`invalid reservation estimate for ${operation}: ${estimateUsd}`);
  }
  const config = generationEnv();
  if (!config.enabled) throw new GenerationDisabledError();

  const admin = createAdminClient();

  const beat = await admin.rpc("heartbeat_generation", {
    p_generation_id: ctx.generationId,
    p_event_id: ctx.eventId,
  });
  if (beat.error) throw beat.error;
  if (beat.data !== true) {
    throw new ModelCallRefusedError(
      "not_running",
      `Generation ${ctx.generationId} is not running; no model call is made for it.`,
    );
  }

  const estimate = usd(estimateUsd);
  const reserved = await admin.rpc("reserve_model_spend", {
    p_estimate_usd: estimate,
    p_ceiling_usd: config.dailyCeilingUsd,
  });
  if (reserved.error) throw reserved.error;
  const day = reserved.data;
  if (!day) {
    // The alert (spec.md §10 "spend ceiling and alerts"): every refusal is logged as an error.
    console.error("[meter] daily spend ceiling reached; model call refused", {
      operation,
      eventId: ctx.eventId,
      generationId: ctx.generationId,
      ceilingUsd: config.dailyCeilingUsd,
    });
    throw new SpendCeilingError();
  }

  const started = Date.now();
  let result: MeteredCallResult<T> | undefined;
  let callError: unknown;
  try {
    result = await call();
  } catch (error) {
    callError = error;
  }
  const latencyMs = Date.now() - started;

  const usage: TokenUsage | undefined =
    result?.usage ?? (callError instanceof ProviderCallError ? callError.usage : undefined);
  const costUsd = usd(result ? safeCost(result.usage, estimate) : failureCost(callError, estimate));
  const providerRequestId =
    result?.providerRequestId ??
    (callError instanceof ProviderCallError ? callError.providerRequestId : undefined);

  const settled = await admin.rpc("settle_model_spend", {
    p_day: day,
    p_reserved_usd: estimate,
    p_actual_usd: costUsd,
  });
  if (settled.error) {
    console.error("[meter] settlement failed; the reservation stays held", {
      operation,
      day,
      estimate,
      costUsd,
      error: settled.error,
    });
  }

  const run = await admin.from("generation_runs").insert({
    event_id: ctx.eventId,
    user_id: ctx.userId,
    generation_id: ctx.generationId,
    round: ctx.round ?? null,
    provider: PROVIDER,
    provider_request_id: providerRequestId ?? null,
    operation,
    model: usage?.model ?? info.model,
    input_tokens: usage?.inputTokens ?? null,
    cached_input_tokens: usage?.cachedInputTokens ?? null,
    output_tokens: usage?.outputTokens ?? null,
    reasoning_tokens: usage?.reasoningTokens ?? null,
    image_units: usage?.imageUnits ?? null,
    cost_estimate_usd: costUsd,
    latency_ms: latencyMs,
    success: result !== undefined,
    error_code:
      result !== undefined
        ? null
        : callError instanceof ProviderCallError
          ? callError.code
          : "error",
    prompt_version: info.promptVersion,
    schema_version: info.schemaVersion ?? null,
    layout_set_version: info.layoutSetVersion ?? null,
    compiler_version: info.compilerVersion ?? null,
  });
  if (run.error) {
    // Never the call's error object itself: model output (`ModelOutputError.raw`) and provider
    // response bodies can carry the host's names and places.
    console.error("[meter] could not record the model call", {
      operation,
      generationId: ctx.generationId,
      error: run.error,
      callError:
        callError instanceof Error
          ? {
              name: callError.name,
              code: (callError as { code?: unknown }).code,
              message: callError.message,
            }
          : callError === undefined
            ? undefined
            : typeof callError,
    });
    throw new MeterRecordError(`could not record the ${operation} call`, callError, {
      cause: run.error,
    });
  }

  if (!result) throw callError;
  return {
    raw: result.raw,
    output: result.value,
    usage: {
      ...result.usage,
      provider: PROVIDER,
      providerRequestId,
      costUsd,
      latencyMs,
    },
  };
}
