/**
 * Deterministic stub artwork, for proving the Phase 4E path without spending a cent.
 *
 * These are not artwork and are not evidence about artwork. They are flat single-colour PNGs,
 * generated once and inlined as data URIs so a test can load one in a headless browser with no
 * network, no provider and no file on disk. Their only job is to be *an image*: something with
 * real pixel dimensions and, for one of them, real alpha, so the renderer and the geometry
 * verifier can be shown behaving identically with and without one.
 *
 * `docs/technology-decisions.md §8` records that no image model is selected and none has been
 * called. Nothing here changes that, and no screenshot of one of these is a claim about image
 * quality.
 *
 * The five are chosen to be awkward on purpose: a wide asset, a tall one, a transparent
 * square and two extremes — because the invariant under test is that *none* of them can move the
 * page: `.ev-art` fixes the frame and `object-fit: cover` crops the image into it, so an asset's
 * own aspect ratio is not a layout input.
 */
import type { ArtworkAsset } from "@/components/event-renderer/artwork";

const png = (b64: string) => `data:image/png;base64,${b64}`;

/** Landscape, opaque. The ordinary case for an `anchor` or `framed` role. */
export const OPAQUE_WIDE: ArtworkAsset = {
  src: png(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAQklEQVR42u3QMQEAAAQAMFlUUEH/SvRgxwossno+CwECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIOC+BYAjwLUE7DJDAAAAAElFTkSuQmCC",
  ),
  width: 64,
  height: 32,
  hasAlpha: false,
  alt: "",
};

/** Portrait, opaque. The same asset store, the wrong way round for most frames. */
export const OPAQUE_TALL: ArtworkAsset = {
  src: png(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAABACAYAAAB7jnWuAAAAQElEQVR42u3OMREAAAgEIPufcQxhK43xCwM7tdOXVAICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLpwAMPZDlpCiTEUAAAAABJRU5ErkJggg==",
  ),
  width: 32,
  height: 64,
  hasAlpha: false,
  alt: "",
};

/** Carries real alpha, for the `object` role's composited treatment. */
export const TRANSPARENT_SQUARE: ArtworkAsset = {
  src: png(
    "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAARElEQVR42u3PIQ0AAAgAMJKgiYgkOhWwbBcP8OjK+SwEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBK4WEBwupnQ4yU0AAAAASUVORK5CYII=",
  ),
  width: 48,
  height: 48,
  hasAlpha: true,
  alt: "",
};

/** One extreme of the scrim proof: the darkest thing a provider could return. */
export const NEAR_BLACK: ArtworkAsset = {
  src: png(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGElEQVR42mNgYGD4TyEeNWDUgFEDhocBAJvM/wFK6ATsAAAAAElFTkSuQmCC",
  ),
  width: 16,
  height: 16,
  hasAlpha: false,
  alt: "",
};

/** The other extreme. Text must stay legible over both. */
export const NEAR_WHITE: ArtworkAsset = {
  src: png(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVR42mP4TyFgGDVg1IBRA4aLAQBdePwurSGpXgAAAABJRU5ErkJggg==",
  ),
  width: 16,
  height: 16,
  hasAlpha: false,
  alt: "",
};

/** Every stub, so a test can sweep them all rather than pick a convenient one. */
export const ALL_STUB_ARTWORK: readonly ArtworkAsset[] = [
  OPAQUE_WIDE,
  OPAQUE_TALL,
  TRANSPARENT_SQUARE,
  NEAR_BLACK,
  NEAR_WHITE,
];
