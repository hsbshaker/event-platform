import { describe, expect, it } from "vitest";

import { persistableArtwork, renderableArtworkFor } from "./artwork-assets";
import type { ArtworkAsset as GeneratedArtwork } from "@/lib/ai/visual-art/provider";

const STORAGE = { bucket: "event-artwork", path: "spec-1/slot-a.png", byteSize: 4096 };

function generated(overrides: Partial<GeneratedArtwork> = {}): GeneratedArtwork {
  return {
    payload: { kind: "bytes", mediaType: "image/png", bytes: new Uint8Array([1, 2, 3]) },
    role: "object",
    transparency: "verified_present",
    format: "png",
    width: 1024,
    height: 1024,
    providerId: "stub",
    model: null,
    providerRequestId: null,
    intentVersion: "visual_art_intent_v3",
    ...overrides,
  } as GeneratedArtwork;
}

describe("unverified transparency is not a soft yes", () => {
  it("records alpha only when the bytes were actually inspected", () => {
    expect(
      persistableArtwork(generated({ transparency: "verified_present" }), STORAGE).hasAlpha,
    ).toBe(true);
    expect(
      persistableArtwork(generated({ transparency: "verified_absent" }), STORAGE).hasAlpha,
    ).toBe(false);
  });

  it("treats unverified as absent, so a cut-out role fails rather than shipping a rectangle", () => {
    // `docs/product-doctrine.md §10` makes alpha an empirical property. "Not measured" is not
    // evidence of transparency, and the one direction that is safe to be wrong in is `false`.
    expect(persistableArtwork(generated({ transparency: "unverified" }), STORAGE).hasAlpha).toBe(
      false,
    );
  });
});

describe("only measured facts are persisted", () => {
  it("carries the measured dimensions, format and the caller's storage location", () => {
    const stored = persistableArtwork(generated(), STORAGE);
    expect(stored).toEqual({
      storageBucket: "event-artwork",
      storagePath: "spec-1/slot-a.png",
      widthPx: 1024,
      heightPx: 1024,
      byteSize: 4096,
      contentType: "image/png",
      hasAlpha: true,
    });
  });

  it("refuses an asset the boundary never inspected rather than inventing its size", () => {
    for (const missing of [{ format: null }, { width: null }, { height: null }] as const) {
      expect(() => persistableArtwork(generated(missing), STORAGE)).toThrow(/unmeasured/);
    }
  });

  it("maps each inspected format to its served content type", () => {
    expect(persistableArtwork(generated({ format: "jpeg" }), STORAGE).contentType).toBe(
      "image/jpeg",
    );
    expect(persistableArtwork(generated({ format: "webp" }), STORAGE).contentType).toBe(
      "image/webp",
    );
  });
});

/** A `from(...).select(...).eq(...).eq(...)` chain, resolving to the rows a test supplies. */
function admin(rows: unknown[], error: { message: string } | null = null) {
  const result = Promise.resolve({ data: rows, error });
  const chain = {
    select: () => chain,
    eq: () => chain,
    then: result.then.bind(result),
    catch: result.catch.bind(result),
    finally: result.finally.bind(result),
  };
  return { from: () => chain } as never;
}

const url = (bucket: string, path: string) => `https://cdn.test/${bucket}/${path}`;

describe("the renderer is handed only what it can paint", () => {
  it("keys assets by the canonical node id the slot was reserved under", async () => {
    const assets = await renderableArtworkFor(
      admin([
        {
          slot_id: "sections[0].root.decoration",
          storage_bucket: "event-artwork",
          storage_path: "a.png",
          width_px: 800,
          height_px: 600,
          has_alpha: false,
        },
      ]),
      "spec-1",
      url,
    );
    expect(Object.keys(assets)).toEqual(["sections[0].root.decoration"]);
    expect(assets["sections[0].root.decoration"]).toEqual({
      src: "https://cdn.test/event-artwork/a.png",
      width: 800,
      height: 600,
      hasAlpha: false,
      alt: "",
    });
  });

  it("returns an empty map for a revision with no artwork, which is a complete page", async () => {
    expect(await renderableArtworkFor(admin([]), "spec-1", url)).toEqual({});
  });

  it("skips a row whose storage facts are incomplete rather than painting a broken image", async () => {
    const assets = await renderableArtworkFor(
      admin([
        {
          slot_id: "a",
          storage_bucket: "event-artwork",
          storage_path: null,
          width_px: 800,
          height_px: 600,
          has_alpha: null,
        },
      ]),
      "spec-1",
      url,
    );
    expect(assets).toEqual({});
  });

  it("gives artwork empty alt text, because it restates the page rather than adding to it", async () => {
    const assets = await renderableArtworkFor(
      admin([
        {
          slot_id: "a",
          storage_bucket: "b",
          storage_path: "p.png",
          width_px: 1,
          height_px: 1,
          has_alpha: true,
        },
      ]),
      "spec-1",
      url,
    );
    expect(assets.a.alt).toBe("");
  });

  it("fails loudly when the slots cannot be read at all", async () => {
    await expect(
      renderableArtworkFor(admin([], { message: "connection lost" }), "spec-1", url),
    ).rejects.toThrow(/connection lost/);
  });
});
