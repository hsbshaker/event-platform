/**
 * The classification, and the retry policy read off it.
 *
 * The property worth pinning is the one that costs money when it slips: only failures that
 * produced **no answer** are retryable. See `./failure.ts` on why an answered failure is not paid
 * for twice.
 */
import { describe, expect, it } from "vitest";

import {
  ARTWORK_FAILURE_KINDS,
  ARTWORK_FAILURE_RETRYABLE,
  ArtworkProviderError,
  artworkFailure,
  classifyProviderError,
  isRetryable,
} from "./failure";

describe("the classification", () => {
  it("is closed and every kind has a retry answer", () => {
    expect(Object.keys(ARTWORK_FAILURE_RETRYABLE).sort()).toEqual(
      [...ARTWORK_FAILURE_KINDS].sort(),
    );
  });

  it("retries only the three kinds that produced no answer", () => {
    const retryable = ARTWORK_FAILURE_KINDS.filter(isRetryable);
    expect([...retryable].sort()).toEqual(["provider_error", "rate_limited", "timeout"]);
  });

  it("carries the retryable flag on the failure so nobody re-derives it", () => {
    expect(artworkFailure("timeout", "slow").retryable).toBe(true);
    expect(artworkFailure("content_refused", "declined").retryable).toBe(false);
  });

  it("attaches violations only where they mean something", () => {
    expect(artworkFailure("timeout", "slow").violations).toBeUndefined();
    expect(
      artworkFailure("intent_violation", "opaque", { violations: ["alpha_absent"] }).violations,
    ).toEqual(["alpha_absent"]);
  });
});

describe("classifying what a provider threw", () => {
  it("trusts a provider that classified itself", () => {
    const failure = classifyProviderError(
      new ArtworkProviderError("content_refused", "policy", 400),
    );
    expect(failure.kind).toBe("content_refused");
    expect(failure.providerStatus).toBe(400);
  });

  it("maps statuses the way the retry policy needs", () => {
    const at = (status: number) =>
      classifyProviderError(Object.assign(new Error("boom"), { status })).kind;
    expect(at(408)).toBe("timeout");
    expect(at(429)).toBe("rate_limited");
    expect(at(500)).toBe("provider_error");
    expect(at(503)).toBe("provider_error");
    // Every other 4xx is our request being refused: retrying it pays twice for the same answer.
    expect(at(400)).toBe("invalid_request");
    expect(at(422)).toBe("invalid_request");
  });

  it("treats an abort as a timeout and a statusless throw as transient", () => {
    expect(classifyProviderError({ name: "AbortError" }).kind).toBe("timeout");
    expect(classifyProviderError(new Error("ECONNRESET")).kind).toBe("provider_error");
  });
});
