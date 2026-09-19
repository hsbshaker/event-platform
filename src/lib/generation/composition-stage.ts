import "server-only";

/**
 * One sibling's composition stage: call, compile, verify, persist, settle.
 *
 * This is the half of 4D that turns a DesignIntent into a real page, and it runs **per sibling,
 * independently**. `spec.md §7.10 #5` makes concept-level readiness canonical, so concept 0 may be
 * ready while 1 is still retrying and 2 is still in the browser. Nothing here waits for a sibling
 * it is not.
 *
 * # Where the three re-prompts live, and why not here
 *
 * `docs/model-contracts.md §6.3` allows exactly three, once each per candidate: a schema-invalid
 * response, an attractive-token-cap violation, and a selector collision. **All three are spent
 * inside `generateComposition`**, which is why it takes a `collides` check rather than letting a
 * caller re-prompt on its behalf, and why its `usage.reprompts` counts the three separately.
 *
 * So this stage calls the runner **once**, and tells `compileConcept` both of the allowances it
 * could ask for are already gone. The compiler then neutralizes a surviving token violation
 * deterministically — logged as `planner`, `§6.3` step 3 — and reports a surviving post-repair
 * collision as `nearestSibling` rather than asking for a fourth call. One counter in one module is
 * what makes "once each" a bound instead of an aspiration.
 *
 * Nothing else is ever re-prompted anywhere. Structural, coverage, capability, responsive, box,
 * motif-kind and fit defects are repaired deterministically, and a geometry failure is a failure —
 * not a reason to ask a model again (`spec.md §32 #21`). There is no critic loop, no quality
 * retry, and no path from a compile outcome back to the provider.
 *
 * # Why a port rather than a direct import
 *
 * The provider call arrives as a function. That keeps the stage testable without a network and
 * without mocking a module, and it keeps the compile-and-persist sequence — the part with the
 * ordering hazards — provable on its own.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`, `§31 — Renderer
 * proof`. Guardrails: `spec.md §32 #17`, `#18`, `#21`, `#24`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  Capabilities,
  CompositionTree,
  ContentProfile,
  SigInput,
} from "@/lib/renderer/composition";
import type { DesignIntent, Deviation, Presentation } from "@/lib/renderer/design-intent";
import type { AttractiveTokenId } from "@/lib/renderer/planner";
import type { CompositionBrief } from "@/lib/ai/composition/brief";
import { compileConcept, type RepromptsSpent } from "./compile-concept";
import { persistConcept } from "./persist-concept";
import { recordSiblingStageRun, settleSibling, type SiblingRunTelemetry } from "./batch";
import type { EventContent } from "@/components/event-renderer/contract";

type Admin = SupabaseClient<Database>;

/** `model_operation` for this stage's runs. */
export const COMPOSITION_OPERATION = "composition" as const;

/** What one Composition call needs. Assembled by the caller; this stage only forwards it. */
export interface CompositionRunnerRequest {
  readonly brief: CompositionBrief;
  readonly contentProfile: ContentProfile;
  readonly capabilities: Capabilities;
  readonly designIntent: DesignIntent;
  readonly directive: unknown;
  readonly directiveSentence: string;
  readonly forbiddenTokens: readonly AttractiveTokenId[];
  readonly seed: number;
  /**
   * The post-repair collision check, handed to the adapter so its own selector pass can spend the
   * one collision re-prompt (`docs/model-contracts.md §6.3` step 5). Absent means no selector runs
   * inside the call, and `compileConcept`'s authoritative check still runs after repair.
   */
  readonly collides?: (tree: CompositionTree) => readonly string[] | null;
}

/**
 * What the orchestrator needs back from one Composition call.
 *
 * Structural rather than the adapter's own result type: the adapter may carry more (raw texts,
 * per-response usage), and this is the subset the lifecycle reads. `fallback` is how a library page
 * stays attributable — `docs/model-contracts.md §8`: *"A library fallback is a valid, coherent page
 * and is recorded as such; it is never presented as a model composition in evaluation."*
 */
export interface CompositionAttempt {
  readonly tree: CompositionTree;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly inputAssemblyVersion: string;
  readonly fallback: "library" | null;
  readonly telemetry: SiblingRunTelemetry;
}

export type CompositionRunner = (request: CompositionRunnerRequest) => Promise<CompositionAttempt>;

export interface CompositionStageRequest {
  readonly batchId: string;
  readonly eventId: string;
  readonly round: number;
  readonly conceptIndex: number;
  readonly attempt: number;
  readonly designIntentArtifactId: string;
  readonly designIntent: DesignIntent;
  /** The card the deterministic set review resolved. Composition does not author one. */
  readonly presentation: Presentation;
  readonly priorDeviations?: readonly Deviation[];
  readonly designIntentPromptVersion: string;
  readonly designIntentSchemaVersion: string;
  readonly content: EventContent;
  readonly call: CompositionRunnerRequest;
  readonly tokenAllotment: Json;
  /** Siblings already settled in this batch, plus redesign history, for the selector. */
  readonly against?: readonly SigInput[];
  readonly signatureCategory?: string;
  readonly signatureTone?: string;
}

