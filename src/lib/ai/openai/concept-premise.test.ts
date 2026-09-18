/**
 * The ConceptPremise provider boundary: one call, one bounded repair, and a visible failure.
 *
 * The property that matters most here is the one a reader will want to check first — **the
 * remediation added exactly one bounded repair layer, and it cannot loop.** Every class gets the
 * same single pass, so there is no branch that could open a second; the tests below drive the
 * boundary with responses that stay invalid and count the provider calls rather than trusting the
 * constant.
 *
 * The second property is the failure semantics. When the set cannot be made legal the batch fails.
 * It does **not** quietly fall back to sending three DesignIntent calls without premises, which
 * would silently restore the known-defective behaviour the T22 run measured
 * (`src/lib/ai/concept-premise/policy.ts`).
 *
 * Acceptance criteria: N/A — provider boundary and spend control. Guardrails: `spec.md §32 #21`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PREMISE_FIXTURE_IDENTITY,
  validPremiseSet,
} from "../../../../tests/fixtures/concept-premise";

const create = vi.fn();

/** The **only** thing mocked. Everything below it is the code that ships. */
vi.mock("openai", () => ({
  default: class {
    responses = { create };
  },
}));

function response(body: unknown, id = "resp_premise") {
  return {
    id,
    model: "gpt-5.6-sol",
    service_tier: "default",
    output_text: typeof body === "string" ? body : JSON.stringify(body),
    usage: {
      input_tokens: 3_000,
      output_tokens: 1_200,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 900 },
    },
  };
}

/** A set that is legal in shape and collapsed in substance: one register, three ways. */
function collapsed() {
  const set = validPremiseSet();
  return {
    ...set,
    premises: set.premises.map((premise) => ({
      ...premise,
      register: { pace: "measured", presence: "poised", surfaceRichness: "considered" },
    })),
  };
}

async function run() {
  const { generateConceptPremiseSet } = await import("./concept-premise");
  return generateConceptPremiseSet({ identity: PREMISE_FIXTURE_IDENTITY as never }).then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error }),
  );
}

describe("the ConceptPremise call", () => {
  beforeEach(() => {
    vi.resetModules();
    create.mockReset();
    process.env.OPENAI_API_KEY = "test-key-that-is-long-enough";
    process.env.OPENAI_MODEL = "gpt-5.6-sol";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  it("makes one call and returns the validated set when the answer is good", async () => {
    create.mockResolvedValue(response(validPremiseSet()));
    const { value, error } = await run();
    expect(error).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
    expect(value!.premiseSet.premises).toHaveLength(3);
    expect(value!.usage.validFirstCall).toBe(true);
    expect(value!.usage.repairRetries).toBe(0);
    expect(value!.promptVersion).toBe("concept_premise_v1");
    expect(value!.schemaVersion).toBe("concept_premise_schema_v1");
    expect(value!.inputAssemblyVersion).toBe("concept_premise_input_v1");
  });

  it("sends the brief and nothing else, under its own strict schema", async () => {
    create.mockResolvedValue(response(validPremiseSet()));
    const { value } = await run();
    const request = create.mock.calls[0][0];
    expect(request.text.format.name).toBe("concept_premise_set");
    expect(request.text.format.strict).toBe(true);
    expect(request.input).toHaveLength(2);
    expect(request.input[1].content).toBe(value!.requestText);
    // No assignment block: this stage is blind to the four style coordinates, which is what keeps
    // semantic distinction primary and visual distinction downstream of it.
    expect(value!.requestText).not.toContain("ASSIGNMENT");
    expect(value!.requestText).toContain("CREATIVE_BRIEF");
  });

  it("repairs a collapsed set once, and accepts the corrected answer", async () => {
    create
      .mockResolvedValueOnce(response(collapsed()))
      .mockResolvedValueOnce(response(validPremiseSet(), "resp_repaired"));
    const { value, error } = await run();
    expect(error).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
    expect(value!.usage.repairRetries).toBe(1);
    expect(value!.usage.validFirstCall).toBe(false);
    expect(value!.usage.repairedClass).toBe("set");
    expect(value!.rawResponses).toHaveLength(2);
  });

  it("shows the model its own rejected answer, and tells it not to invent its way out", async () => {
    create
      .mockResolvedValueOnce(response(collapsed()))
      .mockResolvedValueOnce(response(validPremiseSet()));
    await run();
    const repair = create.mock.calls[1][0].input;
    expect(repair).toHaveLength(4);
    expect(repair[2].role).toBe("assistant");
    expect(repair[2].content).toBe(JSON.stringify(collapsed()));
    expect(repair[3].content).toContain("register axis");
    // The correction turn must not become a licence to buy distinctness with a fabrication.
    expect(repair[3].content).toContain("adding anything the brief does not carry");
    // And the user message itself is byte-identical on both passes.
    expect(repair[1].content).toBe(create.mock.calls[0][0].input[1].content);
  });

  it("cannot open a second repair pass, whatever keeps coming back", async () => {
    // Driven rather than asserted from the constant: three different persistent defects, each
    // exercising a different class, and each costing exactly two provider calls.
    for (const body of [collapsed(), "not json at all", { premises: [] }]) {
      create.mockReset();
      create.mockResolvedValue(response(body));
      const { error } = await run();
      expect(create).toHaveBeenCalledTimes(2);
      expect((error as { kind?: string }).kind).toBe("unusable_premise_set");
    }
  });

  it("fails visibly rather than degrading to a premise-free batch", async () => {
    create.mockResolvedValue(response(collapsed()));
    const { value, error } = await run();
    expect(value).toBeUndefined();
    const failure = error as {
      kind: string;
      dominantClass: string;
      issues: unknown[];
      rawResponses: string[];
      usage: { repairRetries: number; providerResponses: number };
    };
    expect(failure.kind).toBe("unusable_premise_set");
    expect(failure.dominantClass).toBe("set");
    expect(failure.issues.length).toBeGreaterThan(0);
    // Everything paid for is preserved on the failure path, exactly as on the success path.
    expect(failure.rawResponses).toHaveLength(2);
    expect(failure.usage.providerResponses).toBe(2);
    expect(failure.usage.repairRetries).toBe(1);
  });

  it("reports a fidelity failure as fidelity, not as a diversity problem", async () => {
    const set = validPremiseSet();
    const fabricated = {
      ...set,
      premises: set.premises.map((premise, at) =>
        at === 0
          ? { ...premise, grounding: ["entirely unsupported assertion about nothing at all"] }
          : premise,
      ),
    };
    create.mockResolvedValue(response(fabricated));
    const { error } = await run();
    expect((error as { dominantClass?: string }).dominantClass).toBe("fidelity");
  });

  it("retries transport failures without spending a repair pass", async () => {
    vi.useFakeTimers();
    create
      .mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 503 }))
      .mockResolvedValue(response(validPremiseSet()));
    const settled = run();
    await vi.runAllTimersAsync();
    const { value, error } = await settled;
    vi.useRealTimers();
    expect(error).toBeUndefined();
    expect(value!.usage.transientRetries).toBe(1);
    expect(value!.usage.repairRetries).toBe(0);
    expect(value!.usage.unknownUsageAttempts).toBe(1);
  });
});
