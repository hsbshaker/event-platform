import { describe, expect, it } from "vitest";

import { MODELS } from "./models";
import { costOf, MAX_OUTPUT_TOKENS, MEASURED_COST_USD, PRICES, RESERVATION_USD } from "./pricing";

/** `spec.md §9.6`, §10; prices from Phase 3 validation (`scripts/phase-3/lib.mjs`). */
describe("model pricing", () => {
  it("prices every pinned model", () => {
    for (const model of Object.values(MODELS)) expect(PRICES[model], model).toBeDefined();
  });

  it("prices text calls with cached input and reasoning billed as output", () => {
    // 3,000 input of which 1,000 cached, 500 output (reasoning included) on GPT 6.1 Sol.
    expect(
      costOf({
        model: "gpt-6.1-sol",
        inputTokens: 3000,
        cachedInputTokens: 1000,
        outputTokens: 500,
        reasoningTokens: 200,
      }),
    ).toBeCloseTo((2000 * 2 + 1000 * 0.1 + 500 * 10) / 1e6, 12);
    expect(costOf({ model: "gpt-6-luna", inputTokens: 800, outputTokens: 120 })).toBeCloseTo(
      (800 * 0.1 + 120 * 0.5) / 1e6,
      12,
    );
  });

  it("prices artwork by text input, image input and image output", () => {
    // A Phase 3 artwork: ≈ 2,000 output tokens at `high`, ≈ $0.06.
    expect(
      costOf({
        model: "gpt-image-2.5-sunburst-2026-09-08",
        inputTokens: 1400,
        imageInputTokens: 1000,
        outputTokens: 2000,
      }),
    ).toBeCloseTo((400 * 5 + 1000 * 8 + 2000 * 30) / 1e6, 12);
  });

  it("charges nothing for moderation and ignores missing or nonsensical counts", () => {
    expect(costOf({ model: "omni-moderation-latest" })).toBe(0);
    expect(costOf({ model: "gpt-6.1-sol" })).toBe(0);
    expect(costOf({ model: "gpt-6.1-sol", inputTokens: -5, outputTokens: Number.NaN })).toBe(0);
    // More cached tokens than input tokens cannot make the cost negative.
    expect(
      costOf({ model: "gpt-6.1-sol", inputTokens: 10, cachedInputTokens: 50 }),
    ).toBeGreaterThanOrEqual(0);
  });

  it("refuses to price an unknown model", () => {
    expect(() => costOf({ model: "gpt-unknown", inputTokens: 1 })).toThrow(/no price/);
  });
});

describe("reservations", () => {
  it("hold well above every measured per-call cost", () => {
    for (const [operation, measured] of Object.entries(MEASURED_COST_USD)) {
      const reserved = RESERVATION_USD[operation as keyof typeof RESERVATION_USD];
      if (measured === 0) expect(reserved, operation).toBe(0);
      else expect(reserved, operation).toBeGreaterThanOrEqual(5 * measured);
    }
  });

  it("cover a structured call that uses its whole output ceiling", () => {
    const text = PRICES[MODELS.text] as { output: number };
    const facts = PRICES[MODELS.facts] as { output: number };
    expect(RESERVATION_USD.event_identity).toBeGreaterThan(
      (MAX_OUTPUT_TOKENS.event_identity * text.output) / 1e6,
    );
    expect(RESERVATION_USD.card_design).toBeGreaterThan(
      (MAX_OUTPUT_TOKENS.card_design * text.output) / 1e6,
    );
    expect(RESERVATION_USD.card_art_inspection).toBeGreaterThan(
      (MAX_OUTPUT_TOKENS.card_art_inspection * text.output) / 1e6,
    );
    expect(RESERVATION_USD.structured_extraction).toBeGreaterThan(
      (MAX_OUTPUT_TOKENS.structured_extraction * facts.output) / 1e6,
    );
  });

  it("put a measured card at about $0.08 and let the $20 ceiling cover many cards in flight", () => {
    const card =
      MEASURED_COST_USD.event_identity +
      MEASURED_COST_USD.structured_extraction +
      MEASURED_COST_USD.card_design +
      MEASURED_COST_USD.card_art +
      MEASURED_COST_USD.card_art_inspection;
    expect(card).toBeCloseTo(0.0761, 4);
    // The largest single reservation leaves room for dozens of calls in flight under $20.
    expect(20 / Math.max(...Object.values(RESERVATION_USD))).toBeGreaterThanOrEqual(50);
  });
});
