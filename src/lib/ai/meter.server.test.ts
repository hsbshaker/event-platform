import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enableGeneration, fakeAdmin, TEST_CONTEXT } from "../../../tests/unit/support/fake-admin";
import type { FakeAdmin } from "../../../tests/unit/support/fake-admin";

import {
  GenerationDeadlineError,
  GenerationDisabledError,
  MeterRecordError,
  ModelCallRefusedError,
  ModelOutputError,
  ProviderCallError,
  SpendCeilingError,
} from "./errors";
import { metered } from "./meter.server";
import type { MeteredCallResult, RunInfo } from "./meter.server";
import { costOf } from "./pricing";
import { REQUEST_TIMEOUT_MS } from "./timeouts";

/**
 * The meter (`spec.md §9.6`, §10; docs/development-plan.md principle 3): no call without a running
 * generation, the switch on and a reservation under the ceiling; every call it lets through is
 * settled and recorded, whether it succeeds or fails.
 */

const admin = vi.hoisted(() => ({ fake: undefined as unknown as FakeAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.fake.client }));

const INFO: RunInfo = {
  model: "gpt-6.1-sol",
  promptVersion: "event_identity_v4",
  schemaVersion: "event_identity_schema_v4",
};
const USAGE = {
  model: "gpt-6.1-sol",
  inputTokens: 3000,
  cachedInputTokens: 1000,
  outputTokens: 400,
};
const ok = (): MeteredCallResult<{ hello: string }> => ({
  value: { hello: "world" },
  raw: '{"hello":"world"}',
  usage: USAGE,
  providerRequestId: "req_123",
});

