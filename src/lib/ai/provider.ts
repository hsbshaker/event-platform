/**
 * Thin model-provider boundary — docs/technology-decisions.md §8, spec.md §9.1.
 *
 * The capabilities below are the only model calls in MVP: the three creative operations
 * (`generateEventIdentity`, `generateCardDesign`, `generateCardArt`) and the cheaper or free calls
 * the spec allows beside them (fact extraction, §7.5 and §9.2; the artwork's safety moderation and
 * inspection, §7.8). Provider SDK calls, model names, request formatting, usage parsing and
 * request IDs live behind them. The card compiler (validation, wording check, ink, `layoutCard`) is
 * NOT part of this layer: it is deterministic application code and never calls a model.
 *
 * **No model call without spend controls** (docs/development-plan.md, principle 3; spec.md §10,
 * §32 #4). Every method takes a `MeterContext` naming a running generation that an event member
 * started (`start_generation`), and every request goes through the meter
 * (`meter.server.ts` `metered`), which refuses before any network call when generation is
 * switched off, the generation is no longer running, or the daily spend ceiling would be passed,
 * and records every call it lets through. The implementation's request functions are not exported,
 * so there is no path to the provider around it.
 */

import { createOpenAiProvider } from "./openai.server";
import type { ArtworkInspection, ArtworkModeration } from "./artwork-inspection";
import type { EventIdentity } from "./event-identity";
import type { ExtractedFacts } from "./fact-extraction";
import type { TokenUsage } from "./pricing";
import type { ArtMode } from "@/lib/card/art-modes";
import type { CardDesign } from "@/lib/card/design";
import type { CardLayoutId } from "@/lib/card/layouts";
import type { Rendering } from "@/lib/card/renderings";
import type { CardShape } from "@/lib/card/shapes";
import type { TypographyPairingId } from "@/lib/card/typography";

export type { ArtworkInspection, ArtworkModeration, CardDesign, EventIdentity, ExtractedFacts };

export type CardArt = { mimeType: string; bytes: Uint8Array };

/** Every metered operation; mirrors the database enum `model_operation` (`database.types.ts`). */
export type ModelOperation =
  | "event_identity"
  | "structured_extraction"
  | "card_design"
  | "card_art"
  | "card_art_inspection"
  | "card_art_moderation";

/**
 * Who a model call is for. All three are required: there is no model call for an anonymous user
 * (spec.md §32 #3, #4), and none outside a generation that passed the event and host caps.
 */
export interface MeterContext {
  eventId: string;
  /** The acting owner or co-host. */
  userId: string;
  /** The running generation (`start_generation`) this call belongs to. */
  generationId: string;
  /** The generation round, when known (spec.md §9.6). */
  round?: number | null;
  /**
   * Epoch milliseconds after which no model call of this generation may still be running: the
   * meter refuses a call whose request timeout (`REQUEST_TIMEOUT_MS`) would take it past this
   * (`docs/technology-decisions.md §8.1`, "Generation execution"). Absent: no deadline.
   */
  deadline?: number;
}

export interface ModelUsage extends TokenUsage {
  provider: string;
  providerRequestId?: string;
  /** Cost computed from the reported usage (`pricing.ts` `costOf`). */
  costUsd: number;
  latencyMs: number;
}

export interface ModelResult<T> {
  /** Raw text as returned by the provider, persisted verbatim where the contract asks for it. */
  raw: string;
  /** Output validated against the canonical schema; the catalog and fact checks are the pipeline's. */
  output: T;
  usage: ModelUsage;
}

export interface GenerateEventIdentityInput {
  /** The host's raw prompt. Only this call ever reads it (spec.md §7.5). */
  prompt: string;
  inspiration?: { mimeType: string; bytes: Uint8Array }[];
  /** Try another direction: the host's feedback and the identity it revises (model-contracts §4.1). */
  redesignFeedback?: string;
  previousIdentity?: EventIdentity;
  /**
   * A random starting point for the theme when the host leaves the look to us (`drawThemeSeed`,
   * `event_identity_v6`); the identity ignores it whenever the host gave a creative cue.
   */
  themeSeed?: string;
  /** The one repair retry after invalid output (model-contracts §9): the validation problems. */
  repairFeedback?: string;
}

export interface ExtractEventFactsInput {
  /** The host's raw prompt. */
  prompt: string;
}

/** An earlier direction for this event, as the card-design call sees it (model-contracts §5.2). */
export interface PreviousDirection {
  name: string;
  layout: CardLayoutId;
  artMode: ArtMode;
  primary: TypographyPairingId;
  subject: string;
  /** The brief's rendering and aesthetic (`card_design_v2`), so another direction can change them. */
  rendering: Rendering;
  aesthetic: string;
}

export interface GenerateCardDesignInput {
  eventIdentity: EventIdentity;
  eventFacts: Record<string, string>;
  previousDirections?: PreviousDirection[];
  /**
   * The rendering the orchestration drew at random from those this event has not used
   * (`suggestRendering`); the design follows it unless the identity strongly points elsewhere.
   */
  suggestedRendering?: Rendering;
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
  artBrief: CardDesign["artBrief"];
  /** Selects the mode instruction and the crop rule (`ART_MODE_FIT`, docs/card-system.md §2.4). */
  artMode: ArtMode;
  layout: CardLayoutId;
  /** The raster's proportion is derived from the shape (`proportionOf`), never passed beside it. */
  shape: CardShape;
  /**
   * On a shape switch only: the design's own earlier artwork, so the subject stays the same.
   * Never a host upload or inspiration image (spec.md §7.6a, §32 #17).
   */
  reference?: CardArt;
}

export interface AiProvider {
  generateEventIdentity(
    ctx: MeterContext,
    input: GenerateEventIdentityInput,
  ): Promise<ModelResult<EventIdentity>>;
  extractEventFacts(
    ctx: MeterContext,
    input: ExtractEventFactsInput,
  ): Promise<ModelResult<ExtractedFacts>>;
  generateCardDesign(
    ctx: MeterContext,
    input: GenerateCardDesignInput,
  ): Promise<ModelResult<CardDesign>>;
  generateCardArt(ctx: MeterContext, input: GenerateCardArtInput): Promise<ModelResult<CardArt>>;
  moderateCardArt(ctx: MeterContext, art: CardArt): Promise<ModelResult<ArtworkModeration>>;
  inspectCardArt(ctx: MeterContext, art: CardArt): Promise<ModelResult<ArtworkInspection>>;
}

/**
 * The provider (server-only). Every method is metered; with generation switched off
 * (`GENERATION_ENABLED`) every method refuses before any network call.
 */
export function getAiProvider(): AiProvider {
  return createOpenAiProvider();
}
