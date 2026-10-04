/**
 * Model prices, the cost of a call from its usage, and what each call reserves against the daily
 * spend ceiling while it runs (`spec.md §9.6`, §10; `docs/technology-decisions.md §8.1`).
 *
 * Prices are ported from Phase 3 validation (`scripts/phase-3/lib.mjs`: USD per 1M tokens, from the
 * provider's model pages on 2026-10-04). A price or model change is an edit here.
 */
import { MODELS } from "./models";
import type { ModelId } from "./models";
import type { ModelOperation } from "./provider";

interface TextPrice {
  kind: "text";
  input: number;
  cachedInput: number;
  output: number;
}
interface ImagePrice {
  kind: "image";
  textInput: number;
  imageInput: number;
  imageOutput: number;
}
interface FreePrice {
  kind: "free";
}

/** USD per 1M tokens. */
export const PRICES: Readonly<Record<ModelId, TextPrice | ImagePrice | FreePrice>> = {
  [MODELS.text]: { kind: "text", input: 2, cachedInput: 0.1, output: 10 },
  [MODELS.facts]: { kind: "text", input: 0.1, cachedInput: 0.01, output: 0.5 },
  [MODELS.image]: { kind: "image", textInput: 5, imageInput: 8, imageOutput: 30 },
  [MODELS.moderation]: { kind: "free" },
};

/**
 * Token usage as the provider reports it. For a text model `inputTokens` includes the cached ones
 * and `outputTokens` the reasoning ones (billed as output); for an image model `inputTokens`
 * includes the image-input ones.
 */
export interface TokenUsage {
  model: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  imageInputTokens?: number;
  /** Images produced. */
  imageUnits?: number;
}

const count = (v: number | undefined) => (v !== undefined && Number.isFinite(v) && v > 0 ? v : 0);

/** USD cost of one call from its reported usage. Throws for a model without a price. */
export function costOf(usage: TokenUsage): number {
  const price = (PRICES as Readonly<Record<string, TextPrice | ImagePrice | FreePrice>>)[
    usage.model
  ];
  if (!price) throw new Error(`no price for model ${usage.model}`);
  const input = count(usage.inputTokens);
  const output = count(usage.outputTokens);
  switch (price.kind) {
    case "free":
      return 0;
    case "text": {
      const cached = Math.min(count(usage.cachedInputTokens), input);
      return (
        ((input - cached) * price.input + cached * price.cachedInput + output * price.output) / 1e6
      );
    }
    case "image": {
      const imageIn = Math.min(count(usage.imageInputTokens), input);
      return (
        ((input - imageIn) * price.textInput +
          imageIn * price.imageInput +
          output * price.imageOutput) /
        1e6
      );
    }
  }
}

/**
 * Output-token ceilings sent with every structured call (`max_output_tokens`, reasoning
 * included), so each call's cost has an upper bound its reservation covers. Far above what Phase 3
 * measured; a response that reaches one comes back incomplete and is treated as invalid output.
 */
export const MAX_OUTPUT_TOKENS = {
  event_identity: 12_000,
  structured_extraction: 4_000,
  card_design: 12_000,
  card_art_inspection: 4_000,
} as const satisfies Partial<Record<ModelOperation, number>>;

/**
 * What one call reserves against the daily ceiling before it is made (`reserve_model_spend`), in
 * USD. Conservative on purpose: the ceiling holds exactly only while no call costs more than it
 * reserved (a call that does is still booked in full, `settle_model_spend`).
 *
 * - Text calls: the output ceiling above at the output price, plus a generous input allowance
 *   (system prompt, event data and, for Event Identity, up to six inspiration images) at the
 *   uncached input price.
 * - Artwork: Sunburst `high` at 1440 × 2016 measured about 2,000 output tokens (≈ $0.06); the
 *   reservation covers six times that plus a reference image on a shape switch.
 * - Moderation is free; its reservation of zero still requires the day to be under the ceiling.
 */
export const RESERVATION_USD: Readonly<Record<ModelOperation, number>> = {
  // 40k input × $2 + 12k output × $10, per 1M.
  event_identity: 0.2,
  // 10k input × $0.1 + 4k output × $0.5, per 1M (≈ $0.003).
  structured_extraction: 0.01,
  // 30k input × $2 + 12k output × $10, per 1M.
  card_design: 0.18,
  card_art: 0.4,
  // 10k input × $2 + 4k output × $10, per 1M.
  card_art_inspection: 0.06,
  card_art_moderation: 0,
};

/**
 * Per-call cost measured in Phase 3 validation (`docs/model-evals/phase-3-validation.md`): about
 * $0.08 per card. For reference, and so a test can hold every reservation well above it.
 */
export const MEASURED_COST_USD: Readonly<Record<ModelOperation, number>> = {
  event_identity: 0.004,
  structured_extraction: 0.0001,
  card_design: 0.007,
  card_art: 0.06,
  card_art_inspection: 0.005,
  card_art_moderation: 0,
};
