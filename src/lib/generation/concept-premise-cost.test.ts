/**
 * The ConceptPremise cost bound, checked against its own inputs rather than against a memory of
 * them.
 *
 * The remediation adds a model call per batch, so it owes a bound for it and an honest end-to-end
 * number for the batch. `docs/phase-4b-plan.md` Part IV's obligation transfers unchanged:
 * *"`perAttemptMaxUsd` is a property of an attempt shape"* — inheriting DesignIntent's number, or
 * inventing one, are both refused.
 *
 * As with DesignIntent, each input is rebuilt rather than restated: the instruction file is measured
 * on disk, the user message is reassembled from the identity contract's own maxima, and the attempt
 * count is read from the boundary's own constants.
 *
 * Acceptance criteria: N/A — spend control. `docs/development-plan.md` principle 4.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CONCEPT_PREMISE_MAX_OUTPUT_TOKENS,
  CONCEPT_PREMISE_REASONING_EFFORT,
  CONCEPT_PREMISE_SERVICE_TIER,
  CONCEPT_PREMISE_STORE_RESPONSES,
  MAX_PROVIDER_ATTEMPTS_PER_CALL,
  MAX_TRANSIENT_RETRIES,
  CONCEPT_PREMISE_PASSES,
  REPAIR_FEEDBACK_MAX_BYTES,
  REPAIR_TURN_FRAMING_BYTES,
  repairFeedback,
  REPAIR_TURN_TEXT,
} from "@/lib/ai/openai/concept-premise";
import { assembleConceptPremiseUserMessage } from "@/lib/ai/openai/concept-premise-input";
import type { PremiseValidationIssue } from "@/lib/ai/concept-premise/validate";

import { PREMISE_FIXTURE_IDENTITY } from "../../../tests/fixtures/concept-premise";
import {
  assertProfileSupportsRequest,
  conceptBatchMaxUsd,
  conceptPremiseAttemptMaxUsd,
  conceptPremiseLogicalCallMaxUsd,
  CONCEPT_PREMISE_ATTEMPT_PROFILE_VERSION,
  FRAMING_TOKENS,
  INSTRUCTION_BYTES,
  PER_ATTEMPT_INPUT_TOKEN_BOUND,
  PER_ATTEMPT_OUTPUT_TOKEN_BOUND,
  REPAIR_OVERHEAD_TOKENS,
  WORST_USER_MESSAGE_BYTES,
} from "./concept-premise-cost";
import { designIntentBatchMaxUsd } from "./design-intent-cost";
import { GPT_5_6_SOL, UNVERIFIED_DEV_PROFILE } from "./identity-cost";

const ROOT = new URL("../../../", import.meta.url).pathname;
const MODEL = GPT_5_6_SOL.model;

describe("the inputs the bound rests on", () => {
  it("measures the instruction file, and leaves headroom without being generous about it", () => {
    const bytes = Buffer.byteLength(
      readFileSync(`${ROOT}docs/model-prompts/concept-premise.system.md`, "utf8"),
      "utf8",
    );
    expect(bytes).toBeLessThanOrEqual(INSTRUCTION_BYTES);
    // A stale allowance is not a safe one: if the file has shrunk far below it, the bound should be
    // re-derived deliberately rather than quietly carrying slack nobody chose.
    expect(bytes).toBeGreaterThan(INSTRUCTION_BYTES / 4);
  });

  it("bounds the user message by the DesignIntent bound, because it is a subset of it", () => {
    // Same brief, same `briefLines()`, no assignment block and no premise block — so the premise
    // request's worst message is strictly smaller than the DesignIntent request's, and reusing that
    // number errs upward. Reusing it also means a field added to the identity contract moves both
    // bounds at once instead of one of them.
    const message = assembleConceptPremiseUserMessage({ identity: PREMISE_FIXTURE_IDENTITY });
    expect(Buffer.byteLength(message, "utf8")).toBeLessThanOrEqual(WORST_USER_MESSAGE_BYTES);
    expect(message).toContain("CREATIVE_BRIEF");
    expect(message).not.toContain("ASSIGNMENT");
    expect(message).not.toContain("CONCEPT_PREMISE");
  });

  it("uses bytes as a token bound, which is true for a byte-level tokenizer", () => {
    expect(PER_ATTEMPT_INPUT_TOKEN_BOUND).toBe(
      INSTRUCTION_BYTES + WORST_USER_MESSAGE_BYTES + REPAIR_OVERHEAD_TOKENS + FRAMING_TOKENS,
    );
    expect(PER_ATTEMPT_OUTPUT_TOKEN_BOUND).toBe(CONCEPT_PREMISE_MAX_OUTPUT_TOKENS);
  });

  it("computes the repair reserve from the cap the boundary enforces, not from a claim", () => {
    expect(REPAIR_OVERHEAD_TOKENS).toBe(
      CONCEPT_PREMISE_MAX_OUTPUT_TOKENS + REPAIR_FEEDBACK_MAX_BYTES + REPAIR_TURN_FRAMING_BYTES,
    );
  });

  it("holds a correction turn inside its reserve, however many issues arrive", () => {
    const issue = (n: number): PremiseValidationIssue => ({
      path: `premises.${n % 3}.grounding.${n % 4}`,
      message: `a long explanatory message repeated to fill the budget, number ${n}`.repeat(4),
      class: "fidelity",
      disposition: "repair_retry_once",
    });
    const rendered = repairFeedback(Array.from({ length: 500 }, (_, i) => issue(i)));
    const turn = [REPAIR_TURN_TEXT.opening, rendered, "", ...REPAIR_TURN_TEXT.closing].join("\n");
    expect(Buffer.byteLength(rendered, "utf8")).toBeLessThanOrEqual(REPAIR_FEEDBACK_MAX_BYTES);
    expect(Buffer.byteLength(turn, "utf8")).toBeLessThanOrEqual(
      REPAIR_FEEDBACK_MAX_BYTES + REPAIR_TURN_FRAMING_BYTES,
    );
    // And it says that it stopped listing, so neither the model nor a reader is told a truncated
    // list is the whole list. Either limit may be the one that bit — the issue count or the byte
    // budget — and each announces itself in its own words, so the property is that one of them did.
    expect(/not listed|list truncated/.test(rendered)).toBe(true);
  });
});

describe("the derived bound", () => {
  it("prices the worst attempt from the long-context cache-write and output rates", () => {
    const raw =
      (PER_ATTEMPT_INPUT_TOKEN_BOUND * GPT_5_6_SOL.longContext.cacheWriteInput +
        PER_ATTEMPT_OUTPUT_TOKEN_BOUND * GPT_5_6_SOL.longContext.output) /
      1_000_000;
    expect(raw).toBeLessThan(conceptPremiseAttemptMaxUsd(MODEL));
    expect(conceptPremiseAttemptMaxUsd(MODEL)).toBe(2);
    expect(CONCEPT_PREMISE_ATTEMPT_PROFILE_VERSION).toMatch(/^concept_premise_attempt_v\d+@/);
  });

  it("reserves against every attempt this stage's one repair layer permits", () => {
    // Two passes, three attempts each. The premise stage adds exactly one repair layer, so a
    // third pass is not reachable and the reservation must not pretend otherwise in either
    // direction.
    expect(CONCEPT_PREMISE_PASSES).toBe(2);
    expect(MAX_PROVIDER_ATTEMPTS_PER_CALL).toBe(
      CONCEPT_PREMISE_PASSES * (MAX_TRANSIENT_RETRIES + 1),
    );
    expect(MAX_PROVIDER_ATTEMPTS_PER_CALL).toBe(6);
    expect(conceptPremiseLogicalCallMaxUsd(MODEL)).toBe(12);
  });

  it("states the batch's honest end-to-end worst case, premise call included", () => {
    // This is the number the remediation's cost impact actually is, as a value something can read
    // rather than a claim in a document: one premise call plus three DesignIntent calls.
    expect(conceptBatchMaxUsd(MODEL)).toBe(
      conceptPremiseLogicalCallMaxUsd(MODEL) + designIntentBatchMaxUsd(MODEL),
    );
    expect(conceptBatchMaxUsd(MODEL)).toBe(48);
    expect(conceptBatchMaxUsd(MODEL)).toBeGreaterThan(designIntentBatchMaxUsd(MODEL));
  });

  it("refuses a model whose verified profile cannot bound this request", () => {
    expect(() =>
      assertProfileSupportsRequest({ ...GPT_5_6_SOL, contextWindowTokens: 1_000 }),
    ).toThrow(/does not fit/);
    expect(() => assertProfileSupportsRequest({ ...GPT_5_6_SOL, maxOutputTokens: 100 })).toThrow(
      /output tokens/,
    );
    expect(() =>
      assertProfileSupportsRequest({ ...GPT_5_6_SOL, longContextThresholdTokens: 1_000 }),
    ).toThrow(/long-context threshold/);
    // The unverified development fallback prices nothing and is not asserted against.
    expect(() => assertProfileSupportsRequest(UNVERIFIED_DEV_PROFILE)).not.toThrow();
  });

  it("pins every request option the bound was derived against", () => {
    // Effort, tier, store and the output ceiling are all part of the request shape this bound
    // describes. An inherited one would leave the bound describing a different request.
    expect(CONCEPT_PREMISE_REASONING_EFFORT).toBe("high");
    expect(CONCEPT_PREMISE_SERVICE_TIER).toBe("default");
    expect(CONCEPT_PREMISE_STORE_RESPONSES).toBe(false);
    expect(CONCEPT_PREMISE_MAX_OUTPUT_TOKENS).toBe(32_000);
  });
});
