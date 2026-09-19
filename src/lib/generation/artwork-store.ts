import "server-only";

/**
 * Where generated artwork bytes live, behind one port.
 *
 * The generation orchestrator must not care whether an asset ends up in Supabase Storage, on a
 * local disk for a diagnostic run, or somewhere a later deployment chooses. It hands over bytes and
 * a key and receives a stable reference it can persist; everything else is the adapter's.
 *
 * That separation is not tidiness. `docs/technology-decisions.md` fixes Supabase Storage as the
 * MVP's store, and the adapter below implements it — but a smoke that cannot reach a hosted bucket
 * must still be able to prove the *lifecycle* (reserve → brief → generate → validate → store →
 * attach → render) rather than stopping at the one step that needs a network. A port makes the
 * difference between those two runs a single injected object, and makes it impossible to claim a
 * Supabase upload happened when a different adapter served.
 *
 * # The key is the lineage
 *
 * An asset is addressed by the revision that reserved its slot and the slot within it — the same
 * pair `resolved_spec_artwork_slots` is keyed by. Nothing else identifies an artwork: a concept can
 * have two, a re-fit produces a new revision with new boxes, and an asset measured against one
 * revision's geometry must never be reachable from another's.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/** The canonical bucket. One per environment, created out of band like every other bucket. */
export const ARTWORK_BUCKET = "event-artwork";

export interface ArtworkAssetKey {
  readonly resolvedSpecId: string;
  /** The compiler's canonical node id for the slot, e.g. `sections[0].root.decoration`. */
  readonly slotId: string;
}

export interface StoredArtworkRef {
  readonly bucket: string;
  readonly path: string;
  readonly byteSize: number;
}

export interface PutArtworkInput {
  readonly key: ArtworkAssetKey;
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface ArtworkAssetStore {
  /** Recorded with the run, so evidence can never be ambiguous about which store served. */
  readonly id: string;
  put(input: PutArtworkInput): Promise<StoredArtworkRef>;
}

/**
 * A storage path from a slot key.
 *
 * Deterministic, so a retry of the same slot overwrites rather than accumulating, and readable, so
 * a human looking in a bucket can tell what they are looking at. Canonical node ids carry `[`, `]`
 * and `.`, which are legal in a Supabase object name but awkward in a URL and in a shell, so they
 * are folded to `-`; the mapping is lossy in principle and unambiguous in practice because a path
 * is only ever *written* from a key, never parsed back into one.
 */
export function artworkObjectPath(key: ArtworkAssetKey, extension = "png"): string {
  const slot = key.slotId.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${key.resolvedSpecId}/${slot || "slot"}.${extension}`;
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/avif": "avif",
};

/**
 * The production store: Supabase Storage, which `docs/technology-decisions.md` already fixes.
 *
 * `upsert` is on deliberately. The path is a pure function of the slot key, so a second write for
 * the same slot is the same asset arriving again — a retry, or a replay — and failing it would turn
 * an idempotent lifecycle into one that breaks on its second attempt. The database is what decides
 * whether a *different* asset may replace a delivered one, and it refuses.
 */
export function supabaseArtworkStore(
  client: SupabaseClient<Database>,
  bucket: string = ARTWORK_BUCKET,
): ArtworkAssetStore {
  return {
    id: `supabase-storage:${bucket}`,
    async put({ key, bytes, contentType }: PutArtworkInput): Promise<StoredArtworkRef> {
      const path = artworkObjectPath(key, EXTENSIONS[contentType] ?? "bin");
      const { error } = await client.storage.from(bucket).upload(path, bytes, {
        contentType,
        upsert: true,
      });
      if (error) {
        throw new Error(`could not store artwork at ${bucket}/${path}: ${error.message}`);
      }
      return { bucket, path, byteSize: bytes.byteLength };
    },
  };
}