let restore: () => void;
beforeEach(() => {
  admin.fake = fakeAdmin();
  restore = enableGeneration();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe("the meter refuses before any call", () => {
  it("when generation is switched off", async () => {
    process.env.GENERATION_ENABLED = "false";
    const call = vi.fn(async () => ok());
    await expect(metered(TEST_CONTEXT, "event_identity", 0.2, INFO, call)).rejects.toBeInstanceOf(
      GenerationDisabledError,
    );
    expect(call).not.toHaveBeenCalled();
    expect(admin.fake.state.rpcs).toEqual([]);
  });

  it("when the switch is unset (the default)", async () => {
    delete process.env.GENERATION_ENABLED;
    const call = vi.fn(async () => ok());
    await expect(metered(TEST_CONTEXT, "card_art", 0.4, INFO, call)).rejects.toBeInstanceOf(
      GenerationDisabledError,
    );
    expect(call).not.toHaveBeenCalled();
  });

  it("without an event, an acting member and a generation (no anonymous call)", async () => {
    const call = vi.fn(async () => ok());
    for (const ctx of [
      { ...TEST_CONTEXT, userId: "" },
      { ...TEST_CONTEXT, userId: undefined as unknown as string },
      { ...TEST_CONTEXT, eventId: "not-a-uuid" },
      { ...TEST_CONTEXT, generationId: "" },
    ]) {
      const error = await metered(ctx, "event_identity", 0.2, INFO, call).catch((e) => e);
      expect(error).toBeInstanceOf(ModelCallRefusedError);
      expect(error.reason).toBe("invalid_context");
    }
    expect(call).not.toHaveBeenCalled();
    expect(admin.fake.state.rpcs).toEqual([]);
  });

  it("when the call could not finish before the generation's deadline", async () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const call = vi.fn(async () => ok());
    // The artwork's timeout is 120 s: 119 s left is not enough.
    const ctx = { ...TEST_CONTEXT, deadline: now + REQUEST_TIMEOUT_MS.card_art - 1_000 };
    const error = await metered(ctx, "card_art", 0.4, INFO, call).catch((e) => e);
    expect(error).toBeInstanceOf(GenerationDeadlineError);
    expect(error).toBeInstanceOf(ModelCallRefusedError);
    expect(error.reason).toBe("deadline");
    expect(call).not.toHaveBeenCalled();
    // Before the heartbeat and the reservation: nothing is touched.
    expect(admin.fake.state.rpcs).toEqual([]);
    expect(admin.fake.runs()).toEqual([]);
    // The same time is enough for a 30 s moderation, and exactly the timeout is allowed.
    await expect(metered(ctx, "card_art_moderation", 0, INFO, call)).resolves.toBeTruthy();
    const exact = { ...TEST_CONTEXT, deadline: now + REQUEST_TIMEOUT_MS.card_art };
    await expect(metered(exact, "card_art", 0.4, INFO, call)).resolves.toBeTruthy();
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("with a deadline that is not a time", async () => {
    const call = vi.fn(async () => ok());
    for (const deadline of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const error = await metered(
        { ...TEST_CONTEXT, deadline },
        "event_identity",
        0.2,
        INFO,
        call,
      ).catch((e) => e);
      expect(error.reason).toBe("invalid_context");
    }
    expect(call).not.toHaveBeenCalled();
    expect(admin.fake.state.rpcs).toEqual([]);
  });

  it("when the generation is no longer running", async () => {
    admin.fake.state.heartbeat = false;
    const call = vi.fn(async () => ok());
    const error = await metered(TEST_CONTEXT, "card_design", 0.18, INFO, call).catch((e) => e);
    expect(error).toBeInstanceOf(ModelCallRefusedError);
    expect(error.reason).toBe("not_running");
    expect(call).not.toHaveBeenCalled();
    expect(admin.fake.rpcNames()).toEqual(["heartbeat_generation"]);
  });

  it("when the reservation would pass the daily ceiling", async () => {
    admin.fake.state.day = null;
    const call = vi.fn(async () => ok());
    await expect(metered(TEST_CONTEXT, "card_art", 0.4, INFO, call)).rejects.toBeInstanceOf(
      SpendCeilingError,
    );
    expect(call).not.toHaveBeenCalled();
    expect(admin.fake.rpc("reserve_model_spend")).toEqual([
      { p_estimate_usd: 0.4, p_ceiling_usd: 20 },
    ]);
    // Nothing to settle, nothing recorded.
    expect(admin.fake.rpcNames()).toEqual(["heartbeat_generation", "reserve_model_spend"]);
    expect(admin.fake.runs()).toEqual([]);
    // The refusal is an alert.
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("ceiling"),
      expect.objectContaining({ operation: "card_art" }),
    );
  });

  it("reserves against the configured ceiling", async () => {
    process.env.GENERATION_DAILY_CEILING_USD = "7.5";
    await metered(TEST_CONTEXT, "card_art", 0.4, INFO, async () => ok());
    expect(admin.fake.rpc("reserve_model_spend")[0].p_ceiling_usd).toBe(7.5);
  });

  it("when the ledger cannot be reached (fail closed)", async () => {
    const call = vi.fn(async () => ok());
    admin.fake.state.errors.reserve_model_spend = { message: "connection refused" };
    await expect(metered(TEST_CONTEXT, "card_art", 0.4, INFO, call)).rejects.toMatchObject({
      message: "connection refused",
    });
    admin.fake.state.errors = { heartbeat_generation: { message: "timeout" } };
    await expect(metered(TEST_CONTEXT, "card_art", 0.4, INFO, call)).rejects.toMatchObject({
      message: "timeout",
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("for an invalid estimate", async () => {
    const call = vi.fn(async () => ok());
    await expect(metered(TEST_CONTEXT, "card_art", Number.NaN, INFO, call)).rejects.toThrow();
    await expect(metered(TEST_CONTEXT, "card_art", -1, INFO, call)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
});

describe("the meter records every call it lets through", () => {
  it("settles the actual cost and writes the run on success", async () => {
    const result = await metered(
      { ...TEST_CONTEXT, round: 2 },
      "event_identity",
      0.2,
      INFO,
      async () => ok(),
    );
    const cost = costOf(USAGE);
    expect(cost).toBeCloseTo(0.0081, 6); // 2000 × $2 + 1000 × $0.1 + 400 × $10, per 1M
    expect(result.output).toEqual({ hello: "world" });
    expect(result.raw).toBe('{"hello":"world"}');
    expect(result.usage).toMatchObject({
      provider: "openai",
      providerRequestId: "req_123",
      costUsd: cost,
      inputTokens: 3000,
    });
    expect(admin.fake.rpcNames()).toEqual([
      "heartbeat_generation",
      "reserve_model_spend",
      "settle_model_spend",
    ]);
    expect(admin.fake.rpc("heartbeat_generation")).toEqual([
      { p_generation_id: TEST_CONTEXT.generationId, p_event_id: TEST_CONTEXT.eventId },
    ]);
    expect(admin.fake.rpc("settle_model_spend")).toEqual([
      { p_day: "2026-10-04", p_reserved_usd: 0.2, p_actual_usd: cost },
    ]);
    expect(admin.fake.runs()).toEqual([
      expect.objectContaining({
        event_id: TEST_CONTEXT.eventId,
        user_id: TEST_CONTEXT.userId,
        generation_id: TEST_CONTEXT.generationId,
        round: 2,
        provider: "openai",
        provider_request_id: "req_123",
        operation: "event_identity",
        model: "gpt-6.1-sol",
        input_tokens: 3000,
        cached_input_tokens: 1000,
        output_tokens: 400,
        cost_estimate_usd: cost,
        success: true,
        error_code: null,
        prompt_version: "event_identity_v4",
        schema_version: "event_identity_schema_v4",
        layout_set_version: null,
      }),
    ]);
    expect(admin.fake.runs()[0].latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("settles and records a failed call at the cost the provider reported", async () => {
    const error = new ModelOutputError("schema_invalid", ["toneKeywords: too short"], "{}", {
      usage: USAGE,
      providerRequestId: "req_bad",
    });
    await expect(
      metered(TEST_CONTEXT, "event_identity", 0.2, INFO, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(admin.fake.rpc("settle_model_spend")[0].p_actual_usd).toBe(costOf(USAGE));
    expect(admin.fake.runs()[0]).toMatchObject({
      success: false,
      error_code: "schema_invalid",
      provider_request_id: "req_bad",
      output_tokens: 400,
    });
  });

  it("books nothing for a request the provider rejected, and the reservation for an unknown outcome", async () => {
    const cases: [unknown, number, string][] = [
      [new ProviderCallError("HTTP 400", { code: "http_400", billing: "none" }), 0, "http_400"],
      [new ProviderCallError("timed out", { code: "timeout", billing: "unknown" }), 0.4, "timeout"],
      [new TypeError("bug"), 0.4, "error"],
    ];
    for (const [thrown, booked, code] of cases) {
      admin.fake = fakeAdmin();
      await expect(
        metered(
          TEST_CONTEXT,
          "card_art",
          0.4,
          { ...INFO, model: "gpt-image-2.5-sunburst-2026-09-08" },
          async () => {
            throw thrown;
          },
        ),
      ).rejects.toBe(thrown);
      expect(admin.fake.rpc("settle_model_spend")).toEqual([
        { p_day: "2026-10-04", p_reserved_usd: 0.4, p_actual_usd: booked },
      ]);
      expect(admin.fake.runs()[0]).toMatchObject({
        success: false,
        error_code: code,
        cost_estimate_usd: booked,
        // No usage reported: the model asked for is recorded.
        model: "gpt-image-2.5-sunburst-2026-09-08",
      });
    }
  });

  it("settles on the day the reservation was booked", async () => {
    admin.fake.state.day = "2026-10-03";
    await metered(TEST_CONTEXT, "event_identity", 0.2, INFO, async () => ok());
    expect(admin.fake.rpc("settle_model_spend")[0].p_day).toBe("2026-10-03");
  });

  it("keeps the result when settlement fails, leaving the reservation held", async () => {
    admin.fake.state.errors.settle_model_spend = { message: "boom" };
    const result = await metered(TEST_CONTEXT, "event_identity", 0.2, INFO, async () => ok());
    expect(result.output).toEqual({ hello: "world" });
    expect(admin.fake.runs()).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("settlement failed"),
      expect.anything(),
    );
  });

  it("throws when the run cannot be recorded, carrying the call's own error", async () => {
    admin.fake.state.errors["insert:generation_runs"] = { message: "insert failed" };
    await expect(
      metered(TEST_CONTEXT, "event_identity", 0.2, INFO, async () => ok()),
    ).rejects.toBeInstanceOf(MeterRecordError);
    // The spend was still settled before the record failed.
    expect(admin.fake.rpc("settle_model_spend")).toHaveLength(1);

    const callError = new ProviderCallError("HTTP 500", { code: "http_500", billing: "none" });
    const error = await metered(TEST_CONTEXT, "event_identity", 0.2, INFO, async () => {
      throw callError;
    }).catch((e) => e);
    expect(error).toBeInstanceOf(MeterRecordError);
    expect(error.callError).toBe(callError);
  });

  it("records a model without a price at its reservation rather than at nothing", async () => {
    await metered(TEST_CONTEXT, "event_identity", 0.2, INFO, async () => ({
      ...ok(),
      usage: { model: "some-new-model", inputTokens: 10, outputTokens: 10 },
    }));
    expect(admin.fake.rpc("settle_model_spend")[0].p_actual_usd).toBe(0.2);
  });
});
