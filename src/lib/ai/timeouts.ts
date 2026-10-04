import type { ModelOperation } from "./provider";

/**
 * Per-request timeouts, one per metered operation, well above the Phase 3 p75 latencies (identity
 * 14 s, design 13 s, art 33 s; `docs/model-evals/phase-3-validation.md`).
 *
 * One table for two readers: the provider implementation aborts a request at its timeout, and
 * the meter refuses a call that could not finish by its generation's deadline
 * (`meter.server.ts`, `MeterContext.deadline`), so no call outlives the function it runs in
 * (`docs/technology-decisions.md §8.1`, "Generation execution").
 */
export const REQUEST_TIMEOUT_MS: Readonly<Record<ModelOperation, number>> = {
  event_identity: 60_000,
  structured_extraction: 30_000,
  card_design: 60_000,
  card_art: 120_000,
  card_art_inspection: 30_000,
  card_art_moderation: 30_000,
};
