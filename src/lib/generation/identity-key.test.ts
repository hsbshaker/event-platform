import { describe, expect, it } from "vitest";
import {
  EVENT_IDENTITY_SERVICE_TIER,
  EVENT_IDENTITY_STORE_RESPONSES,
  eventIdentityModelConfig,
} from "@/lib/ai/openai/event-identity";
import { attemptKey, basisDigest, modelConfigDigest, type IdentityCallBasis } from "./identity-key";

/**
 * The key decides whether money is spent twice, so the properties are tested rather than assumed.
 *
 * Acceptance criteria: N/A — test-only. `docs/phase-4b-plan.md §A.5`; `spec.md §10` (idempotency
 * so retries and double taps do not duplicate expensive calls).
 */
const base: IdentityCallBasis = {
  prompt: "a quiet winter gathering",
  clarificationAnswerIds: ["a1", "a2"],
  promptVersion: "event_identity_v5",
  schemaVersion: "event_identity_schema_v5",
  inputAssemblyVersion: "event_identity_input_v2",
  modelConfig: { model: "gpt-5.6-sol", reasoningEffort: "high" },
};

describe("the EventIdentity attempt key", () => {
  it("is stable across a refresh: the same request derives the same key", () => {
    expect(basisDigest({ ...base })).toBe(basisDigest({ ...base }));
    expect(attemptKey("e1", basisDigest(base), 0)).toBe(attemptKey("e1", basisDigest(base), 0));
  });

  it("does not depend on the order model-config keys happen to be in", () => {
    const flipped = { ...base, modelConfig: { reasoningEffort: "high", model: "gpt-5.6-sol" } };
    expect(basisDigest(flipped)).toBe(basisDigest(base));
  });

  it.each([
    ["a new clarification answer", { clarificationAnswerIds: ["a1", "a2", "a3"] }],
    ["a reordered answer list", { clarificationAnswerIds: ["a2", "a1"] }],
    ["an edited prompt", { prompt: "a loud winter gathering" }],
    ["a prompt version bump", { promptVersion: "event_identity_v6" }],
    ["a schema version bump", { schemaVersion: "event_identity_schema_v6" }],
    ["an assembly version bump", { inputAssemblyVersion: "event_identity_input_v3" }],
    ["a model change", { modelConfig: { model: "other", reasoningEffort: "high" } }],
    [
      "a reasoning-effort change",
      { modelConfig: { model: "gpt-5.6-sol", reasoningEffort: "low" } },
    ],
  ])("changes with %s", (_label, patch) => {
    expect(basisDigest({ ...base, ...patch } as IdentityCallBasis)).not.toBe(basisDigest(base));
  });

  it("cannot be forged by a field that swallows a boundary", () => {
    // Length-prefixed rather than delimiter-joined. With a plain separator, a prompt ending in
    // the delimiter and an empty answer list would hash the same as a shorter prompt and a
    // populated one — two different requests sharing a key means one of them is never paid for.
    const a = basisDigest({ ...base, prompt: "ab", clarificationAnswerIds: ["c"] });
    const b = basisDigest({ ...base, prompt: "a", clarificationAnswerIds: ["bc"] });
    expect(a).not.toBe(b);
  });

  it("separates events that would otherwise send identical bytes", () => {
    expect(attemptKey("e1", basisDigest(base), 0)).not.toBe(attemptKey("e2", basisDigest(base), 0));
  });

  it("separates attempts", () => {
    expect(attemptKey("e1", basisDigest(base), 0)).not.toBe(attemptKey("e1", basisDigest(base), 1));
  });

  it.each([-1, 1.5, Number.NaN])("refuses the nonsensical ordinal %s", (ordinal) => {
    expect(() => attemptKey("e1", basisDigest(base), ordinal)).toThrow(/non-negative integer/);
  });

  it("digests an empty config without collapsing into another shape", () => {
    expect(modelConfigDigest({})).not.toBe(modelConfigDigest({ model: "" }));
  });

  it("carries every request-shaping option the boundary actually sends", () => {
    // One builder, so a basis cannot omit an option the request sends. A call billed differently
    // or persisted differently is a different call.
    const config = eventIdentityModelConfig("gpt-5.6-sol", "high");
    expect(config).toEqual({
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      serviceTier: EVENT_IDENTITY_SERVICE_TIER,
      store: EVENT_IDENTITY_STORE_RESPONSES,
    });
  });

  it.each([
    ["the service tier", { serviceTier: "priority" }],
    ["provider-side storage", { store: true }],
  ])("changes the model-config digest when %s changes", (_label, patch) => {
    // So another tier necessarily produces a different attempt key — and needs its own verified
    // cost profile before it could be used in production.
    const base = eventIdentityModelConfig("gpt-5.6-sol", "high");
    expect(modelConfigDigest({ ...base, ...patch })).not.toBe(modelConfigDigest(base));
  });

  it("does not let a string impersonate a boolean option", () => {
    const base = eventIdentityModelConfig("gpt-5.6-sol", "high");
    expect(modelConfigDigest({ ...base, store: "false" })).not.toBe(modelConfigDigest(base));
  });
});
