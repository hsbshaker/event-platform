import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EVENT_IDENTITY_MAX_OUTPUT_TOKENS,
  EVENT_IDENTITY_SERVICE_TIER,
  EventIdentityRequestTooLargeError,
  MAX_PROVIDER_ATTEMPTS_PER_CALL,
  repairFeedback,
  REPAIR_FEEDBACK_MAX_BYTES,
  REPAIR_TURN_FRAMING_BYTES,
  USER_MESSAGE_MAX_BYTES,
  type ProviderResponseUsage,
} from "@/lib/ai/openai/event-identity";
import { assembleEventIdentityUserMessage } from "@/lib/ai/openai/event-identity-input";
import { CLARIFICATION_CEILING } from "@/lib/ai/event-identity/contract";
import { describeIssues, type ValidationIssue } from "@/lib/ai/event-identity/validate";
import { canonicalJsonSchema, strictWireSchema } from "@/lib/ai/event-identity/wire-schema";
import { MAX_PROMPT_LENGTH } from "@/lib/drafts/store";
import { MAX_CLARIFICATION_FREE_TEXT } from "@/lib/generation/identity-view";
import {
  assertProfileSupportsIdentityRequest,
  CARRIED_CLARIFICATION_ROUNDS,
  estimateIdentityCallCostUsd,
  EVENT_IDENTITY_ATTEMPT_PROFILE_VERSION,
  eventIdentityAttemptMaxUsd,
  findCostProfile,
  GPT_5_6_SOL,
  INSTRUCTION_BYTES,
  WIRE_SCHEMA_BYTES,
  isFresh,
  isVerified,
  logicalCallMaxUsd,
  PER_ATTEMPT_INPUT_TOKEN_BOUND,
  PER_ATTEMPT_OUTPUT_TOKEN_BOUND,
  providerAttemptMaxUsd,
  REPAIR_OVERHEAD_TOKENS,
  requireCostProfile,
  UNVERIFIED_DEV_PROFILE,
  VERIFIED_COST_PROFILES,
  WORST_USER_MESSAGE_BYTES,
  type CostRelevantUsage,
} from "./identity-cost";

/**
 * The accounting the spend ceiling depends on.
 *
 * Every test here exists because the naive version of the same calculation is wrong in the
 * direction of spending money: dropping a rejected response's tokens, costing an ambiguous
 * failure at zero, billing reasoning twice, pricing a long-context request at the short-context
 * rate, or reserving for one response when a call may make six attempts.
 *
 * Acceptance criteria: N/A — test-only. `docs/phase-4b-plan.md §A.5.1`; `spec.md §10`, `§9.6`.
 */
const MODEL = GPT_5_6_SOL.model;
const ROOT = new URL("../../../", import.meta.url).pathname;

/** One UTF-16 code unit, three UTF-8 bytes — the worst ratio a BMP character can have. */
const WORST = "�";

type JsonSchema = Record<string, unknown>;

/**
 * A maximum read out of the contract's own canonical JSON Schema, never transcribed.
 *
 * This is what makes the worst message below a derivation instead of a hand-copy. A `.max()` that
 * *widens* would leave correct-looking literals describing a contract that has moved; read from
 * the schema, widening one grows the generated message and fails the byte budget directly. A node
 * with no maximum **throws** rather than defaulting, because a field with no bound makes the whole
 * bound unprovable and that must stop the test rather than quietly shrink the fixture.
 */
function maximum(node: JsonSchema, keyword: "maxLength" | "maxItems", path: string): number {
  const value = node[keyword];
  if (typeof value !== "number") throw new Error(`${path}: no ${keyword}`);
  return value;
}

function clarificationQuestionsNode(): JsonSchema {
  const root = canonicalJsonSchema() as JsonSchema;
  const properties = root.properties as Record<string, JsonSchema>;
  const clarification = properties.clarification.properties as Record<string, JsonSchema>;
  return clarification.questions;
}

