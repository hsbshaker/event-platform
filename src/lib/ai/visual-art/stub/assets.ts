import "server-only";

/**
 * The four checked-in stub assets, and where they came from.
 *
 * **Provenance, stated because it matters:** every one of these files was produced by
 * `stubArtworkPng()` in `./render.ts` from the spec in this table, on this repository, by
 * `./asset-drift.test.ts` run with `UPDATE_ARTWORK_STUBS=1`. No image model was called, no image
 * was downloaded, and nothing here came from a provider, a stock library or a host. They are flat
 * machine-drawn test cards. **They are not artwork**, they are not a preview of what
 * `spec.md §7.6a` approves, and no page should ever show one.
 *
 * Four, because the boundary has four cases to exercise: two aspect shapes (so a `composition`
 * describing a wide band and one describing a square block both have something to return), each
 * with and without a real alpha channel (so a brief that requires transparency can be both
 * satisfied and — with the opaque asset — legitimately failed).
 *
 * `./asset-drift.test.ts` regenerates each file and asserts it is byte-identical to what is
 * committed, which is what keeps this comment true rather than merely well-intentioned.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { StubImageSpec } from "./render";

export interface StubAsset extends StubImageSpec {
  /** File name under `./assets/`. */
  readonly file: string;
  /** Wide band or square block. Chosen from the role, never from a measurement. */
  readonly shape: "wide" | "square";
}

export const STUB_ASSETS: readonly StubAsset[] = [
  { file: "wide-alpha.png", shape: "wide", width: 64, height: 24, alpha: true },
  { file: "wide-opaque.png", shape: "wide", width: 64, height: 24, alpha: false },
  { file: "square-alpha.png", shape: "square", width: 32, height: 32, alpha: true },
  { file: "square-opaque.png", shape: "square", width: 32, height: 32, alpha: false },
];

export const STUB_ASSET_DIR = path.join(new URL(".", import.meta.url).pathname, "assets");

export function stubAssetPath(asset: StubAsset): string {
  return path.join(STUB_ASSET_DIR, asset.file);
}

/**
 * Read one stub asset off the local disk.
 *
 * A fixed path under this directory, with no configuration input and no way to point it anywhere
 * else — the "cannot be pointed at a network" half of what makes this stub safe.
 */
export function readStubAsset(asset: StubAsset): Uint8Array {
  return new Uint8Array(readFileSync(stubAssetPath(asset)));
}

export function findStubAsset(shape: StubAsset["shape"], alpha: boolean): StubAsset {
  const found = STUB_ASSETS.find((asset) => asset.shape === shape && asset.alpha === alpha);
  if (!found) throw new Error(`no stub asset for shape ${shape} with alpha ${String(alpha)}`);
  return found;
}
