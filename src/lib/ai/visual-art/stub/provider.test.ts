/**
 * The stub provider: deterministic, offline, and unmistakably not a real one.
 */
import { describe, expect, it } from "vitest";

import { artworkIntent } from "../__fixtures__/intent";
import { inspectRaster } from "../raster";
import { STUB_ARTWORK_PROVIDER, STUB_ARTWORK_PROVIDER_ID, stubAssetForIntent } from "./provider";

const signal = () => new AbortController().signal;

describe("the stub provider", () => {
  it("names itself as a stub, and reports no model", () => {
    // No image model is selected (`spec.md §7.6a`), so `null` is the honest value — and a
    // telemetry row or a persisted asset can never mistake this for a live provider.
    expect(STUB_ARTWORK_PROVIDER_ID).toBe("stub-offline-not-a-real-provider");
    expect(STUB_ARTWORK_PROVIDER.id).toContain("stub");
    expect(STUB_ARTWORK_PROVIDER.model).toBeNull();
  });

  it("returns the same bytes for the same intent, every time", async () => {
    const intent = artworkIntent();
    const first = await STUB_ARTWORK_PROVIDER.generateArtwork({ intent, signal: signal() });
    const second = await STUB_ARTWORK_PROVIDER.generateArtwork({ intent, signal: signal() });
    if (first.payload.kind !== "bytes" || second.payload.kind !== "bytes") {
      throw new Error("the stub returns bytes");
    }
    expect(Buffer.from(first.payload.bytes).equals(Buffer.from(second.payload.bytes))).toBe(true);
    expect(first.providerRequestId).toBe(second.providerRequestId);
  });

  it("answers a transparency-required brief with a verifiably transparent asset", async () => {
    const intent = artworkIntent({ role: "object", background: "transparent" });
    const response = await STUB_ARTWORK_PROVIDER.generateArtwork({ intent, signal: signal() });
    if (response.payload.kind !== "bytes") throw new Error("the stub returns bytes");
    const inspection = inspectRaster(response.payload.bytes);
    if (!inspection.ok) throw new Error(inspection.detail);
    expect(inspection.inspection.alphaUsed).toBe(true);
  });

  it("answers `either` with the opaque asset", () => {
    // "Either" means the direction expressed no requirement; returning the transparent asset would
    // make every such brief look like a transparency success in the Phase 4E evidence.
    expect(stubAssetForIntent(artworkIntent({ background: "either" })).alpha).toBe(false);
    expect(stubAssetForIntent(artworkIntent({ background: "opaque" })).alpha).toBe(false);
  });

  it("picks an aspect shape from the role alone", () => {
    expect(stubAssetForIntent(artworkIntent({ role: "anchor" })).shape).toBe("wide");
    expect(stubAssetForIntent(artworkIntent({ role: "atmosphere" })).shape).toBe("wide");
    expect(stubAssetForIntent(artworkIntent({ role: "object" })).shape).toBe("square");
    expect(stubAssetForIntent(artworkIntent({ role: "framed" })).shape).toBe("square");
  });

  it("honours an already-aborted deadline", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      STUB_ARTWORK_PROVIDER.generateArtwork({
        intent: artworkIntent(),
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });

  it("reports a cost of zero rather than omitting one", async () => {
    // An omitted cost settles at the full reservation (`../spend.ts`), which would make an
    // offline run look like a paid one in the ledger.
    const response = await STUB_ARTWORK_PROVIDER.generateArtwork({
      intent: artworkIntent(),
      signal: signal(),
    });
    expect(response.costUsd).toBe(0);
  });
});
