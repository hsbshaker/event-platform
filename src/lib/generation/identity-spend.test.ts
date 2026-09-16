import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PROVIDER_ATTEMPTS_PER_CALL,
  MAX_TRANSIENT_RETRIES,
  PROVIDER_REQUEST_TIMEOUT_MS,
  TRANSIENT_BACKOFF_MS,
} from "@/lib/ai/openai/event-identity";
import {
  crossesWarnThreshold,
  DEFAULT_LEASE_SECONDS,
  emitCeilingAlert,
  identityLimits,
  IDENTITY_REFUSAL_PAYLOAD,
  LEASE_FLOOR_SECONDS,
  setCeilingAlertSink,
  type CeilingAlert,
} from "./identity-spend";

/**
 * Acceptance criteria: N/A — test-only. `docs/phase-4b-plan.md §A.5`; `spec.md §10`, `§32 #41`.
 */
const ENV = [
  "IDENTITY_CLAIM_LEASE_SECONDS",
  "IDENTITY_EVENT_DAILY_MAX",
  "IDENTITY_ACCOUNT_DAILY_MAX",
  "IDENTITY_ACCOUNT_RATE_MAX",
  "IDENTITY_ACCOUNT_RATE_WINDOW_SECONDS",
  "IDENTITY_CEILING_USD",
  "IDENTITY_CEILING_WINDOW_SECONDS",
  "IDENTITY_CEILING_WARN_FRACTION",
];

afterEach(() => {
  for (const key of ENV) delete process.env[key];
});

describe("the claim lease", () => {
  it("is derived from the boundary's own retry and timeout policy, not chosen", () => {
    // If this fails because `MAX_TRANSIENT_RETRIES` or the timeout moved, the lease is what has
    // to be recomputed — not this number. A lease shorter than a legitimate call turns the
    // mechanism built to stop double payment into the thing that causes it.
    const expected = Math.ceil(
      (MAX_PROVIDER_ATTEMPTS_PER_CALL * PROVIDER_REQUEST_TIMEOUT_MS +
        TRANSIENT_BACKOFF_MS.reduce((a, b) => a + b, 0) * 2) /
        1000,
    );
    expect(LEASE_FLOOR_SECONDS).toBe(expected);
    expect(MAX_TRANSIENT_RETRIES).toBe(2);
    expect(PROVIDER_REQUEST_TIMEOUT_MS).toBe(120_000);
    expect(LEASE_FLOOR_SECONDS).toBe(724);
  });

  it("leaves margin over the floor by default", () => {
    expect(DEFAULT_LEASE_SECONDS).toBeGreaterThan(LEASE_FLOOR_SECONDS);
    expect(identityLimits().leaseSeconds).toBe(DEFAULT_LEASE_SECONDS);
  });

  it("refuses a configured lease below the floor", () => {
    process.env.IDENTITY_CLAIM_LEASE_SECONDS = String(LEASE_FLOOR_SECONDS - 1);
    expect(() => identityLimits()).toThrow(/at least/);
  });
});

describe("the limits", () => {
  it("keys the event cap at the event and the account cap at the acting user", () => {
    // `spec.md §6`: limits apply at both levels regardless of whether the caller is the owner or
    // a co-host, and a co-host gets no independent pool for the same event.
    const limits = identityLimits();
    expect(limits.eventCap.windowSeconds).toBe(86_400);
    expect(limits.accountCap.windowSeconds).toBe(86_400);
    expect(limits.accountRate.windowSeconds).toBeLessThan(limits.accountCap.windowSeconds);
  });

  it("reserves the logical-call maximum per in-flight claim", () => {
    expect(identityLimits().logicalCallMaxUsd).toBeGreaterThan(0);
  });

  it.each(["0", "-2", "1.5"])("refuses the unusable cap %s", (raw) => {
    process.env.IDENTITY_EVENT_DAILY_MAX = raw;
    expect(() => identityLimits()).toThrow(/positive integer/);
  });

  it("refuses a warn fraction that could never fire before the refusal", () => {
    process.env.IDENTITY_CEILING_WARN_FRACTION = "1";
    expect(() => identityLimits()).toThrow(/below 1/);
  });
});

describe("what a refused caller is told", () => {
  it("says the same thing whichever control refused", () => {
    // `spec.md §32 #41` forbids exposing backend generation/spend counters, and a refusal a
    // caller can tell apart is a counter with extra steps: distinguishing "your event is capped"
    // from "the project ceiling is near" leaks the state of both.
    expect(Object.keys(IDENTITY_REFUSAL_PAYLOAD).sort()).toEqual(["message", "status"]);
    expect(Object.isFrozen(IDENTITY_REFUSAL_PAYLOAD)).toBe(true);
  });

  it("names no count, no limit, no remaining quota and no bucket", () => {
    const text = JSON.stringify(IDENTITY_REFUSAL_PAYLOAD).toLowerCase();
    for (const leak of ["cap", "limit", "remaining", "quota", "ceiling", "bucket", "spend"]) {
      expect(text).not.toContain(leak);
    }
    expect(text).not.toMatch(/\d/);
  });
});

describe("the ceiling alert", () => {
  it("fires before the spend lands, counting the reservation this call would add", () => {
    const limits = identityLimits();
    const nearly = limits.ceiling.usd * limits.warnFraction - limits.logicalCallMaxUsd;
    expect(crossesWarnThreshold(limits, nearly, 0)).toBe(true);
    expect(crossesWarnThreshold(limits, 0, 0)).toBe(false);
  });

  it("goes to a sink rather than nowhere", () => {
    const seen: CeilingAlert[] = [];
    const restore = vi.fn();
    setCeilingAlertSink((alert) => seen.push(alert));
    emitCeilingAlert({
      kind: "identity_spend_refused",
      windowSeconds: 86_400,
      ceilingUsd: 10,
      recordedSpendUsd: 9,
      reservedUsd: 1,
      refusedBy: "ceiling",
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].refusedBy).toBe("ceiling");
    expect(Date.parse(seen[0].at)).not.toBeNaN();
    setCeilingAlertSink(restore);
  });
});