/**
 * The worst user message this request can legitimately carry, rebuilt from every contract that
 * bounds a part of it.
 *
 * The prompt at `MAX_PROMPT_LENGTH`; `rounds` rounds of `CLARIFICATION_CEILING` answers; each
 * answer's question and selected option label at the identity contract's own maxima, and its free
 * text at `MAX_CLARIFICATION_FREE_TEXT`; every character three UTF-8 bytes wide, which is the
 * worst a BMP character can be. Deferred as well, because that line renders alongside the rest
 * rather than instead of it.
 */
function worstUserMessage(rounds: number): string {
  const questions = clarificationQuestionsNode();
  const perRound = Math.min(maximum(questions, "maxItems", "questions"), CLARIFICATION_CEILING);
  const item = questions.items as JsonSchema;
  const itemProperties = item.properties as Record<string, JsonSchema>;
  const questionText = WORST.repeat(
    maximum(itemProperties.question, "maxLength", "questions.items.question"),
  );
  const optionProperties = (itemProperties.options.items as JsonSchema).properties as Record<
    string,
    JsonSchema
  >;
  const label = WORST.repeat(
    maximum(optionProperties.label, "maxLength", "questions.items.options.items.label"),
  );

  const question = { kind: "creative", question: questionText };
  return assembleEventIdentityUserMessage({
    prompt: WORST.repeat(MAX_PROMPT_LENGTH),
    priorRevisions: Array.from({ length: rounds }, (_, r) => ({
      revision: r + 1,
      result: { clarification: { questions: Array.from({ length: perRound }, () => question) } },
    })),
    answers: Array.from({ length: rounds }, (_, r) =>
      Array.from({ length: perRound }, (_, i) => ({
        revision: r + 1,
        questionIndex: i,
        selectedOptionLabel: label,
        freeText: WORST.repeat(MAX_CLARIFICATION_FREE_TEXT),
        isDefer: true,
      })),
    ).flat(),
  });
}

const bytesOf = (text: string) => Buffer.byteLength(text, "utf8");

/**
 * The inputs the per-attempt bound rests on, rebuilt rather than restated.
 *
 * `docs/phase-4b-plan.md` Part IV: "`perAttemptMaxUsd` is a property of an *attempt shape*, and
 * EventIdentity's was derived from EventIdentity's." It was not — it came from the model's context
 * window and output allowance — and these tests are what hold the replacement to its own inputs. A
 * prompt file that doubles, a contract field that widens, a repair cap that moves or a retry bound
 * that changes all fail here instead of silently invalidating the arithmetic.
 */
