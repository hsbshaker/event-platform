/**
 * The DesignIntent provider boundary, against a fake provider rather than a real one.
 *
 * Two things here are easy to get wrong in a way nothing notices, and both cost money or evidence.
 *
 * **The retry and repair policy.** `docs/model-contracts.md §8` gives this call three different
 * answers to three different defects, and `validateDesignIntentResponse` reports all three as
 * `{ok: false}`. A boundary that read `!ok` as "invalid structured output" would spend the single
 * model repair on classes `spec.md §32 #21` forbids asking again about — and, worse, could turn an
 * assignment mismatch into a successful batch by re-rolling until something legal came back. So
 * every test below asserts **provider-call counts**, not only the returned status: "it failed" and
 * "it failed without paying for a second answer" are different claims.
 *
 * **The request itself.** The model, the tier, the store flag, the reasoning effort and the output
 * ceiling are all pinned rather than inherited, because the cost bound in
 * `src/lib/generation/design-intent-cost.ts` is derived from exactly that shape.
 *
 * Acceptance criteria: N/A — test-only. `docs/model-contracts.md §5`, `§8`; `spec.md §32 #21`;
 * `docs/phase-4b-plan.md §E`, Part IV T21.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { premiseFixture } from "../../../../tests/fixtures/concept-premise";
import { assignmentFor, emptyAvoidList, type SiblingAssignment } from "@/lib/renderer/planner";
import { FAMILIES } from "@/lib/renderer/vocabulary";

const create = vi.fn();

vi.mock("openai", () => ({
  default: class {
    responses = { create };
  },
}));

const ASSIGNMENT: SiblingAssignment = assignmentFor(3, emptyAvoidList());

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
  compatibleTypographyCategories: ["oldstyle"],
  visualMotifs: ["fine double-rule framing"],
  textureDirection: "linen-like",
  typographyDirection: "quiet oldstyle serif",
  copyTone: "warm and unfussy",
  hostConstraints: [],
  creativeGuidance: [],
  inspirationSummary: "No visual inspiration supplied.",
};

function body(overrides: Record<string, unknown> = {}) {
  return {
    family: ASSIGNMENT.family,
    tonalDirection: ASSIGNMENT.tonalDirection,
    palette: { colors: ["#1B2A41", "#C9A227", "#F4F1EA"], dominant: "#1B2A41" },
    typographyPairing: ASSIGNMENT.typographyPairings[0],
    density: "balanced",
    composition: {
      asymmetry: "gentle",
      hierarchy: ASSIGNMENT.hierarchy,
      rhythm: "alternating",
      sectionContrast: "moderate",
      ornament: "restrained",
    },
    motifs: ["linen"],
    presentation: { name: "Pressed Garden", description: "A quiet, unhurried invitation." },
    ...overrides,
  };
}

function ok(value: unknown = body()) {
  return {
    id: "resp_test",
    model: "gpt-5.6-sol",
    service_tier: "default",
    output_text: typeof value === "string" ? value : JSON.stringify(value),
    usage: {
      input_tokens: 4_000,
      output_tokens: 900,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 600 },
    },
  };
}

const PREMISE = premiseFixture();

function providerError(status?: number) {
  return Object.assign(new Error("boom"), { status });
}

async function load() {
  return import("./design-intent");
}

/** The call sleeps between transient retries; let the timers run while it does. */
async function run() {
  const { generateDesignIntent } = await load();
  const promise = generateDesignIntent({
    identity: IDENTITY as never,
    assignment: ASSIGNMENT,
    premise: PREMISE,
  });
  const settled = promise.then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error }),
  );
  await vi.runAllTimersAsync();
  return settled;
}

