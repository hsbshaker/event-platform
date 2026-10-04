/**
 * Thin model-provider boundary — docs/technology-decisions.md §8, spec.md §9.1.
 *
 * These three capabilities are the only frontier creative operations in MVP.
 * Provider SDK calls, model names, request formatting, usage parsing and
 * request IDs live behind them. The card compiler (text fit, ink contrast) is
 * NOT part of this layer: it is deterministic application code.
 *
 * Generation stays unimplemented until spend controls exist
 * (docs/development-plan.md, principle 3). Until then `getAiProvider()` throws,
 * so no code path can call a model by accident (spec.md §32 #4).
 */

import type { ArtMode } from "@/lib/card/art-modes";
import type { CardShape } from "@/lib/card/shapes";

/** Wire shapes are the canonical JSON Schemas in docs/model-schemas/. Phase 5 types them narrowly. */
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
  /** Present only on an allowed re-prompt, at most once per kind (docs/model-contracts.md §5.3). */
  // `provider-refusal`: the image provider refused a brand or character homage; the new design
  // evokes the character's world rather than its signature look (spec.md §7.6).
  reprompt?: {
    kind: "schema" | "wording" | "repeat-direction" | "provider-refusal";
    feedback: string;
  };
}

export interface GenerateCardArtInput {
  artBrief: Record<string, unknown>;
  /** Selects the mode instruction and the crop rule (`ART_MODE_FIT`, docs/card-system.md §2.4). */
  artMode: ArtMode;
  layout: string;
  /** The raster's proportion is derived from the shape (`proportionOf`), never passed beside it. */
  shape: CardShape;
  /**
   * On a shape switch only: the design's own earlier artwork, so the subject stays the same.
   * Never a host upload or inspiration image (spec.md §7.6a, §32 #17).
   */
  reference?: CardArt;
}

export interface AiProvider {
  generateEventIdentity(input: GenerateEventIdentityInput): Promise<ModelResult<EventIdentity>>;
  generateCardDesign(input: GenerateCardDesignInput): Promise<ModelResult<CardDesign>>;
  generateCardArt(input: GenerateCardArtInput): Promise<ModelResult<CardArt>>;
}

export function getAiProvider(): AiProvider {
  throw new Error("AI provider is not configured before Phase 5 (docs/development-plan.md).");
}
