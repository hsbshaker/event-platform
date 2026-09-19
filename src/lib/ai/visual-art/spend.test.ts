/**
 * The spend gate. `docs/development-plan.md` principle 4, and the reason this boundary exists at
 * all: artwork is the first thing in the pipeline that spends per asset.
 */
import { describe, expect, it } from "vitest";

import { ArtworkBatchBudget, ArtworkReservation } from "./spend";

const policy = { id: "batch-1", batchCeilingUsd: 1, perRequestEstimateUsd: 0.25 };

describe("opening a budget", () => {
  it("requires both numbers, with no default and no environment read", () => {
    // Deliberately awkward. `src/lib/generation/identity-spend.ts` refuses to inherit a developer's
    // ceiling in production for the same reason: skipping the choice is not making it.
    expect(() => ArtworkBatchBudget.open({ ...policy, batchCeilingUsd: 0 })).toThrow(
      /positive number of USD/,
    );
    expect(() => ArtworkBatchBudget.open({ ...policy, perRequestEstimateUsd: Number.NaN })).toThrow(
      /positive number of USD/,
    );
    expect(() => ArtworkBatchBudget.open({ ...policy, id: "  " })).toThrow(/non-empty id/);
  });

  it("refuses a policy that could never grant a single request", () => {
    expect(() =>
      ArtworkBatchBudget.open({ id: "b", batchCeilingUsd: 0.1, perRequestEstimateUsd: 0.25 }),
    ).toThrow(/could never grant a single request/);
  });
});

describe("reserving", () => {
  it("grants up to the ceiling and then refuses, without making a request", () => {
    const budget = ArtworkBatchBudget.open(policy);
    for (let i = 0; i < 4; i += 1) expect(budget.reserve().ok).toBe(true);

    const refused = budget.reserve();
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");
    expect(refused.reason).toBe("ceiling_exceeded");
    expect(refused.detail).toContain("the request was not made");
    expect(budget.state().committedUsd).toBe(1);
  });

  it("debits the worst case up front rather than waiting for actuals", () => {
    // The whole design. Actuals arrive after the money is gone, so a ledger that waited for them
    // could only ever report an overrun it had already allowed.
    const budget = ArtworkBatchBudget.open(policy);
    const grant = budget.reserve();
    if (!grant.ok) throw new Error("expected a grant");
    expect(budget.state().committedUsd).toBe(0.25);
    expect(grant.reservation.estimateUsd).toBe(0.25);
  });

  it("stops granting once closed", () => {
    const budget = ArtworkBatchBudget.open(policy);
    budget.close();
    const refused = budget.reserve();
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");
    expect(refused.reason).toBe("budget_closed");
  });
});

describe("a reservation", () => {
  it("cannot be forged", () => {
    // A gate made of a type annotation is not a gate: without this, any caller could hand
    // `generateVisualArt` an object shaped like permission.
    expect(
      () => new ArtworkReservation(Symbol("not the mint"), "batch-1", "batch-1#1", 0.25),
    ).toThrow(/minted by ArtworkBatchBudget\.reserve\(\)/);
  });

  it("is consumed exactly once", () => {
    const budget = ArtworkBatchBudget.open(policy);
    const grant = budget.reserve();
    if (!grant.ok) throw new Error("expected a grant");
    expect(budget.consume(grant.reservation)).toBe(true);
    // A retry loop that re-used a reservation would be unbounded by construction.
    expect(budget.consume(grant.reservation)).toBe(false);
  });

  it("is refused by a budget that did not mint it", () => {
    const one = ArtworkBatchBudget.open(policy);
    const two = ArtworkBatchBudget.open({ ...policy, id: "batch-2" });
    const grant = one.reserve();
    if (!grant.ok) throw new Error("expected a grant");
    expect(two.consume(grant.reservation)).toBe(false);
  });
});

describe("settling", () => {
  it("releases the unspent part of the reservation", () => {
    const budget = ArtworkBatchBudget.open(policy);
    const grant = budget.reserve();
    if (!grant.ok) throw new Error("expected a grant");
    budget.settle(grant.reservation, 0.04);
    expect(budget.state().committedUsd).toBeCloseTo(0.04, 10);
    expect(budget.state().settledUsd).toBeCloseTo(0.04, 10);
    expect(budget.state().outstanding).toBe(0);
  });

  it("charges an unknown cost at the full reservation, never at zero", () => {
    // An attempt that timed out may still have reached provider execution and been billed.
    const budget = ArtworkBatchBudget.open(policy);
    const grant = budget.reserve();
    if (!grant.ok) throw new Error("expected a grant");
    budget.settle(grant.reservation, null);
    expect(budget.state().committedUsd).toBe(0.25);
  });

  it("records an overspend at its real value rather than clamping it", () => {
    const budget = ArtworkBatchBudget.open(policy);
    const grant = budget.reserve();
    if (!grant.ok) throw new Error("expected a grant");
    budget.settle(grant.reservation, 0.9);
    // Clamping would report a ceiling being respected while it was being passed, and the next
    // reserve() has to see the truth.
    expect(budget.state().committedUsd).toBeCloseTo(0.9, 10);
    expect(budget.canReserve()).toBe(false);
  });

  it("refuses to settle twice", () => {
    const budget = ArtworkBatchBudget.open(policy);
    const grant = budget.reserve();
    if (!grant.ok) throw new Error("expected a grant");
    budget.settle(grant.reservation, 0.1);
    expect(() => budget.settle(grant.reservation, 0.1)).toThrow(/not outstanding/);
  });
});
