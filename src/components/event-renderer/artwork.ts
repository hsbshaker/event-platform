/**
 * The renderer's view of a generated artwork asset.
 *
 * Deliberately narrow. The provider layer's asset record carries bytes, provider and model
 * identifiers, cost, latency and a classified failure — none of which the renderer has any
 * business reading, and all of which would drag `src/lib/ai` into a component tree that currently
 * imports nothing from it. What paints a picture is a source, a size and whether it has alpha.
 *
 * Assets are **not** part of the `ResolvedDesignSpec`. The spec is compiled, geometry-verified and
 * frozen before any image exists, and an asset attaches to a slot afterwards — or never. So assets
 * arrive as render context, keyed by the canonical node id the compiler reserved the slot under,
 * exactly as content does. A page rendered with no assets at all is the ordinary case, not an
 * error state (`spec.md §7.6a #1`).
 */

export interface ArtworkAsset {
  /** Where the renderer fetches it. Never model-authored; the compiler never sees a URL. */
  readonly src: string;
  readonly width: number;
  readonly height: number;
  /**
   * Whether the asset really carries transparency, measured from the file rather than assumed
   * from the role it was requested for (`docs/product-doctrine.md §10`).
   */
  readonly hasAlpha: boolean;
  /** Alternative text, or the empty string when the artwork is decorative. */
  readonly alt: string;
}

export type ArtworkAssets = Readonly<Record<string, ArtworkAsset>>;

/** The empty map. What every page has until an asset is generated, and permanently if none is. */
export const NO_ARTWORK: ArtworkAssets = {};
