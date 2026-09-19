import "server-only";

/**
 * `STUB_ARTWORK_PROVIDER` — the offline provider, and the only `ArtworkProvider` this repository
 * has.
 *
 * It is named to be unmistakable. Its `id` is `stub-offline-not-a-real-provider`, its `model` is
 * `null`, and its output is four checked-in test cards (`./assets.ts`) that no page should ever
 * display. Nothing about it can be mistaken for a live provider in a log line, a telemetry row or
 * a persisted asset record.
 *
 * # It cannot be pointed at a network
 *
 * There is no base URL, no API key, no client, no configuration object and no constructor
 * argument. It reads four files from a fixed path inside this directory and returns their bytes.
 * That is the shape the task asked for and it is the shape that makes the disabled-by-default
 * guarantee checkable rather than promised: there is nothing here to configure, so there is no
 * configuration that could turn it into a live call. `../boundary.test.ts` proves the same
 * property from the outside, both by scanning the source and by running this provider with a
 * throwing `fetch` installed.
 *
 * # What it is for
 *
 * `spec.md §7.6a`'s path is *proved* with this in Phase 4E: an artwork slot can be briefed,
 * reserved, requested, inspected, accepted or classified, and rendered — end to end, deterministic,
 * offline, free. What it cannot prove is anything about image quality, alpha reliability or
 * latency; those are properties of a model, and `docs/product-doctrine.md §10` says they are
 * measured, not assumed. This provider deliberately does not simulate them.
 *
 * # Determinism
 *
 * Same intent, same asset, always. The choice is a pure function of two fields — the role picks
 * the aspect shape, the background treatment picks whether to return the asset with a real alpha
 * channel — so a test that asserts an outcome does not have to know how the picker works, and a
 * brief that demands transparency gets an asset that actually has some.
 *
 * `background: "either"` resolves to the **opaque** asset on purpose. "Either" means the direction
 * expressed no requirement, and returning the transparent one would make every such brief look
 * like a transparency success in the Phase 4E evidence.
 */
import type { VisualArtIntent } from "../contract";
import type { ArtworkProvider, ArtworkProviderRequest, ArtworkProviderResponse } from "../provider";

import { findStubAsset, readStubAsset, type StubAsset } from "./assets";

export const STUB_ARTWORK_PROVIDER_ID = "stub-offline-not-a-real-provider";

/** Role → aspect shape. A crop-safe band for page-width roles, a block for object roles. */
export function stubShapeForIntent(intent: VisualArtIntent): StubAsset["shape"] {
  return intent.role === "anchor" || intent.role === "atmosphere" ? "wide" : "square";
}

export function stubAssetForIntent(intent: VisualArtIntent): StubAsset {
  return findStubAsset(stubShapeForIntent(intent), intent.background === "transparent");
}

export const STUB_ARTWORK_PROVIDER: ArtworkProvider = {
  id: STUB_ARTWORK_PROVIDER_ID,
  model: null,
  async generateArtwork(request: ArtworkProviderRequest): Promise<ArtworkProviderResponse> {
    // Honour the deadline the way a real provider must, even though nothing here can be slow: a
    // stub that ignored the signal would be a stub that does not exercise the contract.
    request.signal.throwIfAborted();
    const asset = stubAssetForIntent(request.intent);
    return {
      payload: {
        kind: "bytes",
        mediaType: "image/png",
        bytes: readStubAsset(asset),
      },
      providerId: STUB_ARTWORK_PROVIDER_ID,
      model: null,
      providerRequestId: `stub:${asset.file}`,
      // Free, and reported as such rather than omitted: an omitted cost settles at the full
      // reservation (`../spend.ts`), which would make an offline run look like a paid one.
      costUsd: 0,
    };
  },
};
