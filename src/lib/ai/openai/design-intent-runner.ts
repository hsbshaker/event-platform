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
 * # The one piece of real work this adapter does, and why it has to be here
 *
 * The premise stage is a **batch** call: one request produces the three premises that only mean
 * something as a set (`docs/designintent-sibling-convergence.md §7`). The frozen harness fans out
 * **per sibling** — `tests/eval/design-intent.eval.ts` loops `plan.siblings` and calls
 * `run({ identity, assignment, siblingIndex })` — and that file is hashed byte for byte by
 * `design-intent.test.ts`, with no permitted edit at all.
 *
 * So the batch boundary has to be reconstructed on this side of the seam: the premise set is
 * computed **once per identity** and the three calls for that identity each take their own member
 * of it. Calling the premise stage per sibling instead would produce three unrelated sets and
 * destroy the property the stage exists to create, so memoizing is not an optimisation here — it is
 * the correctness condition.
 *
 * Production does not need it and does not use it. There, an orchestrator calls
 * `generateConceptPremiseSet` once, persists the set, and passes `premises[k]` into sibling `k`;
 * the memo below is an artifact of a per-sibling seam, which is why it lives in the adapter rather
 * than in a production module where a process-lifetime cache would be a footgun.
 *
 * **The one cast, and why it is here rather than in the harness.** The frozen seam hands over a
 * plain `EventIdentity`: `design-intent-evidence.ts` says so, and says why — the runner has
 * already proved the brief authoritative through `assertAuthoritative`, and *"the brand is a
 * compile-time guarantee about a call site, and re-declaring it here would only mean the seam's
 * implementer had to launder it again."* The laundering is that sentence's own consequence, done
 * once, in the open, in the adapter rather than inside production code that must keep requiring
 * the brand.
 *
 * It catches nothing from `generateDesignIntent` and rethrows nothing. `DesignIntentError` already
 * carries `rawResponses` and `usage`, which is exactly what the seam contract requires a thrower to
 * carry; a `try` there would be the place a paid response gets swallowed.
 */
import { createHash } from "node:crypto";

import type { ConceptPremiseSet } from "@/lib/ai/concept-premise/contract";
import type { EventIdentity } from "@/lib/ai/event-identity/contract";
import type { AuthoritativeIdentity } from "@/lib/ai/event-identity/lifecycle";
import type { DesignIntentCallRunner } from "@/lib/ai/evals/design-intent-evidence";

import {
  ConceptPremiseError,
  generateConceptPremiseSet,
  type ConceptPremiseCallResult,
} from "./concept-premise";
import { DesignIntentError, generateDesignIntent } from "./design-intent";

/**
 * A stable digest of a brief, with object keys ordered, so two renderings of one identity key the
 * same entry and two different identities never collide.
 *
 * Key order is normalized because `JSON.stringify` preserves insertion order: a brief rebuilt in a
 * different field order is the same brief, and hashing it differently would buy a second premise
 * call for one batch.
 */
function identityKey(identity: EventIdentity): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, canonical(child)]),
    );
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(identity)))
    .digest("hex");
}

/**
 * One in-flight or settled premise call per identity.
 *
 * The **promise** is stored rather than the result, so three concurrent siblings share one call
 * rather than racing to make three. A rejection is cached too, deliberately: the same brief would
 * fail the same way, and paying three times to learn that is money spent to produce one fact.
 */
const premiseSets = new Map<string, Promise<ConceptPremiseCallResult>>();

/** Test seam: the harness runs once per process, but a suite does not. */
export function resetPremiseSetCache(): void {
  premiseSets.clear();
}

/**
 * What the premise call cost and what it separated on, on one parseable line.
 *
 * The frozen harness's `DesignIntentTelemetry` has no field for a second call's usage and cannot
 * grow one, so the premise stage would otherwise be invisible in a run's evidence — and a model
 * call nobody can see the price of is exactly what `docs/phase-4b-plan.md §A.5` refuses. Writing it
 * to stdout keeps the frozen file untouched and still leaves the operator a record: capture the run
 * with `tee`, and the per-batch call count, latency, token use and retries are all there.
 *
 * It is a known limitation rather than a solution, and it is recorded as one in
 * `docs/designintent-sibling-convergence.md`.
 */
