/**
 * Thin model-provider boundary — docs/technology-decisions.md §8, spec.md §9.1.
 *
 * These three capabilities are the only frontier creative operations in MVP.
 * Provider SDK calls, model names, request formatting, usage parsing and
 * request IDs live behind them. The compiler/renderer is NOT part of this
 * layer (spec.md §9.3): validation, repair, palette, layout and geometry
 * verification are deterministic application code.
 *
 * Phase 4 supplies the implementation together with spend controls
 * (docs/development-plan.md, principle 4). Until then `getAiProvider()` throws,
 * so no code path can call a model by accident (spec.md §32 #4).
 */

import type { CarriedClarification, PriorRevision } from "@/lib/ai/openai/event-identity-input";

/** Wire shapes are the canonical JSON Schemas in docs/model-schemas/. Typed narrowly in Phase 4. */
export type EventIdentity = Record<string, unknown>;
export type DesignIntentResponse = Record<string, unknown>;
export type CompositionTree = Record<string, unknown>;

export type ModelOperation = "event_identity" | "design_intent" | "composition";

export interface ModelUsage {
  provider: string;
  providerRequestId?: string;
  model: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  costEstimateUsd?: number;
  latencyMs: number;
}

export interface ModelResult<T> {
  /** Raw text as returned by the provider, persisted verbatim for telemetry. */
  raw: string;
  /** Parsed JSON; the application still runs the canonical schema validator (docs/model-contracts.md §3). */
  output: T;
  usage: ModelUsage;
}

export interface GenerateEventIdentityInput {
  prompt: string;
  inspiration?: { mimeType: string; bytes: Uint8Array }[];
  /**
   * A rerun after one or more clarification rounds (`spec.md §7.6b`).
   *
   * Absent on a first call, and then the assembled request is `event_identity_input_v1` byte for
   * byte. Present on a rerun, carrying every answer still in scope together with the revisions
   * that asked the questions — the assembly reads each question out of its revision rather than
   * trusting a question string from the caller.
   */
  clarification?: {
    priorRevisions: PriorRevision[];
    answers: CarriedClarification[];
  };
}

export interface GenerateDesignIntentInput {
  eventIdentity: EventIdentity;
  /** Sibling-planner assignment; see spec.md §7.7. */
  diversityAssignment: Record<string, unknown>;
}

export interface GenerateCompositionInput {
  designIntent: DesignIntentResponse;
  capabilities: Record<string, boolean>;
  directive: Record<string, unknown>;
  /** Present only on the single allowed re-prompt for schema / token-cap / collision. */
  reprompt?: { kind: "schema" | "token-cap" | "collision"; feedback: string };
}

export interface AiProvider {
  generateEventIdentity(input: GenerateEventIdentityInput): Promise<ModelResult<EventIdentity>>;
  generateDesignIntent(
    input: GenerateDesignIntentInput,
  ): Promise<ModelResult<DesignIntentResponse>>;
  generateComposition(input: GenerateCompositionInput): Promise<ModelResult<CompositionTree>>;
}

export function getAiProvider(): AiProvider {
  throw new Error("AI provider is not configured before Phase 4 (docs/development-plan.md).");
}
