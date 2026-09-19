import { describe, expect, it, vi } from "vitest";

import { artworkObjectPath, ARTWORK_BUCKET, supabaseArtworkStore } from "./artwork-store";

const KEY = { resolvedSpecId: "spec-abc", slotId: "sections[0].root.decoration" };

function client(error: { message: string } | null = null) {
  const upload = vi.fn().mockResolvedValue({ data: { path: "x" }, error });
  return { client: { storage: { from: vi.fn(() => ({ upload })) } } as never, upload };
}

describe("an artwork's path is a pure function of the slot it fills", () => {
  it("folds a canonical node id into something safe in a URL and a shell", () => {
    expect(artworkObjectPath(KEY)).toBe("spec-abc/sections-0-root-decoration.png");
  });

  it("is deterministic, so a retry overwrites rather than accumulating", () => {
    expect(artworkObjectPath(KEY)).toBe(artworkObjectPath(KEY));
  });

  it("keeps two slots of one revision apart, and two revisions apart", () => {
    const other = artworkObjectPath({ ...KEY, slotId: "sections[1].root" });
    expect(other).not.toBe(artworkObjectPath(KEY));
    expect(artworkObjectPath({ ...KEY, resolvedSpecId: "spec-def" })).not.toBe(
      artworkObjectPath(KEY),
    );
  });

  it("never produces an empty or leading-separator name from an awkward id", () => {
    const path = artworkObjectPath({ resolvedSpecId: "r", slotId: "...[]..." });
    expect(path).toBe("r/slot.png");
  });

  it("takes its extension from the stored type", () => {
    expect(artworkObjectPath(KEY, "webp")).toMatch(/\.webp$/);
  });
});

describe("the Supabase adapter maps one request, and nothing more", () => {
  it("uploads to the canonical bucket at the slot's path, with the right content type", async () => {
    const { client: c, upload } = client();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const ref = await supabaseArtworkStore(c).put({ key: KEY, bytes, contentType: "image/png" });

    expect(upload).toHaveBeenCalledTimes(1);
    const [path, body, options] = upload.mock.calls[0];
    expect(path).toBe("spec-abc/sections-0-root-decoration.png");
    expect(body).toBe(bytes);
    expect(options).toEqual({ contentType: "image/png", upsert: true });
    expect(ref).toEqual({
      bucket: ARTWORK_BUCKET,
      path: "spec-abc/sections-0-root-decoration.png",
      byteSize: 4,
    });
  });

  it("upserts, because the same slot arriving twice is the same asset", async () => {
    // A path that is a pure function of the key means a retry is a rewrite. Failing it would turn
    // an idempotent lifecycle into one that breaks on its second attempt.
    const { client: c, upload } = client();
    await supabaseArtworkStore(c).put({
      key: KEY,
      bytes: new Uint8Array([1]),
      contentType: "image/png",
    });
    expect(upload.mock.calls[0][2].upsert).toBe(true);
  });

  it("names the bucket and path in its id and in its failures, so a run is never ambiguous", async () => {
    expect(supabaseArtworkStore(client().client).id).toBe(`supabase-storage:${ARTWORK_BUCKET}`);
    const { client: c } = client({ message: "bucket not found" });
    await expect(
      supabaseArtworkStore(c).put({
        key: KEY,
        bytes: new Uint8Array([1]),
        contentType: "image/png",
      }),
    ).rejects.toThrow(/event-artwork\/spec-abc.*bucket not found/);
  });

  it("honours a caller-supplied bucket", async () => {
    const { client: c } = client();
    const store = supabaseArtworkStore(c, "other-bucket");
    expect(store.id).toBe("supabase-storage:other-bucket");
    expect(
      (await store.put({ key: KEY, bytes: new Uint8Array([1]), contentType: "image/png" })).bucket,
    ).toBe("other-bucket");
  });
});
