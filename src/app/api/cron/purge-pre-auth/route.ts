import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { INSPIRATION_BUCKET } from "@/lib/drafts/inspiration";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Expires abandoned pre-auth state (spec.md §7.2 "temporary pre-auth assets remain private,
 * expire automatically if abandoned"; §27 "short raw-file retention"; §31 "abandoned pre-auth
 * draft/assets expire and remain private").
 *
 * Two phases with one shared cutoff, as the Phase 1 functions require: list the storage keys
 * of assets on expired unclaimed drafts and delete those objects first, then purge the rows
 * (assets cascade with their draft) and stale rate-limit counters. Crashing between the two
 * leaves rows pointing at missing objects, which the next run clears; it never leaves objects
 * without rows.
 *
 * Scheduling is a deployment concern: `vercel.json` runs it daily. It is also safe to call by
 * hand. Requires CRON_SECRET, so it is not a public endpoint.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const presented = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const cutoff = new Date().toISOString();
  const admin = createAdminClient();

  const { data: keys, error: keysError } = await admin.rpc("expired_pre_auth_storage_keys", {
    p_cutoff: cutoff,
  });
  if (keysError) throw keysError;

  const storageKeys = (keys ?? []) as unknown as string[];
  let objectsRemoved = 0;
  if (storageKeys.length > 0) {
    const { error } = await admin.storage.from(INSPIRATION_BUCKET).remove(storageKeys);
    if (error) throw error;
    objectsRemoved = storageKeys.length;
  }

  const { data: purged, error: purgeError } = await admin.rpc("purge_expired_pre_auth_state", {
    p_cutoff: cutoff,
  });
  if (purgeError) throw purgeError;

  return NextResponse.json({ ok: true, cutoff, objectsRemoved, draftsPurged: purged ?? 0 });
}
