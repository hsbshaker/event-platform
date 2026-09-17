/**
 * The DesignIntent provider boundary, against a fake provider.
 *
 * Every property here is checked with the provider mocked, never by calling one: no live
 * DesignIntent call is authorised before T21 is complete, frozen, independently reviewed and
 * explicitly approved (`docs/phase-4b-plan.md`, "The stop point"), and a boundary verified by
 * spending money would be a boundary nobody could verify twice.
 *
 * `docs/model-contracts.md §8` gives this call two behaviours that must not blur together:
 * ordinary transient retry for provider failures, and **exactly one** repair retry for invalid
 * structured output. Blurring them would let the call re-prompt until something validated, which
 * would replace a creatively weak response with a luckier one and quietly destroy the evidence
 * Phase 4C exists to gather.
 *
 * Acceptance criteria: N/A — test-only. `docs/model-contracts.md §5`, `§8`;
 * `spec.md §31 — DesignIntent, composition and compiler`; `§32 #21`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthoritativeIdentity } from "@/lib/ai/event-identity/lifecycle";
import type { SiblingAssignment } from "@/lib/renderer/planner";

const create = vi.fn();
const constructed = vi.hoisted(() => ({ count: 0 }));

vi.mock("openai", () => ({
  default: class {
    responses = { create };
    constructor() {
      constructed.count += 1;
    }
  },
}));

/**
 * A bug in our own validation, injected. Zod reports schema problems as issues, but an exception
 * thrown *inside* a refinement escapes `safeParse` — and it escapes after the provider has been
 * paid.
 */
const validationBug = vi.hoisted(() => ({ throws: null as Error | null }));

vi.mock("@/lib/ai/design-intent/validate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/design-intent/validate")>();
  return {
    ...actual,
    parseAndValidateDesignIntentResponse: (raw: string, assignment: SiblingAssignment) => {
      if (validationBug.throws) throw validationBug.throws;
      return actual.parseAndValidateDesignIntentResponse(raw, assignment);
    },
  };
});

const ASSIGNMENT: SiblingAssignment = {
  family: "editorial",
  tonalDirection: "mid",
  typographyCategory: "heritage",
  hierarchy: "editorial",
  typographyPairings: ["heritage_caslon_karla", "heritage_baskerville_inter"],
};

const IDENTITY = {
  creativeDirection: "A restrained, tactile winter identity built on materials rather than motifs.",
  toneKeywords: ["restrained", "tactile", "warm"],
  colorsExplicitlyConstrained: false,
  paletteIntent: {
    requiredColors: [],
    preferredColors: ["ivory"],
    avoidColors: [],
    dominanceNotes: "",
  },
  tonalIntent: "Mid-toned and warm, with quiet contrast.",
  toneExplicitlyConstrained: false,
  compatibleTonalDirections: ["mid"],
  compatibleFamilies: ["editorial"],
  compatibleTypographyCategories: ["heritage"],
  visualMotifs: ["fine double-rule framing"],
  textureDirection: "linen-like",
  typographyDirection: "quiet heritage serif",
  copyTone: "warm and unfussy",
  hostConstraints: [],
  creativeGuidance: [],
  inspirationSummary: "No visual inspiration supplied.",
} as unknown as AuthoritativeIdentity;

const validBody = {
  family: "editorial",
  tonalDirection: "mid",
  palette: { colors: ["#2B1B12", "#B8622A", "#E8D8C3"], dominant: "#2B1B12" },
  typographyPairing: "heritage_caslon_karla",
  density: "balanced",
  composition: {
    asymmetry: "gentle",
    hierarchy: "editorial",
    rhythm: "alternating",
    sectionContrast: "moderate",
    ornament: "restrained",
  },
  motifs: ["linen"],
  presentation: {
    name: "Orchard Hour",
    description: "A supper that begins as the light goes, under trees older than anyone there.",
  },
};

function ok(body: unknown = validBody, overrides: Record<string, unknown> = {}) {
  return {
    id: "resp_test",
    model: "gpt-5.6-sol",
    status: "completed",
    output_text: JSON.stringify(body),
    usage: {
      input_tokens: 100,
      output_tokens: 200,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 50 },
    },
    ...overrides,
  };
}

function providerError(status?: number) {
  return Object.assign(new Error("boom"), { status });
}

