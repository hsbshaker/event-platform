import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, IdentityCallClaimState } from "@/lib/supabase/database.types";
import {
  IDENTITY_EVIDENCE_RETENTION_DAYS,
  isTerminal,
  NON_TERMINAL_STATES,
  resolveAttemptOrdinal,
  type Claim,
} from "./identity-claim";

/**
 * The attempt-ordinal decision, which is where two incompatible rules nearly ended up living.
 *
 * *Observing* an in-flight claim must reuse its ordinal — cases A, B and C all need to derive the
 * key of a claim that already exists. *Creating* takes one past the highest terminal ordinal and
 * is refused while a non-terminal claim exists. Running them together produces a rule that cannot
 * observe anything.
 *
 * Acceptance criteria: N/A — test-only. `docs/phase-4b-plan.md §A.5`.
 */
const claim = (patch: Partial<Claim> & { state: IdentityCallClaimState }): Claim => ({
  id: `claim-${patch.attempt_ordinal ?? 0}-${patch.state}`,
  event_id: "e1",
  attempt_key: "k",
  basis_digest: "b",
  attempt_ordinal: 0,
  clarification_answer_ids: [],
  provider_config: {},
  claimed_by: "u1",
  claimed_at: "2026-09-16T00:00:00Z",
  lease_expires_at: "2026-09-16T00:15:00Z",
  provider_invoked_at: null,
  generation_run_id: null,
  settled_at: null,
  recovery_failure_reason: null,
  recovery_attempts: 0,
  ...patch,
});

/** A stub standing in for the one query `resolveAttemptOrdinal` makes. */
function admin(rows: Claim[]): SupabaseClient<Database> {
  const sorted = [...rows].sort((a, b) => b.attempt_ordinal - a.attempt_ordinal);
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve({ data: sorted, error: null }),
  };
  return { from: () => builder } as unknown as SupabaseClient<Database>;
}

describe("which states are terminal", () => {
  it("treats a captured response as unfinished business", () => {
    expect(NON_TERMINAL_STATES).toEqual(["claimed", "response_captured"]);
    expect(isTerminal("response_captured")).toBe(false);
    expect(isTerminal("abandoned")).toBe(true);
    expect(isTerminal("expired_unknown")).toBe(true);
    expect(isTerminal("failed_terminal")).toBe(true);
    expect(isTerminal("succeeded")).toBe(true);
  });
});

describe("resolving the attempt ordinal", () => {
  it("starts at 0 for a basis nothing has attempted", async () => {
    expect(await resolveAttemptOrdinal(admin([]), "e1", "b")).toEqual({
      mode: "create",
      ordinal: 0,
    });
  });

  it("observes an in-flight claim rather than refusing to derive its key", async () => {
    // Without this, cases A, B and C cannot look up the claim they are supposed to observe: you
    // cannot find a claim by a key you are forbidden to compute.
    const live = claim({ state: "claimed", attempt_ordinal: 2 });
    const resolved = await resolveAttemptOrdinal(admin([live]), "e1", "b");
    expect(resolved).toMatchObject({ mode: "observe", ordinal: 2 });
  });

  it("observes a captured claim too, because it is not finished", async () => {
    const captured = claim({ state: "response_captured", attempt_ordinal: 1 });
    expect(await resolveAttemptOrdinal(admin([captured]), "e1", "b")).toMatchObject({
      mode: "observe",
      ordinal: 1,
    });
  });

  it("answers an identical repeated request from what already succeeded", async () => {
    // A replayed POST after completion must be free. Paying again for a request whose bytes are
    // byte-identical to one that already produced a revision is the definition of double spend.
    const done = claim({ state: "succeeded", attempt_ordinal: 0 });
    expect(await resolveAttemptOrdinal(admin([done]), "e1", "b")).toMatchObject({
      mode: "already_succeeded",
    });
  });

  it("retries an abandoned attempt automatically, because it is provably unpaid", async () => {
    const gone = claim({ state: "abandoned", attempt_ordinal: 0 });
    expect(await resolveAttemptOrdinal(admin([gone]), "e1", "b")).toEqual({
      mode: "create",
      ordinal: 1,
    });
  });

  it.each(["failed_terminal", "expired_unknown"] as const)(
    "makes the host decide after %s",
    async (state) => {
      // Both may have cost money — `expired_unknown` especially, which is the whole reason it is
      // a separate state from `abandoned`. Retrying either without the host asking is a silent
      // second purchase.
      const last = claim({ state, attempt_ordinal: 0 });
      expect(await resolveAttemptOrdinal(admin([last]), "e1", "b")).toMatchObject({
        mode: "needs_explicit_retry",
        ordinal: 1,
        lastState: state,
      });
    },
  );

  it("creates the next ordinal once the host has explicitly retried", async () => {
    const last = claim({ state: "failed_terminal", attempt_ordinal: 3 });
    expect(await resolveAttemptOrdinal(admin([last]), "e1", "b", { explicitRetry: true })).toEqual({
      mode: "create",
      ordinal: 4,
    });
  });

  it("gives two clicks on Retry one ordinal, not two", async () => {
    // Both clicks see the same terminal history, so both derive the same ordinal, so both build
    // the same attempt key — and the unique index lets exactly one through. A per-click counter
    // or a client-supplied token would give them different keys and two paid calls.
    const history = [claim({ state: "failed_terminal", attempt_ordinal: 0 })];
    const first = await resolveAttemptOrdinal(admin(history), "e1", "b", { explicitRetry: true });
    const second = await resolveAttemptOrdinal(admin(history), "e1", "b", { explicitRetry: true });
    expect(first).toEqual(second);
  });

  it("counts from the highest terminal ordinal, not from how many claims there were", async () => {
    const history = [
      claim({ state: "abandoned", attempt_ordinal: 0 }),
      claim({ state: "failed_terminal", attempt_ordinal: 1 }),
      claim({ state: "abandoned", attempt_ordinal: 2 }),
    ];
    expect(await resolveAttemptOrdinal(admin(history), "e1", "b")).toEqual({
      mode: "create",
      ordinal: 3,
    });
  });
});

describe("evidence retention", () => {
  it("is a named constant rather than a literal buried in a query", () => {
    expect(IDENTITY_EVIDENCE_RETENTION_DAYS).toBe(30);
  });
});
