/**
 * The two crossings a piece of artwork makes, and the one place they are written down.
 *
 * Three layers each have a type called `ArtworkAsset`, because each is genuinely a different
 * thing, and this module is the only file that sees more than one of them:
 *
 * | layer | what it is | what it knows |
 * | --- | --- | --- |
 * | `@/lib/ai/visual-art/provider` | what a provider returned and this boundary inspected | bytes or a url, measured transparency, provenance, cost |
 * | `./persist-artwork` | the durable record beside a frozen spec revision | a storage location and measured facts |
 * | `@/components/event-renderer/artwork` | what the page paints | a `src`, a size, alt text |
 *
 * Nothing else should import two of them. Each conversion below loses information on purpose —
 * the renderer has no business knowing which model drew a picture, and the database has no
 * business holding raw bytes — so a function that took a provider asset and returned something
 * renderable would be quietly skipping the step where the image is stored and can be served.
 *
 * # The one conversion that is a judgement rather than a mapping
 *
 * The provider boundary reports transparency as three values: verified present, verified absent,
 * and **unverified** — the last for a payload it did not fetch and therefore did not inspect.
 * `docs/product-doctrine.md §10` makes alpha reliability "an input to model *selection*, not
 * something a prompt adds afterwards", i.e. an empirical property. Unverified is not a
 * measurement, so it cannot become `hasAlpha: true`; it becomes `false`, and a role that needed
 * transparency fails rather than shipping a rectangle where a cut-out was designed.
 *
 * Acceptance criteria: `spec.md §31 — DesignIntent, composition and compiler`. Canon:
 * `spec.md §7.6a`, `docs/product-doctrine.md §10`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ArtworkAsset as GeneratedArtwork } from "@/lib/ai/visual-art/provider";
import type { ArtworkAsset as RenderableArtwork } from "@/components/event-renderer/artwork";
import type { ArtworkAssets } from "@/components/event-renderer/artwork";
import type { Database } from "@/lib/supabase/database.types";
import type { ArtworkAsset as StoredArtwork } from "./persist-artwork";

/** Where the bytes were put. Supplied by the caller that put them there. */
export interface ArtworkStorageLocation {
  readonly bucket: string;
  readonly path: string;
  readonly byteSize: number;
}

const CONTENT_TYPES = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const satisfies Record<string, StoredArtwork["contentType"]>;

/**
 * Provider asset plus a storage location becomes a durable record.
 *
 * Throws rather than guessing when the boundary could not measure the image, because every field
 * the database requires is a *measured* fact and there is no honest default for one that was never
 * taken. A URL payload reaches here only if some future ingest step downloaded and inspected it.
 */
export function persistableArtwork(
  generated: GeneratedArtwork,
  storage: ArtworkStorageLocation,
): StoredArtwork {
  if (generated.format === null || generated.width === null || generated.height === null) {
    throw new Error(
      "cannot persist an artwork asset this boundary never inspected: " +
        "its format and dimensions are unmeasured",
    );
  }
  return {
    storageBucket: storage.bucket,
    storagePath: storage.path,
    widthPx: generated.width,
    heightPx: generated.height,
    byteSize: storage.byteSize,
    contentType: CONTENT_TYPES[generated.format],
    // See the header. `unverified` is the absence of a measurement, never a soft yes.
    hasAlpha: generated.transparency === "verified_present",
  };
}

/** Turns a bucket and path into something a browser can fetch. Injected, never assumed here. */
export type ArtworkUrlResolver = (bucket: string, path: string) => string;

interface DeliveredSlotRow {
  readonly slot_id: string;
  readonly storage_bucket: string | null;
  readonly storage_path: string | null;
  readonly width_px: number | null;
  readonly height_px: number | null;
  readonly has_alpha: boolean | null;
}

/**
 * One delivered slot becomes something the page can paint, or `null`.
 *
 * `null` for anything not fully delivered, and that is the ordinary case rather than an error:
 * the spec was verified and frozen before any image existed, so a reserved slot with no asset is
 * a complete page (`@/components/event-renderer/artwork`).
 */
function renderable(row: DeliveredSlotRow, url: ArtworkUrlResolver): RenderableArtwork | null {
  if (
    row.storage_bucket === null ||
    row.storage_path === null ||
    row.width_px === null ||
    row.height_px === null
  ) {
    return null;
  }
  return {
    src: url(row.storage_bucket, row.storage_path),
    width: row.width_px,
    height: row.height_px,
    hasAlpha: row.has_alpha === true,
    // Decorative. The artwork restates the page's own theme and never carries information a
    // screen-reader user would otherwise miss, and the standing prohibitions keep text out of the
    // image, so there is nothing to transcribe (`docs/design-system.md`, WCAG 1.1.1).
    alt: "",
  };
}

/**
 * Every delivered asset for one frozen spec revision, keyed by the canonical node id its slot was
 * reserved under — which is the key `EventPage` looks them up by.
 *
 * A revision with no artwork, or with artwork still outstanding, returns `{}`. That is not a
 * degraded result: `spec.md §7.6a #1` makes imagery optional, and the page renders identically
 * either way.
 */
export async function renderableArtworkFor(
  admin: SupabaseClient<Database>,
  resolvedSpecId: string,
  url: ArtworkUrlResolver,
): Promise<ArtworkAssets> {
  const { data, error } = await admin
    .from("resolved_spec_artwork_slots")
    .select("slot_id, storage_bucket, storage_path, width_px, height_px, has_alpha")
    .eq("resolved_spec_id", resolvedSpecId)
    .eq("status", "delivered");

  if (error) throw new Error(`could not read artwork slots: ${error.message}`);

  const assets: Record<string, RenderableArtwork> = {};
  for (const row of (data ?? []) as DeliveredSlotRow[]) {
    const asset = renderable(row, url);
    if (asset) assets[row.slot_id] = asset;
  }
  return assets;
}
