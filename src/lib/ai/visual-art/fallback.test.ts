/**
 * No asset is the ordinary state, and every outcome maps to a renderable slot.
 *
 * The invariant under test is the one the renderer workstream consumes: there is no combination of
 * failure kind and absence reason that leaves a page unrenderable, because the page was verified
 * and frozen before any image existed (`spec.md §32 #24`, `§7.6a #1`).
 */
import { describe, expect, it } from "vitest";

import {
  ARTWORK_ABSENCE_REASONS,
  ARTWORK_SLOT_NOT_REQUESTED,
  artworkSlotFromOutcome,
  artworkSlotPending,
  isRenderable,
} from "./fallback";
import { ARTWORK_FAILURE_KINDS, artworkFailure, type ArtworkFailureKind } from "./failure";
import type { VisualArtOutcome } from "./generate";
import type { ArtworkTelemetry } from "./telemetry";

const telemetry = (kind: ArtworkFailureKind): ArtworkTelemetry => ({
  operation: "visual_art",
  latencyMs: 1,
  outcome: "no_asset",
  failureKind: kind,
  failureDetail: "for the test",
  violations: [],
  artworkRetries: 0,
  providerAttempts: 1,
  reservedCostUsd: 0.25,
  actualCostUsd: 0.25,
  costUnknown: true,
  provider: null,
  model: null,
  providerRequestId: null,
  intentVersion: "visual_art_intent_v1",
  role: "anchor",
  backgroundRequested: "opaque",
  transparency: null,
  format: null,
  width: null,
  height: null,
});

describe("the assetless state", () => {
  it("is the initial state, and says so without naming an error", () => {
    expect(ARTWORK_SLOT_NOT_REQUESTED).toEqual({
      status: "empty",
      reason: "not_requested",
      failureKind: null,
    });
    const pending = artworkSlotPending();
    expect(pending.status === "empty" && pending.reason).toBe("pending");
  });

  it("is renderable for every failure kind there is", () => {
    for (const kind of ARTWORK_FAILURE_KINDS) {
      const outcome: VisualArtOutcome = {
        ok: false,
        failure: artworkFailure(kind, "for the test"),
        telemetry: telemetry(kind),
      };
      const slot = artworkSlotFromOutcome(outcome);
      expect(slot.status).toBe("empty");
      expect(isRenderable(slot)).toBe(true);
    }
  });

  it("separates a refusal to spend from a request that spent and got nothing", () => {
    // Different facts about a run, and the Phase 4E review counts them apart.
    const refused = artworkSlotFromOutcome({
      ok: false,
      failure: artworkFailure("budget_refused", "ceiling"),
      telemetry: telemetry("budget_refused"),
    });
    const failed = artworkSlotFromOutcome({
      ok: false,
      failure: artworkFailure("timeout", "slow"),
      telemetry: telemetry("timeout"),
    });
    expect(refused.status === "empty" && refused.reason).toBe("refused");
    expect(failed.status === "empty" && failed.reason).toBe("failed");
  });

  it("keeps the absence vocabulary closed", () => {
    expect([...ARTWORK_ABSENCE_REASONS]).toEqual(["not_requested", "pending", "refused", "failed"]);
  });
});