describe("the inputs the bound rests on", () => {
  it("measures the instruction file, and leaves headroom without being generous about it", () => {
    const measured = bytesOf(
      readFileSync(`${ROOT}docs/model-prompts/event-identity.system.md`, "utf8"),
    );
    expect(measured).toBeLessThanOrEqual(INSTRUCTION_BYTES);
    // If the file has grown far past the allowance, the allowance is stale rather than safe: the
    // bound should be re-derived deliberately, not quietly absorbed.
    expect(measured).toBeGreaterThan(INSTRUCTION_BYTES / 4);
  });

  it("measures the structured-output schema the request sends on every attempt", () => {
    // Serialized exactly as the boundary hands it to `text.format.schema`, because that is what
    // the provider receives and bills. The first version of this derivation left this term out
    // entirely — the bound counted the instruction file and the messages, and silently ignored an
    // input going out on every single attempt.
    const measured = bytesOf(JSON.stringify(strictWireSchema()));
    expect(measured).toBeLessThanOrEqual(WIRE_SCHEMA_BYTES);
    expect(measured).toBeGreaterThan(WIRE_SCHEMA_BYTES / 4);
  });

  it("rebuilds the worst legal user message from the contracts that bound it", () => {
    // Nine answers of 4,000 characters, each question and label at the identity contract's maxima,
    // on top of a maximum-length prompt — the message `CARRIED_CLARIFICATION_ROUNDS` promises to
    // admit. This fails if a contract widens, which is the point of rebuilding it.
    expect(bytesOf(worstUserMessage(CARRIED_CLARIFICATION_ROUNDS))).toBeLessThanOrEqual(
      WORST_USER_MESSAGE_BYTES,
    );
    // And the round allowance is a real allowance rather than a restatement of one round.
    expect(CARRIED_CLARIFICATION_ROUNDS).toBeGreaterThan(1);
    expect(bytesOf(worstUserMessage(1))).toBeLessThan(WORST_USER_MESSAGE_BYTES / 2);
  });

  it("refuses a request past the budget instead of under-reserving for it", () => {
    // The carried history is the one input no contract closes — `spec.md §7.6b` caps no number of
    // rounds and the assembly is cumulative — so the enforced budget is what makes
    // `WORST_USER_MESSAGE_BYTES` provable rather than merely likely.
    expect(WORST_USER_MESSAGE_BYTES).toBe(USER_MESSAGE_MAX_BYTES);
    const over = worstUserMessage(CARRIED_CLARIFICATION_ROUNDS + 1);
    expect(bytesOf(over)).toBeGreaterThan(USER_MESSAGE_MAX_BYTES);
    // A refusal costs nothing, and says so: the orchestrator's failure row charges
    // `providerAttempts`, so a zero-attempt annotation is what keeps it from recording phantom
    // spend. `event-identity.test.ts` exercises the refusal through the call itself.
    expect(
      new EventIdentityRequestTooLargeError(bytesOf(over), USER_MESSAGE_MAX_BYTES).usage,
    ).toMatchObject({ providerAttempts: 0, providerResponses: 0, unknownUsageAttempts: 0 });
  });

  it("uses bytes as a token bound, which is true for a byte-level tokenizer", () => {
    // A byte-level BPE's base vocabulary is the 256 single bytes, so a string never produces more
    // tokens than it has UTF-8 bytes; merges only reduce the count. Loose, and true.
    expect(PER_ATTEMPT_INPUT_TOKEN_BOUND).toBe(
      INSTRUCTION_BYTES +
        WIRE_SCHEMA_BYTES +
        WORST_USER_MESSAGE_BYTES +
        REPAIR_OVERHEAD_TOKENS +
        1_000,
    );
    expect(PER_ATTEMPT_OUTPUT_TOKEN_BOUND).toBe(EVENT_IDENTITY_MAX_OUTPUT_TOKENS);
  });

  it("computes the repair reserve from the cap the boundary enforces, not from a claim", () => {
    // The echo is capped in tokens by the output ceiling; the correction turn is capped in bytes
    // by `repairFeedback()`. Before this, `describeIssues` went to the model unbounded and nothing
    // reserved for it at all.
    expect(REPAIR_OVERHEAD_TOKENS).toBe(
      EVENT_IDENTITY_MAX_OUTPUT_TOKENS + REPAIR_FEEDBACK_MAX_BYTES + REPAIR_TURN_FRAMING_BYTES,
    );
  });

  it("holds a correction turn inside its reserve even for a response built to blow it up", () => {
    // The amplification case, concretely: the strict wire projection drops `maxItems`, so a
    // schema-conformant response may carry a very long array, and a per-element issue line costs
    // several times what the element cost in the response.
    const issues: ValidationIssue[] = Array.from({ length: 5_000 }, (_, i) => ({
      path: `identity.toneKeywords.${i}`,
      message: `Too big: expected string to have <=48 characters (received "a-long-keyword-${i}")`,
    }));
    expect(bytesOf(describeIssues(issues))).toBeGreaterThan(REPAIR_OVERHEAD_TOKENS);

    const bounded = repairFeedback(issues);
    expect(bytesOf(bounded)).toBeLessThanOrEqual(REPAIR_FEEDBACK_MAX_BYTES);
    // And the whole turn, framing included, is inside what the reserve holds for it.
    expect(bytesOf(bounded) + REPAIR_TURN_FRAMING_BYTES).toBeLessThanOrEqual(
      REPAIR_OVERHEAD_TOKENS - EVENT_IDENTITY_MAX_OUTPUT_TOKENS,
    );
    // Both limits announce themselves, so a model is never told a truncated list is the whole list.
    expect(bounded).toContain("further issue(s), not listed");
  });

  it("never reaches the long-context tier, and refuses a profile where that stops being true", () => {
    expect(PER_ATTEMPT_INPUT_TOKEN_BOUND).toBeLessThan(GPT_5_6_SOL.longContextThresholdTokens);
    expect(() => assertProfileSupportsIdentityRequest(GPT_5_6_SOL)).not.toThrow();
    expect(() =>
      assertProfileSupportsIdentityRequest({ ...GPT_5_6_SOL, longContextThresholdTokens: 1_000 }),
    ).toThrow(/long-context threshold/);
    expect(() =>
      assertProfileSupportsIdentityRequest({ ...GPT_5_6_SOL, maxOutputTokens: 1_000 }),
    ).toThrow(/output tokens/);
    expect(() =>
      assertProfileSupportsIdentityRequest({ ...GPT_5_6_SOL, contextWindowTokens: 1_000 }),
    ).toThrow(/context window/);
    // The dev fallback prices nothing and bounds nothing, so it is not held to this.
    expect(() => assertProfileSupportsIdentityRequest(UNVERIFIED_DEV_PROFILE)).not.toThrow();
  });
});