describe("the OpenAI DesignIntent call", () => {
  beforeEach(() => {
    vi.resetModules();
    create.mockReset();
    process.env.OPENAI_API_KEY = "test-key-that-is-long-enough";
    process.env.OPENAI_MODEL = "gpt-5.6-sol";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  describe("the request", () => {
    it("pins the model, tier, store flag, reasoning effort and output ceiling", async () => {
      create.mockResolvedValue(ok());
      const {
        DESIGN_INTENT_MAX_OUTPUT_TOKENS,
        DESIGN_INTENT_REASONING_EFFORT,
        DESIGN_INTENT_SERVICE_TIER,
        DESIGN_INTENT_STORE_RESPONSES,
      } = await load();
      const { error } = await run();
      expect(error).toBeUndefined();

      expect(create).toHaveBeenCalledTimes(1);
      const request = create.mock.calls[0][0];
      expect(request.model).toBe("gpt-5.6-sol");
      expect(request.service_tier).toBe(DESIGN_INTENT_SERVICE_TIER);
      expect(request.store).toBe(DESIGN_INTENT_STORE_RESPONSES);
      expect(request.store).toBe(false);
      expect(request.reasoning).toEqual({ effort: DESIGN_INTENT_REASONING_EFFORT });
      expect(request.max_output_tokens).toBe(DESIGN_INTENT_MAX_OUTPUT_TOKENS);
      expect(request.text.format).toMatchObject({ type: "json_schema", strict: true });
    });

    it("does not inherit the shared reasoning-effort environment variable", async () => {
      // The cost bound is derived against this request's effort. An environment variable that
      // could move it would move the bound without moving the profile version.
      process.env.OPENAI_REASONING_EFFORT = "low";
      create.mockResolvedValue(ok());
      const { DESIGN_INTENT_REASONING_EFFORT } = await load();
      await run();
      expect(create.mock.calls[0][0].reasoning.effort).toBe(DESIGN_INTENT_REASONING_EFFORT);
      expect(DESIGN_INTENT_REASONING_EFFORT).toBe("high");
      delete process.env.OPENAI_REASONING_EFFORT;
    });

    it("sends the narrowed schema, so drift off the assignment is structurally impossible", async () => {
      create.mockResolvedValue(ok());
      await run();
      const schema = create.mock.calls[0][0].text.format.schema;
      expect(schema.properties.family.enum).toEqual([ASSIGNMENT.family]);
      expect(schema.properties.tonalDirection.enum).toEqual([ASSIGNMENT.tonalDirection]);
      expect(schema.properties.composition.properties.hierarchy.enum).toEqual([
        ASSIGNMENT.hierarchy,
      ]);
      for (const pairing of schema.properties.typographyPairing.enum)
        expect(ASSIGNMENT.typographyPairings).toContain(pairing);
    });

    it("sends the committed instruction file as the system message, and the assembly as the user message", async () => {
      create.mockResolvedValue(ok());
      const { systemPrompt } = await load();
      const { assembleDesignIntentUserMessage } = await import("./design-intent-input");
      const { value } = await run();

      const messages = create.mock.calls[0][0].input;
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ role: "system", content: systemPrompt() });
      expect(messages[1].role).toBe("user");
      expect(messages[1].content).toBe(
        assembleDesignIntentUserMessage({
          identity: IDENTITY as never,
          assignment: ASSIGNMENT,
          premise: PREMISE,
        }),
      );
      // `requestText` is the user message and only that — not the system message, and never the
      // correction turn or the assistant echo a repair adds between them.
      expect(value?.requestText).toBe(messages[1].content);
    });
  });

  describe("a first-call success", () => {
    it("returns the seven design fields, the presentation and the versions", async () => {
      create.mockResolvedValue(ok());
      const { value, error } = await run();
      expect(error).toBeUndefined();
      expect(Object.keys(value!.output).sort()).toEqual([
        "composition",
        "density",
        "family",
        "motifs",
        "palette",
        "tonalDirection",
        "typographyPairing",
      ]);
      expect(value!.presentation.ok).toBe(true);
      expect(value!.promptVersion).toBe("design_intent_v6");
      expect(value!.schemaVersion).toBe("design_intent_schema_v6");
      expect(value!.inputAssemblyVersion).toBe("design_intent_input_v2");
      expect(value!.deviations).toEqual([]);
      expect(value!.usage.schemaValidFirstCall).toBe(true);
      expect(value!.usage.repairRetries).toBe(0);
      expect(value!.usage.providerAttempts).toBe(1);
      expect(value!.rawResponses).toEqual([value!.raw]);
      expect(value!.usage.providerRequestId).toBe("resp_test");
      expect(value!.usage.inputTokens).toBe(4_000);
      expect(value!.usage.outputTokens).toBe(900);
      expect(value!.usage.reasoningTokens).toBe(600);
      expect(value!.usage.responses).toHaveLength(1);
    });
  });

  describe("transient provider failures", () => {
    it("retries within a pass, bounded, and counts every attempt", async () => {
      create.mockRejectedValueOnce(providerError(503));
      create.mockRejectedValueOnce(providerError(429));
      create.mockResolvedValueOnce(ok());
      const { value, error } = await run();
      expect(error).toBeUndefined();
      expect(create).toHaveBeenCalledTimes(3);
      expect(value!.usage.transientRetries).toBe(2);
      expect(value!.usage.providerAttempts).toBe(3);
      // Two attempts told us nothing about what they cost, and "nothing" is not "zero".
      expect(value!.usage.unknownUsageAttempts).toBe(2);
    });

    it("gives up after the bound and carries what was already paid for", async () => {
      create.mockRejectedValue(providerError(500));
      const { MAX_TRANSIENT_RETRIES } = await load();
      const { error } = await run();
      expect(create).toHaveBeenCalledTimes(MAX_TRANSIENT_RETRIES + 1);
      const failure = error as { kind: string; usage: { unknownUsageAttempts: number } };
      expect(failure.kind).toBe("provider");
      expect(failure.usage.unknownUsageAttempts).toBe(MAX_TRANSIENT_RETRIES + 1);
    });

    it("does not retry a non-transient status", async () => {
      create.mockRejectedValue(providerError(400));
      const { error } = await run();
      expect(create).toHaveBeenCalledTimes(1);
      expect((error as { kind: string }).kind).toBe("provider");
    });
  });

  describe("schema-invalid output — the one class that may ask again", () => {
    it("repairs once, resending the rejected answer so the repair is a correction", async () => {
      create.mockResolvedValueOnce(ok({ ...body(), density: "airy and light" }));
      create.mockResolvedValueOnce(ok());
      const { value, error } = await run();
      expect(error).toBeUndefined();
      expect(create).toHaveBeenCalledTimes(2);

      const repair = create.mock.calls[1][0].input;
      expect(repair).toHaveLength(4);
      expect(repair[0].role).toBe("system");
      expect(repair[1]).toEqual(create.mock.calls[0][0].input[1]);
      expect(repair[2].role).toBe("assistant");
      expect(repair[2].content).toBe(JSON.stringify({ ...body(), density: "airy and light" }));
      expect(repair[3].content).toContain("did not satisfy the schema");
      expect(repair[3].content).toContain("- density:");

      expect(value!.usage.repairRetries).toBe(1);
      expect(value!.usage.schemaValidFirstCall).toBe(false);
      // Both responses were billed, so both are carried out and both are priced.
      expect(value!.rawResponses).toHaveLength(2);
      expect(value!.usage.providerResponses).toBe(2);
      expect(value!.usage.inputTokens).toBe(8_000);
    });

    it("stops after the single repair and keeps both paid responses", async () => {
      create.mockResolvedValue(ok({ ...body(), density: "airy and light" }));
      const { error } = await run();
      expect(create).toHaveBeenCalledTimes(2);
      const failure = error as { kind: string; rawResponses: string[] };
      expect(failure.kind).toBe("invalid_output");
      expect(failure.rawResponses).toHaveLength(2);
    });

    it("treats unparseable text as schema-invalid, at the root", async () => {
      create.mockResolvedValueOnce(ok("{not json"));
      create.mockResolvedValueOnce(ok());
      const { value, error } = await run();
      expect(error).toBeUndefined();
      expect(create).toHaveBeenCalledTimes(2);
      expect(value!.usage.repairRetries).toBe(1);
      expect(create.mock.calls[1][0].input[3].content).toContain("- (root):");
    });
  });

  describe("assignment mismatch — zero model repairs, ever", () => {
    /**
     * Reachable only by bypassing narrowing, which is the point: the schema sent makes this
     * impossible, and the validator checks it anyway because the validator is the authority.
     */
    async function withBypassedNarrowing(response: Record<string, unknown>) {
      const actual = await import("@/lib/ai/design-intent/validate");
      const { UNNARROWED } = await import("@/lib/ai/design-intent/contract");
      vi.doMock("@/lib/ai/design-intent/validate", () => ({
        ...actual,
        validateDesignIntentResponse: (value: unknown, assignment: SiblingAssignment) =>
          actual.validateDesignIntentResponse(value, assignment, UNNARROWED),
      }));
      create.mockResolvedValue(ok(response));
      return run();
    }

    it("fails visibly on a returned family that is not the assigned one", async () => {
      const other = (["editorial", "invitation", "statement"] as const).find(
        (f) => f !== ASSIGNMENT.family,
      )!;
      const { error } = await withBypassedNarrowing({ ...body(), family: other });
      expect(create).toHaveBeenCalledTimes(1);
      expect((error as { kind: string }).kind).toBe("assignment_mismatch");
    });

    it("fails visibly on hierarchy drift, which is a hard assignment field", async () => {
      const other = FAMILIES[ASSIGNMENT.family].hierarchies.find(
        (h) => h !== ASSIGNMENT.hierarchy,
      )!;
      const { error } = await withBypassedNarrowing({
        ...body(),
        composition: { ...body().composition, hierarchy: other },
      });
      expect(create).toHaveBeenCalledTimes(1);
      const failure = error as { kind: string; issues: { path: string }[] };
      expect(failure.kind).toBe("assignment_mismatch");
      expect(failure.issues.map((i) => i.path)).toContain("composition.hierarchy");
    });

    it("is never converted into a success by a retry, even when the answer is also malformed", async () => {
      // The precedence rule, in the case it exists for. A mixed assignment-and-schema response
      // must not buy a second draw: one that happened to come back legal would report a diversity
      // plan that did not happen.
      const other = (["editorial", "invitation", "statement"] as const).find(
        (f) => f !== ASSIGNMENT.family,
      )!;
      const { error } = await withBypassedNarrowing({
        ...body(),
        family: other,
        density: "airy and light",
      });
      expect(create).toHaveBeenCalledTimes(1);
      expect((error as { kind: string }).kind).toBe("assignment_mismatch");
    });
  });

  describe("compatibility-only — deterministic repair, and never a second model call", () => {
    it("repairs a dominant outside colors, revalidates, and logs the deviation", async () => {
      create.mockResolvedValue(
        ok(
          body({
            palette: { colors: ["#1B2A41", "#C9A227", "#F4F1EA"], dominant: "#B04A3A" },
          }),
        ),
      );
      const { value, error } = await run();
      expect(error).toBeUndefined();
      // The whole point: one response, one attempt, no second model call.
      expect(create).toHaveBeenCalledTimes(1);
      expect(value!.usage.repairRetries).toBe(0);
      expect(value!.usage.providerResponses).toBe(1);

      expect(value!.output.palette.dominant).toBe("#B04A3A");
      expect(value!.output.palette.colors).toEqual(["#1B2A41", "#C9A227", "#F4F1EA", "#B04A3A"]);
      expect(value!.deviations).toHaveLength(1);
      expect(value!.deviations[0]).toMatchObject({
        rule: "dominant-in-colors",
        kind: "intent",
        path: "designIntent.palette.dominant",
      });
      // The response as it arrived is preserved verbatim; only what goes downstream is repaired.
      expect(JSON.parse(value!.raw).palette.colors).toHaveLength(3);
      // A repaired response is not a clean first call, and the telemetry says so.
      expect(value!.usage.schemaValidFirstCall).toBe(false);
    });

    it("re-points the dominant when the palette is already at its ceiling", async () => {
      const colors = ["#1B2A41", "#C9A227", "#F4F1EA", "#7A8B99", "#2E4057"];
      create.mockResolvedValue(ok(body({ palette: { colors, dominant: "#B04A3A" } })));
      const { value, error } = await run();
      expect(error).toBeUndefined();
      expect(create).toHaveBeenCalledTimes(1);
      expect(value!.output.palette.colors).toEqual(colors);
      expect(value!.output.palette.dominant).toBe("#1B2A41");
    });

    it("after a schema repair, still handles a remaining compatibility defect deterministically", async () => {
      create.mockResolvedValueOnce(ok({ ...body(), density: "airy and light" }));
      create.mockResolvedValueOnce(
        ok(
          body({
            palette: { colors: ["#1B2A41", "#C9A227", "#F4F1EA"], dominant: "#B04A3A" },
          }),
        ),
      );
      const { value, error } = await run();
      expect(error).toBeUndefined();
      // Two calls: the original and the one schema repair. The compatibility defect in the
      // repaired answer costs nothing further.
      expect(create).toHaveBeenCalledTimes(2);
      expect(value!.usage.repairRetries).toBe(1);
      expect(value!.deviations).toHaveLength(1);
    });

    it("fails visibly rather than guessing when a compatibility defect has no deterministic repair", async () => {
      // `repairCompatibility` refuses anything it does not recognise. A table that quietly did
      // nothing for an unknown defect would be the silent fallback this boundary must not have.
      const { repairCompatibility } = await load();
      expect(
        repairCompatibility(body(), [
          {
            path: "typographyPairing",
            message: "does not hold at the returned hierarchy",
            class: "compatibility",
            disposition: "deterministic_repair",
          },
        ]),
      ).toBeNull();
    });
  });

  describe("the correction turn is budgeted, not merely short in practice", () => {
    it("caps the issue list and the byte length, and says it did both", async () => {
      const { repairFeedback, REPAIR_FEEDBACK_MAX_BYTES, REPAIR_FEEDBACK_MAX_ISSUES } =
        await load();
      const issues = Array.from({ length: 5_000 }, (_, i) => ({
        path: `palette.colors.${i}`,
        message: `Invalid string: must match pattern /^#[0-9A-F]{6}$/ (received "#not-${i}")`,
        class: "schema" as const,
        disposition: "repair_retry_once" as const,
      }));
      const text = repairFeedback(issues);
      expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(REPAIR_FEEDBACK_MAX_BYTES);
      expect(
        text.split("\n").filter((l) => l.startsWith("- palette.colors")).length,
      ).toBeLessThanOrEqual(REPAIR_FEEDBACK_MAX_ISSUES);
      // A truncated list must never be presented as the whole list.
      expect(text).toMatch(/further issue\(s\), not listed|list truncated/);
    });

    it("is a no-op on an ordinary failure, so the budget costs nothing real", async () => {
      const { repairFeedback } = await load();
      const { describeIssues } = await import("@/lib/ai/design-intent/validate");
      const issues = [
        {
          path: "density",
          message: "Invalid option",
          class: "schema" as const,
          disposition: "repair_retry_once" as const,
        },
      ];
      expect(repairFeedback(issues)).toBe(describeIssues(issues));
    });

    it("never splits a multi-byte character when it truncates", async () => {
      const { repairFeedback, REPAIR_FEEDBACK_MAX_BYTES } = await load();
      const issues = Array.from({ length: 2_000 }, (_, i) => ({
        path: `motifs.${i}`,
        message: "\u{1F600}".repeat(40),
        class: "schema" as const,
        disposition: "repair_retry_once" as const,
      }));
      const text = repairFeedback(issues);
      expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(REPAIR_FEEDBACK_MAX_BYTES);
      expect(text).not.toContain("\uFFFD");
    });

    it("sends the budgeted text, so the reserve describes the real request", async () => {
      // Drives it through the boundary rather than the helper: the correction turn the provider
      // receives is the one the cost reserve is held against.
      const colors = Array.from({ length: 900 }, (_, i) => `#not-a-colour-${i}`);
      create.mockResolvedValueOnce(ok(body({ palette: { colors, dominant: "#1B2A41" } })));
      create.mockResolvedValueOnce(ok());
      const { REPAIR_FEEDBACK_MAX_BYTES, REPAIR_TURN_FRAMING_BYTES } = await load();
      const { error } = await run();
      expect(error).toBeUndefined();
      expect(create).toHaveBeenCalledTimes(2);
      const correction = create.mock.calls[1][0].input[3].content as string;
      expect(Buffer.byteLength(correction, "utf8")).toBeLessThanOrEqual(
        REPAIR_FEEDBACK_MAX_BYTES + REPAIR_TURN_FRAMING_BYTES,
      );
    });
  });

  describe("class precedence", () => {
    it("is assignment, then schema, then compatibility — fixed, not issue order", async () => {
      const { CLASS_PRECEDENCE, dominantIssueClass } = await load();
      expect([...CLASS_PRECEDENCE]).toEqual(["assignment", "schema", "compatibility"]);
      const issue = (cls: "assignment" | "schema" | "compatibility") => ({
        path: "x",
        message: "m",
        class: cls,
        disposition: "fail_visibly" as const,
      });
      expect(dominantIssueClass([issue("compatibility"), issue("assignment")])).toBe("assignment");
      expect(dominantIssueClass([issue("compatibility"), issue("schema")])).toBe("schema");
      expect(dominantIssueClass([issue("compatibility")])).toBe("compatibility");
      expect(dominantIssueClass([issue("schema"), issue("assignment")])).toBe("assignment");
    });
  });

  describe("the attempt topology the cost bound rests on", () => {
    it("caps provider attempts at two passes times three attempts", async () => {
      const { DESIGN_INTENT_PASSES, MAX_PROVIDER_ATTEMPTS_PER_CALL, MAX_TRANSIENT_RETRIES } =
        await load();
      expect(DESIGN_INTENT_PASSES).toBe(2);
      expect(MAX_TRANSIENT_RETRIES).toBe(2);
      expect(MAX_PROVIDER_ATTEMPTS_PER_CALL).toBe(6);
    });

    it("really reaches that maximum and never exceeds it", async () => {
      // Two transient failures then a schema-invalid answer, on both passes.
      let call = 0;
      create.mockImplementation(() => {
        call += 1;
        if (call % 3 !== 0) return Promise.reject(providerError(503));
        return Promise.resolve(ok({ ...body(), density: "airy and light" }));
      });
      const { MAX_PROVIDER_ATTEMPTS_PER_CALL } = await load();
      const { error } = await run();
      expect(create).toHaveBeenCalledTimes(MAX_PROVIDER_ATTEMPTS_PER_CALL);
      const failure = error as { kind: string; usage: { providerAttempts: number } };
      expect(failure.kind).toBe("invalid_output");
      expect(failure.usage.providerAttempts).toBe(MAX_PROVIDER_ATTEMPTS_PER_CALL);
    });

    it("lets the SDK do no retrying of its own", async () => {
      create.mockResolvedValue(ok());
      await run();
      // Asserted through the constructor the mock stands in for: with the SDK's default of 2,
      // the worst case would be eighteen requests against the six the policy documents.
      const { MAX_PROVIDER_ATTEMPTS_PER_CALL } = await load();
      expect(MAX_PROVIDER_ATTEMPTS_PER_CALL).toBe(6);
      const source = (await import("node:fs")).readFileSync(
        new URL("./design-intent.ts", import.meta.url).pathname,
        "utf8",
      );
      expect(source).toContain("maxRetries: 0");
    });
  });
});
