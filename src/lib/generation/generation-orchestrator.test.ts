import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationView } from "./generation-view";

/**
 * What a start actually asks the pipeline for.
 *
 * The defect this exists to prevent is a silent one: `planConceptBatchForEvent` *observes* a
 * settled batch unless `newRound` is set, so a **Try again** offered after a failed batch that
 * did not thread that flag was a button the server could not honour — it planned nothing, spent
 * nothing, and returned the same failed state the host was already looking at. Nothing failed, so
 * nothing in the build objected.
 *
 * The inverse matters just as much and is the reason this is two tests rather than one: an
 * ordinary start, a reload and the lost-transport resume must **not** send it, or a refresh would
 * buy a second paid batch.
 *
 * `after()` is replaced with a collector rather than executed, so the scheduled callback can be
 * inspected and then run deliberately. No provider call happens anywhere in this file.
 *
 * Acceptance criteria: `spec.md §31 — Prompt, auth, and generation` — "Each concept becomes
 * available as soon as its resolved spec exists; no concept waits on its siblings (§7.10)".
 * Guardrails: `spec.md §32 #41`, `#45`.
 */

const scheduled: (() => Promise<unknown>)[] = [];
const runConceptBatch = vi.fn();
const readGenerationState = vi.fn();
const requireEventAccess = vi.fn();
const latestBatch = vi.fn();

vi.mock("next/server", () => ({
  after: (fn: () => Promise<unknown>) => {
    scheduled.push(fn);
  },
}));

vi.mock("@/lib/auth/event-access", () => ({
  requireEventAccess: (...args: unknown[]) => requireEventAccess(...args),
}));

vi.mock("./concept-batch", () => ({
  runConceptBatch: (...args: unknown[]) => runConceptBatch(...args),
}));

vi.mock("./generation-state", () => ({
  readGenerationState: (...args: unknown[]) => readGenerationState(...args),
}));

vi.mock("./batch", () => ({
  latestBatch: (...args: unknown[]) => latestBatch(...args),
}));

const { latestConceptRound, startConceptGeneration } = await import("./generation-orchestrator");

const EVENT = "33333333-3333-3333-3333-333333333333";
const admin = {} as never;

const view = (over: Partial<GenerationView> = {}): GenerationView => ({
  stage: "not_started",
  concepts: [],
  canStart: true,
  ...over,
});

/** The request `runConceptBatch` was handed, whether or not it names `newRound`. */
function batchRequest(): Record<string, unknown> {
  expect(runConceptBatch).toHaveBeenCalledTimes(1);
  return runConceptBatch.mock.calls[0]![1] as Record<string, unknown>;
}

beforeEach(() => {
  scheduled.length = 0;
  runConceptBatch.mockReset();
  runConceptBatch.mockResolvedValue({ state: "observed" });
  readGenerationState.mockReset();
  requireEventAccess.mockReset();
  requireEventAccess.mockResolvedValue({ user: { id: "user-1" }, role: "owner" });
  latestBatch.mockReset();
});

describe("a retry is a new round, and nothing else is", () => {
  it("does not ask for a new round on an ordinary start", async () => {
    readGenerationState.mockResolvedValue(view());

    await startConceptGeneration(admin, EVENT);
    await scheduled[0]!();

    // Absent, not `false`: a reload, a refresh and the lost-transport resume all land here, and
    // each of them must observe whatever batch exists rather than buy another one.
    expect(batchRequest().newRound).toBeUndefined();
  });

  it("does not ask for a new round when `explicitRetry` is explicitly false", async () => {
    readGenerationState.mockResolvedValue(view());

    await startConceptGeneration(admin, EVENT, { explicitRetry: false });
    await scheduled[0]!();

    expect(batchRequest().newRound).toBeUndefined();
  });

  it("asks for a new round when the host retries a failed batch", async () => {
    // `failed` still reports `canStart: true` — the batch has settled and the identity is
    // authoritative — and this is what makes that claim one the server can honour.
    readGenerationState.mockResolvedValue(view({ stage: "failed", canStart: true }));

    await startConceptGeneration(admin, EVENT, { explicitRetry: true });
    await scheduled[0]!();

    expect(batchRequest().newRound).toBe(true);
  });

  it("still refuses a retry the projection says cannot start", async () => {
    // A batch in flight, or no authoritative identity. A retry is a round like any other and does
    // not get a private door past the controls.
    readGenerationState.mockResolvedValue(view({ stage: "designing", canStart: false }));

    const result = await startConceptGeneration(admin, EVENT, { explicitRetry: true });

    expect(scheduled).toHaveLength(0);
    expect(runConceptBatch).not.toHaveBeenCalled();
    expect(result.canStart).toBe(false);
  });

  it("carries the acting account, not the owner, whichever kind of start it is", async () => {
    readGenerationState.mockResolvedValue(view({ stage: "failed" }));

    await startConceptGeneration(admin, EVENT, { explicitRetry: true });
    await scheduled[0]!();

    // Caps are per acting account (`spec.md §6`), so a retry consumes the retrying collaborator's.
    expect(batchRequest().userId).toBe("user-1");
  });
});

describe("the round a preview resolves against", () => {
  it("is the latest batch's, not the latest concept row's", async () => {
    latestBatch.mockResolvedValue({ id: "batch-2", round: 2, status: "failed" });

    expect(await latestConceptRound(admin, EVENT)).toBe(2);
    // Read through the same capability the preview route itself checks.
    expect(requireEventAccess).toHaveBeenCalledWith(EVENT, "browse_select_concepts");
  });

  it("is null when the event has never had a batch", async () => {
    latestBatch.mockResolvedValue(null);

    expect(await latestConceptRound(admin, EVENT)).toBeNull();
  });

  it("authorizes before it reads", async () => {
    requireEventAccess.mockRejectedValue(new Error("forbidden"));

    await expect(latestConceptRound(admin, EVENT)).rejects.toThrow();
    expect(latestBatch).not.toHaveBeenCalled();
  });
});
