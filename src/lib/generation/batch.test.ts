/**
 * The pure half of the batch lifecycle: the two deterministic keys and the configurable caps.
 *
 * `docs/phase-4b-plan.md §H.2`. The properties here are the ones that cost money when they are
 * wrong — a key that collides where it should not lets one call answer for a different one, and a
 * key that differs where it should not buys three concepts twice. The transactional half (the
 * in-flight index, cap rollback, resumption, and the persisted half of §C) needs a real database
 * and lives in `tests/db/phase4c-t16.test.ts`.
 *
 * Acceptance criteria: N/A — internal spend-control mechanism, exercised for product behaviour in
 * the db suite. `spec.md §10`, `§27`, `§32 #41`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PLANNER_VERSION } from "@/lib/ai/versions";

import { IDENTITY_REFUSAL_PAYLOAD } from "./identity-spend";
import {
  BATCH_REFUSAL_PAYLOAD,
  IN_FLIGHT_BATCH_STATES,
  SIBLING_OPERATION,
  batchIdempotencyKey,
  batchLimits,
  isBatchInFlight,
  siblingIdempotencyKey,
} from "./batch";

const BASIS = {
  eventId: "11111111-1111-1111-1111-111111111111",
  identityRevisionId: "22222222-2222-2222-2222-222222222222",
  plannerVersion: PLANNER_VERSION,
  round: 1,
} as const;

const SIBLING = {
  batchId: "33333333-3333-3333-3333-333333333333",
  operation: SIBLING_OPERATION,
  conceptIndex: 0,
  attempt: 0,
} as const;

describe("the batch idempotency key", () => {
  it("is stable for the same request", () => {
    expect(batchIdempotencyKey(BASIS)).toBe(batchIdempotencyKey({ ...BASIS }));
    expect(batchIdempotencyKey(BASIS)).toHaveLength(64);
  });

  it("changes when any part of the basis changes", () => {
    const base = batchIdempotencyKey(BASIS);
    expect(batchIdempotencyKey({ ...BASIS, eventId: BASIS.identityRevisionId })).not.toBe(base);
    // A clarification answer produces a new revision, and a new revision is a new batch (§C).
    expect(batchIdempotencyKey({ ...BASIS, identityRevisionId: BASIS.eventId })).not.toBe(base);
    // A planner bump plans a different batch from the same revision (§D). `planner_v1` is the
    // superseded version rather than an invented one, so this is the real shape of that change.
    expect(batchIdempotencyKey({ ...BASIS, plannerVersion: "planner_v1" })).not.toBe(base);
    expect(PLANNER_VERSION).not.toBe("planner_v1");
    // `Try another direction` is a genuinely new round, and a legitimately new batch.
    expect(batchIdempotencyKey({ ...BASIS, round: 2 })).not.toBe(base);
  });

  it("cannot be confused by a field that ends where the next begins", () => {
    // Length-prefixed, so a value that swallows the delimiter cannot impersonate a boundary. A
    // collision here would mean two different requests share a key, and one of them is never
    // planned.
    const a = batchIdempotencyKey({ ...BASIS, eventId: "ab", identityRevisionId: "c" });
    const b = batchIdempotencyKey({ ...BASIS, eventId: "a", identityRevisionId: "bc" });
    expect(a).not.toBe(b);
  });

  it("refuses a round that is not a positive integer", () => {
    expect(() => batchIdempotencyKey({ ...BASIS, round: 0 })).toThrow(/positive integer/);
    expect(() => batchIdempotencyKey({ ...BASIS, round: 1.5 })).toThrow(/positive integer/);
  });
});

describe("the sibling idempotency key", () => {
  it("is `(batch_id, operation, concept_index, attempt)` and nothing else", () => {
    const base = siblingIdempotencyKey(SIBLING);
    expect(base).toHaveLength(64);
    expect(siblingIdempotencyKey({ ...SIBLING })).toBe(base);
    expect(siblingIdempotencyKey({ ...SIBLING, batchId: BASIS.eventId })).not.toBe(base);
    expect(siblingIdempotencyKey({ ...SIBLING, operation: "composition" })).not.toBe(base);
    expect(siblingIdempotencyKey({ ...SIBLING, conceptIndex: 1 })).not.toBe(base);
    expect(siblingIdempotencyKey({ ...SIBLING, attempt: 1 })).not.toBe(base);
  });

  it("gives the three siblings of one batch three different keys", () => {
    const keys = [0, 1, 2].map((conceptIndex) =>
      siblingIdempotencyKey({ ...SIBLING, conceptIndex }),
    );
    expect(new Set(keys).size).toBe(3);
  });

  it("is a different key from the batch's own, on the same inputs", () => {
    // §H.2: the sibling key "needs `batch_id` and therefore cannot serve the identity call". The
    // two derivations must not be able to produce the same digest for related inputs.
    expect(siblingIdempotencyKey(SIBLING)).not.toBe(batchIdempotencyKey(BASIS));
  });

  it("refuses a negative or fractional ordinal", () => {
    expect(() => siblingIdempotencyKey({ ...SIBLING, attempt: -1 })).toThrow(/non-negative/);
    expect(() => siblingIdempotencyKey({ ...SIBLING, conceptIndex: 0.5 })).toThrow(/non-negative/);
  });
});

describe("the in-flight pair", () => {
  it("is exactly the two states the uniqueness index is written over", () => {
    // If this list and the migration's index predicate ever disagree, a second batch becomes
    // creatable while one is still running. The database-side half of the same assertion is in
    // tests/db/phase4c-t16.test.ts, which checks the SQL function against the index for every
    // enum value.
    expect([...IN_FLIGHT_BATCH_STATES]).toEqual(["planned", "running"]);
    expect(isBatchInFlight("planned")).toBe(true);
    expect(isBatchInFlight("running")).toBe(true);
    expect(isBatchInFlight("completed")).toBe(false);
    expect(isBatchInFlight("failed")).toBe(false);
  });
});

describe("the refusal payload", () => {
  it("is the identical frozen object the identity refusals use", () => {
    // `spec.md §32 #41`: a caller who could tell a batch refusal from an identity refusal has
    // learned the state of both. Same object, not merely the same words.
    expect(BATCH_REFUSAL_PAYLOAD).toBe(IDENTITY_REFUSAL_PAYLOAD);
    expect(Object.isFrozen(BATCH_REFUSAL_PAYLOAD)).toBe(true);
    expect(JSON.stringify(BATCH_REFUSAL_PAYLOAD)).not.toMatch(/\d/);
  });
});

describe("the configurable batch caps", () => {
  const ENV = [
    "BATCH_EVENT_DAILY_MAX",
    "BATCH_ACCOUNT_DAILY_MAX",
    "BATCH_ACCOUNT_RATE_MAX",
    "IDENTITY_CEILING_USD",
  ];

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key-that-is-long-enough";
    process.env.OPENAI_MODEL = "gpt-5.6-sol";
    for (const name of ENV) delete process.env[name];
  });

  afterEach(() => {
    for (const name of ENV) delete process.env[name];
  });

  it("uses the declared buckets, so nothing reaches another subsystem's counters", () => {
    const limits = batchLimits();
    expect(limits.eventCap.bucket).toBe("batch:event:day");
    expect(limits.accountCap.bucket).toBe("batch:account:day");
    expect(limits.accountRate.bucket).toBe("batch:account:rate");
  });

  it("is configurable, as spec.md §10 requires of a backend safety limit", () => {
    process.env.BATCH_EVENT_DAILY_MAX = "3";
    process.env.BATCH_ACCOUNT_DAILY_MAX = "5";
    process.env.BATCH_ACCOUNT_RATE_MAX = "2";
    const limits = batchLimits();
    expect(limits.eventCap.max).toBe(3);
    expect(limits.accountCap.max).toBe(5);
    expect(limits.accountRate.max).toBe(2);
  });

  it("refuses a malformed cap rather than falling back to the default", () => {
    process.env.BATCH_EVENT_DAILY_MAX = "0";
    expect(() => batchLimits()).toThrow(/positive integer/);
    process.env.BATCH_EVENT_DAILY_MAX = "many";
    expect(() => batchLimits()).toThrow(/positive integer/);
  });

  it("reads the project ceiling rather than declaring a second one", () => {
    // `spec.md §10` lists one "global/project spend ceiling". T9A configured it; this reads the
    // same number back, so there is no batch ceiling to set independently and get wrong.
    process.env.IDENTITY_CEILING_USD = "42";
    const limits = batchLimits();
    expect(limits.ceiling.usd).toBe(42);
    // A null-costed run is charged at a maximum, never at zero (§A.5.1 rule 3).
    expect(limits.ceiling.runMaxUsd).toBeGreaterThan(0);
  });

  it("reserves nothing per batch today, and says so rather than inventing a price", () => {
    // DesignIntent has no verified cost profile until T18/T22. A fabricated reservation would read
    // as safety; zero plus a named debt does not.
    expect(batchLimits().reservationUsd).toBe(0);
  });
});
