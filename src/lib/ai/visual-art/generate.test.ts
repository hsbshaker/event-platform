/**
 * The boundary call: the gate, the bound, the classification, the accounting, the telemetry.
 *
 * Every provider here is a local fake or the offline stub. Nothing in this file opens a socket,
 * and `./boundary.test.ts` proves that is a property of the module rather than of this file's
 * good behaviour.
 */
import { describe, expect, it, vi } from "vitest";

import { artworkIntent } from "./__fixtures__/intent";
import {
  ARTWORK_MAX_RETRIES,
  MAX_ARTWORK_ATTEMPTS_PER_CALL,
  budgetRefusalFailure,
  generateVisualArt,
} from "./generate";
import { ArtworkProviderError } from "./failure";
import type { ArtworkProvider, ArtworkProviderResponse } from "./provider";
import { ArtworkBatchBudget } from "./spend";
import { STUB_ARTWORK_PROVIDER } from "./stub/provider";

const POLICY = { id: "batch-1", batchCeilingUsd: 1, perRequestEstimateUsd: 0.25 };

function budgetAndReservation() {
  const budget = ArtworkBatchBudget.open(POLICY);
  const grant = budget.reserve();
  if (!grant.ok) throw new Error("expected a grant");
  return { budget, reservation: grant.reservation };
}

function fakeProvider(
  behaviour: (attempt: number) => Promise<ArtworkProviderResponse>,
): ArtworkProvider & { attempts: number } {
  const provider = {
    id: "fake",
    model: "fake-image-1",
    attempts: 0,
    async generateArtwork(): Promise<ArtworkProviderResponse> {
      provider.attempts += 1;
      return behaviour(provider.attempts);
    },
  };
  return provider;
}

const noSleep = async () => {};