describe("the derived per-attempt bound", () => {
  it("is $3.50 an attempt for gpt-5.6-sol, from the long-context cache-write and output rates", () => {
    // input   215,500 × $10 / 1M = $2.155
    // output   32,000 × $30 / 1M = $0.96
    //                              ------
    //                              $3.115 → $3.50
    const raw =
      (PER_ATTEMPT_INPUT_TOKEN_BOUND * GPT_5_6_SOL.longContext.cacheWriteInput +
        PER_ATTEMPT_OUTPUT_TOKEN_BOUND * GPT_5_6_SOL.longContext.output) /
      1_000_000;
    expect(PER_ATTEMPT_INPUT_TOKEN_BOUND).toBe(215_500);
    expect(raw).toBeCloseTo(3.115, 3);
    expect(eventIdentityAttemptMaxUsd(MODEL)).toBe(3.5);
  });

  it("is derived from the request, not from the model's own ceilings", () => {
    // The defect this replaced: $15 an attempt and $90 a logical call, derived from the full
    // context window and output allowance — above every ceiling this product configures.
    expect(eventIdentityAttemptMaxUsd(MODEL)).not.toBe(GPT_5_6_SOL.perAttemptMaxUsd);
    // The model-level number remains a true statement about the model, so a derived bound above it
    // would mean the derivation had gone wrong.
    expect(eventIdentityAttemptMaxUsd(MODEL)).toBeLessThanOrEqual(GPT_5_6_SOL.perAttemptMaxUsd);
    expect(EVENT_IDENTITY_ATTEMPT_PROFILE_VERSION).toMatch(/^event_identity_attempt_v\d+@/);
  });

  it("reserves every attempt the retry policy permits, and fits a configured ceiling", () => {
    expect(MAX_PROVIDER_ATTEMPTS_PER_CALL).toBe(6);
    expect(logicalCallMaxUsd(MODEL)).toBe(eventIdentityAttemptMaxUsd(MODEL) * 6);
    expect(logicalCallMaxUsd(MODEL)).toBe(21);
    // Why this task existed: `claim_identity_call` reserves this against `IDENTITY_CEILING_USD`,
    // and the smallest ceiling a deployment configures today is $25. A reservation at or above the
    // ceiling refuses every call before the provider is reached.
    expect(logicalCallMaxUsd(MODEL)).toBeLessThan(25);
  });

  it("is what a claim reserves and what an unpriceable attempt is charged", () => {
    // `providerAttemptMaxUsd` is what `IdentityLimits.perAttemptMaxUsd` carries into the estimator,
    // so the number the claim reserved with is the number an unknown attempt is charged at.
    expect(providerAttemptMaxUsd(MODEL)).toBe(eventIdentityAttemptMaxUsd(MODEL));
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      { responses: [], providerResponses: 0, providerAttempts: 3, unknownUsageAttempts: 3 },
      providerAttemptMaxUsd(MODEL),
    );
    expect(estimate.usd).toBe(3 * eventIdentityAttemptMaxUsd(MODEL));
    expect(estimate.unpricedAttempts).toBe(3);
    expect(estimate.exact).toBe(false);
  });

  it("falls back to the labelled unverified bound outside production, which prices nothing", () => {
    // Not lowered to a derived number: the fallback has no rates, so there is nothing to derive
    // from and its deliberately large figure has to stand.
    expect(eventIdentityAttemptMaxUsd("some-unpriced-model")).toBe(
      UNVERIFIED_DEV_PROFILE.perAttemptMaxUsd,
    );
  });

  it("fails closed in production for a model nobody has priced", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(() => eventIdentityAttemptMaxUsd("gpt-5.6-sol-turbo-unpriced")).toThrow(
        /No verified cost profile/,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

/** Deliberately below the long-context threshold, so the tier is a choice a test makes. */
const IN = 100_000;
const OUT = 100_000;
const per = (tokens: number, pricePerMTok: number) => (tokens * pricePerMTok) / 1_000_000;

const response = (patch: Partial<ProviderResponseUsage> = {}): ProviderResponseUsage => ({
  inputTokens: IN,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: OUT,
  reasoningTokens: 0,
  ...patch,
});

/** What one default response costs at the standard tier. */
const STANDARD_ONE = per(IN, GPT_5_6_SOL.standard.input) + per(OUT, GPT_5_6_SOL.standard.output);

const usage = (
  responses: ProviderResponseUsage[],
  patch: Partial<CostRelevantUsage> = {},
): CostRelevantUsage => ({
  responses,
  providerResponses: responses.length,
  providerAttempts: responses.length,
  unknownUsageAttempts: 0,
  ...patch,
});

afterEach(() => {
  delete process.env.IDENTITY_PROVIDER_ATTEMPT_MAX_USD;
  delete process.env.NODE_ENV_OVERRIDE;
});

describe("the verified cost profile", () => {
  it("records where every number came from and when", () => {
    // "Verified" is a property of this record, not of a number appearing somewhere. Without the
    // source and date, nobody can tell a checked bound from a guess a year later.
    for (const profile of VERIFIED_COST_PROFILES) {
      expect(profile.source).toMatch(/^https?:\/\//);
      expect(profile.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isVerified(profile)).toBe(true);
      expect(profile.perAttemptMaxUsd).toBeGreaterThan(0);
    }
  });

  it("bounds the worst legal request at the worst tier", () => {
    // Long-context rates, every input token billed as a cache write — the most expensive input
    // class — plus the largest permitted output. This is a fact about the *model*, and since the
    // four calls each derive their own attempt bound it is no longer what anything reserves: it is
    // the ceiling those derivations are checked against (`the derived per-attempt bound` below).
    const p = GPT_5_6_SOL;
    const worstInput = (p.contextWindowTokens * p.longContext.cacheWriteInput) / 1_000_000;
    const worstOutput = (p.maxOutputTokens * p.longContext.output) / 1_000_000;
    expect(p.perAttemptMaxUsd).toBeGreaterThanOrEqual(worstInput + worstOutput);
  });

  it("prices the long-context tier above the standard one in every class", () => {
    const { standard, longContext } = GPT_5_6_SOL;
    for (const key of ["input", "cachedInput", "cacheWriteInput", "output"] as const) {
      expect(longContext[key]).toBeGreaterThan(standard[key]);
    }
    // A cache write costs more than ordinary input, a cache read far less. Collapsing the three
    // into one rate is how cache accounting goes quietly wrong.
    expect(standard.cacheWriteInput).toBeGreaterThan(standard.input);
    expect(standard.cachedInput).toBeLessThan(standard.input);
  });
});

describe("the production configuration contract", () => {
  it("serves a verified profile for the configured model", () => {
    expect(findCostProfile(MODEL)).not.toBeNull();
    expect(requireCostProfile(MODEL).model).toBe(MODEL);
  });

  it("falls back only outside production, and says the fallback is unverified", () => {
    const profile = requireCostProfile("some-unpriced-model");
    expect(profile).toBe(UNVERIFIED_DEV_PROFILE);
    expect(isVerified(profile)).toBe(false);
    // Larger than any verified bound, so a developer with no configuration never under-reserves.
    for (const verified of VERIFIED_COST_PROFILES) {
      expect(UNVERIFIED_DEV_PROFILE.perAttemptMaxUsd).toBeGreaterThan(verified.perAttemptMaxUsd);
    }
  });

  it.each(["VERCEL_ENV", "NODE_ENV"])(
    "refuses an unpriced model when %s says production",
    (key) => {
      // Changing OPENAI_MODEL to something nobody has priced must fail at configuration time
      // rather than reserve one model's worst case against another model's bill.
      vi.stubEnv(key, "production");
      try {
        expect(() => requireCostProfile("gpt-5.6-sol-turbo-unpriced")).toThrow(
          /No verified cost profile/,
        );
        // The configured model still works, so this is a contract, not a blanket refusal.
        expect(requireCostProfile(MODEL).model).toBe(MODEL);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  describe("freshness", () => {
    const within = new Date(`${GPT_5_6_SOL.reverifyAfter}T00:00:00Z`);
    const boundary = new Date(`${GPT_5_6_SOL.reverifyAfter}T23:59:59Z`);
    const after = new Date(`${GPT_5_6_SOL.reverifyAfter}T00:00:00Z`);
    after.setUTCDate(after.getUTCDate() + 1);

    it("records when it was read and by when it must be re-read", () => {
      for (const profile of VERIFIED_COST_PROFILES) {
        expect(profile.reverifyAfter).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Date.parse(profile.reverifyAfter)).toBeGreaterThan(Date.parse(profile.retrieved));
      }
    });

    it("is usable through the documented day, inclusive", () => {
      expect(isFresh(GPT_5_6_SOL, within)).toBe(true);
      expect(isFresh(GPT_5_6_SOL, boundary)).toBe(true);
    });

    it("is stale from the following UTC day", () => {
      expect(isFresh(GPT_5_6_SOL, after)).toBe(false);
    });

    it("refuses a stale profile in production, before any claim or provider call", () => {
      // Published prices move, and the current commitment is time-bounded. A bound nobody re-read
      // is the same failure as one nobody verified — it just took longer to become false.
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(() => requireCostProfile(MODEL, boundary)).not.toThrow();
        expect(() => requireCostProfile(MODEL, after)).toThrow(/re-verification after/);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("restores eligibility when the profile is re-verified", () => {
      // Re-verification is a person reading the current documentation and moving these dates,
      // never a runtime fetch.
      const refreshed = {
        ...GPT_5_6_SOL,
        profileVersion: "gpt-5.6-sol@2026-12-01",
        retrieved: "2026-12-01",
        reverifyAfter: "2027-02-01",
      };
      expect(isFresh(refreshed, after)).toBe(true);
    });

    it("never counts the dev fallback as fresh", () => {
      expect(isFresh(UNVERIFIED_DEV_PROFILE, within)).toBe(false);
      expect(isVerified(UNVERIFIED_DEV_PROFILE)).toBe(false);
    });
  });

  it("lets an override raise the bound but never lower it", () => {
    // A number in an environment variable is not evidence anybody read the provider's limits, so
    // it cannot be used to shrink the derived bound either — the floor it cannot go under is now
    // that bound rather than the model's own worst case.
    const derived = eventIdentityAttemptMaxUsd(MODEL);
    process.env.IDENTITY_PROVIDER_ATTEMPT_MAX_USD = "1";
    expect(providerAttemptMaxUsd(MODEL)).toBe(derived);
    process.env.IDENTITY_PROVIDER_ATTEMPT_MAX_USD = String(derived * 3);
    expect(providerAttemptMaxUsd(MODEL)).toBe(derived * 3);
  });

  it.each(["0", "-1", "abc"])("refuses an unusable override %s", (raw) => {
    process.env.IDENTITY_PROVIDER_ATTEMPT_MAX_USD = raw;
    expect(() => providerAttemptMaxUsd(MODEL)).toThrow(/positive number/);
  });
});

describe("the logical-call maximum", () => {
  it("bounds the whole call, not one successful response", () => {
    expect(logicalCallMaxUsd(MODEL)).toBe(
      providerAttemptMaxUsd(MODEL) * MAX_PROVIDER_ATTEMPTS_PER_CALL,
    );
  });

  it("is pinned to the retry and pass policy", () => {
    // Raising `MAX_TRANSIENT_RETRIES` raises the reservation, and this assertion fails until the
    // number is updated deliberately — so worst-case spend cannot drift past the ceiling quietly.
    expect(MAX_PROVIDER_ATTEMPTS_PER_CALL).toBe(6);
    expect(logicalCallMaxUsd(MODEL)).toBe(eventIdentityAttemptMaxUsd(MODEL) * 6);
  });
});

describe("estimating what one call cost", () => {
  it("prices a short-context response at the standard rate", () => {
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response()]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBeCloseTo(STANDARD_ONE, 10);
    expect(estimate.exact).toBe(true);
  });

  it("bills reasoning once, because output already includes it", () => {
    // The provider reports `output_tokens_details.reasoning_tokens` as a breakdown of
    // `output_tokens`. Adding the two charges reasoning twice — and reasoning is the majority of
    // output on a high-effort call, so the error is large, not marginal.
    const withReasoning = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ reasoningTokens: Math.floor(OUT * 0.9) })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(withReasoning.usd).toBeCloseTo(STANDARD_ONE, 10);
    const without = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ reasoningTokens: 0 })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(withReasoning.usd).toBe(without.usd);
  });

  it("prices cache reads and cache writes as distinct classes", () => {
    const out = per(OUT, GPT_5_6_SOL.standard.output);
    const cacheRead = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ cachedInputTokens: IN })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    const cacheWrite = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ cacheWriteInputTokens: IN })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(cacheRead.usd).toBeCloseTo(per(IN, GPT_5_6_SOL.standard.cachedInput) + out, 10);
    expect(cacheWrite.usd).toBeCloseTo(per(IN, GPT_5_6_SOL.standard.cacheWriteInput) + out, 10);
    // A cache write costs more than the uncached input it replaces; a read costs far less.
    expect(cacheWrite.usd).toBeGreaterThan(STANDARD_ONE);
    expect(cacheRead.usd).toBeLessThan(STANDARD_ONE);
  });

  it("never lets overlapping subsets produce a negative charge", () => {
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ inputTokens: 100, cachedInputTokens: 90, cacheWriteInputTokens: 90 })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBeGreaterThan(0);
  });

  it("applies the long-context tier to the response that crossed it", () => {
    const long = GPT_5_6_SOL.longContextThresholdTokens + 1;
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ inputTokens: long, outputTokens: OUT })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBeCloseTo(
      per(long, GPT_5_6_SOL.longContext.input) + per(OUT, GPT_5_6_SOL.longContext.output),
      8,
    );
    expect(estimate.exact).toBe(true);
  });

  it("prices a mixed call per response rather than on the aggregate", () => {
    // This is why per-response usage is kept. Aggregating first would push a short first attempt
    // over the threshold along with the repair, or leave the repair under it — either way one of
    // the two is charged at a rate it was not billed at, while the estimate calls itself exact.
    const longIn = GPT_5_6_SOL.longContextThresholdTokens + 1;
    const short = response({ inputTokens: 1_000, outputTokens: 1_000 });
    const long = response({ inputTokens: longIn, outputTokens: 1_000 });
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([short, long]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    const expected =
      per(1_000, GPT_5_6_SOL.standard.input) +
      per(1_000, GPT_5_6_SOL.standard.output) +
      per(longIn, GPT_5_6_SOL.longContext.input) +
      per(1_000, GPT_5_6_SOL.longContext.output);
    expect(estimate.usd).toBeCloseTo(expected, 8);
    expect(estimate.exact).toBe(true);
  });

  it("refuses to price a response the provider served on another tier", () => {
    // Pinning the request is half the assumption. The SDK documents the served tier as possibly
    // different, and `fast` is twice standard — priced from the standard table that response is
    // recorded at half its cost with `exact: true`, and the per-attempt clamp is an order of
    // magnitude too loose to notice.
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ servedServiceTier: "fast" })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBe(GPT_5_6_SOL.perAttemptMaxUsd);
    expect(estimate.exact).toBe(false);
    expect(estimate.servedUnpricedTier).toBe(true);
  });

  it("prices normally when the provider confirms the tier we asked for", () => {
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ servedServiceTier: EVENT_IDENTITY_SERVICE_TIER })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBeCloseTo(STANDARD_ONE, 10);
    expect(estimate.exact).toBe(true);
    expect(estimate.servedUnpricedTier).toBe(false);
  });

  it("prices normally when the provider says nothing about the tier", () => {
    // Then the request's pin is the best evidence there is, and refusing to price every response
    // would make every call cost the maximum for no gain in truth.
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response({ servedServiceTier: null })]),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.exact).toBe(true);
    expect(estimate.servedUnpricedTier).toBe(false);
  });

  it("does NOT cost an ambiguous transient attempt at zero", () => {
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response()], { providerAttempts: 3, unknownUsageAttempts: 2 }),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBeCloseTo(STANDARD_ONE + 2 * GPT_5_6_SOL.perAttemptMaxUsd, 8);
    expect(estimate.exact).toBe(false);
    expect(estimate.unpricedAttempts).toBe(2);
  });

  it("charges an attempt whose response carried no usage exactly once", () => {
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([{}], { providerAttempts: 1, unknownUsageAttempts: 1 }),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBe(GPT_5_6_SOL.perAttemptMaxUsd);
    expect(estimate.exact).toBe(false);
  });

  it("charges a response the summary claimed but the detail never described", () => {
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([response()], { providerResponses: 2, providerAttempts: 2 }),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBeCloseTo(STANDARD_ONE + GPT_5_6_SOL.perAttemptMaxUsd, 8);
    expect(estimate.exact).toBe(false);
  });

  it("charges a call that got nothing back for the attempts it made", () => {
    // `provider_response_evidence: []` means no text was captured, never "provably unpaid".
    const estimate = estimateIdentityCallCostUsd(
      GPT_5_6_SOL,
      usage([], { providerAttempts: 3, unknownUsageAttempts: 3 }),
      GPT_5_6_SOL.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBe(3 * GPT_5_6_SOL.perAttemptMaxUsd);
    expect(estimate.exact).toBe(false);
  });

  it("prices nothing from an unverified fallback profile", () => {
    // No rates to price with. Charging the maximum is the only honest answer; inventing a number
    // would be the optimistic fallback the whole section refuses.
    const estimate = estimateIdentityCallCostUsd(
      UNVERIFIED_DEV_PROFILE,
      usage([response()]),
      UNVERIFIED_DEV_PROFILE.perAttemptMaxUsd,
    );
    expect(estimate.usd).toBe(UNVERIFIED_DEV_PROFILE.perAttemptMaxUsd);
    expect(estimate.exact).toBe(false);
  });

  it("stays within the reservation for every attempt count the policy permits", () => {
    // Priced with the bound the claim actually reserved with — `providerAttemptMaxUsd` — because
    // that is the inequality the ceiling depends on. The responses are deliberately impossible
    // (the whole context window, the model's whole output allowance) so the clamp is exercised:
    // an attempt cannot bill more than its maximum, whatever the provider reports.
    const attemptMax = providerAttemptMaxUsd(MODEL);
    for (let attempts = 1; attempts <= MAX_PROVIDER_ATTEMPTS_PER_CALL; attempts += 1) {
      for (let responses = 0; responses <= Math.min(attempts, 2); responses += 1) {
        const estimate = estimateIdentityCallCostUsd(
          GPT_5_6_SOL,
          usage(
            Array.from({ length: responses }, () =>
              response({
                inputTokens: GPT_5_6_SOL.contextWindowTokens,
                outputTokens: GPT_5_6_SOL.maxOutputTokens,
                cacheWriteInputTokens: GPT_5_6_SOL.contextWindowTokens,
              }),
            ),
            { providerAttempts: attempts, unknownUsageAttempts: attempts - responses },
          ),
          attemptMax,
        );
        expect(estimate.usd).toBeLessThanOrEqual(logicalCallMaxUsd(MODEL));
      }
    }
  });
});
