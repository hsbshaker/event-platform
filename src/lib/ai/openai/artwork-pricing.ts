/**
 * What an artwork request costs, from the usage the provider reports.
 *
 * Rates are per-model and dated, because they change and because a cost recorded against a rate
 * nobody wrote down is a number with no provenance. Each entry names where it came from and when
 * it was read; a model whose rate is not in this table has no cost, and `null` is honest where a
 * guess would not be (`src/lib/ai/visual-art/spend.ts` settles an unknown cost at the full
 * reservation rather than releasing it).
 *
 * # The part that is not knowable in advance
 *
 * OpenAI publishes per-million-token rates for the image models but **not** the number of output
 * tokens an image of a given size and quality consumes, and its own documentation says the
 * GPT Image 2 calculator does not estimate GPT Image 2.5 consumption. The Images API has no
 * max-output-tokens parameter either. So a *pre-call* bound is a reasoned one, not a provider-
 * enforced one, and the only hard protection against overspend is the batch ceiling plus the
 * number of requests allowed to start. That is why `ArtworkBatchBudget` debits the worst case
 * before the call rather than reconciling afterwards.
 */

export interface ArtworkModelRates {
  /** USD per 1M input text tokens. */
  readonly textInputPerMillion: number;
  /** USD per 1M cached input text tokens. */
  readonly cachedTextInputPerMillion: number;
  /** USD per 1M input image tokens. Zero are sent by a pure generation request. */
  readonly imageInputPerMillion: number;
  /** USD per 1M output (image) tokens. */
  readonly outputPerMillion: number;
  /** Where these numbers came from, and when they were read. */
  readonly source: string;
}

export const ARTWORK_MODEL_RATES: Readonly<Record<string, ArtworkModelRates>> = {
  "gpt-image-2.5-sunburst-2026-09-08": {
    textInputPerMillion: 5,
    cachedTextInputPerMillion: 1.25,
    imageInputPerMillion: 8,
    outputPerMillion: 30,
    source:
      "developers.openai.com/api/docs/pricing and the gpt-image-2.5-sunburst model page, " +
      "read 2026-09-19: text input $5.00/1M (cached $1.25), image input $8.00/1M (cached $2.00), " +
      "image output $30.00/1M. Per-image token counts are not published for this model.",
  },
};

export interface ArtworkUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly inputTextTokens: number;
  readonly inputImageTokens: number;
}

/**
 * Cost in USD from reported usage, or `null` when this model has no recorded rate.
 *
 * Uncached text is billed at the text rate, cached text at the cached rate, and input image tokens
 * at the image rate — a pure generation request sends none, but an edit would, and pricing that
 * silently ignored them would under-report the moment one is used.
 */
export function artworkCostUsd(model: string, usage: ArtworkUsage): number | null {
  const rates = ARTWORK_MODEL_RATES[model];
  if (!rates) return null;
  const uncachedText = Math.max(0, usage.inputTextTokens - usage.cachedInputTokens);
  return (
    (uncachedText * rates.textInputPerMillion) / 1_000_000 +
    (usage.cachedInputTokens * rates.cachedTextInputPerMillion) / 1_000_000 +
    (usage.inputImageTokens * rates.imageInputPerMillion) / 1_000_000 +
    (usage.outputTokens * rates.outputPerMillion) / 1_000_000
  );
}

/**
 * The largest number of output tokens a given ceiling can pay for, after reserving for text input.
 *
 * Used to state a pre-call bound in terms the rate card actually fixes: "this ceiling covers up to
 * N output tokens" is checkable, where "this image will cost $X" is not, for the reason in the
 * header.
 */
export function outputTokensAffordable(
  model: string,
  ceilingUsd: number,
  assumedTextInputTokens: number,
): number | null {
  const rates = ARTWORK_MODEL_RATES[model];
  if (!rates) return null;
  const textCost = (assumedTextInputTokens * rates.textInputPerMillion) / 1_000_000;
  const remaining = ceilingUsd - textCost;
  if (remaining <= 0) return 0;
  return Math.floor((remaining / rates.outputPerMillion) * 1_000_000);
}
