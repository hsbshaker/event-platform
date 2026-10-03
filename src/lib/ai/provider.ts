/**
 * Thin model-provider boundary — docs/technology-decisions.md §8, spec.md §9.1.
 *
 * These three capabilities are the only frontier creative operations in MVP.
 * Provider SDK calls, model names, request formatting, usage parsing and
 * request IDs live behind them. The card compiler (text fit, ink contrast) is
 * NOT part of this layer: it is deterministic application code.
 *
 * Generation stays unimplemented until spend controls exist
 * (docs/development-plan.md, principle 4). Until then `getAiProvider()` throws,
 * so no code path can call a model by accident (spec.md §32 #4).
 */

/** Wire shapes are the canonical JSON Schemas in docs/model-schemas/. Phase 4 types them narrowly. */
export type EventIdentity = Record<string, unknown>;
export type CardDesign = Record<string, unknown>;
export type CardArt = { mimeType: string; bytes: Uint8Array };

export type ModelOperation = "event_identity" | "card_design" | "card_art";

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
  /** Parsed output; the application still runs the canonical schema validator (docs/model-contracts.md). */
  output: T;
  usage: ModelUsage;
}

export interface GenerateEventIdentityInput {
  prompt: string;
  inspiration?: { mimeType: string; bytes: Uint8Array }[];
}

export interface GenerateCardDesignInput {
  eventIdentity: EventIdentity;
  eventFacts: Record<string, string>;
  previousDirections?: Record<string, unknown>[];
  feedback?: string;
  /** Present only on the single allowed re-prompt for schema-invalid output. */
  reprompt?: { kind: "schema"; feedback: string };
}

export interface GenerateCardArtInput {
  artBrief: Record<string, unknown>;
  layout: string;
  aspect: "5:7";
}

export interface AiProvider {
  generateEventIdentity(input: GenerateEventIdentityInput): Promise<ModelResult<EventIdentity>>;
  generateCardDesign(input: GenerateCardDesignInput): Promise<ModelResult<CardDesign>>;
  generateCardArt(input: GenerateCardArtInput): Promise<ModelResult<CardArt>>;
}

export function getAiProvider(): AiProvider {
  throw new Error("AI provider is not configured before Phase 4 (docs/development-plan.md).");
}
