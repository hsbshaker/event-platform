/**
 * The adapter the frozen 4C harness calls — and nothing more than an adapter.
 *
 * `docs/phase-4b-plan.md`, after "The stop point", quoting 4B's T9: *"the eval seam should call the
 * same production assembly logic used by the real … path … A second assembly written for the
 * harness would let the set pass while production sent something else, which is the one outcome
 * that makes the whole exercise worthless."* So this builds no message, chooses no wording, sets no
 * model option and decides no retry. It maps the frozen `DesignIntentCallRequest` onto
 * `DesignIntentCallInput`, hands back what `generateDesignIntent` returned — including
 * `requestText`, which is the text the production call actually sent rather than anything
 * recomputed here — and reshapes the usage into the telemetry the frozen runner journals.
 *
 * # The one cast, and where its proof lives
 *
 * `DesignIntentCallRequest.identity` is a plain `EventIdentity`, by the frozen seam contract's own
 * decision: *"the brief travels as the plain identity object rather than the branded type because
 * the runner has already proved it authoritative through `assertAuthoritative`."* Production's
 * signature keeps the brand, because `spec.md §7.6b`'s guarantee — a provisional identity never
 * reaches a DesignIntent call — is worth more as a compile error than as a review comment, and
 * weakening it to suit the harness would be backwards.
 *
 * The two meet here. `tests/eval/design-intent.eval.ts` calls `assertAuthoritative(envelope,
 * EVENT_IDENTITY_SCHEMA_VERSION)` on the case's own envelope and passes the result straight into
 * the seam; the brand is lost to the seam's type, not to the evidence. Re-deriving it here is not
 * possible — `assertAuthoritative` reads an envelope and this has only the brief — and
 * manufacturing an envelope to feed it would assert authority nobody checked, which is strictly
 * worse than a cast with the proof written next to it.
 *
 * Acceptance criteria: N/A — benchmark integrity, no product behaviour of its own.
 * `docs/model-contracts.md §4.7`; `docs/phase-4b-plan.md` Part IV T21.
 */
import type { AuthoritativeIdentity } from "@/lib/ai/event-identity/lifecycle";
import type { DesignIntentCallRunner } from "@/lib/ai/evals/design-intent-evidence";

import { DesignIntentError, generateDesignIntent } from "./design-intent";

/**
 * A live provider call per invocation. Nothing here guards against being run — the guards are the
 * frozen runner's module-scope refusals and the explicit authorization the plan requires before any
 * DesignIntent set runs. This module is inert until something calls it.
 */
export const designIntentRunner: DesignIntentCallRunner = async (request) => {
  const call = await generateDesignIntent({
    // See the header: proved authoritative by the frozen runner, widened by the seam's type.
    identity: request.identity as AuthoritativeIdentity,
    // Passed through unchanged. Narrowing, ordering and rendering are the production boundary's;
    // doing any of them here would mean the set graded this file rather than the production path.
    assignment: request.assignment,
  });

  return {
    raw: call.raw,
    response: call.output,
    requestText: call.requestText,
    telemetry: {
      model: call.usage.model,
      promptVersion: call.promptVersion,
      schemaVersion: call.schemaVersion,
      latencyMs: call.usage.latencyMs,
      transientRetries: call.usage.transientRetries,
      repairRetries: call.usage.repairRetries,
      schemaValidFirstCall: call.usage.schemaValidFirstCall,
      inputTokens: call.usage.inputTokens,
      cachedInputTokens: call.usage.cachedInputTokens,
      outputTokens: call.usage.outputTokens,
      reasoningTokens: call.usage.reasoningTokens,
      providerRequestId: call.usage.providerRequestId,
    },
  };
};

/**
 * Re-exported so the error type the frozen seam contract names is reachable from here.
 *
 * That contract requires a thrower to carry `rawResponses` and `usage`; `DesignIntentError` already
 * does, which is why this adapter rethrows nothing and catches nothing. A `try` here would be the
 * place a paid response gets swallowed.
 */
export { DesignIntentError };
