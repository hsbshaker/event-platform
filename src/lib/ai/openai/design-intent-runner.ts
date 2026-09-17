/**
 * The adapter the frozen 4C harness calls — and nothing more than an adapter.
 *
 * `docs/phase-4b-plan.md`, after "The stop point": the eval seam must go through the **same
 * production assembly** the real generation path uses, because *"a second assembly written for the
 * harness would let the set pass while production sent something else, which is the one outcome
 * that makes the whole exercise worthless."* So this builds no message, chooses no wording, sets
 * no request option and decides nothing about a response. It maps the frozen `DesignIntentCallRequest`
 * onto the production boundary's input and hands back what that call returned — including
 * `requestText`, which is the text `generateDesignIntent` actually sent rather than anything
 * recomputed here.
 *
 * It lives under `src/lib/ai/openai/` because the frozen freeze test requires the seam to bind
 * either the T19 refusal or a module on this path, and nowhere else.
 *
 * **The one cast, and why it is here rather than in the harness.** The frozen seam hands over a
 * plain `EventIdentity`: `design-intent-evidence.ts` says so, and says why — the runner has
 * already proved the brief authoritative through `assertAuthoritative`, and *"the brand is a
 * compile-time guarantee about a call site, and re-declaring it here would only mean the seam's
 * implementer had to launder it again."* The laundering is that sentence's own consequence, done
 * once, in the open, in the adapter rather than inside production code that must keep requiring
 * the brand.
 *
 * It catches nothing and rethrows nothing. `DesignIntentError` already carries `rawResponses` and
 * `usage`, which is exactly what the seam contract requires a thrower to carry; a `try` here would
 * be the place a paid response gets swallowed.
 */
import type { AuthoritativeIdentity } from "@/lib/ai/event-identity/lifecycle";
import type { DesignIntentCallRunner } from "@/lib/ai/evals/design-intent-evidence";

import { DesignIntentError, generateDesignIntent } from "./design-intent";

/**
 * A live provider call per invocation. Nothing here guards against being run — the guards are the
 * frozen runner's module-scope refusals and the explicit authorization the plan requires before
 * any 4C set runs. This module is inert until something calls it.
 */
export const designIntentRunner: DesignIntentCallRunner = async (request) => {
  const call = await generateDesignIntent({
    identity: request.identity as AuthoritativeIdentity,
    assignment: request.assignment,
  });

  return {
    raw: call.raw,
    // Post-repair and revalidated, which is what production hands downstream. The harness must
    // grade the object the rest of the system would receive, not a rejected intermediate — and
    // `raw` above still carries the response exactly as it arrived, so nothing is lost.
    response: call.response,
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

/** Re-exported so the error type the seam contract names is reachable from here. */
export { DesignIntentError };
