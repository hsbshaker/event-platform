/**
 * The adapter the frozen rerun-behaviour set calls — and nothing more than an adapter.
 *
 * `docs/phase-4b-plan.md` T9: *"the eval seam should call the same production assembly logic used
 * by the real EventIdentity rerun path"*. So this builds no message and decides no wording. It
 * maps the frozen `RerunRequest` onto `GenerateEventIdentityInput` and hands back what the
 * production call returns — including `requestText`, which is the text `generateEventIdentity`
 * actually sent rather than anything recomputed here. A second assembly written for the harness
 * would let the set pass while production sent something else, which is the one outcome that makes
 * the whole exercise worthless.
 *
 * What it must not do, and does not: normalise an answer, reorder history, fill in a question, or
 * touch the host's words. Every one of those is the assembly's job, under a version that records
 * it.
 */
import { generateEventIdentity, EventIdentityError } from "@/lib/ai/openai/event-identity";

import type { RerunCallRunner } from "./rerun-behaviour";

/**
 * A live provider call per invocation. Nothing here guards against being run — the guards are the
 * frozen runner's module-scope refusals and the explicit authorization the plan requires before
 * T13. This module is inert until something calls it.
 */
export const rerunRunner: RerunCallRunner = async (request) => {
  const call = await generateEventIdentity({
    prompt: request.prompt,
    clarification: {
      priorRevisions: request.priorRevisions,
      // Passed through unchanged. The assembly sorts chronologically and reads each question out
      // of its revision; doing either of those here would mean the set graded this file rather
      // than the production path.
      answers: request.answers.map((answer) => ({
        revision: answer.revision,
        questionIndex: answer.questionIndex,
        selectedOptionLabel: answer.selectedOptionLabel,
        freeText: answer.freeText,
        isDefer: answer.isDefer,
      })),
    },
  });

  return {
    raw: call.raw,
    result: call.output,
    // The host's original description, reported as what was sent. `promptByteIdentical` checks it
    // against the case's own prompt *and* looks for it verbatim inside `requestText`, so a
    // mismatch between these two is caught rather than averaged.
    promptSent: request.prompt,
    requestText: call.requestText,
    assemblyVersion: call.inputAssemblyVersion,
    answersAssembled: request.answers,
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
 * Re-exported so the error type the seam contract names is reachable from here.
 *
 * The frozen seam requires a thrower to carry `rawResponses` and `usage`; `EventIdentityError`
 * already does, which is why this adapter rethrows nothing and catches nothing. A `try` here would
 * be the place a paid response gets swallowed.
 */
export { EventIdentityError };