export type CompositionStageOutcome =
  | {
      readonly state: "ready";
      readonly conceptId: string;
      readonly resolvedSpecId: string;
      readonly canonical: CompositionTree;
      readonly nearestSibling: number;
      readonly fallback: "library" | null;
      readonly repromptsUsed: RepromptsSpent;
    }
  | {
      readonly state: "failed";
      /** `provider` covers a call that never returned a usable tree. */
      readonly kind: "provider" | "structure" | "geometry" | "infrastructure" | "persist";
      readonly detail: string;
      readonly repromptsUsed: RepromptsSpent;
    };

/**
 * Run one sibling's composition stage to a ready concept, or to an attributable failure.
 *
 * Never throws for a sibling-level problem: a rejected promise here would turn one sibling's
 * provider error into a batch-wide exception, and `§I`'s settlement reads what succeeded.
 */
export async function runCompositionStage(
  admin: Admin,
  runner: CompositionRunner,
  request: CompositionStageRequest,
): Promise<CompositionStageOutcome> {
  // Both allowances belong to the adapter (see the header), so the compiler is told they are
  // spent. That is what turns a surviving token violation into deterministic neutralization and a
  // surviving collision into a reported `nearestSibling`, instead of a fourth paid call.
  const spent: RepromptsSpent = { tokenCap: true, collision: true };

  let attempt: CompositionAttempt;
  try {
    attempt = await runner(request.call);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await recordSiblingStageRun(admin, {
      batchId: request.batchId,
      conceptIndex: request.conceptIndex,
      operation: COMPOSITION_OPERATION,
      attempt: request.attempt,
      success: false,
      run: providerFailureTelemetry(detail),
    });
    await settleSibling(admin, request.batchId, request.conceptIndex, false);
    return { state: "failed", kind: "provider", detail, repromptsUsed: spent };
  }

  // Recorded before anything can fail downstream: the response is paid for, and the ceiling reads
  // `generation_runs` as spend. Settling is a separate step, deliberately.
  const recorded = await recordSiblingStageRun(admin, {
    batchId: request.batchId,
    conceptIndex: request.conceptIndex,
    operation: COMPOSITION_OPERATION,
    attempt: request.attempt,
    success: true,
    run: attempt.telemetry,
  });

  const compiled = await compileConcept({
    tree: attempt.tree,
    designIntent: request.designIntent,
    capabilities: request.call.capabilities,
    content: request.content,
    seed: request.call.seed,
    forbiddenTokens: request.call.forbiddenTokens,
    presentation: request.presentation,
    ...(request.priorDeviations ? { priorDeviations: request.priorDeviations } : {}),
    ...(request.against ? { against: request.against } : {}),
    ...(request.signatureCategory !== undefined
      ? { signatureCategory: request.signatureCategory, signatureTone: request.signatureTone }
      : {}),
    spent,
  });

  if (compiled.state === "reprompt") {
    // Unreachable while `spent` is both true, and returned rather than thrown so an invariant
    // break degrades to one failed sibling instead of a batch-wide exception.
    await settleSibling(admin, request.batchId, request.conceptIndex, false);
    return {
      state: "failed",
      kind: "structure",
      detail: `compiler asked for a ${compiled.kind} re-prompt the provider had already spent`,
      repromptsUsed: spent,
    };
  }

  if (compiled.state === "failed") {
    await settleSibling(admin, request.batchId, request.conceptIndex, false);
    return { state: "failed", kind: compiled.kind, detail: compiled.detail, repromptsUsed: spent };
  }

  // Verified. Persist, then settle — in that order, so a sibling is never `succeeded` with no
  // concept behind it.
  try {
    const persisted = await persistConcept(admin, {
      eventId: request.eventId,
      round: request.round,
      conceptIndex: request.conceptIndex,
      designIntentArtifactId: request.designIntentArtifactId,
      designIntent: request.designIntent,
      presentation: request.presentation,
      compositionRaw: compiled.raw,
      compositionCanonical: compiled.canonical,
      compositionHash: compiled.compositionHash,
      capabilities: request.call.capabilities,
      contentProfile: request.call.contentProfile,
      directive: request.call.directive as Json,
      tokenAllotment: request.tokenAllotment,
      fallback: attempt.fallback,
      designIntentPromptVersion: request.designIntentPromptVersion,
      designIntentSchemaVersion: request.designIntentSchemaVersion,
      compositionPromptVersion: attempt.promptVersion,
      compositionSchemaVersion: attempt.schemaVersion,
      compositionInputAssemblyVersion: attempt.inputAssemblyVersion,
      spec: compiled.spec,
    });

    await settleSibling(
      admin,
      request.batchId,
      request.conceptIndex,
      true,
      recorded.runId ?? undefined,
    );

    return {
      state: "ready",
      conceptId: persisted.conceptId,
      resolvedSpecId: persisted.resolvedSpecId,
      canonical: compiled.canonical,
      nearestSibling: compiled.nearestSibling,
      fallback: attempt.fallback,
      repromptsUsed: spent,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await settleSibling(admin, request.batchId, request.conceptIndex, false);
    return { state: "failed", kind: "persist", detail, repromptsUsed: spent };
  }
}

/** Telemetry for a call that never returned a usable response. */
function providerFailureTelemetry(detail: string): SiblingRunTelemetry {
  return {
    operation: COMPOSITION_OPERATION,
    provider: "openai",
    model: "unknown",
    latencyMs: 0,
    promptVersion: "unknown",
    schemaVersion: "unknown",
    errorCode: detail.slice(0, 120),
  };
}