describe("the OpenAI DesignIntent call", () => {
  beforeEach(() => {
    vi.resetModules();
    create.mockReset();
    constructed.count = 0;
    process.env.OPENAI_API_KEY = "test-key-that-is-long-enough";
    process.env.OPENAI_MODEL = "gpt-5.6-sol";
    vi.useFakeTimers();
  });

  afterEach(() => {
    validationBug.throws = null;
    vi.useRealTimers();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  /** The call sleeps between transient retries; let the timers run while it does. */
  async function run(
    identity: AuthoritativeIdentity = IDENTITY,
    assignment: SiblingAssignment = ASSIGNMENT,
  ) {
    const { generateDesignIntent } = await import("./design-intent");
    const promise = generateDesignIntent({ identity, assignment });
    // A failing call rejects while the timers are being advanced, before the caller's `.rejects`
    // matcher attaches. Claim it here so that is not an unhandled rejection.
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    return promise;
  }

  const lastRequest = () => create.mock.calls.at(-1)![0] as Record<string, unknown>;

  /* --- request shape ------------------------------------------------------------------------ */

  it("pins the service tier, the output cap, and provider-side storage off", async () => {
    create.mockResolvedValueOnce(ok());
    await run();
    const { DESIGN_INTENT_MAX_OUTPUT_TOKENS } = await import("./design-intent");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        service_tier: "default",
        store: false,
        max_output_tokens: DESIGN_INTENT_MAX_OUTPUT_TOKENS,
      }),
    );
  });

  it("sends the narrowed schema, so an out-of-assignment value cannot come back at all", async () => {
    // `docs/model-contracts.md §5.2`: narrowing happens **before** the call, so an
    // out-of-assignment family, tone or pairing is impossible rather than repaired afterwards.
    create.mockResolvedValueOnce(ok());
    await run();
    const format = (lastRequest().text as { format: { schema: Record<string, unknown> } }).format;
    const properties = format.schema.properties as Record<string, { enum?: string[] }>;
    expect(properties.family.enum).toEqual(["editorial"]);
    expect(properties.tonalDirection.enum).toEqual(["mid"]);
    expect(properties.typographyPairing.enum).toEqual(ASSIGNMENT.typographyPairings);
    expect(format.schema.additionalProperties).toBe(false);
  });

  it("sends the committed prompt file and the assembled message, and reports the latter", async () => {
    create.mockResolvedValueOnce(ok());
    const result = await run();
    const { systemPrompt } = await import("./design-intent");
    const { assembleDesignIntentUserMessage } = await import("./design-intent-input");
    const input = lastRequest().input as { role: string; content: string }[];
    expect(input.map((m) => m.role)).toEqual(["system", "user"]);
    expect(input[0].content).toBe(systemPrompt());
    expect(input[1].content).toBe(
      assembleDesignIntentUserMessage({ identity: IDENTITY, assignment: ASSIGNMENT }),
    );
    // `requestText` is the user message and nothing else — not the system message, and (below)
    // not the correction turn or the assistant echo of a rejected response.
    expect(result.requestText).toBe(input[1].content);
  });

  it("records the versions it actually sent under", async () => {
    create.mockResolvedValueOnce(ok());
    const result = await run();
    const versions = await import("@/lib/ai/versions");
    expect(result.promptVersion).toBe(versions.DESIGN_INTENT_PROMPT_VERSION);
    expect(result.schemaVersion).toBe(versions.DESIGN_INTENT_SCHEMA_VERSION);
    expect(result.inputAssemblyVersion).toBe(versions.DESIGN_INTENT_INPUT_ASSEMBLY_VERSION);
  });

  /* --- what it refuses before spending anything --------------------------------------------- */

  it("refuses an unnarrowable assignment before a key is read or a client exists", async () => {
    // `narrowingFor` throws when the planner's pool leaves the model nothing legal to say. That is
    // a planner defect, and it must not reach a paid request.
    await expect(
      run(IDENTITY, { ...ASSIGNMENT, typographyPairings: ["grotesk_archivo_inter"] }),
    ).rejects.toThrow(/cannot be narrowed/);
    expect(create).not.toHaveBeenCalled();
    expect(constructed.count).toBe(0);
  });

  it("refuses a request over the byte ceiling before making it", async () => {
    const { DESIGN_INTENT_MAX_REQUEST_BYTES } = await import("./design-intent");
    const huge = {
      ...IDENTITY,
      creativeDirection: "x".repeat(DESIGN_INTENT_MAX_REQUEST_BYTES),
    } as unknown as AuthoritativeIdentity;
    const error = await run(huge).catch((e: unknown) => e);
    expect((error as { kind?: string }).kind).toBe("request_too_large");
    // Nothing was sent, so nothing was billed — and the message says so rather than truncating.
    expect(create).not.toHaveBeenCalled();
    expect((error as Error).message).toMatch(/Nothing was sent/);
    expect((error as { rawResponses?: string[] }).rawResponses).toEqual([]);
  });

  /* --- transient retries -------------------------------------------------------------------- */

  it("retries a transient provider failure up to the bound, then fails visibly", async () => {
    const { DESIGN_INTENT_MAX_TRANSIENT_RETRIES } = await import("./design-intent");
    create.mockRejectedValue(providerError(503));
    const error = await run().catch((e: unknown) => e);
    expect((error as { kind?: string }).kind).toBe("provider");
    expect(create).toHaveBeenCalledTimes(DESIGN_INTENT_MAX_TRANSIENT_RETRIES + 1);
    const usage = (
      error as { usage?: { transientRetries?: number; unknownUsageAttempts?: number } }
    ).usage;
    expect(usage?.transientRetries).toBe(DESIGN_INTENT_MAX_TRANSIENT_RETRIES);
    // Each threw before telling us what it cost, and a timeout can still be billed.
    expect(usage?.unknownUsageAttempts).toBe(DESIGN_INTENT_MAX_TRANSIENT_RETRIES + 1);
  });

  it("does not retry a non-transient provider failure", async () => {
    create.mockRejectedValue(providerError(400));
    await expect(run()).rejects.toThrow(/OpenAI request failed/);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("recovers after a transient failure and reports the retry it consumed", async () => {
    create.mockRejectedValueOnce(providerError(429)).mockResolvedValueOnce(ok());
    const result = await run();
    expect(result.usage.transientRetries).toBe(1);
    expect(result.usage.providerAttempts).toBe(2);
    expect(result.usage.schemaValidFirstCall).toBe(true);
  });

  /* --- the single repair retry -------------------------------------------------------------- */

  it("repairs schema-invalid output exactly once, quoting the validator's own errors", async () => {
    const wrongDominant = {
      ...validBody,
      palette: { colors: ["#2B1B12", "#B8622A", "#E8D8C3"], dominant: "#111111" },
    };
    create.mockResolvedValueOnce(ok(wrongDominant)).mockResolvedValueOnce(ok());
    const result = await run();

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.usage.repairRetries).toBe(1);
    expect(result.usage.schemaValidFirstCall).toBe(false);
    // Both responses were billed, so both leave with the result.
    expect(result.rawResponses).toEqual([JSON.stringify(wrongDominant), JSON.stringify(validBody)]);

    const repair = lastRequest().input as { role: string; content: string }[];
    expect(repair.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    // The rejected response is resent explicitly: the Responses call is stateless, so without it
    // the model would be asked to correct something it was never shown — a fresh generation with a
    // confusing preamble, which is the re-roll this policy exists to prevent.
    expect(repair[2].content).toBe(JSON.stringify(wrongDominant));
    expect(repair[3].content).toContain("palette.dominant");
    expect(repair[3].content).toContain("fix only what was structurally wrong");
    // And the user message is byte-identical across both attempts.
    expect(repair[1].content).toBe(
      (create.mock.calls[0][0] as { input: { content: string }[] }).input[1].content,
    );
    expect(result.requestText).toBe(repair[1].content);
  });

  it("fails visibly after the repair, with both paid responses and both attempts counted", async () => {
    const invalid = { ...validBody, motifs: ["linen", "linen"] };
    create.mockResolvedValue(ok(invalid));
    const error = await run().catch((e: unknown) => e);

    expect(create).toHaveBeenCalledTimes(2);
    expect((error as { kind?: string }).kind).toBe("invalid_output");
    expect((error as { rawResponses?: string[] }).rawResponses).toHaveLength(2);
    expect((error as { usage?: { repairRetries?: number } }).usage?.repairRetries).toBe(1);
    expect((error as { issues?: { path: string }[] }).issues?.[0].path).toBe("motifs");
  });

  it("never re-prompts for anything but schema-invalid output", async () => {
    // `spec.md §32 #21` and `./policy.ts`: a compatibility problem is repaired deterministically
    // downstream and never re-prompted. Here the response is legal, so there is nothing to ask
    // again about — one response, one call, and the caller gets the object to repair.
    const compatible = {
      ...validBody,
      composition: { ...validBody.composition, hierarchy: "dramatic" },
    };
    create.mockResolvedValueOnce(ok(compatible));
    const result = await run();
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.usage.repairRetries).toBe(0);
  });

  /* --- truncation ---------------------------------------------------------------------------- */

  it("fails visibly on a truncated response rather than spending a repair on it", async () => {
    create.mockResolvedValueOnce(
      ok(validBody, {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_text: '{"family":"edit',
      }),
    );
    const error = await run().catch((e: unknown) => e);
    expect((error as { kind?: string }).kind).toBe("incomplete_output");
    expect((error as Error).message).toContain("max_output_tokens");
    // It was billed, so it still travels out — and no second call was made.
    expect((error as { rawResponses?: string[] }).rawResponses).toEqual(['{"family":"edit']);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("says what happened when the provider returns a failed response", async () => {
    // Left to fall through, an empty `output_text` would be reported as invalid JSON, spend the
    // single repair retry on a response that does not exist, and land in evidence as "the model
    // returned something unparseable".
    create.mockResolvedValueOnce(
      ok(validBody, {
        status: "failed",
        error: { code: "server_error", message: "upstream refused" },
        output_text: "",
      }),
    );
    const error = await run().catch((e: unknown) => e);
    expect((error as { kind?: string }).kind).toBe("provider");
    expect((error as Error).message).toContain("upstream refused");
    expect((error as Error).message).toContain("nothing to validate and nothing to repair");
    expect(create).toHaveBeenCalledTimes(1);
  });

  /* --- usage, and what it refuses to guess --------------------------------------------------- */

  it("aggregates usage across every billed response, not only the accepted one", async () => {
    const invalid = { ...validBody, motifs: ["linen", "linen"] };
    create.mockResolvedValueOnce(ok(invalid)).mockResolvedValueOnce(ok());
    const result = await run();
    expect(result.usage.inputTokens).toBe(200);
    expect(result.usage.outputTokens).toBe(400);
    // `reasoningTokens` is a breakdown of `outputTokens`, never an addition to it.
    expect(result.usage.reasoningTokens).toBe(100);
    expect(result.usage.responses).toHaveLength(2);
    expect(result.usage.providerResponses).toBe(2);
    expect(result.usage.providerAttempts).toBe(2);
    expect(result.usage.unknownUsageAttempts).toBe(0);
  });

  it("counts a response with no usage block as one it cannot price", async () => {
    create.mockResolvedValueOnce(ok(validBody, { usage: undefined }));
    const result = await run();
    expect(result.usage.unknownUsageAttempts).toBe(1);
    expect(result.usage.inputTokens).toBeUndefined();
  });

  it("records the tier the provider says it served, not only the one we asked for", async () => {
    create.mockResolvedValueOnce(ok(validBody, { service_tier: "flex" }));
    const result = await run();
    expect(result.usage.responses[0].servedServiceTier).toBe("flex");
  });

  /* --- our own bugs must not destroy what was paid for -------------------------------------- */

  it("rethrows a validator bug as itself, with the paid responses and attempts attached", async () => {
    validationBug.throws = new Error("refinement exploded");
    create.mockResolvedValueOnce(ok());
    const error = await run().catch((e: unknown) => e);
    // The same object, the same type, no `kind`: a checker bug must not read as a model failure.
    expect((error as Error).message).toBe("refinement exploded");
    expect((error as { kind?: string }).kind).toBeUndefined();
    expect((error as { rawResponses?: string[] }).rawResponses).toEqual([
      JSON.stringify(validBody),
    ]);
    expect((error as { usage?: { providerAttempts?: number } }).usage?.providerAttempts).toBe(1);
  });

  /* --- what leaves the boundary -------------------------------------------------------------- */

  it("returns the whole response object, so a bad concept name cannot condemn a good design", async () => {
    // `spec.md §7.8`: `presentation` is validated separately and owed a deterministic fallback when
    // it is missing, invalid or duplicated. A boundary that dropped it would pre-empt that.
    const badName = { ...validBody, presentation: { name: "X", description: "too short" } };
    create.mockResolvedValueOnce(ok(badName));
    const result = await run();
    expect(result.output).toEqual(badName);
    expect(result.output.presentation).toEqual({ name: "X", description: "too short" });
  });

  it("gives the caller exactly the bytes that arrived", async () => {
    create.mockResolvedValueOnce(ok());
    const result = await run();
    expect(result.raw).toBe(JSON.stringify(validBody));
    expect(result.rawResponses).toEqual([result.raw]);
    expect(result.usage.providerRequestId).toBe("resp_test");
  });
});
