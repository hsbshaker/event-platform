/**
 * The image-provider port: one method, two payload shapes, and nothing about *which* provider.
 *
 * `docs/technology-decisions.md §8` keeps the creative-model boundary thin — *"SDK calls, model
 * names, request formatting, usage parsing, provider request IDs … belong behind these capability
 * functions"* — and this is the artwork capability's half of that. Everything above the port sees
 * a `VisualArtIntent` going in and an asset or a classified failure coming out.
 *
 * **No provider is selected.** `docs/technology-decisions.md` deliberately records none, and
 * `spec.md §7.6a` closes by saying so: the image model and the artwork schema are not chosen here.
 * `model` is therefore `string | null` on every shape in this file, `null` meaning exactly what it
 * says — there is no model, because none has been chosen. The only implementation in this
 * repository is the offline stub in `./stub/`.
 *
 * # Bytes or a URL, and the caller does not care
 *
 * Image models split on this: some return base64 image data, some return a signed URL that expires.
 * A port that admitted only one would pick the provider by accident. So `ArtworkPayload` is a
 * union and everything downstream — the spend ledger, the telemetry, the fallback contract — is
 * written against `ArtworkAsset`, which both shapes produce.
 *
 * The two are **not equivalent in what this boundary can verify**, and that asymmetry is real
 * rather than an oversight. Transparency is established by reading pixels (`./raster.ts`), so a
 * `bytes` payload can be verified and a `url` payload cannot — this boundary does not fetch, on
 * purpose, because a boundary that downloads whatever a provider names is a boundary that makes
 * an outbound request to an address the provider chose. A URL asset is therefore `unverified`,
 * and `./compliance.ts` refuses it for a role that requires alpha. Resolving that properly means
 * an asset-ingest step that downloads, inspects and persists — which belongs to the persistence
 * workstream, not here.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`.
 * Guardrails: `spec.md §32 #13`, `#32`; `CLAUDE.md §3` (thin provider interface, locked stack).
 */
import type { ArtworkRole, VisualArtIntent } from "./contract";
import type { ArtworkTransparency, RasterFormat } from "./raster";

/** What a provider is handed. The intent, a deadline, and nothing else. */
export interface ArtworkProviderRequest {
  /** Already validated against `visualArtIntentSchema` by the boundary. */
  readonly intent: VisualArtIntent;
  /**
   * The boundary's deadline, already running.
   *
   * A provider **must** pass it to its transport. The boundary also races the promise, so a
   * provider that ignores the signal still produces a `timeout` failure — but it leaves a request
   * running that nobody is waiting for, and one that is still being billed.
   */
  readonly signal: AbortSignal;
}

/**
 * What came back, before this boundary has looked at it.
 *
 * `mediaType` is the provider's own label and is **not** trusted: `inspectRaster` decides the
 * format from the magic bytes. It is carried for telemetry and for the eventual stored object.
 */
export type ArtworkPayload =
  | {
      readonly kind: "bytes";
      readonly mediaType: string;
      readonly bytes: Uint8Array;
    }
  | {
      readonly kind: "url";
      readonly mediaType: string;
      readonly url: string;
      /**
       * What the provider *claims* about the asset. Recorded, never believed: a claim is the
       * assumption `docs/product-doctrine.md §10` says transparency must not be.
       */
      readonly declaredAlpha?: boolean;
      readonly declaredWidth?: number;
      readonly declaredHeight?: number;
    };

export interface ArtworkProviderResponse {
  readonly payload: ArtworkPayload;
  /** Stable identifier for the provider implementation, for telemetry and provenance. */
  readonly providerId: string;
  /** The model that produced it, or `null` while none is chosen. */
  readonly model: string | null;
  readonly providerRequestId?: string;
  /**
   * What the provider says this request cost, in USD, when it reports one at all.
   *
   * Omitted means unknown, and unknown is never zero: `./spend.ts` settles an unknown cost at the
   * full reservation rather than releasing it.
   */
  readonly costUsd?: number;
}

/**
 * One capability, mirroring `generateEventIdentity` / `generateConceptPremiseSet` /
 * `generateDesignIntent` / `generateComposition` in shape: one input object, one awaited result.
 *
 * It **throws** to fail, and `classifyProviderError` turns the throw into a classified failure —
 * a provider that can name its own failure throws `ArtworkProviderError`. The port throws while
 * the boundary above it returns, because a provider adapter is written against an SDK that
 * throws, and asking every adapter to classify perfectly is how an unrecognised error becomes a
 * silently successful call.
 */
export interface ArtworkProvider {
  readonly id: string;
  readonly model: string | null;
  generateArtwork(request: ArtworkProviderRequest): Promise<ArtworkProviderResponse>;
}

/** An asset this boundary has inspected and accepted. */
export interface ArtworkAsset {
  readonly payload: ArtworkPayload;
  /** The role this asset was generated for. Carried so a slot cannot be filled by the wrong one. */
  readonly role: ArtworkRole;
  /** Established from the bytes, or `unverified` for a URL payload. Never a provider's claim. */
  readonly transparency: ArtworkTransparency;
  /** From the bytes. `null` for a URL payload, which this boundary does not fetch. */
  readonly format: RasterFormat | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly providerId: string;
  readonly model: string | null;
  readonly providerRequestId: string | null;
  /** The `VisualArtIntent` contract version this asset answers. */
  readonly intentVersion: string;
}
