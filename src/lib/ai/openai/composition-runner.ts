import "server-only";

/**
 * The production Composition runner: the adapter, shaped for the orchestrator.
 *
 * `runCompositionStage` takes a port rather than importing the provider, so the compile-and-persist
 * sequence can be driven without a network. This is the one production implementation of that port,
 * and it is deliberately thin — a shape translation and nothing else.
 *
 * # Where the three re-prompts live, and why they all live in one place
 *
 * `docs/model-contracts.md §6.3` allows exactly three, once each per candidate: a schema-invalid
 * response, an attractive-token-cap violation, and a selector collision. **All three are spent
 * inside `generateComposition`**, which is why its `usage.reprompts` counts them separately and why
 * it takes a `collides` check rather than letting a caller re-prompt on its behalf.
 *
 * That has a consequence the orchestrator has to honour: by the time this function returns, both
 * allowances `compileConcept` could ask for are **already gone**. So the stage tells the compiler
 * they are spent, and the compiler neutralizes a surviving token violation deterministically
 * (logged as `planner`) and reports a surviving collision as `nearestSibling` instead of asking for
 * a fourth call. One counter, in one module, is the only way "once each" is a bound rather than an
 * aspiration.
 *
 * The collision check is still run twice, on purpose and not redundantly. The adapter checks the
 * **raw** tree, which is cheap and catches the obvious case before a headless render is paid for;
 * `compileConcept` checks the **canonical** tree after deterministic repair, which is the one
 * `§6.3` step 5 means and the one that decides. Repair can change a skeleton, so the second check
 * can disagree with the first — and when it does, the authoritative answer is the later one.
 */
import { generateComposition } from "./composition";
import type { CompositionCallResult } from "@/lib/ai/composition/contract";
import { COMPOSITION_OPERATION, type CompositionRunner } from "@/lib/generation/composition-stage";

/** Map the adapter's rich result onto the subset the lifecycle records. */
function attemptFrom(result: CompositionCallResult) {
  const usage = result.usage;
  return {
    tree: result.output,
    promptVersion: result.promptVersion,
    schemaVersion: result.schemaVersion,
    inputAssemblyVersion: result.inputAssemblyVersion,
    // Flattened to the column's own vocabulary. `design_concepts.fallback` is
    // `check (fallback in ('library'))`, and the richer telemetry — reason, seed, fixture,
    // attempts spent — is carried on the run row rather than the concept.
    fallback: result.fallback ? ("library" as const) : null,
    telemetry: {
      operation: COMPOSITION_OPERATION,
      provider: usage.provider,
      model: usage.model,
      latencyMs: usage.latencyMs,
      promptVersion: result.promptVersion,
      schemaVersion: result.schemaVersion,
      inputAssemblyVersion: result.inputAssemblyVersion,
      providerRequestId: usage.providerRequestId ?? null,
      inputTokens: usage.inputTokens ?? null,
      cachedInputTokens: usage.cachedInputTokens ?? null,
      cacheWriteInputTokens: usage.cacheWriteInputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      reasoningTokens: usage.reasoningTokens ?? null,
      schemaValidFirstCall: usage.schemaValidFirstCall,
      primitiveSetVersion: result.primitiveSetVersion,
      // Each re-prompt kind is kept separate rather than summed: CO-01, CO-06 and CO-07 measure
      // different things, and a total would answer none of them.
      reprompts: {
        ...usage.reprompts,
        transientRetries: usage.transientRetries,
      } as unknown as import("@/lib/supabase/database.types").Json,
      compilerRepairs: result.repairs as unknown as import("@/lib/supabase/database.types").Json,
      fallback: result.fallback ? result.fallback.reason : null,
    },
  };
}

export const openAiCompositionRunner: CompositionRunner = async (request) => {
  const result = await generateComposition({
    brief: request.brief,
    contentProfile: request.contentProfile,
    capabilities: request.capabilities,
    designIntent: request.designIntent,
    directive: request.directive as never,
    forbiddenTokens: request.forbiddenTokens,
    seed: request.seed,
    ...(request.collides ? { collides: request.collides } : {}),
  });
  return attemptFrom(result);
};
