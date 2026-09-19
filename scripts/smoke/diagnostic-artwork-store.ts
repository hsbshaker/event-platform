/**
 * A local, evidence-backed artwork store — for a diagnostic run, and clearly labelled as one.
 *
 * It implements the production `ArtworkAssetStore` port exactly and nothing more, so the
 * orchestration above it is the same code either way: the difference between a run that uploaded
 * to Supabase Storage and one that wrote to a directory is a single injected object, and the `id`
 * below travels into the evidence so no report can be vague about which served.
 *
 * **Why it exists.** `docs/technology-decisions.md` fixes Supabase Storage as the MVP's store, and
 * `src/lib/generation/artwork-store.ts` implements it. But hosted Storage must not be mutated for a
 * smoke, and no local Supabase Storage is available in this environment. Stopping the whole
 * creative run at its one networked step would prove nothing about the lifecycle it was
 * commissioned to prove, so the port is served locally and the report says plainly that **no
 * Supabase upload was exercised**.
 *
 * It writes at the same object path the Supabase adapter would use, so the stored reference in the
 * database is the one production would have recorded, differing only in its bucket.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  artworkObjectPath,
  type ArtworkAssetStore,
  type PutArtworkInput,
  type StoredArtworkRef,
} from "@/lib/generation/artwork-store";

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

/**
 * @param root A directory this run owns. Every asset lands under it at its canonical object path.
 */
export function diagnosticArtworkStore(root: string): ArtworkAssetStore {
  return {
    // Deliberately not shaped like `supabase-storage:…`. A reader skimming telemetry should not
    // have to look twice to see that this run did not touch a bucket.
    id: `diagnostic-local-directory:${root}`,
    async put({ key, bytes, contentType }: PutArtworkInput): Promise<StoredArtworkRef> {
      const objectPath = artworkObjectPath(key, EXTENSIONS[contentType] ?? "bin");
      const file = path.join(root, objectPath);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, bytes);
      return { bucket: "diagnostic-local", path: objectPath, byteSize: bytes.byteLength };
    },
  };
}