export const PREMISE_TELEMETRY_PREFIX = "concept-premise-telemetry ";

function reportPremiseTelemetry(key: string, call: ConceptPremiseCallResult): void {
  process.stdout.write(
    PREMISE_TELEMETRY_PREFIX +
      JSON.stringify({
        identityKey: key.slice(0, 12),
        promptVersion: call.promptVersion,
        schemaVersion: call.schemaVersion,
        inputAssemblyVersion: call.inputAssemblyVersion,
        model: call.usage.model,
        latencyMs: call.usage.latencyMs,
        providerResponses: call.usage.providerResponses,
        providerAttempts: call.usage.providerAttempts,
        transientRetries: call.usage.transientRetries,
        repairRetries: call.usage.repairRetries,
        repairedClass: call.usage.repairedClass ?? null,
        inputTokens: call.usage.inputTokens ?? null,
        cachedInputTokens: call.usage.cachedInputTokens ?? null,
        outputTokens: call.usage.outputTokens ?? null,
        reasoningTokens: call.usage.reasoningTokens ?? null,
        separatingAxes: call.telemetry.separatingAxes,
        constrainedAxes: call.telemetry.constrainedAxes,
        ideaOverlap: call.telemetry.ideaOverlap.map((pair) => Number(pair.value.toFixed(3))),
        experienceOverlapAdvisories: call.telemetry.experienceOverlapAdvisories,
        titles: call.premiseSet.premises.map((premise) => premise.title),
      }) +
      "\n",
  );
}

/**
 * The batch's premise set, computed once per brief.
 *
 * On the second and third sibling of a failed batch the error is **restated without the paid
 * response attached**. One premise call was made and one response was paid for; re-throwing the
 * same object would journal that response three times, and an evidence file that triple-counts a
 * paid call is worse than one that omits it. Sibling 0 carries it, the other two say where it is.
 */
async function premiseSetFor(identity: EventIdentity): Promise<ConceptPremiseSet> {
  const key = identityKey(identity);
  const existing = premiseSets.get(key);
  if (existing) {
    try {
      return (await existing).premiseSet;
    } catch (error) {
      if (error instanceof ConceptPremiseError) {
        throw new ConceptPremiseError(
          `${error.message} [response and usage are recorded against the first sibling of this ` +
            "batch; one premise call was made for all three]",
          error.kind,
          error.issues,
          undefined,
          [],
          error.dominantClass,
        );
      }
      throw error;
    }
  }

  const pending = generateConceptPremiseSet({ identity: identity as AuthoritativeIdentity });
  premiseSets.set(key, pending);
  const call = await pending;
  reportPremiseTelemetry(key, call);
  return call.premiseSet;
}

/**
 * A live provider call per invocation — now up to two on the first sibling of a batch, and one on
 * the other two. Nothing here guards against being run: the guards are the frozen runner's
 * module-scope refusals and the explicit authorization the plan requires before any 4C set runs.
 */
export const designIntentRunner: DesignIntentCallRunner = async (request) => {
  const set = await premiseSetFor(request.identity);
  const premise = set.premises[request.siblingIndex];
  if (!premise) {
    // Unreachable through the frozen harness, which iterates the planner's own three siblings, and
    // a thrown error rather than a fallback because there is no honest substitute: a DesignIntent
    // authored without its premise is the output the premise stage exists to replace.
    throw new Error(
      `no premise for sibling index ${request.siblingIndex}: the set holds ` +
        `${set.premises.length}`,
    );
  }

  const call = await generateDesignIntent({
    identity: request.identity as AuthoritativeIdentity,
    assignment: request.assignment,
    premise,
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

/** Re-exported so the error types the seam contract names are reachable from here. */
export { ConceptPremiseError, DesignIntentError };
