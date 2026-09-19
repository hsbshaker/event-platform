/**
 * The committed stub assets are exactly what `stubArtworkPng()` produces, byte for byte.
 *
 * Two things at once. It keeps the provenance note in `./assets.ts` **true** — these files came
 * from that generator, here, and from nothing else — and it pins the generator's determinism,
 * which is the property a checked-in binary fixture lives or dies by.
 *
 * Regenerate with:
 *
 * ```
 * UPDATE_ARTWORK_STUBS=1 npx vitest run --project unit src/lib/ai/visual-art/stub/asset-drift.test.ts
 * ```
 *
 * The same shape as `schemas:*` in `package.json`: the artifact is committed, the test is the
 * gate, and the environment variable is the deliberate way to move it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { STUB_ASSETS, stubAssetPath } from "./assets";
import { stubArtworkPng } from "./render";

const UPDATE = process.env.UPDATE_ARTWORK_STUBS === "1";

describe("the stub assets", () => {
  for (const asset of STUB_ASSETS) {
    it(`${asset.file} is byte-identical to its generator output`, () => {
      const generated = Buffer.from(stubArtworkPng(asset));
      const file = stubAssetPath(asset);
      if (UPDATE) {
        writeFileSync(file, generated);
        return;
      }
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file).equals(generated)).toBe(true);
    });
  }

  it("are small enough to live in the repository without apology", () => {
    if (UPDATE) return;
    for (const asset of STUB_ASSETS) {
      expect(readFileSync(stubAssetPath(asset)).length).toBeLessThan(32 * 1024);
    }
  });

  it("covers two aspect shapes, with and without alpha", () => {
    // The four cases the boundary has to exercise. Losing one would silently stop testing a path.
    expect(
      STUB_ASSETS.map((asset) => `${asset.shape}:${asset.alpha ? "alpha" : "opaque"}`).sort(),
    ).toEqual(["square:alpha", "square:opaque", "wide:alpha", "wide:opaque"]);
    expect(new Set(STUB_ASSETS.map((asset) => `${asset.width}x${asset.height}`)).size).toBe(2);
  });
});
