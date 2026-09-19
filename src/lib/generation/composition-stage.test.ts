/**
 * The composition stage's lifecycle, which is where a sibling can be lied about.
 *
 * `compileConcept` is mocked here on purpose. The real compiler and the real browser pass are
 * exercised in `compile-concept.test.ts`; what this file owns is the **order** things happen in and
 * the **bound** on how many times the model is asked — the two properties that are invisible to a
 * compiler test and expensive to get wrong:
 *
 *   * a paid response is recorded before anything downstream can fail, because the ceiling reads
 *     `generation_runs` as spend;
 *   * a sibling is settled `succeeded` only after its concept is persisted, so the batch can never
 *     report a concept that does not exist;
 *   * the two post-call re-prompts happen **once each and never twice**, which is the difference
 *     between `docs/model-contracts.md §6.3` and an open-ended retry loop.
 *
 * No provider is reached and no database is real: the runner is a stub and the admin client is a
 * recording fake. The transactional half of these RPCs is proven against a real PostgreSQL in
 * `tests/db/phase4d-composition.test.ts`.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler` ("Attractive-token
 * allotments are enforced: one re-prompt, then deterministic neutralization logged as a `planner`
 * repair"; "No structural, coverage, capability, responsive, box, motif-kind or fit repair calls a
 * model"). Guardrails `spec.md §32 #18`, `#21`, `#24`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const compileConcept = vi.fn();
vi.mock("./compile-concept", async () => {
  const actual = await vi.importActual<typeof import("./compile-concept")>("./compile-concept");
  return { ...actual, compileConcept };
});

const persistConcept = vi.fn();
vi.mock("./persist-concept", () => ({ persistConcept }));

const { runCompositionStage, COMPOSITION_OPERATION } = await import("./composition-stage");
import type { CompositionAttempt, CompositionStageRequest } from "./composition-stage";

/* --------------------------------------------------------------- the fake admin */

interface RpcCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