describe("the happy path", () => {
  it("returns an inspected asset and settles the reservation at the real cost", async () => {
    const { budget, reservation } = budgetAndReservation();
    const outcome = await generateVisualArt({
      intent: artworkIntent(),
      budget,
      reservation,
      provider: STUB_ARTWORK_PROVIDER,
      sleep: noSleep,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.asset.role).toBe("anchor");
    expect(outcome.asset.format).toBe("png");
    expect(outcome.asset.width).toBe(64);
    expect(outcome.asset.intentVersion).toBe("visual_art_intent_v3");
    expect(outcome.telemetry.outcome).toBe("asset");
    expect(outcome.telemetry.failureKind).toBeNull();
    expect(outcome.telemetry.artworkRetries).toBe(0);
    expect(outcome.telemetry.providerAttempts).toBe(1);
    expect(outcome.telemetry.reservedCostUsd).toBe(0.25);
    expect(outcome.telemetry.actualCostUsd).toBe(0);
    expect(outcome.telemetry.model).toBeNull();
    expect(budget.state().committedUsd).toBe(0);
  });

  it("satisfies a transparency-required brief with a verifiably transparent asset", async () => {
    const { budget, reservation } = budgetAndReservation();
    const outcome = await generateVisualArt({
      intent: artworkIntent({ role: "object", background: "transparent" }),
      budget,
      reservation,
      provider: STUB_ARTWORK_PROVIDER,
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.asset.transparency).toBe("verified_present");
  });
});

describe("before any money is spent", () => {
  it("refuses an invalid intent without reaching the provider", async () => {
    const { budget, reservation } = budgetAndReservation();
    const provider = fakeProvider(async () => {
      throw new Error("must not be called");
    });
    const outcome = await generateVisualArt({
      // `subject` below the contract's minimum: the schema decides, not this boundary.
      intent: { ...artworkIntent(), subject: "x" },
      budget,
      reservation,
      provider,
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.failure.kind).toBe("invalid_request");
    expect(provider.attempts).toBe(0);
    expect(outcome.telemetry.reservedCostUsd).toBe(0);
  });

  it("refuses a brief that lost the standing prohibitions", async () => {
    // `contract.ts` says they are seeded so a caller that forgets cannot produce a request
    // without them; the schema only requires the list to be non-empty, so this is the enforcement.
    const { budget, reservation } = budgetAndReservation();
    const provider = fakeProvider(async () => {
      throw new Error("must not be called");
    });
    const outcome = await generateVisualArt({
      intent: artworkIntent({ prohibited: ["no balloons"] }),
      budget,
      reservation,
      provider,
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.failure.kind).toBe("invalid_request");
    expect(outcome.failure.detail).toContain("standing prohibition");
    expect(provider.attempts).toBe(0);
  });

  it("refuses a replayed reservation", async () => {
    const { budget, reservation } = budgetAndReservation();
    const provider = fakeProvider(async () => ({
      payload: { kind: "url", mediaType: "image/png", url: "about:blank" },
      providerId: "fake",
      model: "fake-image-1",
      costUsd: 0.02,
    }));
    const first = await generateVisualArt({
      intent: artworkIntent(),
      budget,
      reservation,
      provider,
      sleep: noSleep,
    });
    expect(first.ok).toBe(true);

    const replayed = await generateVisualArt({
      intent: artworkIntent(),
      budget,
      reservation,
      provider,
      sleep: noSleep,
    });
    expect(replayed.ok).toBe(false);
    if (replayed.ok) throw new Error("unreachable");
    expect(replayed.failure.kind).toBe("invalid_request");
    // One request, not two: a retry loop on a re-used reservation would be unbounded.
    expect(provider.attempts).toBe(1);
  });

  it("refuses a reservation minted by another budget", async () => {
    const { reservation } = budgetAndReservation();
    const other = ArtworkBatchBudget.open({ ...POLICY, id: "batch-2" });
    const provider = fakeProvider(async () => {
      throw new Error("must not be called");
    });
    const outcome = await generateVisualArt({
      intent: artworkIntent(),
      budget: other,
      reservation,
      provider,
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(false);
    expect(provider.attempts).toBe(0);
  });

  it("turns a ceiling refusal into an ordinary classified absence", async () => {
    const budget = ArtworkBatchBudget.open({ ...POLICY, batchCeilingUsd: 0.25 });
    expect(budget.reserve().ok).toBe(true);
    const refused = budget.reserve();
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");
    const failure = budgetRefusalFailure(refused);
    expect(failure.kind).toBe("budget_refused");
    expect(failure.retryable).toBe(false);
  });
});

describe("the retry bound", () => {
  it("retries a no-answer failure exactly once and then stops", async () => {
    const { budget, reservation } = budgetAndReservation();
    const provider = fakeProvider(async () => {
      throw new ArtworkProviderError("rate_limited", "429 slow down", 429);
    });
    const outcome = await generateVisualArt({
      intent: artworkIntent(),
      budget,
      reservation,
      provider,
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.failure.kind).toBe("rate_limited");
    expect(provider.attempts).toBe(MAX_ARTWORK_ATTEMPTS_PER_CALL);
    expect(outcome.telemetry.artworkRetries).toBe(ARTWORK_MAX_RETRIES);
    // An attempt that threw reported no cost, so the reservation stands in full rather than at zero.
    expect(outcome.telemetry.costUnknown).toBe(true);
    expect(budget.state().settledUsd).toBe(0.25);
  });

  it("succeeds on the retry when the first attempt was transient", async () => {
    const { budget, reservation } = budgetAndReservation();
    const provider = fakeProvider(async (attempt) => {
      if (attempt === 1) throw new ArtworkProviderError("provider_error", "502", 502);
      return STUB_ARTWORK_PROVIDER.generateArtwork({
        intent: artworkIntent(),
        signal: new AbortController().signal,
      });
    });
    const outcome = await generateVisualArt({
      intent: artworkIntent(),
      budget,
      reservation,
      provider,
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.telemetry.artworkRetries).toBe(1);
    expect(outcome.telemetry.providerAttempts).toBe(2);
  });

  it("never retries a failure the provider actually answered", async () => {
    // Three kinds, one assertion each. Paying twice for the same brief is the re-roll loop, and
    // an opaque asset for a transparent role is evidence about the model (doctrine §10).
    const cases: { name: string; make: () => ArtworkProvider & { attempts: number } }[] = [
      {
        name: "content_refused",
        make: () =>
          fakeProvider(async () => {
            throw new ArtworkProviderError("content_refused", "declined", 400);
          }),
      },
      {
        name: "malformed_output",
        make: () =>
          fakeProvider(async () => ({
            payload: { kind: "bytes", mediaType: "image/png", bytes: new Uint8Array([1, 2, 3]) },
            providerId: "fake",
            model: "fake-image-1",
            costUsd: 0.02,
          })),
      },
    ];

    for (const testCase of cases) {
      const { budget, reservation } = budgetAndReservation();
      const provider = testCase.make();
      const outcome = await generateVisualArt({
        intent: artworkIntent(),
        budget,
        reservation,
        provider,
        sleep: noSleep,
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error("unreachable");
      expect(`${testCase.name}:${outcome.failure.kind}`).toBe(`${testCase.name}:${testCase.name}`);
      expect(`${testCase.name}:${provider.attempts}`).toBe(`${testCase.name}:1`);
      expect(outcome.failure.retryable).toBe(false);
    }
  });

  it("classifies an unrecognised 4xx as our request, not as a transient fault", async () => {
    const { budget, reservation } = budgetAndReservation();
    const provider = fakeProvider(async () => {
      throw Object.assign(new Error("bad request"), { status: 422 });
    });
    const outcome = await generateVisualArt({
      intent: artworkIntent(),
      budget,
      reservation,
      provider,
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.failure.kind).toBe("invalid_request");
    expect(provider.attempts).toBe(1);
  });

  it("times out a provider that never returns, and classifies it as a timeout", async () => {
    const { budget, reservation } = budgetAndReservation();
    const provider: ArtworkProvider = {
      id: "hanging",
      model: null,
      generateArtwork: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    };
    const outcome = await generateVisualArt({
      intent: artworkIntent(),
      budget,
      reservation,
      provider,
      sleep: noSleep,
      timeoutMs: 5,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.failure.kind).toBe("timeout");
    expect(outcome.failure.retryable).toBe(true);
  });
});

describe("a hard requirement of the brief", () => {
  it("fails an opaque asset against a transparency-required role", async () => {
    const { budget, reservation } = budgetAndReservation();
    const intent = artworkIntent({ role: "object", background: "transparent" });
    const provider = fakeProvider(async () =>
      STUB_ARTWORK_PROVIDER.generateArtwork({
        // The stub returns an opaque asset for an `opaque` brief; handing that back against a
        // transparent brief is exactly the provider defect this check exists for.
        intent: artworkIntent({ role: "object", background: "opaque" }),
        signal: new AbortController().signal,
      }),
    );
    const outcome = await generateVisualArt({
      intent,
      budget,
      reservation,
      provider,
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.failure.kind).toBe("intent_violation");
    expect(outcome.failure.violations).toEqual(["alpha_absent"]);
    expect(outcome.failure.retryable).toBe(false);
    expect(outcome.telemetry.transparency).toBe("verified_absent");
  });

  it("fails an unverifiable asset against a transparency-required role", async () => {
    // A URL payload is never fetched by this boundary, so its transparency is unestablished — and
    // unestablished is not a pass.
    const { budget, reservation } = budgetAndReservation();
    const provider = fakeProvider(async () => ({
      payload: {
        kind: "url" as const,
        mediaType: "image/png",
        url: "about:blank",
        declaredAlpha: true,
      },
      providerId: "fake",
      model: "fake-image-1",
    }));
    const outcome = await generateVisualArt({
      intent: artworkIntent({ role: "object", background: "transparent" }),
      budget,
      reservation,
      provider,
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.failure.violations).toEqual(["alpha_unverified"]);
  });

  it("accepts a URL asset for a role that does not require transparency", async () => {
    const { budget, reservation } = budgetAndReservation();
    const provider = fakeProvider(async () => ({
      payload: { kind: "url" as const, mediaType: "image/png", url: "about:blank" },
      providerId: "fake",
      model: "fake-image-1",
    }));
    const outcome = await generateVisualArt({
      intent: artworkIntent({ background: "either" }),
      budget,
      reservation,
      provider,
      sleep: noSleep,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.asset.transparency).toBe("unverified");
    // No cost reported, so the reservation stands: unknown is never zero.
    expect(outcome.telemetry.costUnknown).toBe(true);
    expect(outcome.telemetry.actualCostUsd).toBe(0.25);
  });
});

describe("telemetry", () => {
  it("counts artwork retries in their own field and never as re-prompts", async () => {
    // `docs/model-contracts.md §6.3`'s three re-prompts are the Composition stage's. A row that
    // merged an artwork retry into them would report a canon violation that never happened.
    const { budget, reservation } = budgetAndReservation();
    const outcome = await generateVisualArt({
      intent: artworkIntent(),
      budget,
      reservation,
      provider: STUB_ARTWORK_PROVIDER,
      sleep: noSleep,
    });
    expect(Object.keys(outcome.telemetry)).not.toContain("reprompts");
    expect(Object.keys(outcome.telemetry)).toContain("artworkRetries");
    expect(outcome.telemetry.operation).toBe("visual_art");
    expect(outcome.telemetry.intentVersion).toBe("visual_art_intent_v3");
  });

  it("records latency from an injected clock", async () => {
    const { budget, reservation } = budgetAndReservation();
    const clock = vi.fn<() => number>();
    clock.mockReturnValueOnce(1_000).mockReturnValue(1_450);
    const outcome = await generateVisualArt({
      intent: artworkIntent(),
      budget,
      reservation,
      provider: STUB_ARTWORK_PROVIDER,
      now: clock,
      sleep: noSleep,
    });
    expect(outcome.telemetry.latencyMs).toBe(450);
  });
});

describe("a provider that ignores its deadline", () => {
  it("still times out, rather than holding the reservation open forever", async () => {
    // The signal is how a well-behaved provider stops being billed; the race is what protects the
    // two concepts beside this one from a provider that never honours it.
    const budget = ArtworkBatchBudget.open(POLICY);
    const grant = budget.reserve();
    if (!grant.ok) throw new Error("expected a grant");
    const provider: ArtworkProvider = {
      id: "deaf",
      model: null,
      generateArtwork: () => new Promise(() => {}),
    };
    const outcome = await generateVisualArt({
      intent: artworkIntent(),
      budget,
      reservation: grant.reservation,
      provider,
      sleep: noSleep,
      timeoutMs: 5,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.failure.kind).toBe("timeout");
    expect(outcome.telemetry.providerAttempts).toBe(MAX_ARTWORK_ATTEMPTS_PER_CALL);
    // Unknown cost settles at the full reservation; the budget is not left holding an open one.
    expect(budget.state().outstanding).toBe(0);
    expect(budget.state().settledUsd).toBe(0.25);
  });
});
