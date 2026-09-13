import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDraft, type DraftInspiration } from "./store";

/**
 * Private inspiration uploads for the pre-auth composer (spec.md §7.2, §27).
 *
 * Inspiration is optional additive context for the model. It is stored in a private bucket,
 * read back only through short-lived signed URLs, re-parented to the event when the draft is
 * claimed, and removed with the draft when one is abandoned. It never becomes public event
 * imagery (§32 #32), and nothing here fetches a remote URL: uploads only, no link ingestion
 * and no scraping (§32 #34).
 */
export const INSPIRATION_BUCKET = "inspiration";

/**
 * Limits. spec.md §27 requires "strict limits and short raw-file retention" without fixing
 * numbers; these are the Phase 2 choices, applied on the server and mirrored in the UI.
 */
export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_DRAFT = 6;
/** Read-back URLs live just long enough to render the composer thumbnails. */
export const SIGNED_URL_TTL_SECONDS = 300;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Confirms the bytes really are the image type they claim to be, so a mislabelled payload is
 * never stored. Checks the container signature only; it does not decode the image.
 */
export function sniffImageType(bytes: Uint8Array): AllowedMimeType | null {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x52, 0x49, 0x46, 0x46) && startsWith(0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)) {
    return "image/webp";
  }
  // ISO base media file format: "ftyp" at offset 4, then a HEIF/HEIC brand.
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (["heic", "heix", "hevc", "heim", "heis", "hevm"].includes(brand)) return "image/heic";
    if (["mif1", "msf1"].includes(brand)) return "image/heif";
  }
  return null;
}

export class InspirationRejected extends Error {
  readonly status = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = "InspirationRejected";
  }
}

function extensionFor(mime: AllowedMimeType): string {
  return mime === "image/jpeg" ? "jpg" : mime === "image/heif" ? "heif" : mime.split("/")[1];
}

/** Validates and stores one file against the browser's current draft. */
export async function addInspirationToDraft(file: {
  name: string;
  type: string;
  bytes: Uint8Array;
}): Promise<DraftInspiration> {
  const draft = await getDraft();
  if (!draft) throw new InspirationRejected("Start by describing your event.");
  if (draft.inspiration.length >= MAX_FILES_PER_DRAFT) {
    throw new InspirationRejected(`You can add up to ${MAX_FILES_PER_DRAFT} images.`);
  }
  if (file.bytes.byteLength === 0) throw new InspirationRejected("That file is empty.");
  if (file.bytes.byteLength > MAX_FILE_BYTES) {
    throw new InspirationRejected(
      `Images must be ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))} MB or smaller.`,
    );
  }
  if (!isAllowedMimeType(file.type)) {
    throw new InspirationRejected("Add a PNG, JPEG, WebP or HEIC image.");
  }
  const sniffed = sniffImageType(file.bytes);
  if (!sniffed) throw new InspirationRejected("That file does not look like an image.");

  const admin = createAdminClient();
  const storageKey = `drafts/${draft.id}/${randomUUID()}.${extensionFor(sniffed)}`;
  const { error: uploadError } = await admin.storage
    .from(INSPIRATION_BUCKET)
    .upload(storageKey, file.bytes, { contentType: sniffed, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await admin
    .from("inspiration_assets")
    .insert({
      pre_auth_draft_id: draft.id,
      storage_key: storageKey,
      mime_type: sniffed,
      size_bytes: file.bytes.byteLength,
      expires_at: draft.expiresAt,
    })
    .select("id, storage_key, mime_type, size_bytes, created_at")
    .single();
  if (error) {
    await admin.storage.from(INSPIRATION_BUCKET).remove([storageKey]);
    throw error;
  }

  return {
    id: data.id,
    storageKey: data.storage_key,
    mimeType: data.mime_type,
    sizeBytes: data.size_bytes,
    createdAt: data.created_at,
  };
}

/** Removes one of this draft's images. Scoped to the cookie's draft, so it cannot reach another. */
export async function removeInspirationFromDraft(assetId: string): Promise<boolean> {
  const draft = await getDraft();
  if (!draft) return false;
  const asset = draft.inspiration.find((a) => a.id === assetId);
  if (!asset) return false;

  const admin = createAdminClient();
  const { error } = await admin
    .from("inspiration_assets")
    .delete()
    .eq("id", assetId)
    .eq("pre_auth_draft_id", draft.id);
  if (error) throw error;
  await admin.storage.from(INSPIRATION_BUCKET).remove([asset.storageKey]);
  return true;
}

export interface InspirationPreview extends DraftInspiration {
  /** Short-lived signed URL; the bucket itself is private, so this is the only way to read it. */
  url: string | null;
}

/** Signs the given assets for display. Never returns a raw public object URL (§27). */
export async function signInspiration(
  assets: DraftInspiration[],
): Promise<InspirationPreview[]> {
  if (assets.length === 0) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(INSPIRATION_BUCKET)
    .createSignedUrls(
      assets.map((a) => a.storageKey),
      SIGNED_URL_TTL_SECONDS,
    );
  if (error) return assets.map((a) => ({ ...a, url: null }));
  const byKey = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return assets.map((a) => ({ ...a, url: byKey.get(a.storageKey) ?? null }));
}