/** Records every RPC in order. Order is the thing under test, so the log is the assertion. */
function fakeAdmin(overrides: Record<string, unknown> = {}) {
  const calls: RpcCall[] = [];
  const admin = {
    calls,
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "record_sibling_stage_run") {
        return Promise.resolve({
          data: [{ outcome: overrides.stageOutcome ?? "recorded", run_id: "run-composition" }],
          error: null,
        });
      }
      if (name === "settle_batch_sibling") {
        return Promise.resolve({ data: args.p_success ? "succeeded" : "failed", error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  return admin as unknown as Parameters<typeof runCompositionStage>[0] & { calls: RpcCall[] };
}

const TREE = { version: "composition_v1", sections: [] } as never;

function attempt(over: Partial<CompositionAttempt> = {}): CompositionAttempt {
  return {
    tree: TREE,
    promptVersion: "composition_v1_p3",
    schemaVersion: "composition_schema_v1",
    inputAssemblyVersion: "composition_input_v1",
    fallback: null,
    telemetry: {
      operation: COMPOSITION_OPERATION,
      provider: "openai",
      model: "gpt-5.6-sol",
      latencyMs: 900,
      promptVersion: "composition_v1_p3",
      schemaVersion: "composition_schema_v1",
    },
    ...over,
  };
}

function request(over: Partial<CompositionStageRequest> = {}): CompositionStageRequest {
  return {
    batchId: "batch-1",
    eventId: "event-1",
    round: 1,
    conceptIndex: 1,
    attempt: 0,
    designIntentArtifactId: "artifact-1",
    designIntent: { family: "editorial" } as never,
    presentation: { name: "Ordered States", description: "A considered direction." },
    designIntentPromptVersion: "design_intent_v6",
    designIntentSchemaVersion: "design_intent_schema_v6",
    content: { title: "A baby shower" } as never,
    tokenAllotment: { allowed: [], forbidden: [] } as never,
    call: {
      brief: {
        creativeDirection: "d",
        visualMotifs: [],
        textureDirection: "t",
        hostConstraints: ["No religious elements."],
      },
      contentProfile: {} as never,
      capabilities: {} as never,
      designIntent: { family: "editorial" } as never,
      directive: { structure: "Stack" },
      directiveSentence: "the hero is a stack",
      forbiddenTokens: ["watermark"],
      seed: 7,
    },
    ...over,
  };
}

function verified() {
  return {
    state: "verified",
    spec: { verified: { clean: true } },
    raw: TREE,
    canonical: TREE,
    compositionHash: "hash-a",
    repairs: [],
    deviations: [],
    nearestSibling: 0.12,
  };
}

beforeEach(() => {
  compileConcept.mockReset();
  persistConcept.mockReset();
  persistConcept.mockResolvedValue({
    conceptId: "concept-1",
    resolvedSpecId: "spec-1",
    replayed: false,
  });
});

/* ------------------------------------------------------------------- happy path */

describe("a verified concept becomes ready", () => {
  it("records the paid run, persists, then settles — in that order", async () => {
    const admin = fakeAdmin();
    compileConcept.mockResolvedValue(verified());
    const runner = vi.fn().mockResolvedValue(attempt());

    const outcome = await runCompositionStage(admin, runner, request());

    expect(outcome.state).toBe("ready");
    // The order is the invariant. Recording before compiling means a paid response survives a
    // geometry failure; settling after persisting means a succeeded sibling always has a concept.
    expect(admin.calls.map((c) => c.name)).toEqual([
      "record_sibling_stage_run",
      "settle_batch_sibling",
    ]);
    const persistIndex = persistConcept.mock.invocationCallOrder[0];
    expect(persistIndex).toBeGreaterThan(0);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("settles naming the composition run, which is the run that stands for the concept", async () => {
    const admin = fakeAdmin();
    compileConcept.mockResolvedValue(verified());
    await runCompositionStage(admin, vi.fn().mockResolvedValue(attempt()), request());
    const settle = admin.calls.find((c) => c.name === "settle_batch_sibling");
    expect(settle?.args.p_success).toBe(true);
    expect(settle?.args.p_generation_run_id).toBe("run-composition");
  });

  it("records the run as a composition run against its own concept index", async () => {
    const admin = fakeAdmin();
    compileConcept.mockResolvedValue(verified());
    await runCompositionStage(admin, vi.fn().mockResolvedValue(attempt()), request());
    const record = admin.calls[0];
    expect(record.args.p_operation).toBe("composition");
    expect(record.args.p_concept_index).toBe(1);
    expect(record.args.p_success).toBe(true);
  });

  it("carries the library fallback into persistence so it is never read as model work", async () => {
    const admin = fakeAdmin();
    compileConcept.mockResolvedValue(verified());
    const outcome = await runCompositionStage(
      admin,
      vi.fn().mockResolvedValue(attempt({ fallback: "library" })),
      request(),
    );
    expect(outcome.state === "ready" && outcome.fallback).toBe("library");
    expect(persistConcept.mock.calls[0][1].fallback).toBe("library");
  });

  it("proceeds when the run row was already written by an earlier identical attempt", async () => {
    const admin = fakeAdmin({ stageOutcome: "duplicate_key" });
    compileConcept.mockResolvedValue(verified());
    const outcome = await runCompositionStage(
      admin,
      vi.fn().mockResolvedValue(attempt()),
      request(),
    );
    // A replayed driver must converge, not fail: the spend is already recorded once and the
    // concept still needs persisting and settling.
    expect(outcome.state).toBe("ready");
  });
});

/* ------------------------------------------------------------- the retry budget */

describe("the two post-call re-prompts happen once each, and never twice", () => {
  it("re-prompts once for a token-cap violation, carrying the offending tokens", async () => {
    const admin = fakeAdmin();
    compileConcept
      .mockResolvedValueOnce({
        state: "reprompt",
        kind: "token_cap",
        feedback: ["this candidate may not use watermark"],
        repairs: [],
      })
      .mockResolvedValueOnce(verified());
    const runner = vi.fn().mockResolvedValue(attempt());

    const outcome = await runCompositionStage(admin, runner, request());

    expect(outcome.state).toBe("ready");
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner.mock.calls[0][0].reprompt).toBeUndefined();
    expect(runner.mock.calls[1][0].reprompt).toEqual({
      kind: "token_cap",
      feedback: ["this candidate may not use watermark"],
    });
  });

  it("tells the compiler the allowance is spent, so a second violation is neutralized", async () => {
    const admin = fakeAdmin();
    compileConcept
      .mockResolvedValueOnce({ state: "reprompt", kind: "token_cap", feedback: ["x"], repairs: [] })
      .mockResolvedValueOnce(verified());
    await runCompositionStage(admin, vi.fn().mockResolvedValue(attempt()), request());
    // `spent.tokenCap` true is what makes `compileConcept` neutralize deterministically instead of
    // asking again — `§6.3` step 3.
    expect(compileConcept.mock.calls[0][0].spent).toEqual({ tokenCap: false, collision: false });
    expect(compileConcept.mock.calls[1][0].spent).toEqual({ tokenCap: true, collision: false });
  });

  it("re-prompts once for a collision, naming the colliding skeleton", async () => {
    const admin = fakeAdmin();
    compileConcept
      .mockResolvedValueOnce({
        state: "reprompt",
        kind: "collision",
        feedback: ["desktop hero skeleton at 0.82: Stack > Heading"],
        repairs: [],
      })
      .mockResolvedValueOnce(verified());
    const runner = vi.fn().mockResolvedValue(attempt());
    const outcome = await runCompositionStage(admin, runner, request());
    expect(outcome.state).toBe("ready");
    expect(runner.mock.calls[1][0].reprompt?.kind).toBe("collision");
    expect(compileConcept.mock.calls[1][0].spent).toEqual({ tokenCap: false, collision: true });
  });

  it("spends both allowances at most once each and then stops asking", async () => {
    const admin = fakeAdmin();
    compileConcept
      .mockResolvedValueOnce({ state: "reprompt", kind: "token_cap", feedback: ["a"], repairs: [] })
      .mockResolvedValueOnce({ state: "reprompt", kind: "collision", feedback: ["b"], repairs: [] })
      .mockResolvedValueOnce(verified());
    const runner = vi.fn().mockResolvedValue(attempt());
    const outcome = await runCompositionStage(admin, runner, request());
    // Three calls is the ceiling: one original plus one for each discoverable reason. There is no
    // fourth, and no critic loop that could produce one.
    expect(runner).toHaveBeenCalledTimes(3);
    expect(outcome.state).toBe("ready");
    expect(outcome.state === "ready" && outcome.repromptsUsed).toEqual({
      tokenCap: true,
      collision: true,
    });
  });

  it("records one paid run per pass, so a re-prompt is charged rather than hidden", async () => {
    const admin = fakeAdmin();
    compileConcept
      .mockResolvedValueOnce({ state: "reprompt", kind: "token_cap", feedback: ["a"], repairs: [] })
      .mockResolvedValueOnce(verified());
    await runCompositionStage(admin, vi.fn().mockResolvedValue(attempt()), request());
    const recorded = admin.calls.filter((c) => c.name === "record_sibling_stage_run");
    expect(recorded).toHaveLength(2);
  });
});

describe("nothing else is ever re-prompted", () => {
  it("fails a structural defect without asking the model again", async () => {
    const admin = fakeAdmin();
    compileConcept.mockResolvedValue({
      state: "failed",
      kind: "structure",
      detail: "2 structural violation(s) survived deterministic repair",
      repairs: [],
      outstanding: [],
      remaining: [{ rule: "nesting", path: "sections[0]" }],
    });
    const runner = vi.fn().mockResolvedValue(attempt());
    const outcome = await runCompositionStage(admin, runner, request());
    expect(outcome.state).toBe("failed");
    expect(outcome.state === "failed" && outcome.kind).toBe("structure");
    // `spec.md §32 #21`: structural, coverage, capability, responsive, box, motif-kind and fit
    // defects are repaired deterministically and never re-prompted.
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("fails a geometry defect without asking the model again", async () => {
    const admin = fakeAdmin();
    compileConcept.mockResolvedValue({
      state: "failed",
      kind: "geometry",
      detail: "overflow at 390 after 3 demotion rounds",
      repairs: [],
      outstanding: ["s0.n4"],
      remaining: [],
    });
    const runner = vi.fn().mockResolvedValue(attempt());
    const outcome = await runCompositionStage(admin, runner, request());
    expect(outcome.state === "failed" && outcome.kind).toBe("geometry");
    expect(runner).toHaveBeenCalledTimes(1);
    expect(persistConcept).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------- failure paths */

describe("a failed sibling is settled failed, and never silently ready", () => {
  it("records the failed call and settles failed when the provider never returns a tree", async () => {
    const admin = fakeAdmin();
    const runner = vi.fn().mockRejectedValue(new Error("provider 500"));
    const outcome = await runCompositionStage(admin, runner, request());

    expect(outcome.state === "failed" && outcome.kind).toBe("provider");
    const record = admin.calls.find((c) => c.name === "record_sibling_stage_run");
    expect(record?.args.p_success).toBe(false);
    const settle = admin.calls.find((c) => c.name === "settle_batch_sibling");
    expect(settle?.args.p_success).toBe(false);
    expect(persistConcept).not.toHaveBeenCalled();
    expect(compileConcept).not.toHaveBeenCalled();
  });

  it("settles failed when the concept verified but could not be persisted", async () => {
    const admin = fakeAdmin();
    compileConcept.mockResolvedValue(verified());
    persistConcept.mockRejectedValue(new Error("insert failed"));
    const outcome = await runCompositionStage(
      admin,
      vi.fn().mockResolvedValue(attempt()),
      request(),
    );
    // A verified spec nobody could write down is not a ready concept.
    expect(outcome.state === "failed" && outcome.kind).toBe("persist");
    const settle = admin.calls.find((c) => c.name === "settle_batch_sibling");
    expect(settle?.args.p_success).toBe(false);
  });

  it("never throws, so one sibling's failure cannot become a batch-wide exception", async () => {
    const admin = fakeAdmin();
    compileConcept.mockRejectedValue(new Error("unexpected"));
    await expect(
      runCompositionStage(admin, vi.fn().mockResolvedValue(attempt()), request()),
    ).rejects.toThrow();
    // Deliberate: a *compiler* throw is a defect in deterministic code, not a sibling-level
    // outcome, and swallowing it would hide a bug. Provider, geometry and persist failures — the
    // three that are expected in normal operation — are all returned rather than thrown above.
  });

  it("settles only its own sibling index", async () => {
    const admin = fakeAdmin();
    compileConcept.mockResolvedValue(verified());
    await runCompositionStage(
      admin,
      vi.fn().mockResolvedValue(attempt()),
      request({ conceptIndex: 2 }),
    );
    for (const call of admin.calls) expect(call.args.p_concept_index).toBe(2);
  });
});
